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

Adapted from PsyHOT (upstream commits `6a3dde1` and `cef8796`, 2026-10-06 and 2026-10-18), rewritten
for the charity domain.

This list is limited to what PsyHOT added **on top of** AIHOT. Everything PsyHOT inherits from AIHOT is
already covered by the AIHOT section above and is not credited twice. Checked on 2026-10-20 by
unshallowing both upstreams and diffing file by file; the line counts and dates below are from that
check, not from commit messages.

| YIHOT file | Where it comes from | How close |
| :--- | :--- | :--- |
| `packages/contracts/src/skill.ts` (9 lines) | PsyHOT, `6a3dde1` (2026-10-06). AIHOT has never had this file in its history. | identical |
| `packages/backend/src/publication/skill.ts` (275 lines) | PsyHOT, `6a3dde1`. No AIHOT counterpart at any point. | 22 lines differ |
| `packages/backend/src/publication/agent.ts` (275 lines) | **split.** The skeleton — `answer()`, `PREAMBLE`, `NO_INTERNALS`, the `［SITE 不可信外部资料开始/结束］` fence, `stamp()`, `itemLines()` — is AIHOT's, added in `8d5a39b` (2026-10-01). PsyHOT rewrote it for its own domain in `6a3dde1` (2026-10-06), mainly by dropping the MCP layer AIHOT had. We carry PsyHOT's rewrite. | vs PsyHOT 51 lines differ; vs AIHOT's 2026-10-01 version 217 differ. 155 lines are byte-identical to AIHOT's version — i.e. PsyHOT started from it |
| `packages/backend/src/providers/everyinfra.ts` (103 lines) | PsyHOT, `cef8796` (2026-10-18). No AIHOT counterpart at any point. | cut down from PsyHOT's 163 lines |
| `packages/backend/src/sources/json-list.ts` (the `everyinfra_xhs` branch) and the matching wiring in `collect.ts` / `config-keys.ts` | PsyHOT, `cef8796`. No AIHOT counterpart. | file is 214 lines vs PsyHOT's 219 |

What that covers in prose:

- The self-verifying Agent Skill package (`SKILL.md`, `manifest.sha256`, `install.sh`) served from the
  site, and the removal of the MCP layer from the answer layer so one package serves HTTP only.
  The Markdown format and the externally-sourced-data fence themselves are AIHOT's, credited above.
- The paid-provider adapter pattern behind EveryInfra, including the budget-exhaustion break that
  keeps the already-paid listing.

**Not from PsyHOT** (previously listed here by mistake, corrected 2026-10-20):

- The per-source seat cap in daily issues. PsyHOT caps the *hot list* (`SINGLE_PARTICIPANT_PER_SOURCE = 2`
  in its `events/hot.ts`, commit `9a2e5bf`), which YIHOT has not adopted. The daily-issue cap we shipped
  and then withdrew (`DAILY_MAX_PER_SOURCE`) was written here, with AIHOT's own `PER_SOURCE = 2`
  (`packages/backend/src/reports/edition.ts`, a file YIHOT does not carry) and `service-dept/bandwidth`
  as the reference. It is in any case no longer in the code.
- The changelog's release-note style. That is a writing habit, not code, so it is documented as a
  reference in `docs/RELATED_PROJECTS.md` rather than asserted here as adapted material.

PsyHOT's mental-health-specific wording, hotlines, taxonomies, and personal-subscription logic are not used; YIHOT keeps its own charity taxonomy, copy, and crisis-referral wording.

### Withdrawing this attribution

The "thanks" in `README.md` is a courtesy and can be removed at any time by editing one sentence. This
section is not a courtesy: the files in the table above contain PsyHOT's MIT-licensed code, and MIT
requires the copyright and permission notice to travel with it. Removing this section while that code
is still in the tree would breach the licence.

To retire the attribution honestly, retire the code first — rewrite those five files (about 680 lines)
from the site's own requirements until no PsyHOT lines remain, then delete this section and the
README sentence together. Deleting only the text is not a withdrawal; it is an unlicensed copy.


## Repository-boundary note

`CochraneK/charity-intelligence` remains a separate YIHOT-adjacent data/evidence backend. `CochraneK/NewsMail` is a legacy migration source and is intended to be archived after its unique assets are accounted for.

This file is a provenance record, not a claim that every YIHOT file derives from AIHOT. File/module-level provenance should be added when code is imported or substantially adapted.
