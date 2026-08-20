#!/usr/bin/env python3
"""Build deterministic, local page snapshots from the archived Tilda HTML.

The archived pages are the authoritative migration source.  This generator
keeps their responsive record markup and CSS while removing executable inline
code, analytics and third-party widgets.  Runtime dependencies and referenced
assets are vendored under ``public/assets``; Astro supplies the shared header
and a local lead form.

Usage:
    python3 _capture/build_source_snapshots.py
    python3 _capture/build_source_snapshots.py --routes /,/kids/
"""

from __future__ import annotations

import argparse
import copy
import gzip
import hashlib
import json
import re
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urljoin, urlparse
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup, Comment, NavigableString, Tag


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT.parent / "work" / "raw" / "pages"
INVENTORY = ROOT / "migration" / "parity" / "live-inventory.json"
SNAPSHOT_DIR = ROOT / "src" / "source-snapshots"
SOURCE_OVERRIDE_DIR = ROOT / "migration" / "parity" / "source-overrides"
MANIFEST_PATH = ROOT / "src" / "generated" / "source-snapshot-manifest.json"
PUBLIC_ASSETS = ROOT / "public" / "assets"
CSS_DIR = PUBLIC_ASSETS / "source-css"
RUNTIME_DIR = PUBLIC_ASSETS / "source-runtime"
RUTUBE_POSTER_DIR = PUBLIC_ASSETS / "rutube"
BASE_TOKEN = "__SITE_BASE__"
SOURCE_ORIGIN = "https://xn--80aehcht5ci1b.xn--p1ai"
ALLOWED_REMOTE_HOSTS = {
    "static.tildacdn.com",
    "optim.tildacdn.com",
    "thb.tildacdn.com",
    "thb.tildacdn.net",
    "neo.tildacdn.com",
    "ws.tildacdn.com",
    "fonts.googleapis.com",
    "fonts.gstatic.com",
    "chezakvest.ru",
}
SKIP_RESOURCE_HOSTS = {
    "myreviews.dev",
    "api-maps.yandex.ru",
    "yandex.ru",
    "yandex.com",
    "smartcaptcha.yandexcloud.net",
}
RUNTIME_URLS: tuple[str, ...] = ()
VENUE_HASH_ROUTES = {
    "#gvardeyskiy": "/guardeskypereulog61/",
    "#socialisticheskaya": "/socialicheskaya186/",
    "#krasnoarmeyskaya": "/krasnormerskaya103/",
    "#sokolova": "/sokolova23/",
    "#mira": "/mira27/",
    "#nansena": "/nansena107/",
    "#magnitogorskaya": "/magnitogorskaya1/",
    "#pobedy": "/40letpobedy216/",
    "#nagibina": "/nagibina14/",
}
LOCAL_FRAGMENT_TARGETS = {
    "#openquiz": "#source-booking",
    "#sendzeroform": "#source-booking",
    "#menuopen": "#mobile-menu",
}
BROKEN_ROUTE_ALIASES = {
    "/strashnye-kvesty/kvest_v_realnosti_dom_prizrakov": "/kvest_v_realnosti_dom_prizrakov/",
    "kvest_v_realnosti_dom_prizrakov": "/kvest_v_realnosti_dom_prizrakov/",
}
URL_RE = re.compile(r"(?P<quote>['\"]?)(?P<url>(?:https?:)?//[^'\"\s)<>]+)")
CSS_URL_RE = re.compile(r"url\(\s*(?P<quote>['\"]?)(?P<url>[^)'\"]+)(?P=quote)\s*\)", re.I)

_LOCAL_DATA_CACHE: dict[Path, dict] = {}
SITE_DATA = ROOT / "src" / "data" / "site.json"
VENUES_DATA = ROOT / "src" / "data" / "venues.json"
REVIEWS_DATA = ROOT / "src" / "data" / "reviews.json"
# The venue poster already ships with the native clone (LazyMap / VenuesSection);
# reusing it keeps the replacement free of any new binary asset.
MAP_POSTER = "/assets/_static/map.webp"
MAP_ALT = "Карта девяти площадок «Чё за Квест» в Ростове-на-Дону"
# The source map is a bare Yandex canvas without an overlay UI, so the widget URL
# carries the whole state: the archived centre of the T117 block and one pin per
# marker of that very record.
MAP_WIDGET_ORIGIN = "https://yandex.ru/map-widget/v1/"
MAP_PIN = "pm2rdm"
MAP_MARKER_RE = re.compile(
    r'\{title:"(?P<title>[^"]*)",descr:"[^"]*",lat:"(?P<lat>-?[\d.]+)",lng:"(?P<lng>-?[\d.]+)"'
)
# Marquiz registers its floating launcher through a script-only call. The archived
# argument object is the only place that still holds the plaque's copy and colour.
MARQUIZ_FLOATING_RE = re.compile(r"\}\)\('(?P<kind>Pop|Widget)',\s*\{(?P<params>[^{}]*)\}\)")
MARQUIZ_PARAM_RE = re.compile(r"(?P<key>\w+):\s*'(?P<value>[^']*)'")
MARQUIZ_INLINE_RE = re.compile(r"\}\)\('Inline',\s*\{(?P<params>[^{}]*)\}\)")
BONUS_FALLBACK = {"title": "Бонус", "text": "Подобрать квест и получить подарок", "color": "#a600fc"}
# Every route that keeps a Marquiz frame in the archived source. The frame heights
# are measured on the live page; an unmeasured route must fail the build instead of
# silently shipping a block of the wrong height.
MARQUIZ_FRAME_HEIGHTS = {
    "/kids/": ("670px", "130px"),
    "/den-rozhdeniya-uznik-azkabana/": ("710px", None),
    "/new-year/": ("630px", None),
}
PHONE_GAP = r"[\s    ‐-―-]"
PHONE_RE = re.compile(
    rf"(?<!\d)(?:\+7|8|7){PHONE_GAP}*\(?\d{{3}}\)?"
    rf"{PHONE_GAP}*\d{{3}}{PHONE_GAP}*\d{{2}}{PHONE_GAP}*\d{{2}}(?!\d)"
)
PHONE_TEXT_ATTRIBUTES = ("alt", "title", "aria-label", "placeholder")
NON_TEXT_PARENTS = {"style", "script", "noscript"}
# Маска телефона Tilda: её разметку собирает tilda-phone-mask-1.1.min.js, которого
# в снимке нет. Заготовка полей ниже повторяет его результат один в один — блок
# страны (флаг, треугольник, код) плюс само поле ввода.
PHONE_MASK_PLACEHOLDER = "(000) 000-00-00"
# Иконка календаря у поля даты: контуры сняты из архивной разметки Tilda
# (`src/source-snapshots/den-rozhdeniya-na-vr-arene.html`), viewBox 0 0 69.5 76.2.
DATEPICKER_ICON_PATHS = (
    "M9.6 42.9H21V31.6H9.6v11.3zm3-8.3H18v5.3h-5.3v-5.3zm16.5 8.3h11.3V31.6H29.1v11.3zm3-8.3h5.3v5.3h-5.3v-5.3zM48 42.9h11.3V31.6H48v11.3zm3-8.3h5.3v5.3H51v-5.3zM9.6 62H21V50.6H9.6V62zm3-8.4H18V59h-5.3v-5.4zM29.1 62h11.3V50.6H29.1V62zm3-8.4h5.3V59h-5.3v-5.4zM48 62h11.3V50.6H48V62zm3-8.4h5.3V59H51v-5.4z",
    "M59.7 6.8V5.3c0-2.9-2.4-5.3-5.3-5.3s-5.3 2.4-5.3 5.3v1.5H40V5.3C40 2.4 37.6 0 34.7 0s-5.3 2.4-5.3 5.3v1.5h-9.1V5.3C20.3 2.4 18 0 15 0c-2.9 0-5.3 2.4-5.3 5.3v1.5H0v69.5h69.5V6.8h-9.8zm-7.6-1.5c0-1.3 1-2.3 2.3-2.3s2.3 1 2.3 2.3v7.1c0 1.3-1 2.3-2.3 2.3s-2.3-1-2.3-2.3V5.3zm-19.7 0c0-1.3 1-2.3 2.3-2.3S37 4 37 5.3v7.1c0 1.3-1 2.3-2.3 2.3s-2.3-1-2.3-2.3V5.3zm-19.6 0C12.8 4 13.8 3 15 3c1.3 0 2.3 1 2.3 2.3v7.1c0 1.3-1 2.3-2.3 2.3-1.3 0-2.3-1-2.3-2.3V5.3zm53.7 67.9H3V9.8h6.8v2.6c0 2.9 2.4 5.3 5.3 5.3s5.3-2.4 5.3-5.3V9.8h9.1v2.6c0 2.9 2.4 5.3 5.3 5.3s5.3-2.4 5.3-5.3V9.8h9.1v2.6c0 2.9 2.4 5.3 5.3 5.3s5.3-2.4 5.3-5.3V9.8h6.8l-.1 63.4z",
)

# Инлайновые объявления, которые на самом поле обязаны уехать в обёртку: рамку,
# фон и высоту рисует теперь она, а инлайн у поля перебил бы source-phonemask.css.
PHONE_INPUT_STYLE_DROP = ("border", "background", "height", "padding", "width", "box-shadow", "outline")

# Первый экран грузим жадно ради LCP, остальное — лениво. Порог считается по
# записям Tilda (rec…): первыми в документе идут шапка, герой и первый блок, и их
# картинки видно без прокрутки. Пустые записи слот не занимают — счёт идёт только
# по тем, где медиа действительно есть. Потолок в 16 узлов страхует от
# записи-галереи, которая одна тянет сотню файлов.
EAGER_MEDIA_RECORDS = 1
EAGER_MEDIA_LIMIT = 4

# The archived MOV is H.264/AAC but advertises the wrong container and is not
# reliably playable outside Safari.  The source original stays in the migration
# archive; snapshots use the browser-compatible MP4 rendition generated from it.
LOCAL_VIDEO_REPLACEMENTS = {
    "video-hosting/кубок.mov": f"{BASE_TOKEN}/assets/video/kubok.mp4",
    # The Among Us landing retained a separately embedded Dropbox MOV.  Its
    # already-vendored rendition is the same route's playable source.
    "img_7440.mov": f"{BASE_TOKEN}/assets/video/among-us.mp4",
}
RUTUBE_POSTERS: dict[str, str | None] = {}
RUTUBE_POSTER_FAILURES: set[str] = set()

# These are the largest images observed in the mobile first-load trace. Their
# originals remain under migration/parity/source-media; only the public URL is
# replaced with an equivalently sized WebP rendition after visual inspection.
LOCAL_IMAGE_REPLACEMENTS = {
    "/assets/static.tildacdn.com/tild3561-3266-4662-a539-313732383839/noroot.png": "/assets/optimized/first-load-2026-08-16/home-hero.webp",
    "/assets/static.tildacdn.com/tild3833-6637-4432-b736-386538313735/tempImagePVWdhK_1-2.png": "/assets/optimized/first-load-2026-08-16/home-card.webp",
    "/assets/optim.tildacdn.com/tild6335-3363-4837-a662-646636633035/-/format/webp/noroot.png.webp": "/assets/optimized/first-load-2026-08-16/kids-hero.webp",
    "/assets/optim.tildacdn.com/tild3933-6236-4463-b335-316630363937/-/format/webp/noroot.png.webp": "/assets/optimized/first-load-2026-08-16/kids-crowd.webp",
    "/assets/optim.tildacdn.com/tild3737-6465-4432-b433-386131376335/-/format/webp/LAT_3538.jpg.webp": "/assets/optimized/first-load-2026-08-16/kids-birthday.webp",
    "/assets/optim.tildacdn.com/tild6663-6465-4565-a664-383235633133/-/format/webp/IMG_3972.png.webp": "/assets/optimized/first-load-2026-08-16/ono-hero.webp",
    "/assets/optim.tildacdn.com/tild6639-6562-4030-a239-303339396137/-/format/webp/tempImage12MvYV_1.png.webp": "/assets/optimized/first-load-2026-08-16/ono-card.webp",
}

# Styling for the local widgets the generator injects. It lives inside the snapshot
# because the snapshot is the only artefact this build owns; every selector is scoped
# by `[data-source-snapshot]` so it can outweigh the page-wide snapshot rules
# (`img { height: auto }`, `iframe { display: none }`) that Layout applies in <head>.
SOURCE_WIDGET_STYLE = """
[data-source-snapshot] .source-map{position:relative;box-sizing:border-box;overflow:hidden;background:#e5e3df}
[data-source-snapshot] .source-map .source-map__poster{display:block;width:100%;height:100%;margin:0;object-fit:cover}
[data-source-snapshot] .source-map .source-map__load{position:absolute;left:50%;bottom:22px;z-index:2;transform:translateX(-50%);padding:14px 28px;border:0;border-radius:30px;background:#ff6900;color:#fff;font:700 15px/1 'Montserrat',Arial,sans-serif;box-shadow:0 8px 22px rgba(0,0,0,.28);cursor:pointer}
[data-source-snapshot] .source-map .source-map__load:hover{background:#ff8a00}
[data-source-snapshot] .source-map .source-map__load[disabled]{opacity:.7;cursor:default}
[data-source-snapshot] .source-map iframe{display:block!important;position:absolute;inset:0;z-index:1;width:100%;height:100%;border:0}
[data-source-snapshot] .source-map[data-source-map-active] .source-map__poster,[data-source-snapshot] .source-map[data-source-map-active] .source-map__load{display:none}
[data-source-snapshot] .source-reviews{box-sizing:border-box;display:flex;flex-direction:column;align-self:center;gap:16px;width:min(100%,calc(100vw - 32px));max-width:1170px;min-height:0;max-height:100%;color:#333;font-family:'Nunito',Arial,sans-serif}
[data-source-snapshot] .source-reviews *{box-sizing:border-box}
[data-source-snapshot] .source-reviews__summary{display:flex;align-self:center;align-items:center;gap:10px;padding:9px 18px;border-radius:999px;background:#fff;box-shadow:0 6px 20px rgba(0,0,0,.1)}
[data-source-snapshot] .source-reviews__score{font-size:22px;font-weight:700;line-height:1}
[data-source-snapshot] .source-reviews__stars,[data-source-snapshot] .source-reviews .review-card__stars{color:#ff8a00;letter-spacing:1px}
[data-source-snapshot] .source-reviews__count{font-size:14px;color:#474747}
[data-source-snapshot] .source-reviews__list{display:flex;flex:0 1 auto;gap:16px;min-height:0;margin:0;padding:2px 2px 12px;overflow-x:auto;overflow-y:hidden;list-style:none;scroll-snap-type:x proximity;scrollbar-width:thin;overscroll-behavior-inline:contain}
[data-source-snapshot] .source-reviews__list>li{flex:0 0 296px;max-width:296px;scroll-snap-align:start}
[data-source-snapshot] .source-reviews .review-card{display:flex;flex-direction:column;height:100%;padding:20px;border-radius:16px;background:#fff;box-shadow:0 6px 20px rgba(0,0,0,.1);color:#333;text-align:left}
[data-source-snapshot] .source-reviews .review-card__top{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px}
[data-source-snapshot] .source-reviews .review-card__top time{font-size:12px;color:#474747;white-space:nowrap}
[data-source-snapshot] .source-reviews .review-card__body{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:8;overflow:hidden;margin:14px 0 0;font-size:14px;line-height:1.55}
[data-source-snapshot] .source-reviews .review-card__footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:auto;padding-top:13px;border-top:1px solid #eee;font-size:12px;color:#474747}
[data-source-snapshot] .source-reviews .review-card__footer a{color:#9b3800;text-decoration:underline;text-underline-offset:2px}
[data-source-snapshot] .source-reviews-host{display:flex;justify-content:center;width:100%}
@media screen and (max-width:1199px){
[data-source-snapshot] .source-reviews-slot{box-sizing:border-box;left:16px!important;width:calc(100vw - 32px)!important}
[data-source-snapshot] .source-reviews-slot .source-reviews-frame{width:100%!important}
}
[data-source-snapshot] .source-quiz-cta{box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;width:100%;max-width:760px;margin:0 auto;padding:30px 24px;border-radius:20px;border:1px solid rgba(0,0,0,.08);background:#fff;box-shadow:0 12px 30px rgba(0,0,0,.12);color:#333;text-align:center;font-family:'Nunito',Arial,sans-serif}
[data-source-snapshot] .source-quiz-cta *{box-sizing:border-box}
[data-source-snapshot] .source-quiz-cta__eyebrow{margin:0;color:#9b3800;font:700 12px/1 'Montserrat',Arial,sans-serif;letter-spacing:.18em}
[data-source-snapshot] .source-quiz-cta__title{margin:0;font:800 26px/1.2 'Montserrat',Arial,sans-serif}
[data-source-snapshot] .source-quiz-cta__text{max-width:520px;margin:0;font-size:15px;line-height:1.5;color:#474747}
[data-source-snapshot] .source-quiz-cta__button{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 34px;border-radius:30px;background:var(--source-quiz-color,#ff6900);color:#fff;font:700 16px/1 'Montserrat',Arial,sans-serif;text-decoration:none}
[data-source-snapshot] .source-bonus-pop{display:none}
[data-source-snapshot] .t396__elem[data-elem-type="gallery"] .t-slds{position:relative;overflow:visible}
[data-source-snapshot] .t396__elem[data-elem-type="gallery"] .t-slds__arrow_container{position:absolute;top:50%;right:-20px;left:-20px;width:auto!important;margin:0!important;z-index:4;display:flex!important;justify-content:space-between;transform:translateY(-50%);pointer-events:none}
[data-source-snapshot] .t396__elem[data-elem-type="gallery"] .t-slds__arrow_wrapper{display:grid!important;place-items:center;width:40px!important;height:40px!important;padding:0!important;border:0!important;border-radius:50%!important;background:#ff6900!important;color:#fff!important;font:400 31px/1 Arial,sans-serif!important;box-shadow:0 5px 14px rgba(0,0,0,.24);cursor:pointer;pointer-events:auto}
[data-source-snapshot] .t396__elem[data-elem-type="gallery"] .t-slds__arrow_wrapper:hover,[data-source-snapshot] .t396__elem[data-elem-type="gallery"] .t-slds__arrow_wrapper:focus-visible{background:#e65e00!important}
[data-source-snapshot] .t396__elem[data-elem-type="gallery"] .t-slds__arrow{display:block!important;translate:0 -2px}
[data-source-snapshot] .t396__elem[data-elem-type="gallery"] .t-slds__bullet_wrapper{position:absolute;right:0;bottom:12px;left:0;z-index:4;display:flex!important;justify-content:center;gap:7px;pointer-events:none}
[data-source-snapshot] .t396__elem[data-elem-type="gallery"] .t-slds__bullet{display:block!important;width:8px!important;height:8px!important;padding:0!important;border:0!important;border-radius:50%!important;background:rgba(255,255,255,.72)!important;cursor:pointer;pointer-events:auto}
[data-source-snapshot] .t396__elem[data-elem-type="gallery"] .t-slds__bullet.t-slds__bullet_active{background:#ff6900!important;box-shadow:0 0 0 2px #fff}
@media screen and (max-width:639px){[data-source-snapshot] .t396__elem[data-elem-type="gallery"] .t-slds{width:calc(100% - 80px)!important;margin-inline:20px}}
[data-source-snapshot] .source-video-stage{position:relative;display:grid;place-items:center;overflow:hidden;background:#202020;color:#fff;isolation:isolate}
[data-source-snapshot] .source-video-stage>img{position:absolute;inset:0;z-index:-1;width:100%;height:100%!important;object-fit:cover}
[data-source-snapshot] .source-video__play{display:grid;place-items:center;width:68px;height:68px;padding:0;border:0;border-radius:50%;background:#ff6900;color:#fff;font-size:30px;line-height:1;box-shadow:0 8px 24px rgba(0,0,0,.38);cursor:pointer}
[data-source-snapshot] .source-video__play:hover,[data-source-snapshot] .source-video__play:focus-visible{background:#e65e00;scale:1.04}
[data-source-snapshot] .source-video-stage[data-source-video-active]>:not(.source-video__media){display:none!important}
[data-source-snapshot] .source-video-stage .source-video__media{display:block!important;position:absolute;inset:0;width:100%;height:100%;border:0;background:#111}
@media screen and (max-width:640px){
[data-source-snapshot] .source-reviews__list>li{flex:0 0 250px;max-width:250px}
[data-source-snapshot] .source-quiz-cta{gap:10px;padding:18px 16px}
[data-source-snapshot] .source-quiz-cta__title{font-size:19px}
[data-source-snapshot] .source-quiz-cta__text{display:none}
[data-source-snapshot] .source-map .source-map__load{bottom:14px;padding:12px 22px;font-size:14px}
}
"""


def canonical_route(value: str) -> str:
    path = urlparse(value).path or "/"
    clean = "/" + path.strip("/")
    return "/" if clean == "/" else clean + "/"


def route_slug(route: str) -> str:
    return "home" if route == "/" else route.strip("/").replace("/", "__")


def request_bytes(url: str, attempts: int = 4) -> bytes:
    parsed = urlparse(url)
    request_url = parsed._replace(path=quote(unquote(parsed.path), safe="/:@")).geturl()
    request = Request(
        request_url,
        headers={
            "Accept-Encoding": "gzip",
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
        },
    )
    error: Exception | None = None
    for attempt in range(attempts):
        try:
            with urlopen(request, timeout=45) as response:
                payload = response.read()
                if response.headers.get("Content-Encoding", "").lower() == "gzip" or payload[:2] == b"\x1f\x8b":
                    payload = gzip.decompress(payload)
                return payload
        except (HTTPError, URLError, TimeoutError, OSError) as caught:
            error = caught
            time.sleep(0.4 * (attempt + 1))
    raise RuntimeError(f"Unable to download {url}: {error}")


def clean_remote_url(value: str, base_url: str = SOURCE_ORIGIN) -> str:
    value = (value or "").strip().replace("&amp;", "&")
    if value.startswith("//"):
        return "https:" + value
    if value.startswith(("http://", "https://")):
        return value
    return urljoin(base_url, value)


def public_path_for_url(url: str) -> Path | None:
    parsed = urlparse(clean_remote_url(url))
    host = parsed.netloc.lower().removeprefix("www.")
    if host not in ALLOWED_REMOTE_HOSTS:
        return None
    path = unquote(parsed.path).lstrip("/")
    if not path or ".." in Path(path).parts:
        return None
    return PUBLIC_ASSETS / host / path


def local_url(url: str) -> str:
    parsed = urlparse(clean_remote_url(url))
    host = parsed.netloc.lower().removeprefix("www.")
    path = unquote(parsed.path).lstrip("/")
    if host in ALLOWED_REMOTE_HOSTS and path:
        return f"{BASE_TOKEN}/assets/{host}/{path}"
    if parsed.netloc.lower().removeprefix("www.") == urlparse(SOURCE_ORIGIN).netloc:
        return f"{BASE_TOKEN}{canonical_route(parsed.path)}"
    return url


def replace_local_image_paths(value: str) -> str:
    for source, replacement in LOCAL_IMAGE_REPLACEMENTS.items():
        value = value.replace(source, replacement)
    return value


def uses_local_image_replacement(url: str) -> bool:
    local = local_url(url)
    return replace_local_image_paths(local) != local


def tilda_optim_image_url(url: str) -> str | None:
    """Return Tilda's lossless-layout WebP rendition for a source bitmap."""
    parsed = urlparse(clean_remote_url(url))
    host = parsed.netloc.lower().removeprefix("www.")
    if host != "static.tildacdn.com" or not re.search(r"\.(?:jpe?g|png)$", parsed.path, re.I):
        return None
    directory, filename = parsed.path.rsplit("/", 1)
    return f"https://optim.tildacdn.com{directory}/-/format/webp/{filename}.webp"


def css_local_url(url: str, source_url: str) -> str:
    if url.startswith(("data:", "#", "var(")):
        return url
    absolute = clean_remote_url(url, source_url)
    parsed = urlparse(absolute)
    host = parsed.netloc.lower().removeprefix("www.")
    path = unquote(parsed.path).lstrip("/")
    if host in ALLOWED_REMOTE_HOSTS and path:
        return f"../{host}/{path}"
    return url


def rewrite_css(css: str, source_url: str) -> str:
    return CSS_URL_RE.sub(
        lambda match: f"url({match.group('quote')}{css_local_url(match.group('url'), source_url)}{match.group('quote')})",
        css,
    )


def remote_urls(value: str, base_url: str = SOURCE_ORIGIN) -> set[str]:
    urls: set[str] = set()
    for match in URL_RE.finditer(value or ""):
        absolute = clean_remote_url(match.group("url"), base_url)
        if public_path_for_url(absolute):
            urls.add(absolute)
    return urls


def pick_sources(routes: list[str], *, use_overrides: bool = True) -> dict[str, Path]:
    candidates: dict[str, list[Path]] = defaultdict(list)
    for path in RAW_DIR.glob("*.html"):
        soup = BeautifulSoup(path.read_text(encoding="utf-8", errors="replace"), "html.parser")
        canonical = soup.select_one('link[rel="canonical"]')
        if canonical and canonical.get("href"):
            candidates[canonical_route(str(canonical["href"]))].append(path)

    selected: dict[str, Path] = {}
    for route in routes:
        override = SOURCE_OVERRIDE_DIR / f"{route_slug(route)}.html"
        if use_overrides and override.exists():
            selected[route] = override
            continue
        options = candidates.get(route, [])
        if not options:
            continue
        slug = route_slug(route)
        selected[route] = max(
            options,
            key=lambda path: (
                int(path.name.startswith(f"{slug}--") or (route == "/" and path.name.startswith("home--"))),
                path.stat().st_size,
            ),
        )
    return selected


def stylesheet_payload(url: str) -> tuple[str, str, set[str]]:
    clean = clean_remote_url(url)
    payload = request_bytes(clean).decode("utf-8", errors="replace")
    rewritten = rewrite_css(payload, clean)
    # Google Fonts uses the query to select families and weights; it is part
    # of both the cache identity and the request contract.
    digest = hashlib.sha1(clean.encode()).hexdigest()[:16]
    name = f"{digest}.css"
    return name, rewritten, remote_urls(payload, clean)


def vendor_resource(url: str) -> tuple[str, bool, str]:
    clean = clean_remote_url(url)
    target = public_path_for_url(clean)
    if target is None:
        return clean, False, "unsupported"
    if target.exists() and target.stat().st_size > 0:
        return clean, False, "cached"
    try:
        payload = request_bytes(clean)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
        return clean, True, "downloaded"
    except RuntimeError as error:
        return clean, False, str(error)


def image_dimensions(path: Path) -> tuple[int, int] | None:
    try:
        from PIL import Image

        with Image.open(path) as image:
            return image.size
    except Exception:
        return None


def rewrite_fragment_urls(fragment: Tag, resources: set[str]) -> None:
    # Tilda replaces background source bitmaps with its WebP renditions before
    # they become visible. Vendor that same rendition and materialize it as the
    # deterministic local state; this avoids both an external lazy request and
    # material colour/compression drift in visual parity.
    for background in fragment.select("[data-original]"):
        if background.name == "img" and "t-bgimg" not in background.get("class", []):
            continue
        optim_url = tilda_optim_image_url(str(background.get("data-original", "")))
        if optim_url:
            background["data-original"] = optim_url
    for gallery in fragment.select("[data-field-imgs-value]"):
        value = str(gallery.get("data-field-imgs-value", ""))
        gallery["data-field-imgs-value"] = URL_RE.sub(
            lambda match: (
                f"{match.group('quote')}"
                f"{tilda_optim_image_url(match.group('url')) or match.group('url')}"
            ),
            value,
        )

    for element in fragment.select("*"):
        for attribute, value in list(element.attrs.items()):
            if attribute.lower().startswith("on"):
                del element.attrs[attribute]
                continue
            if isinstance(value, list):
                continue
            text = str(value)
            if attribute == "data-source-video-url":
                # The deferred player retains its original URL and never enters
                # the static resource graph.
                continue
            # Do not re-vendor an archive image whose rendered URL is replaced
            # by a checked local rendition. This keeps a later normal generator
            # run from restoring the heavy source file into public/assets.
            resources.update(
                resource for resource in remote_urls(text)
                if not uses_local_image_replacement(resource)
            )
            if attribute in {"href", "action", "formaction"}:
                if attribute == "href" and text in VENUE_HASH_ROUTES:
                    element[attribute] = f"{BASE_TOKEN}{VENUE_HASH_ROUTES[text]}"
                elif attribute == "href" and text in LOCAL_FRAGMENT_TARGETS:
                    element[attribute] = LOCAL_FRAGMENT_TARGETS[text]
                elif attribute == "href" and text in BROKEN_ROUTE_ALIASES:
                    element[attribute] = f"{BASE_TOKEN}{BROKEN_ROUTE_ALIASES[text]}"
                elif text.startswith(("#popup:", "#form:", "javascript:")):
                    element[attribute] = "#source-booking"
                elif text.startswith(("http://", "https://", "//")):
                    parsed = urlparse(clean_remote_url(text))
                    if parsed.netloc.lower().removeprefix("www.") == urlparse(SOURCE_ORIGIN).netloc:
                        element[attribute] = f"{BASE_TOKEN}{canonical_route(parsed.path)}"
                    elif attribute == "href":
                        element["target"] = "_blank"
                        element["rel"] = "noopener noreferrer"
                    else:
                        element[attribute] = ""
                elif attribute == "href" and text.startswith("/"):
                    element[attribute] = f"{BASE_TOKEN}{canonical_route(text)}"
                elif attribute in {"action", "formaction"}:
                    element[attribute] = ""
                continue

            if attribute in {
                "src", "srcset", "data-original", "data-src", "data-img-zoom-url",
                "data-field-imgs-value", "style", "content",
            }:
                rewritten = URL_RE.sub(
                    lambda match: f"{match.group('quote')}{local_url(match.group('url'))}",
                    text,
                )
                rewritten = replace_local_image_paths(rewritten)
                if attribute == "style":
                    # Quoted CSS URLs become ``&quot;`` inside serialized HTML
                    # attributes and are then misread as part of the asset path
                    # by static integrity checks. Local paths never need CSS
                    # string escaping, so keep the deterministic unquoted form.
                    rewritten = re.sub(
                        r"url\(\s*(['\"])([^)'\"]+)\1\s*\)",
                        lambda match: f"url({match.group(2)})",
                        rewritten,
                        flags=re.I,
                    )
                element[attribute] = rewritten

    for background in fragment.select("[data-original]"):
        source = str(background.get("data-original", ""))
        if source and not source.startswith("data:") and (
            "t-bgimg" in background.get("class", []) or background.name != "img"
        ):
            current = str(background.get("style", "")).rstrip("; ")
            background["style"] = f"{current};background-image:url({source})"
            background["class"] = list(dict.fromkeys([*background.get("class", []), "loaded"]))


def materialize_zero_galleries(root: Tag, soup: BeautifulSoup) -> None:
    """Build the inert, responsive first-frame DOM for T396 galleries.

    Tilda stores gallery slides as JSON in ``data-field-imgs-value`` and creates
    the carousel markup only from its legacy runtime. The local layout subset
    needs ordinary DOM, not executable vendor code, so materialise the small
    semantic structure deterministically during the snapshot build.
    """
    def normalize_controls(slider: Tag) -> None:
        """Tilda's hydrated controls arrive as li/a wrappers; keep one button."""
        for wrapper in list(slider.select(".t-slds__arrow_wrapper")):
            if wrapper.name == "button":
                continue
            control = wrapper.select_one("button, [role='button']")
            if control is None:
                control = wrapper
            control.name = "button"
            control["type"] = "button"
            control["class"] = list(dict.fromkeys([*control.get("class", []), *wrapper.get("class", [])]))
            control["data-slide-direction"] = "left" if "t-slds__arrow_wrapper-left" in wrapper.get("class", []) else "right"
            if not control.get("aria-label"):
                control["aria-label"] = "Предыдущий слайд" if control["data-slide-direction"] == "left" else "Следующий слайд"
            if control is not wrapper:
                wrapper.replace_with(control.extract())
        for bullet in list(slider.select(".t-slds__bullet")):
            if bullet.name == "button":
                continue
            control = soup.new_tag("button", attrs={
                "class": bullet.get("class", ["t-slds__bullet"]),
                "type": "button",
                "aria-label": bullet.get("aria-label", "Перейти к слайду"),
            })
            control.extend(list(bullet.contents))
            bullet.replace_with(control)

        items = slider.select(".t-slds__item")
        if len(items) < 2:
            return
        bullet_wrapper = slider.select_one(".t-slds__bullet_wrapper")
        if bullet_wrapper is None:
            bullet_wrapper = soup.new_tag("div", attrs={"class": ["t-slds__bullet_wrapper"]})
            slider.append(bullet_wrapper)
        bullets = bullet_wrapper.select(":scope > .t-slds__bullet")
        for index in range(len(bullets), len(items)):
            bullet = soup.new_tag("button", attrs={
                "class": ["t-slds__bullet"],
                "data-slide-bullet-for": str(index + 1),
                "type": "button",
                "aria-label": f"Перейти к слайду {index + 1}",
            })
            bullet.append(soup.new_tag("span", attrs={"class": ["t-slds__bullet_body"]}))
            bullet_wrapper.append(bullet)

    for gallery in root.select('[data-elem-type="gallery"][data-field-imgs-value]'):
        atom = gallery.select_one(":scope > .tn-atom__gallery")
        if atom is None:
            continue
        hydrated_slider = atom.select_one(".t-slds")
        if hydrated_slider is not None:
            normalize_controls(hydrated_slider)
            continue
        try:
            slides = json.loads(str(gallery.get("data-field-imgs-value", "[]")))
        except json.JSONDecodeError:
            continue
        slides = [slide for slide in slides if isinstance(slide, dict) and slide.get("li_img")]
        if not slides:
            continue

        slider = soup.new_tag("div", attrs={"class": ["t-slds"]})
        main = soup.new_tag("div", attrs={"class": ["t-slds__main"]})
        container = soup.new_tag("div", attrs={"class": ["t-slds__container"]})
        speed = str(gallery.get("data-field-slds_speed-value", "fast"))
        wrapper = soup.new_tag("div", attrs={
            "class": ["t-slds__items-wrapper", f"t-slds_animated-{speed}"],
            "data-slider-transition": "500" if speed == "slow" else "300",
            "data-slider-with-cycle": "true",
            "data-slider-correct-height": "true",
            "data-auto-correct-mobile-width": "false",
            "data-slider-is-preview": "true",
            "data-slider-totalslides": str(len(slides)),
            "data-slider-pos": "1",
        })
        for index, slide in enumerate(slides):
            item = soup.new_tag("div", attrs={"class": ["t-slds__item"]})
            frame = soup.new_tag("div", attrs={
                "class": ["t-width", "t-null__slds-wrapper", "t-slds__wrapper", "t-slds__wrapper_100", "t-align_center"]
            })
            image = soup.new_tag("div", attrs={
                "class": ["t-bgimg", "tn-atom__slds-img", "loaded"],
                "data-img-lid": str(slide.get("lid", "")),
                "data-original": str(slide["li_img"]),
                "role": "img",
                "aria-label": str(slide.get("li_imgalt") or slide.get("li_imgtitle") or f"Слайд {index + 1}"),
            })
            frame.append(image)
            item.append(frame)
            wrapper.append(item)
        container.append(wrapper)
        main.append(container)
        slider.append(main)

        # Snapshot controls are no longer supplied by the archived Tilda
        # runtime. Every multi-slide Zero gallery therefore receives its own
        # visible, keyboard-clickable dot navigation regardless of the old
        # decorative toggle.
        if len(slides) > 1:
            bullet_wrapper = soup.new_tag("div", attrs={"class": ["t-slds__bullet_wrapper"]})
            for index in range(len(slides)):
                bullet = soup.new_tag("button", attrs={
                    "class": ["t-slds__bullet"],
                    "data-slide-bullet-for": str(index + 1),
                    "type": "button",
                    "aria-label": f"Перейти к слайду {index + 1}",
                })
                bullet.append(soup.new_tag("span", attrs={"class": ["t-slds__bullet_body"]}))
                bullet_wrapper.append(bullet)
            slider.append(bullet_wrapper)

        if len(slides) > 1:
            arrow_container = soup.new_tag("div", attrs={
                "class": ["t-slds__arrow_container", "t-slds__arrow_container-center"]
            })
            for direction, label, glyph in (("left", "Предыдущий слайд", "‹"), ("right", "Следующий слайд", "›")):
                control = soup.new_tag("button", attrs={
                    "class": ["t-slds__arrow_wrapper", f"t-slds__arrow_wrapper-{direction}"],
                    "data-slide-direction": direction,
                    "type": "button",
                    "aria-label": label,
                })
                arrow = soup.new_tag("span", attrs={"class": ["t-slds__arrow", f"t-slds__arrow-{direction}"]})
                arrow.string = glyph
                control.append(arrow)
                arrow_container.append(control)
            slider.append(arrow_container)
        atom.append(slider)


def materialize_zero_forms(root: Tag, soup: BeautifulSoup) -> None:
    """Build inert local forms from the JSON embedded in T396 form elements.

    The archived export deliberately contains only the field contract; Tilda's
    legacy form runtime normally turns it into DOM.  Keeping that runtime would
    reintroduce remote submission and unaudited executable code, so render the
    same semantic controls during the deterministic snapshot build instead.
    """
    for element in root.select('[data-elem-type="form"]'):
        atom = element.select_one(":scope > .tn-atom__form")
        data = element.select_one(".tn-atom__inputs-data[data-value]")
        textarea = element.select_one(".tn-atom__inputs-textarea")
        if atom is None or (data is None and textarea is None) or atom.select_one("form"):
            continue
        raw_fields = str(data.get("data-value", "[]")) if data is not None else textarea.get_text()
        try:
            fields = json.loads(raw_fields)
        except json.JSONDecodeError:
            continue
        fields = [field for field in fields if isinstance(field, dict)]
        if not fields:
            continue

        record = element.find_parent(id=re.compile(r"^rec\d+$"))
        record_id = str(record.get("id", "")) if record else "source"
        element_id = str(element.get("data-elem-id", "form"))
        form = soup.new_tag("form", attrs={
            "action": "",
            "class": ["t-form", f"t-form_inputs-total_{len(fields)}", "js-form-proccess"],
            "data-local-source-form": "",
            "id": f"form{record_id.removeprefix('rec')}-{element_id}",
            "method": "post",
            "role": "form",
        })
        success = soup.new_tag("div", attrs={
            "class": ["js-successbox", "t-form__successbox", "t-text", "t-text_sm"],
            "data-local-form-success": "",
            "hidden": "",
        })
        form.append(success)
        inputs = soup.new_tag("div", attrs={
            "class": ["t-form__inputsbox", "t-form__inputsbox_flex", "t-form__inputsbox_inrow"]
        })

        input_height = str(element.get("data-field-inputheight-value", "50"))
        input_radius = str(element.get("data-field-inputradius-value", "0"))
        input_color = str(element.get("data-field-inputcolor-value", "#333333"))
        input_background = str(element.get("data-field-inputbgcolor-value", "#ffffff"))
        input_border = str(element.get("data-field-inputbordercolor-value", "transparent"))
        input_margin = str(element.get("data-field-inputmargbottom-value", "5"))
        input_font_size = str(element.get("data-field-inputfontsize-value", "16"))
        input_font_weight = str(element.get("data-field-inputfontweight-value", "400"))
        input_font_family = str(element.get("data-field-inputfontfamily-value", "var(--t-text-font,Arial)"))
        control_style = (
            f"color:{input_color};border:1px solid {input_border};"
            f"background-color:{input_background};border-radius:{input_radius}px;"
            f"font-family:{input_font_family};font-size:{input_font_size}px;font-weight:{input_font_weight};"
            f"height:{input_height}px"
        )
        text_style = f"font-family:{input_font_family};font-size:{input_font_size}px;font-weight:{input_font_weight}"

        for field in fields:
            field_type = str(field.get("li_type", "tx"))
            field_name = str(field.get("li_name") or field.get("li_nm") or "")
            width_class = "t-input-group_width50" if field.get("li_inputwidth") == "1_2" else "t-input-group_width100"
            group = soup.new_tag("div", attrs={
                "class": [
                    "t-input-group", f"t-input-group_{field_type}", "t-input-group_inrow",
                    width_class, "t-input-group_inonerow",
                ],
                "data-field-name": field_name,
                "data-field-type": field_type,
                "data-input-lid": str(field.get("lid", "")),
                "style": f"margin-bottom:{input_margin}px",
            })
            block = soup.new_tag("div", attrs={"class": ["t-input-block"]})
            if field_type == "hd":
                control = soup.new_tag("input", attrs={
                    "name": field_name or "hidden",
                    "type": "hidden",
                    "value": str(field.get("li_value", "")),
                })
                block.append(control)
            elif field_type == "tx":
                text = soup.new_tag("div", attrs={"class": ["t-text"], "style": text_style})
                text.string = str(field.get("li_text", ""))
                block.append(text)
            elif field_type == "cb":
                label = soup.new_tag("label", attrs={"class": ["t-checkbox__control", "t-checkbox__control_flex"], "style": text_style})
                checkbox = soup.new_tag("input", attrs={
                    "class": ["t-checkbox", "js-tilda-rule"],
                    "name": field_name or "consent",
                    "type": "checkbox",
                    "value": "yes",
                })
                if field.get("li_req") == "y":
                    checkbox["required"] = ""
                indicator = soup.new_tag("span", attrs={"class": ["t-checkbox__indicator"]})
                label_text = soup.new_tag("span", attrs={"class": ["t-checkbox__labeltext"]})
                label_fragment = BeautifulSoup(str(field.get("li_label", "")), "html.parser")
                for child in list(label_fragment.contents):
                    label_text.append(child)
                label.extend([checkbox, indicator, label_text])
                block.append(label)
            else:
                input_type = {"ph": "tel", "em": "email", "da": "text", "ta": "text"}.get(field_type, "text")
                if field_type == "ph":
                    phone = soup.new_tag("div", attrs={
                        "class": ["t-input", "t-input-phonemask__wrap"],
                        "style": control_style,
                    })
                    phone.append(phone_country_block(soup))
                    control = soup.new_tag("input", attrs={
                        "aria-label": str(field.get("li_ph") or "Телефон"),
                        "class": ["t-input", "t-input-phonemask", "js-tilda-rule"],
                        "name": field_name or "phone",
                        "placeholder": str(field.get("li_ph") or "(000) 000-00-00"),
                        "type": input_type,
                    })
                    phone.append(control)
                    block.append(phone)
                elif field_type == "da":
                    block.append(date_field_block(soup, field, field_name, control_style, input_color))
                else:
                    control = soup.new_tag("input", attrs={
                        "aria-label": str(field.get("li_ph") or field_name or "Поле формы"),
                        "class": ["t-input", "js-tilda-rule", "t-input-inline-styles"],
                        "name": field_name,
                        "placeholder": str(field.get("li_ph", "")),
                        "style": control_style,
                        "type": input_type,
                    })
                    if field.get("li_req") == "y":
                        control["required"] = ""
                    block.append(control)
            group.append(block)
            inputs.append(group)

        submit_wrapper = soup.new_tag("div", attrs={"class": ["tn-form__submit"]})
        submit = soup.new_tag("button", attrs={"class": ["t-submit"], "type": "submit"})
        submit.string = str(element.get("data-field-buttontitle-value", "Отправить"))
        submit_wrapper.append(submit)
        inputs.append(submit_wrapper)
        form.append(inputs)

        style = soup.new_tag("style")
        button_height = str(element.get("data-field-buttonheight-value", "50"))
        button_width = str(element.get("data-field-buttonwidth-value", "180"))
        button_radius = str(element.get("data-field-buttonradius-value", "0"))
        button_color = str(element.get("data-field-buttoncolor-value", "#ffffff"))
        button_background = str(element.get("data-field-buttonbgcolor-value", "#ff6900"))
        style.string = (
            f"#{record_id} [data-elem-id=\"{element_id}\"] .t-submit{{"
            f"display:block;width:{button_width}px;height:{button_height}px;margin:auto;"
            f"border:0;border-radius:{button_radius}px;color:{button_color};"
            f"background:{button_background};cursor:pointer}}"
        )
        atom.clear()
        atom.extend([form, style])


def phone_country_block(soup: BeautifulSoup) -> Tag:
    """Блок страны телефонной маски: флаг, треугольник и код «+7».

    Ровно та разметка, которую на живой странице строит скрипт маски Tilda
    (сверено с гидратированным снимком главной). Раскладку ей даёт
    `src/styles/source-phonemask.css`, поэтому имена классов менять нельзя.
    """
    select = soup.new_tag("div", attrs={"class": ["t-input-phonemask__select"]})
    flag = soup.new_tag("span", attrs={
        "class": ["t-input-phonemask__select-flag"],
        "data-phonemask-flag": "ru",
    })
    triangle = soup.new_tag("span", attrs={"class": ["t-input-phonemask__select-triangle"]})
    code = soup.new_tag("span", attrs={"class": ["t-input-phonemask__select-code"]})
    code.string = "+7"
    select.extend([flag, triangle, code])
    return select


def date_field_block(
    soup: BeautifulSoup,
    field: dict,
    field_name: str,
    control_style: str,
    icon_color: str,
) -> Tag:
    """Поле даты зеро-блока: обёртка, поле с правилами Tilda и иконка календаря.

    В экспорте зеро-блока от поля остаётся только контракт (`li_type: "da"`),
    а разметку на живой странице собирает `tilda-date-picker-1.0.min.js`.
    Ниже — ровно его результат, сверенный с DOM оригинала: обёртка
    `.t-datepicker__wrapper`, поле `.t-datepicker` с форматом, разделителем и
    маской из контракта и SVG-иконка календаря справа. Поведение (маска ввода
    и сам календарь) поднимает `src/scripts/source-forms.js`.
    """
    unavailable = []
    if field.get("li_dateUnavailPast") == "y":
        unavailable.append("past")
    if field.get("li_dateUnavailFuture") == "y":
        unavailable.append("future")

    wrapper = soup.new_tag("div", attrs={"class": ["t-datepicker__wrapper"]})
    attrs = {
        "aria-label": str(field.get("li_ph") or field_name or "Дата"),
        "class": ["t-input", "t-datepicker", "js-tilda-mask", "js-tilda-rule", "t-input-inline-styles"],
        "data-tilda-datediv": str(field.get("li_datediv", "dot")),
        "data-tilda-dateformat": str(field.get("li_dateformat", "DD-MM-YYYY")),
        "data-tilda-mask": str(field.get("li_datemask", "99.99.9999")),
        "data-tilda-rule": "date",
        "name": field_name or "date",
        "placeholder": str(field.get("li_ph", "")),
        "style": control_style,
        "type": "text",
    }
    if unavailable:
        attrs["data-tilda-dateunvailable"] = ",".join(unavailable)
    control = soup.new_tag("input", attrs=attrs)
    if field.get("li_req") == "y":
        control["required"] = ""
    wrapper.append(control)

    icon = soup.new_tag("svg", attrs={
        "class": ["t-datepicker__icon"],
        "fill": icon_color,
        "role": "presentation",
        "style": "width:25px;",
        "viewBox": "0 0 69.5 76.2",
        "xmlns": "http://www.w3.org/2000/svg",
    })
    for path in DATEPICKER_ICON_PATHS:
        icon.append(soup.new_tag("path", attrs={"d": path}))
    wrapper.append(icon)
    return wrapper


def strip_style_declarations(style: str, properties: tuple[str, ...]) -> str:
    """Выбросить из инлайнового стиля объявления по перечисленным свойствам."""
    kept = []
    for declaration in style.split(";"):
        name = declaration.split(":", 1)[0].strip().lower()
        if not declaration.strip() or not name:
            continue
        if any(name == prop or name.startswith(f"{prop}-") for prop in properties):
            continue
        kept.append(declaration.strip())
    return ";".join(kept)


def normalize_phone_fields(root: Tag, soup: BeautifulSoup) -> None:
    """Свести все поля телефона к полной разметке маски Tilda.

    В снимках их три вида, и без блока страны поле остаётся без «+7» и флага:
      * обёртка есть, внутри голый `span` с кодом — так их собирает
        `materialize_zero_forms` из зеро-блоков;
      * класс обёртки висит прямо на `<input>` (архивные поля мессенджера);
      * обёртки нет вовсе — архивное поле `js-phonemask-input`, которое на живой
        странице оборачивает скрипт маски.
    Все три приводим к одному виду: `div.t-input-phonemask__wrap` с блоком страны
    и полем ввода внутри.
    """
    # Поля, где класс обёртки достался самому `<input>`, и голые архивные поля:
    # им нужна настоящая обёртка, иначе блоку страны просто некуда встать.
    for field in root.select("input.t-input-phonemask__wrap, input.js-phonemask-input"):
        if field.find_parent(class_="t-input-phonemask__wrap") is not None:
            continue
        style = str(field.get("style", ""))
        wrap = soup.new_tag("div", attrs={"class": ["t-input", "t-input-phonemask__wrap"]})
        if style:
            wrap["style"] = style
        field.insert_before(wrap)
        # Рамку, фон и высоту теперь держит обёртка; оставшийся на поле инлайн
        # перебил бы `.t-input-phonemask` из source-phonemask.css по специфичности.
        inner_style = strip_style_declarations(style, PHONE_INPUT_STYLE_DROP)
        if inner_style:
            field["style"] = inner_style
        else:
            field.attrs.pop("style", None)
        field["class"] = list(dict.fromkeys([
            *(name for name in field.get("class", []) if name != "t-input-phonemask__wrap"),
            "t-input",
            "t-input-phonemask",
        ]))
        # Плейсхолдер архивного поля — маска чужой страны («+1(000)000-0000»);
        # рядом с кодом «+7» она читается как ошибка.
        placeholder = str(field.get("placeholder", ""))
        if re.fullmatch(r"[+\d()\s-]*", placeholder) and re.search(r"0{3}", placeholder):
            field["placeholder"] = PHONE_MASK_PLACEHOLDER
        wrap.append(field.extract())

    for wrap in root.select("div.t-input-phonemask__wrap"):
        if wrap.select_one(".t-input-phonemask__select") is not None:
            continue
        # Голый код без блока страны остаётся от сборки зеро-блоков: заменяем его
        # целиком, чтобы «+7» не оказалось в разметке дважды.
        for code in wrap.select(":scope > .t-input-phonemask__select-code"):
            code.decompose()
        wrap.insert(0, phone_country_block(soup))


def local_data(path: Path) -> dict:
    """Read one of the site's own JSON sources of truth."""
    if path not in _LOCAL_DATA_CACHE:
        _LOCAL_DATA_CACHE[path] = json.loads(path.read_text(encoding="utf-8"))
    return _LOCAL_DATA_CACHE[path]


def venue_anchor_points() -> list[tuple[str, float, float]]:
    """Venue fragment, latitude and longitude for every address anchor.

    The archived address chips point at a venue fragment (``#gvardeyskiy``), which
    the live page resolves to a marker on the map block. Those fragments have to
    keep a target inside the local map, otherwise every chip link is a dead jump.
    """
    chips = {
        canonical_route(str(chip.get("href", ""))): chip
        for chip in local_data(VENUES_DATA).get("chips", [])
    }
    points: list[tuple[str, float, float]] = []
    for fragment, route in VENUE_HASH_ROUTES.items():
        chip = chips.get(route)
        if chip and chip.get("lat") is not None and chip.get("lon") is not None:
            points.append((fragment.removeprefix("#"), float(chip["lat"]), float(chip["lon"])))
    return points


def map_widget_url(markers: list[tuple[str, str, str]]) -> str:
    """Build the Yandex map-widget URL that reproduces one archived map record."""
    latitudes = [float(latitude) for _, latitude, _ in markers]
    longitudes = [float(longitude) for _, _, longitude in markers]
    centre_lat = (min(latitudes) + max(latitudes)) / 2
    centre_lon = (min(longitudes) + max(longitudes)) / 2
    # Zoom follows the spread of that record's own markers: the nine-venue map of
    # the home page needs the whole city, a two-venue map of a campaign page does
    # not and would otherwise open uselessly far out.
    spread = max(max(latitudes) - min(latitudes), max(longitudes) - min(longitudes))
    zoom = 11 if spread > 0.1 else 13 if spread > 0.01 else 15
    pins = "~".join(f"{float(longitude):.6f},{float(latitude):.6f},{MAP_PIN}"
                    for _, latitude, longitude in markers)
    return f"{MAP_WIDGET_ORIGIN}?ll={centre_lon:.6f}%2C{centre_lat:.6f}&z={zoom}&pt={pins}"


def materialize_local_map(record: Tag, soup: BeautifulSoup) -> bool:
    """Replace the archived Yandex map canvas with a local poster and a load button.

    The source record itself stays: it carries the 385px block between the address
    chips and the footer, and dropping it collapsed that part of every page.
    """
    markers = MAP_MARKER_RE.findall(str(record))
    canvas = record.select_one('[id^="separateMap"], .t-map')
    if canvas is None:
        return False
    for script in record.select("script"):
        script.decompose()
    for lazy in record.select("[data-maplazy-load]"):
        lazy.attrs.pop("data-maplazy-load", None)

    canvas.clear()
    for attribute in list(canvas.attrs):
        if attribute.startswith("data-map"):
            canvas.attrs.pop(attribute, None)
    canvas["class"] = list(dict.fromkeys([*canvas.get("class", []), "source-map"]))

    # Шесть лендингов-артбордов (roblox-land, minecraft-lend, vypusknoj-kalmar и
    # соседи) держат карту в контейнере во всю ширину экрана: живой Яндекс просто
    # рисует канвас шире. Наш локальный постер — снимок фиксированного размера, и
    # растянутый во всю ширину он режет метки и выставляет по краям обрезанные
    # кнопки масштаба. Сажаем блок в тот же контейнер 1160px, в котором карта
    # стоит на остальных 59 маршрутах.
    holder = canvas.find_parent(class_="t-width")
    if holder is not None and "t-width_100" in holder.get("class", []):
        holder["class"] = list(dict.fromkeys([
            *(name for name in holder.get("class", []) if name != "t-width_100"),
            "t-width_12",
        ]))

    embed = map_widget_url(markers) if markers else str(local_data(VENUES_DATA)["mapEmbed"])
    canvas["data-source-map"] = ""
    canvas["data-source-map-embed"] = embed
    canvas["data-source-map-title"] = MAP_ALT

    document = record.find_parent("div", id="allrecords") or record.parent
    taken = {str(element.get("id")) for element in document.select("[id]") if element.get("id")}
    marker_points = {(round(float(lat), 4), round(float(lon), 4)) for _, lat, lon in markers}
    for fragment, latitude, longitude in venue_anchor_points():
        if fragment in taken or (round(latitude, 4), round(longitude, 4)) not in marker_points:
            continue
        anchor = soup.new_tag("span")
        anchor["id"] = fragment
        anchor["class"] = ["source-widget-anchor"]
        anchor["aria-hidden"] = "true"
        canvas.append(anchor)

    poster = soup.new_tag("img", attrs={
        "class": ["source-map__poster"],
        "src": f"{BASE_TOKEN}{MAP_POSTER}",
        "alt": MAP_ALT,
        "decoding": "async",
    })
    button = soup.new_tag("button", attrs={
        "class": ["source-map__load"],
        "type": "button",
        "data-source-map-load": "",
        "aria-pressed": "false",
    })
    button.string = "Показать карту"
    canvas.extend([poster, button])
    return True


def build_reviews_block(soup: BeautifulSoup) -> Tag:
    """Local carousel of guest reviews, built from the site's own reviews.json.

    The archived block is a third-party review carousel; the markup below mirrors
    `Reviews.astro` (same card classes) but scrolls horizontally, because part of
    the source records reserve a fixed-height slot for it.
    """
    data = local_data(REVIEWS_DATA)
    section = soup.new_tag("section", attrs={"class": ["source-reviews"], "aria-label": "Отзывы гостей"})
    rating = int(float(data["ratings"]["summaryWeight"]) * 10) / 10
    count = f"{int(data['counts']['summary']):,}".replace(",", " ")

    summary = soup.new_tag("div", attrs={"class": ["source-reviews__summary"]})
    score = soup.new_tag("span", attrs={"class": ["source-reviews__score"]})
    score.string = f"{rating:.1f}".replace(".", ",")
    stars = soup.new_tag("span", attrs={"class": ["source-reviews__stars"], "aria-hidden": "true"})
    stars.string = "★★★★★"
    total = soup.new_tag("span", attrs={"class": ["source-reviews__count"]})
    total.string = f"{count} отзывов на картах"
    summary.extend([score, stars, total])

    items = soup.new_tag("ul", attrs={"class": ["source-reviews__list"]})
    for review in data["reviews"]:
        service = data["services"].get(str(review.get("service")), {})
        source_name = str(service.get("name") or "Отзыв гостя")
        item = soup.new_tag("li")
        card = soup.new_tag("article", attrs={"class": ["review-card"]})

        top = soup.new_tag("div", attrs={"class": ["review-card__top"]})
        rank = int(review.get("rating", 5))
        card_stars = soup.new_tag("span", attrs={
            "class": ["review-card__stars"],
            "role": "img",
            "aria-label": f"Оценка {rank} из 5",
        })
        card_stars.string = "★" * rank + "☆" * (5 - rank)
        day, month, year = (str(review.get("date_create", "")).split(".") + ["", "", ""])[:3]
        date = soup.new_tag("time", attrs={"datetime": f"{year}-{month}-{day}"} if year else {})
        date.string = str(review.get("date_create", ""))
        top.extend([card_stars, date])

        body = soup.new_tag("p", attrs={"class": ["review-card__body"]})
        body.string = str(review.get("message", ""))

        footer = soup.new_tag("footer", attrs={"class": ["review-card__footer"]})
        author = soup.new_tag("span")
        author.string = str(review.get("username", "Гость"))
        url = str(review.get("url") or "")
        origin = soup.new_tag("a", attrs={"href": url}) if url.startswith("https://") else soup.new_tag("span")
        origin.string = source_name
        footer.extend([author, origin])

        card.extend([top, body, footer])
        item.append(card)
        items.append(item)

    section.extend([summary, items])
    return section


def materialize_local_reviews(record: Tag, soup: BeautifulSoup, root: Tag) -> bool:
    """Swap the third-party review carousel for the local one, in place.

    The source record stays whole — heading, background and padding included — so
    only the widget itself changes hands.
    """
    frame = record.select_one("#myReviews__block-widget, iframe")
    host = frame.parent if frame is not None else None
    if host is None:
        return False
    for script in record.select("script"):
        script.decompose()
    host.clear()
    host["class"] = list(dict.fromkeys([*host.get("class", []), "source-reviews-host"]))
    frame = host.parent if isinstance(host.parent, Tag) else None
    if frame is not None:
        frame["class"] = list(dict.fromkeys([*frame.get("class", []), "source-reviews-frame"]))
    slot = host.find_parent(class_="t396__elem")
    if slot is not None:
        slot["class"] = list(dict.fromkeys([*slot.get("class", []), "source-reviews-slot"]))
    # Venue pages reserve a full viewport height for the third-party carousel. The
    # local block is a fixed set of cards, so that reservation would only add half
    # a screen of emptiness under them.
    style = ";".join(
        declaration for declaration in str(host.get("style", "")).split(";")
        if declaration.strip() and declaration.split(":", 1)[0].strip().lower() != "height"
    )
    if style:
        host["style"] = style
    else:
        host.attrs.pop("style", None)
    block = build_reviews_block(soup)
    # The header links to `#otzivy`. Where the source keeps that anchor in its own
    # record the jump already lands here; where it does not, the block becomes the
    # target itself instead of leaving the menu item pointing at nothing.
    if not root.select_one("#otzivy, [name='otzivy']"):
        block["id"] = "otzivy"
    host.append(block)
    return True


def materialize_playable_video_sources(root: Tag) -> int:
    """Replace archive-only MOV sources with their local, compatible rendition."""
    replaced = 0
    for source in root.select("video source[src]"):
        original = unquote(str(source.get("src", ""))).lower()
        replacement = local_video_replacement(original)
        if not replacement:
            continue
        source["src"] = replacement
        source["type"] = "video/mp4"
        replaced += 1
    return replaced


def local_video_replacement(source_url: str) -> str | None:
    normalized = unquote(source_url).lower()
    return next(
        (local for legacy, local in LOCAL_VIDEO_REPLACEMENTS.items() if legacy in normalized),
        None,
    )


def rutube_poster(video_id: str, *, download: bool) -> str | None:
    """Cache a Rutube thumbnail without putting Rutube in the initial page load."""
    if video_id in RUTUBE_POSTERS:
        return RUTUBE_POSTERS[video_id]
    target = RUTUBE_POSTER_DIR / f"{video_id}.jpg"
    if target.exists() and target.stat().st_size > 0:
        result = f"{BASE_TOKEN}/assets/rutube/{target.name}"
        RUTUBE_POSTERS[video_id] = result
        return result
    if not download:
        RUTUBE_POSTERS[video_id] = None
        return None
    try:
        metadata = json.loads(request_bytes(f"https://rutube.ru/api/video/{video_id}/?format=json").decode("utf-8"))
        thumbnail = str(metadata.get("thumbnail_url") or "")
        if not thumbnail:
            raise RuntimeError("Rutube API did not return thumbnail_url")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(request_bytes(clean_remote_url(thumbnail, "https://rutube.ru")))
        result = f"{BASE_TOKEN}/assets/rutube/{target.name}"
        RUTUBE_POSTERS[video_id] = result
        return result
    except (RuntimeError, json.JSONDecodeError) as error:
        RUTUBE_POSTER_FAILURES.add(f"{video_id}: {error}")
        RUTUBE_POSTERS[video_id] = None
        return None


def materialize_source_videos(root: Tag, soup: BeautifulSoup, *, download: bool) -> int:
    """Replace inert third-party slots with a local poster and an explicit play action."""
    # The last value is either a deferred URL or the original signed Rutube
    # token.  Tilda stores the latter in two different shapes, so retain it
    # instead of trying to rebuild a playable URL at runtime.
    stages: list[tuple[Tag, str, str, str | None]] = []
    for node in root.select("[data-rutubeid]"):
        raw = str(node.get("data-rutubeid", ""))
        video_id = raw.split("?", 1)[0]
        if video_id:
            stages.append((node, "rutube", video_id, raw))
    for node in root.select("[data-videolazy-type][data-videolazy-id]"):
        kind = str(node.get("data-videolazy-type", "")).lower()
        raw = str(node.get("data-videolazy-id", ""))
        if kind == "rutube":
            video_id = raw.split("?", 1)[0]
            if video_id:
                signed_id = raw
                token = str(node.get("data-videolazy-hash", ""))
                if token:
                    signed_id = f"{video_id}?p={token}"
                stages.append((node, "rutube", video_id, signed_id))
        elif kind in {"iframe", "mp4"} and raw:
            stages.append((node, "iframe" if kind == "iframe" else "video", "", raw))

    staged_ids: set[int] = set()
    for node, kind, video_id, source_url in stages:
        if id(node) in staged_ids:
            continue
        staged_ids.add(id(node))
        node.clear()
        node["class"] = list(dict.fromkeys([*node.get("class", []), "source-video-stage"]))
        node["data-source-video-kind"] = kind
        if kind == "rutube":
            node["data-source-video-id"] = video_id
            node["data-rutubeid"] = source_url or video_id
            poster = rutube_poster(video_id, download=download)
        else:
            if kind == "video":
                source_url = local_video_replacement(source_url) or source_url
                # This now points at the local rendition; retaining the legacy
                # provider URL as an inert Tilda attribute is misleading and
                # can become a future accidental load if a runtime is added.
                node.attrs.pop("data-videolazy-id", None)
            node["data-source-video-url"] = quote(source_url or "", safe="")
            poster = None
        # An original T331 slot has no provider thumbnail.  Its checked-in
        # neutral poster is intentional: the visitor never sees a white hole
        # and a media request still begins only after their click.
        image = soup.new_tag("img", attrs={
            "src": poster or f"{BASE_TOKEN}/assets/rutube/video-fallback.svg",
            "alt": "Видео",
        })
        node.append(image)
        play = soup.new_tag("button", attrs={
            "class": ["source-video__play"],
            "data-source-video-play": "",
            "type": "button",
            "aria-label": "Воспроизвести видео",
        })
        play.string = "▶"
        node.append(play)
    return len(staged_ids)


def marquiz_parameters(blob: str) -> dict[str, str]:
    return {match.group("key"): match.group("value") for match in MARQUIZ_PARAM_RE.finditer(blob)}


def materialize_local_quiz_cta(marquiz: Tag, soup: BeautifulSoup, colour: str) -> None:
    """Local call to action on the spot of the inline Marquiz quiz frame."""
    marquiz.attrs.pop("data-marquiz-id", None)
    marquiz.clear()
    marquiz["class"] = list(dict.fromkeys([*marquiz.get("class", []), "source-quiz-cta"]))
    marquiz["style"] = f"--source-quiz-color:{colour}"
    eyebrow = soup.new_tag("p", attrs={"class": ["source-quiz-cta__eyebrow"]})
    eyebrow.string = "БОНУС"
    title = soup.new_tag("p", attrs={"class": ["source-quiz-cta__title"]})
    title.string = BONUS_FALLBACK["text"]
    text = soup.new_tag("p", attrs={"class": ["source-quiz-cta__text"]})
    text.string = (
        "Ответьте на несколько вопросов — подберём игру по возрасту и поводу "
        "и оставим за вами подарок к бронированию."
    )
    button = soup.new_tag("a", attrs={"class": ["source-quiz-cta__button"], "href": "#source-booking"})
    button.string = "Подобрать квест"
    marquiz.extend([eyebrow, title, text, button])


def normalize_phone_numbers(root: Tag, phone: str, phone_href: str) -> None:
    """Force every archived phone number to the one in `site.json`.

    Archived pages carry three spellings of the venue number plus numbers that
    belong to other businesses; the site has a single phone and one format for it.
    """
    # Номер обязан жить одной строкой. Обычные пробелы внутри него в узкой колонке
    # подвала переносились («+7 (928) 216 36» и «23» строкой ниже), а неразрывные
    # держат его целым; поиск по странице от них не страдает — браузеры считают
    # U+00A0 обычным пробелом, — и в `tel:`-ссылку они не попадают: там свой
    # `phoneHref` из site.json.
    unbreakable = phone.replace(" ", " ")

    def replace(match: re.Match[str]) -> str:
        digits = re.sub(r"\D", "", match.group(0))
        # An input mask placeholder (`+7(000) 000-00-00`) is not a phone number.
        if len(digits) != 11 or digits[1:] == "0" * 10:
            return match.group(0)
        return unbreakable

    for node in list(root.find_all(string=True)):
        # Comments and CDATA are NavigableString subclasses; rewriting one would
        # turn markup the source keeps as a comment into visible page text.
        if type(node) is not NavigableString:
            continue
        if node.parent is not None and node.parent.name in NON_TEXT_PARENTS:
            continue
        replaced = PHONE_RE.sub(replace, str(node))
        if replaced != str(node):
            node.replace_with(NavigableString(replaced))

    for element in root.select('a[href^="tel:"], a[href^="TEL:"]'):
        element["href"] = phone_href
    for element in root.select("*"):
        for attribute in PHONE_TEXT_ATTRIBUTES:
            value = element.get(attribute)
            if isinstance(value, str) and value:
                element[attribute] = PHONE_RE.sub(replace, value)


def restore_missing_records(soup: BeautifulSoup, contract_soup: BeautifulSoup) -> list[str]:
    """Вернуть записи, которые потерял браузерный override при съёмке.

    Гидратированный снимок `/kids/` приехал без двух записей: rec844797130 с
    виджетом отзывов и rec1100733981 с картой в подвале — на живой странице обе
    строит внешний скрипт, и в момент съёмки их в DOM ещё не было. Состав записей
    определяет архивная каноническая страница, поэтому недостающие переносим из
    неё на их же место — иначе локальные карта и отзывы просто некуда поставить.

    Записи шапки пропускаем: `#t-header` всё равно удаляется следом, её роль в
    раскладке играет общий Astro-хедер.
    """
    target_root = soup.select_one("#allrecords")
    source_root = contract_soup.select_one("#allrecords")
    if target_root is None or source_root is None or target_root is source_root:
        return []
    pattern = re.compile(r"^rec\d+$")
    present = {str(record.get("id")) for record in target_root.find_all(id=pattern)}
    restored: list[str] = []
    for record in source_root.find_all(id=pattern):
        record_id = str(record.get("id"))
        if record_id in present:
            continue
        parent = record.parent
        parent_id = str(parent.get("id") or "")
        if parent_id == "t-header":
            continue
        anchor_parent = target_root if parent is source_root else (
            target_root.select_one(f"#{parent_id}") if parent_id else None
        )
        if anchor_parent is None:
            continue
        # Место определяем по соседям: встаём сразу за ближайшей предыдущей
        # записью, которая в снимке есть, иначе перед ближайшей следующей.
        previous = next(
            (target_root.select_one(f"#{sibling.get('id')}")
             for sibling in record.find_previous_siblings(id=pattern)
             if str(sibling.get("id")) in present),
            None,
        )
        following = None if previous is not None else next(
            (target_root.select_one(f"#{sibling.get('id')}")
             for sibling in record.find_next_siblings(id=pattern)
             if str(sibling.get("id")) in present),
            None,
        )
        node = copy.copy(record)
        if previous is not None:
            previous.insert_after(node)
        elif following is not None:
            following.insert_before(node)
        else:
            anchor_parent.append(node)
        present.add(record_id)
        restored.append(record_id)
    return restored


def prepare_snapshot(
        route: str,
        raw_path: Path,
        contract_path: Path,
        *,
        download: bool,
) -> tuple[dict[str, object], set[str], dict[str, str]]:
    html = raw_path.read_text(encoding="utf-8", errors="replace")
    soup = BeautifulSoup(html, "html.parser")
    contract_html = contract_path.read_text(encoding="utf-8", errors="replace")
    contract_soup = BeautifulSoup(contract_html, "html.parser")
    resources: set[str] = set()
    stylesheets: dict[str, str] = {}

    # A browser-hydrated local override contains the desired runtime-created
    # DOM but points at already-built local CSS bundles. Preserve the archived
    # canonical page's stylesheet list and cascade order as the source contract.
    for link in contract_soup.select('link[rel="stylesheet"][href]'):
        href = clean_remote_url(str(link["href"]))
        host = urlparse(href).netloc.lower().removeprefix("www.")
        if host in SKIP_RESOURCE_HOSTS or host not in ALLOWED_REMOTE_HOSTS:
            continue
        # This malformed legacy Google Fonts URL returns HTTP 400 in the live
        # page as well. The adjacent variable-font declaration covers both
        # families and all weights, so do not turn a dead source request into
        # a generator failure.
        if host == "fonts.googleapis.com" and "wght@ital" in href:
            continue
        digest = hashlib.sha1(href.encode()).hexdigest()[:16]
        stylesheets[href] = f"{digest}.css"

    restore_missing_records(soup, contract_soup)

    header = soup.select_one("#t-header")
    had_source_header = contract_soup.select_one("#t-header") is not None
    if header:
        header.decompose()
    root = soup.select_one("#allrecords")
    if root is None:
        raise RuntimeError(f"Archived source has no #allrecords: {raw_path}")

    # The third-party regions the acceptance comparator masks — map and review
    # carousel — are replaced by local blocks instead of being dropped. Their
    # source records carry the page's own flow (the map alone is 385px between the
    # address chips and the footer), so removing them collapsed every page around
    # them while the network clients they started were already gone with the
    # scripts. The booking-fallback caption ("Расписание не загрузилось…") and the
    # review headings are plain local Tilda records and stay untouched.
    record_boundaries = [
        record for record in root.select('[id^="rec"]')
        if re.fullmatch(r"rec\d+", str(record.get("id", "")))
        and not record.parent.find_parent(id=re.compile(r"^rec\d+$"))
    ]
    widgets_materialized = False
    for record in list(record_boundaries):
        record_html = str(record).lower()
        if (
            record.select_one('.t-map, .t-map-lazyload, [id^="separateMap"], [data-maplazy-load]')
            or "t_appendyandexmap" in record_html
        ):
            widgets_materialized |= materialize_local_map(record, soup)
        if "myreviews" in record_html:
            widgets_materialized |= materialize_local_reviews(record, soup, root)

    # T979's justified masonry requires the two numeric arguments that Tilda
    # stores only in a stripped inline init call.
    for rec_id, row_height, gutter in re.findall(
            r"t979_init\(\s*['\"](\d+)['\"]\s*,\s*['\"](\d+)['\"]\s*,\s*['\"](\d+)['\"]\s*\)",
            contract_html):
        record = root.select_one(f"#rec{rec_id}")
        if record:
            record["data-source-t979-row-height"] = row_height
            record["data-source-t979-gutter"] = gutter

    # Marquiz is a script-only third-party embed: an inline quiz frame inside a
    # record and, on some routes, a floating launcher registered from a bare
    # script. Both are rebuilt locally — the inline frame becomes a call to action
    # on the local booking form, the launcher becomes the "БОНУС" plaque — and the
    # frame keeps the height measured on the live source so the page does not move.
    inline_quiz = MARQUIZ_INLINE_RE.search(contract_html)
    inline_colour = (
        marquiz_parameters(inline_quiz.group("params")).get("bgColor") if inline_quiz else None
    ) or "#ff6900"
    for marquiz in root.select("[data-marquiz-id]"):
        record = marquiz.find_parent(id=re.compile(r"^rec\d+$"))
        if not record:
            continue
        rec_id = str(record.get("id", ""))
        if route not in MARQUIZ_FRAME_HEIGHTS:
            raise RuntimeError(f"Unmeasured Marquiz geometry on {route}: {rec_id}")
        desktop_height, mobile_height = MARQUIZ_FRAME_HEIGHTS[route]
        materialize_local_quiz_cta(marquiz, soup, inline_colour)
        widgets_materialized = True
        # A browser-hydrated override can already carry the geometry appended by an
        # earlier build; two copies of the rule would fight over the same record.
        for previous in record.select("style"):
            if f"#{rec_id}{{box-sizing:border-box;min-height" in str(previous.string or ""):
                previous.decompose()
        geometry = soup.new_tag("style")
        # The record keeps the frame height measured on the live source, and the
        # call to action is centred in it: a column flexbox needs no arithmetic on
        # the record's own padding to do that.
        rules = (
            f"#{rec_id}{{box-sizing:border-box;min-height:{desktop_height};"
            f"display:flex;flex-direction:column;justify-content:center}}"
        )
        if mobile_height:
            rules += (
                f"@media screen and (max-width:640px){{#{rec_id}{{min-height:{mobile_height}}}}}"
            )
        geometry.string = rules
        record.append(geometry)

    # The floating launcher lives in the archived page as a single script call; its
    # argument object is the only surviving copy of the plaque's text and colour.
    floating = MARQUIZ_FLOATING_RE.search(contract_html)
    if floating:
        parameters = marquiz_parameters(floating.group("params"))
        plaque = soup.new_tag("div", attrs={
            "class": ["source-bonus-pop"],
            "data-source-bonus": "",
            "data-bonus-title": parameters.get("title") or BONUS_FALLBACK["title"],
            "data-bonus-text": parameters.get("text") or BONUS_FALLBACK["text"],
            "data-bonus-color": parameters.get("bgColor") or BONUS_FALLBACK["color"],
        })
        root.append(plaque)
        widgets_materialized = True

    # This shared footer separator's decorative shape protrudes beyond its 50px
    # artboard; Tilda includes 13px of that overflow in the record box.
    footer_separator = root.select_one("#rec1100733986")
    if footer_separator:
        separator_geometry = soup.new_tag("style")
        separator_geometry.string = "#rec1100733986{min-height:63px}"
        footer_separator.append(separator_geometry)

    # A few landing exports have no #t-header and use their first short empty
    # record as header flow space. Keep it in layout, while the shared Astro
    # header represents that same source boundary in parity diagnostics.
    if had_source_header is False:
        for early_record in root.find_all(id=re.compile(r"^rec\d+$"), recursive=False):
            if (str(early_record.get("data-record-type", "")) == "113"
                    and not early_record.get_text(" ", strip=True)):
                early_record["data-parity-layout-spacer"] = "header"
                break

    # NOLIM sliders keep their record list in a JSON-like settings comment.
    # Reproduce the source's deterministic first frame without executing the
    # large arbitrary inline extension: every slide after the first is hidden
    # with the source's own `.nolimAutoScaleFix` class.
    for configured in re.findall(r'"idBlocks"\s*:\s*"([^"]+)"', contract_html):
        block_ids = [item.strip().removeprefix("#") for item in configured.split(",") if item.strip()]
        slider_id = block_ids[0] if block_ids else ""
        for index, block_id in enumerate(block_ids):
            block = root.select_one(f"#{block_id}")
            if block:
                block["data-source-nolim-slider"] = slider_id
                block["data-source-nolim-index"] = str(index)
                block["data-source-nolim-total"] = str(len(block_ids))
                if index > 0:
                    block["class"] = list(dict.fromkeys([*block.get("class", []), "nolimAutoScaleFix"]))

    # NOLIM's continuous T552 galleries depend on one generated class for a
    # single-row flex track. Materialize that class; animation itself is later
    # frozen by parity/reduced-motion, while layout remains identical.
    for match in re.finditer(r"<!--settings(\{.*?\})settingsend-->", contract_html, re.S):
        try:
            settings = json.loads(match.group(1))
        except json.JSONDecodeError:
            continue
        target_id = str(settings.get("GL11blockId", "")).removeprefix("#")
        if not target_id:
            continue
        end = contract_html.find("<!-- nominify end -->", match.end())
        extension = contract_html[match.end(): end if end >= 0 else match.end() + 30_000]
        generated_class = re.search(r"\.([a-z0-9_-]*nlm095_[a-z0-9_-]+)\b", extension, re.I)
        target = root.select_one(f"#{target_id}")
        if target and generated_class:
            target["class"] = list(dict.fromkeys([*target.get("class", []), generated_class.group(1)]))

    # Counter extensions store their final values in an inert settings comment.
    # The live page reaches those values before parity capture; materialize that
    # final state instead of executing the extension's arbitrary inline script.
    for settings_blob in re.findall(r"<!--settings(\{.*?\})settingsend-->", contract_html, re.S):
        try:
            settings = json.loads(settings_blob)
        except json.JSONDecodeError:
            continue
        separator = str(settings.get("digitsSeparation", " "))
        for counter in settings.get("addDigit", []):
            class_name = str(counter.get("elemClass", "")).removeprefix(".")
            final_value = str(counter.get("endDigit", ""))
            if not class_name or not final_value:
                continue
            element = root.find(class_=class_name)
            atom = element.select_one(".tn-atom") if element else None
            if not atom:
                continue
            try:
                numeric = int(float(final_value))
                atom.string = f"{numeric:,}".replace(",", separator)
            except ValueError:
                atom.string = final_value

    materialize_zero_galleries(root, soup)
    materialize_zero_forms(root, soup)
    normalize_phone_fields(root, soup)
    widgets_materialized |= bool(materialize_source_videos(root, soup, download=download))

    # Browser overrides are intentionally captured after the source runtime has
    # materialised script-only galleries and forms. Strip every viewport-bound
    # inline calculation so the small, audited local layout subset can rebuild
    # responsive geometry without executing any legacy Tilda script.
    for artboard in root.select(".t396__artboard"):
        for runtime_style in artboard.select("style.t396__scale-style"):
            runtime_style.decompose()
        artboard.attrs.pop("style", None)
        artboard["class"] = [
            class_name for class_name in artboard.get("class", [])
            if class_name != "t396__artboard_scale"
        ]
        artboard["class"] = list(dict.fromkeys([*artboard.get("class", []), "rendered"]))
        for attribute in list(artboard.attrs):
            if attribute.startswith("data-artboard-proxy-"):
                artboard.attrs.pop(attribute, None)
        for layer in artboard.select(":scope > .t396__carrier, :scope > .t396__filter"):
            layer.attrs.pop("style", None)
        for group in artboard.select(":scope > .t396__group"):
            group.attrs.pop("style", None)
        for element in artboard.select(".t396__elem"):
            element.attrs.pop("style", None)
        # Hydrated browser overrides can carry a desktop pixel line-height on
        # the atom itself.  The marker is runtime-only and prevents the source
        # media rules from restoring their mobile line-height.
        for atom in artboard.select(".tn-atom[style]"):
            atom_style = str(atom.get("style", ""))
            if "--lh-px" not in atom_style:
                continue
            atom_style = ";".join(
                declaration.strip()
                for declaration in atom_style.split(";")
                if declaration.strip()
                and declaration.split(":", 1)[0].strip().lower() not in {"--lh-px", "line-height"}
            )
            if atom_style:
                atom["style"] = atom_style
            else:
                atom.attrs.pop("style", None)

    for slider in root.select('.t-slds__items-wrapper[data-slider-initialized]'):
        try:
            total_slides = int(str(slider.get("data-slider-totalslides", "0")))
        except ValueError:
            total_slides = 0
        for item in list(slider.select(":scope > .t-slds__item")):
            index = str(item.get("data-slide-index", ""))
            if total_slides and index in {"0", str(total_slides + 1)}:
                item.decompose()
                continue
            item.attrs.pop("data-slide-index", None)
            item.attrs.pop("aria-hidden", None)
            item.attrs.pop("aria-label", None)
            item.attrs.pop("style", None)
            item["class"] = [
                class_name for class_name in item.get("class", [])
                if class_name != "t-slds__item_active"
            ]
        for attribute in (
                "data-slider-initialized", "data-swiper-initialized",
                "data-slider-interval-id", "data-slider-cycle",
                "data-slider-animated", "data-slider-stopped"):
            slider.attrs.pop(attribute, None)
        slider.attrs.pop("style", None)
    for slider_part in root.select(".t-slds, .t-slds__main, .t-slds__container"):
        slider_part.attrs.pop("style", None)

    for grid in root.select(".t979__grid"):
        grid.attrs.pop("style", None)
        for item in grid.select(":scope > .t979__grid-item"):
            item.attrs.pop("style", None)
            item["class"] = [
                class_name for class_name in item.get("class", [])
                if not class_name.startswith("t-animate__chain_")
            ]

    # Browser overrides contain viewport-specific geometry written by block
    # initializers. It must not survive into a responsive snapshot: T1196
    # equalises only currently visible horizontal cards, while T827 Masonry
    # writes absolute positions and a container height for the capture width.
    for item in root.select(".t1196__item"):
        item.attrs.pop("style", None)
    for grid in root.select(".t827__grid"):
        grid.attrs.pop("style", None)
        for item in grid.select(":scope > *"):
            item.attrs.pop("style", None)
            item["class"] = [
                class_name for class_name in item.get("class", [])
                if not class_name.startswith("t-animate__chain_")
            ]

    # Layout loads the archived stylesheets once in <head>; raw <link> nodes
    # inside #allrecords would re-apply page-global rules after isolation.
    for unsafe in root.select("script, noscript, iframe, object, embed, link"):
        unsafe.decompose()
    # Tilda оставляет в разметке комментарий «Form export deps» со списком своих
    # скриптов. Подключить их нельзя (санитайзер режет исполняемое), но выкачка
    # видит в комментарии ссылки и вендорит 800 КБ мёртвых файлов — их запрещает
    # asset-audit. Комментарий инертен, поэтому убираем его целиком.
    for comment in root.find_all(string=lambda node: isinstance(node, Comment)):
        if "Form export deps" in comment:
            comment.extract()
    for form in root.select("form"):
        form["action"] = ""
        form["method"] = "post"
        form["data-local-source-form"] = ""
    materialize_playable_video_sources(root)
    for video in root.select("video"):
        video["preload"] = "none"
        video.attrs.pop("autoplay", None)
    for anchor in root.select("a[name]:not([id])"):
        anchor["id"] = anchor["name"]
    for anchor in root.select("a:not([href])"):
        anchor["href"] = "#source-booking"
    local_targets = {
        str(element.get("id") or element.get("name"))
        for element in root.select("[id], [name]")
        if element.get("id") or element.get("name")
    }
    for anchor in root.select('a[href^="#"]'):
        fragment = str(anchor.get("href", "")).removeprefix("#")
        if fragment in {"prazdnik", "quiz", "callback"} and fragment not in local_targets:
            anchor["href"] = "#source-booking"

    rewrite_fragment_urls(root, resources)
    for image in root.select("img[data-original]"):
        if image.get("data-original"):
            image["src"] = image["data-original"]

    contacts = local_data(SITE_DATA)["header"]
    normalize_phone_numbers(root, str(contacts["phone"]), str(contacts["phoneHref"]))

    if widgets_materialized:
        widget_style = soup.new_tag("style", attrs={"data-source-widgets": ""})
        widget_style.string = SOURCE_WIDGET_STYLE
        root.insert(0, widget_style)

    root["data-source-snapshot"] = ""
    root["data-source-route"] = route

    snapshot_name = f"{route_slug(route)}.html"
    snapshot_path = SNAPSHOT_DIR / snapshot_name
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    serialized = str(root)
    resources.update(remote_urls(serialized))
    serialized = URL_RE.sub(
        lambda match: f"{match.group('quote')}{local_url(match.group('url'))}",
        serialized,
    )
    snapshot_path.write_text(serialized, encoding="utf-8")

    record_types = sorted({
        str(record.get("data-record-type"))
        for record in root.select(':scope > [id^="rec"][data-record-type]')
        if str(record.get("data-record-type", "")).isdigit()
    }, key=int)
    meta: dict[str, object] = {
        "route": route,
        "snapshot": snapshot_name,
        "source": str(raw_path.relative_to(ROOT.parent)),
        # CSS cascade order is part of the archived page contract. In
        # particular, Tilda's responsive block rules intentionally follow its
        # reset; sorting content hashes silently reversed that relationship.
        "styles": list(stylesheets.values()),
        "pageScript": "",
        "recordTypes": record_types,
    }
    return meta, resources, stylesheets


def outer_record(node: Tag) -> Tag | None:
    """Самая внешняя запись Tilda (`rec…`), внутри которой лежит узел."""
    outermost: Tag | None = None
    current: Tag | None = node
    while current is not None:
        if isinstance(current, Tag) and re.fullmatch(r"rec\d+", str(current.get("id") or "")):
            outermost = current
        current = current.parent
    return outermost


def defer_offscreen_media(soup: BeautifulSoup) -> None:
    """Оставить жадной только медиа первого экрана, остальное отложить.

    Ленивость обязана стоять в самом снимке: рантайм получает документ, когда
    парсер уже встретил `<img>` и браузер начал качать файл, а снятый и
    возвращённый `src` начатый запрос не отменяет. Поэтому `loading="lazy"`
    проставляется здесь, при генерации, а фоновым слоям Tilda инлайновый
    `background-image` до подхода к экрану просто не выдаётся: ссылка ждёт под
    маркером `data-source-lazy-bg`, который подхватывает
    `src/scripts/source-widgets.js`. `data-original` у отложенного слоя при этом
    снимается намеренно — иначе фон назначит первый же обход рантайма, и вся
    страница снова уедет в сеть на загрузке.
    """
    eager_records: list[str] = []
    eager_count = 0
    for node in soup.select("img, [data-original]"):
        record = outer_record(node)
        record_id = str(record.get("id")) if record is not None else ""
        if record_id not in eager_records and len(eager_records) < EAGER_MEDIA_RECORDS:
            eager_records.append(record_id)
        eager = record_id in eager_records and eager_count < EAGER_MEDIA_LIMIT
        if eager:
            eager_count += 1
            if node.name == "img":
                node["loading"] = "eager"
            continue

        if node.name == "img":
            node["loading"] = "lazy"
            node["decoding"] = "async"
            # Native `loading=lazy` is only a browser hint. Chromium may fetch
            # a large grid several viewports early, which still makes the tail
            # of an image-heavy archived page compete with the first screen.
            # Keep the actual URL out of parsed HTML and let the local runtime
            # insert it from an IntersectionObserver prefetch window instead.
            source = str(node.get("src") or "")
            if source and not source.startswith("data:"):
                node["data-source-lazy-img"] = source
                node.attrs.pop("src", None)
        background = str(node.get("data-original") or "")
        style = str(node.get("style", ""))
        if not background or "background-image" not in style:
            continue
        stripped = strip_style_declarations(style, ("background-image",))
        if stripped:
            node["style"] = stripped
        else:
            node.attrs.pop("style", None)
        node["class"] = [name for name in node.get("class", []) if name != "loaded"]
        # У `<img>` ссылка остаётся в `src`, и ленивую загрузку уже держит браузер;
        # маркер нужен только фоновым слоям, у которых своего запроса нет.
        if node.name != "img":
            node["data-source-lazy-bg"] = background
            node.attrs.pop("data-original", None)


def apply_image_dimensions(snapshot_path: Path) -> None:
    soup = BeautifulSoup(snapshot_path.read_text(encoding="utf-8"), "html.parser")
    for image in soup.select("img"):
        source = str(image.get("src") or image.get("data-original") or "")
        dimensions = None
        if source and not source.startswith("data:"):
            relative = source.replace(f"{BASE_TOKEN}/assets/", "", 1)
            dimensions = image_dimensions(PUBLIC_ASSETS / relative)
        if dimensions:
            image["width"], image["height"] = map(str, dimensions)
        else:
            if not image.get("width"):
                image["width"] = "1"
            if not image.get("height"):
                image["height"] = "1"
    # Ленивость ставится после размеров: она уносит ссылку фонового слоя из
    # `data-original`, откуда размеры её и читают.
    defer_offscreen_media(soup)
    snapshot_path.write_text(str(soup), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--routes", default="", help="Comma-separated canonical routes")
    parser.add_argument("--no-download", action="store_true")
    args = parser.parse_args()

    inventory = json.loads(INVENTORY.read_text(encoding="utf-8"))
    all_routes = sorted(set(inventory["clone_route_paths"]))
    requested = [canonical_route(route.strip()) for route in args.routes.split(",") if route.strip()]
    routes = requested or all_routes
    sources = pick_sources(routes)
    contract_sources = pick_sources(routes, use_overrides=False)
    missing = [route for route in routes if route not in sources and route != "/kvesty-v-rostove-na-donu/"]
    if missing:
        raise RuntimeError(f"No archived source for: {', '.join(missing)}")

    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    CSS_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, dict[str, object]] = {}
    resources: set[str] = set()
    stylesheets: dict[str, str] = {}
    for route, raw_path in sorted(sources.items()):
        meta, page_resources, page_styles = prepare_snapshot(
            route, raw_path, contract_sources[route], download=not args.no_download,
        )
        manifest[route] = meta
        resources.update(page_resources)
        stylesheets.update(page_styles)

    css_asset_urls: set[str] = set()
    if not args.no_download:
        for source_url, name in sorted(stylesheets.items()):
            css_path = CSS_DIR / name
            if css_path.exists() and css_path.stat().st_size > 0:
                payload = css_path.read_text(encoding="utf-8", errors="replace")
                css_asset_urls.update(remote_urls(payload, source_url))
                continue
            downloaded_name, payload, nested = stylesheet_payload(source_url)
            if downloaded_name != name:
                raise RuntimeError(f"Stylesheet digest drift for {source_url}")
            css_path.write_text(payload, encoding="utf-8")
            css_asset_urls.update(nested)
        resources.update(css_asset_urls)

        failures: list[str] = []
        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = {executor.submit(vendor_resource, url): url for url in sorted(resources)}
            for index, future in enumerate(as_completed(futures), start=1):
                url, _, status = future.result()
                if status not in {"cached", "downloaded"}:
                    failures.append(f"{url}: {status}")
                if index % 200 == 0:
                    print(f"vendored {index}/{len(futures)}", file=sys.stderr)
        if failures:
            (ROOT / "migration" / "parity" / "snapshot-download-failures.txt").write_text(
                "\n".join(failures) + "\n", encoding="utf-8"
            )
            print(f"warning: {len(failures)} resources could not be downloaded", file=sys.stderr)

    if RUTUBE_POSTER_FAILURES:
        (ROOT / "migration" / "parity" / "rutube-poster-failures.txt").write_text(
            "\n".join(sorted(RUTUBE_POSTER_FAILURES)) + "\n", encoding="utf-8"
        )

    for route in manifest:
        apply_image_dimensions(SNAPSHOT_DIR / str(manifest[route]["snapshot"]))

    runtime = []
    for url in RUNTIME_URLS:
        target = public_path_for_url(url)
        if target:
            runtime.append(f"/assets/{target.relative_to(PUBLIC_ASSETS).as_posix()}")
    output = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "runtime": runtime,
        "routes": manifest,
    }
    MANIFEST_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"routes": len(manifest), "resources": len(resources), "styles": len(stylesheets)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
