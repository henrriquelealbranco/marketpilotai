import type { Prisma } from '../../../../packages/database/src/generated/client.js';
import type { Database, DatabaseTransaction } from '@marketpilot/database';
import type { Identity, OrderFact } from '@marketpilot/contracts';
import { aggregateOrders, periodStart } from './domain.js';
export function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}
export const audit = (db: Database | DatabaseTransaction, identity: Identity, action: string) =>
  db.auditLog.create({
    data: { workspaceId: identity.workspace.id, actorId: identity.user.id, action },
  });
export const event = (
  db: Database | DatabaseTransaction,
  workspaceId: string,
  origin: string,
  category: string,
  message: string,
  detail?: unknown,
) =>
  db.operationEvent.create({
    data: {
      workspaceId,
      origin,
      category,
      message,
      ...(detail === undefined ? {} : { detailJson: json(detail) }),
    },
  });
export async function analytics(db: Database, workspaceId: string, days = 30) {
  const asOf = new Date(),
    start = periodStart(days, asOf);
  const orders = await db.marketplaceOrder.findMany({
    where: { workspaceId, orderedAt: { gte: start, lte: asOf } },
    orderBy: { orderedAt: 'desc' },
    take: 10000,
  });
  const result = aggregateOrders(orders);
  const runs = await db.agentRun.findMany({
    where: { workspaceId, createdAt: { gte: start } },
    select: {
      provider: true,
      inputTokens: true,
      outputTokens: true,
      estimatedCostMicrosUsd: true,
      status: true,
    },
  });
  const [products, suppliers, workflowExecutions, failures] = await db.$transaction([
    db.product.count({ where: { workspaceId, status: 'ACTIVE' } }),
    db.supplier.count({ where: { workspaceId, status: 'ACTIVE' } }),
    db.workflowExecution.count({ where: { workspaceId, createdAt: { gte: start } } }),
    db.workflowExecution.count({
      where: { workspaceId, status: 'FAILED', createdAt: { gte: start } },
    }),
  ]);
  return {
    ...result,
    source: 'real' as const,
    days,
    asOf: asOf.toISOString(),
    products,
    supplierCount: suppliers,
    workflowExecutions,
    workflowFailures: failures,
    orders,
    ai: {
      runs: runs.length,
      inputTokens: runs.reduce((n, r) => n + r.inputTokens, 0),
      outputTokens: runs.reduce((n, r) => n + r.outputTokens, 0),
      knownCostMicrosUsd: runs.reduce((n, r) => n + (r.estimatedCostMicrosUsd ?? 0), 0),
      unknownCostRuns: runs.filter(
        (r) => r.provider === 'openai' && r.estimatedCostMicrosUsd === null,
      ).length,
    },
  };
}
export async function orderFacts(db: Database, workspaceId: string): Promise<OrderFact[]> {
  const rows = await db.marketplaceOrder.findMany({
    where: { workspaceId, orderedAt: { gte: new Date(Date.now() - 91 * 86400000) } },
    orderBy: { orderedAt: 'desc' },
    take: 10000,
  });
  return rows.map((row) => ({
    id: row.id,
    date: row.orderedAt.toISOString(),
    productId: row.productId ?? row.id,
    product: row.productName,
    category: row.category,
    quantity: row.quantity,
    revenueCents: row.amountCents,
    costCents: row.costCents,
    costsKnown: !row.source.endsWith('COST_INCOMPLETE'),
    status:
      row.status === 'cancelled'
        ? 'cancelled'
        : row.status === 'delivered' && row.costsConfirmed
          ? 'delivered'
          : row.status === 'shipping'
            ? 'shipping'
            : 'processing',
    supplier: row.supplierName,
  }));
}
export async function contextSnapshot(db: Database, workspaceId: string, productId?: string) {
  const products = await db.product.findMany({
    where: { workspaceId, status: 'ACTIVE', ...(productId ? { id: productId } : {}) },
    include: {
      supplier: { select: { name: true, rating: true, status: true } },
      quotes: { orderBy: { createdAt: 'desc' }, take: 1 },
      history: { orderBy: { createdAt: 'desc' }, take: 2 },
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });
  const stats = await analytics(db, workspaceId, 30);
  const observations = await db.marketObservation.findMany({
    where: { workspaceId, ...(productId ? { productId } : {}) },
    orderBy: { observedAt: 'desc' },
    take: 100,
  });
  return {
    observations: observations.map((o) => ({
      productId: o.productId,
      title: o.title,
      priceCents: o.priceCents,
      attributes: o.attributesJson,
      observedAt: o.observedAt.toISOString(),
      source: new URL(o.sourceUrl).origin,
    })),
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      createdAt: p.createdAt.toISOString(),
      costChangeCents: p.history.length > 1 ? p.history[0]!.costCents - p.history[1]!.costCents : 0,
      category: p.category,
      costCents: p.costCents,
      shippingCostCents: p.shippingCostCents,
      shippingDays: p.shippingDays,
      stock: p.stock,
      updatedAt: p.updatedAt.toISOString(),
      hasSource: !!p.sourceUrl,
      supplier: p.supplier,
      latestQuote: p.quotes[0]
        ? {
            input: p.quotes[0].inputJson,
            result: p.quotes[0].resultJson,
            createdAt: p.quotes[0].createdAt.toISOString(),
          }
        : null,
    })),
    metrics: {
      unknownCostOrders: stats.unknownCostOrders,
      revenueCents: stats.revenueCents,
      estimatedProfitCents: stats.estimatedProfitCents,
      realizedProfitCents: stats.realizedProfitCents,
      orders: stats.orderCount,
      activeProducts: stats.products,
      suppliers: stats.supplierCount,
    },
    asOf: new Date().toISOString(),
    unknownSignals: [
      'Demanda e volume de vendas do mercado não informados',
      'Concorrência não verificada automaticamente',
    ],
  };
}
export async function alert(
  db: Database,
  workspaceId: string,
  key: string,
  severity: string,
  title: string,
  message: string,
  link: string,
) {
  return db.alert.upsert({
    where: { workspaceId_key: { workspaceId, key } },
    create: { workspaceId, key, severity, title, message, link },
    update: { severity, title, message, link, status: 'OPEN' },
  });
}
