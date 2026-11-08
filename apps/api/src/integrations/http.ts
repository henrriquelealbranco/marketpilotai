export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}
export type Fetcher = typeof fetch;
export type Provider = 'mercadolivre' | 'cjdropshipping' | 'openai' | 'n8n' | 'secrets';
export type IntegrationErrorCode =
  | 'configuration_required'
  | 'invalid_configuration'
  | 'invalid_input'
  | 'invalid_ciphertext'
  | 'upstream_authentication'
  | 'upstream_forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'upstream_unavailable'
  | 'upstream_rejected'
  | 'upstream_error'
  | 'invalid_response'
  | 'timeout'
  | 'network_error'
  | 'capability_unavailable'
  | 'incomplete_response'
  | 'model_refusal';

export class IntegrationError extends Error {
  readonly code: IntegrationErrorCode;
  readonly provider: Provider;
  readonly status?: number;
  readonly retryAfterSeconds?: number;
  readonly upstreamCode?: string;
  constructor(
    code: IntegrationErrorCode,
    message: string,
    provider: Provider,
    details: {
      status?: number;
      retryAfterSeconds?: number;
      upstreamCode?: string;
    } = {},
  ) {
    super(message);
    this.name = 'IntegrationError';
    this.code = code;
    this.provider = provider;
    Object.assign(this, details);
  }
}

export class ConfigurationRequiredError extends IntegrationError {
  constructor(provider: Provider = 'secrets') {
    super('configuration_required', 'Configuração da integração pendente.', provider);
    this.name = 'ConfigurationRequiredError';
  }
}

export function invalidInput(provider: Provider): never {
  throw new IntegrationError('invalid_input', 'Parâmetros da integração inválidos.', provider);
}
export function requireValue(value: string | undefined, provider: Provider): string {
  if (!value?.trim()) throw new ConfigurationRequiredError(provider);
  if (/[\r\n]/.test(value)) invalidInput(provider);
  return value;
}
export function timeoutValue(value: number | undefined, provider: Provider): number {
  if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > 120_000)) {
    throw new IntegrationError(
      'invalid_configuration',
      'Timeout deve estar entre 1 e 120000 ms.',
      provider,
    );
  }
  return value ?? 15_000;
}
export function httpUrl(value: string, provider: Provider): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    invalidInput(provider);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash)
    invalidInput(provider);
  return url;
}
export function objectResult(value: JsonValue, provider: Provider): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new IntegrationError(
      'invalid_response',
      'Resposta externa em formato inválido.',
      provider,
    );
  }
  return value;
}
export function boundedJson(value: unknown, provider: Provider, maxBytes = 256_000): string {
  const ancestors = new Set<object>();
  function validate(part: unknown, depth: number): void {
    if (part === null || typeof part === 'string' || typeof part === 'boolean') return;
    if (typeof part === 'number' && Number.isFinite(part)) return;
    if (typeof part !== 'object' || depth > 32 || ancestors.has(part)) invalidInput(provider);
    if (!Array.isArray(part) && ![Object.prototype, null].includes(Object.getPrototypeOf(part)))
      invalidInput(provider);
    if (Object.getOwnPropertySymbols(part).length) invalidInput(provider);
    ancestors.add(part);
    for (const child of Object.values(part)) validate(child, depth + 1);
    ancestors.delete(part);
  }
  validate(value, 0);
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    invalidInput(provider);
  }
  if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > maxBytes)
    invalidInput(provider);
  return serialized;
}

function retryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = /^\d+(?:\.\d+)?$/.test(value)
    ? Math.ceil(Number(value))
    : Math.ceil((Date.parse(value) - Date.now()) / 1000);
  return Number.isFinite(seconds) ? Math.max(0, seconds) : undefined;
}
async function readJson(response: Response, provider: Provider): Promise<JsonValue> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 1_048_576) {
        await reader.cancel();
        throw new IntegrationError(
          'invalid_response',
          'Resposta externa excede o limite.',
          provider,
        );
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (size === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as JsonValue;
  } catch {
    throw new IntegrationError(
      'invalid_response',
      'Resposta externa não contém JSON válido.',
      provider,
    );
  }
}

/** No automatic retry: OAuth refreshes, listings and webhooks can have side effects. */
export async function requestJson(
  provider: Provider,
  fetcher: Fetcher,
  url: URL | string,
  init: RequestInit,
  timeoutMs: number,
): Promise<JsonValue> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new IntegrationError('timeout', 'Tempo limite da integração excedido.', provider));
    }, timeoutMs);
  });
  const operation = async (): Promise<JsonValue> => {
    let response: Response;
    try {
      response = await fetcher(url, { ...init, redirect: 'error', signal: controller.signal });
    } catch {
      if (controller.signal.aborted)
        throw new IntegrationError('timeout', 'Tempo limite da integração excedido.', provider);
      throw new IntegrationError(
        'network_error',
        'Falha de comunicação com a integração.',
        provider,
      );
    }
    if (!response.ok) {
      const code: IntegrationErrorCode =
        response.status === 401
          ? 'upstream_authentication'
          : response.status === 403
            ? 'upstream_forbidden'
            : response.status === 404
              ? 'not_found'
              : response.status === 429
                ? 'rate_limited'
                : response.status >= 500
                  ? 'upstream_unavailable'
                  : 'upstream_error';
      // Never propagate upstream messages or request bodies: providers can echo secrets.
      let upstreamCode: string | undefined;
      try {
        const body = objectResult(await readJson(response, provider), provider);
        const candidate =
          typeof body.error === 'string'
            ? body.error
            : body.error && typeof body.error === 'object' && !Array.isArray(body.error)
              ? body.error.code
              : undefined;
        if (
          typeof candidate === 'string' &&
          [
            'invalid_grant',
            'invalid_client',
            'invalid_request',
            'invalid_token',
            'unauthorized',
            'forbidden',
            'not_found',
            'too_many_requests',
            'rate_limit_exceeded',
            'insufficient_quota',
            'invalid_api_key',
            'model_not_found',
            'context_length_exceeded',
          ].includes(candidate)
        )
          upstreamCode = candidate;
      } catch {
        /* HTTP status remains authoritative even when the error body is malformed. */
      }
      throw new IntegrationError(
        code,
        `Serviço externo retornou HTTP ${response.status}.`,
        provider,
        {
          status: response.status,
          retryAfterSeconds: retryAfter(response.headers.get('retry-after')),
          upstreamCode,
        },
      );
    }
    return readJson(response, provider);
  };
  try {
    return await Promise.race([operation(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
