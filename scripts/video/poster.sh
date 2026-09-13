#!/usr/bin/env bash
# Middle frame, constrained to 1280px and 80 KiB (quality falls only if needed).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SLUG="${1:?usage: scripts/video/poster.sh <slug>}"
INPUT="$ROOT/scripts/video/raw/$SLUG.mp4"
OUT="$ROOT/public/assets/video-posters/$SLUG.webp"
mkdir -p "$(dirname "$OUT")"
DURATION="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$INPUT")"
MID="$(awk -v duration="$DURATION" 'BEGIN { printf "%.3f", duration / 2 }')"
for quality in 78 70 62 54 46 38; do
  ffmpeg -nostdin -hide_banner -loglevel error -y -ss "$MID" -i "$INPUT" -frames:v 1 -vf 'thumbnail,scale=1280:-2:force_original_aspect_ratio=decrease' -q:v "$quality" "$OUT"
  [[ $(stat -c%s "$OUT") -le 81920 ]] && break
done
[[ $(stat -c%s "$OUT") -le 81920 ]] || { echo "poster exceeds 80 KiB" >&2; exit 1; }
printf '%s\n' "$OUT"
