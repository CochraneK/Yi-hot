# YiHot · 儿童公益工作机会情报：关键词与订阅候选（2026-11-15）

> **范围：GitHub 配置与待审候选。绝不等同于生产部署、实际采集、资助资格或申请成功。**
> 事实源：`industry/sources.json`（实际可 seed 的源配置）、`data/source-registry/opportunity-candidates-2026-11-15.json`（**非自动导入**候选）。
> 基线按 2026-11-15 GitHub `main`：166 源 / 77 搜索源；本次再预置 6 条**全部 `enabled=false`** 的隔离源（5 条搜索、1 条 RSS），成为 172 条配置源。生产数据库有独立的运行状态，尚未核查/改动。

## 为什么增加这一类来源

现有来源擅长“今天发生了什么”，欠缺“未来可参加/申请/对接的事情”。一般新闻 `ingestNoiseFilter.dropMarkers` 有时包含“招聘”“征稿”，但工作机会与其他广告完全不同。**不全局取消旧新闻的去噪规则**；专设 `participation_mode=isolated` 工作机会探索源，排除彩票、优惠券、抽奖等噪声，但不屏蔽征集、资助、招聘、会议、培训、报名。

目前站点公开类型、`publication` 层、数据库和模型提示词均未引入“Opportunity”实体。**这 6 条只是关闭的技术配置，不能把它们当已经上线的机会雷达。** 将来只有在明确内部审查权限、截止日和资格提取规则后，才可按既有 YiHot 审核流程逐条启用并评估成本。

## A · GitHub 正式 seed 中新增、默认关闭的 6 条

| ID | 重点 | 内容 / 数量 | 初始状态 |
|---|---|---|---|
| `search-opportunity-events` | 会议、行业培训 | 4 个关键词 | 关闭 / isolated |
| `search-opportunity-funding` | 公益资助、政府购买、企业合作 | 5 个关键词 | 关闭 / isolated |
| `search-opportunity-partnership` | 国内外合作征集 | 4 个关键词 | 关闭 / isolated |
| `search-opportunity-policy` | 政策实施、征求意见、地方试点 | 4 个关键词 | 关闭 / isolated |
| `search-opportunity-evidence` | 干预证据、系统综述、专业网络研讨会 | 4 个关键词 | 关闭 / isolated |
| `rss-un-news-asia-pacific` | 联合国亚太新闻补充 | 1 条亚太 RSS | 关闭 / isolated |

全部源均 `enabled=false`、`site_fulltext=false`、`syndicate_fulltext=false`、首轮回溯上限 4。搜索源 `count=20`，`lookbackDays=7`，调度 1440 分钟；RSS 调度 720 分钟。**这不是对未来成本的保证**；真正启用之前必须核对 YiHot 的搜索供应商、模型预算和运营频率。

RSS 地址：
`https://news.un.org/feed/subscribe/en/news/region/asia-pacific/feed/rss.xml`

该 RSS 见第三方订阅目录近期可读记录（2026-11-15），但**不是 YiHot 腾讯云的实时 Preview 成功证明**；其内容与已有联合国新闻中文总源在事件层会部分重合，必须做同事件去重，不将双语转载算独立证据。

## B · 8 个进一步核验的来源（绝不猜 URL）

完整字段含证据/许可状态、优先级、待解决问题：

[候选台账 JSON](../data/source-registry/opportunity-candidates-2026-11-15.json)

| 目标来源 | 官方入口 | 候选方式 | 必须核验 |
|---|---|---|---|
| 中国儿童中心通知公告 | https://www.ccc.org.cn/col/col9/index.html | 官方 `web_list` | CSS 选择器、原始发布日期、合作/会议通知 vs 普通儿童课程 |
| 中国发展简报 | https://www.chinadevelopmentbrief.org.cn/ | `web_list` | 资助/招标/培训等具体栏目、转载与原始发布方 |
| 中国政府采购网地方招标 | https://www.ccgp.gov.cn/cggg/dfgg/gkzb/ | 列表或人工 | 招标/中标区分；预算/期限/采购人；**不绕验证码** |
| UN Partner Portal | https://www.unpartnerportal.org/landing/opportunities/ | 公开公告或人工 | 国家、联合国机构、资格、截止日期；需登录才能申请 |
| PubMed | https://pubmed.ncbi.nlm.nih.gov/ | **用户实际生成** RSS | 在 PubMed 搜索后使用 `Create RSS`；没有现成虚构 URL |
| ReliefWeb API | https://apidoc.reliefweb.int/ | 官方 API | 先申请批准 `appname`，分类 `training`/`reports` |
| EU Funding & Tenders | https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/about | 门户订阅 | 需实际查询所生成的 RSS/通知；评估地域/组织资格 |
| Google Alerts | https://www.google.com/alerts | 用户设置的提醒 RSS/邮箱 | 只是补漏，需原网站二次核验，避免与搜索源重叠 |

已有 `rss-gov-cn`、`rss-un-news`、`rss-who-news` 和 `web-unicef-innocenti-reports` **不要复制**。其中 UNICEF Innocenti 在 `industry/sources.json` 中为关闭态；旧文档中曾记述运行库已启用和改写日期选择器，但这不是 2026-11-15 实时数据，本次不修改其开关。中国政府采购网的采购意向查询可能要求验证码；不要用自动化规避。

## C · 以后引入“机会雷达”需要的证据与状态

每条候选建议的结构至少包括：
`opportunity_id`、`opportunity_kind`（event / training / grant / procurement / partnership / consultation / evidence）、`publisher`、`original_url`、`published_at`（原站发布时间）、`discovered_at`（本站收录）、`registration_deadline` / `application_deadline` / `event_date`（**不同字段**）、`country` / `region`、`eligibility`、`source_independence`、`verification_state`、`organization_relevance`、`reviewer`、`next_action`。

- 找不到截止日期标 `UNKNOWN`，**不得用发布时间/收录时间代替**。
- 截止日早于当前本地时间时，自动候选状态应为 `EXPIRED`，不得继续列成可申请项目。
- 采购公告≠公益资助；联合国合同采购≠企业捐赠；全球项目≠一定接受中国代表处申请。
- 关键词/LLM 推断仅供内部发现，需核对官方公告和资格条款后才能给机构工作建议。
- 涉及儿童个案的可识别内容不得进入公共机会卡片或未经授权的第三方模型。

## D · 如何复核并逐步启用

1. CI：`node --test tests/opportunity-source-candidates.test.mjs`、`npm run sources:audit:check`；CI 仅离线读取 Git 文件，没有网络/生产数据。
2. 用现有后台的来源 `Preview` / 离线专用候选测试，先检查每个真实入口是否可读、许可、URL、标题、日期、权限。**不要**将普通网页主页伪作 RSS。
3. 选择 1–2 个源灰度；先设 `isolated` 不进入公开新闻，核对 48 小时有效机会数、同源重复、空日期、误报、供应商收据和成本。
4. 机会实体、到期检查、内部“待办”查看逻辑上线后，才讨论从 `isolated` 迁入受控出版层；不默认自动群发工作情报。
5. 没有审批不得把关闭的源批量设 `enabled=true`，不得未经权限确认绕过网站访问控制。保留现有新闻来源和跨仓库证据账本。

### 回滚、部署边界

本次没有数据库迁移、生产写入、服务器命令、模型开关、公开站点路由或已存在信源的配置变更；回滚只需从 `industry/sources.json` 删除这 6 个新 ID，撤回审查台账/文档/离线测试。GitHub 合并不代表腾讯云运行了这些源，`seed.ts` 的已存在行不会被自动覆盖。生产归档安全问题仍独立见 Issue #21。

官网证据：国家机构官方通知中心 https://www.ccc.org.cn/col/col9/index.html；中国发展简报 https://www.chinadevelopmentbrief.org.cn/；政府采购官方公告 https://www.ccgp.gov.cn/cggg/dfgg/gkzb/；UNPP https://www.unpartnerportal.org/landing/opportunities/；PubMed 创建 RSS https://pubmed.ncbi.nlm.nih.gov/help/；ReliefWeb https://apidoc.reliefweb.int/ ；欧盟 Funding & Tenders https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/about。
