"""تست تاکسونومی مشترک: هیچ دسته‌ای پیش‌فرض حذف نمی‌شود و تشخیص دسته برای کارهای غیرکدنویسی درست است."""

from pathlib import Path

from scanner import konklancer_scan as ks
from scanner.taxonomy import CATEGORIES, CATEGORY_BY_KEY, detect_category


def test_taxonomy_covers_non_coding_ai_work():
    keys = {c.key for c in CATEGORIES}
    assert {"translation", "graphic", "image", "video", "audio", "writing", "docs", "marketing", "data"} <= keys
    # هیچ دسته‌ای نباید فقط کدنویسی باشد
    assert "dev" in keys and len(keys) >= 10


def test_detect_category_for_real_phrases():
    cases = {
        ("ترجمه مقاله تخصصی پزشکی از انگلیسی به فارسی", ""): "translation",
        ("طراحی لوگو و ست اداری کافه", ""): "graphic",
        ("ساخت پاورپوینت دفاع پایان‌نامه ۳۰ اسلاید", ""): "docs",
        ("مونتاژ ویدیو یوتیوب و ساخت زیرنویس فارسی", ""): "video",
        ("روتوش ۴۰ عکس محصول و حذف پس‌زمینه", ""): "image",
        ("گویندگی تیزر تبلیغاتی ۶۰ ثانیه", ""): "audio",
        ("کپی‌رایتینگ صفحه فرود فروشگاه اینترنتی", ""): "writing",
        ("ربات تلگرام با پایتون", "مدیریت کانال"): "automation",
        ("تحلیل داده فروش", "اکسل و داشبورد"): "data",
        ("سئو سایت", "کمپین گوگل ادز"): "marketing",
        ("نصب وردپرس و قالب", "فروشگاه اینترنتی"): "dev",
    }
    for (title, summary), expected in cases.items():
        assert detect_category(title, summary).key == expected, title


def test_unknown_text_falls_back_to_other_not_dropped():
    cat = detect_category("یک کار نامشخص", "")
    assert cat.key == "other"
    assert CATEGORY_BY_KEY["other"].key == "other"


def test_projects_get_category_computed_automatically():
    project = ks.Project(
        id="x",
        source="demo",
        title="طراحی بروشور سه لت",
        url="https://example.test/p/1",
    )
    assert project.category == "graphic"


def test_empty_include_filter_keeps_every_category():
    """قاعده‌ی اصلی درخواست کاربر: فید نباید به کدنویسی محدود شود."""
    projects = [
        ks.Project(id="1", source="s", title="ترجمه متن", url="https://e.test/1"),
        ks.Project(id="2", source="s", title="ربات تلگرام", url="https://e.test/2"),
        ks.Project(id="3", source="s", title="گویندگی تیزر", url="https://e.test/3"),
    ]
    # بدون include و بدون categories ⇒ هیچ‌چیز فیلتر نمی‌شود
    assert [p.id for p in projects if ks.matches(p, [], [])] == ["1", "2", "3"]
    assert all(ks.matches(p, [], []) for p in projects)


def test_category_filter_only_when_explicitly_requested():
    projects = [
        ks.Project(id="1", source="s", title="ترجمه متن", url="https://e.test/1"),
        ks.Project(id="2", source="s", title="ربات تلگرام با پایتون", url="https://e.test/2"),
    ]
    only_translation = [p.id for p in projects if ks.matches(p, [], [], categories=["translation"])]
    assert only_translation == ["1"]


def test_neutral_keywords_do_not_kill_a_project():
    """کلیدواژه‌ی بی‌ربط نباید پروژه را حذف کند وقتی کاربر فهرست را محدود نکرده است."""
    project = ks.Project(id="1", source="s", title="طراحی لوگو", url="https://e.test/1")
    assert ks.matches(project, ["ترجمه", "طراحی"], [])
    assert not ks.matches(project, ["ترجمه"], [], categories=["translation"])
