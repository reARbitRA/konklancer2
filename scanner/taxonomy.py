"""دسته‌بندی مشترک با سرور/کلاینت — از همان فایل `shared/taxonomy.json` خوانده می‌شود.

هیچ فهرست دسته‌ای در این فایل تکرار نشده تا اسکنر (Python) و UI (TypeScript) همیشه یکسان بمانند.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

TAXONOMY_PATH = Path(__file__).resolve().parent.parent / "shared" / "taxonomy.json"


@dataclass(frozen=True)
class Category:
    key: str
    fa: str
    ai_fit: int
    keywords: tuple[str, ...]
    strong: tuple[str, ...] = ()


def load_categories(path: Path = TAXONOMY_PATH) -> tuple[list[Category], Category]:
    data = json.loads(path.read_text(encoding="utf-8"))
    categories = [
        Category(
            key=item["key"],
            fa=item["fa"],
            ai_fit=int(item.get("aiFit", 0)),
            keywords=tuple(item.get("keywords", [])),
            strong=tuple(item.get("strong", [])),
        )
        for item in data["categories"]
    ]
    fallback = data["fallback"]
    return categories, Category(
        key=fallback["key"], fa=fallback["fa"], ai_fit=int(fallback.get("aiFit", 0)), keywords=()
    )


CATEGORIES, FALLBACK = load_categories()
CATEGORY_BY_KEY = {c.key: c for c in [*CATEGORIES, FALLBACK]}

_ASCII = re.compile(r"^[\x20-\x7e]+$")


def _matches(text: str, keyword: str) -> bool:
    needle = keyword.strip().lower()
    if not needle:
        return False
    if _ASCII.match(needle):
        return re.search(rf"(^|[^a-z0-9]){re.escape(needle)}([^a-z0-9]|$)", text) is not None
    return needle in text


#: کلیدواژه‌ی «قوی» = نام خودِ محصول قابل‌تحویل (ترجمه، لوگو، گویندگی...)
STRONG_KEYWORD_WEIGHT = 8


def keyword_weight(keyword: str) -> int:
    """وزن کلیدواژه = ۱ + تعداد واژه‌ها. عبارت‌های بلندتر (مثل «طراحی رابط کاربری») خاص‌ترند."""
    return 1 + len([token for token in keyword.split() if token])


def _category_score(category: Category, text: str) -> int:
    total = 0
    for keyword in category.keywords:
        if _matches(text, keyword):
            total += keyword_weight(keyword)
    for keyword in category.strong:
        if _matches(text, keyword):
            total += STRONG_KEYWORD_WEIGHT
    return total


def category_scores(*parts: str | None) -> dict[str, int]:
    text = " ".join(part for part in parts if part).lower()
    if not text.strip():
        return {}
    scores: dict[str, int] = {}
    for category in CATEGORIES:
        total = _category_score(category, text)
        if total:
            scores[category.key] = total
    return scores


def detect_category(*parts: str | None) -> Category:
    """دسته‌ی غالب بر اساس مجموع وزن کلیدواژه‌های منطبق.

    «تطبیق اول» کافی نیست: مثلاً در «مونتاژ ویدیو یوتیوب همراه زیرنویس» هم صنف ویدیو و هم
    ترجمه سیگنال دارند و باید ویدیو برنده شود. در تساوی، ترتیب فایل (خاص‌تر اول) تعیین می‌کند.
    """
    scores = category_scores(*parts)
    if not scores:
        return FALLBACK
    best_key = max(scores, key=lambda key: (scores[key], -[c.key for c in CATEGORIES].index(key)))
    return CATEGORY_BY_KEY[best_key]


def category_label(key: str) -> str:
    return CATEGORY_BY_KEY[key].fa if key in CATEGORY_BY_KEY else FALLBACK.fa
