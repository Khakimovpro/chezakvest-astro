import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { verifyRedirectTargets } from '../scripts/redirect-target-contract.mjs';

async function writeRoute(distDir, route) {
  const file = route === '/' ? join(distDir, 'index.html') : join(distDir, route.slice(1), 'index.html');
  await mkdir(join(file, '..'), { recursive: true });
  await writeFile(file, '<!doctype html>');
}

test('accepts redirect-map targets that exist in the built static artifact', async () => {
  const distDir = await mkdtemp(join(tmpdir(), 'cheza-redirect-targets-'));
  await Promise.all([writeRoute(distDir, '/'), writeRoute(distDir, '/target'), writeRoute(distDir, '/privacy')]);

  const report = await verifyRedirectTargets({
    distDir,
    entries: [
      { source: '/old', target: '/target', status: '301', reason: 'test' },
      { source: '/privacy', target: '/privacy', status: '200', reason: 'test' },
    ],
  });

  assert.equal(report.targetsChecked, 2);
  assert.deepEqual(report.errors, []);
});

test('reports a legacy redirect whose canonical target is missing from dist', async () => {
  const distDir = await mkdtemp(join(tmpdir(), 'cheza-redirect-targets-'));
  await writeRoute(distDir, '/');

  const report = await verifyRedirectTargets({
    distDir,
    entries: [{ source: '/old', target: '/missing', status: '301', reason: 'test' }],
  });

  assert.equal(report.targetsChecked, 1);
  assert.deepEqual(report.errors, ['/old: redirect target /missing is missing from dist']);
});
