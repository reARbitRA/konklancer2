"""اسکنر عمیق چندصفحه‌ای ابری (GitHub Actions -> Supabase + scanner/cloud-feed.jsonl).

- پیمایش ۶ صفحه‌ی متوالی فید زنده رسمی پونیشا (@ponisha_ir با ?before=): استخراج عنوان تمیز، شرح کامل، بودجه دقیق تومانی، هشتگ مهارت‌ها و لینک مستقیم ponisha.ir/project/...
- پیمایش ۷ صفحه‌ی واقعی پارس‌کدرز (?page=1..4 + دسته‌های برنامه‌نویسی، هوش مصنوعی، تولید محتوا)
- پیمایش صفحات کارلانسر و پونیشا وب + @workarc
- حذف کامل پست‌های تبلیغاتی، منقضی‌شده، فیزیکی/حضوری و قدیمی
"""

from __future__ import annotations

import datetime
import hashlib
import json
import pathlib
import re
import time
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from scanner.taxonomy import detect_category

SUPABASE_URL = "https://rwuyuhjkitcnekpwmoml.supabase.co"
SUPABASE_JWT = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3dXl1aGpraXRjbmVrcHdtb21sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNTgwMzYsImV4cCI6MjEwNzkzNDAzNn0."
    "KnWmpopGmuhdeQ5x6sOUfa7pBqeqN57oJhzBSlkuzzs"
)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7",
}

JUNK_MARKERS = (
    "مهلت تمام شده",
    "واگذار شده به",
    "ربات ثبت و سفارش پروژه",
    "تبلیغ در کانال",
    "رزرو تبلیغات",
    "فروش پیج",
    "فالور فیک",
    "بازاریاب حضوری",
    "استخدام حضوری",
    "کار در منزل بسته بندی",
    "ضامن بانکی",
    "اجاره کارتخوان",
)


def canonical_key(url: str) -> str:
    parsed = urlparse(url)
    m_pon = re.match(r"^/project/(\d+)", parsed.path)
    if "ponisha.ir" in parsed.netloc and m_pon:
        return f"ponisha:{m_pon.group(1)}"
    m_pc = re.match(r"^/project/(\d+)", parsed.path)
    if "parscoders.com" in parsed.netloc and m_pc:
        return f"parscoders:{m_pc.group(1)}"
    return f"{parsed.netloc.replace('www.', '')}{parsed.path.rstrip('/')}"


def make_id(source: str, url: str) -> str:
    h = hashlib.sha1(canonical_key(url).encode("utf-8")).hexdigest()[:10]
    clean_src = re.sub(r"[^a-z0-9]", "", source.lower())
    return f"{clean_src}-{h}"


def is_junk_text(title: str, summary: str) -> bool:
    blob = f"{title} {summary}"
    return any(m in blob for m in JUNK_MARKERS)


def parse_telegram_channel_html(html: str, channel: str) -> tuple[list[dict], int | None]:
    soup = BeautifulSoup(html, "html.parser")
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    out: list[dict] = []
    min_post_id: int | None = None

    for msg in soup.select("div.tgme_widget_message"):
        post_attr = msg.get("data-post", "")
        if "/" in post_attr:
            try:
                pid = int(post_attr.split("/")[-1])
                min_post_id = pid if min_post_id is None else min(min_post_id, pid)
            except ValueError:
                pass

        text_el = msg.select_one(".tgme_widget_message_text")
        if not text_el:
            continue
        for br in text_el.find_all("br"):
            br.replace_with("\n")
        lines = [re.sub(r"\s+", " ", ln).strip() for ln in text_el.get_text().splitlines() if ln.strip()]
        full_body = "\n".join(lines)
        if len(full_body) < 25:
            continue

        btn = msg.select_one("a.tgme_widget_message_inline_button.url_button")
        date_link = msg.select_one("a.tgme_widget_message_date")
        href = (btn.get("href") if btn else None) or (date_link.get("href") if date_link else None)
        if not href:
            continue

        time_el = msg.select_one("time")
        dt_str = (time_el.get("datetime") if time_el else "") or ""
        if dt_str[:4] in ("2020", "2021", "2022", "2023", "2024", "2025"):
            continue

        hashtags = " ".join(re.findall(r"#([A-Za-z0-9_\u0600-\u06FF]+)", full_body))
        budget_m = re.search(r"بودجه\s*[:：]\s*([^\n]+)", full_body)
        title_m = re.search(r"(?:عنوان|موضوع)\s*[:：]\s*([^\n]+)", full_body)
        if title_m:
            title = title_m.group(1).strip()
            body_lines = lines
        else:
            title = re.sub(r"^[🔴🔵🟢🟡🟠🟣⚡📢💼📌🔹🔸•\-–—\s]+", "", lines[0]).strip()
            body_lines = lines[1:]

        clean_desc_lines = [
            re.sub(r"^[🔹🔸▪️•]+\s*", "", ln)
            for ln in body_lines
            if "@ponisha_ir" not in ln
            and "ترکیبی از قیمت و کیفیت اهمیت دارد" not in ln
            and not ln.startswith("#")
        ]
        summary = " ".join(clean_desc_lines).strip() or full_body
        if is_junk_text(title, summary):
            continue

        source = (
            "ponisha"
            if "ponisha.ir/" in href
            else "karlancer"
            if "karlancer.com/" in href
            else "parscoders"
            if "parscoders.com/" in href
            else f"telegram:{channel}"
        )
        cat = detect_category(title, summary, hashtags).key
        out.append(
            {
                "id": make_id(source, href),
                "source": source,
                "title": title[:200],
                "url": href,
                "summary": summary[:1400],
                "budget_text": f"بودجه: {budget_m.group(1).strip()}" if budget_m else "",
                "bids_text": "",
                "posted_text": dt_str,
                "tags_text": hashtags,
                "category": cat,
                "scraped_at": now_iso,
            }
        )
    return out, min_post_id


def parse_web_platform_html(html: str, source: str, base_url: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    out: list[dict] = []
    seen_urls: set[str] = set()

    selector = "a[href*='/projects/']" if source == "karlancer" else "a[href*='/project/']"
    for a in soup.select(selector):
        raw_href = a.get("href") or ""
        if not raw_href:
            continue
        full_url = urljoin(base_url, raw_href)
        path = urlparse(full_url).path
        if source == "parscoders" and not re.match(r"^/project/\d+/", path):
            continue
        if source == "ponisha" and not re.match(r"^/project/\d+", path):
            continue
        if source == "karlancer" and not re.match(r"^/projects/[^/]+", path):
            continue
        if full_url in seen_urls:
            continue

        card = (
            a.find_parent(["article", "li", "tr"])
            or a.find_parent("div", class_=re.compile(r"project|panel|card", re.I))
            or a.parent
        )
        title_el = card.find(["h4", "h3", "h2"]) if card else None
        title = re.sub(r"\s+", " ", (title_el.get_text(" ") if title_el else a.get_text(" "))).strip()
        if len(title) < 4 or title in ("مشاهده", "ارسال پیشنهاد"):
            continue
        seen_urls.add(full_url)

        card_text = re.sub(r"\s+", " ", card.get_text(" ") if card else title).strip()
        if any(s in card_text for s in ("سال پیش", "ماه پیش")):
            continue

        budget_m = re.search(
            r"(?:حداکثر\s*بودجه\s*[:：]?\s*|بودجه\s*[:：]?\s*)?[\d۰-۹,،٬.]+(?:\s*تا\s*[\d۰-۹,،٬.]+)?\s*(?:میلیارد|میلیون|هزار)?\s*(?:تومان|ریال)",
            card_text,
        )
        bids_m = re.search(r"[\d۰-۹]+\s*پیشنهاد", card_text)
        time_m = re.search(
            r"(?:[\d۰-۹]+|یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده|دوازده|پانزده|بیست|سی)(?:\s+و\s+\S+)?\s*(?:دقیقه|ساعت|روز|هفته)\s*پیش",
            card_text,
        )
        tags = " ".join(
            b.get_text(strip=True)
            for b in (card.select("a[href*='/skill/'], a[href*='/tag/'], .label, .badge") if card else [])
            if 2 <= len(b.get_text(strip=True)) <= 35
        )
        summary = card_text.replace(title, "").strip()[:1000]
        if is_junk_text(title, summary):
            continue

        cat = detect_category(title, summary, tags).key
        out.append(
            {
                "id": make_id(source, full_url),
                "source": source,
                "title": title[:200],
                "url": full_url,
                "summary": summary or title,
                "budget_text": budget_m.group(0) if budget_m else "",
                "bids_text": " با ".join(x for x in [time_m.group(0) if time_m else "", bids_m.group(0) if bids_m else ""] if x),
                "posted_text": time_m.group(0) if time_m else "",
                "tags_text": tags,
                "category": cat,
                "scraped_at": now_iso,
            }
        )
    return out


def main() -> None:
    collected: dict[str, dict] = {}
    client = httpx.Client(headers=HEADERS, follow_redirects=True, timeout=25.0)

    # ۱. پیمایش ۶ صفحه‌ای فید رسمی پونیشا (@ponisha_ir) + ۲ صفحه‌ای @workarc
    for channel, max_pages in [("ponisha_ir", 6), ("workarc", 2)]:
        before_id: int | None = None
        for page_idx in range(max_pages):
            url = f"https://telegram.me/s/{channel}" + (f"?before={before_id}" if before_id else "")
            try:
                resp = client.get(url)
                if resp.status_code == 200 and len(resp.text) > 1000:
                    rows, next_before = parse_telegram_channel_html(resp.text, channel)
                    for r in rows:
                        collected[canonical_key(r["url"])] = r
                    print(f"[tg:{channel} p{page_idx + 1}] +{len(rows)} rows (before={next_before})")
                    before_id = next_before
                    if not before_id or before_id < 20:
                        break
                time.sleep(1.0)
            except Exception as exc:  # noqa: BLE001
                print(f"[tg:{channel}] error: {exc}")
                break

    # ۲. پیمایش چندصفحه‌ای پارس‌کدرز، پونیشا وب و کارلانسر وب
    web_targets = [
        ("parscoders", "https://parscoders.com/project/only-available"),
        ("parscoders", "https://parscoders.com/project/only-available?page=2"),
        ("parscoders", "https://parscoders.com/project/only-available?page=3"),
        ("parscoders", "https://parscoders.com/project/only-available?page=4"),
        ("parscoders", "https://parscoders.com/project/service/programming"),
        ("parscoders", "https://parscoders.com/project/service/artificial-intelligence"),
        ("parscoders", "https://parscoders.com/project/service/content-creation"),
        ("karlancer", "https://www.karlancer.com/search"),
        ("karlancer", "https://www.karlancer.com/search?page=2"),
        ("ponisha", "https://ponisha.ir/search/projects"),
    ]
    for source, url in web_targets:
        try:
            resp = client.get(url)
            if resp.status_code == 200 and len(resp.text) > 1000:
                rows = parse_web_platform_html(resp.text, source, url)
                for r in rows:
                    key = canonical_key(r["url"])
                    if key not in collected:
                        collected[key] = r
                print(f"[{source}] {url} -> +{len(rows)} rows")
            time.sleep(1.0)
        except Exception as exc:  # noqa: BLE001
            print(f"[{source}] {url} error: {exc}")

    # ۳. ذخیره تمیز در scanner/cloud-feed.jsonl (حذف ردیف‌های قدیمی/زباله قبلی)
    cloud_path = pathlib.Path("scanner/cloud-feed.jsonl")
    existing: dict[str, dict] = {}
    if cloud_path.exists():
        for line in cloud_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                obj = json.loads(line)
                if str(obj.get("posted_text", "")).startswith(("2020-", "2021-", "2022-", "2023-", "2024-", "2025-")):
                    continue
                if is_junk_text(str(obj.get("title", "")), str(obj.get("summary", ""))):
                    continue
                obj["category"] = detect_category(
                    obj.get("title", ""), obj.get("summary", ""), obj.get("tags_text", "")
                ).key
                existing[canonical_key(obj["url"])] = obj
            except Exception:  # noqa: BLE001
                pass

    existing.update(collected)
    final_rows = sorted(existing.values(), key=lambda r: r.get("scraped_at", ""))[-800:]
    cloud_path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in final_rows), encoding="utf-8")
    print(f"Saved {len(final_rows)} clean multi-page rows to scanner/cloud-feed.jsonl")

    # ۴. همگام‌سازی کامل با جدول ابری Supabase
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    payload_rows = [{"id": r["id"], "payload": r, "updated_at": now_iso} for r in final_rows[-400:]]
    for i in range(0, len(payload_rows), 100):
        batch = payload_rows[i : i + 100]
        r = client.post(
            f"{SUPABASE_URL}/rest/v1/konklancer_projects?on_conflict=id",
            headers={
                "apikey": SUPABASE_JWT,
                "Authorization": f"Bearer {SUPABASE_JWT}",
                "Prefer": "resolution=merge-duplicates",
            },
            json=batch,
        )
        print(f"Supabase batch {i // 100 + 1}: HTTP {r.status_code} ({len(batch)} rows)")


if __name__ == "__main__":
    main()
