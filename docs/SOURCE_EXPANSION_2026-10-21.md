# YiHot 儿童权益与公益信源增补 · 第一批（2026-10-21）

> **状态：已加入 GitHub 配置，但 `enabled: false`；未连接腾讯云写数据库，未宣称已经开始采集。**
> 本轮接受的需求来自用户整理的五组政府政策、国际组织、儿童公益同行、行业机会、社会事件媒体名单。
> 当前仓库正式 seed 从 38 条增至 **42 条**；余下 **41 个候选目标**另存到 [长期覆盖缺口台账](../data/source-registry/proposals-child-rights-2026-10-21.json)，**台账不是自动导入列表**。

## 1. 本次落地的四条官方网页采集配置

| 信源 ID | 原站栏目（证据链接） | CSS 容器 / 链接 / 日期 | 当前行为 |
| --- | --- | --- | --- |
| `web-stc-global-news` | [救助儿童会国际·News](https://www.savethechildren.net/news/) | `.views-row` / `.list-card__heading a[href]` / `.list-card__meta-date` | 暂停；国际救援新闻 |
| `web-unicef-cn-press` | [UNICEF 中国·Press centre](https://www.unicef.cn/press-centre) | `.card` / `h3.mosaic-heading a[href*='/press-releases/']` / `.tile--date .note` | 暂停；中文新闻稿，与已有公众号不同技术渠道 |
| `web-unicef-global-press` | [UNICEF 全球·Press releases](https://www.unicef.org/media/press-releases) | 同 UNICEF 中国官网（限定原文前缀） | 暂停；国际新闻稿，可能与中文页面报道相同事实 |
| `web-unicef-innocenti-reports` | [UNICEF Innocenti·Projects and reports](https://www.unicef.org/innocenti/projects-and-reports) | `.card` / `h3.mosaic-heading a[href*='/innocenti/reports/']` / 无可靠列表日期（新文章最多 6 篇补查详情） | 暂停；研究论文/报告，需要额外核对日期 |

这些选择器根据 2026-10-21 对官方公开 HTML 的只读检查编写：观察到真实文章标题、不同文章的原始链接和网站日期。**还没有通过腾讯云 YiHot 自身 `fetchWebList` 的实抓预览**，也没有验证所有内容在运行环境都可稳定连接。权限/robots/ToS 尚需在启用之前复核，不能把可访问性等同于采集或全文再发布的授权。

### 安全与成本控制

- 全部使用 `web_list` 的官方公开网页，不引入 EveryInfra、Dajiala、Jina 等按次收费入口，也不需要账号、Cookie、验证码或代理绕过。
- `enabled: false`，不增加任何现网定时抓取或模型调用；配置 `site_fulltext: false`、`syndicate_fulltext: false`，公开仅保留摘要和原文入口。
- 首轮回灌上限 6–8 篇/源；不会让历史研究条目冒充当天突发事件。
- 新增的 UNICEF 全球和中国可能报道同一儿童保护事件：去重按文章 URL、原始发布者和独立证据做核实，不能把它们简单当成两份独立证据。
- UNICEF Innocenti 原列表卡片可能**没有发布日期**，首次上线前必须检查详细文章页是否能核实日期；若日期缺失，应继续保持暂停状态或调整详情规则。

## 2. 为什么余下缺口不直接启用

保留 41 个待核验对象及 P0/P1/P2 优先级，具体见 [候选台账 JSON](../data/source-registry/proposals-child-rights-2026-10-21.json)。

- **最高人民检察院、国家卫生健康委**：官方栏目能定位，但 2026-10-21 自动获取时分别遇到 403 / 非文章响应；不得绕过访问控制或伪造采集成功。
- **UNICEF Data、国家统计局、慈善中国**：它们属于数据集或注册查询平台，不应伪装成每小时抓一次的新闻站；需要单独的公开接口、更新机制与权限审核。
- **UNGM、欧盟 Funding & Tenders、FCDO**：合作与招标机会必须记录发布日期、截止日期、招标主体和地域限制，不能按普通公益新闻来评估。
- **其他官方机构和媒体**：还没在 YiHot 解析器里验证具体栏目、发布时间、全文权益；NewsMail/charity-intelligence 的旧候选不能被当成正式采集许可。
- **已接入的机构，不等于每个渠道都接入**：例如中国青少年发展基金会有公众号，官网仍可作为独立候选；必须同主体关联，不能把官网和公众号计成两个独立的一手发布者。

## 3. 怎样从 GitHub 导入腾讯云（当前未执行）

现有 [`scripts/seed.ts`](../scripts/seed.ts) 明确使用 `ON CONFLICT (id) DO NOTHING`。因此**提交到 GitHub 或部署新镜像不会自动把新增 seed 写入既有 `sources` 数据库表**；需要在部署机有权限地明确执行：

```bash
# 在 YiHot 项目根目录，确认已同步包含本次新增四源的 main 分支
# 用既有 .env 连接生产数据库。执行前确认备份，且不要在 CI 测试库外泄露凭据。
node --env-file=.env scripts/seed.ts
```

运行后检查后台「信源」按这四个 ID 搜索，**预期存在、全部暂停**。不修改其余既有来源配置。原有同一 ID 的信源不会被覆盖。

## 4. 上线前逐条验收（需要管理员操作）

1. 在 `/admin/sources` 搜索新增四个 ID；不存在就检查 `seed.ts` 的插入结果，确认程序连接的是预期数据库。
2. 使用后台已有 **Preview** 功能或 API `POST /api/admin/sources/preview` 预览，核对原文链接、标题、源文章真实发布日期，并排除导航链接、转载列表和不合规内容。
3. 对 UNICEF Innocenti 专门验证：至少三条报告是否有可靠发布时间；若没有，继续暂停，不把发现日期当发表日期。
4. 记录 robots/ToS 和站点版权要求；无可自动采集许可的来源继续暂停，只做人工引用。
5. 首先只启用一条，并观察 48 小时：抓取成功率、去重结果、模型调用数、入选率、处理队列和服务器可用内存；每源增量成本实际以收据为准。
6. 逐条分批启用后再观察其它三源。新源初始 6–8 条上限并不代表永不增长，应持续关注日均新增文章数。
7. 测试发现异常时，直接在后台暂停新增源；不要删除旧文章以掩盖故障。记录异常与恢复方式到本手册或专题文档。

## 5. 复核进展记录

| 检查 | 状态 |
| --- | --- |
| 新闻栏目为官方实际页面 | 已核实（2026-10-21 外部公开网页） |
| HTML 包含可定位的文章链接和标题 | 已核实（公开网页） |
| CSS 配置符合 YiHot 支持字段 | 已核实：四条均通过生产 `POST /api/admin/sources/preview` 的配置校验 |
| 腾讯云的原生 Preview 返回正确日期与篇数 | 2 条通过（UNICEF 全球、Innocenti）；2 条被 Cloudflare 挑战拦截（见 §6） |
| 采集/转载权限复核 | **待法律/授权复核**；两条可访问源已按公开摘要 + 原文入口配置，未开全文转载 |
| 现网实际入库与健康状态 | 2 条已启用并入库（各 6 篇，见 §6）；2 条保持暂停，未产生任何抓取 |
| 每天实际新增 Token 和费用 | 首轮 12 篇已产生收据；按 360/1440 分钟间隔，稳态约 4–24 篇/天，待一周后按收据复核 |

## 6. 生产验证与启用结果（2026-10-21 14:48–14:55，腾讯云 49.233.72.222）

四条配置从 GitHub 同步后写入生产库（`sources` 96 → 100 条，新增四条均为 `enabled=false`），再逐条做原生预览：

| 信源 ID | 生产预览 | 结果 |
| --- | --- | --- |
| `web-unicef-global-press` | HTTP 200，12 条候选，日期字段正常 | **已启用**（interval 360） |
| `web-unicef-innocenti-reports` | HTTP 200，6 条候选，列表无日期 | **已启用**（interval 1440，改用详情页发布日期） |
| `web-stc-global-news` | HTTP 403，`server: cloudflare`，`cf-mitigated: challenge` | 保持暂停 |
| `web-unicef-cn-press` | HTTP 403，`server: cloudflare`（challenges.cloudflare-cn.com） | 保持暂停 |

### 6.1 两条已打通

- `web-unicef-global-press`：启用后手动抓取 `ok`，回填 6 篇（`initialBackfillLimit`），正文抓取 `body_status=ok`，全部完成分析；评分 36–60，6 篇全部入选并以中文标题公开。
- `web-unicef-innocenti-reports`：列表页确实没有日期，原配置会让 6 篇全部 `NO-DATE`。已把详情规则改为页面自带的 “Publication date” 区块：

  ```json
  "detail": {
    "maxFetches": 6,
    "publishedAtSelector": ".file-block--publication time[datetime]",
    "publishedAtAuthoritative": true
  }
  ```

  抽查 5 篇报告页该选择器 5/5 命中；启用后 6 篇入库日期为报告真实出版月（2026-06-16 ~ 2026-09-30），而不是页面 `article:published_time`（两者相差数天到数周）。评分 22–42，4 篇入选。
- 两条源合计：12 篇入库、12 篇分析、10 篇公开（`publications.visibility=public`），无抓取失败。
- **注意**：`industry/sources.json` 仍保持 `enabled: false`（CI 的 `child-rights-source-coverage` 测试要求 seed 不得自动开采集）；启用状态只存在于生产库，重建库后需在后台重新启用。

### 6.2 两条为什么没打通

两台站点都对腾讯云出口 IP 返回 Cloudflare 托管挑战，不是选择器问题：

- `www.savethechildren.net/news/`、`/rss/news`、`/rss.xml` 全部 403 + `cf-mitigated: challenge`；
- `www.unicef.cn` 全站（含首页、`/rss.xml`）403；`www.unicef.org/china` 会 302 到 `unicef.cn`，同样 403；
- 按本手册“不得绕过访问控制”的原则，没有尝试破解挑战、伪装浏览器指纹或加代理；这两条继续暂停，不产生抓取与费用。

可选的下一步（需明确选择，不要默认执行）：

1. **换官方可达栏目**：`https://www.unicef.org/zh/故事` 与 `https://www.savethechildren.org.uk/news` 在生产网络均返回 200，可作为中文 UNICEF / 英国救助儿童会的替代渠道，但内容定位（特稿 / 英国分会）与原“新闻稿 / 国际新闻”不同，需编辑确认。
2. **保持缺口**：仅保留已有 `web-savethechildren-cn`（中国办公室官网）与 `wechat-oa-unicef` / `wechat-oa-save-the-children`（付费通道，当前 EveryInfra 503）。
3. **人工引用**：这两站只做人工检索与引用，不进入自动采集。
