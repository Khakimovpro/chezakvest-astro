import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LEGACY_SITEMAP_SLUGS,
  dataPathFromGlobPath,
  lastModifiedForSources,
} from '../src/lib/sitemap.js';

test('sitemap derives an ISO date from committed source files', () => {
  const lastmod = lastModifiedForSources(['src/lib/urls.js']);
  assert.match(lastmod, /^\d{4}-\d{2}-\d{2}$/u);
  assert.ok(Date.parse(`${lastmod}T00:00:00.000Z`) <= Date.now());
});

test('sitemap translates only page-data glob paths and excludes the Wednesday fallback', () => {
  assert.equal(
    dataPathFromGlobPath('../data/pages/zvonok.json'),
    'src/data/pages/zvonok.json',
  );
  assert.throws(() => dataPathFromGlobPath('../layouts/QuestPage.astro'));
  assert.ok(LEGACY_SITEMAP_SLUGS.has('wednesday_ukradennaya_vesch'));
});
