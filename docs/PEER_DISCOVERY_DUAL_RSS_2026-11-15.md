# YiHot · 邻域发现与 RSS 信源分层（2026-11-15）

> 本轮目标：扩大读者可探索的行业站，同时保留 RSS 作为**独立的技术信源**，不把全行业内容一股脑加入公益资讯。GitHub 配置变更 ≠ 腾讯云生产实际部署；不涉及费用承诺。

## 两个独立模块（不可混用）

| 模块 | 归属 | 目的 | 新增项目当前状态 |
|---|---|---|---|
| **邻域** | `industry/peers.ts` → `packages/backend/src/peers/refresh.ts` → `/peers` | 给普通读者逛别的行业网站；可查看站点与最新条目；邻域选稿不做本地 LLM 重分析 | **2 家 `enabled=true`**，目录刷新需部署后才触发 |
| **RSS 信源** | `industry/sources.json`（`kind=rss`） | 能独立预览、过滤、进入后续公益信源审核机制，通常可能触发下游付费分析 | **2 条 `enabled=false`，`isolated`**；仅登记，不产生线上抓取/费用 |

一个网站可以同时出现在两处，但**两处不应由彼此的启用状态自动牵动**。邻域中已存在另一种 `kind=peer` 的主内容来源（仅引用预先同步好的 `peer_items`）；未来若启用某站的 `kind=rss`，应先检查与 `kind=peer` 的跨渠道重复，不把同篇稿计作独立信源或刷两遍模型。

## 这次确证并纳入的 2 家

| 站点 | 专业方向 | 网站 | **实际可读 RSS** | GitHub 状态 |
|---|---|---|---|---|
| URHOT | AI × 用户研究、HCI/UXR 方法 | https://huangzhenhao90.github.io/ai-ux-research-hot/ | https://huangzhenhao90.github.io/ai-ux-research-hot/rss.xml | 邻域启用，RSS 信源暂停 |
| 聚身之家（AIMAN.World） | 具身智能、机器人、研究与产业 | https://www.aiman.world/robot-hot/ | https://www.aiman.world/robot-hot/feed.xml | 邻域启用，RSS 信源暂停 |

**核验过程（2026-11-15）**：通过公开网页实时读取两个 Feed；URHOT 返回 2026-11-13 至 11-14 的研究/工具文章，聚身之家返回 2026-11-13 的机器人论文、产业条目，均有标题、可打开的条目 URL 与发布时间。URHOT 旧猜测路径 `/URHOT/`、`/URHOT/rss.xml` 为 HTTP 404；AIMAN `/robot-hot/rss.xml` 为 HTTP 404；两个站点的标准 `/api/v1/items` 不可假设存在。

修正：邻域 RSS 抓取器不再统一硬编码 `/feed.xml`。为 `PeerSite` 增加 `feedPath?`；`peerFeedUrl` 只允许本站同源的 HTTPS 绝对路径，不允许外部 URL、点段、查询、片段、双斜杠。

## 系统搜索但暂不纳入

| 候选 | 发现 | 处理 |
|---|---|---|
| [AIhot.space](https://aihot.space/) | https://aihot.space/rss.xml 实测有 2026-11-15 的每日 AI 精选 | 能用，但与已在邻域的 AI 快讯、日耕 AI 热点、XABC News 重叠较多；先不增加展示噪声 |
| [NewsIQ](https://newsiq.xyz/) | 公开站有内容，`/feed.xml` 和 `/rss.xml` 实测 HTTP 404 | 不加邻域自动同步；若日后公开规范 API/RSS 再复测 |
| [AIMAN.World 机器人产业数据库](https://www.aiman.world/developers) | 有公开机器人能力、关系、部件与证据 API 文档 | 数据库不同于新闻 RSS：不误当成同一条媒体源，后续单独讨论证据检索的授权和接口 |
| 其他 AIHOT forks | 既有 `industry/peers.ts` 已记录 2026-11-15 的批量 Fork/社区核查；大量 fork 无可用公开站点 | 不把有 GitHub 仓库直接视为可稳定阅读的公网信息站 |

## 如何验证、上线与回滚

1. 无网络测试：`node --test tests/peers.test.ts`（包括新源路径、两种 RSS 解析、双模块开关与去重一致性）；仓库现有 `npm run typecheck` / CI 不应受影响。
2. **邻域**：按正常部署流程更新 API/worker；检查 `/peers` 两张新卡片可点且站名直达原站；查看后台 `peer_status` 最新抓取是否 `ok`，点击最新条目是否有效；失败应独立隔离，不拖累报表。
3. **RSS**：两个 `rss-peer-*` 在后台仍应为关闭。将来有明确的跨域信息应用需求时，先单源 `Preview`，核对授权/栏目/日期/筛选/重复和 DeepSeek 成本，再决定是否在生产库手动启用。原有 `seed.ts` 的 `ON CONFLICT DO NOTHING` 不覆盖生产已有源。
4. 任何公开引用保留原始归属与链接。不要把“同一个 RSS 文章 + 邻域同步”当作两份独立证据。
5. 回滚：删除新 PeerSite 的两个对象及新 `rss-peer-*` 的两个 seed 条目，保留现有数据库历史记录；若需要可单独清理新增 peer_id 的缓存，但**不要删其他站记录**。修改 `peerFeedUrl` 向后兼容，原先的 `feed.xml` 仍照旧生效。

本次不添加第三方全文复制、自动付费抓取、UI 新栏目、额外常驻容器或腾讯云操作。
