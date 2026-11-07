import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { Database } from '@marketpilot/database';
import { workflowDefinitions, type Identity } from '@marketpilot/contracts';
import {
  QUEUE_NAME,
  QUEUE_PREFIX,
  DEFAULT_JOB_OPTIONS,
  workflowJobId,
  type WorkflowJob,
} from '../../../worker/src/contract.js';
import { HttpError } from '../auth.js';
import { runAgent, requiredConfiguration } from './agents.js';
import { analytics, alert, event, json } from './store.js';
import { mercadoLivreToken, syncMarketplaceOrders } from './marketplace.js';

export function workflowKey(value: string) {
  const definition = workflowDefinitions.find((w) => w.key === value);
  if (!definition) throw new HttpError(404, 'Workflow não encontrado.');
  return definition.key;
}
export function createDispatcher() {
  let connection: Redis | undefined, queue: Queue | undefined;
  return {
    async enqueue(job: WorkflowJob) {
      if (!process.env.REDIS_URL)
        requiredConfiguration('Configure Redis e o worker para executar na fila.');
      connection ??= new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
        lazyConnect: true,
      });
      if (!connection.listenerCount('error')) connection.on('error', () => {});
      queue ??= new Queue(QUEUE_NAME, {
        connection,
        prefix: QUEUE_PREFIX,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      });
      if (!queue.listenerCount('error')) queue.on('error', () => {});
      const id = workflowJobId(job),
        existing = await queue.getJob(id);
      if (existing) {
        if ((await existing.getState()) === 'failed') await existing.retry('failed');
        return;
      }
      await queue.add(job.workflowKey, job, { jobId: id });
    },
    async close() {
      await queue?.close();
      connection?.disconnect();
    },
  };
}
export async function executeWorkflow(db: Database, executionId: string, workspaceId: string) {
  const saved = await db.workflowExecution.findFirst({ where: { id: executionId, workspaceId } });
  if (!saved) throw new HttpError(404, 'Execução não encontrada.');
  if (saved.status === 'COMPLETED' || saved.status === 'CONFIGURATION_REQUIRED') return saved;
  const claimed = await db.workflowExecution.updateMany({
    where: { id: executionId, workspaceId, status: { in: ['QUEUED', 'FAILED'] } },
    data: { status: 'RUNNING', startedAt: new Date(), errorCode: null },
  });
  if (!claimed.count) {
    if (saved.status === 'RUNNING')
      throw new HttpError(425, 'Esta execução ainda está em andamento.');
    return saved;
  }
  const user = await db.user.findFirst({
    where: { workspaceId, role: 'ADMIN' },
    include: { workspace: true },
  });
  if (!user) throw new HttpError(409, 'A operação precisa de um administrador.');
  const identity: Identity = {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    workspace: user.workspace,
  };
  const started = Date.now();
  await event(db, workspaceId, 'workflow', 'workflow', `${saved.workflowKey}: execução iniciada.`, {
    executionId,
  });
  try {
    let result: unknown;
    if (saved.source === 'mercadolivre') {
      const notification = saved.resultJson as { topic: string; resource: string };
      const externalId = notification.resource.split('/')[2]!;
      if (notification.topic === 'orders_v2')
        result = await syncMarketplaceOrders(db, identity, Number(externalId));
      else {
        const { adapter, accessToken } = await mercadoLivreToken(db, workspaceId);
        if (notification.topic === 'shipments') {
          const shipment = await adapter.getShipment(accessToken, externalId);
          const orders = await db.marketplaceOrder.findMany({
            where: { workspaceId, linesJson: { array_contains: [{ shippingId: externalId }] } },
          });
          for (const order of orders)
            await db.marketplaceOrder.update({
              where: { id: order.id },
              data: {
                ...(shipment.status === 'delivered'
                  ? { status: 'delivered' }
                  : shipment.status === 'shipped'
                    ? { status: 'shipping' }
                    : {}),
                ...(typeof shipment.tracking_number === 'string'
                  ? { tracking: shipment.tracking_number.slice(0, 120) }
                  : {}),
              },
            });
          result = {
            shipmentId: externalId,
            status: shipment.status ?? null,
            updated: orders.length,
          };
        } else {
          const items = await adapter.getItems(accessToken, [externalId]);
          result = { itemId: externalId, queried: items.length };
        }
      }
    } else
      switch (saved.workflowKey) {
        case 'discovery':
        case 'opportunity-summary':
          result = { runId: (await runAgent(db, identity, 'product-hunter', 'rules')).id };
          break;
        case 'listing-preparation':
          result = {
            runId: (await runAgent(db, identity, 'listing-optimizer', 'rules')).id,
            externalActions: 0,
          };
          break;
        case 'supplier-monitor':
          result = { runId: (await runAgent(db, identity, 'supplier-monitor', 'rules')).id };
          break;
        case 'availability-sync':
          requiredConfiguration(
            'Sincronização exige conector autorizado do fornecedor. Importe um catálogo atualizado ou configure esse conector antes de executar.',
          );
          break;
        case 'pricing-monitor':
        case 'margin-alerts': {
          const products = await db.product.findMany({
            where: { workspaceId, status: 'ACTIVE' },
            include: { quotes: { orderBy: { createdAt: 'desc' }, take: 1 } },
            take: 1000,
          });
          let warnings = 0;
          for (const p of products) {
            const q = p.quotes[0];
            const input = q?.inputJson as Record<string, unknown> | undefined;
            const output = q?.resultJson as Record<string, unknown> | undefined;
            if (
              !q ||
              output?.blocked ||
              input?.supplierCostCents !== p.costCents ||
              input?.shippingCostCents !== p.shippingCostCents
            ) {
              warnings++;
              await alert(
                db,
                workspaceId,
                `margin-${p.id}`,
                'warning',
                'Cotação precisa de revisão',
                `${p.name}: sem cotação válida ou custo alterado.`,
                '/app/pricing',
              );
            } else
              await db.alert.updateMany({
                where: { workspaceId, key: `margin-${p.id}` },
                data: { status: 'RESOLVED' },
              });
          }
          result = { analyzed: products.length, warnings, externalActions: 0 };
          break;
        }
        case 'order-processing': {
          const orders = await db.marketplaceOrder.findMany({
            where: { workspaceId, status: 'processing' },
            take: 1000,
          });
          for (const order of orders)
            await alert(
              db,
              workspaceId,
              `order-review-${order.id}`,
              'warning',
              'Pedido aguardando conferência',
              `Pedido ${order.externalId}: confirme fornecedor, estoque, custo e prazo. Nenhuma compra foi realizada.`,
              '/app/orders',
            );
          result = { pendingReview: orders.length, externalActions: 0 };
          break;
        }
        case 'daily-report':
          result = await analytics(db, workspaceId, 1);
          break;
        case 'failure-monitor': {
          const failures = await db.workflowExecution.count({
            where: {
              workspaceId,
              status: 'FAILED',
              createdAt: { gte: new Date(Date.now() - 86400000) },
            },
          });
          const agentFailures = await db.agentRun.count({
            where: {
              workspaceId,
              status: 'FAILED',
              createdAt: { gte: new Date(Date.now() - 86400000) },
            },
          });
          if (failures + agentFailures)
            await alert(
              db,
              workspaceId,
              'operational-failures',
              'critical',
              'Falhas operacionais',
              `${failures} workflows e ${agentFailures} agentes falharam nas últimas 24 horas.`,
              '/app/operations',
            );
          result = { workflowFailures: failures, agentFailures };
          break;
        }
        default:
          throw new HttpError(400, 'Workflow inválido.');
      }
    return await db.$transaction(async (tx) => {
      const completed = await tx.workflowExecution.update({
        where: { id: executionId },
        data: {
          status: 'COMPLETED',
          resultJson: json(result),
          durationMs: Date.now() - started,
          completedAt: new Date(),
        },
      });
      await event(
        tx,
        workspaceId,
        'workflow',
        'workflow',
        `${saved.workflowKey}: execução concluída.`,
        { executionId, link: '/app/automations' },
      );
      return completed;
    });
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : 'workflow_failed';
    const status = code === 'configuration_required' ? 'CONFIGURATION_REQUIRED' : 'FAILED';
    const failed = await db.workflowExecution.update({
      where: { id: executionId },
      data: { status, errorCode: code, durationMs: Date.now() - started, completedAt: new Date() },
    });
    await event(
      db,
      workspaceId,
      'workflow',
      status === 'FAILED' ? 'error' : 'configuration',
      `${saved.workflowKey}: ${status === 'FAILED' ? 'falha registrada' : 'configuração necessária'}.`,
      { executionId, code },
    );
    if (status === 'FAILED') throw error;
    return failed;
  }
}
