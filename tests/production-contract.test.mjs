import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { verifyProductionContract } from '../scripts/production-contract.mjs';

const ORIGIN = 'https://xn--80aehcht5ci1b.xn--p1ai';
const REQUIRED_PATHS = [
  '/',
  '/privacy',
  '/igra-v-kalmara-lend',
  '/minecraft-lend',
  '/roblox-land',
  '/amongus-land',
];
const LEGACY_TARGETS = new Map([
  ['/igra-v-kalmara-lend', '/igra_v_kalmara'],
  ['/minecraft-lend', '/minecraft'],
  ['/roblox-land', '/roblox'],
  ['/amongus-land', '/among_us'],
]);

function pageHtml(pathname, {
  inertForm = false,
  slashlessCanonical = false,
  canonicalPath = pathname,
  noindex = false,
  leadForms = 0,
  extraBody = '',
  jsonLd = '{"@context":"https://schema.org","@type":"WebSite"}',
} = {}) {
  const form = inertForm
    ? '<form onsubmit="return false"><input name="phone"></form>'
    : `<form data-lead-form data-lead-target="https://wa.me/79282163623">
      <input name="name" required><input name="phone" required><input name="consent" required>
      <button type="button" data-lead-submit>Send</button><p data-lead-status role="status"></p>
    </form>`;
  const canonical = canonicalPath === '/'
    ? `${ORIGIN}/`
    : `${ORIGIN}${canonicalPath}${slashlessCanonical ? '' : '/'}`;

  return `<!doctype html>
  <html lang="ru">
    <head>
      <title>Чё за Квест</title>
      <meta name="description" content="Квесты в Ростове-на-Дону">
      <link rel="canonical" href="${canonical}">
      ${noindex ? '<meta name="robots" content="noindex, follow">' : ''}
      <meta property="og:title" content="Чё за Квест">
      <meta property="og:description" content="Квесты в Ростове-на-Дону">
      <meta property="og:url" content="${canonical}">
      <meta property="og:image" content="${ORIGIN}/assets/og.webp">
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:title" content="Чё за Квест">
      <meta name="twitter:description" content="Квесты в Ростове-на-Дону">
      <meta name="twitter:image" content="${ORIGIN}/assets/og.webp">
      <script type="application/ld+json">${jsonLd}</script>
    </head>
    <body>${Array.from({ length: leadForms }, () => form).join('')}${extraBody}</body>
  </html>`;
}

async function writePage(distDir, pathname, html) {
  const file = pathname === '/' ? join(distDir, 'index.html') : join(distDir, pathname.slice(1), 'index.html');
  await mkdir(join(file, '..'), { recursive: true });
  await writeFile(file, html);
}

async function createValidDist({ inertForm = false, slashlessCanonical = false, slashlessSitemap = false } = {}) {
  const distDir = await mkdtemp(join(tmpdir(), 'cheza-contract-'));
  await writeFile(join(distDir, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`);
  await writeFile(join(distDir, 'sitemap.xml'), `<urlset><url><loc>${slashlessSitemap ? ORIGIN : `${ORIGIN}/`}</loc></url></urlset>`);
  await Promise.all(REQUIRED_PATHS.map((pathname) => writePage(distDir, pathname, pageHtml(pathname, {
    inertForm,
    slashlessCanonical,
    canonicalPath: LEGACY_TARGETS.get(pathname) || pathname,
    noindex: pathname === '/privacy' || LEGACY_TARGETS.has(pathname),
    leadForms: pathname === '/' ? 1 : 0,
  }))));
  return distDir;
}

test('accepts a complete static SEO and lead-capture build', async () => {
  const distDir = await createValidDist();
  const report = await verifyProductionContract({ distDir, origin: ORIGIN, requiredPaths: REQUIRED_PATHS });

  assert.equal(report.pagesChecked, REQUIRED_PATHS.length);
  assert.deepEqual(report.errors, []);
});

test('rejects a missing P0 route from the generated site', async () => {
  const distDir = await createValidDist();
  const report = await verifyProductionContract({ distDir, origin: ORIGIN, requiredPaths: [...REQUIRED_PATHS, '/missing-route'] });

  assert.ok(report.errors.some((error) => error.includes('/missing-route')));
});

test('rejects a published form that deliberately cancels submission', async () => {
  const distDir = await createValidDist({ inertForm: true });
  const report = await verifyProductionContract({ distDir, origin: ORIGIN, requiredPaths: REQUIRED_PATHS });

  assert.ok(report.errors.some((error) => error.includes('inert form')));
});

test('rejects a build that drops the primary lead forms', async () => {
  const distDir = await createValidDist();
  await writePage(distDir, '/', pageHtml('/'));
  const report = await verifyProductionContract({ distDir, origin: ORIGIN, requiredPaths: REQUIRED_PATHS });

  assert.ok(report.errors.some((error) => error.includes('expected a primary lead form')));
});

test('rejects an internal link to a missing generated route', async () => {
  const distDir = await createValidDist();
  await writePage(distDir, '/', pageHtml('/', { leadForms: 1, extraBody: '<a href="/missing/">Missing</a>' }));
  const report = await verifyProductionContract({ distDir, origin: ORIGIN, requiredPaths: REQUIRED_PATHS });

  assert.ok(report.errors.some((error) => error.includes('internal link has no generated target')));
});

test('rejects a current-page fragment that has no anchor target', async () => {
  const distDir = await createValidDist();
  await writePage(distDir, '/', pageHtml('/', { leadForms: 1, extraBody: '<a href="#ghost">Ghost</a>' }));
  const report = await verifyProductionContract({ distDir, origin: ORIGIN, requiredPaths: REQUIRED_PATHS });

  assert.ok(report.errors.some((error) => error.includes('internal link fragment has no target')));
});

test('rejects empty or type-less JSON-LD', async () => {
  const distDir = await createValidDist();
  await writePage(distDir, '/', pageHtml('/', { leadForms: 1, jsonLd: '{}' }));
  const report = await verifyProductionContract({ distDir, origin: ORIGIN, requiredPaths: REQUIRED_PATHS });

  assert.ok(report.errors.some((error) => error.includes('JSON-LD has no schema.org context and type')));
});

test('requires breadcrumb schema on indexable inner pages', async () => {
  const distDir = await createValidDist();
  await writePage(distDir, '/quest', pageHtml('/quest'));
  const report = await verifyProductionContract({ distDir, origin: ORIGIN, requiredPaths: REQUIRED_PATHS });

  assert.ok(report.errors.some((error) => error.includes('/quest') && error.includes('missing BreadcrumbList')));
});

test('rejects a public raw Tilda archive route', async () => {
  const distDir = await createValidDist();
  await writePage(distDir, '/tilda', pageHtml('/tilda'));
  const report = await verifyProductionContract({ distDir, origin: ORIGIN, requiredPaths: REQUIRED_PATHS });

  assert.ok(report.errors.some((error) => error.includes('/tilda') && error.includes('must not be published')));
});

test('rejects slashless canonical URLs that would redirect on a static-directory host', async () => {
  const distDir = await createValidDist({ slashlessCanonical: true });
  const report = await verifyProductionContract({ distDir, origin: ORIGIN, requiredPaths: REQUIRED_PATHS });

  assert.ok(report.errors.some((error) => error.includes('canonical does not match the published URL')));
});

test('rejects a legacy fallback that canonicals to its old URL instead of its migrated target', async () => {
  const distDir = await createValidDist();
  await writePage(distDir, '/minecraft-lend', pageHtml('/minecraft-lend', { noindex: true }));
  const report = await verifyProductionContract({ distDir, origin: ORIGIN, requiredPaths: REQUIRED_PATHS });

  assert.ok(report.errors.some((error) => error.includes('/minecraft-lend') && error.includes('canonical does not match')));
});

test('rejects slashless sitemap locations', async () => {
  const distDir = await createValidDist({ slashlessSitemap: true });
  const report = await verifyProductionContract({ distDir, origin: ORIGIN, requiredPaths: REQUIRED_PATHS });

  assert.ok(report.errors.some((error) => error.includes('sitemap.xml: URL is not in the canonical trailing-slash form')));
});
