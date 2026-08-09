#!/usr/bin/env python3
"""Снимок праздничной страницы -> блочные данные для шаблона HolidayPage + локальные картинки.

Запуск:  python3 _capture/build_holiday.py <slug> [ещё слаги...]
Читает:  _capture/pages/<slug>.json      (снимок живого сайта, scrape_page.mjs)
Пишет:   src/data/pages/<slug>.json      (данные страницы)
         public/assets/q/<hash>.webp     (общий пул картинок с дедупом по URL)

У пяти праздничных страниц каждый макет свой, поэтому данные — не фиксированный набор полей,
а СПИСОК СЕКЦИЙ: {"kind": "...", ...}. Шаблон рисует их по порядку. Скрипт делает черновик
(тексты, ссылки, картинки), спорные блоки — пакеты с ценами, тайминг — доводятся руками:
на Tilda они частью запечены в PNG, машинно их не прочитать.

Не переносим: виджеты отзывов и квиза (тип 131, доменно-залочены), карту Яндекса (125),
собственные шапку/футер Tilda (344/977/464/976 идут своим компонентом), распорки (113/126/215).
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_quest import DST, SRC, fix_desc, fix_title, local_image, rel_href  # noqa: E402

HOST = "https://xn--80aehcht5ci1b.xn--p1ai"

SKIP_TYPES = {"113", "126", "215", "363", "128", "131", "125", "344", "977", "464", "976", "395"}
# карточные блоки Tilda: плитки с фото и подписью
CARD_TYPES = {"121", "1196", "959", "774", "923", "829", "490", "799"}
GALLERY_TYPES = {"662", "552", "1148"}
ADDR_RE = re.compile(r"(улиц|проспект|переул|шоссе|пр-т|ул\.)[^,]*,?\s*\d", re.I)
FORM_MARKERS = ("даю согласие", "политикой обработки")


def lines(sec):
    return [t.strip() for t in (sec.get("plain") or "").split("\n") if t.strip()]


def norm_href(h):
    """Квиз, попапы и стрелки слайдера на статике не работают — ведём их на форму заявки."""
    h = rel_href(h)
    if "#" in h:
        anchor = h.split("#", 1)[1]
        if anchor.startswith(("openquiz", "popup", "sendzeroform", "prev", "next", "rec")):
            return "#prazdnik"
    return h


def clean_link_text(t):
    """У Tilda в тексте ссылки иногда лежит кусок CSS карточки — такие подписи выбрасываем."""
    t = (t or "").strip()
    if not t or "{" in t or t.startswith("#rec"):
        return ""
    return t


def uniq_bgs(sec, min_side=100):
    """Фоновые картинки блока без дублей и превьюшек-заглушек (resize/20x, noroot)."""
    out, seen = [], set()
    for b in sec["bgs"]:
        u = b["url"]
        if u.startswith("data:") or "noroot" in u or "/resize/20x/" in u:
            continue
        key = u.split("/-/")[0]
        if key in seen or b["w"] < min_side or b["h"] < min_side:
            continue
        seen.add(key)
        out.append(b)
    return out


def card_names(sec):
    """Подписи карточек: в тексте блока они идут после заголовка и подзаголовка.

    У Tilda в тексте ссылки лежит CSS карточки, поэтому имена берём из plain, отбрасывая
    служебные строки вроде «День рождения в стиле», которые повторяются перед каждой карточкой.
    """
    ls = lines(sec)
    if len(ls) < 3:
        return []
    from collections import Counter
    cnt = Counter(ls)
    return [t for t in ls[1:] if cnt[t] == 1 and 2 < len(t) < 60][1:] if cnt.most_common(1)[0][1] > 1 \
        else [t for t in ls[2:] if 2 < len(t) < 60]


def cards_of(sec, max_w=560):
    """Карточки блока: ссылка + подпись + своё фото. Фон ищем по геометрии ссылки."""
    bgs = uniq_bgs(sec, 120)
    names = card_names(sec)
    items, seen = [], set()
    for l in sec["links"]:
        href = norm_href(l["href"])
        if href in seen or href.startswith("#"):
            continue
        seen.add(href)
        best = None
        for b in bgs:
            covers = (b["l"] - 6 <= l["l"] and b["t"] - 6 <= l["t"]
                      and b["l"] + b["w"] + 6 >= l["l"] + l["w"]
                      and b["t"] + b["h"] + 6 >= l["t"] + l["h"])
            near = abs(b["l"] - l["l"]) < 60 and abs(b["t"] - l["t"]) < 80
            if covers or near:
                if best is None or b["w"] * b["h"] > best["w"] * best["h"]:
                    best = b
        name = clean_link_text(l["text"]) or (names[len(items)] if len(items) < len(names) else "")
        items.append({"t": name, "href": href,
                      "img": local_image(best["url"], max_w) if best else None})
    return items


def tiles_of(sec, max_w=560):
    """Плитки без ссылок наружу (шоу-программы, допы): фото + подпись под ним.

    Подпись и фото сопоставляем ПО КООРДИНАТАМ, а не по номеру в списке: у части плиток
    на Tilda вместо фото стоит заглушка noroot, и нумерация разъезжается — подпись уезжает
    к чужой картинке.
    """
    imgs = [{"url": i["src"], "l": 0, "t": 0, "w": i["w"], "h": i["h"], "alt": i.get("alt", "")}
            for i in sec["imgs"] if not i["src"].endswith(".svg") and i["w"] >= 100]
    bgs = uniq_bgs(sec, 120)
    marks = [l for l in sec["links"] if clean_link_text(l["text"])]
    if not marks:
        names = [t for t in lines(sec) if len(t) < 60]
        src = imgs or bgs
        return [{"t": names[i] if i < len(names) else "", "img": local_image(s["url"], max_w)}
                for i, s in enumerate(src) if local_image(s["url"], max_w)]

    tiles = []
    for i, l in enumerate(marks):
        best = None
        for b in bgs:
            # подпись лежит поверх фото или сразу под ним — обе границы важны,
            # иначе второму ряду плиток достаются картинки первого
            covers = (b["l"] - 8 <= l["l"] and b["l"] + b["w"] + 8 >= l["l"] + l["w"]
                      and b["t"] - 8 <= l["t"] and b["t"] + b["h"] + 30 >= l["t"] + l["h"])
            if covers and (best is None or b["w"] * b["h"] > best["w"] * best["h"]):
                best = b
        if best is None and i < len(imgs):
            best = imgs[i]                                   # <img> позиций не даёт — по порядку
        tiles.append({"t": clean_link_text(l["text"]),
                      "img": local_image(best["url"], max_w) if best else None})
    return tiles


def build(slug, out_type="holiday"):
    data = json.load(open(os.path.join(SRC, f"{slug}.json"), encoding="utf-8"))
    meta = data["meta"]
    secs = data["sections"]
    h1 = (meta["h1"] or [""])[0]
    out = {
        "slug": slug,
        "type": out_type,
        "seo": {"title": fix_title(meta["title"], h1), "description": fix_desc(meta["description"]),
                "keywords": meta.get("keywords", ""), "h1": h1},
        "sections": [],
    }

    pending = None          # заголовочный блок Tilda: отдаём его следующей секции
    hero_done = False
    for sec in secs:
        t = sec["type"]
        ls = lines(sec)
        text = " ".join(ls).lower()
        if t in SKIP_TYPES or any(k in text for k in FORM_MARKERS):
            continue

        # --- герой: первый крупный блок с фоном ---
        if not hero_done and t == "396" and sec["h"] > 400 and sec["t"] < 1200:
            bgs = uniq_bgs(sec, 300)
            big = max(bgs, key=lambda b: b["w"] * b["h"]) if bgs else None
            btns = [{"t": clean_link_text(l["text"]), "href": norm_href(l["href"])}
                    for l in sec["links"] if clean_link_text(l["text"])][:2]
            btn_texts = {b["t"].lower() for b in btns}
            free = [x for x in ls if x.lower() not in btn_texts]
            title = next((x for x in free if x.isupper() and len(x) > 10), free[0] if free else h1)
            subs = [x for x in free if x != title and len(x) > 12 and not x.isupper()]
            # PNG поверх светлого фона — не фон, а вырезанный персонаж: герой светлый, фото справа
            ghost = big and ".png" in big["url"] and big["w"] < big["h"] * 1.6
            out["sections"].append({
                "kind": "hero",
                "variant": "light" if ghost else "dark",
                "h1": h1,
                "up": next((x for x in free if x.isupper() and x != title and len(x) < 30), ""),
                "sub": subs[0] if subs else "",
                "buttons": btns,
                "bg": local_image(big["url"], 1600) if big else None,
                "bgset": ({str(w): local_image(big["url"], w) for w in (760, 1200, 1600)}
                          if big else None),
            })
            hero_done = True
            continue

        # --- хлебные крошки ---
        if t == "758":
            names = [x for x in ls if x not in ("/", "|", "»", "›")]
            hrefs = [rel_href(l["href"]) for l in sec["links"]]
            crumbs = [{"t": n, "href": hrefs[i] if i < len(hrefs) else None}
                      for i, n in enumerate(names)]
            if crumbs:
                crumbs[-1]["href"] = None
            out["breadcrumbs"] = crumbs
            continue

        # --- площадка (блок с адресом в первой строке) ---
        if t == "396" and ls and ADDR_RE.search(ls[0]) and sec["h"] > 300:
            photos = [local_image(b["url"], 1200) for b in uniq_bgs(sec, 300)]
            out["sections"].append({
                "kind": "venue",
                "title": (pending or {}).get("title", ""),
                "subtitle": (pending or {}).get("sub", ""),
                "address": ls[0],
                "cta": next((clean_link_text(l["text"]) for l in sec["links"]
                             if clean_link_text(l["text"])), "Забронировать дату"),
                "lines": [x for x in ls[1:] if not re.match(r"^\d+ из \d+$", x)
                          and clean_link_text(x).lower() != "забронировать дату"],
                "photos": [p for p in photos if p][:4],
            })
            pending = None
            continue

        # --- галереи ---
        if t in GALLERY_TYPES:
            photos = [local_image(b["url"], 900) for b in uniq_bgs(sec, 200)]
            photos += [local_image(i["src"], 900) for i in sec["imgs"] if i["w"] >= 200]
            photos = [p for p in dict.fromkeys(photos) if p]
            if photos:
                out["sections"].append({
                    "kind": "gallery",
                    "title": (pending or {}).get("title", ""),
                    "subtitle": (pending or {}).get("sub", ""),
                    "photos": photos[:12],
                })
                pending = None
            continue

        # --- карточные блоки ---
        if t in CARD_TYPES:
            items = cards_of(sec)
            if items and any(i["href"].startswith("/") for i in items):
                out["sections"].append({
                    "kind": "cards",
                    "title": (pending or {}).get("title", "") or (ls[0] if ls else ""),
                    "subtitle": (pending or {}).get("sub", "") or (ls[1] if len(ls) > 1 else ""),
                    "items": items,
                })
            else:
                tiles = tiles_of(sec)
                if tiles:
                    out["sections"].append({
                        "kind": "tiles",
                        "title": (pending or {}).get("title", "") or (ls[0] if ls else ""),
                        "subtitle": (pending or {}).get("sub", ""),
                        "items": tiles,
                    })
            pending = None
            continue

        # --- пакеты: три PNG-карточки со ссылкой на квиз (текст вбит в картинку) ---
        pkg_imgs = [i for i in sec["imgs"] if i["w"] > 300 and i["h"] > 300]
        if t == "396" and len(pkg_imgs) >= 3:
            out["sections"].append({
                "kind": "packages",
                "title": (pending or {}).get("title", ""),
                "subtitle": (pending or {}).get("sub", ""),
                "cta": next((clean_link_text(l["text"]) for l in sec["links"]
                             if clean_link_text(l["text"])), "Узнать стоимость"),
                "raw_images": [local_image(i["src"], 900) for i in pkg_imgs],
                "items": [],           # заполняется руками по скриншоту
            })
            pending = None
            continue

        # --- текстовые блоки ---
        if not ls:
            continue
        title = ls[0]
        body = ls[1:]
        if len(ls) <= 2 and len(title) < 120:
            # заголовочный блок Tilda — держим до следующей секции
            pending = {"title": title, "sub": body[0] if body else ""}
            continue
        photos = [local_image(b["url"], 900) for b in uniq_bgs(sec, 200)]
        out["sections"].append({
            "kind": "text",
            "title": (pending or {}).get("title", "") or title,
            "subtitle": (pending or {}).get("sub", ""),
            "lines": (ls if (pending or {}).get("title") else body),
            "photos": [p for p in photos if p][:6],
        })
        pending = None

    json.dump(out, open(os.path.join(DST, f"{slug}.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    kinds = [s["kind"] for s in out["sections"]]
    print(f"{slug}: секций {len(kinds)} — {', '.join(kinds)}")


if __name__ == "__main__":
    for s in sys.argv[1:]:
        build(s)
