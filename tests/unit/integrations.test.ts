import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ConfigurationRequiredError,
  IntegrationError,
  MercadoLivreAdapter,
  N8nAdapter,
  OpenAIAdapter,
  decryptSecret,
  encryptSecret,
  type Fetcher,
} from '../../apps/api/src/integrations/index.js';
import { mercadoLivreCredentials } from '../../apps/api/src/operations/marketplace.js';

function transport(responses: Array<Response | Error>) {
  const requests: Array<{ url: URL; init: RequestInit }> = [];
  const fetcher: Fetcher = async (url, init = {}) => {
    requests.push({ url: new URL(String(url)), init });
    const response = responses.shift();
    if (response instanceof Error) throw response;
    if (!response) throw new Error('Unexpected HTTP request');
    return response;
  };
  return { fetcher, requests };
}
const json = (body: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers });
const mlConfig = {
  clientId: 'application-id',
  clientSecret: 'application-secret',
  redirectUri: 'https://marketpilot.example.test/oauth/callback',
};
const listing = {
  title: 'Produto de teste',
  category_id: 'MLB1234',
  price: 125.5,
  currency_id: 'BRL',
  available_quantity: 3,
  buying_mode: 'buy_it_now' as const,
  condition: 'new' as const,
  listing_type_id: 'gold_special',
  pictures: [{ source: 'https://images.example.test/product.jpg' }],
};

describe('armazenamento de segredos', () => {
  it('criptografa com nonce único e recupera o texto usando chave base64 de 32 bytes', () => {
    const key = randomBytes(32).toString('base64');
    const first = encryptSecret('secret-for-test', key);
    expect(first).not.toContain('secret-for-test');
    expect(first).not.toBe(encryptSecret('secret-for-test', key));
    expect(decryptSecret(first, key)).toBe('secret-for-test');
  });
  it('rejeita adulteração, versão desconhecida e chave diferente', () => {
    const key = randomBytes(32).toString('base64');
    const envelope = encryptSecret('token', key).split(':');
    envelope[2] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptSecret(envelope.join(':'), key)).toThrow(IntegrationError);
    expect(() => decryptSecret('v2:nonce:cipher:tag', key)).toThrow(IntegrationError);
    expect(() =>
      decryptSecret(encryptSecret('token', key), randomBytes(32).toString('base64')),
    ).toThrow(IntegrationError);
  });
  it('rejeita chaves ausentes ou inválidas sem incluí-las no erro', () => {
    expect(() => encryptSecret('x', undefined)).toThrow(ConfigurationRequiredError);
    expect(() => encryptSecret('x', 'invalid-key')).toThrow('32 bytes');
    try {
      encryptSecret('x', 'invalid-key');
    } catch (error) {
      expect(String(error)).not.toContain('invalid-key');
    }
  });
});

describe('credenciais privadas do Mercado Livre', () => {
  it('usa a chave secreta criptografada do workspace quando não existe segredo no ambiente', async () => {
    const key = randomBytes(32).toString('base64');
    const db = {
      integrationConnection: {
        findUnique: async () => ({ encryptedAccessToken: encryptSecret('workspace-secret', key) }),
      },
    };

    await expect(
      mercadoLivreCredentials(db as never, 'workspace-1', {
        MERCADOLIVRE_CLIENT_ID: 'application-id',
        ENCRYPTION_KEY: key,
      }),
    ).resolves.toEqual({ clientId: 'application-id', clientSecret: 'workspace-secret' });
  });
});

describe('Mercado Livre oficial', () => {
  it('gera autorização com state e PKCE S256 sem expor o client secret', () => {
    const url = new URL(
      new MercadoLivreAdapter(mlConfig).authorizationUrl('random-state', 'a'.repeat(43)),
    );
    expect(url.origin).toBe('https://auth.mercadolivre.com.br');
    expect(url.pathname).toBe('/authorization');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: 'code',
      client_id: mlConfig.clientId,
      state: 'random-state',
      redirect_uri: mlConfig.redirectUri,
      code_challenge: 'a'.repeat(43),
      code_challenge_method: 'S256',
    });
    expect(url.href).not.toContain(mlConfig.clientSecret);
  });
  it('troca code e renova refresh token pelo formulário OAuth oficial', async () => {
    const reply = {
      access_token: 'access',
      refresh_token: 'refresh-new',
      expires_in: 21600,
      user_id: 123,
      token_type: 'Bearer',
      scope: 'read write',
    };
    const t = transport([json(reply), json(reply)]);
    const adapter = new MercadoLivreAdapter(mlConfig, t.fetcher);
    expect(await adapter.exchangeCode('code', 'b'.repeat(43))).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh-new',
      expiresIn: 21600,
      userId: 123,
      tokenType: 'Bearer',
      scope: 'read write',
    });
    await adapter.refreshToken('refresh-old');
    expect(t.requests[0]?.url.href).toBe('https://api.mercadolibre.com/oauth/token');
    expect(t.requests[0]?.init.method).toBe('POST');
    expect(new Headers(t.requests[0]?.init.headers).get('content-type')).toBe(
      'application/x-www-form-urlencoded',
    );
    expect(Object.fromEntries(new URLSearchParams(String(t.requests[0]?.init.body)))).toMatchObject(
      {
        grant_type: 'authorization_code',
        code_verifier: 'b'.repeat(43),
        client_secret: mlConfig.clientSecret,
      },
    );
    expect(Object.fromEntries(new URLSearchParams(String(t.requests[1]?.init.body)))).toMatchObject(
      { grant_type: 'refresh_token', refresh_token: 'refresh-old' },
    );
  });
  it('consulta usuário, itens, pedidos e envios com bearer no cabeçalho', async () => {
    const t = transport([
      json({ id: 123 }),
      json({ results: ['MLB123'], paging: { total: 1 } }),
      json([{ code: 200, body: { id: 'MLB123' } }]),
      json({ results: [] }),
      json({ id: 987 }),
      json({ id: 456 }),
    ]);
    const adapter = new MercadoLivreAdapter(mlConfig, t.fetcher);
    await adapter.getUser('access');
    await adapter.listItems('access', 123, { limit: 20, offset: 10, status: 'active' });
    await adapter.getItems('access', ['MLB123']);
    await adapter.listOrders('access', 123, { status: 'paid', from: '2026-11-01T00:00:00Z' });
    await adapter.getOrder('access', '987');
    await adapter.getShipment('access', '456');
    expect(t.requests.map((r) => r.url.pathname)).toEqual([
      '/users/me',
      '/users/123/items/search',
      '/items',
      '/orders/search',
      '/orders/987',
      '/shipments/456',
    ]);
    expect(t.requests[1]?.url.searchParams.get('offset')).toBe('10');
    expect(t.requests[2]?.url.searchParams.get('ids')).toBe('MLB123');
    expect(t.requests[3]?.url.searchParams.get('seller')).toBe('123');
    expect(t.requests[3]?.url.searchParams.get('order.status')).toBe('paid');
    for (const request of t.requests) {
      expect(new Headers(request.init.headers).get('authorization')).toBe('Bearer access');
      expect(request.url.href).not.toContain('access');
      expect(request.init.redirect).toBe('error');
    }
  });
  it('publica e atualiza preço/estoque apenas com payloads validados', async () => {
    const t = transport([
      json({ id: 'MLB123' }, 201),
      json({ id: 'MLB123', price: 140 }),
      json({ id: 'MLB123', available_quantity: 4 }),
    ]);
    const adapter = new MercadoLivreAdapter(mlConfig, t.fetcher);
    await adapter.createListing('access', listing);
    await adapter.updatePrice('access', 'MLB123', 140);
    await adapter.updateStock('access', 'MLB123', 4);
    expect(t.requests.map((r) => [r.url.pathname, r.init.method])).toEqual([
      ['/items', 'POST'],
      ['/items/MLB123', 'PUT'],
      ['/items/MLB123', 'PUT'],
    ]);
    expect(JSON.parse(String(t.requests[0]?.init.body))).toEqual(listing);
    expect(JSON.parse(String(t.requests[1]?.init.body))).toEqual({ price: 140 });
    expect(JSON.parse(String(t.requests[2]?.init.body))).toEqual({ available_quantity: 4 });
    await expect(adapter.updatePrice('access', 'MLB123', -1)).rejects.toMatchObject({
      code: 'invalid_input',
    });
    await expect(adapter.updateStock('access', 'MLB123', 1.5)).rejects.toMatchObject({
      code: 'invalid_input',
    });
    await expect(
      adapter.createListing('access', { ...listing, pictures: [{ source: 'file:///etc/passwd' }] }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    expect(t.requests).toHaveLength(3);
  });
  it('não declara preço atualizado se a API ignorou a alteração', async () => {
    const t = transport([json({ id: 'MLB123', price: 130 })]);
    await expect(
      new MercadoLivreAdapter(mlConfig, t.fetcher).updatePrice('access', 'MLB123', 140),
    ).rejects.toMatchObject({ code: 'upstream_rejected' });
  });
  it('não inventa pesquisa de comparáveis quando a capacidade não foi confirmada', async () => {
    const t = transport([]);
    await expect(
      new MercadoLivreAdapter(mlConfig, t.fetcher).searchComparables('access', {
        query: 'produto',
      }),
    ).rejects.toMatchObject({ code: 'capability_unavailable' });
    expect(t.requests).toHaveLength(0);
  });
  it('bloqueia configurações ausentes e identificadores inválidos antes do HTTP', async () => {
    const t = transport([]);
    expect(() => new MercadoLivreAdapter({}).authorizationUrl('state')).toThrow(
      ConfigurationRequiredError,
    );
    await expect(
      new MercadoLivreAdapter(mlConfig, t.fetcher).getItems('access', ['../users/me']),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      new MercadoLivreAdapter(mlConfig, t.fetcher).getOrder('', '123'),
    ).rejects.toMatchObject({ code: 'configuration_required' });
    expect(t.requests).toHaveLength(0);
  });
});

const analysis = {
  evidence: ['/product/costCents'],
  recommendation: 'Revisar margem com os dados fornecidos.',
  score: 65,
  confidence: 0.7,
  risks: ['Frete ainda desconhecido.'],
};
function responseOutput(value: unknown, extra = {}) {
  return {
    id: 'resp_test',
    model: 'configured-model',
    status: 'completed',
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: JSON.stringify(value) }],
      },
    ],
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
      input_tokens_details: { cached_tokens: 20 },
    },
    ...extra,
  };
}
describe('OpenAI Responses', () => {
  it('descobre fornecedores somente por busca web e preserva URLs de evidência', async () => {
    const t = transport([
      json(
        responseOutput({
          candidates: [
            {
              name: 'Fornecedor Exemplo',
              sourceUrl: 'https://supplier.example.com/dropshipping',
              catalogUrl: 'https://supplier.example.com/catalogo',
              cnpj: null,
              summary: 'Página pública descreve catálogo e atendimento para revenda.',
              evidenceUrls: [
                'https://supplier.example.com/dropshipping',
                'https://supplier.example.com/catalogo',
              ],
              risks: ['CNPJ não encontrado na fonte consultada.'],
            },
          ],
          limitations: ['Disponibilidade e preço precisam ser sincronizados pela fonte do fornecedor.'],
        }),
      ),
    ]);
    const result = await new OpenAIAdapter(
      { apiKey: 'api-key', model: 'configured-model' },
      t.fetcher,
    ).discoverSuppliers('fornecedor dropshipping catálogo Brasil');

    expect(result.candidates[0]).toMatchObject({
      name: 'Fornecedor Exemplo',
      sourceUrl: 'https://supplier.example.com/dropshipping',
    });
    const body = JSON.parse(String(t.requests[0]?.init.body));
    expect(body).toMatchObject({
      tools: [{ type: 'web_search', search_context_size: 'medium' }],
      tool_choice: 'required',
    });
  });
  it('solicita JSON estruturado, limita tokens e retorna uso/custo sem raciocínio interno', async () => {
    const t = transport([json(responseOutput(analysis))]);
    const result = await new OpenAIAdapter(
      {
        apiKey: 'api-key',
        model: 'configured-model',
        maxOutputTokens: 1200,
        tokenPrices: { inputPerMillion: 2, cachedInputPerMillion: 1, outputPerMillion: 4 },
      },
      t.fetcher,
    ).analyze({ agent: 'pricing', context: { product: { costCents: 5000 } } });
    expect(result).toMatchObject({
      ...analysis,
      responseId: 'resp_test',
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, cachedInputTokens: 20 },
    });
    expect(result.estimatedCostUsd).toBeCloseTo(0.00038);
    expect(t.requests[0]?.url.href).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(String(t.requests[0]?.init.body));
    expect(body).toMatchObject({
      model: 'configured-model',
      max_output_tokens: 1200,
      store: false,
      text: { format: { type: 'json_schema', strict: true, name: 'marketpilot_analysis' } },
    });
    expect(body.tools).toEqual([]);
    expect(body).not.toHaveProperty('reasoning');
    expect(JSON.stringify(result)).not.toContain('chain_of_thought');
  });
  it('responde somente com contexto e deixa custo null sem preços configurados', async () => {
    const t = transport([
      json(
        responseOutput({
          answer: 'O custo é R$ 50.',
          evidence: ['/product/costCents'],
          confidence: 0.9,
          risks: [],
        }),
      ),
    ]);
    const result = await new OpenAIAdapter(
      { apiKey: 'api-key', model: 'configured-model' },
      t.fetcher,
    ).answer({ product: { costCents: 5000 } }, 'Qual o custo?');
    expect(result.answer).toBe('O custo é R$ 50.');
    expect(result.estimatedCostUsd).toBeNull();
    const body = JSON.parse(String(t.requests[0]?.init.body));
    expect(body.instructions).toContain('contexto');
    expect(body.input[0].content).toContain('Qual o custo?');
  });
  it('rejeita evidência fabricada, score sem evidência e respostas incompletas/recusadas', async () => {
    const t = transport([
      json(responseOutput({ ...analysis, evidence: ['/unprovided'] })),
      json(responseOutput({ ...analysis, evidence: [] })),
      json(responseOutput(analysis, { status: 'incomplete' })),
      json(
        responseOutput(analysis, {
          output: [
            { type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'No.' }] },
          ],
        }),
      ),
    ]);
    const adapter = new OpenAIAdapter({ apiKey: 'api-key', model: 'configured-model' }, t.fetcher);
    for (const code of [
      'invalid_response',
      'invalid_response',
      'incomplete_response',
      'model_refusal',
    ]) {
      await expect(
        adapter.analyze({ agent: 'pricing', context: { product: { costCents: 5000 } } }),
      ).rejects.toMatchObject({ code });
    }
  });
  it('exige configuração e rejeita contexto acima do limite', async () => {
    const t = transport([]);
    await expect(
      new OpenAIAdapter({}, t.fetcher).analyze({ agent: 'pricing', context: {} }),
    ).rejects.toMatchObject({ code: 'configuration_required' });
    await expect(
      new OpenAIAdapter({ apiKey: 'key', model: 'model' }, t.fetcher).answer(
        { text: 'x'.repeat(100_000) },
        'question',
      ),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    expect(t.requests).toHaveLength(0);
  });
});

describe('n8n API e webhooks autorizados', () => {
  it('lista workflows e consulta execução pela API pública preservando caminho base', async () => {
    const t = transport([
      json({ data: [{ id: 'workflow-1', name: 'Sync', active: true }], nextCursor: 'next' }),
      json({ id: 'execution-1', status: 'success', workflowId: 'workflow-1' }),
    ]);
    const adapter = new N8nAdapter(
      { baseUrl: 'https://n8n.example.test/automation', apiKey: 'n8n-api-key' },
      t.fetcher,
    );
    expect(
      await adapter.listWorkflows({ limit: 50, active: true, cursor: 'cursor' }),
    ).toMatchObject({ nextCursor: 'next' });
    await adapter.getExecution('execution-1');
    expect(t.requests[0]?.url.pathname).toBe('/automation/api/v1/workflows');
    expect(t.requests[0]?.url.searchParams.get('cursor')).toBe('cursor');
    expect(t.requests[1]?.url.pathname).toBe('/automation/api/v1/executions/execution-1');
    expect(new Headers(t.requests[0]?.init.headers).get('X-N8N-API-KEY')).toBe('n8n-api-key');
  });
  it('dispara somente webhook pré-configurado sem enviar a chave da API', async () => {
    const t = transport([json({ accepted: true }, 202)]);
    const adapter = new N8nAdapter(
      {
        baseUrl: 'https://n8n.example.test',
        apiKey: 'management-key',
        webhooks: {
          sync: {
            url: 'https://n8n.example.test/webhook/sync',
            headers: { 'X-Webhook-Token': 'webhook-secret' },
          },
        },
      },
      t.fetcher,
    );
    await adapter.triggerWorkflow('sync', { actionId: 'action-1' });
    expect(t.requests[0]?.url.href).toBe('https://n8n.example.test/webhook/sync');
    const headers = new Headers(t.requests[0]?.init.headers);
    expect(headers.get('X-N8N-API-KEY')).toBeNull();
    expect(headers.get('X-Webhook-Token')).toBe('webhook-secret');
    await expect(
      adapter.triggerWorkflow('https://untrusted.example.test', {}),
    ).rejects.toMatchObject({ code: 'configuration_required' });
    expect(t.requests).toHaveLength(1);
  });
  it('rejeita URLs inválidas e configuração ausente sem HTTP', async () => {
    const t = transport([]);
    expect(() => new N8nAdapter({ baseUrl: 'file:///etc/passwd', apiKey: 'key' })).toThrow(
      IntegrationError,
    );
    expect(
      () => new N8nAdapter({ baseUrl: 'https://user:password@example.test', apiKey: 'key' }),
    ).toThrow(IntegrationError);
    await expect(new N8nAdapter({}, t.fetcher).listWorkflows()).rejects.toMatchObject({
      code: 'configuration_required',
    });
    await expect(new N8nAdapter({}, t.fetcher).triggerWorkflow('sync', {})).rejects.toMatchObject({
      code: 'configuration_required',
    });
    expect(t.requests).toHaveLength(0);
  });
});

describe('falhas HTTP externas', () => {
  it('limita respostas e reconhece erros HTTP mesmo com corpo não JSON', async () => {
    const t = transport([
      new Response('gateway failure', { status: 503 }),
      json({ text: 'x'.repeat(1_048_577) }),
    ]);
    const adapter = new MercadoLivreAdapter(mlConfig, t.fetcher);
    await expect(adapter.getUser('access')).rejects.toMatchObject({
      code: 'upstream_unavailable',
      status: 503,
    });
    await expect(adapter.getUser('access')).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('não propaga um segredo que o provedor ecoou como código de erro', async () => {
    const t = transport([json({ error: 'echoed_secret_value' }, 400)]);
    try {
      await new MercadoLivreAdapter(mlConfig, t.fetcher).getUser('access');
    } catch (error) {
      expect(error).toBeInstanceOf(IntegrationError);
      expect(JSON.stringify(error)).not.toContain('echoed_secret_value');
    }
  });
  it('não normaliza silenciosamente valores não JSON no contexto enviado', async () => {
    const t = transport([]);
    await expect(
      new OpenAIAdapter({ apiKey: 'key', model: 'model' }, t.fetcher).answer(
        { cost: Number.NaN },
        'Custo?',
      ),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    expect(t.requests).toHaveLength(0);
  });
  it('remove definições internas e dados sensíveis das respostas n8n', async () => {
    const t = transport([
      json({
        data: [
          {
            id: 'wf',
            name: 'Sync',
            active: true,
            nodes: [{ parameters: { secret: 'sensitive-node-value' } }],
          },
        ],
        nextCursor: null,
      }),
      json({
        id: 'run',
        status: 'success',
        workflowId: 'wf',
        data: { secret: 'sensitive-execution-value' },
      }),
    ]);
    const adapter = new N8nAdapter(
      { baseUrl: 'https://n8n.example.test', apiKey: 'key' },
      t.fetcher,
    );
    expect(JSON.stringify(await adapter.listWorkflows())).not.toContain('sensitive-node-value');
    expect(JSON.stringify(await adapter.getExecution('run'))).not.toContain(
      'sensitive-execution-value',
    );
  });
  it('preserva rate limit e retry-after sem repetir ações externas', async () => {
    const t = transport([
      json({ message: 'secret echoed should not escape', error: 'too_many_requests' }, 429, {
        'Retry-After': '7',
      }),
    ]);
    await expect(
      new MercadoLivreAdapter(mlConfig, t.fetcher).getUser('token'),
    ).rejects.toMatchObject({
      code: 'rate_limited',
      status: 429,
      retryAfterSeconds: 7,
      provider: 'mercadolivre',
    });
    expect(t.requests).toHaveLength(1);
  });
  it('normaliza falha de autenticação, rede e JSON inválido sem revelar dados externos', async () => {
    const t = transport([
      json({ message: 'access-token-sensitive' }, 401),
      new Error('sensitive transport detail'),
      new Response('bad json'),
    ]);
    const adapter = new MercadoLivreAdapter(mlConfig, t.fetcher);
    for (const code of ['upstream_authentication', 'network_error', 'invalid_response']) {
      try {
        await adapter.getUser('token');
        throw new Error('Expected failure');
      } catch (error) {
        expect(error).toMatchObject({ code });
        expect(String(error)).not.toMatch(/sensitive|access-token/);
      }
    }
  });
  it('interrompe chamadas que não terminam com timeout explícito', async () => {
    const fetcher: Fetcher = async () => new Promise<Response>(() => {});
    await expect(
      new MercadoLivreAdapter({ ...mlConfig, timeoutMs: 10 }, fetcher).getUser('token'),
    ).rejects.toMatchObject({ code: 'timeout' });
  });
});
