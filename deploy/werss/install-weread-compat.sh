#!/usr/bin/env bash
set -euo pipefail
cd /opt/werss
grep -Eq '^WERSS_IMAGE=.*@sha256:125472e8a58a05f02b930ba2b958575ffc87378743d9491383b13390f709215e$' .env
mkdir -p overrides
if [ ! -f overrides/weread_mp.original.py ]; then
  docker compose -f compose.yml cp werss:/app/core/wx/model/weread_mp.py overrides/weread_mp.original.py
fi
printf '%s  %s\n' '6dfd34ced1b85bc935e0c2ba532c6468064ed8ebf5d22ac0a002679e81ea2d6c' 'overrides/weread_mp.original.py' | sha256sum --check --status
cat overrides/weread_mp.original.py > overrides/weread_mp.py
printf '\n' >> overrides/weread_mp.py
cat weread-list-compat.py >> overrides/weread_mp.py
docker compose -f compose.yml -f compose.weread.yml config --quiet
docker compose -f compose.yml -f compose.weread.yml up -d --no-deps --force-recreate werss
install -m 644 yihot-weread.service yihot-weread.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now yihot-weread.timer
