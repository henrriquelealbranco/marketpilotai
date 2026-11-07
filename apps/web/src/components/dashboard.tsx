'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  ArrowRight,
  Download,
  CalendarDays,
  ChevronDown,
  Wallet,
  TrendingUp,
  ShoppingBag,
  ChartNoAxesCombined,
  Orbit,
  Bot,
  Plug,
  CircleCheck,
  Sparkles,
  Package,
  Truck,
  CircleAlert,
  RefreshCw,
  CircleHelp,
  Radar,
} from 'lucide-react';
import type {
  Dashboard as DashboardData,
  Period,
  CatalogSummary,
  AnalyticsReport,
  AlertRow,
} from '@marketpilot/contracts';
import { useOperations } from './operations/operations-workspace';
import { api, money, number, percent, cn } from '@/lib/utils';
import { Button } from './ui/button';
import { RevenueChart } from './revenue-chart';
import { ProductRanking } from './product-ranking';
import { initialDemoCatalog } from './catalog/demo-data';

export function Dashboard({ demo }: { demo: boolean }) {
  const [period, setPeriod] = useState<Period>(30);
  const [exported, setExported] = useState(false);
  const operations = useOperations(demo);
  const stats = useQuery({
    queryKey: ['analytics', false, period],
    queryFn: () => api<AnalyticsReport>(`/v1/analytics?days=${period}`),
    enabled: !demo,
    refetchInterval: 30000,
  });
  const alerts = useQuery({
    queryKey: ['alerts', false],
    queryFn: () => api<{ items: AlertRow[] }>('/v1/alerts'),
    enabled: !demo,
  });
  const base = demo ? '/demo' : '/app';
  const { data: realCatalog } = useQuery({
    queryKey: ['catalog', 'summary'],
    queryFn: () => api<CatalogSummary>('/v1/catalog/summary'),
    enabled: !demo,
  });
  const { data: demoCatalog } = useQuery({
    queryKey: ['demo-catalog'],
    queryFn: initialDemoCatalog,
    enabled: demo,
    staleTime: Infinity,
  });
  const activeProducts = demo
    ? demoCatalog?.products.filter((p) => p.status === 'ACTIVE').length
    : realCatalog?.activeProducts;
  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['dashboard', demo ? 'demo' : 'real', period],
    queryFn: () => api<DashboardData>(`/v1/${demo ? 'demo/' : ''}dashboard?days=${period}`),
  });
  function exportCSV() {
    if (!data) return;
    const csv = [
      'Origem;Data;Faturamento BRL;Lucro estimado BRL',
      ...data.chart.map(
        (p) =>
          `${demo ? 'Simulado' : 'Real'};${p.date};${(p.revenueCents / 100).toFixed(2).replace('.', ',')};${(p.profitCents / 100).toFixed(2).replace('.', ',')}`,
      ),
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `marketpilot-${demo ? 'demo' : 'conta'}-${period}dias.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setExported(true);
  }
  const metrics = [
    {
      label: 'Faturamento',
      value: data ? money(data.revenueCents) : '—',
      icon: Wallet,
      detail: 'Receita dos pedidos no período',
      extra: data ? `${number(data.orderCount)} pedidos` : '',
      testId: 'revenue',
      color: 'blue',
    },
    {
      label: 'Lucro estimado',
      value: data ? money(data.estimatedProfitCents) : '—',
      icon: TrendingUp,
      detail: data ? `${money(data.realizedProfitCents)} realizado` : 'Após custos estimados',
      extra: 'Estimativa',
      color: 'green',
    },
    {
      label: 'Pedidos',
      value: data ? number(data.orderCount) : '—',
      icon: ShoppingBag,
      detail: 'Pedidos válidos no período',
      extra: data
        ? `${money(data.orderCount ? data.revenueCents / data.orderCount : 0)} / pedido`
        : '',
      color: 'purple',
    },
    {
      label: 'Margem de contribuição',
      value: data ? percent(data.marginPercent) : '—',
      icon: ChartNoAxesCombined,
      detail: 'Com base nos custos estimados',
      extra: 'Estimada',
      color: 'amber',
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="page-eyebrow">
            <span className="status-dot" />
            SEU NEGÓCIO, EM PERSPECTIVA
          </div>
          <h1>
            Visão geral
            <span className="heading-dot" aria-hidden="true">
              .
            </span>
          </h1>
          <p>A clareza que você precisa para o próximo passo da sua operação.</p>
        </div>
        <div className="heading-actions">
          <Button variant="outline" onClick={exportCSV} disabled={!data}>
            <Download size={15} />
            Exportar dados
          </Button>
          <Button asChild>
            <Link href={`${base}/operations`}>
              <Orbit size={16} />
              Central de operações
              <ArrowUpRight size={15} />
            </Link>
          </Button>
        </div>
      </div>
      <div className="dashboard-toolbar">
        <div className="view-label">
          <span className="mini-square">
            <ChartNoAxesCombined size={14} />
          </span>
          <strong>Resumo da operação</strong>
          <span className="source-label">{demo ? 'Dados simulados' : 'Dados da conta'}</span>
        </div>
        <div className="date-controls">
          <div className="period-switch" aria-label="Filtrar período">
            {([7, 30, 90] as const).map((days) => (
              <button
                key={days}
                className={cn(period === days && 'selected')}
                onClick={() => {
                  setPeriod(days);
                  setExported(false);
                }}
                aria-pressed={period === days}
              >
                {days} dias
              </button>
            ))}
          </div>
          <span className="date-label">
            <CalendarDays size={14} />
            Últimos {period} dias
            <ChevronDown size={12} />
          </span>
          <button
            className="refresh-button"
            aria-label="Atualizar dashboard"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            <RefreshCw size={14} className={cn(isFetching && 'spin')} />
          </button>
        </div>
      </div>
      {isError && (
        <div className="error-banner" role="alert">
          <CircleAlert size={19} />
          <span>{error.message}</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}
      {exported && (
        <p className="export-notice" role="status">
          CSV exportado com identificação da origem dos dados.
        </p>
      )}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="metric-grid"
        aria-busy={isPending}
      >
        {metrics.map((m) => (
          <section key={m.label} className={cn('metric-card', isPending && 'skeleton')}>
            <div className="metric-top">
              <span>{m.label}</span>
              <m.icon className={`metric-icon ${m.color}`} size={17} strokeWidth={1.7} />
            </div>
            <strong className="metric-value" data-testid={m.testId}>
              {m.value}
            </strong>
            <div className="metric-bottom">
              <span>{m.detail}</span>
            </div>
            <div className="metric-context">
              <span className={cn('metric-extra', m.color)}>{m.extra || 'Aguardando dados'}</span>
            </div>
          </section>
        ))}
      </motion.div>
      {!demo && data && data.orderCount === 0 && (
        <div className="account-empty-notice">
          <CircleCheck size={18} />
          <span>
            <strong>Sua operação está pronta para começar.</strong> Os indicadores financeiros serão
            preenchidos quando os pedidos forem integrados. Seu catálogo está disponível em
            Produtos.
          </span>
          <Link href="/app/integrations">
            Ver próximos passos <ArrowRight size={14} />
          </Link>
        </div>
      )}
      <div className="dashboard-middle">
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h2>
                Desempenho financeiro{' '}
                <CircleHelp size={14}>
                  <title>Lucro estimado inclui os custos conhecidos de cada pedido.</title>
                </CircleHelp>
              </h2>
              <p>Uma visão de como sua operação evolui</p>
            </div>
            <span className="subtle-tag">{demo ? 'Simulação' : 'Conta atual'}</span>
          </div>
          <div className="chart-summary">
            <div>
              <span>Faturamento no período</span>
              <strong>{data ? money(data.revenueCents) : '—'}</strong>
            </div>
            <div className="chart-legend">
              <span>
                <i />
                Faturamento
              </span>
              <span>
                <i />
                Lucro estimado
              </span>
            </div>
          </div>
          {data ? (
            <RevenueChart data={data.chart} />
          ) : (
            <div className="revenue-chart chart-loading" aria-label="Carregando gráfico">
              <span className="skeleton-bar" />
              <span className="skeleton-bar" />
              <span className="skeleton-bar" />
            </div>
          )}
          <div className="chart-foot">
            <span>Valores em reais (R$)</span>
            <span>
              {demo ? 'Custos e receitas fictícios' : 'Sem pedidos integrados nesta fase'}
            </span>
          </div>
        </section>
        <section className="panel intelligence-panel">
          <div className="intelligence-top">
            <span className="intelligence-icon">
              <Orbit size={23} strokeWidth={1.3} />
            </span>
            <span className="subtle-tag">AI WORKSPACE</span>
          </div>
          <h2>
            Inteligência a favor
            <br />
            da sua operação.
          </h2>
          <p>
            Um lugar para acompanhar agentes,
            <br className="desktop-br" /> decisões e automações.
          </p>
          <div className="intelligence-stats">
            <div>
              <span>
                <Bot size={16} />
                Agentes disponíveis
              </span>
              <strong>07</strong>
            </div>
            <div>
              <span>
                <Plug size={16} />
                Serviços configurados
              </span>
              <strong>
                {Object.values(operations.data?.configuration ?? {}).filter(Boolean).length}
              </strong>
            </div>
            <div>
              <span>
                <CircleCheck size={16} />
                Análises registradas
              </span>
              <strong>{number(operations.data?.counts.runs ?? 0)}</strong>
            </div>
          </div>
          <div className="intelligence-callout">
            <span>
              <Sparkles size={15} />
            </span>
            <p>
              {demo
                ? 'Explore agentes, decisões e aprovações simuladas no modo apresentação.'
                : 'Execute análises com regras ou OpenAI configurado, a partir do seu catálogo autorizado.'}
            </p>
          </div>
          <Link className="intelligence-link" href={`${base}/operations`}>
            Abrir centro de operações
            <ArrowUpRight size={16} />
          </Link>
        </section>
      </div>
      <div className="dashboard-bottom">
        <ProductRanking rows={data?.ranking ?? []} base={base} />
        <section className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <h2>Atividade recente</h2>
              <p>
                {demo ? 'Uma amostra dos pedidos simulados' : 'Acompanhe os eventos da operação'}
              </p>
            </div>
            <span className="activity-badge">{demo ? 'DEMO' : 'CONTA'}</span>
          </div>
          <div className="activity-list">
            {data?.recentOrders.slice(0, 4).map((order, i) => (
              <div className="activity-item" key={order.id}>
                <span className={cn('activity-icon', i % 2 ? 'purple' : 'blue')}>
                  {i % 2 ? <Truck size={16} /> : <Package size={16} />}
                </span>
                <div>
                  <strong>
                    {order.status === 'delivered'
                      ? 'Pedido entregue'
                      : order.status === 'shipping'
                        ? 'Pedido em transporte'
                        : 'Pedido em preparação'}
                    <span>{money(order.revenueCents)}</span>
                  </strong>
                  <p>{order.product}</p>
                  <small>
                    {order.id} <span>·</span>{' '}
                    {new Intl.DateTimeFormat('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      timeZone: 'America/Sao_Paulo',
                    }).format(new Date(order.date))}
                  </small>
                </div>
              </div>
            ))}
            {data && !data.recentOrders.length && (
              <div className="inline-empty">
                <Radar size={28} />
                <strong>Tudo começa por aqui</strong>
                <p>Seus eventos aparecerão quando a operação estiver conectada.</p>
              </div>
            )}
          </div>
          <Link className="activity-footer" href={`${base}/orders`}>
            Acompanhar pedidos
            <ArrowRight size={14} />
          </Link>
        </section>
      </div>
      <section className="panel operational-overview" aria-label="Indicadores operacionais">
        {[
          {
            label: 'Produtos ativos',
            value: activeProducts === undefined ? '—' : number(activeProducts),
            detail: demo ? 'Catálogo demonstrativo' : 'Cadastrados no workspace',
          },
          {
            label: 'Produtos analisados',
            value: number(
              new Set(operations.data?.decisions.map((d) => d.productId).filter(Boolean)).size,
            ),
            detail: 'No recorte de decisões',
          },
          {
            label: 'Recomendações',
            value: number(operations.data?.decisions.length ?? 0),
            detail: 'Histórico recente',
          },
          {
            label: 'Automações executadas',
            value: number(
              stats.data?.workflowExecutions ?? operations.data?.executions.length ?? 0,
            ),
            detail: demo ? 'Demonstração' : 'No período selecionado',
          },
          {
            label: 'Alertas críticos',
            value: number(
              alerts.data?.items.filter((a) => a.status === 'OPEN' && a.severity === 'critical')
                .length ?? 0,
            ),
            detail: 'Entre alertas registrados',
          },
          {
            label: 'Custo conhecido de IA',
            value: `US$ ${((stats.data?.ai.knownCostMicrosUsd ?? 0) / 1000000).toFixed(4)}`,
            detail: `${stats.data?.ai.unknownCostRuns ?? 0} execuções com tarifa desconhecida`,
          },
        ].map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.detail}</small>
          </div>
        ))}
      </section>
      <div className="data-footnote">
        {!!data?.unknownCostOrders && (
          <span>
            {data.unknownCostOrders} pedidos com custos ausentes: lucro parcial, excluindo esses
            pedidos.
          </span>
        )}
        <span>
          <span className="status-dot" />
          {demo
            ? 'Dados fictícios, para explorar com tranquilidade.'
            : 'Exibindo apenas dados do seu workspace.'}
        </span>
        {data && (
          <span>
            Consulta em{' '}
            {new Intl.DateTimeFormat('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'America/Sao_Paulo',
            }).format(new Date(data.asOf))}{' '}
            · Brasília
          </span>
        )}
      </div>
    </>
  );
}
