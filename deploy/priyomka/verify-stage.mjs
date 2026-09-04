#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import {
  canonicalTargetPath,
  isRedirect,
  loadLegacyUrlMap,
} from '../../migration/legacy-redirects.mjs';
import { verifyRepresentativeResources } from './verify-resources.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '../..');
const SUMMARY_PATH = join(SCRIPT_DIR, 'summary.json');
const RELEASE_BASELINE_PATH = join(SCRIPT_DIR, 'release-baseline.json');
const RELEASE_MANIFEST_PATH = join(SCRIPT_DIR, 'release-manifest.tsv');
const RELEASE_SITEMAP_PATH = join(SCRIPT_DIR, 'release-sitemap.tsv');
const ORIGIN = (process.env.SITE_ORIGIN ?? 'http://82.146.60.212').replace(/\/$/, '');
const SSH_KEY = process.env.CHEZAKVEST_SSH_KEY ?? join(homedir(), '.ssh', 'chezakvest_key');
const REMOTE_CURRENT = '/var/www/chezakvest/current';
const REMOTE_DEPLOY_LOCK = '/run/lock/chezakvest-deploy.lock';
const REMOTE_OPERATION_OWNER = '/var/lib/chezakvest/operation-owner';
const QUERY = '?utm_source=test';
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
};

let originUrl;
let sshTarget;
let remoteLockProcess;
let remoteLockLines;
let remoteLockClose;
let remoteLockStderr = '';

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function manifestFingerprint(entries) {
  const canonicalManifest = [...entries]
    .sort((first, second) => (first.path < second.path ? -1 : first.path > second.path ? 1 : 0))
    .map(({ path, size_bytes: sizeBytes }) => `${path}\t${sizeBytes}\n`)
    .join('');
  return sha256(canonicalManifest);
}

function diffManifestEntries(expectedEntries, actualEntries) {
  const expectedByPath = new Map(expectedEntries.map((entry) => [entry.path, entry.size_bytes]));
  const actualByPath = new Map(actualEntries.map((entry) => [entry.path, entry.size_bytes]));
  const differences = [];
  for (const [path, size] of expectedByPath) {
    if (!actualByPath.has(path)) {
      differences.push({ type: 'missing_on_server', path, local_bytes: size, server_bytes: '' });
    } else if (actualByPath.get(path) !== size) {
      differences.push({
        type: 'size_mismatch',
        path,
        local_bytes: size,
        server_bytes: actualByPath.get(path),
      });
    }
  }
  for (const [path, size] of actualByPath) {
    if (!expectedByPath.has(path)) {
      differences.push({ type: 'unexpected_on_server', path, local_bytes: '', server_bytes: size });
    }
  }
  return differences;
}

function assessReleaseContent(expectedEntries, actualEntries) {
  const differences = diffManifestEntries(expectedEntries, actualEntries);
  return {
    matches: differences.length === 0,
    baselineFingerprint: manifestFingerprint(expectedEntries),
    activeFingerprint: manifestFingerprint(actualEntries),
    differences,
  };
}

function assertReleaseContentMatchesBaseline(assessment, activeReleaseName) {
  if (assessment.matches) return;
  throw new Error(
    `acceptance baseline content ${assessment.baselineFingerprint.slice(0, 12)} does not match active release `
    + `${activeReleaseName} content ${assessment.activeFingerprint.slice(0, 12)}: `
    + `${assessment.differences.length} path/size mismatch(es); capture a new baseline first`,
  );
}

function tsvValue(value) {
  return String(value ?? '')
    .replaceAll('\t', ' ')
    .replaceAll('\r', '')
    .replaceAll('\n', '\\n');
}

async function writeTsv(filename, columns, rows) {
  const content = [
    columns.join('\t'),
    ...rows.map((row) => columns.map((column) => tsvValue(row[column])).join('\t')),
    '',
  ].join('\n');
  await writeFile(join(SCRIPT_DIR, filename), content, 'utf8');
}

function runProcess(command, args, {
  cwd = PROJECT_ROOT,
  env = process.env,
  input,
  timeoutMs = 120_000,
} = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      resolvePromise({
        code: code ?? 1,
        signal,
        timedOut,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });

    if (input === undefined) child.stdin.end();
    else child.stdin.end(input);
  });
}

async function runChecked(command, args, options) {
  const result = await runProcess(command, args, options);
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout).trim();
    throw new Error(`${command} exited with ${result.code}${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout;
}

function sshArgs() {
  return [
    '-i', SSH_KEY,
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=10',
    '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=4',
    sshTarget,
  ];
}

async function waitForRemoteLockLine(action, timeoutMs = 20_000) {
  let timeout;
  try {
    return await Promise.race([
      remoteLockLines.next().then(({ value, done }) => {
        if (done) throw new Error(`remote deploy lock closed while ${action}`);
        return value;
      }),
      remoteLockClose.then(({ code, signal }) => {
        throw new Error(
          `remote deploy lock exited while ${action}: code=${code ?? '<none>'} `
          + `signal=${signal ?? '<none>'}${remoteLockStderr.trim() ? `: ${remoteLockStderr.trim()}` : ''}`,
        );
      }),
      new Promise((resolvePromise, reject) => {
        timeout = setTimeout(() => reject(new Error(`timed out while ${action}`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function acquireRemoteLock() {
  const child = spawn('ssh', [
    ...sshArgs(),
    `exec 9>${REMOTE_DEPLOY_LOCK}; flock -n 9 || { printf 'BUSY\\n'; exit 75; }; `
    + `[ ! -e ${REMOTE_OPERATION_OWNER} ] || { printf 'STALE\\n'; exit 76; }; `
    + `printf 'LOCKED\\n'; while IFS= read -r command; do case "$command" in `
    + `PING) printf 'ALIVE\\n' ;; RELEASE) exit 0 ;; *) exit 64 ;; esac; done; exit 74`,
  ], { cwd: PROJECT_ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
  remoteLockProcess = child;
  remoteLockLines = createInterface({ input: child.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]();
  remoteLockClose = new Promise((resolvePromise) => {
    child.once('close', (code, signal) => resolvePromise({ code, signal }));
  });
  child.stderr.on('data', (chunk) => { remoteLockStderr += chunk.toString('utf8'); });
  child.once('error', (error) => { remoteLockStderr += `${error.message}\n`; });

  const response = await waitForRemoteLockLine('acquiring remote deploy lock');
  if (response !== 'LOCKED') {
    child.stdin.end();
    throw new Error('another deploy, cutover, or acceptance holds the remote lock');
  }
  return child;
}

async function assertRemoteLock() {
  if (!remoteLockProcess || remoteLockProcess.exitCode !== null || remoteLockProcess.signalCode !== null) {
    throw new Error('remote deploy lock is no longer held');
  }
  await new Promise((resolvePromise, reject) => {
    remoteLockProcess.stdin.write('PING\n', (error) => {
      if (error) reject(error);
      else resolvePromise();
    });
  });
  const response = await waitForRemoteLockLine('confirming remote deploy lock');
  if (response !== 'ALIVE') throw new Error('remote deploy lock returned an invalid health response');
}

async function releaseRemoteLock() {
  if (!remoteLockProcess) return Promise.resolve();
  const child = remoteLockProcess;
  const close = remoteLockClose;
  if (child.exitCode === null && child.signalCode === null) child.stdin.end('RELEASE\n');
  await Promise.race([
    close,
    new Promise((resolvePromise) => setTimeout(() => {
      child.kill('SIGTERM');
      resolvePromise();
    }, 5_000)),
  ]);
  remoteLockProcess = undefined;
  remoteLockLines = undefined;
  remoteLockClose = undefined;
  remoteLockStderr = '';
}

async function readActiveRelease() {
  const output = await runChecked('ssh', [
    ...sshArgs(),
    `set -eu
active=$(readlink -f -- ${REMOTE_CURRENT})
case "$active" in /var/www/chezakvest/releases/*) ;; *) exit 1 ;; esac
test -f "$active/.deploy-verified"
printf '%s\\n' "$active"
cat "$active/version.json"`,
  ]);
  const firstNewline = output.indexOf('\n');
  if (firstNewline < 0) throw new Error('active release preflight returned incomplete metadata');
  const path = output.slice(0, firstNewline);
  return {
    path,
    name: path.slice(path.lastIndexOf('/') + 1),
    version: JSON.parse(output.slice(firstNewline + 1)),
  };
}

function releaseMetadataDifferences(activeRelease, releaseBaseline) {
  const differences = [];
  if (releaseBaseline.release !== activeRelease.name) {
    differences.push(`release baseline=${releaseBaseline.release} active=${activeRelease.name}`);
  }
  if (releaseBaseline.commit !== activeRelease.version.commit) {
    differences.push(`commit baseline=${releaseBaseline.commit} active=${activeRelease.version.commit}`);
  }
  if (releaseBaseline.shortCommit !== activeRelease.version.shortCommit) {
    differences.push(`shortCommit baseline=${releaseBaseline.shortCommit} active=${activeRelease.version.shortCommit}`);
  }
  return differences;
}

function activeReleaseMetadataIssues(activeRelease) {
  const issues = [];
  const { name, version } = activeRelease;
  if (version.release !== name) issues.push(`version release ${version.release} != active directory ${name}`);
  if (!/^[0-9a-f]{40}$/u.test(version.commit ?? '')) issues.push('commit is not a full Git SHA');
  if (version.shortCommit !== version.commit?.slice(0, 8)) {
    issues.push(`shortCommit ${version.shortCommit} != commit prefix ${version.commit?.slice(0, 8) || '<missing>'}`);
  }
  if (!name.endsWith(`-${version.shortCommit}`)) {
    issues.push(`active directory ${name} does not end with shortCommit ${version.shortCommit}`);
  }
  return issues;
}

function activeReleaseIdentityMatches(first, second) {
  return first.name === second.name
    && first.version.release === second.version.release
    && first.version.commit === second.version.commit
    && first.version.shortCommit === second.version.shortCommit;
}

export {
  activeReleaseIdentityMatches,
  assessReleaseContent,
  assertReleaseContentMatchesBaseline,
  manifestFingerprint,
  releaseMetadataDifferences,
};

function responseHeader(response, name) {
  const value = response.headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(', ') : (value ?? '');
}

function requestPath(path, { headers = {}, timeoutMs = 30_000 } = {}) {
  return new Promise((resolvePromise, reject) => {
    const client = originUrl.protocol === 'https:' ? https : http;
    const started = process.hrtime.bigint();
    let ttfbMs = 0;
    const request = client.request({
      protocol: originUrl.protocol,
      hostname: originUrl.hostname,
      port: originUrl.port || undefined,
      method: 'GET',
      path,
      headers: {
        'user-agent': 'chezakvest-stage-acceptance/1.0',
        ...headers,
      },
    }, (response) => {
      ttfbMs = Number(process.hrtime.bigint() - started) / 1e6;
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        resolvePromise({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks),
          ttfbMs,
          totalMs: Number(process.hrtime.bigint() - started) / 1e6,
        });
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`request timed out after ${timeoutMs}ms`)));
    request.on('error', reject);
    request.end();
  });
}

async function mapLimit(items, concurrency, callback) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await callback(items[currentIndex], currentIndex);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function parseRemoteManifest(output) {
  return output.trim().split('\n').filter(Boolean).map((line) => {
    const separator = line.lastIndexOf('\t');
    if (separator < 0) throw new Error(`invalid remote manifest row: ${line}`);
    return {
      path: line.slice(0, separator),
      size_bytes: Number(line.slice(separator + 1)),
    };
  });
}

async function readReleaseManifest() {
  const [header, ...lines] = (await readFile(RELEASE_MANIFEST_PATH, 'utf8')).trimEnd().split('\n');
  if (header !== 'path\tsize_bytes') throw new Error('release-manifest.tsv has an invalid header');
  return lines.filter(Boolean).map((line) => {
    const separator = line.lastIndexOf('\t');
    if (separator < 0) throw new Error(`invalid release manifest row: ${line}`);
    return { path: line.slice(0, separator), size_bytes: Number(line.slice(separator + 1)) };
  });
}

async function readReleaseSitemapUrls() {
  const [header, ...lines] = (await readFile(RELEASE_SITEMAP_PATH, 'utf8')).trimEnd().split('\n');
  if (!header.startsWith('sitemap_url\t')) throw new Error('release-sitemap.tsv has an invalid header');
  return lines.filter(Boolean).map((line) => line.slice(0, line.indexOf('\t')));
}

function sumManifest(entries) {
  return entries.reduce((total, entry) => total + entry.size_bytes, 0);
}

function categorizeManifest(entries) {
  const images = new Set(['.avif', '.gif', '.ico', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
  const videos = new Set(['.mov', '.mp4', '.webm']);
  const categories = [
    ['all', () => true],
    ['_astro', ({ path }) => path.startsWith('_astro/')],
    ['images', ({ path }) => images.has(extname(path).toLowerCase())],
    ['videos', ({ path }) => videos.has(extname(path).toLowerCase())],
    ['media_total', ({ path }) => images.has(extname(path).toLowerCase()) || videos.has(extname(path).toLowerCase())],
  ];
  return Object.fromEntries(categories.map(([name, predicate]) => {
    const matching = entries.filter(predicate);
    return [name, { files: matching.length, bytes: sumManifest(matching) }];
  }));
}

function manifestPathToUrl(path) {
  if (path === 'index.html') return '/';
  if (path.endsWith('/index.html')) return `/${path.slice(0, -'index.html'.length)}`;
  return `/${path}`;
}

function parseNginxRules(text) {
  const rules = [];
  const invalidLines = [];
  const lines = text.trimEnd().split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (!line.startsWith('location = ')) continue;
    const match = line.match(/^location = (\S+) \{ return 301 (\S+)\$is_args\$args; \}$/);
    if (!match) invalidLines.push(index + 1);
    else rules.push({ source: match[1], target: match[2], line: index + 1 });
  }
  return { lines, rules, invalidLines };
}

function normalizeLocation(location, base) {
  if (!location) return '';
  try {
    return new URL(location, base).href;
  } catch {
    return '';
  }
}

function headerIssues(sample, response) {
  const issues = [];
  const contentType = responseHeader(response, 'content-type').toLowerCase();
  const cacheControl = responseHeader(response, 'cache-control').toLowerCase();
  const contentEncoding = responseHeader(response, 'content-encoding').toLowerCase();

  if (!sample.statuses.includes(response.status)) issues.push(`status ${response.status}`);
  if (!sample.contentTypes.some((expected) => contentType.startsWith(expected))) {
    issues.push(`Content-Type ${contentType || '<missing>'}`);
  }
  if (!sample.cacheTokens.every((token) => cacheControl.includes(token))) {
    issues.push(`Cache-Control ${cacheControl || '<missing>'}`);
  }
  if (sample.gzip && contentEncoding !== 'gzip') issues.push(`Content-Encoding ${contentEncoding || '<missing>'}`);
  if (!sample.gzip && contentEncoding) issues.push(`unexpected Content-Encoding ${contentEncoding}`);
  if (responseHeader(response, 'x-robots-tag').toLowerCase() !== 'noindex, nofollow') {
    issues.push(`X-Robots-Tag ${responseHeader(response, 'x-robots-tag') || '<missing>'}`);
  }
  for (const [name, expected] of Object.entries(SECURITY_HEADERS)) {
    if (responseHeader(response, name).toLowerCase() !== expected.toLowerCase()) {
      issues.push(`${name} ${responseHeader(response, name) || '<missing>'}`);
    }
  }
  return issues;
}

function timingSummary(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.source}\t${row.path}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([key, values]) => {
    const [source, path] = key.split('\t');
    const average = (field) => values.reduce((sum, value) => sum + value[field], 0) / values.length;
    const maximum = (field) => Math.max(...values.map((value) => value[field]));
    return {
      source,
      path,
      measurements: values.length,
      avg_ttfb_ms: round(average('ttfb_ms')),
      max_ttfb_ms: round(maximum('ttfb_ms')),
      avg_total_ms: round(average('total_ms')),
      max_total_ms: round(maximum('total_ms')),
      result: values.every((value) => value.status === 200) ? 'PASS' : 'FAIL',
    };
  });
}

async function main() {
  const errors = [];
  const startedAt = new Date().toISOString();
  await writeFile(SUMMARY_PATH, `${JSON.stringify({
    generatedAt: startedAt,
    origin: ORIGIN,
    verdict: 'RUNNING',
  }, null, 2)}\n`, 'utf8');
  originUrl = new URL(ORIGIN);
  if (!['http:', 'https:'].includes(originUrl.protocol)
    || originUrl.origin !== ORIGIN
    || originUrl.pathname !== '/') {
    throw new Error(`SITE_ORIGIN must be an absolute HTTP(S) origin without a path: ${ORIGIN}`);
  }
  sshTarget = process.env.CHEZAKVEST_SSH_TARGET ?? `root@${originUrl.hostname}`;
  await acquireRemoteLock();
  const gitHead = (await runChecked('git', ['rev-parse', 'HEAD'])).trim();
  const releaseBaseline = JSON.parse(await readFile(RELEASE_BASELINE_PATH, 'utf8'));
  const localEntries = await readReleaseManifest();
  if (localEntries.length !== releaseBaseline.files || sumManifest(localEntries) !== releaseBaseline.bytes) {
    throw new Error('release baseline metadata does not match release-manifest.tsv; capture a new baseline first');
  }
  const initialActiveRelease = await readActiveRelease();
  const activeMetadataIssues = activeReleaseMetadataIssues(initialActiveRelease);
  if (activeMetadataIssues.length > 0) {
    throw new Error(`active release metadata is invalid: ${activeMetadataIssues.join(', ')}`);
  }

  console.log('[1/8] Comparing local and deployed manifests');
  const remoteOutput = await runChecked('ssh', [
    ...sshArgs(),
    `cd ${REMOTE_CURRENT} && find . -type f -printf '%P\\t%s\\n' | LC_ALL=C sort`,
  ]);
  const remoteEntries = parseRemoteManifest(remoteOutput);
  const deploymentMetadata = remoteEntries.filter(({ path }) => path === '.deploy-verified');
  const remoteContentEntries = remoteEntries.filter(({ path }) => path !== '.deploy-verified');
  const contentAssessment = assessReleaseContent(localEntries, remoteContentEntries);
  const manifestDiff = contentAssessment.differences;
  const localCategories = categorizeManifest(localEntries);
  const remoteCategories = categorizeManifest(remoteContentEntries);
  const manifestSummaryRows = Object.keys(localCategories).map((category) => ({
    category,
    local_files: localCategories[category].files,
    server_files: remoteCategories[category].files,
    local_bytes: localCategories[category].bytes,
    server_bytes: remoteCategories[category].bytes,
    result: localCategories[category].files === remoteCategories[category].files
      && localCategories[category].bytes === remoteCategories[category].bytes ? 'PASS' : 'FAIL',
  }));
  await writeTsv('manifest-local.tsv', ['path', 'size_bytes'], localEntries);
  await writeTsv('manifest-server.tsv', ['path', 'size_bytes', 'kind'], remoteEntries.map((entry) => ({
    ...entry,
    kind: entry.path === '.deploy-verified' ? 'deployment_metadata' : 'site_content',
  })));
  await writeTsv('manifest-diff.tsv', ['type', 'path', 'local_bytes', 'server_bytes'], manifestDiff);
  await writeTsv('manifest-summary.tsv', ['category', 'local_files', 'server_files', 'local_bytes', 'server_bytes', 'result'], manifestSummaryRows);
  console.log(`  ${localEntries.length} baseline files / ${sumManifest(localEntries)} bytes; ${remoteContentEntries.length} deployed files / ${sumManifest(remoteContentEntries)} bytes; mismatches: ${manifestDiff.length}`);
  console.log(`  content fingerprint: ${contentAssessment.baselineFingerprint} (${contentAssessment.matches ? 'MATCH' : 'MISMATCH'})`);
  if (deploymentMetadata.length !== 1) {
    throw new Error(`active release has ${deploymentMetadata.length} .deploy-verified markers, expected one`);
  }
  assertReleaseContentMatchesBaseline(contentAssessment, initialActiveRelease.name);
  const releaseIdentityDifferences = releaseMetadataDifferences(initialActiveRelease, releaseBaseline);
  if (releaseIdentityDifferences.length > 0) {
    console.log(`  release metadata differs (informational): ${releaseIdentityDifferences.join('; ')}`);
  } else {
    console.log('  release metadata matches the baseline (informational)');
  }

  console.log('[2/8] Requesting every sitemap URL');
  const sitemapUrls = await readReleaseSitemapUrls();
  const uniqueSitemapUrls = new Set(sitemapUrls);
  if (sitemapUrls.length === 0) errors.push('sitemap: contains no URLs');
  if (sitemapUrls.length !== releaseBaseline.sitemapUrls) {
    errors.push(`sitemap baseline: ${sitemapUrls.length} URLs != ${releaseBaseline.sitemapUrls}`);
  }
  if (uniqueSitemapUrls.size !== sitemapUrls.length) errors.push(`sitemap: ${sitemapUrls.length - uniqueSitemapUrls.size} duplicate URL(s)`);
  const sitemapRows = await mapLimit(sitemapUrls, 4, async (sitemapUrl) => {
    const canonical = new URL(sitemapUrl);
    const stagePath = `${canonical.pathname}${canonical.search}`;
    const response = await requestPath(stagePath);
    const result = response.status === 200 ? 'PASS' : 'FAIL';
    if (result === 'FAIL') errors.push(`sitemap: ${stagePath} returned ${response.status}`);
    return {
      sitemap_url: sitemapUrl,
      stage_path: stagePath,
      status: response.status,
      size_bytes: response.body.length,
      ttfb_ms: round(response.ttfbMs),
      total_ms: round(response.totalMs),
      result,
    };
  });
  await writeTsv('sitemap-pages.tsv', ['sitemap_url', 'stage_path', 'status', 'size_bytes', 'ttfb_ms', 'total_ms', 'result'], sitemapRows);
  console.log(`  ${sitemapRows.length} URLs checked; non-200: ${sitemapRows.filter(({ status }) => status !== 200).length}`);

  console.log('[3/8] Verifying every legacy redirect and every canonical 200 row');
  const legacyEntries = await loadLegacyUrlMap();
  const redirectEntries = legacyEntries.filter(isRedirect);
  const publishedEntries = legacyEntries.filter((entry) => !isRedirect(entry));
  const nginxText = await readFile(join(PROJECT_ROOT, 'docs', 'nginx-legacy-redirects.conf'), 'utf8');
  const nginx = parseNginxRules(nginxText);
  const expectedRules = new Map(redirectEntries.map(({ source, target }) => [source, canonicalTargetPath(target)]));
  const actualRules = new Map(nginx.rules.map(({ source, target }) => [source, target]));
  const contractMismatches = [];
  for (const [source, target] of expectedRules) {
    if (!actualRules.has(source)) contractMismatches.push(`missing nginx rule ${source}`);
    else if (actualRules.get(source) !== target) contractMismatches.push(`${source}: nginx target ${actualRules.get(source)} != ${target}`);
  }
  for (const source of actualRules.keys()) {
    if (!expectedRules.has(source)) contractMismatches.push(`unexpected nginx rule ${source}`);
  }
  for (const line of nginx.invalidLines) contractMismatches.push(`invalid nginx rule syntax at line ${line}`);
  if (nginx.lines.length !== 100) contractMismatches.push(`nginx file has ${nginx.lines.length} lines, expected 100`);
  if (contractMismatches.length > 0) errors.push(`legacy contract: ${contractMismatches.length} mismatch(es)`);

  const redirectRows = await mapLimit(redirectEntries, 4, async ({ source, target, status }) => {
    const expectedPath = `${canonicalTargetPath(target)}${QUERY}`;
    const expectedLocation = new URL(expectedPath, `${ORIGIN}/`).href;
    const response = await requestPath(`${source}${QUERY}`);
    const location = responseHeader(response, 'location');
    const normalizedLocation = normalizeLocation(location, `${ORIGIN}${source}${QUERY}`);
    const queryPreserved = normalizedLocation ? new URL(normalizedLocation).search === QUERY : false;
    const issues = [];
    if (response.status !== 301) issues.push(`status ${response.status}`);
    if (normalizedLocation !== expectedLocation) issues.push(`Location ${location || '<missing>'}`);
    if (!queryPreserved) issues.push('query string lost');
    if (actualRules.get(source) !== canonicalTargetPath(target)) issues.push('nginx rule mismatch');
    if (issues.length > 0) errors.push(`legacy redirect ${source}: ${issues.join(', ')}`);
    return {
      source,
      map_status: status,
      expected_status: 301,
      actual_status: response.status,
      expected_location: expectedLocation,
      actual_location: location,
      query_preserved: queryPreserved ? 'yes' : 'no',
      nginx_rule_line: nginx.rules.find((rule) => rule.source === source)?.line ?? '',
      result: issues.length === 0 ? 'PASS' : `FAIL: ${issues.join('; ')}`,
    };
  });
  const publishedRows = await mapLimit(publishedEntries, 4, async ({ source, target, status }) => {
    const canonicalPath = canonicalTargetPath(source);
    const sourceRequestUrl = new URL(`${source}${QUERY}`, `${ORIGIN}/`).href;
    const expectedCanonicalLocation = new URL(`${canonicalPath}${QUERY}`, `${ORIGIN}/`).href;
    const sourceResponse = await requestPath(`${source}${QUERY}`);
    const sourceLocation = responseHeader(sourceResponse, 'location');
    const normalizedSourceLocation = normalizeLocation(sourceLocation, sourceRequestUrl);
    const canonicalResponse = await requestPath(`${canonicalPath}${QUERY}`);
    const canonicalLocation = responseHeader(canonicalResponse, 'location');
    const selfRedirect = normalizedSourceLocation === sourceRequestUrl;
    const queryPreserved = normalizedSourceLocation
      ? new URL(normalizedSourceLocation).search === QUERY
      : true;
    const issues = [];
    if (source !== target) issues.push(`source ${source} != target ${target}`);
    if (sourceResponse.status === 200) {
      if (sourceLocation) issues.push(`source returned unexpected Location ${sourceLocation}`);
    } else if (![301, 308].includes(sourceResponse.status)
      || normalizedSourceLocation !== expectedCanonicalLocation) {
      issues.push(`source status/Location ${sourceResponse.status} ${sourceLocation || '<missing>'}`);
    }
    if (selfRedirect) issues.push('source returned a self-redirect');
    if (!queryPreserved) issues.push('source normalization lost query string');
    if (canonicalResponse.status !== 200) issues.push(`canonical status ${canonicalResponse.status}`);
    if (canonicalLocation) issues.push(`canonical returned unexpected Location ${canonicalLocation}`);
    if (issues.length > 0) errors.push(`legacy 200 ${source}: ${issues.join(', ')}`);
    return {
      source,
      map_status: status,
      source_request: `${source}${QUERY}`,
      source_status: sourceResponse.status,
      source_location: sourceLocation,
      source_self_redirect: selfRedirect ? 'yes' : 'no',
      query_preserved: queryPreserved ? 'yes' : 'no',
      canonical_request: `${canonicalPath}${QUERY}`,
      canonical_status: canonicalResponse.status,
      canonical_location: canonicalLocation,
      result: issues.length === 0 ? 'PASS' : `FAIL: ${issues.join('; ')}`,
    };
  });
  await writeTsv('legacy-redirects.tsv', [
    'source', 'map_status', 'expected_status', 'actual_status', 'expected_location', 'actual_location',
    'query_preserved', 'nginx_rule_line', 'result',
  ], redirectRows);
  await writeTsv('legacy-200.tsv', [
    'source', 'map_status', 'source_request', 'source_status', 'source_location', 'source_self_redirect',
    'query_preserved', 'canonical_request', 'canonical_status', 'canonical_location', 'result',
  ], publishedRows);
  await writeTsv('legacy-contract-diff.tsv', ['mismatch'], contractMismatches.map((mismatch) => ({ mismatch })));
  console.log(`  nginx lines/rules: ${nginx.lines.length}/${nginx.rules.length}; CSV rows: ${legacyEntries.length} (${redirectEntries.length} redirects, ${publishedEntries.length} published); response mismatches: ${redirectRows.filter(({ result }) => result !== 'PASS').length + publishedRows.filter(({ result }) => result !== 'PASS').length}`);

  console.log('[4/8] Checking representative response headers');
  const largestMatching = (predicate) => [...localEntries].filter(predicate).sort((first, second) => second.size_bytes - first.size_bytes)[0];
  const smallestMatching = (predicate) => [...localEntries].filter(predicate).sort((first, second) => first.size_bytes - second.size_bytes)[0];
  const astroAsset = largestMatching(({ path }) => path.startsWith('_astro/') && ['.css', '.js'].includes(extname(path)));
  const imageAsset = largestMatching(({ path }) => ['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp'].includes(extname(path).toLowerCase()));
  const videoAsset = smallestMatching(({ path }) => extname(path).toLowerCase() === '.mp4');
  if (!astroAsset || !imageAsset || !videoAsset) throw new Error('dist is missing a representative _astro, image, or video asset');
  const headerSamples = [
    { label: 'HTML', path: '/', statuses: [200], contentTypes: ['text/html'], cacheTokens: ['no-cache'], gzip: true },
    { label: `_astro ${extname(astroAsset.path).slice(1).toUpperCase()}`, path: `/${astroAsset.path}`, statuses: [200], contentTypes: ['application/javascript', 'text/javascript', 'text/css'], cacheTokens: ['public', 'max-age=31536000', 'immutable'], gzip: true },
    { label: 'image', path: `/${imageAsset.path}`, statuses: [200], contentTypes: ['image/'], cacheTokens: ['max-age=2592000'], gzip: false },
    { label: 'video', path: `/${videoAsset.path}`, statuses: [200], contentTypes: ['video/mp4'], cacheTokens: ['max-age=2592000'], gzip: false },
  ];
  const headerRows = [];
  for (const sample of headerSamples) {
    const response = await requestPath(sample.path, {
      headers: {
        'accept-encoding': 'gzip',
      },
    });
    const issues = headerIssues(sample, response);
    if (issues.length > 0) errors.push(`headers ${sample.label}: ${issues.join(', ')}`);
    headerRows.push({
      resource: sample.label,
      path: sample.path,
      status: response.status,
      content_type: responseHeader(response, 'content-type'),
      cache_control: responseHeader(response, 'cache-control'),
      content_encoding: responseHeader(response, 'content-encoding') || '<none>',
      x_robots_tag: responseHeader(response, 'x-robots-tag'),
      x_content_type_options: responseHeader(response, 'x-content-type-options'),
      referrer_policy: responseHeader(response, 'referrer-policy'),
      x_frame_options: responseHeader(response, 'x-frame-options'),
      result: issues.length === 0 ? 'PASS' : `FAIL: ${issues.join('; ')}`,
    });
  }
  await writeTsv('headers.tsv', [
    'resource', 'path', 'status', 'content_type', 'cache_control', 'content_encoding', 'x_robots_tag',
    'x_content_type_options', 'referrer_policy', 'x_frame_options', 'result',
  ], headerRows);
  console.log(`  ${headerRows.length} resource classes checked; mismatches: ${headerRows.filter(({ result }) => result !== 'PASS').length}`);

  console.log('[5/8] Exercising 404, path handling, and version.json');
  const local404Sha = releaseBaseline.project404Sha256;
  const longPath = `/${'a'.repeat(2048)}`;
  const edgeCases = [
    { name: 'not_found', path: '/definitely-not-found-priyomka-669ace6', allowed: [404], requireProject404: true },
    { name: 'path_traversal', path: '/../etc/passwd', allowed: [400, 404], requireProject404: false },
    { name: 'double_slash', path: '//', allowed: [200, 301, 308, 404], requireProject404: false },
    { name: 'long_path', path: longPath, allowed: [400, 404, 414], requireProject404: false },
  ];
  const edgeRows = [];
  for (const edge of edgeCases) {
    const response = await requestPath(edge.path);
    const bodyText = response.body.toString('utf8');
    const bodySha = sha256(response.body);
    const project404Match = bodySha === local404Sha;
    const leakDetected = /root:x:|\/etc\/passwd|\/var\/www\/chezakvest|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/i.test(bodyText);
    const issues = [];
    if (!edge.allowed.includes(response.status)) issues.push(`status ${response.status}`);
    if (edge.requireProject404 && !project404Match) issues.push('body does not match dist/404.html');
    if (leakDetected) issues.push('sensitive path/content marker in body');
    if (issues.length > 0) errors.push(`edge ${edge.name}: ${issues.join(', ')}`);
    edgeRows.push({
      case: edge.name,
      path_preview: edge.path.length > 120 ? `${edge.path.slice(0, 117)}...` : edge.path,
      path_length: edge.path.length,
      status: response.status,
      size_bytes: response.body.length,
      body_sha256: bodySha,
      project_404_match: project404Match ? 'yes' : 'no',
      server_header: responseHeader(response, 'server'),
      leak_detected: leakDetected ? 'yes' : 'no',
      result: issues.length === 0 ? 'PASS' : `FAIL: ${issues.join('; ')}`,
    });
  }
  const versionResponse = await requestPath('/version.json');
  let version = null;
  const versionIssues = [];
  if (versionResponse.status !== 200) versionIssues.push(`status ${versionResponse.status}`);
  try {
    version = JSON.parse(versionResponse.body.toString('utf8'));
  } catch (error) {
    versionIssues.push(`invalid JSON: ${error.message}`);
  }
  if (!version || typeof version !== 'object' || Array.isArray(version)) {
    versionIssues.push('JSON root must be a release metadata object');
  } else {
    if (version.commit !== initialActiveRelease.version.commit) {
      versionIssues.push(`commit ${version.commit} != active release commit ${initialActiveRelease.version.commit}`);
    }
    if (version.shortCommit !== initialActiveRelease.version.shortCommit) {
      versionIssues.push(`shortCommit ${version.shortCommit} != active release shortCommit ${initialActiveRelease.version.shortCommit}`);
    }
    if (version.release !== initialActiveRelease.name) {
      versionIssues.push(`release ${version.release} != active release ${initialActiveRelease.name}`);
    }
    if (!version.builtAt || Number.isNaN(Date.parse(version.builtAt))) versionIssues.push('release/builtAt metadata is incomplete');
  }
  if (!responseHeader(versionResponse, 'content-type').toLowerCase().startsWith('application/json')) {
    versionIssues.push(`Content-Type ${responseHeader(versionResponse, 'content-type') || '<missing>'}`);
  }
  if (versionIssues.length > 0) errors.push(`version.json: ${versionIssues.join(', ')}`);
  await writeTsv('edge-cases.tsv', [
    'case', 'path_preview', 'path_length', 'status', 'size_bytes', 'body_sha256', 'project_404_match',
    'server_header', 'leak_detected', 'result',
  ], edgeRows);
  await writeFile(join(SCRIPT_DIR, 'stage-version.json'), `${JSON.stringify(version, null, 2)}\n`, 'utf8');
  console.log(`  ${edgeRows.length} edge cases checked; edge mismatches: ${edgeRows.filter(({ result }) => result !== 'PASS').length}; version: ${versionIssues.length === 0 ? 'valid' : 'invalid'}`);

  console.log('[6/8] Checking real resources referenced by representative pages');
  const resourceReport = await verifyRepresentativeResources({ origin: ORIGIN });
  for (const error of resourceReport.errors) errors.push(`resource smoke: ${error}`);
  await writeTsv('resources.tsv', [
    'kind', 'page', 'pageStatus', 'asset', 'assetStatus', 'assetBytes', 'contentType', 'result',
  ], resourceReport.rows);
  console.log(`  ${resourceReport.rows.length} page/resource samples checked; mismatches: ${resourceReport.errors.length}`);

  console.log('[7/8] Measuring three pages five times from dev and Moscow');
  const htmlEntries = localEntries
    .filter(({ path }) => path === 'index.html' || path.endsWith('/index.html'))
    .sort((first, second) => second.size_bytes - first.size_bytes);
  const timingPaths = ['/', ...htmlEntries.map(({ path }) => manifestPathToUrl(path)).filter((path) => path !== '/').slice(0, 2)];
  const timingRows = [];
  for (const path of timingPaths) {
    for (let run = 1; run <= 5; run += 1) {
      const response = await requestPath(path);
      timingRows.push({
        source: 'dev-server',
        path,
        run,
        status: response.status,
        size_bytes: response.body.length,
        ttfb_ms: round(response.ttfbMs),
        total_ms: round(response.totalMs),
      });
      if (response.status !== 200) errors.push(`timing dev ${path} run ${run}: status ${response.status}`);
    }
  }
  const encodedTimingPaths = timingPaths.map((path) => Buffer.from(path, 'utf8').toString('base64url'));
  const remoteTimingScript = `set -eu
for encoded_path do
  path=$(python3 -c 'import base64, sys
value = base64.urlsafe_b64decode(sys.argv[1] + "==").decode("utf-8")
if not value.startswith("/") or "\\n" in value or "\\r" in value:
    raise SystemExit(64)
print(value, end="")' "$encoded_path")
  run=1
  while [ "$run" -le 5 ]; do
    metrics=$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}\\t%{size_download}\\t%{time_starttransfer}\\t%{time_total}' "http://127.0.0.1\${path}")
    printf '%s\\t%s\\t%s\\n' "$path" "$run" "$metrics"
    run=$((run + 1))
  done
done
`;
  const remoteTimingResult = await runProcess('ssh', [
    ...sshArgs(),
    'sh', '-s', '--', ...encodedTimingPaths,
  ], { input: remoteTimingScript, timeoutMs: 180_000 });
  if (remoteTimingResult.code !== 0) {
    throw new Error(`remote timing failed: ${(remoteTimingResult.stderr || remoteTimingResult.stdout).trim()}`);
  }
  for (const line of remoteTimingResult.stdout.trim().split('\n').filter(Boolean)) {
    const [path, run, status, sizeBytes, ttfbSeconds, totalSeconds] = line.split('\t');
    const row = {
      source: 'moscow-server-loopback',
      path,
      run: Number(run),
      status: Number(status),
      size_bytes: Number(sizeBytes),
      ttfb_ms: round(Number(ttfbSeconds) * 1000),
      total_ms: round(Number(totalSeconds) * 1000),
    };
    timingRows.push(row);
    if (row.status !== 200) errors.push(`timing Moscow ${path} run ${run}: status ${row.status}`);
  }
  const timingSummaryRows = timingSummary(timingRows);
  for (const path of timingPaths) {
    for (const source of ['dev-server', 'moscow-server-loopback']) {
      const count = timingRows.filter((row) => row.path === path && row.source === source).length;
      if (count !== 5) errors.push(`timing ${source} ${path}: ${count} measurements, expected 5`);
    }
  }
  await writeTsv('timings-raw.tsv', ['source', 'path', 'run', 'status', 'size_bytes', 'ttfb_ms', 'total_ms'], timingRows);
  await writeTsv('timings-summary.tsv', [
    'source', 'path', 'measurements', 'avg_ttfb_ms', 'max_ttfb_ms', 'avg_total_ms', 'max_total_ms', 'result',
  ], timingSummaryRows);
  console.log(`  ${timingRows.length} measurements written (${timingSummaryRows.length} source/page summaries)`);

  console.log('[8/8] Proving the HTTP opt-in and running the live smoke');
  const smokeBaseEnv = {
    ...process.env,
    SITE_ORIGIN: ORIGIN,
    REQUIRE_SERVER_REDIRECTS: '1',
  };
  const defaultGuard = await runProcess('npm', ['run', 'verify:live'], {
    env: { ...smokeBaseEnv, ALLOW_INSECURE_ORIGIN: '0' },
    timeoutMs: 120_000,
  });
  const allowedSmoke = await runProcess('npm', ['run', 'verify:live'], {
    env: { ...smokeBaseEnv, ALLOW_INSECURE_ORIGIN: '1' },
    timeoutMs: 120_000,
  });
  const defaultGuardOutput = `${defaultGuard.stdout}${defaultGuard.stderr}`;
  const allowedSmokeOutput = `${allowedSmoke.stdout}${allowedSmoke.stderr}`;
  await writeFile(join(SCRIPT_DIR, 'live-smoke-default-guard.txt'), defaultGuardOutput, 'utf8');
  await writeFile(join(SCRIPT_DIR, 'live-smoke-http.txt'), allowedSmokeOutput, 'utf8');
  if (defaultGuard.code === 0 || !defaultGuardOutput.includes('must be an absolute HTTPS origin')) {
    errors.push('live smoke: HTTP origin was not rejected without ALLOW_INSECURE_ORIGIN=1');
  }
  if (allowedSmoke.code !== 0 || !allowedSmokeOutput.includes('Live smoke check passed')) {
    errors.push(`live smoke: explicitly allowed HTTP run failed with exit ${allowedSmoke.code}`);
  }
  const smokePages = Number(allowedSmokeOutput.match(/passed: (\d+) sitemap page/)?.[1] ?? 0);
  console.log(`  default guard exit: ${defaultGuard.code}; allowed HTTP exit: ${allowedSmoke.code}; sitemap pages: ${smokePages}`);

  await assertRemoteLock();
  const finalActiveRelease = await readActiveRelease();
  if (!activeReleaseIdentityMatches(finalActiveRelease, initialActiveRelease)) {
    errors.push(
      `active release changed during acceptance: expected ${initialActiveRelease.name}, `
      + `got ${finalActiveRelease.name || '<unknown>'}`,
    );
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    origin: ORIGIN,
    repositoryHead: gitHead,
    baselineRelease: {
      release: releaseBaseline.release,
      commit: releaseBaseline.commit,
      shortCommit: releaseBaseline.shortCommit,
      contentFingerprint: contentAssessment.baselineFingerprint,
    },
    activeRelease: {
      release: initialActiveRelease.name,
      commit: initialActiveRelease.version.commit,
      shortCommit: initialActiveRelease.version.shortCommit,
      contentFingerprint: contentAssessment.activeFingerprint,
      metadataMatchesBaseline: releaseIdentityDifferences.length === 0,
      metadataDifferences: releaseIdentityDifferences,
    },
    verdict: errors.length === 0 ? 'PASS' : 'FAIL',
    checks: {
      manifest: {
        localFiles: localEntries.length,
        localBytes: sumManifest(localEntries),
        serverContentFiles: remoteContentEntries.length,
        serverContentBytes: sumManifest(remoteContentEntries),
        deploymentMetadataFiles: deploymentMetadata.length,
        mismatches: manifestDiff.length,
        categories: Object.fromEntries(Object.keys(localCategories).map((category) => [category, {
          local: localCategories[category],
          server: remoteCategories[category],
        }])),
      },
      sitemap: {
        urls: sitemapRows.length,
        non200: sitemapRows.filter(({ status }) => status !== 200).length,
        totalResponseBytes: sitemapRows.reduce((sum, row) => sum + row.size_bytes, 0),
      },
      legacy: {
        nginxLines: nginx.lines.length,
        nginxRules: nginx.rules.length,
        csvRows: legacyEntries.length,
        redirectRows: redirectEntries.length,
        published200Rows: publishedEntries.length,
        publishedSourceNormalizationRedirects: publishedRows.filter(({ source_status: sourceStatus }) => [301, 308].includes(sourceStatus)).length,
        publishedSelfRedirects: publishedRows.filter(({ source_self_redirect: selfRedirect }) => selfRedirect === 'yes').length,
        contractMismatches: contractMismatches.length,
        responseMismatches: redirectRows.filter(({ result }) => result !== 'PASS').length
          + publishedRows.filter(({ result }) => result !== 'PASS').length,
        queryStringMismatches: redirectRows.filter(({ query_preserved: preserved }) => preserved !== 'yes').length,
      },
      headers: {
        samples: headerRows.length,
        mismatches: headerRows.filter(({ result }) => result !== 'PASS').length,
      },
      edges: {
        cases: edgeRows.length,
        mismatches: edgeRows.filter(({ result }) => result !== 'PASS').length,
        project404Sha256: local404Sha,
      },
      version: {
        valid: versionIssues.length === 0,
        data: version,
      },
      timings: timingSummaryRows,
      resources: {
        samples: resourceReport.rows.length,
        mismatches: resourceReport.errors.length,
      },
      liveSmoke: {
        defaultGuardExit: defaultGuard.code,
        allowedHttpExit: allowedSmoke.code,
        sitemapPages: smokePages,
      },
    },
    errors,
  };
  await writeFile(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await assertRemoteLock();

  if (errors.length > 0) {
    console.error(`Stage acceptance FAILED with ${errors.length} issue(s):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Stage acceptance PASSED: ${sitemapRows.length} pages, ${redirectEntries.length} redirects, ${localEntries.length} files, ${timingRows.length} timing measurements.`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeFile(SUMMARY_PATH, `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      origin: ORIGIN,
      verdict: 'FAIL',
      fatalError: message,
    }, null, 2)}\n`, 'utf8');
    console.error(`Stage acceptance FAILED: ${message}`);
    process.exitCode = 1;
  } finally {
    await releaseRemoteLock();
  }
}
