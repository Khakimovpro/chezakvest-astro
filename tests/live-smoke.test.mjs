import assert from 'node:assert/strict';
import test from 'node:test';

import { verifyLiveSite } from '../scripts/live-smoke.mjs';

const ORIGIN = 'https://xn--80aehcht5ci1b.xn--p1ai';

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

function createFetch({ missingPath, slashlessCanonical = false, slashNormalizeLegacy = false, redirectStatus = 301 } = {}) {
  const sitemap = `<urlset><url><loc>${ORIGIN}/</loc></url><url><loc>${ORIGIN}/quest/</loc></url></urlset>`;
  const pages = new Map([
    [`${ORIGIN}/`, page('/', { slashlessCanonical })],
    [`${ORIGIN}/quest/`, page('/quest', { slashlessCanonical })],
    [`${ORIGIN}/privacy/`, page('/privacy', { noindex: true, slashlessCanonical })],
  ]);
  const legacyTargets = new Map([
    ['/igra-v-kalmara-lend', '/igra_v_kalmara/'],
    ['/minecraft-lend', '/minecraft/'],
    ['/roblox-land', '/roblox/'],
    ['/amongus-land', '/among_us/'],
  ]);

  return async (input) => {
    const url = String(input);
    if (url === `${ORIGIN}/robots.txt`) {
      return response(200, `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`);
    }
    if (url === `${ORIGIN}/sitemap.xml`) return response(200, sitemap);
    if (missingPath && url === `${ORIGIN}${missingPath}`) return response(404, 'not found');
    for (const [pathname, target] of legacyTargets) {
      if (url === `${ORIGIN}${pathname}`) {
        return response(redirectStatus, '', { location: slashNormalizeLegacy ? `${pathname}/` : target });
      }
      if (slashNormalizeLegacy && url === `${ORIGIN}${pathname}/`) {
        return response(200, page(target.slice(0, -1), { noindex: true }));
      }
    }
    return pages.has(url) ? response(200, pages.get(url)) : response(404, 'not found');
  };
}

test('accepts a deployed static site with internal legacy redirects', async () => {
  const report = await verifyLiveSite({ origin: ORIGIN, fetchImpl: createFetch() });

  assert.equal(report.pagesChecked, 2);
  assert.deepEqual(report.errors, []);
});

test('rejects a missing required P0 endpoint after deployment', async () => {
  const report = await verifyLiveSite({ origin: ORIGIN, fetchImpl: createFetch({ missingPath: '/roblox-land' }) });

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

test('rejects a temporary legacy migration redirect', async () => {
  const report = await verifyLiveSite({ origin: ORIGIN, fetchImpl: createFetch({ redirectStatus: 302 }) });

  assert.ok(report.errors.some((error) => error.includes('permanent status 301 or 308')));
});
