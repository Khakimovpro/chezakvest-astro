import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { auditPublicAssets } from '../../scripts/asset-audit.mjs';
import { verifyRepresentativeResources } from './verify-resources.mjs';

const PROJECT_ROOT = resolve(import.meta.dirname, '../..');

async function writeFixtureFile(root, relativePath, contents = 'fixture') {
  const path = join(root, relativePath);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, contents);
  return path;
}

function remoteScriptAfter(script, anchor) {
  const anchorIndex = script.indexOf(anchor);
  assert.notEqual(anchorIndex, -1, `missing anchor: ${anchor}`);
  const opener = script.indexOf("<<'REMOTE_SCRIPT'", anchorIndex);
  assert.notEqual(opener, -1, `missing remote script after: ${anchor}`);
  const bodyStart = script.indexOf('\n', opener) + 1;
  const bodyEnd = script.indexOf('\nREMOTE_SCRIPT', bodyStart);
  assert.notEqual(bodyEnd, -1, `unterminated remote script after: ${anchor}`);
  return script.slice(bodyStart, bodyEnd);
}

function runBash(script, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('bash', ['-s', '--', ...args], {
      cwd: PROJECT_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', (code) => resolvePromise({
      code,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    }));
    child.stdin.end(script);
  });
}

function runNode(args, { cwd = PROJECT_ROOT, env = {} } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', (code) => resolvePromise({
      code,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    }));
  });
}

test('asset gate rejects a public file that nginx could not read after root-owned delivery', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'cheza-resource-mode-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const publicAsset = await writeFixtureFile(root, 'public/assets/unreadable.webp');
  const publicNestedAsset = await writeFixtureFile(root, 'public/assets/private/nested.webp');
  const builtAsset = await writeFixtureFile(root, 'dist/assets/unreadable.webp');
  const builtNestedAsset = await writeFixtureFile(root, 'dist/assets/private/nested.webp');
  await Promise.all([
    writeFixtureFile(root, 'src/components/Card.astro', '<img src="/assets/unreadable.webp" alt="">'),
    writeFixtureFile(root, 'dist/index.html', '<img src="/assets/unreadable.webp" alt="">'),
  ]);
  await Promise.all([
    chmod(publicAsset, 0o600),
    chmod(publicNestedAsset, 0o644),
    chmod(join(root, 'public/assets/private'), 0o700),
    chmod(builtAsset, 0o600),
    chmod(builtNestedAsset, 0o644),
    chmod(join(root, 'dist/assets/private'), 0o700),
  ]);

  const report = await auditPublicAssets({ projectRoot: root });

  assert.deepEqual(report.unreadableAssets, [{ path: '/assets/unreadable.webp', mode: '0600' }]);
  assert.deepEqual(report.untraversableDirectories, [{ path: '/assets/private/', mode: '0700' }]);
  assert.deepEqual(report.unreadableBuildAssets, [{ path: '/assets/unreadable.webp', mode: '0600' }]);
  assert.deepEqual(report.untraversableBuildDirectories, [{ path: '/assets/private/', mode: '0700' }]);
  assert.match(report.errors.join('\n'), /public asset is not readable by the web-server user \(0600\)/);
  assert.match(report.errors.join('\n'), /public asset directory is not traversable by the web-server user \(0700\)/);
});

test('asset gate rejects unreadable dist paths even when public permissions are valid', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'cheza-built-resource-mode-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all([
    writeFixtureFile(root, 'public/assets/readable.webp'),
    writeFixtureFile(root, 'src/components/Card.astro', '<img src="/assets/readable.webp" alt="">'),
    writeFixtureFile(root, 'dist/index.html', '<img src="/assets/readable.webp" alt="">'),
  ]);
  const builtAsset = await writeFixtureFile(root, 'dist/assets/private/readable.webp');
  await chmod(builtAsset, 0o600);
  await chmod(join(root, 'dist/assets/private'), 0o700);

  const report = await auditPublicAssets({ projectRoot: root });

  assert.deepEqual(report.unreadableAssets, []);
  assert.deepEqual(report.untraversableDirectories, []);
  assert.deepEqual(report.unreadableBuildAssets, [{ path: '/assets/private/readable.webp', mode: '0600' }]);
  assert.deepEqual(report.untraversableBuildDirectories, [{ path: '/assets/private/', mode: '0700' }]);
  assert.match(report.errors.join('\n'), /built asset is not readable by the web-server user \(0600\)/);
  assert.match(report.errors.join('\n'), /built asset directory is not traversable by the web-server user \(0700\)/);
});

test('resource smoke fails when a representative page image returns 403', async () => {
  const expectedPagePaths = [
    '/',
    '/kvesty-v-rostove-na-donu/',
    '/fnaf/',
    '/strashnye-kvesty/',
    '/contacts/',
    '/new-year/',
    '/40letpobedy216/',
    '/magnitogorskaya1/',
    '/mira27/',
    '/nagibina14/',
    '/nansena107/',
    '/sokolova23/',
  ];
  const venueAssets = new Map([
    ['/40letpobedy216/', '/assets/q/7f30fa4ea5.webp'],
    ['/magnitogorskaya1/', '/assets/q/5a83be0b23.webp'],
    ['/mira27/', '/assets/q/b440a38aea.webp'],
    ['/nagibina14/', '/assets/q/7ca24718c3.webp'],
    ['/nansena107/', '/assets/q/01585eb2e0.webp'],
    ['/sokolova23/', '/assets/q/350ba9c163.webp'],
  ]);
  const requestedPagePaths = [];
  const requestUrl = async (url) => {
    const path = new URL(url).pathname;
    if (path.startsWith('/assets/q/')) {
      return { status: 403, contentType: 'text/html', body: Buffer.from('forbidden') };
    }
    if (path.startsWith('/assets/')) {
      return { status: 200, contentType: 'image/webp', body: Buffer.from('image') };
    }
    requestedPagePaths.push(path);
    const venueAsset = venueAssets.get(path) ?? '/assets/q/not-a-venue-page.webp';
    return {
      status: 200,
      contentType: 'text/html',
      body: Buffer.from(`<img src="/assets/content.webp"><img src="/assets/fnaf/hero.webp"><img src="${venueAsset}">`),
    };
  };

  const report = await verifyRepresentativeResources({ origin: 'https://example.test', requestUrl });

  assert.equal(report.rows.length, 12);
  assert.equal(report.errors.length, 6);
  assert.ok(report.errors.every((error) => error.includes('HTTP 403')));
  assert.deepEqual(requestedPagePaths, expectedPagePaths);
  assert.deepEqual(
    report.rows.filter(({ kind }) => kind === 'venue').map(({ page, asset }) => [page, asset]),
    [...venueAssets],
  );
});

test('both gate and HTTP resource CLIs exit nonzero on unreadable resources', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'cheza-resource-cli-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const assetAuditSource = await readFile(join(PROJECT_ROOT, 'scripts/asset-audit.mjs'), 'utf8');
  const publicAsset = await writeFixtureFile(root, 'public/assets/unreadable.webp');
  await Promise.all([
    writeFixtureFile(root, 'scripts/asset-audit.mjs', assetAuditSource),
    writeFixtureFile(root, 'src/components/Card.astro', '<img src="/assets/unreadable.webp" alt="">'),
    writeFixtureFile(root, 'dist/index.html', '<img src="/assets/unreadable.webp" alt="">'),
    writeFixtureFile(root, 'dist/assets/unreadable.webp'),
  ]);
  await chmod(publicAsset, 0o600);
  const assetGate = await runNode(['scripts/asset-audit.mjs'], { cwd: root });
  assert.equal(assetGate.code, 1);
  assert.match(assetGate.stderr, /Asset audit failed/);

  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    if (path.startsWith('/assets/q/')) {
      response.writeHead(403, { 'content-type': 'text/html' });
      response.end('forbidden');
      return;
    }
    if (path.startsWith('/assets/')) {
      response.writeHead(200, { 'content-type': 'image/webp' });
      response.end('image');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<img src="/assets/content.webp"><img src="/assets/fnaf/hero.webp"><img src="/assets/q/venue.webp">');
  });
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  context.after(() => new Promise((resolvePromise) => server.close(resolvePromise)));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const resourceSmoke = await runNode(['deploy/priyomka/verify-resources.mjs'], {
    env: { SITE_ORIGIN: `http://127.0.0.1:${address.port}` },
  });
  assert.equal(resourceSmoke.code, 1);
  assert.match(resourceSmoke.stderr, /Resource smoke failed: 6 issue/);
});

test('delivery normalization makes every static directory 0755 and file 0644', async (context) => {
  const fixture = await mkdtemp(join(tmpdir(), 'cheza-delivery-mode-'));
  context.after(() => rm(fixture, { recursive: true, force: true }));
  const releases = join(fixture, 'releases');
  const staging = join(releases, '20260904T100000Z-11111111.incoming');
  const nested = join(staging, 'assets', 'q');
  const asset = join(nested, 'fixture.webp');
  await mkdir(nested, { recursive: true, mode: 0o700 });
  await writeFile(asset, 'fixture');
  await chmod(staging, 0o700);
  await chmod(join(staging, 'assets'), 0o700);
  await chmod(nested, 0o700);
  await chmod(asset, 0o600);
  const deploy = await readFile(join(PROJECT_ROOT, 'deploy/deploy.sh'), 'utf8');
  const normalization = remoteScriptAfter(deploy, 'log "Нормализую права доставленного релиза"');

  const result = await runBash(normalization, [releases, staging]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal((await stat(staging)).mode & 0o777, 0o755);
  assert.equal((await stat(join(staging, 'assets'))).mode & 0o777, 0o755);
  assert.equal((await stat(nested)).mode & 0o777, 0o755);
  assert.equal((await stat(asset)).mode & 0o777, 0o644);
  const delivery = deploy.indexOf('rsync -a --no-perms --delete --chown=root:root -e "$RSYNC_SSH"');
  const normalizationStep = deploy.indexOf('log "Нормализую права доставленного релиза"', delivery);
  const checksum = deploy.indexOf('RSYNC_DIFFERENCES="$(rsync -a --no-perms --delete --chown=root:root --checksum', normalizationStep);
  assert.ok(delivery >= 0 && normalizationStep > delivery && checksum > normalizationStep);
});

test('deploy smoke and full acceptance both execute the shared resource contract', async () => {
  const [deploy, acceptance] = await Promise.all([
    readFile(join(PROJECT_ROOT, 'deploy/deploy.sh'), 'utf8'),
    readFile(join(PROJECT_ROOT, 'deploy/priyomka/verify-stage.mjs'), 'utf8'),
  ]);
  const smokeStart = deploy.indexOf('smoke_site() {');
  const smokeEnd = deploy.indexOf('\nrollback_to() {', smokeStart);
  assert.ok(smokeStart >= 0 && smokeEnd > smokeStart);
  const smoke = deploy.slice(smokeStart, smokeEnd);
  assert.match(smoke, /SITE_ORIGIN="\$ORIGIN" node deploy\/priyomka\/verify-resources\.mjs \|\| return 1/);

  const acceptanceCall = acceptance.indexOf('await verifyRepresentativeResources({ origin: ORIGIN })');
  const errorPropagation = acceptance.indexOf('errors.push(`resource smoke:', acceptanceCall);
  const summary = acceptance.indexOf('resources: {', errorPropagation);
  assert.ok(acceptanceCall >= 0 && errorPropagation > acceptanceCall && summary > errorPropagation);
});
