import { parse } from 'csv-parse/sync';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import {
  productInputSchema,
  type CatalogFormat,
  type CatalogIssue,
  type CatalogPreview,
} from '@marketpilot/contracts';

const fields = [
  'sku',
  'name',
  'cost',
  'stock',
  'category',
  'shipping_days',
  'shipping_cost',
  'source_url',
];
const required = ['sku', 'name', 'cost', 'stock'];
export function decimalToCents(value: string): number {
  if (!/^(0|[1-9]\d{0,5})(?:[.,]\d{1,2})?$/.test(value.trim()))
    throw new Error('Use um valor como 19,90, sem separador de milhar.');
  const [whole, fraction = ''] = value.trim().split(/[.,]/);
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
function empty(message: string): CatalogPreview {
  return { valid: false, totalRows: 0, rows: [], issues: [{ row: 0, field: 'file', message }] };
}
function decodeXmlText(text: string): string {
  return text.replace(
    /&(amp|lt|gt|quot|apos);/g,
    (_, entity: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[entity]!,
  );
}
export function parseCatalog(format: CatalogFormat, content: string): CatalogPreview {
  if (!content.trim()) return empty('O arquivo está vazio.');
  if (Buffer.byteLength(content, 'utf8') > 524288) return empty('Limite de 512 KiB excedido.');
  if (content.includes('\0')) return empty('Codificação inválida. Use UTF-8 ou Windows-1252.');
  let records: Record<string, unknown>[];
  try {
    if (format === 'CSV') {
      const firstLine = content.split(/\r?\n/, 1)[0] ?? '';
      const delimiter = firstLine.includes(';') ? ';' : ',';
      const data = parse(content, {
        bom: true,
        delimiter,
        trim: true,
        skip_empty_lines: true,
        max_record_size: 32768,
      }) as string[][];
      const headers = data.shift()?.map((h) => h.toLowerCase()) ?? [];
      if (
        new Set(headers).size !== headers.length ||
        headers.some((h) => !fields.includes(h)) ||
        required.some((h) => !headers.includes(h))
      )
        return empty(
          'Cabeçalho inválido. Use sku, name, cost e stock; consulte o modelo para campos opcionais.',
        );
      records = data.map((row) =>
        Object.fromEntries(headers.map((header, i) => [header, row[i] ?? ''])),
      );
    } else {
      if (/<!\s*(DOCTYPE|ENTITY)/i.test(content))
        return empty('DTD e entidades personalizadas não são permitidos.');
      const tags = content.matchAll(/<(\/?)([A-Za-z][\w:-]*)([^>]*)>/g);
      let depth = 0;
      for (const tag of tags) {
        const tail = tag[3]!.trim();
        if (!['catalog', 'product', ...fields].includes(tag[2]!) || (tail && tail !== '/'))
          return empty('XML deve usar somente as tags do modelo, sem atributos.');
        if (tag[1]) depth--;
        else if (tail !== '/') depth++;
        if (depth > 3 || depth < 0)
          return empty('Estrutura XML inválida. Use catalog > product > campo.');
      }
      if (XMLValidator.validate(content) !== true)
        return empty('XML malformado. Confira as tags de abertura e fechamento.');
      const parser = new XMLParser({
        ignoreAttributes: false,
        parseTagValue: false,
        processEntities: false,
        trimValues: true,
        isArray: (_, path) => path === 'catalog.product',
      });
      const document = parser.parse(content) as Record<string, unknown>;
      const keys = Object.keys(document).filter((k) => k !== '?xml');
      if (
        keys.length !== 1 ||
        keys[0] !== 'catalog' ||
        !document.catalog ||
        typeof document.catalog !== 'object'
      )
        return empty('Use a raiz <catalog> e os elementos <product>.');
      const catalog = document.catalog as Record<string, unknown>;
      if (Object.keys(catalog).some((k) => k !== 'product') || !Array.isArray(catalog.product))
        return empty('O catálogo XML não contém produtos válidos.');
      records = catalog.product as Record<string, unknown>[];
      records = records.map((record) =>
        Object.fromEntries(
          Object.entries(record).map(([k, v]) => [k, typeof v === 'string' ? decodeXmlText(v) : v]),
        ),
      );
    }
  } catch {
    return empty('Não foi possível ler o arquivo. Verifique o separador, as aspas e a estrutura.');
  }
  if (!records.length) return empty('O catálogo não contém produtos.');
  if (records.length > 500) return empty('Importe no máximo 500 produtos por arquivo.');
  const rows: CatalogPreview['rows'] = [];
  const issues: CatalogIssue[] = [];
  const seen = new Set<string>();
  for (const [index, record] of records.entries()) {
    const row = index + (format === 'CSV' ? 2 : 1);
    if (
      !record ||
      typeof record !== 'object' ||
      Object.entries(record).some(
        ([key, value]) => !fields.includes(key) || typeof value !== 'string',
      )
    ) {
      issues.push({
        row,
        field: 'row',
        message: 'Cada campo deve conter apenas texto, sem tags aninhadas ou repetidas.',
      });
      continue;
    }
    const text = record as Record<string, string>;
    const sku = text.sku?.trim() ?? '';
    if (seen.has(sku))
      issues.push({ row, field: 'sku', message: 'SKU repetido no mesmo arquivo.' });
    seen.add(sku);
    let costCents = 0,
      shippingCostCents = 0;
    try {
      costCents = decimalToCents(text.cost ?? '');
    } catch (e) {
      issues.push({ row, field: 'cost', message: (e as Error).message });
    }
    try {
      shippingCostCents = decimalToCents(text.shipping_cost || '0');
    } catch (e) {
      issues.push({ row, field: 'shipping_cost', message: (e as Error).message });
    }
    const integer = (key: string, fallback?: string) => {
      const value = text[key] || fallback || '';
      if (!/^\d+$/.test(value)) {
        issues.push({ row, field: key, message: 'Use um número inteiro não negativo.' });
        return -1;
      }
      return Number(value);
    };
    const input = {
      sku,
      name: text.name,
      category: text.category || 'Sem categoria',
      costCents,
      stock: integer('stock'),
      shippingDays: integer('shipping_days', '2'),
      shippingCostCents,
      sourceUrl: text.source_url || null,
    };
    const parsed = productInputSchema.omit({ supplierId: true }).safeParse(input);
    if (parsed.success) rows.push(parsed.data);
    else
      for (const issue of parsed.error.issues)
        issues.push({ row, field: String(issue.path[0]), message: issue.message });
  }
  return {
    valid: issues.length === 0,
    totalRows: records.length,
    rows,
    issues: issues.slice(0, 100),
  };
}
