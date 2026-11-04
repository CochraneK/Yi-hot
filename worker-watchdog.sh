#!/bin/bash
# worker-watchdog.sh — 自动救活 hang 死的 aihot-worker。
#
# 判据（避免低峰误杀）：
#   - 有 new 积压 (processing_state='new' 数 > 0)：说明有活要干却没干完
#   - 最近 STALE_MIN 分钟内没有新 analyses 产出：说明 worker 实际停摆
#   - 连续两次检测都满足上述条件（约 2 个周期），才重启：防单次抖动误杀
#
# 正常低峰（new=0，没活）即使长时间无产出也不会触发重启。
set -u
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

DB="aihot-db-1"
WORKER="aihot-worker-1"
STALE_MIN=15
STATE="/tmp/worker-watchdog.stale"
LOG="/var/log/worker-watchdog.log"

NEW=$(docker exec "$DB" psql -U aihot -d aihot -t -c "select count(*) from articles where processing_state='new';" 2>/dev/null | tr -dc '0-9')
[ -z "$NEW" ] && exit 0

FRESH=$(docker exec "$DB" psql -U aihot -d aihot -t -c "select 1 from analyses where created_at > now() - interval '${STALE_MIN} minutes' limit 1;" 2>/dev/null | grep -q 1 && echo yes || echo no)

if [ "$NEW" -gt 0 ] && [ "$FRESH" = "no" ]; then
  if [ -f "$STATE" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') RESTART $WORKER (new=$NEW, no analyses in ${STALE_MIN}m) — stale detected twice" >> "$LOG"
    docker restart "$WORKER" >/dev/null 2>&1
    rm -f "$STATE"
  else
    touch "$STATE"
    echo "$(date '+%Y-%m-%d %H:%M:%S') WARN $WORKER (new=$NEW, no analyses in ${STALE_MIN}m) — first detection, watch next cycle" >> "$LOG"
  fi
else
  rm -f "$STATE"
fi
