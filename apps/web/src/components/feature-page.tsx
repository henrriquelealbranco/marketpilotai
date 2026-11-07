'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowUpRight,
  Clock3,
  LockKeyhole,
  ArrowRight,
  Plug,
  ShieldCheck,
  Check,
  Save,
  Orbit,
  Database,
  Layers,
  Bot,
  FileCheck,
  Globe,
  Sparkles,
  Activity,
  ListChecks,
  History,
} from 'lucide-react';
import {
  agentDefinitions,
  integrations,
  type Identity,
  type Workspace,
} from '@marketpilot/contracts';
import { pages } from '@/lib/navigation';
import { api, cn } from '@/lib/utils';
import { Button } from './ui/button';

const descriptions: Record<string, string> = {
  hunter: 'Descubra oportunidades com base em catálogos autorizados, custos e disponibilidade.',
  products: 'Organize os produtos da operação e acompanhe a origem de cada informação.',
  suppliers: 'Centralize fornecedores, catálogos autorizados e condições comerciais.',
  market: 'Compare anúncios e preços com fontes autorizadas e data de coleta.',
  pricing: 'Calcule preços com custos, tarifas e margem de contribuição explícitos.',
  listings: 'Prepare publicações e aprove cada ação antes do envio ao Mercado Livre.',
  orders: 'Acompanhe cada pedido, seus custos e as etapas de atendimento.',
  automations: 'Visualize workflows, histórico, falhas e execuções autorizadas.',
  analytics: 'Entenda a evolução do resultado e da eficiência da operação.',
  alerts: 'Acompanhe desvios de margem, disponibilidade e falhas operacionais.',
  assistant: 'Converse com os dados da sua operação e consulte as fontes das respostas.',
};
export function FeaturePage({ slug, demo }: { slug: string; demo: boolean }) {
  const page = pages.find((p) => p.slug === slug)!;
  const base = demo ? '/demo' : '/app';
  const Icon = page.icon;
  return (
    <>
      <Link className="back-link" href={base}>
        <ArrowLeft size={14} />
        Visão geral
      </Link>
      <div className="page-heading feature-heading">
        <div>
          <div className="page-eyebrow">
            <Icon size={14} />
            SEU WORKSPACE
          </div>
          <h1>
            {page.label}
            <span className="heading-dot" aria-hidden="true">
              .
            </span>
          </h1>
          <p>
            {descriptions[slug] ||
              (slug === 'operations'
                ? 'Agentes, decisões e automações. Um único ponto de controle.'
                : 'Prepare sua operação para as próximas fases.')}
          </p>
        </div>
        <span className="source-label">{demo ? 'Demonstração' : 'Conta atual'}</span>
      </div>
      {slug === 'integrations' ? (
        <>
          <div className="phase-banner">
            <Plug size={19} />
            <span>
              <strong>Conexões com configuração pendente</strong>As integrações serão implementadas
              nas fases indicadas. Nenhuma conta externa está conectada.
            </span>
          </div>
          <div className="integration-grid">
            {integrations.map((item, i) => (
              <article className="panel integration-card" key={item.id}>
                <span className={`integration-logo logo-${i}`}>
                  {i === 0 ? (
                    <Globe size={28} />
                  ) : i === 1 ? (
                    <Sparkles size={28} />
                  ) : i === 2 ? (
                    <Layers size={28} />
                  ) : (
                    <Database size={28} />
                  )}
                </span>
                <span className="pending-tag">
                  <Clock3 size={12} />
                  Configuração pendente
                </span>
                <h2>{item.name}</h2>
                <p>{item.description}</p>
                <div className="integration-bottom">
                  <span>Disponível na Fase {item.phase}</span>
                  <LockKeyhole size={15} />
                </div>
              </article>
            ))}
          </div>
          <div className="security-note">
            <ShieldCheck size={20} />
            <p>
              As credenciais serão armazenadas no servidor e nunca incluídas no navegador ou nos
              workflows exportados. A conexão oficial e os adaptadores fazem parte das próximas
              entregas.
            </p>
          </div>
        </>
      ) : ['operations', 'agents'].includes(slug) ? (
        <Operations showWorkflow={slug === 'operations'} />
      ) : slug === 'settings' ? (
        <Settings demo={demo} />
      ) : slug === 'audit' ? (
        <Audit demo={demo} />
      ) : (
        <section className="panel future-page">
          <span className="future-icon">
            <Icon size={35} strokeWidth={1.2} />
          </span>
          <span className="subtle-tag">FASE {page.phase} DE 7</span>
          <h2>
            {page.label} entra na Fase {page.phase}
          </h2>
          <p>
            {descriptions[slug]} Esta área será implementada na etapa prevista para manter cada
            entrega testável e funcional.
          </p>
          <div className="future-boundary">
            <LockKeyhole size={15} />
            Nenhuma ação externa disponível nesta fase.
          </div>
          <Button asChild variant="outline">
            <Link href={base}>
              Voltar ao dashboard
              <ArrowUpRight size={15} />
            </Link>
          </Button>
        </section>
      )}
    </>
  );
}
function Operations({ showWorkflow }: { showWorkflow: boolean }) {
  const [tab, setTab] = useState('agents');
  const tabs = [
    { id: 'agents', label: 'Agentes', icon: Bot },
    { id: 'activity', label: 'Atividades', icon: Activity },
    { id: 'decisions', label: 'Decisões', icon: History },
    { id: 'approvals', label: 'Aprovações', icon: ListChecks },
  ];
  function navigateTab(event: React.KeyboardEvent<HTMLButtonElement>, id: string) {
    const index = tabs.findIndex((t) => t.id === id);
    const target =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : undefined;
    if (target === undefined) return;
    event.preventDefault();
    const next = tabs[target]!;
    setTab(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  }
  return (
    <>
      <div className="phase-banner">
        <Orbit size={21} />
        <span>
          <strong>Estrutura pronta. Execuções na Fase 4.</strong>Esta página apresenta os papéis dos
          agentes. Não há processamento de IA em execução.
        </span>
        <span className="subtle-tag">0 execuções</span>
      </div>
      {showWorkflow && (
        <section className="panel workflow-preview">
          <div className="panel-heading">
            <div>
              <h2>Da descoberta à publicação</h2>
              <p>Arquitetura do fluxo · visualização estática</p>
            </div>
            <span className="subtle-tag">EM PREPARAÇÃO</span>
          </div>
          <div className="workflow-steps">
            {[
              { title: 'Fornecedor', icon: Database },
              { title: 'Catálogo', icon: Layers },
              { title: 'Análise de IA', icon: Bot },
              { title: 'Precificação', icon: Sparkles },
              { title: 'Aprovação', icon: FileCheck },
              { title: 'Mercado Livre', icon: Globe },
            ].map((step, i) => (
              <div key={step.title} className="workflow-step">
                <span>
                  <step.icon size={21} />
                </span>
                <strong>{step.title}</strong>
                <small>Aguardando</small>
                {i < 5 && <ArrowRight className="step-arrow" size={18} />}
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="ops-tabs" role="tablist" aria-label="Painéis da central">
        {tabs.map((t) => (
          <button
            role="tab"
            id={`tab-${t.id}`}
            aria-controls="operations-panel"
            tabIndex={tab === t.id ? 0 : -1}
            onKeyDown={(event) => navigateTab(event, t.id)}
            aria-selected={tab === t.id}
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(tab === t.id && 'selected')}
          >
            <t.icon size={16} />
            {t.label}
            <span>{t.id === 'agents' ? agentDefinitions.length : 0}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id="operations-panel" aria-labelledby={`tab-${tab}`}>
        {tab === 'agents' ? (
          <div className="agent-grid">
            {agentDefinitions.map((agent, i) => (
              <article className="panel agent-card" key={agent.name}>
                <div>
                  <span className={`agent-avatar tone-${i % 5}`}>{agent.initials}</span>
                  <span className="pending-tag">
                    <span className="muted-dot" />
                    Aguardando
                  </span>
                </div>
                <h2>{agent.name}</h2>
                <p>{agent.description}</p>
                <div className="agent-progress">
                  <span>Não iniciado</span>
                  <span>Configuração pendente</span>
                  <div
                    role="progressbar"
                    aria-label={`Progresso de ${agent.name}`}
                    aria-valuenow={0}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <i />
                  </div>
                </div>
                <dl>
                  <div>
                    <dt>Última execução</dt>
                    <dd>Nenhuma</dd>
                  </div>
                  <div>
                    <dt>Análises / custo de IA</dt>
                    <dd>0 / R$ 0,00</dd>
                  </div>
                </dl>
                <span className="agent-phase">Implementação a partir da Fase {agent.phase}</span>
              </article>
            ))}
          </div>
        ) : (
          <section className="panel ops-empty">
            <span className="future-icon">
              {tab === 'activity' ? (
                <Activity size={30} />
              ) : tab === 'decisions' ? (
                <History size={30} />
              ) : (
                <ListChecks size={30} />
              )}
            </span>
            <h2>
              {tab === 'activity'
                ? 'Nenhuma execução registrada'
                : tab === 'decisions'
                  ? 'Nenhuma decisão registrada'
                  : 'Nenhuma aprovação pendente'}
            </h2>
            <p>
              {tab === 'activity'
                ? 'O feed mostrará eventos com origem, categoria e horário quando os agentes e workflows estiverem conectados.'
                : tab === 'decisions'
                  ? 'Cada recomendação terá evidências, justificativa estruturada e resultado da revisão humana.'
                  : 'Novos anúncios e alterações sensíveis passarão por revisão humana antes de qualquer ação externa.'}
            </p>
            <span className="subtle-tag">Disponível na Fase 4</span>
          </section>
        )}
      </div>
    </>
  );
}
function Settings({ demo }: { demo: boolean }) {
  const router = useRouter();
  const client = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: ['identity'],
    queryFn: () => api<Identity>('/v1/auth/me'),
    enabled: !demo,
  });
  const [message, setMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [pending, setPending] = useState(false);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demo) return;
    setPending(true);
    setMessage('');
    setSaveError('');
    const name = String(new FormData(event.currentTarget).get('name'));
    try {
      await api<Workspace>('/v1/workspace', { method: 'PATCH', body: JSON.stringify({ name }) });
      await client.invalidateQueries({ queryKey: ['identity'] });
      router.refresh();
      setMessage('Configurações salvas.');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setPending(false);
    }
  }
  if (!demo && isPending)
    return (
      <div className="panel loading-panel" role="status">
        Carregando configurações...
      </div>
    );
  if (error)
    return (
      <p role="alert" className="error-banner">
        {error.message}
      </p>
    );
  const allowed = data?.user.role === 'ADMIN';
  return (
    <div className="settings-layout">
      <section className="panel settings-panel">
        <h2>Dados da operação</h2>
        <p>Identifique o workspace usado por sua equipe.</p>
        <form onSubmit={save}>
          <label htmlFor="operationName">Nome da operação</label>
          <input
            id="operationName"
            name="name"
            minLength={2}
            maxLength={80}
            required
            defaultValue={demo ? 'Operação exemplo' : data?.workspace.name}
            disabled={demo || !allowed}
          />
          <label htmlFor="timezone">Fuso horário</label>
          <input id="timezone" value="America/Sao_Paulo (UTC−3)" disabled />
          <p className="field-help">Datas e relatórios seguem o dia comercial de São Paulo.</p>
          {demo ? (
            <div className="phase-banner">
              <LockKeyhole size={17} />
              <span>Configurações da demonstração são somente para consulta.</span>
            </div>
          ) : (
            <>
              <Button type="submit" disabled={pending || !allowed}>
                <Save size={15} />
                {pending ? 'Salvando...' : 'Salvar alterações'}
              </Button>
              {!allowed && (
                <p className="field-help">Apenas administradores podem alterar a operação.</p>
              )}
            </>
          )}
          {message && (
            <p className="success-message" role="status">
              <Check size={16} />
              {message}
            </p>
          )}
          {saveError && (
            <p className="form-error" role="alert">
              {saveError}
            </p>
          )}
        </form>
      </section>
      <section className="panel settings-panel">
        <h2>Sobre este workspace</h2>
        <dl className="settings-details">
          <div>
            <dt>Ambiente</dt>
            <dd>{demo ? 'Demonstração isolada' : 'Conta autenticada'}</dd>
          </div>
          <div>
            <dt>Permissão</dt>
            <dd>
              {demo
                ? 'Visitante'
                : data?.user.role === 'ADMIN'
                  ? 'Administrador'
                  : data?.user.role === 'OPERATOR'
                    ? 'Operador'
                    : 'Leitura'}
            </dd>
          </div>
          <div>
            <dt>Versão</dt>
            <dd>0.1.0 · Fase 1</dd>
          </div>
          <div>
            <dt>Integrações comerciais</dt>
            <dd>Não conectadas</dd>
          </div>
        </dl>
        <div className="security-note">
          <ShieldCheck size={20} />
          <p>
            {demo
              ? 'Os dados fictícios não compartilham o banco de uma operação real.'
              : 'A sessão é protegida por cookie HttpOnly e pode ser encerrada no botão Sair da conta.'}
          </p>
        </div>
      </section>
    </div>
  );
}
function Audit({ demo }: { demo: boolean }) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['audit'],
    enabled: !demo,
    queryFn: () =>
      api<{
        items: { id: string; action: string; createdAt: string; actor: { name: string } | null }[];
      }>('/v1/audit'),
  });
  const labels: Record<string, string> = {
    'account.created': 'Conta e workspace criados',
    'session.created': 'Acesso à conta',
    'session.revoked': 'Sessão encerrada',
    'workspace.updated': 'Configurações alteradas',
  };
  return (
    <section className="panel audit-panel">
      <div className="panel-heading">
        <div>
          <h2>Registro de auditoria</h2>
          <p>Últimos 50 eventos do workspace atual</p>
        </div>
        {!demo && (
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Atualizar
          </Button>
        )}
      </div>
      {demo ? (
        <div className="inline-empty">
          <ShieldCheck size={32} />
          <strong>Demonstração sem alterações persistentes</strong>
          <p>Crie uma conta para consultar os registros reais de acesso e configuração.</p>
        </div>
      ) : isPending ? (
        <p className="loading-panel">Carregando eventos...</p>
      ) : error ? (
        <p role="alert" className="error-banner">
          {error.message}
        </p>
      ) : (
        <div className="audit-list">
          {data?.items.map((item) => (
            <div className="audit-row" key={item.id}>
              <ShieldCheck size={17} />
              <div>
                <strong>{labels[item.action] || item.action}</strong>
                <span>{item.actor?.name ?? 'Sistema'}</span>
              </div>
              <time dateTime={item.createdAt}>
                {new Intl.DateTimeFormat('pt-BR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                  timeZone: 'America/Sao_Paulo',
                }).format(new Date(item.createdAt))}
              </time>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
