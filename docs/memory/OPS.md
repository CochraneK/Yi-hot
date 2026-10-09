<!-- 本文件由 tools/sync_memory.py 从 .workbuddy/memory/OPS.md 单向生成，请勿直接编辑。 -->
<!-- 源目录 .workbuddy/ 在 .gitignore 里，所以这里是为「换机器 / 换 AI 接手」准备的脱敏镜像。 -->
<!-- 要改：改 .workbuddy/memory/OPS.md → 重跑 `python tools/sync_memory.py`。 -->

# Yi-Hot 运维（部署 / 同步 / 本机资产）

## 站点 / 部署
- `/`＝门户（静态 `apps/web/portal.html`，server.ts `servePortal`）；**YI-HOT** `http://49.233.72.222/yihot/`＝主站，源码树 `/opt/yihot`（＝本地 `D:\Software\DSH\gonyi-hot`）；**FUTUREME** `/futureme/`＝反代。
- 容器 `aihot-{db,api,worker,web}-1`，**单镜像 `aihot-app`**（web/api/worker/setup 共用），web 占宿主 80；管理 `/yihot/admin`（`.env ADMIN_PASSWORD`）；`.env SITE_URL=http://49.233.72.222/yihot`。Dockerfile `COPY . .` → `industry/`、`data/` 烘进镜像，改必 rebuild。
- vite `base:"/yihot/"` + RR `basename:"/yihot/"`（**尾斜杠必须**）+ server.ts 剥前缀/旧 URL 301；**静态资源引用必带 `/yihot/` 前缀**。
- **部署**：sftp 传文件 → `sudo -n docker compose -f docker-compose.yml -f compose.futureme-proxy.yml build`（package-lock 未变＝热缓存 ~50s）→ `up -d`（只改 web 可 `--no-build web`）。**禁 `docker cp`+restart**（env_file 固化；up -d 丢文件）。改 `.env` 必须 `up -d`。**新目录先 `mkdir -p`**（sftp 不自建）。
- seed：`sudo -n docker exec aihot-api-1 node scripts/seed.ts`（只增不覆盖）。`industry/sources.json` 顶层 `{"$comment","sources":[…]}`＝**20 条**；**DB `sources.config` 才是采集配置运行时真值**。

## 同步 / 多机
- GitHub **`CochraneK/Yi-hot`**（private）；**10-09 由另一台机器改名**（原 `CochraneK/yihot`）→ 旧名 GET 会被服务端跟随，但 **POST/PATCH 返回 307 且 urllib 不跟随** → 所有脚本里的仓库名必须写规范名 `Yi-hot`（`D:\Software\DSH\*.py` 已统一改过）。改名后**务必复查 private**（改名可能重置可见性）。工具在 `D:\Software\DSH\`，走 api.github.com，token 在 `Novel2game/.git/config`。
  - `_sync_yihot.py` 增改（CHANGED+MSG；**无删除能力**）｜`_delete_yihot.py` 删（DELETED；bottom-up 重建+剪空目录；闸门＝**删除前后全量 path→blob-sha 对照**：removed==预期、added==空、存活 sha 不变）｜`_pull_yihot.py` 拉。
  - commit 日期用**本地墙钟+真实时区偏移**，禁 `time.gmtime()+08:00`（快 8h）。
- **同步判定一律用 blob sha**（`sha1("blob <len>\0"+内容)`）；跨系统比对只能用 blob sha。别用 git log（本地 HEAD ≠ 远端 main）。
- **三方核查**：`_verify_yihot_threeway.py`（GitHub+本地→`_gh_map.json`/`_local_map.json`）+ 服务器跑 `_server_diff_full.py`（比 `_local_map.json`，并写 `/tmp/_upload_manifest.txt`＝`本地绝对路径|远程绝对路径`）。
- **补齐服务器**：`_server_diff_full.py` → 取回 manifest → `cd deploy && node sftp-upload-many.js <manifest>` → `build`+`up -d`。**必须一次全量**（漏传 new 路由 import 的模块→web build 失败）。`deploy/verify-candidates.sh` 登录后测后台页：`/yihot/admin*` 未登录一律 **302**，**302≠路由存在，须登录看 200**。
- 另一台电脑也推同一仓库，**其内容不会自动部署** → 服务器周期性落后于 main。拉远端前先确认本地无独有改动。

## CI / 离线审计门禁（`check.yml`）
- 两个任务：`docker`（compose 起站 + smoke + 断言 `sources` 表 **20** 行）；`check`（**第 5 步 `Source registry audit` 最容易挂**——它是离线步骤、跑在最前，一旦失败后面 npm ci / typecheck / build web / web tests / migrate+seed / smoke / backend tests **全部跳过**）。
- `npm run sources:audit:check` = `node --check scripts/source-registry-audit.mjs` ＋ `node --test tests/source-registry-audit.test.mjs` ＋ `node scripts/source-registry-audit.mjs --check`。
- 审计把 `industry/sources.json` 当 **seed**，与 `data/source-registry/imports/{newsmail,charity}-2026-10-08.json` 对账，产出 `data/source-registry/generated/{candidates.json,review.csv}` ＋ `docs/SOURCE_REGISTRY_AUDIT_2026-10-08.md`；`--check` 要求这三份产物与仓库提交版**逐字节相同**。
- ⚠️ **信源增删后必做两件事**：① `node scripts/source-registry-audit.mjs --write` 重生成三份产物；② 同步改 `tests/source-registry-audit.test.mjs` 里硬编码的基线（`seed_rows` 等）。**10-09 真事故**：源 16→20（`rss-un-news` + 3 个生态环境部源）后没重生成 → CI 一直红，但本地没人跑这条命令所以没暴露。
- ⚠️ 审计里排序用 `localeCompare`，**必须带显式 locale**（现已固定 `"en"`）。不指定则跟随宿主机默认 locale：Windows zh-CN 是拼音序、Linux CI 是 ICU 根序，产物不同 → `--check` 在两个平台互相判失败、且快照无法跨机复现。
- 取证：本机**没有 `gh`** → 用 `deploy/_ci_status.py`（走 api.github.com，token 同源）；`--steps` 打印每个 job 每步的 success/failure，`--annots` 查注解，`--log` 拉失败 job 的完整日志。
- ⚠️ **CI 是两层门禁，第 5 步过了还会撞第 13 步**：第 13 步 `Backend tests` = `npm test`（`tests/*.test.ts`，**需要 DB**；`.mjs` 测试不在这个 glob 里，由第 5 步单独跑）。**改门槛/判定口径/埋点会悄悄让 DB 测试过期** → CI 红，而本机无库跑不了（`tests/setup.ts` 要求 `DATABASE_URL` 指向 `*_test`/`*_ci`）。定位办法：`_ci_status.py --log`。
- ⚠️ **拉 Actions 日志必须剥掉 `Authorization` 头**：日志下载 302 到对象存储、带认证头会 **401**（`_ci_status.py` 的 `_Drop401Redirect` 已处理）。早期"日志拉不到"就是这个原因，不是代理封锁。

## 本机运维 / 上下文资产
- 远程：`cd tools/deploy && SSH_PASS="$(grep -m1 '^SSH_PASS=' ../../secrets/credentials.env | cut -d= -f2-)" NODE_PATH='C:/Users/SCZ_2207/.workbuddy/binaries/node/workspace/node_modules' node sshexec.js '<cmd>'`（NODE_PATH 必须有）。命令**不能含单引号**（写 `.sh` 上传后 sh 跑）、**不能含 `||`**；复杂 SQL 写 `.sql` 上传后 `psql -f -`。
- 上传 `node sftp-upload.js <本地> <远程>`｜批量 `sftp-upload-many.js <manifest>`。**⚠️ `deploy/cloud.env` 是过期 .env 副本，禁止覆盖服务器 .env**。docker 一律 `sudo -n`。测站点 UA=`YiHotBot`。
- 本地测试：`"D:/Software/node.js/node.exe" --test --test-concurrency=1 --test-timeout=120000 tests/*.test.ts`（**npm test 会落到 managed Node 22**）。typecheck：`tsc -p apps/web` / `-p packages/backend` / `-p apps/api`（`npm run typecheck -w @aihot/web` 的 typegen 会删 .react-router 被 IDE 守卫拦）。`tests/source-registry-audit.test.mjs`：**排序 locale 已固定为显式 `"en"`**（10-09），Windows 与 Linux 结果一致、可本机复跑（此前跟随宿主机默认 locale → 本机必失败，非回归）。其基线是**硬编码快照**，信源数变动后必须重生成（见上「CI / 离线审计门禁」）。`tests/source-discovery.test.ts` 与其余 invariant 测试**需要 DB**（`tests/setup.ts` 硬要求 `DATABASE_URL` 指向 `*_test`/`*_ci`）→ 本机无库必失败，属环境而非回归。
- **上下文资产分布（换机/换 AI 的盲区）**：凭据自 **2026-10-09 起加密入库**——密文 `secrets/credentials.env.enc`（已进仓库）、加解密 `tools/secrets.sh`（一把口令），明文只在本地 `secrets/credentials.env` 与服务器 `/opt/yihot/.env`（**均未入库**）；`deploy/sshexec.js` 不含密码、只读 `SSH_PASS` 环境变量。技能在 `~/.workbuddy/skills/`（本机）；GitHub token 亦可从 `Novel2game/.git/config` 取。**仓库内** `docs/PROJECT_CONTEXT.md`＝脱敏交接总览（clone 即可接手），`docs/memory/`＝本目录 5 个常青分册的脱敏镜像，`tools/`＝同步/部署脚本。

## 验收清单
`/` `/yihot/` `/yihot/about` `/yihot/all` `/yihot/daily` `/feed.xml` `/futureme/` `/futureme/api/status` 全 **200**；`/futureme/admin/` **401**；管理页未登录 **302**。
