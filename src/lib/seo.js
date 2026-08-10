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
