# YiHot004 · 邻域第八轮：RSS 优先，拒绝链接堆砌（2026-11-16）

## 用户产品决定

> 能进 RSS 的尽量进 RSS；太多非结构化的聚合邻域没意义。

邻域作为跨领域信息接口，应优先结构化且可持续读取的 RSS / Atom / 可读 API，来源尽量有原文链接、发布日期、可核验身份与稳定地址。只存在普通网页的候选原则上不计入新增邻域；既有重要权威入口保留“仅浏览”，但逐项研究机器接口。不为凑数字把空 Feed、403、模板仓库、无公网上线地址算作完成采集。

## 已实际读取的 9 条 RSS

本轮使用匿名公开 HTTP 读取（RSS endpoint status 200，content-type 为 XML/RSS，能读出实际条目、标题和日期），并与既有名录 51 项及旧 RSS 种子按 ID、域名和用途去重。

| 处理 | 邻域 | 真实 RSS | 2026-11-16 证据 |
| --- | --- | --- | --- |
| 从 link 升为 rss | DesignRadar | https://designradar.vercel.app/feed.xml | 200, application/rss+xml；有精选标题、原站条目链接 |
| 从 link 升为 rss | 数学教育 HOT | https://a0910580996-a11y.github.io/math-education-hot/feed.xml | 200, application/xml；有 11 月 9 日相关周报条目；**每周更新，不是每小时新闻** |
| 从 link 升为 rss | 神灯AI热点 | https://shendeng.news/feed.xml | 200, application/xml；有精选标题和原站条目链接 |
| 从 link 升为 rss | ReliefWeb Jobs | https://reliefweb.int/jobs/rss.xml | 200, application/rss+xml；有 11 月 15 日职位、发布与截止日期（**正文许可仍应单独复核**） |
| 新增 rss | UNICEF Data | https://data.unicef.org/feed/ | 200, application/rss+xml；有儿童统计研究与更新时间 |
| 新增 rss | ICNL | https://www.icnl.org/feed/ | 200, application/rss+xml；有 11 月 13 日非营利法律/政策条目 |
| 新增 rss | UN News · SDGs | https://news.un.org/feed/subscribe/en/news/topic/sdgs/feed/rss.xml | 200, application/rss+xml；有 11 月 12 日 SDG 相关条目 |
| 新增 rss | UN Geneva | https://www.ungeneva.org/news-media/press-items-list/rss.xml | 200, application/rss+xml；有委员会与新闻材料 |
| 新增 rss | GDACS | https://www.gdacs.org/contentdata/xml/rss_homepage.xml | 200, application/xml；有 11 月 15 日地震/风暴等警报；含 GeoRSS 位置字段 |

**与之前的区别：** 这一轮不是新增九个仅浏览链接，而是**五个新的可同步站，加四个已有 link→rss 转换**。名录计数 51 → **56（同系 33 / 其他 23，含原来关闭项）**，能读 RSS 的邻域数量增加 9 个。

## 归属与采集的两层开关

1. `industry/peers.ts` 中 `strategy=rss`：邻域刷新程序每小时可只读以上 Feed，留存摘要、时间、文章 URL 并供邻域看板及定额轮换引用。这里不调用大模型，不是主站原创新闻收录。
2. `industry/sources.json` 中为九条 Feed 准备各自 `rss-peer-*` 采集 Seed：`enabled=false`、`participation_mode=isolated`、`site_fulltext=false`、`syndicate_fulltext=false`、`initialBackfillLimit=4`，加领域相关性标记，**禁止从目录上线直接开成主站抓取**。
3. 曾经「静态站默认仅浏览」是当轮的上线策略，现已通过真实公开 RSS 核验才升级；仅证明源端可读，不能替代部署机对 Feed 的联网测试与完整解析验收。
4. 第三方来源原文和网页内容仍归原权利人；尤其 ReliefWeb 明示用户必须尊重各原发布者的知识产权，不能认为免费 RSS 代表自由全文转载。

## 尚未纳入的候选

- UNGM、UNICEF Innovation 合作/资助入口：公开网页有价值，但本轮未发现可直接复核并持续产出合作机会条目的 RSS/API；避免另加两张只读链接卡。
- CORDIS 官方承诺无登录可用 RSS、可导出 XML/CSV/JSON，但尚未验证适用于本项目的具体 Feed URL；`/rss/news/en` 返回 HTML，不可冒充 RSS。
- GDELT 有全球事件结构化数据，但与普通 RSS 格式不同；在规划地理新闻接口之前不列作已接通的站。
- ReliefWeb Updates 官方 RSS `https://reliefweb.int/updates/rss.xml` 读取成功，但与已上线 ReliefWeb Jobs 和 YiHot 主站公共新闻存在较多重叠，本轮不叠加，下一步按领域子集与真正增量价值评估。
- FundingRadar `/feed/` 404，暂不升级。其他旧“仅浏览”站逐项核验，不用碰巧有 XML 路径的猜测来伪造已接通。

## 新闻地图的边界

GDACS 官方 GeoRSS 与开放 API 包含灾害地理坐标，适合独立构建“灾害预警地图”；但不能直接把所有 YiHot 新闻映射到灾害经纬度，更不能因为新闻提及一个地名就当新闻发生地。本 PR 不加新闻地图、不调用访客 IP 定位、不增加个人数据采集、也不声称经纬度已写入 YiHot。后续地图方案应将事件发生地、机构所在地、影响地区分开建模，并标注地理证据和精度。

## 检查与回滚

- 回归：56 个唯一 PeerSite、192 条唯一 Seed（183+9）、九个 Feed HTTPS 与具体路径一致、主站 Seed 默认禁用隔离、不放开全文。
- 单元测试采用合成 RSS 与 GeoRSS 片段验证解析字段；第三方公开端点实测不等于 Docker / 后端 DB / 线上 worker 的完整采集验收。
- 合并前须 `npm run typecheck`、`node --test tests/peers.test.ts`、Web 构建及浏览器回归、后端隔离 PG 与 Docker smoke；再由 CI 复核。
- 如发现 RSS 被拒绝/只显示 HTML/版权要求不满足，回滚对应站点 `strategy` 与 Feed Seed，保持其他用户数据及主站配置原样。
- GitHub 合并不等于腾讯云更新：部署需重建 API/worker，核查 `/peers` 实际 Feed、状态记录、异常指标和外网访问，不能仅用本地模拟宣布上线。

补充精简策略：同日另核验 GDACS 全量 `/xml/rss.xml` (262 项，约 802 KB)、24 小时 `/contentdata/xml/rss_24h.xml` (97 项)、首页 `/contentdata/xml/rss_homepage.xml` (78 项)。为避免全球重复微型预警挤占邻域和每小时刷新流量，实际采用**首页 78 条**的 RSS，保留 GeoRSS 坐标；数据量是 2026-11-16 请求快照，不是固定上限。
