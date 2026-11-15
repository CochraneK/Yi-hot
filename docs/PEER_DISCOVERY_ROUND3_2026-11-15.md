# YiHot 邻域继续探索（第三轮，2026-11-15）

> **GitHub 代码快照，不是腾讯云运行情况。** 这份记录说明如何找到候选、如何验证、为什么纳入或拒绝。候选网站上的判断不代表 YiHot 已核实事实，不构成投资、医疗、政策或监管建议。

## 怎样发现新站：可重复执行的方法

1. **上游社区名录**：访问 [AIHOT 公开登记 #306](https://github.com/KKKKhazix/AIHOT/discussions/306)、[Show-and-tell](https://github.com/KKKKhazix/AIHOT/discussions/categories/show-and-tell)、[#284 协作倡议](https://github.com/KKKKhazix/AIHOT/discussions/284)。看明确的「站点」链接而非仅凭仓库。GameHOT 从站点相关公开搜索定位，进一步核实。
2. **GitHub Fork 二次检索**：`is:fork AIHOT pushed:>2026-11-01`、行业关键字 + GitHub 配置；不能把仅 fork 模板或继承上游默认 homepage 的仓库当作独立运行站。重要的是行业 `site/site.ts`、部署网址、公开运行记录。
3. **搜索引擎的行业定向检索**：例如 `"AIHOT" "金融" "feed.xml"`、`"AIHOT" "游戏" "日报"`、`AI 智能行业情报 招投标`、`AI startup opportunity radar`、`AI 项目机会库 融资`。从结果打开真实官网，不把二手推荐文章当可用站点。
4. **站内反查**：从关于页、RSS 订阅说明、原文链接和工具页查运营边界、版权、可信度和是否需要账号。一个 `/feed.xml` 返回 404 就继续检查站点公开文档，而不是猜另一个可用地址。
5. **实时验证并去重**：在 2026-11-15 访问首页与实际订阅，至少确认站名、最近内容、可回溯链接、主题差异；与 `industry/peers.ts` 的 host 和主题比对。读到转载不等于两份独立事实证据。

## 本轮纳入公开「邻域」的 6 家

| 站点 ID | 官网 | 类型 | 证据（2026-11-15 公开读取） | 浏览策略 |
|---|---|---|---|---|
| `gamehot` | https://gamehot.org/ | 游戏产业、产品、玩家舆情 | 当日首页、[精选 RSS](https://gamehot.org/feed.xml) 有标题、摘要、时间及来源；`/api/v1/items` 为 `not_exported` | `rss` |
| `myhot-finance` | https://aihot.wscn.net/ | 金融市场、产业与商业动态 | [精选 RSS](https://aihot.wscn.net/feed.xml) 有 11 月 15 日报道；是独立 MyHOT 服务，不能当作 `aihot.news` | `rss` |
| `ai-pulse-lab` | https://ai-pulse-lab.com/ | AI 多源信号、深读与知识库 | [RSS](https://ai-pulse-lab.com/feed.xml) 可读当日研究分析；与其他 AI 资讯站有重合，轮转和去重不可省略 | `rss` |
| `xocto` | https://xocto.vercel.app/ | AI 创业产品、融资与机会库 | 产品分析页、[融资观察](https://xocto.vercel.app/funding.html) 有日期和参考源；`/feed.xml` 为 404 | `link` |
| `aimfast` | https://www.aimfast.dev/ | 技术趋势与项目可行性 | 公开首页可浏览当日 Signals；`/dashboard` 需要登录，`/rss.xml` 返回 404；不可假定获取付费研究 | `link` |
| `sanyu-insights` | https://www.sanyusmart.com/insights/ | 行业 AI、智慧水利、招投标 | 近期行业情报与[招投标雷达](https://www.sanyusmart.com/insights/radar.html) 可浏览；`/feed.xml` 为 404 | `link` |

3 家可同步站点放进 `industry/peers.ts` 的已有分组：GameHOT、MyHOT 归「商业与职场」，AI Pulse 归「综合 AI 资讯」；3 家只能浏览的站只展示官网直达、明确「仅浏览」，不伪造更新、缓存和文章计数。沿用现有 `PeerSite.strategy="link"` 和前端卡片，不增新栏目或新容器。

### 与 RSS 信源模块严格分离

`industry/sources.json` 新增：
- `rss-peer-gamehot` → `https://gamehot.org/feed.xml`
- `rss-peer-myhot-finance` → `https://aihot.wscn.net/feed.xml`
- `rss-peer-ai-pulse-lab` → `https://ai-pulse-lab.com/feed.xml`

三个新技术 RSS **全部 `enabled=false`、`participation_mode=isolated`、禁全文转载、每源首轮回溯最多 4 条**。它们并不因「邻域」可浏览就进入 YiHot 的主采集、模型账单、公众号或推送。真正启用前需检查使用条款、同原文去重、主题相关性、截止日、预算熔断、对公开用户的实际价值；原始站文章中的争议论断只是一条来源观点，不能当成 YiHot 的独立验证。

## 查过而不纳入的结果

- [UU AI Hub](https://www.uuaihub.com/) 的 `/rss.xml` 确实可读，但现有 `horizon-uu` 已给出「发射窗口」专题。该 RSS 供给的是**全站博客**而非航天专题；直接绑定到「发射窗口」会张冠李戴。后续若需要单独增加 UU AI Hub 全站，应做独立去重审查。
- [AI Hot Tracker](https://aihot.joeplab.cn/) 主要镜像或转述上游 AIHOT，独立信息增量不足；不加。
- [AI Hot Daily](https://aihot.dev/) 官网能读到开发日报，但首页最新示例停留在 2026-08，`/feed.xml` 返回 404；尚未验证持续更新，不加。
- [x-octo](https://xocto.vercel.app/) 虽有大量案例，但很多项目只有早期信号，不能声称已证明市场需求或融资可得性。
- [AI Pulse](https://ai-pulse-lab.com/) 与既有 AI 站明显重合，因此仅作为邻域轮转输入；需复核其长文章中的事实证据，不把带结论的摘要直接喂给预测模型。
- AIHOT 社区登记 #306 包含未公开 Docker、本地部署和静态展示项目。未验证的私有站不能因为作者声称“做了站”就加目录。

## 校验与上线边界

- `node --test tests/peers.test.ts` 新增断言：31 个 Peer ID 唯一、新 3 个 RSS URL 与隔离关闭源 1:1、3 个 link-only 不请求外部 API，保留旧邻域。
- CI 的 `typecheck`、Web Tests、Backend Tests、Docker smoke 均需通过后才合并。
- GitHub 合并后腾讯云必须**单独部署 API + worker**，等待邻域抓取与 `peer_status` 更新，才能验证用户可见的最新条目。只浏览的 3 个站不在 `peer_items` 和 `peer_status` 产生采集行。
- 回滚只需移除本轮 6 个 PeerSite 和 3 条默认关闭的 RSS Seed 及对应测试/说明；不可擦除旧栏目、用户数据或历史来源状态。并发改动优先保留最新 main 的页面调整。
