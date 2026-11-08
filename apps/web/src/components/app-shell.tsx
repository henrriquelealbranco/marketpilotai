'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronRight,
  LogOut,
  Menu,
  Command,
  Bell,
  CircleHelp,
} from 'lucide-react';
import type { Identity } from '@marketpilot/contracts';
import { Brand } from './logo';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { navigation, pages } from '@/lib/navigation';
import { api, cn } from '@/lib/utils';

export function AppShell({
  demo,
  identity,
  children,
}: {
  demo: boolean;
  identity?: Identity;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { resolvedTheme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const base = demo ? '/demo' : '/app';
  const current =
    pages.find((p) => pathname === `${base}${p.slug ? `/${p.slug}` : ''}`)?.label || 'Dashboard';
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  async function logout() {
    setLeaving(true);
    setError('');
    try {
      await api('/v1/auth/logout', { method: 'POST' });
      queryClient.clear();
      router.replace('/login');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível sair.');
      setLeaving(false);
    }
  }
  const navContent = (isMobile = false) => (
    <>
      <div className="sidebar-brand">
        <Brand compact={collapsed && !isMobile} href={base} />
        {(!collapsed || isMobile) && <span className="version-tag">ATIVO</span>}
      </div>
      {(!collapsed || isMobile) && (
        <div className="workspace-switch">
          <span className="workspace-icon">{demo ? 'D' : identity?.workspace.name.charAt(0)}</span>
          <span>
            <strong>{demo ? 'Operação exemplo' : identity?.workspace.name}</strong>
            <small>{demo ? 'Workspace demonstrativo' : 'Minha operação'}</small>
          </span>
          <ChevronDown size={14} />
        </div>
      )}
      <nav
        className="sidebar-nav"
        aria-label={isMobile ? 'Navegação móvel' : 'Navegação principal'}
      >
        {navigation.map((group) => (
          <div className="nav-group" key={group.label}>
            {(!collapsed || isMobile) && <p className="nav-label">{group.label}</p>}
            {group.items.map((item) => {
              const href = `${base}${item.slug ? `/${item.slug}` : ''}`;
              const active = pathname === href;
              return (
                <Link
                  key={item.slug}
                  href={href}
                  onClick={() => setMobile(false)}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? 'page' : undefined}
                  className={cn('nav-item', active && 'active')}
                >
                  <item.icon size={17} strokeWidth={1.6} />
                  <span>{item.label}</span>
                  {item.slug === 'operations' && (!collapsed || isMobile) && (
                    <span className="new-label">AI</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="sidebar-bottom">
        {(!collapsed || isMobile) && (
          <div className="phase-note">
            <span className="status-dot" />
            <span>
              Operação supervisionada <strong>v0.3.0</strong>
            </span>
          </div>
        )}
        <button
          className="profile"
          onClick={() => {
            router.push(`${base}/settings`);
            setMobile(false);
          }}
        >
          <span className="avatar">
            {demo ? 'DE' : identity?.user.name.slice(0, 2).toUpperCase()}
          </span>
          <span>
            <strong>{demo ? 'Conta de demonstração' : identity?.user.name}</strong>
            <small>{demo ? 'Dados fictícios' : 'Gerenciar operação'}</small>
          </span>
          <ChevronRight size={15} />
        </button>
        {!isMobile && (
          <button
            className="collapse-button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
          >
            {collapsed ? (
              <PanelLeftOpen size={17} />
            ) : (
              <>
                <PanelLeftClose size={17} />
                <span>Recolher menu</span>
              </>
            )}
          </button>
        )}
      </div>
    </>
  );
  return (
    <div className={cn('app-shell', collapsed && 'sidebar-collapsed')}>
      <a className="skip-link" href="#main">
        Ir para o conteúdo
      </a>
      <aside className="sidebar">{navContent()}</aside>
      <Dialog open={mobile} onOpenChange={setMobile}>
        <DialogContent className="mobile-nav">
          <DialogTitle className="sr-only">Navegação</DialogTitle>
          <DialogDescription className="sr-only">Áreas do MarketPilot AI</DialogDescription>
          {navContent(true)}
        </DialogContent>
      </Dialog>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumb">
            <Button
              className="mobile-menu"
              variant="ghost"
              size="icon"
              aria-label="Abrir navegação"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </Button>
            <span className="breadcrumb-workspace">Workspace</span>
            <ChevronRight size={13} />
            <span>{current}</span>
          </div>
          <div className="topbar-actions">
            <button
              className="search-trigger"
              onClick={() => setSearchOpen(true)}
              aria-label="Buscar páginas"
            >
              <Search size={16} />
              <span>Buscar no workspace...</span>
              <kbd>
                <Command size={10} /> K
              </kbd>
            </button>
            <span className="topbar-divider" />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Alternar tema"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            >
              <Sun size={18} className="theme-sun" />
              <Moon size={18} className="theme-moon" />
            </Button>
            <Button variant="ghost" size="icon" asChild aria-label="Ver alertas">
              <Link href={`${base}/alerts`}>
                <Bell size={18} />
              </Link>
            </Button>
            <span className="topbar-avatar">
              {demo ? 'DE' : identity?.user.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
        </header>
        <main id="main" className="main-content">
          {children}
        </main>
        <footer className="app-footer">
          <span>
            <span className="status-dot" />
            {demo ? 'Ambiente de demonstração' : 'Workspace protegido'}
          </span>
          <span>
            MarketPilot AI <span className="footer-version">v0.3.0</span>
            <Link href={`${base}/settings`} aria-label="Sobre esta versão">
              <CircleHelp size={14} />
            </Link>
          </span>
        </footer>
      </div>
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent>
          <DialogTitle>Ir para uma página</DialogTitle>
          <DialogDescription>Encontre uma área da sua operação.</DialogDescription>
          <div className="command-input">
            <Search size={18} />
            <input
              aria-label="Buscar página"
              placeholder="Digite o nome da página..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="command-results">
            {pages
              .filter((p) => p.label.toLowerCase().includes(search.toLowerCase()))
              .map((p) => (
                <Link
                  href={`${base}${p.slug ? `/${p.slug}` : ''}`}
                  key={p.slug}
                  onClick={() => setSearchOpen(false)}
                >
                  <p.icon size={17} />
                  <span>{p.label}</span>
                  <small>Workspace</small>
                  <ChevronRight size={14} />
                </Link>
              ))}
          </div>
        </DialogContent>
      </Dialog>
      {!demo && (
        <div className="logout-float">
          <Button size="sm" variant="ghost" onClick={logout} disabled={leaving}>
            <LogOut size={14} />
            {leaving ? 'Saindo...' : 'Sair da conta'}
          </Button>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
