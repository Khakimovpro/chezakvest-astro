import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

// This URL is deliberately served as a noindex canonical fallback while the
// future production host performs a real 301. It must never appear in XML.
export const LEGACY_SITEMAP_SLUGS = new Set(['wednesday_ukradennaya_vesch']);

function gitDateFor(path) {
  let value = '';
  try {
    value = execFileSync('git', ['log', '-1', '--format=%cs', '--', path], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    try {
      // A release gate also runs before the logical commit is created. A newly
      // added source has no git history at that precise point, so its actual
      // filesystem modification date is the only truthful fallback. Once the
      // change is committed (including CI with fetch-depth: 0), git remains
      // authoritative.
      return statSync(path).mtime.toISOString().slice(0, 10);
    } catch {
      throw new Error(`Cannot read last-modified date for ${path}: ${error.message}`);
    }
  }

  if (!ISO_DATE.test(value)) {
    try {
      return statSync(path).mtime.toISOString().slice(0, 10);
    } catch {
      throw new Error(`No committed last-modified date for sitemap source: ${path}`);
    }
  }
  return value;
}

export function lastModifiedForSources(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('Sitemap URL must have at least one source file');
  }

  const latest = paths.map(gitDateFor).sort().at(-1);
  if (Date.parse(`${latest}T00:00:00.000Z`) > Date.now()) {
    throw new Error(`Sitemap lastmod cannot be in the future: ${latest}`);
  }
  return latest;
}

export function dataPathFromGlobPath(path) {
  if (!path.startsWith('../data/pages/') || !path.endsWith('.json')) {
    throw new Error(`Unexpected page data glob path: ${path}`);
  }
  return `src/data/pages/${path.slice('../data/pages/'.length)}`;
}
