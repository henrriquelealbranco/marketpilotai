'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Eye,
  EyeOff,
  ArrowUpRight,
  ShieldCheck,
  ChartNoAxesCombined,
  Orbit,
  CircleAlert,
} from 'lucide-react';
import { Brand } from './logo';
import { Button } from './ui/button';
import { api } from '@/lib/utils';

export function AuthForm({ signup = false }: { signup?: boolean }) {
  const router = useRouter();
  const client = useQueryClient();
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const { data: config, isError: configError } = useQuery({
    queryKey: ['public-config'],
    queryFn: () => api<{ registrationEnabled: boolean }>('/v1/config'),
  });
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      await api(`/v1/auth/${signup ? 'register' : 'login'}`, {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(form)),
      });
      client.clear();
      router.replace('/app');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível acessar sua conta.');
      setPending(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Brand />
        <div className="auth-story-content">
          <span className="auth-eyebrow">
            <span className="status-dot" />
            INTELIGÊNCIA PARA O PRÓXIMO PASSO
          </span>
          <h1>
            Sua operação.
            <br />
            Uma nova
            <br />
            <span>perspectiva.</span>
          </h1>
          <p>
            Conecte os pontos entre produtos, margens e decisões. Construa uma operação com mais
            clareza.
          </p>
          <div className="auth-visual">
            <div className="auth-orbit">
              <Orbit size={45} strokeWidth={1} />
            </div>
            <span className="auth-chip chip-one">
              <ChartNoAxesCombined size={16} />
              Visão financeira
            </span>
            <span className="auth-chip chip-two">
              <ShieldCheck size={16} />
              Decisões com controle
            </span>
            <span className="auth-orbit-dot" />
          </div>
        </div>
        <div className="auth-story-footer">
          <span>MarketPilot AI</span>
          <span>Construindo o futuro da sua operação.</span>
        </div>
      </div>
      <div className="auth-main">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        <Link href="/demo" className="auth-demo-link">
          Explorar demonstração <ArrowUpRight size={15} />
        </Link>
        <div className="auth-form-wrap">
          <span className="subtle-tag">SEU WORKSPACE</span>
          <h2>{signup ? 'Comece a sua operação.' : 'Bom ter você por aqui.'}</h2>
          <p>
            {signup
              ? 'Crie uma conta para organizar os próximos passos.'
              : 'Entre para acompanhar sua operação.'}
          </p>
          {signup && config && !config.registrationEnabled ? (
            <div className="auth-closed">
              <ShieldCheck size={30} />
              <h3>Cadastro por convite</h3>
              <p>
                Solicite acesso ao responsável pela operação. Você pode explorar o ambiente de
                demonstração enquanto isso.
              </p>
              <Button asChild>
                <Link href="/demo">
                  Abrir demonstração
                  <ArrowRight size={16} />
                </Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="auth-form">
              {signup && (
                <>
                  <label htmlFor="name">Seu nome</label>
                  <input
                    id="name"
                    name="name"
                    autoComplete="name"
                    placeholder="Como podemos chamar você?"
                    minLength={2}
                    maxLength={80}
                    required
                  />
                  <label htmlFor="workspaceName">Nome da operação</label>
                  <input
                    id="workspaceName"
                    name="workspaceName"
                    autoComplete="organization"
                    placeholder="Ex.: Minha loja"
                    minLength={2}
                    maxLength={80}
                    required
                  />
                </>
              )}
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="voce@empresa.com.br"
                maxLength={254}
                required
              />
              <label htmlFor="password">Senha</label>
              <div className="password-input">
                <input
                  id="password"
                  name="password"
                  type={show ? 'text' : 'password'}
                  autoComplete={signup ? 'new-password' : 'current-password'}
                  placeholder={signup ? 'Pelo menos 12 caracteres' : 'Sua senha'}
                  minLength={signup ? 12 : 1}
                  maxLength={128}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {signup && (
                <p className="field-help">Use uma senha única com pelo menos 12 caracteres.</p>
              )}
              {error && (
                <p className="form-error" role="alert">
                  <CircleAlert size={16} />
                  {error}
                </p>
              )}
              {configError && (
                <p className="form-error" role="alert">
                  O serviço de acesso está indisponível. Tente novamente.
                </p>
              )}
              <Button
                type="submit"
                disabled={pending || (signup && !config)}
                className="auth-submit"
              >
                {pending ? 'Aguarde...' : signup ? 'Criar minha conta' : 'Entrar na minha conta'}
                <ArrowRight size={17} />
              </Button>
            </form>
          )}
          <p className="auth-switch">
            {signup ? 'Já tem uma conta?' : 'Primeira vez por aqui?'}{' '}
            <Link href={signup ? '/login' : '/signup'}>{signup ? 'Entrar' : 'Criar conta'}</Link>
          </p>
          <div className="auth-security">
            <ShieldCheck size={15} />
            <span>Dados da demonstração e da conta separados.</span>
          </div>
        </div>
        <footer className="auth-legal">
          Versão inicial · Fase 1 de 7<span>Português (Brasil)</span>
        </footer>
      </div>
    </div>
  );
}
