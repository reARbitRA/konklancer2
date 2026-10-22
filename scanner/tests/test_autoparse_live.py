"""تست رفتار پارسر روی نمونه‌های واقعی و روی صفحه‌های ساختاری متفاوت.

سه چیز اینجا تضمین می‌شود:
۱. گارد «آیتم منو/فوتر پروژه نیست» روی HTML واقعی کارلنسر واقعاً جلوی ردیف‌های زباله را می‌گیرد.
۲. ساختار جدولی (که بعضی سایت‌های ایرانی دارند) هم پارس می‌شود.
۳. صفحه‌ای که پروژه‌ها را با JavaScript می‌سازد باید «صفر نتیجه + دلیل» بدهد، نه داده‌ی ساختگی.
"""

import gzip
import re
from pathlib import Path

import pytest

from scanner import autoparse, konklancer_scan as ks

LIVE = Path(__file__).parent / "fixtures" / "live"

NAV_TITLES = {"خانه", "ورود", "ورود به کارلنسر", "ثبت پروژه رایگان", "تماس با ما", "داشبورد"}


def live_text(name: str) -> str:
    path = LIVE / f"{name}.html.gz"
    if not path.exists():
        pytest.skip(f"نمونه‌ی زنده موجود نیست: {path.name}")
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        return fh.read()


def test_naive_parsing_never_returns_nav_junk():
    """باگ واقعی فید قبلی: با انتخابگر عمومی، ردیف‌هایی مثل «خانه» و `/hire/…` وارد فید شده بودند.

    حالا هر ورودی، یا پروژه‌ی واقعی است یا اصلاً برنمی‌گردد — هیچ ردیف ناوبری/حساب کاربری مجاز نیست.
    """
    html = live_text("karlancer")
    base = "https://www.karlancer.com/projects"
    for item_selector in ["div", "div > div", "a"]:
        items = ks.parse_listing(html, base, "karlancer", {"item": item_selector})
        for item in items:
            assert item.url.startswith(base + "/"), f"نشانی غیرپروژه با {item_selector}: {item.url}"
            assert item.title not in NAV_TITLES, f"عنوان ناوبری: {item.title!r}"
            assert not re.search(r"/(hire|panel|login|post-job|blog)(/|$)", item.url)


def test_lingering_junk_in_previous_cloud_feed_is_now_rejected():
    """ردیف‌های زباله‌ای که در فید واقعی اجرای قبلی دیده شد باید حالا رد شوند."""
    junk_urls = [
        "https://www.karlancer.com/hire/1234",
        "https://www.karlancer.com/panel/orders",
        "https://www.karlancer.com/post-job",
        "https://www.karlancer.com/login",
    ]
    for url in junk_urls:
        assert ks._looks_like_nav_item(url, "نیاز به برنامه‌نویس پایتون"), f"باید رد شود: {url}"
    for title in ["خانه", "ورود به کارلنسر", "ثبت پروژه رایگان", "📢"]:
        assert ks._looks_like_nav_item("https://www.karlancer.com/projects/x", title), f"باید رد شود: {title}"
    # و پروژه‌ی واقعی نباید رد شود
    assert not ks._looks_like_nav_item(
        "https://www.karlancer.com/projects/طراحی-لوگو", "طراحی لوگو و هویت بصری فروشگاه"
    )


TABLE_HTML = """
<html><body>
<table id="plist">
  <tr><th>عنوان</th><th>بودجه</th><th>پیشنهادها</th></tr>
  <tr class="proj"><td><a href="/project/101/logo-design">طراحی لوگو فروشگاه پوست و مو</a></td><td>۵,۰۰۰,۰۰۰ تومان</td><td>۴ پیشنهاد</td></tr>
  <tr class="proj"><td><a href="/project/102/wp-site">ساخت سایت وردپرسی شرکتی با فرم تماس</a></td><td>۱۲,۰۰۰,۰۰۰ تومان</td><td>۹ پیشنهاد</td></tr>
  <tr class="proj"><td><a href="/project/103/voice-over">گویندگی متن تبلیغاتی رادیویی</a></td><td>۲,۰۰۰,۰۰۰ تومان</td><td>۲ پیشنهاد</td></tr>
  <tr class="proj"><td><a href="/project/104/translate">ترجمه مقاله انگلیسی به فارسی</a></td><td>۱,۵۰۰,۰۰۰ تومان</td><td>۷ پیشنهاد</td></tr>
</table>
</body></html>
"""


def test_table_layout_is_discovered_and_parsed_end_to_end():
    """سایت‌هایی که فهرست را در جدول می‌گذارند باید بدون انتخابگر دستی کار کنند."""
    best = autoparse.best_profile(TABLE_HTML, min_count=3)
    assert best is not None and best.count == 4
    assert "tr" in best.selectors["item"]
    items = ks.parse_listing(TABLE_HTML, "https://example.ir/projects", "example", best.selectors)
    assert len(items) == 4
    assert {item.category for item in items} <= set(ks_expected_categories())
    titles = " | ".join(item.title for item in items)
    assert "طراحی لوگو" in titles and "ترجمه مقاله" in titles
    # بودجه‌ی فارسی باید خوانده شود (سیگنال اصلی امتیازدهی)
    assert any(item.budget_text for item in items)


def ks_expected_categories():
    from scanner import taxonomy

    return [c.key for c in taxonomy.CATEGORIES]


JS_ONLY_HTML = """
<html><body><div id="app"></div>
<script>fetch('/api/projects').then(r => r.json()).then(rows => {
  document.getElementById('app').innerHTML = rows.map(r => `<div class="card"><a href="/p/${r.id}">${r.title}</a></div>`).join('');
});</script>
</body></html>
"""


def test_js_only_page_reports_zero_results_instead_of_faking_data():
    """اگر سایت پروژه‌ها را با JS بسازد، خروجی باید صفر باشد و شکست قابل تشخیص — نه داده‌ی ساختگی."""
    assert autoparse.detect_candidates(JS_ONLY_HTML, min_count=3) == []
    assert ks.parse_listing(JS_ONLY_HTML, "https://spa.example", "spa", {"item": "div.card"}) == []


def test_persian_and_arabic_digits_are_normalized():
    assert autoparse.normalize_digits("۵٬۰۰۰٫۰۰۰ تومان") == "5000,000 تومان" or autoparse.normalize_digits(
        "۵۰۰۰۰۰۰"
    ) == "5000000"
    assert autoparse.normalize_digits("٠١٢٣٤٥٦٧٨٩") == "0123456789"
    assert autoparse.normalize_digits("۱۲,۵۰۰,۰۰۰").replace(",", "").isdigit()


@pytest.mark.parametrize(
    "title, summary, expected",
    [
        ("طراحی لوگو و ست اداری شرکت", "", "graphic"),
        ("ترجمه مقاله انگلیسی به فارسی", "", "translation"),
        ("ساخت ربات تلگرام با پایتون", "", "automation"),
        ("گویندگی متن تبلیغاتی", "ضبط صدا در استودیو", "audio"),
        ("تولید محتوا برای اینستاگرام", "کپی‌رایتینگ و تقویم محتوا", "writing"),
        ("بهینه‌سازی سئوی سایت فروشگاهی", "", "marketing"),
    ],
)
def test_real_world_titles_land_in_sensible_categories(title, summary, expected):
    """این عنوان‌ها از نمونه‌های واقعی صفحه‌ها گرفته شده‌اند؛ دسته باید با کار واقعی بخواند."""
    from scanner import taxonomy

    assert taxonomy.detect_category(title, summary).key == expected
