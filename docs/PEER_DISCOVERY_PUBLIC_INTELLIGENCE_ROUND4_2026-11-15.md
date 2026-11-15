# YiHot 邻域扩展 · 公益、法律、科研、资金、就业和公共监督（2026-11-15 · 第四轮）

> 本次仅是**公开站点入口与可验证订阅源的登记**，不是授权转载、招聘背书、资金资格认定或政策法律意见。GitHub 配置合并 ≠ 腾讯云生产部署。
> 事实源：`industry/peers.ts`（访客「邻域」页面，公共入口）；`industry/sources.json`（独立 RSS 信源配置）。不得将两者互相代替。

## 本轮从哪里找

1. 承接 [第三轮审查](PEER_DISCOVERY_ROUND3_2026-11-15.md) 的缺口，不再只查 AIHOT Fork。聚焦 `公益 招聘 资助 培训`、`慈善 基金会 信息公开`、`中国 法律 修订 观察`、`research funding calls eligibility`、`international development jobs`、`open contracting procurement transparency`、`bibliometric open scholarly data`、`global education health poverty data`。
2. 从搜索到的公开站点反查其**实际主页/专业入口**、最近可读内容与运营方。如中国发展简报的 NGO 岗位与活动、基金会中心网的新闻研究、China Law Translate 的 2026-11 政策解读、ReliefWeb Jobs 的按职位类型和截止日筛选、Funding Radar 的多国项目征集、OpenAlex 的科研检索、Open Contracting 的采购研究、Our World in Data 的教育/健康/贫困数据。
3. 逐个尝试 RSS/Atom；**只纳入实测能返回带标题与可回溯链接内容的官方 URL**。WordPress 常用 `/feed/` 而不是 `/feed.xml`。没有匹配订阅源的站直接 `strategy="link"`，不猜链接或绕过登录。
4. 与主分支邻域注册表作 ID/网址去重。每个站使用最贴近既有的分组，不因为新增一个主题就额外增加界面导航。外部平台的评级、洞察、申请条件仍需要原始证据独立验证。

## 8 家经过本轮公开可读性核验的站

| ID / 站 | 面向任务 | 公共入口 | 可用 Feed 与状态 |
|---|---|---|---|
| `cdb-ngo` 中国发展简报 | 中国公益职位、活动、项目征集 | https://www.chinadevelopmentbrief.org.cn/ | `link`；`/feed.xml`、`/rss.xml` 返回 404 |
| `foundation-center` 基金会中心网 | 机构披露与公益研究 | https://foundationcenter.org.cn/news | `link`；2026-11-15 可见最近一组条目约 2026-06，**不能称为每日更新**；未确认官方 RSS |
| `china-law-translate` China Law Translate | 中国法律法规的非官方翻译、立法动态 | https://www.chinalawtranslate.com/ | `rss`；**https://www.chinalawtranslate.com/feed/** |
| `reliefweb-jobs` ReliefWeb Jobs | 国际公益、人道援助岗位、咨询和招标征集 | https://reliefweb.int/jobs | `link`；`https://reliefweb.int/rss.xml` 是 **全站 Updates，不是 Jobs 专属 Feed**，所以不能错绑 |
| `funding-radar` Funding Radar | 跨国科研资助征集与资格预筛 | https://fundingradar.eu/ | `link`；`/feed.xml` 404；需核对项目来源与地区/机构申请资格 |
| `openalex-research` OpenAlex | 全球学术文献、作者与机构关系 | https://openalex.org/ | `link`；是检索数据库而非 RSS 新闻源，研究数量/引用不直接构成质量判断 |
| `open-contracting` Open Contracting Partnership | 采购透明度、开放合同和治理方法 | https://www.open-contracting.org/ | `rss`；**https://www.open-contracting.org/feed/** |
| `our-world-in-data` Our World in Data | 健康、教育、贫困、气候等可视化研究 | https://ourworldindata.org/ | `rss`（实际 Atom）；**https://ourworldindata.org/atom.xml** |

日期核查：2026-11-15 使用公开网页/订阅的实时可读性检测。其中 China Law Translate 近月条目存在、Open Contracting 最新文章与采购研究关联、OWID 的 Atom 最新研究包含 2026-11-02 时间戳。不能仅根据成功 HTTP 状态推断持续稳定运行，需观察真实运行日志。

## 两个不同功能：邻域 vs 技术 RSS

**访客邻域（`industry/peers.ts`）**：
- 3 家拥有官网可读 Feed，使用 `strategy="rss"`；其条目被映射成引用索引并保留原站链接，不另行调用模型。
- 5 家工具/数据库/岗位门户使用 `strategy="link"`，页面只显示“仅浏览 · 不自动同步文章”，永远不以 0 条缓存冒充同步失败。
- 相比 31 家基线，本轮新增 8 家成为 39 家登记；保留原有分组、轮转和入口，不增一级栏目。
- 因为不全是 AIHOT 框架，`PEER_SECTION.note` 调整为公开跨领域资源表述，避免误称所有站使用同一技术栈。

**独立主新闻信源（`industry/sources.json`）**：
- 新增 `rss-peer-china-law-translate`、`rss-peer-open-contracting`、`rss-peer-our-world-in-data` 三条，均 **`enabled=false`、`participation_mode=isolated`、`site_fulltext=false`、`syndicate_fulltext=false`**，并设人工审核关键词与首轮回溯上限 4。
- 从 180 条 GitHub Seed 增到 183 条；**不会增加下游付费调用、改变现有新闻筛选、公众号或邮件**。这是配置登记，不是生产授权。
- ReliefWeb 全站 RSS 虽然可读取，但它不是 `/jobs` 的职位筛选结果。不要将它伪装成“岗位 RSS”。以后确有需求再根据官方筛选订阅或申请合规 API。
- CDB 及基金会中心网尚未找到真实可用官方 RSS，继续作为公开网站入口；不要使用验证码、绕过登录或未经许可抓取全文。

## 轻量兼容修复

`packages/backend/src/peers/refresh.ts`：
- `peerFeedUrl` 允许合法同源 HTTPS 订阅路径以 `/` 结尾（WordPress 规范 `/feed/`），继续阻止跨主机、点段、重复斜杠、查询和片段；
- `parseFeed` 对 Atom 多个 `link` 元素优先选取 `rel=alternate` 正文链接，而不是 `rel=self` 订阅接口链接；
- 既有站的默认 `/feed.xml` 行为保持兼容。
- `tests/peers.test.ts` 增加 39 家唯一登记、3 个新 Feed 的独立关闭源、5 个仅浏览站零抓取、`/feed/` URL 安全及 Atom 多链接正确正文 URL 等回归。

## 后续验收（不自动启用）

1. CI 全绿后将代码以 PR 合并至 `main`，不操作生产数据库、服务器、账户或密钥。
2. 线上发布后，检查 `/peers`：新增 8 家官网入口可点击，3 个可同步源显示文章；5 家仅浏览站**无需状态或缓存**。
3. 若某 RSS 返回不可读 XML/地区访问异常，保留站点为 `link`，并记录错误；不应该以界面空卡片伪装更新。
4. 若需要转入主站资讯采集，先审查授权、是否包含敏感个人记录、原始版权、同一文章跨邻域+RSS 去重、资格/发布时间和模型费用，再单个启用。国外基金/采购只能构成线索，不能直接宣称对中国机构开放。
5. 回滚仅移除本轮 8 个新 PeerSite 与 3 个 RSS Seed、恢复路径解析/导读变更；不得抹除旧数据库、其他 Agent 的并发更新或跨站公开文章索引。

**原则：读者看到的是有用入口，而不是无穷无尽的新闻卡；公共监督展示待核验数据，不自动作违法或腐败认定。**
