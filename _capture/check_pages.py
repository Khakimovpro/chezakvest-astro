#!/usr/bin/env python3
"""Приёмка собранных страниц: SEO-контур и внутренние ссылки.

Запуск: python3 _capture/check_pages.py          (после npm run build)

Для каждой страницы в dist проверяет: title и его длину, description и длину, canonical,
ровно один H1, JSON-LD (Service + BreadcrumbList) у indexable-страниц, og:image, alt у картинок.
Отдельно — ссылки на внутренние пути, которых нет в сборке (кандидаты в 404).
"""
import os
import re
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")


def pages():
    for dirpath, _, files in os.walk(DIST):
        for f in files:
            if f == "index.html" and "/tilda" not in dirpath:   # /tilda — архивный клон на движке Tilda
                p = os.path.join(dirpath, f)
                slug = os.path.relpath(dirpath, DIST).replace(".", "/")
                yield ("/" if slug == "/" else "/" + slug.strip("/")), p


def main():
    built = set()
    reports = []
    all_links = {}

    for url, path in pages():
        built.add(url.rstrip("/") or "/")
        html = open(path, encoding="utf-8").read()
        title = (re.search(r"<title>(.*?)</title>", html, re.S) or [None, ""])[1]
        desc = (re.search(r'<meta name="description" content="(.*?)"', html, re.S) or [None, ""])[1]
        canon = (re.search(r'<link rel="canonical" href="(.*?)"', html) or [None, ""])[1]
        h1 = re.findall(r"<h1[^>]*>(.*?)</h1>", html, re.S)
        ld = re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
        og = (re.search(r'<meta property="og:image" content="(.*?)"', html) or [None, ""])[1]
        imgs = re.findall(r"<img [^>]*>", html)
        no_alt = [i for i in imgs if "alt=" not in i]

        noindex = bool(re.search(r'<meta name="robots" content="[^"]*\bnoindex\b', html, re.I))
        problems = []
        if not title:
            problems.append("нет title")
        elif not noindex and len(title) > 65:
            problems.append(f"title {len(title)} знаков")
        if not desc:
            problems.append("нет description")
        elif not noindex and not (100 <= len(desc) <= 180):
            problems.append(f"description {len(desc)} знаков")
        if not canon:
            problems.append("нет canonical")
        if len(h1) != 1:
            problems.append(f"H1: {len(h1)} шт")
        types = " ".join(ld)
        # у квестов — Service, у площадок — EntertainmentBusiness
        SCHEMA_OK = ("Service", "EntertainmentBusiness", "LocalBusiness", "Organization", "CollectionPage")
        if url != "/" and not noindex and not any(t in types for t in SCHEMA_OK):
            problems.append("нет JSON-LD организации/услуги")
        if url != "/" and not noindex and "BreadcrumbList" not in types:
            problems.append("нет BreadcrumbList")
        if not og:
            problems.append("нет og:image")
        if no_alt:
            problems.append(f"без alt: {len(no_alt)} картинок")

        kb = round(os.path.getsize(path) / 1024)
        reports.append((url, kb, problems))

        hrefs = re.findall(r'href="([^"#?]+)', html)
        internal = {h.rstrip("/") or "/" for h in hrefs
                    if h.startswith("/") and not h.startswith("//")
                    and not re.search(r"\.(webp|png|jpg|svg|ico|css|js|pdf|xml|txt|woff2?)$", h)}
        all_links[url] = internal

    ok = [r for r in reports if not r[2]]
    print(f"страниц в сборке: {len(reports)}, без замечаний: {len(ok)}")
    for url, kb, problems in sorted(reports):
        mark = "ok " if not problems else "!! "
        print(f"{mark}{url:<48} {kb:>4} КБ  {'; '.join(problems)}")

    missing = Counter()
    for url, links in all_links.items():
        for l in links:
            if l not in built:
                missing[l] += 1
    if missing:
        print(f"\nвнутренние ссылки без страницы в сборке ({len(missing)} шт, число ссылающихся страниц):")
        for l, n in missing.most_common(30):
            print(f"  {l:<52} {n}")


if __name__ == "__main__":
    main()
