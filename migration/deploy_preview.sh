#!/usr/bin/env bash
# Запуск защищённого preview через GitHub Actions.
#
#   ./migration/deploy_preview.sh [commit-or-branch]
#
# Workflow выполняет CI, шифрует артефакт и только затем публикует его в
# Khakimovpro/chezakvest-preview. Пароль и deploy token живут в GitHub Secrets,
# поэтому локальный .preview-password не нужен и не передаётся в process args.
set -euo pipefail

cd "$(dirname "$0")/.."
SOURCE_REF="${1:-$(git rev-parse HEAD)}"

gh workflow run deploy-preview.yml \
  --repo Khakimovpro/chezakvest-astro \
  --ref master \
  -f source_ref="$SOURCE_REF"

echo "Workflow queued for $SOURCE_REF"
echo "Watch it: gh run list --repo Khakimovpro/chezakvest-astro --workflow deploy-preview.yml --limit 1"
