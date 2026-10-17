# 公益总报邮件投递

Yi-Hot 只使用自己的周报、月报作为邮件内容来源。`deploy/email-delivery/send_reports.py` 从公开报告 API
读取最新一期，生成适合邮件客户端的 HTML 与纯文本版本，再通过 SMTP 逐个发送。它不采集新闻、不生成另一份
报告，也不会调用模型。

服务器配置位于 `/opt/yihot-email-delivery/.env`，支持：

```dotenv
EMAIL_DELIVERY_ENABLED=true
EMAIL_FROM=sender@qq.com
EMAIL_PASSWORD=QQ邮箱SMTP授权码
EMAIL_TO=reader1@example.com,reader2@example.com
EMAIL_SMTP_SERVER=smtp.qq.com
EMAIL_SMTP_PORT=465
YIHOT_BASE=https://49.233.72.222/yihot
```

若 `EMAIL_FROM`、`EMAIL_PASSWORD` 未单独设置，会回退使用现有邮件信源服务的 `MAIL_SOURCE_USER`、
`MAIL_SOURCE_PASSWORD`。每个收件人单独发送，彼此看不到地址。`/var/lib/yihot-email-delivery/state.json`
记录 `报告类型 + 期号 + 收件人`，定时器每 30 分钟检查一次，但同一期不会重复投递。

操作命令：

```bash
python3 send_reports.py --test                 # 最新周报测试邮件，不写发送回执
python3 send_reports.py --initialize           # 首次部署立游标，不补发既有周报、月报
python3 send_reports.py --kind weekly          # 投递最新周报
python3 send_reports.py --kind monthly         # 投递最新月报
systemctl status yihot-email-delivery.timer
journalctl -u yihot-email-delivery.service -n 50 --no-pager
```
