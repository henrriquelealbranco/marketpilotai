import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Database } from '@marketpilot/database';
import {
  supplierInputSchema,
  supplierUpdateSchema,
  productInputSchema,
  productUpdateSchema,
  catalogListSchema,
  catalogUploadSchema,
  archiveSchema,
} from '@marketpilot/contracts';
import { HttpError, requireIdentity } from '../auth.js';
import { parseCatalog } from './parser.js';
import {
  archiveRecord,
  createProduct,
  createSupplier,
  getProduct,
  getSupplier,
  importCatalog,
  productInclude,
  supplierInclude,
  importInclude,
  updateProduct,
  updateSupplier,
} from './service.js';

export async function registerCatalogRoutes(app: FastifyInstance, db: Database) {
  const schema = (summary: string) => ({ tags: ['Catalog'], security: [{ session: [] }], summary });
  const body = (input: z.ZodType) => ({
    ...z.toJSONSchema(input, { target: 'draft-7', io: 'input', unrepresentable: 'any' }),
    additionalProperties: true,
  });
  const id = (request: FastifyRequest) => z.object({ id: z.uuid() }).parse(request.params).id;
  async function writer(request: FastifyRequest) {
    const identity = await requireIdentity(db, request);
    if (identity.user.role === 'VIEWER')
      throw new HttpError(403, 'Seu perfil permite apenas consultar o catálogo.');
    return identity;
  }
  app.get(
    '/v1/suppliers',
    { schema: schema('Listar fornecedores com busca, status e paginação') },
    async (request) => {
      const { workspace } = await requireIdentity(db, request);
      const query = catalogListSchema.parse(request.query);
      const where = {
        workspaceId: workspace.id,
        ...(query.status === 'ALL' ? {} : { status: query.status }),
        ...(query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: 'insensitive' as const } },
                { cnpj: { contains: query.q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };
      const [items, total] = await db.$transaction([
        db.supplier.findMany({
          where,
          include: supplierInclude,
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        db.supplier.count({ where }),
      ]);
      return { items, total, page: query.page, pageSize: query.pageSize };
    },
  );
  app.get(
    '/v1/suppliers/:id',
    { schema: schema('Consultar fornecedor do workspace') },
    async (request) => {
      const { workspace } = await requireIdentity(db, request);
      return getSupplier(db, workspace.id, id(request));
    },
  );
  app.post(
    '/v1/suppliers',
    {
      schema: {
        ...schema('Cadastrar fornecedor; não consulta serviços externos'),
        body: body(supplierInputSchema),
      },
    },
    async (request, reply) => {
      const identity = await writer(request);
      const item = await createSupplier(db, identity, supplierInputSchema.parse(request.body));
      reply.status(201);
      return item;
    },
  );
  app.put(
    '/v1/suppliers/:id',
    {
      schema: {
        ...schema('Atualizar fornecedor com controle de versão'),
        body: body(supplierUpdateSchema),
      },
    },
    async (request) => {
      const identity = await writer(request);
      const { version, ...input } = supplierUpdateSchema.parse(request.body);
      return updateSupplier(db, identity, id(request), input, version);
    },
  );
  app.patch(
    '/v1/suppliers/:id/archive',
    { schema: { ...schema('Arquivar ou reativar fornecedor'), body: body(archiveSchema) } },
    async (request) => {
      const identity = await writer(request);
      const input = archiveSchema.parse(request.body);
      return archiveRecord(db, identity, 'supplier', id(request), input.archived, input.version);
    },
  );
  app.get(
    '/v1/products',
    { schema: schema('Listar produtos por busca, fornecedor, status e página') },
    async (request) => {
      const { workspace } = await requireIdentity(db, request);
      const query = catalogListSchema.parse(request.query);
      const where = {
        workspaceId: workspace.id,
        ...(query.status === 'ALL' ? {} : { status: query.status }),
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        ...(query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: 'insensitive' as const } },
                { sku: { contains: query.q, mode: 'insensitive' as const } },
                { category: { contains: query.q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };
      const [items, total] = await db.$transaction([
        db.product.findMany({
          where,
          include: productInclude,
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        db.product.count({ where }),
      ]);
      return { items, total, page: query.page, pageSize: query.pageSize };
    },
  );
  app.get(
    '/v1/products/:id',
    { schema: schema('Consultar produto com últimos 100 snapshots de custo e estoque') },
    async (request) => {
      const { workspace } = await requireIdentity(db, request);
      const item = await getProduct(db, workspace.id, id(request));
      const history = await db.costSnapshot.findMany({
        where: { workspaceId: workspace.id, productId: item.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
      });
      return { ...item, history };
    },
  );
  app.post(
    '/v1/products',
    {
      schema: { ...schema('Cadastrar produto e snapshot inicial'), body: body(productInputSchema) },
    },
    async (request, reply) => {
      const identity = await writer(request);
      const item = await createProduct(db, identity, productInputSchema.parse(request.body));
      reply.status(201);
      return item;
    },
  );
  app.put(
    '/v1/products/:id',
    {
      schema: {
        ...schema('Atualizar produto e registrar alterações de custo/estoque'),
        body: body(productUpdateSchema),
      },
    },
    async (request) => {
      const identity = await writer(request);
      const { version, ...input } = productUpdateSchema.parse(request.body);
      return updateProduct(db, identity, id(request), input, version);
    },
  );
  app.patch(
    '/v1/products/:id/archive',
    {
      schema: {
        ...schema('Arquivar ou reativar produto preservando histórico'),
        body: body(archiveSchema),
      },
    },
    async (request) => {
      const identity = await writer(request);
      const input = archiveSchema.parse(request.body);
      return archiveRecord(db, identity, 'product', id(request), input.archived, input.version);
    },
  );
  const uploadOptions = {
    bodyLimit: 2100000,
    schema: {
      ...schema('Validar prévia de catálogo CSV/XML autorizado'),
      body: {
        type: 'object',
        required: ['format', 'content', 'fileName', 'supplierId', 'authorized'],
        properties: {
          format: { type: 'string', enum: ['CSV', 'XML'] },
          content: { type: 'string', maxLength: 524288 },
          fileName: { type: 'string', maxLength: 160 },
          supplierId: { type: 'string', format: 'uuid' },
          authorized: { type: 'boolean', const: true },
        },
      },
    },
  };
  app.post('/v1/catalog/preview', uploadOptions, async (request) => {
    const identity = await writer(request);
    const input = catalogUploadSchema.parse(request.body);
    await getSupplier(db, identity.workspace.id, input.supplierId, true);
    return parseCatalog(input.format, input.content);
  });
  app.post(
    '/v1/demo/catalog/preview',
    {
      ...uploadOptions,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        ...uploadOptions.schema,
        security: [],
        summary: 'Validar catálogo demonstrativo sem persistência',
      },
    },
    async (request) => {
      const input = catalogUploadSchema.parse(request.body);
      return parseCatalog(input.format, input.content);
    },
  );
  app.post(
    '/v1/catalog/import',
    {
      ...uploadOptions,
      schema: {
        ...uploadOptions.schema,
        summary: 'Importar lote válido de forma atômica e idempotente',
      },
    },
    async (request, reply) => {
      const identity = await writer(request);
      const input = catalogUploadSchema.parse(request.body);
      const result = await importCatalog(db, identity, input);
      reply.status(result.duplicate ? 200 : 201);
      return result;
    },
  );
  app.get(
    '/v1/catalog/imports',
    { schema: schema('Histórico de importações autorizadas') },
    async (request) => {
      const { workspace } = await requireIdentity(db, request);
      const query = catalogListSchema.parse(request.query);
      const where = {
        workspaceId: workspace.id,
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      };
      const [items, total] = await db.$transaction([
        db.catalogImport.findMany({
          where,
          include: importInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        db.catalogImport.count({ where }),
      ]);
      return { items, total, page: query.page, pageSize: query.pageSize };
    },
  );
  app.get(
    '/v1/catalog/summary',
    { schema: schema('Indicadores reais de catálogo do workspace') },
    async (request) => {
      const { workspace } = await requireIdentity(db, request);
      const [activeProducts, archivedProducts, suppliers, outOfStock, imports] =
        await db.$transaction([
          db.product.count({ where: { workspaceId: workspace.id, status: 'ACTIVE' } }),
          db.product.count({ where: { workspaceId: workspace.id, status: 'ARCHIVED' } }),
          db.supplier.count({ where: { workspaceId: workspace.id, status: 'ACTIVE' } }),
          db.product.count({ where: { workspaceId: workspace.id, status: 'ACTIVE', stock: 0 } }),
          db.catalogImport.count({ where: { workspaceId: workspace.id } }),
        ]);
      return { activeProducts, archivedProducts, suppliers, outOfStock, imports };
    },
  );
}
