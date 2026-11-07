import { createHash, randomUUID } from 'node:crypto';
import type { Database, DatabaseTransaction } from '@marketpilot/database';
import type {
  Identity,
  ProductInput,
  SupplierInput,
  CatalogFormat,
  CatalogRecord,
} from '@marketpilot/contracts';
import { HttpError } from '../auth.js';
import { parseCatalog } from './parser.js';

export const productInclude = {
  supplier: { select: { id: true, name: true, status: true } },
} as const;
export const supplierInclude = { _count: { select: { products: true, imports: true } } } as const;
export const importInclude = {
  supplier: { select: { id: true, name: true } },
  actor: { select: { name: true } },
} as const;
type Store = Database | DatabaseTransaction;
export async function getSupplier(db: Store, workspaceId: string, id: string, active = false) {
  const item = await db.supplier.findFirst({
    where: { id, workspaceId },
    include: supplierInclude,
  });
  if (!item) throw new HttpError(404, 'Fornecedor não encontrado.');
  if (active && item.status !== 'ACTIVE')
    throw new HttpError(409, 'Reative o fornecedor antes de alterar seu catálogo.');
  return item;
}
export async function getProduct(db: Store, workspaceId: string, id: string) {
  const item = await db.product.findFirst({ where: { id, workspaceId }, include: productInclude });
  if (!item) throw new HttpError(404, 'Produto não encontrado.');
  return item;
}
function audit(tx: DatabaseTransaction, identity: Identity, action: string) {
  return tx.auditLog.create({
    data: { workspaceId: identity.workspace.id, actorId: identity.user.id, action },
  });
}
function snapshot(
  tx: DatabaseTransaction,
  workspaceId: string,
  productId: string,
  input: CatalogRecord,
  source: 'MANUAL' | 'CSV' | 'XML',
) {
  return tx.costSnapshot.create({
    data: {
      workspaceId,
      productId,
      costCents: input.costCents,
      stock: input.stock,
      shippingDays: input.shippingDays,
      shippingCostCents: input.shippingCostCents,
      sourceUrl: input.sourceUrl,
      source,
    },
  });
}
export async function createSupplier(db: Database, identity: Identity, input: SupplierInput) {
  return db.$transaction(async (tx) => {
    const item = await tx.supplier.create({
      data: { ...input, workspaceId: identity.workspace.id },
      include: supplierInclude,
    });
    await audit(tx, identity, 'supplier.created');
    return item;
  });
}
export async function updateSupplier(
  db: Database,
  identity: Identity,
  id: string,
  input: SupplierInput,
  version: number,
) {
  return db.$transaction(async (tx) => {
    await getSupplier(tx, identity.workspace.id, id);
    const result = await tx.supplier.updateMany({
      where: { id, workspaceId: identity.workspace.id, version },
      data: { ...input, version: { increment: 1 } },
    });
    if (result.count !== 1)
      throw new HttpError(409, 'O fornecedor foi alterado. Atualize a página e tente novamente.');
    await audit(tx, identity, 'supplier.updated');
    return getSupplier(tx, identity.workspace.id, id);
  });
}
export async function createProduct(db: Database, identity: Identity, input: ProductInput) {
  return db.$transaction(async (tx) => {
    await getSupplier(tx, identity.workspace.id, input.supplierId, true);
    const item = await tx.product.create({
      data: { ...input, workspaceId: identity.workspace.id },
      include: productInclude,
    });
    await snapshot(tx, identity.workspace.id, item.id, input, 'MANUAL');
    await audit(tx, identity, 'product.created');
    return item;
  });
}
export async function updateProduct(
  db: Database,
  identity: Identity,
  id: string,
  input: ProductInput,
  version: number,
) {
  return db.$transaction(async (tx) => {
    const current = await getProduct(tx, identity.workspace.id, id);
    if (input.supplierId !== current.supplierId)
      throw new HttpError(400, 'O fornecedor de um produto já cadastrado não pode ser trocado.');
    await getSupplier(tx, identity.workspace.id, input.supplierId, true);
    const result = await tx.product.updateMany({
      where: { id, workspaceId: identity.workspace.id, version },
      data: { ...input, source: 'MANUAL', version: { increment: 1 } },
    });
    if (result.count !== 1)
      throw new HttpError(409, 'O produto foi alterado. Atualize a página e tente novamente.');
    if (
      ['costCents', 'stock', 'shippingDays', 'shippingCostCents'].some(
        (key) => current[key as keyof typeof current] !== input[key as keyof ProductInput],
      )
    )
      await snapshot(tx, identity.workspace.id, id, input, 'MANUAL');
    await audit(tx, identity, 'product.updated');
    return getProduct(tx, identity.workspace.id, id);
  });
}
export async function archiveRecord(
  db: Database,
  identity: Identity,
  kind: 'supplier' | 'product',
  id: string,
  archived: boolean,
  version: number,
) {
  return db.$transaction(async (tx) => {
    const workspaceId = identity.workspace.id;
    if (kind === 'supplier') await getSupplier(tx, workspaceId, id);
    else {
      const item = await getProduct(tx, workspaceId, id);
      if (!archived) await getSupplier(tx, workspaceId, item.supplierId, true);
    }
    const data = {
      status: archived ? ('ARCHIVED' as const) : ('ACTIVE' as const),
      version: { increment: 1 },
    };
    const where = { id, workspaceId, version };
    const result =
      kind === 'supplier'
        ? await tx.supplier.updateMany({ where, data })
        : await tx.product.updateMany({ where, data });
    if (result.count !== 1)
      throw new HttpError(409, 'O registro foi alterado. Atualize a página e tente novamente.');
    await audit(tx, identity, `${kind}.${archived ? 'archived' : 'restored'}`);
    return kind === 'supplier' ? getSupplier(tx, workspaceId, id) : getProduct(tx, workspaceId, id);
  });
}
export async function importCatalog(
  db: Database,
  identity: Identity,
  input: { supplierId: string; format: CatalogFormat; content: string; fileName: string },
) {
  const preview = parseCatalog(input.format, input.content);
  if (!preview.valid)
    throw new HttpError(400, 'O catálogo contém erros. Corrija todas as linhas antes de importar.');
  const workspaceId = identity.workspace.id;
  const fileHash = createHash('sha256')
    .update(`v1:${input.format}\0${input.content}`)
    .digest('hex');
  const key = {
    workspaceId_supplierId_fileHash: { workspaceId, supplierId: input.supplierId, fileHash },
  };
  try {
    return await db.$transaction(
      async (tx) => {
        await getSupplier(tx, workspaceId, input.supplierId, true);
        const previous = await tx.catalogImport.findUnique({ where: key, include: importInclude });
        if (previous) return { item: previous, duplicate: true };
        let createdCount = 0,
          updatedCount = 0,
          unchangedCount = 0;
        const current = await tx.product.findMany({
          where: {
            workspaceId,
            supplierId: input.supplierId,
            sku: { in: preview.rows.map((row) => row.sku) },
          },
        });
        const bySku = new Map(current.map((product) => [product.sku, product]));
        const newProducts: (CatalogRecord & {
          id: string;
          workspaceId: string;
          supplierId: string;
          source: CatalogFormat;
        })[] = [];
        const snapshots: {
          id: string;
          workspaceId: string;
          productId: string;
          costCents: number;
          stock: number;
          shippingDays: number;
          shippingCostCents: number;
          source: CatalogFormat;
          sourceUrl: string | null;
        }[] = [];
        for (const row of preview.rows) {
          const existing = bySku.get(row.sku);
          if (existing?.status === 'ARCHIVED')
            throw new HttpError(
              409,
              `O SKU ${row.sku} está arquivado. Reative-o antes de importar.`,
            );
          const data = { ...row, workspaceId, supplierId: input.supplierId, source: input.format };
          let productId: string;
          if (!existing) {
            productId = randomUUID();
            newProducts.push({ ...data, id: productId });
            createdCount++;
          } else {
            productId = existing.id;
            const changed = Object.keys(row).some(
              (key) => row[key as keyof CatalogRecord] !== existing[key as keyof CatalogRecord],
            );
            if (!changed) {
              unchangedCount++;
              continue;
            }
            await tx.product.update({
              where: { id: existing.id },
              data: { ...data, version: { increment: 1 } },
            });
            updatedCount++;
            if (
              !['costCents', 'stock', 'shippingDays', 'shippingCostCents'].some(
                (key) => row[key as keyof CatalogRecord] !== existing[key as keyof CatalogRecord],
              )
            )
              continue;
          }
          snapshots.push({
            id: randomUUID(),
            workspaceId,
            productId,
            costCents: row.costCents,
            stock: row.stock,
            shippingDays: row.shippingDays,
            shippingCostCents: row.shippingCostCents,
            source: input.format,
            sourceUrl: row.sourceUrl,
          });
        }
        if (newProducts.length) await tx.product.createMany({ data: newProducts });
        if (snapshots.length) await tx.costSnapshot.createMany({ data: snapshots });
        const item = await tx.catalogImport.create({
          data: {
            workspaceId,
            supplierId: input.supplierId,
            actorId: identity.user.id,
            fileName: input.fileName,
            fileHash,
            format: input.format,
            totalRows: preview.totalRows,
            createdCount,
            updatedCount,
            unchangedCount,
          },
          include: importInclude,
        });
        await audit(tx, identity, 'catalog.imported');
        return { item, duplicate: false };
      },
      { isolationLevel: 'Serializable', maxWait: 10000, timeout: 60000 },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      ['P2002', 'P2034'].includes(String(error.code))
    ) {
      const existing = await db.catalogImport.findUnique({ where: key, include: importInclude });
      if (existing) return { item: existing, duplicate: true };
      throw new HttpError(
        409,
        'O catálogo recebeu outra alteração. Atualize a prévia e tente novamente.',
      );
    }
    throw error;
  }
}
