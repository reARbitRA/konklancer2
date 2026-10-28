/**
 * Public configuration for the existing relay backend.
 *
 * The Supabase anon key is intentionally public. The Edge Function is only used
 * for HTML page fetching; LLM calls go through the Vercel adapter to Konkred.
 * Both paths require the app relay token, which is distinct from KONKRED_API_KEY.
 */
export const SUPABASE_PROJECT_URL = 'https://rwuyuhjkitcnekpwmoml.supabase.co';
export const SUPABASE_RELAY_URL = `${SUPABASE_PROJECT_URL}/functions/v1/konklancer-relay`;
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3dXl1aGpraXRjbmVrcHdtb21sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNTgwMzYsImV4cCI6MjEwNzkzNDAzNn0.KnWmpopGmuhdeQ5x6sOUfa7pBqeqN57oJhzBSlkuzzs';
export const VERCEL_RELAY_URL = 'https://konklancer2.vercel.app/api/llm/relay';
