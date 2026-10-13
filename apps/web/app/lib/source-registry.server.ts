// The 2026-10-08 NewsMail snapshot is a list of *unverified* candidates,
// intentionally excluded from public routes and from production source seeding.
import inventory from "../../../../data/source-registry/imports/newsmail-2026-10-08.json";
import probe from "../../../../data/source-registry/observations/live-probe-2026-10-08.json";
import charity from "../../../../data/source-registry/imports/charity-2026-10-08.json";
import proposals from "../../../../data/source-registry/proposals-2026-10-12.json";

export interface LegacyCandidate {
  legacy_id: string;
  name: string;
  kind_label: string;
  locator: string;
  url: string | null;
  section: string;
  notes: string;
  source_file: string;
  source_line: number;
  observation?: { status: number; classification: string; observedAt: string; isHistorical: true };
}

const rows: LegacyCandidate[] = [
  ...inventory.rows,
  ...charity.rows.map(row => ({ legacy_id: row.legacy_id, name: row.name,
    kind_label: "机构线索", locator: row.domain, url: `https://${row.domain}/`, section: row.category,
    notes: `${row.collection_status} · ${row.collection_method} · ${row.last_probe_result ?? ""}`,
    source_file: row.source_file, source_line: row.source_line })),
];
const observations = new Map(probe.targets.map(row => [row.requested, row]));

export function findLegacyCandidates(query: string, max = 30): LegacyCandidate[] {
  const q = query.trim().toLowerCase().slice(0, 250);
  if (!q) return rows.filter((r) => !!r.url).slice(0, 12).map(withObservation);
  let hostname = "";
  try { hostname = new URL(q).hostname.replace(/^www\./, ""); } catch { /* text is fine */ }
  const terms = [q, hostname].filter(Boolean);
  return rows.filter((r) => terms.some((t) =>
    [r.name, r.kind_label, r.locator, r.section, r.notes].some((v) => v.toLowerCase().includes(t))
  )).slice(0, max).map(withObservation);
}

export const legacySourceTotal = rows.length;
export const sourceProposals = proposals.candidates;
export const sourceReviewDate = proposals.reviewed_at;

function withObservation(row: LegacyCandidate): LegacyCandidate {
  const item = observations.get(row.url ?? "");
  return item ? { ...row, observation: { status: item.status, classification: item.classification,
    observedAt: probe.observed_at, isHistorical: true } } : row;
}
