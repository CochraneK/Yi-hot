# 信源全名单（实时快照）

[← 返回 README](../README.md) · 由 `scripts/export-source-registry.py` 从线上 PostgreSQL 实时生成，可重复执行。

> 数据时间：2026-10-25 12:55（北京时间）· **唯一口径是入池数**（`publications.selected`，LLM 评分 ≥40），不看 found / created——技术接通 ≠ 内容对口。
> 共 210 个源（`sources.json` seed 153 + 仅数据库 57），启用 175 / 停用 35，其中主力（启用且入池 ≥5）113 个。生产信源以数据库运行时配置为准（含 36 个只在库的 `web-probe-*` 探测源）。

| 类型 | 源数 | 在用且有产出 | 入池文章 | 占比 |
| :--- | :--- | :--- | :--- | :--- |
| 搜索源（DeepSeek Search） | 72 | 70 | 1256 | 67% |
| 网页列表源 | 93 | 68 | 465 | 25% |
| RSS 源 | 26 | 9 | 80 | 4% |
| JSON / API 列表源 | 17 | 2 | 52 | 3% |
| 外部系统源 | 2 | 1 | 15 | 1% |
| **合计** | **210** | **150** | **1868** | 100% |

### 全部信源（按类型、按入池降序）

下表只列**主力源**（启用且入池 ≥5，共 113 个）；入池 1–4 的、零入池与已停用的 97 个收在下方折叠块里。**名称带链接的指向原始采集地址**，可直接点开核对原文；网页搜索源按主题词检索、没有固定地址，故不设链接。状态：● 主力（入池 ≥5）· 少量（1–4）· △ 有稿零入池 · ○ 从未产出 · ⚠️ 退避中 · ⛔ 停用；数字为**入池 / 产出**。

#### 搜索源（DeepSeek Search）（主力 67 个，入池 1256）

| 名称 | ID | 状态 | 入池/产出 |
| :--- | :--- | :--- | :--- |
| 网页搜索·老年人权益（DeepSeek） | `search-elderly` | ● 主力 | 62/82 |
| 网页搜索·残障融合（DeepSeek） | `search-disability` | ● 主力 | 49/73 |
| 网页搜索·儿童与公益（DeepSeek） | `search-child-rights` | ● 主力 | 48/98 |
| 网页搜索·国家卫健委（DeepSeek） | `search-mohw` | ● 主力 | 47/82 |
| 网页搜索·江苏民政（DeepSeek） | `search-mca-js` | ● 主力 | 44/72 |
| 网页搜索·浙江残联（DeepSeek） | `search-cdpf-zj` | ● 主力 | 38/65 |
| 网页搜索·山东民政（DeepSeek） | `search-mca-sd` | ● 主力 | 38/70 |
| 网页搜索·北京民政（DeepSeek） | `search-mca-bj` | ● 主力 | 35/51 |
| 网页搜索·乡村振兴（DeepSeek） | `search-rural` | ● 主力 | 33/71 |
| 网页搜索·浙江民政（DeepSeek） | `search-mca-zj` | ● 主力 | 31/54 |
| 网页搜索·韩红基金会（DeepSeek） | `search-found-han` | ● 主力 | 30/37 |
| 网页搜索·嫣然天使（DeepSeek） | `search-found-smile` | ● 主力 | 29/33 |
| 网页搜索·江苏残联（DeepSeek） | `search-cdpf-js` | ● 主力 | 27/71 |
| 网页搜索·上海民政（DeepSeek） | `search-mca-sh` | ● 主力 | 25/61 |
| 网页搜索·安徽民政（DeepSeek） | `search-mca-anhui` | ● 主力 | 24/65 |
| 网页搜索·河北民政（DeepSeek） | `search-mca-hebei` | ● 主力 | 24/55 |
| 网页搜索·山西民政（DeepSeek） | `search-mca-shanxi` | ● 主力 | 22/76 |
| 网页搜索·湖北民政（DeepSeek） | `search-mca-hub` | ● 主力 | 21/63 |
| 网页搜索·云南民政（DeepSeek） | `search-mca-yunnan` | ● 主力 | 21/64 |
| 网页搜索·财政部（DeepSeek） | `search-mof` | ● 主力 | 21/54 |
| 网页搜索·北师大中国公益研究院（DeepSeek） | `search-think-tass` | ● 主力 | 21/42 |
| 网页搜索·上海残联（DeepSeek） | `search-cdpf-sh` | ● 主力 | 20/68 |
| 网页搜索·UNHCR 难民署（DeepSeek） | `search-intl-unhcr` | ● 主力 | 20/34 |
| 网页搜索·江西民政（DeepSeek） | `search-mca-jiangxi` | ● 主力 | 20/50 |
| 网页搜索·山东残联（DeepSeek） | `search-cdpf-sd` | ● 主力 | 19/69 |
| 网页搜索·大病与罕见病儿童救助 | `search-child-medical` | ● 主力 | 18/31 |
| 网页搜索·甘肃民政（DeepSeek） | `search-mca-gansu` | ● 主力 | 18/48 |
| 网页搜索·海南民政（DeepSeek） | `search-mca-hainan` | ● 主力 | 17/54 |
| 网页搜索·南都观察/报告（DeepSeek） | `search-think-nandu` | ● 主力 | 17/35 |
| 网页搜索·江苏共青团（DeepSeek） | `search-gqt-js` | ● 主力 | 16/62 |
| 网页搜索·北京残联（DeepSeek） | `search-cdpf-bj` | ● 主力 | 15/56 |
| 网页搜索·湖北残联（DeepSeek） | `search-cdpf-hub` | ● 主力 | 15/66 |
| 网页搜索·21世纪教育研究院（DeepSeek） | `search-think-21edu` | ● 主力 | 15/41 |
| 网页搜索·社科院社会政策（DeepSeek） | `search-think-cass` | ● 主力 | 15/52 |
| 网页搜索·山东妇联（DeepSeek） | `search-women-sd` | ● 主力 | 15/46 |
| 网页搜索·浙江妇联（DeepSeek） | `search-women-zj` | ● 主力 | 15/68 |
| 网页搜索·浙江共青团（DeepSeek） | `search-gqt-zj` | ● 主力 | 14/69 |
| 网页搜索·慈善公益报（DeepSeek） | `search-media-charity` | ● 主力 | 14/28 |
| 网页搜索·司法部（DeepSeek） | `search-moj` | ● 主力 | 14/70 |
| 网页搜索·江苏妇联（DeepSeek） | `search-women-js` | ● 主力 | 14/65 |
| 网页搜索·慈善信息公开（DeepSeek） | `search-data-charity` | ● 主力 | 13/33 |
| 网页搜索·法律援助（DeepSeek） | `search-judicial-legalaid` | ● 主力 | 13/46 |
| 网页搜索·宁夏民政（DeepSeek） | `search-mca-ningxia` | ● 主力 | 13/44 |
| 网页搜索·中国社会报（DeepSeek） | `search-media-chinasocial` | ● 主力 | 13/38 |
| 网页搜索·免费午餐（DeepSeek） | `search-found-free` | ● 主力 | 12/30 |
| 网页搜索·性别平等（DeepSeek） | `search-gender` | ● 主力 | 11/83 |
| 网页搜索·上海共青团（DeepSeek） | `search-gqt-sh` | ● 主力 | 11/54 |
| 网页搜索·最高检未检（DeepSeek） | `search-judicial-spp` | ● 主力 | 11/47 |
| 网页搜索·公益时报（DeepSeek） | `search-media-gongyi` | ● 主力 | 11/18 |
| 网页搜索·UN Women 妇女署（DeepSeek） | `search-intl-unwomen` | ● 主力 | 10/33 |
| 网页搜索·最高法典型案例（DeepSeek） | `search-judicial-spc` | ● 主力 | 10/79 |
| 网页搜索·人社部（DeepSeek） | `search-mohrss` | ● 主力 | 10/65 |
| 网页搜索·北大社会研究中心（DeepSeek） | `search-think-pku` | ● 主力 | 10/41 |
| 网页搜索·清华公益慈善研究院（DeepSeek） | `search-think-tsinghua` | ● 主力 | 10/30 |
| 网页搜索·儿童心理服务 | `search-child-mental` | ● 主力 | 9/29 |
| 网页搜索·湖北共青团（DeepSeek） | `search-gqt-hub` | ● 主力 | 9/68 |
| 网页搜索·真爱梦想（DeepSeek） | `search-found-dream` | ● 主力 | 8/25 |
| 网页搜索·北京共青团（DeepSeek） | `search-gqt-bj` | ● 主力 | 8/69 |
| 网页搜索·公安部（DeepSeek） | `search-mps` | ● 主力 | 8/67 |
| 网页搜索·湖北妇联（DeepSeek） | `search-women-hub` | ● 主力 | 8/61 |
| 网页搜索·上海妇联（DeepSeek） | `search-women-sh` | ● 主力 | 8/52 |
| 网页搜索·UNDP 开发计划署（DeepSeek） | `search-intl-undp` | ● 主力 | 6/45 |
| 网页搜索·WHO 世界卫生组织（DeepSeek） | `search-intl-who` | ● 主力 | 6/38 |
| 网页搜索·财新公益（DeepSeek） | `search-media-caixin` | ● 主力 | 6/22 |
| 网页搜索·生态环境（DeepSeek） | `search-environment` | ● 主力 | 5/90 |
| 网页搜索·山东共青团（DeepSeek） | `search-gqt-sd` | ● 主力 | 5/55 |
| 网页搜索·北京妇联（DeepSeek） | `search-women-bj` | ● 主力 | 5/63 |

#### 网页列表源（主力 39 个，入池 465）

| 名称 | ID | 状态 | 入池/产出 |
| :--- | :--- | :--- | :--- |
| [公益时报 · 公益资讯](http://www.gongyishibao.com/html/gongyizixun/list.html) | `gongyi-times` | ● 主力 | 31/85 |
| [壹基金·最新活动](https://onefoundation.cn/news/) | `web-onefoundation-news` | ● 主力 | 25/32 |
| [福建省民政厅·通知公告](https://mzt.fujian.gov.cn/gk/tzgg/) | `web-probe-mzt-fujian-gov-cn-316374` | ● 主力 | 21/60 |
| [民政部·地方动态](https://www.mca.gov.cn/n152/n168/index.html) | `web-mca-local` | ● 主力 | 19/34 |
| [河南省民政厅·公告公示](https://mzt.henan.gov.cn/xxgk/xxgkml/gggs/) | `web-probe-mzt-henan-gov-cn-78ddfb` | ● 主力 | 19/24 |
| [广西壮族自治区民政厅·民政要闻](http://mzt.gxzf.gov.cn/zwdt/mzyw/) | `web-probe-mzt-gxzf-gov-cn-ec82f3` | ● 主力 | 18/30 |
| [公益时报·要闻](http://www.gongyishibao.com/html/yaowen/list.html) | `web-gongyishibao-yaowen` | ● 主力 | 15/21 |
| [广东省民政厅·通知公告](https://smzt.gd.gov.cn/zwgk/tzgg/index.html) | `web-probe-smzt-gd-gov-cn-316374` | ● 主力 | 13/20 |
| [联合国儿童基金会全球·新闻稿](https://www.unicef.org/media/press-releases) | `web-unicef-global-press` | ● 主力 | 13/14 |
| [广东省民政厅·民政要闻](https://smzt.gd.gov.cn/mzzx/mzyw/index.html) | `web-probe-smzt-gd-gov-cn-ec82f3` | ● 主力 | 11/21 |
| [福建省民政厅·民政动态](https://mzt.fujian.gov.cn/yw/mzdt/) | `web-probe-mzt-fujian-gov-cn-64140c` | ● 主力 | 10/62 |
| [贵州省民政厅·通知公告](https://mzt.guizhou.gov.cn/xwzx/tzgg/) | `web-probe-mzt-guizhou-gov-cn-316374` | ● 主力 | 10/20 |
| [内蒙古自治区民政厅·通知公告](https://mzt.nmg.gov.cn/zwgk/tzgg/) | `web-probe-mzt-nmg-gov-cn-316374` | ● 主力 | 10/12 |
| [新疆维吾尔自治区民政厅·民政要闻](https://mzt.xinjiang.gov.cn/xjmzt/c112988/list.shtml) | `web-probe-mzt-xinjiang-gov-cn-ec82f3` | ● 主力 | 10/17 |
| [中国残联·残联要闻](https://www.cdpf.org.cn/xwzx/clyw2/index.htm) | `web-cdpf-news` | ● 主力 | 9/26 |
| [中国乡村发展基金会·机构新闻](http://cfpa.org.cn/news/news.aspx) | `web-cfpa-news` | ● 主力 | 9/12 |
| [贵州省民政厅·民政要闻](https://mzt.guizhou.gov.cn/xwzx/mzyw/) | `web-probe-mzt-guizhou-gov-cn-ec82f3` | ● 主力 | 9/52 |
| [湖南省民政厅·民政要闻](https://mzt.hunan.gov.cn/mzt/xxgk/gzdt/mzyw/index.html) | `web-probe-mzt-hunan-gov-cn-ec82f3` | ● 主力 | 9/20 |
| [中国妇女发展基金会·本会新闻](https://www.cwdf.org.cn/index.php?m=content&c=index&a=lists&catid=26) | `web-cwdf-news` | ● 主力 | 8/12 |
| [天津市民政局·通知公告](https://mz.tj.gov.cn/XWZX289/TZGG8519/) | `web-probe-mz-tj-gov-cn-316374` | ● 主力 | 8/15 |
| [中华慈善总会·通知公告](https://www.chinacharityfederation.org/n.html) | `web-probe-www-chinacharityfederation-org-316374` | ● 主力 | 8/10 |
| [中国网信网·政策法规](https://www.cac.gov.cn/wxzw/zcfg/A093703index_1.htm) | `web-cac-policy` | ● 主力 | 7/24 |
| [民政部·通知公告](https://www.mca.gov.cn/n152/n165/index.html) | `web-mca-notice` | ● 主力 | 7/20 |
| [内蒙古自治区残联·要闻](https://nmgcl.org.cn/) | `web-nmgcl-news` | ● 主力 | 7/12 |
| [国务院妇儿工委办·新闻](https://www.nwccw.gov.cn/news.shtml) | `web-nwccw-news` | ● 主力 | 7/20 |
| [民政部·民政要闻](https://www.mca.gov.cn/n152/n164/index.html) | `web-mca-civil-news` | ● 主力 | 6/24 |
| [广西壮族自治区民政厅·工作动态](http://mzt.gxzf.gov.cn/zwdt/gzdt/) | `web-probe-mzt-gxzf-gov-cn-a29c70` | ● 主力 | 6/29 |
| [陕西省民政厅·通知公告](https://mzt.shaanxi.gov.cn/xw/tzgg/) | `web-probe-mzt-shaanxi-gov-cn-316374` | ● 主力 | 6/18 |
| [西藏自治区民政厅·工作动态](https://mzt.xizang.gov.cn/zxzx/gzdt/) | `web-probe-mzt-xizang-gov-cn-a29c70` | ● 主力 | 6/15 |
| [最高人民检察院·新闻发布会](https://www.spp.gov.cn/xwfbh/wsfbt/) | `web-spp-wsfbt` | ● 主力 | 6/7 |
| [中国慈善联合会·联合会动态](https://charityalliance.org.cn/dl/771e1p1pcD.html) | `web-cca-federation-news` | ● 主力 | 5/21 |
| [中国儿童少年基金会·动态](https://www.cctf.org.cn/news/) | `web-cctf-news` | ● 主力 | 5/19 |
| [中国社会福利基金会·工作动态](https://www.cswef.org/cswef/news/index.html) | `web-cswef-news` | ● 主力 | 5/13 |
| [民政部·业务动态](https://www.mca.gov.cn/n152/n167/index.html) | `web-mca-business` | ● 主力 | 5/17 |
| [天津市民政局·民政要闻](https://mz.tj.gov.cn/XWZX289/MZXW1235/) | `web-probe-mz-tj-gov-cn-ec82f3` | ● 主力 | 5/15 |
| [黑龙江省民政厅·通知公告](https://mzt.hlj.gov.cn/mzt/c103774/public_list.shtml) | `web-probe-mzt-hlj-gov-cn-316374` | ● 主力 | 5/15 |
| [吉林省民政厅·通知公告](https://mzt.jl.gov.cn/xxgk_2643/tzgg/) | `web-probe-mzt-jl-gov-cn-316374` | ● 主力 | 5/20 |
| [陕西省民政厅·工作动态](https://mzt.shaanxi.gov.cn/xw/gzdt/) | `web-probe-mzt-shaanxi-gov-cn-a29c70` | ● 主力 | 5/15 |
| [澎湃新闻·时事](https://www.thepaper.cn/channel_25950) | `web-thepaper` | ● 主力 | 5/102 |

#### RSS 源（主力 5 个，入池 80）

| 名称 | ID | 状态 | 入池/产出 |
| :--- | :--- | :--- | :--- |
| [世界卫生组织·新闻](https://www.who.int/rss-feeds/news-english.xml) | `rss-who-news` | ● 主力 | 31/73 |
| [中国新闻网·滚动](https://www.chinanews.com.cn/rss/scroll-news.xml) | `rss-chinanews-scroll` | ● 主力 | 14/121 |
| 公益时报（微信公众号） | `wechat-gongyi-times` | ● 主力 | 10/30 |
| [GiveDirectly·动态](https://www.givedirectly.org/feed) | `rss-givedirectly` | ● 主力 | 8/13 |
| [Oxfam 乐施会·新闻](https://www.oxfam.org/en/rss.xml) | `rss-oxfam` | ● 主力 | 7/11 |

#### JSON / API 列表源（主力 1 个，入池 52）

| 名称 | ID | 状态 | 入池/产出 |
| :--- | :--- | :--- | :--- |
| [全国妇联·依法维权](https://www.women.org.cn/5524//5528/NewsList_0.json) | `json-women-wq` | ● 主力 | 11/21 |

#### 外部系统源（主力 1 个，入池 15）

| 名称 | ID | 状态 | 入池/产出 |
| :--- | :--- | :--- | :--- |
| 爱德传一基金 · 慈善纪事简报 | `email-amity-chuanyi` | ● 主力 | 15/26 |

<details>
<summary>其余信源：少量产出、零入池与已停用（97 个，展开查看）</summary>

| 类型 | 名称 | ID | 状态 | 入池/产出 |
| :--- | :--- | :--- | :--- | :--- |
| JSON / API 列表源 | 公众号 · 中国青少年发展基金会 | `wechat-oa-cydf` | ⛔ 停用 | 6/16 |
| JSON / API 列表源 | 公众号 · 中国儿童少年基金会 | `wechat-oa-cctf` | ⛔ 停用 | 5/10 |
| JSON / API 列表源 | 公众号 · 中国乡村发展基金会 | `wechat-oa-cfrf` | ⛔ 停用 | 5/10 |
| JSON / API 列表源 | 公众号 · 救助儿童会北京代表处 | `wechat-oa-save-the-children` | ⛔ 停用 | 5/10 |
| JSON / API 列表源 | 微博 · 事实无人抚养儿童 | `weibo-search-unattended-children` | ⛔ 停用 | 5/6 |
| RSS 源 | [中国政府网·政策推送](https://www.gov.cn/pushinfo/v150203/rss.xml) | `rss-gov-cn` | · 少量 | 4/4 |
| RSS 源 | [Stanford Social Innovation Review](https://ssir.org/site/rss_2.0) | `ssir` | · 少量 | 4/47 |
| 网页列表源 | [海南省残联·残联快讯](https://www.hidpf.org.cn/) | `web-hidpf-news` | · 少量 | 4/6 |
| 网页列表源 | [教育部·工作动态](http://www.moe.gov.cn/jyb_xwfb/gzdt_gzdt/) | `web-moe-news` | · 少量 | 4/41 |
| 网页列表源 | [重庆市民政局·通知公告](https://mzj.cq.gov.cn/zwgk_218/zfxxgkml/tzgg/) | `web-probe-mzj-cq-gov-cn-316374` | · 少量 | 4/10 |
| 网页列表源 | [河南省民政厅·民政要闻](https://mzt.henan.gov.cn/xxgk/mzyw/) | `web-probe-mzt-henan-gov-cn-ec82f3` | · 少量 | 4/12 |
| 网页列表源 | [黑龙江省民政厅·工作动态](https://mzt.hlj.gov.cn/mzt/c103766/public_list.shtml) | `web-probe-mzt-hlj-gov-cn-a29c70` | · 少量 | 4/26 |
| 网页列表源 | [青海省民政厅·通知公告](https://mzt.qinghai.gov.cn/html/list-562.html) | `web-probe-mzt-qinghai-gov-cn-316374` | · 少量 | 4/9 |
| 网页列表源 | [青海省民政厅·新闻中心](https://mzt.qinghai.gov.cn/html/list-3.html) | `web-probe-mzt-qinghai-gov-cn-60e980` | · 少量 | 4/17 |
| 网页列表源 | [救助儿童会中国·最新进展](http://www.savethechildren.org.cn/news_0) | `web-savethechildren-cn` | · 少量 | 4/10 |
| 网页列表源 | [UNICEF Innocenti·儿童研究报告](https://www.unicef.org/innocenti/projects-and-reports) | `web-unicef-innocenti-reports` | · 少量 | 4/6 |
| 网页列表源 | [世界银行·儿童](https://www.worldbank.org/en/news/all?qterm=children&lang_exact=English) | `web-worldbank` | · 少量 | 4/8 |
| JSON / API 列表源 | [基金会中心网·动态](https://api.foundationcenter.org.cn/api/HomeAPI/News) | `json-foundation-center-fti` | · 少量 | 3/12 |
| 搜索源（DeepSeek Search） | 网页搜索·世界银行（DeepSeek） | `search-intl-worldbank` | · 少量 | 3/34 |
| 网页列表源 | [安徽省残联·市县动态](https://www.ahdpf.org.cn/xwzx/sxdt/index.html) | `web-ahdpf-sxdt` | · 少量 | 3/9 |
| 网页列表源 | [广西壮族自治区残联·要闻](http://www.gxdpf.org.cn/) | `web-gxdpf-news` | · 少量 | 3/11 |
| 网页列表源 | [生态环境部·政策文件](http://www.mee.gov.cn/zcwj/) | `web-mee-zcwj` | · 少量 | 3/36 |
| 网页列表源 | [应急管理部·应急要闻](https://www.mem.gov.cn/xw/yjyw/) | `web-mem-emergency-news` | · 少量 | 3/16 |
| 网页列表源 | [南都公益基金会·机构动态](https://www.naradafoundation.org/category/32) | `web-nandu-org-news` | · 少量 | 3/13 |
| 网页列表源 | [新疆维吾尔自治区民政厅·通知公告](https://mzt.xinjiang.gov.cn/xjmzt/c112990/list.shtml) | `web-probe-mzt-xinjiang-gov-cn-316374` | · 少量 | 3/19 |
| 网页列表源 | [西藏自治区民政厅·通知公告](https://mzt.xizang.gov.cn/zxzx/tzgg/) | `web-probe-mzt-xizang-gov-cn-316374` | · 少量 | 3/17 |
| JSON / API 列表源 | 小红书 · 公益项目 | `xhs-search-charity-project` | ⛔ 停用 | 3/32 |
| 搜索源（DeepSeek Search） | 网页搜索·关心下一代工作 | `search-guangongwei` | · 少量 | 2/37 |
| 网页列表源 | [国家疾控局](https://www.ndcpa.gov.cn/jbkzzx/c100008/common/list.html) | `web-ndcpa` | · 少量 | 2/27 |
| 网页列表源 | [辽宁省民政厅·图片新闻](https://mzt.ln.gov.cn/mzt/tpxw/index.shtml) | `web-probe-mzt-ln-gov-cn-0283c5` | · 少量 | 2/10 |
| 网页列表源 | [浙江省民政厅·社会组织年检公告](https://mzt.zj.gov.cn/col/col1648467/index.html) | `web-probe-mzt-zj-gov-cn-5b3418` | · 少量 | 2/15 |
| 网页列表源 | [今日热榜·新闻](https://tophub.today/c/news) | `web-tophub-news` | · 少量 | 2/9 |
| JSON / API 列表源 | 公众号 · 中华儿慈会 | `wechat-oa-ccafc` | ⛔ 停用 | 2/10 |
| JSON / API 列表源 | 公众号 · 中国慈善联合会 | `wechat-oa-charity-alliance` | ⛔ 停用 | 2/10 |
| JSON / API 列表源 | 公众号 · 联合国儿童基金会 | `wechat-oa-unicef` | ⛔ 停用 | 2/10 |
| JSON / API 列表源 | 微博 · 困境儿童资助 | `weibo-search-vulnerable-children` | ⛔ 停用 | 2/8 |
| 网页列表源 | [中国发展简报](https://www.chinadevelopmentbrief.org.cn/) | `china-development-brief` | · 少量 | 1/10 |
| RSS 源 | [中国新闻网·教育](https://www.chinanews.com.cn/rss/edu.xml) | `rss-chinanews-edu` | · 少量 | 1/3 |
| RSS 源 | [中国新闻网·健康](https://www.chinanews.com.cn/rss/health.xml) | `rss-chinanews-health` | · 少量 | 1/7 |
| 搜索源（DeepSeek Search） | 网页搜索·财政民生支出（DeepSeek） | `search-data-finance` | · 少量 | 1/44 |
| 网页列表源 | [安徽省残联·残联要闻](https://www.ahdpf.org.cn/xwzx/gzdt/index.html) | `web-ahdpf-gzdt` | · 少量 | 1/9 |
| 网页列表源 | [中国人口福利基金会·新闻动态](https://www.cpwf.org.cn/category/13) | `web-cpwf-news` | · 少量 | 1/9 |
| 网页列表源 | [中国红十字基金会·新闻中心](https://www.crcf.org.cn/) | `web-crcf-news` | · 少量 | 1/10 |
| 网页列表源 | [辽宁省残联·新闻频道](https://www.lncl.org.cn/) | `web-lncl-xwpd` | · 少量 | 1/9 |
| 网页列表源 | [吉林省民政厅·民政要闻](https://mzt.jl.gov.cn/mzyw_74261/) | `web-probe-mzt-jl-gov-cn-ec82f3` | · 少量 | 1/18 |
| 网页列表源 | [内蒙古自治区民政厅·工作动态](https://mzt.nmg.gov.cn/ywdt/gzdt/) | `web-probe-mzt-nmg-gov-cn-a29c70` | · 少量 | 1/14 |
| 网页列表源 | [四川省民政厅·通知公告](https://mzt.sc.gov.cn/scmzt/gsgg/article_list.shtml) | `web-probe-mzt-sc-gov-cn-316374` | · 少量 | 1/8 |
| JSON / API 列表源 | 公众号 · 中国红十字会 | `wechat-oa-red-cross` | ⛔ 停用 | 1/10 |
| 外部系统源 | AmCham China Events 邮件 | `email-amcham-events` | △ 零入池 | 0/16 |
| RSS 源 | [联合国新闻（中文）](https://news.un.org/feed/subscribe/zh/news/all/rss.xml) | `rss-un-news` | ⛔ 停用 | 0/0 |
| 搜索源（DeepSeek Search） | 网页搜索·国家统计局数据（DeepSeek） | `search-data-stats` | △ 零入池 | 0/40 |
| 搜索源（DeepSeek Search） | 网页搜索·市场监管总局（DeepSeek） | `search-samr` | △ 零入池 | 0/68 |
| 网页列表源 | [财新网](https://www.caixin.com/) | `web-caixin` | △ 零入池 | 0/43 |
| 网页列表源 | [中国发展研究基金会](https://www.cdrf.org.cn/zxdt/index.htm) | `web-cdrf` | △ 零入池 | 0/10 |
| 网页列表源 | [中国基金会发展论坛·行业资讯](https://www.cfforum.org.cn/category/6) | `web-cfforum-news` | ○ 未产出 | 0/0 |
| 网页列表源 | [中国妇女报](https://www.cnwomen.com.cn/) | `web-cnwomen-news` | △ 零入池 | 0/5 |
| 网页列表源 | [最高人民法院·新闻](http://www.court.gov.cn/zixun/gengduo/24.html) | `web-court-spc-news` | △ 零入池 | 0/31 |
| 网页列表源 | [中国青年报](http://news.cyol.com/) | `web-cyol-news` | ○ 未产出 | 0/0 |
| 网页列表源 | [共青团中央·工作动态](https://qnzz.youth.cn/gzdt/) | `web-gqt-gzdt` | △ 零入池 | 0/8 |
| 网页列表源 | [北京新阳光慈善基金会·新闻动态](https://www.isun.org.cn/index.php?m=content&c=index&a=lists&catid=23) | `web-isun-news` | △ 零入池 | 0/10 |
| 网页列表源 | [中国教育报](http://paper.jyb.cn/) | `web-jyb` | △ 零入池 | 0/18 |
| 网页列表源 | [生态环境部·环保要闻](http://www.mee.gov.cn/ywdt/hjywnews/) | `web-mee-hjyw` | △ 零入池 | 0/21 |
| 网页列表源 | [生态环境部·新闻发布](http://www.mee.gov.cn/ywdt/xwfb/) | `web-mee-xwfb` | △ 零入池 | 0/8 |
| 网页列表源 | [国家发展改革委·通知公告](https://www.ndrc.gov.cn/xwdt/tzgg/) | `web-ndrc-xwfb` | ○ 未产出 | 0/0 |
| 网页列表源 | [全国人大·立法动态](http://www.npc.gov.cn/npc/c2/c183/c199/) | `web-npc-lfdt` | △ 零入池 | 0/7 |
| 网页列表源 | [辽宁省民政厅·社会组织评估等级结果公告](https://mzt.ln.gov.cn/mzt/shzzpt/pgzl/shzzpgdjjggg/index.shtml) | `web-probe-mzt-ln-gov-cn-163f7d` | △ 零入池 | 0/20 |
| 网页列表源 | [四川省民政厅·工作动态](https://mzt.sc.gov.cn/scmzt/gzdt/article_list.shtml) | `web-probe-mzt-sc-gov-cn-a29c70` | △ 零入池 | 0/19 |
| 网页列表源 | [中华环境保护基金会·基金会动态](https://www.cepf.org.cn/jjhdt/) | `web-probe-www-cepf-org-cn-d065ac` | ⛔ 停用 | 0/0 |
| 网页列表源 | [中国宋庆龄基金会·通知公告](https://www.sclf.org/tzgg/) | `web-probe-www-sclf-org-316374` | ⛔ 停用 | 0/0 |
| 网页列表源 | [国家统计局·通知公告](https://www.stats.gov.cn/xw/tjxw/tzgg/) | `web-stats-tzgg` | ○ 未产出 | 0/0 |
| 网页列表源 | [救助儿童会国际·全球新闻](https://www.savethechildren.net/news/) | `web-stc-global-news` | ⛔ 停用 | 0/0 |
| 网页列表源 | [山西省残联·工作动态](http://www.sxdpf.org.cn/) | `web-sxdpf-gzdt` | △ 零入池 | 0/9 |
| 网页列表源 | [联合国教科文组织](https://www.unesco.org/zh) | `web-unesco` | △ 零入池 | 0/7 |
| 网页列表源 | [联合国儿童基金会中国·新闻资讯](https://www.unicef.cn/press-centre) | `web-unicef-cn-press` | ⛔ 停用 | 0/0 |
| 网页列表源 | [心和基金会·心和动态](https://www.xinhe.org.cn/home/info/index/cate_id/21.html) | `web-xinhe-news` | △ 零入池 | 0/4 |
| 网页列表源 | [新华网·时政联播](http://www.news.cn/politics/szlb/index.html) | `web-xinhua-szlb` | △ 零入池 | 0/1 |
| 网页列表源 | [新疆维吾尔自治区残联·要闻](http://www.xjdpf.org.cn/) | `web-xjdpf-news` | △ 零入池 | 0/4 |
| RSS 源 | 中国美国商会 AmCham China（微信公众号） | `wechat-amcham-china` | △ 零入池 | 0/15 |
| RSS 源 | 字节跳动公益 | `wechat-bytedance-charity` | ⛔ 停用 | 0/0 |
| RSS 源 | 中国慈善联合会 | `wechat-china-charity-alliance` | ⛔ 停用 | 0/0 |
| RSS 源 | 中国儿童福利 | `wechat-china-child-welfare` | ⛔ 停用 | 0/0 |
| RSS 源 | 中国儿童福利协会 | `wechat-china-child-welfare-assoc` | ⛔ 停用 | 0/0 |
| RSS 源 | 中国儿童中心 | `wechat-china-childrens-center` | ⛔ 停用 | 0/0 |
| RSS 源 | 中国志愿 | `wechat-china-volunteer` | ⛔ 停用 | 0/0 |
| RSS 源 | 广州儿童福利和权益保护 | `wechat-guangzhou-child-welfare` | ⛔ 停用 | 0/0 |
| RSS 源 | 广州社联困境儿童关爱中心 | `wechat-guangzhou-ngo-federation-child` | ⛔ 停用 | 0/0 |
| RSS 源 | 韩红爱心慈善基金会 | `wechat-hanhong-foundation` | ⛔ 停用 | 0/0 |
| RSS 源 | 中国红十字会 | `wechat-red-cross-china` | ⛔ 停用 | 0/0 |
| RSS 源 | 中国红十字会总会备灾救灾中心 | `wechat-red-cross-disaster-center` | ⛔ 停用 | 0/0 |
| RSS 源 | 救助儿童会北京代表处 | `wechat-save-the-children-cn` | ⛔ 停用 | 0/0 |
| RSS 源 | 社会救灾 | `wechat-social-disaster-relief` | ⛔ 停用 | 0/0 |
| RSS 源 | 遂溪县教育发展促进会 | `wechat-suixi-education` | ⛔ 停用 | 0/0 |
| RSS 源 | 联合国儿童基金会 | `wechat-unicef` | ⛔ 停用 | 0/0 |
| JSON / API 列表源 | 微博 · 儿童侵害案件 | `weibo-search-child-abuse` | ⛔ 停用 | 0/0 |
| JSON / API 列表源 | 微博 · 一对一助学 | `weibo-search-student-aid` | ⛔ 停用 | 0/4 |
| JSON / API 列表源 | 小红书 · 养老助老 | `xhs-search-elderly-care` | ⛔ 停用 | 0/10 |
| JSON / API 列表源 | 小红书 · 乡村振兴 | `xhs-search-rural-revitalization` | ⛔ 停用 | 0/10 |

</details>

<details>
<summary>尝试过但失败 / 未接 / 否决的信源（17 项，展开查看）</summary>

> 与上面名单分开：这些**没有形成可用信源**。已接入但零入池的（评分拒绝）不在这里——它们在「其余信源」折叠块里标 △，按"留观察一周"纪律处理。

| 尝试对象 | 类型 | 结果 | 失败 / 受限原因 | 处置 |
| :--- | :--- | :--- | :--- | :--- |
| 国家卫健委数据 API | 数据接口 | 未接 | HTTP 412 拒接 | 只接新闻栏；改以 `search-mohw` 搜索源补齐 |
| 公安部数据 API | 数据接口 | 未接 | HTTP 521 拒接 | 只接新闻栏；改以 `search-mps` 搜索源补齐 |
| 农业农村部候选列表 | 网页 | 未接 | 核查时只返回 1 条 2026-01 旧内容 | 暂不启用，等其更新 |
| 国家卫健委妇幼健康页 | 网页 | 未接 | 生产网络触发反爬 | 暂不启用；优先找官方 RSS / JSON |
| 联合国儿童基金会中国·新闻页 | 网页 | 暂停 | 生产网络反爬，403 | `web-unicef-cn-press` 已 paused，待定 |
| UNGM（联合国采购） | 网页 | 否决 | 401 需登录 | 格式为招标公告，非新闻；按纪律不接 |
| cydf.org.cn（青基会官网） | 网页 | 否决 | 401 需登录 | 按纪律不接 |
| 腾讯公益 | 网页 | 否决 | 项目众筹平台，不是新闻列表 | 格式不对口，非技术问题 |
| EU Funding & Tenders | 网页 | 否决 | 资助机会库 / 公告 API | 提案应走官方订阅，不作新闻采集 |
| cepf.org.cn（中华环境保护基金会） | 网页 | 暂停 | HTTPS 证书错配：返回 baishan.com 的证书 | 已 paused；先 `openssl s_client` 看 CN 再定夺 |
| sclf.org（中国宋庆龄基金会） | 网页 | 暂停 | HTTPS 证书错配：返回别人域名的证书 | 已 paused；同上 |
| 中国发展简报 `/feed` | RSS | 地址失效 | 404 / 返回 HTML | 改走 `web_list`（`china-development-brief` 已接） |
| 公益时报 `/rss.xml` | RSS | 地址失效 | 404 / 返回 HTML | 改走 `web_list`（`gongyi-times` 已接） |
| UNICEF China RSS（M1 探测） | RSS | 探测被拒 | 403（测试出口被拦） | 不由此判为来源失效，不建议绕过 |
| 聚合热榜（tophub / NewsNow 等） | 热榜 | 已证伪 | 69% 链接被替换成搜索页，且拿不到发布时间 | 不采用 |
| Jina Reader（r.jina.ai） | 渲染服务 | 不可用 | 生产网络 DNS 落到 Facebook 段后超时，与凭证无关 | 弃用；改无头 chromium 渲染器（见下） |
| everyinfra 付费通道停服（16 个公众号 / 微博 / 小红书源） | 采集预算 | 停用 | 第三方通道不再续费，`enabled=false, health=paused`；停用前每轮都报额度耗尽，失败记录把真故障淹没在噪声里 | 恢复要改四处：`enabled` + `health` + `fail_count` + `budgets.everyinfra` 额度（只改 enabled 不会调度） |

**已修复的历史故障**（曾失败、现已正常，留在表外备查）：邮件源 `collect.py` 被 403（默认 UA 被边缘中间件拦）→ 换浏览器 UA；`deepseek-tools` 日预算 40 次烧光 → 调到 800（约 ¥4/天）；9 个 SPA 站点旧架构抓不到 → 无头 chromium 渲染器，7 解锁 / 2 否决。

</details>

