import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const calls = [];
page.on('request', (r) => { if (/myreviews/.test(r.url())) calls.push(`${r.method()} ${r.url().slice(0, 200)}`); });
page.on('response', async (r) => {
  if (/myreviews/.test(r.url()) && /json/.test(r.headers()['content-type'] || '')) {
    try {
      const body = await r.text();
      calls.push(`   ↳ JSON ${r.status()} (${body.length} байт): ${body.slice(0, 200)}`);
    } catch {}
  }
});
await page.goto('https://xn--80aehcht5ci1b.xn--p1ai/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(6000);
await page.evaluate(() => window.scrollTo(0, 6000));
await page.waitForTimeout(8000);
console.log(calls.join('\n') || 'запросов не было');
await browser.close();
