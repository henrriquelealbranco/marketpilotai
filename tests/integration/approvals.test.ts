import { beforeAll, afterAll, afterEach, describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../apps/api/src/app.js';
import { database } from '../../packages/database/src/index.js';
import {
  MercadoLivreAdapter,
  encryptSecret,
  IntegrationError,
} from '../../apps/api/src/integrations/index.js';
const db = database(),
  origin = 'http://localhost:3000',
  prefix = `approval-${randomUUID()}`,
  key = Buffer.alloc(32, 1).toString('base64');
const app = await buildApp({
  db,
  origin,
  logger: false,
  allowRegistration: true,
  rateLimitMax: 1000,
});
let cookie = '',
  workspaceId = '',
  productId = '';
const req = (url: string, payload: unknown, method: 'POST' | 'PUT' = 'POST') =>
  app.inject({ method, url, headers: { origin, cookie }, payload: payload as object });
const input = () => ({
  productId,
  title: 'Produto aprovado controlado',
  description: '',
  priceCents: 10000,
  stock: 2,
  categoryId: 'MLB123',
  listingTypeId: 'gold_special',
  pictures: ['https://example.test/test.jpg'],
});
beforeAll(async () => {
  vi.stubEnv('ENCRYPTION_KEY', key);
  vi.stubEnv('MERCADOLIVRE_CLIENT_ID', '123');
  vi.stubEnv('MERCADOLIVRE_CLIENT_SECRET', 'test-only');
  vi.stubEnv('MERCADOLIVRE_REDIRECT_URI', 'https://example.test/callback');
  const user = await req('/v1/auth/register', {
    email: `${prefix}@example.test`,
    password: 'Teste-seguro-123!',
    name: 'Revisor',
    workspaceName: 'Aprovações controladas',
  });
  expect(user.statusCode).toBe(201);
  cookie = String(user.headers['set-cookie']).split(';')[0]!;
  workspaceId = user.json().workspace.id;
  const supplier = (await req('/v1/suppliers', { name: 'Fornecedor controlado' })).json();
  const product = await req('/v1/products', {
    supplierId: supplier.id,
    sku: 'SAFE-1',
    name: 'Produto aprovado controlado',
    costCents: 5000,
    stock: 20,
  });
  productId = product.json().id;
  await req('/v1/pricing/quotes', {
    productId,
    input: {
      supplierCostCents: 5000,
      shippingCostCents: 0,
      packagingCostCents: 0,
      fixedFeeCents: 0,
      operatingCostCents: 0,
      commissionBps: 1000,
      taxBps: 0,
      advertisingBps: 0,
      returnsBps: 0,
      targetMarginBps: 2000,
      minimumMarginBps: 1000,
      salePriceCents: 10000,
    },
  });
  await db.integrationConnection.create({
    data: {
      workspaceId,
      provider: 'mercadolivre',
      status: 'CONNECTED',
      encryptedAccessToken: encryptSecret('test-only-transport-token', key),
      metadataJson: { userId: 123 },
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await db.workspace.deleteMany({ where: { id: workspaceId } });
  await app.close();
  await db.$disconnect();
  vi.unstubAllEnvs();
});
async function approved() {
  const listing = await req('/v1/listings', input());
  expect(listing.statusCode).toBe(201);
  const approval = await req(`/v1/listings/${listing.json().id}/request-approval`, {});
  expect(approval.statusCode).toBe(201);
  expect(
    (await req(`/v1/approvals/${approval.json().id}/review`, { status: 'APPROVED' })).statusCode,
  ).toBe(200);
  return { listing: listing.json(), approval: approval.json() };
}
describe.sequential('aprovações com transporte externo controlado', () => {
  it('impede duas publicações aprovadas concorrentes e edição durante execução', async () => {
    vi.spyOn(MercadoLivreAdapter.prototype, 'getUser').mockResolvedValue({
      id: 123,
      tags: ['user_product_seller'],
    });
    let release!: (value: { id: string }) => void;
    const publish = vi.spyOn(MercadoLivreAdapter.prototype, 'createListing').mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const { listing, approval } = await approved();
    const original = await db.approval.findUniqueOrThrow({ where: { id: approval.id } });
    const duplicate = await db.approval.create({
      data: {
        workspaceId,
        kind: original.kind,
        subjectId: original.subjectId,
        title: original.title,
        payloadJson: original.payloadJson!,
        payloadHash: original.payloadHash,
        status: 'APPROVED',
        requestedById: original.requestedById,
        approvedById: original.approvedById,
        approvedAt: new Date(),
        expiresAt: original.expiresAt,
      },
    });
    const first = Promise.resolve(req(`/v1/approvals/${approval.id}/execute`, {}));
    await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    expect((await req(`/v1/approvals/${duplicate.id}/execute`, {})).statusCode).toBe(409);
    expect(
      (await req(`/v1/listings/${listing.id}`, { ...input(), version: listing.version }, 'PUT'))
        .statusCode,
    ).toBe(409);
    release({ id: 'MLB123' });
    expect((await first).statusCode).toBe(200);
    expect((await req(`/v1/approvals/${duplicate.id}/execute`, {})).statusCode).toBe(409);
    expect(publish).toHaveBeenCalledTimes(1);
  });
  it('bloqueia novas solicitações após resposta externa incerta', async () => {
    vi.spyOn(MercadoLivreAdapter.prototype, 'getUser').mockResolvedValue({
      id: 123,
      tags: ['user_product_seller'],
    });
    vi.spyOn(MercadoLivreAdapter.prototype, 'createListing').mockRejectedValue(
      new IntegrationError('timeout', 'Timeout controlado.', 'mercadolivre'),
    );
    const { listing, approval } = await approved();
    expect((await req(`/v1/approvals/${approval.id}/execute`, {})).statusCode).toBe(502);
    expect((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe(
      'RECONCILIATION_REQUIRED',
    );
    expect((await req(`/v1/listings/${listing.id}/request-approval`, {})).statusCode).toBe(409);
    vi.spyOn(MercadoLivreAdapter.prototype, 'getItems').mockResolvedValue([
      {
        code: 200,
        body: {
          id: 'MLB456',
          seller_id: 123,
          price: 110,
          available_quantity: 1,
          currency_id: 'BRL',
        },
      },
    ]);
    expect(
      (
        await req(`/v1/listings/${listing.id}/reconcile`, {
          externalId: 'MLB456',
          reviewed: true,
          reference: 'Conferência manual com transporte controlado.',
        })
      ).statusCode,
    ).toBe(200);
    const reconciled = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(reconciled.priceCents).toBe(11000);
    expect(reconciled.stock).toBe(1);
    expect(
      (
        await req(
          `/v1/listings/${listing.id}`,
          { ...input(), priceCents: 11000, stock: 0, version: reconciled.version },
          'PUT',
        )
      ).statusCode,
    ).toBe(200);
    const zero = await req(`/v1/listings/${listing.id}/request-approval`, { kind: 'STOCK_UPDATE' });
    expect(zero.statusCode).toBe(201);
    await req(`/v1/approvals/${zero.json().id}/review`, { status: 'APPROVED' });
    const update = vi
      .spyOn(MercadoLivreAdapter.prototype, 'updateStock')
      .mockResolvedValue({ id: 'MLB456', available_quantity: 0 });
    expect((await req(`/v1/approvals/${zero.json().id}/execute`, {})).statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith('test-only-transport-token', 'MLB456', 0);
  });
  it('registra ação financeira manual sem transmitir pagamento a qualquer provedor', async () => {
    const approval = await req('/v1/approvals', {
      kind: 'FINANCIAL_ACTION',
      title: 'Revisar custo logístico',
      amountCents: 1500,
      details: 'Conferência manual de frete autorizado.',
      risks: 'Conferir duplicidade e comprovante.',
    });
    expect(approval.statusCode).toBe(201);
    const id = approval.json().id;
    expect((await req(`/v1/approvals/${id}/review`, { status: 'APPROVED' })).statusCode).toBe(200);
    expect((await req(`/v1/approvals/${id}/execute`, {})).statusCode).toBe(409);
    const result = await req(`/v1/approvals/${id}/manual-result`, {
      reference: 'Conferência manual de teste, sem pagamento.',
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().source).toBe('MANUAL_DECLARATION');
  });
});
