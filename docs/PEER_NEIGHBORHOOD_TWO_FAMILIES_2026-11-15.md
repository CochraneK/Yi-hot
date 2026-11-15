# 邻域双层分类 · 同系邻域 / 其他邻域（2026-11-15）

## 目标与用户可见内容

在现有 `/peers` 邻域页面，首层只保留两个块：

- **同系邻域**：有明确同一精选框架或改编关系的站点。名称不提框架品牌，不宣称站点受 YiHot 管理或共同背书。
- **其他邻域**：独立开发的信息站、研究平台与工具；**未确认技术谱系的站也先放这里**，不武断断言其不是衍生项目。

这是**来源谱系**维度；原有 5 个行业方向（健康与生命、公共与环境、技术与安全、综合 AI 资讯、商业与职场）是另一个维度。页面结构为「两个一级块 → 每块内出现的行业组 → 原有站点卡片」，并将页头跳转缩减为两个入口，避免重复 5–10 个行业筛选标签。旧版只返回 `group` 的 API 客户端数据会落进「其他邻域」，既不丢站也不擅称同系。

## 唯一事实源与分类依据

- **唯一事实源**：`industry/peers.ts` → `PeerSite.family: "same" | "other"`（全部 39 家显式填写），与 `PeerSite.group` 分离；目录后端透传到 `PeerDirectoryEntry.family`。
- **目录页面**：`apps/web/app/features/peers/grouping.ts` 提供 `groupNeighborhoods`，在每一块内部复用原来的 `groupSites`；`PeerDirectoryPage.tsx` 依次显示两块。
- **初始 39 家快照**：24 家标 `same`，15 家标 `other`，其中 `yingxiao` 原本 `enabled=false`，**配置总数不等于页面可见数**。其他同步状态失败的站也可能不显示；页面只统计后端真正返回的可见条目数。
- **明确来源例子**：`urhot` [公开源码 README](https://github.com/huangzhenhao90/ai-ux-research-hot/blob/main/README.md) 明写精选流程改编自 AIHOT；`fai-lab` [官网介绍](https://fai.fashion/about) 和 [更新日志](https://fai.fashion/changelog) 明写由该开源框架驱动；`metrohot`、`dayacre` 等已有 GitHub Fork 审计证据详见 `industry/peers.ts` 开头注释。
- **谨慎边界**：`aiman-robot-hot` 属于 AIMAN.World 机器人产业数据库的一部分；`newsiq`、`ai-pulse-lab` 当前没有经过独立证实的同系开发证据。这些先归 `other`；这不是证明它们“不是同系”，如后续出现公开仓库、上游致谢或官方介绍再调整，不应单凭 URL 包含 HOT 推断。
- **内容与来源信用分开**：「同系」仅表示技术/编辑流程关联，不代表这些站的事实更可靠，也不意味着它们评分可横向比较；其他站也可能具有更高的专业证据价值。

## 实施、兼容与测试

- 未增加导航栏目、数据库列或迁移；不改动 `industry/sources.json`、`peer_items`、`peer_status`、抓取器、日报轮转或任何现有 RSS/模型开关。
- 后端保留原有 `/api/site/peers` 路由，增加可选响应字段 `family`；没有 `family` 时前端归 `other`，向后兼容旧 API 缓存。
- 测试：`apps/web/tests/peer-grouping.test.ts` 检查顺序、空块不显示、不同块相同行业的卡不重叠、旧字段缺失不丢卡；`tests/peers.test.ts` 检查 39 家都明确归类且独立于行业标签。合并前必须完整 GitHub Actions 通过。
- 部署后检查 `/peers` 的两块标题、两种跳转、桌面三列与手机单列；检查原站链接和“仅浏览”卡片。GitHub 合并不代表腾讯云部署完成。
- 回滚：删除 `family` 字段与 `groupNeighborhoods` 的使用，恢复 `PeerDirectoryPage.tsx` 使用 `groupSites` 的原界面；后端新增字段可保留兼容。无需清理数据库，不触碰其他 Agent 并发变更。

## 后续维护

新增邻域站必须同时填写 `family` 和 `group`，若无同系来源证明先设 `family="other"`。记录站点官方技术来源或仓库，并随时纠错；不要用同系/其他推断是否提供 RSS。**邻域是否同步**由 `PeerSite.strategy` 单独决定，**主新闻 RSS 是否采集**由 `industry/sources.json` 单独决定，三者保持正交。
