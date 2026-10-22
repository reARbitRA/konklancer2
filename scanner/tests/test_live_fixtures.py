"""تست روی نمونه‌های HTML واقعی (گرفته‌شده از رانر گیت‌هاب و ذخیره‌شده در fixtures/live).

اهمیت: این‌ها «داده‌ی ساختگی» نیستند؛ همان صفحه‌های زنده‌ی کارلنسر/پونیشا و کانال‌های تلگرام‌اند.
اگر سایت ساختارش را عوض کند، این تست‌ها می‌شکنند و همان اتفاقی است که باید بیفتد.

برای گرفتن نمونه‌ی تازه: `python -m scanner.konklancer_scan capture --target parscoders,ponisha,karlancer --telegram`
(یا اجرای ورک‌فلوی .github/workflows/scanner-feed.yml که این کار را خودکار انجام می‌دهد).
"""

import gzip
import re
from pathlib import Path

import pytest

from scanner import konklancer_scan as ks

LIVE = Path(__file__).parent / "fixtures" / "live"
NAV_TITLES = {"خانه", "ورود", "ورود به کارلنسر", "ثبت پروژه رایگان"}


def live_text(name: str) -> str:
    path = LIVE / f"{name}.html.gz"
    if not path.exists():
        pytest.skip(f"نمونه‌ی زنده موجود نیست: {path.name} (با دستور capture بگیرید)")
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        return fh.read()


def test_karlancer_verified_selectors_parse_real_listing():
    selectors = {
        "item": "app-sidebar-project-card",
        "title": "h4.fs-18.font-weight-bold",
        "link": "a[href*='/projects/']",
        "budget": "div.fs-16.b-900",
        "posted": "span.fs-13",
    }
    items = ks.parse_listing(live_text("karlancer"), "https://www.karlancer.com/projects", "karlancer", selectors)
    assert len(items) == 24, f"انتظار ۲۴ کارت واقعی، دریافت {len(items)}"
    assert all(item.url.startswith("https://www.karlancer.com/projects/") for item in items)
    assert all(len(item.title) > 5 for item in items)
    with_budget = [item for item in items if "تومان" in item.budget_text]
    assert len(with_budget) == 24, "بودجه‌ی همه‌ی کارت‌ها باید خوانده شود"
    assert all("پیش" in item.posted_text for item in items)
    # عنوان‌ها نباید آیتم ناوبری باشند (باگ واقعی نسخه‌ی قبل: «خانه»، «ورود به کارلنسر»)
    nav_titles = {"خانه", "ورود به کارلنسر", "ثبت پروژه رایگان"}
    assert not nav_titles & {item.title for item in items}


def test_karlancer_budget_values_are_real_amounts():
    from scanner.autoparse import normalize_digits

    selectors = {"item": "app-sidebar-project-card", "title": "h4.fs-18.font-weight-bold", "budget": "div.fs-16.b-900"}
    items = ks.parse_listing(live_text("karlancer"), "https://www.karlancer.com/projects", "karlancer", selectors)
    amounts = [re.search(r"[\d,٬]+", normalize_digits(item.budget_text)) for item in items]
    assert all(match for match in amounts), [item.budget_text for item in items][:5]
    digits = [match.group(0).replace(",", "").replace("٬", "") for match in amounts]
    assert all(value.isdigit() for value in digits), digits[:5]
    assert max(int(value) for value in digits) > 1_000_000


def test_ponisha_verified_selectors_parse_real_listing():
    selectors = {
        "item": "article",
        "title": "span.MuiTypography-h4",
        "link": "a[href^='/project/']",
        "bids": "label:پیشنهادها",
        "summary": "span.MuiTypography-subtitle1",
    }
    items = ks.parse_listing(live_text("ponisha"), "https://ponisha.ir/projects", "ponisha", selectors)
    # صفحه دو چیدمان تکراری دارد؛ باید بر اساس URL یکتا شود
    assert len(items) == 20, f"انتظار ۲۰ پروژه‌ی یکتا، دریافت {len(items)}"
    assert len({item.url for item in items}) == len(items)
    assert all(item.category for item in items)
    # برچسب «پیشنهادها» در چیدمان اصلی هست: تعداد پیشنهاد = سیگنال رقابت
    with_bids = [item for item in items if item.bids_text.strip().isdigit()]
    assert with_bids, "تعداد پیشنهادها باید از الگوی برچسب+مقدار خوانده شود"
    assert any("عنوان پروژه" in item.summary for item in items)


def test_registry_selectors_match_the_verified_values():
    """انتخابگرهای ثبت‌شده در platforms.json باید همان‌هایی باشند که روی فیکسچر واقعی تست شده‌اند."""
    registry = ks.load_registry()
    for platform_id, item_selector in [("karlancer", "app-sidebar-project-card"), ("ponisha", "article")]:
        platform = ks.get_platform(registry, platform_id)
        assert platform.get("scan_selectors", {}).get("item") == item_selector
        assert platform.get("scan_selectors_verified", {}).get("verified") is True


def test_parscoders_verified_selectors_parse_real_listing():
    """پارس‌کدرز: بودجه، تعداد پیشنهاد و زمان در دو گره‌ی متفاوت‌اند (نه همه در یک کارت)."""
    registry = ks.load_registry()
    platform = ks.get_platform(registry, "parscoders")
    selectors = platform.get("scan_selectors") or {}
    items = ks.parse_listing(
        live_text("parscoders"),
        platform["listing_url"],
        "parscoders",
        selectors,
        platform.get("project_path_pattern"),
    )
    assert len(items) == 25, f"انتظار ۲۵ پروژه‌ی یکتا، دریافت {len(items)}"
    assert len({item.url for item in items}) == len(items)
    assert all(re.match(r"^/project/\d+/", urlpath(item.url)) for item in items), "مسیرهای /project/skills/ نباید پروژه حساب شوند"
    # برخی آگهی‌های واقعی پارس‌کدرز «توافقی» هستند و برچسب «بودجه» ندارند (مثلاً ۲۴ از ۲۵ کارت).
    assert sum("بودجه" in item.budget_text for item in items) >= 20
    assert all("پیشنهاد" in item.bids_text for item in items)
    assert not NAV_TITLES & {item.title for item in items}


def urlpath(url: str) -> str:
    from urllib.parse import urlparse

    return urlparse(url).path


def test_telegram_titles_are_meaningful_not_emoji():
    items = ks.parse_telegram_preview(live_text("telegram-workarc"), "workarc")
    assert len(items) >= 10
    for item in items:
        assert len(item.title.strip()) >= 8, f"عنوان بی‌معنا: {item.title!r}"
        assert item.url.startswith("https://t.me/WorkArc/")
    # عنوان باید از «عنوان:» پیام برداشته شود وقتی هست
    assert any("مدل سازی پروژه بیمارستانی" in item.title for item in items)


def test_telegram_real_channels_flagged_correctly():
    """کانال‌های پرسیگنال فعال‌اند و کانال‌های بی‌ربط غیرفعال — تصمیم بر پایه‌ی نمونه‌ی واقعی."""
    import json

    data = json.loads(Path(__file__).parent.parent.joinpath("telegram_sources.json").read_text(encoding="utf-8"))
    enabled = {ch["username"] for ch in data["channels"] if ch["scan_enabled"]}
    assert enabled == {"workarc", "freelancer_projects"}
    for channel in data["channels"]:
        if not channel["scan_enabled"]:
            assert channel.get("disabled_reason"), f"@{channel['username']} باید دلیل غیرفعال‌بودن داشته باشد"


def test_autodetect_finds_real_cards_without_selectors():
    """اگر انتخابگرها گم شوند، خودکالیبراسیون باید خودش کارت‌های واقعی را پیدا کند.

    مهم: فقط «پیدا کردن یک انتخابگر» کافی نیست؛ باید وقتی روی کل صفحه اعمال می‌شود
    پروژه‌ی واقعی بدهد و آیتم منو/فوتر (باگ واقعی نسخه‌ی قبل) نگیرد.
    """
    from scanner import autoparse

    html = live_text("karlancer")
    best = autoparse.best_profile(html, min_count=5)
    assert best is not None
    assert best.count >= 10, f"کشف خودکار باید کارت‌های واقعی را ببیند، دید: {best.count}"

    items = ks.parse_listing(html, "https://www.karlancer.com/projects", "karlancer", best.selectors)
    assert len(items) >= 20, f"انتخابگر کشف‌شده باید پروژه‌های واقعی بدهد، داد: {len(items)}"
    assert all(item.url.startswith("https://www.karlancer.com/projects/") for item in items)
    assert not {"خانه", "ورود به کارلنسر"} & {item.title for item in items}
