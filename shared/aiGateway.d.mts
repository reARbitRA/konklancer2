// Types for shared/aiGateway.mjs (SPEC-013)
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface GatewayModel {
  provider: string; id: string; name: string;
  priceCategory: 'free' | 'unknown' | 'paid'; freeTier: boolean;
  capabilities: string[]; context?: number; paramsB: number | null;
  chat: boolean; image: boolean; source?: 'live' | 'curated';
}
export interface GenerateOptions {
  env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch;
  task?: string; prompt: string; system?: string; json?: boolean;
  provider?: string; model?: string; strict?: boolean;
  freeOnly?: boolean; temperature?: number; maxTokens?: number;
  budgetMs?: number; maxAttempts?: number; candidateLimit?: number;
}
export interface GenerateResult {
  text: string; provider: string; model: string;
  attempts: Array<{ provider: string; model: string; keyIndex: number; status?: number; error: string }>;
  latencyMs: number; task: string;
}
export declare function handleAiHttp(
  req: IncomingMessage & { body?: unknown; url?: string },
  res: ServerResponse,
  opts?: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; compat?: boolean; limiter?: (ip: string) => boolean },
): Promise<void>;
export declare function generateText(opts: GenerateOptions): Promise<GenerateResult>;
export declare function listAllModels(opts?: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; force?: boolean }): Promise<{ providers: Array<{ provider: string; label: string; tier: string; configured: boolean; models: GatewayModel[]; error?: string }>; generatedAt: string }>;
export declare function gatewayHealth(env?: NodeJS.ProcessEnv): { ok: boolean; authMode: string; configuredCount: number; providers: Array<{ provider: string; label: string; tier: string; configured: boolean; keyCount: number }> };
export declare function buildCandidates(catalog: unknown, opts?: { task?: string; freeOnly?: boolean; limit?: number }): GatewayModel[];
export declare function classifyModel(provider: Record<string, unknown>, raw?: Record<string, unknown> | string): GatewayModel | null;
export declare function collectKeys(provider: Record<string, unknown>, env?: NodeJS.ProcessEnv): string[];
export declare function capabilitiesFor(id?: string, raw?: Record<string, unknown>): string[];
export declare function parameterBillions(id?: string): number | null;
export declare function generateImage(opts: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; prompt: string; size?: string }): Promise<{ provider: string; model: string; url?: string; dataUrl?: string; attempts: unknown[] }>;
export declare function createRateLimiter(opts?: { windowMs?: number; max?: number }): (ip: string) => boolean;
export declare function clearModelCache(): void;
export declare function checkOwner(headers?: Record<string, unknown>, env?: NodeJS.ProcessEnv): { ok: boolean; mode: 'open' | 'token'; authenticated: boolean };
export declare class GatewayError extends Error { code: string; status: number; attempts: unknown[]; }
export declare const PROVIDERS: Array<Record<string, unknown>>;
export declare const PROVIDER_MAP: Record<string, Record<string, unknown>>;
export declare const TASK_PROFILES: Record<string, { temperature: number; maxTokens: number; caps: string[]; timeoutMs: number }>;
