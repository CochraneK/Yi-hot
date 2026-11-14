#!/bin/bash
# worker-watchdog.sh — 自动救活 hang 死的 aihot-worker。
#
# 判据一（三条同时成立，并且连续 REQUIRED 个周期都成立才重启）：
#   1. processing_state='new' 有积压：有活要干却没干完
#   2. 最近 STALE_MIN 分钟没有新 analyses：分析侧停摆
#   3. 最近 STALE_MIN 分钟也没有任何 fetch_runs：采集侧同样停摆
#
# 为什么必须看 fetch_runs：高峰避让 (ANALYZE_PEAK_PER_HOUR=8) 与低谷排队时，付费分析被限速，
# 但采集照常跑。旧版只看 1+2，把限流误判成 hang —— 11-06 一天重启 18 次、11-07 15:25 又 1 次，
# 而误杀窗口里 fetch_runs 仍有 96~214 次；重启还打断了正在跑的补时钟回填。真正的 hang 是
# worker 整体卡死（半开 DB 连接），采集与分析会同时停。
#
# 判据二（采集静默）：上面三条有个致命盲区 —— 采集先死时不会再有新条目，NEW 随之归零，
# 于是「有积压却没干」永不成立，看门狗整段时间保持沉默。2026-11-13 正是如此：17:38 起
# 六个采集任务连续超时，之后 5 小时 NEW=0，看门狗一条日志都没有，直到 22:31 整机卡死。
# 近 7 天正常采集间隔最长只有 15 分钟，所以「FETCH_IDLE_MIN 分钟一次采集都没有」本身
# 就是异常，不需要等积压出现。
#
# 查询失败一律保守退出：宁可不重启，也不能再误杀。
set -u
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

DB="aihot-db-1"
WORKER="aihot-worker-1"
STALE_MIN=30
FETCH_IDLE_MIN=60
REQUIRED=3
MIN_UP_MIN=40
STATE="/tmp/worker-watchdog.stale"
IDLE_STATE="/tmp/worker-watchdog.fetch-idle"
LOG="/var/log/worker-watchdog.log"

q() {
  docker exec "$DB" psql -U aihot -d aihot -t -A -c "$1" 2>/dev/null | tr -dc '0-9'
}
log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"
}

# 容器自己挂了（Exited / OOMKilled）不用等周期，立刻拉起来。这一步必须排在数据库查询之前：
# DB 一起挂掉时 q() 返回空、脚本会提前退出，就永远看不到「容器已死」这个最明确的状态。
RUNNING=$(docker inspect -f '{{.State.Status}}' "$WORKER" 2>/dev/null | tr -d '[:space:]')
if [ -n "$RUNNING" ] && [ "$RUNNING" != "running" ]; then
  log "RESTART $WORKER (container status=$RUNNING) — container is down"
  docker restart "$WORKER" >/dev/null 2>&1
  rm -f "$STATE" "$IDLE_STATE"
  exit 0
fi

# 刚启动的容器还没轮到采集，别把「还没开始」当成「卡住了」。
STARTED=$(docker inspect -f '{{.State.StartedAt}}' "$WORKER" 2>/dev/null | cut -c1-19)
UP_MIN=99999
if [ -n "$STARTED" ]; then
  UP_EPOCH=$(date -u -d "${STARTED}Z" +%s 2>/dev/null)
  [ -n "${UP_EPOCH:-}" ] && UP_MIN=$(( ( $(date -u +%s) - UP_EPOCH ) / 60 ))
fi
if [ "$UP_MIN" -lt "$MIN_UP_MIN" ]; then
  rm -f "$STATE" "$IDLE_STATE"
  exit 0
fi

NEW=$(q "select count(*) from articles where processing_state='new';")
[ -z "$NEW" ] && exit 0
ANALYSES=$(q "select count(*) from analyses where created_at > now() - interval '${STALE_MIN} minutes';")
[ -z "$ANALYSES" ] && exit 0
FETCHES=$(q "select count(*) from fetch_runs where started_at > now() - interval '${STALE_MIN} minutes';")
[ -z "$FETCHES" ] && exit 0
FETCH_IDLE=$(q "select count(*) from fetch_runs where started_at > now() - interval '${FETCH_IDLE_MIN} minutes';")
[ -z "$FETCH_IDLE" ] && exit 0

if [ "$NEW" -gt 0 ] && [ "$ANALYSES" -eq 0 ] && [ "$FETCHES" -eq 0 ]; then
  N=0
  [ -f "$STATE" ] && N=$(tr -dc '0-9' < "$STATE")
  N=$(( ${N:-0} + 1 ))
  if [ "$N" -ge "$REQUIRED" ]; then
    log "RESTART $WORKER (new=$NEW, analyses=0, fetch_runs=0 in ${STALE_MIN}m, streak=$N/$REQUIRED) — worker stalled"
    docker restart "$WORKER" >/dev/null 2>&1
    rm -f "$STATE" "$IDLE_STATE"
    exit 0
  else
    echo "$N" > "$STATE"
    log "WARN $WORKER (new=$NEW, analyses=0, fetch_runs=0 in ${STALE_MIN}m, streak=$N/$REQUIRED) — watching"
  fi
else
  # 只要有一条活性证据（采集在跑 / 分析有产出 / 没积压）就清零，不做常规日志以免刷屏。
  rm -f "$STATE"
fi

# 采集侧单独判：有积压没积压都要看，这是 11-13 那次唯一能救命的一条。
if [ "$FETCH_IDLE" -eq 0 ]; then
  M=0
  [ -f "$IDLE_STATE" ] && M=$(tr -dc '0-9' < "$IDLE_STATE")
  M=$(( ${M:-0} + 1 ))
  if [ "$M" -ge "$REQUIRED" ]; then
    log "RESTART $WORKER (no fetch_runs in ${FETCH_IDLE_MIN}m, streak=$M/$REQUIRED) — collection silent"
    docker restart "$WORKER" >/dev/null 2>&1
    rm -f "$STATE" "$IDLE_STATE"
    exit 0
  else
    echo "$M" > "$IDLE_STATE"
    log "WARN $WORKER (no fetch_runs in ${FETCH_IDLE_MIN}m, streak=$M/$REQUIRED) — watching"
  fi
else
  rm -f "$IDLE_STATE"
fi
