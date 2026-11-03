import type { Socket } from 'socket.io';
import { timingSafeEqualStrings } from './apiAuth';
import { verifySupabaseJwt } from './supabaseJwt';

/** Apply the same service-token or verified Supabase JWT rule as HTTP API routes. */
export function createSocketAuthGuard(expected: string | null) {
  return (socket: Socket, next: (error?: Error) => void) => {
    if (!expected) return next();
    const auth = socket.handshake.auth || {};
    if (typeof auth.apiToken === 'string' && timingSafeEqualStrings(auth.apiToken, expected)) return next();
    if (typeof auth.jwt === 'string' && verifySupabaseJwt(auth.jwt).ok) return next();
    return next(new Error('Unauthorized'));
  };
}
