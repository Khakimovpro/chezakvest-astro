// Shared SEO helpers for the static Astro pages.
import { absoluteAssetUrl, canonicalUrl, ORIGIN } from './urls.js';

export { ORIGIN };
export const absoluteUrl = (value = '/') => canonicalUrl(value);
export { absoluteAssetUrl };

// The source export leaves "Все квесты" without a URL. In the new site the
// real catalogue is the server-rendered catalogue on the home page.
export const withCollectionBreadcrumbs = (items = []) => items.map((item, index) => {
  const isCurrent = index === items.length - 1;
  if (isCurrent) return { ...item, href: null };
  if (!item.href && /^все квесты$/iu.test(item.t || '')) {
    return { ...item, href: '/#catalog' };
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

// Normalization is deliberately conservative: it only makes equivalent
// street prefixes and punctuation comparable, never guesses an address.
export const addressKey = (value = '') => String(value)
  .toLocaleLowerCase('ru-RU')
  .replace(/(?:улица|ул\.?|проспект|пр-т|переулок|пер\.?)/giu, '')
  .replace(/(?:^|\s)д\.?\s*/giu, '')
  .replace(/[^\p{L}\p{N}]/gu, '');

export const venueForAddress = (venues = [], address = '') => {
  const key = addressKey(address);
  return key ? venues.find((venue) => addressKey(venue.address) === key) : undefined;
};

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
