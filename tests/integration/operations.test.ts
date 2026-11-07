import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { serviceSignature } from '../../apps/worker/src/contract.js';
import { buildApp } from '../../apps/api/src/app.js';
import { database } from '../../packages/database/src/index.js';
const db = database(),
  origin = 'http://localhost:3000',
  prefix = `ops-${randomUUID()}`;
const app = await buildApp({
  db,
  logger: false,
  allowRegistration: true,
  origin,
  rateLimitMax: 1000,
});
let cookie = '',
  other = '',
  productId = '',
  workspaceId = '',
  decisionId = '',
  approvalId = '';
const req = (
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  url: string,
  payload?: unknown,
  token = cookie,
) =>
  app.inject({
    method,
    url,
    headers: { origin, cookie: token },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
beforeAll(async () => {
  await app.ready();
  for (const [i, suffix] of ['', '-other'].entries()) {
    const r = await req(
      'POST',
      '/v1/auth/register',
      {
        email: `${prefix}${suffix}@example.test`,
        password: 'Teste-seguro-123!',
        name: 'Operador',
        workspaceName: 'Operação',
      },
      '',
    );
    expect(r.statusCode).toBe(201);
    const c = String(r.headers['set-cookie']).split(';')[0]!;
    if (i === 0) {
      cookie = c;
      workspaceId = r.json().workspace.id;
    } else other = c;
  }
  const supplier = (await req('POST', '/v1/suppliers', { name: 'Fornecedor autorizado' })).json();
  const product = await req('POST', '/v1/products', {
    supplierId: supplier.id,
    sku: 'OPS-1',
    name: 'Produto de teste',
    costCents: 5000,
    stock: 10,
  });
  expect(product.statusCode).toBe(201);
  productId = product.json().id;
});
afterAll(async () => {
  await db.workspace.deleteMany({ where: { users: { some: { email: { startsWith: prefix } } } } });
  await app.close();
  await db.$disconnect();
});
describe.sequential('operações persistentes', () => {
  it('salva cotação real e protege o produto de outro workspace', async () => {
    const input = {
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
    };
    const r = await req('POST', '/v1/pricing/quotes', { productId, input });
    expect(r.statusCode).toBe(201);
    expect(r.json().result.estimatedProfitCents).toBe(4000);
    expect((await req('POST', '/v1/pricing/quotes', { productId, input }, other)).statusCode).toBe(
      404,
    );
  });
  it('executa análise determinística sem fingir chamada OpenAI', async () => {
    const r = await req('POST', '/v1/agents/product-hunter/run', { provider: 'rules', productId });
    expect(r.statusCode).toBe(201);
    expect(r.json().status).toBe('COMPLETED');
    expect(r.json().provider).toBe('rules');
    const state = (await req('GET', '/v1/operations')).json();
    expect(state.runs.length).toBe(1);
    expect(state.events.length).toBeGreaterThan(0);
    expect(state.decisions.length).toBeGreaterThan(0);
    decisionId = state.decisions[0].id;
    expect((await req('GET', '/v1/operations', undefined, other)).json().runs).toHaveLength(0);
  });
  it('registra revisão humana de decisão e não permite revisão entre contas', async () => {
    expect(
      (await req('POST', `/v1/decisions/${decisionId}/review`, { status: 'APPROVED' }, other))
        .statusCode,
    ).toBe(404);
    expect(
      (await req('POST', `/v1/decisions/${decisionId}/review`, { status: 'APPROVED' })).statusCode,
    ).toBe(200);
  });
  it('registra pedidos manuais e analytics com custos confirmados', async () => {
    const r = await req('POST', '/v1/orders', {
      externalId: `MANUAL-${prefix}`,
      productId,
      amountCents: 10000,
      costCents: 7000,
      quantity: 1,
      status: 'delivered',
      costsConfirmed: true,
    });
    expect(r.statusCode).toBe(201);
    const analytics = (await req('GET', '/v1/analytics?days=30')).json();
    expect(analytics.revenueCents).toBe(10000);
    expect(analytics.realizedProfitCents).toBe(3000);
    expect((await req('GET', '/v1/orders', undefined, other)).json().items).toHaveLength(0);
  });
  it('prepara anúncio interno e aprovação, mas bloqueia publicação sem credenciais', async () => {
    const r = await req('POST', '/v1/listings', {
      productId,
      title: 'Produto de teste autorizado',
      description: 'Descrição informada',
      priceCents: 10000,
      stock: 2,
      categoryId: 'MLB123',
      listingTypeId: 'gold_special',
      pictures: ['https://example.test/imagem.jpg'],
      attributes: [],
    });
    expect(r.statusCode).toBe(201);
    const listing = r.json();
    const request = await req('POST', `/v1/listings/${listing.id}/request-approval`, {});
    expect(request.statusCode).toBe(201);
    approvalId = request.json().id;
    expect(
      (
        await req('POST', `/v1/approvals/${approvalId}/review`, {
          status: 'APPROVED',
          reason: 'Revisado',
        })
      ).statusCode,
    ).toBe(200);
    const execute = await req('POST', `/v1/approvals/${approvalId}/execute`, {});
    expect(execute.statusCode).toBe(409);
    expect(execute.json().code).toBe('configuration_required');
  });
  it('responde com dados conhecidos e salva histórico sem fingir LLM', async () => {
    const r = await req('POST', '/v1/assistant/messages', {
      question: 'Qual foi o faturamento?',
      provider: 'rules',
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().provider).toBe('rules');
    expect(r.json().answer).toContain('100,00');
    expect((await req('GET', '/v1/assistant/messages')).json().items.length).toBe(1);
  });
  it('executa workflow interno idempotente e exporta PDF com identificação da origem', async () => {
    const first = await req('POST', '/v1/automations/discovery/run', {
      idempotencyKey: `test-${prefix}`,
    });
    expect(first.statusCode).toBe(201);
    const repeat = await req('POST', '/v1/automations/discovery/run', {
      idempotencyKey: `test-${prefix}`,
    });
    expect(repeat.statusCode).toBe(200);
    expect(repeat.json().id).toBe(first.json().id);
    const pdf = await req('GET', '/v1/analytics/export.pdf?days=30');
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
  });
  it('rejeita aprovação adulterada antes de qualquer conexão externa', async () => {
    const original = await db.approval.findUniqueOrThrow({ where: { id: approvalId } });
    await db.approval.update({ where: { id: approvalId }, data: { payloadHash: 'tampered' } });
    const response = await req('POST', `/v1/approvals/${approvalId}/execute`, {});
    expect(response.statusCode).toBe(409);
    expect(response.json().message).toContain('dados da aprovação');
    await db.approval.update({
      where: { id: approvalId },
      data: { payloadHash: original.payloadHash },
    });
  });
  it('autentica worker por corpo exato e timestamp, sem depender de Origin', async () => {
    const original = process.env.INTERNAL_SERVICE_KEY;
    const key = 'test-only-independent-key-32-characters';
    process.env.INTERNAL_SERVICE_KEY = key;
    try {
      const execution = await db.workflowExecution.findFirstOrThrow({
        where: { workspaceId, status: 'COMPLETED' },
      });
      const payload = { workspaceId, executionId: execution.id, workflowKey: 'discovery' },
        body = JSON.stringify(payload),
        timestamp = String(Math.floor(Date.now() / 1000));
      const headers = {
        'content-type': 'application/json',
        'x-marketpilot-timestamp': timestamp,
        'x-marketpilot-signature': serviceSignature(timestamp, body, key),
      };
      expect(
        (await app.inject({ method: 'POST', url: '/internal/jobs/run', headers, payload: body }))
          .statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/internal/jobs/run',
            headers,
            payload: JSON.stringify({ ...payload, workspaceId: randomUUID() }),
          })
        ).statusCode,
      ).toBe(401);
      const expired = String(Math.floor(Date.now() / 1000) - 600);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/internal/jobs/run',
            headers: {
              ...headers,
              'x-marketpilot-timestamp': expired,
              'x-marketpilot-signature': serviceSignature(expired, body, key),
            },
            payload: body,
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (await app.inject({ method: 'POST', url: '/internal/workflows/dispatch', payload: {} }))
          .statusCode,
      ).toBe(401);
    } finally {
      if (original === undefined) delete process.env.INTERNAL_SERVICE_KEY;
      else process.env.INTERNAL_SERVICE_KEY = original;
    }
  });
  it('transmite evento real por SSE e encerra conexão sem manter timers', async () => {
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const after = await db.operationEvent.findFirstOrThrow({
      where: { workspaceId },
      orderBy: { id: 'desc' },
    });
    const controller = new AbortController();
    const response = await fetch(`${address}/v1/events/stream?after=${after.id}`, {
      headers: { cookie },
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const reader = response.body!.getReader(),
      decoder = new TextDecoder();
    await reader.read();
    const marker = `SSE-${prefix}`;
    await db.operationEvent.create({
      data: { workspaceId, origin: 'test', category: 'test', message: marker },
    });
    let output = '';
    try {
      while (!output.includes(marker)) {
        const chunk = await reader.read();
        if (chunk.done) break;
        output += decoder.decode(chunk.value);
      }
      expect(output).toContain('event: operation');
      expect(output).toContain(marker);
    } finally {
      controller.abort();
      await reader.cancel().catch(() => {});
    }
  });
  it('fecha o servidor mesmo com um feed SSE aberto', async () => {
    const server = await buildApp({ db, logger: false, origin, rateLimitMax: 1000 });
    const address = await server.listen({ host: '127.0.0.1', port: 0 }),
      controller = new AbortController();
    const response = await fetch(`${address}/v1/events/stream`, {
      headers: { cookie },
      signal: controller.signal,
    });
    const reader = response.body!.getReader();
    await reader.read();
    const closing = server.close();
    let closed = false;
    try {
      closed = await Promise.race([
        closing.then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1500)),
      ]);
    } finally {
      controller.abort();
      await reader.cancel().catch(() => {});
      await closing;
    }
    expect(closed).toBe(true);
  });
  it('aceita observação autorizada sem inventar demanda e restringe perfil leitor', async () => {
    const r = await req('POST', '/v1/market/observations', {
      productId,
      title: 'Comparável autorizado',
      priceCents: 9900,
      sourceUrl: 'https://example.test/item',
      authorized: true,
    });
    expect(r.statusCode).toBe(201);
    expect((await req('GET', '/v1/market/observations')).json().items).toHaveLength(1);
    await db.user.updateMany({ where: { workspaceId }, data: { role: 'VIEWER' } });
    expect(
      (await req('POST', '/v1/agents/product-hunter/run', { provider: 'rules' })).statusCode,
    ).toBe(403);
    expect(
      (await req('POST', `/v1/approvals/${approvalId}/review`, { status: 'REJECTED' })).statusCode,
    ).toBe(403);
  });
});
