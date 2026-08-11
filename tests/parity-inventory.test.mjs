import assert from 'node:assert/strict';
import test from 'node:test';

import { clonePath, csvRows, decisionFor, extractLinks, originalUrl } from '../scripts/parity-inventory.mjs';

test('normalises audit URLs without losing numeric .html aliases', () => {
  assert.equal(originalUrl('https://xn--80aehcht5ci1b.xn--p1ai/kids/?utm=x#form'), 'https://xn--80aehcht5ci1b.xn--p1ai/kids');
  assert.equal(originalUrl('/page57307963.html'), 'https://xn--80aehcht5ci1b.xn--p1ai/page57307963.html');
  assert.equal(clonePath('/kids'), '/kids/');
  assert.equal(clonePath('/'), '/');
});

test('parses quoted CSV rows used by the historical Tilda inventory', () => {
  const rows = csvRows('url,title,status\nhttps://example.test/,"A, B",200\n');
  assert.deepEqual(rows, [{ url: 'https://example.test/', title: 'A, B', status: '200' }]);
});

test('prefers a declared permanent redirect over a static fallback route', () => {
  const routes = new Set(['/new-year-2025/', '/new-year/']);
  const redirects = new Map([['/new-year-2025', { target: '/new-year/', status: '301 + fallback' }]]);
  assert.deepEqual(
    decisionFor({ url: 'https://xn--80aehcht5ci1b.xn--p1ai/new-year-2025', http_orig: 200 }, routes, redirects),
    { routeClone: '/new-year-2025/', redirectTo: '/new-year/', verdict: 'redirect_ok' },
  );
});

test('does not turn Tilda JavaScript concatenation into synthetic crawl URLs', () => {
  const links = extractLinks(`
    <a href="/kids/">Kids</a>
    <a href="window.postMessage('open-athena-widget');">Open widget</a>
    <script>location.href = ' + hurl + '</script>
    <script>window.open('/ono/')</script>
  `, 'https://xn--80aehcht5ci1b.xn--p1ai/');

  assert.deepEqual(links.sort(), [
    'https://xn--80aehcht5ci1b.xn--p1ai/kids',
    'https://xn--80aehcht5ci1b.xn--p1ai/ono',
  ]);
});

test('does not bind a clone page to an unrelated dead original URL', () => {
  const routes = new Set(['/kvesty-v-rostove-na-donu/']);
  assert.deepEqual(
    decisionFor({ url: 'https://xn--80aehcht5ci1b.xn--p1ai/kvesty-v-rostove-na-donu', http_orig: 404 }, routes, new Map()),
    { routeClone: '', redirectTo: '', verdict: 'dead_orig' },
  );
});
