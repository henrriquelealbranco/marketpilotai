'use client';

import Link from 'next/link';
import { ArrowRight, CircleCheck, LockKeyhole, Plus, Plug, ShieldCheck } from 'lucide-react';
import { pages } from '@/lib/navigation';

const firstSteps = [
  {
    href: '/app/suppliers',
    icon: Plus,
    title: 'Cadastrar fornecedor',
    detail: 'Registre a origem do catálogo antes de incluir produtos.',
  },
  {
    href: '/app/products',
    icon: Plus,
    title: 'Importar ou cadastrar produtos',
    detail: 'Use CSV/XML autorizado ou inclua produtos manualmente.',
  },
  {
    href: '/app/integrations',
    icon: Plug,
    title: 'Conectar serviços',
    detail: 'Ative Mercado Livre, OpenAI e n8n quando as credenciais estiverem prontas.',
  },
];

export function OperationMenu() {
  const areas = pages.filter((page) => page.slug && page.slug !== 'menu');
  return (
    <div className="operation-menu">
      <section className="menu-hero panel">
        <div>
          <span className="page-eyebrow">
            <CircleCheck size={14} /> OPERAÇÃO REAL
          </span>
          <h1>Menu da operação</h1>
          <p>
            Seu workspace começa vazio por segurança. Cadastre ou conecte suas fontes para que cada
            indicador, análise e decisão use apenas dados reais.
          </p>
        </div>
        <div className="menu-hero-status">
          <ShieldCheck size={21} />
          <span>Dados isolados por workspace</span>
        </div>
      </section>

      <section aria-labelledby="first-steps-title">
        <div className="menu-section-heading">
          <div>
            <span className="page-eyebrow">COMECE POR AQUI</span>
            <h2 id="first-steps-title">Preparar a operação</h2>
          </div>
          <span>Sem conteúdo simulado</span>
        </div>
        <div className="menu-first-steps">
          {firstSteps.map((step) => (
            <Link className="menu-step" href={step.href} key={step.href}>
              <step.icon size={19} />
              <div>
                <strong>{step.title}</strong>
                <p>{step.detail}</p>
              </div>
              <ArrowRight size={16} />
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="areas-title">
        <div className="menu-section-heading">
          <div>
            <span className="page-eyebrow">MÓDULOS</span>
            <h2 id="areas-title">Abrir uma área</h2>
          </div>
          <span>{areas.length} áreas operacionais</span>
        </div>
        <div className="menu-areas">
          {areas.map((area) => (
            <Link className="menu-area" href={`/app/${area.slug}`} key={area.slug}>
              <area.icon size={21} />
              <span>
                <strong>{area.label}</strong>
                <small>{area.phase >= 4 ? 'Operação supervisionada' : 'Dados e decisões'}</small>
              </span>
              <ArrowRight size={15} />
            </Link>
          ))}
        </div>
      </section>

      <div className="menu-security-note">
        <LockKeyhole size={16} />
        Ações que podem alterar anúncios, preços ou estoque exigem aprovação e integração
        autorizada.
      </div>
    </div>
  );
}
