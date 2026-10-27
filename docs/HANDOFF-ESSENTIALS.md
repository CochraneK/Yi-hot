# YiHot 长期独立维护者手册

> **用途**：原维护者离开后，接手的人要**长期独立**运营这个项目需要知道的全部——账号、钱（含充值）、信源（含加源）、日常维护、故障、以及后续怎么把网站做得更好。
> 详版见 `docs/PROJECT_CONTEXT.md`（长期交接总览）和 `MAINTENANCE.md`（完整手册）——本手册是给独立维护者的**提炼 + 问答**，不是替代品。
>
> 数据快照：账号/拓扑为 2026-10 现状；信源数为 `docs/SOURCE_REGISTRY.md` 的 **2026-10-25 13:09** 快照；费用为 `docs/COST.md` 口径。
> 接手后所有"线上数字"以**带时间戳的实时 SQL / 有效账单**为准，发现与本文不符先信实时数据并更新本文件。
>
> ⚠️ 本手册由「交接要点 + 维护者问答」合并而成；若你有更早那份独立 Q&A 原文，发来即可替换 §9。

---

## 0. 项目定位（一句话）

**AIHOT 开源框架的公益领域定制版**（站点名 Yi-Hot）：自动采集政府、国际组织、基金会、媒体关于**儿童权益、慈善治理、公益合作机会**的公开信息，AI 筛选后整理成带中文标题+摘要+原文链接的资讯流，通过网站、RSS、公开 API、邮件周/月报对外提供。**不是**上游默认的 AI 示例站——行业内容已全部换成公益口径。

---

## 1. 账号与凭据（★★★★★ 最重要）

整条链上**只有一个真正的单点**，其余都靠它解锁。

### 1.1 唯一单点：密文口令

- 所有生产凭据加密在 **`secrets/credentials.env.enc`**（已进 git）。
- 解锁它的**一把口令**不在任何文件、不在仓库里，只在原维护者脑子/密码管理器里。
- **口令丢失 = 密文报废**，只能回服务器 `/opt/yihot/.env` 和各仓库 `.git/config` 手工重取。
- 换机流程：`git clone` → `bash tools/secrets.sh decrypt`（敲口令）→ 得 `secrets/credentials.env`。
- ⚠️ 改了任何凭据后，必须重跑 `tools/secrets.sh encrypt` 重新提交密文，否则换机时还原出的是**过期值**。

**→ 你接手前必须拿到：密文口令 + 腾讯云访问 + GitHub 协作者权限（见下）。**

### 1.2 密文里装了什么（解密后就有）

| 类别 | 具体 | 用途 |
| --- | --- | --- |
| 服务器运行时 `.env` 全部 | `ADMIN_PASSWORD` / `SESSION_SECRET` / `IMG_PROXY_SIGN_SECRET` / `POSTGRES_PASSWORD` / `LLM_API_KEY` / 飞书三项 / `FUTUREME_UPSTREAM_URL` | 运行时真值在 `/opt/yihot/.env` |
| 部署 SSH | `SSH_HOST` / `SSH_USER` / `SSH_PASS` | `tools/deploy/sshexec.js` 只读环境变量 |
| GitHub | `GITHUB_OWNER` / `GITHUB_REPO` / `GITHUB_TOKEN` | REST/Git Data API 推送（本机 `git push` 被代理拦） |
| 邮件源（不在 `.env` 里） | `MAIL_SOURCE_*` + `INGEST_TOKEN` | QQ 邮箱 IMAP 采集（见 §5） |

### 1.3 还需单独确认/移交的账号

| 账号 | 用途 | 交接动作 |
| --- | --- | --- |
| **腾讯云控制台** | 管理服务器 `49.233.72.222`（2C2G 北京） | 移交账号或能操作该实例的子账号；确认**实例到期/续费日** |
| **DeepSeek 开放平台** | `LLM_API_KEY` 的余额与账单（站点真金白银几乎只花在这） | 移交平台账号或确认余额充足、充值路径；**`HTTP 402` = 余额耗尽，是终态需手动重置**（见 §2.3） |
| **QQ 邮箱（专用采集邮箱）** | IMAP 只读入口收两个批准来源 | 登录 + **IMAP 授权码**（非登录密码）随密文移交；泄露需去 QQ 邮箱设置重生成 |
| **GitHub 私有仓 `CochraneK/Yi-hot`** | 代码/文档/加密凭据/工具 | 把接手人加为协作者（至少 Contents 读写） |
| **飞书（可选）** | 站内消息推送 | 确认应用归属，必要时移交 |

---

## 2. 钱：费用与充值（★★ 维护者最常碰的事）

> 完整口径见 `docs/COST.md`。

### 2.1 钱花在哪、花多少

- 站点真金白银**只有两项**：模型调用（`llm`）+ 网页搜索（`deepseek-tools`，¥0.005/次成功请求）。RSS、官网轮询免费，只耗 CPU/网络。
- **日常出稿成本 ≈ ¥0.26–1.38/天**（单篇 ¥0.0016 量级）。**"每天太贵"通常是错觉**：某天掉十块，那天一定加了新源（首采回填）或重跑了一批历史稿。
- 单篇固定 **5 次模型调用**（prefilter 1 + score 2 + summarize 1 + structure 1），单篇 **¥0.003–0.007**。
- 单价（CNY，每百万 token）：输入未命中缓存 ¥1.00、命中缓存 ¥0.02（差 50 倍）、输出 ¥4.00。**高峰价 ×2**：北京工作日 9–12、14–18 → 补历史/批量重跑安排在夜间或周末，同样钱做近两倍量。
- **护栏（已生效）**：`budgets.llm.per_day=6000`（≈¥9–11/天滚动 24h）、`per_hour=1200`；`deepseek-tools.per_day=500`（≈¥2.5/天）；搜索源隔天跑（`everyNDays=2`）。被护栏挡**不是失败**，队列里等窗口滚动自恢复。

### 2.2 怎么自己看账（宿主机）

```bash
sudo docker exec aihot-worker-1 node scripts/cost-report.ts 7   # 近 7 天：今天的新闻 / 补历史 / 搜索 三段
```
判据：**只看「今天的新闻」那列**判断日常成本；「补历史」是加源账，单独看。
后台也可在线看：`/yihot/admin/usage`（还能在线改单价 `service_prices`）。

### 2.3 怎么充值（DeepSeek 余额）—— 最常遇到的"站点停更"根因

- 模型的钱来自 **DeepSeek 开放平台**账户（账号 = 持有 `LLM_API_KEY` 的那一个，平台地址 `platform.deepseek.com`）。**站点不绑定银行卡自动扣**，余额用完就停。
- **现象**：worker 日志/分析出现 `HTTP 402 Insufficient Balance` → 文章变 `failed` 且**这是终态**（不重试、不排队）。
- **处理顺序**：
  1. 去 DeepSeek 平台给对应账号**充值**（确认充的是持有该 `LLM_API_KEY` 的账号——曾出现"充错账号"导致 balance 没涨）。
  2. 在容器内查余额确认到账：`node`（fetch）`/user/balance`（按容器内实际接口）。
  3. **充值后必须手动重置失败状态**，否则那些 `failed` 永不被捞起重跑。要清**四个字段**一起：`processing_state` / `processing_error` / `processing_retry_at` / `processing_queued_at`（以及 `attempts`）；**只改 state 不够**，会被忽略。
  4. 新任务恢复后观察 `/admin/usage` 是否重新计费。
- ⚠️ 区分"真没钱"与"被护栏拦"：`BudgetExceededError` 是可恢复排队（窗口滚动自恢复），`402` 是余额耗尽（必须人工充值+重置）。两者现象相似但处置不同。

### 2.4 成本突增排查

先跑 `cost-report.ts 7` 看是哪一段（今天的新闻 / 补历史 / 搜索）。突增通常因为：① 批量加源（首采回填）② 历史稿被重跑（如 402 失败重入队）③ 某搜索源 lookback/频率调高。别为"全绿"盲目上调预算——先核对余额与每日上限。

---

## 3. 信源：范围与如何增加（★★）

> 全名单与实时入池数据见 `docs/SOURCE_REGISTRY.md`（脚本 `scripts/export-source-registry.py` 从线上 PostgreSQL 生成，可重跑）。快照 2026-10-25 13:09：

- **共 210 个源**（`sources.json` seed 153 + 仅数据库 57）；启用 175 / 停用 35；主力（启用且入池≥5）**113** 个。
- 生产信源以**数据库 `sources.config` 为准**，不只看 `sources.json`（还有 36 个只在库的 `web-probe-*` 探测源）。
- 唯一口径是**入池数**（`publications.selected`，LLM 评分 ≥40），不看 found/created——技术接通 ≠ 内容对口。

| 类型 | 源数 | 在用且有产出 | 入池文章 | 占比 |
| --- | --- | --- | --- | --- |
| 搜索源（DeepSeek Search） | 72 | 70 | 1256 | 67% |
| 网页列表源 | 93 | 68 | 465 | 25% |
| RSS 源 | 26 | 9 | 80 | 4% |
| JSON / API 列表源 | 17 | 2 | 52 | 3% |
| 外部系统源 | 2 | 1 | 15 | 1% |
| **合计** | **210** | **150** | **1868** | 100% |

### 3.1 覆盖范围

中央部委与国家级机构（民政部四栏、教育部、生态环境部、全国妇联、残联、网信办、最高法等）、国际组织与儿童保护（UNICEF、救助儿童会、Oxfam、WHO、世界银行、UNESCO 等）、基金会与行业（儿基会、青基会、壹基金、南都、慈善总会、慈联、基金中心网、公益时报等）、省级民政与社会事件（31 省民政已补齐，部分省级垂直厅局仍薄弱）、综合媒体（澎湃、财新等，部分 0 入池需观察）。

### 3.2 怎么增加一个信息源（完整步骤）

1. **加进 seed**：编辑 `industry/sources.json`（顶层 `{"$comment","sources":[…]}`），每个源显式写 `initialBackfillLimit`（search 12 / 其余 8，漏写会走兜底 8，历史上曾因漏写多付 3 倍）。
2. **同步到服务器**：按 §4 的三方一致流程推到 GitHub + 服务器 → `docker cp` 进 worker 容器。
3. **seed 入库**：`sudo -n docker exec aihot-api-1 node scripts/seed.ts`（**只增不覆盖**；改 `enabled`/`config` 必须 `UPDATE sources`，seed 不认）。
4. **CI 离线审计门禁（必做）**：信源增删后必须 `node scripts/source-registry-audit.mjs --write` 重生成三份产物，并同步改 `tests/source-registry-audit.test.mjs` 里硬编码的基线（`seed_rows` 等），否则 CI 第 5 步会红、本地没人跑就发现不了。
5. **验证抓取**：**必须单源跑** `collect.ts <id>`，别靠批量；按 `publications.selected` 看入池率，0 产出源观察一周再决定是否停用。

### 3.3 观察与停用

- 信源准入**只看入池率**，不看 found/created。
- 0 产出源先观察一周；停用要在数据库 `UPDATE sources` 改 `enabled`、`health='ok'`、`fail_count=0` 三列一起（36 个 `web-probe-*` 只在库里，只能 `UPDATE`）。
- 搜索源会**跨省串味**，别按源名当省籍；省级残联直连入池率天然低，不必硬铺。

---

## 4. 如何维护（核心纪律）

### 4.1 三方一致（本项目核心纪律）

**本地仓库 = GitHub `main` = 腾讯云 `/opt/yihot`** 三处必须逐文件对齐。
- 判定一致性**只能用 git blob sha**（`sha1("blob <len>\0"+内容)`）。**别用 `git log` 比对**（本地与远端历史不同源，commit sha 对不上是正常的）。
- 本机 `git push` / `git fetch` 被出口代理拦（502）→ **推送走 API**：`python tools/sync.py`（增改）、`python tools/delete.py`（删）。
- 改了 `.workbuddy/memory/` 的 5 个常青分册 → 重跑 `python tools/sync_memory.py`，否则仓库 `docs/memory/` 镜像过期。

### 4.2 部署步骤（日常上线）

```bash
# 1) 传文件（只传改过的；新目录先在服务器 mkdir -p，sftp 不自建）
scp <本地路径> <用户>@49.233.72.222:/opt/yihot/<相对路径>
# 2) 重建 + 重启（三条 -f 必须带全）
ssh <用户>@49.233.72.222
cd /opt/yihot
sudo -n docker compose -f docker-compose.yml -f compose.futureme-proxy.yml -f compose.werss.yml build
sudo -n docker compose -f docker-compose.yml -f compose.futureme-proxy.yml -f compose.werss.yml up -d --no-deps api worker web
```
- **改代码 / `changelog.json` / `industry/prompts/*`** 必须重建镜像；**web 必须一起带**，否则页面永远跑老镜像。
- **禁止 `docker cp` + `restart`**（env_file 固化、up -d 会丢文件）。改 `.env` 必须 `up -d`。
- 站点在 `/yihot/` 子路径、宿主端口 80。前端引用静态资源**必带 `/yihot/` 前缀**。

### 4.3 常见任务去哪找手册

| 任务 | 去哪 |
| --- | --- |
| 加/改信源 | `docs/sources.md` + `docs/memory/OPS.md`「CI / 离线审计门禁」 |
| 改站点文案/分类/主题 | `docs/customize.md`（`industry/` 下一切） |
| 改精选门槛 | `docs/selection.md`（**必须用标注样本重校准，别凭感觉改数字**；T1=35/T1_5=35/T2=40） |
| 看费用/用量 | `/yihot/admin/usage` + `docs/memory/USAGE.md` |
| 列表"停在昨天" | `docs/memory/CONTENT.md` 诊断顺序（先 `eligible` 再 `timeline_at`） |

### 4.4 服务健康三板斧

1. `settings` 表 `heartbeat.worker` / `heartbeat.api:3001` 是否新鲜；
2. `pgboss.job_common` 按 name/state 计数（全 completed = 健康）；
3. 到期未抓的源数（`enabled AND next_fetch_at <= now()`）应为 0。

### 4.5 时区陷阱（反复踩过）

容器内 psql 的 `now()` / `date()` 全是 **UTC**，比北京慢 8 小时。按 UTC 日期分组会把北京 0–8 点的稿划到前一天，误判"今天没采集"。按北京日期统计必须 `+ interval '8 hours'`。

---

## 5. IMAP 邮件信源

> 详见 `docs/EMAIL_SOURCE_DEPLOY.md`。**不进 Docker 的宿主 systemd 服务**，单独维护。

- 用**专用 QQ 邮箱**的 IMAP 只读入口收集两个批准来源：`email-amcham-events`（AmCham 社会影响力/ESG 活动）、`email-amity-chuanyi`（爱德传一《慈善纪事简报》）。
- 采集器：`deploy/email-source/collect.py`（读 `/opt/yihot-email/.env`，权限 600）。`BODY.PEEK[]` 只读、不改已读、不删邮件；IMAP UID 做增量游标；首次只记游标、不导历史。
- 由 `yihot-email-source.timer` **每 30 分钟**运行。向 `POST /api/ingest/items` 推送，用独立 `INGEST_TOKEN`。
- QQ 邮箱用 `imap.qq.com:993` + **单独生成的 IMAP 授权码**（不能填登录密码）。授权码随密文进 `secrets/credentials.env.enc`。
- 部署检查：`systemctl status yihot-email-source.timer` / `journalctl -u yihot-email-source.service -n 50`。
- 回灌历史（可选，一次性）：`MAIL_BACKFILL_AFTER=2026-10-01 python3 /opt/yihot-email/collect.py`。
- **邮件投递（周/月报）**：`deploy/email-delivery/` 是 SMTP 投递适配器，读公开周报/月报发送；公开订阅入口 `/subscribe`（48 小时确认信→激活）。配置在 `/opt/yihot-email-delivery/.env`。

---

## 6. 腾讯云后端管理

> 拓扑与后台详见 `docs/PROJECT_CONTEXT.md` §1–§5、§7。

- **服务器**：腾讯云 2C2G 北京，Ubuntu 24.04 + Docker。源码树 `/opt/yihot`（与本地仓库同一份）。公网 `http://49.233.72.222/`。
- **容器**：`aihot-{db,api,worker,web}-1`，全部来自**同一个镜像 `aihot-app`**。web 占宿主 80 端口。
- **管理后台** `/yihot/admin`（未登录一律 302→登录页；302≠路由存在，须登录看 200）：
  - 用量与成本 `/admin/usage`：按日/用途统计 token 与费用，**可在线编辑单价** `service_prices`（表空着金额显示"未定价"）。
  - 模型与评测 `/admin/models`：每项能力当前模型、成功率、耗时、费用；切模型只影响之后的新任务。
  - 内容诊断、信源（发现候选/新建）、反馈、运行、设置、审计记录。`ADMIN_PASSWORD` 在密文里。
- **数据模型要点**（写 SQL 前看 `PROJECT_CONTEXT.md` §4）：`publications` 无 `created_at`；`articles.identity_key = url:<url>`；`analyses` 摘要列叫 `summary_zh`；`receipt_attempts` 每次线上调用记一条（`origin='live'`）；`service_prices` 单价表按 `service` 匹配。手动入队 pgboss 写 `pgboss.job`。
- **FutureMe**（`/futureme/`）是另一项目，由 web 容器反代转发，别误删其 compose 片段（`compose.futureme-proxy.yml`）。
- **WeRSS**（公众号采集）走 `compose.werss.yml`，管理端只监听本机 127.0.0.1，需 `ssh -L` 打隧道才能开管理页（详见 `WERSS_DEPLOY.md`）。

---

## 7. 迁移 / NAS（可选）

> 当前生产**仍在腾讯云**。NAS 是把整套迁到群晖/QNAP 等家用设备的选项，详见 `MAINTENANCE.md` §十八。

- 核心服务用 Docker Compose，满足最低条件的 NAS 能跑；但生产还含 **WeRSS 和邮件 systemd 定时器**，"核心站点能启动"≠"全部功能已迁移"——需逐项替代。
- NAS 未必有 systemd：邮件/公众号采集改 NAS 计划任务或定时容器，且**必须单实例**（防重复采集/发信）。
- 反向代理用 NAS 自带或独立 Caddy/Nginx，将公网 HTTPS 转发到 web 容器；`SITE_URL` 改最终公开地址，代理负责访客 IP 时配 `TRUST_PROXY`。**不要把数据库端口映射到公网**。
- 不要把明文 `.env` 放进 NAS 公开共享或自动同步到无加密网盘。
- **不建议迁移**的情况：NAS 内存≤2GB 还要跑其他重服务；或只想要备份——那种情况 NAS 只做加密备份、继续用云服务器更稳。

---

## 8. 后期建设网站（★★ 你想继续发展时要看的）

站点已从"能跑"到"可用"，后续可按需扩展。代码地图与扩展纪律：

### 8.1 代码地图

| 位置 | 是什么 | 维护者改它干嘛 |
| --- | --- | --- |
| `industry/` | **所有行业配置**：站名文案(`site.ts`)、分类标签(`taxonomy.ts`)、主题(`topics.json`)、信源(`sources.json`)、提示词(`prompts/`)、门槛(`selection.ts`)、模块开关(`features.ts`)、品牌(`brand/`)、条款页(`pages/`) | 改文案/分类/门槛/加源，**通常不用动 `apps/` `packages/`** |
| `apps/web` | 前端（React Router + Vite，`base:"/yihot/"`） | 改页面/交互/样式 |
| `apps/api` | HTTP 服务，**所有公开数据只从 `packages/backend/src/publication/` 这一读取层读** | 加公开接口也走 publication 层 |
| `packages/backend` | 采集、分析、评分、发布、管理后台、计费 | 改采集/分析/计费逻辑 |
| `database/migrations` | 只做向后兼容的增量迁移，按编号加在末尾 | 改表结构 |
| `scripts/` `tools/` | 运维/同步/核查脚本 | 日常操作 |

### 8.2 改内容 vs 改代码

- **只改行业内容**（文案、分类、主题、信源、门槛、提示词）→ 动 `industry/`，按 §4.2 重建部署即可。
- **改站点功能/外观** → 动 `apps/web` + 必要时 `packages/backend`；后端无构建步骤（Node 24 直接跑 TS），前端走 Vite 构建。

### 8.3 工程纪律（扩建时别破）

- 前端**只通过 HTTP 读 `apps/api`**；数据库、模型调用、密钥只在后端。
- **读者打开页面不触发模型调用**；模型只在 worker 的任务里调用。
- **付费请求都经过回执**（`providers/receipts.ts`）和**预算熔断**，不要绕开。
- 公开内容匿名，管理员和访客看到的一样；后台只允许管理员。
- **不要提交** `.env`、密钥和 `.data/`；**不要使用 AIHOT 的名字和 Logo**（行业定制版）。
- 改完至少跑：`npm run typecheck`、`npm test`（需 `DATABASE_URL` 指向 `*_test`/`*_ci` 库，先 `node scripts/migrate.ts`）、web 构建+测试、`node scripts/smoke.ts --base http://localhost:3000`。

### 8.4 常见扩展方向（按性价比）

1. **关于页数字**：由 `industry/site.ts` 的 `ABOUT.account` 驱动，须与报告手工同步；二维码取 `settings.contact_qr`（**不许用 ima 那张**）。
2. **更新日志** `industry/changelog.json`：由 `scripts/changelog-check.mjs` 卡死（标题≤32、body≤2 行等），写"读者看到的变化"。
3. **新公开出口**（如小程序、嵌入组件）：一律从 publication 读取层取数，不复刻查询逻辑。
4. **信源扩量**：优先搜索源横向复制 > 补栏目 > 宽频道加关键词（搜索源贡献约 56% 入池）。
5. **成本再省**（已做回填半价+兜底 8；未做）：`structure_article` 只为将入池稿跑、`prefilter` 只喂标题+摘要+前 800 字（见 `COST.md` §七）。

---

## 9. 常见问题 Q&A（维护者版）

**Q1：站点突然不更新 / 列表停在昨天了，先查什么？**
A：按顺序——① 看 `settings` 表里 `heartbeat.worker` 是否新鲜；② `pgboss.job_common` 是否全 completed；③ 是不是 `HTTP 402` 余额耗尽（见 §2.3）；④ 列表"最新一天"由第一个 `eligible` 条目决定，与采集时间无关，先查 `eligible` 再查 `timeline_at`（`docs/memory/CONTENT.md`）。别一上来就重启。

**Q2：钱花光了怎么处理？**
A：见 §2.3。去 DeepSeek 平台给持有 `LLM_API_KEY` 的账号充值 → 容器内查余额确认 → **手动清空 failed 那批的 4 个字段**让其重跑。只改 `state` 不够。

**Q3：想加一个信息源，最快怎么做？**
A：见 §3.2。改 `industry/sources.json` → 推 GitHub+服务器 → `seed.ts` 入库 → **重生成审计产物并改测试基线**（否则 CI 红）→ 单源 `collect.ts <id>` 验证入池。

**Q4：想改站点文案 / 分类 / 门槛？**
A：文案分类主题在 `industry/`，改完重建部署（§4.2）。改门槛必须用标注样本重校准，且要重算 `analyses.selected` 并入队 `publication.republish-source` 才生效（详见 `docs/selection.md`）。

**Q5：想继续开发网站（加功能/改版）从哪入手？**
A：见 §8。内容类改 `industry/`；功能类改 `apps/web`+`packages/backend`。守住三条：公开只读 publication 层、页面不触发模型、付费走回执+熔断。

**Q6：换一台电脑 / 换人接手，最少要带什么？**
A：三样——**密文口令**（`secrets/credentials.env.enc` 的解锁口令，唯一单点）+ **腾讯云访问** + **GitHub 协作者权限**。拿到后 `git clone` → `tools/secrets.sh decrypt` → 按本手册 §0–§8 接手。

**Q7：服务器要续费 / 想迁移到别的地方？**
A：腾讯云实例到期前在控制台续费。想迁 NAS/新云见 §7，核心可从 `docker-compose.yml` 起，但要把 WeRSS 和邮件定时器一并替代，且保持单实例。

**Q8：收不到邮件 / 订阅不了周报月报？**
A：订阅入口 `/subscribe`（48h 确认信→激活）；投递由 `yihot-email-delivery.timer` 每 30 分钟检查。收不到先看 `systemctl status yihot-email-delivery.timer` 与 journalctl 日志；退信地址会被自动标 `bounced`。

**Q9：成本突然飙升？**
A：跑 `cost-report.ts 7` 看是哪一段。多是批量加源（首采回填）或历史稿重跑（如 402 失败重入队）。别盲目上调预算。

**Q10：本机 `git push` 为什么报错？**
A：出口代理只放行 `api.github.com`，`github.com` 的 git smart-HTTP 被拦（502）。**推送必须走 `tools/sync.py` / `tools/delete.py`**（REST/Git Data API）。判定一致性只用 blob sha，别用 `git log`。

---

## 10. 接手最短路径（给下一个人的第一步）

1. 拿齐三样：**密文口令 + 腾讯云访问 + GitHub 协作者权限**。
2. `git clone https://github.com/CochraneK/Yi-hot` → `bash tools/secrets.sh decrypt`。
3. 按顺序读：**本文 → `docs/PROJECT_CONTEXT.md`（§1→§2→§3 口径→§7 凭据→§8 上手）→ `docs/memory/MEMORY.md` → `tools/README.md` → `secrets/README.md`**。
4. 动手前记三条硬纪律：**三方一致 / 推送走 API / 改门槛口径要连带测试与文档**。
5. 真要上线：按 §4.2 的 `scp` + `ssh` + `compose build/up -d`（或 `tools/deploy/` 脚本）。
6. 看实时状态：§4.4 健康三板斧 + §2.2 看账 + 后台 `/yihot/admin`。

---

*本手册是交接提炼件，不随每次改动更新；详版与实时数据以 `PROJECT_CONTEXT.md` / `MAINTENANCE.md` / `SOURCE_REGISTRY.md` / 线上 DB 为准。若你有更早那份独立 Q&A 原文，发来即可替换 §9。*
