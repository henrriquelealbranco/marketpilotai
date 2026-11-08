import { describe, expect, it } from 'vitest';
import { outreachKey, normalizeContactEmail } from '../../apps/api/src/suppliers/outreach.js';

describe('contato comercial por e-mail', () => {
  it('normaliza contatos públicos e cria uma chave estável de deduplicação', () => {
    expect(normalizeContactEmail('  Comercial@Fornecedor.Example.BR ')).toBe(
      'comercial@fornecedor.example.br',
    );
    expect(
      outreachKey({
        supplierId: 'supplier-1',
        email: 'comercial@fornecedor.example.br',
        subject: 'Parceria comercial',
        body: 'Olá, gostaria de conhecer o catálogo autorizado.',
      }),
    ).toBe(
      outreachKey({
        supplierId: 'supplier-1',
        email: 'COMERCIAL@FORNECEDOR.EXAMPLE.BR',
        subject: 'Parceria comercial',
        body: 'Olá, gostaria de conhecer o catálogo autorizado.',
      }),
    );
  });

  it('recusa endereços que não sejam contatos públicos válidos', () => {
    expect(() => normalizeContactEmail('not-an-email')).toThrow('e-mail comercial inválido');
  });
});
