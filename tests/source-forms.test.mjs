import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidSourceName } from '../src/scripts/source-forms.js';

test('source booking requires a real name rather than a single letter', () => {
  assert.equal(isValidSourceName('А'), false);
  assert.equal(isValidSourceName('Анна'), true);
  assert.equal(isValidSourceName('Анна-Мария'), true);
  assert.equal(isValidSourceName('Анна2'), false);
});
