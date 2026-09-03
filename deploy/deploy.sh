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
    candidate="${releases_dir}/${release_name}"
    if [[ "$candidate" != "$current_target" && -f "${candidate}/version.json" ]]; then
        printf '%s\n' "$candidate"
        exit 0
    fi
done < <(find "$releases_dir" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r)
REMOTE_SCRIPT
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
    [[ -n "$target" ]] || die "предыдущий релиз не найден"
    log "Переключаю current на предыдущий релиз: $(basename "$target")"
    atomic_switch "$target"
    "${SSH[@]}" "nginx -t && systemctl reload nginx"
    smoke_site "$(expected_commit_for_release "$target")"
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
BUILD_TIME="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
RELEASE_STAMP="$(date -u +'%Y%m%dT%H%M%SZ')"
RELEASE_NAME="${RELEASE_STAMP}-${SHORT_COMMIT}"
REMOTE_RELEASE="${REMOTE_RELEASES}/${RELEASE_NAME}"

if (( DRY_RUN )); then
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

if (( SKIP_GATE )); then
    log "Гейт пропущен по флагу --skip-gate"
else
    log "Запускаю полный гейт npm run ci"
    npm run ci
fi

log "Собираю статический сайт"
npm run build

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

log "Готовлю каталоги на сервере и устанавливаю rsync при необходимости"
"${SSH[@]}" bash -s -- "$REMOTE_RELEASES" "$REMOTE_RELEASE" <<'REMOTE_SCRIPT'
set -euo pipefail
releases_dir="$1"
release_dir="$2"
if ! command -v rsync >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y rsync
fi
install -d -m 0755 "$releases_dir" "$release_dir" /var/www/acme/.well-known/acme-challenge
REMOTE_SCRIPT

log "Доставляю полный dist/ в ${RELEASE_NAME}"
rsync -a --delete -e "$RSYNC_SSH" dist/ "${REMOTE_HOST}:${REMOTE_RELEASE}/"

log "Проверяю доставку побайтовыми контрольными суммами"
RSYNC_DIFFERENCES="$(rsync -a --delete --checksum --dry-run --itemize-changes \
    -e "$RSYNC_SSH" dist/ "${REMOTE_HOST}:${REMOTE_RELEASE}/")"
[[ -z "$RSYNC_DIFFERENCES" ]] || {
    printf '%s\n' "$RSYNC_DIFFERENCES" >&2
    die "содержимое удалённого релиза отличается от dist/"
}

PREVIOUS_TARGET="$(remote_current_target)"
log "Атомарно переключаю current на ${RELEASE_NAME}"
atomic_switch "$REMOTE_RELEASE"

if ! (
    set -e
    log "Устанавливаю конфигурацию nginx с резервными копиями"
    scp -q -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 \
        "$NGINX_SOURCE" "${REMOTE_HOST}:/tmp/chezakvest.conf.new"
    scp -q -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 \
        "$REDIRECTS_SOURCE" "${REMOTE_HOST}:/tmp/chezakvest-legacy-redirects.conf.new"
    "${SSH[@]}" bash -s -- "$NGINX_TARGET" "$REDIRECTS_TARGET" <<'REMOTE_SCRIPT'
set -euo pipefail
nginx_target="$1"
redirects_target="$2"
backup_suffix="$(date -u +'%Y%m%dT%H%M%SZ')"
had_nginx=0
had_redirects=0
had_default=0

[[ -e "$nginx_target" ]] && had_nginx=1
[[ -e "$redirects_target" ]] && had_redirects=1
[[ -L /etc/nginx/sites-enabled/default ]] && had_default=1

(( had_nginx == 0 )) || cp -a "$nginx_target" "${nginx_target}.bak-${backup_suffix}"
(( had_redirects == 0 )) || cp -a "$redirects_target" "${redirects_target}.bak-${backup_suffix}"

install -m 0644 /tmp/chezakvest.conf.new "$nginx_target"
install -m 0644 /tmp/chezakvest-legacy-redirects.conf.new "$redirects_target"
ln -sfn "$nginx_target" /etc/nginx/sites-enabled/chezakvest.conf.new
mv -Tf /etc/nginx/sites-enabled/chezakvest.conf.new /etc/nginx/sites-enabled/chezakvest.conf
rm -f /etc/nginx/sites-enabled/default

if ! nginx -t; then
    rm -f /etc/nginx/sites-enabled/chezakvest.conf
    if (( had_nginx )); then
        cp -a "${nginx_target}.bak-${backup_suffix}" "$nginx_target"
        ln -sfn "$nginx_target" /etc/nginx/sites-enabled/chezakvest.conf
    else
        rm -f "$nginx_target"
    fi
    if (( had_redirects )); then
        cp -a "${redirects_target}.bak-${backup_suffix}" "$redirects_target"
    else
        rm -f "$redirects_target"
    fi
    (( had_default == 0 )) || ln -sfn /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
    rm -f /tmp/chezakvest.conf.new /tmp/chezakvest-legacy-redirects.conf.new
    nginx -t
    exit 1
fi

systemctl reload nginx
rm -f /tmp/chezakvest.conf.new /tmp/chezakvest-legacy-redirects.conf.new
REMOTE_SCRIPT

    smoke_site "$FULL_COMMIT"
); then
    printf '\nОШИБКА: релиз или смоук завершился неуспешно; возвращаю предыдущий релиз.\n' >&2
    if [[ -n "$PREVIOUS_TARGET" ]]; then
        atomic_switch "$PREVIOUS_TARGET"
        "${SSH[@]}" "nginx -t && systemctl reload nginx"
        printf 'Предыдущий релиз восстановлен: %s\n' "$(basename "$PREVIOUS_TARGET")" >&2
    else
        "${SSH[@]}" "rm -f '${REMOTE_CURRENT}' && nginx -t && systemctl reload nginx"
        printf 'Предыдущего релиза не было; новый current снят.\n' >&2
    fi
    exit 1
fi

log "Оставляю на сервере три последних релиза"
"${SSH[@]}" bash -s -- "$REMOTE_RELEASES" <<'REMOTE_SCRIPT'
set -euo pipefail
releases_dir="$1"
mapfile -t obsolete < <(
    find "$releases_dir" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' \
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
