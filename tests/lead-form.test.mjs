import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSubmissionGuard,
  createWhatsAppUrl,
  getMoscowDate,
  getPhoneDigits,
  sendLead,
} from '../src/scripts/lead-form.js';

test('keeps an accepted blank-recipient request from opening duplicate WhatsApp drafts until a field changes', () => {
  const guard = createSubmissionGuard();

  assert.equal(guard.begin(), true, 'the first valid request may start');
  assert.equal(guard.begin(), false, 'an in-flight request cannot start again');
  guard.accept();
  assert.equal(guard.begin(), false, 'an accepted request stays latched after a fast local completion');
  guard.reset();
  assert.equal(guard.begin(), true, 'editing a field permits a deliberate revised request');
  guard.fail();
  assert.equal(guard.begin(), true, 'a failed delivery remains retryable');
});

test('normalises Russian phone input before lead delivery', () => {
  assert.equal(getPhoneDigits('8 (928) 216-36-23'), '79282163623');
  assert.equal(getPhoneDigits('+7 928 216 36 23'), '79282163623');
  assert.equal(getPhoneDigits('928 216 36 23'), '79282163623');
  assert.equal(getPhoneDigits('123'), '');
});

test('uses Rostov local date as the minimum booking date', () => {
  assert.equal(getMoscowDate(new Date('2026-08-09T20:59:59.000Z')), '2026-08-09');
  assert.equal(getMoscowDate(new Date('2026-08-09T21:00:00.000Z')), '2026-08-10');
});

test('does not make a delivery request while the configured recipient is blank', async () => {
  let requests = 0;
  const delivered = await sendLead('', { name: 'Аня' }, async () => {
    requests += 1;
    return { ok: true };
  });

  assert.equal(delivered, false);
  assert.equal(requests, 0);
});

test('posts a single JSON lead to a configured recipient', async () => {
  let request;
  const delivered = await sendLead('https://example.test/leads', { name: 'Аня', phone: '+7 (928) 216-36-23' }, async (url, options) => {
    request = { url, options };
    return { ok: true };
  });

  assert.equal(delivered, true);
  assert.equal(request.url, 'https://example.test/leads');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(request.options.body), { name: 'Аня', phone: '+7 (928) 216-36-23' });
  assert.equal(request.options.credentials, 'omit');
});

test('creates a safe WhatsApp draft URL only for a valid recipient', () => {
  assert.match(createWhatsAppUrl('https://wa.me/79282163623', 'Заявка'), /^https:\/\/wa\.me\/79282163623\?text=/);
  assert.equal(createWhatsAppUrl('not-a-number', 'Заявка'), '');
});
