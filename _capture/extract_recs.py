#!/usr/bin/env python3
"""Текст и картинки rec-блоков из HTML-снимка оригинала (work/raw/pages/<slug>--*.html).

Запуск: python3 _capture/extract_recs.py <slug> [rec1 rec2 ...]
Нужен для блоков, которых нет в снимке живой страницы: слайды каруселей и вкладки Tilda
лежат в разметке, но скрыты, поэтому Playwright их не видит.
"""
import glob
import html
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(os.path.dirname(ROOT), "work", "raw", "pages")
JUNK = ("#rec", "@media", "}", "<div", "var ", "window.", "t396_")


def blocks(h):
    marks = [(m.start(), m.group(1)) for m in re.finditer(r'id="(rec\d+)"[^>]*class="r t-rec"', h)]
    marks += [(m.start(), m.group(1)) for m in re.finditer(r"id='(rec\d+)'[^>]*class='r t-rec'", h)]
    marks.sort()
    for i, (pos, rec) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(h)
        yield rec, h[pos:end]


def texts(chunk):
    t = re.sub(r"<script.*?</script>", "", chunk, flags=re.S)
    t = re.sub(r"<style.*?</style>", "", t, flags=re.S)
    t = re.sub(r"<[^>]+>", "\n", t)
    out, seen = [], set()
    for line in t.split("\n"):
        s = html.unescape(line).strip()
        if 2 < len(s) < 300 and not s.startswith(JUNK) and s not in seen:
            seen.add(s)
            out.append(s)
    return out


def main():
    slug = sys.argv[1]
    want = set(sys.argv[2:])
    hits = glob.glob(os.path.join(RAW, f"{slug}--*.html"))
    if not hits:
        print(f"снимка нет: {RAW}/{slug}--*.html")
        return
    h = open(hits[0], encoding="utf-8", errors="ignore").read()
    for rec, chunk in blocks(h):
        if want and rec not in want:
            continue
        rtype = (re.search(r'data-record-type="(\d+)"', chunk) or [None, "?"])[1]
        imgs = sorted(set(re.findall(r"https://[a-z0-9.]*tildacdn\.com/[^\"' )]+?\.(?:jpg|jpeg|png|webp)", chunk)))
        lines = [x for x in texts(chunk) if not x.startswith(("id=", "class="))]
        print(f"\n=== {rec} type={rtype} строк={len(lines)} картинок={len(imgs)}")
        for x in lines[:40]:
            print("   •", x[:200])
        for u in imgs[:12]:
            print("   img", u)


if __name__ == "__main__":
    main()
