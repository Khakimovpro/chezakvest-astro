import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { chromium } from 'playwright';
import sharp from 'sharp';

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
  await run('flock', ['/tmp/chezakvest-sborka.lock', 'flock', '/tmp/chezakvest-astro-test-build.lock', 'node_modules/.bin/astro', 'build', '--outDir', output], { cwd: root });
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
    await page.evaluate(() => scrollTo(0, document.querySelector('.product-hero').offsetHeight + 100));
    await page.locator('[data-product-mobile-cta]').waitFor({ state: 'visible' });
    const checks = await page.evaluate(() => {
      const selectors = [
        '.product-mobile-cta a', '.product-hero__actions a', '.product-hero__wa',
        '.product-final__links a', '.product-quiz .btn-orange',
      ];
      const buttons = [...new Set(selectors.flatMap((selector) => [...document.querySelectorAll(selector)]))].map((element) => {
        const style = getComputedStyle(element);
        return { text: element.textContent.trim(), color: style.color, background: style.backgroundColor, onInk: element.classList.contains('product-button--on-ink'), href: element.getAttribute('href') };
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
      if (button.onInk) {
        const target = page.locator('.product-hero__actions a').filter({hasText:button.text});
        const capture = await target.screenshot({animations:'disabled',style:'.product-button--on-ink { color: transparent !important; } .product-button--on-ink svg { visibility: hidden !important; }'});
        const { data, info } = await sharp(capture).removeAlpha().raw().toBuffer({resolveWithObject:true});
        for(let x=24;x<info.width-24;x++) {
          const pixel=(Math.floor(info.height/2)*info.width+x)*info.channels;
          assert.ok(contrast(rgb(button.color),[...data.subarray(pixel,pixel+3)])>=4.5, `${slug}: ${button.text} has AA contrast against its rendered photo`);
        }
      } else assert.ok(contrast(rgb(button.color), rgb(button.background)) >= 4.5, `${slug}: ${button.text} has AA contrast`);
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
      assert.equal(layout.points, slug === 'kids' ? 4 : 3, `${slug}: video has the approved sourced points`);
      for (const video of layout.videos) {
        assert.ok(video.width <= (width === 390 ? 300 : 380) + 1, `${slug}: portrait video is bounded`);
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
          if (width === 390) assert.ok(Math.abs(bounds.width / (bounds.gridWidth - 8) - .86) < .01, 'package leaves a visible preview of the next card');
          assert.equal(await card.locator('a[href="#prazdnik"]').isVisible(), true);
        }
      }
    }
    await page.close();
  }
});

test('product motion preserves layout, reduced-motion access and content without JavaScript', { timeout: 180_000 }, async (t) => {
  const base = await buildAndServe(t);
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(() => browser.close());
  for (const slug of ['igra_v_kalmara', 'kids']) for (const width of [390,1440]) {
    const page = await browser.newPage({viewport:{width,height:900}});
    await page.route('https://chezakvest.ru/calendar.php?quest=87', route => route.fulfill({body:mockSchedule,headers:{'access-control-allow-origin':'*'}}));
    await page.goto(`${base}/${slug}/`, {waitUntil:'networkidle'});
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => { window.productCLS = 0; new PerformanceObserver(list => list.getEntries().forEach(entry => { if (!entry.hadRecentInput) window.productCLS += entry.value; })).observe({type:'layout-shift'}); });
    assert.equal(await page.locator('.product-hero .is-pending').count(), 0);
    const reveal = await page.locator('.product-sh.is-pending').first().elementHandle();
    assert.ok(reveal, 'below-fold headers are prepared for reveal');
    await reveal.scrollIntoViewIfNeeded();
    await page.waitForTimeout(80);
    assert.equal(await reveal.evaluate(el => el.classList.contains('is-revealed')), true);
    await page.waitForTimeout(1000);
    assert.equal(await reveal.evaluate(el => el.classList.contains('is-pending') || el.classList.contains('is-revealed')), false);
    for(let y=0; y<await page.evaluate(()=>document.documentElement.scrollHeight); y+=400) {
      await page.evaluate(y=>scrollTo(0,y),y); await page.waitForTimeout(30);
    }
    await page.waitForTimeout(1000);
    assert.equal(await page.evaluate(()=>window.productCLS), 0, `${slug} ${width}: reveal CLS`);
    await page.close();
    for (const options of [{reducedMotion:'reduce'}, {javaScriptEnabled:false}]) {
      const access = await browser.newPage({viewport:{width,height:900},...options});
      await access.goto(`${base}/${slug}/`,{waitUntil:'load'});
      assert.equal(await access.locator('.is-pending').count(), 0);
      const states=await access.locator('[data-product-reveal]').evaluateAll(elements=>elements.map(el=>({opacity:getComputedStyle(el).opacity,transform:getComputedStyle(el).transform})));
      assert.ok(states.length > 10 && states.every(state=>state.opacity==='1'&&state.transform==='none'));
      if(options.javaScriptEnabled === false) {
        const extra = access.locator('.product-photo-grid__item--hidden, .product-review--hidden');
        if(slug === 'kids') assert.ok(await extra.count() > 0, 'exercise content normally revealed by a button');
        assert.ok((await extra.evaluateAll(elements=>elements.map(el=>el.checkVisibility()))).every(Boolean), 'additional photos and reviews remain available without JavaScript');
      }
      if(options.reducedMotion) assert.equal(await access.locator('.product-hero__image').evaluate(el=>getComputedStyle(el).animationName),'none');
      await access.close();
    }
  }
});


test('product video controls activate on click and another player pauses the first', { timeout: 90_000 }, async (t) => {
  const base = await buildAndServe(t);
  const browser = await chromium.launch({args:['--no-sandbox']});
  t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:390,height:900},reducedMotion:'reduce'});
  // The browser media decoder is outside this UI boundary; keep the real click/attach handlers.
  await page.addInitScript(()=>{
    const playing = new WeakSet();
    HTMLMediaElement.prototype.canPlayType=()=> 'probably';
    Object.defineProperty(HTMLMediaElement.prototype,'paused',{get(){return !playing.has(this);}});
    HTMLMediaElement.prototype.play=function(){playing.add(this);this.dispatchEvent(new Event('play'));return Promise.resolve();};
    HTMLMediaElement.prototype.pause=function(){playing.delete(this);this.dataset.pauseCalls=String(Number(this.dataset.pauseCalls||0)+1);};
  });
  await page.goto(`${base}/kids/`,{waitUntil:'load'});
  const players=page.locator('[data-hls-video]');
  assert.equal(await players.count(),2);
  assert.deepEqual(await players.locator('video').evaluateAll(videos=>videos.map(v=>v.controls)),[false,false]);
  await players.nth(0).locator('button').click();
  assert.equal(await players.nth(0).locator('video').evaluate(v=>v.controls),true);
  await players.nth(1).locator('button').click();
  assert.equal(await players.nth(1).locator('video').evaluate(v=>v.controls),true);
  assert.equal(await players.nth(0).locator('video').getAttribute('data-pause-calls'),'1');
});

test('mobile actions leave room for the local messenger and a late-loading support widget', { timeout: 90_000 }, async (t) => {
  const base = await buildAndServe(t);
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(() => browser.close());
  for (const slug of ['igra_v_kalmara', 'kids']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
    await page.route('https://widget.yourgood.app/**', route => route.abort());
    await page.goto(`${base}/${slug}/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => scrollTo(0, document.querySelector('.product-hero').offsetHeight + 100));
    await page.locator('.product-mobile-cta--visible').waitFor();
    const actionBounds = await page.locator('.product-mobile-cta .product-button').evaluateAll(buttons => buttons.map(button => {
      const r = button.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, contentWidth: button.scrollWidth };
    }));
    assert.ok(actionBounds.every(r => r.left >= 11.9 && r.right <= 378.1 && r.contentWidth <= r.width + 1), `${slug}: both mobile actions fit inside the 12px gutters`);
    const overlap = async (selector) => page.evaluate(selector => {
      const a = document.querySelector('.product-mobile-cta').getBoundingClientRect();
      const element = selector === 'support' ? document.querySelector('pf-widget').shadowRoot.querySelector('section') : document.querySelector(selector);
      const b = element.getBoundingClientRect();
      return { width: b.width, height: b.height, area: Math.max(0, Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)) };
    }, selector);
    assert.deepEqual(await overlap('.mfab'), { width: 56, height: 56, area: 0 });
    // Reproduce the documented vendor shadow boundary after the bar is already visible.
    await page.evaluate(() => {
      const widget = document.createElement('pf-widget');
      widget.attachShadow({ mode: 'open' }).innerHTML = '<section id="PWPreviewWidgetButtonWrapper" style="position:fixed;width:64px;height:64px;right:32px;bottom:24px"></section>';
      document.body.append(widget);
      document.body.classList.add('has-support-chat');
    });
    await page.waitForFunction(() => document.querySelector('pf-widget').shadowRoot.querySelector('[data-product-chat-position]'));
    assert.deepEqual(await overlap('support'), { width: 64, height: 64, area: 0 });
    await page.evaluate(() => scrollTo(0,0));
    await page.locator('.product-mobile-cta--visible').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('pf-widget').shadowRoot.querySelector('section')).translate), '0px');
    await page.close();
  }
});
