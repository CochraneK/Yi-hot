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

If the private repository's Actions policy denies `GITHUB_TOKEN` writes, the import fails safely. An administrator must permit **Actions → General → Workflow permissions → Read and write permissions** for this repository, or perform an equivalent authenticated local `git fetch` / `git push`. Never commit a PAT, `.env`, or production database.

## Provenance

Upstream: https://github.com/KKKKhazix/AIHOT (MIT; retain LICENSE/NOTICE and third-party attribution; AIHOT names and logos are not YiHot branding).

Source legacy: https://github.com/CochraneK/Yi-hot ; https://github.com/CochraneK/NewsMail ; https://github.com/CochraneK/charity-intelligence

Last reviewed during initial setup: 2026-10-10. No production changes authorized by this document.
