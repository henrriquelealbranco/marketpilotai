import { z } from 'zod';
import {
  boundedJson,
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

export interface MercadoLivreConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  timeoutMs?: number;
}
export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: number;
  tokenType: string;
  scope: string;
}
export interface ItemListOptions {
  offset?: number;
  limit?: number;
  status?: 'active' | 'paused' | 'closed';
  searchType?: 'scan';
  scrollId?: string;
}
export interface OrderListOptions {
  offset?: number;
  limit?: number;
  status?: string;
  from?: string;
  to?: string;
}
const pictureSchema = z.union([
  z.object({ id: z.string().min(1).max(200) }).strict(),
  z
    .object({
      source: z.url().refine((value) => {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password;
      }),
    })
    .strict(),
]);
const attributeSchema = z
  .object({
    id: z.string().min(1).max(100),
    value_id: z.string().max(100).optional(),
    value_name: z.string().max(500).optional(),
  })
  .strict()
  .refine((a) => a.value_id !== undefined || a.value_name !== undefined);
export const listingInputSchema = z
  .object({
    title: z.string().trim().min(1).max(256).optional(),
    family_name: z.string().trim().min(1).max(256).optional(),
    category_id: z.string().regex(/^[A-Z]{3}\d+$/),
    price: z.number().positive().finite().max(1_000_000_000),
    currency_id: z.string().regex(/^[A-Z]{3}$/),
    available_quantity: z.number().int().min(1).max(1_000_000),
    buying_mode: z.literal('buy_it_now'),
    condition: z.enum(['new', 'used', 'not_specified']),
    listing_type_id: z.string().regex(/^[a-z0-9_]+$/),
    pictures: z.array(pictureSchema).min(1).max(20),
    attributes: z.array(attributeSchema).max(100).optional(),
    sale_terms: z.array(attributeSchema).max(30).optional(),
    seller_custom_field: z.string().max(256).optional(),
    catalog_product_id: z
      .string()
      .regex(/^[A-Z]{3}\d+$/)
      .optional(),
    shipping: z
      .object({
        mode: z.enum(['me1', 'me2', 'custom', 'not_specified']).optional(),
        local_pick_up: z.boolean().optional(),
        free_shipping: z.boolean().optional(),
        dimensions: z.string().max(100).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((value) => Boolean(value.title) !== Boolean(value.family_name), {
    message: 'Informe title para Legacy ou family_name para User Products.',
  });
export type ListingInput = z.infer<typeof listingInputSchema>;

function numericId(value: string | number): string {
  const text = String(value);
  if (!/^[1-9]\d{0,24}$/.test(text) || (typeof value === 'number' && !Number.isSafeInteger(value)))
    invalidInput('mercadolivre');
  return text;
}
function itemId(value: string): string {
  if (!/^[A-Z]{3}\d{1,24}$/.test(value)) invalidInput('mercadolivre');
  return value;
}
function pagination(query: URLSearchParams, options: { offset?: number; limit?: number }) {
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue;
    if (
      !Number.isInteger(value) ||
      value < (key === 'limit' ? 1 : 0) ||
      value > (key === 'limit' ? 50 : 100_000)
    )
      invalidInput('mercadolivre');
    query.set(key, String(value));
  }
}

export class MercadoLivreAdapter {
  #config: MercadoLivreConfig;
  #fetcher: Fetcher;
  #timeoutMs: number;
  constructor(config: MercadoLivreConfig, fetcher: Fetcher = fetch) {
    this.#config = { ...config };
    this.#fetcher = fetcher;
    this.#timeoutMs = timeoutValue(config.timeoutMs, 'mercadolivre');
    if (config.redirectUri && httpUrl(config.redirectUri, 'mercadolivre').protocol !== 'https:')
      invalidInput('mercadolivre');
  }
  #oauthConfig() {
    return {
      client_id: requireValue(this.#config.clientId, 'mercadolivre'),
      client_secret: requireValue(this.#config.clientSecret, 'mercadolivre'),
      redirect_uri: requireValue(this.#config.redirectUri, 'mercadolivre'),
    };
  }
  authorizationUrl(state: string, codeChallenge?: string): string {
    const config = this.#oauthConfig();
    if (!state || state.length > 512 || /[\r\n]/.test(state)) invalidInput('mercadolivre');
    const url = new URL('https://auth.mercadolivre.com.br/authorization');
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: config.client_id,
      redirect_uri: config.redirect_uri,
      state,
    }).toString();
    if (codeChallenge !== undefined) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) invalidInput('mercadolivre');
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
    }
    return url.href;
  }
  async #token(fields: Record<string, string>): Promise<OAuthTokens> {
    const config = this.#oauthConfig();
    const body = new URLSearchParams({ ...config, ...fields });
    const result = objectResult(
      await requestJson(
        'mercadolivre',
        this.#fetcher,
        'https://api.mercadolibre.com/oauth/token',
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        },
        this.#timeoutMs,
      ),
      'mercadolivre',
    );
    if (
      typeof result.access_token !== 'string' ||
      !result.access_token ||
      typeof result.refresh_token !== 'string' ||
      !result.refresh_token ||
      typeof result.expires_in !== 'number' ||
      !Number.isInteger(result.expires_in) ||
      result.expires_in <= 0 ||
      typeof result.user_id !== 'number' ||
      !Number.isSafeInteger(result.user_id) ||
      result.user_id <= 0 ||
      typeof result.token_type !== 'string' ||
      typeof result.scope !== 'string'
    ) {
      throw new IntegrationError('invalid_response', 'Resposta OAuth inválida.', 'mercadolivre');
    }
    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiresIn: result.expires_in,
      userId: result.user_id,
      tokenType: result.token_type,
      scope: result.scope,
    };
  }
  async exchangeCode(code: string, codeVerifier?: string): Promise<OAuthTokens> {
    requireValue(code, 'mercadolivre');
    if (
      code.length > 2048 ||
      (codeVerifier !== undefined && !/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier))
    )
      invalidInput('mercadolivre');
    return this.#token({
      grant_type: 'authorization_code',
      code,
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    });
  }
  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    requireValue(refreshToken, 'mercadolivre');
    if (refreshToken.length > 8192) invalidInput('mercadolivre');
    return this.#token({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }
  async #request(
    accessToken: string,
    path: string,
    query = new URLSearchParams(),
    method = 'GET',
    body?: JsonValue,
  ): Promise<JsonValue> {
    requireValue(accessToken, 'mercadolivre');
    const url = new URL(path, 'https://api.mercadolibre.com');
    url.search = query.toString();
    return requestJson(
      'mercadolivre',
      this.#fetcher,
      url,
      {
        method,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${accessToken}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: boundedJson(body, 'mercadolivre') }),
      },
      this.#timeoutMs,
    );
  }
  async getUser(accessToken: string): Promise<JsonObject> {
    return objectResult(await this.#request(accessToken, '/users/me'), 'mercadolivre');
  }
  async listItems(
    accessToken: string,
    sellerId: string | number,
    options: ItemListOptions = {},
  ): Promise<JsonObject> {
    const query = new URLSearchParams();
    pagination(query, { offset: options.offset, limit: options.limit });
    if (options.status !== undefined) {
      if (!['active', 'paused', 'closed'].includes(options.status)) invalidInput('mercadolivre');
      query.set('status', options.status);
    }
    if (options.searchType !== undefined) {
      if (options.searchType !== 'scan') invalidInput('mercadolivre');
      query.set('search_type', options.searchType);
    }
    if (options.scrollId !== undefined) {
      if (!options.scrollId || options.scrollId.length > 4096) invalidInput('mercadolivre');
      query.set('scroll_id', options.scrollId);
    }
    return objectResult(
      await this.#request(accessToken, `/users/${numericId(sellerId)}/items/search`, query),
      'mercadolivre',
    );
  }
  async getItems(accessToken: string, itemIds: string[]): Promise<JsonValue[]> {
    if (!Array.isArray(itemIds) || itemIds.length < 1 || itemIds.length > 20)
      invalidInput('mercadolivre');
    const result = await this.#request(
      accessToken,
      '/items',
      new URLSearchParams({ ids: itemIds.map(itemId).join(',') }),
    );
    if (!Array.isArray(result))
      throw new IntegrationError('invalid_response', 'Resposta multiget inválida.', 'mercadolivre');
    return result;
  }
  async predictCategory(accessToken: string, title: string): Promise<JsonValue[]> {
    requireValue(accessToken, 'mercadolivre');
    const query = title.trim();
    if (query.length < 3 || query.length > 200) invalidInput('mercadolivre');
    const result = await this.#request(
      accessToken,
      '/sites/MLB/domain_discovery/search',
      new URLSearchParams({ q: query, limit: '3' }),
    );
    if (!Array.isArray(result))
      throw new IntegrationError('invalid_response', 'Predição de categoria inválida.', 'mercadolivre');
    return result;
  }
  async getCategoryAttributes(accessToken: string, categoryId: string): Promise<JsonValue[]> {
    if (!/^[A-Z]{3}\d{1,24}$/.test(categoryId)) invalidInput('mercadolivre');
    const result = await this.#request(accessToken, `/categories/${categoryId}/attributes`);
    if (!Array.isArray(result))
      throw new IntegrationError('invalid_response', 'Atributos de categoria inválidos.', 'mercadolivre');
    return result;
  }
  async validateListing(
    accessToken: string,
    sellerId: string | number,
    payload: ListingInput,
  ): Promise<JsonObject> {
    const parsed = listingInputSchema.safeParse(payload);
    if (!parsed.success) invalidInput('mercadolivre');
    return objectResult(
      await this.#request(accessToken, '/items/validate', undefined, 'POST', {
        ...parsed.data,
        seller_id: Number(numericId(sellerId)),
      }),
      'mercadolivre',
    );
  }
  async listOrders(
    accessToken: string,
    sellerId: string | number,
    options: OrderListOptions = {},
  ): Promise<JsonObject> {
    const query = new URLSearchParams({ seller: numericId(sellerId) });
    pagination(query, { offset: options.offset, limit: options.limit });
    if (options.status !== undefined) {
      if (!/^[a-z_,]{1,100}$/.test(options.status)) invalidInput('mercadolivre');
      query.set('order.status', options.status);
    }
    for (const key of ['from', 'to'] as const) {
      const date = options[key];
      if (date !== undefined) {
        if (
          date.length > 40 ||
          !/^\d{4}-\d{2}-\d{2}T/.test(date) ||
          !Number.isFinite(Date.parse(date))
        )
          invalidInput('mercadolivre');
        query.set(`order.date_created.${key}`, date);
      }
    }
    return objectResult(await this.#request(accessToken, '/orders/search', query), 'mercadolivre');
  }
  async getOrder(accessToken: string, orderId: string | number): Promise<JsonObject> {
    return objectResult(
      await this.#request(accessToken, `/orders/${numericId(orderId)}`),
      'mercadolivre',
    );
  }
  async getShipment(accessToken: string, shipmentId: string | number): Promise<JsonObject> {
    return objectResult(
      await this.#request(accessToken, `/shipments/${numericId(shipmentId)}`),
      'mercadolivre',
    );
  }
  async searchComparables(
    accessToken: string,
    options: { query: string; siteId?: string },
  ): Promise<JsonObject> {
    requireValue(accessToken, 'mercadolivre');
    if (!options.query?.trim() || options.query.length > 200) invalidInput('mercadolivre');
    // Marketplace-wide search access was not confirmed for the registered application.
    throw new IntegrationError(
      'capability_unavailable',
      'Pesquisa de comparáveis depende de acesso oficial confirmado.',
      'mercadolivre',
    );
  }
  async createListing(accessToken: string, payload: ListingInput): Promise<JsonObject> {
    const parsed = listingInputSchema.safeParse(payload);
    if (!parsed.success) invalidInput('mercadolivre');
    return objectResult(
      await this.#request(accessToken, '/items', undefined, 'POST', parsed.data),
      'mercadolivre',
    );
  }
  async createDescription(accessToken: string, id: string, plainText: string): Promise<JsonObject> {
    if (!plainText.trim() || plainText.length > 5000) invalidInput('mercadolivre');
    return objectResult(
      await this.#request(accessToken, `/items/${itemId(id)}/description`, undefined, 'POST', {
        plain_text: plainText,
      }),
      'mercadolivre',
    );
  }
  async updatePrice(accessToken: string, id: string, price: number): Promise<JsonObject> {
    if (!Number.isFinite(price) || price <= 0 || price > 1_000_000_000)
      invalidInput('mercadolivre');
    const result = objectResult(
      await this.#request(accessToken, `/items/${itemId(id)}`, undefined, 'PUT', { price }),
      'mercadolivre',
    );
    if (result.price !== price)
      throw new IntegrationError(
        'upstream_rejected',
        'O serviço não confirmou o preço solicitado; verifique a automatização e ofertas do anúncio.',
        'mercadolivre',
      );
    return result;
  }
  async updateStock(accessToken: string, id: string, quantity: number): Promise<JsonObject> {
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1_000_000)
      invalidInput('mercadolivre');
    return objectResult(
      await this.#request(accessToken, `/items/${itemId(id)}`, undefined, 'PUT', {
        available_quantity: quantity,
      }),
      'mercadolivre',
    );
  }
}
