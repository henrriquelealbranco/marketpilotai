import { z } from 'zod';

export function validCnpj(value: string): boolean {
  const cnpj = value.replace(/[.\s/-]/g, '').toUpperCase();
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digit = (base: string) => {
    let weight = base.length - 7;
    const sum = [...base].reduce((total, char) => {
      const result = total + (char.charCodeAt(0) - 48) * weight;
      weight = weight === 2 ? 9 : weight - 1;
      return result;
    }, 0);
    const remainder = sum % 11;
    return String(remainder < 2 ? 0 : 11 - remainder);
  };
  const base = cnpj.slice(0, 12);
  const first = digit(base);
  return cnpj === base + first + digit(base + first);
}
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);
const referenceUrl = z
  .union([z.httpUrl().max(1000), z.literal('')])
  .nullish()
  .transform((v) => v || null);
const amount = z.number().int().min(0).max(99999999);
export const supplierInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    cnpj: z
      .string()
      .trim()
      .max(30)
      .nullish()
      .transform((v) => (v ? v.replace(/[.\s/-]/g, '').toUpperCase() : null))
      .refine((v) => v === null || validCnpj(v), 'CNPJ inválido.'),
    contactName: optionalText(100),
    email: z
      .union([z.email().max(254), z.literal('')])
      .nullish()
      .transform((v) => (v ? v.toLowerCase() : null)),
    phone: optionalText(40),
    sourceUrl: referenceUrl,
    notes: optionalText(2000),
    shippingDays: z.number().int().min(0).max(365).default(2),
    shippingCostCents: amount.default(0),
    rating: z.number().int().min(0).max(5).default(0),
  })
  .strict();
export const productInputSchema = z
  .object({
    supplierId: z.uuid(),
    sku: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[^\x00-\x1F\x7F]+$/),
    name: z.string().trim().min(2).max(160),
    category: z.string().trim().min(1).max(80).default('Sem categoria'),
    costCents: amount.min(1),
    stock: z.number().int().min(0).max(10000000),
    shippingDays: z.number().int().min(0).max(365).default(2),
    shippingCostCents: amount.default(0),
    sourceUrl: referenceUrl,
  })
  .strict();
export const supplierUpdateSchema = supplierInputSchema.extend({
  version: z.number().int().positive(),
});
export const productUpdateSchema = productInputSchema.extend({
  version: z.number().int().positive(),
});
export const archiveSchema = z
  .object({ archived: z.boolean(), version: z.number().int().positive() })
  .strict();
export const catalogListSchema = z.object({
  q: z.string().trim().max(100).default(''),
  status: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).default('ACTIVE'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  supplierId: z.uuid().optional(),
});
export const catalogUploadSchema = z
  .object({
    format: z.enum(['CSV', 'XML']),
    content: z.string().min(1).max(524288),
    fileName: z.string().trim().min(1).max(160),
    supplierId: z.uuid(),
    authorized: z.literal(true, 'Confirme que a fonte autoriza o uso do catálogo.'),
  })
  .strict();
export type SupplierInput = z.infer<typeof supplierInputSchema>;
export type ProductInput = z.infer<typeof productInputSchema>;
export type CatalogRecord = Omit<ProductInput, 'supplierId'>;
export type CatalogFormat = 'CSV' | 'XML';
export interface CatalogIssue {
  row: number;
  field: string;
  message: string;
}
export interface CatalogPreview {
  valid: boolean;
  totalRows: number;
  rows: CatalogRecord[];
  issues: CatalogIssue[];
}
export interface SupplierRow extends SupplierInput {
  id: string;
  version: number;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  _count: { products: number; imports: number };
}
export interface ProductRow extends ProductInput {
  id: string;
  version: number;
  status: 'ACTIVE' | 'ARCHIVED';
  source: 'MANUAL' | 'CSV' | 'XML';
  createdAt: string;
  updatedAt: string;
  supplier: { id: string; name: string; status: 'ACTIVE' | 'ARCHIVED' };
}
export interface CatalogPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface CostSnapshot {
  id: string;
  costCents: number;
  stock: number;
  shippingDays: number;
  shippingCostCents: number;
  source: string;
  sourceUrl: string | null;
  createdAt: string;
}
export interface CatalogImportRow {
  id: string;
  fileName: string;
  format: CatalogFormat;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  createdAt: string;
  supplier: { id: string; name: string };
  actor: { name: string } | null;
}
export interface ImportResult {
  item: CatalogImportRow;
  duplicate: boolean;
}
export interface CatalogSummary {
  activeProducts: number;
  archivedProducts: number;
  suppliers: number;
  outOfStock: number;
  imports: number;
}
