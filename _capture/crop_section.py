#!/usr/bin/env python3
"""Вырезает область скриншота оригинала — чтобы прочитать глазами то, что вбито в картинку.

Запуск: python3 _capture/crop_section.py <slug> <top> <height> [out.jpg] [scale]
Скриншоты берутся из _capture/shots/<slug>-1440.png (их делает scrape_page.mjs).
"""
import os
import sys

from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    slug, top, height = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    out = sys.argv[4] if len(sys.argv) > 4 else f"/tmp/{slug}-{top}.jpg"
    scale = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0
    im = Image.open(os.path.join(ROOT, "_capture", "shots", f"{slug}-1440.png"))
    box = im.crop((0, max(0, top), im.width, min(im.height, top + height)))
    if scale != 1.0:
        box = box.resize((int(box.width * scale), int(box.height * scale)), Image.LANCZOS)
    box.convert("RGB").save(out, quality=80)
    print(f"{out}  {box.width}x{box.height}")


if __name__ == "__main__":
    main()
