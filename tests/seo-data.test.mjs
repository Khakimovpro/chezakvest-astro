import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { auditSeoData } from '../scripts/seo-data-audit.mjs';

test('keeps every indexable page and static route within the SEO metadata contract', async () => {
  const report = await auditSeoData();

  assert.equal(report.indexablePageCount, 60);
  assert.deepEqual(report.staticRouteSlugs, ['home', 'kvesty-v-rostove-na-donu']);
  assert.deepEqual(report.errors, []);
});

test('excludes only the noindex Wednesday fallback from the indexable metadata contract', async () => {
  const report = await auditSeoData();

  assert.deepEqual(report.excludedSlugs, ['wednesday_ukradennaya_vesch']);
});

test('reports invalid geographic metadata and copied keyword clusters', async () => {
  const pagesDirectory = await mkdtemp(join(tmpdir(), 'chezakvest-seo-audit-'));
  try {
    await Promise.all([
      writeFile(join(pagesDirectory, 'broken.json'), JSON.stringify({
        slug: 'broken',
        seo: {
          title: 'Квест без географии',
          description: 'Короткое.',
          keywords: 'общий кластер',
        },
      })),
      writeFile(join(pagesDirectory, 'valid.json'), JSON.stringify({
        slug: 'valid',
        seo: {
          title: 'Квест в Ростове-на-Дону',
          description: 'Подробное описание квеста в Ростове-на-Дону для команды: сюжетная игра с загадками, приключениями и бронированием на удобную дату.',
          keywords: 'общий кластер',
        },
      })),
    ]);

    const report = await auditSeoData({ pagesDirectory, includeStaticRoutes: false });

    assert.deepEqual(report.errors, [
      'broken: seo.title must contain Ростов or Ростове',
      'broken: seo.description must be 120–160 characters, found 9',
      'seo.keywords must be unique for indexable pages: broken, valid',
    ]);
  } finally {
    await rm(pagesDirectory, { recursive: true, force: true });
  }
});
