import json
from pathlib import Path

import httpx

from scanner import konklancer_scan as ks

FIX = Path(__file__).parent / "fixtures"
SEL = {
    "item": ".project-item",
    "title": ".project-title",
    "summary": ".project-desc",
    "budget": ".budget",
    "bids": ".bids",
}


def test_parse_listing_extracts_and_resolves_links():
    html = (FIX / "listing_sample.html").read_text(encoding="utf-8")
    items = ks.parse_listing(html, "https://example.test/search", "demo", SEL)
    # آیتم بدون لینک نادیده گرفته می‌شود
    assert [p.title for p in items] == ["توسعه ربات تلگرام با پایتون", "ترجمه مقاله انگلیسی", "طراحی لوگو"]
    assert items[0].url == "https://example.test/project/101"
    assert items[0].budget_text == "حداکثر ۵۰۰ هزار تومان"
    assert items[0].bids_text == "۳ پیشنهاد"
    assert items[1].url == "https://example.org/project/102"


def test_ids_are_stable_and_unique():
    html = (FIX / "listing_sample.html").read_text(encoding="utf-8")
    a = ks.parse_listing(html, "https://example.test/", "demo", SEL)
    b = ks.parse_listing(html, "https://example.test/", "demo", SEL)
    assert [p.id for p in a] == [p.id for p in b]
    assert len({p.id for p in a}) == len(a)


def test_telegram_preview_parsing():
    html = (FIX / "telegram_preview.html").read_text(encoding="utf-8")
    items = ks.parse_telegram_preview(html, "chan")
    assert len(items) == 1  # پست دوم لینک تاریخ ندارد و کنار گذاشته می‌شود
    assert items[0].url == "https://t.me/chan/10"
    assert items[0].title.startswith("پروژه جدید")
    assert items[0].posted_text == "2026-10-09T10:00:00+00:00"


def test_include_exclude_filters():
    p = ks.Project(id="x", source="s", title="ربات Python", url="u", summary="")
    assert ks.matches(p, ["python"], [])
    assert not ks.matches(p, ["java"], [])
    assert not ks.matches(p, [], ["ربات"])


def test_dedupe_on_append(tmp_path):
    out = tmp_path / "p.jsonl"
    p = ks.Project(id="abc", source="s", title="t", url="u")
    assert ks.append_projects(out, [p]) == 1
    assert ks.append_projects(out, [p]) == 0
    assert len(out.read_text(encoding="utf-8").splitlines()) == 1


def test_redirect_outside_allowed_domain_is_blocked():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        # ریدایرکت به دامنه‌ی تبلیغاتی
        return httpx.Response(302, headers={"Location": "https://spam.example.net/"}) if request.url.host == "good.example" else httpx.Response(200, text="spam")

    with ks.make_client(httpx.MockTransport(handler)) as client:
        robots = ks.RobotsCache(client)
        limiter = ks.RateLimiter(0)
        try:
            ks.fetch_html(client, robots, limiter, "https://good.example/list", "good.example")
        except RuntimeError as e:
            assert "spam.example.net" in str(e)
        else:
            raise AssertionError("باید متوقف می‌شد")


def test_robots_disallow_is_respected():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /private/\n")
        return httpx.Response(200, text="ok")

    with ks.make_client(httpx.MockTransport(handler)) as client:
        robots = ks.RobotsCache(client)
        assert robots.allowed("https://site.example/list")
        assert not robots.allowed("https://site.example/private/x")


def test_robots_server_error_blocks_everything():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(503)
        return httpx.Response(200)

    with ks.make_client(httpx.MockTransport(handler)) as client:
        assert not ks.RobotsCache(client).allowed("https://down.example/list")


def test_page_url_template():
    assert ks.page_url("https://a.test/x/{page}", 3) == "https://a.test/x/3"
    assert ks.page_url("https://a.test/list", 1) == "https://a.test/list"
    assert ks.page_url("https://a.test/list", 2) == "https://a.test/list?page=2"


def test_registry_is_valid_json_and_no_platform_scans_by_default():
    reg = json.loads(ks.REGISTRY_PATH.read_text(encoding="utf-8"))
    ids = [p["id"] for p in reg["platforms"]]
    assert len(ids) == len(set(ids))
    assert all(p["scan_enabled"] is False for p in reg["platforms"])
    lancerify = next(p for p in reg["platforms"] if p["id"] == "lancerify")
    assert lancerify["status"] == "active_flagged"


def test_cli_parse_file_filters_on_comma_separated_keywords(capsys):
    rc = ks.main([
        "parse-file", "--platform", "parscoders",
        "--html", str(FIX / "listing_sample.html"),
        "--selectors-json", json.dumps({"item": ".project-item", "title": ".project-title", "summary": ".project-desc"}),
        "--include", "پایتون,python",
    ])
    out = capsys.readouterr().out
    assert rc == 0
    assert "توسعه ربات تلگرام با پایتون" in out
    assert "ترجمه مقاله" not in out
    assert "3 مورد تجزیه شد، 1 مورد پس از فیلتر" in out


# ---------------------------------------------------------------------------
# فعال/غیرفعال کردن منابع (برای راه‌اندازی شخصی)
# ---------------------------------------------------------------------------
def _write_registry(tmp_path):
    registry = tmp_path / "platforms.json"
    registry.write_text(
        json.dumps(
            {
                "platforms": [
                    {"id": "parscoders", "name": "پارس‌کدرز", "status": "active", "scan_enabled": False},
                    {"id": "ponisha", "name": "پونیشا", "status": "active", "scan_enabled": False,
                     "scan_selectors": {"item": ".x", "title": ".y"}},
                ]
            }
        ),
        encoding="utf-8",
    )
    return registry


def _write_channels(tmp_path):
    channels = tmp_path / "telegram_sources.json"
    channels.write_text(
        json.dumps({"channels": [{"username": "workarc", "title": "فریلنسری", "scan_enabled": False}]}),
        encoding="utf-8",
    )
    return channels


def test_enable_telegram_flips_the_flag(tmp_path, monkeypatch, capsys):
    channels = _write_channels(tmp_path)
    monkeypatch.setattr(ks, "TELEGRAM_PATH", channels)

    assert ks.main(["enable", "--telegram", "workarc"]) == 0
    assert json.loads(channels.read_text(encoding="utf-8"))["channels"][0]["scan_enabled"] is True
    assert "فعال شد" in capsys.readouterr().out

    assert ks.main(["disable", "--telegram", "workarc"]) == 0
    assert json.loads(channels.read_text(encoding="utf-8"))["channels"][0]["scan_enabled"] is False


def test_enable_platform_requires_selectors(tmp_path, monkeypatch):
    registry = _write_registry(tmp_path)
    monkeypatch.setattr(ks, "REGISTRY_PATH", registry)

    # بدون انتخابگر CSS، فعال‌سازی باید با پیام روشن رد شود
    try:
        ks.main(["enable", "--platform", "parscoders"])
    except SystemExit as exc:
        assert "انتخابگر" in str(exc)
    else:
        raise AssertionError("باید رد می‌شد")

    # با انتخابگر موجود، فعال می‌شود
    assert ks.main(["enable", "--platform", "ponisha"]) == 0
    platforms = json.loads(registry.read_text(encoding="utf-8"))["platforms"]
    assert [p["scan_enabled"] for p in platforms] == [False, True]


def test_toggle_requires_exactly_one_target(tmp_path, monkeypatch):
    monkeypatch.setattr(ks, "REGISTRY_PATH", _write_registry(tmp_path))
    monkeypatch.setattr(ks, "TELEGRAM_PATH", _write_channels(tmp_path))
    for argv in (["enable"], ["enable", "--platform", "ponisha", "--telegram", "workarc"]):
        try:
            ks.main(argv)
        except SystemExit as exc:
            assert "دقیقاً یکی" in str(exc)
        else:
            raise AssertionError("باید رد می‌شد")


def test_list_shows_platforms_and_channels(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(ks, "REGISTRY_PATH", _write_registry(tmp_path))
    monkeypatch.setattr(ks, "TELEGRAM_PATH", _write_channels(tmp_path))
    assert ks.main(["list"]) == 0
    out = capsys.readouterr().out
    assert "پارس‌کدرز" in out and "@workarc" in out and "بدون نامزد" in out


def test_parse_file_can_append_to_the_feed(tmp_path, capsys):
    out = tmp_path / "projects.jsonl"
    rc = ks.main([
        "parse-file", "--platform", "parscoders",
        "--html", str(FIX / "listing_sample.html"),
        "--selectors-json", json.dumps({"item": ".project-item", "title": ".project-title", "summary": ".project-desc"}),
        "--include", "پایتون,python",
        "--out", str(out),
    ])
    assert rc == 0
    assert "1 مورد جدید در" in capsys.readouterr().out
    lines = [json.loads(line) for line in out.read_text(encoding="utf-8").splitlines()]
    assert len(lines) == 1 and lines[0]["source"] == "parscoders"

    # اجرای دوباره نباید رکورد تکراری بسازد
    ks.main([
        "parse-file", "--platform", "parscoders",
        "--html", str(FIX / "listing_sample.html"),
        "--selectors-json", json.dumps({"item": ".project-item", "title": ".project-title", "summary": ".project-desc"}),
        "--include", "پایتون,python",
        "--out", str(out),
    ])
    assert len(out.read_text(encoding="utf-8").splitlines()) == 1


def test_parse_telegram_file_writes_to_the_feed(tmp_path, capsys):
    out = tmp_path / "projects.jsonl"
    rc = ks.main([
        "parse-telegram-file", "--channel", "chan",
        "--html", str(FIX / "telegram_preview.html"),
        "--out", str(out),
    ])
    assert rc == 0
    assert "1 پیام تجزیه شد" in capsys.readouterr().out
    record = json.loads(out.read_text(encoding="utf-8").splitlines()[0])
    assert record["source"] == "telegram:chan" and record["url"] == "https://t.me/chan/10"


def test_robots_network_failure_reports_a_clear_reason():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route to host", request=request)

    with ks.make_client(httpx.MockTransport(handler)) as client:
        robots = ks.RobotsCache(client)
        try:
            ks.fetch_html(client, robots, ks.RateLimiter(0), "https://offline.example/list", "offline.example")
        except PermissionError as exc:
            assert "خطای شبکه" in str(exc)
            assert robots.block_reason("offline.example") == "network"
        else:
            raise AssertionError("باید متوقف می‌شد")


def test_robots_disallow_reason_is_reported():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /s/\n")
        return httpx.Response(200, text="ok")

    with ks.make_client(httpx.MockTransport(handler)) as client:
        robots = ks.RobotsCache(client)
        try:
            ks.fetch_html(client, robots, ks.RateLimiter(0), "https://tg.example/s/chan", "tg.example")
        except PermissionError as exc:
            assert "ممنوع کرده است" in str(exc)
        else:
            raise AssertionError("باید متوقف می‌شد")


def test_same_domain_ignores_port_and_www():
    """رگرسیون باگ واقعی: ریدایرکت همان میزبان با پورت دیگر «دامنه‌ی خارج» تشخیص داده می‌شد."""
    assert ks._same_domain("127.0.0.1:8123", "127.0.0.1")
    assert ks._same_domain("parscoders.com:443", "parscoders.com")
    assert ks._same_domain("www.karlancer.com", "karlancer.com")
    assert ks._same_domain("cdn.karlancer.com", "karlancer.com")
    assert not ks._same_domain("evil.example", "karlancer.com")
    assert not ks._same_domain("notkarlancer.com", "karlancer.com")
    assert not ks._same_domain("", "karlancer.com")


def test_category_is_written_into_the_feed(tmp_path):
    """فید باید دسته‌ی هر پروژه را داشته باشد تا فیلتر دسته‌ای UI روی داده‌ی واقعی کار کند."""
    import json as _json

    out = tmp_path / "feed.jsonl"
    selectors = {"item": ".project-card", "title": "a[href]", "link": "a[href]"}
    rc = ks.main([
        "parse-file",
        "--platform", "parscoders",
        "--html", str(FIX / "listing_sample_cards.html"),
        "--selectors-json", _json.dumps(selectors, ensure_ascii=False),
        "--out", str(out),
    ])
    assert rc == 0
    rows = [_json.loads(line) for line in out.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert rows, "باید رکورد نوشته شود"
    assert all(row.get("category") for row in rows)
    keys = {row["category"] for row in rows}
    assert {"translation", "graphic"} <= keys, keys
