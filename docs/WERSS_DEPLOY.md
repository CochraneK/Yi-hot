# 免费公众号采集：WeRSS + YiHot

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

服务启动不等于公众号采集成功。完成标准是：扫码成功、已添加真实账号、WeRSS feed 有条目、YiHot 预览和入库成功。微信会话失效时需重新扫码；不能保证免维护运行。

公众平台文章列表可能返回 `200013: freq control`，同时搜索仍正常；本实例 2026-10-13 已复现。上游 [issue #469](https://github.com/rachelos/we-mp-rss/issues/469) 记录了同类问题。不要持续点击刷新；官方镜像的刷新 API 会异步执行，立即返回 `total=0` 并不代表任务已结束。以 SQLite 入库数和 RSS 实际条目验收。

可在 WeRSS 的微信读书管理页另行扫码，再测试公众号采集连接；Cookie 保存在本机服务数据中，不粘贴到聊天或提交仓库。当前代码的微信读书公众号通道会自动关注目标公众号以加入书架。它主要用于最新文章增量，不能承诺远期历史文章回补；扫码后仍要实测 feed 和 YiHot 入库，未通过时保持来源暂停。

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
