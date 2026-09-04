import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { auditCatalogData } from '../scripts/catalog-data-audit.mjs';

test('maps every quest record to its verified venue and excludes the legacy Wednesday duplicate from the catalogue', async () => {
  const report = await auditCatalogData();

  assert.equal(report.questCount, 42);
  assert.equal(report.canonicalCatalogCount, 41);
  assert.deepEqual(report.errors, []);
});

test('keeps the public catalogue count aligned with canonical quest data', async () => {
  const catalogPage = await readFile(new URL('../src/pages/kvesty-v-rostove-na-donu.astro', import.meta.url), 'utf8');

  assert.match(catalogPage, /каталог из 41 игры/u);
});
