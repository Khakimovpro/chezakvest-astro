#!/usr/bin/env bash
set -euo pipefail
# Values must never be logged even when the caller enables shell tracing.
set +x
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mode="${1:---install}"
case "$mode" in
  --dry-run)
    printf '%s\n' 'План: создать сервисного пользователя; доставить leads/ и systemd; передать env через SSH stdin; поставить http-зону nginx; запустить сервис и таймер; проверить health и nginx -t. Затем R запускает deploy.sh.'
    exit 0 ;;
  --install|--off) ;;
  *) printf '%s\n' 'Usage: ustanovit.sh [--dry-run|--off]' >&2; exit 2 ;;
esac
remote='root@82.146.60.212'
ssh_args=(-i "$HOME/.ssh/chezakvest_key" -o BatchMode=yes)
if [[ "$mode" == --off ]]; then
  ssh "${ssh_args[@]}" "$remote" 'bash -se' <<'REMOTE'
# Remove consumers before their zone, keeping the API proxy available as a 502 fallback.
sed -i '/limit_req zone=chezakvest_leads /d' /etc/nginx/snippets/chezakvest-common.conf
if test -f /etc/nginx/conf.d/chezakvest-leads.conf; then
  mv /etc/nginx/conf.d/chezakvest-leads.conf /etc/nginx/conf.d/chezakvest-leads.conf.disabled
fi
nginx -t
systemctl reload nginx
systemctl disable --now chezakvest-leads-povtor.timer chezakvest-leads.service
systemctl stop chezakvest-leads-povtor.service
REMOTE
  exit 0
fi
ssh "${ssh_args[@]}" "$remote" 'bash -se' <<'REMOTE'
id chezakvest-leads >/dev/null 2>&1 || useradd --system --home-dir /var/lib/chezakvest-leads --shell /usr/sbin/nologin chezakvest-leads
install -d -o root -g chezakvest-leads -m 750 /opt/chezakvest-leads
install -d -o root -g root -m 700 /etc/chezakvest-leads
install -d -o chezakvest-leads -g chezakvest-leads -m 700 /var/lib/chezakvest-leads
REMOTE
tar -C "$root_dir" --exclude='__pycache__' --exclude='tests' -cf - leads deploy/leads | ssh "${ssh_args[@]}" "$remote" 'set -e; install -d -m 700 /opt/chezakvest-leads-install; tar -xf - -C /opt/chezakvest-leads-install; cp -R /opt/chezakvest-leads-install/leads/. /opt/chezakvest-leads/; chown -R root:chezakvest-leads /opt/chezakvest-leads; chmod -R u=rwX,g=rX,o= /opt/chezakvest-leads; install -m 644 /opt/chezakvest-leads-install/deploy/leads/*.service /opt/chezakvest-leads-install/deploy/leads/*.timer /etc/systemd/system/; install -m 644 /opt/chezakvest-leads-install/deploy/leads/chezakvest-leads.conf /etc/nginx/conf.d/chezakvest-leads.conf'
python3 "$root_dir/deploy/leads/env_stdin.py" | ssh "${ssh_args[@]}" "$remote" 'set -e; umask 077; cat > /etc/chezakvest-leads/leads.env.new; test -s /etc/chezakvest-leads/leads.env.new; chmod 600 /etc/chezakvest-leads/leads.env.new; mv /etc/chezakvest-leads/leads.env.new /etc/chezakvest-leads/leads.env'
ssh "${ssh_args[@]}" "$remote" 'bash -se' <<'REMOTE'
systemctl daemon-reload
systemctl enable --now chezakvest-leads.service chezakvest-leads-povtor.timer
systemctl restart chezakvest-leads.service
curl --retry 5 --retry-connrefused --retry-delay 1 --fail --silent http://127.0.0.1:8790/api/lead/health
nginx -t
systemctl reload nginx
REMOTE
