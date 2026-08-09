#!/usr/bin/env python3
"""Пересобирает реестр переноса pages.csv из аудита work/ и текущего состояния src/pages.

Запуск:  python3 migration/build_registry.py     (из корня astro-clone)

Источники:
  ../work/inventory.csv     — обход сайта 20.07.2026 (URL, title, description, h1, объём)
  ../work/semantic-core.csv — частотности Wordstat и приоритеты по целевым URL
  ../work/raw/pages/*.html  — снимки страниц, по ним считается «отпечаток» шаблона Tilda
  src/pages/*.astro         — что уже перенесено

Статус страницы НЕ придумывается: `done`, если файл страницы существует в src/pages.
"""
import csv
import collections
import glob
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))
CLONE = os.path.dirname(ROOT)
WORK = os.path.join(os.path.dirname(CLONE), "work")

# --- типы страниц: слаг -> тип (шаблон переноса) ---
VENUES = {
    "40letpobedy216", "magnitogorskaya1", "nagibina14", "guardeskypereulog61",
    "sokolova23", "krasnormerskaya103", "socialicheskaya186", "nansena107", "mira27",
}
VR = {"portal-strike", "portal-strike-kids", "portal-zombie", "party-games"}
HOLIDAY = {
    "kids", "prazdnik-maxi", "den-rozhdeniya-uznik-azkabana",
    "den-rozhdeniya-na-vr-arene", "vypusknoj-kalmar",
}
CATEGORY = {"strashnye-kvesty"}
INFO = {"contacts"}


def page_type(slug):
    if slug == "index":
        return "home"
    if slug in VENUES:
        return "venue"
    if slug in VR:
        return "vr"
    if slug in HOLIDAY:
        return "holiday"
    if slug in CATEGORY:
        return "category"
    if slug in INFO:
        return "info"
    return "quest"


def slug_of(url):
    p = re.sub(r"^https?://[^/]+", "", url).strip("/")
    return p or "index"


def block_signature(slug):
    """Мультимножество типов Tilda-блоков со снимка страницы."""
    hits = glob.glob(os.path.join(WORK, "raw", "pages", f"{slug}--*.html"))
    if not hits:
        return None
    html = open(hits[0], encoding="utf-8", errors="ignore").read()
    return collections.Counter(re.findall(r'data-record-type="(\d+)"', html))


def cluster_pages(sigs, threshold=0.80):
    """Группирует страницы по сходству отпечатка (Жаккар по мультимножеству)."""
    clusters = []
    for slug in sigs:
        for c in clusters:
            a, b = sigs[slug], sigs[c[0]]
            inter, uni = sum((a & b).values()), sum((a | b).values())
            if uni and inter / uni >= threshold:
                c.append(slug)
                break
        else:
            clusters.append([slug])
    clusters.sort(key=len, reverse=True)
    return {slug: i + 1 for i, c in enumerate(clusters) for slug in c}


def keyword_weights():
    """Суммарная частотность и приоритет семантики по целевому URL."""
    agg = collections.defaultdict(lambda: {"freq": 0, "prio": set()})
    path = os.path.join(WORK, "semantic-core.csv")
    if not os.path.exists(path):
        return agg
    for r in csv.DictReader(open(path, encoding="utf-8-sig")):
        url = (r.get("target_or_proposed_url") or "").strip()
        # «предлагается»/«сейчас noindex» — это будущие страницы, привязка к слагу по началу строки
        m = re.match(r"^(/[\w\-/_]*)", url)
        if not m:
            continue
        agg[m.group(1)]["freq"] += int(re.sub(r"\D", "", r.get("frequency") or "") or 0)
        agg[m.group(1)]["prio"].add((r.get("priority") or "").split()[0])
    return agg


def migrated_slugs():
    """Перенесённые страницы: данные в src/data/pages/*.json либо отдельный файл в src/pages."""
    done = set()
    for f in glob.glob(os.path.join(CLONE, "src", "data", "pages", "*.json")):
        done.add(os.path.basename(f)[:-5])
    for f in glob.glob(os.path.join(CLONE, "src", "pages", "*.astro")):
        name = os.path.basename(f)[:-6]
        if name == "tilda":
            continue
        done.add(name)
    for f in glob.glob(os.path.join(CLONE, "src", "pages", "*", "index.astro")):
        done.add(os.path.basename(os.path.dirname(f)))
    return done


def main():
    inv = list(csv.DictReader(open(os.path.join(WORK, "inventory.csv"), encoding="utf-8-sig")))
    pages = [r for r in inv if "sitemap" in r["source"] and r["status"] == "200"]

    sigs = {}
    for r in pages:
        s = block_signature(slug_of(r["url"]))
        if s:
            sigs[slug_of(r["url"])] = s
    clusters = cluster_pages(sigs)
    weights = keyword_weights()
    done = migrated_slugs()

    out = []
    for r in pages:
        slug = slug_of(r["url"])
        path = "/" if slug == "index" else "/" + slug
        w = weights.get(path, {"freq": 0, "prio": set()})
        out.append({
            "slug": slug,
            "path": path,
            "type": page_type(slug),
            "template_cluster": clusters.get(slug, ""),
            "status": "done" if (slug in done or (slug == "index" and "index" in done)) else "todo",
            "kw_freq": w["freq"],
            "kw_priority": ",".join(sorted(p for p in w["prio"] if p)),
            "words": r["word_count"],
            "title": r["title"],
            "title_len": r["title_len"],
            "description": r["description"],
            "description_len": r["description_len"],
            "h1": r["h1"],
            "url": r["url"],
            "snapshot": (glob.glob(os.path.join(WORK, "raw", "pages", f"{slug}--*.html")) or [""])[0].replace(
                os.path.dirname(CLONE) + "/", ""),
        })

    # порядок: сначала перенесённые, потом по весу семантики и объёму
    order = {"home": 0, "category": 1, "holiday": 2, "venue": 3, "vr": 4, "quest": 5, "info": 6}
    out.sort(key=lambda x: (x["status"] != "done", order.get(x["type"], 9), -x["kw_freq"], -int(x["words"] or 0)))

    dest = os.path.join(ROOT, "pages.csv")
    with open(dest, "w", encoding="utf-8", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        wr.writeheader()
        wr.writerows(out)

    by_type = collections.Counter(x["type"] for x in out)
    done_n = sum(1 for x in out if x["status"] == "done")
    print(f"реестр: {dest}")
    print(f"страниц в sitemap: {len(out)} | перенесено: {done_n} | осталось: {len(out) - done_n}")
    print("по типам:", dict(by_type))
    print("кластеры шаблонов:", dict(collections.Counter(x["template_cluster"] for x in out)))


if __name__ == "__main__":
    main()
