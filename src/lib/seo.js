// Shared SEO helpers for the static Astro pages.
import { absoluteAssetUrl, canonicalUrl, ORIGIN } from './urls.js';

export { ORIGIN };
export const absoluteUrl = (value = '/') => canonicalUrl(value);
export { absoluteAssetUrl };

// The source export leaves "Все квесты" without a URL. The catalogue has its
// own indexable route, so breadcrumbs never fall back to a home-page anchor.
export const withCollectionBreadcrumbs = (items = []) => items.map((item, index) => {
  const isCurrent = index === items.length - 1;
  if (isCurrent) return { ...item, href: null };
  if (!item.href && /^все квесты$/iu.test(item.t || '')) {
    return { ...item, href: '/kvesty-v-rostove-na-donu' };
  }
  return { ...item };
});

export const breadcrumbJsonLd = (items = [], currentPath = '/') => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.t,
    item: absoluteUrl(item.href || currentPath),
  })),
});

const organisationId = () => absoluteUrl('/#organization');
const websiteId = () => absoluteUrl('/#website');

export const organizationJsonLd = (site = {}) => {
  const phone = site.header?.phone;
  const socialProfiles = [site.header?.vk].filter(Boolean);
  const logo = absoluteAssetUrl(site.header?.logo);
  const email = String(site.footer?.email || '').replace(/^mailto:/iu, '');

  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': organisationId(),
    name: 'Чё за Квест',
    url: absoluteUrl('/'),
    logo: logo ? { '@type': 'ImageObject', url: logo } : undefined,
    telephone: phone,
    email: email || undefined,
    sameAs: socialProfiles.length > 0 ? socialProfiles : undefined,
    contactPoint: phone ? {
      '@type': 'ContactPoint',
      telephone: phone,
      contactType: 'reservations',
      availableLanguage: 'Russian',
    } : undefined,
  };
};

export const websiteJsonLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': websiteId(),
  name: 'Чё за Квест',
  url: absoluteUrl('/'),
  inLanguage: 'ru-RU',
  publisher: { '@id': organisationId() },
});

export const webPageJsonLd = ({ path = '/', name, image = '' } = {}) => ({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  '@id': absoluteUrl(`${path}#webpage`),
  name,
  url: absoluteUrl(path),
  inLanguage: 'ru-RU',
  isPartOf: { '@id': websiteId() },
  about: { '@id': organisationId() },
  primaryImageOfPage: image ? { '@id': absoluteUrl(`${path}#primaryimage`) } : undefined,
});

export const imageObjectJsonLd = ({ path = '/', image = '' } = {}) => image ? ({
  '@context': 'https://schema.org',
  '@type': 'ImageObject',
  '@id': absoluteUrl(`${path}#primaryimage`),
  contentUrl: absoluteAssetUrl(image),
  url: absoluteAssetUrl(image),
  representativeOfPage: true,
}) : null;

export const globalJsonLd = ({ site, path = '/', title, image = '', visibleSource = '', jsonld = [] } = {}) => {
  const verifiedImageUrl = absoluteAssetUrl(image);
  const primaryContent = visibleSource.split(/<footer\b/iu)[0];
  const pageSchemas = jsonld.map((schema) => schema && Object.fromEntries(
    Object.entries(schema).filter(([key, value]) => {
      if (key === 'image') return verifiedImageUrl && value === verifiedImageUrl;
      if (key === 'hasMap') return !visibleSource || visibleSource.includes(value);
      if (key === 'availableChannel') {
        const location = value?.serviceLocation;
        const locationName = String(location?.name || '');
        const address = locationName.replace(/^Чё за Квест\s+[—-]\s+/iu, '');
        const locationPath = location?.url ? new URL(location.url).pathname.replace(/\/$/u, '') : '';
        const linkedFromPrimaryContent = locationPath && (
          primaryContent.includes(`href="${locationPath}"`)
          || primaryContent.includes(`href="${locationPath}/"`)
        );
        return !visibleSource || Boolean(address && primaryContent.includes(address) && linkedFromPrimaryContent);
      }
      return true;
    }),
  ));

  return [
    organizationJsonLd(site),
    webPageJsonLd({ path, name: title, image }),
    imageObjectJsonLd({ path, image }),
    ...pageSchemas,
  ].filter(Boolean);
};

const questFacts = (page = {}) => {
  const pills = page.hero?.pills || [];
  return {
    age: pills.find((pill) => /^\d+\+$/u.test(String(pill).trim())) || '',
    duration: pills.find((pill) => /мин|час/iu.test(String(pill))) || '',
    players: pills.find((pill) => /^\d+\s*[-–−]\s*\d+$/u.test(String(pill).trim())) || '',
  };
};

export const questServiceJsonLd = ({ page = {}, venue, venueVisible = false, site = {} } = {}) => {
  const path = `/${page.slug}`;
  const facts = questFacts(page);
  const factSummary = [
    facts.duration && `Длительность: ${facts.duration}`,
    facts.players && `Количество игроков: ${facts.players}`,
  ].filter(Boolean).join('. ');
  const serviceType = /^VR-игра(?:\s|$)/iu.test(page.seo?.title || '') ? 'VR-игра' : 'Квест в реальности';

  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': absoluteUrl(`${path}#service`),
    name: page.seo?.h1,
    serviceType,
    description: factSummary,
    url: absoluteUrl(path),
    image: page.hero?.bg ? absoluteAssetUrl(page.hero.bg) : undefined,
    areaServed: { '@type': 'City', name: 'Ростов-на-Дону' },
    audience: facts.age ? {
      '@type': 'PeopleAudience',
      suggestedMinAge: Number.parseInt(facts.age, 10),
    } : undefined,
    provider: { '@id': organisationId() },
    availableChannel: venue && venueVisible ? {
      '@type': 'ServiceChannel',
      serviceLocation: {
        '@type': 'Place',
        '@id': absoluteUrl(`/${venue.slug}#location`),
        name: `Чё за Квест — ${venue.address}`,
        url: absoluteUrl(`/${venue.slug}`),
      },
    } : undefined,
  };
};

const openingHoursJsonLd = (hoursText = '') => {
  const match = String(hoursText).match(/(\d{1,2}:\d{2}).*?(\d{1,2}:\d{2})/u);
  if (!match) return undefined;

  return {
    '@type': 'OpeningHoursSpecification',
    opens: match[1],
    closes: match[2],
  };
};

export const venueBusinessJsonLd = ({ page = {}, venue, site = {} } = {}) => {
  const path = `/${page.slug}`;
  const address = venue?.address
    || (page.breadcrumbs || []).slice(-1)[0]?.t
    || page.hall?.address;
  const mapUrl = page.howto?.routeUrl;

  return {
    '@context': 'https://schema.org',
    '@type': 'EntertainmentBusiness',
    '@id': absoluteUrl(`${path}#location`),
    name: `Чё за Квест — ${address}`,
    url: absoluteUrl(path),
    telephone: site.header?.phone,
    image: page.howto?.photos?.[0] ? absoluteAssetUrl(page.howto.photos[0]) : undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: address,
      addressLocality: 'Ростов-на-Дону',
    },
    geo: Number.isFinite(venue?.lat) && Number.isFinite(venue?.lon) ? {
      '@type': 'GeoCoordinates',
      latitude: venue.lat,
      longitude: venue.lon,
    } : undefined,
    openingHoursSpecification: openingHoursJsonLd(site.footer?.hours),
    hasMap: mapUrl || undefined,
    parentOrganization: { '@id': organisationId() },
  };
};

const firstVisiblePrice = (value) => Number((String(value).match(/\d[\d ]*/u) || [''])[0].replace(/\D/gu, '')) || null;

export const holidayServiceJsonLd = ({ page = {}, site = {} } = {}) => {
  const path = `/${page.slug}`;
  const hero = (page.sections || []).find((section) => section.kind === 'hero') || {};
  const priceBlock = (page.sections || []).find((section) => section.kind === 'packages'
    && section.items?.some((item) => item.price));
  const prices = (priceBlock?.items || []).map((item) => firstVisiblePrice(item.price)).filter(Boolean);
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;

  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': absoluteUrl(`${path}#service`),
    name: page.seo?.h1,
    serviceType: page.serviceType || 'Организация детского праздника',
    url: absoluteUrl(path),
    image: hero.bg ? absoluteAssetUrl(hero.bg) : undefined,
    areaServed: { '@type': 'City', name: 'Ростов-на-Дону' },
    provider: { '@id': organisationId() },
    offers: minPrice ? {
      '@type': 'Offer',
      priceCurrency: 'RUB',
      url: absoluteUrl(path),
      price: minPrice,
    } : undefined,
  };
};

export const faqPageJsonLd = (items = [], path = '/') => items.length > 0 ? ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  '@id': absoluteUrl(`${path}#faq`),
  mainEntity: items.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
}) : null;

const hiddenCustomArtboards = new Set([
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

export const visibleHolidayFaqJsonLd = (page = {}, faqSection) => {
  const path = `/${page.slug}`;
  const hero = (page.sections || []).find((section) => section.kind === 'hero') || {};
  if (hero.composition === 'newyear-artboard') {
    return faqPageJsonLd(page.sourceParity?.faq || [], path);
  }

  if (hiddenCustomArtboards.has(hero.composition)) return null;

  const faq = faqSection === undefined
    ? (page.sections || []).find((section) => section.kind === 'faq')
    : faqSection;
  return faqPageJsonLd(faq?.items || [], path);
};

const ISO_8601_DATE_TIME_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u;

export const isValidIso8601DateTime = (value) => {
  if (typeof value !== 'string' || !ISO_8601_DATE_TIME_PATTERN.test(value)) return false;
  if (!Number.isFinite(Date.parse(value))) return false;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  return calendarDate.getUTCFullYear() === year
    && calendarDate.getUTCMonth() === month - 1
    && calendarDate.getUTCDate() === day;
};

export const sourceVideoIds = (visibleSource = '') => [...new Set(
  [...String(visibleSource).matchAll(/\bdata-source-video-id=["']([a-f0-9]{32})["']/giu)]
    .map((match) => match[1].toLowerCase()),
)];

// A snapshot replaces the native layout body, so its deferred Rutube player is
// the only video eligible for markup. Native pages keep using the local video
// that their layout renders. The stored snapshot metadata is accepted only
// when it names the exact player present in the selected body.
export const visibleVideoFor = ({ video, visibleSource = '' } = {}) => {
  if (!visibleSource) return video?.poster && video?.src ? video : null;
  const ids = sourceVideoIds(visibleSource);
  if (ids.length !== 1 || video?.snapshot?.id?.toLowerCase() !== ids[0]) return null;
  return video.snapshot;
};

// Google requires a trustworthy first-publication date for VideoObject. A page
// opts in only with a verified ISO 8601 value next to its visible video data;
// missing or malformed dates deliberately keep the video out of JSON-LD.
export const videoObjectJsonLd = ({ video, path = '/', pageName = '' } = {}) => {
  video ||= {};
  const name = video.name || (video.caption && `${video.title || video.caption || 'Видео'} — ${pageName}`);
  const description = video.description || video.caption;
  const thumbnailUrl = absoluteAssetUrl(video.thumbnailUrl || video.poster);
  const contentUrl = video.src && absoluteAssetUrl(video.src);
  if (!name || !description || !thumbnailUrl || (!video.embedUrl && !contentUrl)
    || !isValidIso8601DateTime(video.uploadDate)) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    '@id': absoluteUrl(`${path}#video`),
    name,
    description,
    thumbnailUrl,
    uploadDate: video.uploadDate,
    contentUrl: contentUrl || undefined,
    embedUrl: video.embedUrl || undefined,
    url: absoluteUrl(`${path}#video`),
    duration: video.duration || undefined,
  };
};

export const visibleHolidayVideoJsonLd = (page = {}) => {
  const path = `/${page.slug}`;
  const hero = (page.sections || []).find((section) => section.kind === 'hero') || {};
  if (hiddenCustomArtboards.has(hero.composition)) return null;

  const video = (page.sections || []).find((section) => section.kind === 'video');
  return videoObjectJsonLd({
    video,
    path,
    pageName: page.seo?.h1,
    description: page.seo?.description,
  });
};

export const collectionPageJsonLd = ({ path, name, items = [] } = {}) => ({
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  '@id': absoluteUrl(`${path}#collectionpage`),
  name,
  url: absoluteUrl(path),
  isPartOf: { '@id': websiteId() },
  mainEntity: {
    '@type': 'ItemList',
    '@id': absoluteUrl(`${path}#items`),
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.url),
    })),
  },
});

export const isCurrentRoute = (href, currentPath) => {
  if (!href) return false;
  try {
    const target = new URL(href, ORIGIN);
    const current = new URL(currentPath, ORIGIN);
    return target.origin === current.origin && target.pathname.replace(/\/$/, '') === current.pathname.replace(/\/$/, '');
  } catch {
    return false;
  }
};
