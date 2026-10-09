# FutureMe 接入项目入口（不买域名 · 共用一个 IP）

更新时间：2026-10-09。**已写入 GitHub，尚未修改腾讯云线上容器。**

## 用户指定的最终入口

| 地址 | 内容 |
| --- | --- |
| `http://49.233.72.222/` | 统一项目入口，含 YiHot、FutureMe 两张卡片 |
| `http://49.233.72.222/yihot/` | 原来的 YiHot |
| `http://49.233.72.222/futureme/` | 同一 IP 的 FutureMe；由 YiHot Web 反向代理转发到独立容器 |
| `http://127.0.0.1:8766/` | FutureMe 仅服务器本地调试，不在公网开放 |

**不购买新域名。** 先打通 HTTP 路径和离线/无敏感内容的测试，再为**同一个 IP**探索公开可信 HTTPS 证书。Let’s Encrypt 从 2026 年支持 IP 短期证书（160 小时），需要专用签发与自动续期方案，不能直接假定现有 Caddy 自动适配。

### 服务器已经确认的阻塞

2026-10-09 用户现场日志：`futureyou-app` 不断重启，`/app/futureyou_server.py` 报 `ADMIN_PASSWORD must be set to a strong value (16+ chars) in .env`；本机 `.env` 中管理员密码长 9 字符。这是**已确认的启动失败原因**。必须先在 `/home/ubuntu/futureyou/.env` 用 `openssl rand -hex 24` 生成至少 16 字符的独立管理员密码，再只重建 FutureMe 的容器。

YiHot 仍在 `/opt/yihot` 运行，80 端口对外，`curl http://127.0.0.1/` 返回 200。**不要 down、不要重启 Docker 守护进程、不要动 YiHot 的 Postgres volume。**

## 代码结构

- `apps/web/portal.html`：两个项目入口卡片。
- `apps/web/server.ts`：`/futureme/*` 在 YiHot SSR 和 `/api/*` 匹配前，被代理到 `http://futureyou-app:8766/*`；自动剥离 `/futureme` 前缀；未配置上游则显示「接入中」。`/yihot/*` 维持原逻辑。
- `docker-compose.yml`：YiHot 的 `web` 接入专用 `futureme_proxy` Docker bridge；增加 `FUTUREME_UPSTREAM_URL` 环境变量，初始可为空。
- `CochraneK/FutureYou` 仓库的 `compose.futureyou.yml`：FutureMe `app` 接入相同的 `futureme_proxy` bridge，仍只监听宿主机 `127.0.0.1:8766`。
- `FutureYou/index.html`：检测 `/futureme/` 前缀，所有未来自我的 `/api/*` 请求变为 `/futureme/api/*`，不会误访问 YiHot 的 `/api/*`。

只有 YiHot Web 与 FutureMe App 参与这个路由网桥，FutureMe 不接入 YiHot DB 所在 `aihot_default` 网络。数据库、管理员认证、API Key 以及挂载数据保持分离。

## 部署流程：先易后难

1. 修复 FutureMe 的管理员密码，`sudo docker compose -f compose.futureyou.yml up -d --no-deps --force-recreate app`；先使本地检查变为 `200`（首页）/`401`（管理员）。
2. **先验收最新源码。** 腾讯云服务器直连 GitHub TLS 超时，已上传的 FutureYou ZIP 和线上的 YiHot 源码**可能不含这些新提交**；不能只执行 `up` 就认为拿到更新。优先将本次更新的 `compose.futureyou.yml`、`index.html` 和 YiHot 的 `server.ts`、`portal.html` 从有 GitHub 访问能力的电脑下载后，通过 OrcaTerm 上传。只替换已经确认的对应文件，并留备份。
3. `docker network inspect futureme_proxy >/dev/null 2>&1 || docker network create futureme_proxy`（需要适当的 sudo）；运行更新过的 Compose 或提供覆盖文件，分别让两个容器加入网桥。**不要让 FutureMe 加入默认的 YiHot 数据库网络**。
4. 若本机 `/opt/yihot` 是当前镜像的源码，并可离线使用现有镜像，采用 **Compose 覆盖文件 + 只重建 web 容器**，无需重新下载或重新构建所有 YiHot 服务。确认容器启动命令运行 Node TS 能读取替换文件；不要仅覆盖宿主机文件却忘记镜像内文件仍旧。
5. 设置 `FUTUREME_UPSTREAM_URL=http://futureyou-app:8766`，由 YiHot `web` 容器解析同网桥服务名。**不能写成 `127.0.0.1:8766`**：那会指向 YiHot 容器自己。
6. 验证：
   - `curl -si http://127.0.0.1/ | head` → 200 项目入口；
   - `curl -si http://127.0.0.1/yihot/ | head` → YiHot 正常；
   - `curl -si http://127.0.0.1/futureme/ | head` → 200 FutureMe；
   - `curl -si http://127.0.0.1/futureme/api/status | head` → 200 FutureMe status；
   - `curl -si http://127.0.0.1/futureme/admin/ | head` → 401，依旧要求管理员密码。
   - 任一步失败均先查 `docker logs --tail=60 futureyou-app` 和 `docker logs --tail=60 aihot-web-1`。
7. 最后再评估 IP HTTPS 的 443 入口、证书自动续期以及重定向。无可信 HTTPS 时，不向公众开放包含**敏感个人经历、语音和照片**的正式研究体验。

## 离线部署注意

从这台服务器上重建完整 YiHot 镜像可能需要 npm/apt 网络，且只有 2GB RAM，**不建议**现在执行 `docker compose up --build`。更稳妥的做法是只对现有 web 容器挂载新版 `server.ts`、`portal.html`，使用先行验证的 Compose override，然后 `--no-build --no-deps --force-recreate web`，保留回滚文件。此策略需要验证 `/opt/yihot/apps/web/` 里的对应源码路径存在。

## 安全边界与诚实标注

- `PUBLIC_VISITOR_ACCESS=1` 允许普通访客直接浏览；`ADMIN_PASSWORD` 必须设置强密码。
- `PUBLIC_AI_ENABLED=0` 默认不让匿名访客调用付费百炼 API；开启前要在供应商控制台设置真正的费用硬上限。云端研究数据默认 `SAVE_SESSION_DATA=0`。
- 同 IP **同协议同端口不同路径仍是同一浏览器 origin**，因此 `localStorage`、Cookie 的安全边界弱于真正独立的 origin；Web 端的数据保密不能仅靠路径分离。后续如需严格隔离，可在**同一个 IP 不同 HTTPS 端口**部署 FutureMe，仍不购买域名。
- HTTP 不是安全上下文，麦克风/相机等功能会受到浏览器限制（本机 localhost 为例外）；不应在明文 HTTP 上收集心理或照片资料。
- GitHub 已更新不等于线上已更新；必须完成服务器操作和实际验收才能宣称上线。
