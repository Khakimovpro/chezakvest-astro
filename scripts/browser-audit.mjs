import { readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import process from 'node:process';

import sharp from 'sharp';

const projectRoot = process.cwd();
const distDirectory = join(projectRoot, 'dist');
const defaultBrowserPath = '/home/claude/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
const localHosts = new Set(['127.0.0.1', 'localhost']);

async function playwright() {
  try {
    return await import('playwright');
  } catch {
    throw new Error('Playwright is required for browser QA. Install it temporarily with npm install --no-save --package-lock=false playwright.');
  }
}

async function walkHtml(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkHtml(fullPath));
    else if (entry.name === 'index.html') files.push(fullPath);
  }
  return files;
}

function routeForOutputFile(filePath) {
  const path = relative(distDirectory, filePath).replaceAll('\\', '/');
  if (path === 'index.html') return '/';
  return `/${path.replace(/\/index\.html$/, '')}/`;
}

function isLocalUrl(value) {
  try {
    return localHosts.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

function localAssetPath(value) {
  try {
    const url = new URL(value);
    if (!localHosts.has(url.hostname)) return '';
    const pathname = decodeURIComponent(url.pathname).replace(/^\/chezakvest-preview(?=\/)/, '');
    return pathname.startsWith('/assets/') ? join(projectRoot, 'public', pathname) : '';
  } catch {
    return '';
  }
}

async function auditBrowser({ baseUrl, reportPath }) {
  const { chromium } = await playwright();
  const files = await walkHtml(distDirectory);
  const requestedRoutes = (process.env.AUDIT_ROUTES || '').split(',').map((route) => route.trim()).filter(Boolean);
  const routes = files.map(routeForOutputFile)
    .filter((route) => route !== '/404/' && (requestedRoutes.length === 0 || requestedRoutes.includes(route)))
    .sort();
  const browser = await chromium.launch({ executablePath: defaultBrowserPath, args: ['--no-sandbox', '--disable-gpu'] });
  const imageMetadata = new Map();
  const report = {
    baseUrl,
    routesChecked: routes.length,
    checkedAt: new Date().toISOString(),
    imageFailures: [],
    overflows: [],
    consoleErrors: [],
    failedRequests: [],
    externalRequests: [],
  };

  const metadataFor = async (source) => {
    const assetPath = localAssetPath(source);
    if (!assetPath) return null;
    if (imageMetadata.has(assetPath)) return imageMetadata.get(assetPath);
    try {
      const metadata = await sharp(assetPath).metadata();
      const value = { width: metadata.width, height: metadata.height, assetPath: assetPath.replace(`${projectRoot}/public`, '') };
      imageMetadata.set(assetPath, value);
      return value;
    } catch {
      imageMetadata.set(assetPath, null);
      return null;
    }
  };

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 800 },
  ]) {
    for (const route of routes) {
      // Closing a context after each route releases decoded image buffers. This matters
      // for the complete 67-page audit, where keeping one context alive exhausts RAM.
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const outsideHosts = new Set();
      page.on('request', (request) => {
        const source = request.url();
        if (/^data:/iu.test(source) || isLocalUrl(source)) return;
        try {
          outsideHosts.add(new URL(source).hostname);
        } catch {
          // Non-URL request values cannot leave the document origin.
        }
      });
      page.on('requestfailed', (request) => report.failedRequests.push({ viewport: viewport.name, route, url: request.url() }));
      page.on('console', (message) => {
        if (message.type() === 'error') report.consoleErrors.push({ viewport: viewport.name, route, text: message.text() });
      });

      await page.goto(new URL(route, baseUrl).href, { waitUntil: 'load', timeout: 30_000 });
      await page.evaluate(async () => {
        await document.fonts?.ready;
        for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      });
      const pageData = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        images: [...document.images].map((image) => {
          const rect = image.getBoundingClientRect();
          const style = getComputedStyle(image);
          return {
            source: image.currentSrc || image.src,
            renderedWidth: rect.width,
            renderedHeight: rect.height,
            visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
            complete: image.complete,
          };
        }),
      }));
      if (pageData.scrollWidth > viewport.width) {
        report.overflows.push({ viewport: viewport.name, route, scrollWidth: pageData.scrollWidth, viewportWidth: viewport.width });
      }
      for (const image of pageData.images) {
        if (!image.visible || image.renderedWidth < 80) continue;
        const metadata = await metadataFor(image.source);
        if (!metadata) continue;
        if (!image.complete || metadata.width < image.renderedWidth * 2) {
          report.imageFailures.push({
            viewport: viewport.name,
            route,
            asset: metadata.assetPath,
            rawWidth: metadata.width,
            rawHeight: metadata.height,
            renderedWidth: Math.round(image.renderedWidth),
            renderedHeight: Math.round(image.renderedHeight),
            ratio: Number((metadata.width / image.renderedWidth).toFixed(2)),
          });
        }
      }
      if (outsideHosts.size > 0) report.externalRequests.push({ viewport: viewport.name, route, hosts: [...outsideHosts].sort() });
      await context.close();
    }
  }
  await browser.close();

  const dedupedFailures = new Map();
  for (const failure of report.imageFailures) {
    const key = `${failure.viewport}|${failure.route}|${failure.asset}|${failure.renderedWidth}`;
    dedupedFailures.set(key, failure);
  }
  report.imageFailures = [...dedupedFailures.values()];
  report.summary = {
    imageFailures: report.imageFailures.length,
    desktopImageFailures: report.imageFailures.filter((failure) => failure.viewport === 'desktop').length,
    mobileImageFailures: report.imageFailures.filter((failure) => failure.viewport === 'mobile').length,
    overflows: report.overflows.length,
    consoleErrors: report.consoleErrors.length,
    failedRequests: report.failedRequests.length,
    externalRequests: report.externalRequests.length,
  };

  if (reportPath) await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

const [baseUrl = 'http://127.0.0.1:4322', reportPath] = process.argv.slice(2);
const report = await auditBrowser({ baseUrl, reportPath });
console.log(JSON.stringify({ ...report.summary, routesChecked: report.routesChecked, reportPath: reportPath || null }, null, 2));
