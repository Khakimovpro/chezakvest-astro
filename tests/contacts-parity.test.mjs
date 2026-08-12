import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('keeps the measured contact-page record order without clone-only conversion blocks', async () => {
  const [layout, styles, contacts] = await Promise.all([
    read('src/layouts/InfoPage.astro'),
    read('src/styles/quest.css'),
    JSON.parse(await read('src/data/pages/contacts.json')),
  ]);

  assert.doesNotMatch(layout, /CallbackForm/);
  assert.doesNotMatch(layout, /VenuesSection/);
  assert.match(layout, /class="info__messenger"/);
  assert.match(layout, /Написать в мессенджер/u);
  assert.match(layout, /page\.note/);
  assert.match(layout, /site\.header\.phone/);
  assert.match(styles, /\.info--source/);
  assert.equal(contacts.contacts.items.at(-1).value, 'Написать в мессенджер 💬');
  assert.ok(contacts.note.includes('Instagram'));
});
