import assert from 'node:assert/strict';
import test from 'node:test';

import { auditCatalogData } from '../scripts/catalog-data-audit.mjs';

test('maps every quest record to its verified venue and excludes the legacy Wednesday duplicate from the catalogue', async () => {
  const report = await auditCatalogData();

  assert.equal(report.questCount, 41);
  assert.equal(report.canonicalCatalogCount, 40);
  assert.deepEqual(report.errors, []);
});
