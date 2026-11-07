import { createHash } from 'node:crypto';
export function periodStart(days: number, asOf: Date): Date {
  const key = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(asOf);
  const nominal = new Date(`${key}T00:00:00Z`);
  nominal.setUTCDate(nominal.getUTCDate() - days + 1);
  const zone = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    timeZoneName: 'longOffset',
  })
    .formatToParts(nominal)
    .find((part) => part.type === 'timeZoneName')?.value;
  const offset = zone?.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!offset) throw new Error('Fuso horário indisponível.');
  const minutes = (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === '-' ? -1 : 1);
  return new Date(nominal.getTime() - minutes * 60000);
}
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(
          (key) => JSON.stringify(key) + ':' + stableJson((value as Record<string, unknown>)[key]),
        )
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'null';
}
export function canonicalHash(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}
export function sanitizeCsvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function aggregateOrders(
  orders: {
    amountCents: number;
    costCents: number;
    status: string;
    costsConfirmed: boolean;
    category: string;
    supplierName: string;
    source?: string;
  }[],
) {
  const valid = orders.filter((o) => o.status !== 'cancelled');
  const known = valid.filter((o) => !o.source?.endsWith('COST_INCOMPLETE'));
  const revenueCents = valid.reduce((n, o) => n + o.amountCents, 0);
  const estimatedProfitCents = known.reduce((n, o) => n + o.amountCents - o.costCents, 0);
  const realizedProfitCents = known
    .filter((o) => o.status === 'delivered' && o.costsConfirmed)
    .reduce((n, o) => n + o.amountCents - o.costCents, 0);
  const group = (key: 'category' | 'supplierName') => {
    const map = new Map<
      string,
      { name: string; revenueCents: number; profitCents: number; orders: number }
    >();
    for (const o of valid) {
      const row = map.get(o[key]) ?? { name: o[key], revenueCents: 0, profitCents: 0, orders: 0 };
      row.revenueCents += o.amountCents;
      row.profitCents += o.source?.endsWith('COST_INCOMPLETE') ? 0 : o.amountCents - o.costCents;
      row.orders++;
      map.set(o[key], row);
    }
    return [...map.values()].sort((a, b) => b.revenueCents - a.revenueCents);
  };
  return {
    revenueCents,
    estimatedProfitCents,
    realizedProfitCents,
    unknownCostOrders: valid.length - known.length,
    orderCount: valid.length,
    marginPercent: known.reduce((n, o) => n + o.amountCents, 0)
      ? Math.round((estimatedProfitCents / known.reduce((n, o) => n + o.amountCents, 0)) * 1000) /
        10
      : 0,
    categories: group('category'),
    suppliers: group('supplierName'),
  };
}
