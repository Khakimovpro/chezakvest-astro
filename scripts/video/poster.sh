#!/usr/bin/env bash
# Select a sharp, bright frame from sixteen samples; keep the 80 KB budget.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SLUG="${1:?usage: scripts/video/poster.sh <slug> [contact-sheet.jpg]}"
INPUT="$ROOT/scripts/video/raw/$SLUG.mp4"
OUT="$ROOT/public/assets/video-posters/$SLUG.webp"
mkdir -p "$(dirname "$OUT")"
python3 - "$INPUT" "$OUT" "${2:-}" <<'PY'
import json
import math
import pathlib
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw

source, output = map(pathlib.Path, sys.argv[1:3])
contact_sheet = pathlib.Path(sys.argv[3]) if sys.argv[3] else None
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
    for index in range(16):
        time = round(duration * (0.05 + (index + 0.5) * 0.9 / 16), 3)
        frame = pathlib.Path(work) / f"{index}.png"
        ffmpeg("-ss", str(time), "-i", str(source), "-frames:v", "1",
               "-vf", "scale=1280:1280:force_original_aspect_ratio=decrease", str(frame))
        # Compare spatial detail at a common resolution, without boundary padding.
        with Image.open(frame) as image:
            gray = np.asarray(image.convert("L"), dtype=np.float64)
        laplacian = (gray[:-2, 1:-1] + gray[2:, 1:-1]
                     + gray[1:-1, :-2] + gray[1:-1, 2:] - 4 * gray[1:-1, 1:-1])
        candidates.append({"index": index, "timeSec": time,
                           "brightness": float(gray.mean()), "contrast": float(gray.std()),
                           "sharpness": float(laplacian.var())})

    median_sharpness = float(np.median([item["sharpness"] for item in candidates]))
    # A mean below 40/255 leaves people hard to see against the site's dark section.
    for candidate in candidates:
        candidate["rejected"] = []
        if candidate["sharpness"] < median_sharpness:
            candidate["rejected"].append("blur")
        if candidate["brightness"] < 40:
            candidate["rejected"].append("dark")
        candidate["score"] = 0
        for metric in ("brightness", "contrast", "sharpness"):
            low = min(item[metric] for item in candidates)
            high = max(item[metric] for item in candidates)
            candidate["score"] += (candidate[metric] - low) / (high - low) if high > low else 0
    eligible = [item for item in candidates if not item["rejected"]]
    selected = max(eligible, key=lambda item: item["score"]) if eligible else None
    if contact_sheet:
        sheet = Image.new("RGB", (4 * 240, 4 * 410), "#202020")
        draw = ImageDraw.Draw(sheet)
        for item in candidates:
            x, y = item["index"] % 4 * 240, item["index"] // 4 * 410
            with Image.open(pathlib.Path(work) / f'{item["index"]}.png') as image:
                image.thumbnail((232, 325))
                sheet.paste(image, (x + (240 - image.width) // 2, y + 4))
            winner = item is selected
            color = "#ff8a00" if winner else "#aaaaaa" if item["rejected"] else "#ffffff"
            label = (f'#{item["index"] + 1} {item["timeSec"]:.2f}s score={item["score"]:.3f}\n'
                     f'B={item["brightness"]:.1f} C={item["contrast"]:.1f} L={item["sharpness"]:.1f}\n'
                     + ("SELECTED" if winner else ", ".join(item["rejected"]) or "eligible"))
            draw.multiline_text((x + 8, y + 338), label, fill=color, spacing=5)
            if winner:
                draw.rectangle((x + 1, y + 1, x + 238, y + 408), outline=color, width=3)
        contact_sheet.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(contact_sheet, quality=90)
    if selected is None:
        raise SystemExit("no sharp, sufficiently bright candidate; existing poster preserved")
    encoded = pathlib.Path(work) / "poster.webp"
    for quality in (78, 70, 62, 54, 46, 38):
        ffmpeg("-i", str(pathlib.Path(work) / f'{selected["index"]}.png'),
               "-frames:v", "1", "-q:v", str(quality), str(encoded))
        if encoded.stat().st_size <= 80000:
            break
    else:
        raise SystemExit("poster exceeds 80 KB")
    encoded.replace(output)
    print(json.dumps({"source": source.name, "durationSec": duration,
                      "metric": "Pillow luma; sum of min-max normalized brightness, contrast and Laplacian variance",
                      "medianSharpness": median_sharpness, "minBrightness": 40,
                      "candidates": candidates, "selected": selected,
                      "quality": quality, "bytes": output.stat().st_size}), file=sys.stderr)
print(output)
PY
