import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
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

test('slider never expands the 1010px-wide original banner artwork', async () => {
  const styles = await readFile(new URL('../src/styles/page.css', import.meta.url), 'utf8');

  assert.match(styles, /\.slider\{position:relative;max-width:1010px;margin-inline:auto\}/u);
  assert.match(styles, /\.slider__pause\{[^}]*width:44px;height:44px/u);
});

test('homepage loads responsive mobile hero candidates and does not prefetch a hidden slide on startup', async () => {
  const [mobileHero, retinaMobileHero, desktopHero, index, main] = await Promise.all([
    sharp(resolve(process.cwd(), 'public/assets/_static/hero_dungeon_760.webp')).metadata(),
    sharp(resolve(process.cwd(), 'public/assets/_static/hero_dungeon_900.webp')).metadata(),
    sharp(resolve(process.cwd(), 'public/assets/_static/hero_dungeon_1200.webp')).metadata(),
    readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/scripts/main.js', import.meta.url), 'utf8'),
  ]);

  assert.equal(mobileHero.width, 760);
  assert.equal(retinaMobileHero.width, 900);
  assert.ok(mobileHero.width < desktopHero.width);
  assert.ok(retinaMobileHero.width < desktopHero.width);
  assert.match(index, /hero_dungeon_760\.webp.*760w, .*hero_dungeon_900\.webp.*900w/u);
  assert.equal((main.match(/loadSlide\(\(i \+ 1\) % slides\.length\);/gu) || []).length, 1,
    'only a user-visible slide transition may prefetch the following artwork');
});
