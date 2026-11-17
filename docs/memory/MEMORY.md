<!-- 本文件由 tools/sync_memory.py 从 .workbuddy/memory/MEMORY.md 单向生成，请勿直接编辑。 -->
<!-- 源目录 .workbuddy/ 在 .gitignore 里，所以这里是为「换机器 / 换 AI 接手」准备的脱敏镜像。 -->
<!-- 要改：改 .workbuddy/memory/MEMORY.md → 重跑 `python tools/sync_memory.py`。 -->

# YiHot 长期笔记（11-17 精简；旧全文见 `ARCHIVE-2026-11-16-full.md` 与同目录 `2026-*.md`）

## 部署
- `ssh yihot:/opt/yihot` **非 git**，宿主要 `sudo docker`。容器 `aihot-{db,api,web,worker}-1`；`sudo docker exec aihot-db-1 psql -U aihot -d aihot`（容器 now() 是 UTC）。
- 同步：`git archive --format=tar HEAD | gzip -1 | ssh yihot "sudo tar xzf - -C /opt/yihot"`（只含跟踪文件、天然 LF，约 20s）。
- 发布：`sudo -n docker compose -f docker-compose.yml -f compose.futureme-proxy.yml build api web` → `up -d --no-deps --force-recreate api worker web`。**build≠换镜像**，核 Image == `aihot-app:latest`。只重建 web 时 api/worker 显示 sha 属正常（同一份服务端代码），但 `check_report_deployment.py` 逐文件比源码，改后端必须三容器一起 recreate。改 `db.ts` 必 recreate worker；crontab 用文件法（heredoc 会 bad minute）。
- **「本地 git 干净」≠「生产在跑这份代码」**。只认文件哈希。远端有别的 agent 持续推送：push 前 `git fetch origin main:refs/tmp/rmN -f` → `git rebase refs/tmp/rmN`，核验只信 `git ls-remote`。提交信息用 `-F 文件`（反引号会被 shell 吞）；多会话并发只 add 具体路径。
- **邮件脚本是宿主副本**：`deploy/email-delivery/send_reports.py` → `/opt/yihot-email-delivery/send_reports.py`（root 700，timer 每 30 分钟）。用 `sudo tee` 写隐藏临时文件再 `mv`（`sudo cat >` 的重定向由非 root 执行会 Permission denied）。核查：`sudo python3 scripts/check_report_deployment.py --runtime --web-build-root <dir>`（必须 root）。`reportQualityVerified` **写死 False**。
- 迁移：新 `.sql` 与 `schema_migrations` 记账同一事务，现到 `0056_geo_auto_scan`；只跑迁移用 `setup` 容器 `node scripts/migrate.ts`。
- `/yihot/` 的 80=web；443 属 `futureme-https`（**勿动**）。诊断带 Host：`curl -skI -H 'Host: 49.233.72.222' https://127.0.0.1/yihot/x`。`SITE_URL` 是 IP（无域名 = SEO 死结）。
- 大改前 `pg_dump -Fc` 到 `/opt/yihot-archive/base/` + 旧镜像打 tag。加源：`industry/sources.json`→同步→`seed.ts`；改 enabled 要 `UPDATE sources`；**新配置键必须同时改 `config-keys.ts`**。
- 合并事件走审计接口：`POST /api/auth/password`（读 `.env` 的 `ADMIN_PASSWORD`）→ `GET /api/admin/me` 拿 csrf → `POST /api/admin/stories/merge`。

## 报告
- 节奏（CST）：日报每天 08:00（覆盖前一日 08:00–当日 08:00）、周报周一 06:00、月报每月 1 日 06:30。`/daily` 硬跳 `/weekly`，**`/daily/<日期>` 详情页可读**（是 302 不是 404）。
- 内容存 `reports.content` JSONB，渲染时才套模板。昨日热榜只由 `yesterdayHotForReport()` 出（日报取前一日、周/月报取期末），无当期快照就整块省略，绝不拿实时榜充数。
- **长度目标（11-16 恢复原值，别再压小）**：`overviewLength` 周 150–300 / 月 200–400；`report-period.md` 分节 80–180；`report-daily-lead.md` 导语 2–3 句 ≤150、标题 ≤30。曾被压到 75/120、≤55、≤95。
- **日报 highlights 3–5 条**（11-17 23:30 从 1–3 恢复）。四处一起改：prompt、`ReportPaper.tsx` `slice(0,5)`、`send_reports.py` `[:5]`、`publication/reports.ts` 无编号兜底（日报 5 / 周月 3）；`compose.ts` 对编号去重（重复 itemId 撞前端 key）。改 prompt 会变 `promptVersion` 哈希。
- **折叠边界**：只有周/月报分节有 summary，折成「本版原摘要」；日报分节 summary 本就是空串（不是漏做）。总摘要已不折叠（`9a07bef`）。
- **不给版面编 00**（11-16 已回退）：头条/本期导读/本周观察/本月分析无编号，目录与邮件从 01 起。

## 地图（高德 JS API 2.0）
- `features/cities/HeatMap.tsx`（`CityHeatMap`）挂在 `/hot`，城市独立页已取消；`amap.ts` 按需加载 SDK + `wgs84ToGcj02()`，leaflet 已不在产物里。换掉 OSM：国内直连 12s 超时，且境内公开地图必须有审图号。
- **key 判型**：`AMAP_JS_KEY` 必须是「Web端(JS API)」key——打 `restapi.amap.com/v3/ip` 回 `10009 USERKEY_PLAT_NOMATCH` 才是，`10000` 是 Web 服务 key。`AMAP_SECURITY_CODE` 实测不填也能画（只画 Map+CircleMarker）。
- 深浅色跟 `<html data-theme>`：`MutationObserver` + `setMapStyle()`，`amap://styles/dark` / `whitesmoke`，**不重建 map**。
- 坑：① 别删 `features` 的 `point` 层（城市名跟着走）；② SDK 把容器 `position` 改 `relative`、高度算成 0，宿主自己 `h-full w-full` + 父容器 `h-[260px]` 定高；③ `setFitView` 会被 21 个海外点带跑，只对 `lon 73–136 / lat 3–54` 取景且**只在首次绘制调**；④ `CircleMarker.label` 是死参数，城市名用 `AMap.Text` + `pickSpread()`（互隔 4.5° 经 / 3.5° 纬取 8 个）。
- 容器用 `solid`（有过点即永久真）gate，**不能 gate 在「此刻有点」**，否则切档瞬间卸载、高度 430→90px，即「图和 no1 一起跳」；等待期保留旧点；重绘依赖单调递增 `mapVersion`（refs 刚被 null 过会提前 return → 计数对但无圆）。
- `/api/site/geo/heat?hours=&level=province|city|district`（缺省 city）。省坐标 = 城市文章加权；区县坐标 = 父城市 + `spreadCounties()` 黄金角螺旋。**区级只含报到区县的报道**，总数天然小。
- **筛选谓词三处同改**：`placeCondition()`、`loadGeoPlaces()` 计数、热力/目录；统一 `gc.place_id = X OR gc.place_id IN (SELECT id FROM geo_places WHERE parent_id = X)`。**四种计数单位**：`geo/places`+`catalog` 是篇（含下属）、`geo/heat` 是窗口篇数、`/pool` 是条（去重）、季度报告是篇+事件——「卡片 88、列表 51 条」不是 bug。
- **首屏不内嵌地点目录**：只在 `?place=` 时请求 `/geo/places?id=`（`loadGeoPlace()` 直查，没报道的城市也能命名）；旧短 id 才 lazy 拉 `/geo/catalog` 并回写 localStorage。搜索与「展开城市」的区县是**两个 onClick**，漏一个会存成 `city: 江宁区`。522→285 KB。
- 闸门 `/api/site/geo` 只出 `verified AND role='event'`。核准队列自带游标（`auto_reviewed_at IS NULL` + 0056 部分索引），改回裸 `ORDER BY id` 会头部阻塞；跳过者保持 pending、从不驳回。回填 100%（1448 个 `candidates` 本就空）；verified 4,937 条 / 1,184 地点 / 覆盖 40.0%。卡 `Receipt N is in flight` 把 `receipts.status` 置 `failed`。
- `geo_places.region` 曾写死 null → 现取 `entry.province`，历史用 `scripts/fix-geo-region.ts`。季度报告 `scripts/quarterly-report.ts --from --to --out=/tmp/q1`（`/app` 只读，之后 `docker cp`），离线不调模型。

## 采集
- 准入唯一口径 `publications.selected`；`isPoolEligible` 要 pass + 中文标题摘要。搜索源幂等窗口 = 北京当天，首轮 01–05 点，之后每 6h `items=0`——「白天没新稿」是结构性的。
- 姊妹站 `kind=peer`：`sources/peer.ts` 只读 `peer_items`（零出网），闸门是 `requireMarkers` 词表；**中文短词必误命中（「学前」中「数学前提」），一律写词组**。找新站扫 fork 的 `site/site.ts`。`/peers` 按 8 主题分组，`tier=resource`、`requiresPaidAccess`、`directoryVisible:false` 不进页面。

## 成本 / LLM
- 全站 `deepseek-flash`；`ANALYZE_OFFPEAK_ONLY=true` + `PEAK_PER_HOUR=8`。成本取决于抓进多少候选，**与放不放进池无关**。
- **`budgets` 日窗口是滚动 24 小时**（`started_at > now()-interval '1 day'`）、**无零点自愈**。11-17 停 8h35m 就是回填吃掉 8,400 次后把 `per_day` 从 24000 改回 9000，而窗口已有 9,039——上限低于当前用量即全站锁死。**降 `per_day` 前先查用量**；批量活儿临时抬闸、等旧桶滚出再还原。
- 额度四种单位：Kilo 200/h/IP（滚动 60 分钟、不可累积、**不做匀速节流**）、OpenRouter 50/日（两 key 同账号不扩容）、Zhipu 1 并发、llm7 100k token/日。凌晨崩要按 provider 拆。
- 撞日线 → `BudgetExceededError(…, 3600)` → 退回 `new` + `processing_retry_at=+1h`。单位成本 **¥0.001854/次**，9,000/天 ≈ ¥17，是防失控闸不是省钱手段。anydoor 网关 `/home/ubuntu/anydoor`（127.0.0.1:8787），改 `gateway/server.mjs` 后 `docker restart anydoor-gateway-1`；新字段必须进 `normalizeConfig` 白名单。

## 安全 / 运维
- 爬虫策略唯一来源 `contracts/bot-policy.ts`；UA 黑名单只表达立场与拦纯页面爬虫，程序调接口由限流管（`contracts/rate-limit.ts`，判定在 `apps/api/src/http/rate-limit.ts`，内网跳过；`llms.txt` 念同一份）。
- `TRUST_PROXY` 曾为 false 致 443 全体共用一个 IP 桶；现只在 TCP 对端为内网时采信 XFF 最后一跳。Caddy `header` 不带 `>` 是追加语义，应用再设一遍会 `nosniff, nosniff`。
- worker hang 根因 = postgres.js 半开连接；watchdog 双判据：①「new>0 且 30min 无 analyses 且无 fetch_runs」×3，②`fetch_runs` 60min 空。内存 db640/api448/worker960/web192m，关 apport。postgres.js 里**含撇号的字面量必须参数化**。
- 归档 `scripts/archive-db.py`（ctid 分批，内容表不删，cron 每月 1 日 04:40 带 `--delete`），删完 `VACUUM FULL`。**备份从未定期运行**，唯一兜底手动 dump。

## 其他
- **单篇页没有「AI 导读」**（11-17 去掉）：`item.tsx` 只在 `summaryOnly || !item.body` 时显示，标签统一「摘要」。
- **摘要解析两个雷**：① 模型答 `**Title:**` 而 prompt 要 `title_zh:` → 正则需接受 `title|标题|中文标题` / `summary|摘要|导读|中文摘要`，星号可在冒号两侧，值再 `unwrapBold`；② 模型会把推理过程、prompt 指令、整段英文当摘要，`usableCopy()` 在解析时清空让兜底生效（`selected` 不读 summary，不误伤入选）。
- 飞书默认 `FEISHU_PUSH_MODE=daily`（20:30 热榜卡），改 mode/cron 必须重建 worker；`19007` 是群侧拒收。仓库 fork `CochraneK/Yi-hot`，只 cherry-pick 不 merge 上游。
- 站点对 HeadlessChrome 返 403：验收要覆盖 UA；puppeteer-core + `%LOCALAPPDATA%\ms-playwright\chromium-1248\chrome-win64\chrome.exe` 直连可用（`--no-proxy-server`）。改结构文件先 Write 成 `.workbuddy/tmp/*.cjs` 再跑，别用 `node -e` 内联。
- 待决：`privacy.md` 三处「请填写」；`/daily` 是否导航露出；canonical 是否切 https；PR #398 是否审。
