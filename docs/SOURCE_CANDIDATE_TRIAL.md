# 候选信源：管理员试用版

**状态：代码已提交；尚未部署到腾讯云，网页交互仍需在运行实例验收。**

入口：`/admin/sources/candidates`（在“信源”列表右上角的“发现候选”按钮）。需要既有管理员登录，访客不可见。

## 已实现

1. **搜索候选**：输入网站 URL、机构或公众号名称，匹配 NewsMail 的 2026-10-08 历史清单和当前 YiHot 管理员信源 API；同域/同名只是可能重复的线索。
2. **发现订阅链接**：在后台输入完整公共 HTTP(S) 网站 URL，调用 `POST /api/admin/sources/discover`；沿用原项目 `guardedFetch` 的 SSRF/DNS/跳转守卫，超时 12 秒、最多 512 KiB、最多 3 次跳转，从网页的 `<link rel=alternate>` 找 RSS/Atom/JSON Feed，最多 12 条。
3. **安全提示**：Feed 标记为尚未试抓、跨域提示；不猜测虚构 RSS 地址、不联网查询任意公众号、不使用付费 API。
4. **带入新建**：从候选页跳转 `/admin/sources/new`，预填 URL、名称、类型并复用原来的真实预览功能。新建信源默认 `enabled=false` 和 `health=paused`，参与模式 `isolated`，全文展示/再分发默认关闭；必须手动核对后启用。
5. **不污染现有内容**：候选查询与 RSS 发现不写数据库、不自动触发 worker，也不改动当前四个 YiHot 容器。

## 已有一次真实网络复核

2026-10-08 的六源只读探测及失效 Feed 列表见 [M1 真实返回报告](SOURCE_M1_LIVE_PROBE_2026-10-08.md) 和 [历史观测 JSON](../data/source-registry/observations/live-probe-2026-10-08.json)。**这些数据是来自 GitHub Runner 的历史快照，不是实时的审查授权；已知失效 RSS 不允许直接预填并创建。**

## 不支持或尚未验证

- 搜索微信公众号名称**只是查询旧候选清单**，不等于实时搜到官方公众号；需要额外验证公众号真实身份 ID。
- 历史候选尚未建立持久审批数据库或自动版权审查，展示“待核查”不是正式许可结论。
- 发现的 RSS 链接可能是失效端点，必须通过 YiHot 原有“预览抓取”检验 XML、标题、发布日期。
- 未连接腾讯云做端到端试用，**不应将 GitHub 上已提交视为服务器已部署**。

## 线上验收

1. 更新开发环境之后，管理员访问 `/admin/sources` → “发现候选”。未登录访问必须转到登录。
2. 搜“民政部”“公益时报”及官网 URL，看旧清单和已有 YiHot 来源比对结果。
3. 用来源官方网页检查 RSS；没有声明时应显示空状态，不能猜测。
4. 尝试 `http://127.0.0.1/`、`file:///etc/passwd`、带用户名密码的 URL，后台应该拒绝，不得返回内网内容。
5. “带入试抓”后必须人工预览并核对内容；创建测试信源默认 paused、isolated 和全文权限关闭。
6. 运行 `npm run typecheck`、`node --test tests/source-discovery.test.ts`、`npm run sources:audit:check`，查看 GitHub Actions 结果；既有 Web 缓存测试问题另行处理。

## 下一步

待真实网站试用通过，再做持久审核队列、公众号身份映射、基于机构/Channels 的自动归档；避免部署新的常驻微信爬虫。
