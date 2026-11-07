import { describe, expect, it } from 'vitest';
import { parseCatalog, decimalToCents } from '../../apps/api/src/catalog/parser.js';
import { validCnpj, supplierInputSchema } from '../../packages/contracts/src/catalog.js';

const header = 'sku;name;cost;stock;category;shipping_days;shipping_cost;source_url';
describe('importação de catálogo', () => {
  it('converte valores monetários sem erros de ponto flutuante', () => {
    expect(decimalToCents('19,99')).toBe(1999);
    expect(decimalToCents('0.29')).toBe(29);
    expect(decimalToCents('120')).toBe(12000);
    for (const invalid of ['-1', '1.234,56', '1e3', '1.999', 'NaN', ''])
      expect(() => decimalToCents(invalid)).toThrow();
  });
  it('lê BOM, ponto e vírgula, aspas e preserva SKU com zero à esquerda', () => {
    const result = parseCatalog(
      'CSV',
      `\uFEFF${header}\n001;"Garrafa; térmica";19,99;12;Casa;3;7,50;https://example.test/item`,
    );
    expect(result.valid).toBe(true);
    expect(result.rows[0]).toMatchObject({
      sku: '001',
      name: 'Garrafa; térmica',
      costCents: 1999,
      stock: 12,
      shippingCostCents: 750,
    });
  });
  it('lê CSV com vírgula e XML canônico', () => {
    const csv = parseCatalog('CSV', 'sku,name,cost,stock\nP1,Produto,10.25,4');
    expect(csv.rows[0]?.costCents).toBe(1025);
    const xml = parseCatalog(
      'XML',
      '<catalog><product><sku>0002</sku><name>Produto XML</name><cost>12.99</cost><stock>3</stock></product></catalog>',
    );
    expect(xml.valid).toBe(true);
    expect(xml.rows[0]).toMatchObject({ sku: '0002', costCents: 1299, stock: 3 });
  });
  it('reporta linhas inválidas e SKU repetido sem descartar erros', () => {
    const result = parseCatalog(
      'CSV',
      'sku;name;cost;stock\nA;Produto;9,90;1\nA;Outro;10,00;2\nB;Outro;-1;3\nC;Outro;1,00;1.5',
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.row === 3 && i.field === 'sku')).toBe(true);
    expect(result.issues.some((i) => i.row === 4 && i.field === 'cost')).toBe(true);
    expect(result.issues.some((i) => i.row === 5 && i.field === 'stock')).toBe(true);
  });
  it('rejeita cabeçalhos duplicados, desconhecidos e vazios', () => {
    for (const content of [
      'sku;name;cost;stock;cost\nA;Nome;1;1;1',
      'sku;nome;cost;stock\nA;Nome;1;1',
      '',
    ])
      expect(parseCatalog('CSV', content).valid).toBe(false);
  });
  it('não aceita DTD, entidades, XML malformado ou estrutura inesperada', () => {
    for (const xml of [
      '<!DOCTYPE catalog [<!ENTITY x SYSTEM "file:///etc/passwd">]><catalog/>',
      '<catalog><product></catalog>',
      '<other/>',
      '<catalog><product><sku>A</sku><name><nested>Nome</nested></name><cost>1</cost><stock>1</stock></product></catalog>',
    ])
      expect(parseCatalog('XML', xml).valid).toBe(false);
  });
  it('limita bytes e número de registros', () => {
    expect(parseCatalog('CSV', 'x'.repeat(524289)).valid).toBe(false);
    expect(
      parseCatalog(
        'CSV',
        'sku;name;cost;stock\n' +
          Array.from({ length: 501 }, (_, i) => `S${i};Produto;1;1`).join('\n'),
      ).valid,
    ).toBe(false);
  });
});
describe('dados do fornecedor', () => {
  it('valida dígitos verificadores do CNPJ numérico e alfanumérico', () => {
    expect(validCnpj('11.222.333/0001-81')).toBe(true);
    expect(validCnpj('12.ABC.345/01DE-35')).toBe(true);
    expect(validCnpj('11222333000180')).toBe(false);
    expect(validCnpj('00000000000000')).toBe(false);
  });
  it('normaliza CNPJ opcional e recusa referência não HTTP', () => {
    expect(supplierInputSchema.parse({ name: 'Fornecedor', cnpj: '' }).cnpj).toBeNull();
    expect(
      supplierInputSchema.safeParse({ name: 'Fornecedor', sourceUrl: 'file:///etc/passwd' })
        .success,
    ).toBe(false);
  });
});
