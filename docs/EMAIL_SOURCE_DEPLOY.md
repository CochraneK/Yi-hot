# QQ 邮箱信源部署

YiHot 使用专用 QQ 邮箱的 IMAP 只读入口收集两个已批准来源：

- `email-amcham-events`：显示发件人 `amchamevent@amchamchina.org`，信封域 `ebmail.amchamchina.org`；仅保留社会影响力、公益、ESG、可持续发展等主题。
- `email-amity-chuanyi`：`aidechuany@batch.lingxi360.com`，按《慈善纪事简报》整期收集。

采集器在 `deploy/email-source/collect.py`。它以 `BODY.PEEK[]` 读取邮件，不改变已读状态、不移动或删除邮件；用 IMAP UID 做增量游标，用 Message-ID 哈希和规范 URL 做重复保护。首次运行只记录当前游标，不导入历史邮件，避免旧闻刷屏和模型费用突增。之后由 `yihot-email-source.timer` 每 30 分钟运行。

邮件 `Date` 头会写入 `publishedAt`（保留时区偏移），所以卡片显示的是邮件发送时间，而不是本站收录时间；无时区的 `-0000` 头不可信，会被忽略并回退到收录时间（宁可显示「收录」也不猜一个时间）。AmCham 的 Glue Up 跟踪链接会本地解析为规范活动地址；退订、订阅管理和统计链接会被剔除。邮件正文只作为站内理解素材，公开出口仍按来源的 `site_fulltext=false` 只展示摘要与原文链接。

运行时凭据存放在服务器 `/opt/yihot-email/.env`，权限 `600`。QQ 邮箱使用 `imap.qq.com:993` 和单独生成的 IMAP/SMTP 授权码，不能填写 QQ 登录密码。采集器向既有 `POST /api/ingest/items` 推送，使用独立的 `INGEST_TOKEN`；该 token 至少 16 位，并随其他生产凭据进入 `secrets/credentials.env.enc`。

部署前运行：

```bash
python -m unittest discover -s deploy/email-source -p "test_*.py" -v
```

部署后检查：

```bash
systemctl status yihot-email-source.timer
journalctl -u yihot-email-source.service -n 50 --no-pager
```

日志只输出来源、扫描数、接收数和新增数，不输出邮箱授权码、邮件正文、Message-ID 或完整跟踪 URL。

## 回灌历史邮件（可选，一次性）

首次部署只记录游标、不回灌历史。若要把某个日期之后的邮件一次性补入（例如从 2026-10-01 起），用 `MAIL_BACKFILL_AFTER` 手动跑一次：

```bash
# 在服务器上，以能写 /var/lib/yihot-email 的身份运行（systemd 服务本身是 root），
# 带上运行时 .env（含 MAIL_SOURCE_* 与 INGEST_TOKEN），并额外指定回灌起始日
set -a; . /opt/yihot-email/.env; set +a
sudo -E MAIL_BACKFILL_AFTER=2026-10-01 python3 /opt/yihot-email/collect.py
```

行为说明：

- 该模式会**重新扫描整个邮箱**，只保留 `Date` 在起始日（含当天，按北京时间）及以后的邮件，按显式 backfill 入库；起始日之前的旧邮件一律跳过。
- 无 `Date` 头的邮件无法判断是否在窗口内，同样跳过（不会被误灌）。
- 跑完后会把 UID 游标推进到当前最大 UID，之后 `yihot-email-source.timer` 的每 30 分钟增量采集恢复正常，不会重复处理。
- 重复的邮件按 URL 去重；已入库的若这次带上了真实 `Date`，会顺带修正其 `published_at`（这是修正「时间不对」的正规路径，不需要直接改数据库）。
- `systemd` 的 timer **不会**设置这个变量，所以回灌只在手动执行时发生，不影响常规运行。
