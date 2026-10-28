import { executeGatewayApiRequest, type GatewayApiOptions } from '../../server/gatewayApi';

// Allow room for ordinary gateway failover without introducing client retries.
export const config = { maxDuration: 60 };

const STATIC_ORIGINS = new Set([
  'https://konklancer2.vercel.app',
  'https://www.konkred.xyz',
  'https://konkred.xyz',
  'https://localhost',
  'http://localhost',
  'http://localhost:3000',
  'http://localhost:24678',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:24678',
  'capacitor://localhost',
]);

export function resolveRelayCorsOrigin(origin: string | undefined): string | null | undefined {
  if (!origin) return null;
  if (origin === 'null' || STATIC_ORIGINS.has(origin)) return origin;

  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol === 'https:' && hostname.endsWith('.e2b.app')) return origin;
    if (
      parsed.protocol === 'https:' &&
      hostname.endsWith('.vercel.app') &&
      (hostname === 'konklancer2.vercel.app' || hostname.startsWith('konklancer2-'))
    ) {
      return origin;
    }
  } catch {
    // Invalid origins are rejected by the caller.
  }
  return undefined;
}

function readOrigin(req: any): string | undefined {
  const origin = req?.headers?.origin ?? req?.headers?.Origin;
  return typeof origin === 'string' ? origin : undefined;
}

export async function handleGatewayApiRequest(
  req: any,
  res: any,
  options?: GatewayApiOptions,
): Promise<void> {
  const origin = readOrigin(req);
  const allowedOrigin = resolveRelayCorsOrigin(origin);

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-api-token');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (allowedOrigin) res.setHeader('Access-Control-Allow-Origin', allowedOrigin);

  if (origin && allowedOrigin === undefined) {
    res.status(403).json({ success: false, aiAvailable: false, code: 'ORIGIN_NOT_ALLOWED', error: 'Origin not allowed.' });
    return;
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, aiAvailable: false, code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed — POST only.' });
    return;
  }

  const result = await executeGatewayApiRequest(req, options);
  res.status(result.status).json(result.body);
}

export default async function handler(req: any, res: any): Promise<void> {
  return handleGatewayApiRequest(req, res);
}
