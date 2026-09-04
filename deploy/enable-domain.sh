#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="root@82.146.60.212"
SERVER_IP="82.146.60.212"
SSH_KEY="${CHEZAKVEST_SSH_KEY:-${HOME}/.ssh/chezakvest_key}"
PRODUCTION_CANONICAL_HOST="xn--80aehcht5ci1b.xn--p1ai"
TEST_CANONICAL_HOST="chezakvest.com"
STAGE=""
STAGE_LABEL=""
CANONICAL_HOST=""
NGINX_TEMPLATE=""
KEEP_NOINDEX=0
DOMAIN_CANDIDATES=()
REQUIRED_DOMAINS=()

COMMON_SOURCE="deploy/nginx/chezakvest-common.conf"
REMOTE_SITE_CONFIG="/etc/nginx/sites-available/chezakvest.conf"
REMOTE_COMMON_CONFIG="/etc/nginx/snippets/chezakvest-common.conf"
REMOTE_ACME_ROOT="/var/www/acme"
REMOTE_ROLLBACK_STATE="/var/lib/chezakvest/domain-cutover/rollback.tsv"
REMOTE_SAFE_ROLLBACK_STATE="/var/lib/chezakvest/domain-cutover/automatic-rollback.tsv"
REMOTE_TRANSACTION_STATE="/var/lib/chezakvest/domain-cutover/in-progress.tsv"
REMOTE_RENEW_HOOK="/etc/letsencrypt/renewal-hooks/deploy/chezakvest-nginx-reload"
DEPLOY_LOCK="${CHEZAKVEST_DEPLOY_LOCK:-/tmp/chezakvest-deploy.lock}"
REMOTE_DEPLOY_LOCK="/run/lock/chezakvest-deploy.lock"
REMOTE_MUTATION_LOCK="/run/lock/chezakvest-mutation.lock"
REMOTE_OPERATION_OWNER="/var/lib/chezakvest/operation-owner"
BACKUPS_TO_KEEP="${CHEZAKVEST_BACKUPS_TO_KEEP:-10}"
OPERATION_TOKEN=""

DRY_RUN=0
ONLY_CERT=0
ROLLBACK=0
REMOTE_TMP=""
LOCAL_TMP=""
TRANSACTION_STARTED=0
TRANSACTION_ID=""
TLS_SAFE_CHECKPOINT=0
PRESERVE_REMOTE_OWNER=0
CUTOVER_LOCK_FD=""
CONFIRMED_DOMAINS=()
ALTERNATIVE_DOMAINS=()
MISSING_REQUIRED_DOMAINS=()

usage() {
    cat <<'EOF'
Использование: deploy/enable-domain.sh --stage test|production [--dry-run] [--only-cert | --rollback]

  --stage       явно выбрать тестовый домен или боевой домен
  --dry-run     проверить предпосылки и показать полный план без изменений
  --only-cert   выпустить/обновить сертификат, не переключая конфигурацию nginx
  --rollback    восстановить конфигурацию nginx, сохранённую перед этим этапом

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

while (( $# > 0 )); do
    case "$1" in
        --stage)
            (( $# >= 2 )) || die "после --stage укажите test или production"
            [[ -z "$STAGE" ]] || die "--stage можно указать только один раз"
            STAGE="$2"
            shift 2
            ;;
        --stage=*)
            [[ -z "$STAGE" ]] || die "--stage можно указать только один раз"
            STAGE="${1#*=}"
            shift
            ;;
        --dry-run) DRY_RUN=1; shift ;;
        --only-cert) ONLY_CERT=1; shift ;;
        --rollback) ROLLBACK=1; shift ;;
        -h|--help) usage; exit 0 ;;
        *) die "неизвестный аргумент: $1" ;;
    esac
done

if (( ONLY_CERT && ROLLBACK )); then
    die "--only-cert и --rollback нельзя использовать вместе"
fi

case "$STAGE" in
    test)
        STAGE_LABEL="тестовый домен"
        CANONICAL_HOST="$TEST_CANONICAL_HOST"
        NGINX_TEMPLATE="deploy/nginx/chezakvest-test.conf"
        KEEP_NOINDEX=1
        DOMAIN_CANDIDATES=(
            "$TEST_CANONICAL_HOST"
            "www.${TEST_CANONICAL_HOST}"
        )
        # The test certificate and redirect contract require both names.
        REQUIRED_DOMAINS=("${DOMAIN_CANDIDATES[@]}")
        ;;
    production)
        STAGE_LABEL="боевой домен"
        CANONICAL_HOST="$PRODUCTION_CANONICAL_HOST"
        NGINX_TEMPLATE="deploy/nginx/chezakvest-prod.conf"
        KEEP_NOINDEX=0
        DOMAIN_CANDIDATES=(
            "$PRODUCTION_CANONICAL_HOST"
            "www.${PRODUCTION_CANONICAL_HOST}"
            "$TEST_CANONICAL_HOST"
            "www.${TEST_CANONICAL_HOST}"
            "chezakvest.ru"
            "www.chezakvest.ru"
        )
        REQUIRED_DOMAINS=("$PRODUCTION_CANONICAL_HOST")
        ;;
    "") die "этап обязателен: укажите --stage test или --stage production" ;;
    *) die "неизвестный этап '${STAGE}': укажите test или production" ;;
esac

OPERATION_TOKEN="$(date -u +'%Y%m%dT%H%M%SZ')-cutover-${STAGE}-$$-${RANDOM}"

REPOSITORY_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" \
    || die "команда должна запускаться из Git-репозитория"
[[ "$(pwd -P)" == "$(cd "$REPOSITORY_ROOT" && pwd -P)" ]] \
    || die "запустите скрипт из корня репозитория: ${REPOSITORY_ROOT}"
[[ -r "$SSH_KEY" ]] || die "не найден SSH-ключ; задайте CHEZAKVEST_SSH_KEY"

for command_name in ssh scp dig curl openssl sed grep awk sort head tail flock; do
    command -v "$command_name" >/dev/null \
        || die "не найдена обязательная команда: ${command_name}"
done
[[ "$BACKUPS_TO_KEEP" =~ ^[1-9][0-9]*$ ]] \
    || die "CHEZAKVEST_BACKUPS_TO_KEEP должен быть положительным числом"
[[ "$OPERATION_TOKEN" =~ ^[A-Za-z0-9-]+$ ]] || die "не удалось создать безопасный token операции"

if (( ! ROLLBACK )); then
    [[ -f "$NGINX_TEMPLATE" && -f "$COMMON_SOURCE" ]] \
        || die "не найдены шаблон nginx для этапа '${STAGE}' или общий конфиг"
fi

SSH=(ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 \
    -o ServerAliveInterval=15 -o ServerAliveCountMax=4 "$REMOTE_HOST")
LOCK_SSH=(ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 \
    -o ServerAliveInterval=15 -o ServerAliveCountMax=8 "$REMOTE_HOST")
SCP=(scp -q -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 \
    -o ServerAliveInterval=15 -o ServerAliveCountMax=4)

exec {CUTOVER_LOCK_FD}>"$DEPLOY_LOCK"
flock -n "$CUTOVER_LOCK_FD" \
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
            "owner_file=${REMOTE_OPERATION_OWNER}; token=${OPERATION_TOKEN}; mode=${lock_mode}; response=LOCKED; exec 9>${REMOTE_DEPLOY_LOCK}; flock -w ${wait_seconds} 9 || { printf 'BUSY\\n'; exit 75; }; install -d -o root -g root -m 0700 \"\${owner_file%/*}\"; abandoned=\"\${owner_file}.abandoned\"; valid_owner() { case \"\$1\" in *-cutover-${STAGE}-*) return 0 ;; *) return 1 ;; esac; }; if [ \"\$mode\" = new ]; then [ ! -e \"\$owner_file\" ] && [ ! -e \"\$abandoned\" ] || { printf 'STALE\\n'; exit 76; }; elif [ \"\$mode\" = recover ]; then [ \"\$(cat \"\$owner_file\" 2>/dev/null)\" = \"\$token\" ] || { printf 'STALE\\n'; exit 76; }; else taken=; if [ -e \"\$owner_file\" ]; then current=\"\$(cat \"\$owner_file\")\"; valid_owner \"\$current\" || { printf 'WRONG_OWNER\\n'; exit 77; }; if [ -e \"\$abandoned\" ]; then taken=\"\$(cat \"\$abandoned\")\"; valid_owner \"\$taken\" || { printf 'WRONG_OWNER\\n'; exit 77; }; rm -f -- \"\$owner_file\"; else taken=\"\$current\"; mv -f -- \"\$owner_file\" \"\$abandoned\"; fi; elif [ -e \"\$abandoned\" ]; then taken=\"\$(cat \"\$abandoned\")\"; valid_owner \"\$taken\" || { printf 'WRONG_OWNER\\n'; exit 77; }; fi; [ -z \"\$taken\" ] || response=\"TAKEOVER \$taken\"; fi; if [ \"\$mode\" != recover ]; then pending=\"\${owner_file}.new.\$\$\"; printf '%s\\n' \"\$token\" > \"\$pending\"; chmod 0600 \"\$pending\"; mv -f -- \"\$pending\" \"\$owner_file\"; fi; printf '%s\\n' \"\$response\"; while IFS= read -r command; do case \"\$command\" in PING) printf 'ALIVE\\n' ;; RELEASE) if [ \"\$(cat \"\$owner_file\" 2>/dev/null)\" = \"\$token\" ]; then rm -f -- \"\$owner_file\"; fi; exit 0 ;; *) exit 64 ;; esac; done; exit 74"
    }
    REMOTE_LOCK_PID="$CHEZAKVEST_REMOTE_LOCK_PID"
    REMOTE_LOCK_WRITE_FD="${CHEZAKVEST_REMOTE_LOCK[1]}"
    REMOTE_LOCK_READ_FD="${CHEZAKVEST_REMOTE_LOCK[0]}"
    if ! IFS= read -r -t 20 response <&"$REMOTE_LOCK_READ_FD"; then
        abandon_remote_lock
        printf 'Не удалось получить удалённый lock cutover.\n' >&2
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
        || { printf 'Удалённый lock cutover не удерживается.\n' >&2; return 1; }
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
    printf 'Перехватываю серверный lock по token незавершённого cutover...\n' >&2
    reacquire_remote_lock
}

if (( ! DRY_RUN )); then
    INITIAL_LOCK_MODE="new"
    (( ROLLBACK == 0 )) || INITIAL_LOCK_MODE="takeover"
    acquire_remote_lock 0 "$INITIAL_LOCK_MODE" \
        || die "не удалось сериализовать cutover на сервере"
fi

cleanup() {
    if [[ -n "$LOCAL_TMP" && -d "$LOCAL_TMP" ]]; then
        rm -rf -- "$LOCAL_TMP"
    fi
    if (( ! PRESERVE_REMOTE_OWNER )) \
        && [[ -n "$REMOTE_LOCK_PID" ]] \
        && ! ensure_remote_lock_for_recovery; then
        printf 'КРИТИЧНО: не удалось очистить owner-token незавершённого cutover.\n' >&2
        return 1
    fi
    if [[ "$REMOTE_TMP" =~ ^/tmp/chezakvest-domain\.[A-Za-z0-9]+$ ]]; then
        "${SSH[@]}" "rm -rf -- '$REMOTE_TMP'" >/dev/null 2>&1 || true
    fi
    if (( PRESERVE_REMOTE_OWNER )); then
        abandon_remote_lock
    else
        release_remote_lock
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

is_required_domain() {
    local candidate="$1"
    local required
    for required in "${REQUIRED_DOMAINS[@]}"; do
        [[ "$candidate" != "$required" ]] || return 0
    done
    return 1
}

inspect_dns() {
    local strict="$1"
    local domain a_records aaaa_records a_printable aaaa_printable

    CONFIRMED_DOMAINS=()
    ALTERNATIVE_DOMAINS=()
    MISSING_REQUIRED_DOMAINS=()

    log "Проверяю A-записи: ${STAGE_LABEL} (${STAGE})"
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
            if [[ "$domain" != "$CANONICAL_HOST" ]]; then
                ALTERNATIVE_DOMAINS+=("$domain")
            fi
        elif is_required_domain "$domain"; then
            printf '  НЕ ГОТОВО  %-40s A=%s, AAAA=%s\n' \
                "$domain" "$a_printable" "$aaaa_printable"
            MISSING_REQUIRED_DOMAINS+=("$domain")
        else
            printf '  ПРОПУСК  %-42s A=%s, AAAA=%s\n' \
                "$domain" "$a_printable" "$aaaa_printable"
        fi
    done

    if (( ${#MISSING_REQUIRED_DOMAINS[@]} > 0 )); then
        printf '\nЭтап «%s» пока НЕ ГОТОВ: обязательные имена не указывают только на %s: %s.\n' \
            "$STAGE_LABEL" "$SERVER_IP" "${MISSING_REQUIRED_DOMAINS[*]}" >&2
        if [[ "$STAGE" == "test" ]]; then
            printf 'В REG.RU замените A-записи @ и www зоны chezakvest.com на %s.\n' \
                "$SERVER_IP" >&2
        else
            printf 'В Beget замените A-запись @ зоны чезаквест.рф на %s.\n' \
                "$SERVER_IP" >&2
            printf 'Дополнительные www, chezakvest.com и chezakvest.ru переводите только если они нужны.\n' >&2
        fi
        printf 'Старую AAAA-запись веб-хоста удалите: на новом сервере IPv6 не настроен.\n' >&2
        printf 'MX, TXT, SPF, DKIM и DMARC не меняйте. Подождите TTL и повторите команду.\n' >&2
        (( ! strict )) || return 1
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

dry_run_cutover_recovery_status() {
    "${SSH[@]}" bash -s -- \
        "$REMOTE_DEPLOY_LOCK" "$REMOTE_MUTATION_LOCK" "$REMOTE_OPERATION_OWNER" \
        "$REMOTE_SAFE_ROLLBACK_STATE" "$REMOTE_ROLLBACK_STATE" "$REMOTE_TRANSACTION_STATE" \
        "$STAGE" <<'REMOTE_SCRIPT'
set -euo pipefail
deploy_lock="$1"
mutation_lock="$2"
owner_file="$3"
safe_state="$4"
manual_state="$5"
transaction_state="$6"
stage="$7"
exec 9>"$deploy_lock"
flock -n 9 || { printf 'BUSY\n'; exit 0; }
token=""
[[ ! -s "${owner_file}.abandoned" ]] || token="$(cat "${owner_file}.abandoned")"
[[ -n "$token" || ! -s "$owner_file" ]] || token="$(cat "$owner_file")"
[[ -n "$token" ]] || { printf 'CLEAR\n'; exit 0; }
exec 8>"$mutation_lock"
flock -n 8 || { printf 'BUSY_MUTATION\t%s\n' "$token"; exit 0; }
candidates=("$manual_state" "$transaction_state")
[[ "$stage" != production ]] || candidates=("$safe_state" "${candidates[@]}")
for candidate in "${candidates[@]}"; do
    [[ -s "$candidate" ]] || continue
    IFS=$'\t' read -r marker actual_token actual_stage _ < "$candidate"
    if [[ "$marker" == "#" && "$actual_token" == "$token" && "$actual_stage" == "$stage" ]]; then
        printf 'RECOVERY\t%s\t%s\n' "$candidate" "$token"
        exit 0
    fi
done
printf 'OWNER_NO_STATE\t%s\n' "$token"
REMOTE_SCRIPT
}

print_dry_run() {
    local nginx_version timer_enabled timer_active rollback_stage
    inspect_dns 0
    nginx_version="$(remote_nginx_version)" \
        || die "не удалось определить версию nginx на сервере"
    timer_enabled="$("${SSH[@]}" 'systemctl is-enabled certbot.timer 2>&1 || true')"
    timer_active="$("${SSH[@]}" 'systemctl is-active certbot.timer 2>&1 || true')"

    log "Сухой запуск: изменений не будет"
    printf 'Этап: %s (%s)\n' "$STAGE_LABEL" "$STAGE"
    printf 'Канонический адрес: https://%s\n' "$CANONICAL_HOST"
    printf 'Обязательные имена сертификата: %s\n' "${REQUIRED_DOMAINS[*]}"
    printf 'Сервер: %s (%s)\n' "$REMOTE_HOST" "$SERVER_IP"
    printf 'nginx: %s; certbot.timer: %s/%s\n' "$nginx_version" "$timer_enabled" "$timer_active"
    if supports_http2_directive "$nginx_version"; then
        printf 'HTTP/2 будет включён директивой: http2 on;\n'
    else
        printf 'HTTP/2 будет включён совместимым с nginx %s параметром listen ... http2.\n' \
            "$nginx_version"
    fi

    if (( ROLLBACK )); then
        recovery_status="$(dry_run_cutover_recovery_status)" \
            || die "не удалось проверить persistent owner для dry-run"
        recovery_kind="${recovery_status%%$'\t'*}"
        recovery_token="${recovery_status##*$'\t'}"
        case "$recovery_kind" in
            RECOVERY)
                case "$recovery_token" in
                    *-cutover-"$STAGE"-*) ;;
                    *) die "persistent owner относится к другой операции: ${recovery_token}" ;;
                esac
                recovery_state="${recovery_status#*$'\t'}"
                recovery_state="${recovery_state%$'\t'*}"
                printf 'План recovery: takeover token %s и восстановление из %s под mutation-lock.\n' \
                    "$recovery_token" "$recovery_state"
                return 0
                ;;
            OWNER_NO_STATE)
                case "$recovery_token" in
                    *-cutover-"$STAGE"-*) ;;
                    *) die "persistent owner относится к другой операции: ${recovery_token}" ;;
                esac
                printf 'План recovery: takeover token %s и очистка owner; nginx-транзакция не начиналась.\n' \
                    "$recovery_token"
                return 0
                ;;
            BUSY|BUSY_MUTATION)
                printf 'Серверная операция или мутация ещё активна; takeover сейчас был бы остановлен.\n'
                return 0
                ;;
            CLEAR) ;;
            *) die "неожиданный статус persistent recovery: ${recovery_status}" ;;
        esac
        if "${SSH[@]}" "test -s '$REMOTE_ROLLBACK_STATE'"; then
            rollback_stage="$("${SSH[@]}" \
                "awk -F '\\t' 'NR == 1 && \$1 == \"#\" { print \$3 }' '$REMOTE_ROLLBACK_STATE'")"
            if [[ "$rollback_stage" == "$STAGE" ]]; then
                printf '%s\n' \
                    'План: восстановить сохранённые site/common-конфиги, выполнить nginx -t,' \
                    'reload nginx и проверить HTTP-ответ сервера.'
            else
                printf 'Сохранённое состояние относится к этапу %s, а выбран этап %s; откат будет остановлен.\n' \
                    "${rollback_stage:-неизвестно}" "$STAGE"
            fi
        else
            printf 'Сохранённого состояния для отката пока нет: %s\n' "$REMOTE_ROLLBACK_STATE"
        fi
        return 0
    fi

    if (( ONLY_CERT )); then
        printf '%s\n' \
            'План: потребовать все обязательные A-записи, выбрать доступные альтернативы,' \
            'проверить ACME webroot, запустить Certbot и настроить timer/deploy-hook.'
        return 0
    fi

    if [[ "$STAGE" == "test" ]]; then
        printf '%s\n' \
            'План: потребовать A-записи chezakvest.com и www.chezakvest.com;' \
            'сохранить предыдущие site/common-конфиги рядом с суффиксом .bak-<UTC-время>;' \
            'включить HTTP bootstrap с noindex, закрытым robots.txt и недоступным sitemap.xml;' \
            'проверить ACME webroot и выпустить сертификат на оба имени;' \
            'включить HTTPS без HSTS, сохранив X-Robots-Tag: noindex, nofollow;' \
            'проверить HTTPS, сертификат, www-редирект и запрет индексации;' \
            'при любой ошибке после начала транзакции восстановить предыдущий nginx.'
    else
        printf '%s\n' \
            'План: потребовать A-запись боевого домена и автоматически выбрать альтернативы;' \
            'сохранить предыдущие site/common-конфиги рядом с суффиксом .bak-<UTC-время>;' \
            'включить временную HTTP-конфигурацию с noindex и проверить ACME webroot;' \
            'выпустить сертификат, включить автопродление и HTTPS без HSTS;' \
            'проверить HTTP 200, цепочку сертификата и срок действия;' \
            'включить HSTS, снять X-Robots-Tag и выполнить строгий npm run verify:live;' \
            'при ранней ошибке восстановить nginx до этапа, а при поздней — проверенный TLS без HSTS;' \
            'ручной --rollback продолжит ссылаться на состояние до production-cutover.'
    fi
}

if (( DRY_RUN )); then
    print_dry_run
    exit 0
fi

restore_remote_config() {
    local expected_transaction_id="${1:-}"
    local state_file="${2:-$REMOTE_ROLLBACK_STATE}"
    "${SSH[@]}" bash -s -- \
        "$state_file" "$expected_transaction_id" "$STAGE" "$REMOTE_MUTATION_LOCK" <<'REMOTE_SCRIPT'
set -euo pipefail
state_file="$1"
expected_transaction_id="$2"
expected_stage="$3"
mutation_lock="$4"
[[ -s "$state_file" ]] || {
    printf 'Состояние для отката не найдено: %s\n' "$state_file" >&2
    exit 1
}

IFS=$'\t' read -r marker actual_transaction_id actual_stage origin_state < "$state_file"
[[ "$marker" == "#" && "$actual_stage" == "$expected_stage" ]] || {
    printf 'Rollback-state относится к этапу %s, выбран этап %s; откат остановлен.\n' \
        "${actual_stage:-неизвестно}" "$expected_stage" >&2
    exit 1
}

if [[ -n "$expected_transaction_id" ]]; then
    [[ "$marker" == "#" && "$actual_transaction_id" == "$expected_transaction_id" ]] || {
        printf 'Rollback-state принадлежит другой транзакции; автоматический откат остановлен.\n' >&2
        exit 1
    }
fi
if [[ -n "${origin_state:-}" ]]; then
    [[ "$origin_state" == "${state_file%/*}/rollback.tsv" && -s "$origin_state" ]] || {
        printf 'Некорректная ссылка служебного состояния ручного отката.\n' >&2
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

exec 8>"$mutation_lock"
flock -w 120 8 || exit 75
snapshot_dir="$(mktemp -d /tmp/chezakvest-cutover-restore.XXXXXX)"
index=0
while IFS=$'\t' read -r target existed backup; do
    [[ "$target" == "#" ]] && continue
    if [[ -e "$target" || -L "$target" ]]; then
        printf '1\n' > "${snapshot_dir}/${index}.exists"
        cp -a -- "$target" "${snapshot_dir}/${index}.value"
        cmp -s -- "$target" "${snapshot_dir}/${index}.value"
    else
        printf '0\n' > "${snapshot_dir}/${index}.exists"
    fi
    printf '%s\n' "$target" > "${snapshot_dir}/${index}.target"
    ((index += 1))
done < "$state_file"

restore_snapshot_on_error() {
    status=$?
    trap - EXIT HUP INT TERM
    set +e
    for ((item = 0; item < index; item += 1)); do
        read -r target < "${snapshot_dir}/${item}.target"
        read -r existed < "${snapshot_dir}/${item}.exists"
        if (( existed )); then
            cp -a -- "${snapshot_dir}/${item}.value" "${target}.restore.$$"
            cmp -s -- "${snapshot_dir}/${item}.value" "${target}.restore.$$"
            mv -f -- "${target}.restore.$$" "$target"
        else
            rm -f -- "$target"
        fi
    done
    if nginx -t; then systemctl reload nginx || true; fi
    rm -rf -- "$snapshot_dir"
    exit "$status"
}
trap restore_snapshot_on_error EXIT HUP INT TERM

while IFS=$'\t' read -r target existed backup; do
    [[ "$target" == "#" ]] && continue
    if [[ "$existed" == "1" ]]; then
        cp -a -- "$backup" "${target}.restore.$$"
        cmp -s -- "$backup" "${target}.restore.$$"
        mv -f -- "${target}.restore.$$" "$target"
    else
        rm -f -- "$target"
    fi
done < "$state_file"

nginx -t
systemctl reload nginx
used_state="${state_file}.used-$(date -u +'%Y%m%dT%H%M%SZ')-$$"
cp -a -- "$state_file" "${used_state}.new"
cmp -s -- "$state_file" "${used_state}.new"
mv -f -- "${used_state}.new" "$used_state"
trap - EXIT HUP INT TERM
rm -rf -- "$snapshot_dir"
printf 'Предыдущая конфигурация nginx восстановлена; recovery-state сохранён: %s\n' "$state_file"
REMOTE_SCRIPT
}

clear_abandoned_owner_record() {
    local expected_token="$1"
    "${SSH[@]}" bash -s -- "${REMOTE_OPERATION_OWNER}.abandoned" "$expected_token" <<'REMOTE_SCRIPT'
set -euo pipefail
record="$1"
expected_token="$2"
[[ "$(cat "$record" 2>/dev/null)" == "$expected_token" ]]
rm -f -- "$record"
REMOTE_SCRIPT
}

restore_abandoned_owner_guard() {
    local expected_token="$1"
    "${SSH[@]}" bash -s -- \
        "${REMOTE_OPERATION_OWNER}.abandoned" "$REMOTE_OPERATION_OWNER" "$expected_token" <<'REMOTE_SCRIPT'
set -euo pipefail
record="$1"
owner="$2"
expected_token="$3"
[[ "$(cat "$record" 2>/dev/null)" == "$expected_token" ]]
mv -f -- "$record" "$owner"
REMOTE_SCRIPT
}

prune_remote_backups() {
    "${SSH[@]}" bash -s -- \
        "$BACKUPS_TO_KEEP" "$REMOTE_ROLLBACK_STATE" "$REMOTE_SAFE_ROLLBACK_STATE" \
        "$REMOTE_TRANSACTION_STATE" "$REMOTE_SITE_CONFIG" "$REMOTE_COMMON_CONFIG" \
        "$REMOTE_RENEW_HOOK" "$REMOTE_MUTATION_LOCK" <<'REMOTE_SCRIPT'
set -euo pipefail
keep="$1"
state_file="$2"
safe_state_file="$3"
transaction_state="$4"
shift 4
targets=("$1" "$2" "$3")
mutation_lock="$4"
[[ "$keep" =~ ^[1-9][0-9]*$ ]]
exec 8>"$mutation_lock"
flock -w 120 8 || exit 75

referenced_backups=""
for current_state in "$state_file" "$safe_state_file" "$transaction_state"; do
    if [[ -s "$current_state" ]]; then
        referenced_backups+="$(awk -F '\t' '$1 != "#" && $2 == "1" { print $3 }' "$current_state")"$'\n'
    fi
done
for target in "${targets[@]}"; do
    directory="${target%/*}"
    basename="${target##*/}"
    mapfile -t candidates < <(
        find "$directory" -mindepth 1 -maxdepth 1 -type f -name "${basename}.bak-*" -printf '%p\n' \
            | sort -r \
            | tail -n "+$((keep + 1))"
    )
    for candidate in "${candidates[@]}"; do
        grep -Fxq -- "$candidate" <<< "$referenced_backups" || rm -f -- "$candidate"
    done
done

state_dir="${state_file%/*}"
mapfile -t obsolete_states < <(
    find "$state_dir" -mindepth 1 -maxdepth 1 -type f \
        \( -name 'rollback.tsv.bak-*' -o -name 'rollback.tsv.used-*' \
           -o -name 'automatic-rollback.tsv.bak-*' -o -name 'automatic-rollback.tsv.used-*' \
           -o -name 'in-progress.tsv.used-*' \) \
        -printf '%p\n' \
        | sort -r \
        | tail -n "+$((keep + 1))"
)
((${#obsolete_states[@]} == 0)) || rm -f -- "${obsolete_states[@]}"
REMOTE_SCRIPT
}

matching_recovery_state() {
    local expected_token="$1"
    "${SSH[@]}" bash -s -- \
        "$REMOTE_SAFE_ROLLBACK_STATE" "$REMOTE_ROLLBACK_STATE" "$REMOTE_TRANSACTION_STATE" \
        "$expected_token" "$STAGE" "$REMOTE_MUTATION_LOCK" <<'REMOTE_SCRIPT'
set -euo pipefail
safe_state="$1"
manual_state="$2"
transaction_state="$3"
expected_token="$4"
expected_stage="$5"
mutation_lock="$6"
exec 8>"$mutation_lock"
flock -w 120 8 || exit 75
candidates=("$manual_state" "$transaction_state")
if [[ "$expected_stage" == "production" ]]; then
    candidates=("$safe_state" "${candidates[@]}")
fi
for candidate in "${candidates[@]}"; do
    [[ -s "$candidate" ]] || continue
    IFS=$'\t' read -r marker actual_token actual_stage < "$candidate"
    if [[ "$marker" == "#" && "$actual_token" == "$expected_token" \
        && "$actual_stage" == "$expected_stage" ]]; then
        printf '%s\n' "$candidate"
        exit 0
    fi
done
exit 1
REMOTE_SCRIPT
}

prepare_manual_restore_state() {
    "${SSH[@]}" bash -s -- \
        "$REMOTE_ROLLBACK_STATE" "$REMOTE_TRANSACTION_STATE" "$OPERATION_TOKEN" "$STAGE" \
        "$REMOTE_MUTATION_LOCK" <<'REMOTE_SCRIPT'
set -euo pipefail
source_state="$1"
recovery_state="$2"
operation_token="$3"
stage="$4"
mutation_lock="$5"
exec 8>"$mutation_lock"
flock -w 120 8
[[ -s "$source_state" && ! -e "$recovery_state" ]]
IFS=$'\t' read -r marker _ source_stage < "$source_state"
[[ "$marker" == "#" && "$source_stage" == "$stage" ]]
pending="${recovery_state}.new.$$"
printf '#\t%s\t%s\t%s\n' "$operation_token" "$stage" "$source_state" > "$pending"
tail -n +2 "$source_state" >> "$pending"
chmod 0600 "$pending"
mv -f -- "$pending" "$recovery_state"
REMOTE_SCRIPT
}

clear_transaction_state() {
    local expected_token="$1"
    "${SSH[@]}" bash -s -- \
        "$REMOTE_TRANSACTION_STATE" "$expected_token" "$STAGE" "$REMOTE_MUTATION_LOCK" <<'REMOTE_SCRIPT'
set -euo pipefail
state_file="$1"
expected_token="$2"
expected_stage="$3"
mutation_lock="$4"
exec 8>"$mutation_lock"
flock -w 120 8
[[ -s "$state_file" ]]
IFS=$'\t' read -r marker actual_token actual_stage _ < "$state_file"
[[ "$marker" == "#" && "$actual_token" == "$expected_token" && "$actual_stage" == "$expected_stage" ]]
rm -f -- "$state_file"
REMOTE_SCRIPT
}

if (( ROLLBACK )); then
    EXPECTED_ROLLBACK_TOKEN=""
    ROLLBACK_STATE_FILE="$REMOTE_ROLLBACK_STATE"
    if (( TAKEOVER_OCCURRED )); then
        EXPECTED_ROLLBACK_TOKEN="$TAKEN_OVER_TOKEN"
        log "Восстанавливаю незавершённый cutover ${TAKEN_OVER_TOKEN}"
        set +e
        ROLLBACK_STATE_FILE="$(matching_recovery_state "$TAKEN_OVER_TOKEN")"
        recovery_state_status=$?
        set -e
        if [[ "$recovery_state_status" -eq 0 ]]; then
            if [[ "$ROLLBACK_STATE_FILE" == "$REMOTE_SAFE_ROLLBACK_STATE" ]]; then
                printf 'Аварийный takeover использует проверенную TLS-точку без HSTS.\n'
            elif [[ "$ROLLBACK_STATE_FILE" == "$REMOTE_TRANSACTION_STATE" ]]; then
                printf 'Аварийный takeover использует подготовленное состояние до bootstrap.\n'
            fi
        elif [[ "$recovery_state_status" -eq 1 ]]; then
            clear_abandoned_owner_record "$TAKEN_OVER_TOKEN" \
                || { restore_abandoned_owner_guard "$TAKEN_OVER_TOKEN" || true; die "не удалось очистить abandoned owner"; }
            prune_remote_backups || true
            log "Owner-token очищен: nginx-транзакция не начиналась"
            exit 0
        else
            PRESERVE_REMOTE_OWNER=1
            restore_abandoned_owner_guard "$TAKEN_OVER_TOKEN" || true
            die "не удалось дождаться mutation-lock или проверить recovery-state; исходный owner-token сохранён"
        fi
    else
        if ! prepare_manual_restore_state; then
            PRESERVE_REMOTE_OWNER=1
            die "не удалось подготовить аварийное состояние ручного отката; owner-token сохранён"
        fi
        EXPECTED_ROLLBACK_TOKEN="$OPERATION_TOKEN"
        ROLLBACK_STATE_FILE="$REMOTE_TRANSACTION_STATE"
    fi
    log "Восстанавливаю предыдущую конфигурацию nginx"
    if ! ensure_remote_lock_for_recovery; then
        PRESERVE_REMOTE_OWNER=1
        die "lock принадлежит другой операции; ручной откат не выполнялся"
    fi
    if ! restore_remote_config "$EXPECTED_ROLLBACK_TOKEN" "$ROLLBACK_STATE_FILE"; then
        PRESERVE_REMOTE_OWNER=1
        if (( TAKEOVER_OCCURRED )); then
            restore_abandoned_owner_guard "$TAKEN_OVER_TOKEN" || true
        fi
        die "автоматический откат не удался; не меняйте DNS и проверьте nginx на сервере"
    fi
    if [[ "$ROLLBACK_STATE_FILE" == "$REMOTE_TRANSACTION_STATE" ]] \
        && ! clear_transaction_state "$EXPECTED_ROLLBACK_TOKEN"; then
        PRESERVE_REMOTE_OWNER=1
        if (( TAKEOVER_OCCURRED )); then
            restore_abandoned_owner_guard "$TAKEN_OVER_TOKEN" || true
        fi
        die "nginx восстановлен, но in-progress state не очищен; owner-token сохранён"
    fi
    if (( TAKEOVER_OCCURRED )); then
        if ! clear_abandoned_owner_record "$TAKEN_OVER_TOKEN"; then
            PRESERVE_REMOTE_OWNER=1
            die "nginx восстановлен, но abandoned owner не очищен; owner-token сохранён"
        fi
    fi
    prune_remote_backups \
        || printf 'ПРЕДУПРЕЖДЕНИЕ: откат завершён, но история backup/state не ограничена.\n' >&2
    status="$(curl --noproxy '*' -sS -o /dev/null -w '%{http_code}' \
        --connect-timeout 10 --max-time 30 "http://${SERVER_IP}/")" \
        || die "nginx восстановлен, но HTTP-проверка сервера не прошла"
    [[ "$status" =~ ^[23][0-9][0-9]$ ]] \
        || die "nginx восстановлен, но сервер вернул HTTP ${status}"
    log "Откат этапа '${STAGE}' завершён; восстановите его прежние A-записи из сохранённого экспорта"
    exit 0
fi

inspect_dns 1 || die "обязательные домены этапа '${STAGE}' ещё не указывают только на ${SERVER_IP}"

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
TRANSACTION_ID="$OPERATION_TOKEN"

render_domain_config() {
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
        "$NGINX_TEMPLATE" > "$output"

    if grep -Eq '__[A-Z0-9_]+__' "$output"; then
        printf 'После рендера nginx остались незаполненные маркеры.\n' >&2
        return 1
    fi
}

render_bootstrap_config() {
    {
        cat <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${SERVER_NAMES};

    set \$chezakvest_robots_header "noindex, nofollow";
    set \$chezakvest_hsts_header "";
    include /etc/nginx/snippets/chezakvest-common.conf;
EOF
        if [[ "$STAGE" == "test" ]]; then
            cat <<'EOF'

    location = /robots.txt {
        default_type text/plain;
        return 200 "User-agent: *\nDisallow: /\n";
    }

    location = /sitemap.xml {
        return 404;
    }
EOF
        fi
        cat <<'EOF'
}
EOF
    } > "$LOCAL_TMP/bootstrap.conf"
}

render_bootstrap_config
render_domain_config "noindex, nofollow" "" \
    "$LOCAL_TMP/tls-pre-hsts.conf"
if [[ "$STAGE" == "test" ]]; then
    cp -- "$LOCAL_TMP/tls-pre-hsts.conf" "$LOCAL_TMP/tls-final.conf"
else
    render_domain_config "" "max-age=31536000" \
        "$LOCAL_TMP/tls-final.conf"
fi
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
        "$REMOTE_TRANSACTION_STATE" "$TRANSACTION_ID" "$STAGE" "$REMOTE_MUTATION_LOCK" \
        <<'REMOTE_SCRIPT'
set -euo pipefail
source_dir="$1"
site_target="$2"
common_target="$3"
state_file="$4"
transaction_state="$5"
transaction_id="$6"
stage="$7"
mutation_lock="$8"
stamp="$(date -u +'%Y%m%dT%H%M%SZ')"
pending_state="${transaction_state}.new.$$"
created_backups=()
transaction_prepared=0
mutation_started=0

exec 8>"$mutation_lock"
flock -w 120 8
mkdir -p -- "$(dirname "$state_file")" /var/www/acme/.well-known/acme-challenge
[[ ! -e "$transaction_state" ]]
printf '#\t%s\t%s\n' "$transaction_id" "$stage" > "$pending_state"

rollback_on_error() {
    status=$?
    [[ "$status" -ne 0 ]] || status=1
    trap - EXIT HUP INT TERM
    set +e
    rollback_failed=0
    if (( transaction_prepared && mutation_started )); then
        while IFS=$'\t' read -r target existed backup; do
            [[ "$target" == "#" ]] && continue
            if [[ "$existed" == "1" ]]; then
                cp -a -- "$backup" "${target}.restore.$$" \
                    && cmp -s -- "$backup" "${target}.restore.$$" \
                    && mv -f -- "${target}.restore.$$" "$target" \
                    || rollback_failed=1
            else
                rm -f -- "$target" || rollback_failed=1
            fi
        done < "$transaction_state"
        if ! nginx -t || ! systemctl reload nginx; then
            rollback_failed=1
        fi
    fi
    if (( rollback_failed == 0 )); then
        rm -f -- "$transaction_state" "$pending_state"
        ((${#created_backups[@]} == 0)) || rm -f -- "${created_backups[@]}"
        printf 'Не удалось включить bootstrap-конфиг; предыдущие файлы восстановлены.\n' >&2
    else
        printf 'Не удалось полностью восстановить bootstrap; in-progress state сохранён.\n' >&2
    fi
    exit "$status"
}
trap rollback_on_error EXIT HUP INT TERM

for target in "$site_target" "$common_target"; do
    if [[ -e "$target" || -L "$target" ]]; then
        backup="${target}.bak-${stamp}"
        pending_backup="${backup}.new.$$"
        [[ ! -e "$backup" && ! -L "$backup" ]] || {
            printf 'Резервная копия уже существует: %s\n' "$backup" >&2
            exit 1
        }
        cp -a -- "$target" "$pending_backup"
        cmp -s -- "$target" "$pending_backup"
        mv -f -- "$pending_backup" "$backup"
        created_backups+=("$backup")
        printf '%s\t1\t%s\n' "$target" "$backup" >> "$pending_state"
    else
        printf '%s\t0\t-\n' "$target" >> "$pending_state"
    fi
done
chmod 0600 "$pending_state"
mv -f -- "$pending_state" "$transaction_state"
transaction_prepared=1
mutation_started=1

install -o root -g root -m 0644 "${source_dir}/common.conf" "${common_target}.new"
mv -f -- "${common_target}.new" "$common_target"
install -o root -g root -m 0644 "${source_dir}/bootstrap.conf" "${site_target}.new"
mv -f -- "${site_target}.new" "$site_target"

nginx -t
systemctl reload nginx

if [[ -e "$state_file" ]]; then
    cp -a -- "$state_file" "${state_file}.bak-${stamp}.new"
    cmp -s -- "$state_file" "${state_file}.bak-${stamp}.new"
    mv -f -- "${state_file}.bak-${stamp}.new" "${state_file}.bak-${stamp}"
fi
install -o root -g root -m 0600 "$transaction_state" "${state_file}.new"
mv -f -- "${state_file}.new" "$state_file"
trap - EXIT HUP INT TERM
rm -f -- "$transaction_state"
printf 'Bootstrap-конфиг включён; резервное состояние: %s\n' "$state_file"
REMOTE_SCRIPT
}

remote_transaction_state_status() {
    "${SSH[@]}" bash -s -- \
        "$REMOTE_ROLLBACK_STATE" "$REMOTE_TRANSACTION_STATE" \
        "$TRANSACTION_ID" "$STAGE" "$REMOTE_MUTATION_LOCK" <<'REMOTE_SCRIPT'
set -euo pipefail
state_file="$1"
transaction_state="$2"
expected_id="$3"
expected_stage="$4"
mutation_lock="$5"
exec 8>"$mutation_lock"
flock -w 120 8 || exit 75
for candidate in "$state_file" "$transaction_state"; do
    [[ -s "$candidate" ]] || continue
    IFS=$'\t' read -r marker actual_id actual_stage < "$candidate"
    if [[ "$marker" == "#" && "$actual_id" == "$expected_id" && "$actual_stage" == "$expected_stage" ]]; then
        printf '%s\n' "$candidate"
        exit 0
    fi
done
exit 1
REMOTE_SCRIPT
}

install_site_config() {
    local remote_name="$1"
    "${SSH[@]}" bash -s -- \
        "$REMOTE_TMP" "$remote_name" "$REMOTE_SITE_CONFIG" "$REMOTE_MUTATION_LOCK" <<'REMOTE_SCRIPT'
set -euo pipefail
source_dir="$1"
source_name="$2"
target="$3"
mutation_lock="$4"
exec 8>"$mutation_lock"
flock -w 120 8
install -o root -g root -m 0644 "${source_dir}/${source_name}" "${target}.new"
mv -f -- "${target}.new" "$target"
nginx -t
systemctl reload nginx
REMOTE_SCRIPT
}

checkpoint_tls_safe_rollback() {
    "${SSH[@]}" bash -s -- \
        "$REMOTE_SAFE_ROLLBACK_STATE" "$REMOTE_ROLLBACK_STATE" \
        "$TRANSACTION_ID" "$STAGE" \
        "$REMOTE_SITE_CONFIG" "$REMOTE_COMMON_CONFIG" "$REMOTE_MUTATION_LOCK" <<'REMOTE_SCRIPT'
set -euo pipefail
safe_state_file="$1"
transaction_state_file="$2"
transaction_id="$3"
stage="$4"
site_target="$5"
common_target="$6"
mutation_lock="$7"
pending_state="${safe_state_file}.new.$$"

exec 8>"$mutation_lock"
flock -w 120 8
[[ "$stage" == "production" && -s "$transaction_state_file" ]]
IFS=$'\t' read -r marker actual_id actual_stage < "$transaction_state_file"
[[ "$marker" == "#" && "$actual_id" == "$transaction_id" && "$actual_stage" == "$stage" ]]

printf '#\t%s\t%s\n' "$transaction_id" "$stage" > "$pending_state"
for target in "$site_target" "$common_target"; do
    [[ -f "$target" ]]
    backup="${target}.bak-${transaction_id}-tls-safe"
    pending_backup="${backup}.new.$$"
    [[ ! -e "$backup" && ! -L "$backup" ]]
    cp -a -- "$target" "$pending_backup"
    cmp -s -- "$target" "$pending_backup"
    mv -f -- "$pending_backup" "$backup"
    printf '%s\t1\t%s\n' "$target" "$backup" >> "$pending_state"
done
chmod 0600 "$pending_state"
if [[ -e "$safe_state_file" ]]; then
    safe_state_backup="${safe_state_file}.bak-${transaction_id}"
    cp -a -- "$safe_state_file" "${safe_state_backup}.new.$$"
    cmp -s -- "$safe_state_file" "${safe_state_backup}.new.$$"
    mv -f -- "${safe_state_backup}.new.$$" "$safe_state_backup"
fi
mv -f -- "$pending_state" "$safe_state_file"
printf 'Автоматическая точка отката зафиксирована на проверенном TLS без HSTS; ручная точка сохранена.\n'
REMOTE_SCRIPT
}

automatic_rollback_state() {
    if [[ "$STAGE" == "production" && "$TLS_SAFE_CHECKPOINT" -eq 1 ]]; then
        printf '%s\n' "$REMOTE_SAFE_ROLLBACK_STATE"
    else
        printf '%s\n' "$REMOTE_ROLLBACK_STATE"
    fi
}

rollback_after_failure() {
    local reason="$1"
    local rollback_state
    printf '\nОШИБКА: %s\n' "$reason" >&2
    if (( TRANSACTION_STARTED )); then
        printf 'Возвращаю предыдущую конфигурацию nginx...\n' >&2
        rollback_state="$(automatic_rollback_state)"
        if ensure_remote_lock_for_recovery \
            && restore_remote_config "$TRANSACTION_ID" "$rollback_state"; then
            prune_remote_backups || true
            printf 'Предыдущая конфигурация nginx восстановлена. Исправьте причину и повторите команду.\n' >&2
        else
            PRESERVE_REMOTE_OWNER=1
            printf 'КРИТИЧНО: автоматический откат не прошёл. Не меняйте DNS дальше и проверьте nginx вручную.\n' >&2
        fi
    fi
    exit 1
}

rollback_unhandled_error() {
    local status="$1"
    local rollback_state
    trap - ERR
    set +e
    printf '\nОШИБКА: непредвиденный сбой после начала переключения; запускаю откат nginx.\n' >&2
    rollback_state="$(automatic_rollback_state)"
    if ensure_remote_lock_for_recovery \
        && restore_remote_config "$TRANSACTION_ID" "$rollback_state"; then
        prune_remote_backups || true
    else
        PRESERVE_REMOTE_OWNER=1
        printf 'КРИТИЧНО: lock принадлежит другой операции; автоматический откат не выполнялся.\n' >&2
    fi
    exit "$status"
}

rollback_on_signal() {
    local rollback_state
    trap - INT TERM HUP ERR
    set +e
    printf '\nОШИБКА: переключение прервано сигналом; запускаю откат nginx.\n' >&2
    rollback_state="$(automatic_rollback_state)"
    if ensure_remote_lock_for_recovery \
        && restore_remote_config "$TRANSACTION_ID" "$rollback_state"; then
        prune_remote_backups || true
    else
        PRESERVE_REMOTE_OWNER=1
        printf 'КРИТИЧНО: lock принадлежит другой операции; автоматический откат не выполнялся.\n' >&2
    fi
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
        "$REMOTE_ACME_ROOT" "$CANONICAL_HOST" "${CERTBOT_EMAIL:-}" "$REMOTE_MUTATION_LOCK" \
        "${CONFIRMED_DOMAINS[@]}" \
        <<'REMOTE_SCRIPT'
set -euo pipefail
webroot="$1"
cert_name="$2"
email="$3"
mutation_lock="$4"
shift 4
domains=("$@")
log_file="$(mktemp /tmp/chezakvest-certbot.XXXXXX.log)"
trap 'rm -f -- "$log_file"' EXIT

command -v certbot >/dev/null || {
    printf 'На сервере не установлен certbot.\n' >&2
    exit 1
}
exec 8>"$mutation_lock"
flock -w 120 8

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
    "${SSH[@]}" bash -s -- "$REMOTE_RENEW_HOOK" "$REMOTE_MUTATION_LOCK" <<'REMOTE_SCRIPT'
set -euo pipefail
hook="$1"
mutation_lock="$2"
stamp="$(date -u +'%Y%m%dT%H%M%SZ')"
exec 8>"$mutation_lock"
flock -w 120 8
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
        cp -a -- "$hook" "${hook}.bak-${stamp}.new"
        cmp -s -- "$hook" "${hook}.bak-${stamp}.new"
        mv -f -- "${hook}.bak-${stamp}.new" "${hook}.bak-${stamp}"
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

verify_test_policy() {
    local headers body robots status canonical sitemap_headers
    headers="$LOCAL_TMP/test-final-headers"
    body="$LOCAL_TMP/test-final-body"
    robots="$LOCAL_TMP/test-robots"
    sitemap_headers="$LOCAL_TMP/test-sitemap-headers"

    status="$(curl --noproxy '*' -sS -D "$headers" -o "$body" \
        --connect-timeout 15 --max-time 60 -w '%{http_code}' \
        "https://${CANONICAL_HOST}/")" || return 1
    [[ "$status" == "200" ]] || return 1
    tr -d '\r' < "$headers" \
        | grep -Eiq '^X-Robots-Tag:[[:space:]]*noindex,[[:space:]]*nofollow$' \
        || {
            printf 'На тестовом домене отсутствует X-Robots-Tag: noindex, nofollow.\n' >&2
            return 1
        }
    if tr -d '\r' < "$headers" | grep -Eiq '^Strict-Transport-Security:'; then
        printf 'На тестовом домене появился запрещённый HSTS.\n' >&2
        return 1
    fi

    canonical="$(grep -o -m1 -E '<link rel="canonical" href="[^"]+"' "$body" \
        | sed -nE 's/^.*href="([^"]+)"$/\1/p')"
    [[ "$canonical" == "https://${PRODUCTION_CANONICAL_HOST}/" ]] || {
        printf 'Canonical тестовой главной: %s; ожидался боевой https://%s/.\n' \
            "${canonical:-не найден}" "$PRODUCTION_CANONICAL_HOST" >&2
        return 1
    }

    status="$(curl --noproxy '*' -sS -D "$headers" -o "$robots" \
        --connect-timeout 15 --max-time 60 -w '%{http_code}' \
        "https://${CANONICAL_HOST}/robots.txt")" || return 1
    [[ "$status" == "200" ]] || return 1
    grep -Eiq '^User-agent:[[:space:]]*\*$' "$robots" \
        && grep -Eiq '^Disallow:[[:space:]]*/$' "$robots" \
        && ! grep -Eiq '^(Allow|Sitemap):' "$robots" \
        || {
            printf 'robots.txt тестового домена не закрывает обход целиком.\n' >&2
            return 1
        }

    status="$(curl --noproxy '*' -sS -D "$sitemap_headers" -o /dev/null \
        --connect-timeout 15 --max-time 60 -w '%{http_code}' \
        "https://${CANONICAL_HOST}/sitemap.xml")" || return 1
    [[ "$status" == "404" ]] || {
        printf 'sitemap.xml тестового домена вернул %s вместо 404.\n' "$status" >&2
        return 1
    }

    printf 'Тестовая политика: noindex/nofollow, HSTS отсутствует, robots закрыт, sitemap=404, canonical=%s.\n' \
        "$canonical"
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
    assert_remote_lock
    log "Проверяю ACME webroot для подтверждённых имён"
    probe_acme_webroot || die "ACME webroot не готов; nginx не изменён"
    log "Выпускаю или обновляю сертификат"
    issue_certificate || die "сертификат не выпущен; nginx не изменён"
    log "Проверяю автопродление и deploy-hook nginx"
    configure_renewal || die "сертификат выпущен, но автопродление не настроено"
    prune_remote_backups \
        || printf 'ПРЕДУПРЕЖДЕНИЕ: сертификат готов, но старые резервные копии не очищены.\n' >&2
    log "Сертификат и автопродление готовы; конфигурация сайта не переключалась"
    exit 0
fi

log "Сохраняю предыдущий nginx и включаю HTTP bootstrap с noindex"
assert_remote_lock
if ! begin_transaction; then
    set +e
    RECOVERY_STATE_FILE="$(remote_transaction_state_status)"
    state_status=$?
    set -e
    if [[ "$state_status" -eq 0 ]]; then
        printf 'SSH завершился неоднозначно после публикации bootstrap; выполняю подтверждённый откат.\n' >&2
        ensure_remote_lock_for_recovery \
            || die "lock принадлежит другой операции; неоднозначный bootstrap не изменялся повторно"
        if ! restore_remote_config "$TRANSACTION_ID" "$RECOVERY_STATE_FILE"; then
            PRESERVE_REMOTE_OWNER=1
            die "не удалось откатить неоднозначный bootstrap; после восстановления SSH выполните --stage ${STAGE} --rollback"
        fi
        if [[ "$RECOVERY_STATE_FILE" == "$REMOTE_TRANSACTION_STATE" ]] \
            && ! clear_transaction_state "$TRANSACTION_ID"; then
            PRESERVE_REMOTE_OWNER=1
            die "bootstrap восстановлен, но in-progress state не очищен; owner-token сохранён"
        fi
        prune_remote_backups || true
        die "bootstrap был включён, но из-за неоднозначного SSH-ответа автоматически откачен"
    elif [[ "$state_status" -eq 1 ]]; then
        prune_remote_backups || true
        die "bootstrap-конфиг не включён; удалённая транзакция восстановила предыдущий nginx"
    else
        PRESERVE_REMOTE_OWNER=1
        die "SSH недоступен и результат bootstrap неизвестен; после восстановления связи запустите --stage ${STAGE} --rollback"
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
assert_remote_lock
install_site_config "tls-pre-hsts.conf" \
    || rollback_after_failure "HTTPS-конфиг не прошёл nginx -t или reload"

log "Проверяю HTTPS, доверенную цепочку и срок сертификата"
verify_https || rollback_after_failure "HTTPS не прошёл живую проверку"

if (( KEEP_NOINDEX )); then
    log "Проверяю постоянный noindex, отсутствие HSTS и закрытие robots/sitemap"
    verify_test_policy \
        || rollback_after_failure "защита тестового домена от индексации не прошла проверку"
    verify_redirect_matrix \
        || rollback_after_failure "матрица HTTP/HTTPS/альтернативных редиректов не прошла"
else
    log "HTTPS доказан: фиксирую безопасную TLS-точку отката без HSTS"
    assert_remote_lock
    checkpoint_tls_safe_rollback \
        || rollback_after_failure "не удалось зафиксировать безопасную TLS-точку отката"
    TLS_SAFE_CHECKPOINT=1

    log "Включаю HSTS и снимаю X-Robots-Tag"
    assert_remote_lock
    install_site_config "tls-final.conf" \
        || rollback_after_failure "финальный конфиг не прошёл nginx -t или reload"
    verify_final_headers \
        || rollback_after_failure "HSTS/noindex не соответствуют финальному состоянию"
    verify_redirect_matrix \
        || rollback_after_failure "матрица HTTP/HTTPS/альтернативных редиректов не прошла"

    log "Запускаю строгий живой смоук"
    SITE_ORIGIN="https://${CANONICAL_HOST}" REQUIRE_SERVER_REDIRECTS=1 npm run verify:live \
        || rollback_after_failure "строгий npm run verify:live завершился ошибкой"
fi

log "Ограничиваю историю резервных копий nginx"
assert_remote_lock
prune_remote_backups \
    || printf 'ПРЕДУПРЕЖДЕНИЕ: cutover завершён, но старые резервные копии не очищены.\n' >&2
trap - ERR INT TERM HUP
release_remote_lock
log "Переключение домена завершено успешно"
printf 'Этап: %s (%s)\n' "$STAGE_LABEL" "$STAGE"
printf 'Канонический адрес: https://%s\n' "$CANONICAL_HOST"
printf 'Сертификат включает: %s\n' "$SERVER_NAMES"
printf 'Откат nginx: deploy/enable-domain.sh --stage %s --rollback\n' "$STAGE"
