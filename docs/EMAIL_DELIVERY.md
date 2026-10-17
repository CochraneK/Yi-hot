# 公益总报邮件投递

Yi-Hot 只使用自己的周报、月报作为邮件内容来源。公开订阅采用双重确认：网站把确认信和新一期总报写入
PostgreSQL outbox，`deploy/email-delivery/send_reports.py` 从受保护的 ingest API 领取任务，生成 HTML 与纯文本
版本，再通过 SMTP 逐个发送。它不采集新闻、不生成另一份报告，也不会调用模型。

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
python3 send_reports.py --test                 # 最新周报测试邮件，不写发送回执
python3 send_reports.py --initialize           # 首次部署只建立 IMAP 退信游标
python3 send_reports.py --kind weekly          # 投递最新周报
python3 send_reports.py --kind monthly         # 投递最新月报
systemctl status yihot-email-delivery.timer
journalctl -u yihot-email-delivery.service -n 50 --no-pager
```

公开流程：`/subscribe` 提交 → 48 小时确认信 → 激活周报/月报 → 邮件内确认退订。服务用 IMAP
`BODY.PEEK[]` 只读扫描新增的标准 DSN 退信，识别 `Final-Recipient`/`Original-Recipient` 后把地址标为
`bounced`；不会因为普通来信或旧退信停发。
