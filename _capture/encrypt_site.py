#!/usr/bin/env python3
"""Шифрует собранный сайт паролем: на хостинг уезжают только зашифрованные данные.

Запуск:  python3 _capture/encrypt_site.py <пароль> [--src dist] [--out dist-enc]

Как это работает:
  * каждая страница `<путь>/index.html` шифруется в `<путь>/page.enc`, а вместо неё кладётся
    одинаковый лоадер с формой пароля;
  * каждая картинка шифруется в `<имя>.enc`, оригиналы на хостинг не попадают;
  * в разметке src/srcset заменяются на `data-enc`, лоадер подставляет расшифрованные blob-ссылки.

Шифр: AES-256-GCM, ключ из пароля через PBKDF2-HMAC-SHA256 (250 000 итераций). Соль общая на
сборку и лежит в лоадере — благодаря этому ключ считается один раз на страницу, а не на каждый
файл; у каждого файла свой nonce. Пароль нигде не хранится — без него файлы бесполезны.
"""
import argparse
import base64
import hashlib
import os
import re
import secrets
import shutil
import sys

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:                                        # pragma: no cover
    print("нужен пакет cryptography: pip install cryptography")
    sys.exit(1)

ITERATIONS = 250_000
ASSET_EXT = (".webp", ".png", ".jpg", ".jpeg", ".svg", ".ico", ".mp4")
SKIP_ASSET = ("/fonts.gstatic.com/", "_GPT_light")   # шрифты и фон-паттерн: нужны до входа и живут в CSS


def encrypt_bytes(data, key):
    """Соль общая на весь сайт (лежит в лоадере), у каждого файла — свой nonce."""
    nonce = secrets.token_bytes(12)
    blob = AESGCM(key).encrypt(nonce, data, None)
    return base64.b64encode(nonce + blob)


LOADER = """<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Доступ по паролю</title>
<style>
 :root{color-scheme:light}
 body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
      background:#eee;font-family:Montserrat,-apple-system,Segoe UI,Roboto,sans-serif;color:#333}
 .box{background:#fff;border-radius:20px;padding:38px 34px;max-width:380px;width:calc(100% - 32px);
      box-shadow:0 12px 40px rgba(0,0,0,.08);text-align:center}
 h1{font-size:20px;margin:0 0 8px}
 p{margin:0 0 22px;font-size:14px;color:#777;line-height:1.5}
 input{width:100%;height:48px;border:1px solid #e0e0e0;border-radius:10px;padding:0 14px;
       font-size:16px;font-family:inherit;box-sizing:border-box}
 button{width:100%;height:48px;margin-top:12px;border:0;border-radius:10px;background:#ff6b00;
        color:#fff;font-size:16px;font-weight:600;font-family:inherit;cursor:pointer}
 button:disabled{opacity:.6;cursor:default}
 .err{margin-top:14px;color:#d33;font-size:14px;min-height:20px}
</style></head>
<body>
<div class="box">
  <h1>Чё за Квест — превью сайта</h1>
  <p>Страница закрыта паролем. Содержимое зашифровано, без пароля его нельзя прочитать.</p>
  <form id="f"><input id="p" type="password" placeholder="Пароль" autofocus autocomplete="current-password">
  <button type="submit">Открыть</button></form>
  <div class="err" id="e"></div>
</div>
<script>
const BASE = "__BASE__";
const KEY = "czk-preview-pass";

const SALT = b64("__SALT__");
let KEYP = null;                       // ключ считается один раз на страницу и переиспользуется

function derive(pass) {
  if (!KEYP) {
    KEYP = crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"])
      .then((km) => crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: SALT, iterations: __ITER__, hash: "SHA-256" },
        km, { name: "AES-GCM", length: 256 }, false, ["decrypt"]));
  }
  return KEYP;
}

function b64(str) {
  const bin = atob(str.trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function decrypt(url, pass) {
  const [raw, key] = await Promise.all([fetch(url).then((r) => r.text()).then(b64), derive(pass)]);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12)));
}

// Картинки расшифровываются лениво: сразу — только те, что близко к экрану,
// остальные по мере скролла. Иначе разблокировка ждёт весь набор (на главной их сотня).
function swapAssets(pass) {
  const cache = new Map();

  const load = async (el) => {
    const src = el.getAttribute("data-enc");
    if (!src || el.dataset.encDone) return;
    el.dataset.encDone = "1";
    try {
      if (!cache.has(src)) {
        cache.set(src, decrypt(src, pass).then((bytes) => {
          const type = src.endsWith(".svg.enc") ? "image/svg+xml"
            : src.endsWith(".png.enc") ? "image/png"
            : src.endsWith(".mp4.enc") ? "video/mp4" : "image/webp";
          return URL.createObjectURL(new Blob([bytes], { type }));
        }));
      }
      const url = await cache.get(src);
      if (el.tagName === "IMG" || el.tagName === "VIDEO") el.src = url;
      else el.style.backgroundImage = `url(${url})`;
    } catch (err) { el.dataset.encDone = ""; }
  };

  const nodes = [...document.querySelectorAll("[data-enc]")];
  if (!("IntersectionObserver" in window)) { nodes.forEach(load); return; }

  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { obs.unobserve(e.target); load(e.target); }
    });
  }, { rootMargin: "800px 0px" });

  nodes.forEach((el) => io.observe(el));
  // первые два экрана не ждут наблюдателя: туда попадают герой и слайды слайдера,
  // которые сдвинуты за край вьюпорта и сами по себе в наблюдатель не попадут
  const limit = window.innerHeight * 2;
  nodes.filter((el, i) => i < 4 || el.getBoundingClientRect().top < limit).forEach(load);
}

async function unlock(pass, silent) {
  const err = document.getElementById("e");
  try {
    const bytes = await decrypt(BASE + "page.enc", pass);
    const html = new TextDecoder().decode(bytes);
    sessionStorage.setItem(KEY, pass);
    document.open(); document.write(html); document.close();
    // разметка заменена целиком, поэтому доклеиваем обработку картинок вручную
    const run = () => swapAssets(pass);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
    else run();
  } catch (e) {
    sessionStorage.removeItem(KEY);
    if (!silent) err.textContent = "Неверный пароль";
  }
}

document.getElementById("f").addEventListener("submit", (e) => {
  e.preventDefault();
  unlock(document.getElementById("p").value, false);
});

const saved = sessionStorage.getItem(KEY);
if (saved) unlock(saved, true);
</script>
</body></html>
"""


def rewrite_html(html, assets_map, base):
    """Меняет ссылки на картинки на data-enc и убирает preload, чтобы не было 404 до входа."""
    # 1x1 прозрачный пиксель вместо пустого src: пустой src браузер трактует как ссылку на страницу
    PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="

    def sub_src(m):
        attr, url = m.group(1), m.group(2)
        key = url.split("?")[0]
        if key not in assets_map:
            return m.group(0)
        if attr == "src":
            return f'src="{PIXEL}" data-enc="{assets_map[key]}"'
        # data-src/data-original — отложенная загрузка Tilda и слайдера: атрибут убираем,
        # иначе скрипт подставит путь к файлу, которого на хостинге уже нет
        return f'data-enc="{assets_map[key]}"'

    html = re.sub(r'\b(src|data-src|data-original)="([^"]+)"', sub_src, html)
    html = re.sub(r'\ssrcset="[^"]*"', "", html)
    html = re.sub(r'\ssizes="[^"]*"', "", html)
    html = re.sub(r'<link rel="preload" as="image"[^>]*>', "", html)
    # фоновые картинки в инлайн-стилях
    html = re.sub(r'style="background-image:url\(([^)]+)\)"',
                  lambda m: (f'style="" data-enc="{assets_map[m.group(1)]}"'
                             if m.group(1) in assets_map else m.group(0)), html)
    return html


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("password")
    ap.add_argument("--src", default="dist")
    ap.add_argument("--out", default="dist-enc")
    ap.add_argument("--base", default="/", help="базовый путь сайта на хостинге")
    args = ap.parse_args()

    site_salt = secrets.token_bytes(16)
    key = hashlib.pbkdf2_hmac("sha256", args.password.encode(), site_salt, ITERATIONS, 32)
    salt_b64 = base64.b64encode(site_salt).decode()

    src, out = os.path.abspath(args.src), os.path.abspath(args.out)
    if os.path.exists(out):
        shutil.rmtree(out)
    os.makedirs(out)

    # 1) шифруем ассеты и запоминаем, чем заменять ссылки
    assets_map = {}
    n_assets = 0
    for dirpath, _, files in os.walk(src):
        for f in files:
            path = os.path.join(dirpath, f)
            rel = os.path.relpath(path, src)
            web = "/" + rel.replace(os.sep, "/")
            if not f.lower().endswith(ASSET_EXT) or any(s in web for s in SKIP_ASSET):
                continue
            dst = os.path.join(out, rel + ".enc")
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(dst, "wb") as fh:
                fh.write(encrypt_bytes(open(path, "rb").read(), key))
            for variant in {web, args.base.rstrip("/") + web}:
                assets_map[variant] = args.base.rstrip("/") + web + ".enc"
            n_assets += 1

    # 2) страницы: шифруем содержимое, на их место кладём лоадер
    n_pages = 0
    for dirpath, _, files in os.walk(src):
        for f in files:
            path = os.path.join(dirpath, f)
            rel = os.path.relpath(path, src)
            if f.endswith(".html"):
                html = rewrite_html(open(path, encoding="utf-8").read(), assets_map, args.base)
                page_dir = os.path.join(out, os.path.dirname(rel))
                os.makedirs(page_dir, exist_ok=True)
                with open(os.path.join(page_dir, "page.enc"), "wb") as fh:
                    fh.write(encrypt_bytes(html.encode(), key))
                page_base = "/" + os.path.dirname(rel).replace(os.sep, "/")
                page_base = (args.base.rstrip("/") + page_base).rstrip("/") + "/"
                loader = (LOADER.replace("__BASE__", page_base).replace("__ITER__", str(ITERATIONS))
                          .replace("__SALT__", salt_b64))
                open(os.path.join(page_dir, f), "w", encoding="utf-8").write(loader)
                n_pages += 1
            elif not f.lower().endswith(ASSET_EXT):
                # шрифты, css, js и прочее копируем как есть
                dst = os.path.join(out, rel)
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                shutil.copy2(path, dst)
            elif any(s in "/" + rel.replace(os.sep, "/") for s in SKIP_ASSET):
                dst = os.path.join(out, rel)
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                shutil.copy2(path, dst)

    # поисковикам тут делать нечего
    open(os.path.join(out, "robots.txt"), "w").write("User-agent: *\nDisallow: /\n")
    for junk in ("sitemap.xml",):
        p = os.path.join(out, junk)
        if os.path.exists(p):
            os.remove(p)

    total = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(out) for f in fs)
    print(f"зашифровано страниц: {n_pages}, картинок: {n_assets}")
    print(f"каталог для деплоя: {out} ({round(total / 1048576, 1)} МБ)")


if __name__ == "__main__":
    main()
