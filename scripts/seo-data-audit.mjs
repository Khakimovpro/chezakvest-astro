import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES_DIRECTORY = join(PROJECT_ROOT, 'src', 'data', 'pages');
const SITE_DATA_PATH = join(PROJECT_ROOT, 'src', 'data', 'site.json');
const CATALOG_PAGE_PATH = join(PROJECT_ROOT, 'src', 'pages', 'kvesty-v-rostove-na-donu.astro');
const PRIVACY_PAGE_PATH = join(PROJECT_ROOT, 'src', 'pages', 'privacy.astro');
const LIVE_PARITY_SNAPSHOT_PATH = join(PROJECT_ROOT, 'migration', 'parity', 'live-inventory.json');
export const LEGACY_NOINDEX_SLUG = 'wednesday_ukradennaya_vesch';

const GEO_PATTERN = /Ростов(?:е|-на-Дону)?/iu;
const MIN_DESCRIPTION_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 160;
const MAX_TITLE_LENGTH = 60;

function characterCount(value) {
  return [...String(value || '')].length;
}

function normaliseKeywords(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');
}

export async function loadSeoPageData(pagesDirectory = PAGES_DIRECTORY) {
  const filenames = (await readdir(pagesDirectory))
    .filter((filename) => filename.endsWith('.json'))
    .sort();

  return Promise.all(filenames.map(async (filename) => ({
    filename,
    page: JSON.parse(await readFile(join(pagesDirectory, filename), 'utf8')),
  })));
}

async function loadStaticSeoRecords({ siteDataPath = SITE_DATA_PATH, catalogPagePath = CATALOG_PAGE_PATH } = {}) {
  const site = JSON.parse(await readFile(siteDataPath, 'utf8'));
  const catalogSource = await readFile(catalogPagePath, 'utf8');
  const errors = [];
  const catalogSeo = {};

  for (const field of ['title', 'description', 'keywords']) {
    const match = catalogSource.match(new RegExp(`const\\s+${field}\\s*=\\s*(['\"])([\\s\\S]*?)\\1;`));
    if (!match) {
      errors.push(`kvesty-v-rostove-na-donu: missing ${field} SEO constant`);
      catalogSeo[field] = '';
      continue;
    }
    catalogSeo[field] = match[2];

    if (!new RegExp(`<Layout\\b(?=[^>]*\\b${field}=\\{${field}\\})`, 's').test(catalogSource)) {
      errors.push(`kvesty-v-rostove-na-donu: Layout must receive ${field} from its SEO constant`);
    }
  }

  return {
    errors,
    records: [
      { filename: siteDataPath, page: { slug: 'home', seo: site.meta } },
      { filename: catalogPagePath, page: { slug: 'kvesty-v-rostove-na-donu', seo: catalogSeo } },
    ],
  };
}

async function loadPrivacySeoRecord(privacyPagePath = PRIVACY_PAGE_PATH) {
  const source = await readFile(privacyPagePath, 'utf8');
  const errors = [];
  const seo = {};
  const noindex = /\bnoindex\s*=\s*\{true\}/u.test(source);

  for (const field of ['title', 'description', 'keywords']) {
    const match = source.match(new RegExp("const\\s+" + field + "\\s*=\\s*(['\"])([\\s\\S]*?)\\1;"));
    if (!match) {
      errors.push('privacy: missing ' + field + ' SEO constant');
      seo[field] = '';
      continue;
    }
    seo[field] = match[2];
    if (!new RegExp("<Layout\\b(?=[^>]*\\b" + field + "=\\{" + field + "\\})", 's').test(source)) {
      errors.push('privacy: Layout must receive ' + field + ' from its SEO constant');
    }
  }

  return { errors, record: { filename: privacyPagePath, page: { slug: 'privacy', seo, noindex } } };
}

async function loadLiveParitySeo(snapshotPath = LIVE_PARITY_SNAPSHOT_PATH) {
  try {
    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
    const records = new Map();
    for (const record of snapshot.records ?? []) {
      const route = String(record.clone_path ?? '');
      if (!route || Number(record.http_orig) !== 200) continue;
      const slug = route === '/' ? 'home' : route.replace(/^\/+|\/+$/gu, '');
      records.set(slug, {
        title: String(record.title ?? '').trim(),
        description: String(record.description ?? '').trim(),
      });
    }
    return records;
  } catch (error) {
    if (error?.code === 'ENOENT') return new Map();
    throw error;
  }
}

export async function auditSeoData({
  pagesDirectory = PAGES_DIRECTORY,
  siteDataPath = SITE_DATA_PATH,
  catalogPagePath = CATALOG_PAGE_PATH,
  privacyPagePath = PRIVACY_PAGE_PATH,
  liveParitySnapshotPath = LIVE_PARITY_SNAPSHOT_PATH,
  includeStaticRoutes = true,
} = {}) {
  const records = await loadSeoPageData(pagesDirectory);
  const errors = [];
  const excludedSlugs = [];
  const indexableRecords = [];
  const staticRouteSlugs = [];

  for (const record of records) {
    if (record.page.slug === LEGACY_NOINDEX_SLUG) {
      excludedSlugs.push(record.page.slug);
      continue;
    }
    indexableRecords.push(record);
  }

  const liveParitySeo = await loadLiveParitySeo(liveParitySnapshotPath);

  if (includeStaticRoutes) {
    const [staticSeo, privacySeo] = await Promise.all([
      loadStaticSeoRecords({ siteDataPath, catalogPagePath }),
      loadPrivacySeoRecord(privacyPagePath),
    ]);
    errors.push(...staticSeo.errors, ...privacySeo.errors);
    indexableRecords.push(...staticSeo.records);
    if (privacySeo.record.page.noindex) excludedSlugs.push('privacy');
    else indexableRecords.push(privacySeo.record);
    staticRouteSlugs.push(...staticSeo.records.map((record) => record.page.slug), privacySeo.record.page.slug);
  }

  const keywordOwners = new Map();
  for (const { filename, page } of indexableRecords) {
    const seo = page.seo || {};
    const title = String(seo.title || '').trim();
    const description = String(seo.description || '').trim();
    const keywords = normaliseKeywords(seo.keywords);
    const pageId = page.slug || filename;
    const live = liveParitySeo.get(pageId);
    const titleMatchesVerifiedLive = Boolean(live) && title === live.title;
    const descriptionMatchesVerifiedLive = Boolean(live) && description === live.description;

    if (!GEO_PATTERN.test(title) && !titleMatchesVerifiedLive) {
      errors.push(`${pageId}: seo.title must contain Ростов or Ростове`);
    }
    if (characterCount(title) > MAX_TITLE_LENGTH && !titleMatchesVerifiedLive) {
      errors.push(`${pageId}: seo.title must be at most ${MAX_TITLE_LENGTH} characters, found ${characterCount(title)}`);
    }
    if ((characterCount(description) < MIN_DESCRIPTION_LENGTH || characterCount(description) > MAX_DESCRIPTION_LENGTH) && !descriptionMatchesVerifiedLive) {
      errors.push(`${pageId}: seo.description must be ${MIN_DESCRIPTION_LENGTH}–${MAX_DESCRIPTION_LENGTH} characters, found ${characterCount(description)}`);
    }
    if (!keywords) {
      errors.push(`${pageId}: seo.keywords must be non-empty and page-specific`);
      continue;
    }

    const owners = keywordOwners.get(keywords) || [];
    owners.push(pageId);
    keywordOwners.set(keywords, owners);
  }

  for (const owners of keywordOwners.values()) {
    if (owners.length > 1) {
      errors.push(`seo.keywords must be unique for indexable pages: ${owners.join(', ')}`);
    }
  }

  return {
    errors,
    excludedSlugs: excludedSlugs.sort(),
    indexablePageCount: indexableRecords.length,
    staticRouteSlugs,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await auditSeoData();
  if (report.errors.length > 0) {
    console.error(`SEO data audit failed: ${report.errors.length} issue(s).`);
    for (const error of report.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`SEO data audit passed: ${report.indexablePageCount} indexable pages; excluded ${report.excludedSlugs.join(', ')}.`);
  }
}
