export function canonicalUrl(raw: string): string {
  const u = new URL(raw);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('Invalid listing URL');
  u.protocol = 'https:';
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
  u.hash = '';
  u.pathname = u.pathname.split('/').map(p => encodeURIComponent(decodeURIComponent(p))).join('/').replace(/\/+$/, '') || '/';
  if (['ponisha.ir', 'parscoders.com'].includes(u.hostname)) {
    const match = u.pathname.match(/^\/project\/(\d+)(?:\/|$)/);
    if (match) u.pathname = `/project/${match[1]}`;
  }
  for (const key of [...u.searchParams.keys()]) if (/^utm_/i.test(key) || /^(fbclid|gclid|ref)$/i.test(key)) u.searchParams.delete(key);
  u.searchParams.sort();
  return u.toString();
}

export function cleanBids(raw: unknown = ''): string {
  const value = typeof raw === 'string' ? raw : typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? String(raw) : '';
  const text = value.replace(/[۰-۹٠-٩]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.includes(d) ? '۰۱۲۳۴۵۶۷۸۹'.indexOf(d) : '٠١٢٣٤٥٦٧٨٩'.indexOf(d))).trim();
  if (/^\d+$/.test(text)) return text;
  const m = text.match(/(\d+)\s*(?:پیشنهاد(?:ها)?|bids?\b|proposals?\b)|(?:پیشنهاد(?:ها)?|bids?\b|proposals?\b)\s*[:：]?\s*(\d+)/i);
  return m ? `${m[1] || m[2]} پیشنهاد` : /بدون\s*پیشنهاد|no\s+bids/i.test(text) ? '0 پیشنهاد' : '';
}
