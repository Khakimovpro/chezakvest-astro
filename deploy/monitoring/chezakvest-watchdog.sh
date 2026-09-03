#!/usr/bin/env bash
set -uo pipefail

readonly STATE_DIR="/var/lib/chezakvest-monitor"
readonly FAILURE_FILE="${STATE_DIR}/consecutive-failures"
readonly HOME_URL="http://127.0.0.1/"
readonly VERSION_URL="http://127.0.0.1/version.json"

install -d -o root -g root -m 0750 "$STATE_DIR"
exec 9>"${STATE_DIR}/lock"
if ! flock -n 9; then
    printf 'SKIP reason=previous_check_running\n'
    exit 0
fi

version_body="$(mktemp)"
trap 'rm -f -- "$version_body"' EXIT

home_status="curl_error"
home_code=""
if home_code="$(curl --silent --show-error --max-time 10 --output /dev/null \
    --write-out '%{http_code}' "$HOME_URL" 2>/dev/null)"; then
    if [[ "$home_code" == "200" ]]; then
        home_status="200"
    else
        home_status="http_${home_code}"
    fi
fi

version_status="curl_error"
version_code=""
if version_code="$(curl --silent --show-error --max-time 10 --output "$version_body" \
    --write-out '%{http_code}' "$VERSION_URL" 2>/dev/null)"; then
    if [[ "$version_code" != "200" ]]; then
        version_status="http_${version_code}"
    elif python3 - "$version_body" >/dev/null 2>&1 <<'PYTHON'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as version_file:
    json.load(version_file)
PYTHON
    then
        version_status="valid_json"
    else
        version_status="invalid_json"
    fi
fi

failure_count=0
if [[ -r "$FAILURE_FILE" ]]; then
    read -r failure_count < "$FAILURE_FILE" || failure_count=0
    [[ "$failure_count" =~ ^[0-9]+$ ]] || failure_count=0
fi

write_failure_count() {
    local next_count="$1"
    local temporary_file="${FAILURE_FILE}.new"
    printf '%s\n' "$next_count" > "$temporary_file"
    chmod 0640 "$temporary_file"
    mv -f -- "$temporary_file" "$FAILURE_FILE"
}

if [[ "$home_status" == "200" && "$version_status" == "valid_json" ]]; then
    write_failure_count 0
    printf 'OK home=200 version=valid_json consecutive_failures=0\n'
    exit 0
fi

failure_count=$((failure_count + 1))
write_failure_count "$failure_count"
printf 'FAIL home=%s version=%s consecutive_failures=%s\n' \
    "$home_status" "$version_status" "$failure_count"

if (( failure_count == 3 )); then
    if systemctl reload nginx >/dev/null 2>&1; then
        printf 'ACTION reload_nginx threshold=3 result=success\n'
    else
        printf 'ACTION reload_nginx threshold=3 result=failure\n'
    fi
fi

exit 0
