# 监管记录（/records）

**页面入口：** [打开 Yi-Hot 监管记录](https://49.233.72.222/yihot/records) · [站点地图](SITE_MAP.md) · [回到首页](https://49.233.72.222/yihot/)

> **公开资料汇集，不是风险定性或处罚建议。** 行政处罚、被列入活动异常名录、被移出名录、严重违法失信名单、公告送达的法律含义不同。系统仅展示公示事件、时间、机构及来源，不能将历史“列入”自动解释为**当前仍在名单**；个别机构的同名、变更和数据滞后仍需要回到官方公示核对。数据量和更新时间以实际同步结果为准。

## 给普通读者看的功能

- 按关键词、机构类型、公告类型、省份/城市筛选；打开原文来源复核。
- **监管数据与新闻是两套不同的数据对象**：这里的条目不会直接充当公益热点新闻，也不能仅因被收录就推断机构的总体质量。
- 登录后台另见 [Yi-Hot 管理入口](SITE_MAP.md)；监管记录页本身是公开阅读，不需要管理员登录。


民政部对全国性社会组织的行政处罚，以及全国社会组织活动异常名录、严重违法失信名单的列入、移出与送达公告。一个独立的数据域：不进内容时间线（日均约 70 条，会把动态流淹没），单独成页、可筛可查。

## 数据源

两个接口都属于**中国社会组织政务服务平台**（chinanpo.mca.gov.cn），是政府部门依《政府信息公开条例》主动公开的公示信息，本站只做汇集、检索与展示，不改写内容：

| 域 | 接口 | 页面 | 体量 |
|---|---|---|---|
| 行政处罚 | `POST /selectXzcfgg?pageNum=1&pageSize=200`，body `{"orgName":"","usci":""}` | [xzcfgg](https://chinanpo.mca.gov.cn/xzcfgg) | 10 条（民政部对全国性社会组织） |
| 信用公告 | `POST /selectApOutsideNotice?pageNum=1&pageSize=2500`，body `{}` | [hdycmlYzwfsxgg](https://chinanpo.mca.gov.cn/hdycmlYzwfsxgg) | 约两千条，30 天滚动窗口 |

响应是普通 JSON（`{success, total, rows}`），无 WAF、无鉴权、一次请求拿全量。同站的「全国社会组织信用信息公示平台」（xxgs.chinanpo.mca.gov.cn）数据更全，但接口有 WAF JS 挑战，暂不接入。

## 记录类型

信用公告的上游码表（`packages/backend/src/records/sync.ts` 里钉死，码表变化会漏数据，有测试守着）：

- 名录：`600406` 活动异常名录、`600407` 严重违法失信名单
- 公告：`600824` 送达、`600825` 列入、`600826` 移出
- 两者组合出六种 `record_type`：`penalty` / `abnormal_enrol` / `abnormal_remove` / `dishonesty_enrol` / `dishonesty_remove` / `delivery`

`org_kind` 由统一社会信用代码前两位推导：`51` 社会团体、`52` 民办非企业单位、`53` 基金会。`entity_id` 命中行业实体词典时回填（正式名或 ≥5 字别名的包含匹配），页面上的「已收录」标签链到对应主题页。

## 同步

- 日常：worker cron `records.mca-sync`，每天 06:35（Asia/Shanghai），错过的槽位补跑一次。
- 手动：`docker exec aihot-api-1 node scripts/sync-mca-records.ts`（upsert 幂等，重复跑无副作用）。
- 归档语义：只增不删。上游是 30 天滚动窗口，窗口里消失的旧记录留在表里，`regulatory_records` 慢慢长成完整档案。

## 表

`regulatory_records`（迁移 `0043_regulatory_records.sql`）：`(source_key, external_id)` 唯一，处罚与信用公告各自一个 source_key。字段见迁移文件头注释；接口 DTO 在 `packages/contracts/src/records.ts`，读层在 `packages/backend/src/records/read.ts`。
