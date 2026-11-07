import { describe, it, expect } from 'vitest';
import {
  canonicalHash,
  periodStart,
  aggregateOrders,
  sanitizeCsvCell,
} from '../../apps/api/src/operations/domain.js';
describe('domínio operacional', () => {
  it('alinha relatórios ao dia comercial de São Paulo, incluindo virada de mês', () => {
    expect(periodStart(1, new Date('2026-11-08T01:00:00Z')).toISOString()).toBe(
      '2026-11-07T03:00:00.000Z',
    );
    expect(periodStart(7, new Date('2026-11-03T18:00:00Z')).toISOString()).toBe(
      '2026-10-28T03:00:00.000Z',
    );
  });
  it('vincula aprovação ao conteúdo sem depender da ordem das chaves JSON', () => {
    expect(canonicalHash({ b: 2, a: { x: 1, y: 3 } })).toBe(
      canonicalHash({ a: { y: 3, x: 1 }, b: 2 }),
    );
    expect(canonicalHash({ price: 100 })).not.toBe(canonicalHash({ price: 101 }));
  });
  it('separa resultado realizado e estimado e ignora cancelados', () => {
    const result = aggregateOrders([
      {
        amountCents: 10000,
        costCents: 7000,
        status: 'delivered',
        costsConfirmed: true,
        category: 'Casa',
        supplierName: 'A',
      },
      {
        amountCents: 5000,
        costCents: 4000,
        status: 'shipping',
        costsConfirmed: false,
        category: 'Casa',
        supplierName: 'A',
      },
      {
        amountCents: 9000,
        costCents: 2000,
        status: 'cancelled',
        costsConfirmed: true,
        category: 'Tech',
        supplierName: 'B',
      },
    ]);
    expect(result.revenueCents).toBe(15000);
    expect(result.estimatedProfitCents).toBe(4000);
    expect(result.realizedProfitCents).toBe(3000);
    expect(result.orderCount).toBe(2);
  });
  it('protege exportações CSV contra execução de fórmulas', () => {
    expect(sanitizeCsvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(sanitizeCsvCell('Produto; simples')).toBe('"Produto; simples"');
  });
  it('não interpreta custo ausente como lucro de 100%', () => {
    const result = aggregateOrders([
      {
        amountCents: 10000,
        costCents: 0,
        status: 'delivered',
        costsConfirmed: false,
        source: 'MERCADOLIVRE_COST_INCOMPLETE',
        category: 'Casa',
        supplierName: 'Não vinculado',
      },
    ]);
    expect(result.revenueCents).toBe(10000);
    expect(result.estimatedProfitCents).toBe(0);
    expect(result.realizedProfitCents).toBe(0);
    expect(result.categories[0]?.profitCents).toBe(0);
    expect(result.unknownCostOrders).toBe(1);
  });
});
