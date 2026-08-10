import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { auditPublicAssets } from '../scripts/asset-audit.mjs';

async function writeFixtureFile(root, relativePath, contents = 'fixture') {
  const path = join(root, relativePath);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, contents);
  return path;
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'cheza-assets-'));
  await Promise.all([
    writeFixtureFile(root, 'public/assets/direct.webp'),
    writeFixtureFile(root, 'public/assets/lazy.webp'),
    writeFixtureFile(root, 'public/assets/build-only.webp'),
    writeFixtureFile(root, 'public/assets/static.tildacdn.com/js/tilda-forms-1.0.min.js', 'legacy'),
    writeFixtureFile(root, 'src/components/Card.astro', '<img data-src="/assets/lazy.webp" alt="">'),
    writeFixtureFile(root, 'dist/index.html', '<img src="/assets/direct.webp" alt="">'),
    writeFixtureFile(root, 'dist/_astro/runtime.js', 'const background = "/assets/build-only.webp";'),
  ]);
  return root;
}

test('keeps lazy source assets and emitted-script assets separate from unreachable files', async () => {
  const root = await createFixture();
  const report = await auditPublicAssets({ projectRoot: root });

  assert.deepEqual(report.sourceOnlyAssets, ['/assets/lazy.webp']);
  assert.deepEqual(report.buildOnlyAssets, ['/assets/build-only.webp', '/assets/direct.webp']);
  assert.deepEqual(report.missingReferences, []);
  assert.ok(report.unreferencedAssets.some((asset) => asset.path === '/assets/static.tildacdn.com/js/tilda-forms-1.0.min.js'));
  assert.deepEqual(report.legacyArtifacts, [{
    path: '/assets/static.tildacdn.com/js/tilda-forms-1.0.min.js',
    bytes: 6,
  }]);
  assert.ok(report.errors.some((error) => error.includes('legacy Tilda executable')));
});

test('does not count a legacy asset referring to itself as a live build reference', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cheza-assets-'));
  const legacyPath = '/assets/neo.tildacdn.com/js/tilda-fallback-1.0.min.js';
  await Promise.all([
    writeFixtureFile(root, 'public/assets/neo.tildacdn.com/js/tilda-fallback-1.0.min.js', `fetch('${legacyPath}')`),
    writeFixtureFile(root, 'dist/index.html', '<main>Clone</main>'),
  ]);

  const report = await auditPublicAssets({ projectRoot: root });

  assert.ok(!report.referencedAssetPaths.includes(legacyPath));
  assert.deepEqual(report.legacyArtifacts, [{ path: legacyPath, bytes: Buffer.byteLength(`fetch('${legacyPath}')`) }]);
});

test('fails a local source reference whose public file is absent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cheza-assets-'));
  await Promise.all([
    writeFixtureFile(root, 'src/components/Card.astro', '<img data-src="/assets/missing.webp" alt="">'),
    writeFixtureFile(root, 'dist/index.html', '<main>Clone</main>'),
  ]);

  const report = await auditPublicAssets({ projectRoot: root });

  assert.deepEqual(report.missingReferences, ['/assets/missing.webp']);
  assert.ok(report.errors.some((error) => error.includes('/assets/missing.webp')));
});

test('ignores archived and explanatory asset paths inside comments', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cheza-assets-'));
  await Promise.all([
    writeFixtureFile(root, 'src/layouts/Layout.astro', '// /assets/not-a-runtime-file.webp'),
    writeFixtureFile(root, 'dist/index.html', '<!-- /assets/not-a-runtime-file.webp -->'),
  ]);

  const report = await auditPublicAssets({ projectRoot: root });

  assert.deepEqual(report.missingReferences, []);
});
