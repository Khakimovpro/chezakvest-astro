#!/usr/bin/env python3
"""Данные для одиночных страниц: категория «Страшные квесты» и «Контакты».

Запуск:  python3 _capture/build_misc.py strashnye-kvesty contacts

Блок отзывов (виджет, тип 131) и карта Яндекса не переносятся — они доменно-залочены;
на карту ведёт ссылка. Список площадок собирается из данных перенесённых страниц.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_quest import (SRC, DST, card_images, fix_desc, fix_title, lines,  # noqa: E402
                         local_image, quest_names, rel_href)

NAMES = None


def game_slugs():
    import csv
    from build_quest import ROOT
    path = os.path.join(ROOT, "migration", "pages.csv")
    out = {}
    if os.path.exists(path):
        for r in csv.DictReader(open(path, encoding="utf-8")):
            out["/" + r["slug"]] = r["type"]
    return out


def load(slug):
    return json.load(open(os.path.join(SRC, f"{slug}.json"), encoding="utf-8"))


def base_seo(meta):
    h1 = (meta["h1"] or [""])[0]
    return {"title": fix_title(meta["title"], h1), "description": fix_desc(meta["description"]),
            "keywords": meta.get("keywords", ""), "h1": h1}


def crumbs_of(secs):
    bc = next((s for s in secs if s["type"] == "758"), None)
    if not bc:
        return None
    names = [t for t in lines(bc) if t not in ("/", "|")]
    hrefs = [rel_href(l["href"]) for l in bc["links"]]
    out = [{"t": n, "href": hrefs[i] if i < len(hrefs) else None} for i, n in enumerate(names)]
    if out:
        out[-1]["href"] = None
    return out


def addr_key(addr):
    """Ключ адреса: номер дома + корень названия улицы. «пр-т Мира, д. 27» и «Мира 27» совпадут."""
    a = addr.lower().replace("ё", "е")
    num = "".join(re.findall(r"\d+", a))[:4]
    words = [w for w in re.findall(r"[а-я]{3,}", a)
             if w not in ("улица", "проспект", "переулок", "шоссе", "квест", "чтобы")]
    root = max(words, key=len)[:5] if words else ""
    return f"{root}{num}" if num else ""


def build_category(slug):
    global NAMES
    NAMES = NAMES or quest_names()
    types = game_slugs()
    data = load(slug)
    secs = [s for s in data["sections"] if s["type"] != "131"]
    out = {"slug": slug, "type": "category", "seo": base_seo(data["meta"]),
           "breadcrumbs": crumbs_of(secs)}

    # герой: заголовок, подзаголовок, кнопки, фон
    hero_sec = next((s for s in secs if s["type"] == "396" and s["h"] > 400 and s["bgs"]), None)
    if hero_sec:
        ls = lines(hero_sec)
        out["hero"] = {
            "h1": ls[0] if ls else out["seo"]["h1"],
            "sub": ls[1] if len(ls) > 1 else "",
            "buttons": [{"t": l["text"], "href": rel_href(l["href"])}
                        for l in hero_sec["links"] if l["text"]][:2],
            "bg": local_image(hero_sec["bgs"][0]["url"], 1600),
            "bgset": {w: local_image(hero_sec["bgs"][0]["url"], w) for w in (760, 1200, 1600)},
        }

    # карточки квестов категории
    grid = next((s for s in secs if s["type"] == "121" and s["h"] > 800), None)
    title_sec = next((s for s in secs if s["type"] == "396" and "выберите" in (s.get("plain") or "").lower()), None)
    if grid:
        seen_h = set()
        cards = []
        for l in grid["links"]:
            h = rel_href(l["href"])
            if types.get(h) in ("quest", "vr") and h not in seen_h:
                seen_h.add(h)
                cards.append({"href": h, "l": l.get("l", 0), "t": l.get("t", 0),
                              "w": l.get("w", 0), "h": l.get("h", 0)})
        imgs = card_images(grid, cards)
        items = [{"t": NAMES.get(c["href"], c["href"].strip("/")), "href": c["href"],
                  "img": local_image(imgs[i], 560) if imgs[i] else None}
                 for i, c in enumerate(cards)]
        out["games"] = {"title": (lines(title_sec) or [""])[0] if title_sec else "Выберите свой квест",
                        "items": items}

    # фотогалерея
    gal = next((s for s in secs if s["type"] == "1148"), None)
    if gal:
        ls = lines(gal)
        photos = [local_image(i["src"], 900) for i in gal["imgs"]]
        out["gallery"] = {"title": ls[0] if ls else "", "photos": [p for p in photos if p]}

    # сертификат
    cert = next((s for s in secs if s["type"] == "396" and "сертификат" in (s.get("plain") or "").lower()), None)
    if cert:
        ls = lines(cert)
        photos = [local_image(i["src"], 900) for i in cert["imgs"]]
        out["cert"] = {"title": next((x for x in ls if len(x) < 60), ls[0] if ls else ""),
                       "lines": [x for x in ls if len(x) >= 60],
                       "cta": next((l["text"] for l in cert["links"] if l["text"]), "Заказать сертификат"),
                       "photos": [p for p in photos if p]}

    # площадки списком
    venues = next((s for s in secs if s["type"] == "976"), None)
    lead = next((s for s in secs if s["type"] == "396" and "наши площадки" in (s.get("plain") or "").lower()), None)
    if venues:
        # на оригинале это якоря, переключающие карту; при переносе ведём на страницы площадок
        addr_map = {}
        for f in os.listdir(DST):
            if not f.endswith(".json"):
                continue
            page = json.load(open(os.path.join(DST, f), encoding="utf-8"))
            if page.get("type") != "venue":
                continue
            addr = (page.get("breadcrumbs") or [{}])[-1].get("t", "")
            k = addr_key(addr)
            if k:
                addr_map[k] = "/" + page["slug"]

        def match(text):
            k = addr_key(text)
            return addr_map.get(k)

        items = []
        for l in venues["links"]:
            href = rel_href(l["href"])
            target = match(l["text"]) if types.get(href) != "venue" else href
            items.append({"t": l["text"].strip(), "href": target or href})
        ls = lines(lead) if lead else []
        out["venues"] = {"title": ls[0] if ls else "Наши площадки",
                         "subtitle": ls[1] if len(ls) > 1 else "", "items": items}

    # на оригинале у категории нет description — собираем из фактов самой страницы
    if not out["seo"]["description"]:
        n_games = len(out.get("games", {}).get("items", []))
        n_venues = len(out.get("venues", {}).get("items", []))
        out["seo"]["description"] = (
            f"{out['seo']['h1']} от компании «Чё за Квест»: {n_games} программ на выбор, "
            f"{n_venues} площадок в городе. Бронирование игры по телефону, работаем ежедневно."
        )

    json.dump(out, open(os.path.join(DST, f"{slug}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{slug}: квестов {len(out.get('games', {}).get('items', []))}, "
          f"фото {len(out.get('gallery', {}).get('photos', []))}, "
          f"площадок {len(out.get('venues', {}).get('items', []))}")


def build_contacts(slug="contacts"):
    data = load(slug)
    secs = data["sections"]
    out = {"slug": slug, "type": "info", "seo": base_seo(data["meta"]),
           "breadcrumbs": crumbs_of(secs)}

    block = next((s for s in secs if s["type"] == "1056"), None)
    if block:
        ls = lines(block)
        contacts = []
        for i, t in enumerate(ls):
            if t.endswith(":") or t.lower() in ("телефон", "email", "адрес", "соцсети"):
                value = ls[i + 1] if i + 1 < len(ls) else ""
                contacts.append({"label": t.rstrip(":"), "value": value})
        links = [{"t": l["text"], "href": l["href"]} for l in block["links"] if l["text"]]
        out["contacts"] = {"items": contacts, "links": links, "raw": ls}

    note = next((s for s in secs if s["type"] == "373"), None)
    if note:
        out["note"] = " ".join(lines(note))

    json.dump(out, open(os.path.join(DST, f"{slug}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{slug}: строк контактов {len(out.get('contacts', {}).get('raw', []))}, "
          f"ссылок {len(out.get('contacts', {}).get('links', []))}")


if __name__ == "__main__":
    for s in sys.argv[1:]:
        if s == "contacts":
            build_contacts(s)
        else:
            build_category(s)
