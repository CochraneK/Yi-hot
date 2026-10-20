# Third-party notices

YIHOT is an independent project maintained in `CochraneK/yihot`.

## AIHOT

YIHOT v2 uses **KKKKhazix/AIHOT** as its primary upstream engineering reference for a modern news/intelligence pipeline, including concepts such as source ingestion, editorial processing, event clustering, publication layers, reports, administration, and agent-facing outputs.

- Project: `KKKKhazix/AIHOT`
- Original author/copyright: 数字生命卡兹克
- License: MIT License
- Upstream repository: https://github.com/KKKKhazix/AIHOT

AIHOT's source code is licensed under the MIT License. Where YIHOT incorporates or substantially adapts AIHOT code, the applicable copyright and MIT license notice must be retained.

The **AIHOT name and logo are not licensed for reuse**. YIHOT uses its own name, branding, domain configuration, charity taxonomy, data assets, integrations, and product positioning.

## PsyHOT

**PsyHOT** (`zhangheqing11/PsyHOT`) is a sibling customization of the same AIHOT framework for psychology and mental-health news. It is not an ancestor of YIHOT, but parts of YIHOT are adapted from it and credited here.

- Project: `zhangheqing11/PsyHOT`
- License: MIT License
- Upstream repository: https://github.com/zhangheqing11/PsyHOT

Adapted from PsyHOT (upstream commit `6a3dde11` and later), rewritten for the charity domain:

- `packages/contracts/src/skill.ts`, `packages/backend/src/publication/agent.ts`, `packages/backend/src/publication/skill.ts`, and the `/agent` page tabs: the Markdown answer layer under `/api/v1/agent`, the externally-sourced-data fence, and the self-verifying Agent Skill package (`SKILL.md`, `manifest.sha256`, `install.sh`) served from the site.
- The paid-provider adapter pattern behind `packages/backend/src/providers/everyinfra.ts` and the `everyinfra_xhs` branch of `packages/backend/src/sources/json-list.ts` follows PsyHOT's EveryInfra implementation, including the budget-exhaustion break that keeps the already-paid listing.
- The per-source seat cap in daily issues (`DAILY_MAX_PER_SOURCE` in `packages/backend/src/reports/compose.ts`) follows PsyHOT's hot-list rule that one source may not dominate a single ranking.
- The changelog is written in PsyHOT's release-note style: reader-visible outcomes only, no internal field or threshold names.

PsyHOT's mental-health-specific wording, hotlines, taxonomies, and personal-subscription logic are not used; YIHOT keeps its own charity taxonomy, copy, and crisis-referral wording.

## Repository-boundary note

`CochraneK/charity-intelligence` remains a separate YIHOT-adjacent data/evidence backend. `CochraneK/NewsMail` is a legacy migration source and is intended to be archived after its unique assets are accounted for.

This file is a provenance record, not a claim that every YIHOT file derives from AIHOT. File/module-level provenance should be added when code is imported or substantially adapted.
