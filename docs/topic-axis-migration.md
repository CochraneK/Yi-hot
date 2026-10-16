# 筛选轴重构：内容类型 → 救助儿童会使命主题（2026-10-16）

## 目标

`/all` 的筛选轴从"内容类型"（政策/机构/项目/募集/研究/一线/观点，`?category=`）重构为
**救助儿童会使命主题**（儿童教育/营养健康/性别平等/儿童保护/网络保护/青年发展/亲子养育/
残障融合/应急救援/环境保护/募集筹款/政策倡导/招募实习，`?topic=<slug>`）。存量文章经
重新分析补打主题标签；旧 `?category=` 链接与接口保持可用（API 未删参数，只是筛选行不再展示）。

## 改动清单

| 文件 | 改动 |
|---|---|
| `industry/taxonomy.ts` | `TOPIC_TAGS` +9 个使命主题词；`TAG_SYNONYMS` 补近义词入口（营养→营养健康等） |
| `industry/topics.json` | field 组 +9 个主题页（child-education / health-nutrition / gender-equality / youth-development / parenting / online-safety / fundraising-campaign / policy-advocacy / careers），slug 避开 genre 组现有名 |
| `industry/save-the-children.ts` | 新增：13 个使命主题的 slug/名称/dashboard 同款颜色（筛选 pill 与主题卡共用） |
| `industry/prompts/content-understanding.md` | 分类/主题/实体三张白名单由硬编码改为 `{{categoryTags}}/{{topicTags}}/{{entityTags}}` 占位（原来硬编码停在旧 15 主题，实体表还缺救助儿童会） |
| `packages/backend/src/editorial/writing.ts` | `UNDERSTAND_SYSTEM` 传入三张词表（与 structure 步同一事实源） |
| `packages/backend/src/editorial/analyze.ts` | understand/structure 的 prompt 版本改用 `promptVersionWithVocab`（词表入哈希，`analyses.prompt_version` 如实记录） |
| `packages/backend/src/editorial/prompts.ts` | 新增 `promptVersionWithVocab` |
| `apps/web/app/features/feed/Filters.tsx` | 新增 `TopicTabs`（全部/一手 + 13 个使命主题 pill，圆点用主题色） |
| `apps/web/app/routes/all.tsx`、`home.tsx` | 筛选行换 `TopicTabs`；loader 读 `?topic=` 传给 `/api/site/pool`、`/api/site/timeline`；meta 文案改"可按主题筛选" |
| `apps/web/app/routes/topics.tsx` | 主题卡配色对齐 dashboard 14 色板，补 9 个新主题色 |
| `scripts/enqueue-analysis.ts` | 注释更新（回填语义） |

机制说明：`?topic=<slug>` 的后端链路（`parseFilters → loadTopicTags → topicCondition → pool/timeline`）
在本改动之前就已存在；本次把前端筛选行接到这条链上，并让词表能产出新主题标签。

三条工作线（筛选轴重构 + 站点品牌化 + 邮件源修复）的统一 diff 与验证记录见
`docs/patches/2026-10-16-topic-axis-branding-email.patch` 及 `docs/patches/README.md`。

## 部署顺序（生产，49.233.72.222）

```bash
# 1) 本地 → GitHub（git push 坏，用 tools/sync.py，需 GITHUB_TOKEN）
python tools/sync.py -m "topic axis: /all filter row on Save the Children mission topics; vocabulary + prompts + backfill runbook"

# 2) 服务器：rebuild（industry/ 与 prompts 都进镜像，必须 rebuild）+ up -d
sudo -n docker compose -f docker-compose.yml -f compose.futureme-proxy.yml build
sudo -n docker compose -f docker-compose.yml -f compose.futureme-proxy.yml up -d

# 3) 新主题页入 topics 表（只增不覆盖）
sudo -n docker exec aihot-api-1 node scripts/seed.ts --topics-only

# 4) 存量回填：重跑分析，补打主题标签（pg-boss 并发 6，边跑边消费）
sudo -n docker exec aihot-api-1 node scripts/enqueue-analysis.ts --all --limit 1000
```

费用说明：回填时 prefilter/score/summarize 三步 prompt 未变，receipt 按 system 哈希复用
（**不二次计费**）；understand/structure 两步因词表进入 system prompt，哈希变化、必然重算
（这是回填的预期成本，约每篇 2 次调用）。

## 验收

回填进度（新主题标签覆盖，服务器 psql，注意 psql 显示 UTC）：

```sql
SELECT tag, count(*) FROM publications p, unnest(p.tags) AS tag
WHERE tag IN ('营养健康','儿童教育','性别平等','青年发展','亲子养育','网络保护','募集筹款','政策倡导','招募实习')
GROUP BY tag ORDER BY count DESC;

-- 分析队列深度（应逐渐归零）
SELECT processing_state, count(*) FROM articles GROUP BY processing_state;
```

前端：`/all` 筛选行应为 13 个使命主题（带彩色圆点）；`/all?topic=health-nutrition`
等 URL 有内容即链路通；旧 `?category=policy` 链接仍可用。管理页 `/yihot/admin/runs`
看回填失败分组。

## 回滚

- 前端：`git revert` 本次提交即可（词表与主题页保留无害——多几个可选标签）。
- 词表若也要退：`TOPIC_TAGS` 删新词 → rebuild → 已入库的新标签不影响筛选（pill 不含它们）。
