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

const mockSchedule = `<div class="quest_calendar">${Array.from({ length: 32 }, (_, index) => `
  <div class="quest_line${index >= 7 ? ' show_more hidden' : ''}">
    <div class="col-xs-2_quest">${index + 1} сентября</div>
    <div class="col-xs-10_quest"><span class="label_quest click_load_item" data-id="${index}" onclick="this.dataset.opened = Number(this.dataset.opened || 0) + 1">12:00</span><span class="label_quest close_item">13:00</span></div>
  </div>`).join('')}
  <div class="show_more"><button class="show_more_btn" type="button" onclick="$('.show_more').toggleClass('hidden');">Показать ещё</button></div>
</div>`;

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
  await assert.doesNotReject(success.locator('[data-source-schedule] .label_quest').first().waitFor());
  const visibleDays = () => success.locator('[data-source-schedule] .quest_line').evaluateAll((items) => items
    .filter((item) => getComputedStyle(item).display !== 'none').length);
  assert.equal(await visibleDays(), 7);
  const available = success.getByRole('button', { name: '12:00', exact: true }).first();
  await available.focus();
  await success.keyboard.press('Enter');
  assert.equal(await available.getAttribute('data-opened'), '1');
  await success.keyboard.press('Space');
  assert.equal(await available.getAttribute('data-opened'), '2');
  const unavailable = success.getByRole('button', { name: '13:00', exact: true }).first();
  assert.equal(await unavailable.getAttribute('aria-disabled'), 'true');
  assert.equal(await unavailable.getAttribute('tabindex'), '-1');
  const bounds = await available.boundingBox();
  assert.ok(bounds.width >= 44 && bounds.height >= 44);

  await success.locator('[data-source-schedule] .show_more_btn').click();
  assert.ok(await visibleDays() > 7);
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
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      const layout = await page.evaluate(() => {
        const gap = (first, second) => second.getBoundingClientRect().top - first.getBoundingClientRect().bottom;
        const story = document.querySelector('.product-story .product-prose');
        const heading = story?.querySelector('h2');
        const paragraphs = story?.querySelectorAll('p');
        const callback = document.querySelector('.cbform__title');
        return {
          videos: [...document.querySelectorAll('.product-video .hls-video')].map((video) => {
            const box = video.getBoundingClientRect();
            const [w, h] = getComputedStyle(video).aspectRatio.split('/').map(Number);
            return { width: box.width, height: box.height, ratio: w / h };
          }),
          points: document.querySelectorAll('.product-video__points > li').length,
          headingGap: heading && gap(heading, paragraphs[0]),
          paragraphGap: paragraphs?.length > 1 && gap(paragraphs[0], paragraphs[1]),
          callbackColor: callback && getComputedStyle(callback).color,
        };
      });
      assert.equal(layout.points, 3, `${slug}: video has three sourced points`);
      for (const video of layout.videos) {
        assert.ok(video.width <= (width === 390 ? 320 : 360) + 1, `${slug}: portrait video is bounded`);
        assert.ok(Math.abs(video.width / video.height - video.ratio) < 0.01, `${slug}: media keeps source ratio`);
      }
      if (Number.isFinite(layout.headingGap)) {
        assert.ok(layout.headingGap >= 16, 'story heading remains separated from copy after the CSS reset');
        assert.ok(layout.paragraphGap >= 16, 'story paragraphs remain distinct');
      }
      if (layout.callbackColor) assert.ok(contrast(rgb(layout.callbackColor), [233, 233, 233]) >= 4.5, 'callback heading is readable on its light surface');
      for (const field of await page.locator('.pform__field--name, .pform__field--phone').all()) {
        const input = field.locator('input');
        await input.fill(await input.getAttribute('name') === 'phone' ? '+7 (900) 000-00-00' : 'Проверка');
        for (const focused of [true, false]) {
          if (focused) await input.focus();
          else await input.blur();
          const separated = await field.evaluate((el) => el.querySelector('label').getBoundingClientRect().bottom <= el.querySelector('input').getBoundingClientRect().top);
          assert.ok(separated, `${slug} ${width}: field label stays above the entered value with and without focus`);
        }
      }
      for (const tab of await page.locator('[data-product-package-tab]').all()) {
        await tab.click();
        const grid = page.locator('[data-product-package-panel]:visible .product-packages__grid');
        for (const card of await grid.locator('article').all()) {
          await card.scrollIntoViewIfNeeded();
          const bounds = await card.evaluate((el) => {
            const box = el.getBoundingClientRect();
            const grid = el.parentElement.getBoundingClientRect();
            return { width: box.width, gridWidth: grid.width, inside: box.left >= grid.left - 1 && box.right <= grid.right + 1, overflow: el.scrollWidth > el.clientWidth + 1 };
          });
          assert.ok(bounds.gridWidth <= width - 40, 'package rail fits its container');
          assert.ok(bounds.inside && !bounds.overflow, 'every package can be scrolled fully into view without clipped content');
          if (width === 390) assert.ok(Math.abs(bounds.width - 314) < 1, 'package leaves a visible preview of the next card');
          assert.equal(await card.locator('.btn-orange').isVisible(), true);
        }
      }
    }
    await page.close();
  }
});
