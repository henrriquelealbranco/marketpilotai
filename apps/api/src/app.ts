import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ZodError } from 'zod';
import { database, type Database } from '@marketpilot/database';
import {
  dashboardQuerySchema,
  loginSchema,
  registerSchema,
  workspaceSchema,
  integrations,
} from '@marketpilot/contracts';
import { buildDashboard } from './dashboard.js';
import { demoOrders } from './demo.js';
import { hashPassword, verifyPassword, hashToken } from './crypto.js';
import { HttpError, requireIdentity, issueSession, SESSION_COOKIE } from './auth.js';
import { registerCatalogRoutes } from './catalog/routes.js';

export interface AppOptions {
  db?: Database;
  logger?: boolean;
  allowRegistration?: boolean;
  origin?: string;
  rateLimitMax?: number;
  secure?: boolean;
  ttlHours?: number;
}
export async function buildApp(options: AppOptions = {}) {
  const db = options.db ?? database();
  const origin = options.origin ?? process.env.APP_ORIGIN ?? 'http://localhost:3000';
  const secure = options.secure ?? process.env.NODE_ENV === 'production';
  const allowRegistration = options.allowRegistration ?? process.env.ALLOW_REGISTRATION === 'true';
  const ttlHours = options.ttlHours ?? Number(process.env.SESSION_TTL_HOURS ?? 24);
  if (!Number.isFinite(ttlHours) || ttlHours < 1 || ttlHours > 720)
    throw new Error('SESSION_TTL_HOURS deve estar entre 1 e 720.');
  if (secure && !origin.startsWith('https://'))
    throw new Error('APP_ORIGIN deve usar HTTPS em produção.');
  const app = Fastify({
    bodyLimit: 32768,
    trustProxy: process.env.TRUST_PROXY === 'true',
    logger:
      options.logger === false
        ? false
        : {
            level: 'info',
            redact: [
              'req.headers.cookie',
              'req.headers.authorization',
              'res.headers.set-cookie',
              'password',
              'passwordHash',
              'token',
            ],
          },
  });
  await app.register(cookie);
  await app.register(helmet);
  await app.register(rateLimit, { max: options.rateLimitMax ?? 120, timeWindow: '1 minute' });
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'MarketPilot API',
        description: 'Fase 2. Identidade, catálogo persistente e importação autorizada.',
        version: '0.2.0',
      },
      components: {
        securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE } },
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (
      ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method) &&
      request.headers.origin !== origin
    )
      throw new HttpError(403, 'Origem da solicitação não autorizada.');
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError)
      return reply.status(400).send({
        message: 'Confira os campos informados.',
        issues: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
    if (error instanceof HttpError)
      return reply.status(error.statusCode).send({ message: error.message });
    if (!(error instanceof Error))
      return reply.status(503).send({ message: 'Serviço temporariamente indisponível.' });
    if ('code' in error && error.code === 'P2002')
      return reply.status(409).send({ message: 'Um registro com estes dados já existe.' });
    if ('code' in error && error.code === 'P2034')
      return reply
        .status(409)
        .send({ message: 'Outra alteração foi recebida. Atualize a página e tente novamente.' });
    if ('statusCode' in error && typeof error.statusCode === 'number' && error.statusCode < 500)
      return reply.status(error.statusCode).send({
        message:
          error.statusCode === 429
            ? 'Muitas tentativas. Aguarde um minuto.'
            : 'Solicitação inválida.',
      });
    request.log.error(
      {
        err: { name: error.name, code: 'code' in error ? error.code : undefined },
        requestId: request.id,
      },
      'request_failed',
    );
    return reply.status(503).send({
      message: 'Serviço temporariamente indisponível. Tente novamente.',
      requestId: request.id,
    });
  });
  app.get('/health', { schema: { tags: ['System'], summary: 'Saúde do processo' } }, async () => ({
    status: 'ok',
    phase: 2,
  }));
  app.get(
    '/ready',
    { schema: { tags: ['System'], summary: 'Disponibilidade do banco' } },
    async () => {
      await db.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    },
  );
  app.get(
    '/v1/config',
    { schema: { tags: ['Identity'], summary: 'Configuração pública de acesso' } },
    async () => ({ registrationEnabled: allowRegistration }),
  );
  const authLimit = { rateLimit: { max: options.rateLimitMax ?? 10, timeWindow: '1 minute' } };
  const authBody = {
    type: 'object',
    required: ['email', 'password'],
    additionalProperties: true,
    properties: {
      email: { type: 'string', format: 'email', maxLength: 254 },
      password: { type: 'string', maxLength: 128 },
    },
  };
  app.post(
    '/v1/auth/register',
    {
      config: authLimit,
      schema: {
        tags: ['Identity'],
        summary: 'Criar conta e workspace (quando habilitado)',
        body: {
          ...authBody,
          required: ['email', 'password', 'name', 'workspaceName'],
          properties: {
            ...authBody.properties,
            name: { type: 'string', minLength: 2, maxLength: 80 },
            workspaceName: { type: 'string', minLength: 2, maxLength: 80 },
          },
        },
      },
    },
    async (request, reply) => {
      if (!allowRegistration)
        throw new HttpError(403, 'Cadastro fechado. Solicite acesso ao responsável pela operação.');
      const input = registerSchema.parse(request.body);
      const passwordHash = await hashPassword(input.password);
      const user = await db.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          workspace: { create: { name: input.workspaceName } },
        },
        include: { workspace: true },
      });
      reply.status(201);
      return issueSession(
        db,
        reply,
        {
          user: { id: user.id, name: user.name, email: user.email, role: user.role },
          workspace: user.workspace,
        },
        secure,
        ttlHours,
        'account.created',
      );
    },
  );
  // Constant-work password comparison also runs for unknown accounts.
  const dummyHash = await hashPassword('unused-account-comparison-value');
  app.post(
    '/v1/auth/login',
    {
      config: authLimit,
      schema: { tags: ['Identity'], summary: 'Entrar e emitir cookie HttpOnly', body: authBody },
    },
    async (request, reply) => {
      const input = loginSchema.parse(request.body);
      const user = await db.user.findUnique({
        where: { email: input.email },
        include: { workspace: true },
      });
      const valid = await verifyPassword(input.password, user?.passwordHash ?? dummyHash);
      if (!user || !valid) throw new HttpError(401, 'E-mail ou senha incorretos.');
      return issueSession(
        db,
        reply,
        {
          user: { id: user.id, name: user.name, email: user.email, role: user.role },
          workspace: user.workspace,
        },
        secure,
        ttlHours,
        'session.created',
      );
    },
  );
  const privateSchema = { security: [{ session: [] }] };
  app.get(
    '/v1/auth/me',
    {
      schema: {
        ...privateSchema,
        tags: ['Identity'],
        summary: 'Consultar sessão e workspace atual',
      },
    },
    (request) => requireIdentity(db, request),
  );
  app.post(
    '/v1/auth/logout',
    { schema: { ...privateSchema, tags: ['Identity'], summary: 'Revogar sessão' } },
    async (request, reply) => {
      const identity = await requireIdentity(db, request);
      await db.$transaction([
        db.session.deleteMany({
          where: { tokenHash: hashToken(request.cookies[SESSION_COOKIE]!) },
        }),
        db.auditLog.create({
          data: {
            workspaceId: identity.workspace.id,
            actorId: identity.user.id,
            action: 'session.revoked',
          },
        }),
      ]);
      reply.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, secure, sameSite: 'lax' });
      return reply.status(204).send();
    },
  );
  const dashboardSchema = {
    tags: ['Dashboard'],
    summary: 'Indicadores por período',
    querystring: {
      type: 'object',
      properties: { days: { type: 'string', enum: ['7', '30', '90'], default: '30' } },
    },
  };
  app.get('/v1/demo/dashboard', { schema: dashboardSchema }, async (request) => {
    const { days } = dashboardQuerySchema.parse(request.query);
    const now = new Date();
    return buildDashboard(demoOrders(now), days, now, 'simulated');
  });
  app.get(
    '/v1/dashboard',
    { schema: { ...dashboardSchema, ...privateSchema } },
    async (request) => {
      await requireIdentity(db, request);
      return buildDashboard([], dashboardQuerySchema.parse(request.query).days, new Date(), 'real');
    },
  );
  app.get(
    '/v1/integrations',
    {
      schema: {
        ...privateSchema,
        tags: ['Workspace'],
        summary: 'Integrações ainda não implementadas',
      },
    },
    async (request) => {
      await requireIdentity(db, request);
      return { items: integrations };
    },
  );
  app.patch(
    '/v1/workspace',
    {
      schema: {
        ...privateSchema,
        tags: ['Workspace'],
        summary: 'Alterar nome da operação (ADMIN)',
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: { name: { type: 'string', minLength: 2, maxLength: 80 } },
        },
      },
    },
    async (request) => {
      const identity = await requireIdentity(db, request);
      if (identity.user.role !== 'ADMIN')
        throw new HttpError(403, 'Somente administradores podem alterar a operação.');
      const { name } = workspaceSchema.parse(request.body);
      const [workspace] = await db.$transaction([
        db.workspace.update({ where: { id: identity.workspace.id }, data: { name } }),
        db.auditLog.create({
          data: {
            workspaceId: identity.workspace.id,
            actorId: identity.user.id,
            action: 'workspace.updated',
          },
        }),
      ]);
      return workspace;
    },
  );
  app.get(
    '/v1/audit',
    {
      schema: {
        ...privateSchema,
        tags: ['Workspace'],
        summary: 'Últimos 50 eventos do workspace atual',
      },
    },
    async (request) => {
      const identity = await requireIdentity(db, request);
      const items = await db.auditLog.findMany({
        where: { workspaceId: identity.workspace.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, action: true, createdAt: true, actor: { select: { name: true } } },
      });
      return { items };
    },
  );
  await registerCatalogRoutes(app, db);
  return app;
}
