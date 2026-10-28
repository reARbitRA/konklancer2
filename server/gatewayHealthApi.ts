import { gatewayTokensMatch } from './gatewayApi';
import { readLLMConfig, type LLMConfig } from './llm';

const HEALTH_TIMEOUT_MS = 5_000;

type GatewayStatus = 'not-configured' | 'unauthorized' | 'no-capacity' | 'unavailable' | 'ready';

export interface GatewayHealthApiOptions {
  env?: Record<string, string | undefined>;
  config?: LLMConfig | null;
  fetchImpl?: typeof fetch;
}

export interface GatewayHealthApiResult {
  status: number;
  body: Record<string, unknown>;
}

function readHeader(req: any, name: string): string | undefined {
  const headers = req?.headers;
  if (!headers || typeof headers !== 'object') return undefined;
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (typeof value === 'string') return value;
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : undefined;
}

function healthBody(status: GatewayStatus, configured: boolean, authenticated: boolean, ready: boolean) {
  return {
    success: true,
    gateway: {
      configured,
      authenticated,
      ready,
      endpoint: '/v1/chat/completions',
      status,
    },
    pageRelay: { provider: 'Supabase Edge Function', purpose: 'HTML page fetching only; no LLM requests.' },
  };
}

function failed(status: GatewayStatus, configured: boolean, authenticated: boolean): GatewayHealthApiResult {
  return { status: 200, body: healthBody(status, configured, authenticated, false) };
}

/**
 * Check the app-token boundary, then probe the gateway's authenticated model
 * registry. This is a no-inference health check: it verifies caller auth and
 * that the gateway currently advertises at least one available model.
 */
export async function executeGatewayHealthApiRequest(
  req: any,
  options: GatewayHealthApiOptions = {},
): Promise<GatewayHealthApiResult> {
  const env = options.env ?? process.env;
  const relayToken = (env.KONKLANCER_RELAY_TOKEN || env.KONKLANCER_API_TOKEN || '').trim();
  if (relayToken.length < 8) {
    return {
      status: 503,
      body: {
        success: false,
        code: 'RELAY_NOT_CONFIGURED',
        error: 'The app relay token is not configured on this server.',
        gateway: { configured: false, authenticated: false, ready: false, status: 'not-configured', endpoint: '/v1/chat/completions' },
      },
    };
  }
  if (!gatewayTokensMatch(readHeader(req, 'x-api-token'), relayToken)) {
    return {
      status: 401,
      body: {
        success: false,
        code: 'INVALID_RELAY_TOKEN',
        error: 'Invalid or missing relay token.',
        gateway: { configured: false, authenticated: false, ready: false, status: 'invalid-relay-token', endpoint: '/v1/chat/completions' },
      },
    };
  }

  const config = options.config === undefined ? readLLMConfig(env as NodeJS.ProcessEnv) : options.config;
  if (!config) return { status: 200, body: healthBody('not-configured', false, false, false) };

  try {
    const response = await (options.fetchImpl ?? fetch)(`${config.gatewayUrl.replace(/\/+$/, '')}/api/models`, {
      method: 'GET',
      headers: { authorization: `Bearer ${config.apiKey}`, accept: 'application/json' },
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    if (response.status === 401 || response.status === 403) return failed('unauthorized', true, false);
    if (!response.ok) return failed('unavailable', true, false);

    let payload: any;
    try {
      payload = await response.json();
    } catch {
      return failed('unavailable', true, true);
    }
    const models = payload?.data?.models;
    if (!Array.isArray(models)) return failed('unavailable', true, true);
    const ready = models.some((model: any) => model?.available === true);
    return ready
      ? { status: 200, body: healthBody('ready', true, true, true) }
      : failed('no-capacity', true, true);
  } catch {
    return failed('unavailable', true, false);
  }
}
