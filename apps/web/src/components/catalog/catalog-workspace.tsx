'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Package,
  Truck,
  Plus,
  Search,
  FileUp,
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  Pencil,
  Archive,
  ArchiveRestore,
  Eye,
  Boxes,
  Star,
  Clock3,
  Mail,
  Phone,
  History,
  RotateCcw,
  FileSpreadsheet,
  ShieldCheck,
} from 'lucide-react';
import type {
  ProductRow,
  SupplierRow,
  CatalogImportRow,
  CatalogPreview,
  CatalogFormat,
} from '@marketpilot/contracts';
import { api, money, cn, number, daysLabel } from '@/lib/utils';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import { useCatalog } from './use-catalog';
import { RecordForm } from './record-form';
import { ImportDialog } from './import-dialog';
import { ProductDetail } from './product-detail';

export function CatalogWorkspace({
  kind,
  demo,
  initialSupplierId = '',
}: {
  kind: 'products' | 'suppliers';
  demo: boolean;
  initialSupplierId?: string;
}) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [page, setPage] = useState(1);
  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const [form, setForm] = useState<ProductRow | SupplierRow | 'new' | null>(null);
  const [details, setDetails] = useState<ProductRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [discovery, setDiscovery] = useState<{
    candidates: {
      name: string;
      sourceUrl: string;
      catalogUrl: string | null;
      summary: string;
      evidenceUrls: string[];
      risks: string[];
    }[];
    limitations: string[];
  } | null>(null);
  const catalog = useCatalog(demo, kind, { q, status, page, supplierId });
  const base = demo ? '/demo' : '/app';
  const isProducts = kind === 'products';
  const summary = catalog.summary;
  const cards = isProducts
    ? [
        { label: 'Produtos ativos', value: summary?.activeProducts, icon: Package },
        { label: 'Sem disponibilidade', value: summary?.outOfStock, icon: CircleAlert },
        { label: 'Fornecedores ativos', value: summary?.suppliers, icon: Truck },
        { label: 'Importações concluídas', value: summary?.imports, icon: FileSpreadsheet },
      ]
    : [
        { label: 'Fornecedores ativos', value: summary?.suppliers, icon: Truck },
        { label: 'Produtos no catálogo', value: summary?.activeProducts, icon: Package },
        { label: 'Importações concluídas', value: summary?.imports, icon: FileSpreadsheet },
        { label: 'Produtos arquivados', value: summary?.archivedProducts, icon: Archive },
      ];
  function filter(change: () => void) {
    change();
    setPage(1);
  }
  async function archive(item: ProductRow | SupplierRow) {
    setError('');
    setMessage('');
    setBusyId(item.id);
    try {
      await catalog.archive(item);
      setMessage(
        `${isProducts ? 'Produto' : 'Fornecedor'} ${item.status === 'ACTIVE' ? 'arquivado' : 'reativado'}${demo ? ' na demonstração' : ''}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível alterar o registro.');
    } finally {
      setBusyId('');
    }
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
    const result = await catalog.applyImport(input, preview);
    setMessage(
      result.duplicate
        ? 'Este arquivo já foi importado. Nenhum produto foi reprocessado.'
        : `Catálogo ${demo ? 'aplicado na demonstração' : 'importado'}: ${result.item.createdCount} ${result.item.createdCount === 1 ? 'novo' : 'novos'} e ${result.item.updatedCount} ${result.item.updatedCount === 1 ? 'atualizado' : 'atualizados'}.`,
    );
    setPage(1);
  }
  async function discoverSuppliers() {
    setError('');
    setMessage('');
    setBusyId('supplier-discovery');
    try {
      const result = await api<typeof discovery>('/v1/suppliers/discover', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setDiscovery(result);
      setMessage(`${result?.candidates.length ?? 0} fontes encontradas com evidências registradas.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível executar a descoberta.');
    } finally {
      setBusyId('');
    }
  }
  return (
    <>
      <Link className="back-link" href={base}>
        <ArrowLeft size={14} />
        Visão geral
      </Link>
      <div className="page-heading catalog-heading">
        <div>
          <div className="page-eyebrow">
            <span className="status-dot" />
            OPERAÇÃO · CATÁLOGO
          </div>
          <h1>
            {isProducts ? 'Produtos' : 'Fornecedores'}
            <span className="heading-dot" aria-hidden="true">
              .
            </span>
          </h1>
          <p>
            {isProducts
              ? 'Custos, disponibilidade e origem. Cada produto com seu histórico.'
              : 'Relações comerciais organizadas. Catálogos com origem conhecida.'}
          </p>
        </div>
        <div className="heading-actions">
          {!isProducts && !demo && (
            <Button
              variant="outline"
              onClick={() => void discoverSuppliers()}
              disabled={!catalog.canWrite || busyId === 'supplier-discovery'}
            >
              <Search size={16} />
              {busyId === 'supplier-discovery' ? 'Buscando fontes...' : 'Buscar fornecedores com IA'}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setImportOpen(true)}
            disabled={!catalog.canWrite || !catalog.suppliers.length}
          >
            <FileUp size={16} />
            Importar catálogo
          </Button>
          <Button
            onClick={() => setForm('new')}
            disabled={!catalog.canWrite || (isProducts && !catalog.suppliers.length)}
          >
            <Plus size={16} />
            {isProducts ? 'Novo produto' : 'Novo fornecedor'}
          </Button>
        </div>
      </div>
      {demo && (
        <div className="catalog-demo-note">
          <ShieldCheck size={16} />
          <span>Dados fictícios. Edições ficam somente neste navegador até recarregar.</span>
          <button
            onClick={() => {
              catalog.resetDemo();
              setMessage('Demonstração restaurada.');
            }}
          >
            Restaurar exemplo <RotateCcw size={12} />
          </button>
        </div>
      )}
      <div className="catalog-summary-grid">
        {cards.map((card, i) => (
          <section className="panel catalog-summary-card" key={card.label}>
            <span className={`catalog-summary-icon tone-${i}`}>
              <card.icon size={19} strokeWidth={1.5} />
            </span>
            <div>
              <span>{card.label}</span>
              <strong>{card.value === undefined ? '—' : number(card.value)}</strong>
            </div>
          </section>
        ))}
      </div>
      {message && (
        <p className="catalog-toast" role="status">
          <ShieldCheck size={16} />
          {message}
          <button onClick={() => setMessage('')} aria-label="Fechar aviso">
            ×
          </button>
        </p>
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {discovery && !isProducts && (
        <section className="panel catalog-panel" aria-live="polite">
          <h2>Fontes encontradas</h2>
          <p>
            Resultados da busca web com links de evidência. Eles ainda não são fornecedores
            aprovados nem têm catálogo sincronizado.
          </p>
          <div className="catalog-records">
            {discovery.candidates.map((candidate) => (
              <article className="catalog-record" key={candidate.sourceUrl}>
                <strong>{candidate.name}</strong>
                <p>{candidate.summary}</p>
                <a className="text-link" href={candidate.sourceUrl} target="_blank" rel="noreferrer">
                  Abrir fonte <ArrowUpRight size={12} />
                </a>
                {candidate.catalogUrl && (
                  <a className="text-link" href={candidate.catalogUrl} target="_blank" rel="noreferrer">
                    Abrir catálogo <ArrowUpRight size={12} />
                  </a>
                )}
                {candidate.risks.length > 0 && <small>Riscos: {candidate.risks.join(' ')}</small>}
              </article>
            ))}
          </div>
          {discovery.limitations.length > 0 && (
            <small>Limitações: {discovery.limitations.join(' ')}</small>
          )}
        </section>
      )}
      <section className="panel catalog-content">
        <div className="catalog-toolbar">
          <div className="catalog-search">
            <Search size={16} />
            <input
              aria-label={isProducts ? 'Buscar produtos' : 'Buscar fornecedores'}
              placeholder={
                isProducts ? 'Buscar por nome, SKU ou categoria...' : 'Buscar por nome ou CNPJ...'
              }
              value={q}
              onChange={(e) => filter(() => setQ(e.target.value))}
            />
          </div>
          <div className="catalog-filters">
            <label className="sr-only" htmlFor="catalog-status">
              Status do catálogo
            </label>
            <select
              id="catalog-status"
              value={status}
              onChange={(e) => filter(() => setStatus(e.target.value))}
            >
              <option value="ACTIVE">Ativos</option>
              <option value="ARCHIVED">Arquivados</option>
              <option value="ALL">Todos os status</option>
            </select>
            {isProducts && (
              <>
                <label className="sr-only" htmlFor="catalog-supplier-filter">
                  Filtrar fornecedor
                </label>
                <select
                  id="catalog-supplier-filter"
                  value={supplierId}
                  onChange={(e) => filter(() => setSupplierId(e.target.value))}
                >
                  <option value="">Todos os fornecedores</option>
                  {catalog.suppliers.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setHistoryOpen(true);
              }}
              aria-label="Histórico de importações"
            >
              <History size={17} />
            </Button>
          </div>
        </div>
        <div className="catalog-list-meta">
          <span>
            {number(catalog.total)} {isProducts ? 'produtos' : 'fornecedores'}{' '}
            {q ? 'encontrados' : 'no filtro atual'}
          </span>
          <span className="source-label">{demo ? 'Simulado' : 'Dados do workspace'}</span>
        </div>
        {catalog.error ? (
          <div className="inline-empty">
            <CircleAlert size={27} />
            <strong>Não foi possível consultar o catálogo</strong>
            <p>{catalog.error.message}</p>
            <Button variant="outline" onClick={() => void catalog.refresh()}>
              Tentar novamente
            </Button>
          </div>
        ) : catalog.isPending ? (
          <div className="catalog-loading" role="status">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="catalog-skeleton-row" />
            ))}
            <span>Carregando catálogo...</span>
          </div>
        ) : !catalog.items.length ? (
          <div className="catalog-empty">
            <span className="future-icon">
              {isProducts ? <Boxes size={33} /> : <Truck size={33} />}
            </span>
            <h2>
              {q || status === 'ARCHIVED'
                ? 'Nenhum resultado neste filtro'
                : isProducts
                  ? 'Seu catálogo começa aqui'
                  : 'Conecte sua próxima oportunidade'}
            </h2>
            <p>
              {q || status === 'ARCHIVED'
                ? 'Ajuste a busca ou o status para encontrar outros registros.'
                : isProducts
                  ? 'Cadastre produtos ou importe um arquivo autorizado do fornecedor.'
                  : 'Cadastre um fornecedor e organize contatos, prazos e custos em um só lugar.'}
            </p>
            {!q && status !== 'ARCHIVED' && (
              <Button
                onClick={() => setForm('new')}
                disabled={!catalog.canWrite || (isProducts && !catalog.suppliers.length)}
              >
                <Plus size={16} />
                {isProducts ? 'Cadastrar produto' : 'Cadastrar fornecedor'}
              </Button>
            )}
            {isProducts && !catalog.suppliers.length && (
              <Link href={`${base}/suppliers`} className="text-link">
                Cadastre um fornecedor primeiro <ArrowUpRight size={13} />
              </Link>
            )}
          </div>
        ) : isProducts ? (
          <div className="table-scroll">
            <table className="catalog-products-table">
              <thead>
                <tr>
                  <th>Produto / SKU</th>
                  <th>Fornecedor</th>
                  <th>Custo unitário</th>
                  <th>Disponibilidade</th>
                  <th>Origem</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(catalog.items as ProductRow[]).map((item) => (
                  <tr key={item.id}>
                    <td>
                      <button className="catalog-product-name" onClick={() => setDetails(item)}>
                        <span className="product-icon tone-0">
                          <Package size={21} strokeWidth={1.4} />
                        </span>
                        <span>
                          <strong>{item.name}</strong>
                          <small>
                            {item.sku} <span>·</span> {item.category}
                          </small>
                        </span>
                      </button>
                    </td>
                    <td>
                      <span>{item.supplier.name}</span>
                      {item.supplier.status === 'ARCHIVED' && (
                        <small className="catalog-warning">Fornecedor arquivado</small>
                      )}
                      <small className="catalog-subtext">
                        Postagem em {daysLabel(item.shippingDays)}
                      </small>
                    </td>
                    <td>
                      <strong className="table-money">{money(item.costCents)}</strong>
                      <small className="catalog-subtext">
                        + {money(item.shippingCostCents)} logística
                      </small>
                    </td>
                    <td>
                      <span
                        className={cn(
                          'catalog-stock',
                          item.stock === 0 ? 'stock-empty' : 'stock-available',
                        )}
                      >
                        <i />
                        {item.stock === 0 ? 'Sem estoque' : `${number(item.stock)} disponíveis`}
                      </span>
                      {item.status === 'ARCHIVED' && (
                        <small className="catalog-subtext">Produto arquivado</small>
                      )}
                    </td>
                    <td>
                      <span className="subtle-tag">
                        {item.source === 'MANUAL' ? 'Manual' : item.source}
                      </span>
                      <small className="catalog-subtext">
                        {new Intl.DateTimeFormat('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          timeZone: 'America/Sao_Paulo',
                        }).format(new Date(item.updatedAt))}
                      </small>
                    </td>
                    <td>
                      <div className="catalog-row-actions">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Ver histórico de ${item.name}`}
                          onClick={() => setDetails(item)}
                        >
                          <Eye size={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Editar ${item.name}`}
                          onClick={() => setForm(item)}
                          disabled={!catalog.canWrite || item.supplier.status !== 'ACTIVE'}
                        >
                          <Pencil size={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`${item.status === 'ACTIVE' ? 'Arquivar' : 'Reativar'} ${item.name}`}
                          onClick={() => void archive(item)}
                          disabled={!catalog.canWrite || busyId === item.id}
                        >
                          {item.status === 'ACTIVE' ? (
                            <Archive size={15} />
                          ) : (
                            <ArchiveRestore size={15} />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="supplier-card-grid">
            {(catalog.items as SupplierRow[]).map((item) => (
              <article className="supplier-card" key={item.id}>
                <div className="supplier-card-top">
                  <span className="supplier-avatar">
                    {item.name
                      .split(' ')
                      .map((s) => s[0])
                      .slice(0, 2)
                      .join('')}
                  </span>
                  <span
                    className={cn(
                      'catalog-stock',
                      item.status === 'ACTIVE' ? 'stock-available' : 'stock-empty',
                    )}
                  >
                    <i />
                    {item.status === 'ACTIVE' ? 'Ativo' : 'Arquivado'}
                  </span>
                </div>
                <h2>{item.name}</h2>
                <p className="supplier-cnpj">{item.cnpj ?? 'CNPJ não informado'}</p>
                <div className="supplier-contact">
                  {item.contactName && <span>{item.contactName}</span>}
                  {item.email && (
                    <span>
                      <Mail size={13} />
                      {item.email}
                    </span>
                  )}
                  {item.phone && (
                    <span>
                      <Phone size={13} />
                      {item.phone}
                    </span>
                  )}
                  {!item.contactName && !item.email && !item.phone && (
                    <span>Contato ainda não informado</span>
                  )}
                </div>
                <div className="supplier-operational">
                  <span>
                    <Clock3 size={14} />
                    <strong>{daysLabel(item.shippingDays)}</strong>
                    <small>Postagem</small>
                  </span>
                  <span>
                    <Truck size={14} />
                    <strong>{money(item.shippingCostCents)}</strong>
                    <small>Logística</small>
                  </span>
                  <span>
                    <Star size={14} />
                    <strong>{item.rating ? `${item.rating}/5` : '—'}</strong>
                    <small>Avaliação interna</small>
                  </span>
                </div>
                <div className="supplier-card-footer">
                  <Link href={`${base}/products?fornecedor=${item.id}`}>
                    Ver catálogo
                    <ArrowUpRight size={14} />
                  </Link>
                  <div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Editar ${item.name}`}
                      onClick={() => setForm(item)}
                      disabled={!catalog.canWrite}
                    >
                      <Pencil size={15} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${item.status === 'ACTIVE' ? 'Arquivar' : 'Reativar'} ${item.name}`}
                      onClick={() => void archive(item)}
                      disabled={!catalog.canWrite || busyId === item.id}
                    >
                      {item.status === 'ACTIVE' ? (
                        <Archive size={15} />
                      ) : (
                        <ArchiveRestore size={15} />
                      )}
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
        {catalog.total > 0 && (
          <div className="catalog-pagination">
            <span>
              Página {page} de {Math.max(1, Math.ceil(catalog.total / 20))}
            </span>
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
              >
                <ArrowLeft size={13} />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={page * 20 >= catalog.total}
              >
                Próxima
                <ArrowRight size={13} />
              </Button>
            </div>
          </div>
        )}
      </section>
      <div className="catalog-bottom-note">
        <ShieldCheck size={15} />
        <span>
          {isProducts
            ? 'Custos e estoques refletem o último cadastro ou arquivo importado. Não são dados sincronizados em tempo real.'
            : 'A avaliação é interna. CNPJ com dígitos válidos não comprova situação cadastral ou confiabilidade do fornecedor.'}
        </span>
      </div>
      {form && (
        <RecordForm
          kind={kind}
          item={form === 'new' ? undefined : form}
          suppliers={catalog.suppliers}
          demo={demo}
          onClose={() => setForm(null)}
          onSave={async (input, item) => {
            await catalog.save(input, item);
            setMessage(`Cadastro ${demo ? 'demonstrativo ' : ''}salvo.`);
          }}
        />
      )}
      {importOpen && (
        <ImportDialog
          suppliers={catalog.suppliers}
          demo={demo}
          onClose={() => setImportOpen(false)}
          onApply={applyImport}
        />
      )}{' '}
      {details && (
        <ProductDetail
          item={details}
          demo={demo}
          onClose={() => setDetails(null)}
          loadHistory={catalog.history}
        />
      )}
      {historyOpen && (
        <ImportHistory demo={demo} load={catalog.imports} onClose={() => setHistoryOpen(false)} />
      )}
    </>
  );
}
function ImportHistory({
  demo,
  load,
  onClose,
}: {
  demo: boolean;
  load: () => Promise<CatalogImportRow[]>;
  onClose: () => void;
}) {
  const { data, error, isPending } = useQuery({
    queryKey: ['catalog', 'import-history', demo],
    queryFn: load,
    staleTime: 0,
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="catalog-dialog">
        <DialogTitle>Histórico de importações</DialogTitle>
        <DialogDescription>
          {demo
            ? 'Importações locais desta demonstração.'
            : 'Últimas 20 importações do workspace. Arquivos originais não são armazenados.'}
        </DialogDescription>
        {isPending ? (
          <p className="loading-panel">Carregando importações...</p>
        ) : error ? (
          <p className="form-error" role="alert">
            {error.message}
          </p>
        ) : !data?.length ? (
          <div className="inline-empty">
            <FileSpreadsheet size={30} />
            <strong>Nenhum catálogo importado ainda</strong>
            <p>As importações concluídas aparecerão aqui com origem, responsável e contagens.</p>
          </div>
        ) : (
          <div className="catalog-import-history">
            {data.map((item) => (
              <article key={item.id}>
                <FileSpreadsheet size={22} />
                <div>
                  <strong>{item.fileName}</strong>
                  <span>
                    {item.supplier.name} · {item.format}
                  </span>
                  <small>
                    {item.createdCount} novos · {item.updatedCount} atualizados ·{' '}
                    {item.unchangedCount} sem alteração
                  </small>
                  <small>
                    {new Intl.DateTimeFormat('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                      timeZone: 'America/Sao_Paulo',
                    }).format(new Date(item.createdAt))}{' '}
                    · {item.actor?.name ?? 'Sistema'}
                  </small>
                </div>
              </article>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
