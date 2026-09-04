#!/usr/bin/env bash
set -uo pipefail

readonly STATE_DIR="${CHEZAKVEST_WATCHDOG_STATE_DIR:-/var/lib/chezakvest-monitor}"
readonly FAILURE_FILE="${STATE_DIR}/consecutive-failures"
readonly HOME_URL="${CHEZAKVEST_WATCHDOG_HOME_URL:-http://127.0.0.1/}"
readonly VERSION_URL="${CHEZAKVEST_WATCHDOG_VERSION_URL:-http://127.0.0.1/version.json}"
readonly CURRENT_LINK="${CHEZAKVEST_WATCHDOG_CURRENT_LINK:-/var/www/chezakvest/current}"
readonly RELEASES_DIR="${CHEZAKVEST_WATCHDOG_RELEASES_DIR:-/var/www/chezakvest/releases}"
readonly PROBE_HOST="${CHEZAKVEST_WATCHDOG_HOST:-82.146.60.212}"

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
    --header "Host: ${PROBE_HOST}" --write-out '%{http_code}' "$HOME_URL" 2>/dev/null)"; then
    if [[ "$home_code" == "200" ]]; then
        home_status="200"
    else
        home_status="http_${home_code}"
    fi
fi

version_status="curl_error"
version_code=""
if version_code="$(curl --silent --show-error --max-time 10 --output "$version_body" \
    --header "Host: ${PROBE_HOST}" --write-out '%{http_code}' "$VERSION_URL" 2>/dev/null)"; then
    if [[ "$version_code" != "200" ]]; then
        version_status="http_${version_code}"
    elif active_release="$(readlink -f -- "$CURRENT_LINK" 2>/dev/null)" \
        && [[ "$active_release" == "${RELEASES_DIR}/"* ]] \
        && [[ -f "${active_release}/.deploy-verified" ]] \
        && python3 - "$version_body" "${active_release##*/}" >/dev/null 2>&1 <<'PYTHON'
import json
import re
import sys

with open(sys.argv[1], encoding="utf-8") as version_file:
    version = json.load(version_file)

if not isinstance(version, dict):
    raise SystemExit(1)
if version.get("release") != sys.argv[2]:
    raise SystemExit(1)
if not re.fullmatch(r"[0-9a-f]{40}", version.get("commit", "")):
    raise SystemExit(1)
PYTHON
    then
        version_status="active_release"
    else
        version_status="invalid_or_inactive"
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

if [[ "$home_status" == "200" && "$version_status" == "active_release" ]]; then
    write_failure_count 0
    printf 'OK home=200 version=active_release consecutive_failures=0\n'
    exit 0
fi

failure_count=$((failure_count + 1))
write_failure_count "$failure_count"
printf 'FAIL home=%s version=%s consecutive_failures=%s\n' \
    "$home_status" "$version_status" "$failure_count"

if (( failure_count >= 3 && (failure_count - 3) % 3 == 0 )); then
    if systemctl reload nginx >/dev/null 2>&1; then
        printf 'ACTION reload_nginx threshold=3 result=success\n'
    else
        printf 'ACTION reload_nginx threshold=3 result=failure\n'
    fi
fi

exit 0
