import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Only these directories feed Astro's shipped site. `src/html` is a retained
// raw Tilda capture, deliberately excluded so that its archived references do
// not make retired Tilda files look live.
const RUNTIME_SOURCE_DIRECTORIES = [
  'src/components',
  'src/data',
  'src/layouts',
  'src/lib',
  'src/pages',
  'src/scripts',
  'src/styles',
];

const TEXT_EXTENSIONS = new Set([
  '.astro', '.css', '.html', '.js', '.json', '.mjs', '.svg', '.ts', '.tsx', '.xml', '.txt',
]);

// Both `/assets/x` and a GitHub Pages base such as `/chezakvest-preview/assets/x`
// are local public assets. The rest of a URL is normalized below.
const ASSET_REFERENCE = /\/(?:[\w.-]+\/)*assets\/[^\s"'`<>()\\\]]+/gu;

function absolutePath(projectRoot, value) {
  return isAbsolute(value) ? value : join(projectRoot, value);
}

function toPosix(value) {
  return value.replaceAll('\\', '/');
}

async function listFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }

  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function listDirectories(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }

  const directories = [directory];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) directories.push(...await listDirectories(join(directory, entry.name)));
  }
  return directories;
}

function fileMode(metadata) {
  return `0${(metadata.mode & 0o777).toString(8).padStart(3, '0')}`;
}

function isTextFile(path) {
  return TEXT_EXTENSIONS.has(extname(path).toLowerCase());
}

function normalizeAssetReference(value) {
  const assetOffset = value.indexOf('/assets/');
  if (assetOffset < 0) return '';

  let pathname = value.slice(assetOffset).replace(/[;,]+$/u, '').replace(/[?#].*$/u, '');
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // A malformed escape sequence cannot name a local file; leave it encoded
    // so the missing-reference check reports the exact original value.
  }

  if (!pathname.startsWith('/assets/') || pathname.includes('/../')) return '';
  return pathname;
}

function withoutComments(text) {
  return text
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    // Source URLs use https://, so a colon protects protocol separators here.
    .replace(/(^|[^:])\/\/[^\r\n]*/gmu, '$1');
}

function addReferences(text, source, destination) {
  for (const match of withoutComments(text).matchAll(ASSET_REFERENCE)) {
    const assetPath = normalizeAssetReference(match[0]);
    if (!assetPath) continue;
    if (!destination.has(assetPath)) destination.set(assetPath, new Set());
    destination.get(assetPath).add(source);
  }
}

async function collectReferences(files, projectRoot) {
  const references = new Map();
  await Promise.all(files.map(async (file) => {
    const text = await readFile(file, 'utf8');
    addReferences(text, toPosix(relative(projectRoot, file)), references);
  }));
  return references;
}

function legacyTildaArtifact(assetPath) {
  return assetPath === '/assets/static.tildacdn.comindex'
    || /^\/assets\/neo\.tildacdn\.com\/js\//u.test(assetPath)
    || /^\/assets\/static\.tildacdn\.com\/js\//u.test(assetPath)
    || /^\/assets\/static\.tildacdn\.com\/ws\/.*\.js$/u.test(assetPath);
}

function sortedPaths(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function sourceList(referenceMap, assetPath) {
  return sortedPaths(referenceMap.get(assetPath) ?? []);
}

/**
 * Audits the public asset tree without guessing that a lazy asset is dead just
 * because it is not in static HTML. References are collected independently
 * from the runtime source tree (including `data-src` and client scripts) and
 * from emitted HTML/_astro code. Public assets themselves are never scanned:
 * a stale script must not keep itself alive merely by mentioning its own URL.
 */
export async function auditPublicAssets({
  projectRoot = PROJECT_ROOT,
  publicDir = 'public/assets',
  distDir = 'dist',
  sourceDirectories = RUNTIME_SOURCE_DIRECTORIES,
  runtimeAssets = [],
} = {}) {
  const resolvedPublicDir = absolutePath(projectRoot, publicDir);
  const resolvedDistDir = absolutePath(projectRoot, distDir);
  const sourceRoots = sourceDirectories.map((directory) => absolutePath(projectRoot, directory));

  const publicFiles = await listFiles(resolvedPublicDir);
  const publicDirectories = await listDirectories(resolvedPublicDir);
  const sourceFiles = (await Promise.all(sourceRoots.map(listFiles))).flat().filter(isTextFile);
  const allDistFiles = await listFiles(resolvedDistDir);
  const builtAssetFiles = allDistFiles.filter((file) => (
    toPosix(relative(resolvedDistDir, file)).startsWith('assets/')
  ));
  const builtAssetDirectories = await listDirectories(join(resolvedDistDir, 'assets'));
  const buildFiles = allDistFiles.filter((file) => {
    const outputPath = toPosix(relative(resolvedDistDir, file));
    // Public files are copied to dist verbatim. Looking inside them would let
    // a retired Tilda script create a false reachability edge to itself.
    return !outputPath.startsWith('assets/') && isTextFile(file);
  });

  const [sourceReferences, buildReferences] = await Promise.all([
    collectReferences(sourceFiles, projectRoot),
    collectReferences(buildFiles, projectRoot),
  ]);
  const runtimeReferences = new Map();
  for (const value of runtimeAssets) {
    const assetPath = normalizeAssetReference(String(value));
    if (assetPath) runtimeReferences.set(assetPath, new Set(['runtimeAssets option']));
  }

  const assets = [];
  const unreadableAssets = [];
  for (const file of publicFiles) {
    const filePath = toPosix(relative(resolvedPublicDir, file));
    const metadata = await stat(file);
    assets.push({ path: `/assets/${filePath}`, bytes: metadata.size });
    if ((metadata.mode & 0o004) === 0) {
      unreadableAssets.push({ path: `/assets/${filePath}`, mode: fileMode(metadata) });
    }
  }
  assets.sort((left, right) => left.path.localeCompare(right.path));
  unreadableAssets.sort((left, right) => left.path.localeCompare(right.path));

  const untraversableDirectories = [];
  for (const directory of publicDirectories) {
    const metadata = await stat(directory);
    if ((metadata.mode & 0o001) === 0) {
      const directoryPath = toPosix(relative(resolvedPublicDir, directory));
      untraversableDirectories.push({
        path: directoryPath ? `/assets/${directoryPath}/` : '/assets/',
        mode: fileMode(metadata),
      });
    }
  }
  untraversableDirectories.sort((left, right) => left.path.localeCompare(right.path));

  const unreadableBuildAssets = [];
  for (const file of builtAssetFiles) {
    const metadata = await stat(file);
    if ((metadata.mode & 0o004) === 0) {
      unreadableBuildAssets.push({
        path: `/${toPosix(relative(resolvedDistDir, file))}`,
        mode: fileMode(metadata),
      });
    }
  }
  unreadableBuildAssets.sort((left, right) => left.path.localeCompare(right.path));

  const untraversableBuildDirectories = [];
  for (const directory of builtAssetDirectories) {
    const metadata = await stat(directory);
    if ((metadata.mode & 0o001) === 0) {
      untraversableBuildDirectories.push({
        path: `/${toPosix(relative(resolvedDistDir, directory))}/`,
        mode: fileMode(metadata),
      });
    }
  }
  untraversableBuildDirectories.sort((left, right) => left.path.localeCompare(right.path));

  const publicAssetPaths = new Set(assets.map((asset) => asset.path));
  const referencedAssetPaths = new Set([
    ...sourceReferences.keys(),
    ...buildReferences.keys(),
    ...runtimeReferences.keys(),
  ]);
  const sourceOnlyAssets = sortedPaths([...sourceReferences.keys()].filter((assetPath) => (
    !buildReferences.has(assetPath) && !runtimeReferences.has(assetPath)
  )));
  const buildOnlyAssets = sortedPaths([...buildReferences.keys()].filter((assetPath) => (
    !sourceReferences.has(assetPath) && !runtimeReferences.has(assetPath)
  )));
  const runtimeOnlyAssets = sortedPaths([...runtimeReferences.keys()].filter((assetPath) => (
    !sourceReferences.has(assetPath) && !buildReferences.has(assetPath)
  )));
  const missingReferences = sortedPaths([...referencedAssetPaths].filter((assetPath) => !publicAssetPaths.has(assetPath)));
  const unreferencedAssets = assets.filter((asset) => !referencedAssetPaths.has(asset.path));
  const legacyArtifacts = assets.filter((asset) => legacyTildaArtifact(asset.path));
  const errors = [
    ...missingReferences.map((assetPath) => `local asset reference has no public file: ${assetPath}`),
    ...legacyArtifacts.map((asset) => `legacy Tilda executable must not ship: ${asset.path}`),
    ...unreadableAssets.map((asset) => `public asset is not readable by the web-server user (${asset.mode}): ${asset.path}`),
    ...untraversableDirectories.map((directory) => `public asset directory is not traversable by the web-server user (${directory.mode}): ${directory.path}`),
    ...unreadableBuildAssets.map((asset) => `built asset is not readable by the web-server user (${asset.mode}): ${asset.path}`),
    ...untraversableBuildDirectories.map((directory) => `built asset directory is not traversable by the web-server user (${directory.mode}): ${directory.path}`),
  ];

  const references = {};
  for (const assetPath of sortedPaths(referencedAssetPaths)) {
    references[assetPath] = {
      source: sourceList(sourceReferences, assetPath),
      build: sourceList(buildReferences, assetPath),
      runtime: sourceList(runtimeReferences, assetPath),
    };
  }

  return {
    errors,
    publicAssetCount: assets.length,
    publicAssetBytes: assets.reduce((total, asset) => total + asset.bytes, 0),
    sourceFilesChecked: sourceFiles.length,
    buildFilesChecked: buildFiles.length,
    referencedAssetPaths: sortedPaths(referencedAssetPaths),
    sourceOnlyAssets,
    buildOnlyAssets,
    runtimeOnlyAssets,
    missingReferences,
    unreferencedAssets,
    legacyArtifacts,
    unreadableAssets,
    untraversableDirectories,
    unreadableBuildAssets,
    untraversableBuildDirectories,
    references,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await auditPublicAssets();
  if (report.errors.length > 0) {
    console.error(`Asset audit failed: ${report.errors.length} issue(s).`);
    for (const error of report.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    const unreferencedBytes = report.unreferencedAssets.reduce((total, asset) => total + asset.bytes, 0);
    console.log(
      `Asset audit passed: ${report.publicAssetCount} public assets, ${report.referencedAssetPaths.length} referenced, `
      + `${report.sourceOnlyAssets.length} source-only lazy/runtime, ${report.buildOnlyAssets.length} build-only, `
      + `${report.unreferencedAssets.length} unreferenced report-only (${unreferencedBytes} bytes), `
      + 'all shipped asset paths readable by the web-server user.',
    );
  }
}
