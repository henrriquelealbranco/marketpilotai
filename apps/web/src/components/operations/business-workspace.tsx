'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  ArrowUpRight,
  Download,
  MessageSquare,
  Plus,
  RefreshCw,
  ScanSearch,
  Send,
  ShieldCheck,
} from 'lucide-react';
import {
  type AlertRow,
  type AnalyticsReport,
  type CatalogPage,
  type ListingRow,
  type MessageRow,
  type ObservationRow,
  type OrderRow,
  type ProductRow,
} from '@marketpilot/contracts';
import { api, money, number } from '@/lib/utils';
import { Button } from '../ui/button';
import { initialDemoCatalog } from '../catalog/demo-data';
import { demoAlerts, demoListings, demoOrders, simulateAnalysis } from './demo';
import { date, Empty, Evidence, Status, useOperations } from './operations-workspace';

function useAction(demo: boolean) {
  const client = useQueryClient(),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(false);
  async function run(path: string, body: unknown, method = 'POST') {
    setMessage('');
    setError(false);
    setPending(true);
    try {
      if (demo) {
        setMessage('Alteração simulada somente nesta demonstração.');
        return;
      }
      await api(path, { method, body: JSON.stringify(body) });
      await client.invalidateQueries();
      setMessage('Alteração registrada.');
    } catch (e) {
      setError(true);
      setMessage(e instanceof Error ? e.message : 'Confira os dados informados.');
      throw e;
    } finally {
      setPending(false);
    }
  }
  return {
    run,
    pending,
    feedback: message ? (
      <p role={error ? 'alert' : 'status'} className="control-feedback" data-error={error}>
        {message}
      </p>
    ) : null,
  };
}
function useProducts(demo: boolean) {
  return useQuery({
    queryKey: ['operation-products', demo],
    queryFn: async () =>
      demo
        ? initialDemoCatalog().products
        : (await api<CatalogPage<ProductRow>>('/v1/products?pageSize=100')).items,
  });
}
function ProductSelect({ products }: { products: ProductRow[] | undefined }) {
  return (
    <label>
      Produto
      <select name="productId" required defaultValue="">
        <option value="" disabled>
          Selecione um produto ativo
        </option>
        {products
          ?.filter((p) => p.status === 'ACTIVE')
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.sku}
            </option>
          ))}
      </select>
    </label>
  );
}
function currencyField(data: FormData, key: string) {
  const value = String(data.get(key) ?? '')
    .trim()
    .replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error('Use um valor em reais com até duas casas decimais.');
  return Math.round(Number(value) * 100);
}
const jsonForm = (form: HTMLFormElement) => new FormData(form);
function RowsError({ error }: { error: Error | null }) {
  return error ? (
    <p role="alert" className="error-banner">
      {error.message}
    </p>
  ) : null;
}
export function BusinessWorkspace({ slug, demo }: { slug: string; demo: boolean }) {
  return slug === 'hunter' ? (
    <Hunter demo={demo} />
  ) : slug === 'market' ? (
    <Market demo={demo} />
  ) : slug === 'orders' ? (
    <Orders demo={demo} />
  ) : slug === 'listings' ? (
    <Listings demo={demo} />
  ) : slug === 'analytics' ? (
    <Analytics demo={demo} />
  ) : slug === 'assistant' ? (
    <Assistant demo={demo} />
  ) : slug === 'alerts' ? (
    <Alerts demo={demo} />
  ) : (
    <Integrations demo={demo} />
  );
}
function Hunter({ demo }: { demo: boolean }) {
  const products = useProducts(demo),
    ops = useOperations(demo),
    action = useAction(demo);
  const rows = products.data ?? [];
  const last = ops.data?.runs.find((r) => r.agent === 'product-hunter' && r.status === 'COMPLETED');
  const output = last?.outputJson as
    | {
        opportunities?: {
          productId: string;
          score: number;
          eligible: boolean;
          evidence: unknown;
          unknownSignals: string[];
        }[];
      }
    | undefined;
  return (
    <div className="control-center">
      <div className="control-toolbar">
        <div className="control-title">
          <h2>Do catálogo à oportunidade</h2>
          <p>
            Margem, disponibilidade, prazo e qualidade dos dados. Demanda e concorrência precisam de
            fontes.
          </p>
        </div>
        <Button
          disabled={action.pending || !ops.canWrite}
          onClick={() =>
            demo
              ? ops.setDemo((old) => simulateAnalysis(old))
              : void action
                  .run('/v1/agents/product-hunter/run', { provider: 'rules' })
                  .catch(() => {})
          }
        >
          <ScanSearch size={15} />
          {demo ? 'Simular descoberta' : 'Analisar catálogo'}
        </Button>
      </div>
      {action.feedback}
      <RowsError error={products.error} />
      {last && (
        <section className="control-panel">
          <h2>Descobertas e riscos do catálogo</h2>
          <p>
            O resultado inclui mudanças de custo, possíveis equivalentes e candidatos a kits para
            revisão. Cada kit precisa de confirmação comercial e cotação própria.
          </p>
          <Evidence value={last.outputJson} label="Consultar evidências, equivalentes e kits" />
        </section>
      )}
      <section className="control-panel">
        <div className="control-table-scroll">
          <table className="control-table">
            <thead>
              <tr>
                <th>Produto e fornecedor</th>
                <th>Custo + frete</th>
                <th>Disponibilidade</th>
                <th>Score observado</th>
                <th>Fonte e atualização</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const found = output?.opportunities?.find((o) => o.productId === p.id);
                return (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      <small>
                        {p.supplier.name} · {p.category}
                      </small>
                    </td>
                    <td>
                      {money(p.costCents + p.shippingCostCents)}
                      <small>Antes de taxas e tributos</small>
                    </td>
                    <td>
                      {p.stock} unidades<small>Postagem: {p.shippingDays} dias</small>
                    </td>
                    <td>
                      {found ? `${found.score}/100` : 'Ainda não analisado'}
                      {found && (
                        <>
                          <small>
                            {found.eligible
                              ? 'Elegível nos sinais disponíveis'
                              : 'Revisão necessária'}
                          </small>
                          <Evidence value={found} />
                        </>
                      )}
                    </td>
                    <td>
                      {p.source}
                      <small>{date(p.updatedAt)}</small>
                      {p.sourceUrl && (
                        <a
                          className="control-link"
                          href={p.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Consultar origem
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <Empty title="Seu próximo produto começa pelo catálogo">
            Cadastre fornecedores e importe produtos autorizados para iniciar a análise.
          </Empty>
        )}
      </section>
      <div className="control-grid">
        <div className="control-panel">
          <h3>Custos que mudaram</h3>
          <p>
            Consulte o histórico em cada produto. Uma cotação com custo desatualizado bloqueia a
            publicação.
          </p>
        </div>
        <div className="control-panel">
          <h3>Comparáveis e kits</h3>
          <p>
            Agrupe produtos equivalentes por categoria e confira atributos nas observações de
            mercado. Kits precisam de estoque, logística e cotação próprios.
          </p>
        </div>
        <div className="control-panel">
          <h3>Decisão rastreável</h3>
          <p>As recomendações e suas evidências ficam no histórico da central.</p>
          <Link className="control-link" href={`${demo ? '/demo' : '/app'}/operations`}>
            Revisar decisões <ArrowUpRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}
function Market({ demo }: { demo: boolean }) {
  const products = useProducts(demo),
    action = useAction(demo),
    ops = useOperations(demo),
    [local, setLocal] = useState<ObservationRow[]>([]),
    [formError, setFormError] = useState('');
  const query = useQuery({
    queryKey: ['market-observations', demo],
    queryFn: () => api<{ items: ObservationRow[] }>('/v1/market/observations'),
    enabled: !demo,
  });
  const rows = demo ? local : (query.data?.items ?? []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError('');
    const form = e.currentTarget,
      data = jsonForm(form);
    try {
      const input = {
        productId: String(data.get('productId')),
        title: String(data.get('title')),
        priceCents: currencyField(data, 'price'),
        sourceUrl: String(data.get('sourceUrl')),
        authorized: data.get('authorized') === 'on',
        ...(String(data.get('competition')).trim()
          ? {
              competitionBps: Math.round(
                Number(String(data.get('competition')).replace(',', '.')) * 100,
              ),
            }
          : {}),
        attributes: JSON.parse(String(data.get('attributes') || '{}')),
      };
      if (demo)
        setLocal((old) => [
          {
            id: crypto.randomUUID(),
            ...input,
            source: 'SIMULATED',
            observedAt: new Date().toISOString(),
          },
          ...old,
        ]);
      else await action.run('/v1/market/observations', input);
      form.reset();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Confira os campos.');
    }
  }
  return (
    <div className="control-center">
      <div className="control-note">
        <strong>Comparação com origem verificável</strong>
        <p>
          Registre preços observados em fontes que você tem autorização para utilizar. Acesso a
          pesquisas do marketplace depende das permissões disponíveis para a conta; não há coleta
          automática de demanda.
        </p>
      </div>
      {action.feedback}
      <RowsError error={query.error} />
      <section className="control-panel">
        <h2>Adicionar comparável</h2>
        <form className="control-form" onSubmit={submit}>
          <ProductSelect products={products.data} />
          <label>
            Nome do anúncio
            <input name="title" required minLength={3} maxLength={160} />
          </label>
          <label>
            Preço observado (R$)
            <input name="price" inputMode="decimal" required placeholder="99,90" />
          </label>
          <label>
            URL da fonte autorizada
            <input name="sourceUrl" type="url" required maxLength={1000} />
          </label>
          <label className="full">
            Pressão competitiva observada (0 a 100, opcional)
            <input
              name="competition"
              inputMode="decimal"
              placeholder="Avaliação interna, com base na fonte"
            />
            <small>
              0: pressão baixa; 100: intensa. É uma avaliação declarada, sem inferir demanda ou
              volume de vendas.
            </small>
          </label>
          <label className="full">
            Atributos observados (JSON)
            <textarea name="attributes" defaultValue={'{"marca":"","modelo":""}'} />
          </label>
          <label className="control-check full">
            <input type="checkbox" name="authorized" required />
            Tenho autorização para registrar os dados desta fonte.
          </label>
          <Button type="submit" disabled={action.pending || !ops.canWrite}>
            <Plus size={14} />
            {demo ? 'Adicionar observação simulada' : 'Registrar observação'}
          </Button>
          {formError && (
            <p role="alert" className="form-error">
              {formError}
            </p>
          )}
        </form>
      </section>
      <section className="control-panel">
        <h2>Histórico de preços e atributos</h2>
        {!rows.length ? (
          <Empty title="Nenhum comparável registrado">
            Adicione uma observação com fonte. Cada registro preserva o preço e a data para
            comparação histórica.
          </Empty>
        ) : (
          <div className="control-records">
            {rows.map((row) => (
              <article className="control-record" key={row.id}>
                <div className="control-toolbar">
                  <strong>{row.title}</strong>
                  <strong className="control-highlight">{money(row.priceCents)}</strong>
                </div>
                <p>
                  {date(row.observedAt)} · {row.source}
                </p>
                <a className="control-link" href={row.sourceUrl} target="_blank" rel="noreferrer">
                  Consultar fonte
                </a>
                <Evidence value={row} label="Ver atributos e vínculo" />
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
function Orders({ demo }: { demo: boolean }) {
  const query = useQuery({
      queryKey: ['orders', demo],
      queryFn: async () =>
        demo ? { items: demoOrders() } : api<{ items: OrderRow[] }>('/v1/orders'),
    }),
    products = useProducts(demo),
    ops = useOperations(demo),
    action = useAction(demo),
    client = useQueryClient(),
    [show, setShow] = useState(false),
    [error, setError] = useState(''),
    [q, setQ] = useState('');
  const rows = (query.data?.items ?? []).filter((row) =>
    `${row.externalId} ${row.productName} ${row.supplierName}`
      .toLowerCase()
      .includes(q.toLowerCase()),
  );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const form = e.currentTarget,
      data = jsonForm(form);
    try {
      const input = {
        externalId: String(data.get('externalId')),
        productId: String(data.get('productId')),
        amountCents: currencyField(data, 'amount'),
        costCents: currencyField(data, 'cost'),
        quantity: Number(data.get('quantity')),
        status: String(data.get('status')),
        costsConfirmed: data.get('confirmed') === 'on',
      };
      if (demo) {
        const p = products.data!.find((p) => p.id === input.productId)!;
        client.setQueryData<{ items: OrderRow[] }>(['orders', true], (old) => ({
          items: [
            {
              ...input,
              id: crypto.randomUUID(),
              source: 'SIMULATED',
              productName: p.name,
              supplierName: p.supplier.name,
              category: p.category,
              tracking: null,
              orderedAt: new Date().toISOString(),
            },
            ...(old?.items ?? []),
          ],
        }));
      } else await action.run('/v1/orders', input);
      form.reset();
      setShow(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Confira os dados.');
    }
  }
  return (
    <div className="control-center">
      <div className="control-toolbar">
        <p>Custos totais por pedido · nenhuma compra, pagamento ou reembolso automático.</p>
        <div className="control-actions">
          <Button
            variant="outline"
            disabled={demo || action.pending || !ops.canWrite}
            onClick={() => void action.run('/v1/orders/sync', {}).catch(() => {})}
          >
            <RefreshCw size={14} />
            Sincronizar Mercado Livre
          </Button>
          <Button disabled={!ops.canWrite} onClick={() => setShow(!show)}>
            <Plus size={14} />
            Registrar pedido
          </Button>
        </div>
      </div>
      {action.feedback}
      <RowsError error={query.error} />
      {show && (
        <section className="control-panel">
          <h2>Novo pedido {demo ? 'demonstrativo' : 'manual'}</h2>
          <form onSubmit={submit} className="control-form">
            <ProductSelect products={products.data} />
            <label>
              Identificador do pedido
              <input name="externalId" required maxLength={100} />
            </label>
            <label>
              Valor total (R$)
              <input name="amount" inputMode="decimal" required />
            </label>
            <label>
              Custo total, incluindo taxas e frete (R$)
              <input name="cost" inputMode="decimal" required />
            </label>
            <label>
              Quantidade
              <input name="quantity" type="number" min={1} max={10000} defaultValue={1} required />
            </label>
            <label>
              Status
              <select name="status">
                <option value="processing">Em processamento</option>
                <option value="shipping">Em transporte</option>
                <option value="delivered">Entregue</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </label>
            <label className="control-check full">
              <input type="checkbox" name="confirmed" />
              Custos completos conferidos
            </label>
            <Button disabled={action.pending} type="submit">
              Salvar pedido
            </Button>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
          </form>
        </section>
      )}
      <section className="control-panel">
        <label className="sr-only" htmlFor="orders-search">
          Buscar pedidos
        </label>
        <input
          id="orders-search"
          className="control-search"
          placeholder="Buscar pedido, produto ou fornecedor…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="control-table-scroll">
          <table className="control-table">
            <thead>
              <tr>
                <th>Pedido / produto</th>
                <th>Fornecedor</th>
                <th>Valores</th>
                <th>Etapa</th>
                <th>Conferência</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.externalId}</strong>
                    <small>
                      {row.productName} · {row.quantity} un.
                    </small>
                    <small>
                      {date(row.orderedAt)} · {row.source}
                    </small>
                  </td>
                  <td>
                    {row.supplierName}
                    <small>Comprador: dados minimizados</small>
                  </td>
                  <td>
                    {money(row.amountCents)}
                    <small>
                      Custo:{' '}
                      {row.source.endsWith('COST_INCOMPLETE') ? 'a conferir' : money(row.costCents)}
                    </small>
                    <small>
                      {row.costsConfirmed ? 'Custos confirmados' : 'Estimativa / revisão pendente'}
                    </small>
                  </td>
                  <td>
                    <Status value={row.status} />
                    <small>{row.tracking ?? 'Sem rastreamento informado'}</small>
                  </td>
                  <td>
                    <details>
                      <summary className="control-link">Conferir pedido</summary>
                      <form
                        className="control-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const data = jsonForm(e.currentTarget);
                          try {
                            const input = {
                              status: String(data.get('status')),
                              tracking: String(data.get('tracking')),
                              costCents: currencyField(data, 'cost'),
                              costsConfirmed: data.get('confirmed') === 'on',
                            };
                            if (demo)
                              client.setQueryData<{ items: OrderRow[] }>(
                                ['orders', true],
                                (old) => ({
                                  items: old!.items.map((item) =>
                                    item.id === row.id ? { ...item, ...input } : item,
                                  ),
                                }),
                              );
                            else
                              void action
                                .run(`/v1/orders/${row.id}`, input, 'PATCH')
                                .catch(() => {});
                          } catch (e) {
                            setError(e instanceof Error ? e.message : 'Confira o valor.');
                          }
                        }}
                      >
                        <label className="full">
                          Status
                          <select name="status" defaultValue={row.status}>
                            {['processing', 'shipping', 'delivered', 'cancelled'].map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="full">
                          Custo total (R$)
                          <input
                            name="cost"
                            defaultValue={(row.costCents / 100).toFixed(2)}
                            required
                          />
                        </label>
                        <label className="full">
                          Rastreamento
                          <input
                            name="tracking"
                            defaultValue={row.tracking ?? ''}
                            maxLength={120}
                          />
                        </label>
                        <label className="control-check full">
                          <input
                            name="confirmed"
                            type="checkbox"
                            defaultChecked={row.costsConfirmed}
                          />
                          Custos conferidos
                        </label>
                        <Button type="submit" size="sm" disabled={action.pending || !ops.canWrite}>
                          Salvar conferência
                        </Button>
                      </form>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <Empty title="Nenhum pedido encontrado">
            Registre um pedido manual ou conecte sua conta para consultar vendas autorizadas.
          </Empty>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
function Listings({ demo }: { demo: boolean }) {
  const query = useQuery({
      queryKey: ['listings', demo],
      queryFn: async () =>
        demo ? { items: demoListings() } : api<{ items: ListingRow[] }>('/v1/listings'),
    }),
    products = useProducts(demo),
    ops = useOperations(demo),
    action = useAction(demo),
    client = useQueryClient(),
    [show, setShow] = useState(false),
    [error, setError] = useState('');
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const data = jsonForm(e.currentTarget);
    try {
      const input = {
        productId: String(data.get('productId')),
        title: String(data.get('title')),
        publicationModel: String(data.get('publicationModel')),
        description: String(data.get('description')),
        priceCents: currencyField(data, 'price'),
        stock: Number(data.get('stock')),
        categoryId: String(data.get('categoryId')),
        listingTypeId: String(data.get('listingTypeId')),
        pictures: String(data.get('pictures'))
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        attributes: JSON.parse(String(data.get('attributes') || '[]')),
      };
      if (demo)
        client.setQueryData<{ items: ListingRow[] }>(['listings', true], (old) => ({
          items: [
            {
              ...input,
              id: crypto.randomUUID(),
              externalId: null,
              status: 'DRAFT',
              version: 1,
              createdAt: new Date().toISOString(),
            },
            ...(old?.items ?? []),
          ],
        }));
      else await action.run('/v1/listings', input);
      setShow(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Confira os dados.');
    }
  }
  return (
    <div className="control-center">
      <div className="control-toolbar">
        <div className="control-title">
          <h2>Preparar, revisar, publicar</h2>
          <p>
            Uma cotação válida e aprovação humana são necessárias para publicar ou alterar preço e
            estoque.
          </p>
        </div>
        <Button disabled={!ops.canWrite} onClick={() => setShow(!show)}>
          <Plus size={14} />
          Novo rascunho
        </Button>
      </div>
      {action.feedback}
      <RowsError error={query.error} />
      {show && (
        <section className="control-panel">
          <h2>Dados do anúncio</h2>
          <form className="control-form" onSubmit={submit}>
            <ProductSelect products={products.data} />
            <label>
              Título do anúncio
              <input name="title" required minLength={5} maxLength={60} />
            </label>
            <label>
              Preço de venda (R$)
              <input name="price" inputMode="decimal" required />
            </label>
            <label>
              Estoque a disponibilizar
              <input name="stock" type="number" min={1} max={1000000} required />
            </label>
            <label>
              Categoria oficial (MLB…)
              <input
                name="categoryId"
                required
                pattern="MLB[0-9]+"
                placeholder="ID confirmado no Mercado Livre"
              />
            </label>
            <label>
              Modelo da conta
              <select name="publicationModel">
                <option value="USER_PRODUCT">User Products · family_name</option>
                <option value="LEGACY">Legacy · title</option>
              </select>
            </label>
            <label>
              Tipo de anúncio
              <select name="listingTypeId">
                <option value="gold_special">Clássico · gold_special</option>
                <option value="gold_pro">Premium · gold_pro</option>
              </select>
            </label>
            <label className="full">
              Imagens autorizadas, uma URL HTTPS por linha
              <textarea name="pictures" required placeholder="https://…" />
            </label>
            <label className="full">
              Atributos exigidos pela categoria (JSON)
              <textarea name="attributes" defaultValue={'[{"id":"BRAND","value_name":""}]'} />
            </label>
            <label className="full">
              Descrição em texto simples
              <textarea name="description" maxLength={5000} />
              <small>
                Após a criação aprovada, a descrição é enviada pelo recurso oficial de descrições.
              </small>
            </label>
            <Button disabled={action.pending} type="submit">
              Salvar rascunho
            </Button>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
          </form>
        </section>
      )}
      <div className="control-records">
        {query.data?.items.map((row) => (
          <article key={row.id} className="control-panel">
            <div className="control-toolbar">
              <div className="control-title">
                <h3>{row.title}</h3>
                <p>
                  {money(row.priceCents)} · {row.stock} unidades · versão {row.version}
                </p>
              </div>
              <Status value={row.status} />
            </div>
            <p style={{ marginTop: 14 }}>{row.description || 'Sem descrição de trabalho.'}</p>
            <ListingEditor
              row={row}
              demo={demo}
              canWrite={ops.canWrite}
              save={action.run}
              pending={action.pending}
            />
            {!demo &&
              ops.admin &&
              ['EXECUTING', 'RECONCILIATION_REQUIRED', 'PUBLISHED_DESCRIPTION_PENDING'].includes(
                row.status,
              ) && (
                <details className="control-record">
                  <summary className="control-link">
                    Conferir vínculo externo sem republicar
                  </summary>
                  <form
                    className="control-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget);
                      void action
                        .run(`/v1/listings/${row.id}/reconcile`, {
                          externalId: String(data.get('externalId')),
                          reviewed: data.get('reviewed') === 'on',
                          reference: String(data.get('reference')),
                        })
                        .catch(() => {});
                    }}
                  >
                    <label>
                      ID confirmado na conta
                      <input
                        name="externalId"
                        required
                        pattern="MLB[0-9]+"
                        defaultValue={row.externalId ?? ''}
                      />
                    </label>
                    <label>
                      Referência da conferência
                      <input name="reference" required minLength={5} maxLength={1000} />
                    </label>
                    <label className="control-check full">
                      <input name="reviewed" type="checkbox" required />
                      Conferi conteúdo, descrição, preço e estoque na conta autorizada.
                    </label>
                    <Button type="submit" disabled={action.pending}>
                      Consultar e registrar vínculo
                    </Button>
                  </form>
                </details>
              )}
            <div className="control-toolbar" style={{ marginTop: 18 }}>
              <small>
                {row.externalId ?? 'Sem publicação externa'} · {date(row.createdAt)}
              </small>
              <div className="control-actions">
                {row.externalId ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={action.pending || !ops.canWrite}
                      onClick={() =>
                        void action
                          .run(`/v1/listings/${row.id}/request-approval`, { kind: 'PRICE_UPDATE' })
                          .catch(() => {})
                      }
                    >
                      Solicitar revisão de preço
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={action.pending || !ops.canWrite}
                      onClick={() =>
                        void action
                          .run(`/v1/listings/${row.id}/request-approval`, { kind: 'STOCK_UPDATE' })
                          .catch(() => {})
                      }
                    >
                      Solicitar revisão de estoque
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={action.pending || !ops.canWrite}
                    onClick={() =>
                      demo
                        ? ops.setDemo((old) => simulateAnalysis(old, 'listing-optimizer'))
                        : void action
                            .run(`/v1/listings/${row.id}/request-approval`, {})
                            .catch(() => {})
                    }
                  >
                    <ShieldCheck size={13} />
                    Solicitar aprovação
                  </Button>
                )}
                <Link className="control-link" href={`${demo ? '/demo' : '/app'}/operations`}>
                  Fila de aprovações
                </Link>
              </div>
            </div>
          </article>
        ))}
        {query.data?.items.length === 0 && (
          <section className="control-panel">
            <Empty title="Nenhum rascunho preparado">
              Escolha um produto com cotação, confirme categoria e imagens e prepare o anúncio para
              revisão.
            </Empty>
          </section>
        )}
      </div>
    </div>
  );
}
function ListingEditor({
  row,
  demo,
  canWrite,
  save,
  pending,
}: {
  row: ListingRow;
  demo: boolean;
  canWrite: boolean;
  save: (path: string, input: unknown, method?: string) => Promise<void>;
  pending: boolean;
}) {
  const client = useQueryClient(),
    [error, setError] = useState('');
  const payload = (row.payloadJson ?? {}) as {
    category_id?: string;
    listing_type_id?: string;
    pictures?: { source: string }[];
    attributes?: unknown;
    family_name?: string;
  };
  return (
    <details className="control-record" style={{ marginTop: 15 }}>
      <summary className="control-link">Editar preparação do anúncio</summary>
      <p>
        Salvar uma alteração invalida aprovações anteriores. Alterações de preço e estoque
        publicadas exigem nova revisão.
      </p>
      <form
        className="control-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          const data = new FormData(e.currentTarget);
          try {
            const input = {
              productId: row.productId,
              title: String(data.get('title')),
              description: String(data.get('description')),
              publicationModel: String(data.get('model')),
              priceCents: currencyField(data, 'price'),
              stock: Number(data.get('stock')),
              categoryId: String(data.get('category')),
              listingTypeId: String(data.get('type')),
              pictures: String(data.get('pictures'))
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
              attributes: JSON.parse(String(data.get('attributes') || '[]')),
              version: row.version,
            };
            if (demo)
              client.setQueryData<{ items: ListingRow[] }>(['listings', true], (old) => ({
                items: old!.items.map((item) =>
                  item.id === row.id ? { ...item, ...input, version: item.version + 1 } : item,
                ),
              }));
            else await save(`/v1/listings/${row.id}`, input, 'PUT');
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Confira os campos.');
          }
        }}
      >
        <label>
          Título de trabalho
          <input name="title" defaultValue={row.title} required minLength={5} maxLength={60} />
        </label>
        <label>
          Modelo
          <select
            name="model"
            defaultValue={payload.family_name || demo ? 'USER_PRODUCT' : 'LEGACY'}
          >
            <option value="USER_PRODUCT">User Products</option>
            <option value="LEGACY">Legacy</option>
          </select>
        </label>
        <label>
          Preço preparado (R$)
          <input name="price" defaultValue={(row.priceCents / 100).toFixed(2)} required />
        </label>
        <label>
          Estoque preparado
          <input
            name="stock"
            type="number"
            min={0}
            max={1000000}
            defaultValue={row.stock}
            required
          />
        </label>
        <label>
          Categoria
          <input
            name="category"
            defaultValue={payload.category_id ?? (demo ? 'MLB123' : '')}
            required
            pattern="MLB[0-9]+"
          />
        </label>
        <label>
          Tipo de anúncio
          <input name="type" defaultValue={payload.listing_type_id ?? 'gold_special'} required />
        </label>
        <label className="full">
          Imagens HTTPS
          <textarea
            name="pictures"
            required
            defaultValue={
              payload.pictures?.map((p) => p.source).join('\n') ??
              (demo ? 'https://example.test/imagem-demonstrativa.jpg' : '')
            }
          />
        </label>
        <label className="full">
          Atributos (JSON)
          <textarea name="attributes" defaultValue={JSON.stringify(payload.attributes ?? [])} />
        </label>
        <label className="full">
          Descrição
          <textarea name="description" defaultValue={row.description} maxLength={5000} />
        </label>
        <Button
          disabled={
            pending ||
            !canWrite ||
            ['EXECUTING', 'RECONCILIATION_REQUIRED', 'PUBLISHED_DESCRIPTION_PENDING'].includes(
              row.status,
            )
          }
          type="submit"
        >
          Salvar preparação
        </Button>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}
function demoReport(days: number): AnalyticsReport {
  const orders = demoOrders(days),
    revenue = orders.reduce((n, o) => n + o.amountCents, 0),
    profit = orders.reduce((n, o) => n + o.amountCents - o.costCents, 0);
  const groups = (key: 'category' | 'supplierName') =>
    [...new Set(orders.map((o) => o[key]))].map((name) => {
      const rows = orders.filter((o) => o[key] === name);
      return {
        name,
        revenueCents: rows.reduce((n, o) => n + o.amountCents, 0),
        profitCents: rows.reduce((n, o) => n + o.amountCents - o.costCents, 0),
        orders: rows.length,
      };
    });
  return {
    revenueCents: revenue,
    estimatedProfitCents: profit,
    realizedProfitCents: orders
      .filter((o) => o.costsConfirmed)
      .reduce((n, o) => n + o.amountCents - o.costCents, 0),
    unknownCostOrders: 0,
    orderCount: orders.length,
    marginPercent: (profit / revenue) * 100,
    categories: groups('category'),
    suppliers: groups('supplierName'),
    source: 'simulated',
    days,
    asOf: new Date().toISOString(),
    products: 5,
    supplierCount: 3,
    workflowExecutions: 0,
    workflowFailures: 0,
    orders,
    ai: { runs: 0, inputTokens: 0, outputTokens: 0, knownCostMicrosUsd: 0, unknownCostRuns: 0 },
  };
}
function Analytics({ demo }: { demo: boolean }) {
  const [days, setDays] = useState(30);
  const query = useQuery({
      queryKey: ['analytics', demo, days],
      queryFn: () =>
        demo
          ? Promise.resolve(demoReport(days))
          : api<AnalyticsReport>(`/v1/analytics?days=${days}`),
    }),
    data = query.data;
  function demoCSV() {
    const text =
      'Origem;Produto;Receita BRL;Custo BRL\n' +
      data!.orders
        .map(
          (o) =>
            `Simulado;${o.productName};${(o.amountCents / 100).toFixed(2)};${(o.costCents / 100).toFixed(2)}`,
        )
        .join('\n');
    const url = URL.createObjectURL(
      new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'marketpilot-demo-analytics.csv';
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="control-center">
      <div className="control-toolbar">
        <label>
          Período{' '}
          <select
            className="control-select"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[7, 30, 90].map((n) => (
              <option value={n} key={n}>
                Últimos {n} dias
              </option>
            ))}
          </select>
        </label>
        <div className="control-actions">
          {demo ? (
            <>
              <Button variant="outline" disabled={!data} onClick={demoCSV}>
                <Download size={14} />
                Exportar CSV
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                Imprimir / PDF
              </Button>
            </>
          ) : (
            <>
              <a
                className="button button-outline"
                href={`/api/v1/analytics/export.csv?days=${days}`}
              >
                <Download size={14} />
                Exportar CSV
              </a>
              <a
                className="button button-outline"
                href={`/api/v1/analytics/export.pdf?days=${days}`}
              >
                <Download size={14} />
                Exportar PDF
              </a>
            </>
          )}
        </div>
      </div>
      <RowsError error={query.error} />
      {!data ? (
        <div className="control-skeleton" />
      ) : (
        <>
          <div className="control-note">
            {demo ? 'Dados fictícios da demonstração.' : 'Dados reais registrados no workspace.'}{' '}
            Atualizado em {date(data.asOf)}. Custos não confirmados geram estimativas; somente
            entregas com custos confirmados compõem o lucro realizado.{' '}
            {data.unknownCostOrders > 0
              ? `${data.unknownCostOrders} pedidos com custos ausentes foram excluídos do lucro.`
              : ''}
          </div>
          <div className="control-stats">
            {[
              ['Faturamento', money(data.revenueCents)],
              ['Lucro estimado', money(data.estimatedProfitCents)],
              ['Lucro realizado', money(data.realizedProfitCents)],
              ['Margem dos custos conhecidos', `${data.marginPercent.toFixed(1)}%`],
            ].map(([title, value]) => (
              <div className="control-stat" key={title}>
                <span>{title}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="control-split">
            <section className="control-panel">
              <h2>Receita e lucro por categoria</h2>
              {data.categories.length ? (
                <div className="control-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.categories} margin={{ left: 0, right: 12, bottom: 15 }}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                      />
                      <YAxis
                        tickFormatter={(v) => `${v / 100}`}
                        tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          color: 'var(--foreground)',
                        }}
                        formatter={(value) => money(Number(value))}
                      />
                      <Bar
                        dataKey="revenueCents"
                        name="Faturamento"
                        fill="var(--chart-primary)"
                        radius={[4, 4, 0, 0]}
                        isAnimationActive={false}
                      />
                      <Bar
                        dataKey="profitCents"
                        name="Lucro estimado"
                        fill="var(--chart-secondary)"
                        radius={[4, 4, 0, 0]}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <Empty title="Sem pedidos no período">
                  Registre pedidos para visualizar a distribuição dos resultados.
                </Empty>
              )}
            </section>
            <section className="control-panel">
              <h2>Eficiência e IA</h2>
              <div className="control-records" style={{ marginTop: 20 }}>
                {[
                  ['Pedidos', data.orderCount],
                  ['Produtos ativos', data.products],
                  ['Fornecedores ativos', data.supplierCount],
                  ['Workflows registrados', data.workflowExecutions],
                  ['Falhas de workflows', data.workflowFailures],
                  ['Análises', data.ai.runs],
                  [
                    'Tokens de entrada / saída',
                    `${number(data.ai.inputTokens)} / ${number(data.ai.outputTokens)}`,
                  ],
                  [
                    'Custo de IA conhecido (USD)',
                    `US$ ${(data.ai.knownCostMicrosUsd / 1000000).toFixed(4)}`,
                  ],
                  ['Execuções com tarifa desconhecida', data.ai.unknownCostRuns],
                ].map(([title, value]) => (
                  <div className="control-toolbar" key={title}>
                    <small>{title}</small>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <section className="control-panel">
            <h2>Resultado por fornecedor</h2>
            <div className="control-table-scroll">
              <table className="control-table">
                <thead>
                  <tr>
                    <th>Fornecedor</th>
                    <th>Pedidos</th>
                    <th>Faturamento</th>
                    <th>Lucro estimado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.suppliers.map((s) => (
                    <tr key={s.name}>
                      <td>{s.name}</td>
                      <td>{s.orders}</td>
                      <td>{money(s.revenueCents)}</td>
                      <td>{money(s.profitCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
function Assistant({ demo }: { demo: boolean }) {
  const query = useQuery({
      queryKey: ['assistant', demo],
      queryFn: async () =>
        demo
          ? { items: [] as MessageRow[] }
          : api<{ items: MessageRow[] }>('/v1/assistant/messages'),
    }),
    client = useQueryClient(),
    action = useAction(demo),
    ops = useOperations(demo),
    [question, setQuestion] = useState(''),
    [provider, setProvider] = useState('rules');
  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (demo) {
      const stats = demoReport(30);
      client.setQueryData<{ items: MessageRow[] }>(['assistant', true], (old) => ({
        items: [
          ...(old?.items ?? []),
          {
            id: crypto.randomUUID(),
            question,
            answer: `Exemplo demonstrativo: faturamento fictício ${money(stats.revenueCents)} e ${stats.orderCount} pedidos simulados. Analise custos e disponibilidade antes de recomendar um produto. Nenhuma chamada de IA foi realizada.`,
            evidenceJson: {
              simulation: true,
              revenueCents: stats.revenueCents,
              orders: stats.orderCount,
            },
            provider: 'simulated',
            createdAt: new Date().toISOString(),
          },
        ],
      }));
      setQuestion('');
      return;
    }
    try {
      await action.run('/v1/assistant/messages', { question, provider });
      setQuestion('');
    } catch {}
  }
  return (
    <div className="control-center control-chat">
      <div className="control-note">
        <strong>Respostas com contexto e evidências</strong>
        <p>
          O assistente consulta dados permitidos da operação e não executa ações comerciais. Escolha
          regras determinísticas ou OpenAI quando configurado.
        </p>
      </div>
      <RowsError error={query.error} />
      {!query.data?.items.length && (
        <Empty title="Converse com sua operação">
          Comece por uma pergunta sobre produtos, faturamento, fornecedores ou automações.
        </Empty>
      )}
      {query.data?.items.map((m) => (
        <article className="control-message" key={m.id}>
          <p className="control-question">{m.question}</p>
          <strong>
            <MessageSquare size={15} style={{ display: 'inline', verticalAlign: 'middle' }} />{' '}
            MarketPilot ·{' '}
            {m.provider === 'rules'
              ? 'consulta por regras'
              : m.provider === 'simulated'
                ? 'Demonstração'
                : 'OpenAI'}
          </strong>
          <p>{m.answer}</p>
          <Evidence value={m.evidenceJson} />
          <footer>{date(m.createdAt)}</footer>
        </article>
      ))}
      <div className="control-suggestions">
        {[
          'Qual foi o resultado dos últimos 30 dias?',
          'Quais produtos devo analisar hoje?',
          'Quais automações falharam?',
        ].map((s) => (
          <Button variant="outline" size="sm" key={s} onClick={() => setQuestion(s)}>
            {s}
          </Button>
        ))}
      </div>
      {action.feedback}
      <form className="control-panel" onSubmit={send}>
        <div className="control-form">
          <label className="full">
            Sua pergunta
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              required
              minLength={3}
              maxLength={2000}
              placeholder="Pergunte sobre sua operação…"
            />
          </label>
          <label>
            Modo de resposta
            <select value={provider} onChange={(e) => setProvider(e.target.value)} disabled={demo}>
              <option value="rules">Regras · sem consumo de IA</option>
              <option value="openai">OpenAI · usa tokens</option>
            </select>
          </label>
          <Button type="submit" disabled={action.pending || !ops.canWrite}>
            <Send size={14} />
            {action.pending
              ? 'Consultando…'
              : demo
                ? 'Enviar pergunta simulada'
                : 'Consultar dados'}
          </Button>
        </div>
      </form>
    </div>
  );
}
function Alerts({ demo }: { demo: boolean }) {
  const query = useQuery({
      queryKey: ['alerts', demo],
      queryFn: async () =>
        demo ? { items: demoAlerts() } : api<{ items: AlertRow[] }>('/v1/alerts'),
    }),
    client = useQueryClient(),
    action = useAction(demo),
    ops = useOperations(demo);
  return (
    <div className="control-center">
      <div className="control-toolbar">
        <p>Alertas gerados por verificações executadas sobre os dados disponíveis.</p>
        <Link className="control-link" href={`${demo ? '/demo' : '/app'}/automations`}>
          Executar verificações de margem e falhas
        </Link>
      </div>
      {action.feedback}
      <RowsError error={query.error} />
      {query.data?.items.map((row) => (
        <article className="control-panel" key={row.id}>
          <div className="control-toolbar">
            <h3>{row.title}</h3>
            <Status value={row.status} />
          </div>
          <p style={{ margin: '14px 0' }}>{row.message}</p>
          <div className="control-toolbar">
            <small>
              {row.severity} · {date(row.createdAt)}
            </small>
            <div className="control-actions">
              {row.link && (
                <Link className="control-link" href={row.link}>
                  Consultar detalhes
                </Link>
              )}
              {row.status !== 'RESOLVED' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!ops.canWrite || action.pending}
                  onClick={() => {
                    if (demo)
                      client.setQueryData<{ items: AlertRow[] }>(['alerts', true], (old) => ({
                        items: old!.items.map((r) =>
                          r.id === row.id ? { ...r, status: 'RESOLVED' } : r,
                        ),
                      }));
                    else
                      void action
                        .run(`/v1/alerts/${row.id}`, { status: 'RESOLVED' }, 'PATCH')
                        .catch(() => {});
                  }}
                >
                  Resolver alerta
                </Button>
              )}
            </div>
          </div>
        </article>
      ))}
      {query.data?.items.length === 0 && (
        <section className="control-panel">
          <Empty title="Nenhum alerta registrado">
            Execute os workflows de margem, fornecedores e falhas para verificar a operação.
            Ausência de alertas não significa que todos os dados foram monitorados.
          </Empty>
        </section>
      )}
    </div>
  );
}
interface IntegrationStatus {
  mercadolivre: { configured: boolean; connected: boolean; account: unknown };
  cjdropshipping: { configured: boolean; connected: boolean; expiresAt: string | null };
  openai: { configured: boolean; model: string | null };
  n8n: { configured: boolean; executionUrl: string | null };
  redis: { configured: boolean };
}
function Integrations({ demo }: { demo: boolean }) {
  const query = useQuery({
      queryKey: ['integration-status', demo],
      queryFn: () => api<IntegrationStatus>('/v1/integrations/status'),
      enabled: !demo,
    }),
    action = useAction(demo),
    ops = useOperations(demo),
    [message, setMessage] = useState(''),
    [mlSecret, setMlSecret] = useState(''),
    [cjApiKey, setCjApiKey] = useState('');
  const data = query.data;
  async function connect() {
    try {
      const result = await api<{ url: string }>('/v1/integrations/mercadolivre/connect', {
        method: 'POST',
        body: '{}',
      });
      window.location.assign(result.url);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível conectar.');
    }
  }
  return (
    <div className="control-center">
      <div className="control-note">
        <strong>Conexões externas com configuração pendente</strong>
        <p>
          Configure as credenciais no servidor e conecte a conta autorizada. O catálogo já aceita
          importação CSV/XML. Segredos permanecem no servidor.
        </p>
      </div>
      {action.feedback}
      {message && (
        <p role="alert" className="error-banner">
          {message}
        </p>
      )}
      <RowsError error={query.error} />
      <div className="control-grid">
        {[
          {
            name: 'Mercado Livre',
            description: 'OAuth oficial, anúncios aprovados e consulta de pedidos.',
            configured: data?.mercadolivre.configured,
            connected: data?.mercadolivre.connected,
          },
          {
            name: 'CJdropshipping',
            description: 'Catálogo real via API oficial. Só sincroniza após validação da chave.',
            configured: data?.cjdropshipping.configured,
            connected: data?.cjdropshipping.connected,
          },
          {
            name: 'OpenAI',
            description: `Análises restritas, evidências e consumo registrado.${data?.openai.model ? ` Modelo: ${data.openai.model}.` : ''}`,
            configured: data?.openai.configured,
          },
          {
            name: 'n8n',
            description: 'Agendamento e orquestração com autenticação entre serviços.',
            configured: data?.n8n.configured,
          },
          {
            name: 'Redis + worker',
            description: 'Fila assíncrona, idempotência e tentativas com backoff.',
            configured: data?.redis.configured,
          },
        ].map((item) => (
          <section className="control-panel control-agent" key={item.name}>
            <span className="control-agent-icon">
              <ShieldCheck size={22} />
            </span>
            <h2>{item.name}</h2>
            <p>{item.description}</p>
            <Status
              value={
                demo
                  ? 'Demonstração'
                  : item.connected
                    ? 'Conectado'
                    : item.configured
                      ? 'Configurado · conexão a verificar'
                      : 'Configuração pendente'
              }
            />
            {item.name === 'Mercado Livre' && (
              <div className="control-actions">
                {!item.configured && (
                  <form
                    className="control-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void action
                        .run('/v1/integrations/mercadolivre/credentials', {
                          clientSecret: mlSecret,
                        })
                        .then(() => setMlSecret(''))
                        .catch(() => {});
                    }}
                  >
                    <label>
                      Chave secreta da aplicação
                      <input
                        type="password"
                        autoComplete="off"
                        value={mlSecret}
                        onChange={(event) => setMlSecret(event.target.value)}
                        placeholder="Cole a chave secreta do Mercado Livre"
                        required
                      />
                    </label>
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      disabled={demo || !ops.admin || action.pending || !mlSecret.trim()}
                    >
                      Guardar chave cifrada
                    </Button>
                  </form>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={demo || !ops.admin || !item.configured}
                  onClick={() => void connect()}
                >
                  Conectar conta
                </Button>
                {item.connected && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!ops.admin || action.pending}
                    onClick={() =>
                      void action
                        .run('/v1/integrations/mercadolivre/disconnect', {})
                        .catch(() => {})
                    }
                  >
                    Desconectar
                  </Button>
                )}
              </div>
            )}
            {item.name === 'CJdropshipping' && (
              <div className="control-actions">
                {!item.configured && (
                  <form
                    className="control-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void action
                        .run('/v1/integrations/cjdropshipping/credentials', { apiKey: cjApiKey })
                        .then(() => setCjApiKey(''))
                        .catch(() => {});
                    }}
                  >
                    <label>
                      Chave da API CJdropshipping
                      <input
                        type="password"
                        autoComplete="off"
                        value={cjApiKey}
                        onChange={(event) => setCjApiKey(event.target.value)}
                        placeholder="Cole a chave criada na CJ"
                        required
                      />
                    </label>
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      disabled={demo || !ops.admin || action.pending || !cjApiKey.trim()}
                    >
                      Guardar chave cifrada
                    </Button>
                  </form>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={demo || !ops.admin || !item.configured || action.pending}
                  onClick={() =>
                    void action.run('/v1/integrations/cjdropshipping/check', {}).catch(() => {})
                  }
                >
                  Verificar conexão
                </Button>
              </div>
            )}
            {item.name === 'n8n' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={demo || !ops.admin || !item.configured || action.pending}
                  onClick={() => void action.run('/v1/integrations/n8n/check', {}).catch(() => {})}
                >
                  Verificar conexão
                </Button>
                {data?.n8n.executionUrl && (
                  <a
                    className="control-link"
                    href={data.n8n.executionUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir n8n
                  </a>
                )}
              </>
            )}
          </section>
        ))}
        <section className="control-panel control-agent">
          <h2>Fornecedores</h2>
          <p>
            Importações CSV/XML autorizadas. Conectores de distribuidores dependem de documentação e
            autorização de cada fornecedor.
          </p>
          <Link className="control-link" href={`${demo ? '/demo' : '/app'}/suppliers`}>
            Gerenciar catálogos
          </Link>
        </section>
      </div>
      <section className="control-panel">
        <h2>Antes de conectar</h2>
        <p style={{ marginTop: 12 }}>
          O administrador configura as credenciais da aplicação, o endereço de retorno OAuth e a
          chave de criptografia. No n8n, importe os workflows e selecione a credencial protegida de
          autenticação. Uma configuração salva não comprova que a conexão foi validada.
        </p>
      </section>
    </div>
  );
}
