#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[[ $# -gt 0 ]] || { echo "usage: scripts/video/run.sh <slug...>" >&2; exit 2; }
for slug in "$@"; do "$ROOT/scripts/video/skachat.sh" "$slug"; "$ROOT/scripts/video/hls.sh" "$slug"; "$ROOT/scripts/video/poster.sh" "$slug"; done
AWS_EC2_METADATA_DISABLED=true python3 "$ROOT/scripts/video/zalit.py" "$@"
node "$ROOT/scripts/video/proverit.mjs" "$@"
rm -rf "$ROOT/scripts/video/raw" "$ROOT/scripts/video/hls"
