import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const site = JSON.parse(await readFile(new URL('../src/data/site.json', import.meta.url), 'utf8'));

test('keeps the full verified navigation data and only real destinations', () => {
  assert.equal(site.megamenu.catalog.cols.length, 4);
  assert.equal(site.megamenu.party.cols.length, 3);
  assert.equal(site.megamenu.contacts.cols.length, 2);

  const catalogLinks = site.megamenu.catalog.cols.flatMap((column) => column.links ?? []);
  const partyLinks = site.megamenu.party.cols.flatMap((column) => column.links ?? []);
  const venueLinks = site.megamenu.contacts.cols.flatMap((column) => column.links ?? []);

  assert.equal(catalogLinks.length, 36);
  assert.equal(partyLinks.length, 8);
  assert.equal(venueLinks.length, 9);
  assert.equal(site.megamenu.party.cols.at(-1).href, '/new-year');
  assert.ok([...catalogLinks, ...partyLinks, ...venueLinks].every((link) => link.href));
});

// В оригинале (work/raw/pages/home--39800a5ba5.html, запись T344 rec1097897446, то же самое
// в pryatki_portal--a4ef62f757.html, indiana--ae793e2f47.html и header--46deec6aa8.html)
// заголовки колонок каталога — сами по себе ссылки, и панель отдаёт 38 <a>: 35 пунктов списков
// плюс 3 кликабельных заголовка. Колонка «ПРЯТКИ В ТЕМНОТЕ» заголовком-ссылкой НЕ является.
test('makes the catalog column titles clickable exactly where the original does', () => {
  const titles = site.megamenu.catalog.cols.map((column) => [column.title, column.href ?? null]);

  assert.deepEqual(titles, [
    ['КЛАССИЧЕСКИЕ КВЕСТЫ', '/'],
    ['ПРЯТКИ В ТЕМНОТЕ', null],
    ['СТРАШНЫЕ КВЕСТЫ', '/strashnye-kvesty'],
    // нереально.рф/kids в punycode — так адрес записан во всех данных проекта
    ['VR-ИГРЫ', 'https://xn--80ajazgehl5i.xn--p1ai/kids'],
  ]);

  // 39 = 38 ссылок оригинальной панели + «Прятки kids». Этот пункт живёт только в мобильном
  // меню оригинала (тот же файл, блок t450, список ПРЯТКИ В ТЕМНОТЕ), а данные у десктопа
  // и мобайла общие, поэтому он остаётся в колонке и здесь. Составы намеренно не выравниваем.
  const titleLinks = site.megamenu.catalog.cols.filter((column) => column.href);
  const listLinks = site.megamenu.catalog.cols.flatMap((column) => column.links ?? []);
  assert.equal(titleLinks.length + listLinks.length, 39);
  assert.ok(listLinks.some((link) => link.href === '/pryatki_kids'));
});

test('uses a shared local three-channel messenger panel', async () => {
  assert.deepEqual(site.messengers.items.map((item) => item.href), [
    'https://max.ru/id164409771610_bot?start=c1775808014480-ds',
    'https://wa.me/79282163623',
    'https://t.me/chezakvest_rnd_bot',
  ]);

  const [header, footer, fab, styles] = await Promise.all([
    readFile(new URL('../src/components/Header.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Footer.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/MessengerFab.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/page.css', import.meta.url), 'utf8'),
  ]);

  assert.match(header, /data-messenger-open/);
  assert.match(footer, /<MessengerFab\s*\/>/);
  assert.doesNotMatch(footer, /wa-float/);
  assert.match(fab, /mfab__face--\$\{item\.id\}/);
  assert.match(styles, /\.mfab__face--max/);
  assert.match(styles, /\.mfab__face--wa/);
  assert.match(styles, /\.mfab__face--tg/);
});

test('keeps mobile-menu and messenger-dialog Escape handling independent', async () => {
  const header = await readFile(new URL('../src/components/Header.astro', import.meta.url), 'utf8');

  assert.match(header, /drawer\?\.querySelector\('\.mmenu__close'\) \|\| focusableItems\(\)\[0\]/);
  assert.match(header, /document\.getElementById\('messenger-panel'\)\?\.open/);
  assert.match(header, /role="dialog" aria-modal="true"/);
  assert.match(header, /event\.key === 'Tab'/);
  assert.match(header, /s\.header\.mobileLogo/);
});
