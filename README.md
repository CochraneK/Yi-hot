<p align="center">
  <img src="docs/assets/yihot-showcase-hero.svg" alt="Yi-Hot 公益信息雷达：多信源、内容整理与公益总报（产品示意图）" width="100%" />
</p>

<h1 align="center">Yi-Hot · 公益动态</h1>

<p align="center">
  <strong>让值得关注的公益信息，更容易被发现、理解与追踪。</strong><br>
  面向公益从业者、研究者及公共议题读者的独立信息聚合工具。
</p>

<p align="center">
  <a href="https://49.233.72.222/yihot/"><strong>浏览站点</strong></a> ·
  <a href="https://49.233.72.222/yihot/records">监管记录</a> ·
  <a href="https://49.233.72.222/yihot/subscribe">邮件订阅</a> ·
  <a href="docs/USER-GUIDE.md">使用指南</a>
</p>

> 基于 [AIHOT](https://github.com/KKKKhazix/AIHOT) 的 MIT 开源引擎，独立改造成公益领域版本；**不是 AIHOT 或救助儿童会的官方产品**。上图为产品示意，不是实时截图。

## 为什么做

公益资讯分散在政府公告、社会组织、行业媒体和不同订阅渠道中，重复阅读耗时且容易遗漏。Yi-Hot 把**公开信源发现 → 去重与 AI 整理 → 事件归并 → 主题阅读与总报**连接起来，让读者更快找到值得核实的原始信息。

## 它能做什么

| 阅读 | 理解 | 追踪与订阅 |
| --- | --- | --- |
| **[动态](https://49.233.72.222/yihot/all)**、[热点](https://49.233.72.222/yihot/hot)：从不同来源看同一事件，保留原文链接 | **[主题](https://49.233.72.222/yihot/topics)**：儿童权益等公益议题分类；AI 辅助筛选、摘要、归并 | **[周报](https://49.233.72.222/yihot/weekly)**、[月报](https://49.233.72.222/yihot/monthly)、[邮件订阅](https://49.233.72.222/yihot/subscribe)：定期回顾 |
| **[监管记录](https://49.233.72.222/yihot/records)**：民政部相关处罚、活动异常及失信公告独立查询 | **[公众号历史分析](https://49.233.72.222/about/dashboard)**：专题可视化，非实时新闻 | **[Agent 接入](https://49.233.72.222/yihot/agent)**：RSS、开放 API、MCP 与 Skill |

**具体的信源、13 类使命主题、处理流程和数据边界**，见 [完整产品说明](docs/PRODUCT_OVERVIEW.md)。

## Yi-Hot 与 AIHOT：同一个底座，不同的重点

- **继承**：采集与去重、AI 内容加工、事件与热点、报告、站点及后台框架。
- **公益定制**：儿童与社会组织议题、信源治理、领域规则、周期性公益总报。
- **新增扩展**：监管公告、邮件简报与订阅、候选信源和成本管理等；部分 AI 行业功能代码保留但已关闭。

源码级证据与上游版本差异见 [AIHOT × Yi-Hot 功能对照](docs/AIHOT_FEATURE_COMPARISON.md)。**fork 能追踪上游，不代表功能已自动对齐或腾讯云已部署最新代码。**

## 使用与部署

**读者**可以直接 [打开网站](https://49.233.72.222/yihot/)；**维护者**可访问 [后台](https://49.233.72.222/yihot/admin)（需要登录）。更多直达入口、监管专题和机器接口见 [站点地图](docs/SITE_MAP.md)。

**开发者**可克隆本仓库，按 [本地部署说明](docs/deploy.md) 配置 Node.js、Docker、数据库与测试凭据；生产部署与新机器交接见 [维护手册](MAINTENANCE.md)。不应把真实密钥、用户邮箱和数据库备份提交到公开仓库。

## 继续了解

| 想了解 | 从这里开始 |
| --- | --- |
| 如何使用、全部公开与后台入口 | [使用指南](docs/USER-GUIDE.md) · [站点地图](docs/SITE_MAP.md) |
| 功能、13 类主题、架构与数据治理 | [产品说明](docs/PRODUCT_OVERVIEW.md) · [技术架构](docs/architecture.md) |
| 信源质量、成本和运行 | [信源台账](docs/SOURCE_REGISTRY.md) · [成本分析](docs/COST.md) |
| 后续想法和真实取舍 | **[想法台账](docs/IDEAS.md)**（未做 / 已落地 / 不做） |
| 第一次接手、AIHOT 升级、其他行业站 | [冷启动交接](docs/PROJECT_CONTEXT.md) · [上游对照](docs/AIHOT_FEATURE_COMPARISON.md) · [同类项目](docs/RELATED_PROJECTS.md) |

---

**许可与归属：**[MIT LICENSE](LICENSE) · [NOTICE](NOTICE) · [第三方归属](THIRD_PARTY_NOTICES.md)。机构标识及来源内容各有权利人；本站呈现不代表获得机构背书。AI 摘要可能有误，重要事实应以原文和主管部门公告为准。更多问题可通过 [Issues](https://github.com/CochraneK/Yi-hot/issues) 反馈。
