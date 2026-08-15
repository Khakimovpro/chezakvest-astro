import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeInlineHtml } from '../src/lib/safe-inline-html.js';

test('safe inline HTML preserves source typography and strips executable markup', () => {
  assert.equal(
    sanitizeInlineHtml('<strong style="color:#ec406b;position:fixed">Детские праздники</strong><br>и <span style="color:rgb(114, 175, 176)" onclick="x">дни рождения</span><script>x</script>'),
    '<strong style="color:#ec406b">Детские праздники</strong><br>и <span style="color:rgb(114, 175, 176)">дни рождения</span>',
  );
});

test('safe inline HTML restricts links and escapes plain text', () => {
  assert.equal(sanitizeInlineHtml('5 < 7 & <a href="javascript:alert(1)">опасно</a>'), '5 &lt; 7 &amp; опасно');
  assert.equal(
    sanitizeInlineHtml('<a href="/privacy" target="_blank" onclick="x">Политика</a>'),
    '<a href="/privacy" target="_blank" rel="noopener noreferrer">Политика</a>',
  );
});
