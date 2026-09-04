#!/usr/bin/env bash
set -euo pipefail

readonly REMOTE_HOST="${CHEZAKVEST_REMOTE_HOST:-root@82.146.60.212}"
readonly SSH_KEY="${CHEZAKVEST_SSH_KEY:-${HOME}/.ssh/chezakvest_key}"
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly WATCHDOG_SCRIPT="chezakvest-watchdog.sh"
readonly WATCHDOG_SERVICE="chezakvest-watchdog.service"
readonly WATCHDOG_TIMER="chezakvest-watchdog.timer"
readonly LOGROTATE_CONFIG="chezakvest-nginx.logrotate"
readonly UNATTENDED_UPGRADES_CONFIG="52chezakvest-unattended-upgrades"

die() {
    printf 'ОШИБКА: %s\n' "$*" >&2
    exit 1
}

for source_file in \
    "$WATCHDOG_SCRIPT" \
    "$WATCHDOG_SERVICE" \
    "$WATCHDOG_TIMER" \
    "$LOGROTATE_CONFIG" \
    "$UNATTENDED_UPGRADES_CONFIG"
do
    [[ -r "${SCRIPT_DIR}/${source_file}" ]] \
        || die "не найден файл ${SCRIPT_DIR}/${source_file}"
done
[[ -r "$SSH_KEY" ]] || die "не найден SSH-ключ; задайте CHEZAKVEST_SSH_KEY"

SSH=(ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 "$REMOTE_HOST")
SCP=(scp -q -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15)

remote_temporary_dir="$("${SSH[@]}" 'mktemp -d /tmp/chezakvest-monitoring.XXXXXX')"
[[ "$remote_temporary_dir" == /tmp/chezakvest-monitoring.* ]] \
    || die "сервер вернул неожиданный путь временного каталога"

cleanup() {
    "${SSH[@]}" "rm -rf -- '$remote_temporary_dir'" >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${SCP[@]}" \
    "${SCRIPT_DIR}/${WATCHDOG_SCRIPT}" \
    "${SCRIPT_DIR}/${WATCHDOG_SERVICE}" \
    "${SCRIPT_DIR}/${WATCHDOG_TIMER}" \
    "${SCRIPT_DIR}/${LOGROTATE_CONFIG}" \
    "${SCRIPT_DIR}/${UNATTENDED_UPGRADES_CONFIG}" \
    "${REMOTE_HOST}:${remote_temporary_dir}/"

"${SSH[@]}" bash -s -- "$remote_temporary_dir" <<'REMOTE'
set -euo pipefail

source_dir="$1"
[[ "$EUID" -eq 0 ]] || {
    printf 'Установка на сервере требует root.\n' >&2
    exit 1
}

for command_name in apt-config apt-get curl flock logrotate python3 systemctl systemd-analyze; do
    command -v "$command_name" >/dev/null || {
        printf 'Не найдена обязательная команда: %s\n' "$command_name" >&2
        exit 1
    }
done

bash -n "${source_dir}/chezakvest-watchdog.sh"
logrotate --debug "${source_dir}/chezakvest-nginx.logrotate" >/dev/null 2>&1

install -d -o root -g root -m 0755 /usr/local/libexec/chezakvest
install -o root -g root -m 0755 \
    "${source_dir}/chezakvest-watchdog.sh" \
    /usr/local/libexec/chezakvest/chezakvest-watchdog.sh
install -o root -g root -m 0644 \
    "${source_dir}/chezakvest-watchdog.service" \
    /etc/systemd/system/chezakvest-watchdog.service
install -o root -g root -m 0644 \
    "${source_dir}/chezakvest-watchdog.timer" \
    /etc/systemd/system/chezakvest-watchdog.timer

previous_logrotate=""
if [[ -e /etc/logrotate.d/chezakvest ]]; then
    previous_logrotate="$(mktemp /tmp/chezakvest-logrotate.previous.XXXXXX)"
    cp -a /etc/logrotate.d/chezakvest "$previous_logrotate"
fi
install -o root -g root -m 0644 \
    "${source_dir}/chezakvest-nginx.logrotate" \
    /etc/logrotate.d/chezakvest
if ! logrotate --debug /etc/logrotate.conf >/dev/null 2>&1; then
    if [[ -n "$previous_logrotate" ]]; then
        cp -a "$previous_logrotate" /etc/logrotate.d/chezakvest
    else
        rm -f /etc/logrotate.d/chezakvest
    fi
    rm -f -- "$previous_logrotate"
    printf 'Общая конфигурация logrotate не прошла сухую проверку.\n' >&2
    exit 1
fi
rm -f -- "$previous_logrotate"

install -o root -g root -m 0644 \
    "${source_dir}/52chezakvest-unattended-upgrades" \
    /etc/apt/apt.conf.d/52chezakvest-unattended-upgrades
[[ "$(apt-config shell enabled APT::Periodic::Unattended-Upgrade | sed -n "s/^enabled='\(.*\)'$/\1/p")" == "1" ]]
[[ "$(apt-config shell interval APT::Periodic::AutocleanInterval | sed -n "s/^interval='\(.*\)'$/\1/p")" == "7" ]]
[[ "$(apt-config shell reboot Unattended-Upgrade::Automatic-Reboot | sed -n "s/^reboot='\(.*\)'$/\1/p")" == "false" ]]
apt-get clean

systemd-analyze verify \
    /etc/systemd/system/chezakvest-watchdog.service \
    /etc/systemd/system/chezakvest-watchdog.timer
systemctl daemon-reload
systemctl enable --now chezakvest-watchdog.timer
systemctl start chezakvest-watchdog.service

systemctl is-enabled --quiet chezakvest-watchdog.timer
systemctl is-active --quiet chezakvest-watchdog.timer
systemctl is-failed --quiet chezakvest-watchdog.service && exit 1

printf 'Сторож, ротация логов и политика автообновлений установлены.\n'
systemctl list-timers chezakvest-watchdog.timer --all --no-pager
journalctl -t chezakvest-watchdog -n 3 --no-pager
REMOTE

trap - EXIT
cleanup
