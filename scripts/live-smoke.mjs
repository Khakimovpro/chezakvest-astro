import { fileURLToPath } from 'node:url';

import {
  canonicalTargetPath,
  isRedirect,
  isStaticFallback,
  loadLegacyUrlMap,
} from '../migration/legacy-redirects.mjs';

const CORE_REQUIRED_PATHS = [
  '/',
  '/privacy',
  '/minecraft-lend',
  '/roblox-land',
  '/amongus-land',
  '/igra-v-kalmara-lend',
  '/new-year',
];
const REDIRECT_STATUS_CODES = new Set([301, 302, 307, 308]);
const PERMANENT_REDIRECT_STATUS_CODES = new Set([301, 308]);

function normalizeOrigin(origin) {
  return origin.replace(/\/$/, '');
}

function getAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match?.[2]?.trim() ?? '';
}

function getCanonical(html) {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (getAttribute(tag, 'rel').split(/\s+/).some((value) => value.toLowerCase() === 'canonical')) {
      return getAttribute(tag, 'href');
    }
  }
  return '';
}

function isNoindex(html) {
  return /<meta\b[^>]*\bname\s*=\s*(["'])robots\1[^>]*\bcontent\s*=\s*(["'])[^"']*\bnoindex\b[^"']*\2[^>]*>/i.test(html);
}

function extractSitemapUrls(sitemap) {
  return [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) => match[1].trim());
}

function isUrlOnOrigin(value, origin) {
  try {
    return new URL(value).origin === origin;
  } catch {
    return false;
  }
}

function isRedirectOnOrigin(location, baseUrl, origin) {
  try {
    return isUrlOnOrigin(new URL(location, baseUrl).href, origin);
  } catch {
    return false;
  }
}

async function fetchUrl(fetchImpl, url) {
  try {
    return await fetchImpl(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
      headers: { 'user-agent': 'chezakvest-production-smoke/1.0' },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function validateIndexedPage({ html, pageUrl, origin, errors }) {
  const canonical = getCanonical(html);
  if (!canonical) {
    errors.push(`${pageUrl}: missing canonical`);
  } else if (!isUrlOnOrigin(canonical, origin)) {
    errors.push(`${pageUrl}: canonical is not on ${origin}`);
  } else if (canonical !== pageUrl) {
    errors.push(`${pageUrl}: canonical does not match its sitemap URL`);
  }

  if (isNoindex(html)) errors.push(`${pageUrl}: sitemap page is marked noindex`);

  const jsonLdBlocks = html.match(/<script\b[^>]*\btype\s*=\s*(["'])application\/ld\+json\1[^>]*>[\s\S]*?<\/script>/gi) ?? [];
  if (jsonLdBlocks.length === 0) {
    errors.push(`${pageUrl}: missing JSON-LD`);
    return;
  }

  for (const block of jsonLdBlocks) {
    const json = block.replace(/^.*?>/s, '').replace(/<\/script>$/i, '').trim();
    try {
      JSON.parse(json);
    } catch {
      errors.push(`${pageUrl}: invalid JSON-LD`);
    }
  }
}

function validateLegacyFallback({ html, pageUrl, expectedCanonical, origin, errors }) {
  const canonical = getCanonical(html);
  if (!canonical || !isUrlOnOrigin(canonical, origin)) {
    errors.push(`${pageUrl}: published fallback is missing an on-origin canonical`);
  } else if (canonical !== expectedCanonical) {
    errors.push(`${pageUrl}: published fallback canonical must target ${expectedCanonical}`);
  }
  if (!isNoindex(html)) errors.push(`${pageUrl}: published fallback must be noindex`);
}

/**
 * Fetches the deployed static site and verifies indexable pages plus every mapped legacy redirect.
 * It is intentionally not invoked by CI because it must run only against the chosen host.
 */
export async function verifyLiveSite({
  origin,
  fetchImpl = fetch,
  requiredPaths,
  allowInsecureOrigin = process.env.ALLOW_INSECURE_ORIGIN === '1',
  requireServerRedirects = process.env.REQUIRE_SERVER_REDIRECTS === '1',
} = {}) {
  const errors = [];
  if (!origin) return { pagesChecked: 0, errors: ['SITE_ORIGIN is required for a live smoke check'] };

  const normalizedOrigin = normalizeOrigin(origin);
  const isHttpsOrigin = normalizedOrigin.startsWith('https://');
  const isExplicitlyAllowedHttpOrigin = allowInsecureOrigin && normalizedOrigin.startsWith('http://');
  if (!isUrlOnOrigin(normalizedOrigin, normalizedOrigin) || (!isHttpsOrigin && !isExplicitlyAllowedHttpOrigin)) {
    return { pagesChecked: 0, errors: [`SITE_ORIGIN must be an absolute HTTPS origin: ${origin}`] };
  }

  const legacyRedirects = new Map(
    (await loadLegacyUrlMap())
      .filter(isRedirect)
      .map((entry) => [entry.source, {
        target: canonicalTargetPath(entry.target),
        hasStaticFallback: isStaticFallback(entry),
      }]),
  );
  const resolvedRequiredPaths = requiredPaths ?? [...CORE_REQUIRED_PATHS, ...legacyRedirects.keys()];

  const robotsUrl = `${normalizedOrigin}/robots.txt`;
  const robotsResponse = await fetchUrl(fetchImpl, robotsUrl);
  let robots = '';
  if (robotsResponse.error) {
    errors.push(`${robotsUrl}: request failed: ${robotsResponse.error}`);
  } else if (!robotsResponse.ok) {
    errors.push(`${robotsUrl}: expected status 200, got ${robotsResponse.status}`);
  } else {
    robots = await robotsResponse.text();
    if (!/^User-agent:\s*\*/mi.test(robots)) errors.push(`${robotsUrl}: missing User-agent: *`);
    if (!/^Allow:\s*\/$/mi.test(robots)) errors.push(`${robotsUrl}: missing Allow: /`);
  }

  const sitemapUrl = `${normalizedOrigin}/sitemap.xml`;
  const sitemapResponse = await fetchUrl(fetchImpl, sitemapUrl);
  let sitemapUrls = [];
  if (sitemapResponse.error) {
    errors.push(`${sitemapUrl}: request failed: ${sitemapResponse.error}`);
  } else if (!sitemapResponse.ok) {
    errors.push(`${sitemapUrl}: expected status 200, got ${sitemapResponse.status}`);
  } else {
    const sitemap = await sitemapResponse.text();
    if (!/<urlset\b/i.test(sitemap)) errors.push(`${sitemapUrl}: missing urlset`);
    sitemapUrls = extractSitemapUrls(sitemap);
    if (sitemapUrls.length === 0) errors.push(`${sitemapUrl}: contains no URLs`);
    if (sitemapUrls.length > 250) errors.push(`${sitemapUrl}: unexpectedly contains more than 250 URLs`);
  }

  let canonicalOrigin = normalizedOrigin;
  if (isExplicitlyAllowedHttpOrigin && sitemapUrls.length > 0) {
    const sitemapOrigins = new Set();
    for (const pageUrl of sitemapUrls) {
      try {
        sitemapOrigins.add(new URL(pageUrl).origin);
      } catch {
        errors.push(`${sitemapUrl}: invalid URL: ${pageUrl}`);
      }
    }
    if (sitemapOrigins.size !== 1) {
      errors.push(`${sitemapUrl}: HTTP stage sitemap must use one canonical origin`);
    } else {
      [canonicalOrigin] = sitemapOrigins;
      if (!canonicalOrigin.startsWith('https://')) {
        errors.push(`${sitemapUrl}: HTTP stage sitemap canonical origin must use HTTPS`);
      }
    }
  }

  if (robots && !new RegExp(`^Sitemap:\\s*${canonicalOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/sitemap\\.xml$`, 'mi').test(robots)) {
    errors.push(`${robotsUrl}: canonical sitemap URL is missing`);
  }

  for (const pageUrl of sitemapUrls) {
    if (!isUrlOnOrigin(pageUrl, canonicalOrigin)) {
      errors.push(`${sitemapUrl}: URL is not on canonical origin ${canonicalOrigin}: ${pageUrl}`);
      continue;
    }
    const parsedPageUrl = new URL(pageUrl);
    const deployedPageUrl = canonicalOrigin === normalizedOrigin
      ? pageUrl
      : `${normalizedOrigin}${parsedPageUrl.pathname}${parsedPageUrl.search}`;
    const response = await fetchUrl(fetchImpl, deployedPageUrl);
    if (response.error) {
      errors.push(`${deployedPageUrl}: request failed: ${response.error}`);
      continue;
    }
    if (!response.ok) {
      errors.push(`${deployedPageUrl}: expected status 200, got ${response.status}`);
      continue;
    }
    validateIndexedPage({ html: await response.text(), pageUrl, origin: canonicalOrigin, errors });
  }

  for (const pathname of resolvedRequiredPaths) {
    const legacyRedirect = legacyRedirects.get(pathname);
    const legacyTarget = legacyRedirect?.target;
    const url = `${normalizedOrigin}${pathname === '/' ? '/' : legacyRedirect ? pathname : `${pathname}/`}`;
    const response = await fetchUrl(fetchImpl, url);
    if (response.error) {
      errors.push(`${url}: request failed: ${response.error}`);
      continue;
    }
    const expectedLegacyTarget = legacyTarget ? `${normalizedOrigin}${legacyTarget}` : '';
    const expectedLegacyCanonical = legacyTarget ? `${canonicalOrigin}${legacyTarget}` : '';
    if (legacyTarget && REDIRECT_STATUS_CODES.has(response.status)) {
      const location = response.headers.get('location');
      if (!location || !isRedirectOnOrigin(location, url, normalizedOrigin)) {
        errors.push(`${url}: redirect must stay on the canonical origin`);
      } else if (!PERMANENT_REDIRECT_STATUS_CODES.has(response.status)) {
        errors.push(`${url}: legacy migration redirect must use permanent status 301 or 308`);
      } else if (new URL(location, url).href === expectedLegacyTarget) {
        continue;
      } else if (
        requireServerRedirects
        || !legacyRedirect.hasStaticFallback
        || new URL(location, url).href !== `${normalizedOrigin}${pathname}/`
      ) {
        errors.push(`${url}: redirect must target ${expectedLegacyTarget}`);
      } else {
        const fallbackUrl = new URL(location, url).href;
        const fallbackResponse = await fetchUrl(fetchImpl, fallbackUrl);
        if (fallbackResponse.error) {
          errors.push(`${fallbackUrl}: static legacy fallback request failed: ${fallbackResponse.error}`);
        } else if (!fallbackResponse.ok) {
          errors.push(`${fallbackUrl}: expected static legacy fallback status 200, got ${fallbackResponse.status}`);
        } else {
          validateLegacyFallback({
            html: await fallbackResponse.text(),
            pageUrl: fallbackUrl,
            expectedCanonical: expectedLegacyCanonical,
            origin: canonicalOrigin,
            errors,
          });
        }
      }
      continue;
    }
    if (!response.ok) {
      errors.push(`${url}: expected status 200 or an internal permanent redirect, got status ${response.status}`);
      continue;
    }
    const html = await response.text();
    if (legacyTarget) {
      if (requireServerRedirects || !legacyRedirect.hasStaticFallback) {
        errors.push(`${url}: legacy URL must use a permanent redirect to ${expectedLegacyTarget}`);
      } else {
        validateLegacyFallback({
          html,
          pageUrl: url,
          expectedCanonical: expectedLegacyCanonical,
          origin: canonicalOrigin,
          errors,
        });
      }
    } else {
      const canonical = getCanonical(html);
      if (!canonical || !isUrlOnOrigin(canonical, canonicalOrigin)) {
        errors.push(`${url}: published page is missing an on-origin canonical`);
      }
    }
  }

  return { pagesChecked: sitemapUrls.length, errors };
}

async function main() {
  const report = await verifyLiveSite({ origin: process.env.SITE_ORIGIN });
  if (report.errors.length > 0) {
    console.error(`Live smoke check failed: ${report.errors.length} issue(s) across ${report.pagesChecked} sitemap page(s).`);
    for (const error of report.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Live smoke check passed: ${report.pagesChecked} sitemap page(s) checked.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
