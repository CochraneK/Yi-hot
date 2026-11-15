# YiHot 公众号分析器 · 旧仓库能力收口（2026-11-14）

## 当前完成范围

从私有 `CochraneK/wechat-article-analysis` 的 **`264d8648c3d610fde45048ccbede23a91ade99b5`** 移入旧 14 图 + HTML 分析引擎至 `tools/wechat-analysis/text_mining.py`；保留其 MIT 许可和来源，移除硬编码的旧机构品牌清理词与 Windows-only 字体假设。生成器必须由维护者**显式传入经过授权的语料目录及私有输出路径**，不会自动采集、调模型、入站内数据库、发布网页或生成新的定时任务。

`prepare_jsonl.py` 提供从脱敏/授权 JSONL 到旧分析引擎所需 `YYYY-MM-DD_title.txt` 文件的离线转换。它**只接受显式 `analysis_permitted: true` 的文章正文**；该标记须由有权审核内容的人赋予，不代表正文可以公开二次分发。必须使用真实 `published_at`，不得填收录时间。输出目录必须是新的、位于 Git 仓库之外，避免意外提交原文。分析结果可能包含来源标题、词语和敏感事实，同样不得默认公开。

## 安装和离线运行（可在旧开发机执行，不依赖腾讯云）

```bash
python3 -m venv /tmp/yihot-wechat-venv
/tmp/yihot-wechat-venv/bin/pip install -r tools/wechat-analysis/requirements.txt

# 准备授权后的 JSONL；将路径换成你本机的私有目录
python3 tools/wechat-analysis/prepare_jsonl.py \
  --input /private/corpus/articles.jsonl \
  --output /private/corpus/legacy-txt

# 至少 30 篇有日期、有足够正文的文章才默认尝试生成多图
/tmp/yihot-wechat-venv/bin/python tools/wechat-analysis/text_mining.py \
  --input /private/corpus/legacy-txt \
  --output /private/reports/2026-11-wechat \
  --config tools/wechat-analysis/config.example.json
```

JSONL 单行示例（**虚构数据，非授权证据**）：

```json
{"id":"demo-001","title":"示例公益活动","published_at":"2026-11-01","body":"这是一条用于测试的虚构公益活动文章。","source_url":"https://example.org/demo-001","analysis_permitted":true}
```

真实数据不得提交 Git 或上传公共 CI。CI 使用合成数据检查适配器与结构，并以独立 Python 虚拟环境完整生成 14 图/HTML；优先系统中文字体，缺失时使用仓库现有的 OFL Noto Sans SC 字体，不因缺字体跳过词云；**这不证明旧 14 图对真实公众号文章都能成功生成**。下一个验收需要在有授权的 50+ 篇、跨多个年份的语料上测试输出 PNG 数量、HTML 内容、中文字体、主题 NMF 数值边界、空词典、短文本与性能；仅测试通过才能称作功能完全替代，之后再讨论旧仓库归档。

## 为什么不直接从 YiHot 新闻库生成

YiHot 公开资讯的正文往往只有摘要或未经许可的内容；没有正文和许可不能强行输出词频/TF-IDF/NMF，也不能把关键词或新闻标题当作完整文章语料。机构公众号与 YiHot 的 `Channel`/`Source` ID 以后可映射到这个离线任务，但本次**没有增加自动抓取或线上按钮**。旧的 `analysis/report.html` 是历史静态成果，不等于可更新报告。

## 版本/隐私/回滚

- 来源：`CochraneK/wechat-article-analysis@264d8648`；原代码 MIT，随附 `tools/wechat-analysis/LICENSE`。
- 源数据：仅操作者批准的文章；缺许可、来源 URL、真实日期或正文直接拒绝，不能通过“自动爬取”补齐。
- 权限：运行必须离线，本地报告需保持私密，生成目录不在 Git 中；不得使用服务器上真实订阅者邮箱或原始 Cookie。
- 运行：在研发机/一次性分析环境执行，不引入常驻 Docker、worker 或定时任务。
- 回滚：移除工具及相关文档/CI 步骤即可；没有修改生产数据库、任务、源开关或站点页面。
- **收口闸门**：来源版本冻结 → 可复现数据管道/14 图验收 → 用户确认报告版权/私密归档 → 移除旧定时任务（若有） → 旧仓库转只读归档；不可由本次源码移入直接宣告结束。


## PR #36 实跑修复

完整渲染曾在第 12 张图因 Matplotlib 移除 `boxplot(labels=...)` 而失败；现改为独立设置横轴刻度，兼容原声明的最低版本和新版本，不用降级依赖绕过。字体使用主仓库现有授权文件作为跨平台回退，测试必须生成全部 14 张图及内嵌图片 HTML。HTML 与所有图片、摘要统一写入显式输出目录，修复旧脚本把 HTML 写回代码目录的问题；输出路径先解析符号链接再验证，避免私有结果经外部链接写入 Git 目录。测试语料仍全部合成，不代表真实历史语料已经验收。

报告的“原创文章”指标改为“未标转载”，明确标题标记无法证明原创性；描述性次数变化不再写作统计显著或行业预测。
