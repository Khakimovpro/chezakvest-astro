#!/usr/bin/env python3
"""Снимок страницы площадки -> данные для шаблона VenuePage.

Запуск:  python3 _capture/build_venue.py <slug> [ещё слаги...]

Карта на оригинале — виджет Яндекса, доменно-залоченный: на своём хосте он не работает.
Поэтому карта вырезается из полноразмерного скриншота страницы (_capture/shots/<slug>-1440.png)
и кладётся картинкой со ссылкой «Открыть в Яндекс.Картах» по адресу площадки.
Блок отзывов (виджет yourgood) не переносится по той же причине.
"""
import json
import os
import re
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_quest import (ROOT, SRC, DST, IMGDIR, fix_desc, fix_title, lines,  # noqa: E402
                         local_image, quest_names, rel_href)

SHOTS = os.path.join(ROOT, "_capture", "shots")
NAMES = None


def game_slugs():
    """Только квесты и VR — чтобы в «квесты на локации» не попали соседние площадки."""
    import csv
    path = os.path.join(ROOT, "migration", "pages.csv")
    out = set()
    if os.path.exists(path):
        for r in csv.DictReader(open(path, encoding="utf-8")):
            if r["type"] in ("quest", "vr"):
                out.add("/" + r["slug"])
    return out


def crop_map(slug, sec):
    """Вырезает область карты из скриншота страницы и сохраняет в webp."""
    src = os.path.join(SHOTS, f"{slug}-1440.png")
    if not os.path.exists(src):
        return None
    im = Image.open(src).convert("RGB")
    top, height = sec["t"], sec["h"]
    if top + height > im.height or height < 200:
        return None
    box = im.crop((max(0, sec["l"]), top, min(im.width, sec["l"] + sec["w"]), top + height))
    if box.width > 1400:
        box = box.resize((1400, round(box.height * 1400 / box.width)), Image.LANCZOS)
    out = os.path.join(IMGDIR, f"map-{slug}.webp")
    box.save(out, "WEBP", quality=80, method=5)
    return f"/assets/q/map-{slug}.webp"


def build(slug):
    global NAMES
    if NAMES is None:
        NAMES = quest_names()

    data = json.load(open(os.path.join(SRC, f"{slug}.json"), encoding="utf-8"))
    secs = [s for s in data["sections"] if s["type"] != "131"]      # 131 — виджет отзывов
    meta = data["meta"]
    h1 = (meta["h1"] or [""])[0]
    out = {"slug": slug, "type": "venue",
           "seo": {"title": fix_title(meta["title"], h1), "description": fix_desc(meta["description"]),
                   "keywords": meta.get("keywords", ""), "h1": h1}}

    # ---------- крошки ----------
    bc = next((s for s in secs if s["type"] == "758"), None)
    if bc:
        names = [t for t in lines(bc) if t not in ("/", "|")]
        hrefs = [rel_href(l["href"]) for l in bc["links"]]
        crumbs = [{"t": n, "href": hrefs[i] if i < len(hrefs) else None} for i, n in enumerate(names)]
        if crumbs:
            crumbs[-1]["href"] = None
        out["breadcrumbs"] = crumbs

    # ---------- «Как нас найти?»: надзаголовок + H1 + варианты прохода + фото ориентиров ----------
    intro = next((s for s in secs if s["type"] == "396" and "как нас найти" in (s.get("plain") or "").lower()), None)
    def is_route(sec):
        txt = (sec.get("plain") or "").lower()
        return (sec["type"] == "396" and sec["bgs"]
                and ("построить маршрут" in txt or "вариант 1" in txt or "вход" in txt))

    route = next((s for s in secs if is_route(s)), None)
    howto = {"uptitle": "Как нас найти?", "title": h1, "variants": [], "photos": [], "cta": "Построить маршрут"}
    if intro:
        ls = lines(intro)
        howto["uptitle"] = ls[0] if ls else howto["uptitle"]
        howto["title"] = ls[1] if len(ls) > 1 else h1
    if route:
        ls = [t for t in lines(route) if t.lower() != "построить маршрут"]
        howto["variants"] = ls
        seen = set()
        for b in route["bgs"]:
            u = b["url"].split("?")[0]
            if u in seen:
                continue
            seen.add(u)
            p = local_image(b["url"], 700)
            if p:
                howto["photos"].append(p)
        howto["photos"] = howto["photos"][:8]
        ymap = next((l["href"] for l in route["links"] if "yandex" in l["href"]), None)
        if ymap:
            howto["routeUrl"] = ymap
    out["howto"] = howto

    # ---------- карта ----------
    map_sec = next((s for s in secs if s["type"] == "396" and not lines(s) and s["h"] > 300), None)
    if map_sec:
        out["map"] = {"img": crop_map(slug, map_sec)}

    # ---------- квесты на локации ----------
    games_title = next((s for s in secs if s["type"] == "396" and "доступные квесты" in (s.get("plain") or "").lower()), None)
    GAMES = game_slugs()
    games_sec = next((s for s in secs if s["type"] in ("121", "396") and s["h"] > 200 and s["bgs"]
                      and len({rel_href(l["href"]) for l in s["links"]} & GAMES) >= 1), None)
    if games_sec:
        hrefs = [h for h in dict.fromkeys(rel_href(l["href"]) for l in games_sec["links"]) if h in GAMES]
        imgs = [b["url"] for b in games_sec["bgs"] if b["w"] >= 200 and b["h"] >= 200 and "noroot" not in b["url"]]
        items = []
        for i, href in enumerate(hrefs):
            items.append({"t": NAMES.get(href, href.strip("/")), "href": href,
                          "img": local_image(imgs[i], 560) if i < len(imgs) else None})
        out["games"] = {"title": (lines(games_title) or ["Доступные квесты на локации"])[0] if games_title
                        else "Доступные квесты на локации", "items": items}

    # ---------- зал для праздника ----------
    def is_hall_lead(sec):
        txt = (sec.get("plain") or "").lower()
        return sec["type"] == "396" and "зал" in txt and "оборудован" in txt and sec["h"] < 300

    lead = next((s for s in secs if is_hall_lead(s)), None)
    hall = None
    if lead:
        for sec in secs[secs.index(lead) + 1:secs.index(lead) + 3]:
            if sec["type"] == "396" and sec["bgs"] and sec["h"] > 300:
                hall = sec
                break
    if hall is None:
        hall = next((s for s in secs if s["type"] == "396" and s["h"] > 400 and s["bgs"]
                     and re.search(r"зал|комнат", (s.get("plain") or ""), re.I)), None)
    if hall:
        ls = lines(hall)
        photos, seen = [], set()
        for b in hall["bgs"]:
            u = b["url"].split("?")[0]
            if u in seen:
                continue
            seen.add(u)
            p = local_image(b["url"], 1200)
            if p:
                photos.append(p)
        out["hall"] = {
            "title": (lines(lead) or [""])[0] if lead else "Выберите зал, который подходит под ваш праздник!",
            "subtitle": (lines(lead) or ["", ""])[1] if lead and len(lines(lead)) > 1 else "",
            "address": ls[0].title() if ls else "",
            "cta": next((l["text"] for l in hall["links"] if l["text"]), "Забронировать дату"),
            "lines": [t for t in ls[1:] if t.lower() != "забронировать дату" and not re.match(r"^\d+ из \d+$", t)],
            "photos": photos[:6],
        }

    json.dump(out, open(os.path.join(DST, f"{slug}.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"{slug}: вариантов прохода {len(howto['variants'])}, фото {len(howto['photos'])}, "
          f"квестов на локации {len(out.get('games', {}).get('items', []))}, "
          f"карта {'есть' if out.get('map', {}).get('img') else 'нет'}, "
          f"зал {'есть' if out.get('hall') else 'нет'}")


if __name__ == "__main__":
    for s in sys.argv[1:]:
        build(s)
