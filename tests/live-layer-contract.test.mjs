// Регресс-контракт живого слоя.
//
// 15.08.2026 перевод страниц на снимки Tilda молча выключил всё, что жило в нативных
// шаблонах: кнопки мессенджеров, карту площадок, отзывы, hover карточек. Ни один тест
// этого не поймал, потому что все они сравнивают клон с ОРИГИНАЛОМ, а не с прошлой
// версией клона. Здесь зафиксировано обратное: что бы ни менялось в переносе, эти
// элементы обязаны остаться на страницах.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { parse } from 'parse5';

import { bindLocalVideo } from '../src/scripts/source-widgets.js';
import {
  buildSbsKeyframes,
  cycleSlideIndex,
  isArchivedAutoplayTimeout,
  parseSbsOptions,
  sbsFramesForViewport,
  sbsTriggerOffset,
} from '../src/scripts/source-live-layer.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const snapshotDir = new URL('../src/source-snapshots/', import.meta.url);

const snapshots = async () => {
  const files = (await readdir(snapshotDir)).filter((name) => name.endsWith('.html'));
  return Promise.all(files.map(async (name) => ({
    name,
    // стили инжектятся во все снимки, поэтому разметку смотрим без них
    html: (await readFile(new URL(name, snapshotDir), 'utf8')).replace(/<style[^>]*>[\s\S]*?<\/style>/gu, ''),
  })));
};

const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value;
const hasClass = (node, className) => attr(node, 'class')?.split(/\s+/u).includes(className);
const descendants = (node, predicate, found = []) => {
  if (predicate(node)) found.push(node);
  for (const child of node.childNodes ?? []) descendants(child, predicate, found);
  return found;
};

test('страницы со снимками получают кнопку мессенджеров и локальные надстройки', async () => {
  const component = await read('src/components/SourceSnapshotBody.astro');
  assert.match(component, /<MessengerFab \/>/u, 'плавающие кнопки мессенджеров');
  assert.match(component, /initCardHover\(\)/u, 'наведение на карточку квеста');
  assert.match(component, /initSourceWidgets\(\)/u, 'локальные виджеты в снимке');
  assert.match(component, /initSourceLiveLayer/u, 'живой слой каруселей и SBS-анимаций');
});

test('Zero Block получает доступные контролы галереи и восстановленные семейства шрифтов', async () => {
  const generator = await read('_capture/build_source_snapshots.py');
  assert.match(generator, /data-field-inputfontfamily-value/u);
  assert.match(generator, /t-checkbox__control", "t-checkbox__control_flex"\], "style": text_style/u, 'Zero consent is styled from the same authored family');
  assert.match(generator, /Следующий слайд/u);
  assert.match(generator, /width:40px!important/u);
  const brawl = await readFile(new URL('brawl_stars.html', snapshotDir), 'utf8');
  const brawlForms = brawl.match(/<form\b[^>]*data-local-source-form[^>]*>[\s\S]*?<\/form>/gu) ?? [];
  const zeroForm = brawlForms.find((form) => form.includes('t-input-inline-styles'));
  assert.ok(zeroForm, 'Brawl retains its materialized Zero form');
  assert.match(zeroForm, /t-input-inline-styles[^>]*font-family:Montserrat/u, 'Brawl field control keeps its authored family');
  assert.match(await read('src/styles/fonts.css'), /font-family:'Nunito'/u, 'Brawl can load its authored Nunito font face');
  const snapshotPages = await snapshots();
  const galleryPages = snapshotPages.filter((page) => /data-elem-type="gallery"/u.test(page.html));
  assert.ok(galleryPages.length > 0, 'Zero galleries survive Tilda runtime sanitizing');
  for (const page of galleryPages) {
    const document = parse(page.html);
    const zeroGalleries = descendants(document, (node) => attr(node, 'data-elem-type') === 'gallery');
    for (const zeroGallery of zeroGalleries) {
      const sliders = descendants(zeroGallery, (node) => hasClass(node, 't-slds'));
      for (const slider of sliders) {
        const slides = descendants(slider, (node) => hasClass(node, 't-slds__item'));
        if (slides.length < 2) continue;
        const arrows = descendants(slider, (node) => node.nodeName === 'button' && hasClass(node, 't-slds__arrow_wrapper'));
        const bullets = descendants(slider, (node) => node.nodeName === 'button' && hasClass(node, 't-slds__bullet'));
        assert.equal(arrows.length, 2, `${page.name}: every multi-slide Zero gallery has two real arrow buttons`);
        assert.ok(bullets.length >= slides.length, `${page.name}: every multi-slide Zero gallery has real dots`);
      }
    }
  }
  const textLabels = snapshotPages.flatMap((page) => [...page.html.matchAll(/<div class="t-input-group[^"]*\bt-input-group_tx\b[^"]*"[^>]*>[\s\S]*?<div class="t-text" style="([^"]*)">/gu)]
    .map((label) => ({ name: page.name, style: label[1] })));
  assert.equal(textLabels.length, 43, 'all source text labels remain materialized');
  for (const label of textLabels) {
    assert.match(label.style, /font-family:[^;]+/u, `${label.name}: text label retains its authored input family`);
  }
});

test('third-party videos are posters until an explicit click', async () => {
  const widgets = await read('src/scripts/source-widgets.js');
  const generator = await read('_capture/build_source_snapshots.py');
  assert.match(widgets, /activateSourceVideo/u);
  assert.match(generator, /rutube\.ru\/api\/video/u);
  const pages = await snapshots();
  const stages = pages.filter((page) => /data-source-video-kind/u.test(page.html));
  assert.equal(stages.length, 31, `video stages remain on every current source route`);
  const markup = stages.flatMap((page) => [...page.html.matchAll(/<[^>]+data-source-video-kind="([^"]+)"[^>]*>[\s\S]*?<\/[^>]+>/gu)]
    .map((match) => ({ page: page.name, kind: match[1], html: match[0] })));
  assert.equal(markup.length, 35, `all current video slots have a stage`);
  for (const stage of markup) {
    assert.match(stage.html, /data-source-video-play/u, `${stage.page}: no explicit play action`);
    assert.match(stage.html, /<img\b[^>]*\/assets\/rutube\//u, `${stage.page}: no local poster or neutral fallback`);
    assert.doesNotMatch(stage.html, /<iframe\b/u, `${stage.page}: external video mounted before click`);
    if (stage.kind === 'rutube') {
      assert.match(stage.html, /data-rutubeid="[^"]+\?p=[^"]+"/u, `${stage.page}: Rutube p hash is retained`);
    } else {
      assert.match(stage.html, /data-source-video-url="[^"]+"/u, `${stage.page}: deferred playable URL is retained`);
    }
  }
  const amongUsLegacy = markup.find((stage) => stage.page === 'amongus-land.html' && stage.kind === 'video');
  assert.ok(amongUsLegacy, 'Among Us legacy direct-video stage remains materialized');
  assert.match(amongUsLegacy.html, /assets%2Fvideo%2Famong-us\.mp4/u, 'legacy MOV resolves to the local playable rendition');
  assert.doesNotMatch(amongUsLegacy.html, /IMG_7440\.MOV/iu, 'published stage does not retain the broken Dropbox MOV');
});

test('carousel loop, archived autoplay and SBS transform stay deterministic', async () => {
  assert.equal(cycleSlideIndex(-1, 5), 4, 'left control loops from first card to last');
  assert.equal(cycleSlideIndex(5, 5), 0, 'right control loops from last card to first');
  assert.equal(isArchivedAutoplayTimeout('3000'), true, 'only the archived 3000ms timeout enables autoplay');
  assert.equal(isArchivedAutoplayTimeout('5000'), false, 'other authored timeout values stay inert');
  assert.match(await read('src/scripts/source-live-layer.js'), /event === 'blockintoview'/u, 'Tilda blockintoview event reaches the SBS observer');
  const responsiveSbs = new Map([
    ['data-animate-sbs-opts', "[{'mx':0,'ti':0},{'mx':3300,'ro':-900,'ti':12000}]"],
    ['data-animate-sbs-opts-res-320', "[{'mx':0,'ti':0},{'mx':1000,'ro':360,'ti':8000}]"],
    ['data-animate-sbs-trg', '0.5'],
  ]);
  const sourceElement = { getAttribute: (name) => responsiveSbs.get(name) ?? null };
  assert.equal(sbsFramesForViewport(sourceElement, 390).at(-1).mx, 1000, 'mobile uses the authored 320px SBS timeline');
  assert.equal(sbsFramesForViewport(sourceElement, 1440).at(-1).mx, 3300, 'desktop retains its authored SBS timeline');
  assert.equal(sbsTriggerOffset(sourceElement, 2_000, 800), 400, 'SBS .5 trigger keeps the source viewport offset');
  responsiveSbs.set('data-animate-sbs-trg', '0');
  responsiveSbs.set('data-animate-sbs-trgofst', '50');
  assert.equal(sbsTriggerOffset(sourceElement, 2_000, 800), 50, 'SBS trigger offset is not treated as an intersection ratio');
  responsiveSbs.set('data-animate-sbs-trg', '1');
  responsiveSbs.set('data-animate-sbs-trgofst', '0');
  assert.equal(sbsTriggerOffset(sourceElement, 100, 800), 100, 'short source artboards retain Tilda trigger clamping');
  responsiveSbs.delete('data-animate-sbs-trg');
  assert.equal(sbsTriggerOffset(sourceElement, 2_000, 800), 800, 'missing source trigger keeps Tilda’s default viewport trigger');
  assert.match(await read('src/scripts/source-live-layer.js'), /usesIosHoverTap/u, 'mobile-authorized SBS hover has an iOS tap path');
  const frames = parseSbsOptions("[{'mx':0,'my':-20,'sx':1,'sy':1,'op':1,'ro':-5,'ti':2000}]");
  assert.equal(frames.length, 1);
  assert.equal(frames[0].my, -20);
  assert.equal(frames[0].ro, -5);
  const keyframes = buildSbsKeyframes('sbs-test', [
    { mx: 0, my: 0, sx: 1, sy: 1, ro: 0 },
    { mx: 0, my: 20, sx: 1, sy: 1, ro: -5, ti: 2000 },
  ]);
  assert.equal(keyframes.duration, 2000);
  assert.match(keyframes.css, /translate\(0px, 20px\) rotate\(-5deg\)/u, 'SBS keyframes preserve authored transform');
  const delayed = buildSbsKeyframes('sbs-delay', [
    { mx: 0, ti: 0, ea: '0' },
    { mx: 10, ti: 200, dt: 300, ea: 'bounceFin' },
  ]);
  assert.equal(delayed.duration, 500, 'SBS dt holds the prior source frame before moving');
  assert.match(delayed.css, /cubic-bezier\(0\.34,1\.61,0\.7,1\)/u, 'SBS bounceFin easing is retained');
});

test('global exit intent is isolated from archived local source forms', async () => {
  const layout = await read('src/layouts/Layout.astro');
  const handler = await read('src/scripts/exit-intent.js');
  assert.match(layout, /data-exit-intent-dialog/u);
  assert.match(layout, /data-exit-intent-honeypot/u);
  assert.match(layout, /data-exit-intent-consent/u);
  assert.match(handler, /stopPropagation\(\)/u);
  assert.match(handler, /showModal\(\)/u);
  assert.match(handler, /exitPopupDismissedAt/u);
  assert.match(handler, /data-exit-intent-consent/u);
  assert.match(handler, /Подтвердите согласие/u);
  assert.match(handler, /Открылся черновик WhatsApp/u);
});

test('архивный MOV заменён на локальный MP4, а кнопка запуска остаётся живой', async () => {
  const widgets = await read('src/scripts/source-widgets.js');
  assert.match(widgets, /initLocalVideos\(root\)/u, 'видеоблок не получает обработчик клика');
  const pages = await snapshots();
  const videoPages = pages.filter((page) => /assets\/video\/kubok\.mp4/u.test(page.html));
  assert.equal(videoPages.length, 2, 'два архивных видеоблока должны получить локальный MP4');
  for (const page of videoPages) {
    assert.doesNotMatch(page.html, /кубок\.MOV/iu, `${page.name}: опубликован неиграбельный MOV`);
    assert.match(page.html, /class="[^"\n]*\bvideo-box\b/u, `${page.name}: потерян контейнер видео`);
    assert.match(page.html, /class="[^"\n]*\bcustom-video\b/u, `${page.name}: потерян тег видео`);
    assert.match(page.html, /class="[^"\n]*\bvideo-play-btn\b/u, `${page.name}: потеряна кнопка запуска`);
  }
});

test('кнопка локального видео запускает ролик и отражает его состояние', async () => {
  const listeners = new Map();
  const classes = new Set();
  const videoListeners = new Map();
  let played = 0;
  const video = {
    ended: false,
    addEventListener(type, listener) { videoListeners.set(type, listener); },
    play() { played += 1; return Promise.resolve(); },
  };
  const trigger = {
    addEventListener(type, listener) { listeners.set(type, listener); },
    setAttribute() {},
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
    },
  };

  bindLocalVideo(video, trigger);
  listeners.get('click')();
  await Promise.resolve();
  assert.equal(played, 1, 'клик вызывает native video.play()');
  assert.ok(classes.has('hidden'), 'кнопка скрыта во время воспроизведения');

  videoListeners.get('pause')();
  assert.ok(!classes.has('hidden'), 'при паузе кнопка вновь доступна');
});

test('карта площадок стоит на каждом снимке', async () => {
  const pages = await snapshots();
  const withMap = pages.filter((page) => /class="[^"]*\bsource-map\b/u.test(page.html));
  assert.equal(withMap.length, pages.length, 'карта пропала на части маршрутов');
  for (const page of withMap.slice(0, 5)) {
    assert.match(page.html, /Показать карту/u, `${page.name}: карта без кнопки активации`);
  }
});

test('блок отзывов остаётся там, где он был у оригинала', async () => {
  const pages = await snapshots();
  const withReviews = pages.filter((page) => /class="[^"]*\bsource-reviews\b/u.test(page.html));
  // 21 маршрут — замер 16.08.2026 после возврата виджета отзывов
  assert.ok(withReviews.length >= 21, `отзывы остались только на ${withReviews.length} маршрутах`);
});

test('поле телефона везде приходит с блоком страны, а не одной строкой', async () => {
  for (const page of await snapshots()) {
    const wraps = (page.html.match(/t-input-phonemask__wrap/gu) ?? []).length;
    const selects = (page.html.match(/t-input-phonemask__select"/gu) ?? []).length;
    if (wraps === 0) continue;
    assert.equal(selects, wraps, `${page.name}: ${wraps} полей телефона, блоков страны ${selects}`);
  }
});

test('снимки не тянут медиа за пределами первого экрана', async () => {
  const heavy = ['prazdniki-pod-kluch.html', 'kids.html', 'home.html'];
  for (const name of heavy) {
    const html = await readFile(new URL(name, snapshotDir), 'utf8');
    const lazy = (html.match(/loading="lazy"/gu) ?? []).length;
    assert.ok(lazy > 10, `${name}: ленивых картинок всего ${lazy}`);
  }
});

test('на страницах один телефон — тот, что в site.json', async () => {
  const site = JSON.parse(await read('src/data/site.json'));
  const digits = (value) => String(value).replace(/\D/gu, '');
  const expected = digits(site.header.phone);
  for (const page of await snapshots()) {
    for (const found of page.html.match(/\+7[\s (]{0,2}\d{3}[\s )]{0,2}[\d\s -]{7,12}/gu) ?? []) {
      // маска ввода +7(000) 000-00-00 — не телефон
      if (/0{3}/u.test(found)) continue;
      assert.equal(digits(found), expected, `${page.name}: чужой номер ${found}`);
    }
  }
});
