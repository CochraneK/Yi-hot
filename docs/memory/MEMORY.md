<!-- 本文件由 tools/sync_memory.py 从 .workbuddy/memory/MEMORY.md 单向生成，请勿直接编辑。 -->
<!-- 源目录 .workbuddy/ 在 .gitignore 里，所以这里是为「换机器 / 换 AI 接手」准备的脱敏镜像。 -->
<!-- 要改：改 .workbuddy/memory/MEMORY.md → 重跑 `python tools/sync_memory.py`。 -->

# Yi-Hot 备忘（跨会话必读 · 索引）

> 细节分册：**`OPS.md`**（部署/同步/本机资产/验收）｜**`CONTENT.md`**（内容口径/时区健康）｜**`USAGE.md`**（用量与费用）｜**`FutureMe.md`**（姊妹站）。改动关键事实时同步更新 `docs/PROJECT_CONTEXT.md`（仓库内脱敏交接文档）。

## 站点 / 部署铁律
- `/` 门户（`apps/web/portal.html`）｜`/yihot/` 主站（源码树 `/opt/yihot`＝本地 `D:\Software\DSH\gonyi-hot`）｜`/futureme/` 反代。
- 容器 `aihot-{db,api,worker,web}-1`，单镜像 `aihot-app`，web 占宿主 80；管理 `/yihot/admin`（`.env ADMIN_PASSWORD`）。
- **部署**：传文件 → `sudo -n docker compose -f docker-compose.yml -f compose.futureme-proxy.yml build`（锁未变＝热缓存 ~50s）→ `up -d`。**禁 `docker cp`+restart**（env_file 固化；up -d 丢文件）。改 `.env` 必 `up -d`。`COPY . .` → 改镜像内置文件（`industry/`、`data/`）必 rebuild。新目录先 `mkdir -p`。docker 一律 `sudo -n`。
- vite `base:"/yihot/"` + RR `basename:"/yihot/"`（**尾斜杠必须**）；静态资源引用必带 `/yihot/` 前缀。
- seed：`sudo -n docker exec aihot-api-1 node scripts/seed.ts`（只增不覆盖）。**DB `sources.config` 是采集配置运行时真值**，`sources.json` 仅 seed 源。

## 同步 / 多机
- GitHub **`CochraneK/Yi-hot`**（private；**10-09 改名**，写操作必须用规范名，旧名 POST 会 307）；三方＝本地 / GitHub / 服务器，**判定一律用 blob sha**（`sha1("blob <len>\0"+内容)`），**别用 git log**（本地 HEAD ≠ 远端 main）。
- ⚠️ **信源增删后必重生成离线审计快照**（`scripts/source-registry-audit.mjs --write` ＋ 改 `tests/source-registry-audit.test.mjs` 基线），否则 CI 第 5 步 `Source registry audit` 直接挂、后面全跳过（10-09 真事故：源 16→20 未重生成）。详见 `OPS.md`。
- 工具在 `D:\Software\DSH\`：`_sync_yihot.py`（增改，**无删**）｜`_delete_yihot.py`（删）｜`_pull_yihot.py`｜`_verify_yihot_threeway.py`。commit 日期＝本地墙钟+真实时区偏移（禁 `gmtime()+08:00`，会快 8h）。
  - ⚠️ **10-09 起唯一真值已搬进仓库 `tools/`**（`sync.py`/`delete.py`/`pull.py`/`compare.py`/`verify_threeway.py`/`ci_status.py`/`deploy/*.js`，共享配置 `tools/yihot_common.py`，env：`YIHOT_ROOT`/`YIHOT_WORK`/`GITHUB_TOKEN`）。**改同步逻辑改 `tools/`，别再改开发机那份**（免得漂移）。
- **记忆镜像**：本目录**全量**（5 个常青分册 + 所有 `YYYY-MM-DD.md` 日志）脱敏后进仓库 `docs/memory/`（由 `tools/sync_memory.py` 单向生成）。**改了这里任何文件都要重跑** `python tools/sync_memory.py`，否则仓库镜像会过期。凭据走 `secrets/credentials.env.enc` + `tools/secrets.sh`。
- 另一台电脑也推同仓，**其内容不会自动部署**；拉远端前先确认本地无独有改动。

## 内容口径（最易出错）
- ⚠️ **发布时间 ≠ 收录时间**：`published_at`＝原文发布 vs `discovered_at`＝本站首抓。**各列表排序字段不同**：首页精选＝`sort_at`（组锚点 `max`）；`/all`＝`timeline_at DESC`；API v1 见 `v1.ts:40`。`sort_at` **不能直接 UPDATE** → 入队 `publication.republish-source`。诊断"列表停在昨天"：先 `eligible` 再 `timeline_at`；`discovered_at` 不参与排序。
- 🔴 **`backfill` 旗标必须与 `published_at` 一起维护**：`discovered_at - published_at > 48h` → `backfill=true` 且 `timeline_at = published_at`（`materials.ts:74-82`），否则 `timeline_at = discovered_at`。**只回填 `published_at` 不重算二者 = 旧内容顶掉今天**（10-09 真 bug：18 条 zcwj 4~9 月文件占 `/all` 榜首）。自检：`NOT backfill AND published_at IS NOT NULL AND discovered_at - published_at > 48h` 行数应为 **0**。
- `eligible`＝`isPoolEligible()`（`publication/rules.ts:19`）：editorial + `relevance='pass'` + 标题 + 摘要。prefilter 只 `BLOCK` 才拦（UNKNOWN 放行）。晋升门槛 `industry/selection.ts`：T1/T1_5:35，T2:40。
- 源 20（19 启用 + UN 停用，含生态环境部×3）；启用源轮询**统一 30min**（DB 已是 30，`sources.json` 仍写 60＝有意不一致）。⚠️ `publishedAtAuthoritative` **不是 web_list 顶层合法键** → 写了会 setup 起不来（白名单 `sources/config-keys.ts`）。
- 主题 **41**（company 13 + field 19 + genre 9），源 `industry/topics.json`。**company 主题只按 `entity:<id>` 匹配**（不认中文标签）；板块页**只列 `selected`**（"没有精选内容" ≠ 没文章）；topics 是 **upsert**（删文件不删库，下线须 `DELETE FROM topics`）。加板块只改 topics.json → build → seed `--topics-only`。
- **psql 显示 UTC**（+8h 才是北京）；健康三板斧见 `CONTENT.md`。

## 其他
- **命名边界（常被问）**：对外/仓库＝**Yi-hot**（GitHub `CochraneK/Yi-hot`、路径 `/yihot/`）；**内部标识符一律不改**：`package.json name="aihot"`、`@aihot/*` scope、容器 `aihot-*`、镜像 `aihot-app`、CI 库 `aihot_ci`、本地目录 `D:\Software\DSH\gonyi-hot`（改动需重建容器/网络+改几十处引用，无用户可见收益）。
- 用量与费用：`receipt_attempts`（`usage` jsonb）+ `service_prices`（单价表）→ `/yihot/admin/usage`；月化必须给**区间**（`admin/usage.ts` 的 `recent` 注释）。详见 `USAGE.md`。
- 本机测试/typecheck/远程执行/上下文资产分布 → `OPS.md`。**记忆与凭据自 10-09 起已入仓库**（记忆＝`docs/memory/` 脱敏镜像；凭据＝`secrets/credentials.env.enc` 加密归档），换机器不再是"只有代码"。
