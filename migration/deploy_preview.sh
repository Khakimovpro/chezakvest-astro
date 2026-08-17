#!/usr/bin/env bash
# Запуск публичного preview через GitHub Actions.
#
#   ./migration/deploy_preview.sh [commit-or-branch]
#
# Workflow выполняет CI, собирает публичный артефакт и только затем публикует его
# в Khakimovpro/chezakvest-preview. Запуск с локальной машины не передаёт секретов.
set -euo pipefail

cd "$(dirname "$0")/.."
SOURCE_REF="${1:-$(git rev-parse HEAD)}"

gh workflow run deploy-preview.yml \
  --repo Khakimovpro/chezakvest-astro \
  --ref master \
  -f source_ref="$SOURCE_REF"

echo "Workflow queued for $SOURCE_REF"
echo "Watch it: gh run list --repo Khakimovpro/chezakvest-astro --workflow deploy-preview.yml --limit 1"
