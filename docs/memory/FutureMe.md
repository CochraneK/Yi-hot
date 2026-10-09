<!-- 本文件由 tools/sync_memory.py 从 .workbuddy/memory/FutureMe.md 单向生成，请勿直接编辑。 -->
<!-- 源目录 .workbuddy/ 在 .gitignore 里，所以这里是为「换机器 / 换 AI 接手」准备的脱敏镜像。 -->
<!-- 要改：改 .workbuddy/memory/FutureMe.md → 重跑 `python tools/sync_memory.py`。 -->

# FutureMe 备忘（10-09 更名完成）

站点 `http://49.233.72.222/futureme/`｜GitHub `CochraneK/FutureMe`（private，main `b2a9865c91`，56 blobs，与服务器一致）｜本地无独立仓库（`D:\Software\DSH\_fm_stage` 只是暂存目录）。

## 拓扑
- 源码树 **`/home/ubuntu/futureme`**；容器 **`futureme-app`**（只绑 `127.0.0.1:8766`，**不开公网**）；镜像 `futureme:local`；compose `compose.futureme.yml`；卷 `futureme_data`。
- **由 YiHot web 容器反向代理**：`server.ts` 剥 `/futureme` 前缀 → `http://futureme-app:8766`；`/futureme/api/*` 同理，不会落到 YiHot 的 `/api/*`。
- `/opt/yihot/.env` 需 `FUTUREME_UPSTREAM_URL=http://futureme-app:8766`（**不能写 127.0.0.1** —— 那指向 YiHot 容器自己）。

## 启动（必须双 -f）
`futureme_proxy` 外部网络是两容器**唯一共同网络**（FutureMe 不加入 `aihot_default`）。
```sh
# YiHot web
cd /opt/yihot && sudo -n docker compose -f docker-compose.yml -f compose.futureme-proxy.yml up -d --no-build web
# FutureMe
cd /home/ubuntu/futureme && sudo -n docker compose -f compose.futureme.yml -f compose.futureme-proxy.yml up -d --no-build app
```
单 `-f` → 容器名解析失败 → `/futureme/` 退化成「接入中」。

## 改代码
- `index.html` 是 **Dockerfile `COPY` 进镜像**（非 volume 挂载）→ 改它必须 `build app`（~1.5s，仅 COPY 层）+ `up -d`，否则容器内仍是旧版。
- 备份位置：`/home/ubuntu/futureme/.backup-<ts>/`。

## 更名范围（10-09 全量完成）
- 仓库 `FutureYou` → **`FutureMe`**。⚠️ **改仓库名会自动重置为 public，每次改完必须复查改回 private**。
- 容器 `futureyou-app`→`futureme-app`；镜像 `futureyou:local`→`futureme:local`；compose `name: futureme`；卷 `futureyou_data`→`futureme_data`（源码树路径仍是 `/home/ubuntu/futureyou`→已改 `futureme`）。
- 后端 `futureyou_server.py` → **`futureme_server.py`**（Dockerfile CMD 与 COPY 同步改）。
- JS 全局 `FutureYouBYOK/Export/HandsFree/NaturalRuntime/RealtimeBridge/…` → `FutureMe*`（**跨 8 个文件同步改，只改一个会崩**：index.html + byok.js + export-bundle.js + natural-conversation.js + natural-intake-runtime.js + qwen-realtime.js + realtime-app-bridge.js + voice-duplex.js）。
- localStorage 各 key `futureyou-*` → `futureme-*`；env `FUTUREYOU_*` → `FUTUREME_*`（.env 里只有 `FUTUREME_DATA_DIR=/opt/futureme/data`）。
- **品牌只改用户可见文案**；内部标识符若已全部改净则保持现状。

## 验收
`/futureme/` **200**、`/futureme/api/status` **200**、`/futureme/admin/` **401**（鉴权仍生效）。
