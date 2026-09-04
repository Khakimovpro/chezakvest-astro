#!/usr/bin/env node

import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DEFAULT_ORIGIN = 'http://82.146.60.212';
const ASSET_REFERENCE = /\/assets\/[^\s"'`<>()\\\]]+/gu;
const IMAGE_ASSET = /\.(?:avif|gif|jpe?g|png|svg|webp)$/iu;
const COMMON_ASSET_PREFIXES = ['/assets/_static/', '/assets/fonts.gstatic.com/'];

const REPRESENTATIVE_PAGES = [
  { kind: 'home', path: '/' },
  { kind: 'catalog', path: '/kvesty-v-rostove-na-donu/', preferredPrefix: '/assets/fnaf/' },
  { kind: 'quest', path: '/fnaf/', preferredPrefix: '/assets/fnaf/' },
  { kind: 'category', path: '/strashnye-kvesty/' },
  { kind: 'info', path: '/contacts/' },
  { kind: 'holiday', path: '/new-year/' },
  { kind: 'venue', path: '/40letpobedy216/', preferredPrefix: '/assets/q/' },
  { kind: 'venue', path: '/magnitogorskaya1/', preferredPrefix: '/assets/q/' },
  { kind: 'venue', path: '/mira27/', preferredPrefix: '/assets/q/' },
  { kind: 'venue', path: '/nagibina14/', preferredPrefix: '/assets/q/' },
  { kind: 'venue', path: '/nansena107/', preferredPrefix: '/assets/q/' },
  { kind: 'venue', path: '/sokolova23/', preferredPrefix: '/assets/q/' },
];

function normalizeAssetReference(value) {
  let pathname = value.replace(/[;,]+$/u, '').replace(/[?#].*$/u, '');
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    return '';
  }
  if (!pathname.startsWith('/assets/') || pathname.includes('/../')) return '';
  return pathname;
}

export function pageAssetReferences(html) {
  return [...new Set([...html.matchAll(ASSET_REFERENCE)]
    .map((match) => normalizeAssetReference(match[0]))
    .filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

export function representativeAsset(html, preferredPrefix = '') {
  const images = pageAssetReferences(html).filter((assetPath) => IMAGE_ASSET.test(assetPath));
  if (preferredPrefix) return images.find((assetPath) => assetPath.startsWith(preferredPrefix)) ?? '';
  return images.find((assetPath) => !COMMON_ASSET_PREFIXES.some((prefix) => assetPath.startsWith(prefix))) ?? '';
}

async function request(url, timeoutMs = 30_000) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'chezakvest-resource-smoke/1.0' },
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    body,
  };
}

export async function verifyRepresentativeResources({
  origin = process.env.SITE_ORIGIN ?? DEFAULT_ORIGIN,
  requestUrl = request,
} = {}) {
  const normalizedOrigin = origin.replace(/\/$/u, '');
  const originUrl = new URL(normalizedOrigin);
  if (!['http:', 'https:'].includes(originUrl.protocol)
    || originUrl.origin !== normalizedOrigin
    || originUrl.pathname !== '/') {
    throw new Error(`SITE_ORIGIN must be an absolute HTTP(S) origin without a path: ${origin}`);
  }

  const rows = [];
  const errors = [];
  for (const page of REPRESENTATIVE_PAGES) {
    const pageResponse = await requestUrl(`${normalizedOrigin}${page.path}`);
    if (pageResponse.status !== 200) {
      errors.push(`${page.kind} page ${page.path} returned HTTP ${pageResponse.status}`);
      rows.push({
        kind: page.kind,
        page: page.path,
        pageStatus: pageResponse.status,
        asset: '',
        assetStatus: '',
        assetBytes: 0,
        contentType: '',
        result: 'FAIL',
      });
      continue;
    }

    const assetPath = representativeAsset(pageResponse.body.toString('utf8'), page.preferredPrefix);
    if (!assetPath) {
      errors.push(`${page.kind} page ${page.path} has no representative local image`);
      rows.push({
        kind: page.kind,
        page: page.path,
        pageStatus: pageResponse.status,
        asset: '',
        assetStatus: '',
        assetBytes: 0,
        contentType: '',
        result: 'FAIL',
      });
      continue;
    }

    const assetResponse = await requestUrl(`${normalizedOrigin}${assetPath}`);
    const assetOk = assetResponse.status === 200
      && assetResponse.body.length > 0
      && assetResponse.contentType.toLowerCase().startsWith('image/');
    if (!assetOk) {
      errors.push(
        `${page.kind} page ${page.path} asset ${assetPath}: HTTP ${assetResponse.status}, `
        + `${assetResponse.body.length} bytes, Content-Type ${assetResponse.contentType || '<missing>'}`,
      );
    }
    rows.push({
      kind: page.kind,
      page: page.path,
      pageStatus: pageResponse.status,
      asset: assetPath,
      assetStatus: assetResponse.status,
      assetBytes: assetResponse.body.length,
      contentType: assetResponse.contentType,
      result: assetOk ? 'PASS' : 'FAIL',
    });
  }

  return { rows, errors };
}

async function main() {
  const report = await verifyRepresentativeResources();
  if (report.errors.length > 0) {
    console.error(`Resource smoke failed: ${report.errors.length} issue(s).`);
    for (const error of report.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Resource smoke passed: ${report.rows.length} page/resource samples checked.`);
  for (const row of report.rows) {
    console.log(`- ${row.kind} ${row.page} -> ${row.asset} (${row.assetBytes} bytes)`);
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Resource smoke failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
