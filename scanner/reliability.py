"""Canonical listing identity and bounded, safe HTTP reads."""
import logging
import math
import re
import time
from urllib.parse import urlsplit, urlunsplit, unquote, quote, parse_qsl, urlencode
import httpx

log = logging.getLogger(__name__)


def canonical_url(raw: str) -> str:
    if not isinstance(raw, str):
        raise ValueError('invalid listing URL')
    p = urlsplit(raw.strip())
    if p.scheme not in ('http', 'https') or not p.hostname or p.username or p.password:
        raise ValueError('invalid listing URL')
    host = p.hostname.lower().removeprefix('www.')
    port = p.port
    authority = host + (f':{port}' if port and port not in (80, 443) else '')
    path = quote(unquote(p.path), safe='/-._~').rstrip('/') or '/'
    if host in ('parscoders.com', 'ponisha.ir'):
        match = re.match(r'^/project/(\d+)(?:/|$)', path)
        if match:
            path = '/project/' + match.group(1)
    query = urlencode(sorted((k, v) for k, v in parse_qsl(p.query) if not k.lower().startswith('utm_') and k.lower() not in ('fbclid', 'gclid', 'ref')))
    return urlunsplit(('https', authority, path, query, ''))


def clean_bids(raw: str) -> str:
    if not isinstance(raw, (str, int)):
        return ''
    text = str(raw or '').translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')).strip()
    if re.fullmatch(r'\d+', text):
        return text
    match = re.search(r'(\d+)\s*(?:پیشنهاد(?:ها)?|bids?\b|proposals?\b)|(?:پیشنهاد(?:ها)?|bids?\b|proposals?\b)\s*[:：]?\s*(\d+)', text, re.I)
    if match:
        return f'{match.group(1) or match.group(2)} پیشنهاد'
    return '0 پیشنهاد' if re.search(r'بدون\s*پیشنهاد|no\s+bids', text, re.I) else ''


def clean_budget(raw: str) -> str:
    text = str(raw or '').strip()
    match = re.search(r'(?:حداکثر\s*)?(?:بودجه\s*[:：]?\s*)?[\d۰-۹٠-٩,،٬.٫]+\s*(?:میلیارد|میلیون|هزار)?(?:\s*(?:تا|-|–)\s*[\d۰-۹٠-٩,،٬.٫]+\s*(?:میلیارد|میلیون|هزار)?)?\s*(?:تومان|ریال)', text)
    if match:
        return match.group(0)
    return 'توافقی' if 'توافقی' in text else ''


def clean_posted(raw: str) -> str:
    text = str(raw or '').strip()
    if re.fullmatch(r'\d{4}-\d{2}-\d{2}T[0-9:.+Z-]+', text):
        from datetime import datetime
        try:
            datetime.fromisoformat(text.replace('Z', '+00:00'))
            return text
        except ValueError:
            return ''
    match = re.search(r'(?:[\d۰-۹٠-٩]+|یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده|دوازده|پانزده|بیست|سی)(?:\s+و\s+\S+)?\s*(?:دقیقه|ساعت|روز|هفته|ماه|سال)\s*پیش|\b(?:\d+|one|two|three)\s+(?:minutes?|hours?|days?)\s+ago\b', text, re.I)
    return match.group(0) if match else ''


def clean_row(row: dict) -> dict:
    row = dict(row)
    if not isinstance(row.get('title'), str) or not row['title'].strip():
        raise ValueError('missing listing title')
    row['url'] = canonical_url(row['url'])
    row['bids_text'] = clean_bids(row.get('bids_text', ''))
    row['budget_text'] = clean_budget(row.get('budget_text', ''))
    row['posted_text'] = clean_posted(row.get('posted_text', ''))
    for field in ('budget_text', 'posted_text', 'summary'):
        if not isinstance(row.get(field, ''), str):
            row[field] = ''
    return row


def request(client, method, url, *, sleep=time.sleep, **kwargs):
    timeout = float(kwargs.pop('timeout', 20))
    if not math.isfinite(timeout) or not 0 < timeout <= 60:
        raise ValueError('HTTP timeout must be between 0 and 60 seconds')
    retry_safe = kwargs.pop('retry_safe', False)
    safe = method.upper() in ('GET', 'HEAD') or retry_safe
    for attempt in range(3 if safe else 1):
        try:
            response = client.request(method, url, timeout=timeout, **kwargs)
            if response.status_code not in (408, 429, 500, 502, 503, 504) or not safe or attempt == 2:
                return response
            raw = response.headers.get('retry-after', '')
            try:
                delay = float(raw)
            except ValueError:
                from email.utils import parsedate_to_datetime
                try:
                    delay = parsedate_to_datetime(raw).timestamp() - time.time() if raw else 0
                except (ValueError, TypeError):
                    delay = 0
            if delay > 5:
                return response
            response.close()
            log.warning('transient HTTP %s; retry %s', response.status_code, attempt + 1)
        except httpx.TransportError:
            if not safe or attempt == 2:
                raise
            delay = 0
            log.warning('HTTP transport failure; retry %s', attempt + 1)
        sleep(max(0.25 * 2 ** attempt, delay))
