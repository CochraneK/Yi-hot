# 免费公众号采集：WeRSS + YiHot

> **2026-10-20 现状**：`GATHER.MODEL=web`，微信读书兼容层停用。维护节奏是 **每 3 天**在管理端点「刷新授权」扫码，然后逐个公众号点「刷新」。一键入口见下文「一键扫码（Windows）」。

采用 [WeRSS / we-mp-rss](https://github.com/rachelos/we-mp-rss) 的 MIT 开源自托管方案。软件无需 API 订阅费，使用已有腾讯云的计算和存储资源。核查参考代码为 `9b40351f`；实际部署记录必须保存镜像 digest。Wechat2RSS 的[私有部署](https://github.com/ttttmr/Wechat2RSS/blob/master/deploy/index.md)收费，不是本次选项。

GitHub Pages 只能托管静态页面，不能运行扫码会话、浏览器采集任务和 SQLite，所以服务运行在腾讯云。WeRSS 是独立服务；YiHot 继续用现有 RSS 管线。

## 部署服务

把 `deploy/werss/compose.yml`、`bootstrap.sh` 放到服务器 `/opt/werss/`，运行：

```sh
cd /opt/werss
bash bootstrap.sh
```

首次生成随机管理密码与签名密钥到 `/opt/werss/.env`（权限 600），拉取官方镜像并写入 digest。重复执行保留密码和已有 SQLite 数据，不自动升级镜像。数据目录是 `/opt/werss/data`；备份需要同时保存 `.env` 与数据目录。回滚使用部署前的镜像 digest 和数据备份。

本次官方 amd64 镜像压缩后约 1.7 GiB，腾讯云直连 GHCR 较慢。可先从 GHCR 核实目标 digest，再以 `WERSS_PULL_IMAGE=ghcr.1ms.run/rachelos/we-mp-rss@sha256:已核实的digest bash bootstrap.sh` 使用[毫秒镜像的免费 GHCR 通道](https://1ms.run/guide/temp)。Docker 按官方 digest 校验内容；不执行加速网站的安装脚本，也不改全局 Docker 配置。已有 `.env` 的 `WERSS_IMAGE` 时脚本保持现有固定镜像，设置该变量不会自动升级。

管理端只监听 `127.0.0.1:18001`。服务内存上限 768 MiB、CPU 上限 0.75、共享内存 128 MiB；2 GiB 主机上线前需检查实际余量。采集并发 1，初期历史页数 1，先加少量账号观察资源。

YiHot 使用额外 Docker 网络 `yihot_werss`，API 和 worker 能读取 `http://werss:8001/feed/账号ID.rss`。生产仍需保留 FutureMe 的网络覆盖文件：

```sh
cd /opt/yihot
docker compose -f docker-compose.yml -f compose.futureme-proxy.yml -f compose.werss.yml config --quiet
docker compose -f docker-compose.yml -f compose.futureme-proxy.yml -f compose.werss.yml up -d --build
```

`WERSS_BASE_URL` 仅允许访问所配置 origin 的单账号 `/feed/ID.rss`、`.xml`、`.atom` 路径；不开放后台 API，不跟随重定向，不开启全局私网采集。RSS 请求强制 `is_update=false`，WeRSS 自己的任务负责获取新文章。

## 扫码与接入

从本机建立隧道（账号、主机以凭据归档为准）：

```sh
ssh -N -L 18001:127.0.0.1:18001 ubuntu@49.233.72.222
```

1. 打开 `http://127.0.0.1:18001`，用 `/opt/werss/.env` 中的管理账号登录。
2. 用具有微信公众平台登录权限的微信扫码（公众号管理员或运营者）；搜索要订阅的公众号，核实认证主体并添加。只有个人微信、尚未开通公众号时，需先完成公众平台账号准备。
3. 复制单个账号的 RSS 链接。不要复制后台 API 或文章管理页地址。
4. YiHot 后台 → 候选信源 → 添加公众号 RSS，直接粘贴链接（自动转换内部主机），填名称、独立 ID，预览真实标题、日期、原文链接。使用普通 JSON 配置页时手动将 origin 替换为 `http://werss:8001`。
5. 创建默认暂停来源，检查首抓结果后启用。参与方式从隔离调整为编辑候选前，确认内容范围；全文开关保持关闭。

服务启动不等于公众号采集成功。完成标准是：扫码成功、已添加真实账号、WeRSS feed 有条目、YiHot 预览和入库成功。微信会话失效时需重新扫码；不能保证免维护运行。**扫码周期、失效判定与停更检查见下一节「会话有效期与扫码节奏」。**

公众平台文章列表可能返回 `200013: freq control`，同时搜索仍正常；本实例 2026-10-13 已复现。上游 [issue #469](https://github.com/rachelos/we-mp-rss/issues/469) 记录了同类问题。不要持续点击刷新；官方镜像的刷新 API 会异步执行，立即返回 `total=0` 并不代表任务已结束。以 SQLite 入库数和 RSS 实际条目验收。

可在 WeRSS 的微信读书管理页另行扫码，再测试公众号采集连接；Cookie 保存在本机服务数据中，不粘贴到聊天或提交仓库。本实例已实测文章列表可用，公益时报 43 篇入 WeRSS、30 篇入 YiHot，日期与原文短链核对通过。微信原文网页可能仍返回环境验证页面，未开启全文采集或公开全文。

### 本实例的微信读书兼容层

> **2026-10-20 起已停用。** `GATHER.MODEL` 已切回 `web`，`yihot-weread.timer` 已 `disable --now`；本层实测 86 次运行失败 84 次、`added` 恒为 0，从未产出过文章。下面内容保留作历史记录与回滚参考，日常维护**不需要**执行。

固定镜像的采集器只读 cover，误把当前时间作为发布日期。复制 `deploy/werss/` 下的兼容补丁、覆盖配置、采集脚本及两个 systemd 文件到 `/opt/werss`，用 root 执行 `bash install-weread-compat.sh`。脚本核验固定版本原模块 SHA 后生成只读覆盖文件，保留原模块备份；版本不匹配直接失败，升级时必须重新审查，不能强行绕过 SHA 检查。

本次补丁走已登录微信读书的文章列表，固定移动端表示以取得真实原文短链，拒绝桌面响应的 WR1 不透明 ID；保留真实日期并按文章 ID 去重，缺少必需元数据时不推进游标。正文补抓关闭。`yihot-weread.timer` 每两小时运行，只更新已订阅账号，不发送消息、不使用付费模型。验证：`python deploy/werss/test_weread_compat.py`。

后续管理 WeRSS 始终使用 `docker compose -f compose.yml -f compose.weread.yml`；bootstrap 会在覆盖文件已安装时保留它。定时器状态用 `systemctl status yihot-weread.timer`，任务结果用 `journalctl -u yihot-weread.service`。回滚先停用定时器，再用仅 `compose.yml` 重建 WeRSS；保留 `.env` 和 data。微信读书 Cookie 失效时重新扫码，采集错误会让任务失败，不能把空 feed 报作成功。

## 会话有效期与扫码节奏（实测 2026-10-20）

这一节回答「多久要重新扫一次」和「怎么判断它其实已经停了」。**服务存活、feed 返回 200 都不代表在采集。**

### 三个时间常数

| 凭据 | 实测寿命 | 证据 | 失效后果 |
| --- | --- | --- | --- |
| 公众平台会话 `wx.lic` | 登录后**固定 4 天**，重新扫码不延长 | `token_data.expiry.expiry_time = 2026-10-16 22:07:37`，`remaining_seconds=345595`，从 10-12 22:07 首次登录起算；10-13 08:45 重扫后时间未变 | web 模式取文章列表失败 |
| 微信读书 cookie | **约 2 小时**（单样本，波动未知） | 10-13 08:52 可用 → 10-13 10:53 报 `-2012 登录超时`；`yihot-weread.timer` 86 次运行 84 次失败，`added` 恒为 0 | `weread_mp` 通道实际从未产出文章 |
| QQ 邮箱 IMAP 授权码 | 未观察到自然过期 | 3 天连续 0 失败，游标正常前移 | 邮件源停更 |

### 三个容易误判的机制

1. **WeRSS 不会自己定时刷新。** `jobs/mps.py:start_job()` 依赖 `message_tasks.cron_exp` 注册 APScheduler 任务；本实例 `message_tasks`、`message_tasks_logs`、`config_management` 三表均为 **0 行**，启动日志第 164 行打印「没有任务」后直接返回。所以 10-13 那 43 / 80 篇是**首次扫描的存量**，之后 `feeds.sync_time` 一直冻结在 `2026-10-13 08:52:56` / `09:24:53`。
2. **`MP_WXS_` 前缀在定时任务里会强制走微信读书通道。** `jobs/mps.py:70-82` 判断 `mp.id.startswith("MP_WXS_")` 时，只要存在 weread cookie 就切换采集器；**没有 cookie 则直接 `raise RuntimeError("微信读书 Cookie 未配置")` 跳过该号，不会回落到 web**。所以只扫公众平台二维码，对「定时任务」这条路无效。
   但**手动「刷新」走的是另一条路**：`GET /api/v1/wx/mps/update/{id}` 用 `WxGather().Model()`，即由 `GATHER.MODEL` 决定，不受 feed 前缀影响。2026-10-20 已把 `GATHER.MODEL` 切回 `web`（`deploy/werss/compose.weread.yml`），实测 `collector = MpsWeb`，因此「扫码 + 手动刷新」这条路是通的。
3. **没有自动续期。** `core/weread_cookie_refresh.py` 的 `request_host_refresh()` 依赖宿主机 `host_weread_refresh_agent.py`（`http://host.docker.internal:9876/refresh`），这套代理是给 macOS 本机 Chrome 写的；腾讯云上不存在 → `triggered=False` 静默跳过，日志里没有报错。该定时器已于 2026-10-20 停用。

### 建议节奏：每 3 天扫一次

4 天是硬过期，**每 3 天扫一次留 1 天余量**，避免刚好在周末/出差时断掉。扫码后还要对每个号点一次「刷新」才会真正拉取新文章——订阅号列表不会自己动。

### 一键扫码（Windows，推荐日常用这个）

仓库里有三个小工具，双击即用，不用记 SSH 命令：

| 文件 | 作用 |
| --- | --- |
| `tools/werss/werss-scan.cmd` | 建隧道 + 打开管理端 + 打印步骤 |
| `tools/werss/werss-status.cmd` | 只读检查：凭据到期、每个号最后同步时间、最新文章日期 |
| `tools/werss/werss_status.py` | 状态脚本本体（在容器内跑，由上面调用） |

前置条件只需配一次：

1. 本机装 Windows 自带 OpenSSH 客户端（`ssh -V` 有输出）。
2. 本机公钥写入服务器 `~/.ssh/authorized_keys`。
3. `~/.ssh/config` 里有 `Host yihot`（HostName / User / IdentityFile）。
4. 服务器上放一份状态脚本：`sudo cp werss_status.py /opt/werss/`。

配好后 `ssh yihot "echo ok"` 应直接返回 `ok`，不再问密码。

**扫码四步**（前 3 步在 `werss-scan.cmd` 打开的页面里完成，第 4 步收尾）：

1. 若要求登录：账号密码在服务器 `/opt/werss/.env` 的 `ADMIN_` 开头项里。
2. 点顶部**「刷新授权」**（扫描图标），用公众号管理员微信扫码。刷的是公众平台会话，有效期 4 天。**不要点「微信读书授权」**，那条路 2 小时就失效。
3. 左侧选中一个公众号 → 点顶部**「刷新」**→ 弹窗保持默认（第 0 页到第 1 页）→ 确定，看到「刷新成功，新增 N 篇」。每个号都做一次。
4. 关掉最小化的隧道窗口，双击 `werss-status.cmd` 复核。

每次扫码后必须验收四件事，缺一不可：

1. WeRSS 的 `feeds.sync_time` 前移到当前时间；
2. feed 中最新条目的发布日期在 **3 天内**；
3. YiHot 后台该来源 `health=ok` 且本轮 `added > 0`；
4. `werss-status.cmd` 输出里三个号都显示「4 天内」，没有「已过期」。

### 停更判定（不要看 HTTP 200）

feed 可以返回 200 和 30 条旧内容，YiHot 侧也会显示 `ok`、`fail_count=0`。真正的信号是「最后成功同步时间」和「最新条目日期」：

```sh
cd /opt/werss
# 1) WeRSS 自己最后成功同步时间（sync_time 是文本时间，不要转 unixepoch）
sudo docker compose -f compose.yml -f compose.weread.yml exec -T werss \
  sqlite3 /app/data/we_mp_rss.db "select id, name, sync_time from feeds;"
# 2) feed 最新条目日期
curl -fsS "http://127.0.0.1:18001/feed/实际账号ID.rss?is_update=false" | grep -o "<pubDate>[^<]*" | head -3
# 3) 是否走了微信读书通道、是否在报 -2012
journalctl -u yihot-weread.service -n 50 --no-pager | grep -E "2012|added"
```

镜像若未带 `sqlite3`，用 `docker cp` 把 `we_mp_rss.db` 复制到宿主机再用本机 sqlite3 只读打开，**不要直接写库**。

手动触发一次刷新（用于区分"凭据死了"和"确实没新文章"）：

```sh
# token 由 /api/v1/wx/auth/login 取得，凭据从 .env 经 stdin 传入，不要写进命令行历史
curl -fsS -X GET "http://127.0.0.1:18001/api/v1/wx/mps/update/MP_WXS_实际账号ID?start_page=0&end_page=1" \
  -H "Authorization: Bearer <token>"
```

返回 `total:0` **不代表刷新完成**——官方镜像的刷新是异步的，立即返回 0 是常态；以 60 秒后 `sync_time` 和文章数是否变化为准。若线程内抛 `WereadMPAPIError: -2012`，是凭据失效，不是"没有新文章"。

### 已知故障记录

- 2026-10-19：重建时漏掉 `compose.werss.yml`，api/worker 被摘出 `yihot_werss` 网络，两个公众号来源连续失败约 21 小时（`getaddrinfo EAI_AGAIN werss`）。
- 2026-10-13 至 10-20：`feeds.sync_time` 冻结 7 天，微信读书兼容层 84/86 次失败，期间无任何告警。**这是「接口健康 ≠ 内容新鲜」的典型案例**，对应待办：给信源加 `max(published_at)` 新鲜度告警。
- 2026-10-20：确认部署实际是 `GATHER.MODEL=weread_mp`，公众平台扫码对采集无效；已切回 `web`（`collector = MpsWeb` 实测）并停用 `yihot-weread.timer`。回滚方式：把 `deploy/werss/compose.weread.yml` 里 `GATHER.MODEL` 改回 `weread_mp`，`docker compose ... up -d`，并 `systemctl enable --now yihot-weread.timer`。

## 故障定位

```sh
cd /opt/werss
docker compose -f compose.yml ps
docker compose -f compose.yml logs --tail=80
curl -fsS http://127.0.0.1:18001/ >/dev/null
cd /opt/yihot
docker compose -f docker-compose.yml -f compose.futureme-proxy.yml -f compose.werss.yml exec -T worker node -e 'fetch("http://werss:8001/feed/实际账号ID.rss?is_update=false").then(async r=>console.log(r.status,(await r.text()).slice(0,80)))'
```

不要将 WeRSS `.env` 覆盖到 YiHot 的 `.env`，不要重新创建数据库卷，也不要遗漏 `compose.futureme-proxy.yml`。服务尚未实际部署或尚未扫码时，在部署记录中明确注明。
