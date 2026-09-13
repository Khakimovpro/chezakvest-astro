#!/usr/bin/env bash
# Fetch one registry video into scripts/video/raw. A local source is copied.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SLUG="${1:?usage: scripts/video/skachat.sh <slug>}"
RAW="$ROOT/scripts/video/raw/$SLUG.mp4"
mkdir -p "$(dirname "$RAW")"

SOURCE="$(node --input-type=module - "$ROOT" "$SLUG" <<'NODE'
import { readFileSync } from 'node:fs';
const registry = JSON.parse(readFileSync(`${process.argv[2]}/src/data/video-hls.json`, 'utf8'));
const video = registry.videos[process.argv[3]];
if (!video) process.exit(2);
console.log(video.source.file || `https://rutube.ru/video/${video.source.rutubeId}/`);
NODE
)"

if [[ "$SOURCE" == /assets/* ]]; then
  cp "$ROOT/public$SOURCE" "$RAW"
else
  # The Moscow SOCKS tunnel uses port 18080 as defined for stream A.
  yt-dlp --proxy socks5://127.0.0.1:18080 -f 'bv*[height<=1080]+ba/b' \
    --merge-output-format mp4 --no-playlist -o "$RAW" "$SOURCE"
fi
printf '%s\n' "$RAW"
