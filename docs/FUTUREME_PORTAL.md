# 项目入口：YiHot 与 FutureMe 分离部署

更新：2026-10-09。**GitHub 源码已改；不代表腾讯云线上已经重建/更新。**

## 用户希望的唯一入口

| 地址 | 对应项目 |
| --- | --- |
| `http://49.233.72.222/` | 项目入口页：YiHot、FutureMe |
| `http://49.233.72.222/yihot/` | YiHot 自己的网页与 API（已有） |
| `http://49.233.72.222/futureme/` | 从入口跳转到独立 FutureMe **HTTPS 域名**；域名未配置则返回友好的 503「正在接入」 |

YiHot 源码 `apps/web/portal.html` 增加 FutureMe 卡片；`apps/web/server.ts` 已提供 `/futureme/` 跳转入口（不嵌入 YiHot）；`docker-compose.yml` 的 `web.environment` 接受 `FUTUREME_PUBLIC_URL`。

这个地址只接受完整 `https://` URL；若未配置、配置有误或服务未验收，则继续显示接入中。**不得填写明文 HTTP 或尚未取得证书的假地址。**

## 服务器当前已知状态

用户现场检查：
- `aihot-web-1` 绑定宿主机 80，访问本机首页返回 HTTP 200；
- `aihot-api-1`、`aihot-worker-1`、`aihot-db-1` 正常；
- 新增的 `futureyou-app` 一直 `Restarting (1)`，本机 `127.0.0.1:8766` 返回 000；
- 需要先 `sudo docker logs --tail=80 futureyou-app` 修好启动，再考虑 FutureMe 外部地址；
- 服务器只有约 2 GiB 内存，请勿全站无谓重建或重启 Docker 守护进程。

## 实施顺序（关键：不影响线上 YiHot）

1. **诊断 FutureMe**：查日志和 `.env` 的管理员密码是否 >=16 位，只部署 FutureMe 自己的服务。
2. **本机验证**：`curl -i http://127.0.0.1:8766/` -> 200；`curl -i http://127.0.0.1:8766/admin/` -> 401；原 YiHot HTTP 200。
3. **安全访问**：为 FutureMe 配置真实独立 HTTPS 域名与证书，已验收后获取 `https://...` URL。语音和相机的公网浏览器环境需要 HTTPS。
4. **部署 YiHot 入口改动**：只在确定 `/opt/yihot` 运行的是本仓库（先只读核查）、代码一致且有回滚手段之后，更新 `apps/web/portal.html` / `apps/web/server.ts` 和 `docker-compose.yml`。由于现有 YiHot 使用构建好的 Docker 镜像，GitHub 提交本身不会改变线上容器。避免 `docker compose down` 或清理数据卷。
5. 设置 YiHot 环境变量 `FUTUREME_PUBLIC_URL=https://实际域名/`，仅更新 `web` 服务（先预构建，并做好短暂切换及回滚方案）。
6. 验收三个入口：根目录两张可点击卡片，`/yihot/` 不受影响，`/futureme/` 成功重定向到已验证的 HTTPS 应用，管理接口不公开。

## 安全界限

- 不复制 FutureMe 到 YiHot 静态目录；不共用账号、API Key、Cookie 或研究数据库。
- FutureMe 用户端可免密码；管理员单独密码。
- FutureMe 默认 `PUBLIC_AI_ENABLED=0`、`SAVE_SESSION_DATA=0`；对外开放百炼付费 AI 前需有供应商侧硬预算。
- 不能将 GitHub 修改、Docker build、HTTP 返回 200、或者域名配置，单独说成「已经上线」。
