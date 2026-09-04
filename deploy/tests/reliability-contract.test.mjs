import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { activeReleaseMatchesBaseline } from '../priyomka/verify-stage.mjs';

const projectRoot = resolve(import.meta.dirname, '../..');

async function source(path) {
  return readFile(resolve(projectRoot, path), 'utf8');
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

function shellFunction(script, name) {
  const start = script.indexOf(`${name}() {`);
  assert.notEqual(start, -1, `missing function: ${name}`);
  const end = script.indexOf('\n}', start);
  assert.notEqual(end, -1, `unterminated function: ${name}`);
  return script.slice(start, end + 2);
}

function runBash(script, args = [], env = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('bash', ['-s', '--', ...args], {
      cwd: projectRoot,
      env: { ...process.env, ...env },
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

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeMockCommands(directory) {
  await mkdir(directory);
  await writeFile(join(directory, 'nginx'), '#!/bin/sh\nexit 0\n');
  await writeFile(join(directory, 'systemctl'), '#!/bin/sh\nexit 0\n');
  await writeFile(join(directory, 'install'), `#!/bin/bash
set -e
directory_mode=0
values=()
while (($#)); do
  case "$1" in
    -d) directory_mode=1; shift ;;
    -o|-g|-m) shift 2 ;;
    --) shift ;;
    *) values+=("$1"); shift ;;
  esac
done
if ((directory_mode)); then
  mkdir -p -- "\${values[@]}"
else
  cp -- "\${values[0]}" "\${values[1]}"
fi
`);
  await Promise.all(['nginx', 'systemctl', 'install'].map((name) => chmod(join(directory, name), 0o755)));
}

function sandboxDeployScript(script, fixture, releases, transactionDir) {
  return script
    .replaceAll('/etc/nginx/sites-enabled', join(fixture, 'sites-enabled'))
    .replaceAll('/etc/nginx/sites-available/default', join(fixture, 'default.conf'))
    .replaceAll('/var/www/chezakvest/releases/', `${releases}/`)
    .replace(
      'transaction_dir="/var/lib/chezakvest/deploy-transactions"',
      `transaction_dir="${transactionDir}"`,
    );
}

test('the actual disk guard fails closed below artifact plus reserve', async (context) => {
  const deploy = await source('deploy/deploy.sh');
  const guard = remoteScriptAfter(deploy, 'require_remote_space()');
  const fixture = await mkdtemp(join(tmpdir(), 'chezakvest-space-'));
  context.after(() => rm(fixture, { recursive: true, force: true }));
  const mockBin = join(fixture, 'bin');
  const releases = join(fixture, 'releases');
  await mkdir(mockBin);
  await mkdir(releases);
  await writeFile(join(mockBin, 'df'), '#!/bin/sh\nprintf "Avail\\n%s\\n" "$MOCK_AVAILABLE"\n');
  await chmod(join(mockBin, 'df'), 0o755);
  const env = { PATH: `${mockBin}:${process.env.PATH}` };

  const rejected = await runBash(guard, [releases, '60', '50', 'test'], {
    ...env,
    MOCK_AVAILABLE: '109',
  });
  assert.notEqual(rejected.code, 0);
  assert.match(rejected.stderr, /Недостаточно места/);

  const accepted = await runBash(guard, [releases, '60', '50', 'test'], {
    ...env,
    MOCK_AVAILABLE: '110',
  });
  assert.equal(accepted.code, 0, accepted.stderr);
});

test('the actual orphan cleanup refuses an unaccepted active release', async (context) => {
  const deploy = await source('deploy/deploy.sh');
  const cleanup = remoteScriptAfter(deploy, 'cleanup_remote_orphans()');
  const fixture = await mkdtemp(join(tmpdir(), 'chezakvest-orphans-'));
  context.after(() => rm(fixture, { recursive: true, force: true }));
  const releases = join(fixture, 'releases');
  const active = join(releases, '20260904T100000Z-11111111');
  const orphan = join(releases, '20260904T100100Z-22222222.incoming');
  const unaccepted = join(releases, '20260904T100200Z-33333333');
  const current = join(fixture, 'current');
  await mkdir(active, { recursive: true });
  await mkdir(orphan);
  await mkdir(unaccepted);
  await symlink(active, current);

  const rejected = await runBash(cleanup, [releases, current]);
  assert.notEqual(rejected.code, 0);
  assert.equal(await exists(orphan), true, 'fail-closed cleanup must not mutate before acceptance check');

  await writeFile(join(active, '.deploy-verified'), 'accepted\n');
  const accepted = await runBash(cleanup, [releases, current]);
  assert.equal(accepted.code, 0, accepted.stderr);
  assert.equal(await exists(active), true);
  assert.equal(await exists(orphan), false);
  assert.equal(await exists(unaccepted), false);
});

test('the actual release retention keeps only three accepted releases', async (context) => {
  const deploy = await source('deploy/deploy.sh');
  const retention = remoteScriptAfter(deploy, 'log "Оставляю на сервере три последних релиза"');
  const fixture = await mkdtemp(join(tmpdir(), 'chezakvest-retention-'));
  context.after(() => rm(fixture, { recursive: true, force: true }));
  const releases = join(fixture, 'releases');
  const names = [1, 2, 3, 4, 5].map((day) => `2026090${day}T100000Z-${String(day).repeat(8)}`);
  await mkdir(releases);
  for (const name of names) {
    await mkdir(join(releases, name));
    await writeFile(join(releases, name, '.deploy-verified'), 'accepted\n');
  }
  const unaccepted = join(releases, '20260906T100000Z-66666666');
  await mkdir(unaccepted);
  const current = join(fixture, 'current');
  await symlink(join(releases, names[0]), current);
  const marker = join(fixture, 'activated');
  await writeFile(marker, 'marker\n');

  const result = await runBash(retention, [releases, current, marker]);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(
    await Promise.all(names.map((name) => exists(join(releases, name)))),
    [true, false, false, true, true],
  );
  assert.equal(await exists(unaccepted), false);
  assert.equal(await exists(marker), false);
});

test('the actual nginx backup pruning preserves a referenced rollback copy', async (context) => {
  const deploy = await source('deploy/deploy.sh');
  const pruning = remoteScriptAfter(deploy, 'prune_remote_nginx_backups()');
  const fixture = await mkdtemp(join(tmpdir(), 'chezakvest-backups-'));
  context.after(() => rm(fixture, { recursive: true, force: true }));
  const targets = ['site.conf', 'common.conf', 'redirects.conf'].map((name) => join(fixture, name));
  for (const target of targets) await writeFile(target, 'current\n');
  const referenced = `${targets[0]}.bak-01`;
  for (const target of targets) {
    for (let index = 1; index <= 12; index += 1) {
      await writeFile(`${target}.bak-${String(index).padStart(2, '0')}`, 'backup\n');
    }
  }
  const manualState = join(fixture, 'rollback.tsv');
  const safeState = join(fixture, 'automatic-rollback.tsv');
  await writeFile(manualState, `#\ttoken\tproduction\n${targets[0]}\t1\t${referenced}\n`);

  const result = await runBash(pruning, ['10', manualState, safeState, ...targets]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(await exists(referenced), true);
  assert.equal(await exists(`${targets[0]}.bak-02`), false);
  assert.equal(await exists(`${targets[1]}.bak-01`), false);
  assert.equal(await exists(`${targets[1]}.bak-02`), false);
});

test('the actual cutover pruning bounds config and rollback-state history', async (context) => {
  const cutover = await source('deploy/enable-domain.sh');
  const pruning = remoteScriptAfter(cutover, 'prune_remote_backups()');
  const fixture = await mkdtemp(join(tmpdir(), 'chezakvest-cutover-backups-'));
  context.after(() => rm(fixture, { recursive: true, force: true }));
  const targets = ['site.conf', 'common.conf', 'renew-hook'].map((name) => join(fixture, name));
  for (const target of targets) {
    await writeFile(target, 'current\n');
    for (let index = 1; index <= 12; index += 1) {
      await writeFile(`${target}.bak-${String(index).padStart(2, '0')}`, 'backup\n');
    }
  }
  const manualState = join(fixture, 'rollback.tsv');
  const safeState = join(fixture, 'automatic-rollback.tsv');
  const transactionState = join(fixture, 'in-progress.tsv');
  await writeFile(manualState, `#\ttoken\tproduction\n${targets[0]}\t1\t${targets[0]}.bak-01\n`);
  for (let index = 1; index <= 12; index += 1) {
    await writeFile(join(fixture, `rollback.tsv.used-${String(index).padStart(2, '0')}`), 'state\n');
  }
  const result = await runBash(pruning, [
    '10',
    manualState,
    safeState,
    transactionState,
    ...targets,
    join(fixture, 'mutation.lock'),
  ]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(await exists(`${targets[0]}.bak-01`), true);
  assert.equal(await exists(`${targets[1]}.bak-01`), false);
  const remainingStates = (await readdir(fixture)).filter((name) => name.startsWith('rollback.tsv.used-'));
  assert.equal(remainingStates.length, 10);
});

test('APT maintenance installs a seven-day autoclean policy and clears archives immediately', async () => {
  const aptPolicy = await source('deploy/monitoring/52chezakvest-unattended-upgrades');
  const installer = await source('deploy/monitoring/ustanovit.sh');
  assert.match(aptPolicy, /APT::Periodic::AutocleanInterval "7";/);
  assert.match(installer, /apt-get clean/);
});

test('the actual deploy activation marker lets takeover restore release and nginx together', async (context) => {
  const deploy = await source('deploy/deploy.sh');
  const fixture = await mkdtemp(join(tmpdir(), 'chezakvest-deploy-recovery-'));
  context.after(() => rm(fixture, { recursive: true, force: true }));
  const releases = join(fixture, 'releases');
  const transactionDir = join(fixture, 'transactions');
  const sourceDir = join(fixture, 'source');
  const mockBin = join(fixture, 'bin');
  const enabledDir = join(fixture, 'sites-enabled');
  const previousName = '20260903T100000Z-11111111';
  const releaseName = '20260904T100000Z-22222222';
  const previous = join(releases, previousName);
  const release = join(releases, releaseName);
  const current = join(fixture, 'current');
  const site = join(fixture, 'site.conf');
  const common = join(fixture, 'common.conf');
  const redirects = join(fixture, 'redirects.conf');
  const mutationLock = join(fixture, 'mutation.lock');
  const token = '20260904T100000Z-deploy-123-456';
  await Promise.all([
    mkdir(previous, { recursive: true }),
    mkdir(release, { recursive: true }),
    mkdir(sourceDir),
    mkdir(enabledDir),
    mkdir(transactionDir),
  ]);
  await writeMockCommands(mockBin);
  await writeFile(join(previous, 'version.json'), '{"release":"old"}\n');
  await writeFile(join(previous, '.deploy-verified'), 'accepted\n');
  await writeFile(join(release, 'version.json'), '{"release":"new"}\n');
  await symlink(previous, current);
  await Promise.all([
    writeFile(site, 'old site\n'),
    writeFile(common, 'old common\n'),
    writeFile(redirects, 'old redirects\n'),
    writeFile(join(sourceDir, 'site.conf'), 'new site\n'),
    writeFile(join(sourceDir, 'common.conf'), 'new common\n'),
    writeFile(join(sourceDir, 'redirects.conf'), 'new redirects\n'),
  ]);
  await symlink(site, join(enabledDir, 'chezakvest.conf'));
  const env = { PATH: `${mockBin}:${process.env.PATH}` };
  const apply = sandboxDeployScript(
    remoteScriptAfter(deploy, 'apply_nginx_config()'),
    fixture,
    releases,
    transactionDir,
  );
  const applied = await runBash(apply, [
    sourceDir,
    'stage',
    site,
    common,
    redirects,
    '20260904T100000Z',
    '1',
    '1',
    '1',
    '1',
    '0',
    release,
    current,
    previous,
    releaseName,
    token,
    mutationLock,
  ], env);
  assert.equal(applied.code, 0, applied.stderr);
  assert.equal((await readFile(site, 'utf8')).trim(), 'new site');
  assert.equal((await readFile(join(transactionDir, `${releaseName}.activated`), 'utf8')).split('\t')[1], 'committed');
  assert.equal(await readFile(join(current, 'version.json'), 'utf8'), '{"release":"new"}\n');

  const marker = join(transactionDir, `${releaseName}.activated`);
  await writeFile(marker, (await readFile(marker, 'utf8')).replace('\tcommitted\t', '\tprepared\t'));
  const abandonedOwner = join(fixture, 'operation-owner.abandoned');
  await writeFile(abandonedOwner, `${token}\n`);
  const recovery = sandboxDeployScript(
    remoteScriptAfter(deploy, 'recover_interrupted_deploy()'),
    fixture,
    releases,
    transactionDir,
  );
  const recovered = await runBash(recovery, [
    abandonedOwner,
    token,
    transactionDir,
    current,
    releases,
    mutationLock,
    site,
    common,
    redirects,
  ], env);
  assert.equal(recovered.code, 0, recovered.stderr);
  assert.match(recovered.stdout, /^RECOVERED\t/m);
  assert.equal((await readFile(site, 'utf8')).trim(), 'old site');
  assert.equal((await readFile(common, 'utf8')).trim(), 'old common');
  assert.equal((await readFile(redirects, 'utf8')).trim(), 'old redirects');
  assert.equal(await exists(release), false);
  assert.equal(await exists(marker), false);
  assert.equal(await exists(abandonedOwner), false);
  assert.equal(await readFile(join(current, 'version.json'), 'utf8'), '{"release":"old"}\n');
});

test('deploy activation is mutation-locked and distinguishes prepared from committed', async () => {
  const deploy = await source('deploy/deploy.sh');
  const apply = remoteScriptAfter(deploy, 'apply_nginx_config()');
  const recovery = remoteScriptAfter(deploy, 'recover_interrupted_deploy()');
  assert.match(apply, /flock -w 120 8/);
  assert.match(recovery, /flock -w 120 8/);
  assert.ok(apply.indexOf('"prepared"') < apply.indexOf('mv -Tf -- "${current_link}.new"'));
  assert.ok(apply.indexOf('systemctl reload nginx') < apply.indexOf("sed 's/\\tprepared\\t/\\tcommitted\\t/'"));
  assert.match(recovery, /phase" == "prepared" \|\| "\$phase" == "committed/);
  assert.match(deploy, /PRESERVE_REMOTE_OWNER=1[\s\S]*owner-token сохранён/);
  assert.match(deploy, /REMOTE_OPERATION_OWNER="\/var\/lib\/chezakvest\/operation-owner"/);
});

test('deploy freezes config sources and rechecks fingerprint and TLS mode', async () => {
  const deploy = await source('deploy/deploy.sh');
  const fingerprint = deploy.indexOf('SOURCE_FINGERPRINT="$(source_fingerprint)"');
  const frozenConfig = deploy.indexOf('cp -- "$NGINX_SOURCE" "$LOCAL_CONFIG_DIR/site.conf"');
  const deliveryCheck = deploy.indexOf('assert_source_unchanged "доставка релиза"');
  const activationModeCheck = deploy.indexOf('|| die "состояние nginx изменилось с ${NGINX_MODE} на ${CURRENT_NGINX_MODE}; активация остановлена"');
  const apply = deploy.indexOf('if ! apply_nginx_config');
  assert.ok(fingerprint >= 0 && frozenConfig > fingerprint);
  assert.ok(deliveryCheck > frozenConfig && activationModeCheck > deliveryCheck);
  assert.ok(apply > activationModeCheck);
});

test('the actual production TLS-safe rollback is repeatable and leaves manual state separate', async (context) => {
  const cutover = await source('deploy/enable-domain.sh');
  const fixture = await mkdtemp(join(tmpdir(), 'chezakvest-cutover-recovery-'));
  context.after(() => rm(fixture, { recursive: true, force: true }));
  const mockBin = join(fixture, 'bin');
  await writeMockCommands(mockBin);
  const site = join(fixture, 'site.conf');
  const common = join(fixture, 'common.conf');
  const manualSiteBackup = `${site}.bak-http`;
  const manualCommonBackup = `${common}.bak-http`;
  const manualState = join(fixture, 'rollback.tsv');
  const safeState = join(fixture, 'automatic-rollback.tsv');
  const mutationLock = join(fixture, 'mutation.lock');
  const token = '20260904T100000Z-cutover-production-123-456';
  await Promise.all([
    writeFile(site, 'tls pre-hsts\n'),
    writeFile(common, 'common tls\n'),
    writeFile(manualSiteBackup, 'http only\n'),
    writeFile(manualCommonBackup, 'common http\n'),
  ]);
  const manualContent = `#\t${token}\tproduction\n${site}\t1\t${manualSiteBackup}\n${common}\t1\t${manualCommonBackup}\n`;
  await writeFile(manualState, manualContent);
  const env = { PATH: `${mockBin}:${process.env.PATH}` };

  const checkpoint = remoteScriptAfter(cutover, 'checkpoint_tls_safe_rollback()');
  const checkpointResult = await runBash(checkpoint, [
    safeState,
    manualState,
    token,
    'production',
    site,
    common,
    mutationLock,
  ], env);
  assert.equal(checkpointResult.code, 0, checkpointResult.stderr);
  assert.equal(await readFile(manualState, 'utf8'), manualContent);
  assert.equal(await exists(safeState), true);

  const restore = remoteScriptAfter(cutover, 'restore_remote_config()')
    .replaceAll('/etc/nginx/*', `${fixture}/*`);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await writeFile(site, 'tls with hsts\n');
    const restored = await runBash(restore, [safeState, token, 'production', mutationLock], env);
    assert.equal(restored.code, 0, restored.stderr);
    assert.equal(await readFile(site, 'utf8'), 'tls pre-hsts\n');
    assert.equal(await readFile(common, 'utf8'), 'common tls\n');
    assert.equal(await exists(safeState), true, 'lost SSH response must still allow the same safe recovery');
    assert.equal(await readFile(manualState, 'utf8'), manualContent);
  }
});

test('production failures select TLS-safe state while manual rollback remains separate', async () => {
  const cutover = await source('deploy/enable-domain.sh');
  const selector = shellFunction(cutover, 'automatic_rollback_state');
  const safe = await runBash(`${selector}\nautomatic_rollback_state\n`, [], {
    STAGE: 'production',
    TLS_SAFE_CHECKPOINT: '1',
    REMOTE_SAFE_ROLLBACK_STATE: '/safe',
    REMOTE_ROLLBACK_STATE: '/manual',
  });
  assert.equal(safe.code, 0, safe.stderr);
  assert.equal(safe.stdout.trim(), '/safe');
  const early = await runBash(`${selector}\nautomatic_rollback_state\n`, [], {
    STAGE: 'production',
    TLS_SAFE_CHECKPOINT: '0',
    REMOTE_SAFE_ROLLBACK_STATE: '/safe',
    REMOTE_ROLLBACK_STATE: '/manual',
  });
  assert.equal(early.stdout.trim(), '/manual');

  const checkpoint = cutover.lastIndexOf('checkpoint_tls_safe_rollback');
  const checkpointEnabled = cutover.indexOf('TLS_SAFE_CHECKPOINT=1', checkpoint);
  const hstsInstall = cutover.indexOf('install_site_config "tls-final.conf"', checkpoint);
  assert.ok(checkpoint >= 0 && checkpointEnabled > checkpoint && hstsInstall > checkpointEnabled);
  assert.match(cutover, /matching_recovery_state/);
  assert.match(cutover, /REMOTE_TRANSACTION_STATE=.*in-progress\.tsv/);
  assert.match(cutover, /PRESERVE_REMOTE_OWNER=1/);
  assert.match(cutover, /REMOTE_OPERATION_OWNER="\/var\/lib\/chezakvest\/operation-owner"/);
});

test('acceptance baseline comparison rejects any release identity mismatch', () => {
  const baseline = {
    release: '20260903T230843Z-4e7930cc',
    commit: '4e7930cc00000000000000000000000000000000',
    shortCommit: '4e7930cc',
  };
  const matching = {
    name: baseline.release,
    version: {
      release: baseline.release,
      commit: baseline.commit,
      shortCommit: baseline.shortCommit,
    },
  };
  assert.equal(activeReleaseMatchesBaseline(matching, baseline), true);
  assert.equal(activeReleaseMatchesBaseline({ ...matching, name: '20260904T000000Z-deadbeef' }, baseline), false);
  assert.equal(activeReleaseMatchesBaseline({
    ...matching,
    version: { ...matching.version, commit: 'deadbeef' },
  }, baseline), false);
  assert.equal(activeReleaseMatchesBaseline({
    ...matching,
    version: { ...matching.version, shortCommit: 'deadbeef' },
  }, baseline), false);
  assert.equal(activeReleaseMatchesBaseline({
    ...matching,
    version: { ...matching.version, release: '20260904T000000Z-deadbeef' },
  }, baseline), false);
});

test('acceptance keeps the remote lock through final release check and summary write', async () => {
  const acceptance = await source('deploy/priyomka/verify-stage.mjs');
  const finalAssert = acceptance.indexOf('await assertRemoteLock();\n  const finalActiveRelease');
  const summaryWrite = acceptance.indexOf('await writeFile(SUMMARY_PATH', finalAssert);
  const afterWriteAssert = acceptance.indexOf('await assertRemoteLock();', summaryWrite);
  assert.ok(finalAssert >= 0 && summaryWrite > finalAssert && afterWriteAssert > summaryWrite);
  assert.match(acceptance, /toString\('base64url'\)/);
  assert.doesNotMatch(acceptance, /'sh', '-s', '--', \.\.\.timingPaths/);
});
