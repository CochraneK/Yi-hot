# Upstreams and Attribution

## AIHOT

YIHOT v2 treats [`KKKKhazix/AIHOT`](https://github.com/KKKKhazix/AIHOT) as its primary engineering reference/upstream for the realtime news product layer.

AIHOT is developed by 数字生命卡兹克 / KKKKhazix and is licensed under the MIT License. The AIHOT name and logo are explicitly outside the MIT license and must not be reused as YIHOT branding.

### What YIHOT may learn/adapt from AIHOT
- API / worker / web separation.
- Industry package separation from generic platform code.
- Source ingestion and source participation modes.
- Deduplication, editorial prescreening and repeated scoring.
- AI-assisted title/summary generation.
- Event clustering and hotness calculation.
- Daily / weekly / monthly reports.
- Public publication layer shared by web/RSS/API/MCP.
- Admin, budgets, receipts, operations and monitoring patterns.

### What remains YIHOT-specific
- Charity-sector taxonomy and editorial criteria.
- Charity-sector source registry and source quality policy.
- Integration with `CochraneK/charity-intelligence`.
- Charity organization/entity views and evidence links.
- Existing YIHOT Lite/static deployment pathway where retained.
- YIHOT name, identity, product decisions and original charity-domain features.

## Attribution policy

When AIHOT code or substantial portions are copied or adapted:

1. Preserve the applicable MIT copyright and permission notice.
2. Record the source path/commit where practical in migration notes.
3. Add/update `THIRD_PARTY_NOTICES.md` before public release.
4. Do not describe AIHOT-derived engineering as original YIHOT implementation.
5. Do not use the AIHOT name or logo as the product brand.

## Other repositories

`CochraneK/NewsMail` and `CochraneK/charity-intelligence` are related first-party repositories. Their migration/integration boundaries are defined in `REPO-MAP.md` and `MIGRATION-V2.md`.
