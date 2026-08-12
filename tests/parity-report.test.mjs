import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRouteCaption,
  buildSummary,
  changedContentDrift,
  csvRows,
  routeSlug,
  routeFromEvidenceUrl,
  ruleDiagnostics,
} from '../scripts/parity-report.mjs';

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

test('keeps only actual content drift and maps original URLs to clone routes', () => {
  const rows = csvRows([
    'url,status,changed_fields,previous_h1,current_h1',
    'https://xn--80aehcht5ci1b.xn--p1ai/unchanged,unchanged,h1,Old,New',
    'https://xn--80aehcht5ci1b.xn--p1ai/changed,changed,h1,Old,New',
    'https://xn--80aehcht5ci1b.xn--p1ai/not-observed,not_observed_2026-07-20,,,',
  ].join('\n'));

  const drift = changedContentDrift(rows);

  assert.deepEqual(drift.map((row) => row.route), ['/changed/', '/not-observed/']);
  assert.equal(routeFromEvidenceUrl('https://example.test/a/b?source=inventory'), '/a/b/');
});

test('derives a route caption from measured evidence without inventing a fix', () => {
  const row = {
    url: '/changed/',
    verdict: 'needs_fix',
    missing_sections: 'rec123',
    missing_texts: '',
    missing_images: '',
    px_1440: '82.1',
    px_390: '90.4',
    height_delta_1440: '12.5',
    height_delta_390: '1.2',
    overflow_390: '0',
    console_errors: '0',
    failed_requests: '0',
    external_requests: '0',
    broken_links: '',
    missing_img_dimensions: '0',
    first_screen_lazy: '0',
    seo_match: 'true',
    headings_match: 'true',
    fixed: '',
    notes: '',
  };
  const gaps = [{ url: '/changed/', section: 'map', что_не_так: 'External map', почему_нельзя: 'Remote widget', что_вместо: 'LazyMap' }];
  const drift = [{ route: '/changed/', changed_fields: 'h1', status: 'changed' }];

  const caption = buildRouteCaption(row, gaps, drift);

  assert.match(caption.problem, /rec123/u);
  assert.match(caption.problem, /82\.1%/u);
  assert.match(caption.resolution, /нет подтверждённого route-specific исправления/iu);
  assert.match(caption.replacements, /LazyMap/u);
  assert.match(caption.drift, /h1/u);
});

test('lists both pass and fail rule diagnostics from the matrix fields', () => {
  const diagnostics = ruleDiagnostics({
    sections_orig: '10/10', sections_clone: '9/9', missing_sections: 'rec123', missing_texts: '', missing_images: '',
    px_1440: '82.1', px_390: '90.4', height_delta_1440: '12.5', height_delta_390: '1.2',
    overflow_390: '0', console_errors: '0', failed_requests: '0', external_requests: '0', broken_links: '',
    missing_img_dimensions: '0', first_screen_lazy: '0', seo_match: 'true', headings_match: 'false', notes: 'metric masks: map',
  });

  assert.ok(diagnostics.some((item) => item.rule === 'Пиксели desktop ≥ 90%' && item.state === 'fail'));
  assert.ok(diagnostics.some((item) => item.rule === 'Пиксели mobile ≥ 88%' && item.state === 'pass'));
  assert.ok(diagnostics.some((item) => item.rule === 'Высота desktop ≤ 10%' && item.state === 'fail'));
  assert.ok(diagnostics.some((item) => item.rule === 'SEO match' && item.state === 'pass'));
  assert.ok(diagnostics.some((item) => item.rule === 'Порядок заголовков' && item.state === 'fail'));
});
