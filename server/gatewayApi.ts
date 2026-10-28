import { timingSafeEqual } from 'node:crypto';
import { callLLM, LLMError, readLLMConfig, type LLMConfig, type LLMRequest, type TaskType } from './llm';

const MAX_PROMPT_LENGTH = 1_000_000;
const MAX_SYSTEM_LENGTH = 100_000;
const TASK_TYPES = new Set<TaskType>(['extraction', 'summarization', 'general', 'code-generation']);

export interface GatewayApiOptions {
  env?: Record<string, string | undefined>;
  config?: LLMConfig | null;
  fetchImpl?: typeof fetch;
}

export interface GatewayApiResult {
  status: number;
  body: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function gatewayTokensMatch(provided: string | null | undefined, expected: string | null | undefined): boolean {
  const actual = typeof provided === 'string' ? provided.trim() : '';
  const secret = typeof expected === 'string' ? expected.trim() : '';
  if (secret.length < 8 || actual.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(actual, 'utf8'), Buffer.from(secret, 'utf8'));
}

function parsePayload(value: unknown): { ok: true; request: LLMRequest } | { ok: false; result: GatewayApiResult } {
  if (!isRecord(value)) {
    return { ok: false, result: { status: 400, body: { success: false, aiAvailable: false, code: 'INVALID_REQUEST', error: 'A JSON object is required.' } } };
  }

  if ('target_url' in value || 'targetUrl' in value || 'req_headers' in value || 'req_body' in value) {
    return {
      ok: false,
      result: {
        status: 400,
        body: { success: false, aiAvailable: false, code: 'PROVIDER_RELAY_DISABLED', error: 'LLM requests must use the Konkred gateway contract.' },
      },
    };
  }
  if ('prompt' in value || ['apiKey', 'customLLM', 'endpoint', 'model', 'provider', 'selectedModel'].some((key) => key in value)) {
    return {
      ok: false,
      result: {
        status: 400,
        body: { success: false, aiAvailable: false, code: 'PROVIDER_SELECTION_DISABLED', error: 'Use the gateway task contract; provider credentials and model selection are not accepted.' },
      },
    };
  }

  const taskType = typeof value.taskType === 'string' ? value.taskType : 'general';
  const user = typeof value.user === 'string' ? value.user : '';
  const system = typeof value.system === 'string' ? value.system : undefined;
  if (!TASK_TYPES.has(taskType as TaskType)) {
    return { ok: false, result: { status: 400, body: { success: false, aiAvailable: false, code: 'INVALID_TASK_TYPE', error: 'Unsupported taskType.' } } };
  }
  if (!user.trim() || user.length > MAX_PROMPT_LENGTH) {
    return { ok: false, result: { status: user.length > MAX_PROMPT_LENGTH ? 413 : 400, body: { success: false, aiAvailable: false, code: 'INVALID_USER_MESSAGE', error: 'user must be non-empty and no larger than 1 MB.' } } };
  }
  if (system && system.length > MAX_SYSTEM_LENGTH) {
    return { ok: false, result: { status: 413, body: { success: false, aiAvailable: false, code: 'INVALID_SYSTEM_PROMPT', error: 'system prompt is too large.' } } };
  }
  if (value.json !== undefined && typeof value.json !== 'boolean') {
    return { ok: false, result: { status: 400, body: { success: false, aiAvailable: false, code: 'INVALID_JSON_MODE', error: 'json must be a boolean.' } } };
  }
  if (value.temperature !== undefined && (typeof value.temperature !== 'number' || !Number.isFinite(value.temperature) || value.temperature < 0 || value.temperature > 2)) {
    return { ok: false, result: { status: 400, body: { success: false, aiAvailable: false, code: 'INVALID_TEMPERATURE', error: 'temperature must be between 0 and 2.' } } };
  }
  if (value.maxTokens !== undefined && (typeof value.maxTokens !== 'number' || !Number.isInteger(value.maxTokens) || value.maxTokens < 1 || value.maxTokens > 100_000)) {
    return { ok: false, result: { status: 400, body: { success: false, aiAvailable: false, code: 'INVALID_MAX_TOKENS', error: 'maxTokens must be an integer between 1 and 100000.' } } };
  }
  if (value.privacy !== undefined && value.privacy !== 'any' && value.privacy !== 'strict') {
    return { ok: false, result: { status: 400, body: { success: false, aiAvailable: false, code: 'INVALID_PRIVACY', error: 'privacy must be any or strict.' } } };
  }
  if (value.cacheKey !== undefined && (typeof value.cacheKey !== 'string' || value.cacheKey.length > 256)) {
    return { ok: false, result: { status: 400, body: { success: false, aiAvailable: false, code: 'INVALID_CACHE_KEY', error: 'cacheKey must be a string no longer than 256 characters.' } } };
  }

  return {
    ok: true,
    request: {
      taskType: taskType as TaskType,
      user,
      ...(system ? { system } : {}),
      ...(typeof value.json === 'boolean' ? { json: value.json } : {}),
      ...(typeof value.temperature === 'number' ? { temperature: value.temperature } : {}),
      ...(typeof value.maxTokens === 'number' ? { maxTokens: value.maxTokens } : {}),
      ...(typeof value.cacheKey === 'string' ? { cacheKey: value.cacheKey } : {}),
      ...(value.privacy === 'any' || value.privacy === 'strict' ? { privacy: value.privacy } : {}),
    },
  };
}

function readHeader(req: any, name: string): string | undefined {
  const headers = req?.headers;
  if (!headers || typeof headers !== 'object') return undefined;
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (typeof value === 'string') return value;
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : undefined;
}

function readRequestBody(req: any): unknown {
  if (typeof req?.body !== 'string') return req?.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return undefined;
  }
}

export async function executeGatewayApiRequest(
  req: any,
  options: GatewayApiOptions = {},
): Promise<GatewayApiResult> {
  const env = options.env ?? process.env;
  const expectedToken = (env.KONKLANCER_RELAY_TOKEN || env.KONKLANCER_API_TOKEN || '').trim();
  if (expectedToken.length < 8) {
    return {
      status: 503,
      body: { success: false, aiAvailable: false, code: 'RELAY_NOT_CONFIGURED', error: 'KONKLANCER_RELAY_TOKEN is not configured on this server.' },
    };
  }
  if (!gatewayTokensMatch(readHeader(req, 'x-api-token'), expectedToken)) {
    return { status: 401, body: { success: false, aiAvailable: false, code: 'INVALID_RELAY_TOKEN', error: 'Invalid or missing relay token.' } };
  }

  const parsed = parsePayload(readRequestBody(req));
  if (!parsed.ok) return parsed.result;

  const config = options.config === undefined ? readLLMConfig(env as NodeJS.ProcessEnv) : options.config;
  if (!config) {
    return {
      status: 503,
      body: { success: false, aiAvailable: false, code: 'AI_NOT_CONFIGURED', error: 'Konkred gateway credentials are not configured on this server.' },
    };
  }

  try {
    const result = await callLLM(parsed.request, config, options.fetchImpl ?? fetch);
    return {
      status: 200,
      body: {
        success: true,
        aiAvailable: true,
        text: result.text,
        model: result.model,
        provider: result.provider || 'gateway',
        cached: result.cached,
        attempts: result.attempts,
      },
    };
  } catch (error: any) {
    if (error instanceof LLMError) {
      return {
        status: error.status,
        body: {
          success: false,
          aiAvailable: false,
          code: error.code,
          error: error.message,
          ...(error.retryAfterSeconds !== undefined ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
        },
      };
    }
    return { status: 500, body: { success: false, aiAvailable: false, code: 'AI_UPSTREAM', error: 'Gateway request failed.' } };
  }
}
