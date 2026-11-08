import { describe, expect, it } from 'vitest';
import { validateSupplierEvidence } from '../../apps/api/src/suppliers/validator.js';

describe('Supplier Validator', () => {
  it('expõe ausência de evidências e não trata CNPJ e site como certificação', () => {
    const result = validateSupplierEvidence({
      registrationVerified: true,
      companyIdentified: true,
      commercialTermsPublic: false,
      returnPolicyPublic: false,
      postingLeadTimeKnown: false,
      catalogMethod: null,
      integrationQuality: null,
      reputationEvidence: false,
    });

    expect(result).toEqual({
      score: 25,
      confidence: 'LOW',
      missing: [
        'commercial_terms',
        'return_policy',
        'posting_lead_time',
        'catalog_availability',
        'integration_quality',
        'reputation_evidence',
      ],
      disclaimer: 'Pontuação baseada somente nas evidências registradas; não é certificação de confiabilidade.',
    });
  });

  it('atribui a pontuação máxima somente com todas as evidências verificáveis', () => {
    const result = validateSupplierEvidence({
      registrationVerified: true,
      companyIdentified: true,
      commercialTermsPublic: true,
      returnPolicyPublic: true,
      postingLeadTimeKnown: true,
      catalogMethod: 'API',
      integrationQuality: 'DOCUMENTED',
      reputationEvidence: true,
    });

    expect(result).toMatchObject({ score: 100, confidence: 'HIGH', missing: [] });
  });
});
