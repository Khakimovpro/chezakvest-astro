import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import registry from '../src/data/video-hls.json' with { type: 'json' };

const ROOT = new URL('..', import.meta.url).pathname;

test('HLS registry has a complete, unique local delivery contract', async () => {
  const sources = new Set();
  await Promise.all(Object.entries(registry.videos).map(async ([slug, video]) => {
    assert.match(slug, /^(?:[a-z0-9_-]+)-(?:trailer|party-\d+|review-\d+)$/u);
    assert.ok(Number.isInteger(video.durationSec) && video.durationSec > 0, `${slug}: durationSec`);
    assert.ok(Number.isInteger(video.width) && video.width > 0, `${slug}: width`);
    assert.ok(Number.isInteger(video.height) && video.height > 0, `${slug}: height`);
    assert.match(video.poster, new RegExp(`^/assets/video-posters/${slug.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\.webp$`, 'u'));
    await access(join(ROOT, 'public', video.poster));
    const source = video.source.file || `rutube:${video.source.rutubeId || ''}`;
    assert.ok(source && !sources.has(source), `${slug}: duplicate source ${source}`);
    sources.add(source);
  }));
});

test('HlsVideo derives its player source from the registry base', async () => {
  const component = await readFile(join(ROOT, 'src/components/HlsVideo.astro'), 'utf8');
  assert.match(component, /const hlsSrc = `\$\{registry\.base\}\/\$\{slug\}\/master\.m3u8`/u);
  assert.match(component, /data-hls-src=\{hlsSrc\}/u);
  assert.match(component, /<video playsinline preload="none"/u);
});
