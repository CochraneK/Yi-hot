<!-- 本文件由 tools/sync_memory.py 从 .workbuddy/memory/CONTENT.md 单向生成，请勿直接编辑。 -->
<!-- 源目录 .workbuddy/ 在 .gitignore 里，所以这里是为「换机器 / 换 AI 接手」准备的脱敏镜像。 -->
<!-- 要改：改 .workbuddy/memory/CONTENT.md → 重跑 `python tools/sync_memory.py`。 -->

# Yi-Hot 内容口径 / 时区健康

## 发布时间 vs 收录时间（用户反复强调）
- ⚠️ **发布时间 ≠ 收录时间**：`published_at`＝**原文发布**，`discovered_at`＝**本站首次抓到**（API 名 `publishedAt`/`discoveredAt`）。三层物化链 `articles.published_at` → `articles.timeline_at` → `publications.timeline_at/sort_at`。
  - **各列表排序字段不同，别记混**：首页精选＝**`sort_at`**（`timeline.ts`，按"组"取 `max(sort_at)` 作锚点）；`/all`＝**`timeline_at DESC`**（`pool.ts`）；公开 API v1＝`by=published`→`coalesce(published_at,discovered_at)`｜`mode=selected`→`sort_at`｜否则 `timeline_at`（`v1.ts:40`）。
  - ⚠️ **`published_at` 为空会回退成 `discovered_at` 却仍标"发布时间"**（`detail.ts:163`、`v1.ts:40` 都 `coalesce`）→ 看到某日期不代表原文那天真发了。
  - ⚠️ **`sort_at` 不能直接 UPDATE**（精选项是读取组锚点，会被下次发布覆盖）→ 改用入队 `publication.republish-source`。
  - 🔴 **回填 `published_at` 后必须同时重算 `backfill` 与 `timeline_at`（10-09 用户一眼看出的真 bug）**：`decideTimeline()`（`content/materials.ts:74-82`）规则 = **`discovered_at - published_at > 48h`（`STALE_ON_DISCOVERY_MS`）→ `backfill=true` 且 `timeline_at = published_at`**；否则 `timeline_at = discovered_at`。这两个是**入库时算好的物化值**，事后改 `published_at` **不会**回头重算。
    - **现场**：新加源首抓时 DB 配置还没有 `publishedAtSelector` → 入库时 `published_at=NULL`，stale 判定进不去 → `backfill=false`、`timeline_at=收录日`；事后只回填了 `published_at` 没重算 → **4~9 月旧文件顶着 10-09 的排序时间占住 `/all` 榜首**（用户："10.9 有些不是今天的吧"）。
    - **修法**：`UPDATE articles SET backfill=true, backfill_reason=coalesce(backfill_reason,'stale-on-discovery'), timeline_at=published_at WHERE NOT backfill AND published_at IS NOT NULL AND discovered_at - published_at > interval '48 hours'` → 再入队 `publication.republish-source`（`publish.ts:254/262` 会把 articles 的 `backfill`/`timeline_at` **拷贝**进 publications 并重算 `sort_at`）。
    - **附带效果（都正确）**：`isHistorical()` 转真 → 不再 founds event / 加热度、不再触发选中文推送（`publish.ts:295` 对 backfill 跳过推送）；**`isSelectable` 不看 backfill** → 精选状态不变，只是 `sort_at` 归位到真实日期。
    - **自检口径**：`articles` 中 `NOT backfill AND published_at IS NOT NULL AND discovered_at - published_at > interval '48 hours'` 的行数**应为 0**（10-09 修完 = 0；修前 = 18，全在 `web-mee-zcwj`）。
  - **主题板块只列 `selected`（精选）**：`loadTopicPage` 用 `selectedCondition`（`items.ts:85`）→ 板块"没有精选内容"只代表该标签下**没有精选**，不代表没有文章；`topicMatchTags` 对 **company 主题只认 `entity:<id>`**（不认中文标签），字段/genre 主题才认自己的中文标签。
  - **诊断"列表停在昨天"的顺序**：先 `eligible`（判定）再 `timeline_at`（排序）；**`discovered_at` 对列表顺序完全不起作用**。
- 首页 `/`=精选；`/all`=全部动态。两者都强制 `listedCondition(now) AND p.eligible`。
  - `listedCondition`＝`visibility='public' AND (NOT selected OR visible_after<=now)`。
  - **`eligible`＝`isPoolEligible`**（`publication/rules.ts:19`）：`participation_mode='editorial'` + **`relevance='pass'`** + 有标题 + 有摘要。→ **prefilter 判 BLOCK/UNKNOWN 不进列表**；列表"最新一天"＝第一个 eligible 条目，与采集时间无关。
- 晋升 `isSelectable(eligible, judgedSelected, tier)`；`judgedSelected=analyses.selected` 是分析时存下的布尔，**republish 只读不重算**。门槛 `industry/selection.ts`：**T1:35 / T1_5:35 / T2:40**（10-08 按公益内容分布重校准，原 60/65/76 是 AI 行业门槛）。**改门槛 SOP**：改 selection.ts → deploy → `UPDATE analyses SET selected=…`（DISTINCT ON latest，按 `output->'scores'`）→ 入队 `publication.republish-source` → 等执行 + 新晋 180s 可见延迟。
  - ⚠️ **改门槛/口径必须同步三处**：代码（`selection.ts`）＋**测试**（`tests/analyze.test.ts` 硬编码 `tierThreshold` 与夹具分数）＋**文档**（`docs/selection.md` 门槛示例）。10-08 那轮只改代码 → CI 的 `npm test` 从此变红（旧断言仍按 60）。
  - ⚠️ **`understandFloor`(50) 目前空转**：它**高于** T1/T1_5 门槛(35) → 未入选资料平均分必然 < 35 ≤ 50 → `near = sum ≥ 门槛×2 || sum > 地板×2` 里地板那一侧**永不生效** → 「差一点入选也用精选写法」**不可达**，未入选一律走便宜的标题摘要翻译。**是否下调（如 30）属产品口径，用户尚未定夺**（已在 `docs/selection.md` 标注）。
- prefilter＝`analyze.ts`：**`BLOCK` 才停**（UNKNOWN 放行）；`processing_state='blocked'`＝判"与公益无关"，非故障。
- **源 20（19 启用 + UN 停用）**，含**生态环境部×3**；rss-un-news 停用因 Fastly 封数据中心 IP（恢复＝配 `EGRESS_PROXY_URL`+up -d）。CI `check.yml` 断言 `count(*) from sources` = `^20$`（加源必同步）。
- **轮询（10-09 起）**：启用源**统一 30 分钟**（原 60；环境部原 240/300/360）。DB-only：`UPDATE sources SET interval_minutes=30 WHERE enabled;` + `next_fetch_at=now()+(random()*30)*interval '1 minute'`。**⚠️ `sources.json` 仍写 60**（seed 只增不覆盖＝有意不一致，**DB 是真值**）。系统＝**定时轮询制**（非推送），`interval`＝新内容被发现的最大延迟。
- 环境主题（10-09 打通 → **同日 21:10 撤销放宽，用户要求"环境先不通过"**）：**3 个 MEE 源保留**，但 **prefilter 的环境白名单已撤回**。
  - **撤销内容**（`industry/prompts/prefilter.md`）：①PASS 行去掉"环境保护/气候治理/生态保护/碳达峰碳中和/绿色低碳/环境污染治理/生物多样性/濒危物种保护/湿地与森林保护/海岸带与海洋保护/垃圾分类与资源循环/环境公益诉讼与环评公示/ESG与可持续金融"；②删"环境保护与气候治理是本站在册公益领域…"与"环境与气候领域的判定不要求出现公益慈善字样…"两段；③"不得以…BLOCK" 里去掉"只是环保资讯""只是气象新闻""只是行政管理"；④**新增专条**：「环境、气候、生态与气象主题暂不作为公益相关领域…即使主体是政府部门/生态环境或气象机构/国际组织/企业绿色项目，也按 BLOCK 处理；只有同时具备公益慈善主体、公益项目、志愿服务或募捐捐赠要素才 PASS」。
  - **保留了非环境的放宽**（政府部门/公立学校/事业单位在慈善、社会组织、教育、乡村教育、学生资助、医疗健康、养老、儿童、残障、乡村、妇女儿童等领域的政策 → PASS）。
  - **放宽版备份**：`D:\Software\DSH\deploy\backup-prefilter-relaxed-20261009.md`（md5 `4e907588…`）；撤后版本 md5 `eb044a53…`。**要恢复放宽就回传这个文件 + build**。
  - **实证**（同一篇环境内容显式重评，`attemptTag`）：`prompt_version` 由 `prefilter@6e1e7afeff` → **`prefilter@1dfd9b5f03`**，prefilter 判定由 **PASS（"生态环境部大气污染治理政策解读"）** → **UNKNOWN（"生态环境政策解读，非公益慈善领域"）** ✓ 提示词生效。
  - ⚠️ **"不通过"的表现是 `relevance=unknown`，不是 `processing_state=blocked`**：`analyze.ts:449` 只把 `out.relevance==='block'` 写成 `blocked`，UNKNOWN **放行**继续分析；但 `isPoolEligible` 要求 **`relevance='pass'`** → **UNKNOWN 同样进不了 `publications`（不上站）**。判断"会不会上站"看 **`publications.eligible`**，别只看 `processing_state`。
  - ⚠️ **存量不受影响**：提示词只作用于**新内容/重评**。10-09 已入库并上站的环境内容（zcwj 15 条 eligible，含"生态环境监测条例""美丽中国建设成效考核办法""党政领导干部生态环境损害责任追究办法"等 6 条精选）**仍在站上**，需显式重评才会退出。
  - MEE 解析：链接 `./YYYYMM/tYYYYMMDD_NNNNNNN.shtml`；**zcwj＝`itemSelector: "ul li:has(a[href$='.shtml']), ul li:has(a[href$='.html'])"` + `publishedAtSelector: span.date`**；hjyw/xwfb＝**`dl>dt>a.cjcx_biaobnan+span.cjcx_shijian`（用 dl dt 避开 dd 摘要）**。根路径是 `/zcwj/`（`/ywdt/zcwj/` → 302→404）。
- ⚠️ **信源噪声：栏目导航混入正文（10-09 修复，勿再踩）**：政务站顶部**栏目导航**与真文章同为 `ul>li>a`、href 又同在栏目前缀下 → 躲过 `allowUrlPrefixes`，栏目名（"部文件/行政审批文件/其他"）被当文章入库。
  - **判别＝"链接是页面不是目录"**：真文章 href 以 `.shtml`/`.html` 结尾，导航 href 是 `/` 结尾的目录 → `itemSelector: "ul li:has(a[href$='.shtml']), ul li:has(a[href$='.html'])"`。
  - ❌ **别用 `:has(span.date)`**（真内容日期可能是纯文本，zcjd 6 条会被误删）；❌ **别信"无日期＝噪声"**（`publishedAtSelector` 不参与 `itemSelector` 过滤）；❌ **清理绝不用 `length(title) < N`**（`地下水管理条例` 仅 7 字，是真文件）。
  - **清理已入库噪声**＝精确标签 ＋ 目录式 URL **双条件**（`url ~ '(/[a-z]+)*/$'`，**正则要支持多级**，`/zcwj/[a-z]+/$` 会漏三级目录），走"备份 → 干跑 → 删 articles+publications/analyses → 触发抓取验 `new=0`"。
  - ⚠️ **`sources.json` 改了不等于生效**：`seed` **只增不覆盖** → `publishedAtSelector` 加进文件但 DB 里没有，导致新入库行 `published_at` 全空、公开页把发现时间当发布时间。**DB `sources.config` 才是运行时真值。**
- ⚠️ **`publishedAtAuthoritative` 不是 web_list 顶层合法键**（只在 `detail` 内）→ 写了 setup 容器 exit 1 → **全站挂**。白名单＝`packages/backend/src/sources/config-keys.ts` 的 KEYS.web_list，**改 sources.json 先本地校验再部署**。
- `http-fetch.ts` guardedFetch：20s / ≤8MB / 重定向 ≤5 跳逐跳 SSRF / UA=crawlerName；退避 `min(interval×(fail+2),360)min`，**永不禁用源**。
- 表口径：`fetch_runs`（status ok/failed，found_count/new_count）｜`publications` **无 created_at**，五字段 `eligible/visibility/visible_after/selected/backfill`｜`articles` 32 列，`identity_key=url:<url>`｜`analyses` 摘要列 **`summary_zh`**（+`title_zh`/`reason_zh`），一文可多条→JOIN 重复行｜`reports` 内容在 `content->'sections'`。
- pgboss：手动入队写 **`pgboss.job`**：`INSERT …(name,data,state,retry_limit,singleton_key,start_after)`。队列 `cron.*`/`sources.fetch`/`content.analyze`/`content.extract-body`/`ops.*`（`apps/worker/src/schedules.ts`，tz Asia/Shanghai）。
- 飞书告警：`.env FEISHU_INTERNAL_ENABLED=true`+APP_ID/SECRET+`ALERT_CHAT_ID`；**`ALERT_QUIET_MINUTES=2880`（48h）**（默认 360 对政府源夜间空窗+周末每晚误报）。alerts.ts 比 `max(articles.discovered_at)`，open 态存 `settings.alerts.state`。

## 时区 / 健康
- **psql 显示 UTC**（服务器本地是北京）：DB `to_char` 读数 **+8h** ＝北京时间；`settings` 的 ISO 带 Z 也是 UTC。曾虚惊"worker 停抓 8h"。
- 三板斧：①`settings` 看 `heartbeat.worker`/`heartbeat.api:3001` 新鲜度；②`pgboss.job_common` 按 name,state 计数（全 completed＝健康）；③due 源 count（`enabled AND next_fetch_at<=now`）=0。

## 页面日期口径（10-09 核实 · 最易误读处）
- **列表的日期分组头（"今天 / 10月9日 / 周五"）＝ `timeline_at` 的北京日期；组内条目左侧 "18:48" ＝ `timeline_at` 的北京时分（＝本站收录时刻）。**
- **列表/卡片不显示"发布日期"** → "今天 + 18:48" 极易被读成"内容发生在今天"。实际含义是"**今天被本站收录**"。DOM 结构：`<section aria-label="YYYY-MM-DD">` 为分组，组内 `<time dateTime="…Z">HH:MM</time>`。
- 因此判断"某条是不是今天的"**只能看 `published_at`，不能看列表**：
  - 非回填条目 `timeline_at = discovered_at`（今天），`published_at` 可能是昨天/上周（≤48h 内仍按"新"处理）。
  - 回填条目 `timeline_at = published_at`（旧文归位）。
- **10-09 实例**：`/all` "今天"组 4 条全是 `web-mee-zcwj` 的**国务院文件（法规修订全文）**，`published_at = 10-09` 与源站一致（`/zcwj/gwywj/202610/t20261009_*.shtml`，详情页明写"发布时间：2026-10-09"）→ **不是 bug**；但内容主体是旧法规（《生态环境监测条例》2026-01-01 才施行）→「**今天发布 ≠ 今天的新闻**」。
- **与上一轮 18 条的区别**：上一轮是**旧文**（4~9 月发布）因入库时 `published_at` 空、48h 规则没跑到而顶到榜首＝真 bug（已修）；这 4 条源站本身就是 10-09 发布＝非 bug。
- **源站路径**：`mee.gov.cn` 政策文件在 **`/zcwj/`**（`/ywdt/zcwj/` → 404）；子栏目 `gwywj`（国务院文件）、`bwj`（部文件）等。
