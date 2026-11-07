import type { Database } from '@marketpilot/database';
import { calculatePricing, pricingInputSchema, type Identity } from '@marketpilot/contracts';
import { HttpError } from '../auth.js';
import { IntegrationError } from '../integrations/index.js';
import { mercadoLivreToken } from './marketplace.js';
import { canonicalHash } from './domain.js';
import { audit, event, json } from './store.js';

export async function validateListing(
  db: Database,
  workspaceId: string,
  id: string,
  allowZero = false,
) {
  const listing = await db.listing.findFirst({
    where: { id, workspaceId },
    include: {
      product: { include: { supplier: true, quotes: { orderBy: { createdAt: 'desc' }, take: 1 } } },
    },
  });
  if (!listing) throw new HttpError(404, 'Anúncio não encontrado.');
  if (
    ['EXECUTING', 'RECONCILIATION_REQUIRED', 'PUBLISHED_DESCRIPTION_PENDING'].includes(
      listing.status,
    )
  )
    throw new HttpError(
      409,
      'Confira a execução em andamento ou reconcilie este anúncio antes de outra ação.',
    );
  const stoppingStock = allowZero && listing.stock === 0;
  if (
    !stoppingStock &&
    (listing.product.status !== 'ACTIVE' || listing.product.supplier.status !== 'ACTIVE')
  )
    throw new HttpError(409, 'Produto e fornecedor precisam estar ativos.');
  if (listing.stock < (allowZero ? 0 : 1) || listing.stock > listing.product.stock)
    throw new HttpError(409, 'Confira o estoque disponível no catálogo.');
  if (stoppingStock) return { listing, quote: null, result: null };
  const quote = listing.product.quotes[0];
  if (!quote) throw new HttpError(409, 'Salve uma cotação completa antes de solicitar publicação.');
  const input = pricingInputSchema.parse(quote.inputJson);
  if (
    input.supplierCostCents !== listing.product.costCents ||
    input.shippingCostCents !== listing.product.shippingCostCents
  )
    throw new HttpError(409, 'Os custos mudaram. Atualize a cotação antes de continuar.');
  const result = calculatePricing({ ...input, salePriceCents: listing.priceCents });
  if (result.blocked)
    throw new HttpError(409, 'A margem deste anúncio não atende à cotação aprovada.');
  return { listing, quote, result };
}
export async function requestListingApproval(
  db: Database,
  identity: Identity,
  id: string,
  kind: 'LISTING_PUBLISH' | 'PRICE_UPDATE' | 'STOCK_UPDATE' = 'LISTING_PUBLISH',
) {
  const { listing, quote, result } = await validateListing(
    db,
    identity.workspace.id,
    id,
    kind === 'STOCK_UPDATE',
  );
  if (kind === 'LISTING_PUBLISH' && listing.externalId)
    throw new HttpError(409, 'Este anúncio já possui vínculo externo.');
  if (kind !== 'LISTING_PUBLISH' && !listing.externalId)
    throw new HttpError(409, 'Vincule um anúncio publicado antes de atualizar preço ou estoque.');
  const pending = await db.approval.findFirst({
    where: {
      workspaceId: identity.workspace.id,
      subjectId: id,
      kind,
      status: { in: ['PENDING', 'APPROVED', 'EXECUTING', 'RECONCILIATION_REQUIRED'] },
      expiresAt: { gt: new Date() },
    },
  });
  if (pending) return pending;
  const payload = {
    listingId: id,
    version: listing.version,
    kind,
    externalId: listing.externalId,
    payload: listing.payloadJson,
    description: listing.description,
    priceCents: listing.priceCents,
    stock: listing.stock,
    quoteId: quote?.id ?? null,
    marginBps: result?.marginBps ?? null,
    estimatedProfitCents: result?.estimatedProfitCents ?? null,
    risks: [
      'Confirmar categoria, atributos e direitos das imagens.',
      'Confirmar documentação fiscal, logística e políticas do marketplace.',
      'A publicação pode gerar obrigações comerciais.',
    ],
  };
  const approval = await db.approval.create({
    data: {
      workspaceId: identity.workspace.id,
      kind,
      subjectId: id,
      title: `${kind === 'LISTING_PUBLISH' ? 'Publicar' : kind === 'PRICE_UPDATE' ? 'Atualizar preço de' : 'Atualizar estoque de'} ${listing.title}`,
      payloadJson: json(payload),
      payloadHash: canonicalHash(payload),
      requestedById: identity.user.id,
      expiresAt: new Date(Date.now() + 24 * 3600000),
    },
  });
  await audit(db, identity, 'approval.requested');
  await event(db, identity.workspace.id, 'aprovação', 'approval', 'Nova ação aguardando revisão.', {
    approvalId: approval.id,
    link: '/app/operations',
  });
  return approval;
}
export async function executeApproval(db: Database, identity: Identity, id: string) {
  const approval = await db.approval.findFirst({
    where: { id, workspaceId: identity.workspace.id },
  });
  if (!approval) throw new HttpError(404, 'Aprovação não encontrada.');
  if (approval.status !== 'APPROVED' || approval.expiresAt < new Date())
    throw new HttpError(409, 'A aprovação precisa estar válida e aprovada.');
  if (canonicalHash(approval.payloadJson) !== approval.payloadHash)
    throw new HttpError(409, 'Os dados da aprovação não conferem.');
  if (!['LISTING_PUBLISH', 'PRICE_UPDATE', 'STOCK_UPDATE'].includes(approval.kind))
    throw new HttpError(
      409,
      'Este tipo de ação requer encaminhamento manual; nenhuma operação financeira é executada.',
    );
  const payload = approval.payloadJson as Record<string, unknown>;
  const { listing } = await validateListing(
    db,
    identity.workspace.id,
    String(payload.listingId),
    approval.kind === 'STOCK_UPDATE',
  );
  if (approval.kind === 'LISTING_PUBLISH' && listing.externalId)
    throw new HttpError(409, 'Este anúncio já possui vínculo externo. Não publique novamente.');
  if (
    listing.version !== payload.version ||
    canonicalHash(listing.payloadJson) !== canonicalHash(payload.payload)
  )
    throw new HttpError(409, 'O rascunho foi alterado. Solicite nova aprovação.');
  // Verify configuration before consuming the approval. Failed configuration is safely recoverable.
  const { adapter, accessToken } = await mercadoLivreToken(db, identity.workspace.id);
  if (approval.kind === 'LISTING_PUBLISH') {
    const user = await adapter.getUser(accessToken);
    const tags = Array.isArray(user.tags) ? user.tags : [];
    const isUserProduct = tags.includes('user_product_seller');
    if (isUserProduct !== Boolean((listing.payloadJson as Record<string, unknown>).family_name))
      throw new HttpError(
        409,
        'O modelo do rascunho difere da conta. Confira User Products ou Legacy e solicite nova aprovação.',
      );
  }
  await db.$transaction(async (tx) => {
    const locked = await tx.listing.updateMany({
      where: {
        id: listing.id,
        workspaceId: identity.workspace.id,
        version: listing.version,
        status: {
          notIn: ['EXECUTING', 'RECONCILIATION_REQUIRED', 'PUBLISHED_DESCRIPTION_PENDING'],
        },
      },
      data: { status: 'EXECUTING', version: { increment: 1 } },
    });
    if (locked.count !== 1)
      throw new HttpError(409, 'O anúncio foi alterado ou outra execução está em andamento.');
    const claimed = await tx.approval.updateMany({
      where: {
        id,
        workspaceId: identity.workspace.id,
        status: 'APPROVED',
        expiresAt: { gt: new Date() },
      },
      data: { status: 'EXECUTING' },
    });
    if (claimed.count !== 1) throw new HttpError(409, 'Outra execução já recebeu esta aprovação.');
  });
  let createdExternally = false;
  try {
    let response;
    if (approval.kind === 'LISTING_PUBLISH')
      response = await adapter.createListing(accessToken, listing.payloadJson as never);
    else if (approval.kind === 'PRICE_UPDATE')
      response = await adapter.updatePrice(
        accessToken,
        listing.externalId!,
        listing.priceCents / 100,
      );
    else response = await adapter.updateStock(accessToken, listing.externalId!, listing.stock);
    const externalId = typeof response.id === 'string' ? response.id : listing.externalId;
    if (!externalId)
      throw new IntegrationError(
        'invalid_response',
        'Publicação sem identificador. Reconcilie na conta antes de tentar novamente.',
        'mercadolivre',
      );
    if (approval.kind === 'LISTING_PUBLISH') {
      createdExternally = true;
      await db.listing.update({
        where: { id: listing.id },
        data: { externalId, status: 'PUBLISHED_DESCRIPTION_PENDING' },
      });
      if (listing.description.trim())
        await adapter.createDescription(accessToken, externalId, listing.description);
    }
    return await db.$transaction(async (tx) => {
      await tx.listing.update({
        where: { id: listing.id },
        data: { externalId, status: 'PUBLISHED' },
      });
      const result = await tx.approval.update({
        where: { id },
        data: { status: 'EXECUTED', resultJson: json({ externalId }) },
      });
      await audit(tx, identity, 'approval.executed');
      await event(
        tx,
        identity.workspace.id,
        'Mercado Livre',
        'listing',
        'Ação aprovada confirmada pela API oficial.',
        { approvalId: id, externalId, link: '/app/listings' },
      );
      return result;
    });
  } catch (error) {
    // A timeout or ambiguous response may follow a successful remote mutation: never retry automatically.
    const rejected =
      !createdExternally &&
      error instanceof IntegrationError &&
      [
        'upstream_rejected',
        'upstream_authentication',
        'upstream_forbidden',
        'invalid_input',
      ].includes(error.code);
    await db.approval.update({
      where: { id },
      data: {
        status: rejected ? 'FAILED' : 'RECONCILIATION_REQUIRED',
        resultJson: json({
          code: error instanceof IntegrationError ? error.code : 'execution_uncertain',
          message: 'Confira o estado na conta Mercado Livre antes de solicitar outra ação.',
        }),
      },
    });
    await db.listing.update({
      where: { id: listing.id },
      data: { status: rejected ? listing.status : 'RECONCILIATION_REQUIRED' },
    });
    await event(
      db,
      identity.workspace.id,
      'Mercado Livre',
      'error',
      'Execução não confirmada. Reconciliação necessária antes de outra tentativa.',
      { approvalId: id },
    );
    throw error;
  }
}
