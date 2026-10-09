@AGENTS.md

# 本项目（Yi-Hot）接手入口

> 本仓库是 AIHOT 框架的「公益」定制版，不是默认 AI 示例站。接手先读：

- 交接总览：`docs/PROJECT_CONTEXT.md`（**§8 新设备上手、§9 接手清单**）
- 项目经验镜像：`docs/memory/`（索引 `MEMORY.md`；另见 `OPS.md` / `CONTENT.md` / `USAGE.md`）
- 同步 / 部署 / 核查脚本：`tools/README.md`
- 凭据（加密归档）：`secrets/README.md`

**三条硬纪律**：① 推送只能走 `tools/sync.py`（本机 `git push` 会 502）；
② 三方一致（本地 = GitHub `main` = 腾讯云 `/opt/yihot`）判定只用 **git blob sha**，别用 `git log`；
③ 密钥明文一律不入库，只有 `secrets/credentials.env.enc` 可以。

