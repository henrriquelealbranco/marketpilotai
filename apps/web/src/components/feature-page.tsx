'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, LockKeyhole, ShieldCheck, Check, Save } from 'lucide-react';
import type { Identity, Workspace } from '@marketpilot/contracts';
import { pages } from '@/lib/navigation';
import { api } from '@/lib/utils';
import { Button } from './ui/button';
import { CatalogWorkspace } from './catalog/catalog-workspace';
import { PricingWorkspace } from './pricing/pricing-workspace';
import { OperationsWorkspace } from './operations/operations-workspace';
import { BusinessWorkspace } from './operations/business-workspace';
import { Dashboard } from './dashboard';
export function FeaturePage({
  slug,
  demo,
  supplierFilter,
}: {
  slug: string;
  demo: boolean;
  supplierFilter?: string;
}) {
  if (slug === 'dashboard') return <Dashboard demo={demo} />;
  if (slug === 'products' || slug === 'suppliers')
    return (
      <CatalogWorkspace
        key={`${slug}-${supplierFilter ?? ''}`}
        kind={slug}
        demo={demo}
        initialSupplierId={supplierFilter}
      />
    );
  if (slug === 'pricing') return <PricingWorkspace demo={demo} />;
  const page = pages.find((p) => p.slug === slug)!;
  const Icon = page.icon;
  return (
    <>
      <Link className="back-link" href={demo ? '/demo' : '/app'}>
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
            {['operations', 'agents', 'automations'].includes(slug)
              ? 'Agentes, decisões e automações. Um único ponto de controle.'
              : 'Dados, decisões e ações da sua operação.'}
          </p>
        </div>
        <span className="source-label">{demo ? 'Demonstração' : 'Conta atual'}</span>
      </div>
      {slug === 'settings' ? (
        <Settings demo={demo} />
      ) : slug === 'audit' ? (
        <Audit demo={demo} />
      ) : ['operations', 'agents', 'automations'].includes(slug) ? (
        <OperationsWorkspace demo={demo} section={slug} />
      ) : (
        <BusinessWorkspace demo={demo} slug={slug} />
      )}
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
            <dd>0.3.0</dd>
          </div>
          <div>
            <dt>Integrações comerciais</dt>
            <dd>Consulte Integrações</dd>
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
