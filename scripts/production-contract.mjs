import { access, readFile, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ORIGIN = 'https://xn--80aehcht5ci1b.xn--p1ai';
const DEFAULT_REQUIRED_PATHS = [
  '/',
  '/privacy',
  '/igra-v-kalmara-lend',
  '/minecraft-lend',
  '/roblox-land',
  '/amongus-land',
];
const LEGACY_REDIRECT_TARGETS = new Map([
  ['/igra-v-kalmara-lend', '/igra_v_kalmara'],
  ['/minecraft-lend', '/minecraft'],
  ['/roblox-land', '/roblox'],
  ['/amongus-land', '/among_us'],
]);
const NOINDEX_PATHS = new Set(['/privacy', ...LEGACY_REDIRECT_TARGETS.keys()]);
const FORBIDDEN_PUBLIC_PATHS = ['/tilda'];

function normalizeOrigin(origin) {
  return origin.replace(/\/$/, '');
}

function canonicalForPath(origin, pathname) {
  return pathname === '/' ? `${origin}/` : `${origin}${pathname.replace(/\/+$/, '')}/`;
}

function getAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match?.[2]?.trim() ?? '';
}

function getMeta(html, attribute, value) {
  const matcher = /<meta\b[^>]*>/gi;
  for (const tag of html.match(matcher) ?? []) {
    if (getAttribute(tag, attribute).toLowerCase() === value.toLowerCase()) {
      return getAttribute(tag, 'content');
    }
  }
  return '';
}

function getCanonical(html) {
  const matcher = /<link\b[^>]*>/gi;
  for (const tag of html.match(matcher) ?? []) {
    if (getAttribute(tag, 'rel').split(/\s+/).some((value) => value.toLowerCase() === 'canonical')) {
      return getAttribute(tag, 'href');
    }
  }
  return '';
}

function isNoindex(html) {
  return /<meta\b[^>]*\bname\s*=\s*(["'])robots\1[^>]*\bcontent\s*=\s*(["'])[^"']*\bnoindex\b[^"']*\2[^>]*>/i.test(html);
}

function hasAttribute(tag, name) {
  return new RegExp(`\\b${name}(?:\\s|=|>)`, 'i').test(tag);
}

function requiredInput(formHtml, name) {
  return (formHtml.match(/<input\b[^>]*>/gi) ?? []).some((tag) => (
    getAttribute(tag, 'name') === name && hasAttribute(tag, 'required')
  ));
}

function validateLeadForms(html, pagePath, errors) {
  const leadForms = html.match(/<form\b(?=[^>]*\bdata-lead-form(?:\s|=|>))[^>]*>[\s\S]*?<\/form>/gi) ?? [];
  if (pagePath === '/' && leadForms.length < 1) {
    errors.push(`${pagePath}: expected a primary lead form`);
  }

  for (const form of leadForms) {
    const openTag = form.match(/^<form\b[^>]*>/i)?.[0] ?? '';
    const target = getAttribute(openTag, 'data-lead-target');
    if (!/^https:\/\/wa\.me\/\d{10,15}$/i.test(target)) {
      errors.push(`${pagePath}: lead form has no valid WhatsApp target`);
    }
    if (hasAttribute(openTag, 'action')) {
      errors.push(`${pagePath}: lead form must not expose PII through a no-JS form action`);
    }
    for (const name of ['name', 'phone', 'consent']) {
      if (!requiredInput(form, name)) errors.push(`${pagePath}: lead form is missing required ${name} input`);
    }
    if (!/<button\b(?=[^>]*\bdata-lead-submit(?:\s|=|>))(?=[^>]*\btype\s*=\s*(["'])button\1)[^>]*>/i.test(form)) {
      errors.push(`${pagePath}: lead form has no JavaScript-only submit control`);
    }
    if (!/<[^>]+\bdata-lead-status(?:\s|=|>)[^>]*\brole\s*=\s*(["'])status\1[^>]*>/i.test(form)) {
      errors.push(`${pagePath}: lead form has no accessible status region`);
    }
  }
}

function isAbsoluteOriginUrl(value, origin) {
  try {
    return new URL(value).origin === origin;
  } catch {
    return false;
  }
}

function collectSchemaTypes(value, types = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectSchemaTypes(item, types);
    return types;
  }
  if (!value || typeof value !== 'object') return types;

  const type = value['@type'];
  if (Array.isArray(type)) type.forEach((item) => types.add(item));
  else if (typeof type === 'string') types.add(type);
  if (value['@graph']) collectSchemaTypes(value['@graph'], types);
  return types;
}

function isSchemaDocument(value) {
  const context = value && typeof value === 'object' ? value['@context'] : '';
  return typeof context === 'string'
    && /schema\.org/i.test(context)
    && collectSchemaTypes(value).size > 0;
}

function readJsonLd(html, pagePath, errors) {
  const scripts = html.match(/<script\b[^>]*\btype\s*=\s*(["'])application\/ld\+json\1[^>]*>[\s\S]*?<\/script>/gi) ?? [];
  if (scripts.length === 0) {
    errors.push(`${pagePath}: missing JSON-LD`);
    return new Set();
  }

  const types = new Set();
  for (const script of scripts) {
    const content = script.replace(/^.*?>/s, '').replace(/<\/script>$/i, '').trim();
    try {
      const data = JSON.parse(content);
      if (!isSchemaDocument(data)) {
        errors.push(`${pagePath}: JSON-LD has no schema.org context and type`);
      } else {
        collectSchemaTypes(data, types);
      }
    } catch {
      errors.push(`${pagePath}: invalid JSON-LD`);
    }
  }
  return types;
}

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function listHtmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listHtmlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(fullPath);
    }
  }
  return files;
}

function pathFromOutputFile(distDir, filePath) {
  const relativePath = relative(distDir, filePath).split(sep).join('/');
  if (relativePath === 'index.html') return '/';
  if (relativePath.endsWith('/index.html')) return `/${relativePath.slice(0, -'/index.html'.length)}`;
  return `/${relativePath.slice(0, -'.html'.length)}`;
}

async function resolvePageFile(distDir, pathname) {
  if (pathname === '/') return join(distDir, 'index.html');

  const slug = pathname.replace(/^\/+|\/+$/g, '');
  const directoryIndex = join(distDir, slug, 'index.html');
  if (await exists(directoryIndex)) return directoryIndex;
  return join(distDir, `${slug}.html`);
}

function pathFromCanonical(canonical) {
  const url = new URL(canonical);
  const pathname = url.pathname.replace(/\/$/, '');
  return pathname || '/';
}

function normalizeBasePath(basePath = '') {
  const value = String(basePath || '').trim();
  if (!value || value === '/') return '';
  return `/${value.replace(/^\/+|\/+$/g, '')}`;
}

function hasAnchorTarget(html, fragment) {
  const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b(?:id|name)\\s*=\\s*(["'])${escaped}\\1`, 'i').test(html);
}

function validateInternalLinks({ pages, basePath, errors }) {
  const normalizedBase = normalizeBasePath(basePath);
  const assetPath = /\.(?:avif|css|gif|ico|jpe?g|js|json|map|mp3|mp4|pdf|png|svg|txt|webp|woff2?|xml)$/i;

  for (const [pagePath, html] of pages) {
    for (const tag of html.match(/<a\b[^>]*>/gi) ?? []) {
      const href = getAttribute(tag, 'href');
      if (!href || href === '#' || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) continue;
      if (href.startsWith('#')) {
        if (!hasAnchorTarget(html, href.slice(1))) {
          errors.push(`${pagePath}: internal link fragment has no target: ${href}`);
        }
        continue;
      }
      if (!href.startsWith('/')) continue;

      const [rawPath = '', rawFragment = ''] = href.split('#', 2);
      const routeWithQuery = rawPath || '/';
      const routePath = routeWithQuery.split('?', 1)[0] || '/';
      if (assetPath.test(routePath)) continue;

      let normalizedPath = routePath;
      if (normalizedBase) {
        if (routePath === normalizedBase || routePath.startsWith(`${normalizedBase}/`)) {
          normalizedPath = routePath.slice(normalizedBase.length) || '/';
        } else {
          errors.push(`${pagePath}: internal link bypasses SITE_BASE: ${href}`);
          continue;
        }
      }

      if (normalizedPath !== '/' && !normalizedPath.endsWith('/')) {
        errors.push(`${pagePath}: internal route link is missing trailing slash: ${href}`);
      }
      const targetPath = normalizedPath.replace(/\/$/, '') || '/';
      const targetHtml = pages.get(targetPath);
      if (!targetHtml) {
        errors.push(`${pagePath}: internal link has no generated target: ${href}`);
        continue;
      }
      if (rawFragment && !hasAnchorTarget(targetHtml, rawFragment)) {
        errors.push(`${pagePath}: internal link fragment has no target: ${href}`);
      }
    }
  }
}

function validatePage({ html, pagePath, origin, errors }) {
  const legacyTarget = LEGACY_REDIRECT_TARGETS.get(pagePath);
  const expectedCanonical = canonicalForPath(origin, legacyTarget || pagePath);
  const canonical = getCanonical(html);
  if (!canonical) {
    errors.push(`${pagePath}: missing canonical`);
  } else if (!isAbsoluteOriginUrl(canonical, origin)) {
    errors.push(`${pagePath}: canonical is not an absolute URL on ${origin}`);
  } else if (canonical !== expectedCanonical) {
    errors.push(`${pagePath}: canonical does not match the published URL`);
  }

  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, '').trim();
  if (!title) errors.push(`${pagePath}: missing title`);

  const description = getMeta(html, 'name', 'description');
  if (!description) errors.push(`${pagePath}: missing meta description`);

  const ogUrl = getMeta(html, 'property', 'og:url');
  const ogImage = getMeta(html, 'property', 'og:image');
  for (const [name, value] of [
    ['og:title', getMeta(html, 'property', 'og:title')],
    ['og:description', getMeta(html, 'property', 'og:description')],
    ['og:url', ogUrl],
    ['og:image', ogImage],
  ]) {
    if (!value) errors.push(`${pagePath}: missing ${name}`);
  }
  if (ogUrl && !isAbsoluteOriginUrl(ogUrl, origin)) {
    errors.push(`${pagePath}: og:url is not an absolute URL on ${origin}`);
  } else if (ogUrl && canonical && ogUrl !== canonical) {
    errors.push(`${pagePath}: og:url does not match canonical`);
  }
  if (ogImage && !isAbsoluteOriginUrl(ogImage, origin)) {
    errors.push(`${pagePath}: og:image is not an absolute URL on ${origin}`);
  }

  for (const name of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) {
    const value = getMeta(html, 'name', name);
    if (!value) errors.push(`${pagePath}: missing ${name}`);
    if (name === 'twitter:image' && value && !isAbsoluteOriginUrl(value, origin)) {
      errors.push(`${pagePath}: twitter:image is not an absolute URL on ${origin}`);
    }
  }

  if (/<form\b[^>]*\bonsubmit\s*=\s*(["'])[^"']*(?:return\s+false|preventDefault)[^"']*\1[^>]*>/i.test(html)) {
    errors.push(`${pagePath}: inert form cancels submission`);
  }
  validateLeadForms(html, pagePath, errors);

  const noindex = isNoindex(html);
  if (NOINDEX_PATHS.has(pagePath) && !noindex) {
    errors.push(`${pagePath}: migration or privacy page must be noindex`);
  }

  if (!noindex) {
    const schemaTypes = readJsonLd(html, pagePath, errors);
    if (pagePath !== '/' && pagePath !== '/404' && !schemaTypes.has('BreadcrumbList')) {
      errors.push(`${pagePath}: indexable inner page is missing BreadcrumbList JSON-LD`);
    }
  }
}

/**
 * Validates SEO and conversion requirements that a static host can guarantee before cutover.
 * Network-level redirects and security headers are deliberately tested separately after deployment.
 */
export async function verifyProductionContract({
  distDir = 'dist',
  origin = process.env.SITE_ORIGIN ?? DEFAULT_ORIGIN,
  requiredPaths = DEFAULT_REQUIRED_PATHS,
  basePath = process.env.SITE_BASE ?? '',
} = {}) {
  const normalizedOrigin = normalizeOrigin(origin);
  const errors = [];
  const resolvedDistDir = isAbsolute(distDir) ? distDir : join(process.cwd(), distDir);

  if (!await exists(resolvedDistDir)) {
    return { pagesChecked: 0, errors: [`dist directory does not exist: ${distDir}`] };
  }

  const robotsPath = join(resolvedDistDir, 'robots.txt');
  if (!await exists(robotsPath)) {
    errors.push('missing robots.txt');
  } else {
    const robots = await readFile(robotsPath, 'utf8');
    if (!/^User-agent:\s*\*/mi.test(robots)) errors.push('robots.txt: missing User-agent: *');
    if (!/^Allow:\s*\/$/mi.test(robots)) errors.push('robots.txt: missing Allow: /');
    if (!new RegExp(`^Sitemap:\\s*${normalizedOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/sitemap\\.xml$`, 'mi').test(robots)) {
      errors.push(`robots.txt: missing canonical sitemap URL for ${normalizedOrigin}`);
    }
  }

  const sitemapPath = join(resolvedDistDir, 'sitemap.xml');
  let sitemap = '';
  if (!await exists(sitemapPath)) {
    errors.push('missing sitemap.xml');
  } else {
    sitemap = await readFile(sitemapPath, 'utf8');
    if (!/<urlset\b/i.test(sitemap)) errors.push('sitemap.xml: missing urlset');
  }

  for (const pathname of requiredPaths) {
    const pageFile = await resolvePageFile(resolvedDistDir, pathname);
    if (!await exists(pageFile)) {
      errors.push(`${pathname}: required P0 route is missing from dist`);
    }
  }

  for (const pathname of FORBIDDEN_PUBLIC_PATHS) {
    const pageFile = await resolvePageFile(resolvedDistDir, pathname);
    if (await exists(pageFile)) {
      errors.push(`${pathname}: archived raw Tilda content must not be published`);
    }
  }

  const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) => match[1].trim());
  if (sitemap && sitemapUrls.length === 0) errors.push('sitemap.xml: contains no URLs');
  for (const sitemapUrl of sitemapUrls) {
    if (!isAbsoluteOriginUrl(sitemapUrl, normalizedOrigin)) {
      errors.push(`sitemap.xml: URL is not on canonical origin: ${sitemapUrl}`);
      continue;
    }
    const sitemapPathname = pathFromCanonical(sitemapUrl);
    if (sitemapUrl !== canonicalForPath(normalizedOrigin, sitemapPathname)) {
      errors.push(`sitemap.xml: URL is not in the canonical trailing-slash form: ${sitemapUrl}`);
    }
    const sitemapPage = await resolvePageFile(resolvedDistDir, sitemapPathname);
    if (!await exists(sitemapPage)) {
      errors.push(`sitemap.xml: URL has no generated page: ${sitemapUrl}`);
    }
  }

  const htmlFiles = await listHtmlFiles(resolvedDistDir);
  const pages = new Map();
  for (const filePath of htmlFiles) {
    const pagePath = pathFromOutputFile(resolvedDistDir, filePath);
    const html = await readFile(filePath, 'utf8');
    pages.set(pagePath, html);
    validatePage({ html, pagePath, origin: normalizedOrigin, errors });
  }
  validateInternalLinks({ pages, basePath, errors });

  return { pagesChecked: htmlFiles.length, errors };
}

async function main() {
  const report = await verifyProductionContract();
  if (report.errors.length > 0) {
    console.error(`Production contract failed: ${report.errors.length} issue(s) across ${report.pagesChecked} HTML file(s).`);
    for (const error of report.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Production contract passed: ${report.pagesChecked} HTML file(s) checked.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
