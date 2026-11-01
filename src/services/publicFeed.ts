/** Read the published, public scanner feed. This does not start a new scan. */
export const PUBLIC_FEED_URL = 'https://api.github.com/repos/reARbitRA/konklancer2/contents/scanner/cloud-feed.jsonl?ref=main';
export async function fetchPublishedFeed(fetchImpl: typeof fetch = fetch): Promise<string> {
  const response = await fetchImpl(PUBLIC_FEED_URL, { headers: { Accept: 'application/vnd.github.raw+json' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > 5_000_000) throw new Error('Published feed is too large.');
  const raw = await response.text();
  if (raw.length > 5_000_000 || !raw.trim()) throw new Error('Published feed is empty or too large.');
  return raw;
}
