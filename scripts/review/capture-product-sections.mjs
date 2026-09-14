import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(new URL('../../package.json', import.meta.url));
export const { chromium } = require('playwright');
export const slugs = ['igra_v_kalmara', 'kids'];
export const widths = (process.env.REVIEW_WIDTHS || '390,1440').split(',').map(Number);
export const sectionSelector = 'main section';
export const round = n => Math.round(n * 100) / 100;
export async function openPage(browser, baseURL, slug, width) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: width === 390 ? 2 : 1, isMobile: width === 390, hasTouch: width === 390, ...(width === 390 ? { userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' } : {}) });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(`${baseURL.replace(/\/$/, '')}/${slug}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts.ready);
  // Scroll through the actual DOM to trigger lazy images and the external calendar.
  for (const section of await page.locator(sectionSelector).all()) {
    if (!(await section.isVisible())) continue;
    await section.scrollIntoViewIfNeeded();
    for (const img of await section.locator('img').all()) {
      if (!(await img.isVisible())) continue;
      await img.scrollIntoViewIfNeeded();
      await img.evaluate(async el => {
        if (!el.complete) await Promise.race([new Promise(resolve => { el.addEventListener('load', resolve, { once: true }); el.addEventListener('error', resolve, { once: true }); }), new Promise(resolve => setTimeout(resolve, 8000))]);
        if (el.complete && el.naturalWidth) await el.decode().catch(() => {});
      });
    }
    await page.waitForTimeout(100);
  }
  if (await page.locator('[data-source-schedule]').count()) {
    await page.waitForFunction(() => document.querySelector('[data-source-schedule] .quest_line') || document.querySelector('[data-product-booking-fallback]:not([hidden])'), { }, { timeout: 15000 }).catch(() => {});
  }
  await page.evaluate(() => { for (const el of document.querySelectorAll('*')) if (el.scrollLeft) el.scrollLeft = 0; scrollTo(0, 0); });
  await page.waitForTimeout(350);
  return { page, context };
}
export async function inventory(page, slug, width) {
  return await page.locator(sectionSelector).evaluateAll((sections, { slug, width }) => sections.map((el, index) => ({ index, id: el.id || null, className: el.className, heading: el.querySelector('h1,h2,h3')?.textContent.trim() || '', visible: !!el.getClientRects().length, file: `${slug}-${width}-${String(index + 1).padStart(2, '0')}-${(el.id || el.classList[0] || 'section').replace(/[^a-zA-Z0-9_-]/g, '-')}.png` })).filter(s => s.visible), { slug, width });
}
export async function capture(baseURL, output) {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const manifest = { generatedAt: new Date().toISOString(), baseURL, note: 'Section screenshots use CSS pixels; mobile browser DSF=2. Light-DOM fixed/sticky elements hidden only in section captures; external shadow widgets may remain; viewport screenshots preserve them. No calendar mocks.', pages: [] };
  try {
    for (const slug of slugs) for (const width of widths) {
      const { page, context } = await openPage(browser, baseURL, slug, width);
      const sections = await inventory(page, slug, width);
      await page.screenshot({ path: join(output, `${slug}-${width}-00-first-screen.png`), scale: 'css' });
      await page.evaluate(() => { for (const el of document.querySelectorAll('body *')) if (['fixed', 'sticky'].includes(getComputedStyle(el).position)) el.setAttribute('data-review-floating', ''); });
      const captureStyle = await page.addStyleTag({ content: '[data-review-floating], [data-review-floating] * { visibility: hidden !important; }' });
      for (const section of sections) {
        await page.locator(sectionSelector).nth(section.index).screenshot({ path: join(output, section.file), scale: 'css', animations: 'disabled', style: '[data-review-floating], [data-review-floating] * { visibility: hidden !important; }' });
      }
      await page.locator('footer.ft').screenshot({ path: join(output, `${slug}-${width}-99-footer.png`), scale: 'css', style: '[data-review-floating], [data-review-floating] * { visibility: hidden !important; }' });
      await captureStyle.evaluate(el => el.remove());
      const health = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight, brokenImages: [...document.querySelectorAll('main img')].filter(el => el.getClientRects().length && !el.naturalWidth).map(el => el.currentSrc), scheduleDays: [...document.querySelectorAll('[data-source-schedule] .quest_line')].filter(el => el.getClientRects().length).length, fallbackVisible: !!document.querySelector('[data-product-booking-fallback]:not([hidden])') }));
      manifest.pages.push({ slug, width, sections, ...health });
      console.log(`${slug} ${width}: ${sections.length} sections; ${health.scheduleDays} schedule days; ${health.brokenImages.length} broken images`);
      await context.close();
    }
    await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
  } finally { await browser.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: node snyat-sekcii.mjs <baseURL> <output-directory>; REVIEW_WIDTHS=390,768,1440 optional');
  await capture(process.argv[2], resolve(process.argv[3]));
}
