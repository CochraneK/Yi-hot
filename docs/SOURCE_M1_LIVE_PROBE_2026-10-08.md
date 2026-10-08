# M1：公益信源真实网络探测

探测时间：2026-10-08 16:24 UTC。来自 **GitHub 临时 Runner** 的一次性、只读 HTTP GET；单 URL 最多 192 KiB、12 秒超时。无腾讯云部署，无模型付费、无数据库写入。结果仅反映该出口的网络响应，不代表采集许可、全文转载许可或内容真实。

证据：[GitHub Actions 运行日志](https://github.com/CochraneK/yihot/actions/runs/37808495020)、[原始观测 JSON](../data/source-registry/observations/live-probe-2026-10-08.json)。

| 来源 | HTTP / Content-Type | 结论 |
|---|---|---|
| Oxfam 国际乐施会 `/en/rss.xml` | 200 / RSS XML；采样检出 10 条 item | **网络层面有效 RSS**，待 YiHot 正式 parser 与授权复核 |
| 中国慈善联合会 · 联合会动态 | 200 / HTML | 网站栏目可访问，应走 `web_list`，非 RSS |
| 南都公益基金会 `/feed` | 200，但跳转 `/index/index`，最终 HTML | 历史 `/feed` **不是有效 RSS** |
| 中国发展简报 `/feed` | 404 / HTML | 历史 RSS 地址失效 |
| 公益时报 `/rss.xml` | 404 / HTML | 历史 RSS 地址失效 |
| UNICEF China 新闻资讯 | 403 / HTML | **该测试出口被拒**；不能由此判为来源失效或建议绕过限制 |

**操作原则**：候选目录中这三条失效 RSS 已标为旧地址不可用，不提供直接带入 RSS 创建的按钮。不能把历史清单中的“RSS”字段视为真实性证据。Oxfam 后续走 YiHot `rss` 实际预览，另需审核 robots/服务条款；国内网页走合规 `web_list`，人工核对标题、原文 URL、发布日期与重复栏目。

相关代码：`scripts/source-live-probe.mjs`、`.github/workflows/source-probe.yml`、`apps/web/app/lib/source-registry.server.ts`、`apps/web/app/routes/admin/source-candidates.tsx`。上述探测不自动增加或启用来源。
