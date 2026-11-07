// The browser and API execute the same pure rules. Keep server concerns in routes.
export {
  calculatePricing,
  scoreOpportunity,
  pricingInputSchema,
  opportunityInputSchema,
  type PricingInput,
  type PricingResult,
  type OpportunityInput,
  type OpportunityScore,
} from '../../../../packages/contracts/src/pricing.js';
