// Geography hints extracted by the existing paid structure step.
// Never treat a model suggestion as a verified event location or let it invent coordinates.
import { z } from "zod";
import type { AnalyzeInputArticle } from "./input.ts";

export const GeoCandidateSchema = z.object({
  place: z.string().trim().min(2).max(80),
  role: z.enum(["event", "affected", "publisher", "mentioned"]),
  evidence: z.string().trim().min(4).max(180),
});

export type GeoCandidate = z.infer<typeof GeoCandidateSchema>;

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase();
}

/**
 * Only direct quotes in the actual article, not in the prompt, source name, metadata or user query.
 * This is a provenance guard, not geographic verification: it doesn't prove an event happened there.
 */
export function groundGeoCandidates(
  input: Pick<AnalyzeInputArticle, "title" | "bodyText" | "excerpt" | "xPost" | "translationZh">,
  candidates: readonly GeoCandidate[],
): GeoCandidate[] {
  const articleText = [
    input.title, input.bodyText, input.excerpt,
    typeof input.xPost?.text === "string" ? input.xPost.text : null,
    typeof input.xPost?.quoted?.text === "string" ? input.xPost.quoted.text : null,
    // The existing structure step can see this translation if the original was shortened.
    input.translationZh,
  ].filter((v): v is string => typeof v === "string" && v.length > 0).map(normalize);
  const accepted: GeoCandidate[] = [];
  const seen = new Set<string>();
  for (const raw of candidates.slice(0, 8)) {
    const parsed = GeoCandidateSchema.safeParse(raw);
    if (!parsed.success) continue;
    const item = parsed.data;
    const place = normalize(item.place);
    const quote = normalize(item.evidence);
    // The place must appear in the quoted evidence and that whole quote in an input field.
    // Reject unsupported paraphrases, places invented by models and examples from instructions.
    if (!quote.includes(place) || !articleText.some((text) => text.includes(quote))) continue;
    const key = place + "\u0000" + item.role + "\u0000" + quote;
    if (seen.has(key)) continue;
    seen.add(key);
    accepted.push(item);
    if (accepted.length === 4) break;
  }
  return accepted;
}
