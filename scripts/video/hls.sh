#!/usr/bin/env bash
# Convert one local MP4 to adaptive HLS without increasing its native size.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SLUG="${1:?usage: scripts/video/hls.sh <slug>}"
INPUT="$ROOT/scripts/video/raw/$SLUG.mp4"
OUT="$ROOT/scripts/video/hls/$SLUG"
[[ -f "$INPUT" ]] || { echo "missing $INPUT" >&2; exit 2; }
rm -rf "$OUT"
mkdir -p "$OUT"
DIMENSIONS="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$INPUT")"
WIDTH="${DIMENSIONS%x*}"
HEIGHT="${DIMENSIONS#*x}"
if (( HEIGHT > WIDTH )); then HIGH_W=720; HIGH_H=1280; LOW_W=480; LOW_H=854; SHORT="$WIDTH"; else HIGH_W=1280; HIGH_H=720; LOW_W=854; LOW_H=480; SHORT="$HEIGHT"; fi

encode() {
  local name="$1" target_w="$2" target_h="$3" crf="$4" audio="$5"
  mkdir -p "$OUT/$name"
  ffmpeg -nostdin -hide_banner -loglevel error -y -i "$INPUT" \
    -vf "scale='min(iw,${target_w})':'min(ih,${target_h})':force_original_aspect_ratio=decrease:force_divisible_by=2" \
    -c:v libx264 -preset fast -crf "$crf" -c:a aac -b:a "$audio" -ar 44100 \
    -hls_time 6 -hls_list_size 0 -hls_segment_filename "$OUT/$name/seg-%04d.ts" \
    -f hls "$OUT/$name/playlist.m3u8"
}
encode high "$HIGH_W" "$HIGH_H" 23 128k
HIGH_RES="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$OUT/high/playlist.m3u8" | head -1)"
{
  echo '#EXTM3U'; echo '#EXT-X-VERSION:3'
  echo "#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=$HIGH_RES,NAME=\"high\""; echo 'high/playlist.m3u8'
  if (( SHORT > LOW_W )); then
    encode low "$LOW_W" "$LOW_H" 26 96k
    LOW_RES="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$OUT/low/playlist.m3u8" | head -1)"
    echo "#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=$LOW_RES,NAME=\"low\""; echo 'low/playlist.m3u8'
  fi
} > "$OUT/master.m3u8"
printf '%s\n' "$OUT/master.m3u8"
