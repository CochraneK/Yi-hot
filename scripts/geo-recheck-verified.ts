// Re-runs the auto-approval rules against candidates that are already verified.
//
// Rules get tighter over time (a village sharing a city's name, a newsroom
// dateline). Rows approved under the old rules would otherwise stay on the map
// forever. This pass puts back to pending every row the current rules would not
// approve — never to rejected, so the evidence survives for a human pass.
//
// Dry-run by default. Usage: node scripts/geo-recheck-verified.ts [--apply]
import { closeDb, sql } from "@aihot/backend/db";
import { AUTO_REVIEWER, decideAutoApproval } from "@aihot/backend/editorial/geo-auto-review";
import type { GeoRole } from "@aihot/contracts/geo-review";

interface VerifiedRow {
  id: number;
  place_text: string;
  role: GeoRole;
  evidence: string;
  place_id: string;
  place_name: string;
  title: string;
}

const apply = process.argv.includes("--apply");
const unknownArg = process.argv.slice(2).find(a => a !== "--apply");
if (unknownArg) {
  console.error(`Unknown argument: ${unknownArg}. Usage: node scripts/geo-recheck-verified.ts [--apply]`);
  process.exitCode = 1;
} else {
  try {
    const rows = await sql<VerifiedRow[]>`
      SELECT gc.id, gc.place_text, gc.role, gc.evidence, gc.place_id, gp.name AS place_name, a.title
      FROM geo_candidates gc
      JOIN geo_places gp ON gp.id = gc.place_id
      JOIN articles a ON a.id = gc.article_id
      WHERE gc.review_status = 'verified'
      ORDER BY gc.id ASC`;

    const failures: Array<{ row: VerifiedRow; reason: string }> = [];
    const remaps: Array<{ row: VerifiedRow; place: NonNullable<ReturnType<typeof decideAutoApproval>["place"]> }> = [];
    for (const row of rows) {
      const decision = decideAutoApproval({ placeText: row.place_text, role: row.role, evidence: row.evidence });
      if (!decision.approve) { failures.push({ row, reason: decision.reason }); continue; }
      // A rule can move a name to a different place without rejecting it: 浦东新区
      // used to stand for itself, now it is 上海. Keeping the old id would leave the
      // pin on a district the map no longer carries.
      if (decision.place && decision.place.id !== row.place_id) remaps.push({ row, place: decision.place });
    }

    const byReason: Record<string, number> = {};
    for (const item of failures) byReason[item.reason] = (byReason[item.reason] ?? 0) + 1;

    if (apply) {
      for (const item of remaps) {
        const place = item.place;
        await sql.begin(async tx => {
          // A county-level row carries its prefecture: the parent has to exist
          // before the child's foreign key can point at it.
          if (place.parent) {
            await tx`INSERT INTO geo_places (id, name, country_code, region, city, lat, lon, coordinate_precision, source_url)
              VALUES (${place.parent.id}, ${place.parent.name}, ${place.parent.countryCode}, ${place.parent.region},
                ${place.parent.city}, ${place.parent.lat}, ${place.parent.lon}, ${place.parent.precision},
                ${place.parent.sourceUrl})
              ON CONFLICT (id) DO NOTHING`;
          }
          await tx`INSERT INTO geo_places (id, name, country_code, region, city, lat, lon, coordinate_precision, source_url, parent_id, parent_name)
            VALUES (${place.id}, ${place.name}, ${place.countryCode}, ${place.region}, ${place.city},
              ${place.lat}, ${place.lon}, ${place.precision}, ${place.sourceUrl},
              ${place.parent?.id ?? null}, ${place.parent?.name ?? null})
            ON CONFLICT (id) DO NOTHING`;
          await tx`UPDATE geo_candidates SET place_id = ${place.id} WHERE id = ${item.row.id}`;
          await tx`INSERT INTO geo_review_audit (candidate_id, action, place_id, reviewer, reason)
            VALUES (${item.row.id}, 'remap', ${place.id}, ${AUTO_REVIEWER}, ${`moved from ${item.row.place_id} (${item.row.place_name})`})`;
        });
      }
    }

    if (apply && failures.length) {
      for (const item of failures) {
        await sql.begin(async tx => {
          await tx`UPDATE geo_candidates
            SET review_status = 'pending', place_id = NULL,
                reviewed_by = NULL, review_reason = ${`reopened: ${item.reason}`}, reviewed_at = NULL
            WHERE id = ${item.row.id} AND review_status = 'verified'`;
          await tx`INSERT INTO geo_review_audit (candidate_id, action, place_id, reviewer, reason)
            VALUES (${item.row.id}, 'reopen', ${item.row.place_id}, ${AUTO_REVIEWER}, ${`rule tightened: ${item.reason}`})`;
        });
      }
    }

    console.log(JSON.stringify({
      apply,
      checked: rows.length,
      reopened: failures.length,
      remapped: remaps.length,
      byReason,
      remapSamples: remaps.slice(0, 20).map(item => ({
        candidateId: item.row.id,
        placeText: item.row.place_text,
        from: `${item.row.place_name} (${item.row.place_id})`,
        to: `${item.place.name} (${item.place.id})`,
      })),
      samples: failures.slice(0, 20).map(item => ({
        candidateId: item.row.id,
        placeText: item.row.place_text,
        wasPlace: item.row.place_name,
        reason: item.reason,
        title: item.row.title.slice(0, 40),
      })),
    }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
