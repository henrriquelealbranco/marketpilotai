import { describe, expect, it } from 'vitest';
import {
  calculatePricing,
  pricingInputSchema,
  scoreOpportunity,
  type PricingInput,
} from '../../packages/contracts/src/pricing.js';
import { parsePricingDecimal } from '../../apps/web/src/components/pricing/form.js';

const input: PricingInput = {
  supplierCostCents: 7000,
  shippingCostCents: 1000,
  packagingCostCents: 300,
  fixedFeeCents: 500,
  operatingCostCents: 200,
  commissionBps: 1200,
  taxBps: 600,
  advertisingBps: 500,
  returnsBps: 200,
  targetMarginBps: 2500,
  minimumMarginBps: 1000,
};

describe('valores decimais do formulário', () => {
  it('converte moeda e percentuais em inteiros sem ponto flutuante', () => {
    expect(parsePricingDecimal('0,29')).toBe(29);
    expect(parsePricingDecimal('19.99')).toBe(1999);
    expect(parsePricingDecimal('12,5')).toBe(1250);
    expect(parsePricingDecimal('999999,99')).toBe(99999999);
    expect(parsePricingDecimal(' 0 ')).toBe(0);
  });

  it('recusa vazio, sinais, notação científica e precisão não suportada', () => {
    for (const invalid of ['', '-1', '1e3', '12,345', '1.000,00', 'NaN', '1..2'])
      expect(parsePricingDecimal(invalid)).toBeNull();
  });
});

describe('precificação determinística', () => {
  it('compõe custos e calcula lucro, margem e ROI com valores independentes', () => {
    // R$ 90 fixos; 25% variáveis; 25% alvo: 90 / 0,5 = R$ 180.
    const result = calculatePricing(input);
    expect(result).toMatchObject({
      fixedCostCents: 9000,
      totalRateBps: 2500,
      minimumPriceCents: 12000,
      breakEvenPriceCents: 12000,
      minimumMarginPriceCents: 13847,
      recommendedPriceCents: 18000,
      evaluatedPriceCents: 18000,
      variableCostCents: 4500,
      totalCostCents: 13500,
      estimatedProfitCents: 4500,
      marginBps: 2500,
      roiBps: 3333,
      blocked: false,
      blockReasons: [],
    });
  });

  it('avalia cenários -10%, base e +10% sobre o preço avaliado', () => {
    expect(calculatePricing(input).scenarios).toEqual([
      {
        adjustmentBps: -1000,
        priceCents: 16200,
        variableCostCents: 4050,
        totalCostCents: 13050,
        estimatedProfitCents: 3150,
        marginBps: 1944,
        roiBps: 2413,
        blocked: false,
      },
      {
        adjustmentBps: 0,
        priceCents: 18000,
        variableCostCents: 4500,
        totalCostCents: 13500,
        estimatedProfitCents: 4500,
        marginBps: 2500,
        roiBps: 3333,
        blocked: false,
      },
      {
        adjustmentBps: 1000,
        priceCents: 19800,
        variableCostCents: 4950,
        totalCostCents: 13950,
        estimatedProfitCents: 5850,
        marginBps: 2954,
        roiBps: 4193,
        blocked: false,
      },
    ]);
  });

  it('arredonda custos para cima e não promete margem que um centavo remove', () => {
    const result = calculatePricing({
      ...input,
      supplierCostCents: 1,
      shippingCostCents: 0,
      packagingCostCents: 0,
      fixedFeeCents: 0,
      operatingCostCents: 0,
      commissionBps: 1,
      taxBps: 0,
      advertisingBps: 0,
      returnsBps: 0,
      targetMarginBps: 1,
      minimumMarginBps: 0,
    });
    expect(result.minimumPriceCents).toBe(2);
    expect(result.recommendedPriceCents).toBe(3);
    expect(result.estimatedProfitCents).toBe(1);
    expect(result.marginBps).toBe(3333);
  });

  it.each([
    ['supplierCostCents', -1],
    ['shippingCostCents', -1],
    ['packagingCostCents', -1],
    ['fixedFeeCents', -1],
    ['operatingCostCents', -1],
    ['commissionBps', -1],
    ['taxBps', -1],
    ['advertisingBps', -1],
    ['returnsBps', -1],
    ['targetMarginBps', -1],
    ['minimumMarginBps', -1],
    ['supplierCostCents', 1.5],
    ['commissionBps', 1.5],
    ['supplierCostCents', Number.MAX_SAFE_INTEGER],
    ['salePriceCents', 0],
    ['salePriceCents', Number.POSITIVE_INFINITY],
    ['salePriceCents', 100000000],
  ])('recusa entrada inválida em %s (%s)', (field, value) => {
    expect(pricingInputSchema.safeParse({ ...input, [field]: value }).success).toBe(false);
    expect(() => calculatePricing({ ...input, [field]: value })).toThrow();
  });

  it('recusa margem mínima acima do alvo e campos desconhecidos', () => {
    expect(pricingInputSchema.safeParse({ ...input, minimumMarginBps: 2600 }).success).toBe(false);
    expect(pricingInputSchema.safeParse({ ...input, officialFee: 1200 }).success).toBe(false);
  });

  it.each([10000, 11000])('bloqueia taxas somadas de %s bps sem dividir por zero', (sum) => {
    const result = calculatePricing({
      ...input,
      commissionBps: 5000,
      taxBps: sum - 5000,
      advertisingBps: 0,
      returnsBps: 0,
    });
    expect(result.blocked).toBe(true);
    expect(result.blockReasons).toContain('RATES_EXHAUST_REVENUE');
    expect(result.minimumPriceCents).toBeNull();
    expect(result.recommendedPriceCents).toBeNull();
    expect(result.marginBps).toBeNull();
    expect(result.scenarios).toEqual([]);
  });

  it('bloqueia alvo inviável mesmo se ainda houver preço de equilíbrio', () => {
    const result = calculatePricing({ ...input, targetMarginBps: 7500 });
    expect(result.minimumPriceCents).toBe(12000);
    expect(result.recommendedPriceCents).toBeNull();
    expect(result.blocked).toBe(true);
    expect(result.blockReasons).toContain('TARGET_MARGIN_UNREACHABLE');
  });

  it('bloqueia preço sem lucro e preço abaixo da margem mínima', () => {
    const atBreakEven = calculatePricing({ ...input, salePriceCents: 12000 });
    expect(atBreakEven.estimatedProfitCents).toBe(0);
    expect(atBreakEven.blockReasons).toContain('NO_PROFIT');
    expect(atBreakEven.blocked).toBe(true);
    const insufficient = calculatePricing({ ...input, salePriceCents: 13000 });
    expect(insufficient.estimatedProfitCents).toBe(750);
    expect(insufficient.marginBps).toBe(576);
    expect(insufficient.blockReasons).toContain('BELOW_MINIMUM_MARGIN');
    expect(insufficient.blocked).toBe(true);
    expect(insufficient.scenarios[2]).toMatchObject({
      priceCents: 14300,
      estimatedProfitCents: 1725,
      marginBps: 1206,
      blocked: false,
    });
  });

  it('arredonda prejuízo para baixo em vez de esconder perdas fracionárias', () => {
    const result = calculatePricing({ ...input, salePriceCents: 10001 });
    expect(result.variableCostCents).toBe(2501);
    expect(result.estimatedProfitCents).toBe(-1500);
    expect(result.marginBps).toBe(-1500);
    expect(result.roiBps).toBe(-1305);
  });

  it('mantém monotonicidade ao aumentar cada custo, taxa ou margem alvo', () => {
    for (const field of [
      'supplierCostCents',
      'shippingCostCents',
      'packagingCostCents',
      'fixedFeeCents',
      'operatingCostCents',
      'commissionBps',
      'taxBps',
      'advertisingBps',
      'returnsBps',
      'targetMarginBps',
    ] as const) {
      expect(
        calculatePricing({ ...input, [field]: input[field] + 100 }).recommendedPriceCents,
      ).toBeGreaterThanOrEqual(18000);
    }
  });

  it('preserva inteiros seguros no maior custo aceito e denominador de um bps', () => {
    const result = calculatePricing({
      ...input,
      supplierCostCents: 99999999,
      shippingCostCents: 99999999,
      packagingCostCents: 99999999,
      fixedFeeCents: 99999999,
      operatingCostCents: 99999999,
      commissionBps: 0,
      taxBps: 0,
      advertisingBps: 0,
      returnsBps: 0,
      targetMarginBps: 9999,
    });
    expect(result.recommendedPriceCents).toBe(4999999950000);
    expect(Number.isSafeInteger(result.recommendedPriceCents)).toBe(true);
    expect(result.marginBps).toBe(9999);
  });
});

describe('oportunidades com evidências operacionais', () => {
  const evidence = {
    marginBps: 2500,
    minimumMarginBps: 1000,
    stock: 50,
    shippingDays: 2,
    catalogQualityBps: 10000,
    supplierRating: 5,
  };

  it('pontua evidências conhecidas e identifica demanda e concorrência desconhecidas', () => {
    const result = scoreOpportunity(evidence);
    expect(result).toMatchObject({
      score: 94,
      eligible: true,
      evidenceCoverageBps: 10000,
      market: { competitionBps: null, demandBps: null },
      unknownSignals: ['competition', 'demand'],
    });
  });

  it('não trata rating desconhecido como avaliação zero e declara cobertura parcial', () => {
    const result = scoreOpportunity({ ...evidence, supplierRating: null });
    expect(result.score).toBe(93);
    expect(result.evidenceCoverageBps).toBe(9000);
    expect(result.unknownSignals).toContain('supplierRating');
  });

  it('impede elegibilidade sem estoque ou margem mínima', () => {
    expect(scoreOpportunity({ ...evidence, stock: 0 }).eligible).toBe(false);
    expect(scoreOpportunity({ ...evidence, marginBps: 500 }).eligible).toBe(false);
    expect(scoreOpportunity({ ...evidence, marginBps: null }).eligible).toBe(false);
  });
  it('considera pressão competitiva somente quando declarada por uma fonte observada', () => {
    expect(scoreOpportunity({ ...evidence, competitionBps: 10000 }).score).toBeLessThan(
      scoreOpportunity({ ...evidence, competitionBps: 0 }).score,
    );
    expect(scoreOpportunity(evidence).market.competitionBps).toBeNull();
  });

  it('recebe prejuízo extremo calculável sem quebrar a triagem operacional', () => {
    const quote = calculatePricing({ ...input, salePriceCents: 1 });
    expect(quote.marginBps).toBe(-90000000);
    expect(scoreOpportunity({ ...evidence, marginBps: quote.marginBps }).eligible).toBe(false);
  });

  it('não melhora score com menos margem, estoque, qualidade ou maior prazo', () => {
    for (const change of [
      { marginBps: 1500 },
      { stock: 3 },
      { shippingDays: 8 },
      { catalogQualityBps: 3000 },
      { supplierRating: 2 },
    ])
      expect(scoreOpportunity({ ...evidence, ...change }).score).toBeLessThan(94);
  });

  it('valida evidências em vez de absorver números negativos ou rating impossível', () => {
    expect(() => scoreOpportunity({ ...evidence, stock: -1 })).toThrow();
    expect(() => scoreOpportunity({ ...evidence, supplierRating: 6 })).toThrow();
    expect(() => scoreOpportunity({ ...evidence, catalogQualityBps: 10001 })).toThrow();
  });
});
