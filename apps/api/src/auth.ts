import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '@marketpilot/database';
import type { Identity } from '@marketpilot/contracts';
import { createSessionToken, hashToken } from './crypto.js';

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export const SESSION_COOKIE = 'mp_session';
export async function requireIdentity(db: Database, request: FastifyRequest): Promise<Identity> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token || token.length > 128) throw new HttpError(401, 'Entre na sua conta para continuar.');
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { workspace: true } } },
  });
  if (!session || session.expiresAt <= new Date())
    throw new HttpError(401, 'Sua sessão expirou. Entre novamente.');
  const { user } = session;
  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    workspace: {
      id: user.workspace.id,
      name: user.workspace.name,
      timezone: user.workspace.timezone,
    },
  };
}
export async function issueSession(
  db: Database,
  reply: FastifyReply,
  identity: Identity,
  secure: boolean,
  ttlHours: number,
  action: string,
): Promise<Identity> {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + ttlHours * 3600000);
  await db.$transaction([
    db.session.deleteMany({ where: { userId: identity.user.id, expiresAt: { lt: new Date() } } }),
    db.session.create({
      data: { userId: identity.user.id, tokenHash: hashToken(token), expiresAt },
    }),
    db.auditLog.create({
      data: { workspaceId: identity.workspace.id, actorId: identity.user.id, action },
    }),
  ]);
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    expires: expiresAt,
  });
  return identity;
}
