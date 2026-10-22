"""کشف خودکار ساختار صفحه‌ی فهرست پروژه — بدون نیاز به انتخابگر دستی.

مسئله: هر سایت فریلنسری HTML متفاوتی دارد و کلاس‌ها با هر بازطراحی عوض می‌شوند. به‌جای حدس‌زدن
انتخابگر برای هر سایت، این ماژول از خود صفحه یاد می‌گیرد:

1. عناصری که «آیتم تکرارشده» هستند را با امضای ساختاری (تگ + کلاس‌ها) پیدا می‌کند،
2. گروه‌هایی که به‌اندازه‌ی کافی تکرار شده‌اند و لینک/عنوان معتبر دارند را امتیاز می‌دهد،
3. برای هر گروه، بهترین انتخابگر عنوان/لینک و در صورت تشابه، انتخابگر بودجه/تعداد پیشنهاد/زمان را
   از روی الگوی متن پیدا می‌کند،
4. خروجی را به شکل همان `scan_selectors` می‌دهد که `konklancer_scan` می‌فهمد.

هیچ درخواست شبکه‌ای اینجا نیست؛ ورودی HTML است.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Iterable

from bs4 import BeautifulSoup, Tag

# ---------------------------------------------------------------------------
# متن، ارقام و الگوهای فارسی
# ---------------------------------------------------------------------------
FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
AR_DIGITS = "٠١٢٣٤٥٦٧٨٩"
_DIGIT_MAP = {**{ord(f): str(i) for i, f in enumerate(FA_DIGITS)}, **{ord(a): str(i) for i, a in enumerate(AR_DIGITS)}}


def normalize_digits(text: str) -> str:
    return text.translate(_DIGIT_MAP)


BUDGET_RE = re.compile(
    r"(تومان|ریال|میلیون|میلیارد|هزار|\bmillion\b|\btoman\b|\brial\b|\$|€|\bUSD\b|\bEUR\b)", re.IGNORECASE
)
BIDS_RE = re.compile(r"(پیشنهاد|پیشنهادها|bid\b|bids\b|proposal)", re.IGNORECASE)
POSTED_RE = re.compile(
    r"(دقیقه|ساعت|روز|هفته|ماه|سال|امروز|دیروز|\bhours?\b|\bminutes?\b|\bdays?\b|\bago\b)", re.IGNORECASE
)


def _text(node: Tag | None) -> str:
    if node is None:
        return ""
    return " ".join(node.get_text(" ", strip=True).split())


def has_budget_hint(text: str) -> bool:
    return bool(BUDGET_RE.search(text))


def has_bids_hint(text: str) -> bool:
    return bool(BIDS_RE.search(text))


def has_posted_hint(text: str) -> bool:
    return bool(POSTED_RE.search(text))


# ---------------------------------------------------------------------------
# امضای ساختاری عنصر
# ---------------------------------------------------------------------------
def _signature(node: Tag) -> str:
    """تگ + کلاس‌ها (حداکثر ۳ کلاس، مرتب‌شده) — پایه‌ی گروه‌بندی آیتم‌های تکرارشده."""
    classes = sorted({c for c in (node.get("class") or []) if c and len(c) < 40})[:3]
    return f"{node.name}.{'.'.join(classes)}" if classes else str(node.name)


def _css(signature: str) -> str:
    return signature


def _leaf_text_nodes(item: Tag) -> Iterable[Tag]:
    for child in item.find_all(True):
        if not child.find_all(True, recursive=False) and _text(child):
            yield child


# ---------------------------------------------------------------------------
# مدل نتیجه
# ---------------------------------------------------------------------------
@dataclass
class Candidate:
    signature: str
    count: int
    selectors: dict[str, str]
    score: float
    stats: dict[str, float] = field(default_factory=dict)
    reasons: list[str] = field(default_factory=list)
    sample_titles: list[str] = field(default_factory=list)
    sample_urls: list[str] = field(default_factory=list)

    @property
    def item_selector(self) -> str:
        return self.selectors["item"]


def _nth_of_type(node: Tag) -> int | None:
    """جایگاه عنصر بین هم‌تگ‌هایش در والد (۱-پایه)؛ اگر هم‌تگی ندارد، None."""
    parent = node.find_parent(True)
    if parent is None:
        return None
    siblings = [child for child in parent.find_all(True, recursive=False) if child.name == node.name]
    if len(siblings) <= 1:
        return None
    return siblings.index(node) + 1


def _field_selector(items: list[Tag], predicate) -> str | None:
    """انتخابگر فیلد (بودجه/پیشنهاد/زمان) را از روی الگوی متن در آیتم‌ها پیدا می‌کند.

    دقت مهم است: در جدول‌هایی که همه‌ی سلول‌ها تگ یکسان (`td`) و بدون کلاس دارند، انتخابگر
    `td` سلول اول (= عنوان) را برمی‌گرداند و داده‌ی نادرست وارد فید می‌شود. بنابراین وقتی تگ
    کلاس ندارد، جایگاه عنصر (`:nth-of-type`) هم به انتخابگر اضافه می‌شود.
    """
    counter: Counter[tuple[str, int | None]] = Counter()
    for item in items:
        seen: set[tuple[str, int | None]] = set()
        for leaf in _leaf_text_nodes(item):
            if predicate(_text(leaf)):
                signature = _signature(leaf)
                # کلاس‌دار یعنی دقيق؛ بدون کلاس یعنی باید با nth-of-type تفکیک شود
                key = (signature, None if "." in signature else _nth_of_type(leaf))
                if key not in seen:
                    seen.add(key)
                    counter[key] += 1
    if not counter:
        return None
    (signature, index), hits = counter.most_common(1)[0]
    if hits < max(2, int(len(items) * 0.5)):
        return None
    return _css(signature) if index is None else f"{_css(signature)}:nth-of-type({index})"


SKIP_TAGS = {"script", "style", "html", "body", "head", "noscript"}


def _item_groups(soup: Tag, min_count: int) -> list[tuple[str, str, list[Tag]]]:
    """گروه‌های «آیتم تکرارشده» را از دو زاویه پیدا می‌کند.

    ۱) هم‌امضا: عناصری با تگ+کلاس یکسان (مثل `div.project-card`).
    ۲) هم‌فرزند (مهم برای واقعیت سایت‌ها): فرزندان مستقیم یک والد با تگ یکسان، حتی اگر کلاس‌شان
       متفاوت باشد (مثل `tr.odd` / `tr.even` یا `li.item--first` / `li.item`). این الگو در
       جدول‌ها و لیست‌های واقعی بسیار رایج است و با روش «هم‌امضا» از دست می‌رفت.

    خروجی: فهرست (برچسب، انتخابگر CSS، عناصر).
    """
    groups: list[tuple[str, str, list[Tag]]] = []
    seen_keys: set[tuple[str, str]] = set()

    by_signature: dict[str, list[Tag]] = defaultdict(list)
    for node in soup.find_all(True):
        if node.name in SKIP_TAGS or node.find("a", href=True) is None:
            continue
        by_signature[_signature(node)].append(node)
    for signature, nodes in by_signature.items():
        if len(nodes) >= min_count:
            groups.append(("signature", _css(signature), nodes))
            seen_keys.add(("sig", signature))

    # هم‌فرزندان: والد → تگ فرزند
    for parent in soup.find_all(True):
        if parent.name in SKIP_TAGS:
            continue
        children = [child for child in parent.find_all(True, recursive=False)]
        if len(children) < min_count:
            continue
        by_tag: dict[str, list[Tag]] = defaultdict(list)
        for child in children:
            if child.name in SKIP_TAGS or child.find("a", href=True) is None:
                continue
            by_tag[child.name].append(child)
        for tag, nodes in by_tag.items():
            if len(nodes) < min_count:
                continue
            key = ("sib", f"{_signature(parent)} > {tag}")
            if key in seen_keys:
                continue
            seen_keys.add(key)
            groups.append(("sibling", f"{_css(_signature(parent))} > {tag}", nodes))
    return groups


def detect_candidates(html: str, min_count: int = 5, max_candidates: int = 6) -> list[Candidate]:
    """گروه‌های آیتم تکرارشده را با امتیاز اعتماد برمی‌گرداند (نزولی)."""
    soup = BeautifulSoup(html, "html.parser")
    candidates: list[Candidate] = []

    for kind, signature, nodes in _item_groups(soup, min_count):
        if len(nodes) < min_count:
            continue
        anchors: list[Tag] = []
        titles: list[str] = []
        urls: list[str] = []
        budget_hits = bids_hits = posted_hits = 0
        text_lengths: list[int] = []

        for node in nodes:
            best_anchor = None
            best_length = 0
            for anchor in node.find_all("a", href=True):
                label = _text(anchor)
                if len(label) >= 3 and len(label) > best_length:
                    best_anchor, best_length = anchor, len(label)
            if best_anchor is None:
                continue
            anchors.append(best_anchor)
            titles.append(_text(best_anchor))
            urls.append(best_anchor["href"])
            item_text = _text(node)
            text_lengths.append(len(item_text))
            budget_hits += has_budget_hint(item_text)
            bids_hits += has_bids_hint(item_text)
            posted_hits += has_posted_hint(item_text)

        usable = len(anchors)
        if usable < min_count:
            continue

        distinct_urls = len(set(urls)) / usable
        avg_title = sum(len(t) for t in titles) / usable
        if avg_title < 6 or distinct_urls < 0.6:
            continue
        avg_len = sum(text_lengths) / usable

        budget_ratio = budget_hits / usable
        bids_ratio = bids_hits / usable
        posted_ratio = posted_hits / usable

        # امتیاز اعتماد: تعداد تکرار، تنوع لینک، سیگنال‌های بازار (بودجه/پیشنهاد/زمان).
        # گروه هم‌فرند (لیست واقعی زیر یک والد مشترک) کمی ترجیح داده می‌شود.
        structure_bonus = 1.05 if kind == "sibling" else 1.0
        # انتخابگر کلاس‌دار دقیق‌تر از تگ خالی است (مثلاً `div.project-card` در برابر `main > div`)
        last_segment = signature.split(">")[-1]
        specificity_bonus = 3.0 if "." in last_segment or "[" in last_segment else 0.0

        # «دقت انتخابگر» — باگ واقعی روی کارلنسر: انتخابگر `div > div` داخل یک گروه ۲۴ تایی
        # درست به نظر می‌رسد، ولی وقتی روی کل صفحه اعمال شود صدها عنصر (منو، فوتر) را هم می‌گیرد.
        # پس نسبت تطبیق‌های همین انتخابگر در کل صفحه به اندازه‌ی گروه را جریمه می‌کنیم.
        css = _css(signature)
        try:
            global_matches = len(soup.select(css))
        except Exception:
            global_matches = len(nodes)
        precision = (len(nodes) / global_matches) if global_matches else 1.0
        precision_penalty = 0.45 + 0.55 * min(1.0, precision)

        score = (
            min(usable, 40) * 1.0
            + distinct_urls * 25
            + budget_ratio * 25
            + bids_ratio * 15
            + posted_ratio * 10
            + min(avg_len, 400) / 40
        ) * structure_bonus * precision_penalty + specificity_bonus

        keep_nodes = nodes[:]
        selectors = {
            "item": _css(signature),
            "title": "a[href]",
            "link": "a[href]",
        }
        budget_sel = _field_selector(keep_nodes, has_budget_hint)
        bids_sel = _field_selector(keep_nodes, has_bids_hint)
        posted_sel = _field_selector(keep_nodes, has_posted_hint)
        if budget_sel and budget_sel != signature:
            selectors["budget"] = budget_sel
        if bids_sel and bids_sel not in {signature, budget_sel}:
            selectors["bids"] = bids_sel
        if posted_sel and posted_sel not in {signature, budget_sel, bids_sel}:
            selectors["posted"] = posted_sel

        reasons = [f"{usable} آیتم تکرارشده با لینک یکتا"]
        if precision < 0.6:
            reasons.append(f"انتخابگر بیش از حد کلی است (تطبیق سراسری: {global_matches})")
        if kind == "sibling":
            reasons.append("لیست هم‌فرند زیر یک والد مشترک")
        if budget_ratio > 0:
            reasons.append(f"بودجه در {round(budget_ratio * 100)}٪ آیتم‌ها")
        if bids_ratio > 0:
            reasons.append(f"تعداد پیشنهاد در {round(bids_ratio * 100)}٪ آیتم‌ها")

        candidates.append(
            Candidate(
                signature=signature,
                count=usable,
                selectors=selectors,
                score=round(score, 2),
                stats={
                    "distinct_url_ratio": round(distinct_urls, 3),
                    "avg_title_length": round(avg_title, 1),
                    "avg_item_text_length": round(avg_len, 1),
                    "budget_ratio": round(budget_ratio, 3),
                    "bids_ratio": round(bids_ratio, 3),
                    "posted_ratio": round(posted_ratio, 3),
                },
                reasons=reasons,
                sample_titles=titles[:3],
                sample_urls=urls[:3],
            )
        )

    candidates.sort(key=lambda candidate: candidate.score, reverse=True)
    return candidates[:max_candidates]


def best_profile(html: str, min_count: int = 5) -> Candidate | None:
    candidates = detect_candidates(html, min_count=min_count)
    return candidates[0] if candidates else None
