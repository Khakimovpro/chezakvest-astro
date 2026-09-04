import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('keeps lead delivery inert and initializes only owner-confirmed analytics', async () => {
  const [site, leadForm, analytics, layout] = await Promise.all([
    read('src/data/site.json').then(JSON.parse),
    read('src/scripts/lead-form.js'),
    read('src/components/Analytics.astro'),
    read('src/layouts/Layout.astro'),
  ]);

  assert.equal(site.leads.recipient, '');
  assert.equal(site.analytics.metrikaId, '48864086');
  assert.match(leadForm, /if \(!endpoint\) return false/);
  assert.match(leadForm, /lead:accepted/);
  assert.match(leadForm, /createSubmissionGuard/);
  assert.doesNotMatch(leadForm, /anchor\.href\s*=\s*link/);
  assert.match(analytics, /\^\\d\{4,20\}\$/);
  assert.doesNotMatch(analytics, /reachGoal/);
  assert.doesNotMatch(analytics, /ecommerce\s*:/);
  assert.doesNotMatch(analytics, /trackLinks\s*:/);
  assert.match(layout, /<Analytics\s*\/>/);
});

test('mirrors the live noindex privacy page and retires the duplicate New Year landing as a fallback', async () => {
  const [privacy, sitemap, fallback, map] = await Promise.all([
    read('src/pages/privacy.astro'),
    read('src/pages/sitemap.xml.js'),
    read('src/pages/new-year-2025.astro'),
    read('migration/legacy-url-map.csv'),
  ]);

  assert.match(privacy, /noindex=\{true\}/);
  assert.doesNotMatch(privacy, /<Breadcrumbs/);
  assert.doesNotMatch(sitemap, /canonicalUrl\('\/privacy'\)/);
  assert.match(fallback, /target="\/new-year"/);
  assert.match(map, /^\/new-year-2025,\/new-year,301 \+ fallback,/m);
});
