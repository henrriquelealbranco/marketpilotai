import {
  boundedJson,
  ConfigurationRequiredError,
  httpUrl,
  IntegrationError,
  invalidInput,
  objectResult,
  requestJson,
  requireValue,
  timeoutValue,
  type Fetcher,
  type JsonObject,
  type JsonValue,
} from './http.js';

export interface N8nWebhook {
  url: string;
  headers?: Record<string, string>;
}
export interface N8nConfig {
  baseUrl?: string;
  apiKey?: string;
  webhooks?: Record<string, N8nWebhook>;
  timeoutMs?: number;
}
export interface WorkflowListOptions {
  limit?: number;
  cursor?: string;
  active?: boolean;
}

function project(source: JsonObject, keys: string[]): JsonObject {
  const result: JsonObject = {};
  for (const key of keys) {
    const value = source[key];
    if (value === null || ['string', 'boolean', 'number'].includes(typeof value))
      result[key] = value ?? null;
  }
  return result;
}

function invalidResponse(): never {
  throw new IntegrationError('invalid_response', 'Resposta n8n inválida.', 'n8n');
}

export class N8nAdapter {
  #baseUrl?: string;
  #apiKey?: string;
  #webhooks: Map<string, { url: string; headers: Record<string, string> }>;
  #fetcher: Fetcher;
  #timeoutMs: number;
  constructor(config: N8nConfig, fetcher: Fetcher = fetch) {
    this.#apiKey = config.apiKey;
    this.#fetcher = fetcher;
    this.#timeoutMs = timeoutValue(config.timeoutMs, 'n8n');
    if (config.baseUrl) {
      const url = httpUrl(config.baseUrl, 'n8n');
      if (url.search) invalidInput('n8n');
      this.#baseUrl = url.href.replace(/\/+$/, '').replace(/\/api\/v1$/, '');
    }
    this.#webhooks = new Map();
    for (const [id, webhook] of Object.entries(config.webhooks ?? {})) {
      const url = httpUrl(webhook.url, 'n8n');
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(webhook.headers ?? {})) {
        if (
          !/^[A-Za-z0-9-]+$/.test(name) ||
          /[\r\n]/.test(value) ||
          ['x-n8n-api-key', 'host', 'cookie', 'content-length', 'content-type', 'accept'].includes(
            name.toLowerCase(),
          )
        )
          invalidInput('n8n');
        headers[name] = value;
      }
      this.#webhooks.set(id, { url: url.href, headers });
    }
  }
  async #request(path: string, query = new URLSearchParams()): Promise<JsonObject> {
    const baseUrl = requireValue(this.#baseUrl, 'n8n');
    const apiKey = requireValue(this.#apiKey, 'n8n');
    const url = new URL(`${baseUrl}/api/v1/${path}`);
    url.search = query.toString();
    return objectResult(
      await requestJson(
        'n8n',
        this.#fetcher,
        url,
        {
          method: 'GET',
          headers: { accept: 'application/json', 'X-N8N-API-KEY': apiKey },
        },
        this.#timeoutMs,
      ),
      'n8n',
    );
  }
  async listWorkflows(options: WorkflowListOptions = {}): Promise<JsonObject> {
    const query = new URLSearchParams();
    if (options.limit !== undefined) {
      if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 250)
        invalidInput('n8n');
      query.set('limit', String(options.limit));
    }
    if (options.cursor !== undefined) {
      if (!options.cursor || options.cursor.length > 4096) invalidInput('n8n');
      query.set('cursor', options.cursor);
    }
    if (options.active !== undefined) {
      if (typeof options.active !== 'boolean') invalidInput('n8n');
      query.set('active', String(options.active));
    }
    const result = await this.#request('workflows', query);
    if (
      !Array.isArray(result.data) ||
      (result.nextCursor !== null && typeof result.nextCursor !== 'string')
    )
      invalidResponse();
    const data = result.data.map((value) => {
      const workflow = objectResult(value, 'n8n');
      if (typeof workflow.id !== 'string' || typeof workflow.name !== 'string') invalidResponse();
      return project(workflow, [
        'id',
        'name',
        'active',
        'activeVersionId',
        'isArchived',
        'updatedAt',
      ]);
    });
    return { data, nextCursor: result.nextCursor };
  }
  async getExecution(executionId: string): Promise<JsonObject> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(executionId)) invalidInput('n8n');
    // Execution data can contain PII and credentials; it is not requested by default.
    const result = await this.#request(
      `executions/${executionId}`,
      new URLSearchParams({ includeData: 'false' }),
    );
    if (
      typeof result.id !== 'string' ||
      typeof result.status !== 'string' ||
      typeof result.workflowId !== 'string'
    )
      invalidResponse();
    return project(result, [
      'id',
      'status',
      'workflowId',
      'finished',
      'mode',
      'startedAt',
      'stoppedAt',
      'waitTill',
    ]);
  }
  async triggerWorkflow(workflowId: string, payload: JsonObject): Promise<JsonValue> {
    const webhook = this.#webhooks.get(workflowId);
    if (!webhook) throw new ConfigurationRequiredError('n8n');
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) invalidInput('n8n');
    return requestJson(
      'n8n',
      this.#fetcher,
      webhook.url,
      {
        method: 'POST',
        headers: {
          ...webhook.headers,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: boundedJson(payload, 'n8n'),
      },
      this.#timeoutMs,
    );
  }
}
