# docs/patches — 2026-10-16 统一补丁说明

## 文件

`2026-10-16-topic-axis-branding-email.patch`（约 86 KB，33 个文件，+584/−89）
把三条互不依赖的工作线打成一份 diff，便于整体评审、备份或在干净检出上重放：

1. **筛选轴重构（本轮主线）**：`/all` 与首页筛选行从"内容类型"换成救助儿童会 13 个使命主题。
   `industry/taxonomy.ts`（+9 主题词、近义词）、`industry/save-the-children.ts`（新，13 主题
   slug/名称/dashboard 同款色）、`industry/topics.json`（field 组 +9 主题页）、
   `industry/prompts/content-understanding.md`（白名单改占位符，修掉硬编码停在旧 15 主题的 bug）、
   `packages/backend/src/editorial/`（词表入 understand system prompt、promptVersionWithVocab）、
   `apps/web/app/features/feed/Filters.tsx`（新 TopicTabs）、`all.tsx`/`home.tsx`（筛选行、
   loader 读 ?topic=、meta 文案）、`topics.tsx`（主题卡配色）、`scripts/enqueue-analysis.ts`（注释）、
   `docs/topic-axis-migration.md`（新，部署 runbook）。
2. **站点品牌化 ②③④⑤（上轮工作树待推送）**：导航改名（总报/动态/热点）、主题卡彩色边框、
   侧栏 logo、移动/桌面一致性，涉及 ~15 个 web 文件 + `industry/brand/save-the-children.svg`（新）。
3. **邮件源 publishedAt 修复 + 10.1 回填**：`deploy/email-source/collect.py`、`test_collect.py`、
   `docs/EMAIL_SOURCE_DEPLOY.md`。

## 应用方式

```bash
git apply 2026-10-16-topic-axis-branding-email.patch   # 干净检出上重放
git apply --check 2026-10-16-topic-axis-branding-email.patch   # 只验能不能打上
```

补丁含 3 个新文件（save-the-children.ts / save-the-children.svg / topic-axis-migration.md），
`git apply` 会自动创建；无二进制内容。

## 已验证（2026-10-16，本机）

- typecheck：contracts / backend / api / worker / tests / web 六个包全过（web 需先
  `react-router typegen`）。
- `react-router build`（client + SSR）通过。
- 单测：53 个中 22 个无库测试全过；31 个失败全部是 `DATABASE_URL unset` 的环境不变量
  （tests/setup.ts 要求 `*_test` 库），与改动前基线一致，非代码问题。
- `scripts/source-registry-audit.mjs --check` 通过。
- `industry/topics.json` 结构校验：50 个主题、9 个新 field 主题、related slug 全部存在、无重名。

## 部署顺序

见 `../topic-axis-migration.md`「部署顺序」一节：sync.py 推送 → docker compose build
（industry/ 与 prompts/ 进镜像，必须 rebuild）→ `seed.ts --topics-only` →
`enqueue-analysis.ts --all --limit 1000` 回填。

## 交接

`../HANDOFF-2026-10-16.md` 是可复制给任何 AI/维护者的自包含交接单（当前状态、剩余 5 步、
验收、回滚、环境坑）。本补丁含该文件；推送后可直接从仓库读。
