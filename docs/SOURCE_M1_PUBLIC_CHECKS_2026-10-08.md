# M1 · 首批公益信源公开页面核查记录

> 2026-10-08 · 公开网页检索观察，**不是自动抓取/版权许可验证**。任何来源仍不得因本记录自动转为 `enabled=true`。第一轮目标 5–10 个，现记录部分可核实发现与待验证项。

| 候选 | 页面发现 | 暂定 status | 未解决的关键问题 |
|---|---|---|---|
| 中国慈善联合会 · 联合会动态 | https://www.charityalliance.org.cn/dl/771e1p1pcD.html；官方栏目展示文章标题及发布日期 | `PUBLIC_PAGE_DISCOVERED` | YiHot 现有 CSS 选择器是否仍匹配；权限、正文链接与原文日期；发布者是否和其他栏目重复 |
| 中国慈善联合会 · 通知公告 | https://www.charityalliance.org.cn/dl/AictxNMq0M.html；官方有独立通知栏目 | `PUBLIC_PAGE_DISCOVERED` | 是否应设立独立逻辑 Source；“通知”是否进入日报，还是仅保存到机构资料/专题 |
| UNICEF 中国 · 新闻资讯 | https://www.unicef.cn/press-centre；有按时间列出的新闻稿 | `PUBLIC_PAGE_DISCOVERED` | 可用 RSS/API、加载更多机制、发布日期、站点条款；需新增专用 web_list 才能预览 |
| 中国发展简报 | https://www.chinadevelopmentbrief.org.cn/；官网展示日期明确的公益资讯 | `PUBLIC_PAGE_DISCOVERED` | NewsMail 记录 `/feed`，但尚未通过 XML 验证；不得擅自把官网当成 RSS |
| 南都公益基金会 | NewsMail 候选 `https://www.naradafoundation.org/feed`，YiHot 已有网页栏目配置 | `FEED_NOT_VALIDATED` | RSS 请求/解析、robots/条款、与现有 web_list 是否重复；选择单一首选路由 |
| Oxfam International | YiHot 当前配置 `https://www.oxfam.org/en/rss.xml` | `FEED_NOT_PARSED` | 在公开网页浏览通道返回 RSS content-type，但通道无法解析 RSS 内容；需要 YiHot 的真实 RSS preview |
| 民政部 · 民政要闻 | YiHot 已有栏目 `https://www.mca.gov.cn/n152/n164/index.html` | `COLLECTOR_NOT_TESTED` | 网站可达性、CSS 选择器、官方发布日期、允许采集范围 |
| 基金会中心网 · 动态 | YiHot 已有 JSON 入口 `https://api.foundationcenter.org.cn/api/HomeAPI/News` | `COLLECTOR_NOT_TESTED` | API 使用许可、是否仍返回预期 JSON、内容本身属于原创还是转载 |
| 公益时报 | NewsMail 候选 `http://www.gongyishibao.com/rss.xml` | `FEED_NOT_VALIDATED` | 未验证 URL 当前可用、是否真正 RSS、新闻发布者归属 |
| 公益微信公众号 | 尚未选定可确认原始 ID 且许可清楚的两个公众号 | `NEEDS_CANDIDATE` | 先从机构 Channels 选真实账号、查可授权的 RSS/API 路由、区分热度信号与报道源 |

## 验收门槛与运行说明

页面发现 ≠ HTTP 稳定性 ≠ 合法自动采集 ≠ 正文采集成功 ≠ 内容事实可信。下步经 YiHot 后台 `/admin/sources/new` 的 preview/试抓，逐条记录：
- preview 时间，候选数量与三篇原文 URL；
- 三条文章发布日期的真实性和时区、抓取是否混入导航链接；
- 内容来自机构自身还是转载（`first_party` 对**特定报道**可能不同）；
- 来源健康、实际许可/使用条件/转载限制、预算与后备方案；
- 是否与 YiHot 已有 seed 重复、是否导致同事件热度重复计数。

检查日期为 **2026-10-08**；历史合规登记在 `data/source-registry/imports/charity-2026-10-08.json`，并非即时授权。**不得自动启用上面任何新源**。生产服务器端还未执行 preview，不应在 README 中写为已验收通过。
