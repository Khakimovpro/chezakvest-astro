#!/usr/bin/env python3
"""Скрейп страницы квеста -> чистые данные для шаблона + локальные картинки.

Запуск:  python3 _capture/build_quest.py <slug> [ещё слаги...]
Читает:  _capture/pages/<slug>.json   (снимок с живого сайта, scrape_page.mjs)
Пишет:   src/data/pages/<slug>.json   (данные страницы)
         public/assets/q/<hash>.webp  (картинки, общий пул с дедупом по URL)

Секции опознаются по ТИПУ блока Tilda и порядку, не по rec-id: id у каждой страницы свои.
Блок расписания (тип 131) не переносится — решение от 09.08.2026.
"""
import gzip
import hashlib
import io
import json
import os
import re
import sys
import urllib.request
from urllib.parse import urlsplit, urlunsplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "_capture", "pages")
DST = os.path.join(ROOT, "src", "data", "pages")
IMGDIR = os.path.join(ROOT, "public", "assets", "q")
HOST = "https://xn--80aehcht5ci1b.xn--p1ai"
os.makedirs(DST, exist_ok=True)
os.makedirs(IMGDIR, exist_ok=True)

def quest_names():
    """слаг -> короткое название из реестра переноса (h1 оригинала без слова «Квест»)."""
    import csv
    path = os.path.join(ROOT, "migration", "pages.csv")
    names = {}
    if os.path.exists(path):
        for r in csv.DictReader(open(path, encoding="utf-8")):
            h1 = (r.get("h1") or "").strip()
            h1 = re.sub(r"^(Квест|VR-игра|Квест-шоу)\s+", "", h1, flags=re.I).strip()
            if h1:
                names["/" + r["slug"]] = h1
    return names


NAMES = None

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"}


def original_image_url(url):
    """Return a Tilda asset URL without its delivery-only transformation chain.

    The page captures keep the exact URL used by Tilda, because that URL is also
    part of the stable local-file hash.  A chain beginning with ``/-/`` is not
    the source image though: it may contain cover, contain, resize, resizeb,
    empty or format operations, including a 20px placeholder.  Downloading the
    path before that chain keeps the source asset while preserving existing
    local names and JSON references.
    """
    source = url or ""
    parsed = urlsplit(source)
    if "/-/" in parsed.path:
        # Most static URLs place the filename before the chain. Optim URLs —
        # and a second static form used for lazy placeholders — place it after
        # the chain instead. Reconstruct the immutable bucket/file endpoint in
        # both cases instead of fetching a resized derivative or a directory.
        bucket, transformed = parsed.path.split("/-/", 1)
        before_name = bucket.rsplit("/", 1)[-1]
        filename = transformed.rstrip("/").rsplit("/", 1)[-1]
        if "." in before_name:
            return urlunsplit((parsed.scheme or "https", parsed.netloc, bucket, "", ""))
        if "." in filename:
            original_name = re.sub(r"\.(avif|gif|jpe?g|png|svg|webp)\.webp$", r".\1", filename, flags=re.I)
            return urlunsplit(("https", "static.tildacdn.com", f"{bucket}/{original_name}", "", ""))
    return source.split("/-/", 1)[0]


def fetch(url):
    """Tilda отдаёт gzip всегда — распаковываем по magic-байтам, иначе получим мусор."""
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    if data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    return data


def local_image(url, max_w=1200):
    """Скачивает картинку, жмёт в webp, возвращает путь вида /assets/q/<hash>.webp."""
    if not url or url.startswith("data:"):
        return None
    key = hashlib.md5(f"{url}|{max_w}".encode()).hexdigest()[:10]
    name = f"{key}.webp"
    out = os.path.join(IMGDIR, name)
    rel = f"/assets/q/{name}"
    if os.path.exists(out):
        return rel
    try:
        from PIL import Image
        raw = fetch(original_image_url(url))
        im = Image.open(io.BytesIO(raw))
        if im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
        if im.width > max_w:
            im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
        im.save(out, "WEBP", quality=82, method=5)
        return rel
    except Exception as e:                                   # noqa: BLE001
        print(f"    картинка не скачалась: {url[:70]} — {e}")
        return None


def video_src(slug):
    """Ссылка на mp4 берётся из снимка страницы: Tilda прячет её в data-атрибутах блока t347."""
    import glob
    hits = glob.glob(os.path.join(os.path.dirname(ROOT), "work", "raw", "pages", f"{slug}--*.html"))
    if not hits:
        return None
    html = open(hits[0], encoding="utf-8", errors="ignore").read()
    m = re.findall(r"https?://[^\"' ]+\.mp4", html)
    return m[0] if m else None


def hero_images(url):
    """Герой — LCP-картинка: сохраняем три ширины под srcset (мобайл/планшет/десктоп)."""
    if not url:
        return None
    out = {}
    for w in (760, 1200, 1600):
        p = local_image(url, w)
        if p:
            out[str(w)] = p
    return out or None


def fix_title(title, h1):
    """Title длиннее 60 знаков режется в поиске — собираем короткий по названию квеста."""
    if len(title) <= 60:
        return title
    name = re.sub(r"^(Квест в стиле|Квест|VR-игра|Квест-шоу)\s+", "", h1).strip(" .«»")
    short = f"{name} — квест в Ростове-на-Дону"
    if len(short) <= 60:
        return short
    return f"{name} — квест, Ростов-на-Дону"[:60]


def fix_desc(desc):
    """Description держим в 100–180 знаках: длинный режем по границе предложения, гео дописываем."""
    d = (desc or "").strip()
    if len(d) <= 180:
        return d
    cut = d[:180]
    for sep in (". ", "! ", "? "):
        i = cut.rfind(sep)
        if i > 90:
            return cut[:i + 1].strip()
    i = cut.rfind(" ")
    return (cut[:i] if i > 90 else cut).rstrip(" ,;–-") + "."


def card_images(sec, hrefs_in_order, min_side=150):
    """Сопоставляет ссылки карточек с их фоновыми картинками по геометрии.

    В Tilda карточка = фото-фон + прозрачный PNG-оверлей поверх, размеры у них разные.
    Берём для каждой ссылки самый большой фон, который её накрывает, и отбрасываем оверлеи
    (у них тот же прямоугольник, но меньшая площадь) и заглушку noroot.
    """
    out = []
    for link in hrefs_in_order:
        best = None
        for b in sec["bgs"]:
            if b["w"] < min_side or b["h"] < min_side or "noroot" in b["url"]:
                continue
            covers = (b["l"] - 4 <= link["l"] and b["t"] - 4 <= link["t"]
                      and b["l"] + b["w"] + 4 >= link["l"] + link["w"]
                      and b["t"] + b["h"] + 4 >= link["t"] + link["h"])
            near = abs(b["l"] - link["l"]) < 40 and abs(b["t"] - link["t"]) < 60
            if covers or near:
                if best is None or b["w"] * b["h"] > best["w"] * best["h"]:
                    best = b
        out.append(best)
    # оверлей с бейджами лежит поверх фото и чуть меньше него: если карточке достался
    # заметно меньший прямоугольник, фото у неё не нашлось — лучше отдать None
    areas = [b["w"] * b["h"] for b in out if b]
    limit = max(areas) * 0.85 if areas else 0
    return [(b["url"] if b and b["w"] * b["h"] >= limit else None) for b in out]


def lines(section):
    txt = (section.get("plain") or "").split("\n")
    return [t.strip() for t in txt if t.strip()]


def rel_href(h):
    """Абсолютную ссылку на свой домен превращаем в путь."""
    if not h:
        return "#"
    return h.replace(HOST, "") or "/"


def by_type(sections, t):
    return [s for s in sections if s["type"] == t]


def build(slug):
    data = json.load(open(os.path.join(SRC, f"{slug}.json"), encoding="utf-8"))
    secs = [s for s in data["sections"] if s["type"] != "131"]     # расписание не переносим
    meta = data["meta"]
    out = {"slug": slug, "type": "quest"}

    # ---------- SEO ----------
    h1_text = (meta["h1"] or [""])[0]
    out["seo"] = {
        "title": fix_title(meta["title"], h1_text),
        "description": fix_desc(meta["description"]),
        "keywords": meta.get("keywords", ""),
        "h1": (meta["h1"] or [""])[0],
    }

    # ---------- ГЕРОЙ: первый блок 396 ----------
    hero_sec = next((s for s in secs if s["type"] == "396" and s["h"] > 300), None)
    hero = {"h1": out["seo"]["h1"], "pills": [], "buttons": []}
    if hero_sec:
        ls = lines(hero_sec)
        hero["h1"] = ls[0] if ls else hero["h1"]
        for t in ls[1:]:
            if t.lower() in ("поиграть", "провести праздник"):
                continue
            if len(t) < 20:
                hero["pills"].append(t)
        hero["buttons"] = [
            {"t": l["text"], "href": rel_href(l["href"])}
            for l in hero_sec["links"] if l["text"] and len(l["text"]) < 30
        ][:2]
        bg = hero_sec["bgs"][0]["url"] if hero_sec["bgs"] else None
        img = hero_sec["imgs"][0]["src"] if hero_sec["imgs"] else None
        hero["bg"] = local_image(bg or img, 1600)
        hero["bgset"] = hero_images(bg or img)
    out["hero"] = hero

    # ---------- ХЛЕБНЫЕ КРОШКИ: блок 758 ----------
    bc_sec = next((s for s in secs if s["type"] == "758"), None)
    if bc_sec:
        names = [t for t in lines(bc_sec) if t not in ("/", "|", "»", "›")]
        hrefs = [rel_href(l["href"]) for l in bc_sec["links"]]
        crumbs = []
        for i, n in enumerate(names):
            crumbs.append({"t": n, "href": hrefs[i] if i < len(hrefs) else None})
        if crumbs:
            crumbs[-1]["href"] = None                        # последняя — текущая страница
        out["breadcrumbs"] = crumbs

    # ---------- ПРЕДЫСТОРИЯ: блок 194 ----------
    story_sec = next((s for s in secs if s["type"] == "194"), None)
    if story_sec:
        ls = lines(story_sec)
        out["story"] = {"title": ls[0] if ls else "Предыстория", "paragraphs": ls[1:]}

    # ---------- ОСОБЕННОСТИ: заголовок 33 + лид 356 + пункты 1196/121 ----------
    feat = {}
    t33 = next((s for s in secs if s["type"] == "33"), None)
    if t33:
        feat["title"] = (lines(t33) or ["Особенности"])[0]
    t356 = next((s for s in secs if s["type"] == "356"), None)
    if t356:
        feat["lead"] = lines(t356)
    # блок характеристик идёт сразу после «Особенностей»: пары «заголовок / пояснение»
    idx = secs.index(t356) if t356 else (secs.index(t33) if t33 else -1)
    spec_sec = None
    if idx >= 0:
        for s in secs[idx + 1:idx + 3]:
            if s["type"] in ("1196", "121") and s["h"] < 400:
                spec_sec = s
                break
    if spec_sec:
        # в Tilda заголовок карточки и подпись отличаются кеглем и насыщенностью,
        # по тексту их не разделить — берём из стилей снятых элементов
        txts = [t for t in spec_sec["texts"] if t["text"]]
        items = []
        for t in txts:
            weight = int(re.sub(r"\D", "", t.get("fw") or "400") or 400)
            size = float(re.sub(r"[^\d.]", "", t.get("fs") or "16") or 16)
            head = weight >= 600 or size >= 20
            if head or not items:
                items.append({"t": t["text"], "sub": ""})
            else:
                items[-1]["sub"] = (items[-1]["sub"] + " " + t["text"]).strip()
        if not items:
            items = [{"t": x, "sub": ""} for x in lines(spec_sec)]
        feat["items"] = items
    out["features"] = feat

    # ---------- БРОНИРОВАНИЕ: блок 396 с «бронирование» ----------
    book_sec = next((s for s in secs if s["type"] == "396" and "бронирован" in (s.get("plain") or "").lower()), None)
    if book_sec:
        ls = lines(book_sec)
        out["booking"] = {"title": ls[0], "lines": [t for t in ls[1:] if "кликнув" not in t.lower()]}

    # ---------- ПОХОЖИЕ КВЕСТЫ: блок 121 со ссылками на страницы квестов ----------
    global NAMES
    if NAMES is None:
        NAMES = quest_names()

    def is_related(sec):
        """Блок «Другие квесты»: карточки-ссылки на страницы других игр, 4–16 штук."""
        if sec["type"] != "121" or sec["h"] <= 400:
            return False
        hrefs = [rel_href(l["href"]) for l in sec["links"]]
        known = [h for h in dict.fromkeys(hrefs) if h in NAMES]
        return 4 <= len(known) <= 16

    rel_sec = next((s for s in secs if is_related(s)), None)
    if rel_sec:
        ls = lines(rel_sec)
        titles = [t for t in ls[2:] if t.isupper() or len(t) > 3]
        hrefs = [h for h in dict.fromkeys(rel_href(l["href"]) for l in rel_sec["links"]) if h in NAMES]
        imgs = [b["url"] for b in rel_sec["bgs"] if b["w"] >= 200 and b["h"] >= 200 and "noroot" not in b["url"]]
        items = []
        for i, h in enumerate(hrefs):
            items.append({
                "t": NAMES.get(h) or (titles[i].title() if i < len(titles) else h.strip("/").replace("_", " ")),
                "href": h,
                "img": local_image(imgs[i], 560) if i < len(imgs) else None,
            })
        out["related"] = {"title": ls[0] if ls else "", "subtitle": ls[1] if len(ls) > 1 else "", "items": items}

    # ---------- ПЛОЩАДКА: блок 396 с адресом ----------
    venue_sec = next((s for s in secs if s["type"] == "396" and s["h"] > 400
                      and re.search(r"улиц|проспект|переул|шоссе", (s.get("plain") or ""), re.I)), None)
    ADDR_RE = re.compile(r"(улиц|проспект|переул|шоссе|пр-т|ул\.)[^,]*,?\s*\d", re.I)
    if venue_sec and not ADDR_RE.search(lines(venue_sec)[0] if lines(venue_sec) else ""):
        venue_sec = None            # блок без адреса в заголовке — это не карточка площадки
    if venue_sec:
        ls = lines(venue_sec)
        photos = []
        seen = set()
        for b in venue_sec["bgs"]:
            u = b["url"].split("?")[0]
            if u in seen:
                continue
            seen.add(u)
            p = local_image(b["url"], 1200)
            if p:
                photos.append(p)
        out["venue"] = {
            "address": ls[0].title() if ls else "",
            "cta": next((l["text"] for l in venue_sec["links"] if l["text"]), "Забронировать дату"),
            "lines": [t for t in ls[1:] if t.lower() not in ("забронировать дату",) and not re.match(r"^\d+ из \d+$", t)],
            "photos": photos,
        }
    # подводка к площадке (блок 396 «Выберите зал…»)
    lead_sec = next((s for s in secs if s["type"] == "396" and "выберите зал" in (s.get("plain") or "").lower()), None)
    if lead_sec and out.get("venue"):
        ls = lines(lead_sec)
        out["venue"]["title"] = ls[0] if ls else ""
        out["venue"]["subtitle"] = ls[1] if len(ls) > 1 else ""

    # ---------- ВИДЕО: блок 347 ----------
    vid_sec = next((s for s in secs if s["type"] == "347"), None)
    vid_title_sec = None
    if vid_sec:
        vid_title_sec = title_sec = next((s for s in secs if s["type"] == "396" and "как у нас проходят" in (s.get("plain") or "").lower()), None)
        out["video"] = {
            "title": (lines(title_sec) or [""])[0] if title_sec else "Как у нас проходят праздники",
            "caption": (lines(vid_sec) or [""])[0],
            "poster": local_image(vid_sec["bgs"][0]["url"], 1200) if vid_sec["bgs"] else None,
            "src": (vid_sec["videos"][0] if vid_sec["videos"] else None) or video_src(slug),
        }

    # ---------- СЦЕНАРИИ ПРАЗДНИКА: блок 121 со ссылками на «-lend/-land» ----------
    sc_sec = next((s for s in secs if s["type"] == "121" and any("lend" in l["href"] or "land" in l["href"]
                                                                 or "den-rozhdeniya" in l["href"] for l in s["links"])), None)
    if sc_sec:
        ls = lines(sc_sec)
        names = [t for t in ls[2:] if t and t != "День рождения в стиле"]
        items = []
        for i, l in enumerate(sc_sec["links"]):
            items.append({
                "t": names[i] if i < len(names) else "",
                "href": rel_href(l["href"]),
                "img": local_image(sc_sec["bgs"][i]["url"], 720) if i < len(sc_sec["bgs"]) else None,
            })
        out["scenarios"] = {"title": ls[0] if ls else "", "subtitle": ls[1] if len(ls) > 1 else "", "items": items}

    # ---------- ОСТАЛЬНЫЕ БЛОКИ: чтобы не терять контент нестандартных страниц ----------
    used = {id(x) for x in (hero_sec, bc_sec, story_sec, t33, t356, spec_sec, book_sec,
                            rel_sec, venue_sec, lead_sec, vid_sec, vid_title_sec, sc_sec) if x is not None}
    SKIP_TYPES = {"113", "126", "363", "128", "131"}          # отступы, разделители и расписание
    SHARED = ("выберите дату", "есть вопрос?", "политикой обработки")
    extra = []
    for sec in secs:
        if id(sec) in used or sec["type"] in SKIP_TYPES:
            continue
        ls = lines(sec)
        text = " ".join(ls).lower()
        if any(k in text for k in SHARED):                     # сквозные формы уже есть в шаблоне
            continue
        photos = []
        seen_u = set()
        for src in [i["src"] for i in sec["imgs"]] + [b["url"] for b in sec["bgs"]]:
            u = (src or "").split("?")[0]
            if not u or u in seen_u or u.endswith(".svg"):
                continue
            seen_u.add(u)
            ph = local_image(src, 1200)
            if ph:
                photos.append(ph)
        if not ls and not photos:
            continue
        if len(" ".join(ls)) < 12 and not photos:
            continue
        title, body = (ls[0] if ls else ""), ls[1:]
        if len(title) > 90:                  # первая строка оказалась абзацем — заголовка у блока нет
            short = next((x for x in body if len(x) <= 50), "")
            if short:
                body = [x for x in body if x != short]
                body.insert(0, title)
                title = short
            else:
                body, title = ls, ""
        extra.append({
            "title": title,
            "lines": body,
            "photos": photos,
        })
    # склейка: в Tilda заголовок и его картинки часто лежат разными блоками
    merged = []
    for e in extra:
        prev = merged[-1] if merged else None
        if prev and not e["title"] and (e["lines"] or e["photos"]) and not prev["photos"]:
            prev["lines"] += e["lines"]
            prev["photos"] += e["photos"]
            continue
        merged.append(e)
    extra = [e for e in merged if e["lines"] or e["photos"]]
    if extra:
        out["extra"] = extra

    json.dump(out, open(os.path.join(DST, f"{slug}.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    have = [k for k in ("hero", "breadcrumbs", "story", "features", "booking", "related", "venue", "video", "scenarios", "extra") if out.get(k)]
    print(f"{slug}: блоков {len(have)} ({', '.join(have)}), пунктов особенностей "
          f"{len(out.get('features', {}).get('items', []))}, похожих {len(out.get('related', {}).get('items', []))}")


if __name__ == "__main__":
    for slug in sys.argv[1:]:
        build(slug)
