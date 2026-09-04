import assert from 'node:assert/strict';
import { access, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import sharp from 'sharp';

import { AUTOPLAY_DELAY, createAutoplay } from '../src/scripts/slider-autoplay.js';

function fakeTimers() {
  let nextId = 0;
  const tasks = new Map();

  return {
    clearTimeout(id) {
      tasks.delete(id);
    },
    setTimeout(callback, delay) {
      const id = ++nextId;
      tasks.set(id, { callback, delay });
      return id;
    },
    runNext() {
      const [id, task] = tasks.entries().next().value;
      tasks.delete(id);
      task.callback();
      return task.delay;
    },
    get size() {
      return tasks.size;
    },
  };
}

test('autoplay rotates every six seconds and stops for interaction or a hidden document', () => {
  const timers = fakeTimers();
  let hidden = false;
  let ticks = 0;
  const autoplay = createAutoplay({
    clearTimeoutFn: timers.clearTimeout,
    isDocumentHidden: () => hidden,
    onTick: () => { ticks += 1; },
    setTimeoutFn: timers.setTimeout,
  });

  assert.equal(AUTOPLAY_DELAY, 6000);
  assert.equal(autoplay.start(), true);
  assert.equal(timers.size, 1);
  assert.equal(timers.runNext(), 6000);
  assert.equal(ticks, 1);
  assert.equal(timers.size, 1, 'the next six-second rotation is queued');

  autoplay.stop();
  assert.equal(timers.size, 0, 'a hover, focus, or user gesture can stop rotation');

  assert.equal(autoplay.start(), true);
  hidden = true;
  autoplay.handleVisibilityChange();
  assert.equal(timers.size, 0, 'rotation does not continue in a hidden tab');

  hidden = false;
  assert.equal(autoplay.handleVisibilityChange(), true);
  assert.equal(timers.size, 1, 'rotation resumes only when the tab becomes visible');
});

test('reduced-motion preference prevents autoplay from starting', () => {
  const timers = fakeTimers();
  const autoplay = createAutoplay({
    clearTimeoutFn: timers.clearTimeout,
    onTick: () => assert.fail('reduced motion must not tick'),
    prefersReducedMotion: () => true,
    setTimeoutFn: timers.setTimeout,
  });

  assert.equal(autoplay.start(), false);
  assert.equal(timers.size, 0);
});

test('homepage slider uses locally optimized copies of traceable original Tilda assets', async () => {
  const site = JSON.parse(await readFile(new URL('../src/data/site.json', import.meta.url), 'utf8'));

  assert.equal(site.slider.length, 7);
  for (const slide of site.slider) {
    assert.match(slide.img, /^\/assets\/q\/[a-f0-9]{10}\.webp$/u);
    assert.match(slide.source, /^https:\/\/static\.tildacdn\.com\/tild[\w-]+\/.+\.png$/u);
    assert.doesNotMatch(slide.source, /\/-\//u);

    const file = resolve(process.cwd(), 'public', slide.img.slice(1));
    await access(file);
    const header = await readFile(file, { encoding: null });
    assert.equal(header.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(header.subarray(8, 12).toString('ascii'), 'WEBP');
  }
});

test('homepage keeps the source slider artboard and removes the clone-only pause control', async () => {
  const styles = await readFile(new URL('../src/styles/home.css', import.meta.url), 'utf8');

  assert.match(styles, /\.home-page \.slider\{max-width:1200px;padding-bottom:44px\}/u);
  assert.match(styles, /\.home-page \.slider__pause\{display:none\}/u);
  assert.match(styles, /@media \(max-width:640px\)\{[\s\S]*\.home-page \.slider\{max-width:none;padding-bottom:44px\}/u);
});

test('homepage models the T604 promo and T395 tabs as source records without changing capture-normalized slide order', async () => {
  const [site, home, styles] = await Promise.all([
    readFile(new URL('../src/data/site.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/home.css', import.meta.url), 'utf8'),
  ]);

  // The first two entries are intentionally capture-normalized: after the
  // six-second source cycle, both R27 screenshots show the Mystery banner.
  assert.deepEqual(site.slider.slice(0, 2).map((slide) => slide.img), [
    '/assets/q/c758969e30.webp',
    '/assets/q/53c847a5f5.webp',
  ]);
  assert.match(home, /<section class="promo" data-parity-record="rec958749021">/u);
  assert.match(home, /<div class="tabs" data-parity-record="rec671013302"/u);
  assert.match(home, /<div class="tabs-mobile" data-parity-record="rec671013302">/u);
  assert.match(home, /<option value=\{t\.cat\}>➧ \{t\.t\}\{t\.badge && ' ✪'\}<\/option>/u);

  assert.match(styles, /\.home-page \.promo\{margin-top:0;padding:15px 0 30px\}/u);
  assert.match(styles, /\.home-page \.slider\{max-width:1200px;padding-bottom:44px\}/u);
  assert.match(styles, /\.home-page \.slider__viewport\{width:calc\(100% - 40px\);height:500px;margin-inline:auto;border-radius:6px\}/u);
  assert.match(styles, /\.home-page \.slider__slide img\{object-fit:contain;border-radius:6px\}/u);
  assert.match(styles, /\.home-page \.slider__arrow\{top:250px;width:60px;height:60px;padding:0;border:0;background:rgba\(255,255,255,\.6\);box-shadow:none\}/u);
  assert.match(styles, /\.home-page \.tabs-mobile\{height:51px;border:1px solid #ff6900;border-radius:30px;overflow:hidden\}/u);
  assert.match(styles, /\.home-page \.tabs-mobile select\{height:49px;border-radius:0;background:#ff6900;color:#fff;font-family:'Montserrat',Arial,sans-serif;font-size:16px;text-transform:none;padding:0 40px 0 20px\}/u);
  assert.match(styles, /@media \(max-width:640px\)\{[\s\S]*\.home-page \.promo\{margin-top:0;padding:15px 0 60px\}/u);
  assert.match(styles, /@media \(max-width:640px\)\{[\s\S]*\.home-page \.slider__viewport\{width:100%;height:auto;margin-inline:0;aspect-ratio:1160\/500;border-radius:10px\}/u);
});

test('homepage catalog preserves the live card sequence, grouping, and source addresses', async () => {
  const [site, home, card] = await Promise.all([
    readFile(new URL('../src/data/site.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/QuestCard.astro', import.meta.url), 'utf8'),
  ]);

  assert.deepEqual(site.cards.slice(0, 3).map((item) => item.href), [
    '/kvest_v_realnosti_harry_potter_i_krestrazh',
    '/kvest_v_realnosti_noch_v_museum_ograblenie',
    '/kvest_v_realnosti_dom_prizrakov',
  ]);
  for (const href of ['/ono', '/tekhasskaya-reznya-benzopiloj', '/zvonok']) {
    assert.equal(site.cards.find((item) => item.href === href)?.cat, 'Прятки в лабиринте 200м²');
  }
  const fnaf = site.cards.find((item) => item.href === '/fnaf');
  assert.equal(fnaf?.title, '5 ночей с Фредди');
  assert.equal(fnaf?.cat, 'Квест-шоу на площадке 200м²');
  assert.deepEqual(fnaf?.addrLines, ['Магнитогорская, 1']);
  assert.equal(fnaf?.photo, '/assets/fnaf/card.webp');
  assert.doesNotMatch(home, /liveHomeOrder/u);
  assert.match(home, /address: card\.addr/u);
  assert.match(card, /venue\.addressLines/u);
});

test('homepage uses the exact live hero and DPR-two catalogue derivatives', async () => {
  const [site, index] = await Promise.all([
    readFile(new URL('../src/data/site.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8'),
  ]);
  const optimizedCards = site.cards.filter((card) => card.photo.includes('/assets/optim.tildacdn.com/'));

  assert.equal(site.hero.bg, '/assets/optimized/first-load-2026-08-16/home-hero.webp');
  const hero = resolve(process.cwd(), 'public', site.hero.bg.slice(1));
  const heroOriginal = resolve(process.cwd(), 'migration/parity/source-media/images/home-hero-original.png');
  await access(hero);
  await access(heroOriginal);
  const [heroMetadata, heroStats, originalStats] = await Promise.all([
    sharp(hero).metadata(),
    stat(hero),
    stat(heroOriginal),
  ]);
  assert.equal(heroMetadata.format, 'webp');
  assert.deepEqual([heroMetadata.width, heroMetadata.height], [1479, 891]);
  assert.ok(heroStats.size < originalStats.size / 4, 'hero WebP must remain materially smaller than its source PNG');
  assert.equal(optimizedCards.length, 26);
  for (const card of optimizedCards) {
    assert.match(card.photo, /\/cover\/720x720\/center\/center\/-\/format\/webp\//u);
    await access(resolve(process.cwd(), 'public', card.photo.slice(1)));
  }
  assert.match(index, /src=\{asset\(s\.hero\.bg\)\}/u);
  assert.doesNotMatch(index, /hero_dungeon_760/u);
});

test('homepage card copy keeps the source-specific widths and forced title lines', async () => {
  const [home, card, homeStyles] = await Promise.all([
    readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/QuestCard.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/home.css', import.meta.url), 'utf8'),
  ]);

  assert.match(home, /const homeCardTilda/u);
  assert.match(home, /'\/kvest_v_realnosti_harry_potter_i_krestrazh':\{titleWidth:166,titleWidthMobile:166/u);
  assert.match(home, /'\/kvest_v_realnosti_koralina':\{titleWidth:232,titleWidthMobile:203,titleLines:/u);
  assert.match(card, /const titleLines = card\.titleLines/u);
  assert.match(card, /--qcard-title-width-mobile/u);
  assert.match(card, /--qcard-title-line-height/u);
  assert.match(homeStyles, /--qcard-title-line-height:22px/u);
  assert.match(homeStyles, /--qcard-title-line-height:19px/u);
});

test('homepage restores the measured 390px party-statistics artboard', async () => {
  const [site, home, styles] = await Promise.all([
    readFile(new URL('../src/data/site.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/home.css', import.meta.url), 'utf8'),
  ]);

  assert.equal(site.stats.buttonHref, '/kids');
  assert.equal(site.stats.buttonImg, '/assets/static.tildacdn.com/tild3861-3135-4930-b932-383731343136/5.webp');
  await access(resolve(process.cwd(), 'public', site.stats.buttonImg.slice(1)));
  assert.match(home, /class="party__btnimg"/u);
  assert.match(home, /href=\{link\(s\.stats\.buttonHref\)\}/u);
  assert.match(styles, /\.home-page \.party__card\{width:360px;max-width:100%;height:910px/u);
  assert.match(styles, /\.home-page \.party__stats\{position:absolute;top:455px/u);
  assert.match(styles, /\.home-page \.pstat:nth-child\(5\)\{left:91px;top:284px/u);
});
