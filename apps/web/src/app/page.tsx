import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  GitBranch,
  Layers,
  LockKeyhole,
  Orbit,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import { agentDefinitions } from '@marketpilot/contracts';
import { Brand } from '@/components/logo';
import './landing.css';
export default function Home() {
  return (
    <main className="landing">
      <nav className="landing-nav" aria-label="Navegação principal">
        <Brand href="/" />
        <div>
          <a href="#produto">Produto</a>
          <a href="#engenharia">Engenharia</a>
          <Link href="/login">Entrar</Link>
          <Link href="/demo" className="button button-primary">
            Explorar demonstração <ArrowUpRight size={14} />
          </Link>
        </div>
      </nav>
      <section className="landing-hero">
        <div className="landing-eyebrow">
          <i /> INTELIGÊNCIA COM SUPERVISÃO HUMANA
        </div>
        <h1>
          Sua operação.
          <br />
          Uma direção <span>inteligente.</span>
        </h1>
        <p>
          Do catálogo ao anúncio aprovado. Produtos, margens, agentes e automações em uma central
          que mantém cada decisão à vista.
        </p>
        <div className="landing-ctas">
          <Link className="button button-primary" href="/demo">
            Conhecer o MarketPilot <ArrowRight size={17} />
          </Link>
          <a className="button button-outline" href="#engenharia">
            Explorar a engenharia
          </a>
        </div>
        <small>
          Projeto de portfólio funcional · demonstração isolada · integrações oficiais configuráveis
        </small>
        <div className="landing-orbit" aria-hidden="true">
          <Orbit size={270} strokeWidth={0.35} />
        </div>
      </section>
      <section className="landing-product" id="produto">
        <div className="landing-section-heading">
          <div>
            <span className="landing-eyebrow">AI OPERATIONS CENTER</span>
            <h2>
              Veja a decisão.
              <br />
              Controle a próxima ação.
            </h2>
          </div>
          <p>
            Agentes com ferramentas restritas, evidências estruturadas e aprovações humanas. O feed
            acompanha eventos registrados, com origem e horário.
          </p>
        </div>
        <div className="landing-screen">
          <div className="landing-window-bar">
            <span />
            <span />
            <span />
            <small>MarketPilot AI · Demonstração</small>
          </div>
          <Image
            src="/screenshots/operations-dark-v03.png"
            alt="Captura real da central de operações MarketPilot AI em modo demonstração"
            width={1440}
            height={1100}
            priority
            sizes="(max-width: 800px) 100vw, 1200px"
          />
        </div>
        <div className="landing-proof">
          <span>
            <Check size={15} />
            Histórico persistente
          </span>
          <span>
            <ShieldCheck size={15} />
            Aprovações vinculadas ao conteúdo
          </span>
          <span>
            <LockKeyhole size={15} />
            Demonstração sem ações externas
          </span>
        </div>
      </section>
      <section className="landing-features">
        <div className="landing-section-heading">
          <div>
            <span className="landing-eyebrow">CLAREZA EM CADA ETAPA</span>
            <h2>
              Uma operação conectada.
              <br />
              Sem perder o contexto.
            </h2>
          </div>
        </div>
        <div className="landing-grid">
          {[
            {
              icon: Layers,
              title: 'Catálogo com origem',
              text: 'Produtos e fornecedores, importação CSV/XML autorizada, versões e histórico de custo e estoque.',
            },
            {
              icon: GitBranch,
              title: 'Margens explicáveis',
              text: 'Motor determinístico em centavos, cenários de preço e bloqueios quando a margem não atende à cotação.',
            },
            {
              icon: Bot,
              title: 'Análises com evidências',
              text: 'Sete agentes, regras locais ou OpenAI, consumo registrado e sinais desconhecidos explícitos.',
            },
            {
              icon: Workflow,
              title: 'Automações supervisionadas',
              text: 'Dez workflows n8n versionados. Fila assíncrona, idempotência e tratamento de falhas.',
            },
            {
              icon: ShieldCheck,
              title: 'Publicação aprovada',
              text: 'OAuth oficial Mercado Livre e ações vinculadas à versão revisada do anúncio.',
            },
            {
              icon: Orbit,
              title: 'Resultados com contexto',
              text: 'Pedidos, custos estimados e confirmados, relatórios CSV/PDF e consultas aos dados disponíveis.',
            },
          ].map((f) => (
            <article key={f.title}>
              <f.icon size={24} />
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="landing-agents">
        <div>
          <span className="landing-eyebrow">SETE ESPECIALIDADES</span>
          <h2>
            Inteligência que
            <br />
            trabalha com limites.
          </h2>
          <p>
            Uma análise recomenda. Você revisa. Ações comerciais sensíveis precisam de aprovação e
            conexão autorizada.
          </p>
          <Link href="/demo/agents" className="control-link">
            Conhecer os agentes <ArrowRight size={13} />
          </Link>
        </div>
        <div className="landing-agent-list">
          {agentDefinitions.map((a) => (
            <div key={a.name}>
              <span>{a.initials}</span>
              <div>
                <h3>{a.name}</h3>
                <p>{a.description}</p>
              </div>
              <ArrowUpRight size={14} />
            </div>
          ))}
        </div>
      </section>
      <section id="engenharia" className="landing-engineering">
        <span className="landing-eyebrow">ENGENHARIA POR TRÁS DO PRODUTO</span>
        <h2>Construído para ser verificável.</h2>
        <p>
          Uma aplicação completa, com responsabilidades separadas e configuração explícita das
          conexões externas.
        </p>
        <div className="landing-architecture">
          <div>
            <strong>Experiência</strong>
            <span>Next.js · React · TypeScript</span>
          </div>
          <ArrowRight />
          <div>
            <strong>Operação</strong>
            <span>Fastify · Prisma · PostgreSQL</span>
          </div>
          <ArrowRight />
          <div>
            <strong>Orquestração</strong>
            <span>Redis · BullMQ · n8n</span>
          </div>
        </div>
        <div className="landing-grid">
          <article>
            <h3>Isolamento e rastreabilidade</h3>
            <p>
              Sessões HttpOnly, papéis de acesso, dados separados por workspace, segredos
              criptografados e trilha de auditoria.
            </p>
          </article>
          <article>
            <h3>Falhas sem duplicidade</h3>
            <p>
              Chaves de idempotência, tentativas controladas e reconciliação quando uma resposta
              externa não confirma a operação.
            </p>
          </article>
          <article>
            <h3>Entrega reproduzível</h3>
            <p>
              Migrações, testes unitários, de integração e de navegação; seis serviços Docker,
              health checks e procedimentos de backup.
            </p>
          </article>
        </div>
        <div className="landing-tech">
          Inter · Tailwind · Radix UI · TanStack · Recharts · OpenAI Responses · Mercado Livre OAuth
          · Docker · Coolify
        </div>
        <p className="landing-status">
          A demonstração usa dados fictícios. Ativar serviços externos exige credenciais, permissões
          e configuração no servidor. O deploy remoto depende da infraestrutura de destino.
        </p>
      </section>
      <section className="landing-end">
        <span className="landing-eyebrow">CONHEÇA POR DENTRO</span>
        <h2>
          O próximo passo
          <br />
          começa com clareza.
        </h2>
        <Link className="button button-primary" href="/demo">
          Explorar demonstração <ArrowUpRight size={16} />
        </Link>
      </section>
      <footer className="landing-footer">
        <Brand href="/" />
        <p>Automação inteligente, decisões sob controle.</p>
        <Link href="/login">
          Acessar operação <ArrowRight size={13} />
        </Link>
      </footer>
    </main>
  );
}
