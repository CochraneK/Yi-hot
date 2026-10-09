# Copilot / 其他 AI 工具 · 接手入口（Yi-Hot）

本仓库是 **AIHOT 框架的「公益」定制版（站点名 Yi-Hot）**，不是默认的 AI 示例站。
接手前请按顺序读：

1. **`docs/PROJECT_CONTEXT.md`** —— 交接总览：站点拓扑、部署流程、内容口径、
   **新设备上手（§8）**、**接手清单与三条硬纪律（§9）**。
2. **`docs/memory/`** —— 项目经验（踩坑 / 口径 / SOP）的脱敏镜像。
   先看索引 `MEMORY.md`，再按需跳 `OPS.md`（运维）、`CONTENT.md`（内容口径）、
   `USAGE.md`（用量费用）、`FutureMe.md`（姊妹站）。
3. **`tools/README.md`** —— 同步 / 部署 / 核查脚本。
4. **`secrets/README.md`** —— 凭据加密归档（口令解锁）。
5. **`AGENTS.md`** —— 通用工程与评审规范。

## 动手前必须知道的四条

- **推送不要用 `git push`**：本机网络环境下 `github.com` 的 git smart-HTTP 被代理拦截（502），
  只能用 `api.github.com`（REST / Git Data API）。用 `python tools/sync.py`（增改）
  与 `python tools/delete.py`（删除）。
- **三方一致是硬纪律**：本地 = GitHub `main` = 腾讯云 `/opt/yihot`。判定一致性
  **只用 git blob sha**（`sha1("blob <len>\0" + 内容)`），**不要用 `git log`** —— 本地历史与远端不同源。
- **发布时间 ≠ 收录时间**：`published_at` 是原文发布日期，`discovered_at` 是本站首抓时间；
  首页精选按 `sort_at`、`/all` 按 `timeline_at` 排序，**`discovered_at` 不参与排序**。
  详见 `docs/PROJECT_CONTEXT.md` §3 与 `docs/memory/CONTENT.md`。
- **密钥一律不入库**（明文）：只有 `secrets/credentials.env.enc`（加密）能进仓库。
  改凭据后要回写归档并重新加密，否则换机还原的是过期值。
