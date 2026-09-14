#!/usr/bin/env bash
# Select a bright, contrasting frame from ten samples; keep the 80 KiB budget.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SLUG="${1:?usage: scripts/video/poster.sh <slug>}"
INPUT="$ROOT/scripts/video/raw/$SLUG.mp4"
OUT="$ROOT/public/assets/video-posters/$SLUG.webp"
mkdir -p "$(dirname "$OUT")"
python3 - "$INPUT" "$OUT" <<'PY'
import collections
import json
import math
import pathlib
import subprocess
import sys
import tempfile

source, output = map(pathlib.Path, sys.argv[1:])
duration = float(subprocess.check_output([
    "ffprobe", "-v", "error", "-show_entries", "format=duration",
    "-of", "csv=p=0", str(source),
]))
if not math.isfinite(duration) or duration <= 0:
    raise SystemExit("video duration must be positive and finite")

def ffmpeg(*args):
    return subprocess.check_output([
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", *args,
    ])

with tempfile.TemporaryDirectory(prefix=".poster-", dir=output.parent) as work:
    candidates = []
    for index in range(10):
        time = round(duration * (0.1 + index * 0.8 / 9), 3)
        frame = pathlib.Path(work) / f"{index}.png"
        ffmpeg("-ss", str(time), "-i", str(source), "-frames:v", "1",
               "-vf", "scale=1280:-2:force_original_aspect_ratio=decrease", str(frame))
        pixels = ffmpeg("-i", str(frame), "-frames:v", "1", "-pix_fmt", "gray",
                        "-f", "rawvideo", "pipe:1")
        histogram = collections.Counter(pixels)
        mean = sum(value * count for value, count in histogram.items()) / len(pixels)
        variance = sum((value - mean) ** 2 * count for value, count in histogram.items()) / len(pixels)
        candidates.append({"index": index, "timeSec": time, "mean": mean, "variance": variance})

    # Min/max normalization gives brightness and contrast equal weight.
    for candidate in candidates:
        candidate["score"] = 0
        for metric in ("mean", "variance"):
            low = min(item[metric] for item in candidates)
            high = max(item[metric] for item in candidates)
            candidate["score"] += (candidate[metric] - low) / (high - low) / 2 if high > low else 0
    selected = max(candidates, key=lambda item: item["score"])
    encoded = pathlib.Path(work) / "poster.webp"
    for quality in (78, 70, 62, 54, 46, 38):
        ffmpeg("-i", str(pathlib.Path(work) / f'{selected["index"]}.png'),
               "-frames:v", "1", "-q:v", str(quality), str(encoded))
        if encoded.stat().st_size <= 81920:
            break
    else:
        raise SystemExit("poster exceeds 80 KiB")
    encoded.replace(output)
    print(json.dumps({"source": source.name, "durationSec": duration,
                      "metric": "ffmpeg full-range gray; equal min-max normalized mean and variance",
                      "candidates": candidates, "selected": selected,
                      "quality": quality, "bytes": output.stat().st_size}), file=sys.stderr)
print(output)
PY
