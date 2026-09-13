#!/usr/bin/env node
import registry from '../../src/data/video-hls.json' with { type: 'json' };

const slugs = process.argv.slice(2);
if (slugs.length === 0) throw new Error('usage: scripts/video/proverit.mjs <slug...>');
const origin = process.env.HLS_ORIGIN || 'http://82.146.60.212';
for (const slug of slugs) {
  if (!registry.videos[slug]) throw new Error(`unknown video: ${slug}`);
  const masterUrl = `${registry.base}/${slug}/master.m3u8`;
  const master = await fetch(masterUrl, { method: 'HEAD', headers: { Origin: origin } });
  if (!master.ok || !/application\/vnd\.apple\.mpegurl/i.test(master.headers.get('content-type') || '') || !master.headers.get('access-control-allow-origin')) throw new Error(`master check failed: ${slug}`);
  const list = await (await fetch(masterUrl, { headers: { Origin: origin } })).text();
  const rendition = list.split(/\r?\n/u).find((line) => line.endsWith('.m3u8'));
  const playlistUrl = new URL(rendition, masterUrl);
  const playlist = await (await fetch(playlistUrl, { headers: { Origin: origin } })).text();
  const segment = playlist.split(/\r?\n/u).find((line) => line.endsWith('.ts'));
  const response = await fetch(new URL(segment, playlistUrl), { method: 'HEAD', headers: { Origin: origin } });
  if (!response.ok || !/video\/mp2t/i.test(response.headers.get('content-type') || '') || !response.headers.get('access-control-allow-origin')) throw new Error(`segment check failed: ${slug}`);
  console.log(`${slug}: OK`);
}
