# 信息源补充核查（2026-10-12）

此次对照了 NewsMail `c118b464` 和 charity-intelligence `bc04e11d`，并对候选地址做了直连核查。YiHot 当前种子有 20 个来源，主要覆盖民政、环保、教育及部分全国性公益机构；缺口是行业媒体、社区实践、残障、妇女发展和国际社会创新研究。

## 可以先试抓的三个来源

| 来源 | 补充价值 | 本机验证 | 接入方式 |
| --- | --- | --- | --- |
| [中国发展简报](https://www.chinadevelopmentbrief.org.cn/) | 社会组织、社区与公益行业观察 | 首页 8 条新闻，全部有原标题、链接和日期；最新观察日期 2026-10-08 | `web_list`，仅选择新闻卡片 |
| [公益时报](http://www.gongyishibao.com/html/gongyizixun/list.html) | 国内慈善行业、筹资与机构报道 | 20 条新闻，全部有标题、链接和日期；最新观察日期 2026-10-10 | `web_list`，公益资讯栏目 |
| [SSIR](https://ssir.org/site/rss_2.0) | 社会创新、非营利治理与研究 | RSS 40 条；最新观察日期 2026-10-07 | `rss`，保留现有公益相关性筛选 |

完整可复用配置在 `data/source-registry/proposals-2026-10-12.json`，后台“候选信源”可直接带入新建页、预览、判重。创建后仍默认暂停、隔离，启用和参与公开选稿沿用现有后台流程。未扩大种子集合，不将历史清单自动变成生产来源。以上是本机解析结果，上线时需从腾讯云复验网络及正文质量。

## 值得补充，但还没有接通

| 来源 | 当前结论 |
| --- | --- |
| [中国残疾人福利基金会](https://www.cfdp.org/) | 官网有真实动态，可补残障与康复；需补日期解析。旧清单的 `cdpf.org.cn` 属于中国残联，不能当成基金会官网。 |
| [中国妇女发展基金会](https://www.cwdf.org.cn/index.php?m=content&c=index&a=lists&catid=26) | 栏目可访问；存在截断标题、晚于核查日的日期，需用详情页核实。 |
| [UNICEF 中国](https://www.unicef.cn/press-centre) | 对儿童权益与政策有价值；本机直连 HTTP 403，部署环境待复验。 |
| [ReliefWeb](https://reliefweb.int/updates/rss.xml) | 人道救援有价值；本次 HTTP 202 空内容，没有验证到 RSS 条目。 |
| [Candid](https://candid.org/blogs/) | 筹资与基金会研究有价值；旧 PND RSS 已重定向为博客 HTML，需新解析配置。 |
| [中国美国商会（AmCham China）](https://www.amchamchina.org/social-impact-initiative/) | 用户指定新增，优先企业公益、CSR/ESG、社会影响力、社区及乡村发展。本机主页、Social Impact Initiative、新闻归档和 `/feed/` 均 HTTP 468，没有获得正常列表或 RSS，待腾讯云复验。 |

NewsMail 的 99 条和 charity-intelligence 的 101 条历史记录现在都可在后台搜索。后者的年报、信用查询、政府采购和机构目录更适合做事实核验与专题证据；并非每个页面都适合作为连续新闻。历史许可状态和可达性不能替代本次验证。GlobalGiving、Devex 等旧“RSS”记录也需确认是真订阅地址。

### 中国美国商会的补充范围

新增候选 ID 为 `amcham-china-social-impact`，后台搜索 AmCham、商会、CSR 或 ESG 可找到。官方主体是中国美国商会（American Chamber of Commerce in China），与 NewsMail 旧清单标注的“美中贸易全国委员会”应区分。

其 [Social Impact Initiative](https://www.amchamchina.org/social-impact-initiative/) 和 [社会影响力报告](https://www.amchamchina.org/wp-content/uploads/2025/09/SII%E6%8A%A5%E5%91%8A-EN.pdf) 可补充企业公益、社会组织合作、社区赋能与可持续发展案例。商会自行发布的项目和报告可作一手来源，但会员企业自述的成效仍需结合独立证据核验。一般贸易、签证、商会联谊和商务宣传不作为本来源的主要采集范围。

当前只新增候选，没有虚构 HTML 选择器，也没有将探测的 `/feed/` 地址声明为有效订阅。直连复验成功后再根据实际栏目或 RSS 设置采集配置；仍保留摘要与原文链接，全文默认关闭。

## 微信公众号

先在 WeRSS 按名称搜索中国发展简报、公益时报、南都公益基金会、壹基金、中国乡村发展基金会、中国残疾人福利基金会、中国妇女发展基金会等机构账号。名称只是检索线索，需要核对认证主体；不虚构微信 ID，也不将同名账号直接认定为官方。

已有官网的机构优先保留官网为主源，公众号用于补充官网缺失或更及时的内容。公众号经 WeRSS 变成 RSS 后，以 YiHot 现有 `rss` 类型接入，保存原微信文章 URL、发布日期和内部分析正文；站内及对外全文仍默认关闭。AIHOT 原来的 `mp_account` 实现调用 Dajiala，免费方案不需要该密钥。

部署、扫码和添加来源见 `docs/WERSS_DEPLOY.md`。
