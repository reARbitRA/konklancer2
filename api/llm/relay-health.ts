import { executeGatewayHealthApiRequest, type GatewayHealthApiOptions } from '../../server/gatewayHealthApi';
import { resolveRelayCorsOrigin } from './relay';

export const config = { maxDuration: 10 };

function readOrigin(req: any): string | undefined {
  const origin = req?.headers?.origin ?? req?.headers?.Origin;
  return typeof origin === 'string' ? origin : undefined;
}

export async function handleGatewayHealthRequest(
  req: any,
  res: any,
  options?: GatewayHealthApiOptions,
): Promise<void> {
  const origin = readOrigin(req);
  const allowedOrigin = resolveRelayCorsOrigin(origin);

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-api-token');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (allowedOrigin) res.setHeader('Access-Control-Allow-Origin', allowedOrigin);

  if (origin && allowedOrigin === undefined) {
    res.status(403).json({ success: false, code: 'ORIGIN_NOT_ALLOWED', error: 'Origin not allowed.' });
    return;
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed — GET only.' });
    return;
  }

  const result = await executeGatewayHealthApiRequest(req, options);
  res.status(result.status).json(result.body);
}

export default async function handler(req: any, res: any): Promise<void> {
  return handleGatewayHealthRequest(req, res);
}
