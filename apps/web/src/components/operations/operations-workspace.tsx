'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  Bot,
  Check,
  Database,
  FileCheck,
  Globe,
  Layers,
  Orbit,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Workflow,
} from 'lucide-react';
import {
  agentDefinitions,
  agentKeys,
  type Identity,
  type OperationState,
} from '@marketpilot/contracts';
import { api, number } from '@/lib/utils';
import { Button } from '../ui/button';
import { demoOperations, simulateAnalysis, simulateWorkflow } from './demo';

export const date = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Sao_Paulo',
      })
    : 'Ainda não executado';
const labels: Record<string, string> = {
  QUEUED: 'Na fila',
  RUNNING: 'Analisando',
  COMPLETED: 'Concluído',
  FAILED: 'Falha',
  PENDING: 'Aguardando aprovação',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  EXECUTED: 'Executado',
  EXECUTING: 'Executando',
  CONFIGURATION_REQUIRED: 'Configuração pendente',
  RECONCILIATION_REQUIRED: 'Reconciliar na conta',
  SUPERSEDED: 'Substituído',
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicado',
  OPEN: 'Aberto',
  ACKNOWLEDGED: 'Reconhecido',
  RESOLVED: 'Resolvido',
  processing: 'Em processamento',
  shipping: 'Em transporte',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};
export function Status({ value }: { value: string }) {
  return (
    <span
      className="control-status"
      data-tone={
        ['COMPLETED', 'APPROVED', 'EXECUTED', 'delivered', 'RESOLVED', 'PUBLISHED'].includes(value)
          ? 'good'
          : ['FAILED', 'REJECTED', 'RECONCILIATION_REQUIRED'].includes(value)
            ? 'bad'
            : ['RUNNING', 'EXECUTING', 'QUEUED'].includes(value)
              ? 'busy'
              : 'idle'
      }
    >
      <i className="control-dot" />
      {labels[value] ?? value}
    </span>
  );
}
export function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="control-empty">
      <Orbit size={30} />
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
export function Evidence({
  value,
  label = 'Evidências e dados utilizados',
}: {
  value: unknown;
  label?: string;
}) {
  return (
    <details>
      <summary>{label}</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}
export function useOperations(demo: boolean) {
  const client = useQueryClient();
  const key = ['operations', demo ? 'demo' : 'real'];
  const query = useQuery({
    queryKey: key,
    queryFn: () => (demo ? demoOperations() : api<OperationState>('/v1/operations')),
    staleTime: demo ? Infinity : 0,
    refetchInterval: demo ? false : 15000,
  });
  const identity = useQuery({
    queryKey: ['identity'],
    queryFn: () => api<Identity>('/v1/auth/me'),
    enabled: !demo,
  });
  return {
    ...query,
    identity: identity.data,
    canWrite: demo || Boolean(identity.data && identity.data.user.role !== 'VIEWER'),
    admin: demo || identity.data?.user.role === 'ADMIN',
    setDemo: (update: (old: OperationState) => OperationState) =>
      client.setQueryData<OperationState>(key, (old) => update(old ?? demoOperations())),
  };
}
export function OperationsWorkspace({
  demo,
  section = 'operations',
}: {
  demo: boolean;
  section?: string;
}) {
  const client = useQueryClient(),
    state = useOperations(demo),
    [tab, setTab] = useState(section === 'automations' ? 'workflows' : 'agents'),
    [provider, setProvider] = useState<'rules' | 'openai'>('rules'),
    [pending, setPending] = useState(''),
    [message, setMessage] = useState(''),
    [failed, setFailed] = useState(false),
    [stream, setStream] = useState('Conectando');
  useEffect(() => {
    if (demo) return;
    const events = new EventSource('/api/v1/events/stream');
    events.onopen = () => setStream('Feed conectado');
    events.onerror = () => setStream('Reconectando feed');
    events.addEventListener(
      'operation',
      () => void client.invalidateQueries({ queryKey: ['operations', 'real'] }),
    );
    return () => events.close();
  }, [demo, client]);
  async function action(path: string, body: unknown = {}, method = 'POST') {
    if (demo) return;
    setPending(path);
    setMessage('');
    setFailed(false);
    try {
      await api(path, { method, body: JSON.stringify(body) });
      setMessage('Solicitação registrada. Consulte o estado atualizado.');
      await client.invalidateQueries();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : 'Não foi possível executar.');
    } finally {
      setPending('');
    }
  }
  if (state.isPending)
    return (
      <div className="control-grid" aria-label="Carregando central">
        {[1, 2, 3].map((i) => (
          <div className="control-skeleton" key={i} />
        ))}
      </div>
    );
  if (state.error || !state.data)
    return (
      <p role="alert" className="error-banner">
        {state.error?.message ?? 'Central indisponível.'}
      </p>
    );
  const data = state.data,
    pendingCount = demo
      ? data.approvals.filter((a) => a.status === 'PENDING').length
      : data.counts.pendingApprovals,
    tabs = [
      ['agents', 'Agentes'],
      ['activity', 'Atividades'],
      ['decisions', 'Decisões'],
      ['approvals', 'Aprovações'],
      ['workflows', 'Workflows'],
    ] as const;
  const busy = !!pending;
  function reviewDemo(id: string, status: string, kind: 'decisions' | 'approvals') {
    state.setDemo((old) => ({
      ...old,
      [kind]: old[kind].map((row) =>
        row.id === id
          ? { ...row, ...(kind === 'decisions' ? { reviewStatus: status } : { status }) }
          : row,
      ),
    }));
  }
  return (
    <div className="control-center">
      <div className="control-toolbar">
        <div className="control-title">
          <h2>Inteligência com supervisão</h2>
          <p>
            {demo
              ? 'Apresentação interativa · todas as ações e resultados são simulados.'
              : `${stream} · eventos persistidos, sem processamento simulado.`}
          </p>
        </div>
        <div className="control-actions">
          {demo ? (
            <Button onClick={() => state.setDemo((old) => simulateAnalysis(old))}>
              <Play size={14} />
              Simular análise
            </Button>
          ) : (
            <>
              <label className="sr-only" htmlFor="agent-provider">
                Modo de análise
              </label>
              <select
                id="agent-provider"
                className="control-select"
                value={provider}
                onChange={(e) => setProvider(e.target.value as 'rules' | 'openai')}
              >
                <option value="rules">Regras determinísticas</option>
                <option value="openai">OpenAI · usa tokens</option>
              </select>
              <Button variant="outline" onClick={() => void state.refetch()}>
                <RefreshCw size={14} />
                Atualizar
              </Button>
            </>
          )}
        </div>
      </div>
      {message && (
        <p role={failed ? 'alert' : 'status'} className="control-feedback" data-error={failed}>
          {message}
        </p>
      )}
      <div className="control-stats">
        {[
          ['Análises registradas', number(data.counts.runs), 'Histórico do workspace'],
          ['Aprovações pendentes', number(pendingCount), 'Revisão humana'],
          [
            'Tokens de IA',
            number(data.counts.inputTokens + data.counts.outputTokens),
            'Entrada + saída',
          ],
          [
            'Custo conhecido de IA',
            `US$ ${(data.counts.knownCostMicrosUsd / 1000000).toFixed(4)}`,
            `${data.counts.unknownCostRuns} execuções sem tarifa conhecida`,
          ],
        ].map(([label, value, help]) => (
          <div className="control-stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{help}</small>
          </div>
        ))}
      </div>
      {section === 'operations' && (
        <section className="control-panel control-hero">
          <div className="control-toolbar">
            <div className="control-title">
              <h2>Da descoberta à publicação</h2>
              <p>Etapas independentes · ações externas passam por aprovação.</p>
            </div>
            <span className="control-status">
              <ShieldCheck size={12} />
              Supervisão humana
            </span>
          </div>
          <div className="control-pipeline">
            {[
              {
                label: 'Fornecedor',
                icon: Database,
                detail: 'Catálogo autorizado',
                href: 'suppliers',
              },
              { label: 'Catálogo', icon: Layers, detail: 'Origem e histórico', href: 'products' },
              {
                label: 'Análise',
                icon: Bot,
                detail: `${data.runs.length} no recorte`,
                href: 'agents',
              },
              {
                label: 'Precificação',
                icon: Sparkles,
                detail: 'Cálculos auditáveis',
                href: 'pricing',
              },
              {
                label: 'Aprovação',
                icon: FileCheck,
                detail: `${pendingCount} pendentes`,
                href: 'operations',
              },
              {
                label: 'Mercado Livre',
                icon: Globe,
                detail: 'Conta autorizada',
                href: 'integrations',
              },
            ].map((step) => (
              <Link
                key={step.label}
                href={`${demo ? '/demo' : '/app'}/${step.href}`}
                className="control-stage"
              >
                <step.icon size={21} />
                <strong>{step.label}</strong>
                <small>{step.detail}</small>
              </Link>
            ))}
          </div>
        </section>
      )}
      <div role="tablist" aria-label="Central de operações" className="control-tabs">
        {tabs.map(([key, label], i) => (
          <button
            key={key}
            id={`control-tab-${key}`}
            role="tab"
            aria-selected={tab === key}
            aria-controls="control-content"
            tabIndex={tab === key ? 0 : -1}
            onClick={() => setTab(key)}
            onKeyDown={(e) => {
              const index =
                e.key === 'ArrowRight'
                  ? (i + 1) % tabs.length
                  : e.key === 'ArrowLeft'
                    ? (i - 1 + tabs.length) % tabs.length
                    : e.key === 'Home'
                      ? 0
                      : e.key === 'End'
                        ? tabs.length - 1
                        : -1;
              if (index < 0) return;
              e.preventDefault();
              setTab(tabs[index]![0]);
              document.getElementById(`control-tab-${tabs[index]![0]}`)?.focus();
            }}
          >
            {label}
            {key === 'approvals' && pendingCount > 0 ? ` (${pendingCount})` : ''}
          </button>
        ))}
      </div>
      <div id="control-content" role="tabpanel" aria-labelledby={`control-tab-${tab}`}>
        {tab === 'agents' && (
          <div className="control-grid">
            {agentDefinitions.map((agent, i) => {
              const key = agentKeys[i]!,
                runs = data.runs.filter((r) => r.agent === key),
                run = runs[0],
                running = run?.status === 'RUNNING';
              return (
                <article key={key} className="control-panel control-agent">
                  <div className="control-agent-head">
                    <span className="control-agent-icon">
                      <Bot size={23} />
                    </span>
                    <Status value={run?.status ?? 'Aguardando'} />
                  </div>
                  <div className="control-agent-body">
                    <h3>{agent.name}</h3>
                    <p>{agent.description}</p>
                  </div>
                  <div
                    className="control-progress"
                    role="progressbar"
                    aria-label={`Progresso de ${agent.name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    {...(!running
                      ? { 'aria-valuenow': run?.status === 'COMPLETED' ? 100 : 0 }
                      : { 'aria-valuetext': 'Análise real em andamento, progresso indeterminado' })}
                    data-running={running}
                  >
                    <div style={{ width: run?.status === 'COMPLETED' ? '100%' : '0%' }} />
                  </div>
                  <div className="control-agent-facts">
                    <div>
                      <span>Última execução</span>
                      {date(run?.createdAt)}
                    </div>
                    <div>
                      <span>Análises no recorte</span>
                      {runs.length}
                    </div>
                    <div>
                      <span>Duração / modo</span>
                      {run ? `${run.durationMs ?? '—'} ms · ${run.provider}` : '—'}
                    </div>
                    <div>
                      <span>Custo em USD</span>
                      {run
                        ? run.estimatedCostMicrosUsd === null
                          ? 'Tarifa não informada'
                          : (run.estimatedCostMicrosUsd / 1000000).toFixed(4)
                        : '—'}
                    </div>
                  </div>
                  {run?.errorCode && <p role="alert">Erro: {run.errorCode}</p>}
                  {run && <Evidence value={run.outputJson} label="Consultar resultado" />}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy || running || !state.canWrite}
                    onClick={() =>
                      demo
                        ? state.setDemo((old) => simulateAnalysis(old, key))
                        : void action(`/v1/agents/${key}/run`, { provider })
                    }
                  >
                    <Play size={13} />
                    {pending.includes(key)
                      ? 'Executando…'
                      : demo
                        ? 'Simular este agente'
                        : 'Executar análise'}
                    <ArrowRight size={12} />
                  </Button>
                </article>
              );
            })}
          </div>
        )}
        {tab === 'activity' && (
          <section className="control-panel">
            {!data.events.length ? (
              <Empty title="Nenhuma execução registrada">
                Execute uma análise ou workflow para acompanhar eventos com origem, categoria e
                horário.
              </Empty>
            ) : (
              <div className="control-feed">
                {data.events.map((event) => (
                  <article key={event.id} className="control-event">
                    <Activity size={17} />
                    <div>
                      <strong>{event.message}</strong>
                      <p>
                        {event.origin} · {event.category}
                      </p>
                      {event.detailJson !== null && <Evidence value={event.detailJson} />}
                    </div>
                    <time dateTime={event.createdAt}>{date(event.createdAt)}</time>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
        {tab === 'decisions' && (
          <section className="control-panel">
            {!data.decisions.length ? (
              <Empty title="Nenhuma decisão registrada">
                Execute Product Hunter ou outro agente para gerar recomendações com evidências.
              </Empty>
            ) : (
              <div className="control-records">
                {data.decisions.map((decision) => (
                  <article className="control-record" key={decision.id}>
                    <div className="control-toolbar">
                      <strong>
                        {decision.score === null
                          ? 'Recomendação'
                          : `${decision.score}/100 · Potencial observado`}
                      </strong>
                      <Status value={decision.reviewStatus} />
                    </div>
                    <p>{decision.recommendation}</p>
                    <small>
                      {date(decision.createdAt)} · execução {decision.runId.slice(0, 8)}
                    </small>
                    <Evidence value={decision.evidenceJson} />
                    {decision.reviewStatus === 'PENDING' && state.canWrite && (
                      <div className="control-actions">
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            demo
                              ? reviewDemo(decision.id, 'APPROVED', 'decisions')
                              : void action(`/v1/decisions/${decision.id}/review`, {
                                  status: 'APPROVED',
                                })
                          }
                        >
                          <Check size={13} />
                          Aprovar recomendação
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            demo
                              ? reviewDemo(decision.id, 'REJECTED', 'decisions')
                              : void action(`/v1/decisions/${decision.id}/review`, {
                                  status: 'REJECTED',
                                })
                          }
                        >
                          Rejeitar
                        </Button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
        {tab === 'approvals' && (
          <section className="control-panel">
            <div className="control-note">
              Aprovar registra a revisão. A execução externa é uma ação separada e exige uma conta
              conectada. Confira impacto, custos e riscos antes de aprovar.
            </div>
            <details className="control-record">
              <summary className="control-link">Solicitar encaminhamento manual</summary>
              <form
                className="control-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const values = new FormData(e.currentTarget);
                  const input = {
                    kind: String(values.get('kind')),
                    title: String(values.get('title')),
                    amountCents: Math.round(
                      Number(String(values.get('amount')).replace(',', '.')) * 100,
                    ),
                    details: String(values.get('details')),
                    risks: String(values.get('risks')),
                  };
                  if (demo) {
                    state.setDemo((old) => ({
                      ...old,
                      approvals: [
                        {
                          id: crypto.randomUUID(),
                          kind: input.kind,
                          title: input.title,
                          status: 'PENDING',
                          payloadJson: { ...input, simulation: true, execution: 'MANUAL_ONLY' },
                          reason: null,
                          createdAt: new Date().toISOString(),
                          approvedAt: null,
                          expiresAt: new Date(Date.now() + 86400000).toISOString(),
                        },
                        ...old.approvals,
                      ],
                    }));
                  } else void action('/v1/approvals', input);
                }}
              >
                <label>
                  Tipo
                  <select name="kind">
                    <option value="SUPPLIER_REQUEST">Solicitação ao fornecedor</option>
                    <option value="FINANCIAL_ACTION">Ação financeira manual</option>
                    <option value="OTHER">Outro encaminhamento</option>
                  </select>
                </label>
                <label>
                  Título
                  <input name="title" required minLength={5} maxLength={160} />
                </label>
                <label>
                  Impacto financeiro (R$)
                  <input
                    name="amount"
                    inputMode="decimal"
                    required
                    pattern="[0-9]+([.,][0-9]{1,2})?"
                  />
                </label>
                <label>
                  Dados e justificativa
                  <textarea name="details" required minLength={5} maxLength={3000} />
                </label>
                <label className="full">
                  Riscos e verificações necessárias
                  <textarea name="risks" required minLength={5} maxLength={1500} />
                </label>
                <Button disabled={busy || !state.canWrite} type="submit">
                  Solicitar revisão
                </Button>
              </form>
              <p>
                O sistema registra revisão e resultado declarado; não realiza compras ou pagamentos.
              </p>
            </details>
            {!data.approvals.length ? (
              <Empty title="Nenhuma aprovação pendente">
                Prepare um anúncio e solicite revisão para incluir uma ação nesta fila.
              </Empty>
            ) : (
              <div className="control-records">
                {data.approvals.map((approval) => (
                  <article className="control-record" key={approval.id}>
                    <div className="control-toolbar">
                      <h3>{approval.title}</h3>
                      <Status value={approval.status} />
                    </div>
                    <small>
                      {approval.kind} · solicitada em {date(approval.createdAt)} · válida até{' '}
                      {date(approval.expiresAt)}
                    </small>
                    <Evidence
                      value={approval.payloadJson}
                      label="Revisar impacto, custos e riscos"
                    />
                    {approval.approvedAt && (
                      <p>
                        Revisada em {date(approval.approvedAt)}
                        {approval.approvedByName ? ` por ${approval.approvedByName}` : ''}
                        {approval.reason ? ` · ${approval.reason}` : ''}
                      </p>
                    )}
                    {state.admin && approval.status === 'PENDING' && (
                      <div className="control-actions">
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            demo
                              ? reviewDemo(approval.id, 'APPROVED', 'approvals')
                              : void action(`/v1/approvals/${approval.id}/review`, {
                                  status: 'APPROVED',
                                  reason: 'Revisado no painel',
                                })
                          }
                        >
                          Aprovar ação
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            demo
                              ? reviewDemo(approval.id, 'REJECTED', 'approvals')
                              : void action(`/v1/approvals/${approval.id}/review`, {
                                  status: 'REJECTED',
                                })
                          }
                        >
                          Rejeitar ação
                        </Button>
                      </div>
                    )}
                    {state.admin &&
                      approval.status === 'APPROVED' &&
                      !['SUPPLIER_REQUEST', 'FINANCIAL_ACTION', 'OTHER'].includes(
                        approval.kind,
                      ) && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            demo
                              ? reviewDemo(approval.id, 'EXECUTED', 'approvals')
                              : void action(`/v1/approvals/${approval.id}/execute`)
                          }
                        >
                          {demo ? 'Simular execução aprovada' : 'Executar ação aprovada'}
                        </Button>
                      )}
                    {state.admin &&
                      approval.status === 'APPROVED' &&
                      ['SUPPLIER_REQUEST', 'FINANCIAL_ACTION', 'OTHER'].includes(approval.kind) && (
                        <form
                          className="control-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const reference = String(
                              new FormData(e.currentTarget).get('reference'),
                            );
                            if (demo) reviewDemo(approval.id, 'EXECUTED', 'approvals');
                            else
                              void action(`/v1/approvals/${approval.id}/manual-result`, {
                                reference,
                              });
                          }}
                        >
                          <label className="full">
                            Referência do resultado realizado manualmente
                            <input name="reference" required minLength={5} maxLength={1000} />
                          </label>
                          <Button variant="outline" disabled={busy} type="submit">
                            Registrar resultado manual
                          </Button>
                        </form>
                      )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
        {tab === 'workflows' && (
          <div className="control-records">
            <div className="control-note">
              <strong>
                {demo
                  ? 'Workflows demonstrativos'
                  : data.configuration.redis
                    ? 'Execução assíncrona na fila'
                    : 'Execução interna por regras'}
              </strong>
              <p>
                O agendamento depende dos workflows importados e ativados no n8n. A próxima execução
                é definida no n8n. Habilitar abaixo autoriza este workspace a receber os disparos.
              </p>
            </div>
            {data.workflows.map((w) => (
              <article className="control-panel" key={w.key}>
                <div className="control-toolbar">
                  <div className="control-title">
                    <h3>
                      <Workflow size={15} style={{ display: 'inline', verticalAlign: 'middle' }} />{' '}
                      {w.name}
                    </h3>
                    <p>{w.description}</p>
                  </div>
                  <Status value={w.lastExecution?.status ?? 'Aguardando'} />
                </div>
                <div className="control-toolbar" style={{ marginTop: 18 }}>
                  <small>
                    Última: {date(w.lastExecution?.createdAt)} ·{' '}
                    {w.lastExecution?.durationMs ?? '—'} ms · origem{' '}
                    {w.lastExecution?.source ?? '—'}
                  </small>
                  <div className="control-actions">
                    <a className="control-link" href={`/workflows/${w.key}.json`} download>
                      Baixar JSON
                    </a>
                    {!demo && state.admin && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void action(`/v1/automations/${w.key}`, { enabled: !w.enabled }, 'PATCH')
                        }
                      >
                        {w.enabled ? 'Desabilitar agenda' : 'Habilitar agenda'}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || !state.canWrite}
                      onClick={() =>
                        demo
                          ? state.setDemo((old) => simulateWorkflow(old, w.key))
                          : void action(`/v1/automations/${w.key}/run`, {
                              idempotencyKey: crypto.randomUUID(),
                            })
                      }
                    >
                      <Play size={12} />
                      {demo ? 'Simular' : 'Executar agora'}
                    </Button>
                  </div>
                </div>
                {w.lastExecution && (
                  <Evidence
                    value={w.lastExecution.resultJson}
                    label="Resultado da última execução"
                  />
                )}
              </article>
            ))}
            <section className="control-panel">
              <h2>Histórico de execuções</h2>
              {!data.executions.length ? (
                <Empty title="Nenhum workflow executado">
                  Inicie uma execução manual ou configure o agendamento.
                </Empty>
              ) : (
                data.executions.map((e) => (
                  <div className="control-event" key={e.id}>
                    <Workflow size={17} />
                    <div>
                      <strong>{e.workflowKey}</strong>
                      <p>
                        {e.source} · {e.durationMs ?? '—'} ms ·{' '}
                        {e.errorCode ?? 'sem erro registrado'}
                      </p>
                      <Evidence value={e.resultJson} />
                    </div>
                    <Status value={e.status} />
                  </div>
                ))
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
