import assert from 'node:assert/strict';
import test from 'node:test';

import { gapRows, masksFromNotes } from '../scripts/parity-known-gaps.mjs';

test('emits only bounded documented widget replacements from actual metric masks', () => {
  assert.deepEqual(masksFromNotes('metric masks: reviews, map; other note'), ['map', 'reviews']);
  assert.deepEqual(gapRows([
    { url: '/', visual_scope: 'page', notes: 'metric masks: booking, map' },
    { url: '/legacy/', visual_scope: 'redirect', notes: 'metric masks: map' },
  ]).map((row) => [row.url, row.section]), [
    ['/', 'Tilda booking / lead widget (controlled capture)'],
    ['/', 'Tilda map (controlled capture)'],
  ]);
});
