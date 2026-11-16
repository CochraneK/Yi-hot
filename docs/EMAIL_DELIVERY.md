# 公益总报邮件投递

Yi-Hot 只使用自己的日报、周报、月报作为邮件内容来源。日报按订阅人的 `daily` 偏好每日 08:00 后投递，
周报周一、月报每月 1 日；日报没有公开页面，只走邮件。公开订阅采用双重确认：网站把确认信和新一期总报写入
PostgreSQL outbox，`deploy/email-delivery/send_reports.py` 从受保护的 ingest API 领取任务，生成 HTML 与纯文本
版本，再通过 SMTP 逐个发送。它不采集新闻；有已审洞察时直接复用，旧期的可选短速览由下文开关决定。

> 线上 `yihot-email-delivery.timer` 执行的是 `/opt/yihot-email-delivery/send_reports.py`；仓库
> `deploy/email-delivery/send_reports.py` 是同一份副本。**改一处必须同步另一处**（11-06 已对齐 md5），
> 否则线上会继续跑旧逻辑。

服务器配置位于 `/opt/yihot-email-delivery/.env`，支持：

```dotenv
EMAIL_DELIVERY_ENABLED=true
EMAIL_FROM=sender@qq.com
EMAIL_PASSWORD=QQ邮箱SMTP授权码
EMAIL_SMTP_SERVER=smtp.qq.com
EMAIL_SMTP_PORT=465
YIHOT_BASE=https://49.233.72.222/yihot
```

若 `EMAIL_FROM`、`EMAIL_PASSWORD` 未单独设置，会回退使用现有邮件信源服务的 `MAIL_SOURCE_USER`、
`MAIL_SOURCE_PASSWORD`。每个收件人单独发送，彼此看不到地址。数据库 outbox 以 `报告类型 + 期号 + 订阅人`
防重；定时器每 30 分钟检查一次。状态文件仅保存 IMAP 退信扫描游标。

操作命令：

```bash
python3 send_reports.py --test --test-to "$YIHOT_CONTROLLED_TEST_EMAIL"  # 仅一个明确授权收件人
python3 send_reports.py --initialize           # 首次部署只建立 IMAP 退信游标
python3 send_reports.py --kind weekly          # 投递最新周报
python3 send_reports.py --kind monthly         # 投递最新月报
systemctl status yihot-email-delivery.timer
journalctl -u yihot-email-delivery.service -n 50 --no-pager
```

公开流程：`/subscribe` 提交 → 48 小时确认信 → 激活日报/周报/月报 → 邮件内确认退订。服务用 IMAP
`BODY.PEEK[]` 只读扫描新增的标准 DSN 退信，识别 `Final-Recipient`/`Original-Recipient` 后把地址标为
`bounced`；不会因为普通来信或旧退信停发。


## 日报/周报/月报 · 00 分析 / 01 起资料版面（2026-11-16）

**数据源仍是同一期报告（数据库与 public DTO）**，不是邮件独立写一份新报告。

- **00 · 主要阅读内容：** 周报/月报优先取 \`report.insights\`，以“判断 → 真实新闻标题/站内链接 → 理由 → 另一种解释 → 下期观察”组成邮件正文。若已有至少一条已校验洞察，邮件不再为同一期额外调用 AnyDoor 的第二份模型速览。没有洞察时，保留原来每期可选 AnyDoor 速览或原导语；日报当前仍只有模型写出的简短事实导语，不假装已有跨事件分析。报告生成模型、调度和付费上限不变。
- **01 起 · 精简目录：** 前一天历史热榜（如果该期保存了）→ 原有新闻版块（按报告顺序）→ 快讯 → **邻域总在最后**。每个版块只带标题、条数与至多 3 条可点击的新闻预览；保留报告中的完整新闻与 summary 原数据，不另生成一次摘要。电子邮件中的 \`<details>\` 仅作为支持该 HTML 元素的邮箱的渐进增强；**QQ 邮箱/Gmail/Outlook 等不可保证交互折叠**，即使不支持，也不会展示几百条长文。周报/月报可点版块链接进入 YiHot 对应页面，所有 01+ 版块在网页**默认展开**。
- **日报公开边界：** \`industry/features.ts\` 当前 \`dailyReports:false\`，仅有日报邮件投递。邮件不能指向不可访问的 /daily/ 期刊：预览新闻直接链接公开 /items/，末尾只提供“查看最新动态”的入口（该入口不冒充历史日报）。
- **历史榜单口径：** 只引用该期 \`report.yesterdayHot\` 历史快照，绝不把投递时刻 \`/api/site/hot\` 的实时排名当成昨日榜单；没有历史快照就不显示。
- **撤回与隐私：** 报告公开投影负责剔除撤回的新闻、无效洞察引用与热榜链接；邮件使用有 \`available\` 的公开 DTO、本文未添加地址收集或新发送渠道。多收件人继续逐个发送，保留原退订/退信与去重逻辑。

**两套发布路径必须分别验收：** GitHub main 新版 React 可由原 Web/API/worker 部署流程上线；实际邮件 HTML 由独立 systemd 服务 \`/opt/yihot-email-delivery/send_reports.py\` 生成，**仓库更新不会自动覆盖这份服务器文件**。备份后对齐 \`deploy/email-delivery/send_reports.py\`，再做**不真实投递**的合成单元测试与 HTML 样例审查；如需要向自己的受控邮箱发送测试邮件，使用 \`--test --test-to <单个授权收件人>\` 流程，绝不直接向所有订阅者重发旧期。下一次正常 outbox 发送才会使用新邮件布局，已经发送的邮件不会被远程改变。

自动验收：GitHub CI 通过 \`tests/test_report_email_layout.py\`（offline，无 SMTP/AnyDoor/外部 API），并验证 Web SSR 00/01 可见性与最后邻域版块；回滚只需恢复 React 呈现文件和邮件渲染程序，不改数据库、原报告、subscriptions、outbox 或报告定时。

## 离线预览与双服务版本核对（2026-11-16）

新版 `--preview-json` 接受已导出的**公共报告 DTO**（也接受包含 `report` 的 latest-page JSON），生成 HTML 和纯文本；不领取 outbox、不扫描退信、不读写投递状态、不访问网络、不调用 AnyDoor 或 SMTP。导出和生成是分开的步骤：

```bash
python3 deploy/email-delivery/send_reports.py \
  --preview-json /tmp/report-dto.json \
  --preview-dir /tmp/yihot-mail-preview-new \
  --preview-base https://example.org/yihot
```

输出目录必须是新的，禁止覆盖已有预览；文件仅当前用户可读写。日报可在授权管理环境导出 DTO 后预览，**不开放日报网页或新增公共日报接口**。预览只反映所给快照：生成后撤回的引用不会自动更新旧HTML。没有收件人和退订令牌，因此预览不会带个人退订链接；生产发送流程不变。`--preview-json` 与 `--test/--initialize` 互斥，不能顺手变成真实发送。

**`--test` 仍然是真实 SMTP 发送，不是 dry-run，且必须给 `--test-to` 单个明确授权地址；不再读取 EMAIL_TO 列表。** 验收前优先使用 preview；需真实投递时须明确指定受控收件人，且不能向全体重发历史期刊。旧期可选 `brief_for()` 与新一期复用洞察是不同分支；预览始终跳过可选brief请求，以便核对原报告本身。

用 [部署核查脚本](../scripts/check_report_deployment.py) 对比运行中 Web/API/worker 的不可变镜像及九个报告文件哈希，再独立对比 `/opt/yihot-email-delivery/send_reports.py`、timer 和 ExecStart。仅访问公共API不会给出“已部署”结论。完整命令、11月17日验收、只读SQL与WorkBuddy接手见 [报告上线验收](REPORT_TRIAL_2026-11-17.md)。

受控测试模式不领取 outbox、不读取生产投递状态、不调用可选 AnyDoor brief，固定一次发送到显式地址。缺少 `--test-to`、列表、显示名或换行注入均拒绝；正常订阅定时与发送去重流程不变。真实受控收件人属于本次授权信息，不写入仓库或示例配置。
