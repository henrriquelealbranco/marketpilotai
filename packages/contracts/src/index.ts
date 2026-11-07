import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1).max(128),
});
export const registerSchema = loginSchema.extend({
  password: z.string().min(12, 'Use pelo menos 12 caracteres.').max(128),
  name: z.string().trim().min(2).max(80),
  workspaceName: z.string().trim().min(2).max(80),
});
export const dashboardQuerySchema = z.object({
  days: z
    .enum(['7', '30', '90'])
    .default('30')
    .transform((v) => Number(v) as 7 | 30 | 90),
});
export const workspaceSchema = z.object({ name: z.string().trim().min(2).max(80) }).strict();
export type Period = 7 | 30 | 90;
export type DataSource = 'real' | 'estimated' | 'simulated';
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER';
}
export interface Workspace {
  id: string;
  name: string;
  timezone: string;
}
export interface Identity {
  user: SessionUser;
  workspace: Workspace;
}
export interface OrderFact {
  id: string;
  date: string;
  productId: string;
  product: string;
  category: string;
  quantity: number;
  revenueCents: number;
  costCents: number;
  status: 'delivered' | 'shipping' | 'processing' | 'cancelled';
  supplier: string;
}
export interface Dashboard {
  source: DataSource;
  asOf: string;
  days: Period;
  revenueCents: number;
  estimatedProfitCents: number;
  realizedProfitCents: number;
  marginPercent: number;
  orderCount: number;
  chart: { date: string; revenueCents: number; profitCents: number }[];
  ranking: {
    id: string;
    name: string;
    category: string;
    supplier: string;
    units: number;
    revenueCents: number;
    profitCents: number;
    marginPercent: number;
  }[];
  recentOrders: OrderFact[];
}
export const integrations = [
  {
    id: 'mercadolivre',
    name: 'Mercado Livre',
    description: 'Anúncios, pedidos e disponibilidade',
    phase: 5,
    status: 'pending',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Análises e recomendações dos agentes',
    phase: 3,
    status: 'pending',
  },
  {
    id: 'n8n',
    name: 'n8n',
    description: 'Orquestração das automações',
    phase: 4,
    status: 'pending',
  },
  {
    id: 'suppliers',
    name: 'Fornecedores',
    description: 'Catálogos de fontes autorizadas',
    phase: 2,
    status: 'pending',
  },
] as const;
export const agentDefinitions = [
  {
    name: 'Product Hunter',
    description: 'Descobre produtos com potencial',
    initials: 'PH',
    phase: 3,
  },
  {
    name: 'Market Analyst',
    description: 'Compara preços e posicionamento',
    initials: 'MA',
    phase: 3,
  },
  {
    name: 'Pricing Strategist',
    description: 'Protege a margem da operação',
    initials: 'PS',
    phase: 3,
  },
  {
    name: 'Supplier Monitor',
    description: 'Acompanha disponibilidade e custos',
    initials: 'SM',
    phase: 4,
  },
  {
    name: 'Listing Optimizer',
    description: 'Prepara anúncios para aprovação',
    initials: 'LO',
    phase: 5,
  },
  {
    name: 'Operations Analyst',
    description: 'Identifica problemas nos pedidos',
    initials: 'OA',
    phase: 5,
  },
  {
    name: 'Business Advisor',
    description: 'Transforma dados em recomendações',
    initials: 'BA',
    phase: 3,
  },
] as const;
