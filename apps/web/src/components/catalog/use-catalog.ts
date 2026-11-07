'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CatalogPage,
  CatalogSummary,
  ProductRow,
  SupplierRow,
  ProductInput,
  SupplierInput,
  CatalogPreview,
  CatalogFormat,
  CatalogImportRow,
  ImportResult,
  CostSnapshot,
} from '@marketpilot/contracts';
import { api } from '@/lib/utils';
import { initialDemoCatalog, type DemoCatalog } from './demo-data';

type RecordInput = ProductInput | SupplierInput;
export function useCatalog(
  demo: boolean,
  kind: 'products' | 'suppliers',
  query: { q: string; status: string; page: number; supplierId: string },
) {
  const client = useQueryClient();
  const local = useQuery({
    queryKey: ['demo-catalog'],
    queryFn: initialDemoCatalog,
    enabled: demo,
    staleTime: Infinity,
  });
  const params = new URLSearchParams({
    q: query.q,
    status: query.status,
    page: String(query.page),
    pageSize: '20',
    ...(query.supplierId ? { supplierId: query.supplierId } : {}),
  });
  const remote = useQuery({
    queryKey: ['catalog', kind, params.toString()],
    queryFn: () => api<CatalogPage<ProductRow | SupplierRow>>(`/v1/${kind}?${params}`),
    enabled: !demo,
  });
  const summaryQuery = useQuery({
    queryKey: ['catalog', 'summary'],
    queryFn: () => api<CatalogSummary>('/v1/catalog/summary'),
    enabled: !demo,
  });
  const suppliersQuery = useQuery({
    queryKey: ['catalog', 'supplier-options'],
    queryFn: () => api<CatalogPage<SupplierRow>>('/v1/suppliers?status=ACTIVE&pageSize=100'),
    enabled: !demo,
  });
  const identity = useQuery({
    queryKey: ['identity'],
    queryFn: () => api<{ user: { role: string } }>('/v1/auth/me'),
    enabled: !demo,
  });
  const data = local.data;
  const demoRows =
    (kind === 'products' ? data?.products : data?.suppliers)?.filter(
      (row) =>
        (query.status === 'ALL' || row.status === query.status) &&
        (!query.supplierId || !('supplierId' in row) || row.supplierId === query.supplierId) &&
        `${row.name} ${'sku' in row ? row.sku + ' ' + row.category : (row.cnpj ?? '')}`
          .toLowerCase()
          .includes(query.q.toLowerCase()),
    ) ?? [];
  const demoSummary = data
    ? {
        activeProducts: data.products.filter((p) => p.status === 'ACTIVE').length,
        archivedProducts: data.products.filter((p) => p.status === 'ARCHIVED').length,
        suppliers: data.suppliers.filter((s) => s.status === 'ACTIVE').length,
        outOfStock: data.products.filter((p) => p.status === 'ACTIVE' && p.stock === 0).length,
        imports: data.imports.length,
      }
    : undefined;
  async function refresh() {
    await client.invalidateQueries({ queryKey: ['catalog'] });
  }
  function changeLocal(change: (current: DemoCatalog) => DemoCatalog) {
    client.setQueryData<DemoCatalog>(['demo-catalog'], (current) =>
      change(current ?? initialDemoCatalog()),
    );
  }
  async function save(input: RecordInput, existing?: ProductRow | SupplierRow) {
    if (!demo) {
      await api(`/v1/${kind}${existing ? `/${existing.id}` : ''}`, {
        method: existing ? 'PUT' : 'POST',
        body: JSON.stringify({ ...input, ...(existing ? { version: existing.version } : {}) }),
      });
      await refresh();
      return;
    }
    const now = new Date().toISOString();
    const id = existing?.id ?? crypto.randomUUID();
    changeLocal((current) => {
      if (kind === 'suppliers') {
        const next = {
          ...input,
          id,
          version: (existing?.version ?? 0) + 1,
          status: existing?.status ?? 'ACTIVE',
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          _count: { products: 0, imports: 0 },
        } as SupplierRow;
        return {
          ...current,
          suppliers: existing
            ? current.suppliers.map((s) => (s.id === id ? next : s))
            : [next, ...current.suppliers],
          products: current.products.map((p) =>
            p.supplierId === id ? { ...p, supplier: { ...p.supplier, name: next.name } } : p,
          ),
        };
      }
      const productInput = input as ProductInput;
      const supplier = current.suppliers.find((s) => s.id === productInput.supplierId)!;
      const next: ProductRow = {
        ...productInput,
        id,
        source: 'MANUAL',
        version: (existing?.version ?? 0) + 1,
        status: existing?.status ?? 'ACTIVE',
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        supplier: { id: supplier.id, name: supplier.name, status: supplier.status },
      };
      const history = current.history[id] ?? [];
      const changed =
        !existing ||
        !('costCents' in existing) ||
        ['costCents', 'stock', 'shippingDays', 'shippingCostCents'].some(
          (key) => existing[key as keyof ProductRow] !== next[key as keyof ProductRow],
        );
      return {
        ...current,
        products: existing
          ? current.products.map((p) => (p.id === id ? next : p))
          : [next, ...current.products],
        history: {
          ...current.history,
          [id]: changed
            ? [
                {
                  id: crypto.randomUUID(),
                  costCents: next.costCents,
                  stock: next.stock,
                  shippingDays: next.shippingDays,
                  shippingCostCents: next.shippingCostCents,
                  source: 'MANUAL',
                  sourceUrl: next.sourceUrl,
                  createdAt: now,
                },
                ...history,
              ]
            : history,
        },
      };
    });
  }
  async function archive(item: ProductRow | SupplierRow) {
    const archived = item.status !== 'ARCHIVED';
    if (!demo) {
      await api(`/v1/${kind}/${item.id}/archive`, {
        method: 'PATCH',
        body: JSON.stringify({ archived, version: item.version }),
      });
      await refresh();
      return;
    }
    if (kind === 'products' && !archived && 'supplier' in item && item.supplier.status !== 'ACTIVE')
      throw new Error('Reative o fornecedor antes de reativar o produto.');
    changeLocal((current) => ({
      ...current,
      [kind]: current[kind].map((record) =>
        record.id === item.id
          ? { ...record, status: archived ? 'ARCHIVED' : 'ACTIVE', version: record.version + 1 }
          : record,
      ),
      ...(kind === 'suppliers'
        ? {
            products: current.products.map((product) =>
              product.supplierId === item.id
                ? {
                    ...product,
                    supplier: {
                      ...product.supplier,
                      status: archived ? ('ARCHIVED' as const) : ('ACTIVE' as const),
                    },
                  }
                : product,
            ),
          }
        : {}),
    }));
  }
  async function applyImport(
    input: {
      supplierId: string;
      format: CatalogFormat;
      content: string;
      fileName: string;
      authorized: true;
    },
    preview: CatalogPreview,
  ) {
    if (!demo) {
      const result = await api<ImportResult>('/v1/catalog/import', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      await refresh();
      return result;
    }
    const now = new Date().toISOString();
    const importId = crypto.randomUUID();
    let createdCount = 0,
      updatedCount = 0;
    changeLocal((current) => {
      const supplier = current.suppliers.find((s) => s.id === input.supplierId)!;
      let products = [...current.products];
      const history = { ...current.history };
      for (const row of preview.rows) {
        const existing = products.find((p) => p.supplierId === supplier.id && p.sku === row.sku);
        if (existing?.status === 'ARCHIVED')
          throw new Error(`O SKU ${row.sku} está arquivado. Reative-o antes de importar.`);
        const id = existing?.id ?? crypto.randomUUID();
        const product: ProductRow = {
          ...row,
          id,
          supplierId: supplier.id,
          supplier: { id: supplier.id, name: supplier.name, status: supplier.status },
          source: input.format,
          status: 'ACTIVE',
          version: (existing?.version ?? 0) + 1,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        products = existing
          ? products.map((p) => (p.id === id ? product : p))
          : [product, ...products];
        history[id] = [
          {
            id: crypto.randomUUID(),
            costCents: row.costCents,
            stock: row.stock,
            shippingDays: row.shippingDays,
            shippingCostCents: row.shippingCostCents,
            source: input.format,
            sourceUrl: row.sourceUrl,
            createdAt: now,
          },
          ...(history[id] ?? []),
        ];
        if (existing) updatedCount++;
        else createdCount++;
      }
      return {
        ...current,
        products,
        history,
        imports: [
          {
            id: importId,
            fileName: input.fileName,
            format: input.format,
            totalRows: preview.totalRows,
            createdCount,
            updatedCount,
            unchangedCount: 0,
            createdAt: now,
            supplier: { id: supplier.id, name: supplier.name },
            actor: { name: 'Visitante da demonstração' },
          },
          ...current.imports,
        ],
      };
    });
    return { duplicate: false, item: { id: importId, createdCount, updatedCount } };
  }
  return {
    items: demo
      ? demoRows.slice((query.page - 1) * 20, query.page * 20)
      : (remote.data?.items ?? []),
    total: demo ? demoRows.length : (remote.data?.total ?? 0),
    summary: demo ? demoSummary : summaryQuery.data,
    suppliers: demo
      ? (data?.suppliers.filter((s) => s.status === 'ACTIVE') ?? [])
      : (suppliersQuery.data?.items ?? []),
    canWrite:
      demo || identity.data?.user.role === 'ADMIN' || identity.data?.user.role === 'OPERATOR',
    isPending: demo ? local.isPending : remote.isPending,
    error: remote.error,
    isFetching: remote.isFetching,
    save,
    archive,
    applyImport,
    refresh,
    history: async (id: string) =>
      demo
        ? (data?.history[id] ?? [])
        : (await api<{ history: CostSnapshot[] }>(`/v1/products/${id}`)).history,
    imports: async () =>
      demo
        ? (data?.imports ?? [])
        : (await api<CatalogPage<CatalogImportRow>>('/v1/catalog/imports')).items,
    resetDemo: () => client.setQueryData(['demo-catalog'], initialDemoCatalog()),
  };
}
