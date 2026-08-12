import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { applyCaptions, captionForRoute } from '../scripts/parity-apply-fix-captions.mjs';

const root = new URL('../', import.meta.url);

function csvRows(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/u);
  const columns = header.split(',');
  return lines.filter(Boolean).map((line) => Object.fromEntries(
    columns.map((column, index) => [column, line.split(',')[index] || '']),
  ));
}

test('gives every registered clone route a factual fixed caption without asserting a pass', async () => {
  const registry = csvRows(await readFile(new URL('migration/pages.csv', root), 'utf8'));
  const routes = [...new Set(registry.map((row) => row.path).filter(Boolean))];

  assert.equal(routes.length, 67);
  for (const route of routes) {
    const caption = captionForRoute(route);
    assert.ok(caption, `${route} has a factual route-specific caption`);
    assert.match(caption, /Итог порога не утверждается/u);
  }
  assert.equal(captionForRoute('/not-a-registered-route/'), null);
});

test('replaces blank matrix fixed fields while preserving capture measurements', () => {
  const rows = [
    { url: '/', fixed: '', px_1440: '63.4', verdict: 'needs_fix' },
    { url: '/new-year-2025/', fixed: '', px_1440: '', verdict: 'redirect_ok' },
  ];
  const applied = applyCaptions(rows);

  assert.equal(applied[0].px_1440, '63.4');
  assert.equal(applied[0].verdict, 'needs_fix');
  assert.match(applied[0].fixed, /T604 promo/u);
  assert.match(applied[1].fixed, /LegacyRedirectPage/u);
});
