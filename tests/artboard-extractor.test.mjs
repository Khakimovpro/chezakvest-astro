import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('artboard extractor keeps all inherited states and sanitizes inline atoms', () => {
  const directory = mkdtempSync(join(tmpdir(), 'chezakvest-artboard-'));
  const source = join(directory, 'source.html');
  writeFileSync(source, `
    <div id="rec42" class="r" data-record-type="396">
      <div class="t396"><div class="t396__artboard" data-artboard-height="800"
        data-artboard-height-res-960="700" data-artboard-height-res-640="600"
        data-artboard-height-res-480="500" data-artboard-height-res-320="400">
        <div class="tn-elem" data-elem-id="hero" data-elem-type="text"
          data-field-top-value="10" data-field-left-value="20" data-field-width-value="300"
          data-field-top-res-960-value="30" data-field-width-res-640-value="250"
          data-field-left-res-480-value="5" data-field-top-res-320-value="50">
          <div class="tn-atom"><strong style="color:#ec406b;position:fixed">Детский праздник</strong><br>
            <span onclick="alert(1)" style="color:rgb(114, 175, 176)">в Ростове</span>
            <script>alert(1)</script><a href="javascript:alert(1)">опасная ссылка</a></div>
        </div>
      </div></div>
    </div>
  `);

  const output = execFileSync('python3', ['_capture/extract_artboard_states.py', source], { encoding: 'utf8' });
  const payload = JSON.parse(output);
  assert.deepEqual(payload.records[0].heights, { 1200: 800, 960: 700, 640: 600, 480: 500, 320: 400 });
  assert.deepEqual(payload.records[0].elements[0].states['640'], { top: 30, left: 20, width: 250, height: null });
  assert.deepEqual(payload.records[0].elements[0].states['320'], { top: 50, left: 5, width: 250, height: null });
  assert.equal(payload.records[0].elements[0].html,
    '<strong style="color:#ec406b">Детский праздник</strong><br>\n<span style="color:rgb(114, 175, 176)">в Ростове</span>\nопасная ссылка');
});
