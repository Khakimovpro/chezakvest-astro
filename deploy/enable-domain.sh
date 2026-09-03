#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="root@82.146.60.212"
SERVER_IP="82.146.60.212"
SSH_KEY="${CHEZAKVEST_SSH_KEY:-${HOME}/.ssh/chezakvest_key}"
CANONICAL_HOST="xn--80aehcht5ci1b.xn--p1ai"
# This is the only list of domain names used by the cutover.
DOMAIN_CANDIDATES=(
    "$CANONICAL_HOST"
    "www.xn--80aehcht5ci1b.xn--p1ai"
    "chezakvest.ru"
    "www.chezakvest.ru"
)

PROD_TEMPLATE="deploy/nginx/chezakvest-prod.conf"
COMMON_SOURCE="deploy/nginx/chezakvest-common.conf"
REMOTE_SITE_CONFIG="/etc/nginx/sites-available/chezakvest.conf"
REMOTE_COMMON_CONFIG="/etc/nginx/snippets/chezakvest-common.conf"
REMOTE_ACME_ROOT="/var/www/acme"
REMOTE_ROLLBACK_STATE="/var/lib/chezakvest/domain-cutover/rollback.tsv"
REMOTE_RENEW_HOOK="/etc/letsencrypt/renewal-hooks/deploy/chezakvest-nginx-reload"

DRY_RUN=0
ONLY_CERT=0
ROLLBACK=0
REMOTE_TMP=""
LOCAL_TMP=""
TRANSACTION_STARTED=0
TRANSACTION_ID=""
CUTOVER_LOCK_FD=""
CONFIRMED_DOMAINS=()
ALTERNATIVE_DOMAINS=()

usage() {
    cat <<'EOF'
Использование: deploy/enable-domain.sh [--dry-run] [--only-cert | --rollback]

  --dry-run    проверить предпосылки и показать полный план без изменений
  --only-cert  выпустить/обновить сертификат, не переключая конфигурацию nginx
  --rollback   восстановить конфигурацию nginx, сохранённую перед переключением

Если задан CERTBOT_EMAIL, Certbot зарегистрирует его для уведомлений. Без переменной
используется неинтерактивная регистрация без e-mail.
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
        --only-cert) ONLY_CERT=1 ;;
        --rollback) ROLLBACK=1 ;;
        -h|--help) usage; exit 0 ;;
        *) die "неизвестный аргумент: ${argument}" ;;
    esac
done

if (( ONLY_CERT && ROLLBACK )); then
    die "--only-cert и --rollback нельзя использовать вместе"
fi

REPOSITORY_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" \
    || die "команда должна запускаться из Git-репозитория"
[[ "$(pwd -P)" == "$(cd "$REPOSITORY_ROOT" && pwd -P)" ]] \
    || die "запустите скрипт из корня репозитория: ${REPOSITORY_ROOT}"
[[ -r "$SSH_KEY" ]] || die "не найден SSH-ключ; задайте CHEZAKVEST_SSH_KEY"

for command_name in ssh scp dig curl openssl sed grep awk sort head tail flock; do
    command -v "$command_name" >/dev/null \
        || die "не найдена обязательная команда: ${command_name}"
done

if (( ! ROLLBACK )); then
    [[ -f "$PROD_TEMPLATE" && -f "$COMMON_SOURCE" ]] \
        || die "не найдены шаблон production nginx или общий конфиг"
fi

SSH=(ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 "$REMOTE_HOST")
SCP=(scp -q -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15)

if (( ! DRY_RUN )); then
    exec {CUTOVER_LOCK_FD}>/tmp/chezakvest-enable-domain.lock
    flock -n "$CUTOVER_LOCK_FD" \
        || die "другой enable-domain.sh уже выполняется; дождитесь его завершения"
fi

cleanup() {
    if [[ -n "$LOCAL_TMP" && -d "$LOCAL_TMP" ]]; then
        rm -rf -- "$LOCAL_TMP"
    fi
    if [[ "$REMOTE_TMP" =~ ^/tmp/chezakvest-domain\.[A-Za-z0-9]+$ ]]; then
        "${SSH[@]}" "rm -rf -- '$REMOTE_TMP'" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

query_a_records() {
    local domain="$1"
    dig +short A "$domain" \
        | awk '/^([0-9]{1,3}\.){3}[0-9]{1,3}$/' \
        | sort -u
}

query_aaaa_records() {
    local domain="$1"
    dig +short AAAA "$domain" \
        | awk '/^[0-9a-fA-F:]+$/' \
        | sort -u
}

inspect_dns() {
    local strict="$1"
    local domain a_records aaaa_records a_printable aaaa_printable
    local canonical_ok=0

    CONFIRMED_DOMAINS=()
    ALTERNATIVE_DOMAINS=()

    log "Проверяю A-записи доменов"
    for domain in "${DOMAIN_CANDIDATES[@]}"; do
        a_records="$(query_a_records "$domain")"
        aaaa_records="$(query_aaaa_records "$domain")"
        a_printable="${a_records//$'\n'/, }"
        aaaa_printable="${aaaa_records//$'\n'/, }"
        [[ -n "$a_printable" ]] || a_printable="нет A-записи"
        [[ -n "$aaaa_printable" ]] || aaaa_printable="нет"

        if [[ "$a_records" == "$SERVER_IP" && -z "$aaaa_records" ]]; then
            printf '  ГОТОВО  %-42s A=%s, AAAA=нет\n' "$domain" "$SERVER_IP"
            CONFIRMED_DOMAINS+=("$domain")
            if [[ "$domain" == "$CANONICAL_HOST" ]]; then
                canonical_ok=1
            else
                ALTERNATIVE_DOMAINS+=("$domain")
            fi
        elif [[ "$domain" == "$CANONICAL_HOST" ]]; then
            printf '  НЕ ГОТОВО  %-40s A=%s, AAAA=%s\n' \
                "$domain" "$a_printable" "$aaaa_printable"
        else
            printf '  ПРОПУСК  %-42s A=%s, AAAA=%s\n' \
                "$domain" "$a_printable" "$aaaa_printable"
        fi
    done

    if (( strict && ! canonical_ok )); then
        printf '\nВ Beget создайте/замените A-записи @ и www для чезаквест.рф на %s.\n' \
            "$SERVER_IP" >&2
        printf 'Дополнительные chezakvest.ru и www.chezakvest.ru переводите только если они нужны.\n' >&2
        printf 'Старую AAAA-запись веб-хоста удалите: на новом сервере IPv6 не настроен.\n' >&2
        printf 'MX, TXT, SPF, DKIM и DMARC не меняйте. Подождите TTL и повторите команду.\n' >&2
        return 1
    fi
}

remote_nginx_version() {
    local raw
    raw="$("${SSH[@]}" 'nginx -v 2>&1')" || return 1
    [[ "$raw" =~ nginx/([0-9]+\.[0-9]+\.[0-9]+) ]] || return 1
    printf '%s\n' "${BASH_REMATCH[1]}"
}

supports_http2_directive() {
    local version="$1"
    local first
    first="$(printf '%s\n' '1.25.1' "$version" | sort -V | head -n 1)"
    [[ "$first" == "1.25.1" ]]
}

print_dry_run() {
    local nginx_version timer_enabled timer_active
    inspect_dns 0
    nginx_version="$(remote_nginx_version)" \
        || die "не удалось определить версию nginx на сервере"
    timer_enabled="$("${SSH[@]}" 'systemctl is-enabled certbot.timer 2>&1 || true')"
    timer_active="$("${SSH[@]}" 'systemctl is-active certbot.timer 2>&1 || true')"

    log "Сухой запуск: изменений не будет"
    printf 'Сервер: %s (%s)\n' "$REMOTE_HOST" "$SERVER_IP"
    printf 'nginx: %s; certbot.timer: %s/%s\n' "$nginx_version" "$timer_enabled" "$timer_active"
    if supports_http2_directive "$nginx_version"; then
        printf 'HTTP/2 будет включён директивой: http2 on;\n'
    else
        printf 'HTTP/2 будет включён совместимым с nginx %s параметром listen ... http2.\n' \
            "$nginx_version"
    fi

    if (( ROLLBACK )); then
        if "${SSH[@]}" "test -s '$REMOTE_ROLLBACK_STATE'"; then
            printf '%s\n' \
                'План: восстановить сохранённые site/common-конфиги, выполнить nginx -t,' \
                'reload nginx и проверить HTTP-ответ сервера.'
        else
            printf 'Сохранённого состояния для отката пока нет: %s\n' "$REMOTE_ROLLBACK_STATE"
        fi
        return 0
    fi

    if (( ONLY_CERT )); then
        printf '%s\n' \
            'План: потребовать A-запись основного домена, выбрать доступные альтернативы,' \
            'проверить ACME webroot, запустить Certbot и настроить timer/deploy-hook.'
        return 0
    fi

    printf '%s\n' \
        'План: потребовать A-запись основного домена и автоматически выбрать альтернативы;' \
        'сохранить предыдущие site/common-конфиги рядом с суффиксом .bak-<UTC-время>;' \
        'включить временную HTTP-конфигурацию с noindex и проверить ACME webroot;' \
        'выпустить сертификат, включить автопродление и HTTPS без HSTS;' \
        'проверить HTTP 200, цепочку сертификата и срок действия;' \
        'включить HSTS, снять X-Robots-Tag и выполнить строгий npm run verify:live;' \
        'при любой ошибке после начала транзакции восстановить предыдущий nginx.'
}

if (( DRY_RUN )); then
    print_dry_run
    exit 0
fi

restore_remote_config() {
    local expected_transaction_id="${1:-}"
    "${SSH[@]}" bash -s -- "$REMOTE_ROLLBACK_STATE" "$expected_transaction_id" <<'REMOTE_SCRIPT'
set -euo pipefail
state_file="$1"
expected_transaction_id="$2"
[[ -s "$state_file" ]] || {
    printf 'Состояние для отката не найдено: %s\n' "$state_file" >&2
    exit 1
}

if [[ -n "$expected_transaction_id" ]]; then
    IFS=$'\t' read -r marker actual_transaction_id ignored < "$state_file"
    [[ "$marker" == "#" && "$actual_transaction_id" == "$expected_transaction_id" ]] || {
        printf 'Rollback-state принадлежит другой транзакции; автоматический откат остановлен.\n' >&2
        exit 1
    }
fi

while IFS=$'\t' read -r target existed backup; do
    [[ "$target" == "#" ]] && continue
    [[ "$target" == /etc/nginx/* && "$existed" =~ ^[01]$ ]] || {
        printf 'Некорректная строка состояния отката.\n' >&2
        exit 1
    }
    if [[ "$existed" == "1" ]]; then
        [[ "$backup" == "${target}.bak-"* && -f "$backup" ]] || {
            printf 'Не найдена резервная копия: %s\n' "$backup" >&2
            exit 1
        }
    fi
done < "$state_file"

while IFS=$'\t' read -r target existed backup; do
    [[ "$target" == "#" ]] && continue
    if [[ "$existed" == "1" ]]; then
        rm -f -- "$target"
        cp -a -- "$backup" "$target"
    else
        rm -f -- "$target"
    fi
done < "$state_file"

nginx -t
systemctl reload nginx
used_state="${state_file}.used-$(date -u +'%Y%m%dT%H%M%SZ')"
mv -- "$state_file" "$used_state"
printf 'Предыдущая конфигурация nginx восстановлена. Состояние: %s\n' "$used_state"
REMOTE_SCRIPT
}

if (( ROLLBACK )); then
    log "Восстанавливаю предыдущую конфигурацию nginx"
    restore_remote_config \
        || die "автоматический откат не удался; не меняйте DNS и проверьте nginx на сервере"
    status="$(curl --noproxy '*' -sS -o /dev/null -w '%{http_code}' \
        --connect-timeout 10 --max-time 30 "http://${SERVER_IP}/")" \
        || die "nginx восстановлен, но HTTP-проверка сервера не прошла"
    [[ "$status" =~ ^[23][0-9][0-9]$ ]] \
        || die "nginx восстановлен, но сервер вернул HTTP ${status}"
    log "Откат завершён; для возврата на Tilda восстановите прежние A-записи в Beget/REG.RU"
    exit 0
fi

inspect_dns 1 || die "основной домен ещё не указывает только на ${SERVER_IP}"

SERVER_NAMES="${CONFIRMED_DOMAINS[*]}"
ALTERNATIVE_NAMES="${ALTERNATIVE_DOMAINS[*]:-}"
NGINX_VERSION="$(remote_nginx_version)" \
    || die "не удалось определить версию nginx на сервере"

if supports_http2_directive "$NGINX_VERSION"; then
    HTTP2_LISTEN_SUFFIX=""
    HTTP2_DIRECTIVE="http2 on;"
else
    HTTP2_LISTEN_SUFFIX=" http2"
    HTTP2_DIRECTIVE="# nginx ${NGINX_VERSION}: HTTP/2 включён параметром listen ... http2"
fi

LOCAL_TMP="$(mktemp -d)"
TRANSACTION_ID="$(date -u +'%Y%m%dT%H%M%SZ')-$$-${RANDOM}"

render_prod_config() {
    local robots_header="$1"
    local hsts_header="$2"
    local output="$3"

    sed \
        -e "s|__SERVER_NAMES__|${SERVER_NAMES}|g" \
        -e "s|__CANONICAL_HOST__|${CANONICAL_HOST}|g" \
        -e "s|__CERTIFICATE_NAME__|${CANONICAL_HOST}|g" \
        -e "s|__ALTERNATIVE_NAMES__|${ALTERNATIVE_NAMES}|g" \
        -e "s|__HTTP2_LISTEN_SUFFIX__|${HTTP2_LISTEN_SUFFIX}|g" \
        -e "s|__HTTP2_DIRECTIVE__|${HTTP2_DIRECTIVE}|g" \
        -e "s|__ROBOTS_HEADER__|${robots_header}|g" \
        -e "s|__HSTS_HEADER__|${hsts_header}|g" \
        "$PROD_TEMPLATE" > "$output"

    if grep -Eq '__[A-Z0-9_]+__' "$output"; then
        printf 'После рендера nginx остались незаполненные маркеры.\n' >&2
        return 1
    fi
}

render_bootstrap_config() {
    cat > "$LOCAL_TMP/bootstrap.conf" <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${SERVER_NAMES};

    set \$chezakvest_robots_header "noindex, nofollow";
    set \$chezakvest_hsts_header "";
    include /etc/nginx/snippets/chezakvest-common.conf;
}
EOF
}

render_bootstrap_config
render_prod_config "noindex, nofollow" "" \
    "$LOCAL_TMP/tls-pre-hsts.conf"
render_prod_config "" "max-age=31536000" \
    "$LOCAL_TMP/tls-final.conf"
cp -- "$COMMON_SOURCE" "$LOCAL_TMP/common.conf"

REMOTE_TMP="$("${SSH[@]}" 'mktemp -d /tmp/chezakvest-domain.XXXXXX')" \
    || die "не удалось создать временный каталог на сервере"
[[ "$REMOTE_TMP" =~ ^/tmp/chezakvest-domain\.[A-Za-z0-9]+$ ]] \
    || die "сервер вернул небезопасный путь временного каталога"

"${SCP[@]}" \
    "$LOCAL_TMP/bootstrap.conf" \
    "$LOCAL_TMP/tls-pre-hsts.conf" \
    "$LOCAL_TMP/tls-final.conf" \
    "$LOCAL_TMP/common.conf" \
    "${REMOTE_HOST}:${REMOTE_TMP}/" \
    || die "не удалось передать временные конфиги на сервер"

begin_transaction() {
    "${SSH[@]}" bash -s -- \
        "$REMOTE_TMP" "$REMOTE_SITE_CONFIG" "$REMOTE_COMMON_CONFIG" "$REMOTE_ROLLBACK_STATE" \
        "$TRANSACTION_ID" \
        <<'REMOTE_SCRIPT'
set -euo pipefail
source_dir="$1"
site_target="$2"
common_target="$3"
state_file="$4"
transaction_id="$5"
stamp="$(date -u +'%Y%m%dT%H%M%SZ')"
pending_state="${source_dir}/rollback.tsv"

mkdir -p -- "$(dirname "$state_file")" /var/www/acme/.well-known/acme-challenge
printf '#\t%s\t-\n' "$transaction_id" > "$pending_state"

for target in "$site_target" "$common_target"; do
    if [[ -e "$target" || -L "$target" ]]; then
        backup="${target}.bak-${stamp}"
        [[ ! -e "$backup" && ! -L "$backup" ]] || {
            printf 'Резервная копия уже существует: %s\n' "$backup" >&2
            exit 1
        }
        cp -a -- "$target" "$backup"
        printf '%s\t1\t%s\n' "$target" "$backup" >> "$pending_state"
    else
        printf '%s\t0\t-\n' "$target" >> "$pending_state"
    fi
done

restore_pending() {
    while IFS=$'\t' read -r target existed backup; do
        [[ "$target" == "#" ]] && continue
        if [[ "$existed" == "1" ]]; then
            rm -f -- "$target"
            cp -a -- "$backup" "$target"
        else
            rm -f -- "$target"
        fi
    done < "$pending_state"
}

rollback_on_error() {
    status=$?
    [[ "$status" -ne 0 ]] || status=1
    trap - ERR HUP INT TERM
    set +e
    restore_pending
    if nginx -t; then
        systemctl reload nginx
    fi
    printf 'Не удалось включить bootstrap-конфиг; предыдущие файлы восстановлены.\n' >&2
    exit "$status"
}

trap rollback_on_error ERR HUP INT TERM

install -o root -g root -m 0644 "${source_dir}/common.conf" "${common_target}.new"
mv -f -- "${common_target}.new" "$common_target"
install -o root -g root -m 0644 "${source_dir}/bootstrap.conf" "${site_target}.new"
mv -f -- "${site_target}.new" "$site_target"

nginx -t
systemctl reload nginx

if [[ -e "$state_file" ]]; then
    cp -a -- "$state_file" "${state_file}.bak-${stamp}"
fi
install -o root -g root -m 0600 "$pending_state" "${state_file}.new"
mv -f -- "${state_file}.new" "$state_file"
trap - ERR HUP INT TERM
printf 'Bootstrap-конфиг включён; резервное состояние: %s\n' "$state_file"
REMOTE_SCRIPT
}

remote_transaction_state_status() {
    "${SSH[@]}" bash -s -- "$REMOTE_ROLLBACK_STATE" "$TRANSACTION_ID" <<'REMOTE_SCRIPT'
set -euo pipefail
state_file="$1"
expected_id="$2"
[[ -s "$state_file" ]] || exit 1
IFS=$'\t' read -r marker actual_id ignored < "$state_file"
[[ "$marker" == "#" && "$actual_id" == "$expected_id" ]]
REMOTE_SCRIPT
}

install_site_config() {
    local remote_name="$1"
    "${SSH[@]}" bash -s -- "$REMOTE_TMP" "$remote_name" "$REMOTE_SITE_CONFIG" <<'REMOTE_SCRIPT'
set -euo pipefail
source_dir="$1"
source_name="$2"
target="$3"
install -o root -g root -m 0644 "${source_dir}/${source_name}" "${target}.new"
mv -f -- "${target}.new" "$target"
nginx -t
systemctl reload nginx
REMOTE_SCRIPT
}

rollback_after_failure() {
    local reason="$1"
    printf '\nОШИБКА: %s\n' "$reason" >&2
    if (( TRANSACTION_STARTED )); then
        printf 'Возвращаю предыдущую конфигурацию nginx...\n' >&2
        if restore_remote_config "$TRANSACTION_ID"; then
            printf 'Предыдущая конфигурация nginx восстановлена. Исправьте причину и повторите команду.\n' >&2
        else
            printf 'КРИТИЧНО: автоматический откат не прошёл. Не меняйте DNS дальше и проверьте nginx вручную.\n' >&2
        fi
    fi
    exit 1
}

rollback_unhandled_error() {
    local status="$1"
    trap - ERR
    set +e
    printf '\nОШИБКА: непредвиденный сбой после начала переключения; запускаю откат nginx.\n' >&2
    restore_remote_config "$TRANSACTION_ID"
    exit "$status"
}

rollback_on_signal() {
    trap - INT TERM HUP ERR
    set +e
    printf '\nОШИБКА: переключение прервано сигналом; запускаю откат nginx.\n' >&2
    restore_remote_config "$TRANSACTION_ID"
    exit 130
}

probe_acme_webroot() {
    local token body domain received
    token="domain-cutover-$(date -u +'%Y%m%dT%H%M%SZ')-$$"
    body="chezakvest-acme-ok-${token}"
    "${SSH[@]}" bash -s -- "$REMOTE_ACME_ROOT" "$token" "$body" <<'REMOTE_SCRIPT'
set -euo pipefail
root="$1"
token="$2"
body="$3"
directory="${root}/.well-known/acme-challenge"
mkdir -p -- "$directory"
printf '%s' "$body" > "${directory}/${token}"
REMOTE_SCRIPT

    for domain in "${CONFIRMED_DOMAINS[@]}"; do
        if ! received="$(curl --noproxy '*' -fsS --connect-timeout 10 --max-time 30 \
            "http://${domain}/.well-known/acme-challenge/${token}")"; then
            "${SSH[@]}" "rm -f -- '${REMOTE_ACME_ROOT}/.well-known/acme-challenge/${token}'" || true
            printf 'ACME-файл не отдался через http://%s/.well-known/acme-challenge/.\n' "$domain" >&2
            return 1
        fi
        if [[ "$received" != "$body" ]]; then
            "${SSH[@]}" "rm -f -- '${REMOTE_ACME_ROOT}/.well-known/acme-challenge/${token}'" || true
            printf 'ACME-проверка %s вернула неожиданное содержимое.\n' "$domain" >&2
            return 1
        fi
    done

    "${SSH[@]}" "rm -f -- '${REMOTE_ACME_ROOT}/.well-known/acme-challenge/${token}'"
}

issue_certificate() {
    "${SSH[@]}" bash -s -- \
        "$REMOTE_ACME_ROOT" "$CANONICAL_HOST" "${CERTBOT_EMAIL:-}" "${CONFIRMED_DOMAINS[@]}" \
        <<'REMOTE_SCRIPT'
set -euo pipefail
webroot="$1"
cert_name="$2"
email="$3"
shift 3
domains=("$@")
log_file="$(mktemp /tmp/chezakvest-certbot.XXXXXX.log)"
trap 'rm -f -- "$log_file"' EXIT

command -v certbot >/dev/null || {
    printf 'На сервере не установлен certbot.\n' >&2
    exit 1
}

args=(
    certonly --webroot -w "$webroot"
    --non-interactive --agree-tos
    --cert-name "$cert_name"
    --keep-until-expiring --expand
)
if [[ -n "$email" ]]; then
    args+=(--email "$email")
else
    args+=(--register-unsafely-without-email)
fi
for domain in "${domains[@]}"; do
    args+=(-d "$domain")
done

if certbot "${args[@]}" >"$log_file" 2>&1; then
    tail -n 12 "$log_file"
    exit 0
fi

printf 'Certbot не смог подтвердить один или несколько доменов.\n' >&2
printf 'Проверьте, что все выбранные A-записи указывают только на этот сервер и доступны по HTTP.\n' >&2
printf 'Диагностика Certbot:\n' >&2
if ! grep -E '^(Domain:|Type:|Detail:|Hint:)|DNS problem|unauthorized|Timeout during connect' \
    "$log_file" | tail -n 20 >&2; then
    tail -n 12 "$log_file" >&2
fi
exit 1
REMOTE_SCRIPT
}

configure_renewal() {
    "${SSH[@]}" bash -s -- "$REMOTE_RENEW_HOOK" <<'REMOTE_SCRIPT'
set -euo pipefail
hook="$1"
stamp="$(date -u +'%Y%m%dT%H%M%SZ')"
mkdir -p -- "$(dirname "$hook")"
cat > "${hook}.new" <<'HOOK'
#!/bin/sh
set -eu
nginx -t
systemctl reload nginx
HOOK
chown root:root "${hook}.new"
chmod 0755 "${hook}.new"
if [[ -e "$hook" ]] && cmp -s -- "${hook}.new" "$hook"; then
    rm -f -- "${hook}.new"
else
    if [[ -e "$hook" ]]; then
        cp -a -- "$hook" "${hook}.bak-${stamp}"
    fi
    mv -f -- "${hook}.new" "$hook"
fi
systemctl enable --now certbot.timer
systemctl is-enabled --quiet certbot.timer
systemctl is-active --quiet certbot.timer
"$hook"
REMOTE_SCRIPT
}

verify_https() {
    local status certificate_dump expiry alpn_output
    status="$(curl --noproxy '*' --proto '=https' --tlsv1.2 -sS \
        --connect-timeout 15 --max-time 60 -o /dev/null -w '%{http_code}' \
        "https://${CANONICAL_HOST}/")" || return 1
    [[ "$status" == "200" ]] || {
        printf 'HTTPS-главная вернула HTTP %s вместо 200.\n' "$status" >&2
        return 1
    }

    certificate_dump="$LOCAL_TMP/certificate-chain.pem"
    if ! openssl s_client \
        -connect "${CANONICAL_HOST}:443" \
        -servername "$CANONICAL_HOST" \
        -verify_return_error \
        -showcerts < /dev/null > "$certificate_dump" 2> "$LOCAL_TMP/openssl.log"; then
        printf 'OpenSSL не подтвердил цепочку сертификата.\n' >&2
        sed -n '1,20p' "$LOCAL_TMP/openssl.log" >&2
        return 1
    fi
    grep -Fq 'Verify return code: 0 (ok)' "$certificate_dump" || {
        printf 'В выводе OpenSSL нет успешной проверки цепочки.\n' >&2
        return 1
    }
    openssl x509 -in "$certificate_dump" -noout -checkend 604800 >/dev/null || {
        printf 'Сертификат истекает менее чем через 7 дней.\n' >&2
        return 1
    }
    expiry="$(openssl x509 -in "$certificate_dump" -noout -enddate)"
    alpn_output="$(openssl s_client \
        -connect "${CANONICAL_HOST}:443" \
        -servername "$CANONICAL_HOST" \
        -alpn h2 < /dev/null 2>/dev/null)" || return 1
    grep -Fq 'ALPN protocol: h2' <<< "$alpn_output" || {
            printf 'Сервер не согласовал HTTP/2 через ALPN.\n' >&2
            return 1
        }
    printf 'HTTPS: 200; цепочка: OK; %s\n' "$expiry"
}

verify_final_headers() {
    local headers status
    headers="$LOCAL_TMP/final-headers"
    status="$(curl --noproxy '*' -sS -D "$headers" -o /dev/null \
        --connect-timeout 15 --max-time 60 -w '%{http_code}' \
        "https://${CANONICAL_HOST}/")" || return 1
    [[ "$status" == "200" ]] || return 1
    tr -d '\r' < "$headers" \
        | grep -Eiq '^Strict-Transport-Security:[[:space:]]*max-age=31536000$' \
        || {
            printf 'После финального reload отсутствует ожидаемый HSTS.\n' >&2
            return 1
        }
    if tr -d '\r' < "$headers" | grep -Eiq '^X-Robots-Tag:'; then
        printf 'После финального reload всё ещё присутствует X-Robots-Tag.\n' >&2
        return 1
    fi
}

verify_redirect_matrix() {
    local domain scheme headers status location
    local -a schemes
    local path='/domain-cutover-redirect-check?source=codex'
    local expected="https://${CANONICAL_HOST}${path}"

    for domain in "${CONFIRMED_DOMAINS[@]}"; do
        if [[ "$domain" == "$CANONICAL_HOST" ]]; then
            schemes=(http)
        else
            schemes=(http https)
        fi
        for scheme in "${schemes[@]}"; do
            headers="$LOCAL_TMP/redirect-${scheme}-${domain}"
            status="$(curl --noproxy '*' -sS -D "$headers" -o /dev/null \
                --connect-timeout 15 --max-time 60 -w '%{http_code}' \
                "${scheme}://${domain}${path}")" || return 1
            location="$(tr -d '\r' < "$headers" \
                | sed -nE 's/^[Ll]ocation:[[:space:]]*(.*)$/\1/p' | tail -n 1)"
            if [[ "$status" != "301" || "$location" != "$expected" ]]; then
                printf '%s://%s вернул %s -> %s, ожидалось 301 -> %s.\n' \
                    "$scheme" "$domain" "$status" "${location:-без Location}" "$expected" >&2
                return 1
            fi
        done
    done
}

if (( ONLY_CERT )); then
    log "Проверяю ACME webroot для подтверждённых имён"
    probe_acme_webroot || die "ACME webroot не готов; nginx не изменён"
    log "Выпускаю или обновляю сертификат"
    issue_certificate || die "сертификат не выпущен; nginx не изменён"
    log "Проверяю автопродление и deploy-hook nginx"
    configure_renewal || die "сертификат выпущен, но автопродление не настроено"
    log "Сертификат и автопродление готовы; конфигурация сайта не переключалась"
    exit 0
fi

log "Сохраняю предыдущий nginx и включаю HTTP bootstrap с noindex"
if ! begin_transaction; then
    set +e
    remote_transaction_state_status
    state_status=$?
    set -e
    if [[ "$state_status" -eq 0 ]]; then
        printf 'SSH завершился неоднозначно после публикации bootstrap; выполняю подтверждённый откат.\n' >&2
        restore_remote_config "$TRANSACTION_ID" \
            || die "не удалось откатить неоднозначный bootstrap; выполните --rollback после восстановления SSH"
        die "bootstrap был включён, но из-за неоднозначного SSH-ответа автоматически откачен"
    elif [[ "$state_status" -eq 1 ]]; then
        die "bootstrap-конфиг не включён; удалённая транзакция восстановила предыдущий nginx"
    else
        die "SSH недоступен и результат bootstrap неизвестен; после восстановления связи запустите --rollback"
    fi
fi
TRANSACTION_STARTED=1
trap 'rollback_unhandled_error $?' ERR
trap rollback_on_signal INT TERM HUP

log "Проверяю ACME webroot через все подтверждённые домены"
probe_acme_webroot || rollback_after_failure "ACME webroot недоступен"

log "Выпускаю сертификат для: ${SERVER_NAMES}"
issue_certificate || rollback_after_failure "сертификат не выпущен"

log "Включаю и проверяю автопродление сертификата"
configure_renewal || rollback_after_failure "не удалось настроить certbot.timer или deploy-hook"

log "Включаю HTTPS без HSTS; noindex пока остаётся"
install_site_config "tls-pre-hsts.conf" \
    || rollback_after_failure "HTTPS-конфиг не прошёл nginx -t или reload"

log "Проверяю HTTPS, доверенную цепочку и срок сертификата"
verify_https || rollback_after_failure "HTTPS не прошёл живую проверку"

log "HTTPS доказан: включаю HSTS и снимаю X-Robots-Tag"
install_site_config "tls-final.conf" \
    || rollback_after_failure "финальный конфиг не прошёл nginx -t или reload"
verify_final_headers \
    || rollback_after_failure "HSTS/noindex не соответствуют финальному состоянию"
verify_redirect_matrix \
    || rollback_after_failure "матрица HTTP/HTTPS/альтернативных редиректов не прошла"

log "Запускаю строгий живой смоук"
SITE_ORIGIN="https://${CANONICAL_HOST}" REQUIRE_SERVER_REDIRECTS=1 npm run verify:live \
    || rollback_after_failure "строгий npm run verify:live завершился ошибкой"

trap - ERR INT TERM HUP
log "Переключение домена завершено успешно"
printf 'Канонический адрес: https://%s\n' "$CANONICAL_HOST"
printf 'Сертификат включает: %s\n' "$SERVER_NAMES"
printf 'Откат nginx: deploy/enable-domain.sh --rollback\n'
