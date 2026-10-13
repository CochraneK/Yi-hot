# QQ 邮箱信源部署

YiHot 使用专用 QQ 邮箱的 IMAP 只读入口收集两个已批准来源：

- `email-amcham-events`：显示发件人 `amchamevent@amchamchina.org`，信封域 `ebmail.amchamchina.org`；仅保留社会影响力、公益、ESG、可持续发展等主题。
- `email-amity-chuanyi`：`aidechuany@batch.lingxi360.com`，按《慈善纪事简报》整期收集。

采集器在 `deploy/email-source/collect.py`。它以 `BODY.PEEK[]` 读取邮件，不改变已读状态、不移动或删除邮件；用 IMAP UID 做增量游标，用 Message-ID 哈希和规范 URL 做重复保护。首次运行只记录当前游标，不导入历史邮件，避免旧闻刷屏和模型费用突增。之后由 `yihot-email-source.timer` 每 30 分钟运行。

邮件 `Date` 仅是投递时间，不写入 `publishedAt`。AmCham 的 Glue Up 跟踪链接会本地解析为规范活动地址；退订、订阅管理和统计链接会被剔除。邮件正文只作为站内理解素材，公开出口仍按来源的 `site_fulltext=false` 只展示摘要与原文链接。

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
