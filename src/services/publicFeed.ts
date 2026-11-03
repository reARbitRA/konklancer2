/** Fetch the published scanner feed; this does not trigger a scan. */
export const PUBLIC_FEED_URL = 'https://raw.githubusercontent.com/reARbitRA/konklancer2/main/scanner/cloud-feed.jsonl';
export const GITHUB_API_FEED_URL = 'https://api.github.com/repos/reARbitRA/konklancer2/contents/scanner/cloud-feed.jsonl?ref=main';
export async function fetchPublishedFeed(fetchImpl: typeof fetch = fetch): Promise<string> {
  const errors: string[] = [];
  for (const url of [PUBLIC_FEED_URL, GITHUB_API_FEED_URL]) {
    try {
      const response = await fetchImpl(url, {
        ...(url === GITHUB_API_FEED_URL ? {headers: {Accept: 'application/vnd.github.raw+json'}} : {}),
        cache: 'no-cache', signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) { errors.push(`HTTP ${response.status}`); continue; }
      const length = Number(response.headers.get('content-length') || 0);
      if (length > 5_000_000) throw new Error('Published feed is too large.');
      const raw = await response.text();
      if (raw.length > 5_000_000 || !raw.trim()) throw new Error('Published feed is empty or too large.');
      return raw;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'network error');
    }
  }
  throw new Error(`Published feed unavailable (${errors.join('; ')}).`);
}
