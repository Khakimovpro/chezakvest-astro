#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = resolve(ROOT, 'src/data');
const PAGES_DIR = resolve(DATA, 'pages');
const JSON_OUTPUT = resolve(ROOT, 'docs/inventar-sayta.json');
const CSV_OUTPUT = resolve(ROOT, 'docs/inventar-sayta.csv');

const SOURCE_FILES = [
  'src/data/site.json',
  'src/data/venues.json',
  'src/data/reviews.json',
  'src/data/quizzes.json',
];

const normalizeWhitespace = (value) => String(value ?? '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/\u00a0/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const addressSignature = (value) => normalizeWhitespace(value)
  .toLocaleLowerCase('ru')
  .replaceAll('ё', 'е')
  .replace(/(?:^|[\s,.])(?:улица|ул\.?|проспект|пр-?т|переулок|пер\.?|дом|д\.?)(?=[\s,.]|$)/giu, ' ')
  .replace(/[^\p{L}\p{N}]/gu, '');

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Не удалось прочитать ${relative(ROOT, path)}: ${error.message}`);
  }
}

function gitLastModified(path) {
  try {
    return execFileSync(
      'git',
      ['log', '-1', '--format=%cs', '--', relative(ROOT, path)],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
  } catch {
    return '';
  }
}

function walk(value, visit, path = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, [...path, String(index)]));
    return;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => walk(item, visit, [...path, key]));
    return;
  }
  visit(value, path);
}

function uniqueMedia(page, extensions) {
  const matches = new Set();
  walk(page, (value, path) => {
    if (typeof value !== 'string') return;
    const key = path.at(-1) ?? '';
    if (key === 'source' || key === 'sourceUrl' || value.startsWith('data:')) return;
    if (extensions.test(value.split(/[?#]/)[0])) matches.add(value);
  });
  return [...matches].sort();
}

function collectStrings(value, output = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, output));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectStrings(item, output));
  } else if (typeof value === 'string') {
    const text = normalizeWhitespace(value);
    if (text) output.push(text);
  }
  return output;
}

function descriptiveText(page) {
  const fragments = [];
  const descriptiveKeys = new Set([
    'a',
    'benefit',
    'description',
    'lines',
    'note',
    'paragraphs',
    'sub',
    'subtitle',
    'text',
    'variants',
  ]);

  const source = { ...page };
  delete source.seo;
  delete source.sourceParity;
  walk(source, (value, path) => {
    if (typeof value !== 'string') return;
    const owningKey = [...path].reverse().find((part) => !/^\d+$/.test(part));
    if (descriptiveKeys.has(owningKey)) fragments.push(normalizeWhitespace(value));
  });
  return normalizeWhitespace(fragments.join(' '));
}

function heroFor(page) {
  return page.hero ?? page.sections?.find((section) => section.kind === 'hero') ?? {};
}

function characteristics(page) {
  const pills = (heroFor(page).pills ?? []).map(normalizeWhitespace);
  const duration = pills.find((pill) => /\d+\s*(?:мин(?:ут[аы]?)?\.?|час(?:а|ов)?)(?:\s|$)/iu.test(pill)) ?? '';
  const age = pills.find((pill) => /\d+\s*\+/u.test(pill))
    ?? pills.find((pill) => /\d+\s*[–—−-]\s*\d+\s*лет/iu.test(pill))
    ?? '';
  const players = pills.find((pill) => /(?:игрок|участник|гост|дет)/iu.test(pill) && pill !== age)
    ?? pills.find((pill) => /\d+\s*[–—−-]\s*\d+/u.test(pill) && pill !== age && pill !== duration)
    ?? '';
  return { age, players, duration };
}

function pageH1(page) {
  return normalizeWhitespace(
    page.seo?.h1
      ?? page.hero?.h1
      ?? page.sections?.find((section) => section.kind === 'hero')?.h1
      ?? '',
  );
}

function pageSlugFromHref(value, pageSlugs) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('/assets/')) return '';
  const slug = value.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
  return pageSlugs.has(slug) ? slug : '';
}

function duplicateGroups(pages, valueFor) {
  const groups = new Map();
  for (const page of pages) {
    const value = normalizeWhitespace(valueFor(page)).toLocaleLowerCase('ru');
    if (!value) continue;
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(page.slug);
  }
  return [...groups.entries()]
    .filter(([, slugs]) => slugs.length > 1)
    .map(([value, slugs]) => ({ value, slugs: slugs.sort() }));
}

function parseReviewDate(value) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(value ?? ''));
  if (!match) return null;
  const [, day, month, year] = match;
  return { raw: value, time: Date.UTC(Number(year), Number(month) - 1, Number(day)) };
}

function explicitPriceMentions(page) {
  const mentions = new Set();
  walk(page, (value, path) => {
    if (typeof value === 'number' && /price/i.test(path.at(-1) ?? '')) {
      mentions.add(String(value));
    }
    if (typeof value === 'string' && /\d[\d ]{2,}\s*(?:₽|руб)/iu.test(value)) {
      mentions.add(normalizeWhitespace(value));
    }
  });
  return [...mentions];
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return /[",\n\r;]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const pageFiles = (await readdir(PAGES_DIR))
  .filter((name) => name.endsWith('.json'))
  .sort((a, b) => a.localeCompare(b, 'ru'));
const pageEntries = await Promise.all(pageFiles.map(async (file) => ({
  file,
  path: resolve(PAGES_DIR, file),
  data: await readJson(resolve(PAGES_DIR, file)),
})));
const pages = pageEntries.map(({ data }) => data);
const pageSlugs = new Set(pages.map((page) => page.slug));

if (pageSlugs.size !== pages.length || pageSlugs.has(undefined)) {
  throw new Error('У страниц отсутствуют slug или найдены дубли slug');
}

const [site, venuesData, reviewsData, quizzesData] = await Promise.all([
  readJson(resolve(DATA, 'site.json')),
  readJson(resolve(DATA, 'venues.json')),
  readJson(resolve(DATA, 'reviews.json')),
  readJson(resolve(DATA, 'quizzes.json')),
]);

const venueBySlug = new Map((venuesData.chips ?? []).map((venue) => [venue.slug, venue]));
const pageBySlug = new Map(pages.map((page) => [page.slug, page]));
const venueAddressSignatures = new Map((venuesData.chips ?? []).map((venue) => [
  venue.slug,
  [...new Set([venue.t, venue.tipTitle].map(addressSignature).filter(Boolean))],
]));
const catalogCardBySlug = new Map((site.cards ?? []).map((card) => [
  pageSlugFromHref(card.href, pageSlugs),
  card,
]));
catalogCardBySlug.delete('');

const venueListingsByQuest = new Map();
for (const venue of venuesData.chips ?? []) {
  for (const group of venue.groups ?? []) {
    for (const item of group.items ?? []) {
      const slug = pageSlugFromHref(item.href, pageSlugs);
      if (!slug) continue;
      if (!venueListingsByQuest.has(slug)) venueListingsByQuest.set(slug, []);
      venueListingsByQuest.get(slug).push({
        venue_slug: venue.slug,
        venue_address: normalizeWhitespace(venue.t),
        group: normalizeWhitespace(group.g),
      });
    }
  }
}

const referenceSources = [
  ['src/data/site.json', site],
  ['src/data/venues.json', venuesData],
  ...pageEntries.map(({ file, data }) => [`src/data/pages/${file}`, data]),
];
const referencesBySlug = new Map([...pageSlugs].map((slug) => [slug, new Set()]));
for (const [source, data] of referenceSources) {
  walk(data, (value) => {
    const slug = pageSlugFromHref(value, pageSlugs);
    if (slug) referencesBySlug.get(slug).add(source);
  });
}
for (const { file, data } of pageEntries) {
  referencesBySlug.get(data.slug).delete(`src/data/pages/${file}`);
}

const rows = pageEntries.map(({ file, path, data: page }) => {
  const venueListings = venueListingsByQuest.get(page.slug) ?? [];
  const mediaImages = uniqueMedia(page, /\.(?:avif|gif|jpe?g|png|webp)$/iu);
  const mediaVideos = uniqueMedia(page, /\.(?:m3u8|mov|mp4|webm)$/iu);
  const traits = characteristics(page);
  const descriptionText = descriptiveText(page);
  const referencedBy = [...referencesBySlug.get(page.slug)].sort();
  const declaredVenueSlugs = page.venueSlug
    ? [page.venueSlug]
    : page.type === 'venue'
      ? [page.slug]
      : page.venueSlugs ?? [];
  const addressSearchSource = { ...page };
  delete addressSearchSource.sourceParity;
  const pageStrings = collectStrings(addressSearchSource);
  const mentionedVenueSlugs = [...venueAddressSignatures]
    .filter(([, signatures]) => signatures.some((signature) =>
      pageStrings.some((value) => addressSignature(value).includes(signature))))
    .map(([slug]) => slug);
  const resolvedVenueSlugs = [...new Set(
    declaredVenueSlugs.length > 0 ? declaredVenueSlugs : mentionedVenueSlugs,
  )];
  const resolvedVenueAddresses = resolvedVenueSlugs
    .map((slug) => venueBySlug.get(slug)?.t)
    .filter(Boolean)
    .map(normalizeWhitespace);

  return {
    slug: page.slug,
    type: page.type ?? '',
    h1: pageH1(page),
    venue_slugs: resolvedVenueSlugs,
    venue_addresses: [...new Set(resolvedVenueAddresses)],
    declared_venue_slugs: declaredVenueSlugs,
    mentioned_venue_slugs: mentionedVenueSlugs,
    age: traits.age,
    players: traits.players,
    duration: traits.duration,
    catalog_category: normalizeWhitespace(catalogCardBySlug.get(page.slug)?.cat ?? ''),
    venue_groups: [...new Set(venueListings.map((item) => item.group))],
    theme: page.theme ?? '',
    difficulty: page.difficulty ?? '',
    has_video: mediaVideos.length > 0,
    video_count: mediaVideos.length,
    video_refs: mediaVideos,
    photo_count: mediaImages.length,
    photo_refs: mediaImages,
    content_description_chars: descriptionText.length,
    story_description_chars: normalizeWhitespace((page.story?.paragraphs ?? []).join(' ')).length,
    seo_title: normalizeWhitespace(page.seo?.title ?? ''),
    seo_description: normalizeWhitespace(page.seo?.description ?? ''),
    seo_description_chars: normalizeWhitespace(page.seo?.description ?? '').length,
    explicit_price_mentions: explicitPriceMentions(page),
    internal_reference_source_count: referencedBy.length,
    referenced_by: referencedBy,
    last_modified: gitLastModified(path),
    source_file: `src/data/pages/${file}`,
  };
});

const venueRows = (venuesData.chips ?? []).map((venue) => {
  const page = pageBySlug.get(venue.slug);
  const registryGames = [...new Set((venue.groups ?? []).flatMap((group) =>
    (group.items ?? []).map((item) => pageSlugFromHref(item.href, pageSlugs)).filter(Boolean)))].sort();
  const pageGames = [...new Set((page?.games?.items ?? []).map((item) =>
    pageSlugFromHref(item.href, pageSlugs)).filter(Boolean))].sort();
  const hallLines = (page?.hall?.lines ?? []).map(normalizeWhitespace);
  return {
    slug: venue.slug,
    address: normalizeWhitespace(venue.t),
    latitude: venue.lat,
    longitude: venue.lon,
    groups: (venue.groups ?? []).map((group) => ({
      name: normalizeWhitespace(group.g),
      quest_slugs: (group.items ?? [])
        .map((item) => pageSlugFromHref(item.href, pageSlugs))
        .filter(Boolean),
    })),
    registry_quest_slugs: registryGames,
    page_quest_slugs: pageGames,
    hall_present: Boolean(page?.hall),
    hall_caption: normalizeWhitespace(page?.hall?.caption ?? ''),
    hall_capacity: hallLines.find((line) => /вместим/iu.test(line)) ?? '',
    registry_only_quest_slugs: registryGames.filter((slug) => !pageGames.includes(slug)),
    page_only_quest_slugs: pageGames.filter((slug) => !registryGames.includes(slug)),
  };
});

const parsedReviewDates = (reviewsData.reviews ?? [])
  .map((review) => parseReviewDate(review.date_create))
  .filter(Boolean)
  .sort((a, b) => a.time - b.time);
const quizKeyById = new Map(Object.entries(site.quiz ?? {}).map(([key, id]) => [id, key]));

const countsByType = Object.fromEntries(
  [...new Set(rows.map((row) => row.type))]
    .sort()
    .map((type) => [type, rows.filter((row) => row.type === type).length]),
);
const questRows = rows.filter((row) => row.type === 'quest');

const inventory = {
  schema_version: 1,
  sources: [...SOURCE_FILES, ...pageFiles.map((file) => `src/data/pages/${file}`)],
  definitions: {
    last_modified: 'Дата последнего коммита файла по git log; пусто, если файл ещё не был в Git.',
    photo_count: 'Число уникальных ссылок на растровые изображения в JSON страницы вне полей provenance source/sourceUrl; включает фото, фоновые изображения, постеры и растровый декор, в том числе sourceParity.',
    content_description_chars: 'Число символов в описательных полях lines/paragraphs/text/sub/subtitle/description/note/variants/a/benefit вне seo и sourceParity. Отдельный story_description_chars показывает объём story у квеста.',
    internal_reference_source_count: 'Число других файлов site.json, venues.json и pages/*.json с внутренней ссылкой на страницу; ссылка страницы на саму себя не считается.',
    venue_slugs: 'Явно заданные venueSlug/venueSlugs; если их нет — площадки, чей полный адрес найден в основных данных страницы без архивного sourceParity. declared_venue_slugs и mentioned_venue_slugs сохраняют происхождение связи.',
  },
  counts: {
    pages: rows.length,
    by_type: countsByType,
    catalog_cards: site.cards?.length ?? 0,
    venues: venueRows.length,
    stored_reviews: reviewsData.reviews?.length ?? 0,
    quizzes: Object.keys(quizzesData).length,
  },
  pages: rows,
  venues: venueRows,
  reviews: {
    stored_count: reviewsData.reviews?.length ?? 0,
    first_date: parsedReviewDates.at(0)?.raw ?? '',
    last_date: parsedReviewDates.at(-1)?.raw ?? '',
    aggregate_count: reviewsData.counts?.summary ?? '',
    aggregate_rating: reviewsData.ratings?.summaryWeight ?? '',
    services: Object.entries(reviewsData.services ?? {}).map(([id, service]) => ({
      id,
      name: service.name,
      rating: service.rating,
      count: service.count,
    })),
  },
  quizzes: Object.entries(quizzesData).map(([id, quiz]) => ({
    id,
    site_key: quizKeyById.get(id) ?? '',
    name: normalizeWhitespace(quiz.name),
    question_count: quiz.questions?.length ?? 0,
  })),
  issues: {
    pages_without_seo_description: rows.filter((row) => !row.seo_description).map((row) => row.slug),
    pages_without_photo_refs: rows.filter((row) => row.photo_count === 0).map((row) => row.slug),
    quests_without_story_description: questRows.filter((row) => row.story_description_chars === 0).map((row) => row.slug),
    quests_without_venue_slug: questRows.filter((row) => row.declared_venue_slugs.length === 0).map((row) => row.slug),
    quests_with_unknown_venue_slug: questRows
      .filter((row) => row.declared_venue_slugs.some((slug) => !venueBySlug.has(slug)))
      .map((row) => row.slug),
    quests_absent_from_venue_registry: questRows
      .filter((row) => !(venueListingsByQuest.get(row.slug) ?? []).some((item) => row.declared_venue_slugs.includes(item.venue_slug)))
      .map((row) => row.slug),
    quests_absent_from_catalog_cards: questRows
      .filter((row) => !catalogCardBySlug.has(row.slug))
      .map((row) => row.slug),
    duplicate_h1: duplicateGroups(pages, pageH1),
    duplicate_seo_title: duplicateGroups(pages, (page) => page.seo?.title),
    pages_without_structured_data_references: rows
      .filter((row) => row.internal_reference_source_count === 0)
      .map((row) => row.slug),
    venue_registry_page_mismatches: venueRows
      .filter((venue) => venue.registry_only_quest_slugs.length || venue.page_only_quest_slugs.length)
      .map((venue) => ({
        venue_slug: venue.slug,
        registry_only_quest_slugs: venue.registry_only_quest_slugs,
        page_only_quest_slugs: venue.page_only_quest_slugs,
      })),
  },
};

const csvColumns = [
  'slug',
  'type',
  'h1',
  'venue_slugs',
  'venue_addresses',
  'declared_venue_slugs',
  'mentioned_venue_slugs',
  'age',
  'players',
  'duration',
  'catalog_category',
  'venue_groups',
  'theme',
  'difficulty',
  'has_video',
  'video_count',
  'photo_count',
  'content_description_chars',
  'story_description_chars',
  'seo_title',
  'seo_description',
  'seo_description_chars',
  'explicit_price_mentions',
  'internal_reference_source_count',
  'referenced_by',
  'last_modified',
  'source_file',
];
const csv = [
  csvColumns.join(','),
  ...rows.map((row) => csvColumns.map((column) => csvCell(row[column])).join(',')),
].join('\n');

await Promise.all([
  writeFile(JSON_OUTPUT, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8'),
  writeFile(CSV_OUTPUT, `${csv}\n`, 'utf8'),
]);

console.log([
  `Страниц: ${inventory.counts.pages}`,
  `квестов: ${countsByType.quest ?? 0}`,
  `площадок: ${inventory.counts.venues}`,
  `отзывов в витрине: ${inventory.counts.stored_reviews}`,
  `квизов: ${inventory.counts.quizzes}`,
].join(', '));
console.log(`Записаны ${relative(ROOT, CSV_OUTPUT)} и ${relative(ROOT, JSON_OUTPUT)}`);
