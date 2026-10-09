# PROJECT_CONTEXT — 冷启动交接（换机器 / 换 AI 必读）

> **这份文件为什么存在**：项目的日常记忆（踩坑、口径、SOP）原本只存在于开发机的 `.workbuddy/memory/`，而该目录在 `.gitignore` 里——它**从不进仓库**。结果是：换一台电脑、或换一个 AI 来接手时，只有代码，没有经验，会重复踩坑。
> 本文把它**脱敏后**写进仓库：任何机器 clone 之后都能立刻接手。**凭据一律不在本文**（见文末「凭据在哪」）。
>
> 更新时间：2026-10-09。深度内容请配合 `docs/architecture.md`、`docs/deploy.md`、`docs/sources.md`、`docs/selection.md` 阅读。

---

## 1. 站点与拓扑

| 地址 | 内容 |
| --- | --- |
| `http://49.233.72.222/` | 多项目门户（静态 `apps/web/portal.html`，由 `server.ts` 的 `servePortal` 直接发出） |
| `http://49.233.72.222/yihot/` | **Yi-Hot 主站**（本项目） |
| `http://49.233.72.222/futureme/` | FutureMe（另一项目，由 Yi-Hot 的 web 容器反向代理转发） |
| `http://49.233.72.222/yihot/admin` | 管理后台 |

- 服务器：腾讯云 2C2G 北京，Ubuntu 24.04 + Docker。源码树在 `/opt/yihot`（**与本地仓库同一份内容**）。
- 容器：`aihot-{db,api,worker,web}-1`，全部来自**同一个镜像 `aihot-app`**（web / api / worker / setup 共用）。web 占宿主 80 端口。
- Dockerfile 是 `COPY . .` → **`industry/` 与 `data/` 会被烘焙进镜像**，改动它们必须 rebuild。
- 路径前缀：vite `base: "/yihot/"` + react-router `basename: "/yihot/"`（**尾斜杠必须**，否则 SSR manifest 会拼出 `/yihotassets/`）；`server.ts` 负责剥前缀、把旧 URL 301 到带前缀的地址。**前端里引用静态资源必须带 `/yihot/` 前缀。**

## 2. 部署流程

```sh
# 1) 传文件（只传自己改过的；新目录要先在服务器 mkdir -p，scp/sftp 都不会自建）
scp <本地路径> <用户>@49.233.72.222:/opt/yihot/<相对路径>

# 2) 重建 + 重启
ssh <用户>@49.233.72.222
cd /opt/yihot
sudo -n docker compose -f docker-compose.yml -f compose.futureme-proxy.yml build
sudo -n docker compose -f docker-compose.yml -f compose.futureme-proxy.yml up -d
```

> ⚠️ **部署辅助脚本不在本仓库里。** 仓库内的 `deploy/` 只有 `Caddyfile`；开发机上另有一个同名目录（`D:\Software\DSH\deploy\`）放着 `sshexec.js`（远程执行）、`sftp-upload.js`（单文件上传）、`sftp-upload-many.js`（批量单连接上传）、`verify-*.sh`（登录后验证后台页）。**换机器接手时，这些要单独交接**；只用上面的 `scp` / `ssh` 也能完成部署，脚本只是省事。
> 同目录还有一枚**过期**的 `cloud.env`——它是 `.env` 的旧副本，**禁止用来覆盖服务器上的 `.env`**。

- `package-lock.json` 未变时构建是**热缓存**（~50 秒）；只改 web 可 `up -d --no-build web`。
- **禁止 `docker cp` + `restart`**：`env_file` 在容器创建时固化，`restart` 不生效；而 `up -d` 重建容器会丢掉 `cp` 进去的文件（代码静默回退）。
- 改 `.env` **必须 `up -d`** 才生效。
- seed 是**只增不覆盖**：`sudo -n docker exec aihot-api-1 node scripts/seed.ts`。

### 三方一致性（本项目的核心纪律）

三个位置必须逐文件对齐：**本地仓库 = GitHub `main` = 腾讯云 `/opt/yihot`**。

- 判定一致性**只能用 git blob sha**（`sha1("blob <len>\0" + 内容)`）。普通 `sha1sum`/`md5sum` 跨系统必然全不一致；**不要用 `git log` 比对**——本地 git 历史与远端历史不同源，commit sha 对不上是正常的。
- 本机保留的工具（不在本仓库内，属开发机资产）：
  - `_sync_yihot.py` 增改（**没有删除能力**）
  - `_delete_yihot.py` 删（bottom-up 重建树 + 剪掉变空的目录；安全闸门＝删除前后**全量 path→blob-sha 对照**：移除集==预期、新增集==空、存活路径 sha 不变）
  - `_verify_yihot_threeway.py`（GitHub + 本地）、`_server_diff_full.py`（在服务器上跑，产出可上传清单）
- ⚠️ **踩过的坑**：曾写了个"删一张废弃图"的脚本，`POST /git/trees` **不做任何校验**，结果把整个 `apps/` 子树提升到了仓库根（535 → 312 blobs），而脚本自身的 blob 比对因为本地集合也被带偏而"自证通过"。**结论：改远端树的脚本必须先只读打印每层 tree sha 核对，推送后独立复核顶层目录与关键文件是否存在。**

## 3. 内容口径与质量闸门

### 3.1 ⚠️ 发布时间 ≠ 收录时间（**最容易搞混、务必先读这一节**）

同一个条目身上有**两个互不相同的时间**，混用会得出完全错误的结论：

| 概念 | 字段 | 含义 |
| --- | --- | --- |
| **原文发布时间** | `published_at`（API：`publishedAt`） | 这条内容**在来源网站上是什么时候发的** |
| **本站收录时间** | `discovered_at`（API：`discoveredAt`） | **我们第一次抓到他**的时间 |

**站内是三层物化链**，不是直接读原文时间：

```
articles.published_at      ← 从列表页/详情页解析出来的发布时间
      ↓
articles.timeline_at       ← 用于对外展示与排序的时间（回填/修正会重算）
      ↓
publications.timeline_at / publications.sort_at   ← 发布时物化的值
```

**各列表到底按什么排**（这里很容易记错，写错了结论就反了）：

| 位置 | 排序字段 | 代码 |
| --- | --- | --- |
| 首页精选时间线 | **`sort_at`**（按"组"取 `max(sort_at)` 作锚点） | `publication/timeline.ts` |
| `/all` 全部动态 | **`timeline_at DESC`** | `publication/pool.ts` |
| 公开 API v1 | **可切换**：`?by=published` → `coalesce(published_at, discovered_at)`；`mode=selected` → `sort_at`；否则 `timeline_at` | `publication/v1.ts` |

**⚠️ 两个已知陷阱：**

1. **`published_at` 缺失时会回退成收录时间，并照样标成"发布时间"**——`publication/detail.ts` 与 `v1.ts` 都是 `coalesce(p.published_at, p.discovered_at)`。也就是说：**看到"发布时间"是某天，不代表原文那天真的发了**，可能原文压根没给日期，显示的是我们抓到的时刻。
2. **`publications.sort_at` 不能直接改**：精选条目的 `sort_at` 是**读取组的锚点**（`min`/`max` of 组内成员的 `timeline_at`）。要让某个已精选条目换时间位置，得入队 `publication.republish-source` 让它重算，直接 UPDATE 会被下一次发布覆盖。

**所以"今天怎么没有新内容 / 列表怎么停在昨天"的正确诊断顺序是**：先看 `eligible`（判定口径，见 3.2），再看 `timeline_at`（排序口径）——**不要用采集时间（`discovered_at`）去解释列表顺序**，它对列表完全不起作用。

### 3.2 列表与判定

- 首页 `/` = **精选**；`/all` = **全部公益动态**。两者都强制 `listedCondition(now) AND p.eligible`。
  - `listedCondition(now)` = `visibility='public' AND (NOT selected OR visible_after <= now)`
  - **`eligible` = `isPoolEligible()`**（`packages/backend/src/publication/rules.ts`）：`participation_mode='editorial'` + **`relevance='pass'`** + 有标题 + 有摘要，缺一即 false。
  - 因此**被 prefilter 判为 `BLOCK` / `UNKNOWN` 的内容不会出现在列表里**；列表上"最新的一天"由**第一个 eligible 条目**决定，**与采集时间无关**。
- prefilter 在 `packages/backend/src/editorial/analyze.ts`：**只有 `BLOCK` 才停止**（`UNKNOWN` 放行）。判为"与公益无关"的文章 `processing_state='blocked'` —— 这是**正常业务结果**，不是故障。
- 晋升门槛在 `industry/selection.ts`：**T1 = 35 / T1_5 = 35 / T2 = 40**。改门槛后需重算 `analyses.selected` 并入队 `publication.republish-source` 才会生效（`judgedSelected` 是分析时存下的布尔，republish **只读不重算**）。
- 信源清单在 `industry/sources.json`（顶层 `{"$comment", "sources":[…]}`），当前 **20 条（19 启用 + 1 停用）**。**运行时以数据库 `sources.config` 为准**，`sources.json` 只被 seed 读取（只增不覆盖）。CI 断言 `select count(*) from sources` = 20，加源必须同步。
- 采集是**定时轮询制**（不是推送）：`sources.interval_minutes` 就是"新内容最多多久被发现"。当前启用源统一 30 分钟。

## 4. 数据模型要点（写 SQL 前先看这段）

- `publications` **没有 `created_at`**。可见性五字段：`eligible` / `visibility` / `visible_after` / `selected` / `backfill`。
- `articles`：`identity_key = url:<url>`。
- `analyses`：摘要列叫 **`summary_zh`**（还有 `title_zh` / `reason_zh`，**不叫 `summary`**）。一篇文章可以有多条 analyses → JOIN 会让 publication 行重复。
- `receipt_attempts`：**每次线上模型调用记一条**，`usage` (jsonb) 里有 `prompt_tokens` / `completion_tokens`，另有 `model` / `cost` / `cost_basis` / `currency` / `latency_ms` / `started_at`。`origin='live'` 才是在线调用。
- `service_prices`：**单价表，人工维护**（`service` + `model` 为主键，`model=''` 是该服务的兜底价）。后台的费用列与「用量与成本」页全靠它——**表空着时金额一律显示"未定价"**。价格按 `service` 匹配，而 `service` 由 `packages/backend/src/providers/llm.ts` 的 `MODELS` 注册表反查得到：**模型名与注册表对不上就永远没有价格**（页面「实际在用」区会直接标出这种情况）。**改单价不用写 SQL**：在 `/admin/usage` 的「计价方式」卡里新增/编辑/删除（后端 `packages/backend/src/admin/models.ts` 的 `savePrice` / `deletePrice`，接口 `POST|DELETE /api/admin/usage/prices`，改动写审计）。
- 手动入队 pgboss 写 `pgboss.job` 表（没有 `createjob` 之类的家表）。
- ⚠️ **psql 会话显示的是 UTC**（服务器本地时区是北京）：读数 `+8 小时` 才是北京时间。曾经因此虚惊一场"worker 停抓 8 小时"。

## 5. 后台页面

`/yihot/admin` 下：内容诊断、信源（含「发现候选」「新建信源」）、反馈、运行、**用量与成本**、模型与评测、SelectBench、设置、审计记录。

- **用量与成本**（`/admin/usage`）：按日与按用途统计 token 与估算费用，并可**在线编辑单价**（`service_prices`）——新增/编辑/删除都走 ReasonDialog 并写审计，保存后金额立刻重算。后端 `packages/backend/src/admin/usage.ts`（统计）与 `admin/models.ts`（单价读写），接口 `GET /api/admin/usage?days=`、`POST /api/admin/usage/prices`、`DELETE /api/admin/usage/prices`。
  - ⚠️ 页面上的日期是**模型调用的发生日（北京）**，不是内容发布时间——一篇旧文今天才被分析，token 就记在今天。
  - ⚠️ 月化故意给**区间**（下界＝近 7 天日历日均×30，被节假日空窗压低；上界＝同期活跃日均×30，被首次全量回填尖峰抬高），不要改成单一均值。
- **模型与评测**（`/admin/models`）：每项能力当前用哪个模型、成功率、耗时、token 与费用，可切换模型（只影响之后的新任务）。
- `/yihot/admin*` 未登录一律返回 **302**（重定向到登录页）——**302 不代表路由存在**，验证新页面必须登录后看是否 200。

## 6. 常用命令

```sh
# 类型检查（不要用 npm run typecheck -w @aihot/web，它的 typegen 会删 .react-router 产物）
"…/node.exe" node_modules/typescript/bin/tsc -p apps/web --noEmit
"…/node.exe" node_modules/typescript/bin/tsc -p packages/backend --noEmit
"…/node.exe" node_modules/typescript/bin/tsc -p apps/api --noEmit

# 需要重新生成路由类型时（新增路由后）
cd apps/web && node ../../node_modules/@react-router/dev/bin.cjs typegen
```

- 远程执行在开发机上用 `D:\Software\DSH\deploy\sshexec.js` 包一层（**不在本仓库**）；没有它就直接 `ssh <用户>@49.233.72.222 '<命令>'`。注意该包装脚本的约束：命令里**不能含单引号**（要写 SQL/脚本就传 `.sql` 上去再 `psql -f -`）、不能含 `||`。
- 测站点时 UA 用 `YiHotBot`。
- 服务健康三板斧：① `settings` 表里 `heartbeat.worker` / `heartbeat.api:3001` 是否新鲜；② `pgboss.job_common` 按 name/state 计数（全 completed = 健康）；③ 到期未抓的源数（`enabled AND next_fetch_at <= now()`）应为 0。

## 7. 凭据在哪（**都不在本仓库**）

| 需要什么 | 在哪 |
| --- | --- |
| 服务器 SSH 密码 | 开发机 `.workbuddy/memory/OPS.md`（明文记录，**该目录在 `.gitignore` 里**）或密码管理器。⚠️ `deploy/sshexec.js` **本身不存密码**，它只从 `SSH_PASS` 环境变量读 |
| GitHub 推送 token | 开发机上其它仓库的 `.git/config`（remote URL 内嵌） |
| 后台管理员密码 | 服务器 `/opt/yihot/.env` 的 `ADMIN_PASSWORD` |
| 模型 API Key | 服务器 `/opt/yihot/.env`（`LLM_API_KEY` 等） |

换机器接手时，把这些**单独**交接，不要写进仓库。`deploy/cloud.env` 是一份**过期的 `.env` 副本，禁止用来覆盖服务器 `.env`**。

## 8. 新设备上手（clone 之后做什么）

代码、配置与文档都在仓库里，`git clone` 之后就能接手本项目；但**下面 5 类东西刻意不入库**，必须提前单独带到新设备：

| 类别 | 内容 | 在哪 |
| --- | --- | --- |
| 环境变量 `.env` | `SITE_URL` / `ADMIN_PASSWORD` / `LLM_API_KEY` / 飞书凭据 / `FUTUREME_UPSTREAM_URL` | 服务器 `/opt/yihot/.env`（新机可先 `node scripts/init-env.ts` 生成骨架再逐项补） |
| GitHub 写入凭据 | `gho_…` token | 开发机任一仓库的 `.git/config`（remote URL 内嵌） |
| 服务器 SSH 密码 | — | 开发机 `.workbuddy/memory/OPS.md`（明文，未进仓库） |
| 开发机脚本 | `sshexec.js` / `sftp-upload*.js` / `_sync_yihot.py` / `_pull_yihot.py` / `_delete_yihot.py` / `_verify_yihot_threeway.py` / `deploy/_ci_status.py` | `D:\Software\DSH\`（**刻意不入库**） |
| 项目记忆 | 踩坑、口径、SOP（本文件是脱敏版） | 开发机 `.workbuddy/memory/`（`.gitignore`） |

上手顺序：

1. `git clone https://github.com/CochraneK/Yi-hot`（private 仓，需要上面那枚 token），`npm ci`（Node 24）。
2. 备好 `.env`（见上表）。
3. 本机自检 —— **不需要数据库也能跑的部分**：
   - `tsc -p apps/web --noEmit`、`-p packages/backend --noEmit`、`-p apps/api --noEmit`
   - `node --test tests/source-registry-audit.test.mjs`（离线，应 **6/6** 通过）
   - ⚠️ 其余 `tests/*.test.ts` 需要 `DATABASE_URL` 指向 `*_test` / `*_ci` 库（`tests/setup.ts` 硬要求）——本机没有 Postgres 时跑不了，**这是环境限制，不是回归**。
4. 改完要上线 → 按第 2 节的 `scp` + `ssh` + `docker compose build/up -d` 流程（或用开发机脚本，若已带过来）。
5. 同步回 GitHub → **不要用 `git push`**（见下）。

> ⚠️ **新设备上两个反直觉点**
> 1. **`git push` / `git fetch` 在本机网络环境下会失败**（出口代理只放行 `api.github.com`，`github.com` 的 git smart-HTTP 被拦，报 502）。推送必须走 REST / Git Data API（`_sync_yihot.py` 那一套）。
> 2. **本地 git 仓库与远端历史「不同源」**：开发机上这份仓库甚至**没有配 remote**。所以**判断"哪边更新"只能用 git blob sha 逐文件比对**（`sha1("blob <len>\0" + 内容)`），`git log` 对不上是正常的，别拿它当依据。
>
> 另：`git clone` 出来的是**正常带 origin 的仓库**，比开发机现状更"标准"——但推送路径仍然只有 API 那条。
