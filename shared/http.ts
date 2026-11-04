/** Bounded requests. Only replay safe reads unless the caller explicitly opts in. */
function requestSignal(timeout: number, external?: AbortSignal | null): AbortSignal {
  if (typeof AbortSignal.timeout === 'function' && (!external || typeof AbortSignal.any === 'function')) {
    const deadline = AbortSignal.timeout(timeout);
    return external ? AbortSignal.any([external, deadline]) : deadline;
  }
  // Older Android WebViews have AbortController but not timeout()/any(). Keep
  // the deadline alive for body consumption, not just until response headers.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeout);
  if (typeof timer === 'object' && 'unref' in timer) timer.unref();
  const cancel = () => controller.abort(external?.reason);
  controller.signal.addEventListener('abort', () => {
    clearTimeout(timer);
    external?.removeEventListener('abort', cancel);
  }, { once: true });
  if (external?.aborted) cancel();
  else external?.addEventListener('abort', cancel, { once: true });
  return controller.signal;
}

export async function boundedFetch(
  input: string | URL | Request,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
  options: { timeoutMs?: number; attempts?: number; retrySafe?: boolean; sleep?: (ms: number) => Promise<void> } = {},
): Promise<Response> {
  const timeout = Math.min(60_000, Math.max(1, options.timeoutMs ?? 15_000));
  const safe = options.retrySafe ?? ['GET', 'HEAD'].includes((init.method ?? 'GET').toUpperCase());
  const attempts = safe ? Math.min(3, Math.max(1, options.attempts ?? 3)) : 1;
  const sleep = options.sleep ?? ((ms) => new Promise(resolve => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt++) {
    const signal = requestSignal(timeout, init.signal);
    try {
      const response = await fetchImpl(input, { ...init, signal });
      if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt + 1 >= attempts) return response;
      const raw = response.headers?.get?.('retry-after');
      const seconds = raw ? Number(raw) : NaN;
      const delay = raw ? (Number.isFinite(seconds) ? seconds * 1000 : Date.parse(raw) - Date.now()) : NaN;
      // Do not retry earlier than an upstream's long Retry-After.
      if (Number.isFinite(delay) && delay > 5000) return response;
      await response.body?.cancel();
      console.warn(`[http] transient HTTP ${response.status}; retry ${attempt + 1}`);
      await sleep(Math.max(250 * 2 ** attempt, Number.isFinite(delay) ? delay : 0));
    } catch (error) {
      if (init.signal?.aborted || attempt + 1 >= attempts) throw error;
      console.warn(`[http] transport failure; retry ${attempt + 1}`);
      await sleep(250 * 2 ** attempt);
    }
  }
}
