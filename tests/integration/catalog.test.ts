import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../apps/api/src/app.js';
import { database } from '../../packages/database/src/index.js';
const db = database();
const origin = 'http://localhost:3000';
const prefix = `catalog-${randomUUID()}`;
const app = await buildApp({
  db,
  logger: false,
  allowRegistration: true,
  origin,
  rateLimitMax: 1000,
});
let cookie = '',
  secondCookie = '',
  supplierId = '',
  productId = '',
  workspaceId = '';
const supplierInput = {
  name: 'Distribuidora de teste',
  cnpj: '11.222.333/0001-81',
  shippingDays: 3,
  shippingCostCents: 500,
};
const upload = () => ({
  supplierId,
  fileName: 'catalogo.csv',
  format: 'CSV',
  content: 'sku;name;cost;stock\nSKU-1;Produto importado;19,90;4\nSKU-2;Outro produto;9,50;3',
  authorized: true,
});
const request = (
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
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
  for (const [index, email] of [
    `${prefix}@example.test`,
    `${prefix}-second@example.test`,
  ].entries()) {
    const response = await request(
      'POST',
      '/v1/auth/register',
      { email, password: 'Teste-seguro-123!', name: 'Operador', workspaceName: `Loja ${index}` },
      '',
    );
    expect(response.statusCode).toBe(201);
    const token = String(response.headers['set-cookie']).split(';')[0]!;
    if (index === 0) {
      cookie = token;
      workspaceId = response.json().workspace.id;
    } else secondCookie = token;
  }
});
afterAll(async () => {
  await db.workspace.deleteMany({ where: { users: { some: { email: { startsWith: prefix } } } } });
  await app.close();
  await db.$disconnect();
});
describe.sequential('catálogo persistente', () => {
  it('exige sessão e cadastra fornecedor com CNPJ normalizado', async () => {
    expect((await request('GET', '/v1/suppliers', undefined, '')).statusCode).toBe(401);
    const response = await request('POST', '/v1/suppliers', supplierInput);
    expect(response.statusCode).toBe(201);
    supplierId = response.json().id;
    expect(response.json().cnpj).toBe('11222333000181');
  });
  it('isola leitura e escrita entre contas e rejeita overposting', async () => {
    expect(
      (await request('GET', `/v1/suppliers/${supplierId}`, undefined, secondCookie)).statusCode,
    ).toBe(404);
    expect((await request('GET', '/v1/suppliers', undefined, secondCookie)).json().total).toBe(0);
    expect(
      (await request('POST', '/v1/suppliers', { ...supplierInput, workspaceId: 'injetado' }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await request(
          'POST',
          '/v1/products',
          { supplierId, sku: 'INV', name: 'Intruso', costCents: 100, stock: 1 },
          secondCookie,
        )
      ).statusCode,
    ).toBe(404);
  });
  it('cadastra produto e registra histórico inicial', async () => {
    const response = await request('POST', '/v1/products', {
      supplierId,
      sku: 'MANUAL',
      name: 'Produto manual',
      costCents: 1050,
      stock: 8,
    });
    expect(response.statusCode).toBe(201);
    productId = response.json().id;
    expect((await request('GET', `/v1/products/${productId}`)).json().history).toHaveLength(1);
    expect(
      (
        await request('POST', '/v1/products', {
          supplierId,
          sku: 'MANUAL',
          name: 'Duplicado',
          costCents: 1,
          stock: 1,
        })
      ).statusCode,
    ).toBe(409);
  });
  it('atualiza custo com histórico e bloqueia versão desatualizada', async () => {
    const input = {
      supplierId,
      sku: 'MANUAL',
      name: 'Produto manual',
      costCents: 1200,
      stock: 7,
      version: 1,
    };
    const response = await request('PUT', `/v1/products/${productId}`, input);
    expect(response.statusCode).toBe(200);
    expect(response.json().version).toBe(2);
    expect((await request('PUT', `/v1/products/${productId}`, input)).statusCode).toBe(409);
    const detail = (await request('GET', `/v1/products/${productId}`)).json();
    expect(detail.history).toHaveLength(2);
    expect(detail.history[0].costCents).toBe(1200);
  });
  it('faz prévia sem persistir, importa em transação e evita reprocessamento', async () => {
    const preview = await request('POST', '/v1/catalog/preview', upload());
    expect(preview.statusCode).toBe(200);
    expect(preview.json().valid).toBe(true);
    expect((await request('GET', '/v1/products')).json().total).toBe(1);
    const imported = await request('POST', '/v1/catalog/import', upload());
    expect(imported.statusCode).toBe(201);
    expect(imported.json().item.createdCount).toBe(2);
    const duplicate = await request('POST', '/v1/catalog/import', upload());
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().duplicate).toBe(true);
    expect(duplicate.json().item.id).toBe(imported.json().item.id);
    expect((await request('GET', '/v1/products')).json().total).toBe(3);
  });
  it('rejeita lote inválido e origem não autorizada sem alteração parcial', async () => {
    expect(
      (await request('POST', '/v1/catalog/import', { ...upload(), authorized: false })).statusCode,
    ).toBe(400);
    const bad = await request('POST', '/v1/catalog/import', {
      ...upload(),
      content: 'sku;name;cost;stock\nNEW;Válido;10,00;1\nBAD;Inválido;-2;0',
    });
    expect(bad.statusCode).toBe(400);
    expect((await request('GET', '/v1/products?q=NEW')).json().total).toBe(0);
    expect((await request('POST', '/v1/catalog/import', upload(), secondCookie)).statusCode).toBe(
      404,
    );
  });
  it('atualiza importados com snapshot apenas quando custo ou estoque muda', async () => {
    const next = await request('POST', '/v1/catalog/import', {
      ...upload(),
      content: 'sku;name;cost;stock\nSKU-1;Produto importado;20,50;2\nSKU-2;Outro produto;9,50;3',
    });
    expect(next.statusCode).toBe(201);
    expect(next.json().item.updatedCount).toBe(1);
    expect(next.json().item.unchangedCount).toBe(1);
    const product = (await request('GET', '/v1/products?q=SKU-1')).json().items[0];
    const history = (await request('GET', `/v1/products/${product.id}`)).json().history;
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ costCents: 2050, stock: 2, source: 'CSV' });
    const summary = (await request('GET', '/v1/catalog/summary')).json();
    expect(summary.activeProducts).toBe(3);
    expect(summary.suppliers).toBe(1);
    expect(summary.imports).toBe(2);
  });
  it('arquiva e reativa, sem exclusão de histórico', async () => {
    expect(
      (await request('PATCH', `/v1/products/${productId}/archive`, { archived: true, version: 2 }))
        .statusCode,
    ).toBe(200);
    expect((await request('GET', '/v1/products')).json().total).toBe(2);
    expect((await request('GET', '/v1/products?status=ARCHIVED')).json().items[0].id).toBe(
      productId,
    );
    const rollback = await request('POST', '/v1/catalog/import', {
      ...upload(),
      content:
        'sku;name;cost;stock\nSKU-1;Produto importado;99,90;5\nMANUAL;Produto arquivado;1,00;1',
    });
    expect(rollback.statusCode).toBe(409);
    expect((await request('GET', '/v1/products?q=SKU-1')).json().items[0].costCents).toBe(2050);
    expect(
      (await request('PATCH', `/v1/products/${productId}/archive`, { archived: false, version: 3 }))
        .statusCode,
    ).toBe(200);
    expect((await request('GET', `/v1/products/${productId}`)).json().history).toHaveLength(2);
  });
  it('importa XML autorizado e aceita o limite de 500 produtos por lote', async () => {
    const xml = await request('POST', '/v1/catalog/import', {
      ...upload(),
      format: 'XML',
      fileName: 'catalogo.xml',
      content:
        '<catalog><product><sku>XML-001</sku><name>Casa &amp; Arte</name><cost>12.50</cost><stock>0</stock></product></catalog>',
    });
    expect(xml.statusCode).toBe(201);
    expect((await request('GET', '/v1/products?q=XML-001')).json().items[0]).toMatchObject({
      name: 'Casa & Arte',
      costCents: 1250,
      stock: 0,
      source: 'XML',
    });
    const content =
      'sku;name;cost;stock\n' +
      Array.from(
        { length: 500 },
        (_, index) => `BULK-${index};Produto em lote ${index};1,99;1`,
      ).join('\n');
    const result = await request('POST', '/v1/catalog/import', {
      ...upload(),
      fileName: 'lote-500.csv',
      content,
    });
    expect(result.statusCode).toBe(201);
    expect(result.json().item.createdCount).toBe(500);
    expect((await request('GET', '/v1/products?q=BULK-&pageSize=20')).json().total).toBe(500);
  });
  it('restringe alterações de leitores e mantém auditoria do catálogo', async () => {
    await db.user.updateMany({ where: { workspaceId }, data: { role: 'VIEWER' } });
    expect((await request('GET', '/v1/products')).statusCode).toBe(200);
    expect((await request('POST', '/v1/suppliers', supplierInput)).statusCode).toBe(403);
    expect((await request('POST', '/v1/catalog/import', upload())).statusCode).toBe(403);
    const audit = (await request('GET', '/v1/audit')).json();
    expect(audit.items.some((i: { action: string }) => i.action === 'catalog.imported')).toBe(true);
  });
});
