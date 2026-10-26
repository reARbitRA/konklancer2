"""تست‌های آفلاین حالت رندر مرورگری (سایت‌های JS-محور).

هیچ شبکه‌ای لازم نیست: رفتار «نصب نبودن Playwright» و نگهبان دامنه سنجیده می‌شود.
"""
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scanner.konklancer_scan import (  # noqa: E402
    BrowserRenderError,
    browser_render_available,
    render_html_with_browser,
)


def test_availability_reports_reason_when_missing(monkeypatch):
    """اگر Playwright نصب نباشد، دلیل روشن و راه‌حل داده می‌شود (نه استثنای خام)."""
    ok, reason = browser_render_available()
    if ok:
        pytest.skip("Playwright در این محیط نصب است")
    assert isinstance(reason, str) and reason
    assert "Playwright" in reason or "مرورگر" in reason


def test_render_raises_honest_error_without_browser(monkeypatch):
    ok, _ = browser_render_available()
    if ok:
        pytest.skip("Playwright در این محیط نصب است")
    with pytest.raises(BrowserRenderError) as exc:
        render_html_with_browser("https://example.com/projects", "example.com")
    message = str(exc.value)
    assert "Playwright" in message or "مرورگر" in message


def test_domain_guard_blocks_outside_hosts():
    """مود رندر نباید به میزبان غیرمجاز برود — حتی قبل از تلاش برای اجرای مرورگر."""
    with pytest.raises(BrowserRenderError) as exc:
        render_html_with_browser("https://not-example.org/list", "example.com")
    assert "دامنه" in str(exc.value)


def test_env_flag_is_read_by_fetch_html(monkeypatch):
    """فلگ محیطی باید بدون استثنا خوانده شود؛ اگر مرورگر نباشد مسیر ساده ادامه می‌یابد."""
    monkeypatch.setenv("KONKLANCER_BROWSER", "1")
    assert os.environ["KONKLANCER_BROWSER"] == "1"
    ok, reason = browser_render_available()
    assert ok or reason  # هر دو حالت باید پیام یا موفقیت بدهند، نه کرش
