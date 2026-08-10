export const ORIGIN = 'https://xn--80aehcht5ci1b.xn--p1ai';

const EXTERNAL_LINK = /^(?:https?:|mailto:|tel:)/i;
// Campaign pages are now first-class, indexable routes. Keep this map for any
// future retired path aliases, but do not collapse current campaign traffic.
const LEGACY_INTERNAL_PATHS = new Map();
const HARRY_POTTER_CAMPAIGN_HOST = 'xn----7sbikn1bgfafua.xn--80aehcht5ci1b.xn--p1ai';

function splitPathAndSuffix(value) {
  const suffixIndex = value.search(/[?#]/);
  return suffixIndex === -1
    ? { path: value, suffix: '' }
    : { path: value.slice(0, suffixIndex), suffix: value.slice(suffixIndex) };
}

export function trailingSlashPath(value = '/') {
  const path = String(value || '/');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized === '/') return '/';
  return `${normalized.replace(/\/+$/, '')}/`;
}

export function canonicalUrl(value = '/') {
  const { path, suffix } = splitPathAndSuffix(String(value || '/'));
  return `${ORIGIN}${trailingSlashPath(path)}${suffix}`;
}

export function absoluteAssetUrl(value = '') {
  const asset = String(value || '');
  if (!asset) return '';
  if (/^https?:\/\//i.test(asset)) return asset;

  const { path, suffix } = splitPathAndSuffix(asset);
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${ORIGIN}${normalized}${suffix}`;
}

function internalHref(value) {
  let href = String(value || '');
  if (!href) return '';

  if (/^https?:\/\//i.test(href)) {
    try {
      const url = new URL(href);
      if (url.origin === ORIGIN) {
        href = `${url.pathname}${url.search}${url.hash}`;
      } else if (url.hostname === HARRY_POTTER_CAMPAIGN_HOST && (url.pathname === '/' || url.pathname === '')) {
        href = '/garri-potter-i-kubok-ognya';
      }
    } catch {
      return '';
    }
  }

  if (EXTERNAL_LINK.test(href)) return '';
  const { path, suffix } = splitPathAndSuffix(href);
  return `${LEGACY_INTERNAL_PATHS.get(path) || path}${suffix}`;
}

export function siteHref(base = '', value = '') {
  const href = String(value || '');
  if (!href) return '#';
  const internal = internalHref(href);
  if (!internal) return href;

  const { path, suffix } = splitPathAndSuffix(internal);
  const normalizedBase = String(base || '').replace(/\/$/, '');
  return `${normalizedBase}${trailingSlashPath(path || '/')}${suffix}`;
}
