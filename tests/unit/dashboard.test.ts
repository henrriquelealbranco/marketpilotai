import { describe, it, expect } from 'vitest';
import { buildDashboard } from '../../apps/api/src/dashboard.js';
import { dashboardQuerySchema, type OrderFact } from '../../packages/contracts/src/index.js';

const asOf = new Date('2026-11-07T15:00:00Z');
const orders: OrderFact[] = [
  {
    id: '1',
    date: '2026-11-07T12:00:00Z',
    productId: 'p1',
    product: 'Produto A',
    category: 'Casa',
    quantity: 2,
    revenueCents: 20000,
    costCents: 13000,
    status: 'delivered',
    supplier: 'Fornecedor A',
  },
  {
    id: '2',
    date: '2026-11-05T12:00:00Z',
    productId: 'p2',
    product: 'Produto B',
    category: 'Tech',
    quantity: 1,
    revenueCents: 10000,
    costCents: 8000,
    status: 'shipping',
    supplier: 'Fornecedor B',
  },
  {
    id: '3',
    date: '2026-10-20T12:00:00Z',
    productId: 'p1',
    product: 'Produto A',
    category: 'Casa',
    quantity: 1,
    revenueCents: 3000,
    costCents: 2000,
    status: 'delivered',
    supplier: 'Fornecedor A',
  },
  {
    id: '4',
    date: '2026-11-06T12:00:00Z',
    productId: 'p1',
    product: 'Produto A',
    category: 'Casa',
    quantity: 1,
    revenueCents: 5000,
    costCents: 3000,
    status: 'cancelled',
    supplier: 'Fornecedor A',
  },
  {
    id: '5',
    date: '2026-11-08T12:00:00Z',
    productId: 'p1',
    product: 'Produto A',
    category: 'Casa',
    quantity: 1,
    revenueCents: 5000,
    costCents: 3000,
    status: 'delivered',
    supplier: 'Fornecedor A',
  },
];
describe('dashboard financeiro', () => {
  it('exclui cancelados, datas futuras e fora do período e separa lucro realizado', () => {
    const result = buildDashboard(orders, 7, asOf, 'simulated');
    expect(result.revenueCents).toBe(30000);
    expect(result.estimatedProfitCents).toBe(9000);
    expect(result.realizedProfitCents).toBe(7000);
    expect(result.marginPercent).toBe(30);
    expect(result.orderCount).toBe(2);
    expect(result.chart).toHaveLength(7);
    expect(result.ranking[0]?.units).toBe(2);
    expect(result.source).toBe('simulated');
  });
  it('aplica o filtro de 30 dias sem reaproveitar totais de 7 dias', () => {
    const result = buildDashboard(orders, 30, asOf, 'simulated');
    expect(result.revenueCents).toBe(33000);
    expect(result.realizedProfitCents).toBe(8000);
    expect(result.orderCount).toBe(3);
  });
  it('retorna conta vazia sem NaN nem dados demo', () => {
    const result = buildDashboard([], 7, asOf, 'real');
    expect(result.revenueCents).toBe(0);
    expect(result.marginPercent).toBe(0);
    expect(result.ranking).toEqual([]);
    expect(result.chart.every((p) => p.revenueCents === 0)).toBe(true);
    expect(result.source).toBe('real');
  });
  it('usa os limites do dia de São Paulo para o período', () => {
    const result = buildDashboard(
      [{ ...orders[0]!, date: '2026-11-01T02:59:59Z' }],
      7,
      asOf,
      'real',
    );
    expect(result.orderCount).toBe(0);
  });
  it('rejeita períodos não suportados', () => {
    expect(dashboardQuerySchema.safeParse({ days: '15' }).success).toBe(false);
    expect(dashboardQuerySchema.parse({}).days).toBe(30);
  });
});
