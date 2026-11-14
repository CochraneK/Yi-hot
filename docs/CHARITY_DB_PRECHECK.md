# YiHot · 公益资产整合 Phase 2：机构库只读预检

> 2026-11-14 GitHub 代码快照。**这不是腾讯云生产验收，也没有读取用户的本机 SQLite。**
> 集成总原则仍以 [INTEGRATION_ROADMAP.md](INTEGRATION_ROADMAP.md)、[SOURCE_GOVERNANCE_DESIGN.md](SOURCE_GOVERNANCE_DESIGN.md) 为准。
> 本文是可执行的下一道数据闸门；没有直接导入功能。

## 资产边界（避免重复建设）

| 仓库 / 资产 | GitHub 可确认的归属 | 下一步 |
|---|---|---|
| Yi-hot | 唯一对外资讯、事件、报告、邮件及后台入口 | 主平台；生产状态另核验 |
| NewsMail | PR #33 已将旧版本、14 个文件、99 条候选的对账并入主仓库；5 条有明确代码映射 | 旧任务与备份/实投确认后再归档，**不恢复独立调度** |
| charity-intelligence | 机构、资格、证据、关系、年报的历史 SQLite 数据域；Git 有 Schema/脚本，不含真实主库 | 先原机备份、只读验数、复核身份，后最小读接口 |
| wechat-article-analysis | 词频、TF-IDF、NMF、共现和 HTML 报告脚本 | 未来作为按机构运行的离线分析任务，不再独立产出新闻 |
| 私有公益 Skill 参考资产 | 采集经验、公益审议模板等可参考 | 逐 Skill 审核许可/凭据；不整库复制，不绕过访问控制 |
| 旧版 YiHot 归档仓库 | GitHub 已显示 archived | 保留历史，不恢复并行维护 |
| red-map | 历史文化/公共教育数字展馆 | 与日常公益情报不同事实域，不强行合库 |
| OpenPublic Audit | 本次可见仓库清单中无同名仓库，代码状态**未验证** | 定位后仅接“可追溯审计线索与复核状态”，不得自动定性 |

NewsMail 的源码账本详见 [NEWSMAIL_MIGRATION.md](NEWSMAIL_MIGRATION.md)。既有 YiHot 监管记录、来源登记、邮件订阅、公众号渠道不重复开发。

## 历史风险，不得当作当前数据库结论

charity-intelligence 旧仓库内部《STATUS-2026-10-19.md》 曾报告：14,327 条机构、53 组同码多行（106 行），新闻—机构关联仅 31 条。它纠正早先“80 组同名误合并”的说法：主要问题是登记机关与机构名称错位，不能因信用代码相同就合并。

以上只对应旧机 10 月 19 日快照。真实 SQLite、WAL 与原始证据不在 Git；当前数量、完整性、变更无法推断。**不得直接用信用代码作为唯一主键，不得把缺失写 0，不得把同码异名自动判作更名。**

## 在旧数据所在电脑执行

1. 检查数据库及附件、WAL、备份实际位置。仅在有权限且不违反来源访问条件时使用。
2. 使用旧仓库已有的 scripts/backup_db.py 在线备份并验证完整性；在受控安全位置留可恢复副本，不放进 Git、聊天或邮件。
3. 进入 YiHot 仓库，对**一致性备份副本**执行：

    python3 scripts/charity_db_preflight.py --db /private/path/charity_intelligence_backup.sqlite

    python3 -m unittest discover -s tests -p test_charity_db_preflight.py -v

4. 预检使用 SQLite mode=ro 和 query_only=ON；不建库、不写库、不发网络请求、不调用模型。只返回汇总数量、阻断原因，不输出机构名、信用代码或原文。仅保存**脱敏的汇总报告和备份验证记录**。
5. 即使返回 REVIEW_REQUIRED 且无 blockers，脚本仍恒为 migration_authorized=false，不批准导入。遇到 BLOCKED 只进入人工裁决，不自动删行或改库。

## 最小关联契约（计划，非已上线 API）

- **Organization**：canonical ID 稳定、保留旧 org_id 对照和更名史；源数据另存。
- **OrganizationIdentityClaim**：每个名称/信用代码/登记机关的候选附证据、观察时间和冲突状态，不因字段匹配就升级为已确认。
- **Evidence**：来源 URL、抓取时间、等级、指纹、可用性；原始全文是否可公开另判。
- **ArticleOrganizationMention**：文章与机构多对多关联，记录命中词、方法、置信度和复核状态，不因同域名认定同一机构。
- **ReviewQueue**：冲突先待裁决，区分 Raw / Fact / Harmonized / Derived，改判可追溯。

首个业务切片：内部搜索机构 → 显示带截止日的基本档案 → 带回链的新闻和监管记录 → 关联存疑明确标“待核实”。先只读、先权限保护、先灰度样本。

### 上线闸门

1. 有可恢复的库备份、数据截止日、行数和 integrity_check 脱敏证据。
2. 同码异名、同名多码、历史名称、孤立引用有裁决或搁置记录，以及可逆的 legacy→canonical 映射。
3. 检查来源许可、个人信息与监管指控状态；只有被批准的字段对外。
4. 独立临时库跑导入/回滚，对照机构、资格、证据和关联数量，并抽样核对原始引用；绝不先改生产。
5. 通过后才由批准的部署流程接入 YiHot，旧库和原始证据不因迁移删除。

## 与生产安全独立

[Issue #21](https://github.com/CochraneK/Yi-hot/issues/21) 的旧回执归档风险仍是生产阻断项。不能因 Git 合并或离线预检通过而恢复自动归档删除、改动腾讯云 timer。本次没有数据库迁移、源开关、邮件配置、导航或云端操作；回滚只需撤回脚本、测试和本文。
