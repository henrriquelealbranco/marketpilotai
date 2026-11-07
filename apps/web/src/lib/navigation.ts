import {
  LayoutDashboard,
  Orbit,
  ScanSearch,
  Package,
  Truck,
  ChartNoAxesCombined,
  Calculator,
  Megaphone,
  ShoppingBag,
  Bot,
  Workflow,
  ChartPie,
  Bell,
  MessageSquare,
  Plug,
  Settings2,
  ShieldCheck,
  FlaskConical,
} from 'lucide-react';
export const navigation = [
  {
    label: 'PRINCIPAL',
    items: [
      { label: 'Dashboard', slug: '', icon: LayoutDashboard, phase: 1 },
      { label: 'AI Operations Center', slug: 'operations', icon: Orbit, phase: 4 },
      { label: 'Product Hunter AI', slug: 'hunter', icon: ScanSearch, phase: 3 },
    ],
  },
  {
    label: 'OPERAÇÃO',
    items: [
      { label: 'Produtos', slug: 'products', icon: Package, phase: 2 },
      { label: 'Fornecedores', slug: 'suppliers', icon: Truck, phase: 2 },
      { label: 'Inteligência de mercado', slug: 'market', icon: ChartNoAxesCombined, phase: 3 },
      { label: 'Precificação', slug: 'pricing', icon: Calculator, phase: 3 },
      { label: 'Anúncios', slug: 'listings', icon: Megaphone, phase: 5 },
      { label: 'Pedidos', slug: 'orders', icon: ShoppingBag, phase: 5 },
    ],
  },
  {
    label: 'INTELIGÊNCIA',
    items: [
      { label: 'Agentes de IA', slug: 'agents', icon: Bot, phase: 3 },
      { label: 'Automações n8n', slug: 'automations', icon: Workflow, phase: 4 },
      { label: 'Analytics', slug: 'analytics', icon: ChartPie, phase: 6 },
      { label: 'Alertas', slug: 'alerts', icon: Bell, phase: 4 },
      { label: 'Assistente de IA', slug: 'assistant', icon: MessageSquare, phase: 3 },
    ],
  },
  {
    label: 'WORKSPACE',
    items: [
      { label: 'Integrações', slug: 'integrations', icon: Plug, phase: 2 },
      { label: 'Configurações', slug: 'settings', icon: Settings2, phase: 1 },
      { label: 'Auditoria', slug: 'audit', icon: ShieldCheck, phase: 1 },
      { label: 'Modo demonstração', slug: 'demo', icon: FlaskConical, phase: 1 },
    ],
  },
];
export const pages = navigation.flatMap((group) => group.items);
