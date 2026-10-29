// The report nameplates (industry/brand/nameplates/, made by scripts/nameplates.ts from the pack's
// subject word). Each logotype is cached on its own; the two paths take the theme's ink and accent.
// periodical / *-kind are the one-line logotype cut in two, for a narrow page that sets the masthead
// over two lines (subject word on its own, then the period beside the 报眼).
import daily from "@aihot/industry/brand/nameplates/daily.svg?url&no-inline";
import weekly from "@aihot/industry/brand/nameplates/weekly.svg?url&no-inline";
import monthly from "@aihot/industry/brand/nameplates/monthly.svg?url&no-inline";
import archive from "@aihot/industry/brand/nameplates/archive.svg?url&no-inline";
import periodical from "@aihot/industry/brand/nameplates/periodical.svg?url&no-inline";
import weeklyKind from "@aihot/industry/brand/nameplates/weekly-kind.svg?url&no-inline";
import monthlyKind from "@aihot/industry/brand/nameplates/monthly-kind.svg?url&no-inline";
import viewBoxes from "@aihot/industry/brand/nameplates/index.json";

const NAMEPLATES = {
  daily: { url: daily, viewBox: viewBoxes.daily },
  weekly: { url: weekly, viewBox: viewBoxes.weekly },
  monthly: { url: monthly, viewBox: viewBoxes.monthly },
  archive: { url: archive, viewBox: viewBoxes.archive },
  periodical: { url: periodical, viewBox: viewBoxes.periodical },
  "weekly-kind": { url: weeklyKind, viewBox: viewBoxes["weekly-kind"] },
  "monthly-kind": { url: monthlyKind, viewBox: viewBoxes["monthly-kind"] },
} as const;

export function Nameplate({ which, className = "" }: { which: keyof typeof NAMEPLATES; className?: string }) {
  const n = NAMEPLATES[which];
  return (
    // The logotype is set left-aligned when the box is narrower than the artwork (a narrow page), so a
    // squeezed nameplate shrinks rather than spilling over whatever sits beside it.
    <svg viewBox={n.viewBox} preserveAspectRatio="xMinYMid meet" className={className} aria-hidden="true" focusable="false">
      <use href={`${n.url}#accent`} className="fill-accent" />
      <use href={`${n.url}#ink`} className="fill-ink" />
    </svg>
  );
}
