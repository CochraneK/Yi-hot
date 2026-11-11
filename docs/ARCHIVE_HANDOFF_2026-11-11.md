# YiHot · 2026-11-11 归档交接与资产验收

> 用途：在两个旧聊天不可继续使用时保留**真正值得长期维护的结论、证据与交付状态**。2026-11-11 依据当前 GitHub main、原 PR / Issue 记录和文件库索引核验。此页是交接索引，不冒充生产实时运行报告。

## 先从哪里接手

1. [README](../README.md)：给读者的产品入口，少即是多。
2. [25 章完整运营与交接报告](YIHOT_OPERATIONS_HANDOFF_2026-11-09.md)：原始、最完整的可编辑 **Markdown 唯一文字主版本**，PR [#18](https://github.com/CochraneK/Yi-hot/pull/18) 于 11 月 9 日合并。不要为旧聊天重新生成另一份不同口径的“最全 MD”。
3. [生产证据核验](PRODUCTION_EVIDENCE_2026-11-10.md)：PR [#19](https://github.com/CochraneK/Yi-hot/pull/19) 于 11 月 10 日合并，区分 GitHub、运行态和实付。
4. [信源地图](SOURCE_ATLAS.md)、[逐源台账](SOURCE_REGISTRY.md)、[候选信源治理](SOURCE_GOVERNANCE_DESIGN.md)。
5. [深层维护](../MAINTENANCE.md)、[环境交接](PROJECT_CONTEXT.md)、[下一步](IDEAS.md)。

## 旧会话承诺与真实入库状态

| 旧会话的对象 | 已核实的仓库位置 / 记录 | 不可误称为已完成的部分 |
| :--- | :--- | :--- |
| 25 章 + A–D 附录完整报告 | `docs/YIHOT_OPERATIONS_HANDOFF_2026-11-09.md` · PR #18 已合并 | 这是正文唯一主版本，不等于所有 Word/PPT 已入库 |
| 11 月 10 日证据核验 | `docs/PRODUCTION_EVIDENCE_2026-11-10.md` · PR #19 已合并 | 仅代码与旧快照核对，不是实时供应商账单 |
| 原会话的 Word 文档 | 文件库曾保存 `YiHot_完整使用与维护报告_2026-11-09.docx` 等版本 | **当前 Git tree 没有该 DOCX 原件**；原始字节本轮未获得授权物化，不把同名再生文件冒称原件 |
| 原会话的 PPT 演示稿 | 文件库索引到 `YiHot_完整使用与维护培训演示_2026-11-09.pptx` 等多个版本 | **当前 Git tree 没有这份原件**；“40 页”是旧会话口径，尚未对原始 PPT 独立核对实际张数 |
| 11 月 10 日证据核验 PPT | 文件库可物化 `YiHot_运营与交接_证据核验版_2026-11-10.pptx`；本轮实测 **17 张幻灯片** | Git tree 原先未包含其原始 PPTX；它不是那份声称 40 页的完整训练稿 |
| PDF 交付 | Git 已有 `docs/pdf/YiHot_Complete.pdf`、README/MAINTENANCE PDF（由 Action 导出） | 这些 PDF **并非 25 章报告的同名正式 Word/PDF 原件**；不得混淆 |
| Image 2.5 的信源专题 PNG | 旧会话提及 `YiHot_sources_2026-10-23.png`；Git 有 10 月 23 日和 25 日的 SVG 图谱 | 本次未找回可以核验的 PNG 原始文件；**不要把 SVG 当成 Image 2.5 原图**，也不伪造模型出品说明 |
| DeepSeek Flash 迁移 | `tools/switch_deepseek_flash.py`、`tests/test_switch_deepseek_flash.py`、`docs/DEEPSEEK_FLASH_SWITCH_2026-10-21.md` | 原 PR #13 已随旧仓库迁移成 [当前仓库 Issue #13](https://github.com/CochraneK/Yi-hot/issues/13)；`/pull/13` 不是有效 PR 页面；脚本存在 ≠ 腾讯云已运行 |

### 关于成本的唯一可信结论

- 旧会话所述“累计 ¥11.50”和 DeepSeek 特定型号的单价都是**特定历史情境**，不能当今天成本。截止 2026-10-31 的最近 30 天记录：模型调用 49,904 次，估算 ¥66.02；网页搜索 2,407 次，估算 ¥12.04，合计 ¥78.06（人民币，见生产证据核验）。
- 历史线上曾用 `deepseek-chat`；仓库示例现在是 `deepseek-flash`、关闭思考，但后台覆盖优先于阶段变量，阶段变量又优先于默认值。AnyDoor 免费池发生故障回退也可能产生 DeepSeek 扣费。
- **要确认真实节省了多少钱**：先核对 `/admin/models` 实际各环节模型、`/admin/usage` 的 7/30 天回执，再核对服务商实付；不可只看示例环境变量。

### 信源图必须遵守的口径

- 历史生产快照 **2026-10-25 13:09 北京时间**：登记 210、启用 175、启用且累计有入池内容 150、主力（启用且入池 ≥5）113、累计入池 1,868。
- 按技术入口分别为 search 72、web_list 93、RSS 26、JSON/API 17、external 2；按入池贡献为 1,256、465、80、52、15。与 GitHub seed 153 不是同一总体。
- 发布主体（政府/机构/媒体）、技术入口（搜索/RSS/网页等）、治理状态（启用/有贡献/许可）必须正交。五层业务阅读导航与五类入口也不是一个概念。
- `SOURCE_ATLAS.md`、两张 10-25 SVG 和 README 已同步；**31 省/机构主体的真实去重覆盖缺口、10 月 25 日后的生产增量**仍未核验。

## 2026-11-11 新补齐：可编辑资产的 Git 级再生

本轮追加了一个**不依赖聊天附件**的再生流程：[GitHub Actions](../.github/workflows/export-yihot-archive.yml)（[本次成功记录](https://github.com/CochraneK/Yi-hot/actions/runs/42986166195)）。

- **Word 再生版**：[YiHot_Operations_Handbook_rebuilt_2026-11-11.docx](archive/YiHot_Operations_Handbook_rebuilt_2026-11-11.docx) — 由上述 25 章 Markdown 主版本导出；Git 文件大小约 49 KB。
- **40 张幻灯片的 PPTX 再生版**：[YiHot_Training_40_Slides_rebuilt_2026-11-11.pptx](archive/YiHot_Training_40_Slides_rebuilt_2026-11-11.pptx) — 文字唯一来源为 [YIHOT_40_SLIDES_2026-11-11.md](training/YIHOT_40_SLIDES_2026-11-11.md)；Git 文件大小约 68 KB。
- Action 在发布前检查 Open XML ZIP 结构、文件大小，以及 PPTX **恰好 40 张幻灯片**，构建成功后自动提交到 `main`（[生成提交](https://github.com/CochraneK/Yi-hot/commit/b131c66328537a991078745c141d47ba43dbca98)）。
- 这两份是**重新排版/重写的可编辑归档版本**，**并非**旧会话原 DOCX 或 PPTX 的精确恢复；演示稿是 40 页的精简培训提纲，不等同于 25 章全文逐页转换。后续若找到原版，需另存新文件名并保留出处，不覆盖这份再生版。
- 已入库的 PDF（`docs/pdf/`）仍是 README/MAINTENANCE 及两者合订版，不能冒称这里 25 章 Word 的完整 PDF 对应件。需要时再根据主版本生成同名 PDF，并明确生成日期。

## 新增：2026-11-11 正式推荐的视觉重设计版

旧 Markdown 自动生成 PPT 仍保留作为早期版本；**新推荐版** [YiHot_Editorial_Redesign_40_Slides_2026-11-11.pptx](archive/YiHot_Editorial_Redesign_40_Slides_2026-11-11.pptx) 已作为真正的二进制文件提交到 `main`（40 页，983,168 字节，Git blob SHA `d20beae41bbbc058978707899d8b41e30f2f29f4`）。配套 [编辑型设计源码](training/build_yihot_editorial.cjs) 与 [视觉交接说明](training/EDITORIAL_REDESIGN_2026-11-11.md) 均已入库，方便未来修改。Canva 是另一个编辑入口，不是唯一存储位置。

## 归档后必须继续区分的工作

| 优先 | 任务 | 完成定义 | 证据边界 |
| :--- | :--- | :--- | :--- |
| P0 | 验证真实生产模型与成本 | 后台有效模型 + 各环节回执 + 同时间窗服务商账单 | 没有生产账号时一律标待核验 |
| P0 | 核验当前生产信源与队列 | 带时间戳重新导出信源、入池、健康与积压，并刷新图谱 | 当前 10-25 快照不可自动变实时 |
| P0 | 订阅隐私主体、联系渠道 | 公开说明由实际运营方校核，测试退订 | 不得擅自填虚构个人信息 |
| P1 | Word / PPT / PDF 正式交付 | 选择/再生一套明确版本、保留 Markdown 主版本和再生方式 | 标“再生版”而非冒称原始旧附件 |
| P1 | 原始 Image 2.5 PNG 的追溯 | 找到可核验的原文件后再独立入库；未找到就明确记缺 | 不把 SVG 替代成图片模型原件 |
| P1 | 质量人工校准和主体覆盖图 | 样本、判断规则、统计口径可复算 | 不根据技术源数量推断地区/机构覆盖 |
| P2 | AIHOT 上游隔离更新、NewsMail/charity-intelligence整合 | 按 `IDEAS.md` 与专门规划逐步复核 | 不以“候选资产”代表已并入生产 |

## 安全及移交规则

- **GitHub main 修改 ≠ 腾讯云部署**；不要自动切换模型或重跑历史内容。
- 公共 Git 不保存 `.env`、Token、SSH/邮箱凭据、完整订阅者清单、未授权原文、带敏感信息的后台截图；保留必要的脱敏结果即可。
- 本仓库已公开，第三方商标、Logo、项目材料的权利边界见 `NOTICE` / `THIRD_PARTY_NOTICES.md`。
- 新接手 Agent 先读 `AGENTS.md`、本文和 `PRODUCTION_EVIDENCE_2026-11-10.md`；下一次真实核验后追加**新日期**版本，不覆盖本次历史证据。

**归档结论**：旧会话里的核心设计、正式文字报告、信源分层、生产审查边界和 Flash 切换脚本已得到 Git 级保存；旧二进制附件和 Image 2.5 原始 PNG 仍须与现有文档分开管理，不能宣称已经全量入库。
