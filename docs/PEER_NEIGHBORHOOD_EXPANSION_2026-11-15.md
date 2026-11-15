# 邻域系统扩展 · 多行业公开站点调查（2026-11-15）

> 目标是**发现更多值得浏览的行业站**，不是用域名数量证明覆盖面。一次公开网站可访问的核验，只说明该时点可用；不是长期可用性、内容质量和原始事实的背书。

## 发现渠道与基线

- [AIHOT 作品展示](https://github.com/KKKKhazix/AIHOT/discussions/categories/show-and-tell)：登记站点、行业领域与实际演示。
- [AIHOT 站点登记 #306](https://github.com/KKKKhazix/AIHOT/discussions/306)：部分站点只在本地运行，不能因为登记了就收录。
- [社区改造清单 #284](https://github.com/KKKKhazix/AIHOT/discussions/284)：已归集的 16 家作为**去重基线**，避免再次添加 PsyHOT、青砚、RoboHot 等。
- 公开搜索：`AIHOT + 行业热点站 + RSS`、`AutoHot`、`REHOT`、`KernelHOT`、`AI4SciHOT`、`3D 技术雷达` 等；逐个核对网站和可用订阅，不使用猜测 URL。
- GitHub `main` 基线：18 个邻域登记（含 1 家 disabled/none）；174 条种子信源（含上一轮两条关闭 RSS）。

## 新增 7 家：3 家真实可同步 + 4 家仅浏览

| id | 站点 | 领域 | 官网/专题 | 真实 RSS（不存在则留空） | 模式 |
|---|---|---|---|---|---|
| `autohot` | AutoHot | 汽车产业、交通政策 | https://www.autohot.top/ | https://www.autohot.top/feed.xml | rss |
| `huifangyun` | 汇房云资讯 | 住房物业、社区治理 | https://info.huifangyun.com/ | https://info.huifangyun.com/feed.xml | rss |
| `fai-lab` | FAI 实验室 | AI 设计工具/应用，兼通用 AI | https://fai.fashion/ | https://fai.fashion/feed.xml | rss |
| `ai4scihot` | AI4SciHOT | 材料、化学、AI for Science | https://ai4scihot.8-220-189-127.sslip.io/ai4scihot | **无可读取 RSS**；已测试目录下 `/feed.xml` 返回 403 | link |
| `horizon-uu` | 发射窗口 | 商业航天、AI 芯片和机器人 | https://www.uuaihub.com/horizon | 专题下 `/feed.xml`、`/rss.xml` 不可用 | link |
| `fengxiang-demo` | 风向 | 企业服务、SaaS 行业选题 | https://fightkk7.github.io/fengxiang/ | `/feed.xml` 404，**公开网页仅静态演示** | link |
| `newsiq` | NewsIQ / 讯析 | 新闻事件分析与跨来源对照 | https://newsiq.xyz/ | `/feed.xml`、`/rss.xml` 为 404 | link |

2026-11-15 用实时网页读取核验：AutoHot、汇房云、FAI 的主页和 `/feed.xml` 均返回有标题/发布时间/可回溯 URL 的内容。AI4SciHOT 的近期科研网页可读，但 RSS 目前没有可用证据；其 `sslip.io` 域名包含 IP 地址，**稳定性和长期域名尚待检查**。「发射窗口」现在公开的是 UU AI Hub 的专题频道，不是声称已公开上线的独立 AIHOT 实例。「风向」官方自述公开版本不连接实时数据库。NewsIQ 当前可打开网页但不能走 RSS，均须如实显示。

### 不纳入的候选

- `https://baoxian.news/`：本轮 DNS 解析失败。
- `KernelHOT`：找到了 [开源仓库](https://github.com/lindoo67/KERNELHOT) 和介绍文章，但作者的“在线站点”链接实际指回 GitHub 仓库；未经证明有可访问的单独网页，不进邻域。
- `3D 技术雷达`：[项目介绍](https://jishuzhan.net/article/2117420419117219842) 有实践细节，但没确认公开可读的独立站点链接；只做候选。
- `https://aihot.space/rss.xml`：虽然可读，但与邻域现有泛 AI 快讯、繁中 AI、XABC 等重复多，先不扩大同质栏目。
- 不用搜索到的 fork 数量冒充“运行站点数”；模板仓库存在不代表拥有更新的公开内容。

## 两个模块严格分开

### A. 邻域（给访客）

事实源 `industry/peers.ts`。新增 `strategy="link"` 表示**只给公开入口，无定时抓取、无数据同步**。`packages/backend/src/peers/refresh.ts` 遇到 link 立即跳过，并且不写 `peer_status`；`directory.ts` 用 `browseOnly` 返回专门卡片，页面显示「仅浏览 · 不自动同步文章」，而非「尚未同步」或 0 条内容的误导信息。属于实际 RSS 站的邻域条目仍用 `rss` 策略，直接读取对方已精选数据，不调用 YiHot 的大模型；读取结果为对方发布的观点，不能当独立证据来源。

### B. RSS 信源（为有明确用途的采集做准备）

事实源 `industry/sources.json`。本轮仅预置三个 **`enabled=false`** 的 `kind=rss` 来源：`rss-peer-autohot`、`rss-peer-huifangyun`、`rss-peer-fai-lab`；`participation_mode=isolated`、不抓全文、初始回溯上限 4、24 小时轮询预置但**停用时不会轮询**。与邻域的同步开关独立。

以后要真正启用 RSS 的前置核查：站点许可/版权、后台 Preview、领域关键词误报率、与邻域 `kind=peer` 数据的同原文跨通道重复、模型调用与收据预算、发布权限和用户实际需求。启用不代表应自动发到公开的公益动态。除非真实需要，不推荐打开跨行业 RSS 的下游新闻分析。

## 验收与回滚

- `node --test tests/peers.test.ts` 验证七家配置、三条 RSS 与仅浏览策略、拒绝模拟数据、XML 解析；`npm run typecheck` 和 CI 的 Docker/Web smoke 联合验证。
- 上线后 `/peers` 应显示可同步站的最新文章、四家「仅浏览」可打开首页；无 RSS 的站绝不能在 `peer_status` 形成新失败记录。
- 在数据库查 `peer_status` 及 `peer_items` 时只统计 `rss/api` 类型，不把 link-only 当同步失败。
- 回滚删 `industry/peers.ts` 新增 7 项、`industry/sources.json` 新增 3 项，恢复 `link` 处理和 UI 标签；不要批量清理旧历史、不要覆盖 WorkBuddy 同时更新的分组与其他站点。
- 不部署腾讯云、不操作真实账号或密钥、不动现有定时总闸，不为链接目录增加模型预算。
