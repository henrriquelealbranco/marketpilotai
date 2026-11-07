import { randomBytes, createHash } from 'node:crypto';
import type { Database } from '@marketpilot/database';
import type { Identity } from '@marketpilot/contracts';
import {
  MercadoLivreAdapter,
  encryptSecret,
  decryptSecret,
  type JsonObject,
} from '../integrations/index.js';
import { HttpError } from '../auth.js';
import { requiredConfiguration } from './agents.js';
import { event, audit, json, alert } from './store.js';
import { canonicalHash } from './domain.js';

export const mlAdapter = () =>
  new MercadoLivreAdapter({
    clientId: process.env.MERCADOLIVRE_CLIENT_ID,
    clientSecret: process.env.MERCADOLIVRE_CLIENT_SECRET,
    redirectUri:
      process.env.MERCADOLIVRE_REDIRECT_URI ||
      `${process.env.APP_ORIGIN ?? 'http://localhost:3000'}/api/v1/integrations/mercadolivre/callback`,
  });
export function encryptionKey() {
  if (!process.env.ENCRYPTION_KEY)
    requiredConfiguration(
      'Configure a chave de criptografia no servidor antes de conectar contas.',
    );
  return process.env.ENCRYPTION_KEY;
}
export async function authorizeMercadoLivre(db: Database, identity: Identity) {
  if (!process.env.MERCADOLIVRE_CLIENT_ID || !process.env.MERCADOLIVRE_CLIENT_SECRET)
    requiredConfiguration('Credenciais OAuth do Mercado Livre ainda não configuradas.');
  const key = encryptionKey(),
    state = randomBytes(32).toString('base64url'),
    verifier = randomBytes(48).toString('base64url'),
    challenge = createHash('sha256').update(verifier).digest('base64url');
  await db.oAuthState.deleteMany({
    where: { workspaceId: identity.workspace.id, expiresAt: { lt: new Date() } },
  });
  await db.oAuthState.create({
    data: {
      workspaceId: identity.workspace.id,
      userId: identity.user.id,
      stateHash: canonicalHash(state),
      verifierEncrypted: encryptSecret(verifier, key),
      expiresAt: new Date(Date.now() + 10 * 60000),
    },
  });
  return { url: mlAdapter().authorizationUrl(state, challenge) };
}
export async function finishMercadoLivre(
  db: Database,
  identity: Identity,
  state: string,
  code: string,
) {
  const saved = await db.oAuthState.findUnique({ where: { stateHash: canonicalHash(state) } });
  if (
    !saved ||
    saved.workspaceId !== identity.workspace.id ||
    saved.userId !== identity.user.id ||
    saved.expiresAt < new Date() ||
    saved.consumedAt
  )
    throw new HttpError(400, 'A autorização expirou ou já foi utilizada. Inicie novamente.');
  const claim = await db.oAuthState.updateMany({
    where: { id: saved.id, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (claim.count !== 1) throw new HttpError(409, 'Autorização já processada.');
  const key = encryptionKey(),
    tokens = await mlAdapter().exchangeCode(code, decryptSecret(saved.verifierEncrypted, key)),
    user = await mlAdapter().getUser(tokens.accessToken);
  if (Number(user.id) !== tokens.userId)
    throw new HttpError(400, 'A conta retornada não corresponde à autorização.');
  await db.integrationConnection.upsert({
    where: {
      workspaceId_provider: { workspaceId: identity.workspace.id, provider: 'mercadolivre' },
    },
    create: {
      workspaceId: identity.workspace.id,
      provider: 'mercadolivre',
      status: 'CONNECTED',
      encryptedAccessToken: encryptSecret(tokens.accessToken, key),
      encryptedRefreshToken: encryptSecret(tokens.refreshToken, key),
      expiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      metadataJson: json({ userId: tokens.userId, nickname: user.nickname ?? null }),
    },
    update: {
      status: 'CONNECTED',
      encryptedAccessToken: encryptSecret(tokens.accessToken, key),
      encryptedRefreshToken: encryptSecret(tokens.refreshToken, key),
      expiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      metadataJson: json({ userId: tokens.userId, nickname: user.nickname ?? null }),
    },
  });
  await audit(db, identity, 'integration.mercadolivre.connected');
  await event(
    db,
    identity.workspace.id,
    'Mercado Livre',
    'integration',
    'Conta conectada por OAuth oficial.',
  );
  return { connected: true };
}
export async function mercadoLivreToken(db: Database, workspaceId: string) {
  const connection = await db.integrationConnection.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: 'mercadolivre' } },
  });
  if (!connection || connection.status !== 'CONNECTED' || !connection.encryptedAccessToken)
    requiredConfiguration('Conecte uma conta Mercado Livre autorizada antes desta operação.');
  const key = encryptionKey();
  let accessToken = decryptSecret(connection.encryptedAccessToken, key);
  if (connection.expiresAt && connection.expiresAt.getTime() < Date.now() + 60000) {
    if (!connection.encryptedRefreshToken)
      requiredConfiguration('Reconecte a conta Mercado Livre.');
    const tokens = await mlAdapter().refreshToken(
      decryptSecret(connection.encryptedRefreshToken, key),
    );
    accessToken = tokens.accessToken;
    await db.integrationConnection.update({
      where: { id: connection.id },
      data: {
        encryptedAccessToken: encryptSecret(tokens.accessToken, key),
        encryptedRefreshToken: encryptSecret(tokens.refreshToken, key),
        expiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      },
    });
  }
  const metadata = connection.metadataJson as Record<string, unknown>;
  return { accessToken, userId: Number(metadata.userId), adapter: mlAdapter() };
}
export async function syncMarketplaceOrders(db: Database, identity: Identity, orderId?: number) {
  const { accessToken, userId, adapter } = await mercadoLivreToken(db, identity.workspace.id);
  const response = orderId
    ? { results: [await adapter.getOrder(accessToken, orderId)] }
    : await adapter.listOrders(accessToken, userId, { status: 'paid', limit: 50 });
  const results = Array.isArray(response.results) ? response.results : [];
  let created = 0,
    updated = 0;
  for (const value of results) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const row = value as JsonObject;
    if (row.currency_id !== 'BRL' || !Number.isFinite(row.total_amount) || !row.id) continue;
    const seller =
      row.seller && typeof row.seller === 'object' && !Array.isArray(row.seller)
        ? (row.seller as JsonObject)
        : null;
    if (
      Number(seller?.id) !== userId ||
      Number(row.total_amount) <= 0 ||
      Number(row.total_amount) > 999999.99
    )
      continue;
    const lines = Array.isArray(row.order_items) ? row.order_items : [];
    const first =
      lines[0] && typeof lines[0] === 'object' && !Array.isArray(lines[0])
        ? (lines[0] as JsonObject)
        : null;
    const item =
      first?.item && typeof first.item === 'object' && !Array.isArray(first.item)
        ? (first.item as JsonObject)
        : null;
    const listing = item?.id
      ? await db.listing.findFirst({
          where: { workspaceId: identity.workspace.id, externalId: String(item.id) },
          include: { product: { include: { supplier: true } } },
        })
      : null;
    const externalId = String(row.id),
      existing = await db.marketplaceOrder.findUnique({
        where: { workspaceId_externalId: { workspaceId: identity.workspace.id, externalId } },
      });
    const data = {
      source: 'MERCADOLIVRE_COST_INCOMPLETE',
      status: row.status === 'cancelled' ? 'cancelled' : (existing?.status ?? 'processing'),
      amountCents: Math.round(Number(row.total_amount) * 100),
      costCents: existing?.costCents ?? 0,
      costsConfirmed: existing?.costsConfirmed ?? false,
      productId: listing?.productId ?? null,
      productName:
        listing?.product.name ?? String(item?.title ?? 'Produto sem vínculo').slice(0, 160),
      category: listing?.product.category ?? 'Não vinculado',
      supplierName: listing?.product.supplier.name ?? 'Não vinculado',
      quantity: Math.max(1, Math.min(10000, Number(first?.quantity ?? 1))),
      linesJson: json([
        {
          shippingId:
            row.shipping && typeof row.shipping === 'object' && !Array.isArray(row.shipping)
              ? String(row.shipping.id ?? '')
              : null,
        },
        ...lines.map((line) => {
          const l =
            line && typeof line === 'object' && !Array.isArray(line) ? (line as JsonObject) : {};
          const i =
            l.item && typeof l.item === 'object' && !Array.isArray(l.item)
              ? (l.item as JsonObject)
              : {};
          return {
            itemId: i.id ?? null,
            title: i.title ?? null,
            quantity: l.quantity ?? null,
            unitPrice: l.unit_price ?? null,
          };
        }),
      ]),
      orderedAt:
        typeof row.date_created === 'string' && Number.isFinite(Date.parse(row.date_created))
          ? new Date(row.date_created)
          : new Date(),
    };
    if (existing) {
      await db.marketplaceOrder.update({
        where: { id: existing.id },
        data: { ...data, ...(existing.costsConfirmed ? { source: 'MERCADOLIVRE_REVIEWED' } : {}) },
      });
      updated++;
    } else {
      await db.marketplaceOrder.create({
        data: { ...data, workspaceId: identity.workspace.id, externalId },
      });
      created++;
    }
    if (!existing?.costsConfirmed)
      await alert(
        db,
        identity.workspace.id,
        `order-cost-${externalId}`,
        'warning',
        'Custos de pedido precisam de revisão',
        `Pedido ${externalId}: confirme vínculo, custos, tarifas e logística antes de interpretar o lucro.`,
        '/app/orders',
      );
  }
  await event(
    db,
    identity.workspace.id,
    'Mercado Livre',
    'order',
    `${created} pedidos importados e ${updated} atualizados.`,
    { link: '/app/orders' },
  );
  return { created, updated, source: 'Mercado Livre oficial', costsRequireReview: true };
}
