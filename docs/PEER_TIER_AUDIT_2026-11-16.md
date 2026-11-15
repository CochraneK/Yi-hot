# YiHot004 · 邻域分层与减法治理（2026-11-16）

## 用户确认

- 使用三层：「正式邻域 / 实用资源 / 候选信息」，**第三层必须叫「候选信息」**。
- RSS/API 优先，减少无结构化输出的商业资讯或静态演示卡片；但有实际用途的官方数据库和机会门户可留在实用资源。
- 只做目录分层和误导信息修正，不销毁历史或启动新的采集、模型调用。
- 先前已经确认的「同系邻域 / 其他邻域」是谱系属性，与此三层正交。

## 56 项分类（包括 1 个原本关闭的条目）

| 层级 | 数量 | 典型入口及判断 |
| --- | ---: | --- |
| 正式邻域 | 32 | PsyHOT、青砚、RoboHot 等有 API/RSS 的垂直资讯；保留独立特色明确但暂仅浏览的 AI Safety HOT、AIDC热点、MarketHOT 等作特别例外 |
| 实用资源 | 14 | OpenAlex、UNICEF Data、ICNL、基金会中心、中国发展简报、NSFC、UN Partner Portal、EU Funding、ReliefWeb Jobs、GDACS 等；有些 RSS 可读但不将数据库当新闻 |
| 候选信息 | 10 | 下表细列，候选只作查阅与复核 |

| 候选 ID | 原站 | 归入理由 | 何时恢复 |
| --- | --- | --- | --- |
| aimfast | https://www.aimfast.dev/ | 深度商业情报/登录付费门槛 | 免费可读核心数据及其 API/RSS、成本边界再次验证 |
| fengxiang-demo | https://fightkk7.github.io/fengxiang/ | SaaS 静态演示 | 持续公开条目与 Feed |
| medhot | https://mrf3247.github.io/medhot/ | 之前记录为静态快照 | 多期持续更新、可追溯发布日期 |
| thinkhot | https://mrf3247.github.io/thinkhot/ | 之前记录为静态快照 | 同上 |
| newsiq | https://newsiq.xyz/ | 聚合范围与同类站重叠、仅浏览 | 验明不同事件的增量价值、独立 RSS/API |
| ai4scihot | https://ai4scihot.8-220-189-127.sslip.io/ai4scihot | 公网长效与结构化输出待核实 | 可靠域名、日期和 Feed 检验 |
| xocto | https://xocto.vercel.app/ | 产品机会资料库、新闻更新节奏不明 | 稳定增量与 RSS/API |
| horizon-uu | https://www.uuaihub.com/horizon | 专题入口，非持续实时新闻 | 有可用结构化信息与持续更新 |
| sanyu-insights | https://www.sanyusmart.com/insights/ | 企业行业情报入口，仅浏览 | 公开 RSS/API 和持续栏目更新 |
| yingxiao | https://yingxiaoclub.com/news | 先前已关闭的站点 | 网址恢复并完成实测 |

## 三个正交字段

- `family: same|other`：技术谱系；不作为真伪、热度或许可判据。
- `tier: official|resource|candidate`：阅读用途；候选默认折叠，但不删除登记。
- `strategy: api|rss|link|none`：技术访问能力；不要因为资源已可浏览就自动开启 RSS 主站采集。

旧 API 不具备 tier 时，前端保守落入「候选信息」而不是自动冒充正式邻域。正式卡片保留「同系邻域 / 其他邻域」文字说明。

## 新鲜度边界及问题记录

源码曾把 `fetchPeer` 的非空抓取设为成功，并在重复读到同一 `item_id` 时刷新 `fetched_at`。所以只看成功或抓取时间，会让停止更新的站一直显得正常。本轮用最新条目的真实 `published_at`，并按普通资讯 7 日、明确周报 21 日作 UI 提醒；资源入口不按新闻时效误判，未来日期和无日期归未知。

本轮没有改变抓取队列、LLM 预算、原始 RSS Seed、日报/周报选稿策略及数据库结构。跨站内容重合仍需抽样率、事件级去重和来源许可核查，不能只按站点 ID 去重就宣称事件独立。

## 需要验收与回滚

1. GitHub CI：类型检查、`node --test tests/peers.test.ts`、Web build、Web Tests、PostgreSQL、Docker smoke；检查网站桌面和手机 UI。
2. 目录：三层顺序、候选折叠、正式卡片保留同系/其他、RSS 和 API 维持不变、官方资源不会被标为实时日报。
3. 上线：生产需重建 API/worker/web，确认 /peers 结构、52?（实际按 enabled）记录是否可见，以及无私人数据暴露；本 PR 不声称腾讯云已部署。
4. 回滚：撤销 tier 和页面分类、时间提示，原 56 项登记、ID、历史缓存不删。

下次定期检查建议加入新鲜度分布、实际新增文章数量与跨站原文 URL/事件重复率，并根据数据而非名称调整是否留在正式区。
