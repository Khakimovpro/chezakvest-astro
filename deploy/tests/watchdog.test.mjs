import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const projectRoot = resolve(import.meta.dirname, '../..');
const watchdog = join(projectRoot, 'deploy/monitoring/chezakvest-watchdog.sh');

function runWatchdog(env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('bash', [watchdog], {
      cwd: projectRoot,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => resolvePromise({
      code,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    }));
  });
}

test('watchdog probes the internal vhost and requires the active accepted release', async (context) => {
  const fixture = await mkdtemp(join(tmpdir(), 'chezakvest-watchdog-'));
  context.after(() => rm(fixture, { recursive: true, force: true }));
  const releases = join(fixture, 'releases');
  const releaseName = '20260904T123456Z-1234abcd';
  const release = join(releases, releaseName);
  const current = join(fixture, 'current');
  const state = join(fixture, 'state');
  const mockBin = join(fixture, 'bin');
  const reloadLog = join(fixture, 'reload.log');
  await mkdir(release, { recursive: true });
  await mkdir(mockBin);
  await writeFile(join(release, '.deploy-verified'), 'accepted\n');
  await symlink(release, current);
  await writeFile(join(mockBin, 'systemctl'), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${reloadLog}'\n`);
  await chmod(join(mockBin, 'systemctl'), 0o755);

  let advertisedRelease = releaseName;
  const server = http.createServer((request, response) => {
    if (request.headers.host !== '82.146.60.212') {
      response.writeHead(301, { Location: 'https://example.invalid/' });
      response.end();
      return;
    }
    if (request.url === '/version.json') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        commit: '1234abcd1234abcd1234abcd1234abcd1234abcd',
        release: advertisedRelease,
      }));
      return;
    }
    response.writeHead(200);
    response.end('ok');
  });
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  context.after(() => new Promise((resolvePromise) => server.close(resolvePromise)));
  const { port } = server.address();
  const env = {
    CHEZAKVEST_WATCHDOG_STATE_DIR: state,
    CHEZAKVEST_WATCHDOG_HOME_URL: `http://127.0.0.1:${port}/`,
    CHEZAKVEST_WATCHDOG_VERSION_URL: `http://127.0.0.1:${port}/version.json`,
    CHEZAKVEST_WATCHDOG_CURRENT_LINK: current,
    CHEZAKVEST_WATCHDOG_RELEASES_DIR: releases,
    PATH: `${mockBin}:${process.env.PATH}`,
  };

  const healthy = await runWatchdog(env);
  assert.equal(healthy.code, 0, healthy.stderr);
  assert.match(healthy.stdout, /OK home=200 version=active_release consecutive_failures=0/);

  await rm(join(release, '.deploy-verified'));
  const unaccepted = await runWatchdog(env);
  assert.match(unaccepted.stdout, /version=invalid_or_inactive consecutive_failures=1/);
  await writeFile(join(release, '.deploy-verified'), 'accepted\n');
  const acceptedAgain = await runWatchdog(env);
  assert.match(acceptedAgain.stdout, /OK home=200 version=active_release consecutive_failures=0/);

  advertisedRelease = '20260904T123457Z-deadbeef';
  const firstFailure = await runWatchdog(env);
  const secondFailure = await runWatchdog(env);
  const thirdFailure = await runWatchdog(env);
  const fourthFailure = await runWatchdog(env);
  const fifthFailure = await runWatchdog(env);
  const sixthFailure = await runWatchdog(env);
  assert.match(firstFailure.stdout, /consecutive_failures=1/);
  assert.match(secondFailure.stdout, /consecutive_failures=2/);
  assert.match(thirdFailure.stdout, /consecutive_failures=3/);
  assert.match(thirdFailure.stdout, /ACTION reload_nginx threshold=3 result=success/);
  assert.match(fourthFailure.stdout, /consecutive_failures=4/);
  assert.match(fifthFailure.stdout, /consecutive_failures=5/);
  assert.match(sixthFailure.stdout, /consecutive_failures=6/);
  assert.match(sixthFailure.stdout, /ACTION reload_nginx threshold=3 result=success/);
  assert.equal(await readFile(reloadLog, 'utf8'), 'reload nginx\nreload nginx\n');
});
