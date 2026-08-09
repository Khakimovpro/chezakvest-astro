#!/usr/bin/env python3
"""Проверяет, что каждая картинка из данных страниц действительно лежит в public/.

Запуск: python3 _capture/check_assets.py
Данные праздничных страниц собираются полуручную, поэтому опечатка в имени файла даёт
битую картинку — сборка при этом проходит молча. Скрипт ловит такие случаи.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "src", "data", "pages")
PUBLIC = os.path.join(ROOT, "public")


def paths(node, acc):
    if isinstance(node, dict):
        for v in node.values():
            paths(v, acc)
    elif isinstance(node, list):
        for v in node:
            paths(v, acc)
    elif isinstance(node, str) and node.startswith("/assets/"):
        acc.append(node)
    return acc


def main():
    bad = 0
    for f in sorted(os.listdir(DATA)):
        if not f.endswith(".json"):
            continue
        data = json.load(open(os.path.join(DATA, f), encoding="utf-8"))
        missing = [p for p in paths(data, []) if not os.path.exists(PUBLIC + p)]
        if missing:
            bad += len(missing)
            print(f"!! {f}: нет файлов — {', '.join(sorted(set(missing)))}")
    print("битых путей нет" if not bad else f"битых путей: {bad}")


if __name__ == "__main__":
    main()
