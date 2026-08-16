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

test('страницы со снимками получают кнопку мессенджеров и локальные надстройки', async () => {
  const component = await read('src/components/SourceSnapshotBody.astro');
  assert.match(component, /<MessengerFab \/>/u, 'плавающие кнопки мессенджеров');
  assert.match(component, /initCardHover\(\)/u, 'наведение на карточку квеста');
  assert.match(component, /initSourceWidgets\(\)/u, 'локальные виджеты в снимке');
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
