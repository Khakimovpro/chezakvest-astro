import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalTargetPath, isRedirect, isStaticFallback, loadLegacyUrlMap } from '../migration/legacy-redirects.mjs';
import { verifyLiveSite } from '../scripts/live-smoke.mjs';

const ORIGIN = 'https://xn--80aehcht5ci1b.xn--p1ai';
const LEGACY_REDIRECTS = (await loadLegacyUrlMap()).filter(isRedirect);
const LEGACY_TARGETS = new Map(LEGACY_REDIRECTS.map(({ source, target }) => [source, canonicalTargetPath(target)]));
const STATIC_FALLBACK_PATHS = new Set(LEGACY_REDIRECTS.filter(isStaticFallback).map(({ source }) => source));

function page(pathname, { noindex = false, slashlessCanonical = false } = {}) {
  const canonical = pathname === '/'
    ? `${ORIGIN}/`
    : `${ORIGIN}${pathname}${slashlessCanonical ? '' : '/'}`;
  return `<!doctype html><html><head>
    <link rel="canonical" href="${canonical}">
    ${noindex ? '<meta name="robots" content="noindex, follow">' : ''}
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite"}</script>
  </head><body>ok</body></html>`;
}

function response(status, body = '', headers = {}) {
  return new Response(body, { status, headers });
}

function createFetch({
  missingPath,
  slashlessCanonical = false,
  slashNormalizeLegacy = false,
  redirectStatus = 301,
  serveStaticFallbackWithoutRedirect = false,
} = {}) {
  const sitemap = `<urlset><url><loc>${ORIGIN}/</loc></url><url><loc>${ORIGIN}/quest/</loc></url><url><loc>${ORIGIN}/privacy/</loc></url></urlset>`;
  const pages = new Map([
    [`${ORIGIN}/`, page('/', { slashlessCanonical })],
    [`${ORIGIN}/quest/`, page('/quest', { slashlessCanonical })],
    [`${ORIGIN}/privacy/`, page('/privacy', { slashlessCanonical })],
    [`${ORIGIN}/minecraft-lend/`, page('/minecraft-lend', { slashlessCanonical })],
    [`${ORIGIN}/roblox-land/`, page('/roblox-land', { slashlessCanonical })],
    [`${ORIGIN}/amongus-land/`, page('/amongus-land', { slashlessCanonical })],
    [`${ORIGIN}/igra-v-kalmara-lend/`, page('/igra-v-kalmara-lend', { slashlessCanonical })],
    [`${ORIGIN}/new-year/`, page('/new-year', { slashlessCanonical })],
  ]);
  return async (input) => {
    const url = String(input);
    if (url === `${ORIGIN}/robots.txt`) {
      return response(200, `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`);
    }
    if (url === `${ORIGIN}/sitemap.xml`) return response(200, sitemap);
    if (missingPath && url === `${ORIGIN}${missingPath}`) return response(404, 'not found');
    for (const [pathname, target] of LEGACY_TARGETS) {
      if (serveStaticFallbackWithoutRedirect && STATIC_FALLBACK_PATHS.has(pathname) && url === `${ORIGIN}${pathname}`) {
        return response(200, page(target.slice(0, -1), { noindex: true }));
      }
      if (url === `${ORIGIN}${pathname}`) {
        const fallback = slashNormalizeLegacy && STATIC_FALLBACK_PATHS.has(pathname);
        return response(redirectStatus, '', { location: fallback ? `${pathname}/` : target });
      }
      if (slashNormalizeLegacy && STATIC_FALLBACK_PATHS.has(pathname) && url === `${ORIGIN}${pathname}/`) {
        return response(200, page(target.slice(0, -1), { noindex: true }));
      }
    }
    return pages.has(url) ? response(200, pages.get(url)) : response(404, 'not found');
  };
}

test('accepts a deployed static site with internal legacy redirects', async () => {
  const report = await verifyLiveSite({ origin: ORIGIN, fetchImpl: createFetch() });

  assert.equal(report.pagesChecked, 3);
  assert.deepEqual(report.errors, []);
});

test('checks every generated 301 source against the deployed host', async () => {
  const requests = new Set();
  const fetchImpl = createFetch();
  const report = await verifyLiveSite({
    origin: ORIGIN,
    fetchImpl: async (input, options) => {
      requests.add(String(input));
      return fetchImpl(input, options);
    },
  });

  assert.deepEqual(report.errors, []);
  for (const { source } of LEGACY_REDIRECTS) {
    assert.ok(requests.has(`${ORIGIN}${source}`), `expected live smoke to request ${source}`);
  }
});

test('rejects a missing required P0 endpoint after deployment', async () => {
  const report = await verifyLiveSite({ origin: ORIGIN, fetchImpl: createFetch({ missingPath: '/roblox-land/' }) });

  assert.ok(report.errors.some((error) => error.includes('/roblox-land') && error.includes('status 404')));
});

test('rejects a sitemap page whose canonical drops the required trailing slash', async () => {
  const report = await verifyLiveSite({ origin: ORIGIN, fetchImpl: createFetch({ slashlessCanonical: true }) });

  assert.ok(report.errors.some((error) => error.includes('canonical does not match its sitemap URL')));
});

test('accepts GitHub Pages slash normalization before a noindex static legacy fallback', async () => {
  const report = await verifyLiveSite({ origin: ORIGIN, fetchImpl: createFetch({ slashNormalizeLegacy: true }) });

  assert.deepEqual(report.errors, []);
});

test('requires a real permanent redirect for static fallbacks during production cutover', async () => {
  const report = await verifyLiveSite({
    origin: ORIGIN,
    fetchImpl: createFetch({ serveStaticFallbackWithoutRedirect: true }),
    requireServerRedirects: true,
  });

  assert.ok(report.errors.some((error) => error.includes('/wednesday_ukradennaya_vesch') && error.includes('permanent redirect')));
});

test('rejects a temporary legacy migration redirect', async () => {
  const report = await verifyLiveSite({ origin: ORIGIN, fetchImpl: createFetch({ redirectStatus: 302 }) });

  assert.ok(report.errors.some((error) => error.includes('permanent status 301 or 308')));
});
