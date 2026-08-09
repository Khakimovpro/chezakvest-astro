#!/usr/bin/env python3
"""Скачивает картинки оригинала в общий пул public/assets/q и печатает локальные пути.

Запуск: python3 _capture/fetch_images.py [ширина] <url> [url...]
Нужен для блоков, которых нет в снимке живой страницы (скрытые слайды каруселей и вкладок):
их картинки берём из HTML-снимка и тянем поимённо.
"""
import sys

from build_quest import local_image


def main():
    args = sys.argv[1:]
    width = 900
    if args and args[0].isdigit():
        width = int(args[0])
        args = args[1:]
    for url in args:
        print(f"{local_image(url, width)}   <- {url}")


if __name__ == "__main__":
    main()
