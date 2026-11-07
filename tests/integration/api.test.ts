import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../apps/api/src/app.js';
import { database } from '../../packages/database/src/index.js';

const origin = 'http://localhost:3000';
const db = database();
const app = await buildApp({
  db,
  logger: false,
  allowRegistration: true,
  origin,
  rateLimitMax: 300,
});
const prefix = randomUUID();
let cookie = '';
let workspaceId = '';
const credentials = {
  email: `${prefix}@example.test`,
  password: 'Teste-seguro-123!',
  name: 'Operador',
  workspaceName: 'Loja teste',
};
beforeAll(async () => {
  await db.$connect();
  await app.ready();
});
afterAll(async () => {
  await db.workspace.deleteMany({ where: { users: { some: { email: { startsWith: prefix } } } } });
  await app.close();
  await db.$disconnect();
});
describe.sequential('API com PostgreSQL real', () => {
  it('permite demo e bloqueia leitura privada sem sessão', async () => {
    expect((await app.inject('/v1/demo/dashboard?days=7')).json().source).toBe('simulated');
    expect((await app.inject('/v1/dashboard')).statusCode).toBe(401);
  });
  it('bloqueia escrita de outra origem e valida credenciais', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/auth/register',
          headers: { origin: 'https://invalid.test' },
          payload: credentials,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/auth/register',
          headers: { origin },
          payload: { ...credentials, password: 'abc' },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('cria workspace e sessão persistente sem expor hashes', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      headers: { origin },
      payload: credentials,
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers['set-cookie']).toContain('HttpOnly');
    expect(response.headers['set-cookie']).toContain('SameSite=Lax');
    cookie = String(response.headers['set-cookie']).split(';')[0]!;
    workspaceId = response.json().workspace.id;
    expect(response.body).not.toContain('passwordHash');
    const session = await db.session.findFirst({ where: { user: { email: credentials.email } } });
    expect(session?.tokenHash).not.toBe(cookie.split('=')[1]);
    expect(
      (await app.inject({ url: '/v1/dashboard', headers: { cookie } })).json().revenueCents,
    ).toBe(0);
  });
  it('rejeita duplicação e senha incorreta com erro genérico', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/auth/register',
          headers: { origin },
          payload: credentials,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/auth/login',
          headers: { origin },
          payload: { email: credentials.email, password: 'senha-incorreta' },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('isola workspaces e recusa leitura/escrita com role VIEWER', async () => {
    const second = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      headers: { origin },
      payload: {
        ...credentials,
        email: `${prefix}-second@example.test`,
        workspaceName: 'Segunda loja',
      },
    });
    const secondCookie = String(second.headers['set-cookie']).split(';')[0]!;
    const secondWorkspace = second.json().workspace.id;
    const update = await app.inject({
      method: 'PATCH',
      url: '/v1/workspace',
      headers: { origin, cookie },
      payload: { name: 'Minha operação' },
    });
    expect(update.statusCode).toBe(200);
    expect(
      (await app.inject({ url: '/v1/auth/me', headers: { cookie: secondCookie } })).json().workspace
        .name,
    ).toBe('Segunda loja');
    await db.user.updateMany({ where: { workspaceId: secondWorkspace }, data: { role: 'VIEWER' } });
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: '/v1/workspace',
          headers: { origin, cookie: secondCookie },
          payload: { name: 'Acesso indevido' },
        })
      ).statusCode,
    ).toBe(403);
    const audit = (
      await app.inject({ url: '/v1/audit', headers: { cookie: secondCookie } })
    ).json();
    expect(audit.items.some((a: { action: string }) => a.action === 'workspace.updated')).toBe(
      false,
    );
  });
  it('revoga sessão no logout e permite novo login', async () => {
    expect(
      (await app.inject({ method: 'POST', url: '/v1/auth/logout', headers: { origin, cookie } }))
        .statusCode,
    ).toBe(204);
    expect((await app.inject({ url: '/v1/auth/me', headers: { cookie } })).statusCode).toBe(401);
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { origin },
      payload: credentials,
    });
    expect(login.statusCode).toBe(200);
    cookie = String(login.headers['set-cookie']).split(';')[0]!;
    expect(login.json().workspace.name).toBe('Minha operação');
  });
  it('rejeita sessão expirada no banco', async () => {
    await db.session.updateMany({
      where: { user: { workspaceId } },
      data: { expiresAt: new Date(0) },
    });
    expect((await app.inject({ url: '/v1/dashboard', headers: { cookie } })).statusCode).toBe(401);
  });
  it('fornece OpenAPI e readiness do banco', async () => {
    expect((await app.inject('/ready')).statusCode).toBe(200);
    expect((await app.inject('/docs/json')).json().paths['/v1/auth/login']).toBeDefined();
    expect((await app.inject('/v1/demo/dashboard?days=15')).statusCode).toBe(400);
  });
});
