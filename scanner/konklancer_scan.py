"""
konklancer scanner — جمع‌آوری فقط‌خواندنی پروژه‌ها از صفحات عمومی لیست پروژه.

آنچه این ابزار انجام می‌دهد:
  * خواندن صفحات عمومی فهرست پروژه (و پیش‌نمایش عمومی کانال‌های تلگرام)
  * رعایت robots.txt هر سایت و محدودیت نرخ درخواست (پیش‌فرض: هر ۸ ثانیه برای هر میزبان)
  * اگر سایت به دامنه دیگری ریدایرکت کند، درخواست را متوقف می‌کند
  * ذخیره پروژه‌ها در JSONL بدون تکرار

آنچه عمداً انجام نمی‌دهد:
  * ارسال پیشنهاد یا هر فرم/POST
  * ورود به حساب کاربری، استفاده از کوکی یا مرورگر شخصی
  * دور زدن کپچا، ضدربات یا محدودیت‌های سایت
  * تحویل خودکار کار به کارفرما یا انتشار خودکار کد

استفاده (از ریشه مخزن):
  python -m scanner.konklancer_scan list
  python -m scanner.konklancer_scan snapshot --platform parscoders      # ذخیره یک صفحه برای کالیبره کردن انتخابگرها
  python -m scanner.konklancer_scan scan --platform parscoders --pages 2 --include پایتون,python
  python -m scanner.konklancer_scan scan --telegram --include پایتون
  python -m scanner.konklancer_scan parse-file --platform parscoders --html scanner/tests/fixtures/listing_sample.html
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import re
import sys
import time
import urllib.robotparser
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup, Tag

from . import autoparse
from .taxonomy import CATEGORIES, CATEGORY_BY_KEY, category_label, detect_category

HERE = Path(__file__).resolve().parent
REGISTRY_PATH = HERE / "platforms.json"
TELEGRAM_PATH = HERE / "telegram_sources.json"
DEFAULT_OUT = HERE / "out" / "projects.jsonl"
SNAPSHOT_DIR = HERE / "out" / "snapshots"

USER_AGENT = "konklancer-scanner/0.1 (read-only public listing reader)"


# ---------------------------------------------------------------------------
# مدل داده
# ---------------------------------------------------------------------------
@dataclass
class Project:
    id: str
    source: str
    title: str
    url: str
    summary: str = ""
    budget_text: str = ""
    bids_text: str = ""
    posted_text: str = ""
    category: str = ""  # کلید دسته از shared/taxonomy.json
    scraped_at: str = ""

    def __post_init__(self) -> None:
        # دسته را همان‌جا که رکورد ساخته می‌شود حساب می‌کنیم تا سرور و UI لازم نباشد دوباره حدس بزنند.
        if not self.category:
            self.category = detect_category(self.title, self.summary).key


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _make_id(source: str, url: str) -> str:
    return hashlib.sha1(f"{source}|{url}".encode("utf-8")).hexdigest()[:16]


def _text(el) -> str:
    if el is None:
        return ""
    return " ".join(el.get_text(" ", strip=True).split())


# ---------------------------------------------------------------------------
# محدودیت نرخ و robots.txt
# ---------------------------------------------------------------------------
class RateLimiter:
    def __init__(self, delay_seconds: float):
        self.delay = delay_seconds
        self._last: dict[str, float] = {}

    def wait(self, host: str) -> None:
        last = self._last.get(host)
        if last is not None:
            gap = self.delay - (time.monotonic() - last)
            if gap > 0:
                time.sleep(gap)
        self._last[host] = time.monotonic()


class RobotsCache:
    """robots.txt هر میزبان را یک‌بار می‌خواند.

    طبق RFC 9309: 4xx یعنی «بدون محدودیت»، 5xx یا خطای شبکه یعنی «همه‌چیز ممنوع».
    توجه: stdlib از wildcard در robots (مثل /api*) پشتیبانی کامل ندارد؛
    برای مسیرهای مشکوک، بررسی دستی robots.txt را فراموش نکنید.
    """

    def __init__(self, client: httpx.Client):
        self.client = client
        self._rules: dict[str, urllib.robotparser.RobotFileParser | None] = {}
        self._blocked_reason: dict[str, str] = {}

    def allowed(self, url: str) -> bool:
        parsed = urlparse(url)
        host = parsed.netloc
        if host not in self._rules:
            self._rules[host] = self._load(f"{parsed.scheme}://{host}/robots.txt", host)
        rules = self._rules[host]
        if rules is None:
            return False
        return rules.can_fetch(USER_AGENT, url)

    def block_reason(self, host: str) -> str:
        """چرا این میزبان کنار گذاشته شد؟ network | server | disallowed | unknown"""
        return self._blocked_reason.get(host, "unknown")

    def _load(self, robots_url: str, host: str) -> urllib.robotparser.RobotFileParser | None:
        rp = urllib.robotparser.RobotFileParser()
        try:
            resp = self.client.get(robots_url, timeout=15)
        except httpx.HTTPError:
            self._blocked_reason[host] = "network"
            return None
        if resp.status_code >= 500:
            self._blocked_reason[host] = "server"
            return None
        if resp.status_code >= 400:
            rp.parse([])
            return rp
        rp.parse(resp.text.splitlines())
        return rp


# ---------------------------------------------------------------------------
# واکشی امن
# ---------------------------------------------------------------------------
def make_client(transport: httpx.BaseTransport | None = None) -> httpx.Client:
    # بعضی سایت‌ها از بیرون کند جواب می‌دهند؛ تایم‌اوت با env قابل افزایش است (پیش‌فرض ۲۰ ثانیه).
    timeout = float(os.environ.get("KONKLANCER_HTTP_TIMEOUT", "20") or 20)
    return httpx.Client(
        headers={"User-Agent": USER_AGENT, "Accept-Language": "fa,en;q=0.8"},
        timeout=timeout,
        follow_redirects=True,
        transport=transport,
    )


def fetch_html(
    client: httpx.Client,
    robots: RobotsCache,
    limiter: RateLimiter,
    url: str,
    allowed_domain: str,
) -> str:
    if not robots.allowed(url):
        host = urlparse(url).netloc
        reason = robots.block_reason(host)
        if reason == "network":
            raise PermissionError(
                f"robots.txt میزبان {host} خوانده نشد (خطای شبکه یا بی‌دسترسی)؛ "
                f"طبق RFC 9309 این میزبان محافظه‌کارانه کنار گذاشته شد: {url}"
            )
        if reason == "server":
            raise PermissionError(
                f"robots.txt میزبان {host} خطای ۵xx داد؛ این میزبان کنار گذاشته شد: {url}"
            )
        raise PermissionError(f"robots.txt این مسیر را ممنوع کرده است: {url}")
    host = urlparse(url).netloc
    limiter.wait(host)
    resp = client.get(url)
    final_host = urlparse(str(resp.url)).netloc
    if not _same_domain(final_host, allowed_domain):
        raise RuntimeError(
            f"ریدایرکت به دامنه خارج از فهرست: {final_host} (انتظار: {allowed_domain}). درخواست متوقف شد."
        )
    resp.raise_for_status()
    return resp.text


def _bare_host(netloc: str) -> str:
    """نام میزبان بدون پورت و بدون www — «127.0.0.1:8123» و «127.0.0.1» یک میزبان‌اند."""
    host = (netloc or "").split("@")[-1].split(":")[0].strip().lower().rstrip(".")
    return host[4:] if host.startswith("www.") else host


def _same_domain(host: str, domain: str) -> bool:
    """یکسان‌بودن میزبان با چشم‌پوشی از پورت و پیشوند www.

    باگ واقعی: پیش‌تر `netloc` (شامل پورت) با `domain` مقایسه می‌شد و هر ریدایرکت
    به همان میزبان ولی با پورت دیگر «دامنه‌ی خارج» تشخیص داده می‌شد.
    """
    a, b = _bare_host(host), _bare_host(domain)
    if not a or not b:
        return False
    return a == b or a.endswith("." + b) or b.endswith("." + a)


# ---------------------------------------------------------------------------
# تجزیه‌گرها
# ---------------------------------------------------------------------------
def _selector_list(value) -> list[str]:
    """هر مقدار انتخابگر می‌تواند رشته یا فهرست رشته باشد (زنجیره‌ی fallback)."""
    if not value:
        return []
    if isinstance(value, str):
        return [value]
    return [str(item) for item in value if item]


def _select_items(soup: Tag, specs) -> list[Tag]:
    """اولین انتخابگری که نتیجه می‌دهد را برمی‌گرداند (fallback به ترتیب)."""
    for spec in _selector_list(specs):
        try:
            found = soup.select(spec)
        except Exception:  # انتخابگر نامعتبر (مثلاً :has-text مربوط به Playwright)
            continue
        if found:
            return found
    return []


_LABEL_PREFIX = "label:"


def _labelled_value(scope: Tag, label: str) -> str:
    """مقدارِ کنارِ یک برچسب فارسی را پیدا می‌کند (الگوی رایج سایت‌های واقعی: «پیشنهادها  ۳»).

    ساختارها متفاوت‌اند، پس چند حالت امتحان می‌شود: خواهر-برادر بعدی، متن باقی‌مانده‌ی والد،
    و «آخرین مقدار داخل والد». اگر هیچ‌کدام جواب نداد، رشته‌ی خالی برمی‌گردد.
    """
    needle = label.strip()
    if not needle:
        return ""
    label_el = None
    for el in scope.find_all(True):
        if el.find(True) is not None:
            continue  # فقط برگ‌ها (متن مستقیم)
        if el.get_text(" ", strip=True) == needle:
            label_el = el
            break
    if label_el is None:
        return ""
    # حالت ۱: خواهر بعدی
    for sibling in label_el.next_siblings:
        text = _text(sibling) if isinstance(sibling, Tag) else str(sibling).strip()
        if text:
            return text
    # حالت ۲: سایر فرزندان والد (بدون تکرار برچسب)
    parent = label_el.find_parent(True)
    if parent is not None:
        values = [
            _text(child)
            for child in parent.find_all(True)
            if child is not label_el and _text(child) and _text(child) != needle
        ]
        if values:
            return values[-1]
    return ""


def _select_one(scope: Tag, specs) -> Tag | None:
    for spec in _selector_list(specs):
        if isinstance(spec, str) and spec.startswith(_LABEL_PREFIX):
            value = _labelled_value(scope, spec[len(_LABEL_PREFIX):])
            if value:
                # مقدار متنی است؛ برای سازگاری با امضای تابع، یک عنصر نگه‌دارنده می‌سازیم.
                holder = BeautifulSoup(f"<span>{value}</span>", "html.parser").span
                return holder
            continue
        try:
            found = scope.select_one(spec)
        except Exception:
            continue
        if found is not None:
            return found
    return None


SUMMARY_MAX_CHARS = 1200

#: مسیرهایی که هیچ‌وقت صفحه‌ی پروژه نیستند (منو/فوتر/حساب کاربری)
NAV_PATHS = {
    "", "/", "/login", "/signin", "/signup", "/register", "/post-job", "/new-project",
    "/blog", "/about", "/contact", "/faq", "/terms", "/privacy", "/panel", "/dashboard",
    "/jobs", "/services", "/freelancers", "/freelancer", "/users", "/profile", "/search",
    "/hire", "/talent", "/employers", "/employer",
}
#: عنوان‌هایی که آیتم منو هستند، نه پروژه
NAV_TITLES = {
    "خانه", "ورود", "ورود به کارلنسر", "ثبت نام", "ثبت‌نام", "ثبت پروژه", "ثبت پروژه رایگان",
    "تماس با ما", "درباره ما", "قوانین", "پنل کاربری", "جستجو", "دسته‌بندی‌ها",
}


def _looks_like_nav_item(url: str, title: str) -> bool:
    """آیتم منو/فوتر را از پروژه‌ی واقعی جدا می‌کند (خطای دیده‌شده در اسکن واقعی کارلنسر)."""
    path = urlparse(url).path.rstrip("/").lower()
    if path in NAV_PATHS:
        return True
    if re.search(
        r"/(login|signin|signup|register|post-job|new-project|blog|about|contact|faq|terms|privacy"
        r"|panel|dashboard|hire|talent|employers?|freelancers?|services?|jobs?)(/|$)",
        path,
    ):
        return True
    if re.search(r"/(api|assets?|static|img|images|uploads|files)/", path):
        return True
    cleaned = re.sub(r"\s+", " ", title).strip()
    if cleaned in NAV_TITLES:
        return True
    # عنوان‌های خیلی کوتاه یا بی‌حرف (مثل «📢» یا «خانه») پروژه نیستند
    letters = re.sub(r"[^\wآ-یءئ]", "", cleaned, flags=re.UNICODE)
    return len(letters) < 5


def _matches_project_path(url: str, pattern: str | None) -> bool:
    """آیا مسیر این نشانی، مسیر یک «صفحه‌ی پروژه» است؟ (الگو از platforms.json می‌آید)"""
    if not pattern:
        return True
    path = urlparse(url).path
    try:
        return re.search(pattern, path) is not None
    except re.error:
        return True


def parse_listing(
    html: str,
    base_url: str,
    source: str,
    selectors: dict,
    project_path_pattern: str | None = None,
) -> list[Project]:
    """تجزیه‌گر عمومی بر اساس انتخابگرهای CSS که در platforms.json ثبت می‌شوند.

    کلیدهای الزامی: item, title. اختیاری: link, summary, budget, bids, posted.
    هر کلید می‌تواند رشته یا فهرست رشته باشد (اولین انتخابگر موفق استفاده می‌شود) و
    مقادیر تکراری بر اساس URL حذف می‌شوند.
    """
    soup = BeautifulSoup(html, "html.parser")
    projects: list[Project] = []
    seen_urls: set[str] = set()
    for item in _select_items(soup, selectors.get("item")):
        title_el = _select_one(item, selectors.get("title"))
        if selectors.get("link"):
            link_el = _select_one(item, selectors["link"])
        else:
            link_el = title_el if (title_el is not None and title_el.name == "a") else item.select_one("a[href]")
        title = _text(title_el)
        href = link_el.get("href") if link_el is not None else None
        if not title or not href:
            continue
        url = urljoin(base_url, href)
        if url in seen_urls or _looks_like_nav_item(url, title) or not _matches_project_path(url, project_path_pattern):
            continue
        seen_urls.add(url)
        projects.append(
            Project(
                id=_make_id(source, url),
                source=source,
                title=title,
                url=url,
                summary=(
                    _text(_select_one(item, selectors.get("summary")))[:SUMMARY_MAX_CHARS]
                    if selectors.get("summary")
                    else ""
                ),
                budget_text=_text(_select_one(item, selectors.get("budget"))) if selectors.get("budget") else "",
                bids_text=_text(_select_one(item, selectors.get("bids"))) if selectors.get("bids") else "",
                posted_text=_text(_select_one(item, selectors.get("posted"))) if selectors.get("posted") else "",
                scraped_at=_now(),
            )
        )
    return projects


def parse_telegram_preview(html: str, username: str) -> list[Project]:
    """پیش‌نمایش عمومی t.me/s/<username>: هر پست یک پروژه‌ی احتمالی است."""
    source = f"telegram:{username}"
    soup = BeautifulSoup(html, "html.parser")
    projects: list[Project] = []
    for msg in soup.select("div.tgme_widget_message"):
        text_el = msg.select_one(".tgme_widget_message_text")
        date_link = msg.select_one("a.tgme_widget_message_date")
        if text_el is None or date_link is None or not date_link.get("href"):
            continue
        # متن واقعی تلگرام با <tg-emoji> و <b>/<i> درهم است؛ با «فاصله» به‌هم می‌چسبانیم تا
        # خط اول به ایموجی تنها تبدیل نشود (باگی که در داده‌ی زنده دیده شد: عنوان «📢»).
        body = re.sub(r"\s+", " ", text_el.get_text(" ", strip=True)).strip()
        if len(body) < 20:
            continue
        time_el = msg.select_one("time")
        url = date_link["href"]
        projects.append(
            Project(
                id=_make_id(source, url),
                source=source,
                title=_telegram_title(body),
                url=url,
                summary=body[:1000],
                posted_text=time_el.get("datetime", "") if time_el is not None else "",
                scraped_at=_now(),
            )
        )
    return projects


def _telegram_title(body: str) -> str:
    """عنوان خوانا از متن پیام: ایموجی‌ها حذف، و اگر «عنوان:» داشت همان برداشته می‌شود."""
    cleaned = re.sub(r"[\U0001F000-\U0001FAFF\u2190-\u27BF\u2B00-\u2BFF\uFE0F\u200d]", " ", body)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" :،-|")
    match = re.search(r"(?:عنوان|موضوع)\s*[:：]\s*(.+?)(?:\s*(?:شرح|توضیح|بودجه|دسته)|$)", cleaned)
    if match:
        candidate = match.group(1).strip(" :،-|")
        if len(candidate) >= 8:
            return candidate[:200]
    return cleaned[:200]


# ---------------------------------------------------------------------------
# فیلتر، ذخیره و ثبت
# ---------------------------------------------------------------------------
def matches(
    project: Project,
    include: Iterable[str],
    exclude: Iterable[str],
    *,
    categories: Iterable[str] = (),
) -> bool:
    """فیلتر کلیدواژه‌ای و دسته‌ای.

    پیش‌فرض هیچ فیلتری ندارد: هر نوع پروژه‌ای (ترجمه، طراحی، گرافیک، محتوا، کد، ...) وارد فید می‌شود.
    `include` فقط وقتی اعمال می‌شود که صریحاً چیزی داده شده باشد، و `categories` با کلیدهای
    shared/taxonomy.json کار می‌کند.
    """
    blob = f"{project.title} {project.summary}".lower()
    if any(x.lower() in blob for x in exclude if x):
        return False
    include = [x for x in include if x]
    if include and not any(x.lower() in blob for x in include):
        return False
    wanted = [c for c in categories if c]
    if wanted and project.category not in wanted:
        return False
    return True


def load_seen_ids(path: Path) -> set[str]:
    if not path.exists():
        return set()
    seen = set()
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                seen.add(json.loads(line)["id"])
    return seen


def append_projects(path: Path, projects: list[Project]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    seen = load_seen_ids(path)
    new = [p for p in projects if p.id not in seen]
    with path.open("a", encoding="utf-8") as f:
        for p in new:
            f.write(json.dumps(asdict(p), ensure_ascii=False) + "\n")
    return len(new)


def load_registry() -> dict:
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def get_platform(registry: dict, key: str) -> dict:
    for p in registry["platforms"]:
        if p["id"] == key:
            return p
    raise SystemExit(f"پلتفرم ناشناخته: {key}")


def page_url(template: str, page: int) -> str:
    if "{page}" in template:
        return template.format(page=page)
    if page == 1:
        return template
    sep = "&" if "?" in template else "?"
    return f"{template}{sep}page={page}"


# ---------------------------------------------------------------------------
# فرمان‌ها
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# پاک‌سازی فید ذخیره‌شده
# ---------------------------------------------------------------------------
def cmd_prune(args) -> int:
    """فید JSONL را از ردیف‌های بی‌ربط/تکراری پاک می‌کند (بدون تماس شبکه‌ای).

    چرا: فید تجمیعی شامل ردیف‌هایی است که نسخه‌های قبلی اسکنر (با انتخابگر عمومی) گرفته‌اند —
    مثلاً «خانه»، «ورود به کارلنسر» یا صفحه‌های `/hire/…`. اگر پاک نشوند، پروژه‌های واقعی و
    زباله قاطی می‌شوند و کاربر فکر می‌کند اسکنر خراب است.
    """
    path = Path(args.file)
    if not path.exists():
        print(f"فایل موجود نیست: {path}")
        return 1
    registry = load_registry()
    patterns = {
        plat["id"]: plat.get("project_path_pattern")
        for plat in registry.get("platforms", [])
    }
    # کانال‌های غیرفعال نباید در فید بمانند (مثلاً کانال آموزشی که پروژه ندارد)
    enabled_channels: set[str] = set()
    tg_path = Path(__file__).with_name("telegram_sources.json")
    if tg_path.exists():
        for channel in json.loads(tg_path.read_text(encoding="utf-8")).get("channels", []):
            if channel.get("scan_enabled"):
                enabled_channels.add(f"telegram:{channel['username']}")
    rows: list[dict] = []
    seen_ids: set[str] = set()
    dropped_nav = 0
    dropped_dup = 0
    dropped_path = 0
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            dropped_nav += 1
            continue
        if _looks_like_nav_item(str(row.get("url", "")), str(row.get("title", ""))):
            dropped_nav += 1
            continue
        source = str(row.get("source", ""))
        if source.startswith("telegram:") and enabled_channels and source not in enabled_channels:
            dropped_path += 1
            continue
        if not _matches_project_path(str(row.get("url", "")), patterns.get(source)):
            dropped_path += 1
            continue
        row_id = str(row.get("id") or "")
        if row_id and row_id in seen_ids:
            dropped_dup += 1
            continue
        if row_id:
            seen_ids.add(row_id)
        rows.append(row)
    rows.sort(key=lambda r: str(r.get("scraped_at") or ""))
    total = len(rows) + dropped_nav + dropped_dup + dropped_path
    print(
        f"{total} ردیف خوانده شد؛ {dropped_nav} ناوبری، {dropped_path} خارج از الگوی پروژه/کانال غیرفعال و "
        f"{dropped_dup} تکراری حذف شد؛ {len(rows)} ردیف ماند"
    )
    if getattr(args, "apply", False):
        path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
        print(f"نوشته شد: {path}")
    else:
        print("(حالت آزمایشی — برای نوشتن --apply بدهید)")
    return 0


def cmd_list(_args) -> int:
    reg = load_registry()
    print("== پلتفرم‌ها ==")
    for p in reg["platforms"]:
        if p.get("scan_selectors"):
            scan = "فعال" if p.get("scan_enabled") else "کالیبره‌شده (غیرفعال)"
        elif p.get("listing_url_candidates"):
            scan = "نامزد دارد → probe/autoscan"
        else:
            scan = "غیرفعال (بدون نامزد)"
        print(f"{p['id']:<16} {p.get('name', ''):<20} {p['status']:<16} اسکن: {scan}")

    tg = json.loads(TELEGRAM_PATH.read_text(encoding="utf-8"))
    print("\n== کانال‌های تلگرام ==")
    for ch in tg["channels"]:
        scan = "فعال" if ch.get("scan_enabled") else "غیرفعال"
        print(f"@{ch['username']:<21} {ch.get('status', '?'):<14} اسکن: {scan}")

    print("\n== دسته‌بندی‌ها (همه به‌صورت پیش‌فرض اسکن می‌شوند) ==")
    print(" · ".join(f"{c.key}({c.fa})" for c in CATEGORIES))
    print(
        "\nقدم بعد: autoscan --platform parscoders,ponisha  (کشف خودکار ساختار + نوشتن در فید)\n"
        "           enable --telegram <username>           (فعال‌کردن کانال تلگرام)"
    )
    return 0


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _save_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def cmd_toggle(args) -> int:
    """فعال/غیرفعال کردن اسکن یک پلتفرم یا یک کانال تلگرام (فقط یک فلگ در فایل‌های رجیستری).

    برای پلتفرم، فعال‌سازی بدون انتخابگر CSS بی‌معنی است و رد می‌شود؛ روند کالیبراسیون
    در scanner/README.md توضیح داده شده است.
    """
    enable = args.cmd == "enable"
    if bool(args.platform) == bool(args.telegram):
        raise SystemExit("دقیقاً یکی از --platform یا --telegram را بدهید.")

    if args.platform:
        data = _load_json(REGISTRY_PATH)
        for platform in data["platforms"]:
            if platform["id"] != args.platform:
                continue
            has_selectors = bool(platform.get("scan_selectors"))
            has_candidates = bool(platform.get("listing_url_candidates"))
            if enable and not (has_selectors or has_candidates):
                raise SystemExit(
                    f"{platform['id']} نه انتخابگر CSS دارد و نه نامزد نشانی؛ فعال‌سازی بی‌نتیجه است. "
                    "ابتدا با `autodetect --platform <id> --html SAVED.html --save` کالیبره کنید "
                    "(راهنما: scanner/README.md و docs/PERSONAL-SETUP.md)."
                )
            platform["scan_enabled"] = enable
            _save_json(REGISTRY_PATH, data)
            state = "فعال" if enable else "غیرفعال"
            mode = "انتخابگر ذخیره‌شده" if has_selectors else "کشف خودکار در زمان اسکن"
            print(f"اسکن پلتفرم {platform['name']} ({platform['id']}) {state} شد ({mode}).")
            return 0
        raise SystemExit(f"پلتفرم ناشناخته: {args.platform}")

    data = _load_json(TELEGRAM_PATH)
    for channel in data["channels"]:
        if channel["username"] != args.telegram:
            continue
        channel["scan_enabled"] = enable
        _save_json(TELEGRAM_PATH, data)
        state = "فعال" if enable else "غیرفعال"
        print(f"اسکن کانال @{channel['username']} {state} شد.")
        return 0
    raise SystemExit(f"کانال ناشناخته: {args.telegram}")


def cmd_snapshot(args) -> int:
    """یک صفحه‌ی لیست را برای کالیبره کردن انتخابگرها ذخیره می‌کند (فقط یک درخواست)."""
    reg = load_registry()
    plat = get_platform(reg, args.platform)
    if not plat.get("listing_url"):
        raise SystemExit("این پلتفرم listing_url ندارد.")
    url = page_url(plat["listing_url"], 1)
    with make_client() as client:
        html = fetch_html(client, RobotsCache(client), RateLimiter(args.delay), url, plat["domain"])
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    out = SNAPSHOT_DIR / f"{plat['id']}.html"
    out.write_text(html, encoding="utf-8")
    print(f"ذخیره شد: {out} ({len(html)} کاراکتر). انتخابگرها را از روی آن تنظیم کنید.")
    return 0


def _strip_inline_assets(html: str) -> str:
    """بدنه‌ی <script>/<style> را حذف می‌کند (فقط برای ذخیره‌ی فیکسچر؛ ساختار DOM دست‌نخورده می‌ماند)."""
    html = re.sub(r"(?is)<script\b[^>]*>.*?</script>", "<script></script>", html)
    html = re.sub(r"(?is)<style\b[^>]*>.*?</style>", "<style></style>", html)
    return html


def _slug(text: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_.-]+", "-", text).strip("-").lower()
    return slug[:60] or "page"


def cmd_capture(args) -> int:
    """نمونه‌ی HTML واقعی صفحه‌ها را برای کالیبراسیون/تست آفلاین ذخیره می‌کند.

    قواعد ایمنی همان اسکن است: robots.txt هر میزبان بررسی می‌شود، بین درخواست‌ها فاصله می‌افتد
    و ریدایرکت خارج از دامنه متوقف می‌شود. اسکریپت‌ها حذف می‌شوند تا فایل سبک و قابل‌کامیت بماند.
    """
    reg = load_registry()
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    targets: list[tuple[str, str]] = []
    for item in [x.strip() for x in (args.target or "").split(",") if x.strip()]:
        if item.startswith("http://") or item.startswith("https://"):
            targets.append((_slug(urlparse(item).path or urlparse(item).netloc), item))
        else:
            plat = get_platform(reg, item)
            url = _platform_urls(plat)
            targets.append((plat["id"], page_url(url[0], 1) if url else ""))
    if args.telegram:
        tg = json.loads(TELEGRAM_PATH.read_text(encoding="utf-8"))
        for channel in tg["channels"]:
            targets.append((f"telegram-{channel['username']}", f"https://t.me/s/{channel['username']}"))

    if not targets:
        raise SystemExit("چیزی برای ذخیره انتخاب نشده. مثلاً: capture --target parscoders,ponisha --telegram")

    manifest_path = out_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    ok = 0

    with make_client() as client:
        robots = RobotsCache(client)
        limiter = RateLimiter(args.delay)
        for name, url in targets:
            if not url:
                print(f"[{name}] نشانی ندارد؛ رد شد.", file=sys.stderr)
                continue
            host = urlparse(url).netloc
            html, error = _fetch_once(client, robots, limiter, url, host)
            if html is None:
                print(f"[{name}] ذخیره نشد — {error}", file=sys.stderr)
                manifest[name] = {"url": url, "ok": False, "error": error, "captured_at": _now()}
                continue
            cleaned = _strip_inline_assets(html)
            if args.max_bytes:
                cleaned = cleaned[: args.max_bytes]
            payload = cleaned.encode("utf-8")
            out = out_dir / f"{name}.html.gz"
            with gzip.open(out, "wb") as fh:
                fh.write(payload)
            manifest[name] = {
                "url": url,
                "ok": True,
                "raw_chars": len(html),
                "kept_chars": len(cleaned),
                "gz_bytes": out.stat().st_size,
                "sha256_kept": hashlib.sha256(payload).hexdigest()[:16],
                "captured_at": _now(),
            }
            ok += 1
            print(f"[{name}] ذخیره شد: {out.name} ({len(cleaned)} کاراکتر → {out.stat().st_size} بایت فشرده)")

    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{ok} نمونه ذخیره شد. فهرست: {manifest_path}")
    return 0


def cmd_parse_file(args) -> int:
    """تجزیه‌ی یک صفحه‌ی HTML محلی (مثلاً صفحه‌ای که خودتان در مرورگر ذخیره کرده‌اید).

    با --out نتیجه در فید JSONL نوشته می‌شود؛ این مسیر به هیچ درخواست خودکاری به سایت نیاز ندارد
    و برای راه‌اندازی شخصی، وقتی robots یا ضدربات اجازه‌ی اسکن خودکار نمی‌دهد، مناسب است.
    """
    reg = load_registry()
    plat = get_platform(reg, args.platform)
    html = Path(args.html).read_text(encoding="utf-8")
    selectors = json.loads(args.selectors_json) if args.selectors_json else plat.get("scan_selectors")
    if not selectors:
        raise SystemExit("انتخابگرها تعریف نشده‌اند؛ --selectors-json بدهید یا scan_selectors را در platforms.json ثبت کنید.")
    base = plat.get("listing_url") or f"https://{plat['domain']}/"
    projects = parse_listing(html, base, plat["id"], selectors, plat.get("project_path_pattern"))
    include = [x.strip() for x in args.include.split(",") if x.strip()]
    exclude = [x.strip() for x in args.exclude.split(",") if x.strip()]
    kept = [p for p in projects if matches(p, include, exclude)]
    for p in kept:
        print(f"- {p.title}  ->  {p.url}")
    print(f"{len(projects)} مورد تجزیه شد، {len(kept)} مورد پس از فیلتر.")
    if args.out:
        added = append_projects(Path(args.out), kept)
        print(f"{added} مورد جدید در {args.out} نوشته شد.")
    return 0


def cmd_parse_telegram_file(args) -> int:
    """پیش‌نمایش عمومی یک کانال را از فایل HTML محلی تجزیه می‌کند (t.me/s/<username>)."""
    html = Path(args.html).read_text(encoding="utf-8")
    include = [x.strip() for x in args.include.split(",") if x.strip()]
    exclude = [x.strip() for x in args.exclude.split(",") if x.strip()]
    projects = parse_telegram_preview(html, args.channel)
    kept = [p for p in projects if matches(p, include, exclude)]
    for p in kept:
        print(f"- {p.title}  ->  {p.url}")
    print(f"{len(projects)} پیام تجزیه شد، {len(kept)} مورد پس از فیلتر.")
    if args.out:
        added = append_projects(Path(args.out), kept)
        print(f"{added} مورد جدید در {args.out} نوشته شد.")
    return 0


def _platform_urls(plat: dict) -> list[str]:
    """نشانی‌های فهرست پروژه: ابتدا listing_url و بعد گزینه‌های جایگزین."""
    urls: list[str] = []
    for value in [plat.get("listing_url"), *(plat.get("listing_url_candidates") or [])]:
        if value and value not in urls:
            urls.append(value)
    return urls


def _candidate_profiles(plat: dict) -> list[tuple[str, dict]]:
    """مجموعه‌های انتخابگر: انتخابگرهای ذخیره‌شده + نامزدهای کالیبره‌نشده."""
    profiles: list[tuple[str, dict]] = []
    if plat.get("scan_selectors"):
        profiles.append(("ذخیره‌شده در platforms.json", plat["scan_selectors"]))
    for index, candidate in enumerate(plat.get("scan_selectors_candidates") or [], start=1):
        if isinstance(candidate, dict) and "selectors" in candidate:
            profiles.append((candidate.get("label") or f"نامزد {index}", candidate["selectors"]))
        elif isinstance(candidate, dict):
            profiles.append((f"نامزد {index}", candidate))
    return profiles


def _scan_platform(
    client,
    robots: RobotsCache,
    limiter: RateLimiter,
    plat: dict,
    pages: int,
    auto: bool,
) -> tuple[list[Project], str]:
    """یک پلتفرم را می‌خواند. اگر انتخابگری ذخیره نشده باشد و `auto` روشن باشد،
    ساختار صفحه در همان لحظه کشف و استفاده می‌شود (بدون هیچ داده‌ی ساختگی)."""
    collected: list[Project] = []
    urls = _platform_urls(plat)
    if not urls:
        return collected, "listing_url ندارد"
    selectors = plat.get("scan_selectors")
    discovered_note = ""
    working_template = urls[0]
    for n in range(1, pages + 1):
        html = None
        last_err = ""
        url = page_url(working_template, n)
        candidates = [working_template] if n > 1 else urls
        for candidate_tpl in candidates:
            url = page_url(candidate_tpl, n)
            try:
                html = fetch_html(client, robots, limiter, url, plat["domain"])
                working_template = candidate_tpl
                break
            except (PermissionError, RuntimeError, httpx.HTTPError) as e:
                last_err = str(e)
        if html is None:
            return collected, f"صفحه {n}: {last_err}"
        if not selectors and auto:
            best = autoparse.best_profile(html, min_count=3)
            if best is None:
                return collected, f"صفحه {n}: ساختار آیتم‌ها در HTML تشخیص داده نشد"
            selectors = best.selectors
            discovered_note = f"کشف خودکار ساختار: {best.item_selector} ({best.count} آیتم، امتیاز {best.score})"
        if not selectors:
            return collected, (
                "انتخابگر CSS ثبت نشده است؛ با `autoscan --platform "
                f"{plat['id']} --save` یا `probe --platform {plat['id']}` کالیبره کنید"
            )
        collected += parse_listing(html, url, plat["id"], selectors, plat.get("project_path_pattern"))
    return collected, discovered_note


def _scope_platforms(registry: dict, requested: list[str], telegram_enabled: bool) -> list[dict]:
    """پلتفرم‌هایی که باید خوانده شوند: صریح در CLI، یا همه‌ی فعال‌شده‌ها."""
    if requested:
        return [get_platform(registry, key) for key in requested]
    return [
        plat
        for plat in registry["platforms"]
        if plat.get("scan_enabled") and (plat.get("scan_selectors") or plat.get("listing_url_candidates"))
    ]


def cmd_scan(args) -> int:
    include = args.include.split(",") if args.include else []
    exclude = args.exclude.split(",") if args.exclude else []
    categories = [c.strip() for c in args.categories.split(",") if c.strip()] if args.categories else []
    platforms = [p.strip() for p in args.platform.split(",") if p.strip()] if args.platform else []
    collected: list[Project] = []
    notes: list[str] = []

    with make_client() as client:
        robots = RobotsCache(client)
        limiter = RateLimiter(args.delay)

        if platforms or args.telegram is False:
            reg = load_registry()
            for plat in _scope_platforms(reg, platforms, args.telegram):
                if not platforms and not (plat.get("scan_enabled") or args.auto):
                    continue
                if not platforms and not plat.get("scan_enabled"):
                    continue
                found, note = _scan_platform(client, robots, limiter, plat, args.pages, args.auto)
                collected += found
                label = f"{plat['id']}: {len(found)} پروژه"
                if note:
                    label += f" — {note}"
                notes.append(label)
                print(label)

        if args.telegram:
            tg = json.loads(TELEGRAM_PATH.read_text(encoding="utf-8"))
            for ch in tg["channels"]:
                if not ch.get("scan_enabled"):
                    continue
                url = f"https://t.me/s/{ch['username']}"
                try:
                    html = fetch_html(client, robots, limiter, url, "t.me")
                except (PermissionError, RuntimeError, httpx.HTTPError) as e:
                    print(f"[توقف] @{ch['username']}: {e}", file=sys.stderr)
                    continue
                items = parse_telegram_preview(html, ch["username"])
                collected += items
                print(f"@{ch['username']}: {len(items)} پیام")

    if not collected and not notes:
        raise SystemExit(
            "هیچ منبعی برای اسکن پیدا نشد. یا --platform/--telegram بدهید، یا منابع را با "
            "`enable` فعال کنید، یا از `autoscan --platform <id>` استفاده کنید."
        )

    kept = [p for p in collected if matches(p, include, exclude, categories=categories)]
    added = append_projects(Path(args.out), kept)
    print(f"{len(collected)} مورد خوانده شد؛ {len(kept)} پس از فیلتر؛ {added} مورد جدید در {args.out}")
    return 0


# ---------------------------------------------------------------------------
# کالیبراسیون و کشف خودکار
# ---------------------------------------------------------------------------
def _fetch_once(client, robots, limiter, url: str, domain: str) -> tuple[str | None, str]:
    try:
        return fetch_html(client, robots, limiter, url, domain), ""
    except PermissionError as e:
        return None, str(e)
    except RuntimeError as e:
        return None, str(e)
    except httpx.HTTPError as e:
        return None, f"خطای HTTP: {e}"


def _profile_quality(projects: list[Project]) -> dict:
    total = len(projects)
    with_budget = sum(1 for p in projects if p.budget_text)
    with_bids = sum(1 for p in projects if p.bids_text)
    return {
        "items": total,
        "with_budget": with_budget,
        "with_bids": with_bids,
        "budget_ratio": round(with_budget / total, 2) if total else 0.0,
    }


def _report_profile(label: str, quality: dict, samples: list[Project]) -> None:
    print(
        f"   {label}: {quality['items']} آیتم · بودجه در {quality['with_budget']} · "
        f"پیشنهاد در {quality['with_bids']}"
    )
    for project in samples[:3]:
        extra = f" | {project.budget_text}" if project.budget_text else ""
        print(f"      - {project.title[:70]}{extra}")


def cmd_probe(args) -> int:
    """نامزدهای نشانی/انتخابگر را روی صفحه‌ی زنده امتحان می‌کند و بهترین را گزارش (و در صورت
    `--save` ذخیره) می‌کند. این تنها راه معتبر کالیبراسیون است: با HTML واقعی همان سایت."""
    reg = load_registry()
    plat = get_platform(reg, args.platform)
    urls = [args.url] if args.url else _platform_urls(plat)
    if not urls:
        raise SystemExit("این پلتفرم هیچ listing_url یا listing_url_candidates ندارد.")
    profiles = _candidate_profiles(plat)
    if not profiles:
        raise SystemExit(
            "هیچ انتخابگر ذخیره‌شده یا نامزدی وجود ندارد. با "
            f"`autodetect --platform {plat['id']}` ساختار صفحه را کشف کنید."
        )

    best: tuple[float, str, dict, str, dict] | None = None
    with make_client() as client:
        robots = RobotsCache(client)
        limiter = RateLimiter(args.delay)
        for url in urls:
            target = page_url(url, 1)
            html, error = _fetch_once(client, robots, limiter, target, plat["domain"])
            if html is None:
                print(f"[رد شد] {target}\n   دلیل: {error}")
                continue
            print(f"[خوانده شد] {target} ({len(html)} کاراکتر)")
            for label, selectors in profiles:
                try:
                    projects = parse_listing(html, target, plat["id"], selectors, plat.get("project_path_pattern"))
                except Exception as exc:  # انتخابگر نامعتبر نباید کل probe را بیندازد
                    print(f"   {label}: انتخابگر نامعتبر ({exc})")
                    continue
                quality = _profile_quality(projects)
                _report_profile(label, quality, projects)
                confidence = quality["items"] + quality["budget_ratio"] * 5 + quality["with_bids"] * 0.5
                if quality["items"] >= (args.min_items or 3) and (
                    best is None or confidence > best[0]
                ):
                    best = (confidence, target, selectors, label, quality)

    if best is None:
        print(
            "\nهیچ نامزدی به نتیجه‌ی قابل‌قبول نرسید. مسیر مطمئن: صفحه را در مرورگر ذخیره کنید و "
            f"`autodetect --platform {plat['id']} --html FILE.html` را اجرا کنید."
        )
        return 1

    _, target, selectors, label, quality = best
    print(f"\nبهترین نتیجه: «{label}» روی {target} با {quality['items']} آیتم")
    print(json.dumps({"listing_url": target, "scan_selectors": selectors, "quality": quality}, ensure_ascii=False, indent=2))

    if args.save:
        data = load_registry()
        for item in data["platforms"]:
            if item["id"] == plat["id"]:
                item["listing_url"] = target
                item["scan_selectors"] = selectors
                item["calibrated_at"] = _now()
                item["calibrated_from"] = label
                break
        REGISTRY_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"در platforms.json ذخیره شد. برای فعال‌کردن اسکن خودکار: enable --platform {plat['id']}")
    return 0


def _autodetect_from_source(args, plat: dict) -> tuple[list[autoparse.Candidate], str]:
    if args.html:
        html = Path(args.html).read_text(encoding="utf-8")
        return autoparse.detect_candidates(html, min_count=args.min_count), args.html
    urls = [args.url] if args.url else _platform_urls(plat)
    if not urls:
        raise SystemExit("برای تشخیص خودکار، یا --html بدهید یا برای پلتفرم listing_url ثبت کنید.")
    with make_client() as client:
        robots = RobotsCache(client)
        limiter = RateLimiter(args.delay)
        for url in urls:
            target = page_url(url, 1)
            html, error = _fetch_once(client, robots, limiter, target, plat["domain"])
            if html is None:
                print(f"[رد شد] {target} — {error}", file=sys.stderr)
                continue
            return autoparse.detect_candidates(html, min_count=args.min_count), target
    raise SystemExit("هیچ صفحه‌ای خوانده نشد (robots/شبکه/دسترسی).")


def cmd_autodetect(args) -> int:
    """ساختار آیتم‌های صفحه را کشف می‌کند و انتخابگرهای پیشنهادی را چاپ می‌کند."""
    reg = load_registry() if args.platform else {}
    plat = get_platform(reg, args.platform) if args.platform else {"id": args.source or "local", "domain": "", "listing_url": args.url}
    candidates, origin = _autodetect_from_source(args, plat)

    if not candidates:
        print(f"در {origin} هیچ ساختار آیتم تکرارشده‌ای پیدا نشد (min-count={args.min_count}).")
        return 1

    print(f"منبع HTML: {origin}")
    for index, candidate in enumerate(candidates, start=1):
        print(f"\n[{index}] {candidate.item_selector} — امتیاز {candidate.score}")
        print(f"    آیتم: {candidate.count} · {', '.join(candidate.reasons)}")
        print(f"    آمار: {json.dumps(candidate.stats, ensure_ascii=False)}")
        print(f"    نمونه: {candidate.sample_titles[0][:60] if candidate.sample_titles else '—'}")
        print(f"    انتخابگرها: {json.dumps(candidate.selectors, ensure_ascii=False)}")

    top = candidates[0]
    if args.save:
        if not args.platform:
            raise SystemExit("برای ذخیره، --platform لازم است.")
        data = load_registry()
        for item in data["platforms"]:
            if item["id"] == args.platform:
                item["scan_selectors"] = top.selectors
                item["calibrated_at"] = _now()
                item["calibrated_from"] = f"autodetect:{origin}"
                break
        REGISTRY_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\nانتخابگرهای گزینه‌ی [1] در platforms.json ذخیره شد. برای فعال‌کردن: enable --platform {args.platform}")
    return 0


def cmd_autoscan(args) -> int:
    """یک‌مرحله‌ای: صفحه‌ی زنده را می‌خواند، ساختار را کشف/استفاده می‌کند و در فید می‌نویسد."""
    platforms = [p.strip() for p in args.platform.split(",") if p.strip()] if args.platform else []
    reg = load_registry()
    include = [x.strip() for x in args.include.split(",") if x.strip()]
    exclude = [x.strip() for x in args.exclude.split(",") if x.strip()]
    categories = [c.strip() for c in args.categories.split(",") if c.strip()] if args.categories else []
    collected: list[Project] = []
    saved: list[str] = []

    targets = _scope_platforms(reg, platforms, False)
    if not targets:
        raise SystemExit(
            "هیچ پلتفرمی انتخاب نشده. مثلاً: autoscan --platform parscoders,ponisha,parscoders"
        )

    with make_client() as client:
        robots = RobotsCache(client)
        limiter = RateLimiter(args.delay)
        for plat in targets:
            urls = _platform_urls(plat)
            if not urls:
                print(f"[{plat['id']}] listing_url ندارد؛ رد شد.", file=sys.stderr)
                continue
            selectors = plat.get("scan_selectors")
            local_html = Path(args.html).read_text(encoding="utf-8") if args.html else None
            working_template = urls[0]
            for n in range(1, args.pages + 1):
                html, error = None, ""
                url = page_url(working_template, n)
                if local_html is not None:
                    html, error = local_html, ""
                else:
                    candidates = [working_template] if n > 1 else urls
                    for candidate_tpl in candidates:
                        url = page_url(candidate_tpl, n)
                        html, error = _fetch_once(client, robots, limiter, url, plat["domain"])
                        if html is not None:
                            working_template = candidate_tpl
                            break
                if html is None:
                    print(f"[{plat['id']}] صفحه {n} خوانده نشد — {error}", file=sys.stderr)
                    break
                if not selectors:
                    best = autoparse.best_profile(html, min_count=args.min_count)
                    if best is None:
                        print(
                            f"[{plat['id']}] ساختار آیتم‌ها تشخیص داده نشد؛ صفحه ممکن است JS-محور باشد. "
                            "مسیر جایگزین: صفحه را در مرورگر ذخیره کنید و --html بدهید.",
                            file=sys.stderr,
                        )
                        break
                    selectors = best.selectors
                    print(f"[{plat['id']}] کشف خودکار: {best.item_selector} ({best.count} آیتم، امتیاز {best.score})")
                    if args.save:
                        data = load_registry()
                        for item in data["platforms"]:
                            if item["id"] == plat["id"]:
                                item["scan_selectors"] = selectors
                                item["calibrated_at"] = _now()
                                item["calibrated_from"] = f"autoscan:{url}"
                                break
                        REGISTRY_PATH.write_text(
                            json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
                        )
                        saved.append(plat["id"])
                items = parse_listing(html, url, plat["id"], selectors, plat.get("project_path_pattern"))
                print(f"[{plat['id']}] صفحه {n}: {len(items)} پروژه")
                collected += items

    kept = [p for p in collected if matches(p, include, exclude, categories=categories)]
    added = append_projects(Path(args.out), kept)
    by_category: dict[str, int] = {}
    for project in kept:
        by_category[category_label(project.category)] = by_category.get(category_label(project.category), 0) + 1
    if by_category:
        summary = " · ".join(f"{label}: {count}" for label, count in sorted(by_category.items(), key=lambda kv: -kv[1]))
        print(f"دسته‌ها: {summary}")
    if saved:
        print(f"انتخابگرها برای {', '.join(saved)} ذخیره شد (برای اسکن خودکار: enable --platform ...)")
    print(f"{len(collected)} مورد خوانده شد؛ {len(kept)} پس از فیلتر؛ {added} مورد جدید در {args.out}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="konklancer read-only project scanner")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list", help="نمایش وضعیت پلتفرم‌ها و کانال‌های تلگرام").set_defaults(fn=cmd_list)

    pp = sub.add_parser("prune", help="پاک‌سازی ردیف‌های بی‌ربط/تکراری از یک فید JSONL ذخیره‌شده")
    pp.add_argument("--file", default="scanner/out/projects.jsonl", help="مسیر فید JSONL")
    pp.add_argument("--apply", action="store_true", help="نوشتن نتیجه (بدون آن فقط گزارش می‌دهد)")
    pp.set_defaults(fn=cmd_prune)

    for name, help_text in (
        ("enable", "فعال کردن اسکن یک پلتفرم (پس از کالیبراسیون) یا یک کانال تلگرام"),
        ("disable", "غیرفعال کردن اسکن یک پلتفرم یا یک کانال تلگرام"),
    ):
        toggle = sub.add_parser(name, help=help_text)
        toggle.add_argument("--platform", default="", help="شناسه پلتفرم در platforms.json")
        toggle.add_argument("--telegram", default="", help="نام کاربری کانال بدون @")
        toggle.set_defaults(fn=cmd_toggle)

    s = sub.add_parser("snapshot", help="ذخیره یک صفحه لیست برای کالیبره کردن")
    s.add_argument("--platform", required=True)
    s.add_argument("--delay", type=float, default=8.0)
    s.set_defaults(fn=cmd_snapshot)

    p = sub.add_parser("parse-file", help="تجزیه یک فایل HTML محلی (تست آفلاین یا صفحه‌ی ذخیره‌شده در مرورگر)")
    p.add_argument("--platform", required=True)
    p.add_argument("--html", required=True)
    p.add_argument("--selectors-json", default="", help="انتخابگرها به‌صورت JSON (اختیاری)")
    p.add_argument("--include", default="")
    p.add_argument("--exclude", default="")
    p.add_argument("--out", default="", help="مسیر فید JSONL برای نوشتن نتیجه (اختیاری)")
    p.set_defaults(fn=cmd_parse_file)

    pt = sub.add_parser("parse-telegram-file", help="تجزیه پیش‌نمایش عمومی یک کانال از فایل HTML محلی")
    pt.add_argument("--channel", required=True, help="نام کاربری کانال بدون @")
    pt.add_argument("--html", required=True)
    pt.add_argument("--include", default="")
    pt.add_argument("--exclude", default="")
    pt.add_argument("--out", default="", help="مسیر فید JSONL برای نوشتن نتیجه (اختیاری)")
    pt.set_defaults(fn=cmd_parse_telegram_file)

    sc = sub.add_parser("scan", help="اسکن صفحات عمومی (بدون فیلتر دسته‌ای: هر نوع پروژه‌ای)")
    sc.add_argument("--platform", default="", help="یک یا چند شناسه با کاما: parscoders,ponisha")
    sc.add_argument("--telegram", action="store_true", help="کانال‌هایی که scan_enabled=true دارند")
    sc.add_argument("--pages", type=int, default=1)
    sc.add_argument("--delay", type=float, default=8.0)
    sc.add_argument("--include", default="", help="فقط پروژه‌های شامل این کلیدواژه‌ها (خالی = همه)")
    sc.add_argument("--exclude", default="", help="پروژه‌های شامل این کلیدواژه‌ها حذف شوند")
    sc.add_argument("--categories", default="", help="فقط این دسته‌ها، با کلید taxonomy: graphic,translation,...")
    sc.add_argument(
        "--auto",
        action="store_true",
        help="برای پلتفرم بدون انتخابگر، ساختار صفحه را در همان لحظه کشف و استفاده کن",
    )
    sc.add_argument("--out", default=str(DEFAULT_OUT))
    sc.set_defaults(fn=cmd_scan)

    pr = sub.add_parser("probe", help="امتحان نامزدهای نشانی/انتخابگر روی صفحه‌ی زنده و انتخاب بهترین")
    pr.add_argument("--platform", required=True)
    pr.add_argument("--url", default="", help="نشانی خاص (پیش‌فرض: listing_url و نامزدهایش)")
    pr.add_argument("--min-items", type=int, default=3, help="حداقل آیتم برای قبول یک نامزد")
    pr.add_argument("--delay", type=float, default=8.0)
    pr.add_argument("--save", action="store_true", help="ذخیره‌ی بهترین نتیجه در platforms.json")
    pr.set_defaults(fn=cmd_probe)

    cp = sub.add_parser(
        "capture",
        help="ذخیره‌ی HTML واقعی صفحه‌ها (اسکریپت‌حذف‌شده و فشرده) برای کالیبراسیون و تست آفلاین",
    )
    cp.add_argument("--target", default="", help="شناسه‌ی پلتفرم یا نشانی کامل، با کاما")
    cp.add_argument("--telegram", action="store_true", help="کانال‌های telegram_sources.json هم ذخیره شوند")
    cp.add_argument("--out-dir", default="scanner/tests/fixtures/live")
    cp.add_argument("--max-bytes", type=int, default=2_000_000, help="حداکثر حجم متنی هر نمونه")
    cp.add_argument("--delay", type=float, default=8.0)
    cp.set_defaults(fn=cmd_capture)

    ad = sub.add_parser("autodetect", help="کشف خودکار ساختار صفحه (از فایل HTML یا صفحه‌ی زنده)")
    ad.add_argument("--platform", default="", help="شناسه پلتفرم در platforms.json (برای ذخیره لازم است)")
    ad.add_argument("--html", default="", help="فایل HTML ذخیره‌شده در مرورگر")
    ad.add_argument("--url", default="", help="نشانی صفحه (اگر --html ندهید)")
    ad.add_argument("--source", default="", help="برچسب منبع وقتی --platform نمی‌دهید")
    ad.add_argument("--min-count", type=int, default=5)
    ad.add_argument("--delay", type=float, default=8.0)
    ad.add_argument("--save", action="store_true", help="ذخیره‌ی بهترین انتخابگرها در platforms.json")
    ad.set_defaults(fn=cmd_autodetect)

    au = sub.add_parser(
        "autoscan",
        help="یک‌مرحله‌ای: صفحات زنده را بخوان، ساختار را کشف/استفاده کن و در فید بنویس",
    )
    au.add_argument("--platform", default="", help="یک یا چند شناسه با کاما (خالی = همه‌ی فعال‌ها)")
    au.add_argument("--pages", type=int, default=1)
    au.add_argument("--delay", type=float, default=8.0)
    au.add_argument("--include", default="")
    au.add_argument("--exclude", default="")
    au.add_argument("--categories", default="", help="محدودکردن به این دسته‌ها (خالی = همه‌ی دسته‌ها)")
    au.add_argument("--min-count", type=int, default=3)
    au.add_argument("--html", default="", help="فایل HTML ذخیره‌شده در مرورگر (بدون هیچ درخواست شبکه‌ای)")
    au.add_argument("--save", action="store_true", help="ذخیره‌ی انتخابگرهای کشف‌شده در platforms.json")
    au.add_argument("--out", default=str(DEFAULT_OUT))
    au.set_defaults(fn=cmd_autoscan)
    return ap


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    raise SystemExit(main())
