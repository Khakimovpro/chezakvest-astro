#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="root@82.146.60.212"
SSH_KEY="${CHEZAKVEST_SSH_KEY:-${HOME}/.ssh/chezakvest_key}"
REMOTE_ROOT="/var/www/chezakvest"
REMOTE_RELEASES="${REMOTE_ROOT}/releases"
REMOTE_CURRENT="${REMOTE_ROOT}/current"
ORIGIN="http://82.146.60.212"
NGINX_SOURCE="deploy/nginx/chezakvest-stage.conf"
REDIRECTS_SOURCE="docs/nginx-legacy-redirects.conf"
NGINX_TARGET="/etc/nginx/sites-available/chezakvest.conf"
REDIRECTS_TARGET="/etc/nginx/snippets/chezakvest-legacy-redirects.conf"

DRY_RUN=0
SKIP_GATE=0
ROLLBACK=0
ALLOW_DIRTY=0

usage() {
    cat <<'EOF'
Использование: deploy/deploy.sh [--dry-run] [--skip-gate] [--rollback] [--allow-dirty]

  --dry-run      показать план, ничего не менять и не запускать сборку
  --skip-gate    пропустить npm run ci (npm run build всё равно выполняется)
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
[[ -f package.json && -f "$NGINX_SOURCE" && -f "$REDIRECTS_SOURCE" ]] \
    || die "не найдены обязательные файлы проекта"
[[ -r "$SSH_KEY" ]] || die "не найден SSH-ключ; задайте CHEZAKVEST_SSH_KEY"

SSH=(ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 "$REMOTE_HOST")
RSYNC_SSH="ssh -i ${SSH_KEY} -o BatchMode=yes -o ConnectTimeout=15"

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
    "${SSH[@]}" bash -s -- "$target" "$REMOTE_CURRENT" <<'REMOTE_SCRIPT'
set -euo pipefail
target="$1"
current_link="$2"
[[ -d "$target" && -f "${target}/version.json" ]] || {
    printf 'Целевой релиз неполон: %s\n' "$target" >&2
    exit 1
}
temporary_link="${current_link}.new"
ln -sfn "$target" "$temporary_link"
mv -Tf "$temporary_link" "$current_link"
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
    local temporary_dir headers body status actual_commit source target location remote_404_hash local_404_hash
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
    atomic_switch "$target"
    rollback_failed=0
    "${SSH[@]}" "nginx -t && systemctl reload nginx" || rollback_failed=1
    if (( ! rollback_failed )); then
        smoke_site "$expected_commit" || rollback_failed=1
    fi
    if (( rollback_failed )); then
        printf 'Откат не прошёл проверку; возвращаю исходный current.\n' >&2
        atomic_switch "$original_target"
        "${SSH[@]}" "nginx -t && systemctl reload nginx"
        die "откат отменён, исходный релиз восстановлен"
    fi
    log "Откат завершён успешно"
}

if (( ROLLBACK )); then
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

if (( DRY_RUN )); then
    RELEASE_STAMP="$(date -u +'%Y%m%dT%H%M%SZ')"
    RELEASE_NAME="${RELEASE_STAMP}-${SHORT_COMMIT}"
    log "Сухой запуск: изменений не будет"
    printf 'Коммит: %s\nВетка: %s\nБудущий релиз: %s\n' "$FULL_COMMIT" "$BRANCH" "$RELEASE_NAME"
    if (( SKIP_GATE )); then
        printf 'Гейт будет пропущен; сборка будет выполнена.\n'
    else
        printf 'Будут выполнены npm run ci и npm run build.\n'
    fi
    printf '%s\n' \
        'Далее: version.json, установка rsync при необходимости, доставка с checksum-проверкой,' \
        'атомарное переключение current, установка nginx-конфига с резервными копиями,' \
        'nginx -t, reload, HTTP-смоук и сохранение трёх последних релизов.'
    exit 0
fi

command -v rsync >/dev/null || die "локально не найден rsync"
command -v curl >/dev/null || die "локально не найден curl"
command -v node >/dev/null || die "локально не найден node"

if "${SSH[@]}" bash -s -- "$NGINX_TARGET" <<'REMOTE_SCRIPT'
target="$1"
[[ -f "$target" ]] && grep -Eq '^[[:space:]]*(listen[[:space:]].*443|ssl_certificate\b)' "$target"
REMOTE_SCRIPT
then
    die "на сервере уже обнаружен TLS-конфиг; stage-конфиг не будет его перезаписывать"
fi

if (( SKIP_GATE )); then
    log "Гейт пропущен по флагу --skip-gate"
else
    log "Запускаю полный гейт npm run ci"
    npm run ci
fi
assert_source_unchanged "гейт"

log "Собираю статический сайт"
npm run build
assert_source_unchanged "сборка"

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

log "Готовлю staging-каталог на сервере и устанавливаю rsync при необходимости"
"${SSH[@]}" bash -s -- "$REMOTE_RELEASES" "$REMOTE_RELEASE" "$REMOTE_STAGING" <<'REMOTE_SCRIPT'
set -euo pipefail
releases_dir="$1"
release_dir="$2"
staging_dir="$3"
if ! command -v rsync >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y rsync
fi
[[ "$release_dir" == "${releases_dir}/"* && "$staging_dir" == "${release_dir}.incoming" ]]
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
trap cleanup_remote_staging EXIT

log "Доставляю полный dist/ в ${RELEASE_NAME}"
rsync -a --delete --chown=root:root -e "$RSYNC_SSH" dist/ "${REMOTE_HOST}:${REMOTE_STAGING}/"

log "Проверяю доставку побайтовыми контрольными суммами"
RSYNC_DIFFERENCES="$(rsync -a --delete --chown=root:root --checksum --dry-run --itemize-changes \
    -e "$RSYNC_SSH" dist/ "${REMOTE_HOST}:${REMOTE_STAGING}/")"
[[ -z "$RSYNC_DIFFERENCES" ]] || {
    printf '%s\n' "$RSYNC_DIFFERENCES" >&2
    die "содержимое удалённого релиза отличается от dist/"
}

log "Атомарно завершаю проверенный staging-релиз"
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
trap cleanup_unactivated_release EXIT

PREVIOUS_TARGET="$(remote_current_target)"
NGINX_STATE="$("${SSH[@]}" bash -s -- "$NGINX_TARGET" "$REDIRECTS_TARGET" <<'REMOTE_SCRIPT'
nginx_target="$1"
redirects_target="$2"
had_nginx=0; had_redirects=0; had_enabled=0; had_default=0
[[ -e "$nginx_target" ]] && had_nginx=1
[[ -e "$redirects_target" ]] && had_redirects=1
[[ -L /etc/nginx/sites-enabled/chezakvest.conf ]] && had_enabled=1
[[ -L /etc/nginx/sites-enabled/default ]] && had_default=1
printf '%s %s %s %s\n' "$had_nginx" "$had_redirects" "$had_enabled" "$had_default"
REMOTE_SCRIPT
)"
read -r HAD_NGINX HAD_REDIRECTS HAD_ENABLED HAD_DEFAULT <<< "$NGINX_STATE"

restore_release_link() {
    if [[ -n "$PREVIOUS_TARGET" ]]; then
        atomic_switch "$PREVIOUS_TARGET"
        printf 'Предыдущий релиз восстановлен: %s\n' "$(basename "$PREVIOUS_TARGET")" >&2
    else
        "${SSH[@]}" "unlink '${REMOTE_CURRENT}' 2>/dev/null || true"
        printf 'Предыдущего релиза не было; новый current снят.\n' >&2
    fi
}

discard_failed_release() {
    "${SSH[@]}" bash -s -- "$REMOTE_RELEASES" "$REMOTE_RELEASE" "$REMOTE_CURRENT" <<'REMOTE_SCRIPT'
set -euo pipefail
releases_dir="$1"
release_dir="$2"
current_link="$3"
release_name="${release_dir##*/}"
[[ "$release_dir" == "${releases_dir}/${release_name}" ]]
[[ "$release_name" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$ ]]
active_target="$(readlink -f -- "$current_link" 2>/dev/null || true)"
[[ "$active_target" != "$release_dir" ]] || {
    printf 'Нельзя удалить активный неуспешный релиз.\n' >&2
    exit 1
}
rm -rf -- "$release_dir"
REMOTE_SCRIPT
}

restore_nginx_state() {
    "${SSH[@]}" bash -s -- "$NGINX_TARGET" "$REDIRECTS_TARGET" "$RELEASE_STAMP" \
        "$HAD_NGINX" "$HAD_REDIRECTS" "$HAD_ENABLED" "$HAD_DEFAULT" <<'REMOTE_SCRIPT'
set -euo pipefail
nginx_target="$1"; redirects_target="$2"; suffix="$3"
had_nginx="$4"; had_redirects="$5"; had_enabled="$6"; had_default="$7"

rm -f /etc/nginx/sites-enabled/chezakvest.conf /etc/nginx/sites-enabled/default
if (( had_nginx )); then
    cp -a "${nginx_target}.bak-${suffix}" "$nginx_target"
else
    rm -f "$nginx_target"
fi
if (( had_redirects )); then
    cp -a "${redirects_target}.bak-${suffix}" "$redirects_target"
else
    rm -f "$redirects_target"
fi
(( had_enabled == 0 )) || ln -sfn "$nginx_target" /etc/nginx/sites-enabled/chezakvest.conf
(( had_default == 0 )) || ln -sfn /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
REMOTE_SCRIPT
}

log "Атомарно переключаю current на ${RELEASE_NAME}"
atomic_switch "$REMOTE_RELEASE"
FINALIZED_NOT_ACTIVE=0
trap - EXIT

apply_nginx_config() {
    scp -q -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 \
        "$NGINX_SOURCE" "${REMOTE_HOST}:/tmp/chezakvest.conf.new" || return 1
    scp -q -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 \
        "$REDIRECTS_SOURCE" "${REMOTE_HOST}:/tmp/chezakvest-legacy-redirects.conf.new" || return 1
    "${SSH[@]}" bash -s -- "$NGINX_TARGET" "$REDIRECTS_TARGET" "$RELEASE_STAMP" \
        "$HAD_NGINX" "$HAD_REDIRECTS" "$HAD_ENABLED" "$HAD_DEFAULT" <<'REMOTE_SCRIPT'
set -euo pipefail
nginx_target="$1"; redirects_target="$2"; backup_suffix="$3"
had_nginx="$4"; had_redirects="$5"; had_enabled="$6"; had_default="$7"

restore_previous_config() {
    rm -f /etc/nginx/sites-enabled/chezakvest.conf /etc/nginx/sites-enabled/default
    if (( had_nginx )) && [[ -e "${nginx_target}.bak-${backup_suffix}" ]]; then
        cp -a "${nginx_target}.bak-${backup_suffix}" "$nginx_target"
    elif (( ! had_nginx )); then
        rm -f "$nginx_target"
    fi
    if (( had_redirects )) && [[ -e "${redirects_target}.bak-${backup_suffix}" ]]; then
        cp -a "${redirects_target}.bak-${backup_suffix}" "$redirects_target"
    elif (( ! had_redirects )); then
        rm -f "$redirects_target"
    fi
    (( had_enabled == 0 )) || ln -sfn "$nginx_target" /etc/nginx/sites-enabled/chezakvest.conf
    (( had_default == 0 )) || ln -sfn /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
    rm -f /tmp/chezakvest.conf.new /tmp/chezakvest-legacy-redirects.conf.new
    if nginx -t; then systemctl reload nginx || true; fi
}

on_exit() {
    status=$?
    trap - EXIT
    if (( status != 0 )); then restore_previous_config; fi
    exit "$status"
}
trap on_exit EXIT

(( had_nginx == 0 )) || cp -a "$nginx_target" "${nginx_target}.bak-${backup_suffix}"
(( had_redirects == 0 )) || cp -a "$redirects_target" "${redirects_target}.bak-${backup_suffix}"

install -m 0644 /tmp/chezakvest.conf.new "$nginx_target"
install -m 0644 /tmp/chezakvest-legacy-redirects.conf.new "$redirects_target"
ln -sfn "$nginx_target" /etc/nginx/sites-enabled/chezakvest.conf.new
mv -Tf /etc/nginx/sites-enabled/chezakvest.conf.new /etc/nginx/sites-enabled/chezakvest.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
rm -f /tmp/chezakvest.conf.new /tmp/chezakvest-legacy-redirects.conf.new
trap - EXIT
REMOTE_SCRIPT
}

log "Устанавливаю конфигурацию nginx с резервными копиями"
if ! apply_nginx_config
then
    printf '\nОШИБКА: nginx не принял конфигурацию; возвращаю предыдущий релиз.\n' >&2
    restore_release_link
    "${SSH[@]}" "nginx -t && systemctl reload nginx"
    discard_failed_release
    exit 1
fi

if ! smoke_site "$FULL_COMMIT"; then
    printf '\nОШИБКА: смоук завершился неуспешно; восстанавливаю релиз и nginx.\n' >&2
    restore_release_link
    restore_nginx_state
    discard_failed_release
    exit 1
fi

if ! "${SSH[@]}" "install -o root -g root -m 0444 /dev/null '${REMOTE_RELEASE}/.deploy-verified'"; then
    printf '\nОШИБКА: не удалось отметить релиз как проверенный; восстанавливаю прежнее состояние.\n' >&2
    restore_release_link
    restore_nginx_state
    discard_failed_release
    exit 1
fi

log "Оставляю на сервере три последних релиза"
"${SSH[@]}" bash -s -- "$REMOTE_RELEASES" <<'REMOTE_SCRIPT'
set -euo pipefail
releases_dir="$1"
mapfile -t obsolete < <(
    find "$releases_dir" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' \
        | grep -E '^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$' \
        | sort -r \
        | tail -n +4
)
for release_name in "${obsolete[@]}"; do
    [[ "$release_name" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$ ]] || {
        printf 'Пропускаю неизвестный каталог: %s\n' "$release_name" >&2
        continue
    }
    rm -rf -- "${releases_dir:?}/${release_name}"
done
REMOTE_SCRIPT

log "Релиз ${RELEASE_NAME} успешно выкачен"
