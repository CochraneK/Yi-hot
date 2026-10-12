# 审查问题修复与验证（2026-10-12）

基线：GitHub `CochraneK/Yi-hot` main `3f04e27397c6da2e254bff3880988198221c1fe1`。本次工作分支：`codex/source-expansion-wechat`。

| 原问题 | 修复结果 |
| --- | --- |
| sharp 0.35.4 安全公告 | API 与 backend 升级并锁定 0.35.5；另外更新 source-map-js 至 1.2.2。 |
| 撤下一篇报道后，事件仍引用旧综述 | 撤回时同事务清理 digest、summary、latest，并重置事件标题；异步写作提交前检查版本，防止旧答案恢复；旧存量综述增加公开读取时的证据检查。 |
| 已知材料忽略后来补充或更正的发布时间 | 原来源可更新 published_at、timeline_at、backfill；镜像来源不能更改。只更正日期不新建内容版本、不重新付费分析；公开投影与精选增量同步同时更新。 |
| Windows CRLF 导致快照与三方 SHA 对照偏差 | `.gitattributes` 固定文本 LF，二进制保持原样；审计比较兼容 CRLF。工作区已规范化，未制造全仓库业务改动。 |
| 登录后丢失 `/yihot/admin/...` 返回地址 | Web 和 API 共用返回路径校验，兼容旧 `/admin` 链接，保留部署前缀。 |
| PWA 启动地址落到门户 | manifest 的 id、start_url、scope 均指向 `/yihot/`。 |

另加入 WeRSS 的受限私网 feed 读取、公众号 RSS 新建入口、8 项来源补充建议及三个可试抓配置。详情见 `SOURCE_EXPANSION_2026-10-12.md` 和 `WERSS_DEPLOY.md`。

## 已验证

- Linux / Node 24.11、独立 PostgreSQL 16 临时数据库：149 项后端测试通过。Windows / Node 25 的 SIGTERM 测试不能验证 Linux 停机行为，使用 Linux 重跑后通过。
- 最后收窄失效触发条件后，16 项发布与并发综述回归测试再次通过。
- TypeScript 检查、网页生产构建通过；17 项前端测试、6 项信源审计测试与生成快照检查通过。
- 本机完整站点冒烟检查通过：页面、RSS、公开 API、MCP、manifest、分享图片等；新增候选页及两种新建入口均 HTTP 200。
- WeRSS 本地桩测试验证：原微信 URL、日期、正文保留；只允许指定服务的单账号 feed，私网其他路径和跨地址重定向被拒绝。
- 中国发展简报 8 条、公益时报 20 条、SSIR RSS 40 条为本机真实网络解析结果；没有将历史清单自动启用。
- WeRSS 的 YAML 可解析、bootstrap Bash 语法通过；尚未在实际服务器执行 Docker Compose。

## 尚未验证或完成

- 腾讯云部署：当前未发现解密后的 `secrets/credentials.env`，没有可用部署凭据，未更改生产服务。
- 公众号实采：需部署后由用户扫码登录并核实账号，再验证真实 feed 和 YiHot 入库。当前验证的是接入代码与本地 RSS 桩。
- GitHub 发布：本地分支保存改动，等待归档内的 GitHub 凭据；未推送或合并 main。同步工具支持 `--branch` 与 `--expect-head`。
- npm 审计仍有 satori/fflate 链路的 2 个 moderate 条目；未通过跨版本降级或强制覆盖依赖来声称消除所有公告。本次没有引入 ZIP 解包接口。

本次无数据库结构迁移，不覆盖运行时 sources 配置、不更改生产模型和付费安全阀。
