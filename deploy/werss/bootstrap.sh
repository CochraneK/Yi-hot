#!/usr/bin/env bash
# Run from /opt/werss. Credentials stay in this directory, never in YiHot's .env.
set -euo pipefail
cd "$(dirname "$0")"
umask 077
mkdir -p data
docker network inspect yihot_werss >/dev/null 2>&1 || docker network create yihot_werss >/dev/null
if [ ! -f .env ]; then
  printf 'USERNAME=admin\nPASSWORD=%s\nSECRET_KEY=%s\n' "$(openssl rand -hex 18)" "$(openssl rand -hex 32)" > .env
fi
chmod 600 .env
if ! grep -q '^WERSS_IMAGE=' .env; then
  image="${WERSS_PULL_IMAGE:-ghcr.io/rachelos/we-mp-rss:latest}"
  docker pull "$image"
  digest="$(docker image inspect --format '{{index .RepoDigests 0}}' "$image")"
  test -n "$digest"
  printf 'WERSS_IMAGE=%s\n' "$digest" >> .env
fi
compose=(docker compose -f compose.yml)
if [ -f compose.weread.yml ] && [ -f overrides/weread_mp.py ]; then
  compose+=(-f compose.weread.yml)
fi
"${compose[@]}" config --quiet
"${compose[@]}" up -d
for attempt in $(seq 1 60); do
  if curl -fsS --max-time 3 http://127.0.0.1:18001/ >/dev/null; then
    echo 'WeRSS ready at 127.0.0.1:18001; open through an SSH tunnel and scan the WeChat QR code.'
    exit 0
  fi
  sleep 2
done
echo 'WeRSS did not become ready. Check: docker compose -f compose.yml logs --tail=60' >&2
exit 1
