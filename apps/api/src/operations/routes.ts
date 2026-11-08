import { randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import PDFDocument from 'pdfkit';

import { z } from 'zod';

import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { Database } from '@marketpilot/database';

import {
  calculatePricing,
  pricingInputSchema,
  runAgentSchema,
  orderInputSchema,
  listingInputSchema,
  workflowDefinitions,
  type Identity,
} from '@marketpilot/contracts';

import { requireIdentity, HttpError } from '../auth.js';

import { getProduct } from '../catalog/service.js';

import { N8nAdapter, OpenAIAdapter } from '../integrations/index.js';
import { checkCJDropshipping, saveCJDropshippingCredentials } from './cjdropshipping.js';

import { parseWorkflowJob, serviceSignature } from '../../../worker/src/contract.js';

import { runAgent, requiredConfiguration } from './agents.js';

import { analytics, contextSnapshot, event, audit, json, alert } from './store.js';

import { canonicalHash, sanitizeCsvCell } from './domain.js';
import { normalizeContactEmail, outreachKey } from '../suppliers/outreach.js';

import { createDispatcher, executeWorkflow, workflowKey } from './workflows.js';

import { requestListingApproval, executeApproval } from './approvals.js';

import {
  authorizeMercadoLivre,
  finishMercadoLivre,
  mercadoLivreToken,
  saveMercadoLivreCredentials,
  syncMarketplaceOrders,
} from './marketplace.js';

const money = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

const id = (r: FastifyRequest) => z.object({ id: z.uuid() }).parse(r.params).id;

const reviewSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED']),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict();

const queryDays = (r: FastifyRequest) =>
  z
    .object({
      days: z.coerce
        .number()
        .refine((n) => [7, 30, 90].includes(n))
        .default(30),
    })
    .parse(r.query).days;

const constantEqual = (a: string, b: string) => {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export async function registerOperationRoutes(app: FastifyInstance, db: Database) {
  const dispatcher = createDispatcher();
  app.addHook('onClose', () => dispatcher.close());

  const streams = new Set<() => void>();
  const userStreams = new Map<string, number>();
  app.addHook('preClose', async () => {
    for (const close of streams) close();
  });

  const schema = (summary: string, input?: z.ZodType) => ({
    tags: ['Operations'],
    security: [{ session: [] }],
    summary,
    ...(input
      ? {
          body: {
            ...z.toJSONSchema(input, { target: 'draft-7', io: 'input', unrepresentable: 'any' }),
            additionalProperties: true,
          },
        }
      : {}),
  });

  async function writer(r: FastifyRequest, admin = false) {
    const identity = await requireIdentity(db, r);
    if (identity.user.role === 'VIEWER' || (admin && identity.user.role !== 'ADMIN'))
      throw new HttpError(
        403,
        admin ? 'Ação reservada ao administrador.' : 'Seu perfil permite somente leitura.',
      );
    return identity;
  }

  function service(r: FastifyRequest) {
    const key = process.env.N8N_SERVICE_TOKEN;
    if (
      !key ||
      key.length < 32 ||
      !constantEqual(String(r.headers.authorization ?? ''), `Bearer ${key}`)
    )
      throw new HttpError(401, 'Credencial de serviço inválida.');
  }

  async function dispatch(identity: Identity, key: string, idempotencyKey: string, source: string) {
    const found = await db.workflowExecution.findUnique({
      where: { workspaceId_idempotencyKey: { workspaceId: identity.workspace.id, idempotencyKey } },
    });

    if (found) {
      if (found.workflowKey !== key)
        throw new HttpError(409, 'Chave de idempotência já usada por outro workflow.');
      if (
        found.status === 'FAILED' &&
        found.errorCode === 'queue_unavailable' &&
        process.env.REDIS_URL
      ) {
        await db.workflowExecution.updateMany({
          where: { id: found.id, status: 'FAILED', errorCode: 'queue_unavailable' },
          data: { status: 'QUEUED', errorCode: null },
        });
        try {
          await dispatcher.enqueue({
            workspaceId: identity.workspace.id,
            workflowKey: workflowKey(key),
            executionId: found.id,
          });
        } catch {
          await db.workflowExecution.updateMany({
            where: { id: found.id, status: 'QUEUED' },
            data: { status: 'FAILED', errorCode: 'queue_unavailable' },
          });
          throw new HttpError(
            503,
            'Fila indisponível. Consulte o estado da execução antes de repetir.',
          );
        }
        return {
          created: false,
          item: await db.workflowExecution.findUniqueOrThrow({ where: { id: found.id } }),
        };
      }
      return { created: false, item: found };
    }

    const item = await db.workflowExecution.create({
      data: {
        workspaceId: identity.workspace.id,
        workflowKey: workflowKey(key),
        idempotencyKey,
        source,
        status: 'QUEUED',
      },
    });

    await audit(db, identity, 'workflow.requested');

    if (process.env.REDIS_URL) {
      try {
        await dispatcher.enqueue({
          workspaceId: identity.workspace.id,
          workflowKey: workflowKey(key),
          executionId: item.id,
        });
      } catch {
        await db.workflowExecution.updateMany({
          where: { id: item.id, status: 'QUEUED' },
          data: { status: 'FAILED', errorCode: 'queue_unavailable' },
        });
        throw new HttpError(
          503,
          'A fila não confirmou o despacho. Consulte o estado da execução antes de repetir.',
        );
      }
      return { created: true, item };
    }

    return { created: true, item: await executeWorkflow(db, item.id, identity.workspace.id) };
  }

  app.post(
    '/v1/pricing/quotes',
    {
      schema: schema(
        'Calcular e persistir cotação determinística',
        z.object({ productId: z.uuid(), input: pricingInputSchema }),
      ),
    },
    async (r, reply) => {
      const identity = await writer(r);
      const input = z
        .object({ productId: z.uuid(), input: pricingInputSchema })
        .strict()
        .parse(r.body);
      const product = await getProduct(db, identity.workspace.id, input.productId);

      if (
        product.costCents !== input.input.supplierCostCents ||
        product.shippingCostCents !== input.input.shippingCostCents
      )
        throw new HttpError(
          409,
          'Os custos diferem do catálogo. Atualize o produto ou recarregue a cotação.',
        );

      const result = calculatePricing(input.input);
      const saved = await db.pricingQuote.create({
        data: {
          workspaceId: identity.workspace.id,
          productId: input.productId,
          actorId: identity.user.id,
          inputJson: json(input.input),
          resultJson: json(result),
        },
      });
      await audit(db, identity, 'pricing.saved');
      await event(
        db,
        identity.workspace.id,
        'precificação',
        'pricing',
        'Cotação financeira salva.',
        { quoteId: saved.id, productId: input.productId, blocked: result.blocked },
      );
      return reply
        .status(201)
        .send({ id: saved.id, input: input.input, result, createdAt: saved.createdAt });
    },
  );

  app.get(
    '/v1/pricing/quotes',
    { schema: schema('Histórico de cotações do workspace') },
    async (r) => {
      const { workspace } = await requireIdentity(db, r);
      return {
        items: await db.pricingQuote.findMany({
          where: { workspaceId: workspace.id },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      };
    },
  );

  app.post(
    '/v1/agents/:agent/run',
    { schema: schema('Executar agente com ferramentas de leitura restritas', runAgentSchema) },
    async (r, reply) => {
      const identity = await writer(r),
        { agent } = z.object({ agent: z.string() }).parse(r.params),
        input = runAgentSchema.parse(r.body);
      return reply
        .status(201)
        .send(await runAgent(db, identity, agent, input.provider, input.productId));
    },
  );

  app.post(
    '/v1/suppliers/discover',
    {
      schema: schema(
        'Descobrir fornecedores em fontes públicas com Web Search da OpenAI; não aprova nem publica',
        z
          .object({
            query: z
              .string()
              .trim()
              .min(5)
              .max(240)
              .default('fornecedores de dropshipping com catálogo para revenda no Brasil'),
          })
          .strict(),
      ),
    },
    async (r, reply) => {
      const identity = await writer(r, true);
      if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL)
        requiredConfiguration('Configure a chave e o modelo OpenAI no servidor antes da descoberta.');
      const input = z
        .object({
          query: z
            .string()
            .trim()
            .min(5)
            .max(240)
            .default('fornecedores de dropshipping com catálogo para revenda no Brasil'),
        })
        .strict()
        .parse(r.body);
      const start = new Date();
      start.setUTCHours(0, 0, 0, 0);
      const today = await db.agentRun.findMany({
        where: {
          workspaceId: identity.workspace.id,
          agent: 'supplier-discovery',
          provider: 'openai',
          createdAt: { gte: start },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      const cached = today.find(
        (entry) =>
          entry.status === 'COMPLETED' &&
          (entry.inputJson as Record<string, unknown>)?.query === input.query &&
          entry.outputJson,
      );
      if (cached)
        return reply.status(200).send({
          runId: cached.id,
          ...(cached.outputJson as Record<string, unknown>),
          reused: true,
        });
      const dailyLimit = Number(process.env.SUPPLIER_DISCOVERY_DAILY_LIMIT ?? 3);
      if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 20)
        requiredConfiguration('O limite diário de descoberta de fornecedores é inválido.');
      if (today.length >= dailyLimit)
        throw new HttpError(429, 'Limite diário de descobertas atingido para este workspace.');
      const active = await db.agentRun.count({
        where: { workspaceId: identity.workspace.id, agent: 'supplier-discovery', status: 'RUNNING' },
      });
      if (active) throw new HttpError(409, 'Uma descoberta de fornecedores já está em execução.');
      const run = await db.agentRun.create({
        data: {
          workspaceId: identity.workspace.id,
          actorId: identity.user.id,
          agent: 'supplier-discovery',
          provider: 'openai',
          status: 'RUNNING',
          startedAt: new Date(),
          inputJson: json({ query: input.query, source: 'OPENAI_WEB_SEARCH' }),
        },
      });
      try {
        const analysis = await new OpenAIAdapter({
          apiKey: process.env.OPENAI_API_KEY,
          model: process.env.OPENAI_MODEL,
          maxOutputTokens: 2800,
        }).discoverSuppliers(input.query);
        const completedAt = new Date();
        await db.$transaction(async (tx) => {
          await tx.agentRun.update({
            where: { id: run.id },
            data: {
              status: 'COMPLETED',
              outputJson: json(analysis),
              model: analysis.model,
              responseId: analysis.responseId,
              inputTokens: analysis.usage?.inputTokens ?? 0,
              outputTokens: analysis.usage?.outputTokens ?? 0,
              estimatedCostMicrosUsd:
                analysis.estimatedCostUsd === null
                  ? null
                  : Math.round(analysis.estimatedCostUsd * 1_000_000),
              completedAt,
              durationMs: completedAt.getTime() - run.createdAt.getTime(),
            },
          });
          await tx.agentDecision.createMany({
            data: analysis.candidates.map((candidate) => ({
              workspaceId: identity.workspace.id,
              runId: run.id,
              recommendation: `Candidato encontrado: ${candidate.name}`,
              evidenceJson: json(candidate),
              score: null,
            })),
          });
          await audit(tx, identity, 'supplier.discovery.completed');
          await event(
            tx,
            identity.workspace.id,
            'Supplier Discovery AI',
            'supplier',
            `${analysis.candidates.length} fontes candidatas encontradas; nenhuma foi aprovada automaticamente.`,
            { runId: run.id, query: input.query },
          );
        });
        return reply.status(201).send({ runId: run.id, ...analysis });
      } catch (error) {
        const code =
          error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
            ? error.code.slice(0, 80)
            : 'discovery_failed';
        await db.agentRun.update({
          where: { id: run.id },
          data: { status: 'FAILED', errorCode: code, completedAt: new Date() },
        });
        throw error;
      }
    },
  );

  app.get(
    '/v1/supplier-outreach',
    { schema: schema('Histórico de contatos comerciais por e-mail; sem conteúdo de credenciais') },
    async (r) => {
      const { workspace } = await requireIdentity(db, r);
      return {
        items: await db.supplierOutreach.findMany({
          where: { workspaceId: workspace.id },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      };
    },
  );

  app.post(
    '/v1/supplier-outreach/drafts',
    { schema: schema('Preparar e-mail comercial e solicitar aprovação antes de qualquer envio') },
    async (r, reply) => {
      const identity = await writer(r, true);
      const input = z
        .object({
          supplierId: z.uuid().optional(),
          contactEmail: z.string().trim().max(254),
          contactUrl: z.url().max(1000).optional(),
          subject: z.string().trim().min(4).max(160),
          body: z.string().trim().min(20).max(5000),
        })
        .strict()
        .parse(r.body);
      const contactEmail = normalizeContactEmail(input.contactEmail);
      const idempotencyKey = outreachKey({
        supplierId: input.supplierId ?? 'unlinked-public-contact',
        email: contactEmail,
        subject: input.subject,
        body: input.body,
      });
      const result = await db.$transaction(async (tx) => {
        const existing = await tx.supplierOutreach.findUnique({
          where: { workspaceId_idempotencyKey: { workspaceId: identity.workspace.id, idempotencyKey } },
        });
        if (existing) throw new HttpError(409, 'Este e-mail já foi preparado para este contato.');
        const payload = {
          channel: 'EMAIL',
          provider: 'GMAIL_OR_SMTP_VIA_N8N',
          contactEmail,
          contactUrl: input.contactUrl ?? null,
          subject: input.subject,
          body: input.body,
          idempotencyKey,
          execution: 'REQUIRES_GMAIL_CONNECTION_AND_APPROVAL',
        };
        const approval = await tx.approval.create({
          data: {
            workspaceId: identity.workspace.id,
            kind: 'SUPPLIER_EMAIL_SEND',
            title: `E-mail comercial: ${input.subject}`.slice(0, 160),
            payloadJson: json(payload),
            payloadHash: canonicalHash(payload),
            requestedById: identity.user.id,
            expiresAt: new Date(Date.now() + 7 * 86400000),
          },
        });
        const outreach = await tx.supplierOutreach.create({
          data: {
            workspaceId: identity.workspace.id,
            supplierId: input.supplierId,
            contactEmail,
            contactUrl: input.contactUrl,
            subject: input.subject,
            body: input.body,
            idempotencyKey,
            approvalId: approval.id,
          },
        });
        await audit(tx, identity, 'supplier.outreach.prepared');
        await event(tx, identity.workspace.id, 'supplier-outreach', 'supplier', 'E-mail comercial aguarda aprovação.', {
          outreachId: outreach.id,
          approvalId: approval.id,
        });
        return { outreach, approval };
      });
      return reply.status(201).send(result);
    },
  );

  app.get(
    '/v1/operations',
    { schema: schema('Estado persistido da central de operações') },
    async (r) => {
      const { workspace } = await requireIdentity(db, r);
      const where = { workspaceId: workspace.id };

      const [
        runs,
        decisions,
        approvals,
        events,
        executions,
        configs,
        allRuns,
        pendingApprovals,
        errors,
      ] = await Promise.all([
        db.agentRun.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 }),
        db.agentDecision.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 }),
        db.approval.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 }),
        db.operationEvent.findMany({ where, orderBy: { id: 'desc' }, take: 100 }),
        db.workflowExecution.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 }),
        db.automationConfig.findMany({ where }),
        db.agentRun.aggregate({
          where,
          _count: true,
          _sum: { inputTokens: true, outputTokens: true, estimatedCostMicrosUsd: true },
        }),
        db.approval.count({
          where: { ...where, status: 'PENDING', expiresAt: { gt: new Date() } },
        }),
        db.agentRun.count({ where: { ...where, status: 'FAILED' } }),
      ]);

      const members = await db.user.findMany({
        where: { workspaceId: workspace.id },
        select: { id: true, name: true },
      });
      return {
        runs,
        decisions,
        approvals: approvals.map((approval) => ({
          ...approval,
          approvedByName:
            members.find((member) => member.id === approval.approvedById)?.name ?? null,
        })),
        events,
        executions,
        workflows: workflowDefinitions.map((w) => ({
          ...w,
          enabled: configs.some((c) => c.workflowKey === w.key && c.enabled),
          lastExecution: executions.find((e) => e.workflowKey === w.key) ?? null,
        })),
        counts: {
          runs: allRuns._count,
          pendingApprovals,
          errors,
          inputTokens: allRuns._sum.inputTokens ?? 0,
          outputTokens: allRuns._sum.outputTokens ?? 0,
          knownCostMicrosUsd: allRuns._sum.estimatedCostMicrosUsd ?? 0,
          unknownCostRuns: await db.agentRun.count({
            where: { ...where, provider: 'openai', estimatedCostMicrosUsd: null },
          }),
        },
        configuration: {
          openai: !!(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL),
          redis: !!process.env.REDIS_URL,
          n8n: !!(process.env.N8N_BASE_URL && process.env.N8N_API_KEY),
          mercadolivre: !!process.env.MERCADOLIVRE_CLIENT_ID,
        },
      };
    },
  );

  app.get(
    '/v1/events/stream',
    { schema: schema('SSE: eventos reais com retomada por cursor') },
    async (r, reply) => {
      const identity = await requireIdentity(db, r);
      const streamCount = userStreams.get(identity.user.id) ?? 0;
      if (streamCount >= 5)
        throw new HttpError(429, 'Limite de conexões do feed atingido. Feche uma aba da central.');
      const query = z.object({ after: z.coerce.number().int().min(0).optional() }).parse(r.query);
      let cursor = query.after ?? Number(r.headers['last-event-id'] ?? 0);
      if (!Number.isSafeInteger(cursor) || cursor < 0) cursor = 0;

      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      reply.raw.write(': connected\n\n');
      userStreams.set(identity.user.id, streamCount + 1);

      let busy = false,
        closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        streams.delete(close);
        const remaining = Math.max(0, (userStreams.get(identity.user.id) ?? 1) - 1);
        if (remaining) userStreams.set(identity.user.id, remaining);
        else userStreams.delete(identity.user.id);
        reply.raw.end();
      };

      const poll = async () => {
        if (busy || closed) return;
        busy = true;
        try {
          await requireIdentity(db, r, true);
          const rows = await db.operationEvent.findMany({
            where: { workspaceId: identity.workspace.id, id: { gt: cursor } },
            orderBy: { id: 'asc' },
            take: 100,
          });
          for (const row of rows) {
            cursor = row.id;
            reply.raw.write(`id: ${row.id}\nevent: operation\ndata: ${JSON.stringify(row)}\n\n`);
          }
          reply.raw.write(': heartbeat\n\n');
        } catch {
          close();
        } finally {
          busy = false;
        }
      };

      const timer = setInterval(() => void poll(), 3000);
      timer.unref();
      streams.add(close);
      reply.raw.on('close', close);
      void poll();
    },
  );

  app.post(
    '/v1/decisions/:id/review',
    { schema: schema('Registrar revisão humana da recomendação') },
    async (r) => {
      const identity = await writer(r),
        input = reviewSchema.parse(r.body);
      const changed = await db.agentDecision.updateMany({
        where: { id: id(r), workspaceId: identity.workspace.id },
        data: { reviewStatus: input.status, reviewerId: identity.user.id, reviewedAt: new Date() },
      });
      if (!changed.count) throw new HttpError(404, 'Decisão não encontrada.');
      await audit(db, identity, 'decision.reviewed');
      return { reviewStatus: input.status };
    },
  );

  app.get('/v1/listings', { schema: schema('Rascunhos e anúncios vinculados') }, async (r) => {
    const { workspace } = await requireIdentity(db, r);
    return {
      items: await db.listing.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
    };
  });

  const listingData = (input: z.infer<typeof listingInputSchema>) => ({
    title: input.title,
    description: input.description,
    priceCents: input.priceCents,
    stock: input.stock,
    payloadJson: json({
      ...(input.publicationModel === 'USER_PRODUCT'
        ? { family_name: input.title }
        : { title: input.title }),
      category_id: input.categoryId,
      price: input.priceCents / 100,
      currency_id: 'BRL',
      available_quantity: input.stock,
      buying_mode: 'buy_it_now',
      condition: 'new',
      listing_type_id: input.listingTypeId,
      pictures: input.pictures.map((source) => ({ source })),
      attributes: input.attributes,
    }),
  });

  app.post(
    '/v1/listings',
    { schema: schema('Salvar rascunho sem publicação externa', listingInputSchema) },
    async (r, reply) => {
      const identity = await writer(r),
        input = listingInputSchema.parse(r.body);
      await getProduct(db, identity.workspace.id, input.productId);
      const item = await db.listing.create({
        data: {
          workspaceId: identity.workspace.id,
          productId: input.productId,
          ...listingData(input),
        },
      });
      await audit(db, identity, 'listing.draft.created');
      return reply.status(201).send(item);
    },
  );

  app.put(
    '/v1/listings/:id',
    { schema: schema('Editar rascunho e invalidar aprovações anteriores') },
    async (r) => {
      const identity = await writer(r),
        input = listingInputSchema.extend({ version: z.number().int().min(1) }).parse(r.body);
      await getProduct(db, identity.workspace.id, input.productId);
      return db.$transaction(async (tx) => {
        const changed = await tx.listing.updateMany({
          where: {
            id: id(r),
            workspaceId: identity.workspace.id,
            version: input.version,
            status: {
              notIn: ['EXECUTING', 'RECONCILIATION_REQUIRED', 'PUBLISHED_DESCRIPTION_PENDING'],
            },
          },
          data: { ...listingData(input), productId: input.productId, version: { increment: 1 } },
        });
        if (!changed.count)
          throw new HttpError(409, 'Rascunho não encontrado ou alterado por outra pessoa.');
        await tx.approval.updateMany({
          where: {
            workspaceId: identity.workspace.id,
            subjectId: id(r),
            status: { in: ['PENDING', 'APPROVED'] },
          },
          data: { status: 'SUPERSEDED' },
        });
        await audit(tx, identity, 'listing.draft.updated');
        return tx.listing.findUnique({ where: { id: id(r) } });
      });
    },
  );

  app.post(
    '/v1/listings/:id/reconcile',
    { schema: schema('Conferir vínculo externo após resposta incerta, sem republicar (ADMIN)') },
    async (r) => {
      const identity = await writer(r, true),
        input = z
          .object({
            externalId: z.string().regex(/^MLB\d+$/),
            reviewed: z.literal(true),
            reference: z.string().trim().min(5).max(1000),
          })
          .strict()
          .parse(r.body);
      const listing = await db.listing.findFirst({
        where: { id: id(r), workspaceId: identity.workspace.id },
      });
      if (!listing) throw new HttpError(404, 'Anúncio não encontrado.');
      if (
        !['RECONCILIATION_REQUIRED', 'PUBLISHED_DESCRIPTION_PENDING', 'EXECUTING'].includes(
          listing.status,
        )
      )
        throw new HttpError(409, 'Este anúncio não exige reconciliação.');
      if (listing.status === 'EXECUTING' && listing.updatedAt.getTime() > Date.now() - 600000)
        throw new HttpError(409, 'Aguarde a execução em andamento antes de reconciliar.');
      const { adapter, accessToken, userId } = await mercadoLivreToken(db, identity.workspace.id);
      const result = await adapter.getItems(accessToken, [input.externalId]);
      const wrapper = result[0];
      const body =
        wrapper && typeof wrapper === 'object' && !Array.isArray(wrapper) ? wrapper.body : null;
      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        body.id !== input.externalId ||
        Number(body.seller_id) !== userId
      )
        throw new HttpError(403, 'O item não foi confirmado na conta autorizada.');
      const actualPrice = z.number().positive().max(999999.99).parse(body.price),
        actualStock = z.number().int().min(0).max(1000000).parse(body.available_quantity);
      if (body.currency_id !== 'BRL')
        throw new HttpError(409, 'A moeda do item não corresponde à operação em reais.');
      return db.$transaction(async (tx) => {
        await tx.listing.update({
          where: { id: listing.id },
          data: {
            externalId: input.externalId,
            status: 'PUBLISHED',
            priceCents: Math.round(actualPrice * 100),
            stock: actualStock,
            payloadJson: json({
              ...(listing.payloadJson as Record<string, unknown>),
              price: actualPrice,
              available_quantity: actualStock,
            }),
            version: { increment: 1 },
          },
        });
        await tx.approval.updateMany({
          where: {
            workspaceId: identity.workspace.id,
            subjectId: listing.id,
            status: { in: ['EXECUTING', 'RECONCILIATION_REQUIRED'] },
          },
          data: {
            status: 'RECONCILED',
            resultJson: json({
              source: 'OFFICIAL_READ_AND_MANUAL_REVIEW',
              externalId: input.externalId,
              observedPrice: body.price ?? null,
              observedStock: body.available_quantity ?? null,
              reference: input.reference,
              actorId: identity.user.id,
            }),
          },
        });
        await audit(tx, identity, 'listing.reconciled');
        await event(
          tx,
          identity.workspace.id,
          'Mercado Livre',
          'listing',
          'Vínculo externo conferido sem republicar.',
          { listingId: listing.id, externalId: input.externalId },
        );
        return {
          confirmed: true,
          externalId: input.externalId,
          observedPrice: body.price ?? null,
          observedStock: body.available_quantity ?? null,
        };
      });
    },
  );
  app.post(
    '/v1/listings/:id/request-approval',
    { schema: schema('Solicitar aprovação vinculada ao conteúdo e versão') },
    async (r, reply) => {
      const identity = await writer(r),
        input = z
          .object({
            kind: z
              .enum(['LISTING_PUBLISH', 'PRICE_UPDATE', 'STOCK_UPDATE'])
              .default('LISTING_PUBLISH'),
          })
          .strict()
          .parse(r.body);
      return reply.status(201).send(await requestListingApproval(db, identity, id(r), input.kind));
    },
  );

  app.post(
    '/v1/approvals',
    { schema: schema('Solicitar revisão de encaminhamento manual ou ação financeira') },
    async (r, reply) => {
      const identity = await writer(r);
      const input = z
        .object({
          kind: z.enum(['SUPPLIER_REQUEST', 'FINANCIAL_ACTION', 'OTHER']),
          title: z.string().trim().min(5).max(160),
          amountCents: z.number().int().min(0).max(99999999),
          details: z.string().trim().min(5).max(3000),
          risks: z.string().trim().min(5).max(1500),
        })
        .strict()
        .parse(r.body);
      const payload = { ...input, execution: 'MANUAL_ONLY' };
      const approval = await db.approval.create({
        data: {
          workspaceId: identity.workspace.id,
          kind: input.kind,
          title: input.title,
          payloadJson: json(payload),
          payloadHash: canonicalHash(payload),
          requestedById: identity.user.id,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      await audit(db, identity, 'approval.manual.requested');
      await event(
        db,
        identity.workspace.id,
        'aprovação',
        'approval',
        'Encaminhamento manual aguardando revisão.',
        { approvalId: approval.id },
      );
      return reply.status(201).send(approval);
    },
  );
  app.post(
    '/v1/approvals/:id/manual-result',
    {
      schema: schema('Registrar resultado de ação realizada manualmente pelo responsável (ADMIN)'),
    },
    async (r) => {
      const identity = await writer(r, true),
        input = z
          .object({ reference: z.string().trim().min(5).max(1000) })
          .strict()
          .parse(r.body);
      const approval = await db.approval.findFirst({
        where: { id: id(r), workspaceId: identity.workspace.id },
      });
      if (!approval) throw new HttpError(404, 'Aprovação não encontrada.');
      if (!['SUPPLIER_REQUEST', 'FINANCIAL_ACTION', 'OTHER'].includes(approval.kind))
        throw new HttpError(409, 'Ações do marketplace exigem confirmação pela integração.');
      if (
        approval.expiresAt < new Date() ||
        approval.payloadHash !== canonicalHash(approval.payloadJson)
      )
        throw new HttpError(409, 'Aprovação inválida ou expirada.');
      const changed = await db.approval.updateMany({
        where: { id: approval.id, status: 'APPROVED' },
        data: {
          status: 'EXECUTED',
          resultJson: json({
            source: 'MANUAL_DECLARATION',
            reference: input.reference,
            actorId: identity.user.id,
            recordedAt: new Date().toISOString(),
          }),
        },
      });
      if (!changed.count)
        throw new HttpError(409, 'A ação precisa estar aprovada e ainda não concluída.');
      await audit(db, identity, 'approval.manual.result');
      await event(
        db,
        identity.workspace.id,
        'aprovação',
        'approval',
        'Responsável registrou resultado manual; nenhum pagamento foi feito pelo sistema.',
        { approvalId: approval.id },
      );
      return { status: 'EXECUTED', source: 'MANUAL_DECLARATION' };
    },
  );
  app.post(
    '/v1/approvals/:id/review',
    { schema: schema('Aprovar ou rejeitar ação sensível (ADMIN)') },
    async (r) => {
      const identity = await writer(r, true),
        input = reviewSchema.parse(r.body);
      const existing = await db.approval.findFirst({
        where: { id: id(r), workspaceId: identity.workspace.id },
      });
      if (!existing) throw new HttpError(404, 'Aprovação não encontrada.');
      const changed = await db.approval.updateMany({
        where: { id: existing.id, status: 'PENDING', expiresAt: { gt: new Date() } },
        data: {
          status: input.status,
          reason: input.reason,
          approvedById: identity.user.id,
          approvedAt: new Date(),
        },
      });
      if (!changed.count) throw new HttpError(409, 'Esta solicitação já foi revisada ou expirou.');
      await audit(db, identity, `approval.${input.status.toLowerCase()}`);
      await event(
        db,
        identity.workspace.id,
        'aprovação',
        'approval',
        `Solicitação ${input.status === 'APPROVED' ? 'aprovada' : 'rejeitada'}.`,
        { approvalId: existing.id },
      );
      return { status: input.status };
    },
  );

  app.post(
    '/v1/approvals/:id/execute',
    { schema: schema('Executar uma única vez a ação aprovada (ADMIN)') },
    async (r) => executeApproval(db, await writer(r, true), id(r)),
  );

  app.get(
    '/v1/orders',
    { schema: schema('Pedidos do workspace; custos e origem explícitos') },
    async (r) => {
      const { workspace } = await requireIdentity(db, r);
      return {
        items: await db.marketplaceOrder.findMany({
          where: { workspaceId: workspace.id },
          orderBy: { orderedAt: 'desc' },
          take: 100,
        }),
      };
    },
  );

  app.post(
    '/v1/orders',
    { schema: schema('Registrar pedido manual idempotente pelo identificador', orderInputSchema) },
    async (r, reply) => {
      const identity = await writer(r),
        input = orderInputSchema.parse(r.body),
        product = await getProduct(db, identity.workspace.id, input.productId);
      const item = await db.marketplaceOrder.create({
        data: {
          workspaceId: identity.workspace.id,
          ...input,
          deadline: input.deadline ? new Date(input.deadline) : undefined,
          productName: product.name,
          category: product.category,
          supplierName: product.supplier.name,
          linesJson: json([{ productId: product.id, quantity: input.quantity }]),
        },
      });
      await audit(db, identity, 'order.created');
      await event(db, identity.workspace.id, 'pedido', 'order', 'Pedido manual registrado.', {
        orderId: item.id,
        link: '/app/orders',
      });
      return reply.status(201).send(item);
    },
  );

  app.patch(
    '/v1/orders/:id',
    { schema: schema('Conferir custos, prazo, status e rastreamento') },
    async (r) => {
      const identity = await writer(r);
      const input = orderInputSchema
        .omit({ externalId: true, productId: true, amountCents: true, quantity: true })
        .partial()
        .strict()
        .parse(r.body);
      const item = await db.marketplaceOrder.findFirst({
        where: { id: id(r), workspaceId: identity.workspace.id },
      });
      if (!item) throw new HttpError(404, 'Pedido não encontrado.');
      const result = await db.marketplaceOrder.update({
        where: { id: item.id },
        data: {
          ...input,
          deadline: input.deadline ? new Date(input.deadline) : undefined,
          ...(input.costsConfirmed
            ? {
                source: item.source.startsWith('MERCADOLIVRE')
                  ? 'MERCADOLIVRE_REVIEWED'
                  : item.source,
              }
            : {}),
        },
      });
      await audit(db, identity, 'order.reviewed');
      await event(
        db,
        identity.workspace.id,
        'pedido',
        'order',
        'Pedido atualizado por conferência manual.',
        { orderId: item.id, changes: input, actor: identity.user.name },
      );
      return result;
    },
  );

  app.post(
    '/v1/orders/sync',
    { schema: schema('Consultar pedidos pagos da conta Mercado Livre autorizada') },
    async (r) => syncMarketplaceOrders(db, await writer(r)),
  );

  app.get(
    '/v1/market/observations',
    { schema: schema('Histórico de observações de fontes autorizadas') },
    async (r) => {
      const { workspace } = await requireIdentity(db, r);
      return {
        items: await db.marketObservation.findMany({
          where: { workspaceId: workspace.id },
          orderBy: { observedAt: 'desc' },
          take: 200,
        }),
      };
    },
  );

  app.post(
    '/v1/market/observations',
    { schema: schema('Registrar observação manual com fonte e data') },
    async (r, reply) => {
      const identity = await writer(r);
      const input = z
        .object({
          productId: z.uuid().optional(),
          title: z.string().trim().min(3).max(160),
          priceCents: z.number().int().positive().max(99999999),
          sourceUrl: z.httpUrl().max(1000),
          authorized: z.literal(true),
          competitionBps: z.number().int().min(0).max(10000).optional(),
          attributes: z.record(z.string().max(80), z.string().max(200)).default({}),
        })
        .strict()
        .parse(r.body);
      if (input.productId) await getProduct(db, identity.workspace.id, input.productId);
      const item = await db.marketObservation.create({
        data: {
          workspaceId: identity.workspace.id,
          productId: input.productId,
          title: input.title,
          priceCents: input.priceCents,
          sourceUrl: input.sourceUrl,
          attributesJson: json({
            ...input.attributes,
            ...(input.competitionBps === undefined ? {} : { competitionBps: input.competitionBps }),
          }),
        },
      });
      await audit(db, identity, 'market.observation.created');
      return reply.status(201).send(item);
    },
  );

  app.get(
    '/v1/analytics',
    { schema: schema('Relatórios financeiros com origem e custos conhecidos') },
    async (r) => analytics(db, (await requireIdentity(db, r)).workspace.id, queryDays(r)),
  );

  app.get(
    '/v1/analytics/export.csv',
    { schema: schema('Exportar pedidos e custos em CSV protegido contra fórmulas') },
    async (r, reply) => {
      const stats = await analytics(db, (await requireIdentity(db, r)).workspace.id, queryDays(r));
      const rows = [
        ['MarketPilot AI', 'Dados reais registrados', stats.asOf],
        ['Pedido', 'Origem', 'Produto', 'Status', 'Receita BRL', 'Custo BRL', 'Custos confirmados'],
        ...stats.orders.map((o) => [
          o.externalId,
          o.source,
          o.productName,
          o.status,
          (o.amountCents / 100).toFixed(2),
          o.source.endsWith('COST_INCOMPLETE') ? 'desconhecido' : (o.costCents / 100).toFixed(2),
          o.costsConfirmed ? 'sim' : 'não',
        ]),
      ];
      return reply
        .header('Content-Disposition', 'attachment; filename="marketpilot-relatorio.csv"')
        .type('text/csv; charset=utf-8')
        .send('\uFEFF' + rows.map((row) => row.map(sanitizeCsvCell).join(';')).join('\r\n'));
    },
  );

  app.get(
    '/v1/analytics/export.pdf',
    { schema: schema('Exportar resumo financeiro em PDF') },
    async (r, reply) => {
      const identity = await requireIdentity(db, r),
        stats = await analytics(db, identity.workspace.id, queryDays(r));
      const doc = new PDFDocument({
        size: 'A4',
        margin: 48,
        info: { Title: 'MarketPilot AI — Relatório operacional' },
      });
      const font = [
        new URL('./fonts/Inter-Regular.ttf', import.meta.url),
        new URL('../../assets/fonts/Inter-Regular.ttf', import.meta.url),
      ].find((path) => existsSync(path));
      if (!font) throw new Error('Fonte Inter do relatório indisponível. Execute o build da API.');
      doc.font(fileURLToPath(font));
      const chunks: Buffer[] = [];
      const done = new Promise<Buffer>((resolve, reject) => {
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
      });

      doc.fillColor('#7C3AED').fontSize(24).text('MarketPilot AI');
      doc.fillColor('#181825').fontSize(18).text('Relatório operacional').moveDown();
      doc
        .fontSize(10)
        .text(`${identity.workspace.name} | últimos ${stats.days} dias`)
        .text(
          `Gerado em ${new Date(stats.asOf).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
        )
        .text('Origem: dados reais registrados no workspace; não auditados.')
        .moveDown();

      for (const [label, value] of [
        ['Faturamento', money(stats.revenueCents)],
        ['Lucro estimado (custos conhecidos)', money(stats.estimatedProfitCents)],
        ['Lucro realizado (entregues e custos confirmados)', money(stats.realizedProfitCents)],
        ['Pedidos ativos', String(stats.orderCount)],
        ['Tokens de entrada / saída', `${stats.ai.inputTokens} / ${stats.ai.outputTokens}`],
        ['Execuções com custo de IA desconhecido', String(stats.ai.unknownCostRuns)],
      ]) {
        doc.fontSize(11).text(`${label}: ${value}`).moveDown(0.4);
      }

      doc.moveDown().fontSize(14).text('Resultado por categoria').moveDown(0.4);
      for (const row of stats.categories)
        doc
          .fontSize(10)
          .text(
            `${row.name}: ${money(row.revenueCents)} | ${row.orders} pedido${row.orders === 1 ? '' : 's'}`,
          );

      doc
        .moveDown()
        .fontSize(10)
        .fillColor('#555566')
        .text(
          'Lucro estimado depende dos custos informados. Custos ausentes de pedidos importados são excluídos do lucro. Cancelados são excluídos dos totais. Custo de IA é expresso em USD quando a tarifa do modelo é conhecida.',
        );
      doc.end();
      return reply
        .header('Content-Disposition', 'attachment; filename="marketpilot-relatorio.pdf"')
        .type('application/pdf')
        .send(await done);
    },
  );

  app.get(
    '/v1/assistant/messages',
    { schema: schema('Histórico pessoal do assistente no workspace') },
    async (r) => {
      const identity = await requireIdentity(db, r);
      return {
        items: await db.conversation.findMany({
          where: { workspaceId: identity.workspace.id, actorId: identity.user.id },
          orderBy: { createdAt: 'asc' },
          take: 100,
        }),
      };
    },
  );

  app.post(
    '/v1/assistant/messages',
    { schema: schema('Responder usando contexto permitido e evidências') },
    async (r, reply) => {
      const identity = await writer(r),
        input = z
          .object({
            question: z.string().trim().min(3).max(2000),
            provider: z.enum(['rules', 'openai']).default('rules'),
          })
          .strict()
          .parse(r.body);
      const context = await contextSnapshot(db, identity.workspace.id);
      let answer: string,
        evidence: unknown = context.metrics;

      if (input.provider === 'openai') {
        if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL)
          requiredConfiguration('Configure OpenAI no servidor para usar respostas de IA.');

        // Reuse the restricted agent executor for budget, run history and accounting; conversation is a read-only recommendation.

        const run = await runAgent(
          db,
          identity,
          'business-advisor',
          'openai',
          undefined,
          input.question,
        );
        const response = run.outputJson as { answer: string; evidence: unknown };
        answer = response.answer;
        evidence = response.evidence;
      } else {
        const q = input.question.toLocaleLowerCase('pt-BR');

        if (/fatur|receit|resultado|lucro/.test(q))
          answer = `Nos últimos 30 dias: faturamento ${money(context.metrics.revenueCents)}, lucro estimado ${money(context.metrics.estimatedProfitCents)} e realizado ${money(context.metrics.realizedProfitCents)}, com ${context.metrics.orders} pedidos. Lucro realizado exige entrega e custos confirmados.`;
        else if (/falha|automa/.test(q)) {
          const failed = await db.workflowExecution.count({
            where: { workspaceId: identity.workspace.id, status: 'FAILED' },
          });
          answer = `Há ${failed} execuções de workflow com falha registrada. Consulte Automações para os códigos e horários.`;
        } else if (/forneced|estoque|problema/.test(q))
          answer = `${context.products.filter((p) => p.stock === 0).length} produtos do recorte estão sem estoque informado. ${context.products.filter((p) => p.supplier.status === 'ARCHIVED').length} usam fornecedores arquivados. Confira data e origem do catálogo.`;
        else
          answer = `${context.products.length} produtos no recorte; ${context.products.filter((p) => !p.latestQuote).length} ainda sem cotação. Use Product Hunter para avaliar margem, estoque e qualidade. Demanda e concorrência permanecem desconhecidas sem uma fonte autorizada.`;

        answer += ' Resposta por regras determinísticas sobre os dados disponíveis.';
      }

      const item = await db.conversation.create({
        data: {
          workspaceId: identity.workspace.id,
          actorId: identity.user.id,
          question: input.question,
          answer,
          evidenceJson: json(evidence),
          provider: input.provider,
        },
      });
      return reply.status(201).send(item);
    },
  );

  app.get('/v1/alerts', { schema: schema('Alertas operacionais registrados') }, async (r) => {
    const { workspace } = await requireIdentity(db, r);
    return {
      items: await db.alert.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    };
  });

  app.patch('/v1/alerts/:id', { schema: schema('Reconhecer ou resolver alerta') }, async (r) => {
    const identity = await writer(r),
      input = z
        .object({ status: z.enum(['ACKNOWLEDGED', 'RESOLVED']) })
        .strict()
        .parse(r.body);
    const changed = await db.alert.updateMany({
      where: { id: id(r), workspaceId: identity.workspace.id },
      data: input,
    });
    if (!changed.count) throw new HttpError(404, 'Alerta não encontrado.');
    await audit(db, identity, 'alert.reviewed');
    return input;
  });

  app.post(
    '/v1/automations/:key/run',
    { schema: schema('Executar workflow autorizado com idempotência') },
    async (r, reply) => {
      const identity = await writer(r),
        { key } = z.object({ key: z.string() }).parse(r.params),
        input = z
          .object({
            idempotencyKey: z
              .string()
              .min(8)
              .max(160)
              .default(() => randomUUID()),
          })
          .strict()
          .parse(r.body);
      const result = await dispatch(
        identity,
        key,
        input.idempotencyKey,
        process.env.REDIS_URL ? 'queue' : 'internal',
      );
      return reply.status(result.created ? 201 : 200).send(result.item);
    },
  );

  app.patch(
    '/v1/automations/:key',
    { schema: schema('Habilitar despacho agendado para este workspace (ADMIN)') },
    async (r) => {
      const identity = await writer(r, true),
        key = workflowKey(z.object({ key: z.string() }).parse(r.params).key),
        input = z.object({ enabled: z.boolean() }).strict().parse(r.body);
      const result = await db.automationConfig.upsert({
        where: {
          workspaceId_workflowKey: { workspaceId: identity.workspace.id, workflowKey: key },
        },
        create: { workspaceId: identity.workspace.id, workflowKey: key, ...input },
        update: input,
      });
      await audit(db, identity, 'automation.configured');
      return result;
    },
  );

  app.get(
    '/v1/integrations/status',
    { schema: schema('Configuração e conexão de serviços; sem revelar segredos') },
    async (r) => {
      const { workspace } = await requireIdentity(db, r);
      const connection = await db.integrationConnection.findUnique({
        where: { workspaceId_provider: { workspaceId: workspace.id, provider: 'mercadolivre' } },
      });
      const configuration = await db.integrationConnection.findUnique({
        where: {
          workspaceId_provider: { workspaceId: workspace.id, provider: 'mercadolivre_config' },
        },
      });
      const cjConfiguration = await db.integrationConnection.findUnique({
        where: {
          workspaceId_provider: { workspaceId: workspace.id, provider: 'cjdropshipping_config' },
        },
      });
      const cjConnection = await db.integrationConnection.findUnique({
        where: { workspaceId_provider: { workspaceId: workspace.id, provider: 'cjdropshipping' } },
      });
      return {
        mercadolivre: {
          configured: !!(
            process.env.MERCADOLIVRE_CLIENT_ID &&
            process.env.ENCRYPTION_KEY &&
            (process.env.MERCADOLIVRE_CLIENT_SECRET || configuration?.encryptedAccessToken)
          ),
          connected: connection?.status === 'CONNECTED',
          account: connection?.metadataJson ?? null,
        },
        openai: {
          configured: !!(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL),
          model: process.env.OPENAI_MODEL ?? null,
        },
        n8n: {
          configured: !!(process.env.N8N_BASE_URL && process.env.N8N_API_KEY),
          executionUrl: process.env.N8N_PUBLIC_URL ?? null,
        },
        redis: { configured: !!process.env.REDIS_URL },
        cjdropshipping: {
          configured: !!(process.env.ENCRYPTION_KEY && cjConfiguration?.encryptedAccessToken),
          connected: cjConnection?.status === 'CONNECTED',
          expiresAt: cjConnection?.expiresAt?.toISOString() ?? null,
        },
        suppliers: { method: 'CSV/XML autorizado', automaticConnector: false },
      };
    },
  );

  app.post(
    '/v1/integrations/cjdropshipping/credentials',
    { schema: schema('Armazenar chave da API CJdropshipping cifrada (ADMIN)') },
    async (r) => {
      const identity = await writer(r, true);
      const input = z
        .object({
          apiKey: z
            .string()
            .trim()
            .min(20)
            .max(600)
            .refine((value) => !value.includes('*'), 'Cole a chave completa da CJ, não o valor mascarado.'),
        })
        .strict()
        .parse(r.body);
      return saveCJDropshippingCredentials(db, identity, input.apiKey);
    },
  );

  app.post(
    '/v1/integrations/cjdropshipping/check',
    { schema: schema('Trocar chave CJ por tokens e validar conexão (ADMIN)') },
    async (r) => checkCJDropshipping(db, await writer(r, true)),
  );

  app.post(
    '/v1/integrations/mercadolivre/credentials',
    { schema: schema('Armazenar chave OAuth do Mercado Livre cifrada (ADMIN)') },
    async (r) => {
      const identity = await writer(r, true);
      const input = z
        .object({ clientSecret: z.string().trim().min(20).max(300) })
        .strict()
        .parse(r.body);
      return saveMercadoLivreCredentials(db, identity, input.clientSecret);
    },
  );

  app.post(
    '/v1/integrations/mercadolivre/connect',
    { schema: schema('Iniciar OAuth oficial com PKCE (ADMIN)') },
    async (r) => authorizeMercadoLivre(db, await writer(r, true)),
  );

  app.get(
    '/v1/integrations/mercadolivre/callback',
    { schema: schema('Consumir state OAuth uma única vez') },
    async (r, reply) => {
      const identity = await requireIdentity(db, r);
      if (identity.user.role !== 'ADMIN') throw new HttpError(403, 'Administrador necessário.');
      const query = z
        .object({ state: z.string().min(20).max(200), code: z.string().min(1).max(500) })
        .parse(r.query);
      await finishMercadoLivre(db, identity, query.state, query.code);
      return reply.redirect(
        `${process.env.APP_ORIGIN ?? 'http://localhost:3000'}/app/integrations?connected=mercadolivre`,
      );
    },
  );

  app.post(
    '/v1/integrations/mercadolivre/disconnect',
    { schema: schema('Remover tokens locais (ADMIN)') },
    async (r) => {
      const identity = await writer(r, true);
      await db.integrationConnection.deleteMany({
        where: { workspaceId: identity.workspace.id, provider: 'mercadolivre' },
      });
      await audit(db, identity, 'integration.disconnected');
      return { connected: false };
    },
  );

  app.get(
    '/v1/integrations/mercadolivre/items',
    { schema: schema('Consultar anúncios da própria conta autorizada') },
    async (r) => {
      const identity = await requireIdentity(db, r),
        { adapter, accessToken, userId } = await mercadoLivreToken(db, identity.workspace.id);
      return adapter.listItems(accessToken, userId, { limit: 50 });
    },
  );

  app.post(
    '/v1/integrations/n8n/check',
    { schema: schema('Consultar disponibilidade da API oficial n8n (ADMIN)') },
    async (r) => {
      await writer(r, true);
      const result = await new N8nAdapter({
        baseUrl: process.env.N8N_BASE_URL,
        apiKey: process.env.N8N_API_KEY,
      }).listWorkflows({ limit: 10 });
      return { reachable: true, workflows: result };
    },
  );

  app.post(
    '/v1/webhooks/mercadolivre',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: ['Integrations'],
        summary: 'Notificação com token dedicado, conta vinculada e reconsulta oficial',
      },
    },
    async (r, reply) => {
      const expected = process.env.MERCADOLIVRE_NOTIFICATION_TOKEN;
      const query = z.object({ token: z.string().max(200) }).parse(r.query);

      if (!expected || expected.length < 32 || !constantEqual(query.token, expected))
        throw new HttpError(401, 'Notificação não autorizada.');

      const input = z
        .object({
          _id: z.string().max(200),
          resource: z.string().regex(/^\/(orders|shipments|items)\/[A-Za-z0-9]+$/),
          user_id: z.number().int().positive(),
          application_id: z.number().int().positive(),
          topic: z.enum(['orders_v2', 'shipments', 'items']),
          sent: z.string().max(80).optional(),
        })
        .passthrough()
        .parse(r.body);

      if (String(input.application_id) !== process.env.MERCADOLIVRE_CLIENT_ID)
        throw new HttpError(403, 'Aplicação não autorizada.');

      if (!input.resource.startsWith(input.topic === 'orders_v2' ? '/orders/' : `/${input.topic}/`))
        throw new HttpError(400, 'Recurso incompatível com o tópico.');

      const connections = await db.integrationConnection.findMany({
        where: {
          provider: 'mercadolivre',
          status: 'CONNECTED',
          metadataJson: { path: ['userId'], equals: input.user_id },
        },
        take: 10,
      });

      if (!connections.length) throw new HttpError(403, 'Conta não vinculada.');

      if (!process.env.REDIS_URL)
        requiredConfiguration('Notificações requerem Redis e worker configurados.');

      for (const connection of connections) {
        const idempotencyKey = `ml-${canonicalHash(input._id)}`;
        let execution = await db.workflowExecution.findUnique({
          where: {
            workspaceId_idempotencyKey: { workspaceId: connection.workspaceId, idempotencyKey },
          },
        });

        if (execution?.status === 'COMPLETED') continue;

        execution ??= await db.workflowExecution.create({
          data: {
            workspaceId: connection.workspaceId,
            workflowKey: 'order-processing',
            idempotencyKey,
            source: 'mercadolivre',
            resultJson: json({ topic: input.topic, resource: input.resource }),
          },
        });

        await dispatcher.enqueue({
          workspaceId: connection.workspaceId,
          workflowKey: 'order-processing',
          executionId: execution.id,
        });
      }

      return reply.status(200).send({ received: true });
    },
  );

  app.post(
    '/internal/jobs/run',
    {
      config: { rawBody: true },
      schema: {
        tags: ['Internal'],
        summary: 'Worker autenticado por HMAC; corpo exato e janela de cinco minutos',
      },
    },
    async (r) => {
      const timestamp = String(r.headers['x-marketpilot-timestamp'] ?? ''),
        signature = String(r.headers['x-marketpilot-signature'] ?? ''),
        key = process.env.INTERNAL_SERVICE_KEY;

      if (
        !key ||
        key.length < 32 ||
        !/^\d{10}$/.test(timestamp) ||
        Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
        typeof r.rawBody !== 'string' ||
        !constantEqual(signature, serviceSignature(timestamp, r.rawBody, key))
      )
        throw new HttpError(401, 'Assinatura de serviço inválida.');

      const job = parseWorkflowJob(r.body);
      return executeWorkflow(db, job.executionId, job.workspaceId);
    },
  );

  app.post(
    '/internal/workflows/dispatch',
    { schema: { tags: ['Internal'], summary: 'Despacho n8n somente para workspaces habilitados' } },
    async (r) => {
      service(r);
      const input = z
        .object({
          workflowKey: z.string(),
          source: z.literal('n8n'),
          executionId: z.string().max(100),
          idempotencyKey: z.string().min(8).max(160),
          scheduledAt: z.iso.datetime(),
        })
        .strict()
        .parse(r.body);
      const key = workflowKey(input.workflowKey);
      const configs = await db.automationConfig.findMany({
        where: { workflowKey: key, enabled: true },
        take: 100,
      });
      const items = [];
      for (const config of configs) {
        const user = await db.user.findFirst({
          where: { workspaceId: config.workspaceId, role: 'ADMIN' },
          include: { workspace: true },
        });
        if (user)
          items.push(
            (
              await dispatch(
                {
                  workspace: user.workspace,
                  user: { id: user.id, name: user.name, email: user.email, role: user.role },
                },
                key,
                input.idempotencyKey,
                'n8n',
              )
            ).item,
          );
      }
      return { accepted: items.length, items: items.map((i) => ({ id: i.id, status: i.status })) };
    },
  );

  app.post(
    '/internal/workflows/failure',
    {
      schema: { tags: ['Internal'], summary: 'Persistir notificação de falha autenticada do n8n' },
    },
    async (r) => {
      service(r);
      const input = z
        .object({
          workflowKey: z.string(),
          executionId: z.union([z.string(), z.number()]).optional(),
          message: z.string().max(500).optional(),
          source: z.string().max(50).optional(),
        })
        .passthrough()
        .parse(r.body);
      const configs = await db.automationConfig.findMany({
        where: { workflowKey: workflowKey(input.workflowKey), enabled: true },
        take: 100,
      });
      for (const config of configs) {
        const idempotencyKey = `n8n-error-${canonicalHash({ key: input.workflowKey, executionId: input.executionId ?? 'unknown' })}`;
        await db.workflowExecution.upsert({
          where: {
            workspaceId_idempotencyKey: { workspaceId: config.workspaceId, idempotencyKey },
          },
          create: {
            workspaceId: config.workspaceId,
            idempotencyKey,
            workflowKey: input.workflowKey,
            source: 'n8n',
            status: 'FAILED',
            errorCode: 'workflow_dispatch_failed',
            externalExecutionId: String(input.executionId ?? 'unknown'),
            completedAt: new Date(),
          },
          update: {},
        });
        await alert(
          db,
          config.workspaceId,
          `n8n-failure-${input.workflowKey}`,
          'critical',
          'Workflow n8n informou falha',
          `${input.workflowKey}: confira a execução no n8n e as credenciais do serviço.`,
          '/app/automations',
        );
        await event(
          db,
          config.workspaceId,
          'n8n',
          'error',
          'Workflow n8n informou falha. Consulte a execução no serviço.',
          { workflowKey: input.workflowKey, executionId: input.executionId ?? null },
        );
      }
      return { recorded: configs.length };
    },
  );
}
