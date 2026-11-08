import {
  IntegrationError,
  objectResult,
  requestJson,
  requireValue,
  timeoutValue,
  type Fetcher,
} from './http.js';

export interface CJDropshippingConfig {
  apiKey?: string;
  timeoutMs?: number;
}

export interface CJTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiryDate: string;
  refreshTokenExpiryDate: string;
}

/**
 * Minimal CJ API v2 credential exchange. Tokens intentionally stay backend-only;
 * catalogue retrieval is added only after a successful live connection.
 */
export class CJDropshippingAdapter {
  #config: CJDropshippingConfig;
  #fetcher: Fetcher;
  #timeoutMs: number;

  constructor(config: CJDropshippingConfig, fetcher: Fetcher = fetch) {
    this.#config = { ...config };
    this.#fetcher = fetcher;
    this.#timeoutMs = timeoutValue(config.timeoutMs, 'cjdropshipping');
  }

  async getAccessToken(): Promise<CJTokens> {
    const apiKey = requireValue(this.#config.apiKey, 'cjdropshipping');
    const result = objectResult(
      await requestJson(
        'cjdropshipping',
        this.#fetcher,
        'https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken',
        {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify({ apiKey }),
        },
        this.#timeoutMs,
      ),
      'cjdropshipping',
    );
    const data = result.data && typeof result.data === 'object' && !Array.isArray(result.data)
      ? result.data
      : undefined;
    if (
      result.code !== 200 ||
      result.result !== true ||
      !data ||
      typeof data.accessToken !== 'string' ||
      !data.accessToken ||
      typeof data.refreshToken !== 'string' ||
      !data.refreshToken ||
      typeof data.accessTokenExpiryDate !== 'string' ||
      typeof data.refreshTokenExpiryDate !== 'string'
    ) {
      const upstreamCode =
        typeof result.code === 'number' && Number.isSafeInteger(result.code)
          ? String(result.code)
          : undefined;
      throw new IntegrationError(
        'upstream_rejected',
        upstreamCode
          ? `A CJ recusou ou retornou uma credencial inválida (código ${upstreamCode}).`
          : 'A CJ recusou ou retornou uma credencial inválida.',
        'cjdropshipping',
        { upstreamCode },
      );
    }
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      accessTokenExpiryDate: data.accessTokenExpiryDate,
      refreshTokenExpiryDate: data.refreshTokenExpiryDate,
    };
  }
}
