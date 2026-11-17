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
  --base http://127.0.0.1/yihot --runtime --sudo-docker \
  --web-build-root /path/to/trusted-build/apps/web/build
```

脚本只执行 Docker inspect、容器内文件哈希和 systemctl 只读检查，不启动/重启服务、不调用模型、不读.env、不连接SMTP或数据库、不列收件人。它对比：

- Web/API/worker均运行且来自同一镜像，启动命令对应各自入口；**分别**核对三个运行容器的报告源码/提示词/调度/功能开关，而不是只检查API容器。
- Web还要逐文件对比实际 `apps/web/build` 的服务端bundle和客户端资源。`--web-build-root` 必须来自**部署使用的同一次可信构建**，默认仅在本地已有完整 `apps/web/build` 时使用它；没有可信编译产物保持unverified，不能从正在核查的Web容器复制一份自比来通过。可保留可信CI/构建阶段的完整build目录；另一次构建不保证字节完全相同，需核对使用的构建产物。
- 逐角色检查相关文件ctime不晚于容器启动，避免热拷贝文件已更新、Node进程却仍加载旧模块。若检出 `patchedAfterStart`，按原部署流程重建/重启对应服务后再核查，脚本本身不会执行重启。检查须在部署结束、运行状态稳定后执行，它只是该时间点的证据。
- 独立邮件脚本哈希相符、timer active、ExecStart确实指向该Python文件。脚本文件匹配但systemd仍指向旧程序不能通过。
- 公共health/数据库健康、周报和月报读取路径可达。

只有上述全部满足才输出 `deploymentVerified:true` 并返回0；不匹配、权限/服务不可用或仅公共检查返回2。**这仍不证明worker未来一定按时生成、SMTP已送达或模型判断正确**，`reportQualityVerified` 始终false，留给实际验收。源码目录必须已核对GitHub/本地/服务器blob一致；对着同一份旧代码自比不能证明新版本上线。

可信build的一个准备办法：先确认本轮 `aihot-app` 已从核对过的源码**成功重建**，并记录新镜像ID。可以从该新构建镜像创建一个**不启动**的临时容器、复制build、立即移除临时容器；不要复制运行中的Web容器来做自证。以下只用于提取，不运行邮件或应用程序：

```bash
trusted_build_dir=$(mktemp -d /tmp/yihot-report-build.XXXXXX)
expected_container=$(sudo -n docker create --entrypoint /bin/true aihot-app)
sudo -n docker cp "$expected_container:/app/apps/web/build/." "$trusted_build_dir/"
sudo -n docker rm "$expected_container"
python3 scripts/check_report_deployment.py --base http://127.0.0.1/yihot \
  --runtime --sudo-docker --web-build-root "$trusted_build_dir"
```

这一步的信任前提是“新镜像确由本轮可信源码构建、构建成功且部署使用它”，不是镜像tag叫相同的名字。若该前提不能核验，保留unverified。校验后可清理临时期望产物；核查脚本自身仍然只读。

不在服务器时可只核对公开接口：

```bash
python3 scripts/check_report_deployment.py --base http://49.233.72.222/yihot
```

这种模式会保留 `runtime.*.status=unverified` 和 `deploymentVerified:false`；返回2是预期的未核验状态，不应把它改成成功绕过上线闸门。旧报告缺少新可选字段不会被判为损坏。

## 交给有腾讯云连接的 WorkBuddy

> 连续完成 YiHot 报告上线与11月17日验收准备。先读AGENTS.md、docs/PROJECT_CONTEXT.md、docs/EMAIL_DELIVERY.md和本文件；使用最新main，保留另一会话的修改，按blob核对三方，不强制覆盖、不用开发机旧.env。先备份数据库、当前共用镜像及 /opt/yihot-email-delivery/send_reports.py；沿用服务器现有三个compose组合重建Web/API/worker。独立备份并原子同步 deploy/email-delivery/send_reports.py 到 /opt/yihot-email-delivery/，不改变原.env、订阅人、outbox、模型开关或报告调度。保留部署所用同一次可信构建的Web build目录（不能取运行容器自比）；先跑合成Python测试，再用 --preview-json 预览真实公共DTO；预览通过后，只有用户已明确授权受控收件人时才使用 --test --test-to <该单个地址> 发送一次；不可无参数运行或只传--kind。不要读取EMAIL_TO、领取订阅outbox或向其他用户发送。运行 check_report_deployment.py --runtime --sudo-docker --web-build-root <可信build目录>，逐项处理版本/镜像/邮件timer/ExecStart问题并保存脱敏结果；不要把未核验改为通过。11月17日08:00后核对实际日报记录、reports.daily任务和正常邮件回执；不手动重编旧报告、不批量补发。把实际部署时间、源码blob/镜像、独立邮件哈希、核查结果与回滚点写入Git的脱敏交接，未观察到的SMTP送达和报告质量保持待验收。

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

## 实际部署记录（2026-11-16 19:41–20:06，UTC+8）

第一次把新版报告与独立邮件脚本同时落到生产。此前本文档里的「未部署」状态到此结束，但**报告质量仍未验收**：新字段只对将来生成的期刊生效，W46/10月都没有 insights 与 yesterdayHot。

| 项 | 值 |
| --- | --- |
| 源码 | `main` @ `81052f0`（GitHub 与 `/opt/yihot` 同一份，`git archive` 同步） |
| 镜像 | `aihot-app` `555aaede1060`，api / worker / web 三容器同镜像 |
| 独立邮件脚本 | sha256 `92993404c54cbff3…`（46,657 B），旧版备份为 `send_reports.py.bak.20261116`（37,914 B） |
| 数据库备份 | `/opt/yihot-archive/base/yihot-20261116-1955.dump`（417 MB，部署前） |
| 迁移 | 无。生产已在 `0056_geo_auto_scan`，本轮没有新迁移 |
| 上线核查 | `check_report_deployment.py --runtime --web-build-root <新镜像内 build>` → `deploymentVerified: true`（api/web/worker 与 mail 四项 verified，89 个 web build 文件比对一致，ctime 均早于容器启动） |
| 离线预览 | 真实公共 DTO：周报 `2026-W46`（18 KB HTML）、月报 `2026-10`（30 KB）；`insights: 0`、`hasYesterdayHot: false`，`modelCalls: 0`、`sent: false` |
| Python 测试 | 服务器上 `python3 -m unittest discover -s tests -p 'test_report_*.py'` 10 项全通过 |
| 未做 | 未发送任何邮件、未重编历史期刊、未改 `.env`／订阅人／outbox／调度 |

**邮件脚本替换方式**：`sudo tee` 写入同目录隐藏临时文件 → `chmod 700` + `chown root:root` → `py_compile` 通过 → `mv` 原子改名（timer 每 30 分钟读一次，避免读到半份脚本）。`ExecStart` 本来指向该路径，未改 unit。

**当天顺带修的两处**：

- 合并后 `/all` 在「pool 响应缺 `filters`」时会 `TypeError: reading 'topic'` 整页 500（`5535940`）：页面改为用 URL 自己的参数兜底，回归 fixture 也补齐真实 DTO 的字段。
- 月报残余块按固定 20 条切分会把 21 条切成「（1）20 条 / （2）1 条」（`81052f0`）：改为等分（11/10），上限不变。

**回滚点**：镜像 `aihot-app` 上一版 ID、`send_reports.py.bak.20261116`、上述 dump。回滚不删 reports/revisions/subscriptions/outbox，不改旧期日期。

## 补充：把三处文字长度改回原值（2026-11-16 21:20）

这条报告线在重写提示词时把三处长度目标一并压小了。新功能（昨日热榜、证据洞察、折叠摘要、01 起编号）一个都不依赖这些压缩，压缩的唯一后果是**新生成的期比已经发过的期更薄**。用户要求恢复原长度，故：

| 位置 | 压缩后 | 恢复为 |
| --- | --- | --- |
| 周报 / 月报 overview（`compose.ts` 的 `overviewLength`） | 75 / 120 字 | **150–300 / 200–400 字** |
| 各分节 summary（`industry/prompts/report-period.md`） | 一句话，≤55 字 | **80–180 字** |
| 日报 leadParagraph（`industry/prompts/report-daily-lead.md`） | 1–2 句，≤95 字 | **2–3 句，≤150 字**（标题 28 → 30 字） |

保留不动的：反空话、禁杜撰、overview 不复述 insights 的措辞；以及**日报 highlights 仍是 1–3 条**（那是条数不是长度，属于另一项编辑决定，不在本次改动范围内）。

提示词文件变了，`promptVersion` 的哈希随之改变，新生成的期会带新的版本号——这是预期行为，用来区分压缩期与恢复期。生效范围：**只对将来生成的期刊**；`daily 2026-11-16`、`weekly 2026-W46`、`monthly 2026-10` 三期内容不动（`revision` 仍为 1 / 1 / 2）。


## 首日验收：2026-11-17 08:00 那期日报（实测，非预告）

这是新版报告第一次用真实数据生成，全部数字取自 11-17 23:20 的生产库与线上页面。

| 项 | 实测值 |
| --- | --- |
| `reports` 行 | `kind=daily`, `key=2026-11-17`, `revision=1`, 生成时间 11-17 08:00（北京） |
| 昨日热榜 | `yesterdayHot.day = 2026-11-16`，**6 条** |
| 洞察 | `insights = 0`（日报不产 insights，设计如此） |
| 导语长度 | **104 字**（落在恢复后的 ≤150 区间；若按压缩期那个 ≤95 的目标写，这一句会短掉一截） |
| 版面 | 6 版 |
| 页面 | `/daily/2026-11-17` = **200**，正文含「昨日热榜」；`/daily` 仍 302 → `/weekly`（设计如此，不是故障） |
| 邮件 | `newsletter_outbox` 近 30 小时 3 封 `sent`，最后一封 08:01 |
| 任务 | `job_runs` 的 `reports.daily` = `ok`，00:00→00:00（UTC） |
| 部署核查 | `deploymentVerified: true`（api / web / worker 三项 `verified`，89 个 build 文件一致） |

结论：**增量按预期落地**——热榜插在最前、编号从 01 起、旧版面一条没少，模型调用没有因为热榜多花一分钱（热榜由程序算）。

### 两个必须写下来的坑

1. **`reportQualityVerified` 永远是 `false`，别等它翻转。** 它不是一个待达成的门槛，而是 `scripts/check_report_deployment.py:124` 里**写死的常量**，同一行的 `note` 解释了原因：公开 DTO 可达性、源码/镜像比对、timer 存在，都不能证明报告写得好。11-16 的预期「11-17 那期可能让它翻转」是错的，这一项没有翻转也不会翻转。判断质量只能靠人读那一期。
2. **只重建 `web` 会让核查报 `app mismatch`。** 11-17 当天真实发生：web 容器已经在跑新镜像（页面行为正确），api / worker 还挂着旧镜像 ID；`ReportPaper.tsx` 在 api / worker 里与 `/opt/yihot` 源码不一致，于是 `deploymentVerified` 变 `false`——尽管它们根本不渲染这个文件。修法不是改脚本，而是让三个容器同镜像：`sudo docker compose up -d --no-deps --force-recreate api worker`，之后 `sameRunningImage: true`、三项全 `verified`。**这一条已在 11-17 23:2x 现场修好并复核。**

### 还没验到、或等人决定的

- **周报的洞察页**：`2026-W47` 要到 **11-23 06:00** 才生成（`/weekly/2026-W47` 现在 404 属正常）；有 insights 时才会出现「本周观察」，且原「头条」不再单列。
- **月报**：下一期 **12-01 06:30**。
- **`privacy.md` 还有 3 处「请填写」**（运营主体、生效日期、隐私事务联系方式）——只能由站长本人给，不许代填。
- **日报「今日看点」条数**：现在是 1–3（原 3–5）。属编辑决定，未改。
- **`/daily` 入口**：仍 302 跳 `/weekly`，日报只能从 `/daily/<日期>` 或归档页进入。是否在导航里露出，未定。
