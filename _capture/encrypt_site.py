#!/usr/bin/env python3
"""Шифрует собранный сайт паролем: на хостинг уезжают только зашифрованные данные.

Запуск:  python3 _capture/encrypt_site.py --password-stdin < .preview-password [--src dist] [--out dist-enc]

Как это работает:
  * each `<path>/index.html` is encrypted and embedded in its password loader, so opening a page
    needs one request;
  * each image is encrypted to `<filename>.enc`, while originals never reach the host;
  * HTML src/srcset references become `data-enc` and the loader restores decrypted blob URLs.

Cipher: AES-256-GCM with a PBKDF2-HMAC-SHA256 key (250,000 iterations). The salt is shared by a
build and lives in the loader; each file has its own nonce. The ready AES key (never the password)
is kept in a path-scoped Secure cookie for seven days so a preview visitor does not need to re-enter
the password on every page. This is demo-preview convenience, not stronger cryptographic access
control.
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
SKIP_ASSET = (
    "/fonts.gstatic.com/", "_GPT_light",        # Fonts and the background pattern are required before unlock.
    # Browser icons must be available on the password screen.
    "/favicon.ico", "/apple-touch-icon", "/mstile-",
    "/tild6335-3261-4736-b433-653534356331/",
    "/tild6235-3534-4566-a634-396162653363/",
    "/tild3834-6565-4038-a561-623064353630/",
)


def encrypt_bytes(data, key):
    """Соль общая на весь сайт (лежит в лоадере), у каждого файла — свой nonce."""
    nonce = secrets.token_bytes(12)
    blob = AESGCM(key).encrypt(nonce, data, None)
    return base64.b64encode(nonce + blob)


LOADER = """<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Доступ по паролю</title>
<link rel="icon" href="__SITE__favicon.ico" sizes="16x16 24x24 32x32 64x64" type="image/x-icon">
<link rel="apple-touch-icon" href="__SITE__apple-touch-icon.png">
<meta name="theme-color" content="#ff6b00">
<style>
 :root{color-scheme:light}
 body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
      background:#eee;font-family:Montserrat,-apple-system,Segoe UI,Roboto,sans-serif;color:#333}
 /* Keep the form hidden until saved access has been checked to prevent a flash during navigation. */
 .box{display:none;background:#fff;border-radius:20px;padding:38px 34px;max-width:380px;width:calc(100% - 32px);
      box-shadow:0 12px 40px rgba(0,0,0,.08);text-align:center}
 html.ask .box{display:block}
 h1{font-size:20px;margin:0 0 8px}
 p{margin:0 0 22px;font-size:14px;color:#777;line-height:1.5}
 input{width:100%;height:48px;border:1px solid #e0e0e0;border-radius:10px;padding:0 14px;
       font-size:16px;font-family:inherit;box-sizing:border-box}
 button{width:100%;height:48px;margin-top:12px;border:0;border-radius:10px;background:#ff6b00;
        color:#fff;font-size:16px;font-weight:600;font-family:inherit;cursor:pointer}
 button:disabled{opacity:.6;cursor:default}
 .err{margin-top:14px;color:#d33;font-size:14px;min-height:20px}
 .hint{margin:14px 0 0;font-size:12px;color:#999}
</style></head>
<body>
<div class="box">
  <h1>Чё за Квест — превью сайта</h1>
  <p>Страница закрыта паролем. Содержимое зашифровано, без пароля его нельзя прочитать.</p>
  <form id="f"><input id="p" type="password" placeholder="Пароль" autocomplete="current-password">
  <button id="b" type="submit">Открыть</button></form>
  <div class="err" id="e"></div>
  <p class="hint">Пароль запомнится на неделю — на других страницах его спрашивать не будем.</p>
</div>
<script id="d" type="text/plain">__CIPHER__</script>
<script>
const BASE = "__BASE__";
const SALT_B64 = "__SALT__";
const ITER = __ITER__;
const STORE = "czk-preview-key";            // {salt, k, exp}
const STORE_PATH = "__STORE_PATH__";
const OLD_SESSION = "czk-preview-pass";     // ключ прошлой версии лоадера
const TTL = 7 * 24 * 60 * 60 * 1000;

const SALT = b64(SALT_B64);
let KEYP = null;

function b64(str) {
  const bin = atob(str.trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function tob64(buf) {
  const a = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s);
}

function readCookie(name) {
  try {
    const prefix = `${name}=`;
    const found = document.cookie.split("; ").find((item) => item.startsWith(prefix));
    return found ? decodeURIComponent(found.slice(prefix.length)) : null;
  } catch (e) { return null; }
}

function clearLegacyVault() {
  try { localStorage.removeItem(STORE); } catch (e) {}
}

function readVault() {
  const serialized = readCookie(STORE);
  if (serialized !== null) {
    try {
      const vault = JSON.parse(serialized);
      if (vault && vault.exp && vault.exp > Date.now()) return vault;
      forget();
      return null;
    } catch (e) {
      forget();
      return null;
    }
  }
  // Remove the former origin-wide localStorage record before proceeding. It contained the
  // plaintext password in an older loader and must never be used for automatic unlocks again.
  clearLegacyVault();
  try {
    const pass = sessionStorage.getItem(OLD_SESSION);
    if (pass) return { p: pass };
  } catch (e) {}
  return null;
}

// Access remains valid for a rolling week while the preview is being reviewed.
function writeVault(vault) {
  try {
    const record = encodeURIComponent(JSON.stringify({
      salt: vault.salt,
      k: vault.k,
      exp: Date.now() + TTL,
    }));
    document.cookie = `${STORE}=${record}; Max-Age=${Math.floor(TTL / 1000)}; Path=${STORE_PATH}; SameSite=Strict; Secure`;
    // Retire the one-time session migration only after persistent storage succeeds.
    try { sessionStorage.removeItem(OLD_SESSION); } catch (ignore) {}
  } catch (e) {}
}

function forget() {
  try { document.cookie = `${STORE}=; Max-Age=0; Path=${STORE_PATH}; SameSite=Strict; Secure`; } catch (e) {}
  clearLegacyVault();
  try { sessionStorage.removeItem(OLD_SESSION); } catch (e) {}
}

async function keyFromPass(pass) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pass),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: SALT, iterations: ITER, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    true,
    ["decrypt"],
  );
  return new Uint8Array(await crypto.subtle.exportKey("raw", key));
}

function importRaw(raw) {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
}

async function decryptText(txt, key) {
  const raw = b64(txt);
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: raw.slice(0, 12) },
    key,
    raw.slice(12),
  ));
}

async function decryptUrl(url, keyP) {
  const [txt, key] = await Promise.all([fetch(url).then((r) => r.text()), keyP]);
  return decryptText(txt, key);
}

function pageCipher() {
  const el = document.getElementById("d");
  const cipher = el ? el.textContent.trim() : "";
  if (cipher.length > 32) return Promise.resolve(cipher);
  return fetch(BASE + "page.enc").then((r) => r.text());
}

// Картинки расшифровываются лениво: сразу — только те, что близко к экрану,
// остальные по мере скролла. Иначе разблокировка ждёт весь набор (на главной их сотня).
function swapAssets(keyP) {
  const cache = new Map();

  const load = async (el) => {
    const src = el.getAttribute("data-enc");
    if (!src || el.dataset.encDone) return;
    el.dataset.encDone = "1";
    try {
      if (!cache.has(src)) {
        cache.set(src, decryptUrl(src, keyP).then((bytes) => {
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

function documentReady() {
  if (document.readyState !== "loading") return Promise.resolve();
  return new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
}

async function paint(keyP, remember) {
  const [cipher, key] = await Promise.all([pageCipher(), keyP]);
  const html = new TextDecoder().decode(await decryptText(cipher, key));
  if (remember) writeVault(remember);
  KEYP = Promise.resolve(key);
  // A cached key resolves before the parser reaches the end of this loader. Replacing the document
  // before DOMContentLoaded would be discarded by the active parser, leaving a blank password screen.
  await documentReady();
  document.open(); document.write(html); document.close();
  // The document was replaced, so the deferred asset loader must be attached again.
  const run = () => swapAssets(KEYP);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
}

function ask() {
  document.documentElement.className = "ask";
  const input = document.getElementById("p");
  const button = document.getElementById("b");
  const error = document.getElementById("e");
  input.focus();
  document.getElementById("f").addEventListener("submit", async (event) => {
    event.preventDefault();
    button.disabled = true;
    error.textContent = "";
    const pass = input.value;
    try {
      const raw = await keyFromPass(pass);
      await paint(importRaw(raw), { salt: SALT_B64, k: tob64(raw) });
    } catch (err) {
      forget();
      error.textContent = "Неверный пароль";
      button.disabled = false;
    }
  });
}

(async () => {
  if (/(?:[?&]logout)(?:=|&|$)/.test(location.search)) forget();
  const vault = readVault();
  if (vault) {
    try {
      // Only a legacy same-tab session can still derive a key from a password. A newly encrypted
      // deployment intentionally asks once more instead of persisting that password anywhere.
      const raw = (vault.k && vault.salt === SALT_B64) ? b64(vault.k) : await keyFromPass(vault.p);
      await paint(importRaw(raw), { salt: SALT_B64, k: tob64(raw) });
      return;
    } catch (e) {
      forget();
    }
  }
  ask();
})();
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
    # Keep icon <link> tags intact while removing responsive image sources that would point at
    # encrypted files. Image preloads must disappear because they run before the loader unlocks.
    saved_links = []

    def hide_link(m):
        tag = m.group(0)
        if re.search(r'rel="preload"', tag, re.I) and re.search(r'as="image"', tag, re.I):
            return ""
        saved_links.append(tag)
        return f"\x00LINK{len(saved_links) - 1}\x00"

    html = re.sub(r"<link\b[^>]*>", hide_link, html, flags=re.I)
    html = re.sub(r'\ssrcset="[^"]*"', "", html)
    html = re.sub(r'\ssizes="[^"]*"', "", html)
    html = re.sub(r"\x00LINK(\d+)\x00", lambda m: saved_links[int(m.group(1))], html)
    # фоновые картинки в инлайн-стилях
    html = re.sub(r'style="background-image:url\(([^)]+)\)"',
                  lambda m: (f'style="" data-enc="{assets_map[m.group(1)]}"'
                             if m.group(1) in assets_map else m.group(0)), html)
    return html


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--password-stdin", action="store_true",
                    help="read the preview password from stdin instead of exposing it in process arguments")
    ap.add_argument("--src", default="dist")
    ap.add_argument("--out", default="dist-enc")
    ap.add_argument("--base", default="/", help="базовый путь сайта на хостинге")
    args = ap.parse_args()

    if not args.password_stdin:
        ap.error("use --password-stdin and pass the password through stdin")
    password = sys.stdin.readline().rstrip("\r\n")
    if not password:
        ap.error("preview password from stdin is empty")

    site_salt = secrets.token_bytes(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), site_salt, ITERATIONS, 32)
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
                # Embed the page cipher in the loader to avoid a second page.enc request.
                cipher = encrypt_bytes(html.encode(), key).decode("ascii")
                page_base = "/" + os.path.dirname(rel).replace(os.sep, "/")
                page_base = (args.base.rstrip("/") + page_base).rstrip("/") + "/"
                site_base = args.base if args.base.endswith("/") else args.base + "/"
                loader = (LOADER.replace("__BASE__", page_base)
                          .replace("__SITE__", site_base)
                          .replace("__STORE_PATH__", site_base)
                          .replace("__ITER__", str(ITERATIONS))
                          .replace("__SALT__", salt_b64)
                          .replace("__CIPHER__", cipher))
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
