# YiHot 演示稿视觉重设计 · 2026-11-11

> 状态：**正式 40 页编辑型 PPTX 已提交 GitHub `main`**，保留可再生 PptxGenJS 源码，Canva 提供辅助在线编辑。旧版仍保留用于历史比较。

## 为什么重做

此前由 `pandoc` 将 40 条 Markdown 提纲直接转换为 PPTX，内容虽可编辑，但页面类型重复、没有足够的数据叙事和视觉节奏。新版本改为“编辑型研究报告”：

- 16:9 宽屏，深墨绿/暖纸白/青绿/珊瑚红/浅金色的层级系统；
- 五大章节：产品与读者体验、信源体系、AI 编辑流程、成本运营、项目交接；
- 数据图形、过程图、时钟/溯源图、运营检查矩阵、概念化 UI 示意；
- 所有关键视觉组件均为 PowerPoint 原生形状和文字，便于维护者编辑；
- 强制区分 GitHub seed、历史生产快照、供应商实付、尚待核验的运营数据；
- 整体仍为 40 页，但每页不是机械的三行 bullet。

## 可编辑设计

- **[正式推荐版 · GitHub PPTX 下载](../archive/YiHot_Editorial_Redesign_40_Slides_2026-11-11.pptx)**（40 页，983,168 字节，SHA-256 `484b94e0e8f0e4c00a245d482bdd98f435bc466c6cd85a0b3761554f97a82624`，本地与 Git Blob 对照一致）
- **[可再生设计源码](build_yihot_editorial.cjs)**（PptxGenJS v4.0.0，PowerPoint 原生文本、图形与流程元素）

- [Canva 编辑版](https://www.canva.com/d/w9PUwo9swBlLF76)
- [Canva 预览](https://www.canva.com/d/S4rjIuPPurIElDv)
- Canva 已导入并反馈页数为 **40 页**。在 2026-11-11 的本地构建中，PPTX 经 LibreOffice 成功导出为 **40 页 PDF**，并逐页渲染检查。

## 版本与数据边界

- 原 40 页自动生成版本：`docs/archive/YiHot_Training_40_Slides_rebuilt_2026-11-11.pptx`；用于保留自动化再生基线，**不是**当前设计推荐版本。
- 正式完整文字版本：`docs/YIHOT_OPERATIONS_HANDOFF_2026-11-09.md`；**唯一事实源**。
- 生产校验依据：`docs/PRODUCTION_EVIDENCE_2026-11-10.md`。
- 信源历史数据：2026-10-25 的 210 / 175 / 150 / 113 / 1,868，不是 11 月实时数据。
- 费用历史数据：截至 2026-10-31 的近 30 天，模型估算 ¥66.02，搜索估算 ¥12.04。
- 页面中的后台 UI 仅为概念化示意，不能当线上真实截图。
- 正式 PPTX 与可再生脚本现已同步进 GitHub，**不依赖 Canva 才能下载或继续改版**。Canva 是辅助预览/编辑入口，后续 Canva 改动不会自动反写 GitHub。

## 从 GitHub 重新生成

在具备 Node.js 的开发环境中安装 `pptxgenjs@4.0.0`，然后运行 `node docs/training/build_yihot_editorial.cjs`，输出为 `docs/archive/YiHot_Editorial_Redesign_40_Slides_2026-11-11.pptx`。此操作会重建文件，**不会自动修改腾讯云部署**。脚本重生成的 ZIP 元数据可能不同，更新前仍需对视觉和内容重新验收。

## 今后更新

1. 先更新正式交接报告的带时间戳数据。
2. 再对照汇总页与数字图更新 PPT。
3. 不能直接把历史快照替换为未经核验的估算数。
4. 以 PowerPoint / Canva 页面视觉检查为验收，不以生成脚本执行成功为全部验收。
