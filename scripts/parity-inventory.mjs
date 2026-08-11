import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import process from 'node:process';

const PROJECT_ROOT = process.cwd();
const PARITY_DIR = join(PROJECT_ROOT, 'migration', 'parity');
const DIST_DIR = join(PROJECT_ROOT, 'dist');
const WORK_DIR = join(PROJECT_ROOT, '..', 'work');
const ORIGIN = 'https://xn--80aehcht5ci1b.xn--p1ai';
const ORIGIN_URL = new URL(ORIGIN);
const USER_AGENT = 'chezakvest-parity-audit/2026-08-11 (+static Astro migration verification)';

function csvRows(text) {
  const rows = [];
  let cell = '';
  let row = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  const [header = [], ...body] = rows;
  return body.filter((cells) => cells.some(Boolean)).map((cells) => Object.fromEntries(header.map((key, index) => [key.replace(/^\uFEFF/, ''), cells[index] ?? ''])));
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(headers, rows) {
  return `${headers.join(',')}\n${rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')).join('\n')}\n`;
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/<script\b[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/giu, ' ')
    .replace(/<!--[\s\S]*?-->/gu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&quot;/giu, '"')
    .replace(/&amp;/giu, '&')
    .replace(/&#(?:x[\da-f]+|\d+);/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function normalisedPath(pathname) {
  const decoded = decodeURIComponent(pathname || '/').replace(/\/+/gu, '/');
  if (decoded === '/' || decoded === '') return '/';
  return decoded.replace(/\/+$/u, '') || '/';
}

function originalUrl(value) {
  try {
    const url = new URL(value, ORIGIN);
    if (url.hostname !== ORIGIN_URL.hostname) return '';
    if (/^(?:mailto|tel|javascript|data):/iu.test(value.trim())) return '';
    url.protocol = ORIGIN_URL.protocol;
    url.hostname = ORIGIN_URL.hostname;
    url.port = '';
    url.search = '';
    url.hash = '';
    url.pathname = normalisedPath(url.pathname);
    return url.href;
  } catch {
    return '';
  }
}

function pathFromOriginal(value) {
  const url = new URL(value);
  return normalisedPath(url.pathname);
}

function clonePath(value) {
  const path = normalisedPath(value);
  return path === '/' ? '/' : `${path}/`;
}

function isCrawlable(url) {
  const path = pathFromOriginal(url);
  if (path.includes('*')) return false;
  if (/^\/(?:tilda|members|favicon\.ico|robots\.txt|sitemap\.xml)(?:\/|$)/iu.test(path)) return false;
  if (/\.(?:css|js|mjs|json|xml|txt|map|ico|png|jpe?g|gif|webp|svg|woff2?|ttf|pdf|zip|mp4|webm|mp3|wav)$/iu.test(path)) return false;
  return true;
}

function extractMeta(html) {
  const tagValue = (tag, name) => {
    const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'iu'));
    return cleanText(match?.[2] ?? '');
  };
  const title = cleanText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1] ?? '');
  const descriptionTag = (html.match(/<meta\b[^>]*>/giu) ?? []).find((tag) => tagValue(tag, 'name').toLowerCase() === 'description');
  const description = descriptionTag ? tagValue(descriptionTag, 'content') : '';
  const h1 = cleanText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu)?.[1] ?? '');
  return { title, description, h1, textHash: createHash('sha256').update(cleanText(html).toLowerCase()).digest('hex') };
}

function extractLinks(html, baseUrl) {
  const values = new Set();
  const attribute = /\b(?:href|data-href|data-url|action)\s*=\s*(["'])(.*?)\1/giu;
  // Do not scan JavaScript source as if it were markup attributes. Tilda
  // embeds dynamic `href = ' + variable + '` snippets in its scripts.
  const markup = html.replace(/<script\b[\s\S]*?<\/script>/giu, ' ');
  for (const match of markup.matchAll(attribute)) {
    const candidate = match[2].trim();
    // Attribute values may contain Tilda event handlers such as
    // `window.postMessage(...)`. They are not relative paths, even though
    // URL() would turn them into a syntactically valid origin URL.
    if (/^(?:javascript:|data:|mailto:|tel:|#|window\.|void\b)/iu.test(candidate)) continue;
    const value = originalUrl(new URL(candidate, baseUrl).href);
    if (value && isCrawlable(value)) values.add(value);
  }
  const escaped = /(?:location(?:\.href)?|window\.open)\s*\(?\s*(["'])(.*?)\1/giu;
  for (const match of html.matchAll(escaped)) {
    // Only follow literal navigation targets. Tilda also contains string
    // concatenation such as `location.href = ' + hurl + '`; treating that
    // source code as a URL creates synthetic %20+... crawl rows.
    const candidate = match[2].trim();
    if (!/^(?:\/|https?:\/\/)/iu.test(candidate)) continue;
    const value = originalUrl(new URL(candidate, baseUrl).href);
    if (value && isCrawlable(value)) values.add(value);
  }
  return [...values];
}

function sitemapUrls(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/giu)]
    .map((match) => originalUrl(match[1]))
    .filter(Boolean);
}

function robotsPaths(robots) {
  const values = new Set();
  for (const match of robots.matchAll(/^\s*Disallow:\s*(\S+)\s*$/gimu)) {
    const path = match[1];
    if (!path || path === '/' || path.includes('*')) continue;
    const url = originalUrl(path);
    if (url && isCrawlable(url)) values.add(url);
  }
  return [...values];
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

async function cloneRoutes() {
  const files = await walk(DIST_DIR);
  return new Set(files.filter((file) => file.endsWith('/index.html') || file.endsWith('index.html')).map((file) => {
    const outputPath = relative(DIST_DIR, file).replaceAll('\\', '/');
    if (outputPath === 'index.html') return '/';
    return `/${outputPath.replace(/\/index\.html$/u, '')}/`;
  }).filter((route) => route !== '/404/'));
}

async function fetchWithRetries(url, retries = 3) {
  let lastError = '';
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5' },
      });
      if (response.status >= 500 && attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
        continue;
      }
      const contentType = response.headers.get('content-type') ?? '';
      const html = /(?:html|xml|text)/iu.test(contentType) ? await response.text() : '';
      return {
        status: response.status,
        location: response.headers.get('location') ?? '',
        lastModified: response.headers.get('last-modified') ?? '',
        contentType,
        html,
        error: '',
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
    }
  }
  return { status: 0, location: '', lastModified: '', contentType: '', html: '', error: lastError };
}

async function collectLiveInventory({ sitemap, robots, hiddenRows, legacyRows }) {
  const sources = new Map();
  const queue = [];
  const queued = new Set();
  const records = new Map();
  const add = (candidate, source) => {
    const url = originalUrl(candidate);
    if (!url || !isCrawlable(url)) return;
    if (!sources.has(url)) sources.set(url, new Set());
    sources.get(url).add(source);
    if (!queued.has(url)) {
      queued.add(url);
      queue.push(url);
    }
  };

  sitemap.forEach((url) => add(url, 'sitemap'));
  robots.forEach((url) => add(url, 'robots'));
  hiddenRows.forEach((row) => add(row.url, 'hidden_csv'));
  legacyRows.forEach((row) => add(row.source, 'legacy_map'));

  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      const index = cursor;
      cursor += 1;
      const url = queue[index];
      const result = await fetchWithRetries(url);
      const meta = result.html ? extractMeta(result.html) : { title: '', description: '', h1: '', textHash: '' };
      records.set(url, {
        url,
        http_orig: result.status || '',
        location: result.location,
        last_modified: result.lastModified,
        content_type: result.contentType,
        fetch_error: result.error,
        ...meta,
      });
      if (result.status === 200 && /html/iu.test(result.contentType) && result.html) {
        extractLinks(result.html, url).forEach((link) => add(link, 'crawl'));
      }
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
  return { records, sources };
}

function legacyMap(rows) {
  const map = new Map();
  for (const row of rows) {
    const source = normalisedPath(row.source);
    map.set(source, { ...row, source, target: clonePath(row.target), status: row.status.trim() });
  }
  return map;
}

function historicMap(rows) {
  const map = new Map();
  for (const row of rows) {
    const url = originalUrl(row.url);
    if (url) map.set(url, row);
  }
  return map;
}

function decisionFor(record, routeSet, redirects) {
  const path = pathFromOriginal(record.url);
  const direct = clonePath(path);
  const redirect = redirects.get(path);
  const targetExists = redirect && routeSet.has(redirect.target);
  if (redirect?.status.startsWith('301') && targetExists) {
    return { routeClone: routeSet.has(direct) ? direct : '', redirectTo: redirect.target, verdict: 'redirect_ok' };
  }
  if (Number(record.http_orig) === 200 && routeSet.has(direct)) {
    return { routeClone: direct, redirectTo: '', verdict: 'ok' };
  }
  if (Number(record.http_orig) === 200 && targetExists) {
    return { routeClone: '', redirectTo: redirect.target, verdict: 'redirect_ok' };
  }
  if (Number(record.http_orig) === 200) {
    return { routeClone: '', redirectTo: redirect?.target ?? '', verdict: 'missing' };
  }
  if (targetExists && redirect?.status.startsWith('301')) {
    return { routeClone: routeSet.has(direct) ? direct : '', redirectTo: redirect.target, verdict: 'redirect_ok' };
  }
  return { routeClone: '', redirectTo: redirect?.target ?? '', verdict: 'dead_orig' };
}

function changedFields(record, historical) {
  if (!historical) return { status: 'not_observed_2026-07-20', fields: [] };
  const fields = ['title', 'description', 'h1'].filter((field) => cleanText(record[field]).toLowerCase() !== cleanText(historical[field]).toLowerCase());
  return { status: fields.length ? 'changed' : 'unchanged', fields };
}

async function main() {
  await mkdir(PARITY_DIR, { recursive: true });
  const [sitemapResponse, robotsResponse, hiddenCsv, legacyCsv, historicCsv] = await Promise.all([
    fetchWithRetries(`${ORIGIN}/sitemap.xml`),
    fetchWithRetries(`${ORIGIN}/robots.txt`),
    readFile(join(WORK_DIR, 'raw', 'active_hidden_pages.csv'), 'utf8'),
    readFile(join(PROJECT_ROOT, 'migration', 'legacy-url-map.csv'), 'utf8'),
    readFile(join(WORK_DIR, 'inventory.csv'), 'utf8'),
  ]);
  if (sitemapResponse.status !== 200 || !sitemapResponse.html) throw new Error(`Live sitemap is unavailable: HTTP ${sitemapResponse.status}`);
  if (robotsResponse.status !== 200 || !robotsResponse.html) throw new Error(`Live robots.txt is unavailable: HTTP ${robotsResponse.status}`);

  const sitemap = sitemapUrls(sitemapResponse.html);
  const robots = robotsPaths(robotsResponse.html);
  const hiddenRows = csvRows(hiddenCsv);
  const legacyRows = csvRows(legacyCsv);
  const historicRows = csvRows(historicCsv);
  const routes = await cloneRoutes();
  const redirects = legacyMap(legacyRows);
  const historical = historicMap(historicRows);
  const { records, sources } = await collectLiveInventory({ sitemap, robots, hiddenRows, legacyRows });

  const matrix = [...records.values()].sort((left, right) => left.url.localeCompare(right.url)).map((record) => {
    const directRoute = clonePath(pathFromOriginal(record.url));
    const decision = decisionFor(record, routes, redirects);
    const source = sources.get(record.url) ?? new Set();
    return {
      url: record.url,
      http_orig: record.http_orig,
      in_sitemap: source.has('sitemap') ? 'true' : 'false',
      hidden: source.has('robots') || source.has('hidden_csv') ? 'true' : 'false',
      route_clone: decision.routeClone,
      redirect_to: decision.redirectTo,
      verdict: decision.verdict,
      sources: [...source].sort().join('|'),
      http_location: record.location,
      fetch_error: record.fetch_error,
    };
  });

  const coveredRoutes = new Set(matrix
    // A mapped legacy fallback may still be emitted as a static Astro route.
    // Its own source URL has already proven the route is intentional, so do
    // not append a misleading extra_clone duplicate below.
    .filter((row) => row.verdict === 'ok' || row.verdict === 'redirect_ok' || row.verdict === 'extra_clone')
    .map((row) => row.route_clone));
  for (const route of [...routes].sort()) {
    if (coveredRoutes.has(route)) continue;
    // A route can be the target of legacy redirects yet still be an
    // Astro-owned catalogue with no corresponding live source URL. Keep that
    // fact visible as extra_clone instead of allowing redirect targets to
    // silently erase it from the completeness matrix.
    matrix.push({
      url: `${ORIGIN}${route}`,
      http_orig: '',
      in_sitemap: 'false',
      hidden: 'false',
      route_clone: route,
      redirect_to: '',
      verdict: 'extra_clone',
      sources: 'clone_dist',
      http_location: '',
      fetch_error: '',
    });
  }
  matrix.sort((left, right) => left.url.localeCompare(right.url));

  const drift = [...records.values()].sort((left, right) => left.url.localeCompare(right.url)).map((record) => {
    const historic = historical.get(record.url);
    const change = changedFields(record, historic);
    return {
      url: record.url,
      previous_last_modified: historic?.last_modified_http ?? '',
      current_last_modified: record.last_modified,
      changed_fields: change.fields.join('|'),
      status: change.status,
      previous_title: historic?.title ?? '',
      current_title: record.title,
      previous_description: historic?.description ?? '',
      current_description: record.description,
      previous_h1: historic?.h1 ?? '',
      current_h1: record.h1,
    };
  });

  const snapshot = {
    generated_at: new Date().toISOString(),
    origin: ORIGIN,
    sources: {
      sitemap_urls: sitemap.length,
      robots_urls: robots.length,
      hidden_csv_rows: hiddenRows.length,
      legacy_map_rows: legacyRows.length,
      clone_routes: routes.size,
      crawled_urls: records.size,
    },
    clone_route_paths: [...routes].sort(),
    records: [...records.values()].sort((left, right) => left.url.localeCompare(right.url)).map((record) => ({
      ...record,
      sources: [...(sources.get(record.url) ?? [])].sort(),
      clone_path: clonePath(pathFromOriginal(record.url)),
    })),
    matrix,
    drift,
  };
  const matrixHeaders = ['url', 'http_orig', 'in_sitemap', 'hidden', 'route_clone', 'redirect_to', 'verdict', 'sources', 'http_location', 'fetch_error'];
  const driftHeaders = ['url', 'previous_last_modified', 'current_last_modified', 'changed_fields', 'status', 'previous_title', 'current_title', 'previous_description', 'current_description', 'previous_h1', 'current_h1'];
  await Promise.all([
    writeFile(join(PARITY_DIR, 'live-inventory.json'), `${JSON.stringify(snapshot, null, 2)}\n`),
    writeFile(join(PARITY_DIR, 'pages-matrix.csv'), writeCsv(matrixHeaders, matrix)),
    writeFile(join(PARITY_DIR, 'content-drift.csv'), writeCsv(driftHeaders, drift)),
  ]);
  const summary = matrix.reduce((counts, row) => ({ ...counts, [row.verdict]: (counts[row.verdict] ?? 0) + 1 }), {});
  console.log(JSON.stringify({ ...snapshot.sources, ...summary, output: 'migration/parity/pages-matrix.csv' }, null, 2));
  if ((summary.missing ?? 0) > 0) process.exitCode = 2;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await main();
}

export { cleanText, clonePath, csvRows, decisionFor, extractLinks, originalUrl };
