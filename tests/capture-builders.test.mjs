import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const builders = [
  '_capture/build_quest.py',
  '_capture/build_venue.py',
  '_capture/build_holiday.py',
  '_capture/build_misc.py',
];

test('capture normalizer restores a Tilda source before its delivery transforms', () => {
  const output = execFileSync('python3', ['-c', [
    'import sys',
    "sys.path.insert(0, '_capture')",
    'from build_quest import original_image_url',
    "print(original_image_url('https://static.tildacdn.com/a/photo.jpg/-/resizeb/20x/-/format/webp/'))",
    "print(original_image_url('https://optim.tildacdn.com/tild123/-/cover/20x20/center/center/-/format/webp/photo.png.webp'))",
    "print(original_image_url('https://static.tildacdn.com/tild456/-/resize/20x//photo.jpg'))",
  ].join('; ')], { encoding: 'utf8' }).trim();

  assert.deepEqual(output.split('\n'), [
    'https://static.tildacdn.com/a/photo.jpg',
    'https://static.tildacdn.com/tild123/photo.png',
    'https://static.tildacdn.com/tild456/photo.jpg',
  ]);
});

test('capture builders do not truncate extracted photo collections', () => {
  for (const path of builders) {
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /["']photos["']\s*:\s*[^\n]*\[:\d+\]/u, path);
  }
});
