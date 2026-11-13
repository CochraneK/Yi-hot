# NewsMail 迁入 YiHot：代码收口与旧运行任务退役

基线：NewsMail `c118b464e1d0806e35d5f940d3eb6ea3b8cd97db`；YiHot `0f764554`。本轮只做源码核验和离线回归，未连接腾讯云、旧 Windows 机器或真实邮箱。

## 已落实

- `data/source-registry/newsmail-migration.json` 对固定版本的 **14 个文件**逐项记录 Git blob、保留/改写/替代/放弃决定及 YiHot 对应路径。
- **99 个历史候选全部保留**在主仓库；5 条历史记录明确映射到已有的公益时报、南都公益基金会、国际救助儿童会及 UNICEF 中国配置。另 94 条继续作为 YiHot 的发现待办，**不需要为了归档旧仓库而全部开启采集**。
- `scripts/newsmail-migration.mjs` 对当前 seed 重新对账。输出中区分 `replacement_in_code`、`retained_for_review`、seed 启用标记和未核验的生产状态；共享域名或相同 URL 都不能自动裁决机构身份或采集权限。
- 原简报主循环、模板、SMTP 和标题前缀去重不再复制。YiHot 继续使用现有报告、投递回执、订阅确认和退订流程。匿名 MyMemory 翻译、旧用户目录缓存及会删除已有容器的 RSSBridge 部署脚本明确不迁移。
- 日期经验复核发现：`Date.parse` 会把 2 月 30 日滚到 3 月。现有列表日期解析已改为拒绝不可能的日历/时钟字段，保留未知日期；正常时区和闰年仍兼容。不重写历史库、不触发回灌。

这里没有新增信源、放开许可、发送邮件或触发模型；暂停的配置仍然暂停。UNICEF 的两条同名同 URL 历史候选各自保留 ID，不删除来源记录。

## 可复算的检查

在 YiHot 根目录、Node.js 24：

```bash
npm run newsmail:audit          # 只更新主仓库内的生成账本
npm run newsmail:audit:check    # 离线校验替代路径、映射和生成结果
node scripts/newsmail-migration.mjs --retirement-check
```

最后一条是严格的退役检查，当前返回退出码 **2** 并打印三个现场待核验项；常规 CI 只验证账本可复算，不会因已如实标注的生产待核验而报错。这个离线工具不能签发生产通过证明，不能通过把 JSON 标志改成 verified 绕过现场证据。

邮件解析与投递回归：

```bash
python -m unittest discover -s deploy/email-source -p 'test_*.py' -v
python -m unittest discover -s deploy/email-delivery -p 'test_*.py' -v
```

## 旧仓库退出维护前，只剩这三类现场核验

| 项目 | 需要保存的脱敏证据 | 当前状态 |
| --- | --- | --- |
| 停掉旧 NewsMail 调度 | 旧机器 cron / Windows 计划任务 / 外部 automation 的核验时间和任务名称；没有 GitHub workflow 不能证明没有其它调度 | 待核验 |
| 私有运行产物可恢复 | reports、logs、旧去重状态和配置的私有备份位置、校验值及恢复结果；口令、收件人、正文不进 Git | 待核验 |
| YiHot 替代路径运行 | 腾讯云代码版本；邮件输入、出版及投递的实际运行时间与结果。Gmail 已退订与 QQ 输入采集分别记录 | 待核验 |

用户说明 WorkBuddy 已完成修改；当前 GitHub 中能看到新增机构搜索源和飞书每小时上限，也存在对 PR #32 导航改版的撤回提交。本轮保留该状态，没有恢复导航或推断服务器部署结果。WorkBuddy 的现场验收摘要可追加到本文件；需要能对应机器、版本和时间，不能只写“已完成”。

三类证据齐全后，先把旧 README 标为迁移完成，再归档保留整个旧 Git 历史。不会自动删除仓库、停服务或修改真实订阅；后续候选复核在 YiHot 继续，无需重新维护 NewsMail。

## 下一轮入口

1. 处理 GitHub PR 和 CI；合并后由现有部署环境按原流程同步。
2. 补入上述三类 WorkBuddy 现场证据，决定旧 NewsMail 是否可归档。
3. 然后迁入公众号分析生成器；charity-intelligence 先找回真实 SQLite 和证据备份，避免拿历史数量替代验数。

回滚只需撤回本轮代码与账本提交；没有数据库迁移和生产状态修改。

## 本地验证

已通过类型检查、Web 生产构建及 17 项 Web 回归；日期测试在 UTC 与 Asia/Shanghai 两个进程时区均通过；6 项原信源对账、5 项新迁移检查、9 项邮件采集与 4 项邮件投递回归通过。投递测试屏蔽可选标题图片下载，使用文字回退，不访问外部网站。完整 PostgreSQL 后端和 Docker 检查交由本 PR 的 GitHub CI；本地环境没有 PostgreSQL/Docker，不冒充已经完成生产实测。
