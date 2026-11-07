import type {
  ProductRow,
  SupplierRow,
  CostSnapshot,
  CatalogImportRow,
} from '@marketpilot/contracts';
export interface DemoCatalog {
  suppliers: SupplierRow[];
  products: ProductRow[];
  history: Record<string, CostSnapshot[]>;
  imports: CatalogImportRow[];
}
const date = '2026-11-07T12:00:00.000Z';
export function initialDemoCatalog(): DemoCatalog {
  const suppliers: SupplierRow[] = ['Nexo Distribuidora', 'Casa Norte', 'Via Brasil'].map(
    (name, index) => ({
      id: `e0000000-0000-4000-8000-00000000000${index + 1}`,
      name,
      cnpj: null,
      contactName: 'Equipe comercial · fictícia',
      email: null,
      phone: null,
      sourceUrl: null,
      notes: 'Fornecedor fictício para demonstração. Não representa uma conexão comercial.',
      shippingDays: index + 1,
      shippingCostCents: [1290, 1590, 990][index]!,
      rating: [4, 5, 4][index]!,
      version: 1,
      status: 'ACTIVE',
      createdAt: date,
      updatedAt: date,
      _count: { products: 0, imports: 0 },
    }),
  );
  const entries = [
    ['Fone Bluetooth Wave Pro', 'Eletrônicos', 10990, 42, 0],
    ['Luminária de mesa Orbit', 'Casa e decoração', 6490, 28, 1],
    ['Garrafa térmica 1L', 'Casa e cozinha', 3890, 0, 1],
    ['Smartwatch Pulse S2', 'Eletrônicos', 13990, 16, 0],
    ['Kit organizador de viagem', 'Acessórios', 3290, 64, 2],
  ] as const;
  const products: ProductRow[] = entries.map(([name, category, costCents, stock, s], index) => ({
    id: `d0000000-0000-4000-8000-00000000000${index + 1}`,
    supplierId: suppliers[s]!.id,
    supplier: { id: suppliers[s]!.id, name: suppliers[s]!.name, status: 'ACTIVE' },
    sku: `DEMO-${String(index + 1).padStart(3, '0')}`,
    name,
    category,
    costCents,
    stock,
    shippingDays: suppliers[s]!.shippingDays,
    shippingCostCents: suppliers[s]!.shippingCostCents,
    sourceUrl: null,
    source: 'MANUAL',
    version: 1,
    status: 'ACTIVE',
    createdAt: date,
    updatedAt: date,
  }));
  const history = Object.fromEntries(
    products.map((p) => [
      p.id,
      [
        {
          id: `snapshot-${p.id}`,
          costCents: p.costCents,
          stock: p.stock,
          shippingDays: p.shippingDays,
          shippingCostCents: p.shippingCostCents,
          source: 'MANUAL',
          sourceUrl: null,
          createdAt: date,
        },
      ],
    ]),
  );
  return { suppliers, products, history, imports: [] };
}
