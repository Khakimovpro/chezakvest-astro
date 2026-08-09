#!/usr/bin/env python3
"""Сравнение двух скриншотов: python3 _capture/compare.py A.png B.png [--diff out.png]

Печатает процент совпадения пикселей (допуск 12 по каждому каналу) и разницу высот.
Картинки приводятся к общей ширине и обрезаются по меньшей высоте — расхождение высот
выводится отдельно, оно важнее попиксельного шума.
"""
import sys
import numpy as np
from PIL import Image

TOL = 12


def load(p):
    return Image.open(p).convert("RGB")


def main():
    a_path, b_path = sys.argv[1], sys.argv[2]
    out = None
    if "--diff" in sys.argv:
        out = sys.argv[sys.argv.index("--diff") + 1]

    a, b = load(a_path), load(b_path)
    if a.width != b.width:
        b = b.resize((a.width, round(b.height * a.width / b.width)), Image.LANCZOS)

    h = min(a.height, b.height)
    aa = np.asarray(a.crop((0, 0, a.width, h)), dtype=np.int16)
    bb = np.asarray(b.crop((0, 0, a.width, h)), dtype=np.int16)

    diff = np.abs(aa - bb).max(axis=2)
    same = (diff <= TOL).mean() * 100
    print(f"совпадение: {same:.2f}%  (сравнено {a.width}x{h})")
    print(f"высоты: {a.height} vs {b.height} (разница {abs(a.height - b.height)} px)")

    # где именно расходится — по горизонтальным полосам в 200 px
    bad = diff > TOL
    band = 200
    worst = []
    for y in range(0, h, band):
        share = bad[y:y + band].mean() * 100
        if share > 3:
            worst.append((y, share))
    if worst:
        print("полосы с расхождением >3%:")
        for y, share in worst[:12]:
            print(f"  y={y}-{y + band}: {share:.1f}%")

    if out:
        vis = np.zeros((h, a.width, 3), dtype=np.uint8)
        vis[..., 0] = np.where(bad, 255, 0)
        vis[..., 1] = np.asarray(a.crop((0, 0, a.width, h)).convert("L"))
        Image.fromarray(vis).save(out)
        print("карта расхождений:", out)


if __name__ == "__main__":
    main()
