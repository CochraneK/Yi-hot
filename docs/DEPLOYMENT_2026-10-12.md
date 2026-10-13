# 腾讯云部署记录（2026-10-12）

## 已完成

- GitHub PR：[Yi-hot #6](https://github.com/CochraneK/Yi-hot/pull/6)，应用改动分支提交 `0445761526`。远端 41 个改动文件逐一匹配本地 blob SHA；GitHub `check`、`docker` 检查通过。
- 部署前服务器应用源码与 main `3f04e273` 一致。运行时 `.env` 沿用服务器现有文件，没有用凭据归档覆盖。
- 备份目录：`/opt/yihot/.data/backups/review-20261012/`，包含 `source.tar.gz`、`database.dump`、`image-id.txt`；旧镜像标签 `aihot-app:before-review-20261012`。数据库无结构迁移。
- 新应用镜像：`sha256:cc597df7d0c0f0334dc230ca3cfee835999100556c49b99de9ca71c083b5eccc`，实际 Node 24.21.0、sharp 0.35.5、source-map-js 1.2.2。
- 使用 `docker-compose.yml`、`compose.futureme-proxy.yml`、`compose.werss.yml` 三份配置。Web 保留 `futureme_proxy`；API、worker 增加 `yihot_werss`，`WERSS_BASE_URL=http://werss:8001`。
- 容器内整站 smoke 全部通过；公网 `/api/health`、`/yihot/`、`/futureme/` 均 HTTP 200。manifest 的启动路径和作用域均 `/yihot/`。
- 三个新来源已创建并试抓入库：`china-development-brief` 8 条、`gongyi-times` 20 条、`ssir` 30 条。均为首次导入历史样本，来源仍 `enabled=false`、`participation_mode=isolated`；全文开关关闭。
- 腾讯云复验 AmCham 的 Social Impact Initiative 和 `/feed/` 仍 HTTP 468，保留待接通候选。

## WeRSS

独立目录 `/opt/werss`，容器 `yihot-werss-werss-1` 已启动，HTTP 200，未发生 OOM。固定官方 amd64 digest `sha256:125472e8a58a05f02b930ba2b958575ffc87378743d9491383b13390f709215e`，通过 `ghcr.1ms.run` 镜像通道拉取并核验。管理账号与签名密钥在服务器该目录 `.env`，不进入 GitHub，也不输出到聊天。

管理端仅绑定服务器 `127.0.0.1:18001`，本机通过 SSH 隧道访问；YiHot worker 内部访问正常。

2026-10-13 验证：公众平台登录与搜索成功，但文章列表返回 `200013: freq control`。用户另行扫码登录微信读书后，`/web/mp/articles` 实测可用；已核实认证账号「公益时报」（alias `gongyishibao`，WeRSS ID `MP_WXS_2395372392`）。WeRSS 存入 43 篇，重复采集新增 0；YiHot 预览 30 篇并首抓入库 30 篇，来源 `wechat-gongyi-times` 仍暂停、隔离、关闭全文。

已关闭公众平台登录浏览器释放资源。固定镜像只走 cover 接口，遗漏列表且将采集时间写作发布时间；部署了 `deploy/werss/weread-list-compat.py`，原模块 SHA-256 `6dfd34ced1b85bc935e0c2ba532c6468064ed8ebf5d22ac0a002679e81ea2d6c` 必须匹配才安装。使用列表真实日期，已入库样本时间范围 2026-09-20 至 2026-10-12。桌面响应返回 WR1 不透明 ID，实测 iPhone 表示返回原文短链；补丁固定移动端请求，并将 `~` 还原 `_`，拒绝把 WR1 ID 当原文链接。中间生成的 43 条错误链接已在备份后更正，尚未输入 YiHot，没有删除数据。

WeRSS 使用 `compose.yml` + `compose.weread.yml`，只读挂载兼容模块和采集脚本。`yihot-weread.timer` 每两小时刷新，最多每次两页，不发送通知、不调用模型；正文自动补抓关闭。三个兼容回归测试通过，验证真实日期、重复去重和错误元数据不推进游标。上游 [issue #469](https://github.com/rachelos/we-mp-rss/issues/469) 有同类风控反馈，但本文结果以本实例实测为准。

## 后续操作约束

- 后续重启应用继续使用三份 Compose 文件，避免丢失 FutureMe 反代或 WeRSS 内部网络。
- 现有主站已恢复稳定服务；若 WeRSS 安装失败，单独处理 WeRSS，不重新部署已通过验证的应用。
- 新来源已入库并不代表已公开发布；启用与参与选稿仍以运行时数据库及后台状态为准。
- 回滚应用使用备份源码和旧镜像标签，保留数据库卷及生产 `.env`；先核实备份，不做全目录覆盖或数据库重建。
