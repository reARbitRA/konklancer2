import json
import httpx
import pytest
from scanner.reliability import canonical_url, clean_bids, clean_row, request
from scanner.konklancer_scan import Project, append_projects, make_client, RobotsCache, RateLimiter, fetch_html
from scanner.deep_cloud_sync import parse_web_platform_html
from scanner.taxonomy import is_high_intent_lead


@pytest.mark.parametrize('text,expected', [('۳ ساعت پیش', ''), ('three hours ago', ''), ('۳ ساعت پیش با ۴ پیشنهاد', '4 پیشنهاد'), ('پیشنهادها: ۱۲', '12 پیشنهاد'), ('بدون پیشنهاد', '0 پیشنهاد'), ('budget 9000', ''), ('5 bids', '5 پیشنهاد')])
def test_strict_bids(text, expected):
    assert clean_bids(text) == expected


@pytest.mark.parametrize('source,base,url', [('karlancer', 'https://www.karlancer.com', '/projects/order-bot'), ('ponisha', 'https://ponisha.ir', '/project/123/name'), ('parscoders', 'https://parscoders.com', '/project/123/name')])
def test_web_fields_do_not_mix(source, base, url):
    html = f'<article><a href="{url}"><h3>ساخت ربات نرم افزاری ثبت سفارش</h3></a><p>۳ ساعت پیش بودجه ۲,۰۰۰,۰۰۰ تومان ۴ پیشنهاد</p></article>'
    row = parse_web_platform_html(html, source, base)[0]
    assert row['bids_text'] == '۴ پیشنهاد'
    assert row['posted_text'] == '۳ ساعت پیش'
    assert '۲,۰۰۰,۰۰۰' in row['budget_text']
    assert 'ساخت ربات' in row['title']


def test_canonical_urls_and_nontracking_query():
    assert canonical_url('http://www.parscoders.com/project/123/old/?utm_source=x#top') == 'https://parscoders.com/project/123'
    assert canonical_url('https://parscoders.com/project/123/new') == 'https://parscoders.com/project/123'
    assert canonical_url('https://example.test/job/?id=2&utm_medium=x') == 'https://example.test/job?id=2'
    with pytest.raises(ValueError):
        canonical_url('javascript:alert(1)')


def test_dedupe_historical_ids_and_same_batch(tmp_path):
    path = tmp_path / 'feed.jsonl'
    path.write_text(json.dumps({'id': 'old', 'title': 'Old', 'url': 'http://www.parscoders.com/project/123/title?utm_source=x', 'bids_text': '۳ ساعت پیش'}) + '\n{bad\n')
    p = Project(id='new', source='parscoders', title='New listing', url='https://parscoders.com/project/123/new')
    assert append_projects(path, [p, p]) == 0
    rows = [json.loads(x) for x in path.read_text().splitlines()]
    assert len(rows) == 1
    assert rows[0]['url'] == 'https://parscoders.com/project/123'
    assert rows[0]['bids_text'] == ''


@pytest.mark.parametrize('status,expected_calls', [(401, 1), (403, 1), (429, 3), (503, 3)])
def test_retry_status_policy(status, expected_calls):
    calls = []
    def handler(req):
        calls.append(req)
        return httpx.Response(status)
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        assert request(client, 'GET', 'https://example.test', sleep=lambda _: None).status_code == status
    assert len(calls) == expected_calls


def test_network_recovery_and_no_post_replay():
    calls = []
    def handler(req):
        calls.append(req)
        if len(calls) == 1:
            raise httpx.ConnectError('drop')
        return httpx.Response(200)
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        assert request(client, 'GET', 'https://example.test', sleep=lambda _: None).status_code == 200
        calls.clear()
        with pytest.raises(httpx.ConnectError):
            request(client, 'POST', 'https://example.test', sleep=lambda _: None)
        assert len(calls) == 1


def test_redirect_never_requests_outside_host():
    calls = []
    def handler(req):
        calls.append(req.url.host)
        if req.url.path == '/robots.txt':
            return httpx.Response(404)
        return httpx.Response(302, headers={'Location': 'https://outside.test/private'})
    with make_client(httpx.MockTransport(handler)) as client:
        with pytest.raises(RuntimeError):
            fetch_html(client, RobotsCache(client), RateLimiter(0), 'https://example.test/list', 'example.test')
    assert 'outside.test' not in calls


@pytest.mark.parametrize('title,expected', [('ساخت ربات نرم‌افزاری برای ثبت سفارش', True), ('نیاز به اسکرپر پایتون', True), ('Need workflow automation', True), ('ربات تلگرام چیست', False), ('آموزش ساخت ربات', False), ('ساخت ربات ارسال انبوه', False), ('طراحی لوگو', False)])
def test_high_intent_profile(title, expected):
    assert is_high_intent_lead(title) is expected


def test_missing_and_polluted_budget_and_posted_fields():
    row = clean_row({'title': 'ساخت ربات', 'url': 'https://example.test/job', 'budget_text': '۳ ساعت پیش ۴ پیشنهاد بودجه ۲,۰۰۰,۰۰۰ تومان', 'posted_text': 'random 42', 'bids_text': 'three hours ago'})
    assert row['budget_text'] == 'بودجه ۲,۰۰۰,۰۰۰ تومان'
    assert row['posted_text'] == ''
    assert row['bids_text'] == ''


def test_long_retry_after_not_violated_and_invalid_timeout_fails():
    with httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(429, headers={'retry-after': '90'}))) as client:
        def no_sleep(_):
            raise AssertionError('should not retry earlier than requested')
        assert request(client, 'GET', 'https://example.test', sleep=no_sleep).status_code == 429
        with pytest.raises(ValueError):
            request(client, 'GET', 'https://example.test', timeout=float('inf'))


def test_incidental_mentions_and_financial_bots_are_not_high_intent():
    assert not is_high_intent_lead('ترجمه فیلم', 'نیاز به ترجمه دارم؛ از ربات استفاده نکنید')
    assert not is_high_intent_lead('توسعه ربات معامله‌گر خودکار')
    assert not is_high_intent_lead('ساخت ربات اتوترید برای فارکس')


def test_malformed_optional_fields_preserve_raw_lead():
    row = clean_row({'title': 'ساخت ربات', 'url': 'https://example.test/job', 'bids_text': {'broken': 3}, 'summary': {'broken': True}})
    assert row['bids_text'] == ''
    assert row['summary'] == ''
    with pytest.raises(ValueError):
        canonical_url(None)


def test_fractional_budget_and_range_are_preserved():
    from scanner.reliability import clean_budget
    assert clean_budget('بودجه: ۱٫۵ میلیون تومان') == 'بودجه: ۱٫۵ میلیون تومان'
    assert clean_budget('بودجه ۵ هزار تا ۲ میلیون تومان') == 'بودجه ۵ هزار تا ۲ میلیون تومان'


def test_persian_trader_bot_in_summary_is_excluded_without_blocking_order_intake():
    assert not is_high_intent_lead('ربات 119553', '🔢 کد پروژه: 119553📌 عنوان پروژه: رباتیه سفارش برای ربات داشتمیه ربات تریدر خودکار میخوام طراحی کنید برام، که این خدمات رو بتونه بهم ارائه بده من روزانه یک الی دو سیگنال خرید یا فروش بهش بدم و خودش اطل')
    assert is_high_intent_lead('ربات 119553', 'یه سفارش برای ربات داشتم')
    assert is_high_intent_lead('ساخت ربات نرم‌افزاری برای ثبت سفارش')
