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
