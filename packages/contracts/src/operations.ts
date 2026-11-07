import { z } from 'zod';
export const agentKeys = [
  'product-hunter',
  'market-analyst',
  'pricing-strategist',
  'supplier-monitor',
  'listing-optimizer',
  'operations-analyst',
  'business-advisor',
] as const;
export const workflowDefinitions = [
  {
    key: 'discovery',
    name: 'Descoberta de produtos',
    description: 'Analisa o catálogo autorizado e registra recomendações.',
  },
  {
    key: 'pricing-monitor',
    name: 'Monitoramento de preços',
    description: 'Verifica cotações e alterações de custo.',
  },
  {
    key: 'availability-sync',
    name: 'Sincronização de disponibilidade',
    description: 'Exige fonte externa autorizada e configurada.',
  },
  {
    key: 'listing-preparation',
    name: 'Preparação de anúncios',
    description: 'Prepara recomendações; publicação depende de aprovação.',
  },
  {
    key: 'order-processing',
    name: 'Processamento de pedidos',
    description: 'Valida pedidos e prepara encaminhamentos para revisão.',
  },
  {
    key: 'daily-report',
    name: 'Relatório diário',
    description: 'Consolida os resultados disponíveis.',
  },
  {
    key: 'supplier-monitor',
    name: 'Monitoramento de fornecedores',
    description: 'Verifica disponibilidade, origem e atualização de catálogos.',
  },
  {
    key: 'opportunity-summary',
    name: 'Resumo de oportunidades',
    description: 'Consolida oportunidades com evidências e sinais desconhecidos.',
  },
  {
    key: 'margin-alerts',
    name: 'Alertas de margem',
    description: 'Identifica cotações bloqueadas ou custos alterados.',
  },
  {
    key: 'failure-monitor',
    name: 'Falhas operacionais',
    description: 'Consolida falhas de agentes e automações.',
  },
] as const;
export const runAgentSchema = z
  .object({
    provider: z.enum(['rules', 'openai']).default('rules'),
    productId: z.uuid().optional(),
  })
  .strict();
export const orderInputSchema = z
  .object({
    externalId: z.string().trim().min(1).max(100),
    productId: z.uuid(),
    amountCents: z.number().int().min(1).max(99999999),
    costCents: z.number().int().min(0).max(99999999),
    quantity: z.number().int().min(1).max(10000).default(1),
    status: z.enum(['processing', 'shipping', 'delivered', 'cancelled']).default('processing'),
    costsConfirmed: z.boolean().default(false),
    tracking: z.string().trim().max(120).optional(),
    deadline: z.iso.datetime().optional(),
  })
  .strict();
export const listingInputSchema = z
  .object({
    productId: z.uuid(),
    title: z.string().trim().min(5).max(60),
    description: z.string().trim().max(5000).default(''),
    publicationModel: z.enum(['USER_PRODUCT', 'LEGACY']).default('USER_PRODUCT'),
    priceCents: z.number().int().min(1).max(99999999),
    stock: z.number().int().min(0).max(10000000),
    categoryId: z.string().regex(/^MLB\d+$/),
    listingTypeId: z.string().trim().min(1).max(60),
    pictures: z
      .array(
        z
          .httpUrl()
          .max(1000)
          .refine((url) => {
            const value = new URL(url);
            return value.protocol === 'https:' && !value.username && !value.password;
          }),
      )
      .min(1)
      .max(12),
    attributes: z
      .array(z.object({ id: z.string().max(80), value_name: z.string().max(200) }).strict())
      .max(50)
      .default([]),
  })
  .strict();
export interface OperationalRun {
  id: string;
  agent: string;
  provider: string;
  status: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostMicrosUsd: number | null;
  durationMs: number | null;
  errorCode: string | null;
  createdAt: string;
  outputJson: unknown;
}
export interface DecisionRow {
  id: string;
  runId: string;
  productId: string | null;
  recommendation: string;
  evidenceJson: unknown;
  score: number | null;
  reviewStatus: string;
  createdAt: string;
}
export interface ApprovalRow {
  approvedByName?: string | null;
  id: string;
  kind: string;
  title: string;
  status: string;
  payloadJson: unknown;
  reason: string | null;
  createdAt: string;
  approvedAt: string | null;
  expiresAt: string;
}
export interface EventRow {
  id: number;
  origin: string;
  category: string;
  message: string;
  detailJson: unknown;
  createdAt: string;
}
export interface WorkflowRow {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  lastExecution: ExecutionRow | null;
}
export interface ExecutionRow {
  id: string;
  workflowKey: string;
  source: string;
  status: string;
  durationMs: number | null;
  errorCode: string | null;
  resultJson: unknown;
  createdAt: string;
}
export interface OperationState {
  runs: OperationalRun[];
  decisions: DecisionRow[];
  approvals: ApprovalRow[];
  events: EventRow[];
  workflows: WorkflowRow[];
  executions: ExecutionRow[];
  counts: {
    runs: number;
    pendingApprovals: number;
    errors: number;
    inputTokens: number;
    outputTokens: number;
    knownCostMicrosUsd: number;
    unknownCostRuns: number;
  };
  configuration: { openai: boolean; redis: boolean; n8n: boolean; mercadolivre: boolean };
}
export interface OrderRow {
  id: string;
  externalId: string;
  source: string;
  status: string;
  amountCents: number;
  costCents: number;
  costsConfirmed: boolean;
  productName: string;
  supplierName: string;
  category: string;
  quantity: number;
  tracking: string | null;
  orderedAt: string;
}
export interface ListingRow {
  payloadJson?: unknown;
  id: string;
  productId: string;
  externalId: string | null;
  title: string;
  description: string;
  priceCents: number;
  stock: number;
  status: string;
  version: number;
  createdAt: string;
}
export interface AlertRow {
  id: string;
  severity: string;
  title: string;
  message: string;
  link: string | null;
  status: string;
  createdAt: string;
}
export interface ObservationRow {
  id: string;
  productId: string | null;
  title: string;
  priceCents: number;
  sourceUrl: string;
  source: string;
  observedAt: string;
}
export interface MessageRow {
  id: string;
  question: string;
  answer: string;
  evidenceJson: unknown;
  provider: string;
  createdAt: string;
}
export interface AnalyticsReport {
  revenueCents: number;
  estimatedProfitCents: number;
  realizedProfitCents: number;
  unknownCostOrders: number;
  orderCount: number;
  marginPercent: number;
  categories: { name: string; revenueCents: number; profitCents: number; orders: number }[];
  suppliers: { name: string; revenueCents: number; profitCents: number; orders: number }[];
  source: 'real' | 'simulated';
  days: number;
  asOf: string;
  products: number;
  supplierCount: number;
  workflowExecutions: number;
  workflowFailures: number;
  orders: OrderRow[];
  ai: {
    runs: number;
    inputTokens: number;
    outputTokens: number;
    knownCostMicrosUsd: number;
    unknownCostRuns: number;
  };
}
