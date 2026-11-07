import type { Dashboard, DataSource, OrderFact, Period } from '@marketpilot/contracts';

function businessDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
export function buildDashboard(
  orders: OrderFact[],
  days: Period,
  asOf: Date,
  source: DataSource,
): Dashboard {
  const end = new Date(`${businessDate(asOf)}T00:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const startKey = start.toISOString().slice(0, 10);
  const filtered = orders.filter(
    (o) =>
      o.status !== 'cancelled' &&
      new Date(o.date) <= asOf &&
      businessDate(new Date(o.date)) >= startKey,
  );
  const chart: Dashboard['chart'] = Array.from({ length: days }, (_, i) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + i);
    return { date: date.toISOString().slice(0, 10), revenueCents: 0, profitCents: 0 };
  });
  const byDate = new Map(chart.map((p) => [p.date, p]));
  const products = new Map<string, Dashboard['ranking'][number]>();
  let revenueCents = 0,
    estimatedProfitCents = 0,
    realizedProfitCents = 0;
  for (const order of filtered) {
    const profit = order.costsKnown === false ? 0 : order.revenueCents - order.costCents;
    revenueCents += order.revenueCents;
    estimatedProfitCents += profit;
    if (order.status === 'delivered') realizedProfitCents += profit;
    const point = byDate.get(businessDate(new Date(order.date)));
    if (point) {
      point.revenueCents += order.revenueCents;
      point.profitCents += profit;
    }
    const product = products.get(order.productId) ?? {
      id: order.productId,
      name: order.product,
      category: order.category,
      supplier: order.supplier,
      units: 0,
      revenueCents: 0,
      profitCents: 0,
      marginPercent: 0,
    };
    product.units += order.quantity;
    product.revenueCents += order.revenueCents;
    product.profitCents += profit;
    product.marginPercent = product.revenueCents
      ? Number(((product.profitCents / product.revenueCents) * 100).toFixed(1))
      : 0;
    products.set(order.productId, product);
  }
  return {
    unknownCostOrders: filtered.filter((order) => order.costsKnown === false).length,
    source,
    asOf: asOf.toISOString(),
    days,
    revenueCents,
    estimatedProfitCents,
    realizedProfitCents,
    marginPercent: revenueCents
      ? Number(((estimatedProfitCents / revenueCents) * 100).toFixed(1))
      : 0,
    orderCount: filtered.length,
    chart,
    ranking: [...products.values()].sort((a, b) => b.revenueCents - a.revenueCents).slice(0, 5),
    recentOrders: [...filtered].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8),
  };
}
