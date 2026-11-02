import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { HotParticipant } from "@aihot/contracts/site";
import { shortSourceName } from "../../lib/format";
import { SourceAvatar } from "../../components/ui/SourceAvatar";

/**
 * Outlets one search source surfaced are named after that source, so a story with two of them read
 * as one source listed twice. Those are listed once, as the source with the sites it surfaced; a
 * lone outlet keeps the plain name and the host only disambiguates it.
 */
function labelsOf(participants: HotParticipant[]): string[] {
  const sites = new Map<string, string[]>();
  for (const p of participants) if (p.site) sites.set(p.name, [...(sites.get(p.name) ?? []), p.site]);
  const listed = new Set<string>();
  return participants.map((p) => {
    const name = shortSourceName(p.name);
    if (!p.site) return name;
    const found = sites.get(p.name) ?? [];
    if (found.length < 2) return `${name}（${p.site}）`;
    if (listed.has(p.name)) return "";
    listed.add(p.name);
    return `${name}（${found.join("、")}）`;
  });
}

/** Faces keep their own identity: two outlets behind one source must not share a key or an initial. */
const keyOf = (p: HotParticipant, i: number) => `${p.kind}:${p.site ?? p.name}:${i}`;

/**
 * Who is talking about a hot story: overlapping faces of the 精选组 sources in the order the server
 * gives (T1, T1.5, T2), then a count for everyone else, 氛围组 included. Hover lists every name; where
 * the faces are their own control (not inside a link), a tap or Enter opens the list, as the legacy
 * list's <details> did, so phones and keyboards reach it too.
 */
export function Faces({ participants, total, size = 24, max = 6, interactive = true }: { participants: HotParticipant[]; total: number; size?: number; max?: number; interactive?: boolean }) {
  const labels = labelsOf(participants);
  const labelled = participants.map((p, i) => ({ p, label: labels[i]! }));
  const shown = labelled.filter((x) => x.p.kind === "editorial").slice(0, max);
  const rest = total - shown.length;
  const names = labelled.map((x) => x.label).filter(Boolean).join("、");
  const faces = (
    <>
      {shown.map(({ p }, i) => (
        <span key={keyOf(p, i)} className={`rounded-full ring-2 ring-surface ${i ? "-ml-1.5" : ""}`}>
          <SourceAvatar name={p.site ?? p.name} iconUrl={p.iconUrl} iconSrcSet={p.iconSrcSet} size={size} />
        </span>
      ))}
      {rest > 0 && (
        <span className="-ml-1.5 inline-flex items-center justify-center rounded-full bg-bg-sunk px-1.5 text-[10.5px] font-medium text-ink-3 ring-2 ring-surface dark:bg-bg-muted" style={{ height: size, minWidth: size }}>
          +{rest}
        </span>
      )}
    </>
  );
  if (!interactive) {
    return (
      <span className="relative z-10 flex shrink-0 items-center" title={names}>
        {faces}
      </span>
    );
  }
  return <FacesButton labelled={labelled} total={total} names={names}>{faces}</FacesButton>;
}

function FacesButton({ labelled, total, names, children }: { labelled: Array<{ p: HotParticipant; label: string }>; total: number; names: string; children: React.ReactNode }) {
  // Where the list opens: under the faces, kept on screen; fixed, so a card's clipping never hides it.
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const open = at !== null;
  const root = useRef<HTMLSpanElement>(null);
  const popup = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const close = () => setAt(null);
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node) && !popup.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  const editorial = labelled.filter((x) => x.p.kind === "editorial");
  const signal = labelled.filter((x) => x.p.kind !== "editorial");
  // A source listed once under its first outlet leaves nothing to print at its later outlets.
  const lines = (items: typeof labelled) => items.map((x) => x.label).filter(Boolean).join("、");
  const more = total - labelled.length;
  return (
    <span ref={root} className="relative z-10 inline-flex shrink-0">
      <button
        type="button"
        title={names}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${total} 位参与者，查看名单`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (open) return setAt(null);
          const r = e.currentTarget.getBoundingClientRect();
          const below = window.innerHeight - r.bottom > 240;
          setAt({ top: below ? r.bottom + 6 : Math.max(8, r.top - 6 - 240), left: Math.min(Math.max(8, r.left), document.documentElement.clientWidth - 248) });
        }}
        className="-m-1 flex items-center rounded-full p-1 outline-offset-2"
      >
        {children}
      </button>
      {open && createPortal(
        <span ref={popup} id={id} role="dialog" aria-label="参与讨论的来源" style={at} className="fixed z-50 max-h-[240px] w-[240px] overflow-y-auto rounded-control border border-line bg-raised p-3 text-[12.5px] leading-relaxed text-ink-2 shadow-[var(--shadow-pop)]">
          {lines(editorial) && (
            <>
              <span className="block text-[11.5px] font-semibold text-ink-4">精选组</span>
              <span className="mt-0.5 block">{lines(editorial)}</span>
            </>
          )}
          {lines(signal) && (
            <>
              <span className={`block text-[11.5px] font-semibold text-ink-4 ${lines(editorial) ? "mt-2" : ""}`}>氛围组</span>
              <span className="mt-0.5 block">{lines(signal)}</span>
            </>
          )}
          {more > 0 && <span className="mt-2 block text-[11.5px] text-ink-4">另有 {more} 位未列出</span>}
        </span>, document.body
      )}
    </span>
  );
}
