import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { chromium } from 'playwright';

const ORIGIN = (process.env.SOURCE_ORIGIN || 'https://xn--80aehcht5ci1b.xn--p1ai').replace(/\/$/u, '');
const PROJECT = new URL('../', import.meta.url).pathname;
const route = process.argv[2] || '/';
const slug = route === '/' ? 'home' : route.replace(/^\/+|\/+$/gu, '').replaceAll('/', '__');
const targetDirectory = join(PROJECT, 'migration', 'parity', 'source-overrides');
const target = join(targetDirectory, `${slug}.html`);
const browser = await chromium.launch({
  executablePath: '/home/claude/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-gpu'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let response;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await page.goto(`${ORIGIN}${route}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      if (response?.ok()) break;
      throw new Error(`HTTP ${response?.status() ?? 'no response'}`);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await page.waitForTimeout(attempt * 1_000);
    }
  }
  if (!response?.ok()) throw lastError || new Error('Source response failed');
  for (let top = 0; top < await page.evaluate(() => document.documentElement.scrollHeight); top += 800) {
    await page.evaluate((scrollTop) => window.scrollTo(0, scrollTop), top);
    await page.waitForTimeout(50);
  }
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await document.fonts?.ready;
  });
  await page.waitForTimeout(1_000);
  // Runtime-normalised DOM is intentional: the home source uses inline
  // extensions to reorder/filter cards, and those scripts are not executable
  // in the safe snapshot. Capturing their resulting DOM preserves the visible
  // state before the sanitizer removes every script and external widget.
  const html = await page.content();
  if (html.length < 100_000 || !html.includes('id="allrecords"')) {
    throw new Error(`Source response is incomplete (${html.length} bytes)`);
  }
  await mkdir(targetDirectory, { recursive: true });
  await writeFile(target, html, 'utf8');
  process.stdout.write(`${JSON.stringify({ route, target, bytes: html.length })}\n`);
} finally {
  await browser.close();
}
