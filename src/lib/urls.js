export const ORIGIN = 'https://xn--80aehcht5ci1b.xn--p1ai';

const EXTERNAL_LINK = /^(?:https?:|mailto:|tel:)/i;

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

export function siteHref(base = '', value = '') {
  const href = String(value || '');
  if (!href) return '#';
  if (EXTERNAL_LINK.test(href)) return href;

  const { path, suffix } = splitPathAndSuffix(href);
  const normalizedBase = String(base || '').replace(/\/$/, '');
  return `${normalizedBase}${trailingSlashPath(path || '/')}${suffix}`;
}
