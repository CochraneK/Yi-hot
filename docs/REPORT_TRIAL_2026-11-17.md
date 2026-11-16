# 报告新版生产验收：2026年11月17日起

## 当前完成和没有证明的事情

PR #67/#69/#70/#71 已保留原报告、主题、引用和历史期刊，在其基础上增加证据叙事、真实历史热榜、折叠长摘要及分渠道00/01布局。本站生成和邮件渲染是两个独立发布位置；**不能用仓库合并、可访问的API或一枚release字符串代表两个位置都已更新。**

2026-11-16 18:41（UTC+8）公共只读核查：health正常、db=ok、release标签为 `10e9fd50f0`；周报为 `2026-W46`，生成时间 `2026-11-15T22:00:38.636Z`；月报为 `2026-10`，生成时间 `2026-11-02T11:57:11.476Z`。两份旧DTO都没有insights和yesterdayHot；这是可兼容的旧期状态，**不证明新版代码缺失，也不构成新报告质量通过**。已用这两份真实公开DTO生成新邮件布局的离线预览，未重编报告、未发送邮件、未访问SMTP/AnyDoor。真实预览和DTO仅作为临时/个人验收材料，不提交Git。

本环境没有SSH密码、agent或默认身份文件，故不能修改腾讯云；运行镜像/邮件副本未核验。当前 `dailyReports:false, dailyNewsletter:true` 保持不变：日报只验证授权后台数据与邮件，不新增公开入口。

## 上线核查工具

在已同步最新可信源码的服务器工作区运行（默认三个容器名与现有compose一致，可显式覆盖）：

```bash
cd /opt/yihot
python3 scripts/check_report_deployment.py \
  --base http://127.0.0.1/yihot --runtime --sudo-docker
```

脚本只执行 Docker inspect、容器内文件哈希和 systemctl 只读检查，不启动/重启服务、不调用模型、不读.env、不连接SMTP或数据库、不列收件人。它对比：

- Web/API/worker均运行且来自同一镜像；运行中镜像内报告源码/提示词/调度/功能开关文件与本地可信源码相符。
- 独立邮件脚本哈希相符、timer active、ExecStart确实指向该Python文件。脚本文件匹配但systemd仍指向旧程序不能通过。
- 公共health/数据库健康、周报和月报读取路径可达。

只有上述全部满足才输出 `deploymentVerified:true` 并返回0；不匹配、权限/服务不可用或仅公共检查返回2。**这仍不证明worker未来一定按时生成、SMTP已送达或模型判断正确**，`reportQualityVerified` 始终false，留给实际验收。源码目录必须已核对GitHub/本地/服务器blob一致；对着同一份旧代码自比不能证明新版本上线。

不在服务器时可只核对公开接口：

```bash
python3 scripts/check_report_deployment.py --base http://49.233.72.222/yihot
```

这种模式会保留 `runtime.*.status=unverified` 和 `deploymentVerified:false`；返回2是预期的未核验状态，不应把它改成成功绕过上线闸门。旧报告缺少新可选字段不会被判为损坏。

## 交给有腾讯云连接的 WorkBuddy

> 连续完成 YiHot 报告上线与11月17日验收准备。先读AGENTS.md、docs/PROJECT_CONTEXT.md、docs/EMAIL_DELIVERY.md和本文件；使用最新main，保留另一会话的修改，按blob核对三方，不强制覆盖、不用开发机旧.env。先备份数据库、当前共用镜像及 /opt/yihot-email-delivery/send_reports.py；沿用服务器现有三个compose组合重建Web/API/worker。独立备份并原子同步 deploy/email-delivery/send_reports.py 到 /opt/yihot-email-delivery/，不改变原.env、订阅人、outbox、模型开关或报告调度。先跑合成Python测试，再用 --preview-json 预览真实公共DTO；预览通过后，只有用户已明确授权受控收件人时才使用 --test --test-to <该单个地址> 发送一次；不要读取EMAIL_TO、领取订阅outbox或向其他用户发送。运行 check_report_deployment.py --runtime --sudo-docker，逐项处理版本/镜像/邮件timer/ExecStart问题并保存脱敏结果；不要把未核验改为通过。11月17日08:00后核对实际日报记录、reports.daily任务和正常邮件回执；不手动重编旧报告、不批量补发。把实际部署时间、源码blob/镜像、独立邮件哈希、核查结果与回滚点写入Git的脱敏交接，未观察到的SMTP送达和报告质量保持待验收。

部署路径沿用 `docs/PROJECT_CONTEXT.md` §2 的现有compose组合（含futureme代理/werss），不额外新建一套生产站。邮件文件替换采用临时文件+rename，避免timer运行时读取半份脚本；保留服务器现有访问权限和.env。不要把备份、凭据、真实日报、收件人或退订链接上传Git。

## 首次真实验收时间和只读数据

| 产品 | 原有计划（UTC+8） | 这次验证 |
| --- | --- | --- |
| 日报 | 2026-11-17 08:00 | 新期原导语、昨日热榜可选快照、00/01邮件目录、真实正常投递 |
| 周报 | 2026-11-23 06:00 | 新生成期的证据洞察、11-22历史榜、网页展开版块和邮件短目录 |
| 月报 | 2026-12-01 06:30 | 新期机制候选、11-30历史榜、真实覆盖/引用/费用 |

生成与实际收信可能晚于计划时刻；timer每30分钟检查一次、外部模型/邮件也可能失败。不要提前写成“已验收”。日报发布门槛关闭时，公开日报页面不可读不自动构成本补丁故障，也不能为了验收公开它。

在授权DB连接/容器里只读查看，不输出正文与邮箱：

```sql
BEGIN READ ONLY;
SELECT kind, key, generated_at, revision,
       content #>> '{yesterdayHot,day}' AS historical_hot_day,
       CASE WHEN jsonb_typeof(content #> '{yesterdayHot,entries}') = 'array'
            THEN jsonb_array_length(content #> '{yesterdayHot,entries}') ELSE 0 END AS historical_hot_count
FROM reports WHERE kind='daily' AND key='2026-11-17';
SELECT job, status, started_at, finished_at
FROM job_runs WHERE job='reports.daily' ORDER BY started_at DESC LIMIT 5;
SELECT status, count(*) FROM newsletter_outbox
WHERE kind='report' AND payload #>> '{report,kind}'='daily' AND payload #>> '{report,key}'='2026-11-17'
GROUP BY status;
COMMIT;
```

当前订阅代码保存 `payload.report` 公共DTO，上述查询使用该层级；若运维核对发现目标运行版本结构不同，需先记录差异并按真实schema调整，不能把查到0条当成没有发送。不要打印payload、response或订阅人地址。投递回执不是收件箱送达证明；受控收件人实际收到才可确认邮件阅读体验。

验收重点：新期有历史榜时日期为D-1，热榜在资料最前；没有对应历史快照时省略，不替换实时榜。不强凑洞察；有证据时查看原始标题、链接、推理与竞争解释。网页01+直接展示、原overview/summary仍可展开、邻域最后；邮件01+保持短目录，QQ/Gmail/Outlook不保证details交互，禁用折叠时也不会变成数百条长文。

M1质量和成本闸门仍在Issue #68：至少30条候选逐条核对证据、来源独立性和支持程度，至少10条旧摘要对照是否有信息增量；记录实际report回执token/费用。零新增调用不等于token费用零增长。当前无新期样本不能先给模型准确率或把合成测试当质量验收。

## 故障与回滚

代码/脚本不匹配则重新对齐可信源码并按原流程部署；API可读但镜像未核查保持unverified。生成失败先查看授权的任务/模型回执，不能用手动重复生成来掩盖故障。SMTP结果unknown不得盲目重发。

回滚恢复此前共用镜像和独立邮件脚本，不删reports/revisions/subscriptions/outbox，不改旧报告日期，不关闭隐私边界。预览输出可在验收后删除，不属于已发送记录；预览工具/核查脚本可独立移除而不影响正常投递。
