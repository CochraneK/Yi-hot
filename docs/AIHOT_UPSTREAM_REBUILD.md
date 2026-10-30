# YiHot v3 · upstream-aligned rebuild

Status: **bootstrap in progress, not a deployed migration**.
Decision: keep `CochraneK/Yi-hot` private and its existing `main` as the production-compatible baseline. Preserve all legacy Git history. Do not reset, rebase, or force-push `main`.

## Why this exists

YiHot is a charity-specific AIHOT derivative. The existing `main` has substantially diverged from `KKKKhazix/AIHOT`, making file-by-file copying an increasingly expensive way to follow upstream. The new rebuild must have **the actual public AIHOT Git ancestry** and isolate the charity product's changes instead of replaying the old divergent engine.

The GitHub connector currently lacks repository-creation permissions, so the bootstrap uses **isolated private branches in the existing repository**. These may later be pushed into a separately created private repository, without losing the shared upstream ancestry.

## Branches and hard boundaries

| Ref | Meaning | Who may update it |
| --- | --- | --- |
| `main` | Existing, deployed YiHot version; preserve it | Existing YiHot workflow only |
| `chore/aihot-upstream-bootstrap` | Reviewable setup change | Migration work |
| `vendor/aihot-main` | Byte-for-byte public AIHOT history, tracking its `main` | `.github/workflows/aihot-upstream-sync.yml` fast-forward only |
| `rebuild/aihot-aligned` | New clean baseline, initially pointing at upstream AIHOT commit | YiHot migration commits only; never reset automatically |

After initial import, `rebuild/aihot-aligned` and `vendor/aihot-main` share history. On future upstream updates, merge `vendor/aihot-main` into the rebuild branch after CI; **never merge the rebuild branch into old `main`**. Production cutover must be an explicit, separate operation.

The sync workflow reads the *public* upstream and pushes only into *private* refs. It does not run external source code, import credentials, deploy Docker, touch databases, copy production data, or open PRs against the unrelated-history legacy `main`. Upstream history is preserved, not squashed.

## Migration map (no direct engine overwrite)

| Current YiHot asset | Target |
| --- | --- |
| `industry/site.ts`, `industry/features.ts` | Reconcile into upstream `site/site.ts`, with feature-specific behavior in modules |
| `industry/brand/`, `industry/pages/`, `industry/changelog.json` | `site/brand/`, `site/pages/`, `site/changelog.json` |
| `industry/taxonomy.ts`, `industry/topics.json`, `industry/selection.ts`, `industry/prompts/`, `industry/sources.json` | Remain industry-owned, reviewed for new upstream contract requirements |
| `apps/web/app/routes/admin/source-candidates.tsx` + source registry data | `modules/source-governance/` plus controlled seed/import assets |
| YiHot cost / usage / model management | Preserve functionality in `modules/usage/` or upstream-approved extension hooks |
| NewsMail parsing and email transport | `modules/newsletter/`, not a second collector or cron scheduler |
| charity-intelligence org registry and evidence | `modules/charity/` with read-only/import interfaces and immutable identity reconciliation |
| `compose.futureme-proxy.yml`, YiHot portal and `/yihot/` paths | Separate deployment overlays and portal integration; not in upstream engine |
| Historical articles, reports, settings, source config, admin overrides | Explicit **backed-up data migration**, after schema mapping and dry run |

Some assets might require adaptation rather than a direct copy. Do not assume YiHot's 20 seeded sources match its runtime PostgreSQL `sources.config`; a source JSON change does **not** update existing rows. Track and reconcile separately. Do not bulk-enable NewsMail or charity crawler candidates.

## Acceptance gates

- [ ] Workflow imported the official AIHOT commit history. Verify the two private branches exist.
- [ ] New rebuild branch's Git ancestry includes the exact upstream commit; retain its SHA.
- [ ] Independent site and industry configuration migrated without changing generic engine files unnecessarily.
- [ ] Existing YiHot capabilities inventoried and covered (including cost tracking, provenance, admin and history).
- [ ] Run upstream typecheck, standalone/backend tests, browser smoke, and migration checks on a **new test PostgreSQL**.
- [ ] Test `/yihot/`, portal and FutureMe routing in staging; do not reuse `main` deployments without proof.
- [ ] Snapshot and verify recoverability of production PostgreSQL, object files, secret configuration, and original repository state.
- [ ] Migration rehearsed with a backed-up copy of production data and zero unexpected data loss.
- [ ] A **new subsequent upstream commit** merges into the rebuilt branch without resetting YiHot-only changes.
- [ ] Cut over production separately, with smoke tests and tested rollback to existing `main`.

Never deploy `vendor/aihot-main` directly; it is the upstream demo configuration, not YiHot.

## Normal updating after first migration

```bash
git remote add upstream https://github.com/KKKKhazix/AIHOT.git
git fetch upstream main
git switch rebuild/aihot-aligned
git merge --no-ff upstream/main
# Resolve any public-engine vs YiHot-extension conflict. Run tests; then push.
```

The Actions job `AIHOT upstream sync` also periodically fast-forwards `vendor/aihot-main`, but **never automatically merges it into the rebuild branch**. This makes upstream changes visible without risking production drift.

**Automation permission:** GitHub's ordinary `GITHUB_TOKEN` cannot push public AIHOT commits that add or modify `.github/workflows/` files: GitHub requires a token with the separate **Workflows: write** permission. Merely enabling Actions "Read and write permissions" does not grant that capability. The bootstrap branches were created with the authorized GitHub connector.

For unattended future fast-forward updates, add a repository-scoped token as the Actions secret **`AIHOT_SYNC_TOKEN`** under **Settings → Secrets and variables → Actions**. Use a short-lived fine-grained PAT restricted to `CochraneK/Yi-hot` with **Contents: Read and write** and **Workflows: Read and write** (or an appropriately scoped GitHub App token). Do **not** paste the token into chats, documentation, workflow files, or Git. Without the secret, the daily workflow still fetches/checks the public upstream and emits a visible warning when updates are pending; it no longer claims to have imported them. The vendor branch can also be updated by an authorized operator via the GitHub connector.

Never commit `.env`, credentials, or production databases.

## 2026-10-30 决策变更：改为真正的 fork

用户决定要 GitHub 上的 fork 归属标识，本节覆盖上文「keep `CochraneK/Yi-hot` private …
Do not reset, rebase, or force-push `main`」的那一条决策（其余分支约定仍然有效）。

GitHub 没有「把已有仓库转成 fork」的接口，所以做法是**新建 fork 再迁历史**：

1. `POST /repos/KKKKhazix/AIHOT/forks` → 得到 `CochraneK/AIHOT`（`fork=true`，parent 指向上游）。
2. 本地 `git replace --graft 1ade945 07d4c77` 把部署快照接到上游历史（仅本地视图）。
3. `git push --force` 到 `CochraneK/AIHOT`，连同 `rebuild/aihot-aligned`、`vendor/aihot-main`
   和两个 `docs/*` 分支一起迁移。

### 已核对的事实（2026-10-30 全部做完）

- **`git push` 不会发送 replace 视图**：graft 后直接推，GitHub 的
  `compare KKKKhazix:main...CochraneK:main` 仍返回 **No common ancestor**。
- **固化已完成**：用 `git commit-tree` 逐个重建提交链（不用 `filter-branch`——它会把上游那 84 个
  提交也一起重写，且默认把 committer date 刷成当天）。做法：对每个自有提交读原对象，
  tree 不变、parent 换成已映射的新 SHA、root 的 parent 改为 `07d4c77`，并显式导出
  `GIT_AUTHOR_*` / `GIT_COMMITTER_*` 环境变量——**这一步不能省，否则 GitHub 上的提交时间会全变成重写当天**。
  结果：374 个自有提交重写，458 个提交连成一条线，`merge-base upstream/main HEAD = 07d4c77`，
  GitHub 侧 `compare` 从 No common ancestor 变成 **ahead 374 / behind 82 / diverged**。
  `git diff 旧tip 新tip` 为空，内容零变化。之后 `git replace -d 1ade945` 删掉临时 graft。
- **旧仓不删，改名 `CochraneK/yi-hot-old` 保留**（5 个分支、15 个 PR、创建时间 2026-08-24 全在）。
  15 条 PR 已另在新仓库重建为 issue #1–#15（fork 默认禁用 Issues，需先 `PATCH has_issues=true`）；
  另存一份 `docs/LEGACY_PR_ARCHIVE.md`。
- fork 默认关 Issues，Actions 却会自动跑起来：推完 3 分钟 bot 就提交了
  `docs(pdf): refresh rendered YiHot manuals`。

### 迁移后需要重做的事

- **3 个 Actions secrets 必须重填**（API 读不到旧值）：`AIHOT_SYNC_TOKEN`、
  `YIHOT_TRANSLATE_API_KEY`、`YIHOT_TRANSLATE_BASE_URL`。缺 `AIHOT_SYNC_TOKEN` 时
  同步工作流降级为「只检查并告警」，不推送。
- fork 的 Actions 首次需要手动启用；旧的 Actions 运行记录不随 fork 迁移。

## Provenance

Upstream: https://github.com/KKKKhazix/AIHOT (MIT; retain LICENSE/NOTICE and third-party attribution; AIHOT names and logos are not YiHot branding).

Source legacy: https://github.com/CochraneK/Yi-hot ; https://github.com/CochraneK/NewsMail ; https://github.com/CochraneK/charity-intelligence

Last reviewed during initial setup: 2026-10-10. No production changes authorized by this document.
