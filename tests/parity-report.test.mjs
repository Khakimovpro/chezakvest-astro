import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSummary, csvRows, routeSlug } from '../scripts/parity-report.mjs';

test('parses the visual CSV and summarises only numeric parity scores', () => {
  const [row] = csvRows('url,verdict,visual_scope,px_1440,px_390,overflow_390,console_errors,failed_requests,external_requests\n/,pass,page,91.2,89.3,0,0,0,0\n');
  const summary = buildSummary([row]);
  assert.equal(summary.total, 1);
  assert.equal(summary.pass, 1);
  assert.equal(summary.desktopMedian, 91.2);
  assert.equal(summary.mobileMedian, 89.3);
});

test('creates stable screenshot stems for the root and nested routes', () => {
  assert.equal(routeSlug('/'), 'home');
  assert.equal(routeSlug('/a/b/'), 'a__b');
});
