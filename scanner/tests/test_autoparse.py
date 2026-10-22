"""تست کشف خودکار ساختار صفحه (scanner/autoparse.py) — ستون اصلی «اسکن واقعی، نه ماک‌آپ»."""

from pathlib import Path

from scanner import autoparse

FIX = Path(__file__).parent / "fixtures"


def _html(name: str) -> str:
    return (FIX / name).read_text(encoding="utf-8")


def test_detects_class_based_card_listing():
    best = autoparse.best_profile(_html("listing_sample_cards.html"), min_count=3)
    assert best is not None
    assert best.count >= 5
    # آیتم‌ها باید کارت‌های واقعی باشند، نه <main> یا <body>
    assert best.selectors["item"] != "body"
    assert "project-card" in best.selectors["item"] or best.selectors["item"].endswith("div")


def test_detects_sibling_rows_when_classes_alternate():
    """`tr.odd` / `tr.even` امضای متفاوت دارند؛ کشف باید از راه «هم‌فرندی» موفق شود."""
    best = autoparse.best_profile(_html("listing_sample_table.html"), min_count=3)
    assert best is not None
    assert best.count == 5
    assert "tr" in best.selectors["item"]


def test_budget_field_never_steals_the_title_cell():
    """باگ واقعی: در جدول بدون کلاس، انتخابگر `td` سلول عنوان را به‌عنوان بودجه می‌گرفت."""
    best = autoparse.best_profile(_html("listing_sample_table.html"), min_count=3)
    assert best is not None
    budget = best.selectors.get("budget")
    assert budget, "بودجه در این صفحه باید تشخیص داده شود"
    assert ":nth-of-type(" in budget, f"بودجه بدون تفکیک ستون خطرناک است: {budget}"
    assert not budget.endswith(":nth-of-type(1)"), "ستون اول ستون عنوان است، نه بودجه"


def test_spa_shell_yields_no_candidate():
    """صفحه‌ای که محتوایش با JS می‌آید نباید داده‌ی جعلی تولید کند؛ باید صریحاً خالی بماند."""
    assert autoparse.best_profile(_html("listing_sample_spa.html"), min_count=3) is None


def test_persian_digits_are_normalized():
    assert autoparse.normalize_digits("۵") == "5"
    assert autoparse.normalize_digits("۳,۵۰۰,۰۰۰") == "3,500,000"
    assert autoparse.normalize_digits("۱۲۳") == "123"


def test_budget_and_bids_hints_match_real_phrases():
    assert autoparse.has_budget_hint("بودجه: ۵ میلیون تومان")
    assert autoparse.has_budget_hint("حداکثر ۹۰۰ هزار تومان")
    assert autoparse.has_budget_hint("۱٫۵ میلیون تومان")
    assert not autoparse.has_budget_hint("ترجمه مقاله تخصصی پزشکی")
    assert autoparse.has_bids_hint("۳ پیشنهاد")
    assert autoparse.has_bids_hint("بدون پیشنهاد")
    assert not autoparse.has_bids_hint("طراحی لوگو")


def test_candidates_are_ranked_by_confidence():
    candidates = autoparse.detect_candidates(_html("listing_sample_cards.html"), min_count=3)
    assert candidates, "باید حداقل یک نامزد پیدا شود"
    scores = [c.score for c in candidates]
    assert scores == sorted(scores, reverse=True), "نامزدها باید نزولی باشند"
    # نامزد اول باید بودجه و پیشنهاد را هم پوشش دهد؛ نه فقط تکرار تگ
    assert candidates[0].selectors.get("budget")
