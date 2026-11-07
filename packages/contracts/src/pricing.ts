import { z } from 'zod';

const cents = z.number().int().min(0).max(99_999_999);
const basisPoints = z.number().int().min(0).max(10_000);
const BPS = 10_000n;

/** All percentages are operator assumptions. No marketplace tariff is implicit. */
export const pricingInputSchema = z
  .object({
    supplierCostCents: cents.min(1),
    shippingCostCents: cents,
    packagingCostCents: cents,
    fixedFeeCents: cents,
    operatingCostCents: cents,
    commissionBps: basisPoints,
    taxBps: basisPoints,
    advertisingBps: basisPoints,
    returnsBps: basisPoints,
    targetMarginBps: basisPoints.max(9_999),
    minimumMarginBps: basisPoints.max(9_999),
    salePriceCents: cents.min(1).optional(),
  })
  .strict()
  .refine((input) => input.minimumMarginBps <= input.targetMarginBps, {
    path: ['minimumMarginBps'],
    message: 'A margem mínima deve ser menor ou igual à margem alvo.',
  });

export type PricingInput = z.infer<typeof pricingInputSchema>;
export type PricingBlockReason =
  'RATES_EXHAUST_REVENUE' | 'TARGET_MARGIN_UNREACHABLE' | 'NO_PROFIT' | 'BELOW_MINIMUM_MARGIN';

export interface PricingScenario {
  adjustmentBps: -1000 | 0 | 1000;
  priceCents: number;
  variableCostCents: number;
  totalCostCents: number;
  estimatedProfitCents: number;
  marginBps: number;
  roiBps: number;
  blocked: boolean;
}

export interface PricingResult {
  fixedCostCents: number;
  totalRateBps: number;
  minimumPriceCents: number | null;
  breakEvenPriceCents: number | null;
  minimumMarginPriceCents: number | null;
  recommendedPriceCents: number | null;
  evaluatedPriceCents: number | null;
  variableCostCents: number | null;
  totalCostCents: number | null;
  estimatedProfitCents: number | null;
  marginBps: number | null;
  roiBps: number | null;
  blocked: boolean;
  blockReasons: PricingBlockReason[];
  scenarios: PricingScenario[];
}

const ceilDivide = (numerator: bigint, denominator: bigint) =>
  (numerator + denominator - 1n) / denominator;
const floorDivide = (numerator: bigint, denominator: bigint) =>
  numerator < 0n ? -ceilDivide(-numerator, denominator) : numerator / denominator;

function priceForMargin(fixed: bigint, rates: bigint, margin: bigint): number | null {
  const remaining = BPS - rates - margin;
  if (remaining <= 0n) return null;
  let price = ceilDivide(fixed * BPS, remaining);
  // Aggregate variable costs round up to a cent. Adjust the algebraic lower
  // bound until that rounding also preserves the requested margin.
  while (price - fixed - ceilDivide(price * rates, BPS) < ceilDivide(price * margin, BPS))
    price += 1n;
  return Number(price);
}

/** Pure, deterministic calculation shared by the browser and the API. */
export function calculatePricing(rawInput: PricingInput): PricingResult {
  const input = pricingInputSchema.parse(rawInput);
  const fixedCostCents =
    input.supplierCostCents +
    input.shippingCostCents +
    input.packagingCostCents +
    input.fixedFeeCents +
    input.operatingCostCents;
  const totalRateBps = input.commissionBps + input.taxBps + input.advertisingBps + input.returnsBps;
  const fixed = BigInt(fixedCostCents);
  const rates = BigInt(totalRateBps);
  const minimumPriceCents = priceForMargin(fixed, rates, 0n);
  const recommendedPriceCents = priceForMargin(fixed, rates, BigInt(input.targetMarginBps));
  const minimumMarginPriceCents = priceForMargin(fixed, rates, BigInt(input.minimumMarginBps));
  const evaluatedPriceCents = input.salePriceCents ?? recommendedPriceCents;
  const blockReasons: PricingBlockReason[] = [];
  if (totalRateBps >= 10_000) blockReasons.push('RATES_EXHAUST_REVENUE');
  if (recommendedPriceCents === null) blockReasons.push('TARGET_MARGIN_UNREACHABLE');

  function evaluate(priceCents: number, adjustmentBps: PricingScenario['adjustmentBps']) {
    const price = BigInt(priceCents);
    const variable = ceilDivide(price * rates, BPS);
    const cost = fixed + variable;
    const profit = price - cost;
    const marginBps = Number(floorDivide(profit * BPS, price));
    return {
      adjustmentBps,
      priceCents,
      variableCostCents: Number(variable),
      totalCostCents: Number(cost),
      estimatedProfitCents: Number(profit),
      marginBps,
      roiBps: Number(floorDivide(profit * BPS, cost)),
      blocked:
        profit <= 0n ||
        marginBps < input.minimumMarginBps ||
        totalRateBps >= 10_000 ||
        recommendedPriceCents === null,
    };
  }

  const evaluated = evaluatedPriceCents === null ? null : evaluate(evaluatedPriceCents, 0);
  if (evaluated) {
    if (evaluated.estimatedProfitCents <= 0) blockReasons.push('NO_PROFIT');
    if (evaluated.marginBps < input.minimumMarginBps) blockReasons.push('BELOW_MINIMUM_MARGIN');
  }
  return {
    fixedCostCents,
    totalRateBps,
    minimumPriceCents,
    breakEvenPriceCents: minimumPriceCents,
    minimumMarginPriceCents,
    recommendedPriceCents,
    evaluatedPriceCents,
    variableCostCents: evaluated?.variableCostCents ?? null,
    totalCostCents: evaluated?.totalCostCents ?? null,
    estimatedProfitCents: evaluated?.estimatedProfitCents ?? null,
    marginBps: evaluated?.marginBps ?? null,
    roiBps: evaluated?.roiBps ?? null,
    blocked: blockReasons.length > 0,
    blockReasons,
    scenarios:
      evaluatedPriceCents === null
        ? []
        : ([-1000, 0, 1000] as const).map((adjustment) =>
            evaluate(
              Number(ceilDivide(BigInt(evaluatedPriceCents) * BigInt(10_000 + adjustment), BPS)),
              adjustment,
            ),
          ),
  };
}

export const opportunityInputSchema = z
  .object({
    marginBps: z.number().int().min(Number.MIN_SAFE_INTEGER).max(10_000).nullable(),
    minimumMarginBps: basisPoints,
    stock: z.number().int().min(0).max(10_000_000),
    shippingDays: z.number().int().min(0).max(365),
    catalogQualityBps: basisPoints,
    supplierRating: z.number().int().min(0).max(5).nullable(),
    competitionBps: basisPoints.nullish(),
    demandBps: basisPoints.nullish(),
  })
  .strict();
export type OpportunityInput = z.infer<typeof opportunityInputSchema>;
export interface OpportunityScore {
  score: number;
  eligible: boolean;
  evidenceCoverageBps: number;
  components: {
    margin: number | null;
    stock: number;
    shipping: number;
    catalogQuality: number;
    supplierRating: number | null;
  };
  market: { competitionBps: number | null; demandBps: number | null };
  unknownSignals: ('margin' | 'supplierRating' | 'competition' | 'demand')[];
  reasons: ('NO_STOCK' | 'MARGIN_UNKNOWN' | 'BELOW_MINIMUM_MARGIN')[];
}

/** Operational triage only; no sales forecast or inferred market signals. */
export function scoreOpportunity(rawInput: OpportunityInput): OpportunityScore {
  const input = opportunityInputSchema.parse(rawInput);
  const components = {
    margin:
      input.marginBps === null
        ? null
        : Math.min(10_000, Math.max(0, Math.floor((input.marginBps * 10_000) / 3000))),
    stock: Math.min(10_000, input.stock * 200),
    shipping:
      input.shippingDays <= 2 ? 10_000 : Math.max(0, 10_000 - (input.shippingDays - 2) * 1000),
    catalogQuality: input.catalogQualityBps,
    supplierRating: input.supplierRating === null ? null : input.supplierRating * 2000,
  };
  const weights = { margin: 35, stock: 20, shipping: 15, catalogQuality: 20, supplierRating: 10 };
  let weighted = 0;
  let knownWeight = 0;
  for (const key of Object.keys(weights) as (keyof typeof weights)[]) {
    const value = components[key];
    if (value !== null) {
      weighted += value * weights[key];
      knownWeight += weights[key];
    }
  }
  const unknownSignals: OpportunityScore['unknownSignals'] = [];
  if (input.marginBps === null) unknownSignals.push('margin');
  if (input.supplierRating === null) unknownSignals.push('supplierRating');
  if (input.competitionBps == null) unknownSignals.push('competition');
  if (input.demandBps == null) unknownSignals.push('demand');
  const reasons: OpportunityScore['reasons'] = [];
  if (input.stock === 0) reasons.push('NO_STOCK');
  if (input.marginBps === null) reasons.push('MARGIN_UNKNOWN');
  else if (input.marginBps <= 0 || input.marginBps < input.minimumMarginBps)
    reasons.push('BELOW_MINIMUM_MARGIN');
  return {
    score: Math.floor(
      (weighted + (input.competitionBps == null ? 0 : (10000 - input.competitionBps) * 20)) /
        ((knownWeight + (input.competitionBps == null ? 0 : 20)) * 100),
    ),
    eligible: reasons.length === 0,
    evidenceCoverageBps: knownWeight * 100,
    components,
    market: { competitionBps: input.competitionBps ?? null, demandBps: input.demandBps ?? null },
    unknownSignals,
    reasons,
  };
}
