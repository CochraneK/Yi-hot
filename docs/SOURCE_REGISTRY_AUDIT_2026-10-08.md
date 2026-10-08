# YiHot · 三库信源审计（自动生成）

> 此报告由 `node scripts/source-registry-audit.mjs --write` 生成，使用 2026-10-08 的**静态 Git 仓库快照**；不是线上信源健康报告，未发送网络请求，**所有新候选默认禁用**。

## 清点结果

| 项目 | 数量 | 解释 |
|---|---:|---|
| YiHot 现有 seed | 16 | 同一个域名下可以有多个栏目 |
| NewsMail 候选条目 | 99 | 包含网址与非网址搜索信号 |
| NewsMail 有网址条目 | 82 | 不等于有效 RSS |
| NewsMail 不同主机名 | 67 | 仅用于线索匹配，非机构数 |
| 与 YiHot seed 同主机名的 NewsMail 行 | 10 | 不能推断为重复新闻栏目 |
| charity 合规登记 | 101 | 历史登记，不是许可授权 |
| 精确 URL 重复组 | 4 | 有些只是同名重复 |
| 同 URL 不同名称组 | 2 | **需要人工核查身份** |
| 本次启用来源 | 0 | 审计不修改运行状态 |

## charity-intelligence 的历史合规状态

- `blocked`: 6 条
- `conditional`: 68 条
- `pending_retest`: 27 条

不能将 `conditional` 自动变成 `allowed`。官方权威、抓取成功、转载许可、事实独立性彼此正交。

## 重点身份冲突（同一原始 URL 多个名称）

- **AmCham·美中贸易全国委员会 / 美中贸易全国委员会AmCham**：https://amcham.glueup.cn/organization/755/subscriptions（newsmail:054, newsmail:089）
- **中华少年儿童慈善救助基金会 / 中国儿童少年基金会**：https://cctf.org.cn/（newsmail:019, newsmail:020, newsmail:094, newsmail:095）

## 第一批复核清单

| 来源 | 目标检查 |
|---|---|
| 民政部四个栏目 | 列表、发布日期与原文，避免一个发布主体重复计独立来源 |
| 中国慈善联合会 | 官网新闻、权限与稳定解析 |
| 南都公益基金会 | 核验 RSS 与网页两个入口；只启用一条首选路由 |
| 基金会中心网 | JSON/API schema、授权与原始发布者 |
| 中国发展简报 | NewsMail 标为 RSS 的链接是否返回有效 feed |
| 公益时报 | NewsMail 旧 RSS 是否仍在更新 |
| UNICEF China | 可用栏目、发布日期与主办机构 |
| 两个有来源许可的公益公众号 | 公众号 ID、原始 URL、RSS/API 回退与预算 |

## 执行与安全门槛

1. 导出的 `data/source-registry/generated/candidates.json` 和 `review.csv` 用于**人工复核**，不直接驱动 `scripts/seed.ts`。
2. `source_file` 与 `source_line` 是原始来源定位；保留冲突，禁止同名或同域自动合并机构。
3. 必须确认版权、服务条款、站点 robots、真实发布日期后，才可以手工增加新的正式 YiHot source。
4. 旧来源不应在首采时把历史文章塞入“今天”；费用接口先配置预算与 receipt。
5. 下一阶段才开展真实网络试抓，并在后台对接测试结果；本脚本无联网行为。
