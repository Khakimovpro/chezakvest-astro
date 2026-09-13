import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { chromium } from 'playwright';

const run = promisify(execFile);
const root = new URL('../', import.meta.url).pathname;
const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

async function buildAndServe(t) {
  const output = await mkdtemp(join(tmpdir(), 'cheza-product-browser-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  await run('flock', ['/tmp/chezakvest-astro-test-build.lock', 'node_modules/.bin/astro', 'build', '--outDir', output], { cwd: root });
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://site.test').pathname);
    const relative = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const file = normalize(join(output, relative));
    if (!file.startsWith(`${output}/`)) return response.writeHead(403).end();
    try {
      if (!(await stat(file)).isFile()) throw new Error('not a file');
      response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

const mockSchedule = '<div class="resq"><button class="label_quest" type="button">12:00</button></div>';

test('product booking keeps a visible path for schedule success, failure, and an eight-second timeout', { timeout: 120_000 }, async (t) => {
  const base = await buildAndServe(t);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  t.after(() => browser.close());

  const success = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await success.route('https://chezakvest.ru/calendar.php?quest=87', (route) => route.fulfill({
    body: mockSchedule,
    headers: { 'access-control-allow-origin': '*', 'content-type': 'text/html; charset=utf-8' },
  }));
  await success.goto(`${base}/igra_v_kalmara/`, { waitUntil: 'domcontentloaded' });
  await success.locator('[data-source-schedule]').scrollIntoViewIfNeeded();
  await assert.doesNotReject(success.locator('[data-source-schedule] .label_quest').waitFor());
  await assert.equal(await success.locator('[data-product-booking-fallback]').isHidden(), true);
  await success.close();

  const delayed = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await delayed.route('https://chezakvest.ru/calendar.php?quest=87', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    await route.fulfill({ body: mockSchedule, headers: { 'access-control-allow-origin': '*' } });
  });
  await delayed.goto(`${base}/igra_v_kalmara/`, { waitUntil: 'domcontentloaded' });
  await delayed.locator('[data-source-schedule]').scrollIntoViewIfNeeded();
  await delayed.locator('[data-product-booking-fallback]').waitFor({ state: 'visible', timeout: 10_000 });
  await delayed.close();

  const aborted = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await aborted.route('https://chezakvest.ru/calendar.php?quest=87', (route) => route.abort());
  await aborted.goto(`${base}/igra_v_kalmara/`, { waitUntil: 'domcontentloaded' });
  await aborted.locator('[data-source-schedule]').scrollIntoViewIfNeeded();
  await aborted.locator('[data-product-booking-fallback]').waitFor({ state: 'visible' });
  await aborted.close();
});

function contrast([red, green, blue], [backRed, backGreen, backBlue]) {
  const luminance = ([r, g, b]) => [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const [first, second] = [luminance([red, green, blue]), luminance([backRed, backGreen, backBlue])].sort((a, b) => b - a);
  return (first + 0.05) / (second + 0.05);
}

const rgb = (value) => value.match(/\d+/gu).map(Number).slice(0, 3);

test('product pilots keep readable CTAs, complete hero images, distinct kids hero text, and loaded visible photos', { timeout: 120_000 }, async (t) => {
  const base = await buildAndServe(t);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  t.after(() => browser.close());

  for (const slug of ['igra_v_kalmara', 'kids']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.route('https://chezakvest.ru/calendar.php?quest=87', (route) => route.abort());
    await page.goto(`${base}/${slug}/`, { waitUntil: 'domcontentloaded' });
    const images = page.locator('main img');
    const visibleIndexes = await images.evaluateAll((items) => items
      .map((image, index) => (image.getClientRects().length > 0 ? index : -1)).filter((index) => index >= 0));
    for (const index of visibleIndexes) {
      await images.nth(index).scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
    }
    await page.evaluate(() => scrollTo(0, 500));
    await page.locator('[data-product-mobile-cta]').waitFor({ state: 'visible' });
    const checks = await page.evaluate(() => {
      const selectors = [
        '.product-mobile-cta a', '.product-hero__actions a', '.product-hero__wa',
        '.product-final__links a', '.product-quiz .btn-orange',
      ];
      const buttons = selectors.flatMap((selector) => [...document.querySelectorAll(selector)]).map((element) => {
        const style = getComputedStyle(element);
        return { text: element.textContent.trim(), color: style.color, background: style.backgroundColor };
      });
      const images = [...document.querySelectorAll('main img')]
        .filter((image) => image.getClientRects().length > 0)
        .map((image) => ({ src: image.currentSrc, width: image.naturalWidth }));
      const hero = document.querySelector('.product-hero');
      const heroImage = document.querySelector('.product-hero__image');
      const kicker = document.querySelector('.product-hero--holiday .product-kicker')?.getBoundingClientRect();
      const h1 = document.querySelector('.product-hero--holiday h1')?.getBoundingClientRect();
      return {
        buttons,
        images,
        hero: hero && heroImage ? { height: hero.getBoundingClientRect().height, imageHeight: heroImage.getBoundingClientRect().height } : null,
        overlaps: kicker && h1 ? !(kicker.bottom <= h1.top || h1.bottom <= kicker.top) : false,
      };
    });
    assert.ok(checks.buttons.length > 0, `${slug}: CTA controls exist`);
    for (const button of checks.buttons) {
      assert.ok(contrast(rgb(button.color), rgb(button.background)) >= 4.5, `${slug}: ${button.text} has AA contrast`);
    }
    assert.ok(checks.images.length > 0 && checks.images.every((image) => image.width > 0), `${slug}: visible photos loaded (${JSON.stringify(checks.images.filter((image) => image.width === 0))})`);
    assert.equal(checks.hero?.height, checks.hero?.imageHeight, `${slug}: hero image covers the whole hero`);
    assert.equal(checks.overlaps, false, `${slug}: holiday kicker and H1 do not overlap`);
    await page.close();
  }
});
