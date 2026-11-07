import {
  agentKeys,
  demoOrderFacts,
  calculatePricing,
  scoreOpportunity,
  workflowDefinitions,
  type OperationState,
  type OrderRow,
  type ListingRow,
  type AlertRow,
  type ExecutionRow,
} from '@marketpilot/contracts';
import { initialDemoCatalog } from '../catalog/demo-data';
export function simulateWorkflow(previous: OperationState, key: string): OperationState {
  const createdAt = new Date().toISOString(),
    execution: ExecutionRow = {
      id: crypto.randomUUID(),
      workflowKey: key,
      source: 'simulated',
      status: 'COMPLETED',
      durationMs: 0,
      errorCode: null,
      resultJson: { simulation: true, externalActions: 0 },
      createdAt,
    };
  return {
    ...previous,
    executions: [execution, ...previous.executions],
    workflows: previous.workflows.map((w) =>
      w.key === key ? { ...w, lastExecution: execution } : w,
    ),
    events: [
      {
        id: previous.events.length + 1,
        origin: 'Apresentação',
        category: 'simulation',
        message: `${key}: workflow demonstrativo concluído por interação.`,
        detailJson: { simulation: true },
        createdAt,
      },
      ...previous.events,
    ],
  };
}
export function demoOperations(): OperationState {
  return {
    runs: [],
    decisions: [],
    approvals: [],
    events: [],
    executions: [],
    workflows: workflowDefinitions.map((w) => ({ ...w, enabled: false, lastExecution: null })),
    counts: {
      runs: 0,
      pendingApprovals: 0,
      errors: 0,
      inputTokens: 0,
      outputTokens: 0,
      knownCostMicrosUsd: 0,
      unknownCostRuns: 0,
    },
    configuration: { openai: false, redis: false, n8n: false, mercadolivre: false },
  };
}
export function simulateAnalysis(
  previous: OperationState,
  agent: (typeof agentKeys)[number] = agentKeys[0],
): OperationState {
  const now = new Date().toISOString(),
    id = crypto.randomUUID(),
    product = initialDemoCatalog().products[0]!;
  const opportunities = initialDemoCatalog().products.map((p) => {
    const pricing = calculatePricing({
      supplierCostCents: p.costCents,
      shippingCostCents: p.shippingCostCents,
      packagingCostCents: 200,
      fixedFeeCents: 0,
      operatingCostCents: 100,
      commissionBps: 1200,
      taxBps: 600,
      advertisingBps: 500,
      returnsBps: 200,
      targetMarginBps: 2500,
      minimumMarginBps: 1000,
    });
    return {
      productId: p.id,
      name: p.name,
      ...scoreOpportunity({
        marginBps: pricing.marginBps,
        minimumMarginBps: 1000,
        stock: p.stock,
        shippingDays: p.shippingDays,
        catalogQualityBps: 8000,
        supplierRating: 4,
      }),
      evidence: { simulation: true, pricing, costCents: p.costCents, stock: p.stock },
    };
  });
  const run = {
    id,
    agent,
    provider: 'simulated',
    status: 'COMPLETED',
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostMicrosUsd: 0,
    durationMs: 0,
    errorCode: null,
    createdAt: now,
    outputJson: {
      recommendation:
        'Exemplo fictício: revisar custo, disponibilidade e cotação antes de publicar.',
      simulation: true,
      opportunities,
    },
  };
  return {
    ...previous,
    runs: [run, ...previous.runs],
    decisions: [
      {
        id: crypto.randomUUID(),
        runId: id,
        productId: product.id,
        recommendation: `${product.name}: exemplo de recomendação simulada. Demanda e concorrência desconhecidas.`,
        evidenceJson: {
          simulation: true,
          costCents: product.costCents,
          stock: product.stock,
          source: 'Catálogo fictício',
        },
        score: opportunities[0]!.score,
        reviewStatus: 'PENDING',
        createdAt: now,
      },
      ...previous.decisions,
    ],
    approvals: [
      {
        id: crypto.randomUUID(),
        kind: 'LISTING_PUBLISH',
        title: `Publicação fictícia: ${product.name}`,
        status: 'PENDING',
        payloadJson: {
          simulation: true,
          priceCents: 19990,
          risks: ['Dados fictícios; nenhuma publicação externa.'],
        },
        reason: null,
        approvedAt: null,
        createdAt: now,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
      ...previous.approvals,
    ],
    events: [
      {
        id: previous.events.length + 1,
        origin: 'Apresentação',
        category: 'simulation',
        message: `${agent}: análise demonstrativa concluída por interação. Nenhuma chamada externa.`,
        detailJson: { simulation: true },
        createdAt: now,
      },
      ...previous.events,
    ],
    counts: {
      ...previous.counts,
      runs: previous.counts.runs + 1,
      pendingApprovals: previous.counts.pendingApprovals + 1,
    },
  };
}
export function demoOrders(days = 30): OrderRow[] {
  const now = new Date(),
    key = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now),
    start = new Date(`${key}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const startKey = start.toISOString().slice(0, 10);
  return demoOrderFacts(now)
    .filter((o) => o.date.slice(0, 10) >= startKey && new Date(o.date) <= now)
    .map((o) => ({
      id: o.id,
      externalId: o.id,
      source: 'SIMULATED',
      status: o.status,
      amountCents: o.revenueCents,
      costCents: o.costCents,
      costsConfirmed: o.status === 'delivered',
      productName: o.product,
      supplierName: o.supplier,
      category: o.category,
      quantity: o.quantity,
      tracking: null,
      orderedAt: o.date,
    }));
}
export const demoListings = (): ListingRow[] =>
  initialDemoCatalog()
    .products.slice(0, 2)
    .map((p) => ({
      id: p.id,
      productId: p.id,
      externalId: null,
      title: p.name,
      description: 'Rascunho fictício para apresentação.',
      priceCents: Math.round(p.costCents * 1.8),
      stock: p.stock,
      status: 'DRAFT',
      version: 1,
      createdAt: p.createdAt,
    }));
export const demoAlerts = (): AlertRow[] => [
  {
    id: 'demo-alert',
    severity: 'warning',
    title: 'Estoque esgotado no catálogo fictício',
    message: 'Garrafa térmica 1L: exemplo de alerta para revisão de disponibilidade.',
    link: '/demo/products',
    status: 'OPEN',
    createdAt: new Date().toISOString(),
  },
];
