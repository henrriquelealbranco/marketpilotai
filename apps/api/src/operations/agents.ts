import type { Database } from '@marketpilot/database';
import { agentKeys, scoreOpportunity, type Identity } from '@marketpilot/contracts';
import { HttpError } from '../auth.js';
import { contextSnapshot, event, audit, json } from './store.js';
import { getProduct } from '../catalog/service.js';
import { OpenAIAdapter, type JsonObject } from '../integrations/index.js';

export function requiredConfiguration(message: string): never {
  throw Object.assign(new HttpError(409, message), { code: 'configuration_required' });
}
export async function runAgent(
  db: Database,
  identity: Identity,
  agent: string,
  provider: 'rules' | 'openai',
  productId?: string,
  question?: string,
) {
  if (!agentKeys.includes(agent as (typeof agentKeys)[number]))
    throw new HttpError(404, 'Agente não encontrado.');
  if (productId) await getProduct(db, identity.workspace.id, productId);
  if (provider === 'openai' && (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL))
    requiredConfiguration(
      'Configure OPENAI_API_KEY e OPENAI_MODEL no servidor para executar este modo.',
    );
  const context = await contextSnapshot(db, identity.workspace.id, productId);
  const reservation =
    provider === 'openai'
      ? Buffer.byteLength(JSON.stringify(context)) + Buffer.byteLength(question ?? '') + 3000
      : 0;
  if (provider === 'openai') {
    await db.agentRun.updateMany({
      where: {
        workspaceId: identity.workspace.id,
        provider: 'openai',
        status: 'RUNNING',
        startedAt: { lt: new Date(Date.now() - 600000) },
      },
      data: { status: 'FAILED', errorCode: 'interrupted_execution', completedAt: new Date() },
    });
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const daily = await db.agentRun.findMany({
      where: { workspaceId: identity.workspace.id, provider: 'openai', createdAt: { gte: start } },
      select: { inputTokens: true, outputTokens: true, inputJson: true },
    });
    const consumed = daily.reduce(
      (sum, row) =>
        sum +
        (row.inputTokens + row.outputTokens ||
          Number((row.inputJson as Record<string, unknown>).budgetReservation ?? 0)),
      0,
    );
    const limit = Number(process.env.AI_DAILY_TOKEN_LIMIT ?? 50000);
    if (!Number.isSafeInteger(limit) || limit < 3000 || consumed + reservation > limit)
      throw new HttpError(
        429,
        'Limite diário de tokens insuficiente para esta análise. Reduza o recorte ou revise o limite no servidor.',
      );
    if (
      await db.agentRun.count({
        where: { workspaceId: identity.workspace.id, provider: 'openai', status: 'RUNNING' },
      })
    )
      throw new HttpError(409, 'Aguarde a análise de IA em execução.');
  }
  const startedAt = new Date();
  const run = await db.agentRun.create({
    data: {
      workspaceId: identity.workspace.id,
      actorId: identity.user.id,
      agent,
      provider,
      productId,
      status: 'RUNNING',
      startedAt,
      inputJson: json({ ...context, budgetReservation: reservation }),
    },
  });
  await event(
    db,
    identity.workspace.id,
    agent,
    'agent',
    `${agent} iniciou análise ${provider === 'rules' ? 'determinística' : 'com OpenAI'}.`,
    { runId: run.id, link: '/app/operations' },
  );
  try {
    const opportunities = context.products
      .map((product) => {
        const quote = product.latestQuote?.result as Record<string, unknown> | undefined;
        const quoteInput = product.latestQuote?.input as Record<string, unknown> | undefined;
        const quoteCurrent =
          quoteInput?.supplierCostCents === product.costCents &&
          quoteInput?.shippingCostCents === product.shippingCostCents;
        const margin =
          quoteCurrent && typeof quote?.marginBps === 'number' ? quote.marginBps : null;
        const minimumMarginBps =
          typeof quoteInput?.minimumMarginBps === 'number' ? quoteInput.minimumMarginBps : 0;
        const observation = context.observations.find(
          (o) =>
            o.productId === product.id &&
            typeof (o.attributes as Record<string, unknown>)?.competitionBps === 'number',
        );
        const competitionBps = observation
          ? Number((observation.attributes as Record<string, unknown>).competitionBps)
          : undefined;
        return {
          productId: product.id,
          name: product.name,
          ...scoreOpportunity({
            marginBps: margin,
            minimumMarginBps,
            stock: product.stock,
            shippingDays: product.shippingDays,
            catalogQualityBps: product.hasSource ? 10000 : 7000,
            supplierRating: product.supplier.rating || null,
            competitionBps,
          }),
          evidence: {
            costCents: product.costCents,
            stock: product.stock,
            shippingDays: product.shippingDays,
            updatedAt: product.updatedAt,
            supplierStatus: product.supplier.status,
            marginBps: margin,
            minimumMarginBps: quoteInput ? minimumMarginBps : null,
            costChangeCents: product.costChangeCents,
            competitionAssessment: observation ?? null,
            quoteCurrent,
          },
        };
      })
      .map((row) => ({
        ...row,
        eligible: row.eligible && row.evidence.supplierStatus === 'ACTIVE',
      }))
      .sort((a, b) => b.score - a.score);
    let recommendation: string;
    const warnings = opportunities.filter((o) => !o.eligible);
    switch (agent) {
      case 'product-hunter':
        recommendation = `${opportunities.length} produtos avaliados; ${opportunities.filter((o) => o.eligible).length} elegíveis nos sinais disponíveis. Demanda e concorrência não foram inferidas.`;
        break;
      case 'market-analyst':
        recommendation = context.observations.length
          ? `${context.observations.length} observações autorizadas no recorte. Preços observados de ${(Math.min(...context.observations.map((o) => o.priceCents)) / 100).toFixed(2)} a ${(Math.max(...context.observations.map((o) => o.priceCents)) / 100).toFixed(2)} BRL; confirme equivalência de atributos antes de posicionar o anúncio. Demanda não inferida.`
          : 'Registre comparáveis autorizados na Inteligência de mercado. Sem observações e demanda, não é possível estimar posicionamento ou volume de vendas.';
        break;
      case 'pricing-strategist':
        recommendation = `${context.products.filter((p) => !p.latestQuote).length} produtos sem cotação; ${warnings.length} exigem revisão de margem, disponibilidade ou dados.`;
        break;
      case 'supplier-monitor':
        recommendation = `${context.products.filter((p) => p.stock === 0).length} produtos sem estoque informado; ${context.products.filter((p) => p.supplier.status === 'ARCHIVED').length} vinculados a fornecedor arquivado. Os dados refletem o último catálogo.`;
        break;
      case 'listing-optimizer':
        recommendation = `Prepare rascunhos somente com os atributos conhecidos de ${context.products.length} produtos. Categoria, imagens autorizadas e revisão humana são obrigatórias antes da publicação.`;
        break;
      case 'operations-analyst':
        recommendation = `${context.metrics.orders} pedidos no período. Revise custos não confirmados, prazos e fornecedores antes de encaminhar operações sensíveis.`;
        break;
      default:
        recommendation = `Receita conhecida: ${(context.metrics.revenueCents / 100).toFixed(2)} BRL; lucro realizado: ${(context.metrics.realizedProfitCents / 100).toFixed(2)} BRL. Priorize qualidade do catálogo e decisões com evidência.`;
    }
    let output: unknown = {
      recommendation,
      evidence: context.metrics,
      opportunities,
      newProducts: context.products
        .filter((p) => Date.parse(p.createdAt) > Date.now() - 7 * 86400000)
        .map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt })),
      costChanges: context.products
        .filter((p) => p.costChangeCents !== 0)
        .map((p) => ({
          productId: p.id,
          name: p.name,
          changeCents: p.costChangeCents,
          updatedAt: p.updatedAt,
        })),
      kitCandidates: context.products
        .flatMap((p, index) =>
          context.products
            .slice(index + 1)
            .filter(
              (q) =>
                q.supplier.name === p.supplier.name &&
                q.category === p.category &&
                p.stock > 0 &&
                q.stock > 0,
            )
            .map((q) => ({
              productIds: [p.id, q.id],
              names: [p.name, q.name],
              baseCostCents: p.costCents + q.costCents + p.shippingCostCents + q.shippingCostCents,
              maxUnits: Math.min(p.stock, q.stock),
              shippingDays: Math.max(p.shippingDays, q.shippingDays),
              review:
                'Candidato por categoria e fornecedor; confirmar complementaridade e criar cotação própria. Sem economia de frete presumida.',
            })),
        )
        .slice(0, 10),
      potentialEquivalents: context.products
        .flatMap((p, index) =>
          context.products
            .slice(index + 1)
            .filter(
              (q) =>
                q.supplier.name !== p.supplier.name && q.sku.toLowerCase() === p.sku.toLowerCase(),
            )
            .map((q) => ({
              productIds: [p.id, q.id],
              evidence:
                'SKU coincidente entre fornecedores; confirmar marca, modelo e atributos antes de considerar equivalência.',
            })),
        )
        .slice(0, 10),
      unknownSignals: context.unknownSignals,
      method: 'Regras determinísticas; não é uma resposta de modelo de IA',
    };
    let model: string | undefined,
      responseId: string | undefined,
      inputTokens = 0,
      outputTokens = 0,
      cost: number | null = 0;
    if (provider === 'openai') {
      const inputPrice = process.env.OPENAI_INPUT_PRICE_PER_MILLION,
        outputPrice = process.env.OPENAI_OUTPUT_PRICE_PER_MILLION;
      const tokenPrices =
        inputPrice && outputPrice
          ? { inputPerMillion: Number(inputPrice), outputPerMillion: Number(outputPrice) }
          : undefined;
      const adapter = new OpenAIAdapter({
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL,
        maxOutputTokens: 1500,
        tokenPrices,
      });
      const snapshot = JSON.parse(JSON.stringify(context)) as JsonObject;
      const analysis = question
        ? await adapter.answer(snapshot, question)
        : await adapter.analyze({ agent, context: snapshot });
      output = analysis;
      recommendation = 'recommendation' in analysis ? analysis.recommendation : analysis.answer;
      model = analysis.model;
      responseId = analysis.responseId;
      inputTokens = analysis.usage?.inputTokens ?? 0;
      outputTokens = analysis.usage?.outputTokens ?? 0;
      cost =
        analysis.estimatedCostUsd === null ? null : Math.round(analysis.estimatedCostUsd * 1000000);
    }
    const decisions =
      agent === 'product-hunter' && provider === 'rules'
        ? opportunities.slice(0, 10).map((o) => ({
            workspaceId: identity.workspace.id,
            runId: run.id,
            productId: o.productId,
            recommendation: `${o.name}: pontuação ${o.score}/100. ${o.reasons.map((reason) => ({ NO_STOCK: 'Sem estoque informado.', MARGIN_UNKNOWN: 'Margem desconhecida ou cotação desatualizada.', BELOW_MINIMUM_MARGIN: 'Margem abaixo do mínimo.' })[reason]).join(' ')}${o.evidence.supplierStatus !== 'ACTIVE' ? ' Fornecedor arquivado.' : ''}`,
            score: o.score,
            evidenceJson: json({
              evidence: o.evidence,
              components: o.components,
              unknownSignals: o.unknownSignals,
            }),
          }))
        : [
            {
              workspaceId: identity.workspace.id,
              runId: run.id,
              productId: productId ?? null,
              recommendation,
              score: null,
              evidenceJson: json({ context, output }),
            },
          ];
    const completed = await db.$transaction(async (tx) => {
      if (decisions.length) await tx.agentDecision.createMany({ data: decisions });
      const result = await tx.agentRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          outputJson: json(output),
          model,
          responseId,
          inputTokens,
          outputTokens,
          estimatedCostMicrosUsd: cost,
          completedAt: new Date(),
          durationMs: Date.now() - startedAt.getTime(),
        },
      });
      await audit(tx, identity, 'agent.completed');
      await event(tx, identity.workspace.id, agent, 'agent', `${agent} concluiu a análise.`, {
        runId: run.id,
        decisions: decisions.length,
        link: '/app/operations',
      });
      return result;
    });
    return completed;
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : 'analysis_failed';
    await db.agentRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        errorCode: code,
        completedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
      },
    });
    await event(
      db,
      identity.workspace.id,
      agent,
      'error',
      `${agent} falhou; consulte o código registrado.`,
      { runId: run.id, code },
    );
    throw error;
  }
}
