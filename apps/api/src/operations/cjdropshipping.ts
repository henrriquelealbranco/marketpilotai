import type { Database } from '@marketpilot/database';
import type { Identity } from '@marketpilot/contracts';

import {
  CJDropshippingAdapter,
  decryptSecret,
  encryptSecret,
} from '../integrations/index.js';
import { requiredConfiguration } from './agents.js';
import { audit, json } from './store.js';

type CJEnvironment = Partial<Pick<NodeJS.ProcessEnv, 'ENCRYPTION_KEY'>>;

/** Returns the API key only to backend callers that need to contact CJ. */
export async function cjDropshippingCredentials(
  db: Database,
  workspaceId: string,
  env: CJEnvironment = process.env,
) {
  const stored = await db.integrationConnection.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: 'cjdropshipping_config' } },
  });
  return {
    apiKey: stored?.encryptedAccessToken
      ? decryptSecret(stored.encryptedAccessToken, env.ENCRYPTION_KEY)
      : undefined,
  };
}

function encryptionKey() {
  if (!process.env.ENCRYPTION_KEY)
    requiredConfiguration('Configure a chave de criptografia no servidor antes de conectar contas.');
  return process.env.ENCRYPTION_KEY;
}

export async function saveCJDropshippingCredentials(
  db: Database,
  identity: Identity,
  apiKey: string,
) {
  const key = encryptionKey();
  await db.integrationConnection.upsert({
    where: {
      workspaceId_provider: {
        workspaceId: identity.workspace.id,
        provider: 'cjdropshipping_config',
      },
    },
    create: {
      workspaceId: identity.workspace.id,
      provider: 'cjdropshipping_config',
      status: 'CONFIGURED',
      encryptedAccessToken: encryptSecret(apiKey, key),
      metadataJson: json({}),
    },
    update: {
      status: 'CONFIGURED',
      encryptedAccessToken: encryptSecret(apiKey, key),
      metadataJson: json({}),
    },
  });
  await audit(db, identity, 'integration.cjdropshipping.credentials_configured');
  return { configured: true };
}

export async function checkCJDropshipping(db: Database, identity: Identity) {
  const credentials = await cjDropshippingCredentials(db, identity.workspace.id);
  const tokens = await new CJDropshippingAdapter(credentials).getAccessToken();
  const key = encryptionKey();
  await db.integrationConnection.upsert({
    where: {
      workspaceId_provider: { workspaceId: identity.workspace.id, provider: 'cjdropshipping' },
    },
    create: {
      workspaceId: identity.workspace.id,
      provider: 'cjdropshipping',
      status: 'CONNECTED',
      encryptedAccessToken: encryptSecret(tokens.accessToken, key),
      encryptedRefreshToken: encryptSecret(tokens.refreshToken, key),
      expiresAt: new Date(tokens.accessTokenExpiryDate),
      metadataJson: json({}),
    },
    update: {
      status: 'CONNECTED',
      encryptedAccessToken: encryptSecret(tokens.accessToken, key),
      encryptedRefreshToken: encryptSecret(tokens.refreshToken, key),
      expiresAt: new Date(tokens.accessTokenExpiryDate),
      metadataJson: json({}),
    },
  });
  await audit(db, identity, 'integration.cjdropshipping.connected');
  return { connected: true, expiresAt: tokens.accessTokenExpiryDate };
}
