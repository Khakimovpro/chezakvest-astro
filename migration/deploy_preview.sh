#!/usr/bin/env bash
# Публикация превью на GitHub Pages (репозиторий chezakvest-preview).
#
#   ./migration/deploy_preview.sh            — под паролем (по умолчанию)
#   ./migration/deploy_preview.sh --open     — без пароля, обычный сайт
#
# Пароль берётся из astro-clone/.preview-password (файл в .gitignore).
set -euo pipefail

cd "$(dirname "$0")/.."
BASE="/chezakvest-preview"
REPO="https://github.com/Khakimovpro/chezakvest-preview.git"
WORK="${TMPDIR:-/tmp}/chezakvest-preview-deploy"
MODE="${1:-}"

echo "→ сборка (base $BASE)"
SITE_BASE="$BASE" npm run build >/dev/null

if [ "$MODE" = "--open" ]; then
  echo "→ публикуем БЕЗ пароля"
  SRC="dist"
  MSG="Превью без пароля"
else
  [ -s .preview-password ] || { echo "нет файла .preview-password"; exit 1; }
  # The password is intentionally never passed as a process argument. Keep the ignored local
  # source readable only by the account that performs the deploy.
  chmod 600 .preview-password
  echo "→ шифруем содержимое"
  python3 _capture/encrypt_site.py --password-stdin --src dist --out dist-enc --base "$BASE/" < .preview-password | tail -2
  SRC="dist-enc"
  MSG="Превью под паролем"
fi

echo "→ выкладываем"
rm -rf "$WORK" && mkdir -p "$WORK"
cp -r "$SRC/." "$WORK/"
touch "$WORK/.nojekyll"
cd "$WORK"
git init -q
git checkout -qb main
git add -A
git -c user.name="Edward Khakimov" -c user.email="khakimovpro@gmail.com" commit -q -m "$MSG ($(date +%d.%m.%Y))"
git remote add origin "$REPO"
git push -qf origin main

echo "готово: https://khakimovpro.github.io/chezakvest-preview/"
echo "  Pages пересобирается 1-3 минуты, страницы кэшируются — проверять в новой вкладке"
