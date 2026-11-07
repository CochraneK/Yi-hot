#!/bin/bash
# worker-watchdog.sh — 自动救活 hang 死的 aihot-worker。
#
# 判据（三条同时成立，并且连续 REQUIRED 个周期都成立才重启）：
#   1. processing_state='new' 有积压：有活要干却没干完
#   2. 最近 STALE_MIN 分钟没有新 analyses：分析侧停摆
#   3. 最近 STALE_MIN 分钟也没有任何 fetch_runs：采集侧同样停摆
#
# 为什么必须看 fetch_runs：高峰避让 (ANALYZE_PEAK_PER_HOUR=8) 与低谷排队时，付费分析被限速，
# 但采集照常跑。旧版只看 1+2，把限流误判成 hang —— 11-06 一天重启 18 次、11-07 15:25 又 1 次，
# 而误杀窗口里 fetch_runs 仍有 96~214 次；重启还打断了正在跑的补时钟回填。真正的 hang 是
# worker 整体卡死（半开 DB 连接），采集与分析会同时停。
#
# 查询失败一律保守退出：宁可不重启，也不能再误杀。
set -u
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

DB="aihot-db-1"
WORKER="aihot-worker-1"
STALE_MIN=30
REQUIRED=3
STATE="/tmp/worker-watchdog.stale"
LOG="/var/log/worker-watchdog.log"

q() {
  docker exec "$DB" psql -U aihot -d aihot -t -A -c "$1" 2>/dev/null | tr -dc '0-9'
}
log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"
}

NEW=$(q "select count(*) from articles where processing_state='new';")
[ -z "$NEW" ] && exit 0
ANALYSES=$(q "select count(*) from analyses where created_at > now() - interval '${STALE_MIN} minutes';")
[ -z "$ANALYSES" ] && exit 0
FETCHES=$(q "select count(*) from fetch_runs where started_at > now() - interval '${STALE_MIN} minutes';")
[ -z "$FETCHES" ] && exit 0

# 容器自己挂了（Exited / OOMKilled）不用等三个周期，立刻拉起来。
RUNNING=$(docker inspect -f '{{.State.Status}}' "$WORKER" 2>/dev/null | tr -d '[:space:]')
if [ -n "$RUNNING" ] && [ "$RUNNING" != "running" ]; then
  log "RESTART $WORKER (container status=$RUNNING) — container is down"
  docker restart "$WORKER" >/dev/null 2>&1
  rm -f "$STATE"
  exit 0
fi

if [ "$NEW" -gt 0 ] && [ "$ANALYSES" -eq 0 ] && [ "$FETCHES" -eq 0 ]; then
  N=0
  [ -f "$STATE" ] && N=$(tr -dc '0-9' < "$STATE")
  N=$(( ${N:-0} + 1 ))
  if [ "$N" -ge "$REQUIRED" ]; then
    log "RESTART $WORKER (new=$NEW, analyses=0, fetch_runs=0 in ${STALE_MIN}m, streak=$N/$REQUIRED) — worker stalled"
    docker restart "$WORKER" >/dev/null 2>&1
    rm -f "$STATE"
  else
    echo "$N" > "$STATE"
    log "WARN $WORKER (new=$NEW, analyses=0, fetch_runs=0 in ${STALE_MIN}m, streak=$N/$REQUIRED) — watching"
  fi
else
  # 只要有一条活性证据（采集在跑 / 分析有产出 / 没积压）就清零，不做常规日志以免刷屏。
  rm -f "$STATE"
fi
