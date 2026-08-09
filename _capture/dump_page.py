#!/usr/bin/env python3
"""Читаемый дамп снимка страницы: секции, тексты, ссылки, картинки.

Запуск: python3 _capture/dump_page.py <slug> > /tmp/<slug>.txt
Нужен, чтобы разбирать нестандартные макеты (праздничные страницы), не таща JSON в чат.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "_capture", "pages")
HOST = "https://xn--80aehcht5ci1b.xn--p1ai"


def main(slug):
    d = json.load(open(os.path.join(SRC, f"{slug}.json"), encoding="utf-8"))
    m = d["meta"]
    print(f"# {slug}\nTITLE: {m['title']}\nDESC: {m['description']}")
    print(f"KEYWORDS: {m.get('keywords','')}\nH1: {m['h1']}\nHEIGHT: {m['docHeight']}")
    for i, s in enumerate(d["sections"]):
        plain = (s.get("plain") or "").strip()
        if not plain and not s["imgs"] and not s["bgs"]:
            continue
        print(f"\n--- [{i}] rec={s['rec']} type={s['type']} h={s['h']} top={s['t']} bg={s['bgColor']}")
        if plain:
            print("TEXT:")
            for line in plain.split("\n"):
                if line.strip():
                    print("   ", line.strip()[:300])
        if s["links"]:
            print("LINKS:")
            seen = set()
            for l in s["links"]:
                href = l["href"].replace(HOST, "") or "/"
                key = (l["text"][:40], href)
                if key in seen:
                    continue
                seen.add(key)
                print(f"    [{l['text'][:60]}] -> {href}  ({l['w']}x{l['h']} @{l['l']},{l['t']})")
        if s["imgs"]:
            print("IMGS:")
            for im in s["imgs"]:
                print(f"    {im['w']}x{im['h']} alt={im['alt'][:40]!r} {im['src']}")
        if s["bgs"]:
            print("BGS:")
            for b in s["bgs"]:
                print(f"    {b['w']}x{b['h']} @{b['l']},{b['t']} {b['url']}")


if __name__ == "__main__":
    main(sys.argv[1])
