#!/usr/bin/env python3
"""Extract every Tilda Zero Block responsive state and safe inline text.

The migration used to keep only the 1200 and 320 canvases.  Tilda stores five
source canvases (1200/960/640/480/320) in the record markup, including inherited
values.  This extractor keeps those values deterministic so Astro components can
consume generated evidence instead of transcribing media queries by hand.

Usage:
    python3 _capture/extract_artboard_states.py RAW_HTML [RAW_HTML ...]
    python3 _capture/extract_artboard_states.py RAW_HTML --output output.json
"""

from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path
from urllib.parse import urlparse

from bs4 import BeautifulSoup, NavigableString, Tag


SCREENS = (1200, 960, 640, 480, 320)
STYLE_FIELDS = ("fontsize", "lineheight", "fontweight", "letterspacing", "textalign")
INLINE_TAGS = {"a", "b", "br", "em", "span", "strong"}
COLOR_RE = re.compile(
    r"^(?:#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?"
    r"(?:\s*,\s*[\d.]+%?)?\s*\)|[a-z]{3,24})$",
    re.I,
)


def safe_href(value: str) -> str:
    value = html.unescape(value or "").strip()
    if not value:
        return ""
    parsed = urlparse(value)
    if parsed.scheme and parsed.scheme.lower() not in {"http", "https", "mailto", "tel"}:
        return ""
    if not parsed.scheme and not value.startswith(("/", "#")):
        return ""
    return value


def safe_color(value: str) -> str:
    value = re.sub(r"\s+", " ", value or "").strip().lower()
    return value if COLOR_RE.fullmatch(value) else ""


def color_from_style(value: str) -> str:
    for declaration in (value or "").split(";"):
        name, separator, candidate = declaration.partition(":")
        if separator and name.strip().lower() == "color":
            return safe_color(candidate)
    return ""


def sanitize_node(node: NavigableString | Tag) -> str:
    if isinstance(node, NavigableString):
        return html.escape(str(node), quote=False)
    if not isinstance(node, Tag):
        return ""

    name = node.name.lower()
    if name in {"script", "style"}:
        return ""
    children = "".join(sanitize_node(child) for child in node.children)
    if name not in INLINE_TAGS:
        return children
    if name == "br":
        return "<br>"

    attributes = ""
    color = color_from_style(str(node.get("style", "")))
    if color and name in {"b", "em", "span", "strong"}:
        attributes += f' style="color:{html.escape(color, quote=True)}"'
    if name == "a":
        href = safe_href(str(node.get("href", "")))
        if not href:
            return children
        attributes += f' href="{html.escape(href, quote=True)}"'
        if node.get("target") == "_blank":
            attributes += ' target="_blank" rel="noopener noreferrer"'
    return f"<{name}{attributes}>{children}</{name}>"


def safe_inline(atom: Tag | None) -> str:
    if atom is None:
        return ""
    return "".join(sanitize_node(child) for child in atom.children).strip()


def numeric(value: str | None):
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except ValueError:
        return value
    return int(number) if number.is_integer() else number


def field(element: Tag, name: str, screen: int):
    if screen == 1200:
        value = element.get(f"data-field-{name}-value")
    else:
        value = element.get(f"data-field-{name}-res-{screen}-value")
    return numeric(value)


def inherited_states(element: Tag) -> dict[str, dict[str, object]]:
    current = {name: field(element, name, 1200) for name in ("top", "left", "width", "height")}
    states: dict[str, dict[str, object]] = {"1200": dict(current)}
    for screen in SCREENS[1:]:
        for name in current:
            candidate = field(element, name, screen)
            if candidate is not None:
                current[name] = candidate
        states[str(screen)] = dict(current)
    return states


def inherited_styles(element: Tag) -> dict[str, dict[str, object]]:
    current = {name: field(element, name, 1200) for name in STYLE_FIELDS}
    states: dict[str, dict[str, object]] = {"1200": dict(current)}
    for screen in SCREENS[1:]:
        for name in current:
            candidate = field(element, name, screen)
            if candidate is not None:
                current[name] = candidate
        states[str(screen)] = dict(current)
    return states


def artboard_heights(artboard: Tag) -> dict[str, object]:
    base = numeric(artboard.get("data-artboard-height"))
    heights = {"1200": base}
    current = base
    for screen in SCREENS[1:]:
        candidate = numeric(artboard.get(f"data-artboard-height-res-{screen}"))
        if candidate is not None:
            current = candidate
        heights[str(screen)] = current
    return heights


def extract_record(record: Tag) -> dict[str, object] | None:
    artboard = record.select_one(".t396__artboard")
    if artboard is None:
        return None
    elements = []
    for element in artboard.select(":scope > .tn-elem"):
        atom = element.select_one(":scope > .tn-atom")
        inline_html = safe_inline(atom) if element.get("data-elem-type") == "text" else ""
        text = " ".join(atom.stripped_strings) if atom else ""
        elements.append(
            {
                "id": element.get("data-elem-id", ""),
                "type": element.get("data-elem-type", ""),
                "states": inherited_states(element),
                "styles": inherited_styles(element),
                "text": text,
                "html": inline_html,
            }
        )
    return {
        "id": record.get("id", "").removeprefix("rec"),
        "screens": list(SCREENS),
        "heights": artboard_heights(artboard),
        "elements": elements,
    }


def extract(path: Path) -> dict[str, object]:
    soup = BeautifulSoup(path.read_text(encoding="utf-8", errors="replace"), "html.parser")
    records = []
    for record in soup.select('div.r[data-record-type="396"]'):
        extracted = extract_record(record)
        if extracted:
            records.append(extracted)
    return {"source": str(path), "screens": list(SCREENS), "records": records}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("inputs", nargs="+", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    payload = [extract(path) for path in args.inputs]
    result: object = payload[0] if len(payload) == 1 else payload
    encoded = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded, encoding="utf-8")
    else:
        print(encoded, end="")


if __name__ == "__main__":
    main()
