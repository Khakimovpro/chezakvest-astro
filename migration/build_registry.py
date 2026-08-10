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
import json
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
    "den-rozhdeniya-na-vr-arene", "vypusknoj-kalmar", "new-year-2025",
    "prazdniki-pod-kluch",
}
CATEGORY = {"strashnye-kvesty"}
INFO = {"contacts"}
REDIRECT_ONLY = {"wednesday_ukradennaya_vesch"}
CANONICAL_ORIGIN = "https://xn--80aehcht5ci1b.xn--p1ai"


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


def word_count(value):
    """Count a page-data excerpt without pretending it is an audited Tilda total."""
    if isinstance(value, dict):
        return sum(word_count(item) for item in value.values())
    if isinstance(value, list):
        return sum(word_count(item) for item in value)
    if isinstance(value, str):
        return len(re.findall(r"[\wÀ-ɏЁё-]+", value))
    return 0


def current_seo(slug):
    """Return published Astro metadata when a migrated data record owns it.

    The historic inventory remains the source for crawl facts and word totals, but
    the registry must show the metadata that will actually ship after the migration.
    """
    if slug == "index":
        path = os.path.join(CLONE, "src", "data", "site.json")
        if os.path.exists(path):
            return json.load(open(path, encoding="utf-8")).get("meta") or {}
        return {}

    path = os.path.join(CLONE, "src", "data", "pages", f"{slug}.json")
    if not os.path.exists(path):
        return {}
    return json.load(open(path, encoding="utf-8")).get("seo") or {}


def current_data_pages(known_slugs, weights):
    """Records that are intentionally outside the historic official sitemap.

    New commercial pages are real Astro data, not hand-maintained CSV rows. This
    keeps the registry truthful when a route is captured from Tilda later.
    """
    records = []
    for path in sorted(glob.glob(os.path.join(CLONE, "src", "data", "pages", "*.json"))):
        page = json.load(open(path, encoding="utf-8"))
        slug = page.get("slug") or os.path.basename(path)[:-5]
        if slug in known_slugs:
            continue
        seo = page.get("seo") or {}
        route = "/" + slug
        weight = weights.get(route, {"freq": 0, "prio": set()})
        records.append({
            "slug": slug,
            "path": route,
            "type": page.get("type") or page_type(slug),
            "template_cluster": "active-hidden",
            "status": "done",
            "kw_freq": weight["freq"],
            "kw_priority": ",".join(sorted(p for p in weight["prio"] if p)),
            "words": word_count(page),
            "title": seo.get("title", ""),
            "title_len": len(seo.get("title", "")),
            "description": seo.get("description", ""),
            "description_len": len(seo.get("description", "")),
            "h1": seo.get("h1", ""),
            "url": f"{CANONICAL_ORIGIN}{route}",
            "snapshot": f"_capture/pages/{slug}.json" if os.path.exists(os.path.join(CLONE, "_capture", "pages", f"{slug}.json")) else "",
        })
    return records


def catalog_record(weights):
    """The catalogue is a static Astro route, so read its literal SEO constants."""
    source = os.path.join(CLONE, "src", "pages", "kvesty-v-rostove-na-donu.astro")
    if not os.path.exists(source):
        return None
    text = open(source, encoding="utf-8").read()

    def literal(name):
        found = re.search(rf"const {name} = '([^']*)';", text)
        return found.group(1) if found else ""

    path = "/kvesty-v-rostove-na-donu"
    weight = weights.get(path, {"freq": 0, "prio": set()})
    title, description = literal("title"), literal("description")
    return {
        "slug": "kvesty-v-rostove-na-donu",
        "path": path,
        "type": "category",
        "template_cluster": "catalog",
        "status": "done",
        "kw_freq": weight["freq"],
        "kw_priority": ",".join(sorted(p for p in weight["prio"] if p)),
        "words": word_count([title, description]),
        "title": title,
        "title_len": len(title),
        "description": description,
        "description_len": len(description),
        "h1": "Квесты в Ростове-на-Дону",
        "url": f"{CANONICAL_ORIGIN}{path}",
        "snapshot": "",
    }


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
    known_slugs = set()
    for r in pages:
        slug = slug_of(r["url"])
        seo = current_seo(slug)
        known_slugs.add(slug)
        path = "/" if slug == "index" else "/" + slug
        w = weights.get(path, {"freq": 0, "prio": set()})
        out.append({
            "slug": slug,
            "path": path,
            "type": page_type(slug),
            "template_cluster": clusters.get(slug, ""),
            "status": "redirect" if slug in REDIRECT_ONLY else ("done" if (slug in done or (slug == "index" and "index" in done)) else "todo"),
            "kw_freq": w["freq"],
            "kw_priority": ",".join(sorted(p for p in w["prio"] if p)),
            "words": r["word_count"],
            "title": seo.get("title", r["title"]),
            "title_len": len(seo.get("title", r["title"])),
            "description": seo.get("description", r["description"]),
            "description_len": len(seo.get("description", r["description"])),
            "h1": seo.get("h1", r["h1"]),
            "url": r["url"],
            "snapshot": (glob.glob(os.path.join(WORK, "raw", "pages", f"{slug}--*.html")) or [""])[0].replace(
                os.path.dirname(CLONE) + "/", ""),
        })

    out.extend(current_data_pages(known_slugs, weights))
    catalog = catalog_record(weights)
    if catalog:
        out.append(catalog)

    # порядок: сначала перенесённые, потом по весу семантики и объёму
    order = {"home": 0, "category": 1, "holiday": 2, "venue": 3, "vr": 4, "quest": 5, "info": 6}
    status_order = {"done": 0, "redirect": 1, "todo": 2}
    out.sort(key=lambda x: (status_order.get(x["status"], 9), order.get(x["type"], 9), -x["kw_freq"], -int(x["words"] or 0)))

    dest = os.path.join(ROOT, "pages.csv")
    with open(dest, "w", encoding="utf-8", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=list(out[0].keys()), lineterminator="\n")
        wr.writeheader()
        wr.writerows(out)

    by_type = collections.Counter(x["type"] for x in out)
    done_n = sum(1 for x in out if x["status"] == "done")
    redirect_n = sum(1 for x in out if x["status"] == "redirect")
    print(f"реестр: {dest}")
    print(f"страниц в реестре: {len(out)} | перенесено: {done_n} | redirect: {redirect_n} | осталось: {len(out) - done_n - redirect_n}")
    print("по типам:", dict(by_type))
    print("кластеры шаблонов:", dict(collections.Counter(x["template_cluster"] for x in out)))


if __name__ == "__main__":
    main()
