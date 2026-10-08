# Source Registry：离线清点与复核指南

> 首次快照日期：2026-10-08。**本目录仅保存历史来源候选与复核产物，不是数据库导入表、自动采集白名单，也不是在线健康状态。**

## 当前产物

- `imports/newsmail-2026-10-08.json`：NewsMail 的 99 条可识别候选；每条保留来源行号和原始名称、原始定位符，搜索关键词没有被伪造成网址。
- `imports/charity-2026-10-08.json`：charity-intelligence 的 101 条历史合规登记，含检查时间、robots/ToS 与是否 manual-only。注意 2026-09-07 的旧状态不等于最新许可。
- `generated/candidates.json`：整合已有 YiHot `industry/sources.json` 后的规范**候选/冲突清单**；`approved=false`, `enable_collection=false`。
- `generated/review.csv`：便于人工审查、导入表格的候选列表；**没有**写入生产数据库的程序。
- `../../docs/SOURCE_REGISTRY_AUDIT_2026-10-08.md`：精简统计、重复/同 URL 不同名、下一阶段验收任务。

## 生成与复算

项目根目录、Node.js 24+、无需任何 API Key、PostgreSQL 或网络访问：

```bash
npm run sources:audit:check
npm run sources:audit
```

- `sources:audit:check`：Node 语法检查 + 6 组可复现测试 + 三份生成文件是否与快照一致；
- `sources:audit`：重新生成三份结果文件，覆盖 **generated/** 和审核 Markdown，不更改 seed，也不会发起 HTTP 请求。
- 快照更新需要**明确检查源文件来源及更新时间**；后续切忌混用旧权限标签与新抓取行为。

## 为什么没有“自动合并/直接导入”按钮

1. 同一域名多栏目，同一机构多公众号；站点域名不是机构稳定 ID。
2. 两个不同机构名可能在旧清单中共用同一个 URL，必须人工复核。
3. RSS/API/网页抓取是**技术接入口**，与内容实际发布主体分开；镜像、订阅转化服务不是独立媒体。
4. `conditional`, `pending_retest`、`blocked` 均不得被当作已经批准的批量采集权限。
5. 文章来源、发布日期、版权与采集条款决定能否进入公开平台；信源“页面可打开”只是第一步。
6. 微信公众号关键词、微博榜单与聚合页通常只能用于发现/关注信号，不应直接作为一手事实。

## 后续

以 `../../docs/SOURCE_GOVERNANCE_DESIGN.md` 为设计规范，先复核 5–10 条高价值公益来源，再开发管理员一页式候选发现/授权与真实预览。不增加常驻 RSS/WeChat 容器；只复用已有 YiHot 原生 sources 管道。
