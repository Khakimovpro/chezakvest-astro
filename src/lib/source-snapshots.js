import manifest from '../generated/source-snapshot-manifest.json';

const snapshots = import.meta.glob('../source-snapshots/*.html', {
  eager: true,
  query: '?raw',
  import: 'default',
});

export function normaliseSourceRoute(path = '/') {
  const clean = `/${String(path).split(/[?#]/u)[0].replace(/^\/+|\/+$/gu, '')}`;
  return clean === '/' ? '/' : `${clean}/`;
}

export function sourceSnapshotFor(path = '/') {
  const route = normaliseSourceRoute(path);
  const metadata = manifest.routes?.[route];
  if (!metadata) return null;
  const html = snapshots[`../source-snapshots/${metadata.snapshot}`];
  if (typeof html !== 'string') {
    throw new Error(`Generated source snapshot is missing: ${metadata.snapshot}`);
  }
  return { ...metadata, html, runtime: manifest.runtime ?? [] };
}

