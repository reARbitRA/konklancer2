"""دسته‌بندی مشترک با سرور/کلاینت — از همان فایل `shared/taxonomy.json` خوانده می‌شود.

مجهز به نرمال‌سازی فارسی (ی/ک عربی، نیم‌فاصله ZWNJ) و وزن‌دهی چندبخشی (عنوان ۳.۵ برابر متن شرح، تگ‌ها ۲.۲ برابر).
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


def normalize_persian_text(raw: str) -> str:
    s = (raw or "").lower()
    s = re.sub(r"[يیئ]", "ی", s)
    s = s.replace("ك", "ک").replace("ة", "ه").replace("ؤ", "و")
    s = re.sub(r"[أإآ]", "ا", s)
    s = re.sub(r"[\u200c\u200f\u200e\u00a0]", " ", s)
    s = re.sub(r"[\u064b-\u065f\u0670]", "", s)
    s = re.sub(r"[_/\\|•·،؛,:;!؟?()\[\]{}<>«»\"'`~]+", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def _matches(norm_spaced: str, norm_compact: str, keyword: str) -> bool:
    needle = normalize_persian_text(keyword)
    if not needle:
        return False
    if _ASCII.match(needle):
        return re.search(rf"(^|[^a-z0-9]){re.escape(needle)}([^a-z0-9]|$)", norm_spaced) is not None
    if needle in norm_spaced:
        return True
    if " " in needle and len(needle) >= 5:
        return needle.replace(" ", "") in norm_compact
    return False


STRONG_KEYWORD_WEIGHT = 9
PART_WEIGHTS = (3.5, 1.0, 2.2)


def keyword_weight(keyword: str) -> int:
    return 1 + len([token for token in keyword.split() if token])


def _category_score_part(category: Category, part_text: str) -> int:
    norm_spaced = normalize_persian_text(part_text)
    if not norm_spaced:
        return 0
    norm_compact = norm_spaced.replace(" ", "")
    total = 0
    for keyword in category.keywords:
        if _matches(norm_spaced, norm_compact, keyword):
            total += keyword_weight(keyword)
    for keyword in category.strong:
        if _matches(norm_spaced, norm_compact, keyword):
            total += STRONG_KEYWORD_WEIGHT
    return total


def category_scores(*parts: str | None) -> dict[str, int]:
    cleaned = [p for p in parts if p and p.strip()]
    if not cleaned:
        return {}
    scores: dict[str, int] = {}
    for category in CATEGORIES:
        weighted = 0.0
        for idx, part in enumerate(cleaned):
            mult = PART_WEIGHTS[idx] if idx < len(PART_WEIGHTS) else 1.0
            weighted += _category_score_part(category, part) * mult
        rounded = round(weighted)
        if rounded > 0:
            scores[category.key] = rounded
    return scores


def detect_category(*parts: str | None) -> Category:
    scores = category_scores(*parts)
    if not scores:
        return FALLBACK
    best_key = max(scores, key=lambda key: (scores[key], -[c.key for c in CATEGORIES].index(key)))
    return CATEGORY_BY_KEY[best_key]


def category_label(key: str) -> str:
    return CATEGORY_BY_KEY[key].fa if key in CATEGORY_BY_KEY else FALLBACK.fa
