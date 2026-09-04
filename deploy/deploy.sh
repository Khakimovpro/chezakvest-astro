#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="root@82.146.60.212"
SSH_KEY="${CHEZAKVEST_SSH_KEY:-${HOME}/.ssh/chezakvest_key}"
REMOTE_ROOT="/var/www/chezakvest"
REMOTE_RELEASES="${REMOTE_ROOT}/releases"
REMOTE_CURRENT="${REMOTE_ROOT}/current"
ORIGIN="http://82.146.60.212"
NGINX_SOURCE="deploy/nginx/chezakvest-stage.conf"
COMMON_SOURCE="deploy/nginx/chezakvest-common.conf"
REDIRECTS_SOURCE="docs/nginx-legacy-redirects.conf"
NGINX_TARGET="/etc/nginx/sites-available/chezakvest.conf"
COMMON_TARGET="/etc/nginx/snippets/chezakvest-common.conf"
REDIRECTS_TARGET="/etc/nginx/snippets/chezakvest-legacy-redirects.conf"
REMOTE_ROLLBACK_STATE="/var/lib/chezakvest/domain-cutover/rollback.tsv"
REMOTE_SAFE_ROLLBACK_STATE="/var/lib/chezakvest/domain-cutover/automatic-rollback.tsv"
DEPLOY_LOCK="${CHEZAKVEST_DEPLOY_LOCK:-/tmp/chezakvest-deploy.lock}"
REMOTE_DEPLOY_LOCK="/run/lock/chezakvest-deploy.lock"
REMOTE_MUTATION_LOCK="/run/lock/chezakvest-mutation.lock"
REMOTE_OPERATION_OWNER="/var/lib/chezakvest/operation-owner"
MIN_FREE_BYTES="${CHEZAKVEST_MIN_FREE_BYTES:-1073741824}"
BACKUPS_TO_KEEP="${CHEZAKVEST_BACKUPS_TO_KEEP:-10}"
OPERATION_TOKEN="$(date -u +'%Y%m%dT%H%M%SZ')-deploy-$$-${RANDOM}"

DRY_RUN=0
SKIP_GATE=0
ROLLBACK=0
ALLOW_DIRTY=0
PRESERVE_REMOTE_OWNER=0

usage() {
    cat <<'EOF'
Использование: deploy/deploy.sh [--dry-run] [--skip-gate] [--rollback] [--allow-dirty]

  --dry-run      показать план, ничего не менять и не запускать сборку
  --skip-gate    пропустить npm run ci и выполнить только npm run build
  --rollback     атомарно вернуть предыдущий релиз и перезагрузить nginx
  --allow-dirty  разрешить релиз из грязного рабочего дерева
EOF
}

log() {
    printf '\n==> %s\n' "$*"
}

die() {
    printf '\nОШИБКА: %s\n' "$*" >&2
    exit 1
}

for argument in "$@"; do
    case "$argument" in
        --dry-run) DRY_RUN=1 ;;
        --skip-gate) SKIP_GATE=1 ;;
        --rollback) ROLLBACK=1 ;;
        --allow-dirty) ALLOW_DIRTY=1 ;;
        -h|--help) usage; exit 0 ;;
        *) die "неизвестный аргумент: ${argument}" ;;
    esac
done

if (( ROLLBACK )) && (( SKIP_GATE || ALLOW_DIRTY )); then
    die "флаги --skip-gate и --allow-dirty не применимы вместе с --rollback"
fi

REPOSITORY_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" \
    || die "команда должна запускаться из Git-репозитория"
[[ "$(pwd -P)" == "$(cd "$REPOSITORY_ROOT" && pwd -P)" ]] \
    || die "запустите скрипт из корня репозитория: ${REPOSITORY_ROOT}"
[[ -f package.json && -f "$NGINX_SOURCE" && -f "$COMMON_SOURCE" && -f "$REDIRECTS_SOURCE" ]] \
    || die "не найдены обязательные файлы проекта"
[[ -r "$SSH_KEY" ]] || die "не найден SSH-ключ; задайте CHEZAKVEST_SSH_KEY"

SSH=(ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 \
    -o ServerAliveInterval=15 -o ServerAliveCountMax=4 "$REMOTE_HOST")
LOCK_SSH=(ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 \
    -o ServerAliveInterval=15 -o ServerAliveCountMax=8 "$REMOTE_HOST")
RSYNC_SSH="ssh -i ${SSH_KEY} -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4"

for command_name in flock ssh; do
    command -v "$command_name" >/dev/null || die "локально не найдена команда ${command_name}"
done
[[ "$MIN_FREE_BYTES" =~ ^[0-9]+$ ]] || die "CHEZAKVEST_MIN_FREE_BYTES должен быть целым числом байт"
[[ "$BACKUPS_TO_KEEP" =~ ^[1-9][0-9]*$ ]] || die "CHEZAKVEST_BACKUPS_TO_KEEP должен быть положительным числом"
[[ "$OPERATION_TOKEN" =~ ^[A-Za-z0-9-]+$ ]] || die "не удалось создать безопасный token операции"

exec {DEPLOY_LOCK_FD}>"$DEPLOY_LOCK"
flock -n "$DEPLOY_LOCK_FD" \
    || die "другая выкладка или cutover уже выполняется; дождитесь её завершения"

REMOTE_LOCK_PID=""
REMOTE_LOCK_WRITE_FD=""
REMOTE_LOCK_READ_FD=""
TAKEOVER_OCCURRED=0
TAKEN_OVER_TOKEN=""
acquire_remote_lock() {
    local wait_seconds="${1:-0}"
    local lock_mode="${2:-new}"
    local response
    [[ "$wait_seconds" =~ ^[0-9]+$ ]] || return 1
    [[ "$lock_mode" == "new" || "$lock_mode" == "recover" || "$lock_mode" == "takeover" ]] || return 1
    coproc CHEZAKVEST_REMOTE_LOCK {
        "${LOCK_SSH[@]}" \
            "owner_file=${REMOTE_OPERATION_OWNER}; token=${OPERATION_TOKEN}; mode=${lock_mode}; response=LOCKED; exec 9>${REMOTE_DEPLOY_LOCK}; flock -w ${wait_seconds} 9 || { printf 'BUSY\\n'; exit 75; }; install -d -o root -g root -m 0700 \"\${owner_file%/*}\"; abandoned=\"\${owner_file}.abandoned\"; valid_owner() { case \"\$1\" in *-deploy-*) return 0 ;; *) return 1 ;; esac; }; if [ \"\$mode\" = new ]; then [ ! -e \"\$owner_file\" ] && [ ! -e \"\$abandoned\" ] || { printf 'STALE\\n'; exit 76; }; elif [ \"\$mode\" = recover ]; then [ \"\$(cat \"\$owner_file\" 2>/dev/null)\" = \"\$token\" ] || { printf 'STALE\\n'; exit 76; }; else taken=; if [ -e \"\$owner_file\" ]; then current=\"\$(cat \"\$owner_file\")\"; valid_owner \"\$current\" || { printf 'WRONG_OWNER\\n'; exit 77; }; if [ -e \"\$abandoned\" ]; then taken=\"\$(cat \"\$abandoned\")\"; valid_owner \"\$taken\" || { printf 'WRONG_OWNER\\n'; exit 77; }; rm -f -- \"\$owner_file\"; else taken=\"\$current\"; mv -f -- \"\$owner_file\" \"\$abandoned\"; fi; elif [ -e \"\$abandoned\" ]; then taken=\"\$(cat \"\$abandoned\")\"; valid_owner \"\$taken\" || { printf 'WRONG_OWNER\\n'; exit 77; }; fi; [ -z \"\$taken\" ] || response=\"TAKEOVER \$taken\"; fi; if [ \"\$mode\" != recover ]; then pending=\"\${owner_file}.new.\$\$\"; printf '%s\\n' \"\$token\" > \"\$pending\"; chmod 0600 \"\$pending\"; mv -f -- \"\$pending\" \"\$owner_file\"; fi; printf '%s\\n' \"\$response\"; while IFS= read -r command; do case \"\$command\" in PING) printf 'ALIVE\\n' ;; RELEASE) if [ \"\$(cat \"\$owner_file\" 2>/dev/null)\" = \"\$token\" ]; then rm -f -- \"\$owner_file\"; fi; exit 0 ;; *) exit 64 ;; esac; done; exit 74"
    }
    REMOTE_LOCK_PID="$CHEZAKVEST_REMOTE_LOCK_PID"
    REMOTE_LOCK_WRITE_FD="${CHEZAKVEST_REMOTE_LOCK[1]}"
    REMOTE_LOCK_READ_FD="${CHEZAKVEST_REMOTE_LOCK[0]}"
    if ! IFS= read -r -t 20 response <&"$REMOTE_LOCK_READ_FD"; then
        abandon_remote_lock
        printf 'Не удалось получить удалённый lock выкладки.\n' >&2
        return 1
    fi
    if [[ "$response" == "TAKEOVER "* && "${response#TAKEOVER }" =~ ^[A-Za-z0-9-]+$ ]]; then
        TAKEOVER_OCCURRED=1
        TAKEN_OVER_TOKEN="${response#TAKEOVER }"
    elif [[ "$response" != "LOCKED" ]]; then
        abandon_remote_lock
        printf 'Другая выкладка, cutover или приёмка держит lock на сервере.\n' >&2
        return 1
    fi
}

assert_remote_lock() {
    local response
    [[ -n "$REMOTE_LOCK_PID" && -n "$REMOTE_LOCK_WRITE_FD" && -n "$REMOTE_LOCK_READ_FD" ]] \
        || { printf 'Удалённый lock выкладки не удерживается.\n' >&2; return 1; }
    kill -0 "$REMOTE_LOCK_PID" 2>/dev/null \
        || { printf 'Соединение удалённого lock потеряно.\n' >&2; return 1; }
    printf 'PING\n' >&"$REMOTE_LOCK_WRITE_FD" \
        || { printf 'Не удалось отправить проверку удалённого lock.\n' >&2; return 1; }
    IFS= read -r -t 20 response <&"$REMOTE_LOCK_READ_FD" \
        || { printf 'Сервер не подтвердил удалённый lock.\n' >&2; return 1; }
    [[ "$response" == "ALIVE" ]] \
        || { printf 'Сервер вернул некорректное подтверждение удалённого lock.\n' >&2; return 1; }
}

release_remote_lock() {
    if [[ -n "$REMOTE_LOCK_WRITE_FD" ]]; then
        printf 'RELEASE\n' >&"$REMOTE_LOCK_WRITE_FD" || true
        exec {REMOTE_LOCK_WRITE_FD}>&-
        wait "$REMOTE_LOCK_PID" 2>/dev/null || true
        if [[ -n "$REMOTE_LOCK_READ_FD" ]]; then
            exec {REMOTE_LOCK_READ_FD}<&-
        fi
        REMOTE_LOCK_WRITE_FD=""
        REMOTE_LOCK_READ_FD=""
        REMOTE_LOCK_PID=""
    fi
}

abandon_remote_lock() {
    if [[ -n "$REMOTE_LOCK_WRITE_FD" ]]; then
        exec {REMOTE_LOCK_WRITE_FD}>&- 2>/dev/null || true
    fi
    if [[ -n "$REMOTE_LOCK_READ_FD" ]]; then
        exec {REMOTE_LOCK_READ_FD}<&- 2>/dev/null || true
    fi
    if [[ -n "$REMOTE_LOCK_PID" ]]; then
        kill "$REMOTE_LOCK_PID" 2>/dev/null || true
        wait "$REMOTE_LOCK_PID" 2>/dev/null || true
    fi
    REMOTE_LOCK_WRITE_FD=""
    REMOTE_LOCK_READ_FD=""
    REMOTE_LOCK_PID=""
}

reacquire_remote_lock() {
    abandon_remote_lock
    acquire_remote_lock 20 recover || return 1
    assert_remote_lock
}

ensure_remote_lock_for_recovery() {
    if assert_remote_lock; then
        return 0
    fi
    printf 'Перехватываю серверный lock по token незавершённой выкладки...\n' >&2
    reacquire_remote_lock
}

release_owned_remote_lock() {
    if [[ -z "$REMOTE_LOCK_PID" ]]; then
        return 0
    fi
    if (( PRESERVE_REMOTE_OWNER )); then
        abandon_remote_lock
        return 0
    fi
    if ! ensure_remote_lock_for_recovery; then
        printf 'КРИТИЧНО: не удалось очистить owner-token незавершённой выкладки.\n' >&2
        return 1
    fi
    release_remote_lock
}

if (( ! DRY_RUN )); then
    INITIAL_LOCK_MODE="new"
    (( ROLLBACK == 0 )) || INITIAL_LOCK_MODE="takeover"
    acquire_remote_lock 0 "$INITIAL_LOCK_MODE" \
        || die "не удалось сериализовать операцию на сервере"
    trap release_owned_remote_lock EXIT
fi

remote_nginx_mode() {
    local output
    output="$("${SSH[@]}" bash -s -- "$NGINX_TARGET" <<'REMOTE_SCRIPT'
set -euo pipefail
target="$1"
if [[ ! -e "$target" ]]; then
    printf 'stage\n'
elif [[ ! -f "$target" || ! -r "$target" ]]; then
    printf 'Конфигурация nginx существует, но недоступна для проверки: %s\n' "$target" >&2
    exit 1
elif grep -Eq '^[[:space:]]*(listen[[:space:]].*443|ssl_certificate\b)' "$target"; then
    printf 'tls\n'
else
    printf 'stage\n'
fi
REMOTE_SCRIPT
)" || return 1
    [[ "$output" == "stage" || "$output" == "tls" ]] || return 1
    printf '%s\n' "$output"
}

require_remote_space() {
    local artifact_bytes="$1"
    local phase="$2"
    "${SSH[@]}" bash -s -- "$REMOTE_RELEASES" "$artifact_bytes" "$MIN_FREE_BYTES" "$phase" <<'REMOTE_SCRIPT'
set -euo pipefail
releases_dir="$1"
artifact_bytes="$2"
reserve_bytes="$3"
phase="$4"
[[ "$artifact_bytes" =~ ^[0-9]+$ && "$reserve_bytes" =~ ^[0-9]+$ ]]
available="$(df -B1 --output=avail "$releases_dir" | awk 'NR == 2 { print $1 }')"
required=$((artifact_bytes + reserve_bytes))
[[ "$available" =~ ^[0-9]+$ ]] || exit 1
if (( available < required )); then
    printf 'Недостаточно места перед этапом «%s»: доступно %s, требуется не менее %s байт.\n' \
        "$phase" "$available" "$required" >&2
    exit 1
fi
printf 'Свободное место перед этапом «%s»: %s байт (минимум %s).\n' \
    "$phase" "$available" "$required"
REMOTE_SCRIPT
}

cleanup_remote_orphans() {
    "${SSH[@]}" bash -s -- "$REMOTE_RELEASES" "$REMOTE_CURRENT" <<'REMOTE_SCRIPT'
set -euo pipefail
releases_dir="$1"
current_link="$2"
active_target="$(readlink -f -- "$current_link" 2>/dev/null || true)"
if [[ -n "$active_target" && ! -f "${active_target}/.deploy-verified" ]]; then
    printf 'Активный релиз не имеет признака приёмки: %s\n' "$active_target" >&2
    exit 1
fi
while IFS= read -r orphan; do
    [[ "$orphan" == "${releases_dir}/"*.incoming ]] || exit 1
    rm -rf -- "$orphan"
done < <(find "$releases_dir" -mindepth 1 -maxdepth 1 -type d -name '*.incoming' -print)
while IFS= read -r candidate; do
    release_name="${candidate##*/}"
    [[ "$release_name" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$ ]] || continue
    if [[ "$candidate" != "$active_target" && ! -f "${candidate}/.deploy-verified" ]]; then
        rm -rf -- "$candidate"
    fi
done < <(find "$releases_dir" -mindepth 1 -maxdepth 1 -type d -print)
REMOTE_SCRIPT
}

remote_current_target() {
    "${SSH[@]}" bash -s -- "$REMOTE_CURRENT" "$REMOTE_RELEASES" <<'REMOTE_SCRIPT'
set -euo pipefail
current_link="$1"
releases_dir="$2"

[[ -L "$current_link" ]] || exit 0
target="$(readlink -f -- "$current_link" 2>/dev/null)" || exit 0
if [[ "$target" == "${releases_dir}/"* && -d "$target" && -f "${target}/version.json" ]]; then
    printf '%s\n' "$target"
fi
REMOTE_SCRIPT
}

remote_previous_release() {
    local current_target="$1"
    "${SSH[@]}" bash -s -- "$REMOTE_RELEASES" "$current_target" <<'REMOTE_SCRIPT'
set -euo pipefail
releases_dir="$1"
current_target="$2"

[[ -d "$releases_dir" ]] || exit 0
while IFS= read -r release_name; do
    [[ "$release_name" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$ ]] || continue
    candidate="${releases_dir}/${release_name}"
    if [[ "$candidate" != "$current_target" \
        && -f "${candidate}/version.json" \
        && -f "${candidate}/.deploy-verified" ]]; then
        printf '%s\n' "$candidate"
        exit 0
    fi
done < <(find "$releases_dir" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r)
REMOTE_SCRIPT
}

source_fingerprint() {
    {
        git rev-parse HEAD
        git diff --no-ext-diff --binary HEAD --
        while IFS= read -r -d '' untracked_file; do
            sha256sum -- "$untracked_file"
        done < <(git ls-files --others --exclude-standard -z | sort -z)
    } | sha256sum | cut -d' ' -f1
}

assert_source_unchanged() {
    local stage="$1"
    local current_fingerprint
    current_fingerprint="$(source_fingerprint)"
    [[ "$current_fingerprint" == "$SOURCE_FINGERPRINT" ]] || {
        printf 'Исходники изменились во время этапа «%s»; релиз остановлен до доставки.\n' "$stage" >&2
        return 1
    }
}

atomic_switch() {
    local target="$1"
    "${SSH[@]}" bash -s -- "$target" "$REMOTE_CURRENT" "$REMOTE_MUTATION_LOCK" <<'REMOTE_SCRIPT'
set -euo pipefail
target="$1"
current_link="$2"
mutation_lock="$3"
[[ -d "$target" && -f "${target}/version.json" ]] || {
    printf 'Целевой релиз неполон: %s\n' "$target" >&2
    exit 1
}
exec 8>"$mutation_lock"
flock -w 120 8
original_target="$(readlink -f -- "$current_link")"
restore_original() {
    status=$?
    trap - EXIT HUP INT TERM
    set +e
    ln -sfn "$original_target" "${current_link}.restore"
    mv -Tf -- "${current_link}.restore" "$current_link"
    if nginx -t; then systemctl reload nginx || true; fi
    exit "$status"
}
trap restore_original EXIT HUP INT TERM
temporary_link="${current_link}.new"
ln -sfn "$target" "$temporary_link"
mv -Tf "$temporary_link" "$current_link"
nginx -t
systemctl reload nginx
trap - EXIT HUP INT TERM
REMOTE_SCRIPT
}

expected_commit_for_release() {
    local release_path="$1"
    "${SSH[@]}" "cat '${release_path}/version.json'" \
        | node -e '
            let input = "";
            process.stdin.setEncoding("utf8");
            process.stdin.on("data", (chunk) => { input += chunk; });
            process.stdin.on("end", () => {
                const value = JSON.parse(input);
                if (!/^[0-9a-f]{40}$/.test(value.commit ?? "")) process.exit(1);
                process.stdout.write(value.commit);
            });
        '
}

smoke_site() {
    local expected_commit="$1"
    local expected_release="$2"
    local temporary_dir headers body status actual_commit actual_release source target location remote_404_hash local_404_hash
    temporary_dir="$(mktemp -d)"
    headers="${temporary_dir}/headers"
    body="${temporary_dir}/body"
    trap 'rm -rf -- "$temporary_dir"' RETURN

    log "Смоук 1/6: главная страница и запрет индексации"
    status="$(curl -sS -D "$headers" -o "$body" -w '%{http_code}' "${ORIGIN}/")"
    [[ "$status" == "200" ]] || {
        printf 'Смоук: главная вернула HTTP %s вместо 200.\n' "$status" >&2
        return 1
    }
    tr -d '\r' < "$headers" | grep -Eiq '^X-Robots-Tag:[[:space:]]*noindex,[[:space:]]*nofollow$' || {
        printf 'Смоук: отсутствует X-Robots-Tag: noindex, nofollow.\n' >&2
        return 1
    }

    log "Смоук 2/6: версия релиза"
    status="$(curl -sS -D "$headers" -o "$body" -w '%{http_code}' "${ORIGIN}/version.json")"
    [[ "$status" == "200" ]] || {
        printf 'Смоук: version.json вернул HTTP %s вместо 200.\n' "$status" >&2
        return 1
    }
    actual_commit="$(node -e '
        const fs = require("node:fs");
        const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
        if (!/^[0-9a-f]{40}$/.test(value.commit ?? "")) process.exit(1);
        process.stdout.write(value.commit);
    ' "$body")"
    [[ "$actual_commit" == "$expected_commit" ]] || {
        printf 'Смоук: в version.json коммит %s, ожидался %s.\n' "$actual_commit" "$expected_commit" >&2
        return 1
    }
    actual_release="$(node -e '
        const fs = require("node:fs");
        const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
        if (!/^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$/.test(value.release ?? "")) process.exit(1);
        process.stdout.write(value.release);
    ' "$body")"
    [[ "$actual_release" == "$expected_release" ]] || {
        printf 'Смоук: активен релиз %s, ожидался %s.\n' "$actual_release" "$expected_release" >&2
        return 1
    }

    log "Смоук 3/6: пять legacy-редиректов"
    while IFS=$'\t' read -r source target; do
        status="$(curl -sS -D "$headers" -o /dev/null -w '%{http_code}' "${ORIGIN}${source}")"
        [[ "$status" == "301" ]] || {
            printf 'Смоук: %s вернул HTTP %s вместо 301.\n' "$source" "$status" >&2
            return 1
        }
        location="$(tr -d '\r' < "$headers" | sed -nE 's/^[Ll]ocation:[[:space:]]*([^[:space:]]+)$/\1/p' | tail -n 1)"
        [[ "$location" == "$target" || "$location" == "${ORIGIN}${target}" ]] || {
            printf 'Смоук: %s направляет в %s вместо %s.\n' "$source" "$location" "$target" >&2
            return 1
        }
    done < <(node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';

const lines = readFileSync('docs/nginx-legacy-redirects.conf', 'utf8').split('\n');
let emitted = 0;
for (const line of lines) {
    const match = line.match(/^location = (\S+) \{ return 301 ([^$;]+)\$is_args\$args; \}$/);
    if (!match) continue;
    process.stdout.write(`${match[1]}\t${match[2]}\n`);
    emitted += 1;
    if (emitted === 5) break;
}
if (emitted !== 5) process.exit(1);
NODE
    )

    log "Смоук 4/6: обязательные страницы"
    for target in /kvesty-v-rostove-na-donu/ /contacts/ /privacy/ /new-year/; do
        status="$(curl -sS -o /dev/null -w '%{http_code}' "${ORIGIN}${target}")"
        [[ "$status" == "200" ]] || {
            printf 'Смоук: %s вернул HTTP %s вместо 200.\n' "$target" "$status" >&2
            return 1
        }
    done

    log "Смоук 5/6: robots.txt и sitemap.xml"
    for target in /robots.txt /sitemap.xml; do
        status="$(curl -sS -o "$body" -w '%{http_code}' "${ORIGIN}${target}")"
        [[ "$status" == "200" && -s "$body" ]] || {
            printf 'Смоук: %s вернул HTTP %s или пустое тело.\n' "$target" "$status" >&2
            return 1
        }
    done

    log "Смоук 6/6: проектная страница 404"
    status="$(curl -sS -o "$body" -w '%{http_code}' "${ORIGIN}/proverka-404-deploy-script")"
    [[ "$status" == "404" ]] || {
        printf 'Смоук: несуществующий путь вернул HTTP %s вместо 404.\n' "$status" >&2
        return 1
    }
    remote_404_hash="$("${SSH[@]}" "sha256sum '${REMOTE_CURRENT}/404.html' | cut -d' ' -f1")"
    local_404_hash="$(sha256sum "$body" | cut -d' ' -f1)"
    [[ -n "$remote_404_hash" && "$local_404_hash" == "$remote_404_hash" ]] || {
        printf 'Смоук: тело ответа 404 не совпадает с 404.html активного релиза.\n' >&2
        return 1
    }

    rm -rf -- "$temporary_dir"
    trap - RETURN
    log "Смоук успешно пройден"
}

rollback_to() {
    local target="$1"
    local original_target expected_commit rollback_failed
    [[ -n "$target" ]] || die "предыдущий релиз не найден"
    original_target="$(remote_current_target)"
    [[ -n "$original_target" ]] || die "активный релиз не найден"
    expected_commit="$(expected_commit_for_release "$target")"
    log "Переключаю current на предыдущий релиз: $(basename "$target")"
    rollback_failed=0
    atomic_switch "$target" || rollback_failed=1
    if (( ! rollback_failed )); then
        smoke_site "$expected_commit" "$(basename "$target")" || rollback_failed=1
    fi
    if (( rollback_failed )); then
        printf 'Откат не прошёл проверку; возвращаю исходный current.\n' >&2
        atomic_switch "$original_target"
        die "откат отменён, исходный релиз восстановлен"
    fi
    log "Откат завершён успешно"
}

restore_abandoned_deploy_guard() {
    "${SSH[@]}" bash -s -- \
        "${REMOTE_OPERATION_OWNER}.abandoned" "$REMOTE_OPERATION_OWNER" "$TAKEN_OVER_TOKEN" <<'REMOTE_SCRIPT'
set -euo pipefail
record="$1"
owner="$2"
expected_token="$3"
[[ "$(cat "$record" 2>/dev/null)" == "$expected_token" ]]
mv -f -- "$record" "$owner"
REMOTE_SCRIPT
}

recover_interrupted_deploy() {
    "${SSH[@]}" bash -s -- \
        "${REMOTE_OPERATION_OWNER}.abandoned" "$TAKEN_OVER_TOKEN" \
        "/var/lib/chezakvest/deploy-transactions" \
        "$REMOTE_CURRENT" "$REMOTE_RELEASES" "$REMOTE_MUTATION_LOCK" \
        "$NGINX_TARGET" "$COMMON_TARGET" "$REDIRECTS_TARGET" <<'REMOTE_SCRIPT'
set -euo pipefail
owner_record="$1"; expected_token="$2"; transaction_dir="$3"
current_link="$4"; releases_dir="$5"; mutation_lock="$6"
nginx_target="$7"; common_target="$8"; redirects_target="$9"
targets=("$nginx_target" "$common_target" "$redirects_target")

[[ "$(cat "$owner_record" 2>/dev/null)" == "$expected_token" ]]
exec 8>"$mutation_lock"
flock -w 120 8
active_release="$(readlink -f -- "$current_link")"
[[ "$active_release" == "${releases_dir}/"* && -d "$active_release" ]]

matching_markers=()
shopt -s nullglob
for candidate in "${transaction_dir}"/*.activated; do
    IFS=$'\t' read -r candidate_token _ < "$candidate" || true
    [[ "$candidate_token" != "$expected_token" ]] || matching_markers+=("$candidate")
done
if (( ${#matching_markers[@]} == 0 )); then
    rm -f -- "$owner_record"
    printf 'NONE\t%s\n' "$active_release"
    exit 0
fi
(( ${#matching_markers[@]} == 1 ))
marker="${matching_markers[0]}"

IFS=$'\t' read -r operation_token phase new_release previous_release nginx_mode backup_suffix \
    had_nginx had_common had_redirects had_enabled had_default < "$marker"
[[ "$operation_token" == "$expected_token" ]]
[[ "$phase" == "prepared" || "$phase" == "committed" ]]
[[ "$new_release" == "${releases_dir}/"* && -d "$new_release" ]]
[[ "$active_release" == "$new_release" || "$active_release" == "$previous_release" ]]
if [[ "$phase" == "committed" && "$active_release" == "$new_release" \
    && -f "${new_release}/.deploy-verified" ]]; then
    rm -f -- "$marker" "$owner_record"
    printf 'VERIFIED\t%s\n' "$new_release"
    exit 0
fi
[[ "$previous_release" == "${releases_dir}/"* && -d "$previous_release" \
    && -f "${previous_release}/.deploy-verified" ]]
[[ "$nginx_mode" == "stage" || "$nginx_mode" == "tls" ]]
[[ "$backup_suffix" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]
for flag in "$had_nginx" "$had_common" "$had_redirects" "$had_enabled" "$had_default"; do
    [[ "$flag" =~ ^[01]$ ]]
done
previous_flags=("$had_nginx" "$had_common" "$had_redirects")
for index in "${!targets[@]}"; do
    (( previous_flags[index] == 0 )) || [[ -f "${targets[$index]}.bak-${backup_suffix}" ]]
done

snapshot_dir="$(mktemp -d /tmp/chezakvest-takeover.XXXXXX)"
new_enabled=0; new_default=0
[[ -L /etc/nginx/sites-enabled/chezakvest.conf ]] && new_enabled=1
[[ -L /etc/nginx/sites-enabled/default ]] && new_default=1
for index in "${!targets[@]}"; do
    if [[ -f "${targets[$index]}" ]]; then
        printf '1\n' > "${snapshot_dir}/${index}.exists"
        cp -a -- "${targets[$index]}" "${snapshot_dir}/${index}.conf"
        cmp -s -- "${targets[$index]}" "${snapshot_dir}/${index}.conf"
    else
        printf '0\n' > "${snapshot_dir}/${index}.exists"
    fi
done

restore_file() {
    local target="$1" existed="$2" source="$3"
    if (( existed )); then
        install -o root -g root -m 0644 "$source" "${target}.restore.$$"
        cmp -s -- "$source" "${target}.restore.$$"
        mv -f -- "${target}.restore.$$" "$target"
    else
        rm -f -- "$target"
    fi
}

switch_release() {
    local target="$1"
    ln -sfn "$target" "${current_link}.restore"
    mv -Tf -- "${current_link}.restore" "$current_link"
}

roll_forward_on_error() {
    status=$?
    trap - EXIT HUP INT TERM
    set +e
    rm -f /etc/nginx/sites-enabled/chezakvest.conf /etc/nginx/sites-enabled/default
    for index in "${!targets[@]}"; do
        read -r existed < "${snapshot_dir}/${index}.exists"
        restore_file "${targets[$index]}" "$existed" "${snapshot_dir}/${index}.conf"
    done
    (( new_enabled == 0 )) || ln -sfn "$nginx_target" /etc/nginx/sites-enabled/chezakvest.conf
    (( new_default == 0 )) || ln -sfn /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
    switch_release "$active_release"
    if nginx -t; then systemctl reload nginx || true; fi
    rm -rf -- "$snapshot_dir"
    exit "$status"
}
trap roll_forward_on_error EXIT HUP INT TERM

rm -f /etc/nginx/sites-enabled/chezakvest.conf /etc/nginx/sites-enabled/default
for index in "${!targets[@]}"; do
    restore_file "${targets[$index]}" "${previous_flags[$index]}" \
        "${targets[$index]}.bak-${backup_suffix}"
done
(( had_enabled == 0 )) || ln -sfn "$nginx_target" /etc/nginx/sites-enabled/chezakvest.conf
(( had_default == 0 )) || ln -sfn /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
switch_release "$previous_release"
nginx -t
systemctl reload nginx
trap - EXIT HUP INT TERM
rm -f -- "$marker" "$owner_record"
rm -rf -- "$new_release" || true
rm -rf -- "$snapshot_dir"
printf 'RECOVERED\t%s\n' "$previous_release"
REMOTE_SCRIPT
}

prune_remote_nginx_backups() {
    "${SSH[@]}" bash -s -- \
        "$BACKUPS_TO_KEEP" "$REMOTE_ROLLBACK_STATE" "$REMOTE_SAFE_ROLLBACK_STATE" \
        "$NGINX_TARGET" "$COMMON_TARGET" "$REDIRECTS_TARGET" <<'REMOTE_SCRIPT'
set -euo pipefail
keep="$1"
state_file="$2"
safe_state_file="$3"
shift 3
targets=("$1" "$2" "$3")
[[ "$keep" =~ ^[1-9][0-9]*$ ]]

referenced_backups=""
for current_state in "$state_file" "$safe_state_file"; do
    if [[ -s "$current_state" ]]; then
        referenced_backups+="$(awk -F '\t' '$1 != "#" && $2 == "1" { print $3 }' "$current_state")"$'\n'
    fi
done
for target in "${targets[@]}"; do
    directory="${target%/*}"
    basename="${target##*/}"
    mapfile -t obsolete_backups < <(
        find "$directory" -mindepth 1 -maxdepth 1 -type f -name "${basename}.bak-*" -printf '%p\n' \
            | sort -r \
            | tail -n "+$((keep + 1))"
    )
    for backup in "${obsolete_backups[@]}"; do
        grep -Fxq -- "$backup" <<< "$referenced_backups" || rm -f -- "$backup"
    done
done
REMOTE_SCRIPT
}

dry_run_recovery_status() {
    "${SSH[@]}" bash -s -- \
        "$REMOTE_DEPLOY_LOCK" "$REMOTE_MUTATION_LOCK" "$REMOTE_OPERATION_OWNER" \
        "/var/lib/chezakvest/deploy-transactions" <<'REMOTE_SCRIPT'
set -euo pipefail
deploy_lock="$1"
mutation_lock="$2"
owner_file="$3"
transaction_dir="$4"
exec 9>"$deploy_lock"
flock -n 9 || { printf 'BUSY\n'; exit 0; }
token=""
[[ ! -s "${owner_file}.abandoned" ]] || token="$(cat "${owner_file}.abandoned")"
[[ -n "$token" || ! -s "$owner_file" ]] || token="$(cat "$owner_file")"
[[ -n "$token" ]] || { printf 'CLEAR\n'; exit 0; }
exec 8>"$mutation_lock"
flock -n 8 || { printf 'BUSY_MUTATION\t%s\n' "$token"; exit 0; }
matches=0
shopt -s nullglob
for marker in "${transaction_dir}"/*.activated; do
    IFS=$'\t' read -r marker_token _ < "$marker" || true
    [[ "$marker_token" != "$token" ]] || ((matches += 1))
done
if (( matches == 1 )); then
    printf 'RECOVERY\t%s\n' "$token"
elif (( matches == 0 )); then
    printf 'OWNER_NO_STATE\t%s\n' "$token"
else
    printf 'AMBIGUOUS\t%s\n' "$token"
fi
REMOTE_SCRIPT
}

if (( ROLLBACK )); then
    if (( DRY_RUN )); then
        DRY_RECOVERY_STATUS="$(dry_run_recovery_status)" \
            || die "не удалось проверить persistent owner для dry-run"
        case "$DRY_RECOVERY_STATUS" in
            RECOVERY$'\t'*-deploy-*|OWNER_NO_STATE$'\t'*-deploy-*)
                log "Сухой запуск: изменений не будет"
                printf 'Обнаружен persistent owner: %s\n' "${DRY_RECOVERY_STATUS#*$'\t'}"
                printf 'План: под свободными operation- и mutation-lock выполнить takeover; '\
'по prepared/committed marker согласованно восстановить release и nginx либо только очистить owner, если мутация не начиналась.\n'
                exit 0
                ;;
            BUSY|BUSY_MUTATION$'\t'*)
                log "Сухой запуск: изменений не будет"
                printf 'Серверная операция или мутация ещё активна; takeover сейчас был бы остановлен.\n'
                exit 0
                ;;
            CLEAR) ;;
            *) die "persistent owner не относится к deploy или recovery-state неоднозначен: ${DRY_RECOVERY_STATUS}" ;;
        esac
    fi
    if (( TAKEOVER_OCCURRED )); then
        log "Восстанавливаю незавершённую deploy-транзакцию ${TAKEN_OVER_TOKEN}"
        if ! RECOVERY_OUTPUT="$(recover_interrupted_deploy)"; then
            restore_abandoned_deploy_guard || true
            die "не удалось согласованно восстановить release/nginx; owner-token сохранён"
        fi
        RECOVERY_RESULT="$(printf '%s\n' "$RECOVERY_OUTPUT" | tail -n 1)"
        case "$RECOVERY_RESULT" in
            RECOVERED$'\t'*)
                RECOVERED_TARGET="${RECOVERY_RESULT#*$'\t'}"
                RECOVERED_COMMIT="$(expected_commit_for_release "$RECOVERED_TARGET")"
                smoke_site "$RECOVERED_COMMIT" "$(basename "$RECOVERED_TARGET")" \
                    || die "release/nginx восстановлены, но итоговый HTTP-смоук не прошёл"
                log "Незавершённая deploy-транзакция согласованно откачена"
                ;;
            NONE$'\t'*)
                log "Owner-token очищен: серверная мутация не начиналась"
                ;;
            VERIFIED$'\t'*)
                log "Owner-token очищен: release уже был принят до прерывания"
                ;;
            *)
                restore_abandoned_deploy_guard || true
                die "сервер вернул неожиданный результат восстановления"
                ;;
        esac
        prune_remote_nginx_backups \
            || printf 'ПРЕДУПРЕЖДЕНИЕ: recovery завершён, но история nginx backup не ограничена.\n' >&2
        exit 0
    fi
    CURRENT_TARGET="$(remote_current_target)"
    PREVIOUS_TARGET="$(remote_previous_release "$CURRENT_TARGET")"
    [[ -n "$CURRENT_TARGET" ]] || die "активный релиз не найден"
    [[ -n "$PREVIOUS_TARGET" ]] || die "предыдущий релиз не найден"
    if (( DRY_RUN )); then
        log "Сухой запуск: изменений не будет"
        printf 'Текущий релиз: %s\nПредыдущий релиз: %s\n' \
            "$(basename "$CURRENT_TARGET")" "$(basename "$PREVIOUS_TARGET")"
        printf 'Будут выполнены: атомарное переключение current, nginx -t, reload nginx и HTTP-смоук.\n'
        exit 0
    fi
    rollback_to "$PREVIOUS_TARGET"
    prune_remote_nginx_backups \
        || printf 'ПРЕДУПРЕЖДЕНИЕ: откат завершён, но история nginx backup не ограничена.\n' >&2
    exit 0
fi

DIRTY_STATUS="$(git status --short)"
if [[ -n "$DIRTY_STATUS" ]] && (( ! ALLOW_DIRTY )); then
    printf 'Рабочее дерево грязное:\n%s\n' "$DIRTY_STATUS" >&2
    die "повторите с --allow-dirty, только если осознанно выпускаете эти изменения"
fi
if [[ -n "$DIRTY_STATUS" ]]; then
    printf 'ПРЕДУПРЕЖДЕНИЕ: релиз выполняется из грязного рабочего дерева (--allow-dirty).\n' >&2
fi

FULL_COMMIT="$(git rev-parse HEAD)"
SHORT_COMMIT="$(git rev-parse --short=8 HEAD)"
BRANCH="$(git branch --show-current)"
SOURCE_FINGERPRINT="$(source_fingerprint)"
NGINX_MODE="$(remote_nginx_mode)" \
    || die "не удалось достоверно определить состояние nginx; выкладка остановлена"

if (( DRY_RUN )); then
    RELEASE_STAMP="$(date -u +'%Y%m%dT%H%M%SZ')"
    RELEASE_NAME="${RELEASE_STAMP}-${SHORT_COMMIT}"
    log "Сухой запуск: изменений не будет"
    printf 'Коммит: %s\nВетка: %s\nБудущий релиз: %s\nРежим nginx: %s\n' \
        "$FULL_COMMIT" "$BRANCH" "$RELEASE_NAME" "$NGINX_MODE"
    if (( SKIP_GATE )); then
        printf 'Гейт будет пропущен; сборка будет выполнена.\n'
    else
        printf 'Будет выполнен npm run ci; доставляется его финальная проверенная сборка.\n'
    fi
    printf '%s\n' \
        'Далее: version.json, установка rsync при необходимости, доставка с checksum-проверкой,' \
        'проверка места, очистка бесхозных каталогов, атомарное переключение current,' \
        'установка common/redirect nginx-конфигов и site-конфига только в stage-режиме,' \
        'nginx -t, reload, HTTP-смоук и сохранение трёх последних релизов.'
    exit 0
fi

command -v rsync >/dev/null || die "локально не найден rsync"
command -v curl >/dev/null || die "локально не найден curl"
command -v node >/dev/null || die "локально не найден node"

if (( SKIP_GATE )); then
    log "Гейт пропущен по флагу --skip-gate"
    log "Собираю статический сайт"
    npm run build
else
    log "Запускаю полный гейт npm run ci с финальной проверенной сборкой"
    npm run ci
fi
assert_source_unchanged "гейт"

BUILD_TIME="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
RELEASE_STAMP="$(date -u +'%Y%m%dT%H%M%SZ')"
RELEASE_NAME="${RELEASE_STAMP}-${SHORT_COMMIT}"
REMOTE_RELEASE="${REMOTE_RELEASES}/${RELEASE_NAME}"
REMOTE_STAGING="${REMOTE_RELEASE}.incoming"

log "Создаю dist/version.json"
VERSION_COMMIT="$FULL_COMMIT" \
VERSION_SHORT_COMMIT="$SHORT_COMMIT" \
VERSION_BRANCH="$BRANCH" \
VERSION_BUILD_TIME="$BUILD_TIME" \
VERSION_RELEASE_NAME="$RELEASE_NAME" \
node --input-type=module <<'NODE'
import { writeFile } from 'node:fs/promises';

const version = {
  commit: process.env.VERSION_COMMIT,
  shortCommit: process.env.VERSION_SHORT_COMMIT,
  branch: process.env.VERSION_BRANCH,
  builtAt: process.env.VERSION_BUILD_TIME,
  release: process.env.VERSION_RELEASE_NAME,
  node: process.version,
};
await writeFile('dist/version.json', `${JSON.stringify(version, null, 2)}\n`);
NODE

ARTIFACT_BYTES="$(du -sb dist | awk '{ print $1 }')"
[[ "$ARTIFACT_BYTES" =~ ^[0-9]+$ ]] || die "не удалось определить размер dist/"

LOCAL_CONFIG_DIR="$(mktemp -d)"
cleanup_local_config() {
    if [[ -n "${LOCAL_CONFIG_DIR:-}" && -d "$LOCAL_CONFIG_DIR" ]]; then
        rm -rf -- "$LOCAL_CONFIG_DIR"
    fi
}
cleanup_local_config_and_lock() {
    cleanup_local_config
    release_owned_remote_lock
}
trap cleanup_local_config_and_lock EXIT
cp -- "$NGINX_SOURCE" "$LOCAL_CONFIG_DIR/site.conf"
cp -- "$COMMON_SOURCE" "$LOCAL_CONFIG_DIR/common.conf"
cp -- "$REDIRECTS_SOURCE" "$LOCAL_CONFIG_DIR/redirects.conf"
assert_source_unchanged "фиксация nginx-конфигурации"

CURRENT_NGINX_MODE="$(remote_nginx_mode)" \
    || die "не удалось повторно определить состояние nginx перед доставкой"
[[ "$CURRENT_NGINX_MODE" == "$NGINX_MODE" ]] \
    || die "состояние nginx изменилось с ${NGINX_MODE} на ${CURRENT_NGINX_MODE}; повторите выкладку"

assert_remote_lock
cleanup_remote_orphans \
    || die "не удалось безопасно очистить незавершённые релизы"
require_remote_space "$ARTIFACT_BYTES" "доставка релиза" \
    || die "предохранитель свободного места остановил выкладку"

log "Готовлю staging-каталог на сервере и устанавливаю rsync при необходимости"
assert_remote_lock
"${SSH[@]}" bash -s -- "$REMOTE_RELEASES" "$REMOTE_RELEASE" "$REMOTE_STAGING" "$REMOTE_CURRENT" <<'REMOTE_SCRIPT'
set -euo pipefail
releases_dir="$1"
release_dir="$2"
staging_dir="$3"
current_link="$4"
if ! command -v rsync >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y rsync
    apt-get clean
fi
[[ "$release_dir" == "${releases_dir}/"* && "$staging_dir" == "${release_dir}.incoming" ]]
active_target="$(readlink -f -- "$current_link" 2>/dev/null || true)"
if [[ -n "$active_target" && ! -f "${active_target}/.deploy-verified" ]]; then
    printf 'Активный релиз не имеет признака приёмки: %s\n' "$active_target" >&2
    exit 1
fi
[[ ! -e "$release_dir" && ! -e "$staging_dir" ]] || {
    printf 'Каталог релиза или staging уже существует.\n' >&2
    exit 1
}
install -d -o root -g root -m 0755 "$releases_dir" "$staging_dir" /var/www/acme/.well-known/acme-challenge
REMOTE_SCRIPT

STAGING_CREATED=1
cleanup_remote_staging() {
    if (( STAGING_CREATED )); then
        "${SSH[@]}" bash -s -- "$REMOTE_RELEASES" "$REMOTE_STAGING" <<'REMOTE_SCRIPT' || true
set -euo pipefail
releases_dir="$1"
staging_dir="$2"
[[ "$staging_dir" == "${releases_dir}/"*.incoming ]] || exit 1
rm -rf -- "$staging_dir"
REMOTE_SCRIPT
    fi
}
cleanup_before_finalization() {
    ensure_remote_lock_for_recovery || return 1
    cleanup_remote_staging
    cleanup_local_config
    release_owned_remote_lock
}
trap cleanup_before_finalization EXIT

log "Доставляю полный dist/ в ${RELEASE_NAME}"
assert_remote_lock
rsync -a --delete --chown=root:root -e "$RSYNC_SSH" dist/ "${REMOTE_HOST}:${REMOTE_STAGING}/"

log "Проверяю доставку побайтовыми контрольными суммами"
RSYNC_DIFFERENCES="$(rsync -a --delete --chown=root:root --checksum --dry-run --itemize-changes \
    -e "$RSYNC_SSH" dist/ "${REMOTE_HOST}:${REMOTE_STAGING}/")"
[[ -z "$RSYNC_DIFFERENCES" ]] || {
    printf '%s\n' "$RSYNC_DIFFERENCES" >&2
    die "содержимое удалённого релиза отличается от dist/"
}

assert_source_unchanged "доставка релиза"
CURRENT_NGINX_MODE="$(remote_nginx_mode)" \
    || die "не удалось определить состояние nginx после доставки"
[[ "$CURRENT_NGINX_MODE" == "$NGINX_MODE" ]] \
    || die "состояние nginx изменилось с ${NGINX_MODE} на ${CURRENT_NGINX_MODE}; активация остановлена"
require_remote_space "$ARTIFACT_BYTES" "активация релиза" \
    || die "предохранитель свободного места остановил активацию"

REMOTE_CONFIG_DIR="/tmp/chezakvest-deploy-${RELEASE_NAME}"
assert_remote_lock
"${SSH[@]}" bash -s -- "$REMOTE_CONFIG_DIR" <<'REMOTE_SCRIPT'
set -euo pipefail
target="$1"
[[ "$target" == /tmp/chezakvest-deploy-* ]]
rm -rf -- "$target"
install -d -o root -g root -m 0700 "$target"
REMOTE_SCRIPT
assert_remote_lock
scp -q -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 \
    "$LOCAL_CONFIG_DIR/site.conf" \
    "$LOCAL_CONFIG_DIR/common.conf" \
    "$LOCAL_CONFIG_DIR/redirects.conf" \
    "${REMOTE_HOST}:${REMOTE_CONFIG_DIR}/"

log "Атомарно завершаю проверенный staging-релиз"
assert_remote_lock
"${SSH[@]}" bash -s -- "$REMOTE_RELEASES" "$REMOTE_RELEASE" "$REMOTE_STAGING" <<'REMOTE_SCRIPT'
set -euo pipefail
releases_dir="$1"
release_dir="$2"
staging_dir="$3"
[[ "$release_dir" == "${releases_dir}/"* && "$staging_dir" == "${release_dir}.incoming" ]]
[[ -d "$staging_dir" && -f "${staging_dir}/version.json" && ! -e "$release_dir" ]]
mv -T "$staging_dir" "$release_dir"
REMOTE_SCRIPT
STAGING_CREATED=0
trap - EXIT

FINALIZED_NOT_ACTIVE=1
cleanup_unactivated_release() {
    if (( FINALIZED_NOT_ACTIVE )); then
        "${SSH[@]}" bash -s -- "$REMOTE_RELEASES" "$REMOTE_RELEASE" "$REMOTE_CURRENT" <<'REMOTE_SCRIPT' || true
set -euo pipefail
releases_dir="$1"
release_dir="$2"
current_link="$3"
release_name="${release_dir##*/}"
[[ "$release_dir" == "${releases_dir}/${release_name}" ]]
[[ "$release_name" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$ ]]
active_target="$(readlink -f -- "$current_link" 2>/dev/null || true)"
[[ "$active_target" != "$release_dir" ]] || exit 0
rm -rf -- "$release_dir"
REMOTE_SCRIPT
    fi
}
cleanup_before_activation() {
    ensure_remote_lock_for_recovery || return 1
    cleanup_unactivated_release
    cleanup_local_config
    release_owned_remote_lock
}
trap cleanup_before_activation EXIT

PREVIOUS_TARGET="$(remote_current_target)"
NGINX_STATE="$("${SSH[@]}" bash -s -- "$NGINX_TARGET" "$COMMON_TARGET" "$REDIRECTS_TARGET" <<'REMOTE_SCRIPT'
nginx_target="$1"
common_target="$2"
redirects_target="$3"
had_nginx=0; had_common=0; had_redirects=0; had_enabled=0; had_default=0
[[ -e "$nginx_target" ]] && had_nginx=1
[[ -e "$common_target" ]] && had_common=1
[[ -e "$redirects_target" ]] && had_redirects=1
[[ -L /etc/nginx/sites-enabled/chezakvest.conf ]] && had_enabled=1
[[ -L /etc/nginx/sites-enabled/default ]] && had_default=1
printf '%s %s %s %s %s\n' \
    "$had_nginx" "$had_common" "$had_redirects" "$had_enabled" "$had_default"
REMOTE_SCRIPT
)"
read -r HAD_NGINX HAD_COMMON HAD_REDIRECTS HAD_ENABLED HAD_DEFAULT <<< "$NGINX_STATE"

finalize_failed_release() {
    "${SSH[@]}" bash -s -- \
        "$REMOTE_RELEASES" "$REMOTE_RELEASE" "$REMOTE_CURRENT" \
        "/var/lib/chezakvest/deploy-transactions/${RELEASE_NAME}.activated" \
        "$OPERATION_TOKEN" "$REMOTE_MUTATION_LOCK" <<'REMOTE_SCRIPT'
set -euo pipefail
releases_dir="$1"
release_dir="$2"
current_link="$3"
activation_marker="$4"
operation_token="$5"
mutation_lock="$6"
release_name="${release_dir##*/}"
[[ "$release_dir" == "${releases_dir}/${release_name}" ]]
[[ "$release_name" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$ ]]
exec 8>"$mutation_lock"
flock -w 120 8
active_target="$(readlink -f -- "$current_link" 2>/dev/null || true)"
[[ "$active_target" != "$release_dir" ]] || {
    printf 'Нельзя удалить активный неуспешный релиз.\n' >&2
    exit 1
}
if [[ -s "$activation_marker" ]]; then
    IFS=$'\t' read -r marker_token _ marker_release _ < "$activation_marker"
    [[ "$marker_token" == "$operation_token" && "$marker_release" == "$release_dir" ]]
    rm -f -- "$activation_marker"
fi
rm -rf -- "$release_dir"
REMOTE_SCRIPT
}

restore_previous_state() {
    "${SSH[@]}" bash -s -- \
        "$REMOTE_CURRENT" "$REMOTE_RELEASE" "$PREVIOUS_TARGET" \
        "$NGINX_TARGET" "$COMMON_TARGET" "$REDIRECTS_TARGET" "$RELEASE_STAMP" \
        "$HAD_NGINX" "$HAD_COMMON" "$HAD_REDIRECTS" "$HAD_ENABLED" "$HAD_DEFAULT" \
        "$REMOTE_MUTATION_LOCK" <<'REMOTE_SCRIPT'
set -euo pipefail
current_link="$1"; new_release="$2"; previous_release="$3"
nginx_target="$4"; common_target="$5"; redirects_target="$6"; suffix="$7"
had_nginx="$8"; had_common="$9"; had_redirects="${10}"; had_enabled="${11}"; had_default="${12}"
mutation_lock="${13}"
targets=("$nginx_target" "$common_target" "$redirects_target")
previous_flags=("$had_nginx" "$had_common" "$had_redirects")
exec 8>"$mutation_lock"
flock -w 120 8
[[ "$(readlink -f -- "$current_link" 2>/dev/null)" == "$new_release" ]] || {
    printf 'Активный release уже изменился; откат этой транзакции запрещён.\n' >&2
    exit 2
}
snapshot_dir="$(mktemp -d /tmp/chezakvest-rollback.XXXXXX)"
new_enabled=0; new_default=0
[[ -L /etc/nginx/sites-enabled/chezakvest.conf ]] && new_enabled=1
[[ -L /etc/nginx/sites-enabled/default ]] && new_default=1

for index in "${!targets[@]}"; do
    target="${targets[$index]}"
    if [[ -f "$target" ]]; then
        printf '1\n' > "${snapshot_dir}/${index}.exists"
        cp -a -- "$target" "${snapshot_dir}/${index}.conf"
        cmp -s -- "$target" "${snapshot_dir}/${index}.conf"
    else
        printf '0\n' > "${snapshot_dir}/${index}.exists"
    fi
done

restore_file() {
    local target="$1"
    local existed="$2"
    local source="$3"
    if (( existed )); then
        [[ -f "$source" ]]
        install -o root -g root -m 0644 "$source" "${target}.restore.$$"
        cmp -s -- "$source" "${target}.restore.$$"
        mv -f -- "${target}.restore.$$" "$target"
    else
        rm -f -- "$target"
    fi
}

switch_release() {
    local target="$1"
    if [[ -n "$target" ]]; then
        [[ "$target" == /var/www/chezakvest/releases/* && -d "$target" ]]
        ln -sfn "$target" "${current_link}.restore"
        mv -Tf -- "${current_link}.restore" "$current_link"
    else
        rm -f -- "$current_link"
    fi
}

roll_forward_on_error() {
    status=$?
    trap - EXIT HUP INT TERM
    set +e
    rm -f /etc/nginx/sites-enabled/chezakvest.conf /etc/nginx/sites-enabled/default
    for index in "${!targets[@]}"; do
        read -r existed < "${snapshot_dir}/${index}.exists"
        restore_file "${targets[$index]}" "$existed" "${snapshot_dir}/${index}.conf"
    done
    (( new_enabled == 0 )) || ln -sfn "$nginx_target" /etc/nginx/sites-enabled/chezakvest.conf
    (( new_default == 0 )) || ln -sfn /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
    switch_release "$new_release"
    if nginx -t; then systemctl reload nginx || true; fi
    rm -rf -- "$snapshot_dir"
    exit "$status"
}
trap roll_forward_on_error EXIT HUP INT TERM

rm -f /etc/nginx/sites-enabled/chezakvest.conf /etc/nginx/sites-enabled/default
for index in "${!targets[@]}"; do
    restore_file "${targets[$index]}" "${previous_flags[$index]}" "${targets[$index]}.bak-${suffix}"
done
(( had_enabled == 0 )) || ln -sfn "$nginx_target" /etc/nginx/sites-enabled/chezakvest.conf
(( had_default == 0 )) || ln -sfn /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
switch_release "$previous_release"
nginx -t
systemctl reload nginx
trap - EXIT HUP INT TERM
rm -rf -- "$snapshot_dir"
REMOTE_SCRIPT
}

apply_nginx_config() {
    "${SSH[@]}" bash -s -- \
        "$REMOTE_CONFIG_DIR" "$NGINX_MODE" \
        "$NGINX_TARGET" "$COMMON_TARGET" "$REDIRECTS_TARGET" "$RELEASE_STAMP" \
        "$HAD_NGINX" "$HAD_COMMON" "$HAD_REDIRECTS" "$HAD_ENABLED" "$HAD_DEFAULT" \
        "$REMOTE_RELEASE" "$REMOTE_CURRENT" "$PREVIOUS_TARGET" "$RELEASE_NAME" \
        "$OPERATION_TOKEN" "$REMOTE_MUTATION_LOCK" <<'REMOTE_SCRIPT'
set -euo pipefail
source_dir="$1"; nginx_mode="$2"
nginx_target="$3"; common_target="$4"; redirects_target="$5"; backup_suffix="$6"
had_nginx="$7"; had_common="$8"; had_redirects="$9"; had_enabled="${10}"; had_default="${11}"
release_dir="${12}"; current_link="${13}"; previous_target="${14}"; release_name="${15}"
operation_token="${16}"; mutation_lock="${17}"
transaction_dir="/var/lib/chezakvest/deploy-transactions"
activation_marker="${transaction_dir}/${release_name}.activated"

[[ "$source_dir" == /tmp/chezakvest-deploy-* && -d "$source_dir" ]]
[[ "$nginx_mode" == "stage" || "$nginx_mode" == "tls" ]]
[[ "$release_dir" == /var/www/chezakvest/releases/"$release_name" && -f "${release_dir}/version.json" ]]
exec 8>"$mutation_lock"
flock -w 120 8

make_backup() {
    local target="$1"
    local backup="${target}.bak-${backup_suffix}"
    local pending="${backup}.new.$$"
    [[ ! -e "$backup" && ! -L "$backup" ]]
    cp -a -- "$target" "$pending"
    cmp -s -- "$target" "$pending"
    mv -f -- "$pending" "$backup"
}

restore_file() {
    local target="$1"
    local existed="$2"
    local backup="${target}.bak-${backup_suffix}"
    if (( existed )); then
        [[ -f "$backup" ]]
        install -o root -g root -m 0644 "$backup" "${target}.restore.$$"
        cmp -s -- "$backup" "${target}.restore.$$"
        mv -f -- "${target}.restore.$$" "$target"
    else
        rm -f -- "$target"
    fi
}

restore_release() {
    if [[ -n "$previous_target" ]]; then
        [[ "$previous_target" == /var/www/chezakvest/releases/* && -d "$previous_target" ]]
        ln -sfn "$previous_target" "${current_link}.restore"
        mv -Tf -- "${current_link}.restore" "$current_link"
    else
        rm -f -- "$current_link"
    fi
}

restore_previous_config() {
    rm -f /etc/nginx/sites-enabled/chezakvest.conf /etc/nginx/sites-enabled/default
    restore_file "$nginx_target" "$had_nginx"
    restore_file "$common_target" "$had_common"
    restore_file "$redirects_target" "$had_redirects"
    (( had_enabled == 0 )) || ln -sfn "$nginx_target" /etc/nginx/sites-enabled/chezakvest.conf
    (( had_default == 0 )) || ln -sfn /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
    nginx -t
    systemctl reload nginx
}

on_exit() {
    status=$?
    trap - EXIT
    if (( status != 0 )); then
        set +e
        rollback_failed=0
        restore_release || rollback_failed=1
        restore_previous_config || rollback_failed=1
        (( rollback_failed != 0 )) || rm -f -- "$activation_marker"
    fi
    rm -rf -- "$source_dir"
    exit "$status"
}
trap on_exit EXIT

(( had_nginx == 0 )) || make_backup "$nginx_target"
(( had_common == 0 )) || make_backup "$common_target"
(( had_redirects == 0 )) || make_backup "$redirects_target"

install -d -o root -g root -m 0700 "$transaction_dir"
printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$operation_token" "prepared" "$release_dir" "$previous_target" "$nginx_mode" "$backup_suffix" \
    "$had_nginx" "$had_common" "$had_redirects" "$had_enabled" "$had_default" \
    > "${activation_marker}.new"
chmod 0600 "${activation_marker}.new"
mv -f -- "${activation_marker}.new" "$activation_marker"

if [[ "$nginx_mode" == "tls" ]]; then
    grep -Eq '^[[:space:]]*(listen[[:space:]].*443|ssl_certificate\b)' "$nginx_target"
else
    install -o root -g root -m 0644 "$source_dir/site.conf" "${nginx_target}.new"
    mv -f -- "${nginx_target}.new" "$nginx_target"
    ln -sfn "$nginx_target" /etc/nginx/sites-enabled/chezakvest.conf.new
    mv -Tf /etc/nginx/sites-enabled/chezakvest.conf.new /etc/nginx/sites-enabled/chezakvest.conf
    rm -f /etc/nginx/sites-enabled/default
fi
install -o root -g root -m 0644 "$source_dir/common.conf" "${common_target}.new"
mv -f -- "${common_target}.new" "$common_target"
install -o root -g root -m 0644 "$source_dir/redirects.conf" "${redirects_target}.new"
mv -f -- "${redirects_target}.new" "$redirects_target"
nginx -t

ln -sfn "$release_dir" "${current_link}.new"
mv -Tf -- "${current_link}.new" "$current_link"
systemctl reload nginx
sed 's/\tprepared\t/\tcommitted\t/' "$activation_marker" > "${activation_marker}.new"
chmod 0600 "${activation_marker}.new"
mv -f -- "${activation_marker}.new" "$activation_marker"
rm -rf -- "$source_dir"
trap - EXIT
REMOTE_SCRIPT
}

activation_is_committed() {
    "${SSH[@]}" bash -s -- "$REMOTE_CURRENT" "$REMOTE_RELEASE" \
        "/var/lib/chezakvest/deploy-transactions/${RELEASE_NAME}.activated" <<'REMOTE_SCRIPT'
set -euo pipefail
current_link="$1"
expected_release="$2"
marker="$3"
[[ "$(readlink -f -- "$current_link")" == "$expected_release" ]]
[[ -s "$marker" ]]
IFS=$'\t' read -r _ phase _ < "$marker"
[[ "$phase" == "committed" ]]
nginx -t >/dev/null
REMOTE_SCRIPT
}

log "Единой транзакцией переключаю release и применяю nginx (${NGINX_MODE})"
assert_remote_lock
if ! apply_nginx_config
then
    printf '\nПРЕДУПРЕЖДЕНИЕ: ответ SSH при активации неуспешен; сверяю серверный маркер.\n' >&2
    if ! activation_is_committed; then
        set +e
        "${SSH[@]}" "test -s '/var/lib/chezakvest/deploy-transactions/${RELEASE_NAME}.activated'"
        marker_status=$?
        set -e
        if [[ "$marker_status" -eq 0 ]]; then
            PRESERVE_REMOTE_OWNER=1
            die "активация осталась в подготовленном или непроверенном состоянии; owner-token сохранён, выполните --rollback"
        elif [[ "$marker_status" -ne 1 ]]; then
            PRESERVE_REMOTE_OWNER=1
            die "состояние activation marker недоступно; owner-token сохранён до восстановления SSH"
        fi
        if ! current_after_failure="$(remote_current_target)"; then
            PRESERVE_REMOTE_OWNER=1
            die "связь с сервером не восстановилась; owner-token сохранён до согласованного recovery"
        fi
        if [[ "$current_after_failure" != "$PREVIOUS_TARGET" ]]; then
            PRESERVE_REMOTE_OWNER=1
            die "не удалось подтвердить прежнее согласованное состояние; owner-token сохранён"
        fi
        ensure_remote_lock_for_recovery \
            || die "lock принадлежит другой операции; неуспешный release не изменялся повторно"
        prune_remote_nginx_backups \
            || printf 'ПРЕДУПРЕЖДЕНИЕ: не удалось ограничить историю backup после отката.\n' >&2
        if ! finalize_failed_release; then
            PRESERVE_REMOTE_OWNER=1
            die "не удалось завершить очистку неуспешного release; owner-token сохранён"
        fi
        die "удалённая транзакция активации откачена"
    fi
    printf 'Сервер подтвердил завершённую транзакцию; продолжаю смоук.\n' >&2
fi
FINALIZED_NOT_ACTIVE=0
trap cleanup_local_config_and_lock EXIT
RELEASE_VERIFIED=0

rollback_activated_release_on_error() {
    local status="$1"
    trap - ERR INT TERM HUP
    set +e
    if (( RELEASE_VERIFIED )); then
        printf '\nОШИБКА: операция прервана после приёмки release; принятый release остаётся активным.\n' >&2
        exit "$status"
    fi
    printf '\nОШИБКА: сбой после активации; восстанавливаю прежние release и nginx одной транзакцией.\n' >&2
    if ! ensure_remote_lock_for_recovery; then
        PRESERVE_REMOTE_OWNER=1
        printf 'КРИТИЧНО: lock принадлежит другой операции; автоматический откат не выполнялся.\n' >&2
        exit "$status"
    fi
    if restore_previous_state; then
        prune_remote_nginx_backups || true
        if ! finalize_failed_release; then
            PRESERVE_REMOTE_OWNER=1
            printf 'КРИТИЧНО: прежнее состояние восстановлено, но marker/release не очищены; owner-token сохранён.\n' >&2
        fi
    else
        PRESERVE_REMOTE_OWNER=1
        printf 'КРИТИЧНО: откат не подтверждён; серверная транзакция сохраняет release/nginx согласованными.\n' >&2
    fi
    exit "$status"
}
trap 'rollback_activated_release_on_error $?' ERR
trap 'rollback_activated_release_on_error 130' INT TERM HUP

if ! smoke_site "$FULL_COMMIT" "$RELEASE_NAME"; then
    printf '\nОШИБКА: смоук завершился неуспешно; восстанавливаю релиз и nginx.\n' >&2
    assert_remote_lock
    if ! restore_previous_state; then
        PRESERVE_REMOTE_OWNER=1
        die "откат не завершён; owner-token сохранён для согласованного восстановления"
    fi
    prune_remote_nginx_backups \
        || printf 'ПРЕДУПРЕЖДЕНИЕ: не удалось ограничить историю backup после отката.\n' >&2
    if ! finalize_failed_release; then
        PRESERVE_REMOTE_OWNER=1
        die "прежнее состояние восстановлено, но marker/release не очищены; owner-token сохранён"
    fi
    exit 1
fi

assert_remote_lock
if ! "${SSH[@]}" bash -s -- "$REMOTE_RELEASE" "$FULL_COMMIT" "$RELEASE_NAME" <<'REMOTE_SCRIPT'
set -euo pipefail
release_dir="$1"
commit="$2"
release_name="$3"
printf '%s\t%s\n' "$commit" "$release_name" > "${release_dir}/.deploy-verified.new"
chmod 0444 "${release_dir}/.deploy-verified.new"
mv -f -- "${release_dir}/.deploy-verified.new" "${release_dir}/.deploy-verified"
REMOTE_SCRIPT
then
    printf '\nОШИБКА: не удалось отметить релиз как проверенный; восстанавливаю прежнее состояние.\n' >&2
    assert_remote_lock
    if ! restore_previous_state; then
        PRESERVE_REMOTE_OWNER=1
        die "откат не завершён; owner-token сохранён для согласованного восстановления"
    fi
    prune_remote_nginx_backups \
        || printf 'ПРЕДУПРЕЖДЕНИЕ: не удалось ограничить историю backup после отката.\n' >&2
    if ! finalize_failed_release; then
        PRESERVE_REMOTE_OWNER=1
        die "прежнее состояние восстановлено, но marker/release не очищены; owner-token сохранён"
    fi
    exit 1
fi
RELEASE_VERIFIED=1

log "Оставляю на сервере три последних релиза"
assert_remote_lock
"${SSH[@]}" bash -s -- \
    "$REMOTE_RELEASES" "$REMOTE_CURRENT" \
    "/var/lib/chezakvest/deploy-transactions/${RELEASE_NAME}.activated" <<'REMOTE_SCRIPT'
set -euo pipefail
releases_dir="$1"
current_link="$2"
activation_marker="$3"
active_target="$(readlink -f -- "$current_link")"

while IFS= read -r candidate; do
    release_name="${candidate##*/}"
    [[ "$release_name" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$ ]] || continue
    if [[ "$candidate" != "$active_target" && ! -f "${candidate}/.deploy-verified" ]]; then
        rm -rf -- "$candidate"
    fi
done < <(find "$releases_dir" -mindepth 1 -maxdepth 1 -type d -print)

mapfile -t accepted_releases < <(
    find "$releases_dir" -mindepth 2 -maxdepth 2 -type f -name .deploy-verified -printf '%h\n' \
        | sed -nE 's|^.*/([0-9]{8}T[0-9]{6}Z-[0-9a-f]{8})$|\1|p' \
        | sort -r
)
kept_nonactive=0
for release_name in "${accepted_releases[@]}"; do
    [[ "$release_name" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$ ]] || {
        printf 'Пропускаю неизвестный каталог: %s\n' "$release_name" >&2
        continue
    }
    candidate="${releases_dir}/${release_name}"
    if [[ "$candidate" == "$active_target" ]]; then
        continue
    fi
    if (( kept_nonactive < 2 )); then
        ((kept_nonactive += 1))
        continue
    fi
    rm -rf -- "${releases_dir:?}/${release_name}"
done

rm -f -- "$activation_marker"
REMOTE_SCRIPT

prune_remote_nginx_backups \
    || printf 'ПРЕДУПРЕЖДЕНИЕ: релиз завершён, но история nginx backup не ограничена.\n' >&2

cleanup_local_config
trap - EXIT
trap - ERR
release_owned_remote_lock
log "Релиз ${RELEASE_NAME} успешно выкачен"
