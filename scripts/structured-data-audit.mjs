import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  breadcrumbJsonLd,
  collectionPageJsonLd,
  globalJsonLd,
  holidayServiceJsonLd,
  questServiceJsonLd,
  venueBusinessJsonLd,
  videoObjectJsonLd,
  visibleHolidayFaqJsonLd,
  visibleHolidayVideoJsonLd,
  websiteJsonLd,
  withCollectionBreadcrumbs,
} from '../src/lib/seo.js';
import { canonicalUrl, ORIGIN } from '../src/lib/urls.js';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES_DIRECTORY = join(PROJECT_ROOT, 'src', 'data', 'pages');
const SITE_DATA_PATH = join(PROJECT_ROOT, 'src', 'data', 'site.json');
const VENUES_DATA_PATH = join(PROJECT_ROOT, 'src', 'data', 'venues.json');
const CATALOG_PAGE_PATH = join(PROJECT_ROOT, 'src', 'pages', 'kvesty-v-rostove-na-donu.astro');
const SNAPSHOT_MANIFEST_PATH = join(PROJECT_ROOT, 'src', 'generated', 'source-snapshot-manifest.json');
const SNAPSHOT_DIRECTORY = join(PROJECT_ROOT, 'src', 'source-snapshots');
const DIST_DIRECTORY = join(PROJECT_ROOT, 'dist');
const LEGACY_NOINDEX_SLUG = 'wednesday_ukradennaya_vesch';
const PLACEHOLDER_PATTERN = /(?:example\.(?:com|org|test)|localhost|127\.0\.0\.1|\b(?:todo|tbd|undefined|placeholder)\b|заглуш)/iu;
const HIDDEN_CUSTOM_ARTBOARDS = new Set([
  'vypusknoj-artboard',
  'maxi-artboard',
  'minecraft-artboard',
  'newyear-artboard',
  'amongus-artboard',
  'roblox-artboard',
  'vr-birthday-artboard',
  'kalmar-landing-artboard',
  'azkaban-artboard',
  'kids-artboard',
]);
const SOURCE_CONTRACTS = [
  ['src/layouts/Layout.astro', [/globalJsonLd\(\{ site, path, title: schemaName, image: verifiedPageImage, visibleSource: sourceSnapshot\?\.html \|\| '', jsonld \}\)/gu, /sourceSnapshot\.html\.includes\(pageImage\)/gu, /renderedJsonLd\.map/gu]],
  ['src/layouts/QuestPage.astro', [/questServiceJsonLd\(\{ page, venue, venueVisible: serviceVenueVisible, site \}\)/gu, /videoObjectJsonLd\(\{/gu]],
  ['src/layouts/VenuePage.astro', [/venueBusinessJsonLd\(\{ page, venue, site \}\)/gu]],
  ['src/layouts/HolidayPage.astro', [/holidayServiceJsonLd\(\{ page, site \}\)/gu, /visibleHolidayFaqJsonLd\(page, faq\)/gu, /visibleHolidayVideoJsonLd\(page\)/gu]],
  ['src/layouts/InfoPage.astro', [/breadcrumbs\.length > 0 && breadcrumbJsonLd\(breadcrumbs, path\)/gu]],
  ['src/layouts/CategoryPage.astro', [/collectionPageJsonLd\(\{\s*path,/gu]],
  ['src/pages/index.astro', [/const jsonld = \[websiteJsonLd\(\)\]/gu, /ogImage=\{s\.hero\.bg\}/gu]],
  ['src/pages/kvesty-v-rostove-na-donu.astro', [/collectionPageJsonLd\(\{\s*path,/gu]],
  ['src/pages/[...slug].astro', [/venuesData\.chips/gu, /lat: details\.lat/gu, /lon: details\.lon/gu]],
];

const REQUIRED_PROPERTIES = {
  Organization: ['@id', 'name', 'url', 'logo', 'telephone', 'sameAs', 'contactPoint'],
  WebSite: ['@id', 'name', 'url', 'inLanguage', 'publisher'],
  WebPage: ['@id', 'name', 'url', 'inLanguage', 'isPartOf', 'about'],
  ImageObject: ['@id', 'contentUrl', 'url'],
  Service: ['@id', 'name', 'serviceType', 'url', 'areaServed', 'provider'],
  EntertainmentBusiness: ['@id', 'name', 'url', 'telephone', 'address', 'geo', 'openingHoursSpecification', 'parentOrganization'],
  CollectionPage: ['@id', 'name', 'url', 'isPartOf', 'mainEntity'],
  BreadcrumbList: ['itemListElement'],
  FAQPage: ['@id', 'mainEntity'],
  VideoObject: ['@id', 'name', 'description', 'thumbnailUrl', 'uploadDate', 'contentUrl', 'url'],
};
const ALLOWED_PROPERTIES = {
  Organization: ['@context', '@type', '@id', 'name', 'url', 'logo', 'telephone', 'email', 'sameAs', 'contactPoint'],
  WebSite: ['@context', '@type', '@id', 'name', 'url', 'inLanguage', 'publisher'],
  WebPage: ['@context', '@type', '@id', 'name', 'url', 'inLanguage', 'isPartOf', 'about', 'primaryImageOfPage'],
  ImageObject: ['@context', '@type', '@id', 'contentUrl', 'url', 'representativeOfPage'],
  Service: ['@context', '@type', '@id', 'name', 'serviceType', 'description', 'url', 'image', 'areaServed', 'audience', 'provider', 'availableChannel', 'offers'],
  EntertainmentBusiness: ['@context', '@type', '@id', 'name', 'url', 'telephone', 'image', 'address', 'geo', 'openingHoursSpecification', 'hasMap', 'parentOrganization'],
  CollectionPage: ['@context', '@type', '@id', 'name', 'url', 'isPartOf', 'mainEntity'],
  BreadcrumbList: ['@context', '@type', 'itemListElement'],
  FAQPage: ['@context', '@type', '@id', 'mainEntity'],
  VideoObject: ['@context', '@type', '@id', 'name', 'description', 'thumbnailUrl', 'uploadDate', 'contentUrl', 'url', 'duration'],
  ContactPoint: ['@type', 'telephone', 'contactType', 'availableLanguage'],
  City: ['@type', 'name'],
  PeopleAudience: ['@type', 'suggestedMinAge'],
  ServiceChannel: ['@type', 'serviceLocation'],
  Place: ['@type', '@id', 'name', 'url'],
  OpeningHoursSpecification: ['@type', 'opens', 'closes'],
  PostalAddress: ['@type', 'streetAddress', 'addressLocality'],
  GeoCoordinates: ['@type', 'latitude', 'longitude'],
  Offer: ['@type', 'priceCurrency', 'url', 'price'],
  ItemList: ['@type', '@id', 'numberOfItems', 'itemListElement'],
  ListItem: ['@type', 'position', 'name', 'item', 'url'],
  Question: ['@type', 'name', 'acceptedAnswer'],
  Answer: ['@type', 'text'],
};

const hasType = (schema, type) => {
  const types = Array.isArray(schema?.['@type']) ? schema['@type'] : [schema?.['@type']];
  return types.includes(type);
};

const topLevelTypes = (schemas) => schemas.flatMap((schema) => (
  Array.isArray(schema['@type']) ? schema['@type'] : [schema['@type']]
)).filter(Boolean);

function walk(value, visit, path = '$') {
  visit(value, path);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) walk(child, visit, `${path}.${key}`);
  }
}

function canonicalImageFor(page) {
  if (page.type === 'quest' || page.type === 'category') return page.hero?.bg || '';
  if (page.type === 'venue') return page.howto?.photos?.[0] || '';
  if (page.type === 'holiday') {
    return (page.sections || []).find((section) => section.kind === 'hero')?.bg || '';
  }
  return '';
}

function normaliseVisibleText(value = '') {
  return String(value)
    .replace(/<script\b[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/(?:&nbsp;|&#160;|&#xa0;)/giu, ' ')
    .replace(/&ndash;/giu, '–')
    .replace(/&minus;/giu, '−')
    .replace(/&laquo;/giu, '«')
    .replace(/&raquo;/giu, '»')
    .replace(/&amp;/giu, '&')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLocaleLowerCase('ru-RU');
}

function normaliseHeading(value = '') {
  return normaliseVisibleText(value)
    .replace(/\s*—\s*/gu, ' — ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function catalogConstant(source, name) {
  return source.match(new RegExp(`const\\s+${name}\\s*=\\s*(['"])([\\s\\S]*?)\\1;`, 'u'))?.[2] || '';
}

function breadcrumbSchema(page, path) {
  const breadcrumbs = withCollectionBreadcrumbs(page.breadcrumbs || []);
  return breadcrumbs.length > 0 ? breadcrumbJsonLd(breadcrumbs, path) : null;
}

function questVenueIsRendered(page, venueBySlug) {
  const selectedVenue = venueBySlug.get(page.venueSlug);
  const venueContent = page.venue || {};
  const visibleVenueBlocks = page.celebrationVenues?.length
    ? page.celebrationVenues
    : ((venueContent.photos?.length || venueContent.lines?.length)
      ? [{ ...venueContent, venueSlug: page.venueSlug }]
      : []);
  return visibleVenueBlocks.some((hall) => {
    const hallVenue = venueBySlug.get(hall.venueSlug) || selectedVenue;
    return hallVenue?.slug === selectedVenue?.slug && Boolean(hall.address || hallVenue?.address);
  });
}

function pageSpecificSchemas(page, pages, venueBySlug, site) {
  const path = `/${page.slug}`;
  if (page.type === 'quest') {
    const venue = venueBySlug.get(page.venueSlug);
    return [
      questServiceJsonLd({ page, venue, venueVisible: questVenueIsRendered(page, venueBySlug), site }),
      breadcrumbSchema(page, path),
      videoObjectJsonLd({
        video: page.video,
        path,
        pageName: page.seo?.h1,
        description: page.seo?.description,
      }),
    ].filter(Boolean);
  }
  if (page.type === 'venue') {
    return [
      venueBusinessJsonLd({ page, venue: venueBySlug.get(page.slug), site }),
      breadcrumbSchema(page, path),
    ].filter(Boolean);
  }
  if (page.type === 'holiday') {
    return [
      holidayServiceJsonLd({ page, site }),
      breadcrumbSchema(page, path),
      visibleHolidayFaqJsonLd(page),
      visibleHolidayVideoJsonLd(page),
    ].filter(Boolean);
  }
  if (page.type === 'category') {
    const pagesBySlug = new Map(pages.map((candidate) => [candidate.slug, candidate]));
    const items = (page.games?.items || []).map((item) => {
      const linkedPage = pagesBySlug.get(String(item.href || '').replace(/^\//u, ''));
      return {
        name: item.t || linkedPage?.seo?.h1,
        url: item.href,
      };
    });
    return [
      collectionPageJsonLd({
        path,
        name: page.seo?.h1,
        description: page.seo?.description,
        items,
      }),
      breadcrumbSchema(page, path),
    ].filter(Boolean);
  }
  return [breadcrumbSchema(page, path)].filter(Boolean);
}

function visibleFaqItems(page) {
  const hero = (page.sections || []).find((section) => section.kind === 'hero') || {};
  if (hero.composition === 'newyear-artboard') return page.sourceParity?.faq || [];
  if (HIDDEN_CUSTOM_ARTBOARDS.has(hero.composition)) return [];
  return (page.sections || []).find((section) => section.kind === 'faq')?.items || [];
}

function visiblePlayableVideo(page) {
  if (page.type === 'quest') return page.video?.poster && page.video?.src ? page.video : null;
  if (page.type === 'holiday') {
    const hero = (page.sections || []).find((section) => section.kind === 'hero') || {};
    if (HIDDEN_CUSTOM_ARTBOARDS.has(hero.composition)) return null;
    const video = (page.sections || []).find((section) => section.kind === 'video');
    return video?.poster && video?.src ? video : null;
  }
  return null;
}

function visibleHolidayPrice(page) {
  const priceBlock = (page.sections || []).find((section) => section.kind === 'packages'
    && section.items?.some((item) => item.price));
  const prices = (priceBlock?.items || []).map((item) => (
    Number((String(item.price).match(/\d[\d ]*/u) || [''])[0].replace(/\D/gu, '')) || null
  )).filter(Boolean);
  return prices.length > 0 ? Math.min(...prices) : null;
}

async function validateSourceWiring(errors) {
  for (const [relativePath, patterns] of SOURCE_CONTRACTS) {
    const source = await readFile(join(PROJECT_ROOT, relativePath), 'utf8');
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      if (!pattern.test(source)) errors.push(`${relativePath}: structured-data generator is not wired into the rendered source`);
    }
  }
}

async function loadRenderedSchemas(records, errors) {
  await Promise.all(records.map(async (record) => {
    const relativePath = record.path === '/' ? 'index.html' : join(record.path.slice(1), 'index.html');
    const htmlPath = join(DIST_DIRECTORY, relativePath);
    let html;
    try {
      html = await readFile(htmlPath, 'utf8');
    } catch (error) {
      errors.push(`${record.path}: rendered HTML is missing at ${htmlPath} (${error.code || error.message})`);
      record.schemas = [];
      return;
    }

    const canonical = html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']+)["'][^>]*>/iu)?.[1]
      || html.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']canonical["'][^>]*>/iu)?.[1];
    if (canonical !== canonicalUrl(record.path)) errors.push(`${record.path}: rendered canonical is missing or incorrect`);

    const schemas = [];
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/giu)) {
      if (!/\btype=["']application\/ld\+json["']/iu.test(match[1])) continue;
      try {
        schemas.push(JSON.parse(match[2]));
      } catch (error) {
        errors.push(`${record.path}: rendered JSON-LD is invalid JSON (${error.message})`);
      }
    }
    record.schemas = schemas;
  }));
}

async function loadAuditPages() {
  const [filenames, siteSource, venuesSource, catalogSource, snapshotManifestSource] = await Promise.all([
    readdir(PAGES_DIRECTORY),
    readFile(SITE_DATA_PATH, 'utf8'),
    readFile(VENUES_DATA_PATH, 'utf8'),
    readFile(CATALOG_PAGE_PATH, 'utf8'),
    readFile(SNAPSHOT_MANIFEST_PATH, 'utf8'),
  ]);
  const [site, venues, loadedPages] = await Promise.all([
    JSON.parse(siteSource),
    JSON.parse(venuesSource),
    Promise.all(filenames.filter((filename) => filename.endsWith('.json')).sort().map(async (filename) => (
      JSON.parse(await readFile(join(PAGES_DIRECTORY, filename), 'utf8'))
    ))),
  ]);
  const pages = loadedPages.filter((page) => page.slug !== LEGACY_NOINDEX_SLUG);
  const snapshotManifest = JSON.parse(snapshotManifestSource);
  const snapshotHtml = new Map(await Promise.all(Object.entries(snapshotManifest.routes || {}).map(async ([route, metadata]) => (
    [route, await readFile(join(SNAPSHOT_DIRECTORY, metadata.snapshot), 'utf8')]
  ))));
  const pagesBySlug = new Map(pages.map((page) => [page.slug, page]));
  const venueBySlug = new Map(venues.chips.map((venue) => [venue.slug, {
    ...venue,
    address: venue.t,
  }]));

  const records = pages.map((page) => {
    const path = `/${page.slug}`;
    const candidateImage = canonicalImageFor(page);
    const sourceHtml = snapshotHtml.get(`${path}/`);
    const image = candidateImage && (!sourceHtml || sourceHtml.includes(candidateImage)) ? candidateImage : '';
    const mapUrl = page.howto?.routeUrl && sourceHtml?.includes(page.howto.routeUrl)
      ? page.howto.routeUrl
      : '';
    const primaryContent = sourceHtml?.split(/<footer\b/iu)[0] || '';
    const venue = venueBySlug.get(page.venueSlug);
    const venuePath = venue?.slug ? `/${venue.slug}` : '';
    const venueLinkedFromPrimaryContent = venuePath && (
      primaryContent.includes(`href="${venuePath}"`)
      || primaryContent.includes(`href="${venuePath}/"`)
    );
    const serviceLocationVisible = questVenueIsRendered(page, venueBySlug) && (!sourceHtml
      || Boolean(venue?.address && primaryContent.includes(venue.address) && venueLinkedFromPrimaryContent));
    const schemaName = page.seo?.h1;
    const schemas = globalJsonLd({
      site,
      path,
      title: schemaName,
      image,
      visibleSource: sourceHtml || '',
      jsonld: pageSpecificSchemas(page, pages, venueBySlug, site),
    });
    return {
      path,
      kind: page.type,
      page,
      candidateImage,
      image,
      mapUrl,
      serviceLocationVisible,
      title: page.seo?.title,
      description: page.seo?.description,
      schemaName,
      visibleText: normaliseVisibleText(sourceHtml),
      visibleBreadcrumbs: withCollectionBreadcrumbs(page.breadcrumbs || []),
      visibleItems: page.type === 'category' ? (page.games?.items || []).map((item) => ({
        name: item.t || pagesBySlug.get(String(item.href || '').replace(/^\//u, ''))?.seo?.h1,
        url: item.href,
      })) : undefined,
      schemas,
    };
  });

  const catalogPath = '/kvesty-v-rostove-na-donu';
  const catalogTitle = catalogConstant(catalogSource, 'title');
  const catalogDescription = catalogConstant(catalogSource, 'description');
  const quests = pages.filter((page) => page.type === 'quest')
    .sort((left, right) => (left.hero?.h1 || left.seo?.h1 || left.slug)
      .localeCompare(right.hero?.h1 || right.seo?.h1 || right.slug, 'ru'));
  records.push({
    path: catalogPath,
    kind: 'catalog',
    image: '',
    title: catalogTitle,
    description: catalogDescription,
    schemaName: 'Квесты в Ростове-на-Дону',
    visibleBreadcrumbs: [
      { t: 'Главная', href: '/' },
      { t: 'Все квесты', href: null },
    ],
    visibleText: '',
    visibleItems: quests.map((page) => ({
      name: page.hero?.h1 || page.seo?.h1 || page.slug,
      url: `/${page.slug}`,
    })),
    schemas: globalJsonLd({
      site,
      path: catalogPath,
      title: 'Квесты в Ростове-на-Дону',
      jsonld: [
        collectionPageJsonLd({
          path: catalogPath,
          name: 'Квесты в Ростове-на-Дону',
          description: catalogDescription,
          items: quests.map((page) => ({
            name: page.hero?.h1 || page.seo?.h1 || page.slug,
            url: `/${page.slug}`,
          })),
        }),
        breadcrumbJsonLd([
          { t: 'Главная', href: '/' },
          { t: 'Все квесты', href: null },
        ], catalogPath),
      ],
    }),
  });

  records.push({
    path: '/',
    kind: 'home',
    candidateImage: site.hero?.bg || '',
    image: site.hero?.bg && snapshotHtml.get('/')?.includes(site.hero.bg) ? site.hero.bg : '',
    title: site.meta?.title,
    description: site.meta?.description,
    schemaName: [site.hero?.h1line1, site.hero?.h1line2].filter(Boolean).join(' '),
    visibleText: normaliseVisibleText(snapshotHtml.get('/')),
    visibleBreadcrumbs: [],
    schemas: globalJsonLd({
      site,
      path: '/',
      title: [site.hero?.h1line1, site.hero?.h1line2].filter(Boolean).join(' '),
      image: site.hero?.bg && snapshotHtml.get('/')?.includes(site.hero.bg) ? site.hero.bg : '',
      visibleSource: snapshotHtml.get('/') || '',
      jsonld: [websiteJsonLd()],
    }),
  });

  return {
    records: records.sort((left, right) => left.path.localeCompare(right.path, 'ru')),
    site,
    venueBySlug,
  };
}

function validateRequiredProperties(schema, label, errors) {
  for (const type of topLevelTypes([schema])) {
    for (const property of REQUIRED_PROPERTIES[type] || []) {
      if (!(property in schema)) errors.push(`${label}: ${type} is missing ${property}`);
    }
  }
}

function validateGenericSchema(schema, label, errors) {
  let parsed;
  try {
    parsed = JSON.parse(JSON.stringify(schema));
  } catch (error) {
    errors.push(`${label}: JSON-LD is not serializable JSON (${error.message})`);
    return null;
  }

  if (parsed['@context'] !== 'https://schema.org') {
    errors.push(`${label}: JSON-LD must use the https://schema.org context`);
  }
  if (!parsed['@type']) errors.push(`${label}: JSON-LD is missing @type`);
  validateRequiredProperties(parsed, label, errors);

  walk(parsed, (value, valuePath) => {
    if (typeof value === 'string') {
      if (!value.trim()) errors.push(`${label}: empty string at ${valuePath}`);
      if (PLACEHOLDER_PATTERN.test(value)) errors.push(`${label}: placeholder value at ${valuePath}`);
    } else if (Array.isArray(value) && value.length === 0) {
      errors.push(`${label}: empty array at ${valuePath}`);
    } else if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
      errors.push(`${label}: empty object at ${valuePath}`);
    } else if (value === null) {
      errors.push(`${label}: null value at ${valuePath}`);
    }

    if (!value || typeof value !== 'object' || Array.isArray(value) || !value['@type']) return;
    const valueTypes = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
    const allowed = new Set(valueTypes.flatMap((type) => ALLOWED_PROPERTIES[type] || []));
    for (const type of valueTypes) {
      if (!ALLOWED_PROPERTIES[type]) errors.push(`${label}: unsupported unchecked type ${type} at ${valuePath}`);
    }
    for (const property of Object.keys(value)) {
      if (!allowed.has(property)) errors.push(`${label}: unchecked property ${property} at ${valuePath}`);
    }
    const nestedRequired = {
      ContactPoint: ['telephone', 'contactType', 'availableLanguage'],
      City: ['name'],
      PeopleAudience: ['suggestedMinAge'],
      ServiceChannel: ['serviceLocation'],
      Place: ['@id', 'name', 'url'],
      OpeningHoursSpecification: ['opens', 'closes'],
      PostalAddress: ['streetAddress', 'addressLocality'],
      GeoCoordinates: ['latitude', 'longitude'],
      Offer: ['priceCurrency', 'url', 'price'],
      ItemList: ['@id', 'numberOfItems', 'itemListElement'],
      Question: ['name', 'acceptedAnswer'],
      Answer: ['text'],
    };
    for (const property of nestedRequired[value['@type']] || []) {
      if (!(property in value)) errors.push(`${label}: nested ${value['@type']} is missing ${property} at ${valuePath}`);
    }
    if (value['@type'] === 'ListItem') {
      for (const property of ['position', 'name']) {
        if (!(property in value)) errors.push(`${label}: nested ListItem is missing ${property} at ${valuePath}`);
      }
      if (!('item' in value) && !('url' in value)) {
        errors.push(`${label}: nested ListItem is missing item/url at ${valuePath}`);
      }
    }
  });
  return parsed;
}

function validateOrganization(schema, site, label, errors) {
  if (schema['@id'] !== canonicalUrl('/#organization')) errors.push(`${label}: Organization @id is not canonical`);
  if (schema.name !== 'Чё за Квест') errors.push(`${label}: Organization.name differs from the verified brand name`);
  if (schema.url !== canonicalUrl('/')) errors.push(`${label}: Organization.url must be the canonical home URL`);
  if (schema.logo?.['@type'] !== 'ImageObject') errors.push(`${label}: Organization.logo must be an ImageObject`);
  if (schema.logo?.url !== `${ORIGIN}${site.header.logo}`) errors.push(`${label}: Organization.logo must use the visible site logo`);
  if (schema.telephone !== site.header.phone) errors.push(`${label}: Organization.telephone differs from site.json`);
  if (schema.email !== String(site.footer.email).replace(/^mailto:/iu, '')) errors.push(`${label}: Organization.email differs from site.json`);
  if (schema.contactPoint?.['@type'] !== 'ContactPoint') errors.push(`${label}: Organization.contactPoint must be a ContactPoint`);
  if (schema.contactPoint?.telephone !== site.header.phone) errors.push(`${label}: Organization.contactPoint differs from site.json`);
  if (schema.contactPoint?.contactType !== 'reservations'
    || Object.hasOwn(schema.contactPoint || {}, 'areaServed')
    || schema.contactPoint?.availableLanguage !== 'Russian') {
    errors.push(`${label}: Organization.contactPoint contains unverified service data`);
  }
  if (JSON.stringify(schema.sameAs) !== JSON.stringify([site.header.vk])) errors.push(`${label}: Organization.sameAs must contain only the verified VK profile`);
}

function validateWebsite(schema, label, errors) {
  if (schema['@id'] !== canonicalUrl('/#website')
    || schema.name !== 'Чё за Квест'
    || schema.url !== canonicalUrl('/')
    || schema.inLanguage !== 'ru-RU'
    || schema.publisher?.['@id'] !== canonicalUrl('/#organization')) {
    errors.push(`${label}: WebSite differs from the canonical site identity`);
  }
}

function validateBreadcrumbs(schema, record, label, errors) {
  const canonical = canonicalUrl(record.path);
  const items = schema.itemListElement;
  if (!Array.isArray(items) || items.length === 0) return;
  const expected = (record.visibleBreadcrumbs || []).map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.t,
    item: canonicalUrl(item.href || record.path),
  }));
  if (JSON.stringify(items) !== JSON.stringify(expected)) errors.push(`${label}: BreadcrumbList differs from the visible breadcrumbs`);
  items.forEach((item, index) => {
    if (item['@type'] !== 'ListItem') errors.push(`${label}: BreadcrumbList item ${index + 1} is missing @type ListItem`);
    if (item.position !== index + 1) errors.push(`${label}: BreadcrumbList positions must be consecutive`);
    if (!item.name || !item.item) errors.push(`${label}: BreadcrumbList item ${index + 1} is incomplete`);
  });
  if (items.at(-1)?.item !== canonical) errors.push(`${label}: final breadcrumb does not match canonical`);
}

function validateFaq(schema, page, path, label, errors) {
  const expected = visibleFaqItems(page);
  if (schema['@id'] !== `${canonicalUrl(path)}#faq`) errors.push(`${label}: FAQPage @id does not match canonical`);
  const actual = (schema.mainEntity || []).map((question) => ({
    q: question.name,
    a: question.acceptedAnswer?.text,
  }));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    errors.push(`${label}: FAQPage differs from the questions and answers visible on the page`);
  }
  (schema.mainEntity || []).forEach((question, index) => {
    if (question['@type'] !== 'Question') errors.push(`${label}: FAQ question ${index + 1} is missing @type Question`);
    if (question.acceptedAnswer?.['@type'] !== 'Answer') errors.push(`${label}: FAQ answer ${index + 1} is missing @type Answer`);
  });
}

function validateRecord(record, site, venueBySlug, errors) {
  const canonical = canonicalUrl(record.path);
  const parsedSchemas = record.schemas.map((schema, index) => (
    validateGenericSchema(schema, `${record.path} JSON-LD #${index + 1}`, errors)
  )).filter(Boolean);
  const types = new Set(topLevelTypes(parsedSchemas));

  for (const requiredType of ['Organization', 'WebPage']) {
    if (!types.has(requiredType)) errors.push(`${record.path}: missing ${requiredType}`);
  }
  if (record.path !== '/' && !types.has('BreadcrumbList')) errors.push(`${record.path}: missing BreadcrumbList`);
  if (record.image && !types.has('ImageObject')) errors.push(`${record.path}: visible primary image is missing ImageObject`);
  if (!record.image && types.has('ImageObject')) errors.push(`${record.path}: ImageObject has no visible page-specific image source`);
  const visibleFaq = visibleFaqItems(record.page || {});
  if (visibleFaq.length > 0 && !types.has('FAQPage')) errors.push(`${record.path}: visible FAQ is missing FAQPage`);
  if (visibleFaq.length === 0 && types.has('FAQPage')) errors.push(`${record.path}: FAQPage has no visible FAQ source`);
  for (const [index, item] of visibleFaq.entries()) {
    if (record.visibleText && (!record.visibleText.includes(normaliseVisibleText(item.q))
      || !record.visibleText.includes(normaliseVisibleText(item.a)))) {
      errors.push(`${record.path}: FAQ item ${index + 1} is not visible in the rendered snapshot body`);
    }
  }
  if (record.visibleText && !normaliseHeading(record.visibleText).includes(normaliseHeading(record.schemaName))) {
    errors.push(`${record.path}: WebPage.name is not visible in the rendered snapshot body`);
  }

  const webPage = parsedSchemas.find((schema) => hasType(schema, 'WebPage'));
  if (webPage?.url !== canonical) errors.push(`${record.path}: WebPage.url does not match canonical`);
  if (webPage?.['@id'] !== `${canonical}#webpage`) errors.push(`${record.path}: WebPage @id does not match canonical`);
  if (webPage?.name !== record.schemaName) errors.push(`${record.path}: WebPage.name differs from the visible page heading`);
  if (webPage?.inLanguage !== 'ru-RU'
    || webPage?.isPartOf?.['@id'] !== canonicalUrl('/#website')
    || webPage?.about?.['@id'] !== canonicalUrl('/#organization')) {
    errors.push(`${record.path}: WebPage language or site relationships are invalid`);
  }

  const primaryImage = parsedSchemas.find((schema) => hasType(schema, 'ImageObject') && schema['@id'] === `${canonical}#primaryimage`);
  if (record.image && primaryImage?.contentUrl !== `${ORIGIN}${record.image}`) {
    errors.push(`${record.path}: primary ImageObject differs from the visible page image`);
  }
  if (record.image && (primaryImage?.url !== `${ORIGIN}${record.image}`
    || primaryImage?.representativeOfPage !== true)) {
    errors.push(`${record.path}: primary ImageObject contains data not backed by the page image`);
  }
  if (record.image && webPage?.primaryImageOfPage?.['@id'] !== `${canonical}#primaryimage`) {
    errors.push(`${record.path}: WebPage.primaryImageOfPage does not reference the primary ImageObject`);
  }

  const ids = parsedSchemas.map((schema) => schema['@id']).filter(Boolean);
  if (new Set(ids).size !== ids.length) errors.push(`${record.path}: duplicate top-level JSON-LD @id`);

  for (const schema of parsedSchemas) {
    const label = `${record.path} ${schema['@type']}`;
    if (hasType(schema, 'Organization')) validateOrganization(schema, site, label, errors);
    if (hasType(schema, 'WebSite')) validateWebsite(schema, label, errors);
    if (hasType(schema, 'BreadcrumbList')) validateBreadcrumbs(schema, record, label, errors);
    if (hasType(schema, 'FAQPage')) validateFaq(schema, record.page, record.path, label, errors);
  }

  const nestedTypes = new Set();
  walk(parsedSchemas, (value) => {
    if (value && typeof value === 'object' && value['@type']) {
      for (const type of Array.isArray(value['@type']) ? value['@type'] : [value['@type']]) nestedTypes.add(type);
    }
  });
  for (const forbiddenType of ['Review', 'AggregateRating']) {
    if (nestedTypes.has(forbiddenType)) errors.push(`${record.path}: self-serving ${forbiddenType} markup is forbidden`);
  }

  if (record.kind === 'quest') {
    const service = parsedSchemas.find((schema) => hasType(schema, 'Service'));
    if (!service) errors.push(`${record.path}: quest page is missing Service`);
    if (service?.['@id'] !== `${canonical}#service` || service?.url !== canonical) errors.push(`${record.path}: quest Service does not match canonical`);
    const pills = record.page.hero?.pills || [];
    const age = pills.find((pill) => /^\d+\+$/u.test(String(pill).trim()));
    const duration = pills.find((pill) => /мин|час/iu.test(String(pill)));
    const players = pills.find((pill) => /^\d+\s*[-–−]\s*\d+$/u.test(String(pill).trim()));
    const factSummary = [
      duration && `Длительность: ${duration}`,
      players && `Количество игроков: ${players}`,
    ].filter(Boolean).join('. ');
    const questTitle = String(record.page.seo?.title || '').trim().toLocaleLowerCase('ru-RU');
    const expectedServiceType = questTitle === 'vr-игра' || questTitle.startsWith('vr-игра ')
      ? 'VR-игра'
      : 'Квест в реальности';
    for (const fact of [age, duration, players].filter(Boolean)) {
      if (record.visibleText && !record.visibleText.includes(normaliseVisibleText(fact))) {
        errors.push(`${record.path}: quest fact "${fact}" is not visible in the rendered snapshot body`);
      }
    }
    if (service?.name !== record.page.seo?.h1 || service?.description !== factSummary) errors.push(`${record.path}: quest Service text differs from visible page data`);
    if (record.image && service?.image !== `${ORIGIN}${record.image}`) errors.push(`${record.path}: quest Service image differs from the verified visible hero`);
    if (!record.image && Object.hasOwn(service || {}, 'image')) errors.push(`${record.path}: quest Service image is not present in the rendered body`);
    if (service?.serviceType !== expectedServiceType
      || service?.areaServed?.['@type'] !== 'City'
      || service?.areaServed?.name !== 'Ростов-на-Дону'
      || service?.provider?.['@id'] !== canonicalUrl('/#organization')) {
      errors.push(`${record.path}: quest Service type, city or provider is invalid`);
    }
    if (record.visibleText && !/ростов(?:е)?-на-дону/iu.test(record.visibleText)) errors.push(`${record.path}: quest service city is not visible in the rendered snapshot body`);
    if (expectedServiceType === 'VR-игра' && record.visibleText && !/\bvr\b/iu.test(record.visibleText)) errors.push(`${record.path}: VR service type is not visible in the rendered snapshot body`);
    if (service?.offers) errors.push(`${record.path}: quest Service must not invent an Offer`);
    if (!service?.audience) errors.push(`${record.path}: quest Service is missing the visible age audience`);
    if (service?.audience?.['@type'] !== 'PeopleAudience') errors.push(`${record.path}: quest Service audience has the wrong type`);
    if (service?.audience?.suggestedMinAge !== Number.parseInt(age, 10)) errors.push(`${record.path}: quest Service age differs from the visible pill`);
    const venue = venueBySlug.get(record.page.venueSlug);
    const serviceLocation = service?.availableChannel?.serviceLocation;
    if (record.serviceLocationVisible && (service?.availableChannel?.['@type'] !== 'ServiceChannel'
      || serviceLocation?.['@type'] !== 'Place'
      || serviceLocation?.['@id'] !== canonicalUrl(`/${venue?.slug}#location`)
      || serviceLocation?.name !== `Чё за Квест — ${venue?.address}`
      || serviceLocation?.url !== canonicalUrl(`/${venue?.slug}`))) {
      errors.push(`${record.path}: quest Service venue differs from venueSlug`);
    }
    if (!record.serviceLocationVisible && Object.hasOwn(service || {}, 'availableChannel')) {
      errors.push(`${record.path}: quest Service venue is not identified in the rendered main content`);
    }
  }

  if (record.kind === 'holiday') {
    const service = parsedSchemas.find((schema) => hasType(schema, 'Service'));
    if (!service) errors.push(`${record.path}: holiday page is missing Service`);
    if (service?.['@id'] !== `${canonical}#service` || service?.url !== canonical) errors.push(`${record.path}: holiday Service does not match canonical`);
    if (service?.name !== record.page.seo?.h1 || Object.hasOwn(service || {}, 'description')) errors.push(`${record.path}: holiday Service text contains an unverified description`);
    if (service?.serviceType !== (record.page.serviceType || 'Организация детского праздника')
      || service?.areaServed?.['@type'] !== 'City'
      || service?.areaServed?.name !== 'Ростов-на-Дону'
      || service?.provider?.['@id'] !== canonicalUrl('/#organization')) {
      errors.push(`${record.path}: holiday Service type, city or provider is invalid`);
    }
    if (record.visibleText && !/ростов(?:е)?-на-дону/iu.test(record.visibleText)) errors.push(`${record.path}: holiday service city is not visible in the rendered snapshot body`);
    if (record.image && service?.image !== `${ORIGIN}${record.image}`) errors.push(`${record.path}: holiday Service image differs from the verified visible hero`);
    if (!record.image && Object.hasOwn(service || {}, 'image')) errors.push(`${record.path}: holiday Service image is not present in the rendered body`);
    const price = visibleHolidayPrice(record.page);
    if (price && service?.offers?.price !== price) errors.push(`${record.path}: holiday Offer differs from the visible package price`);
    if (!price && service?.offers) errors.push(`${record.path}: holiday Service has an Offer without a visible package price`);
    if (price && (service?.offers?.['@type'] !== 'Offer'
      || service?.offers?.priceCurrency !== 'RUB'
      || service?.offers?.url !== canonical)) {
      errors.push(`${record.path}: holiday Offer currency or canonical URL is invalid`);
    }
    if (price && record.visibleText) {
      const visiblePricePattern = new RegExp(`${String(price).split('').join('\\s*')}\\s*(?:₽|руб)`, 'iu');
      if (!visiblePricePattern.test(record.visibleText)) errors.push(`${record.path}: holiday Offer price is not visible in the rendered snapshot body`);
    }
  }
  if (record.kind === 'venue') {
    const business = parsedSchemas.find((schema) => hasType(schema, 'EntertainmentBusiness'));
    const venue = venueBySlug.get(record.page.slug);
    if (!business) errors.push(`${record.path}: venue page is missing EntertainmentBusiness`);
    if (business?.['@id'] !== `${canonical}#location` || business?.url !== canonical) errors.push(`${record.path}: venue business does not match canonical`);
    if (business?.name !== `Чё за Квест — ${venue?.address}`) errors.push(`${record.path}: venue business name differs from page data`);
    if (business?.address?.streetAddress !== venue?.address) errors.push(`${record.path}: venue address differs from venues.json`);
    if (business?.address?.['@type'] !== 'PostalAddress'
      || business?.address?.addressLocality !== 'Ростов-на-Дону') {
      errors.push(`${record.path}: venue postal address contains unverified data`);
    }
    if (business?.geo?.latitude !== venue?.lat || business?.geo?.longitude !== venue?.lon) {
      errors.push(`${record.path}: venue coordinates differ from venues.json`);
    }
    if (business?.geo?.['@type'] !== 'GeoCoordinates') errors.push(`${record.path}: venue geo has the wrong type`);
    if (business?.telephone !== site.header.phone) errors.push(`${record.path}: venue telephone differs from site.json`);
    if (record.image && business?.image !== `${ORIGIN}${record.image}`) errors.push(`${record.path}: venue image differs from the verified visible first photo`);
    if (!record.image && Object.hasOwn(business || {}, 'image')) errors.push(`${record.path}: venue image is not present in the rendered body`);
    if (record.mapUrl && business?.hasMap !== record.mapUrl) errors.push(`${record.path}: venue map differs from the visible route link`);
    if (!record.mapUrl && Object.hasOwn(business || {}, 'hasMap')) errors.push(`${record.path}: venue map is not present in the rendered body`);
    if (business?.parentOrganization?.['@id'] !== canonicalUrl('/#organization')) errors.push(`${record.path}: venue parentOrganization is invalid`);
    const hours = String(site.footer.hours).match(/(\d{1,2}:\d{2}).*?(\d{1,2}:\d{2})/u);
    if (business?.openingHoursSpecification?.opens !== hours?.[1]
      || business?.openingHoursSpecification?.closes !== hours?.[2]) {
      errors.push(`${record.path}: venue opening hours differ from the visible footer`);
    }
    for (const fact of [venue?.address, site.header.phone, hours?.[1], hours?.[2]].filter(Boolean)) {
      if (record.visibleText && !record.visibleText.includes(normaliseVisibleText(fact))) {
        errors.push(`${record.path}: venue fact "${fact}" is not visible in the rendered snapshot body`);
      }
    }
    if (record.visibleText && !/ростов(?:е)?-на-дону/iu.test(record.visibleText)) {
      errors.push(`${record.path}: venue city is not visible in the rendered snapshot body`);
    }
  }
  if ((record.kind === 'catalog' || record.kind === 'category') && !types.has('CollectionPage')) {
    errors.push(`${record.path}: collection page is missing CollectionPage`);
  }
  if (record.kind === 'catalog' || record.kind === 'category') {
    const collection = parsedSchemas.find((schema) => hasType(schema, 'CollectionPage'));
    if (collection?.['@id'] !== `${canonical}#collectionpage` || collection?.url !== canonical) {
      errors.push(`${record.path}: CollectionPage does not match canonical`);
    }
    const expectedItems = (record.visibleItems || []).map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        url: canonicalUrl(item.url),
      }));
    if (JSON.stringify(collection?.mainEntity?.itemListElement) !== JSON.stringify(expectedItems)) {
      errors.push(`${record.path}: CollectionPage items differ from the visible cards`);
    }
    if (collection?.mainEntity?.numberOfItems !== expectedItems.length) {
      errors.push(`${record.path}: CollectionPage item count differs from the visible cards`);
    }
    const expectedName = record.kind === 'catalog' ? 'Квесты в Ростове-на-Дону' : record.page?.seo?.h1;
    if (collection?.name !== expectedName
      || collection?.isPartOf?.['@id'] !== canonicalUrl('/#website')
      || collection?.mainEntity?.['@type'] !== 'ItemList'
      || collection?.mainEntity?.['@id'] !== `${canonical}#items`) {
      errors.push(`${record.path}: CollectionPage identity or site relationship is invalid`);
    }
  }
  if (record.kind === 'home' && !types.has('WebSite')) errors.push('/: home page is missing WebSite');

  const video = visiblePlayableVideo(record.page || {});
  if (video?.uploadDate && !video?.caption) errors.push(`${record.path}: video uploadDate exists but a visible caption is missing`);
  if (video?.uploadDate && video?.caption && !types.has('VideoObject')) errors.push(`${record.path}: eligible visible video is missing VideoObject`);
  if (types.has('VideoObject') && (!video?.uploadDate || !video?.caption)) errors.push(`${record.path}: VideoObject has no verified visible source data`);
  if (video?.uploadDate && video?.caption) {
    const videoSchema = parsedSchemas.find((schema) => hasType(schema, 'VideoObject'));
    const expectedVideo = videoObjectJsonLd({
      video,
      path: record.path,
      pageName: record.page?.seo?.h1,
    });
    if (JSON.stringify(videoSchema) !== JSON.stringify(expectedVideo)) errors.push(`${record.path}: VideoObject differs from verified visible video data`);
  }

  return { ...record, canonical, schemas: parsedSchemas, types: [...types] };
}

export async function auditStructuredData({ rendered = false } = {}) {
  const { records, site, venueBySlug } = await loadAuditPages();
  const errors = [];
  await validateSourceWiring(errors);
  if (rendered) await loadRenderedSchemas(records, errors);
  if (records.length < 64) errors.push(`expected at least the 64 audited indexable pages, found ${records.length}`);
  const auditedRecords = records.map((record) => validateRecord(record, site, venueBySlug, errors));
  const typeCounts = {};
  for (const record of auditedRecords) {
    for (const type of record.types) typeCounts[type] = (typeCounts[type] || 0) + 1;
  }
  const skippedVideos = auditedRecords.filter((record) => {
    const video = visiblePlayableVideo(record.page || {});
    return video && !video.uploadDate;
  }).map((record) => record.path);

  return { errors, records: auditedRecords, skippedVideos, typeCounts, rendered };
}

function printReport(report) {
  console.log('| Страница | Тип страницы | Верхнеуровневые типы Schema.org |');
  console.log('| --- | --- | --- |');
  for (const record of report.records) {
    console.log(`| \`${record.path}\` | ${record.kind} | ${record.types.map((type) => `\`${type}\``).join(', ')} |`);
  }
  console.log('');
  console.log(`Итого по типам: ${Object.entries(report.typeCounts).sort(([left], [right]) => left.localeCompare(right)).map(([type, count]) => `${type}=${count}`).join(', ')}.`);
  console.log(`VideoObject отложен на ${report.skippedVideos.length} страницах без достоверного uploadDate: ${report.skippedVideos.join(', ')}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rendered = process.argv.includes('--dist');
  const report = await auditStructuredData({ rendered });
  if (report.errors.length > 0) {
    console.error(`Structured data audit failed: ${report.errors.length} issue(s).`);
    for (const error of report.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else if (process.argv.includes('--report')) {
    printReport(report);
  } else {
    console.log(`${rendered ? 'Rendered s' : 'S'}tructured data audit passed: ${report.records.length} indexable pages; ${report.typeCounts.Organization || 0} Organization; ${report.typeCounts.WebPage || 0} WebPage; ${report.typeCounts.ImageObject || 0} ImageObject; ${report.typeCounts.EntertainmentBusiness || 0} EntertainmentBusiness; ${report.typeCounts.FAQPage || 0} FAQPage.`);
    console.log(`VideoObject intentionally skipped on ${report.skippedVideos.length} playable-video pages without a verified uploadDate.`);
  }
}
