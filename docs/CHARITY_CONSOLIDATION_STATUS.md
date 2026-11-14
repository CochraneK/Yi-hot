# charity-intelligence 与 YiHot：数据库与产品收口记录（2026-11-14）

## 已有、此次新增、尚未完成

**已有（主分支）**：YiHot 信源、选稿、邮件、报告、监管记录；NewsMail 迁移 #33；机构库只读统计预检 #34 (`scripts/charity_db_preflight.py`)。这些都不意味着真实慈善机构名录已进入 YiHot。

**此次新增**：`scripts/charity_db_preview.py` 对经备份的离线 SQLite 按一个已知 legacy `org_id` 生成**私有候选档案**（登记名、原信用代码、历史名称、新闻提及、证据链接与冲突/人工审核计数），不保存原文、不写源数据库、不访问互联网；`canonical_org_id = null`、`import_authorized = false`、`public_release_authorized = false` 恒定。引用是“待验证关联”，不是自动事实认定。可用于人工与 YiHot 新闻和监管记录对齐之前的样本试验。

```bash
# 第一步：在原机器用 charity-intelligence/scripts/backup_db.py 备份 + 验证 SQLite
python3 scripts/charity_db_preflight.py --db /private/backup/charity_intelligence.sqlite

# 第二步：选择原库真实 legacy org_id，输出到 Git 仓库外的私有目录
python3 scripts/charity_db_preview.py \
  --db /private/backup/charity_intelligence.sqlite \
  --org-id 'legacy_org_id_here' \
  --output /private/review/one-organization.json
```

源文件不存在时工具报错，不会新建空 SQLite；读模式为 `mode=ro` + `query_only`；不会合并同信用代码的不同机构，也不把无名称/无证据的条目自动判为风险。测试采用合成 SQLite 记录，源码不包含用户的真实数据库。

**旧 Schema 对照补充**：已核对旧仓库 `494cfcd2` 的 `schema_v2.py`、`collect_cszg.py` 和迁移 0005。早期登记证据通过资质、年报等事实表的 `source_ref` 指向 `evidence_id`，并无直接机构 ID；只查 `evidence.entity_id` 会漏项。预览现同时保留这条明确引用链和直接关联，不按共用域名/来源 URL 猜测归属。审核队列在有 `entity_type` 时仅统计 organization 项，避免串入同 ID 的资讯或信源审核。该合同回归仍用合成 SQLite 验证只读和机构间隔离。

## 阻塞归档的条件

原仓库曾在 2026-10-19 记录 14,327 家机构、53 组同码多行、31 条资讯关联；**这些是历史快照，不是当前验收结果**。真实 `data/charity_intelligence.sqlite`、WAL、`data/raw/` 和备份未入 Git。

- **数据保全**：在旧机确认当前 SQLite、原始证据及备份可恢复、表数/哈希/截止日一致，存储和访问授权成立。
- **身份规则**：逐组处理代码与机构名的脏数据，保留 `legacy_id → canonical_org_id` 映射、来源证据与人工裁决，不用名称或信用代码直接覆盖。
- **功能替代**：YiHot 上线可回滚的机构搜索/档案/资讯/监管证据最小链路，字段版权、隐私与人工审核通过；保留时间/来源与未确认标志。
- **运行替代**：旧机爬虫、日报、专家团、备份调度和 YiHot 生产各自核验；不能让两个系统重复采集、产生重复成本或突然停更。
- **仓库处置**：上述检查完成之前 **继续保留私有 charity-intelligence 及其完整数据/历史，不归档、更不删除**。现阶段将其定位成“遗留数据与采集证据资产”，停止重复建设新的新闻发布入口。

更详细的只读前置检查见 [CHARITY_DB_PRECHECK.md](CHARITY_DB_PRECHECK.md)，执行追踪见 [Issue #35](https://github.com/CochraneK/Yi-hot/issues/35)；生产归档 P0 仍见 [Issue #21](https://github.com/CochraneK/Yi-hot/issues/21)。
