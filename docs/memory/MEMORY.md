<!-- 本文件由 tools/sync_memory.py 从 .workbuddy/memory/MEMORY.md 单向生成，请勿直接编辑。 -->
<!-- 源目录 .workbuddy/ 在 .gitignore 里，所以这里是为「换机器 / 换 AI 接手」准备的脱敏镜像。 -->
<!-- 要改：改 .workbuddy/memory/MEMORY.md → 重跑 `python tools/sync_memory.py`。 -->

# YiHot 长期笔记（精简版，11-16 重写；11-16 前全文见 `ARCHIVE-2026-11-16-full.md`）

## 部署
- 线上 `ssh yihot:/opt/yihot` **非 git**，宿主无 npm/psql，要 `sudo docker`。容器 `aihot-{db,api,web,worker}-1`；`sudo docker exec aihot-db-1 psql -U aihot -d aihot`（容器 now() 是 UTC）。
- 整包同步首选：`git archive --format=tar HEAD | gzip -1 | ssh yihot "sudo tar xzf - -C /opt/yihot"`（只含跟踪文件，天然 LF，25MB/867 文件约 20s）。校验时 Windows 清单要把反斜杠换成 `/`。
- 发布：`build api web` → `up -d --no-deps --force-recreate api worker web`。**build≠换镜像**，必须核对容器 Image == `aihot-app:latest`；改 `db.ts` 必 recreate worker；crontab 用文件法（heredoc 会 bad minute）。仅改 web 包时可以只重建 web，此时 api/worker 的 Image 会显示成 sha 而非 tag（跑的是上一次构建的同一份服务端代码），不是没换镜像。
- **「本地 git 干净」≠「生产在跑这份代码」**：11-16 查明整条地理功能线从未上过生产。判断部署状态只认文件哈希。
- **GitHub 分叉已合（11-16 20:10）**：本地 34 个 geo/地图提交与远端 10 个 reports 提交在 `a462d55` 分了半天，已 merge（`7a50980`）后推 main。**远端有别人/别的 agent 持续推送**（`docs(pdf)` 自动提交、`geo:` 小改），每次 push 前必须 `git fetch` + `git rebase refs/tmp/rmN`，否则 `! [rejected]`。CI 无部署步骤，别人推 main 不覆盖生产。
- 后台合并事件走自己的审计接口，别手写 SQL：`POST /api/auth/password`（取 `.env` 的 `ADMIN_PASSWORD`，不打印）拿 cookie → `GET /api/admin/me` 拿 csrf → `POST /api/admin/stories/merge {from,into,reason}`。
- **报告邮件脚本是宿主副本，不随 docker 部署**：`deploy/email-delivery/send_reports.py` → `/opt/yihot-email-delivery/send_reports.py`（root 700，systemd timer 每 30 分钟跑）。替换用 `sudo tee` 写隐藏临时文件 → `mv` 原子改名（`sudo cat >` 会因重定向由非 root 执行而 Permission denied）。上线核查：从新镜像 `docker create --entrypoint /bin/true aihot-app` 提取 build → `sudo python3 scripts/check_report_deployment.py --runtime --web-build-root <dir>`，必须 root 才读得到邮件脚本。`reportQualityVerified` 在没生成过带新字段的期刊前恒为 false，11-17 08:00 那期是第一次可能翻转。
- **报告的文字长度目标（11-16 已恢复原值，别再压小）**：`compose.ts` 的 `overviewLength` = 周报 150–300 / 月报 200–400 字；`industry/prompts/report-period.md` 分节 summary 80–180 字；`report-daily-lead.md` leadParagraph 2–3 句 ≤150 字、标题 ≤30 字。那条 reports 线曾压到 75/120、≤55、≤95——用户明确要求恢复，因为新功能（昨日热榜/证据洞察/折叠/01 起编号）都不依赖压缩，压了只是让新期比旧期薄。日报 highlights 仍是 1–3 条（条数不算长度）。提示词一改 `promptVersion` 哈希就变，可据此区分压缩期与恢复期。
- **期刊节奏与可达性**：日报每天 08:00（覆盖前一日 08:00–当日 08:00）、周报周一 06:00、月报每月 1 日 06:30（宿主 CST）。`/daily` 硬跳 `/weekly`（`report-latest.tsx`），**详情页 `/daily/<日期>` 正常可读**，日报不是 404 是 302。`昨日热榜` 只由 `yesterdayHotForReport()` 出，日报取「前一日」、周/月报取「期末那天」；没有当期已发布快照就整块省略，绝不拿实时榜充数。
- **折叠的真实边界**：只有周报/月报的分节有 summary 和 overview，折叠成 `本版原摘要` / `查看本期原摘要`；**日报的分节 summary 本来就是空串**，所以日报没有可折的东西（不是漏做）。热榜插在最前，后续版面编号整体后移。
- **不要给版面编 00**（21:20 已回退）：分析页/头条恢复无编号（`头条` / `本期导读` / `本周观察` / `本月分析`），目录与邮件都从 01 起。`check_report_deployment.py` 会逐文件比对 api/worker 容器内源码，只重建 web 会让它报 mismatch，必须三个容器同镜像。
- 迁移：新 `.sql` 与 `INSERT INTO schema_migrations` 必须同一事务（`--single-transaction`），否则留下「表建了没记账」。当前到 `0056_geo_auto_scan`。只跑迁移不跑 seed：`docker compose run --rm --no-deps setup node scripts/migrate.ts`。
- 站点 `/yihot/`，80=web；443 属另一项目 `futureme-https`（**勿动**），其 Caddy 兜底反代 80。`SITE_URL` 是 `http://49.233.72.222/yihot`（无域名 = SEO 死结，百度验不了 IP）。
- **443 诊断必须带 Host**：`curl -skI -H 'Host: 49.233.72.222' https://127.0.0.1/yihot/x`，否则回空响应像挂了。
- 大改前：`pg_dump -Fc` 到 `/opt/yihot-archive/base/` + 旧镜像打 tag。
- 加源：`industry/sources.json`→同步→`seed.ts`；改 enabled 要 `UPDATE sources`；**新配置键必须同时改 `config-keys.ts`**。诊断看 `/all`（`FEATURES.selectedFeed=false` 时 `/` 302）。

## 地图（11-16 已换高德）
- 热力地图组件 `apps/web/app/features/cities/HeatMap.tsx`（`CityHeatMap`），**挂在 `/hot`，城市独立页已取消**。底图已从 Leaflet+OSM 换成**高德 JS API 2.0**：`features/cities/amap.ts` 按需加载 SDK + `wgs84ToGcj02()` 偏移；leaflet 已从构建产物消失（首屏少一个包）。
- **为什么换**：OSM 瓦片国内直连实测 12s 超时 HTTP 000（DNS 正常），手机无代理必挂，组件按设计折叠成一行「地图底图没加载出来」；且境内公开地图必须用有审图号的底图（高德/腾讯/天地图/百度），OSM 的中国国界绘制也不符官方主张。
- **配置**：`.env` 的 `AMAP_JS_KEY` 必须是「Web端(JS API)」平台 key。判型办法：拿它打 `restapi.amap.com/v3/ip`，回 `10009 USERKEY_PLAT_NOMATCH` 才是 JS key，回 `10000` 是 Web 服务 key（不能用）。`AMAP_SECURITY_CODE` 只有 2021-12 后创建的 key 才需要；**实测本项目只画 Map+CircleMarker、不调服务接口时不填安全密钥也能正常出图**。
- **深浅色必须跟着壳走**：站点用 `<html data-theme>`（`THEME_BOOT_SCRIPT` 先于 paint 写入），地图选 `amap://styles/dark` / `whitesmoke`，用 `MutationObserver` 监听 `data-theme` 走 `setMapStyle()` 热切换——不重建 map，否则覆盖物和视野全丢。深色壳里放 whitesmoke 会变成一块刺眼白板。
- **不要动 `features`**：为去掉高德自带的城市小红点而删掉 `point` 层，会把城市名一起弄没（地名跟着点层走），实测确认，保持默认四项。
- **容器高度会被高德吃掉**：SDK 给容器加 class `amap-container` 并把 `position` 强制成 `relative`，`absolute inset-0` 因此失效、高度算成 0（canvas 712×0、卡片纯黑），但 `complete` 照常触发、降级不启动。宿主必须自己 `h-full w-full`，靠父容器 `h-[260px]` 定高。
- **`setFitView` 会被海外点带跑**：库里有坎帕拉/安塔利亚/澳大利亚等 21 个非中国点（真实事件，照画）。305 点一起 fit 会落到 `center [76.2,10.3] / zoom 3`＝一屏印度洋。只对 `lon 73–136 / lat 3–54` 的国内点取景。
- **`CircleMarker` 的 `label` 是死参数**：传了不报错也不渲染（305 marker → 0 label 节点）。城市名用 `AMap.Text`，`pickSpread()` 选「计数靠前且互隔 4.5° 经度 / 3.5° 纬度」的 8 个，否则南京/上海/杭州叠在一起。
- 窗口切换（48h/周/月）只重绘覆盖物、**不重建 map**（否则丢视野）；每个窗口的结果缓存在组件里，取数失败退回 48h。上限 `HEAT_MAX_HOURS = 720` 在 `publication/geo.ts`，api 路由引用同一常量。
- 圆点 `4 + 11*sqrt(count/max)` + `fillOpacity 0.22`；月窗口 305 城时更大的圆会在华东糊成一块无层次的红。
- key 天然公开（前端可见），Web 服务 key 绝不能进前端。威海项目 `D:\2026\WB项目\旅行规划\.env.local` 里那把是 **Web 服务 key**，不能拿来画地图。
- 数据闸门：`/api/site/geo` 只出 `review_status='verified' AND role='event'`，且 `an.input_revision=ar.revision` 且 `p.analysis_id=gc.analysis_id`；`/api/site/geo/heat?hours=` 出城市点（面积随 count 变，非半径）。
- 现状（11-16 18:45）：`geo_places` 1028（县级 673）、verified event 3439、pending event 3628（已扫完未核准，不再重扫）；热力 48h 33 城 / 周 170 / 月 305。后台 `/admin/geo`（列表 / `POST /places` / `POST /:id/review`，401 保护）。
- **核准队列必须自带游标**：`autoApprovePending` 只扫 `role='event' AND auto_reviewed_at IS NULL`，扫完整批盖时间戳（迁移 0056，部分索引匹配该谓词）。改回「裸 `ORDER BY id LIMIT n`」就会头部阻塞——11-16 每小时复扫最老 800 条（其中 452 条是永远不可能核准的非 event），`approved` 连续为 0，一挪游标立刻出 51 个。跳过的候选仍保持 pending、证据不动（从不自动驳回）；词表更新后 `scripts/geo-auto-approve.ts --reset-scan --apply` 重扫。
- **回填已 100% 完成**（11-16 更正）：6193 个合格分析里 4745 个有条目，另 1448 个的 `geography.candidates` 本来就是空数组（模型没抽出地点），真实缺口 = 0。别再被「6193−4745」这个减法骗到。中断续跑用 `scripts/geo-backfill-drain.ts --missing-only --apply`（只补有缺口的，`--after` 保证前进）。
- **存细看粗**：`industry/geo/divisions.json`（2585 县级）存到区县，`parent_id` 指地级市；坐标继承父城市、precision 仍记 `city`。**11-16 20:20 起筛选不再一律上卷**：`?place=区县` 只返回它自己，用的是 `gp.id = X OR gp.parent_id = X`（区县没有子级、城市有），一条谓词同时满足两种粒度；页面地点列表在选中区县时按 `gp` 分组，否则「江宁区 22 条」会被标成「南京」。
- **省/市/区三档（11-16）**：`/api/site/geo/heat?hours=&level=province|city|district`，缺省 city，etagPrefix 带 level。三档共用同一 WHERE。省坐标 = `avg(city.lat/lon)` 文章加权（源数据没有省坐标，不是省会）；区县坐标 = 父城市，前端 `spreadCounties()` 按同坐标分组做黄金角螺旋（0.16×√i 度）并在脚注写明「点按所属城市位置排开」。**区级视图只含报到区县的报道**，总数天然小于城市视图，文案和脚注都写了，别当成丢数据。港澳台 5 条按 `中国香港/中国澳门/中国台湾` 补 region。
- **筛选谓词三处必须同时改**（11-16 21:05 踩过）：`placeCondition()`（`/all?place=`）+ `loadGeoPlaces()` 计数 + 热力/目录。`placeCondition` 原先只有 `gc.place_id = X`，在三档之前等价于上卷（区被折进城市）；区县独立成地点后卡片写「那曲 88」、点进去只有 7 条。现统一成 `gc.place_id = X OR gc.place_id IN (SELECT id FROM geo_places WHERE parent_id = X)`。`loadGeoPlaces` 的分组也从 `gp.id` 改成城市取上卷篇数、区县取自己（改前那曲写 8）。
- **四种计数单位不同，别硬对齐**：`geo/places`+`geo/catalog` 是**篇**（`count(DISTINCT article_id)`，城市含下属）；`geo/heat` 是窗口内篇数；`/api/site/pool` 的 `total` 是**条**（同题聚类去重后）；季度报告城市表是篇+事件。所以「卡片 88、列表 51 条」不是 bug。
- **首屏不内嵌地点目录（11-16 21:50）**：`/all` loader 原来无条件请求全量 `/api/site/geo/places`（1,319 行 / 218 KB）进 loader data，React Router 序列化进文档 → 首屏 522 KB。现在只在 `?place=` 时请求 `/geo/places?id=`（`loadGeoPlace()` 直查 `geo_places`，**没报道的城市也能命名**，不像 `loadGeoPlaces()` 要 `JOIN own`）；旧短 id 才 lazy 拉 `/geo/catalog` 并把 canonical id 写回 localStorage（第二次不再拉）；父城市名由 `CityPicker.onPick(place, parentName)` 传。**搜索结果里的区县和「展开城市」里的区县是两个 onClick**，漏一个就存成 `city: 江宁区`、当地徽章匹配不到南京。改后 285 KB。
- **回填 + 核准已收尾（11-16 21:10）**：8,998 篇已发布报道全部有 `geography`（`NOT (output ? 'geography')`=0）；核准累计 verified 4,937 条、1,184 个地点、覆盖率 **40.0%**（低于 50%，报告横幅照打）。剩 5,221 条 pending 是规则不放行（不在 gazetteer/机构电头/市以下/重名），不是欠账。卡 `Receipt N is in flight` 的把 `receipts.status` 手工置 `failed` 即可重跑（`pending` 是占位，`updated_at` 超 10 分钟 `PENDING_STALE_MS` 才允许接管）。
- **季度报告**：`scripts/quarterly-report.ts --from=2026-09-30 --to=<date> --out=reports/q1`，离线、不调模型，写 `report.md` + `figures.json`。容器里 `/app` 只读，`--out` 要写 `/tmp/q1` 再 `docker cp`/`cat` 取回。首份放 `reports/q1/`。
- **`geo_places.region` 曾是空的**：`toResolved()` 写死 `region: null`，264 个城市没有省，省级视图只剩 4 个点。已改成 `entry.province ?? null`；历史用 `scripts/fix-geo-region.ts` 补（244 可推导，20 条国外城市本来没省）。
- **切 level 后地图不画点的坑**：切档时新档还没数据 → 地图容器卸载 → `map.current = null`；数据到达后重建实例，`setReady(false)` 与 `setReady(true)` 落在同一批被 React 合并，`ready` 从 true 到 true 没有净变化、依赖数组不变，重绘 effect 又因为 refs 刚被 null 过提前 return → **计数正确但一个圆都没有**（首屏能画是因为 ready 从初始 false 变 true）。修法：单调递增 `mapVersion`，实例建成即 +1 并作为重绘依赖；effect 里用 `if (!instance || !AMap) return` 直接查 ref，不要查 state。
- **容器不能再 gate 在「此刻有点」上（11-17）**：`{!hasPoints ? null : …}` 会让切档瞬间整块卸载——实例 `destroy()`、瓦片重载、卡片高度从 ~430px 掉到 ~90px，`继续看 No.0x` 以下全部上移再长回来，就是用户说的「整个图和 no1 一起跳跃闪烁」。现在用 `solid`（一旦有过点永久为真）gate 容器，create effect 依赖也是 `solid`；红绘 effect 加 `if (!visible.length && waitingFor !== null) return`，等新档时**保留旧圆点**；脚注同样从 `hasPoints` 换成 `solid`，否则等待期间那一行消失又是一次抖动。实测 45/45 采样同一个 DOM 节点、高度与 No. 偏移 delta 0（唯一变化是区县脚注多一行 +18px，一次性）。
- **`setFitView` 只在实例第一次绘制时调（11-17）**：原来每次红绘都调，切窗口/切层级会把读者放大到的省拉回全国——与文件头「switching the window only replaces the circles」的说明自相矛盾。用 `fitted` ref 控制，cleanup 时重置。

## 采集
- 准入唯一口径 `publications.selected`；`isPoolEligible` 要 pass + 中文标题摘要。
- 「白天没新稿」是结构性的：搜索源幂等窗口=北京当天，首轮 01–05 点，之后每 6h `items=0`；白天只剩实时源。
- 姊妹站当信源 `kind=peer`：`sources/peer.ts` 只读 `peer_items`（零出网），闸门是 `requireMarkers` 儿童公益词表；**中文短词必误命中（「学前」命中「数学前提」），词表一律写词组**。找新站扫 fork 的 `site/site.ts`（`SITE.name` 才是真信号），别查讨论区。
- 邻域页 `/peers` 只按 8 个主题分组（health/civic/nonprofit/research/product/news/market/growth），`tier=resource`、`requiresPaidAccess`、`directoryVisible:false` 不进页面。

## 成本 / LLM
- 全站 `deepseek-flash`；`ANALYZE_OFFPEAK_ONLY=true` + `PEAK_PER_HOUR=8`（工作日白天只 8 篇/时，18 点后补清）。成本取决于抓进多少候选，**与放不放进池无关**。
- anydoor 免费池：网关 `/home/ubuntu/anydoor`（127.0.0.1:8787），改 `gateway/server.mjs` 只需 `docker restart anydoor-gateway-1`（bind mount ro）。新增字段必须进 `normalizeConfig` 白名单。
- 额度是四种不同单位：Kilo 200/h/IP（60 分钟滚动窗口、不可累积，**不做匀速节流**）、OpenRouter 50/日（两 key 同账号，第二个不扩容）、Zhipu 1 并发、llm7 100k token/日。凌晨崩的原因要按 provider 拆，别只盯 Kilo。
- **`budgets` 的日窗口是滚动 24 小时**（`receipt_attempts.service=X AND origin='live' AND started_at > now()-interval '1 day'`），不是自然日，**没有零点自愈**。2026-11-17 停了 8h35m 就是因为回填吃掉 8,400 次后把 `per_day` 从 24000 改回 9000，而窗口里已是 9,039——上限低于当前用量 = 全站锁死，只能等记录老化。**降 `per_day` 前先查窗口用量**；批量活儿正确做法是临时抬闸、等旧桶滚出窗口再还原（当时三个桶要分别等 16:00/17:00/20:00 才出窗）。
- 撞日线 → `BudgetExceededError(…, 3600)` → `afterFailure()` 把文章退回 `new` + `processing_retry_at=+1h`，每小时试一次。单位成本 **¥0.001854/次**（近 7 天 24,360 次 = ¥45.17），9,000/天 ≈ ¥17，所以 per_day 是防失控的闸不是省钱手段。

## 安全
- 爬虫策略唯一来源 `packages/contracts/src/bot-policy.ts`；**UA 黑名单只用于表达立场（训练型）和拦纯页面爬虫（SEO），程序调接口由限流管**。
- 公开接口限流表 `packages/contracts/src/rate-limit.ts`（`/api/v1/*` 180/分等），判定在 `apps/api/src/http/rate-limit.ts`，内网来源跳过；`llms.txt` 念同一份表。
- `TRUST_PROXY` 曾为 false 导致 443 全体访客共用一个 IP 桶（限流/留言/登录全串），已改 true，且只在 TCP 对端为内网时采信 XFF 最后一跳（`packages/contracts/src/net.ts`）。
- 443 的 Caddy `header` 不带 `>` 是追加语义，应用再设一遍会 `nosniff, nosniff` 使规则作废。

## 运维
- **本仓库可能有多会话并发**（11-16 21:22 实测）：另一个会话 `git add -A` 把本会话写的 `pool.ts`/`geo.ts`/`MAINTENANCE.md`/`changelog.json`/`reports/q1` 卷进了它自己那笔「reports: put the text lengths back」提交。提交前先 `git status`、只 add 具体路径、别整树 add；推之前 `git ls-remote origin main` 对一下，已推就不必重推（内容在就不改写历史）。
- worker hang 根因=postgres.js 半开连接；watchdog 双判据：①「new>0 且 30min 无 analyses 且无 fetch_runs」×3，②`fetch_runs` 60min 为空（采集先死时判据①永不触发）。
- 内存：db640/api448/worker960/web192m，关 apport；根治仍需 2核4GB。
- postgres.js 里**任何含撇号的字面量必须参数化**（`${"..."}`）。
- 归档 `scripts/archive-db.py`（宿主跑，ctid 分批删，内容表永不删，cron 每月 1 日 04:40 带 `--delete`），删完必 `VACUUM FULL`。
- **备份从未定期运行**：`.env` 无 `DB_BACKUP_STORE_*`，唯一兜底是手动 dump。

## 其他
- **单篇页不再有「AI 导读」（11-17）**：`item.tsx` 只在 `summaryOnly || !item.body` 时显示，标签统一「摘要」。那块是 `877d6d5`（2026-09-29 初版）加的，不是后来的改动；正文之上再放一段同义摘要，读者要的是新闻不是机器复述。
- **摘要解析的两个雷（11-17）**：① prompt 要 `title_zh:`/`summary_zh:`，模型会答 `**Title:**`/`**Summary:**`——正则只认下划线标签就落到「无标签兜底」，第一行当标题、其余当摘要，**标签原文一起入库**。现接受 `title_zh|title|标题|中文标题`、`summary_zh|summary|摘要|导读|中文摘要`，星号可在冒号**两侧**（只写冒号前会漏掉 `Title:**` 的尾随星号），值再 `unwrapBold`。② 更糟的是内容本身：模型会把推理过程（`1. **Analyze the Request:** - Role: Senior …`）、prompt 指令（`80-160字，最多3句`）、整段英文当摘要交上来。`usableCopy()` 在**解析时**清空这些，让各调用方的兜底（原文标题/无摘要）自动生效；`selected` 只看相关性与分数、**不读 summary**，所以清空不会误伤入选。11-15/16 共 86 条中招，全部 `selected=false`，已把 `title` 换回 `articles.title`、`summary` 置 NULL。
- 飞书默认 `FEISHU_PUSH_MODE=daily`（20:30 热榜卡），改 mode/cron 必须重建 worker；`19007 Bot Not Enabled` 是群侧拒收。
- 邮件：宿主 `yihot-email-delivery.timer` 跑 `/opt/yihot-email-delivery/send_reports.py`，仓库 `deploy/email-delivery/` 必须同步。
- 仓库 fork `CochraneK/Yi-hot`，不 merge 上游只 cherry-pick，ssh 推送最稳，核验用 `git ls-remote`。
- 站点对 HeadlessChrome UA 返 403：无头验收要覆盖成普通 Chrome UA。**不需要起本机反代**，puppeteer-core + `%LOCALAPPDATA%\ms-playwright\chromium-1248\chrome-win64\chrome.exe` 直连 `http://49.233.72.222/yihot/...` 可用（加 `--no-proxy-server`，本机 SakuraCat 全局模式会拦境内地址）。截图若用 `clip`，坐标是**文档坐标**，滚动后要补 `scrollY`。
- 改结构文件不要用 `node -e` 内联，先 Write 成 `.workbuddy/tmp/*.cjs` 再跑。
- 待决：`/privacy`、`/terms` 仍是模板；canonical 是否切 https；8 篇/时是否放宽；`/records` 无侧栏入口。
