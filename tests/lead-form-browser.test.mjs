import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { chromium } from 'playwright';

const leadFormScript = await readFile(new URL('../src/scripts/lead-form.js', import.meta.url), 'utf8');

async function createLeadFixture(t) {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  t.after(async () => browser.close());
  const page = await browser.newPage();
  await page.setContent(`
    <form data-lead-form data-lead-kind="booking" data-lead-target="https://wa.me/79282163623" data-lead-recipient="" aria-describedby="status">
      <label for="name">Имя<input id="name" name="name" minlength="2" maxlength="80" required></label>
      <label for="phone">Телефон<input id="phone" name="phone" type="tel" required></label>
      <label><input name="consent" type="checkbox" required>Согласие</label>
      <button type="button" data-lead-submit>Отправить заявку</button>
      <p id="status" data-lead-status hidden></p>
    </form>
  `);
  await page.evaluate(() => {
    window.__leadDrafts = [];
    window.open = (...args) => {
      window.__leadDrafts.push(args);
      return null;
    };
  });
  await page.addScriptTag({ content: leadFormScript, type: 'module' });
  await page.waitForFunction(() => document.querySelector('form')?.dataset.leadReady === 'true');
  return page;
}

test('lead handler blocks an invalid name or missing consent before opening a WhatsApp draft', async (t) => {
  const page = await createLeadFixture(t);
  await page.locator('#name').fill('Анна2');
  await page.locator('#phone').fill('928 216 36 23');
  await page.locator('input[name="consent"]').check();
  await page.locator('[data-lead-submit]').click();

  assert.equal(await page.evaluate(() => window.__leadDrafts.length), 0);
  assert.equal(await page.locator('#name').getAttribute('aria-invalid'), 'true');

  await page.locator('#name').fill('Анна');
  await page.locator('input[name="consent"]').uncheck();
  await page.locator('[data-lead-submit]').click();

  assert.equal(await page.evaluate(() => window.__leadDrafts.length), 0);
  assert.match(await page.locator('#status').textContent(), /Проверьте поле/u);
});

test('lead handler opens one draft only after valid fields and consent', async (t) => {
  const page = await createLeadFixture(t);
  await page.locator('#name').fill('Анна');
  await page.locator('#phone').fill('928 216 36 23');
  await page.locator('input[name="consent"]').check();
  await page.locator('[data-lead-submit]').click();
  await page.waitForFunction(() => window.__leadDrafts.length === 1);

  const draft = await page.evaluate(() => window.__leadDrafts[0][0]);
  assert.match(draft, /^https:\/\/wa\.me\/79282163623\?text=/u);
});
