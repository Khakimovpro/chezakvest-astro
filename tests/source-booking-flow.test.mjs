import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { readFile, stat, mkdtemp, rm } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { promisify } from 'node:util';

import { chromium } from 'playwright';

const run = promisify(execFile);
const root = new URL('../', import.meta.url).pathname;
let dist;
const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

async function buildAndServe(t) {
  dist = await mkdtemp('/tmp/cheza-source-booking-');
  t.after(() => rm(dist, {recursive:true,force:true}));
  await run('flock', ['/tmp/chezakvest-sborka.lock', '/usr/bin/flock', '/tmp/chezakvest-astro-test-build.lock', 'node_modules/.bin/astro', 'build', '--outDir', dist], { cwd: root });
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://site.test').pathname);
    const relative = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const file = normalize(join(dist, relative));
    if (!file.startsWith(`${dist}/`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const info = await stat(file);
      if (!info.isFile()) throw new Error('not a file');
      response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

test('the real source booking dialog validates before sending to amo and redirecting', { timeout: 120_000 }, async (t) => {
  const base = await buildAndServe(t);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  t.after(async () => browser.close());
  const page = await browser.newPage();
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  let deliveries = 0;
  await page.route('**/api/lead', route => { deliveries++; return route.fulfill({json:{ok:true}}); });
  await page.goto(`${base}/#source-booking`, { waitUntil: 'domcontentloaded' });
  const form = page.locator('#source-booking form[data-lead-form]');
  await form.waitFor();
  await page.waitForFunction(() => !document.querySelector('#source-booking form')?.hasAttribute('data-local-form-pending'));
  await page.locator('#source-booking-name').fill('Анна2');
  await page.locator('#source-booking-phone').fill('928 216 36 23');
  await page.locator('#source-booking input[name="consent"]').check();
  await page.locator('#source-booking [data-lead-submit]').click();
  assert.equal(deliveries, 0);

  await page.locator('#source-booking-name').fill('Анна');
  await page.locator('#source-booking [data-lead-submit]').click();
  await page.waitForURL('**/spasibo/?form=booking');
  assert.equal(deliveries, 1);
});
