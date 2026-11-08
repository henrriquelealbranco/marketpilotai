export type CatalogMethod = 'API' | 'CSV' | 'XLSX' | 'XML' | 'PUBLIC_FEED' | 'MANUAL';
export type IntegrationQuality = 'DOCUMENTED' | 'PARTIAL' | 'NONE';

export interface SupplierEvidenceInput {
  registrationVerified: boolean;
  companyIdentified: boolean;
  commercialTermsPublic: boolean;
  returnPolicyPublic: boolean;
  postingLeadTimeKnown: boolean;
  catalogMethod: CatalogMethod | null;
  integrationQuality: IntegrationQuality | null;
  reputationEvidence: boolean;
}

const disclaimer =
  'Pontuação baseada somente nas evidências registradas; não é certificação de confiabilidade.';

export function validateSupplierEvidence(input: SupplierEvidenceInput) {
  const checks = [
    ['registration_verified', input.registrationVerified, 15],
    ['company_identified', input.companyIdentified, 10],
    ['commercial_terms', input.commercialTermsPublic, 20],
    ['return_policy', input.returnPolicyPublic, 10],
    ['posting_lead_time', input.postingLeadTimeKnown, 10],
    ['catalog_availability', input.catalogMethod !== null, 15],
    ['integration_quality', input.integrationQuality === 'DOCUMENTED', 10],
    ['reputation_evidence', input.reputationEvidence, 10],
  ] as const;
  const score = checks.reduce((total, [, present, points]) => total + (present ? points : 0), 0);
  return {
    score,
    confidence: score >= 85 ? ('HIGH' as const) : score >= 55 ? ('MEDIUM' as const) : ('LOW' as const),
    missing: checks.filter(([, present]) => !present).map(([key]) => key),
    disclaimer,
  };
}
