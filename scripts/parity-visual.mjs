import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

import sharp from 'sharp';

// Section crops are derivative diagnostics. Disable libvips' large default
// cache so a tall page cannot retain decoded copies while the next viewport is
// captured at DPR 2.
sharp.cache(false);
sharp.concurrency(1);

const PROJECT_ROOT = process.cwd();
const PARITY_DIR = join(PROJECT_ROOT, 'migration', 'parity');
const SHOTS_DIR = join(PARITY_DIR, 'shots');
const ORIGIN = 'https://xn--80aehcht5ci1b.xn--p1ai';
const LOCAL = process.env.PARITY_LOCAL ?? 'http://127.0.0.1:8799';
const BROWSER = '/home/claude/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
const ROUND = Number(process.env.PARITY_ROUND ?? '1');
const OUTPUT_SUFFIX = (process.env.PARITY_OUTPUT_SUFFIX ?? '').replace(/[^a-z0-9_-]/giu, '');
const WAIT_AFTER_SCROLL_MS = Number(process.env.PARITY_WAIT_MS ?? '2500');
// The current live Tilda slider prepends a duplicate of the final banner at
// index 0.  Its first real banner is therefore index 1.  The Astro carousel
// has the equivalent artwork at its second array position.  This is capture
// state only: production carousel data remains untouched.
const HOME_PROMO_CANONICAL_INDEX = 1;
const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900, mobile: false },
  { name: '390', width: 390, height: 844, mobile: true },
];

const CSV_HEADERS = [
  'url', 'sections_orig', 'sections_clone', 'missing_sections', 'missing_texts', 'missing_images',
  'px_1440', 'px_390', 'h_orig_1440', 'h_clone_1440', 'h_orig_390', 'h_clone_390',
  'overflow_390', 'console_errors', 'external_requests', 'failed_requests', 'verdict', 'fixed',
  'broken_links', 'missing_img_dimensions', 'first_screen_lazy', 'seo_match', 'headings_match',
  'height_delta_1440', 'height_delta_390', 'visual_scope', 'round', 'notes',
];
const WIDGET_KINDS = new Set(['booking', 'map', 'reviews']);
// Exact sequence matching should be based on page-specific copy, not common
// connective words that happen to occur in unrelated Tilda records.
const SEMANTIC_STOP_WORDS = new Set([
  'для', 'или', 'это', 'как', 'что', 'все', 'всё', 'ваш', 'ваша', 'ваше', 'ваши',
  'нас', 'нам', 'вам', 'вы', 'мы', 'на', 'по', 'из', 'от', 'до', 'за', 'под',
  'при', 'без', 'над', 'квест', 'квесты', 'чё', 'че', 'за', 'ростове', 'дону',
]);
const ROUND_DIR = join(PARITY_DIR, `round-${ROUND}${OUTPUT_SUFFIX ? `-${OUTPUT_SUFFIX}` : ''}`);
const MATRIX_PATH = join(PARITY_DIR, OUTPUT_SUFFIX ? `visual-matrix-${OUTPUT_SUFFIX}.csv` : 'visual-matrix.csv');

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
// A masked third-party widget can leave Playwright waiting indefinitely for a
// section raster.  Section crops are supplementary evidence; a timed-out crop
// is recorded as unavailable while the mandatory full-page pair still runs.
const SECTION_SCREENSHOT_TIMEOUT_MS = 15_000;

function canonicalPromoState({ activeIndex, position, visible = true } = {}, targetIndex = HOME_PROMO_CANONICAL_INDEX) {
  const active = Number(activeIndex);
  const hasPosition = position !== null && position !== undefined && position !== '';
  const sliderPosition = Number(position);
  return Number.isInteger(active)
    && active === targetIndex
    && (!hasPosition || (Number.isFinite(sliderPosition) && sliderPosition === targetIndex))
    && visible === true;
}

// A translated lazy slide can have the right ARIA state while Chromium has not
// decoded its image yet. Treat rendering readiness as a separate hard capture
// contract so a blank banner cannot be certified as canonical.
function decodedPromoImageReady({ complete, naturalWidth, currentSrc, visible = true } = {}) {
  return complete === true
    && Number.isFinite(Number(naturalWidth))
    && Number(naturalWidth) > 0
    && typeof currentSrc === 'string'
    && currentSrc.trim().length > 0
    && visible === true;
}

function promoBackgroundReady({ backgroundImage, complete, naturalWidth, currentSrc, loaded, visible = true } = {}) {
  return typeof backgroundImage === 'string'
    && backgroundImage !== 'none'
    && loaded === true
    && decodedPromoImageReady({ complete, naturalWidth, currentSrc, visible });
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(headers, rows) {
  return `${headers.join(',')}\n${rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')).join('\n')}\n`;
}

function routeSlug(route) {
  return route === '/' ? 'home' : route.replace(/^\/+|\/+$/gu, '').replaceAll('/', '__');
}

function withoutTrailingSlash(route) {
  return route === '/' ? '' : route.replace(/\/+$/u, '');
}

function normaliseText(value) {
  return String(value ?? '')
    .toLocaleLowerCase('ru')
    .replace(/\+?7\s*\(?\d{3,4}\)?[\s-]*\d{2,3}[\s-]*\d{2}[\s-]*\d{2}/gu, '<phone>')
    .replace(/\b8\s*\(?\d{3,4}\)?[\s-]*\d{2,3}[\s-]*\d{2}[\s-]*\d{2}/gu, '<phone>')
    .replace(/коралинав(?=\s+стране)/giu, 'коралина в')
    .replace(/[«»"'`.,:;!?()[\]{}—–\-/\\]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function imageKey(value) {
  const source = String(value ?? '').toLocaleLowerCase('ru');
  const tilda = source.match(/tild[0-9a-f-]{12,}/u)?.[0];
  if (tilda) return tilda;
  const filename = source.split(/[?#]/u)[0].split('/').at(-1) ?? '';
  return filename.replace(/\.(?:avif|webp|png|jpe?g|gif|svg)$/u, '').replace(/[^\p{L}\p{N}]+/gu, '');
}

function tokenSet(value) {
  return new Set(normaliseText(value).split(' ').filter((token) => token.length >= 3 && !/^\d+$/u.test(token)));
}

function semanticTokenSet(value) {
  return new Set([...tokenSet(value)].filter((token) => !SEMANTIC_STOP_WORDS.has(token)));
}

function jaccard(left, right) {
  if (left.size === 0 && right.size === 0) return 0;
  let intersect = 0;
  for (const value of left) if (right.has(value)) intersect += 1;
  return intersect / new Set([...left, ...right]).size;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
}

// Tilda renders its global navigation outside #allrecords and leaves an empty
// short record in the document flow to reserve its height. That spacer is the
// only source-record counterpart to Astro's visible header. A first record
// with content is a hero (privacy is the counterexample), never a header.
function sourceHeaderSpacer(section) {
  const height = Number(section?.height ?? 0);
  const hasVisibleCopy = Boolean(normaliseText(section?.heading) || normaliseText(section?.text));
  return height >= 12
    && height <= 160
    && !hasVisibleCopy
    && (section?.images?.length ?? 0) === 0;
}

function shortList(values, limit = 6) {
  const unique = [...new Set(values.filter(Boolean))];
  if (unique.length <= limit) return unique.join(' | ');
  return `${unique.slice(0, limit).join(' | ')} | +${unique.length - limit}`;
}

function sameSeo(original, clone) {
  return ['title', 'description', 'h1'].every((field) => normaliseText(original.seo[field]) === normaliseText(clone.seo[field]));
}

function sameHeadings(original, clone) {
  // Tilda authoring records use arbitrary divs for many visual headings. The
  // portable SEO contract is the document H1; secondary visible copy is
  // checked through section and text coverage instead of tag identity.
  const sourceH1 = original.headings.find((heading) => heading.startsWith('h1:')) ?? '';
  const cloneH1 = clone.headings.find((heading) => heading.startsWith('h1:')) ?? '';
  return normaliseText(sourceH1) === normaliseText(cloneH1);
}

function detailCapture(capture) {
  return {
    inspection: capture.inspection,
    consoleErrors: capture.consoleErrors,
    failedRequests: capture.failedRequests,
    externalRequests: capture.externalRequests,
    screenshotPath: capture.screenshotPath,
  };
}

function textCoverage(tokens, corpus) {
  if (!tokens.size) return 1;
  let matched = 0;
  for (const token of tokens) if (corpus.has(token)) matched += 1;
  return matched / tokens.size;
}

function exactAssetIds(images) {
  return new Set((images ?? []).filter((image) => /^tild[0-9a-f-]{12,}$/iu.test(image)));
}

function sharedCount(left, right) {
  let count = 0;
  for (const value of left) if (right.has(value)) count += 1;
  return count;
}

function maxPairedSectionHeightDelta(sections) {
  return Math.max(
    0,
    ...sections
      .filter((section) => section.clone && section.height_delta !== null)
      .map((section) => section.height_delta),
  );
}

function semanticAnchor(section) {
  if (section.role === 'header' || section.role === 'footer') return true;
  if (section.role === 'footer_continuation' || section.widget) return false;
  const headingTokens = semanticTokenSet(section.heading);
  const textTokens = semanticTokenSet(section.text);
  // A visual asset with no text can be a real standalone banner. It remains
  // an anchor, unlike an empty Tilda spacer or a technical record.
  return headingTokens.size >= 2 || textTokens.size >= 3 || (section.images?.length ?? 0) > 0;
}

function sectionMatch(source, target) {
  // A source-artboard can preserve the exact Tilda record identifier. This is
  // stronger than textual heuristics for deliberate blank spacers and media
  // records, but it is not a visual waiver: the paired crop still has to meet
  // the same pixel and height gates below.
  if (target.parity_record) {
    return source.id === target.parity_record
      ? { score: 1, matchable: true, evidence: 'record' }
      : { score: 0, matchable: false, evidence: '' };
  }
  if (source.role === 'header' || target.role === 'header') {
    return source.role === 'header' && target.role === 'header'
      ? { score: 1, matchable: true, evidence: 'role:header' }
      : { score: 0, matchable: false, evidence: '' };
  }
  if (source.role === 'footer' || target.role === 'footer') {
    return source.role === 'footer' && target.role === 'footer'
      ? { score: 1, matchable: true, evidence: 'role:footer' }
      : { score: 0, matchable: false, evidence: '' };
  }

  const sourceHeading = semanticTokenSet(source.heading);
  const targetHeading = semanticTokenSet(target.heading);
  const sourceText = semanticTokenSet(source.text);
  const targetText = semanticTokenSet(target.text);
  const headingShared = sharedCount(sourceHeading, targetHeading);
  const textShared = sharedCount(sourceText, targetText);
  const headingScore = jaccard(sourceHeading, targetHeading);
  const textScore = jaccard(sourceText, targetText);

  // Imported Astro assets are content-addressed during build, while source
  // Tilda URLs contain an opaque tild… identifier. Asset equality is useful
  // only when both sides expose that same identifier; otherwise it is not a
  // negative signal and must not manufacture a missing-image result.
  const sourceAssets = exactAssetIds(source.images);
  const targetAssets = exactAssetIds(target.images);
  const sharedAssets = sharedCount(sourceAssets, targetAssets);
  const imageScore = sourceAssets.size && targetAssets.size
    ? jaccard(sourceAssets, targetAssets)
    : 0;

  const exactHeading = headingShared >= 2 && headingScore >= 0.5;
  const substantiveText = textShared >= 3 && textScore >= 0.2;
  const exactAsset = sharedAssets > 0;
  // Do not accept accidental one-word overlap (the old 0.045 threshold did
  // exactly that). Every match has a semantic heading, several content words,
  // or a traceable identical asset as evidence.
  const matchable = exactHeading || substantiveText || exactAsset;
  if (!matchable) return { score: 0, matchable: false, evidence: '' };
  const score = Math.min(1, (headingScore * 0.55) + (textScore * 0.35) + (imageScore * 0.10));
  const evidence = exactHeading ? 'heading' : (substantiveText ? 'text' : 'asset');
  return { score, matchable, evidence };
}

const MAX_SOURCE_MACRO_PARTS = 2;

function combinedSourceSection(parts) {
  const first = parts[0];
  const last = parts.at(-1);
  const firstTop = Number(first?.top);
  const lastTop = Number(last?.top);
  const lastHeight = Number(last?.height);
  const hasGeometry = Number.isFinite(firstTop) && Number.isFinite(lastTop) && Number.isFinite(lastHeight);
  return {
    ...first,
    id: `macro:${parts.map((part) => part.id || part.index).join('+')}`,
    heading: parts.map((part) => part.heading).filter(Boolean).join(' '),
    text: parts.map((part) => part.text).filter(Boolean).join(' '),
    images: [...new Set(parts.flatMap((part) => part.images ?? []))],
    top: hasGeometry ? firstTop : first?.top,
    height: hasGeometry ? Math.max(0, (lastTop + lastHeight) - firstTop) : Number(first?.height ?? 0),
  };
}

function macroPartCoverage(source, targetTokens, targetAssets) {
  const tokens = semanticTokenSet(`${source.heading ?? ''} ${source.text ?? ''}`);
  const sourceAssets = exactAssetIds(source.images);
  const assetMatch = sourceAssets.size > 0 && sharedCount(sourceAssets, targetAssets) > 0;
  if (tokens.size < 3) return assetMatch;
  const covered = textCoverage(tokens, targetTokens);
  return covered >= 0.5 && sharedCount(tokens, targetTokens) >= 3;
}

function breadcrumbRecord(section) {
  const heading = normaliseText(section.heading);
  const tokens = normaliseText(section.text).split(' ').filter(Boolean);
  return !heading && tokens.length >= 2 && tokens[0] === 'главная';
}

// Tilda records are intentionally conservative here: one visual macro may
// join exactly two physically adjacent, independently meaningful records. A
// title plus its cards is common; crossing an intervening record can swallow
// an unrelated privacy, navigation, or home-page block. Both source records
// must be represented in the clone's copy (or share a traceable image), and
// their combined corpus must still be strongly covered by the target.
function macroSectionMatch(parts, target) {
  if (parts.length !== MAX_SOURCE_MACRO_PARTS) return { score: 0, matchable: false, evidence: '' };
  if (parts.some((part) => part.role || part.widget || breadcrumbRecord(part))) return { score: 0, matchable: false, evidence: '' };
  if (parts[1].index !== parts[0].index + 1) return { score: 0, matchable: false, evidence: '' };

  const targetTokens = semanticTokenSet(`${target.heading ?? ''} ${target.text ?? ''}`);
  const targetAssets = exactAssetIds(target.images);
  if (!parts.every((part) => macroPartCoverage(part, targetTokens, targetAssets))) {
    return { score: 0, matchable: false, evidence: '' };
  }

  const source = combinedSourceSection(parts);
  const sourceTokens = semanticTokenSet(`${source.heading} ${source.text}`);
  if (sourceTokens.size < 6 || textCoverage(sourceTokens, targetTokens) < 0.7) {
    return { score: 0, matchable: false, evidence: '' };
  }

  const candidate = sectionMatch(source, target);
  if (!candidate.matchable) return candidate;
  // The small completeness preference is only used to choose between two
  // already-proven semantic alignments in the DP table. It neither changes a
  // visual threshold nor makes an otherwise unmatchable record match.
  return {
    ...candidate,
    score: Math.min(1, candidate.score + 0.18),
    evidence: `macro:${candidate.evidence}`,
  };
}

/**
 * Order-preserving semantic alignment. Tilda authoring commonly splits one
 * visual block into several `rec…` elements, while Astro expresses it as one
 * semantic section. Greedy nearest-neighbour matching paired empty fragments
 * with unrelated sections and corrupted both pixel and height metrics. This
 * dynamic-programming alignment only consumes a pair when it has explicit
 * semantic evidence and never crosses an already selected pair.
 */
function sectionPairs(original, clone) {
  const explicitTargetRecords = new Set(clone.map((section) => section.parity_record).filter(Boolean));
  const source = original
    .map((section, index) => ({ ...section, index: Number.isInteger(section.index) ? section.index : index }))
    .filter((section) => semanticAnchor(section) || explicitTargetRecords.has(section.id));
  const target = clone
    .map((section, index) => ({ ...section, index: Number.isInteger(section.index) ? section.index : index }))
    .filter((section) => semanticAnchor(section) || Boolean(section.parity_record));
  const score = Array.from({ length: source.length + 1 }, () => Array(target.length + 1).fill(0));
  const steps = Array.from({ length: source.length + 1 }, () => Array(target.length + 1).fill(null));

  for (let sourceIndex = 1; sourceIndex <= source.length; sourceIndex += 1) {
    for (let targetIndex = 1; targetIndex <= target.length; targetIndex += 1) {
      const skipSource = score[sourceIndex - 1][targetIndex];
      const skipTarget = score[sourceIndex][targetIndex - 1];
      let best = skipSource;
      let step = { kind: 'source' };
      if (skipTarget > best) {
        best = skipTarget;
        step = { kind: 'target' };
      }
      for (let span = 1; span <= Math.min(MAX_SOURCE_MACRO_PARTS, sourceIndex); span += 1) {
        const parts = source.slice(sourceIndex - span, sourceIndex);
        const candidate = span === 1
          ? sectionMatch(parts[0], target[targetIndex - 1])
          : macroSectionMatch(parts, target[targetIndex - 1]);
        if (!candidate.matchable) continue;
        const paired = score[sourceIndex - span][targetIndex - 1] + candidate.score;
        // Prefer a complete, proven macro on a tie. This is what prevents an
        // exact title record from hiding its adjacent card record as "missing".
        if (paired > best || (paired === best && span > (step.span ?? 0))) {
          best = paired;
          step = { kind: 'pair', span, candidate };
        }
      }
      score[sourceIndex][targetIndex] = best;
      steps[sourceIndex][targetIndex] = step;
    }
  }

  const selected = new Map();
  let sourceIndex = source.length;
  let targetIndex = target.length;
  while (sourceIndex > 0 || targetIndex > 0) {
    const step = steps[sourceIndex]?.[targetIndex];
    if (step?.kind === 'pair') {
      const start = sourceIndex - step.span;
      selected.set(start, {
        cloneIndex: target[targetIndex - 1].index,
        score: step.candidate.score,
        evidence: step.candidate.evidence,
        span: step.span,
      });
      sourceIndex -= step.span;
      targetIndex -= 1;
    } else if (step?.kind === 'source' || targetIndex === 0) {
      sourceIndex -= 1;
    } else {
      targetIndex -= 1;
    }
  }

  const pairs = [];
  for (let sourceIndex = 0; sourceIndex < source.length;) {
    const section = source[sourceIndex];
    const match = selected.get(sourceIndex);
    const span = match?.span ?? 1;
    pairs.push({
      originalIndex: section.index,
      originalIndexes: source.slice(sourceIndex, sourceIndex + span).map((part) => part.index),
      cloneIndex: match?.cloneIndex ?? -1,
      score: match?.score ?? 0,
      evidence: match?.evidence ?? '',
      orderOk: Boolean(match),
      macro: span > 1,
    });
    sourceIndex += span;
  }
  return pairs;
}

function imageParity(originalImages, cloneImages) {
  const sourceAssets = exactAssetIds(originalImages);
  const targetAssets = exactAssetIds(cloneImages);
  const unmappedImages = [...sourceAssets].filter((image) => !targetAssets.has(image));
  // A content-addressed Astro URL (for example /assets/q/<hash>.webp) loses
  // Tilda's opaque image id. It is not evidence that the picture is absent.
  // We only call images missing when the clone exposes no qualifying image at
  // all; otherwise unresolved ids remain an explicit diagnostic and section
  // pixel checks continue to enforce visible image parity.
  return {
    missingImages: originalImages.length && !cloneImages.length ? [...sourceAssets] : [],
    unmappedImages,
  };
}

async function visualSimilarity(originalBuffer, cloneBuffer) {
  const [originalMetadata, cloneMetadata] = await Promise.all([sharp(originalBuffer).metadata(), sharp(cloneBuffer).metadata()]);
  const width = Math.min(originalMetadata.width ?? 0, cloneMetadata.width ?? 0, 1440);
  const originalHeight = originalMetadata.height ?? 0;
  const cloneHeight = cloneMetadata.height ?? 0;
  if (!width || !originalHeight || !cloneHeight) return null;
  const originalScale = width / originalMetadata.width;
  const cloneScale = width / cloneMetadata.width;
  const height = Math.min(Math.round(originalHeight * originalScale), Math.round(cloneHeight * cloneScale), 5000);
  if (!height) return null;
  const resize = (buffer, metadata) => sharp(buffer)
    .resize({ width, height: Math.round((metadata.height ?? 0) * (width / (metadata.width ?? width))), fit: 'fill' })
    .extract({ left: 0, top: 0, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const [left, right] = await Promise.all([resize(originalBuffer, originalMetadata), resize(cloneBuffer, cloneMetadata)]);
  let matching = 0;
  const pixels = width * height;
  for (let offset = 0; offset < pixels * 4; offset += 4) {
    if (Math.abs(left[offset] - right[offset]) <= 12
      && Math.abs(left[offset + 1] - right[offset + 1]) <= 12
      && Math.abs(left[offset + 2] - right[offset + 2]) <= 12) matching += 1;
  }
  return Number(((matching / pixels) * 100).toFixed(2));
}

async function pageScreenshot(page, filename) {
  const buffer = await page.screenshot({ type: 'jpeg', quality: 68, fullPage: true, animations: 'disabled' });
  const metadata = await sharp(buffer).metadata();
  // libwebp cannot encode either dimension above 16,383px. Keep the native
  // DPR-2 JPEG in that case instead of downscaling the acceptance evidence.
  if ((metadata.width ?? 0) > 16_383 || (metadata.height ?? 0) > 16_383) {
    const jpegPath = filename.replace(/\.webp$/u, '.jpg');
    await writeFile(jpegPath, buffer);
    return jpegPath;
  }
  await sharp(buffer).webp({ quality: 58, effort: 4 }).toFile(filename);
  return filename;
}

async function compactSectionScreenshot(buffer) {
  // A mobile full-height Tilda record can be tens of thousands of device
  // pixels tall. Keep comparison evidence bounded before holding a complete
  // route's section set in memory.
  return sharp(buffer)
    .resize({ width: 720, height: 2400, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 62 })
    .toBuffer();
}

async function fullMacroScreenshot(capture, sections) {
  if (!capture.screenshotPath || !sections.length) return null;
  const firstTop = Number(sections[0].top);
  const last = sections.at(-1);
  const lastTop = Number(last?.top);
  const lastHeight = Number(last?.height);
  const cssWidth = Number(capture.inspection.dimensions.width);
  if (!Number.isFinite(firstTop) || !Number.isFinite(lastTop) || !Number.isFinite(lastHeight) || !cssWidth) return null;
  const metadata = await sharp(capture.screenshotPath).metadata();
  const imageWidth = metadata.width ?? 0;
  const imageHeight = metadata.height ?? 0;
  if (!imageWidth || !imageHeight) return null;
  const scale = imageWidth / cssWidth;
  const top = Math.max(0, Math.min(imageHeight - 1, Math.round(firstTop * scale)));
  const bottom = Math.max(top + 1, Math.min(imageHeight, Math.round((lastTop + lastHeight) * scale)));
  const height = bottom - top;
  if (!height) return null;
  const crop = await sharp(capture.screenshotPath)
    .extract({ left: 0, top, width: imageWidth, height })
    .jpeg({ quality: 64 })
    .toBuffer();
  return compactSectionScreenshot(crop);
}

// Both original and clone normalizers run in page context. Install browser-side
// primitives once per captured page so their visibility/decode contracts stay
// exactly alike rather than drifting in two copied implementations.
async function installPromoDomHelpers(page) {
  await page.evaluate(() => {
    if (window.__parityPromoCaptureHelpers) return;
    const isVisiblyRendered = (element, clip) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const clipRect = clip instanceof HTMLElement ? clip.getBoundingClientRect() : null;
      const inViewport = rect.right > 0 && rect.bottom > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight;
      const inClip = !clipRect || (rect.right > clipRect.left && rect.left < clipRect.right && rect.bottom > clipRect.top && rect.top < clipRect.bottom);
      return rect.width > 0 && rect.height > 0 && inViewport && inClip
        && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
    };
    const decodeImageOrFail = async (image, label) => {
      let timeoutId;
      try {
        await Promise.race([
          image.decode(),
          new Promise((_, reject) => {
            timeoutId = window.setTimeout(() => reject(new Error(`${label} decode timed out`)), 5000);
          }),
        ]);
      } finally {
        window.clearTimeout(timeoutId);
      }
      if (!image.complete || image.naturalWidth <= 0 || !image.currentSrc) {
        throw new Error(`${label} did not produce a decoded image`);
      }
    };
    window.__parityPromoCaptureHelpers = { decodeImageOrFail, isVisiblyRendered };
  });
}

function assertCanonicalPromoReadiness(kind, state, mediaReady) {
  if (state.present && (!canonicalPromoState(state) || !mediaReady(state))) {
    throw new Error(`Unable to normalise ${kind} home promo slider: ${JSON.stringify(state)}`);
  }
}

async function sourcePromoNavigationState(page) {
  return page.evaluate(async (targetIndex) => {
    const root = document.querySelector('#rec958749021');
    if (!(root instanceof HTMLElement)) return { present: false };
    const wrapper = root.querySelector('.t-slds__items-wrapper');
    const previous = root.querySelector('.t-slds__arrow-left');
    const target = root.querySelector(`[data-slide-index="${targetIndex}"]`);
    if (!(wrapper instanceof HTMLElement) || !(previous instanceof HTMLElement) || !(target instanceof HTMLElement)) {
      return { present: true, activeIndex: null, position: null, visible: false };
    }
    const intervalId = Number(wrapper.dataset.sliderIntervalId);
    if (Number.isFinite(intervalId)) {
      window.clearInterval(intervalId);
      window.clearTimeout(intervalId);
    }
    const total = root.querySelectorAll('[data-slide-index]').length;
    for (let attempt = 0; attempt <= total; attempt += 1) {
      const active = Number(root.querySelector('.t-slds__item_active')?.getAttribute('data-slide-index'));
      if (active === targetIndex) break;
      previous.click();
      // Tilda transitions for 300ms; a 360ms wait avoids the old 40ms race.
      await new Promise((resolve) => window.setTimeout(resolve, 360));
    }
    const activeItem = root.querySelector('.t-slds__item_active');
    return {
      present: true,
      activeIndex: activeItem?.getAttribute('data-slide-index') ?? null,
      position: wrapper.dataset.sliderPos ?? null,
      visible: activeItem?.getAttribute('aria-hidden') === 'false',
    };
  }, HOME_PROMO_CANONICAL_INDEX);
}

async function sourcePromoBackgroundReadiness(page) {
  return page.evaluate(async (targetIndex) => {
    const helpers = window.__parityPromoCaptureHelpers;
    if (!helpers) throw new Error('Promo capture helpers were not installed');
    const root = document.querySelector('#rec958749021');
    const activeTarget = root?.querySelector(`.t-slds__item_active[data-slide-index="${targetIndex}"]`);
    const backgroundNode = activeTarget instanceof HTMLElement
      ? [activeTarget, ...activeTarget.querySelectorAll('*')].find((node) => (
        node instanceof HTMLElement && window.getComputedStyle(node).backgroundImage !== 'none'
      ))
      : null;
    const backgroundImage = backgroundNode instanceof HTMLElement
      ? window.getComputedStyle(backgroundNode).backgroundImage
      : 'none';
    const backgroundMatch = backgroundImage.match(/url\((['"]?)(.*?)\1\)/u);
    if (!(backgroundNode instanceof HTMLElement) || !backgroundMatch?.[2] || !(root instanceof HTMLElement)) {
      return { backgroundImage, complete: false, currentSrc: '', loaded: false, naturalWidth: 0, visible: false };
    }
    const probe = new Image();
    probe.src = new URL(backgroundMatch[2], document.baseURI).href;
    await helpers.decodeImageOrFail(probe, 'source canonical promo background');
    return {
      backgroundImage,
      complete: probe.complete,
      currentSrc: probe.currentSrc,
      loaded: true,
      naturalWidth: probe.naturalWidth,
      visible: helpers.isVisiblyRendered(backgroundNode, root),
    };
  }, HOME_PROMO_CANONICAL_INDEX);
}

async function normaliseSourceHomePromoSlider(page) {
  const state = await sourcePromoNavigationState(page);
  if (!state.present) return;
  await installPromoDomHelpers(page);
  state.background = await sourcePromoBackgroundReadiness(page);
  assertCanonicalPromoReadiness('source', state, (capture) => promoBackgroundReady(capture.background));
}

async function clonePromoState(page) {
  return page.evaluate(async (targetIndex) => {
    const helpers = window.__parityPromoCaptureHelpers;
    if (!helpers) throw new Error('Promo capture helpers were not installed');
    const slider = document.querySelector('#promo-slider');
    if (!(slider instanceof HTMLElement)) return { present: false };
    const track = slider.querySelector('.slider__track');
    const slides = [...slider.querySelectorAll('.slider__slide')];
    const target = slides[targetIndex];
    if (!(track instanceof HTMLElement) || !(target instanceof HTMLElement)) {
      return { present: true, activeIndex: null, position: null, visible: false };
    }
    const image = target.querySelector('img');
    if (image instanceof HTMLImageElement && image.dataset.src) {
      image.src = image.dataset.src;
      image.removeAttribute('data-src');
    }
    if (!(image instanceof HTMLImageElement)) {
      return { present: true, activeIndex: null, position: null, visible: false, image: null };
    }
    // Decode failures/timeouts are fatal; a translated blank lazy image is not
    // a canonical slide.
    await helpers.decodeImageOrFail(image, 'clone canonical promo image');
    const slideWidth = target.getBoundingClientRect().width;
    track.style.transition = 'none';
    track.style.transform = `translate3d(-${targetIndex * slideWidth}px, 0, 0)`;
    slides.forEach((slide, index) => slide.setAttribute('aria-hidden', index === targetIndex ? 'false' : 'true'));
    slider.dataset.parityPromoIndex = String(targetIndex);
    return {
      present: true,
      activeIndex: slider.dataset.parityPromoIndex,
      position: targetIndex,
      visible: target.getAttribute('aria-hidden') === 'false',
      image: {
        complete: image.complete,
        currentSrc: image.currentSrc,
        naturalWidth: image.naturalWidth,
        visible: helpers.isVisiblyRendered(image, slider),
      },
    };
  }, HOME_PROMO_CANONICAL_INDEX);
}

async function normaliseCloneHomePromoSlider(page) {
  await installPromoDomHelpers(page);
  const state = await clonePromoState(page);
  assertCanonicalPromoReadiness('clone', state, (capture) => decodedPromoImageReady(capture.image));
}

// Freeze the root carousel on the same source-backed banner before taking a
// pair. This affects only the capture DOM; production carousel data remains
// untouched.
async function normaliseHomePromoSlider(page, kind) {
  return kind === 'original'
    ? normaliseSourceHomePromoSlider(page)
    : normaliseCloneHomePromoSlider(page);
}

// A full-page raster can take longer than Tilda's three-second autoplay
// interval. Freeze every ordinary Tilda slider on its first authored slide so
// both screenshots keep the state established before capture. The root promo
// has a stricter media-readiness contract above and remains excluded here.
async function normaliseTildaSliders(page) {
  await page.evaluate(async () => {
    const decodeBackground = async (element) => {
      const media = [element, ...element.querySelectorAll('*')].find((node) => (
        node instanceof HTMLElement
        && (window.getComputedStyle(node).backgroundImage !== 'none' || node.dataset.original)
      ));
      if (!(media instanceof HTMLElement)) return;
      if (window.getComputedStyle(media).backgroundImage === 'none' && media.dataset.original) {
        media.style.backgroundImage = `url("${media.dataset.original}")`;
      }
      const match = window.getComputedStyle(media).backgroundImage.match(/url\((['"]?)(.*?)\1\)/u);
      if (!match?.[2]) return;
      const probe = new Image();
      probe.src = new URL(match[2], document.baseURI).href;
      try { await probe.decode(); } catch { /* the visible page remains the acceptance evidence */ }
    };

    const tasks = [];
    document.querySelectorAll('.t-slds__items-wrapper').forEach((wrapper) => {
      if (!(wrapper instanceof HTMLElement) || wrapper.closest('#rec958749021')) return;
      const target = wrapper.querySelector(':scope > .t-slds__item[data-slide-index="1"]');
      const container = wrapper.closest('.t-slds__container');
      if (!(target instanceof HTMLElement) || !(container instanceof HTMLElement)) return;
      const intervalId = Number(wrapper.dataset.sliderIntervalId);
      if (Number.isFinite(intervalId)) {
        window.clearInterval(intervalId);
        window.clearTimeout(intervalId);
      }
      wrapper.removeAttribute('data-slider-interval-id');
      wrapper.dataset.sliderStopped = 'true';
      const matrix = new DOMMatrixReadOnly(window.getComputedStyle(wrapper).transform);
      const offset = container.getBoundingClientRect().left - target.getBoundingClientRect().left;
      wrapper.style.setProperty('transition', 'none', 'important');
      wrapper.style.setProperty('transform', `translate3d(${matrix.m41 + offset}px, 0, 0)`, 'important');
      wrapper.dataset.sliderPos = '1';
      wrapper.querySelectorAll(':scope > .t-slds__item').forEach((item) => {
        const active = item === target;
        item.classList.toggle('t-slds__item_active', active);
        item.setAttribute('aria-hidden', String(!active));
      });
      tasks.push(decodeBackground(target));
    });
    await Promise.all(tasks);
  });
}

// The Minecraft photo ribbon is a source extension that clones and animates
// the same T552 rail several times. Product geometry is preserved; only the
// transient translation and duplicate rails are neutralised for evidence.
async function normaliseT552Marquees(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.nlm095_900789451451 .t552').forEach((rail) => {
      const containers = [...rail.querySelectorAll(':scope > .t552__container')];
      containers.forEach((container, index) => {
        if (!(container instanceof HTMLElement)) return;
        container.style.setProperty('animation', 'none', 'important');
        container.style.setProperty('transform', 'translate3d(0, 0, 0)', 'important');
        container.style.setProperty('display', index === 0 ? 'block' : 'none', 'important');
      });
    });
  });
}

async function settlePage(page, kind) {
  await page.addStyleTag({ content: `
    *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; caret-color: transparent !important; }
    .r_hidden, .r_anim { opacity: 1 !important; }
    .t-popup, .t-popup_show, .t390__carrier, .t390__filter { display: none !important; }
    [data-parity-widget-mask] { display: none !important; }
    html[data-parity-section-content] #t-header,
    html[data-parity-section-content] .hdr { visibility: hidden !important; }
  ` });
  await page.evaluate(async () => {
    const pause = document.querySelector('.slider__pause');
    if (pause instanceof HTMLButtonElement && pause.getAttribute('aria-pressed') !== 'true') pause.click();
    const track = document.querySelector('.slider__track');
    if (track instanceof HTMLElement) track.style.transform = 'translate3d(0, 0, 0)';
    for (let y = 0; y < document.documentElement.scrollHeight; y += 800) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
    window.scrollTo(0, 0);
    await document.fonts?.ready;
  });
  await sleep(WAIT_AFTER_SCROLL_MS);
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
  });
  await normaliseHomePromoSlider(page, kind);
  await normaliseTildaSliders(page);
  await normaliseT552Marquees(page);
  await sleep(240);
  await page.evaluate((pageKind) => {
    const text = (element) => String(element.innerText || element.textContent || '')
      .toLocaleLowerCase('ru')
      .replace(/\s+/gu, ' ')
      .trim();
    const mark = (element, widget) => {
      if (!(element instanceof HTMLElement) || element.closest('[data-parity-widget-mask]')) return;
      element.dataset.parityWidgetMask = widget;
    };
    if (pageKind === 'clone') {
      document.querySelectorAll('.prebook').forEach((element) => mark(element, 'booking'));
      document.querySelectorAll('.venues__map, .vmap, [data-map-embed]').forEach((element) => mark(element, 'map'));
      document.querySelectorAll('.reviews').forEach((element) => mark(element, 'reviews'));
      return;
    }
    document.querySelectorAll('#allrecords > [id^="rec"], [id^="rec"]').forEach((record) => {
      if (!(record instanceof HTMLElement)) return;
      const recordText = text(record);
      if (record.querySelector('.t-map, .t-map-lazyload, [id^="separateMap"], [data-maplazy-load]')) {
        mark(record, 'map');
      } else if (record.querySelector('.resq, iframe[src*="calendar" i], [data-calendar], [data-booking]')
        || /расписание не загрузилось/u.test(recordText)) {
        mark(record, 'booking');
      } else if (record.querySelector('#myReviews__block-widget, iframe[title*="отзыв" i], [class*="review" i], [id*="review" i]')
        || /^отзывы(?:\s|$)/u.test(recordText)) {
        mark(record, 'reviews');
      }
    });
  }, kind);
  await page.evaluate(async () => {
    // Removing a sanctioned external widget changes document height; reflow
    // and visit the remaining lazy regions before the measured capture.
    for (let y = 0; y < document.documentElement.scrollHeight; y += 800) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    window.scrollTo(0, 0);
  });
  await sleep(120);
}

async function inspectPage(page, kind, knownRoutes) {
  const inspection = await page.evaluate(({ kind: pageKind, knownRoutes: routes }) => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0;
    };
    const normalise = (value) => String(value ?? '')
      .toLocaleLowerCase('ru')
      .replace(/\+?7\s*\(?\d{3,4}\)?[\s-]*\d{2,3}[\s-]*\d{2}[\s-]*\d{2}/gu, '<phone>')
      .replace(/\b8\s*\(?\d{3,4}\)?[\s-]*\d{2,3}[\s-]*\d{2}[\s-]*\d{2}/gu, '<phone>')
      .replace(/коралинав(?=\s+стране)/giu, 'коралина в')
      .replace(/[«»"'`.,:;!?()[\]{}—–\-/\\]+/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim();
    const imageKeyFor = (source) => {
      const value = String(source ?? '').toLocaleLowerCase('ru');
      const tilda = value.match(/tild[0-9a-f-]{12,}/u)?.[0];
      if (tilda) return tilda;
      const filename = value.split(/[?#]/u)[0].split('/').at(-1) ?? '';
      return filename.replace(/\.(?:avif|webp|png|jpe?g|gif|svg)$/u, '').replace(/[^\p{L}\p{N}]+/gu, '');
    };
    const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? '';
    const headingText = (element) => {
      const candidates = element.matches('h1,h2,h3')
        ? [element, ...element.querySelectorAll('h1,h2,h3')]
        : [...element.querySelectorAll('h1,h2,h3')];
      return candidates.find(visible)?.textContent?.replace(/\s+/gu, ' ').trim() ?? '';
    };
    const textFor = (element) => {
      // Read while the node is attached. `innerText` on a detached clone
      // falls back to its textContent in Chromium and leaks Tilda's hidden
      // form-schema textarea (li_name, unicode escapes, etc.) into visual
      // matching. The rendered value is precisely the user-visible copy.
      const rendered = element.innerText;
      if (rendered) return normalise(rendered);
      const copy = element.cloneNode(true);
      copy.querySelectorAll('style,script,noscript,template,input,textarea,select,[hidden],[aria-hidden="true"]').forEach((node) => node.remove());
      // aria-label is an accessibility name, not necessarily visible copy
      // (social icon controls are the common case). It is audited separately
      // through links and must not create a false visual-text mismatch.
      return normalise(copy.innerText || copy.textContent || '');
    };
    const sourceRecord = (element) => element.closest('#allrecords > [id^="rec"], [id^="rec"]') || element;
    const widgetFor = (element, text = '') => {
      if (pageKind === 'clone') {
        if (element.closest('.prebook')) return 'booking';
        if (element.closest('.venues__map, .vmap, [data-map-embed]')) return 'map';
        if (element.closest('.reviews')) return 'reviews';
        return '';
      }
      const record = sourceRecord(element);
      const recordText = text || textFor(record);
      if (record.querySelector('.t-map, .t-map-lazyload, [id^="separateMap"], [data-maplazy-load]')) return 'map';
      if (record.querySelector('.resq, iframe[src*="calendar" i], [data-calendar], [data-booking]')
        || /расписание не загрузилось/u.test(recordText)) return 'booking';
      if (record.querySelector('#myReviews__block-widget, iframe[title*="отзыв" i], [class*="review" i], [id*="review" i]')
        || /^отзывы(?:\s|$)/u.test(recordText)) return 'reviews';
      return '';
    };
    const cloneSections = () => {
      const generic = [];
      const header = document.querySelector('header.hdr');
      if (header) generic.push(header);
      const sourceSnapshotRoot = document.querySelector('[data-source-snapshot]');
      const sourceSnapshotRecords = sourceSnapshotRoot
        ? [...sourceSnapshotRoot.querySelectorAll('[id^="rec"]')]
          .filter((element) => !/^recorddiv/iu.test(element.id))
          .filter((element) => !element.parentElement?.closest('[id^="rec"]'))
          .filter((element) => !element.hasAttribute('data-parity-layout-spacer'))
        : [];
      if (sourceSnapshotRecords.length) return [...new Set([...generic, ...sourceSnapshotRecords])];
      const main = document.querySelector('main');
      for (const child of main?.children ?? []) {
        if (child.id !== 'catalog') {
          if (child.matches('section,article')) generic.push(child);
          continue;
        }
        // Tilda emits one record for a category heading and another for its
        // card grid. Split Astro's semantic catalog into that same diagnostic
        // granularity without altering the rendered DOM.
        for (const block of child.querySelectorAll('.catblock')) {
          const title = block.querySelector('.catblock__title');
          const grid = block.querySelector('.grid');
          if (title) generic.push(title);
          if (grid) generic.push(grid);
        }
      }
      // Review cards also contain semantic <footer>s. Only the site footer is
      // a page section; choosing document.querySelector('footer') consumed a
      // review-card footer and made the real footer appear missing.
      const footer = document.querySelector('body > footer.ft') || document.querySelector('footer.ft');
      if (footer) generic.push(footer);

      // Source-artboard renderers intentionally expose one node per captured
      // Tilda record. Those nodes can sit below a non-semantic wrapper inside
      // <main>, so the direct-child selector above cannot see them. Explicit
      // records take precedence over a generic ancestor; otherwise a wrapper
      // and its record would be inspected (and screenshot) twice. Nested
      // explicit records are implementation detail too: only the outer record
      // represents a source capture boundary.
      const explicit = [...document.querySelectorAll('[data-parity-record]')]
        .filter((element) => !element.parentElement?.closest('[data-parity-record]'));
      const isArtboardRoot = (element) => element instanceof HTMLElement && (
        element.hasAttribute('data-source-artboard')
        || [...element.classList].some((className) => className.endsWith('-artboard'))
      );
      // Older source-artboards predate `data-parity-record`, but their direct
      // children are still the captured record boundaries. Do not descend
      // farther: nested cards, slides and footer columns are content, not
      // independent Tilda records.
      const artboardRoots = [...document.querySelectorAll('[data-source-artboard], [class]')]
        .filter(isArtboardRoot)
        .filter((root) => Boolean(root.closest('main')))
        .filter((root) => {
          for (let parent = root.parentElement; parent; parent = parent.parentElement) {
            if (isArtboardRoot(parent)) return false;
          }
          return true;
        });
      const artboardRecords = artboardRoots.flatMap((root) => [...root.children]
        .filter((child) => !child.matches('script,style,link,template')));
      const specificRecords = [...new Set([...explicit, ...artboardRecords])];
      const outsideSpecificWrappers = generic.filter((candidate) => !specificRecords.some((record) => (
        candidate !== record && candidate.contains(record)
      )));
      return [...new Set([...outsideSpecificWrappers, ...specificRecords])];
    };
    const sectionCandidates = pageKind === 'original'
      ? [...new Set([
        ...document.querySelectorAll('#t-header .t396__artboard'),
        ...document.querySelectorAll('#allrecords > [id^="rec"], #allrecords > .r, [id^="rec"]'),
      ])]
        .filter((element) => !/^recorddiv/iu.test(element.id))
      : cloneSections();
    const sections = sectionCandidates
      .filter((element) => visible(element) && element.getBoundingClientRect().height >= 12)
      .map((element, captureIndex) => {
        const captureId = `parity-section-${captureIndex}`;
        element.setAttribute('data-parity-capture-id', captureId);
        const rect = element.getBoundingClientRect();
        const text = textFor(element);
        const widget = widgetFor(element, text);
        const images = [...element.querySelectorAll('img')]
          .filter((image) => visible(image) && image.getBoundingClientRect().width >= 80 && image.getBoundingClientRect().height >= 50)
          .map((image) => imageKeyFor(image.currentSrc || image.src))
          .filter(Boolean);
        return {
          index: captureIndex,
          parity_record: pageKind === 'clone'
            ? (element.getAttribute('data-parity-record')
              || (element.closest('[data-source-snapshot]') && /^rec\d+$/u.test(element.id) ? element.id : ''))
            : '',
          id: element.getAttribute('data-parity-record') || element.id || `${element.tagName.toLowerCase()}.${[...element.classList].slice(0, 3).join('.')}`,
          capture_id: captureId,
          heading: normalise(headingText(element)),
          text,
          images: [...new Set(images)],
          widget,
          role: pageKind === 'clone'
            ? (element.matches('header.hdr')
              ? 'header'
              : (element.matches('footer.ft') || element.querySelector('.t344, .t977, footer') ? 'footer' : ''))
            : (element.closest('#t-header') ? 'header' : (element.querySelector('.t344, .t977, footer') ? 'footer' : '')),
          top: Math.round(rect.top + window.scrollY),
          height: Math.round(rect.height),
        };
      })
      .sort((left, right) => left.top - right.top)
      .map((section, index, values) => {
        // The live footer is emitted as two neighbouring Tilda records (body
        // and brand/social row). Treat the latter as the first footer's visual
        // continuation instead of falsely matching it to a new Astro section.
        if (section.role === 'footer'
          && values.slice(0, index).some((previous) => previous.role === 'footer')) {
          return { ...section, index, role: 'footer_continuation' };
        }
        return { ...section, index };
      });
    const textBlocks = [...document.querySelectorAll('h1,h2,h3,p,li,a,button,label,figcaption')]
      .filter(visible)
      .filter((element) => !element.closest('style,script,noscript,template'))
      .filter((element) => !element.closest('header, .mega, .mmenu, .t-menusub, .t450__menu'))
      .filter((element) => !widgetFor(element))
      .map(textFor)
      .filter((text) => text.length >= 3)
      .filter((text) => !/[{};]/u.test(text) && !/^#(?:rec|allrecords)/u.test(text))
      .filter((text, index, values) => values.indexOf(text) === index);
    const images = [...document.images]
      .filter((image) => visible(image) && image.getBoundingClientRect().width >= 120 && image.getBoundingClientRect().height >= 80)
      .filter((image) => !widgetFor(image))
      .map((image) => imageKeyFor(image.currentSrc || image.src))
      .filter(Boolean);
    const brokenLinks = [...document.querySelectorAll('a[href]')].flatMap((anchor) => {
      const href = anchor.getAttribute('href') || '';
      if (!href || href.startsWith('#') || /^(?:mailto:|tel:|https?:\/\/)/iu.test(href)) return [];
      const [path, hash] = href.split('#');
      const normalisedPath = path ? `${path.replace(/\/+$/u, '') || ''}/`.replace(/^([^/])/u, '/$1') : location.pathname;
      const routeExists = routes.includes(normalisedPath === '//' ? '/' : normalisedPath);
      const currentPath = location.pathname.endsWith('/') ? location.pathname : `${location.pathname}/`;
      const sameDocument = !path || normalisedPath === currentPath;
      const targetExists = !hash || !sameDocument || Boolean(document.getElementById(hash));
      return routeExists && targetExists ? [] : [`${href}`];
    });
    const imageDimensionFailures = [...document.images]
      .filter((image) => visible(image) && !widgetFor(image) && (!image.hasAttribute('width') || !image.hasAttribute('height')))
      .map((image) => image.currentSrc || image.src);
    const firstScreenLazy = [...document.images]
      .filter((image) => {
        const rect = image.getBoundingClientRect();
        const intersectsViewport = rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0;
        return visible(image)
          && intersectsViewport
          && !widgetFor(image)
          && !image.closest('[aria-hidden="true"]')
          && image.loading === 'lazy'
          && (!image.complete || !image.currentSrc);
      })
      .map((image) => image.currentSrc || image.src);
    return {
      dimensions: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      metricMasks: [...new Set([...document.querySelectorAll('[data-parity-widget-mask]')]
        .map((element) => element.getAttribute('data-parity-widget-mask'))
        .filter(Boolean))].sort(),
      seo: { title: document.title, description: meta('description'), h1: document.querySelector('h1')?.textContent?.replace(/\s+/gu, ' ').trim() ?? '' },
      headings: [...document.querySelectorAll('h1,h2,h3')].filter(visible).map((element) => `${element.tagName.toLowerCase()}:${normalise(element.textContent)}`),
      sections,
      textBlocks,
      images: [...new Set(images)],
      brokenLinks: [...new Set(brokenLinks)],
      imageDimensionFailures,
      firstScreenLazy,
    };
  }, { kind, knownRoutes });
  if (kind !== 'original') return inspection;
  return {
    ...inspection,
    sections: inspection.sections.map((section, index) => (
      index === 0 && !section.role && sourceHeaderSpacer(section)
        ? { ...section, role: 'header' }
        : section
    )),
  };
}

async function captureOne(browser, { url, kind, viewport, knownRoutes, path }) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
    reducedMotion: 'reduce',
    colorScheme: 'light',
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  const externalRequests = new Set();
  if (kind === 'clone') {
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('requestfailed', (request) => failedRequests.push(request.url()));
    page.on('request', (request) => {
      try {
        const target = new URL(request.url());
        if (target.hostname !== '127.0.0.1' && target.hostname !== 'localhost') externalRequests.add(target.hostname);
      } catch {
        // Data URLs never leave the local page.
      }
    });
  }
  try {
    let navigationError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        navigationError = null;
        break;
      } catch (error) {
        navigationError = error;
        if (attempt < 3) await sleep(attempt * 1_000);
      }
    }
    if (navigationError) throw navigationError;
    await settlePage(page, kind);
    const inspection = await inspectPage(page, kind, knownRoutes);
    const sectionShots = {};
    for (const section of inspection.sections) {
      // A fixed header is compared once as its own section. Hide it while
      // rasterising content records so Playwright's scroll-into-view position
      // cannot contaminate arbitrary sections with a floating overlay.
      await page.evaluate((hideHeader) => {
        document.documentElement.toggleAttribute('data-parity-section-content', hideHeader);
      }, section.role !== 'header');
      let element = await page.locator(`[data-parity-capture-id="${section.capture_id}"]`)
        .elementHandle({ timeout: 1_500 })
        .catch(() => null);
      // Live Tilda callbacks can replace a record after inspection and thereby
      // discard the temporary capture attribute. Its stable record id remains,
      // so reacquire that node before treating the supplementary crop as lost.
      if (!element && /^rec\d+$/u.test(section.id)) {
        element = await page.locator(`#${section.id}`).elementHandle({ timeout: 1_500 }).catch(() => null);
      }
      if (!element) continue;
      try {
        const buffer = await element.screenshot({
          type: 'jpeg', quality: 64, animations: 'disabled', scale: 'css', timeout: SECTION_SCREENSHOT_TIMEOUT_MS,
        });
        sectionShots[section.capture_id] = await compactSectionScreenshot(buffer);
      } catch {
        sectionShots[section.capture_id] = null;
      } finally {
        await element.dispose();
      }
    }
    await page.evaluate(() => {
      document.documentElement.removeAttribute('data-parity-section-content');
      window.scrollTo(0, 0);
    });
    const screenshotPath = await pageScreenshot(page, path);
    return {
      inspection,
      sectionShots,
      consoleErrors: [...new Set(consoleErrors)],
      failedRequests: [...new Set(failedRequests)],
      externalRequests: [...externalRequests].sort(),
      screenshotPath,
    };
  } finally {
    await context.close();
  }
}

function sourceForRoute(inventory, route) {
  const match = inventory.records.find((record) => record.clone_path === route && Number(record.http_orig) === 200);
  return match?.url ?? `${ORIGIN}${withoutTrailingSlash(route) || '/'}`;
}

function redirectTarget(inventory, route) {
  const row = inventory.matrix.find((item) => item.route_clone === route && item.verdict === 'redirect_ok');
  return row?.redirect_to ?? '';
}

async function compareCaptures(original, clone) {
  const pairs = sectionPairs(original.inspection.sections, clone.inspection.sections);
  const similarities = [];
  const sections = [];
  const cloneText = new Set(clone.inspection.textBlocks);
  const cloneCorpus = tokenSet([...clone.inspection.textBlocks, ...clone.inspection.headings].join(' '));
  const matchedCloneIndexes = new Set();
  for (const pair of pairs) {
    const sourceRecords = pair.originalIndexes
      .map((index) => original.inspection.sections[index])
      .filter(Boolean);
    const source = pair.macro ? combinedSourceSection(sourceRecords) : sourceRecords[0];
    const target = pair.cloneIndex >= 0 ? clone.inspection.sections[pair.cloneIndex] : null;
    if (target) matchedCloneIndexes.add(pair.cloneIndex);
    let px = null;
    const originalScreenshot = pair.macro
      ? await fullMacroScreenshot(original, sourceRecords)
      : original.sectionShots[source?.capture_id];
    const cloneScreenshot = target && pair.macro
      ? await fullMacroScreenshot(clone, [target])
      : clone.sectionShots[target?.capture_id];
    if (target && originalScreenshot && cloneScreenshot) {
      px = await visualSimilarity(originalScreenshot, cloneScreenshot);
      if (px !== null) similarities.push(px);
    }
    sections.push({
      original: source,
      original_records: pair.macro ? sourceRecords : undefined,
      clone: target,
      score: Number(pair.score.toFixed(3)),
      evidence: pair.evidence,
      order_ok: pair.orderOk,
      macro: pair.macro,
      px,
      height_delta: target ? Number((Math.abs(source.height - target.height) / Math.max(1, source.height) * 100).toFixed(2)) : null,
    });
  }
  const cloneAnchors = clone.inspection.sections.filter(semanticAnchor);
  const missingTexts = original.inspection.textBlocks.filter((text) => {
    if (cloneText.has(text)) return false;
    const tokens = tokenSet(text);
    return tokens.size >= 2 && textCoverage(tokens, cloneCorpus) < 0.7;
  });
  const imageComparison = imageParity(original.inspection.images, clone.inspection.images);
  const maskedWidgets = [...new Set([
    ...(original.inspection.metricMasks ?? []),
    ...(clone.inspection.metricMasks ?? []),
  ].filter((widget) => WIDGET_KINDS.has(widget)))].sort();
  // Widget nodes are removed from the controlled capture DOM before inspect,
  // so these document heights already measure only the in-scope page content.
  const originalHeight = original.inspection.dimensions.height;
  const cloneHeight = clone.inspection.dimensions.height;
  return {
    sections,
    missingSections: sections
      .filter((section) => {
        if (section.clone) return false;
        const signature = section.original.heading || section.original.text;
        const tokens = tokenSet(signature);
        return tokens.size >= 2 && textCoverage(tokens, cloneCorpus) < 0.7;
      })
      .map((section) => section.original.heading || section.original.id),
    extraSections: cloneAnchors
      .filter((section) => !matchedCloneIndexes.has(section.index))
      .map((section) => section.heading || section.id),
    missingTexts,
    missingImages: imageComparison.missingImages,
    unmappedImages: imageComparison.unmappedImages,
    maskedWidgets,
    medianPx: median(similarities),
    pageHeightDelta: Number((Math.abs(originalHeight - cloneHeight) / Math.max(1, originalHeight) * 100).toFixed(2)),
    // Missing/extra semantic sections have dedicated hard gates above. A
    // decorative source record with no counterpart has no meaningful height
    // ratio and must not manufacture a 100% section-height failure.
    maxSectionHeightDelta: maxPairedSectionHeightDelta(sections),
  };
}

function visualVerdict({ route, scope, desktop, mobile, clone }) {
  if (scope === 'redirect') return 'redirect_ok';
  if (scope === 'extra_clone') return 'extra_clone';
  const blockers = [
    desktop.missingSections.length,
    mobile.missingSections.length,
    desktop.extraSections.length,
    mobile.extraSections.length,
    desktop.missingTexts.length,
    mobile.missingTexts.length,
    desktop.missingImages.length,
    mobile.missingImages.length,
    desktop.pageHeightDelta > 10,
    mobile.pageHeightDelta > 10,
    desktop.maxSectionHeightDelta > 15,
    mobile.maxSectionHeightDelta > 15,
    desktop.medianPx !== null && desktop.medianPx < 90,
    mobile.medianPx !== null && mobile.medianPx < 88,
    clone.mobile.inspection.dimensions.width > 390,
    clone.desktop.consoleErrors.length,
    clone.mobile.consoleErrors.length,
    clone.desktop.failedRequests.length,
    clone.mobile.failedRequests.length,
    clone.desktop.externalRequests.length,
    clone.mobile.externalRequests.length,
    clone.desktop.inspection.brokenLinks.length,
    clone.mobile.inspection.brokenLinks.length,
    clone.desktop.inspection.imageDimensionFailures.length,
    clone.mobile.inspection.imageDimensionFailures.length,
    clone.desktop.inspection.firstScreenLazy.length,
    clone.mobile.inspection.firstScreenLazy.length,
    !sameSeo(clone.desktop.inspection, clone.originalDesktop.inspection),
    !sameHeadings(clone.desktop.inspection, clone.originalDesktop.inspection),
  ];
  return blockers.some(Boolean) ? 'needs_fix' : 'pass';
}

async function main() {
  const { chromium } = await import('playwright');
  await mkdir(SHOTS_DIR, { recursive: true });
  const inventory = JSON.parse(await readFile(join(PARITY_DIR, 'live-inventory.json'), 'utf8'));
  const allRoutes = [...new Set([
    ...(inventory.clone_route_paths ?? []),
    ...inventory.matrix.map((row) => row.route_clone).filter(Boolean),
  ])]
    .filter((route) => route !== '/404/')
    .sort((left, right) => left.localeCompare(right));
  const requestedRoutes = (process.env.PARITY_ROUTES ?? '').split(',').map((route) => route.trim()).filter(Boolean);
  const routes = requestedRoutes.length ? allRoutes.filter((route) => requestedRoutes.includes(route)) : allRoutes;
  if (requestedRoutes.length && routes.length !== requestedRoutes.length) {
    throw new Error(`Unknown parity route requested: ${requestedRoutes.filter((route) => !routes.includes(route)).join(', ')}`);
  }
  // A local link to a legacy route is valid when the generated redirect map
  // owns that route.  Static http.server cannot execute `_redirects`, so keep
  // those paths in link existence checks; redirect-target-contract.mjs
  // separately verifies the actual target mapping.
  const knownRoutes = allRoutes;
  const browser = await chromium.launch({ executablePath: BROWSER, args: ['--no-sandbox', '--disable-gpu'] });
  const detail = { generated_at: new Date().toISOString(), round: ROUND, routes: {} };
  const matrix = [];
  try {
    for (const route of routes) {
      const redirect = redirectTarget(inventory, route);
      const matrixEntry = inventory.matrix.find((row) => row.route_clone === route);
      const scope = redirect ? 'redirect' : (matrixEntry?.verdict === 'extra_clone' ? 'extra_clone' : 'page');
      const comparedRoute = redirect || route;
      const slug = routeSlug(route);
      const captures = { desktop: {}, mobile: {} };
      for (const viewport of VIEWPORTS) {
        const originalUrl = sourceForRoute(inventory, comparedRoute);
        const cloneUrl = `${LOCAL}${comparedRoute}`;
        const suffix = `${slug}--r${ROUND}--${viewport.name}`;
        const originalPath = join(SHOTS_DIR, `${suffix}--original.webp`);
        const clonePath = join(SHOTS_DIR, `${suffix}--clone.webp`);
        const original = await captureOne(browser, { url: originalUrl, kind: 'original', viewport, knownRoutes, path: originalPath });
        const clone = await captureOne(browser, { url: cloneUrl, kind: 'clone', viewport, knownRoutes, path: clonePath });
        const compared = await compareCaptures(original, clone);
        captures[viewport.mobile ? 'mobile' : 'desktop'] = { original, clone, compared, original_url: originalUrl, clone_url: cloneUrl };
      }
      const desktop = captures.desktop.compared;
      const mobile = captures.mobile.compared;
      const clone = {
        desktop: captures.desktop.clone,
        mobile: captures.mobile.clone,
        originalDesktop: captures.desktop.original,
      };
      const verdict = visualVerdict({ route, scope, desktop, mobile, clone });
      const consoleErrors = clone.desktop.consoleErrors.length + clone.mobile.consoleErrors.length;
      const externalRequests = clone.desktop.externalRequests.length + clone.mobile.externalRequests.length;
      const failedRequests = clone.desktop.failedRequests.length + clone.mobile.failedRequests.length;
      const imageDimensions = clone.desktop.inspection.imageDimensionFailures.length + clone.mobile.inspection.imageDimensionFailures.length;
      const firstScreenLazy = clone.desktop.inspection.firstScreenLazy.length + clone.mobile.inspection.firstScreenLazy.length;
      const metricMasks = [...new Set([...desktop.maskedWidgets, ...mobile.maskedWidgets])];
      const unmappedImages = [...new Set([...desktop.unmappedImages, ...mobile.unmappedImages])];
      const sectionDiagnostics = [
        ...desktop.missingSections,
        ...mobile.missingSections,
        ...desktop.extraSections.map((section) => `extra:${section}`),
        ...mobile.extraSections.map((section) => `extra:${section}`),
      ];
      const diagnosticNotes = [
        scope === 'redirect' ? `visual target ${redirect}` : '',
        scope === 'extra_clone' ? 'Astro-only additional route; live source captured for evidence.' : '',
        metricMasks.length ? `metric masks: ${metricMasks.join(', ')}` : '',
        unmappedImages.length ? `unmapped source asset ids (not missing proof): ${shortList(unmappedImages, 3)}` : '',
      ].filter(Boolean).join('; ');
      matrix.push({
        url: route,
        sections_orig: `${captures.desktop.original.inspection.sections.length}/${captures.mobile.original.inspection.sections.length}`,
        sections_clone: `${captures.desktop.clone.inspection.sections.length}/${captures.mobile.clone.inspection.sections.length}`,
        missing_sections: shortList(sectionDiagnostics),
        missing_texts: shortList([...desktop.missingTexts, ...mobile.missingTexts]),
        missing_images: shortList([...desktop.missingImages, ...mobile.missingImages]),
        px_1440: desktop.medianPx ?? 'n/a',
        px_390: mobile.medianPx ?? 'n/a',
        h_orig_1440: captures.desktop.original.inspection.dimensions.height,
        h_clone_1440: captures.desktop.clone.inspection.dimensions.height,
        h_orig_390: captures.mobile.original.inspection.dimensions.height,
        h_clone_390: captures.mobile.clone.inspection.dimensions.height,
        overflow_390: Math.max(0, captures.mobile.clone.inspection.dimensions.width - 390),
        console_errors: consoleErrors,
        external_requests: externalRequests,
        failed_requests: failedRequests,
        verdict,
        fixed: '',
        broken_links: shortList([...clone.desktop.inspection.brokenLinks, ...clone.mobile.inspection.brokenLinks]),
        missing_img_dimensions: imageDimensions,
        first_screen_lazy: firstScreenLazy,
        seo_match: sameSeo(captures.desktop.original.inspection, captures.desktop.clone.inspection) ? 'true' : 'false',
        headings_match: sameHeadings(captures.desktop.original.inspection, captures.desktop.clone.inspection) ? 'true' : 'false',
        height_delta_1440: desktop.pageHeightDelta,
        height_delta_390: mobile.pageHeightDelta,
        visual_scope: scope,
        round: ROUND,
        notes: diagnosticNotes,
      });
      detail.routes[route] = {
        desktop: {
          original: detailCapture(captures.desktop.original),
          clone: detailCapture(captures.desktop.clone),
          compared: captures.desktop.compared,
          original_url: captures.desktop.original_url,
          clone_url: captures.desktop.clone_url,
        },
        mobile: {
          original: detailCapture(captures.mobile.original),
          clone: detailCapture(captures.mobile.clone),
          compared: captures.mobile.compared,
          original_url: captures.mobile.original_url,
          clone_url: captures.mobile.clone_url,
        },
      };
      console.log(`${route} ${verdict} (${matrix.length}/${routes.length})`);
    }
  } finally {
    await browser.close();
  }
  await mkdir(ROUND_DIR, { recursive: true });
  await Promise.all([
    writeFile(join(ROUND_DIR, 'visual-detail.json'), `${JSON.stringify(detail, null, 2)}\n`),
    writeFile(MATRIX_PATH, csv(CSV_HEADERS, matrix)),
  ]);
  const summary = matrix.reduce((counts, row) => ({ ...counts, [row.verdict]: (counts[row.verdict] ?? 0) + 1 }), {});
  console.log(JSON.stringify({ routes: routes.length, ...summary, output: MATRIX_PATH }, null, 2));
  if ((summary.needs_fix ?? 0) > 0) process.exitCode = 2;
}

if (process.argv[1] === new URL(import.meta.url).pathname) await main();

export {
  canonicalPromoState,
  decodedPromoImageReady,
  imageKey,
  imageParity,
  inspectPage,
  maxPairedSectionHeightDelta,
  normaliseText,
  promoBackgroundReady,
  sectionPairs,
  sourceHeaderSpacer,
  visualSimilarity,
};
