// Offline place resolution for automatic geo review.
//
// Two rules matter more than coverage:
//   1. Never match a substring. "南京东路世纪广场" is in Shanghai; matching the
//      prefix "南京" would put a Shanghai event on Nanjing.
//   2. Never guess between same-named cities. "萍乡" exists twice in the dump,
//      so a name that resolves to several comparable places stays unresolved
//      and the candidate keeps waiting instead of landing on the map.
//
// The gazetteer is static data (GeoNames cities15000, CC BY 4.0). No network,
// no geocoding service, no invented coordinates.
import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../config.ts";

export interface GazetteerEntry {
  id: string;
  name: string;
  ascii: string;
  zh: string[];
  cc: string;
  admin1: string | null;
  lat: number;
  lon: number;
  pop: number;
}

export interface ResolvedPlace {
  id: string;
  name: string;
  countryCode: string;
  region: string | null;
  city: string;
  lat: number;
  lon: number;
  precision: "city";
  sourceUrl: string;
}

export type PlaceResolution =
  | { status: "resolved"; place: ResolvedPlace }
  | { status: "ambiguous"; placeText: string; candidateIds: string[] }
  | { status: "unknown"; placeText: string };

const GAZETTEER_PATH = path.join(REPO_ROOT, "industry/geo/gazetteer.json");

/** Suffixes stripped once to try the plain name; longest first so 新区 wins over 区. */
const SUFFIXES = ["特别行政区", "自治区", "自治州", "自治县", "地区", "新区", "街道", "社区", "省", "市", "区", "县", "镇", "乡", "村", "旗", "盟", "州"];

export function normalizePlaceName(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, "").replace(/[·・]/gu, "").trim();
}

let cache: { entries: GazetteerEntry[]; index: Map<string, GazetteerEntry[]> } | null = null;

function load(): { entries: GazetteerEntry[]; index: Map<string, GazetteerEntry[]> } {
  if (cache) return cache;
  const raw = JSON.parse(readFileSync(GAZETTEER_PATH, "utf8")) as { places: GazetteerEntry[] };
  const index = new Map<string, GazetteerEntry[]>();
  const add = (key: string, entry: GazetteerEntry) => {
    const name = normalizePlaceName(key);
    if (name.length < 2) return;
    const bucket = index.get(name);
    if (bucket) { if (!bucket.includes(entry)) bucket.push(entry); }
    else index.set(name, [entry]);
  };
  for (const entry of raw.places) {
    add(entry.name, entry);
    add(entry.ascii, entry);
    for (const zh of entry.zh) add(zh, entry);
  }
  cache = { entries: raw.places, index };
  return cache;
}

/** Test seam: drop the parsed gazetteer so a rebuilt file is picked up. */
export function resetGazetteerCache() { cache = null; }

/**
 * A name that many places share is only auto-resolved when one of them clearly
 * dominates; otherwise the caller must leave it unresolved. 5x is deliberately
 * strict — the cost of a wrong city on a public map is higher than a missing one.
 */
function pickDominant(entries: GazetteerEntry[]): GazetteerEntry | null {
  if (entries.length === 1) return entries[0]!;
  const sorted = [...entries].sort((a, b) => b.pop - a.pop);
  const best = sorted[0]!;
  const second = sorted[1]!;
  if (best.pop >= 100000 && best.pop >= second.pop * 5) return best;
  return null;
}

function toResolved(entry: GazetteerEntry): ResolvedPlace {
  return {
    id: entry.id,
    name: entry.name,
    countryCode: entry.cc,
    region: null,
    city: entry.name,
    lat: entry.lat,
    lon: entry.lon,
    precision: "city",
    sourceUrl: `https://www.geonames.org/${entry.id.replace("geonames-", "")}`,
  };
}

function lookup(name: string): GazetteerEntry[] | undefined {
  return load().index.get(normalizePlaceName(name));
}

/** Drops one administrative suffix: 东营市 → 东营, 江宁区 → 江宁. */
function stripSuffix(name: string): string | null {
  for (const suffix of SUFFIXES) {
    if (name.length > suffix.length + 1 && name.endsWith(suffix)) return name.slice(0, -suffix.length);
  }
  return null;
}

/** Province-level names, longest first, used only to split a compound name. */
const PROVINCES = [
  "内蒙古", "黑龙江", "特别行政区", "香港", "澳门", "台湾",
  "北京", "天津", "河北", "山西", "辽宁", "吉林", "上海", "江苏", "浙江", "安徽",
  "福建", "江西", "山东", "河南", "湖北", "湖南", "广东", "广西", "海南",
  "重庆", "四川", "贵州", "云南", "西藏", "陕西", "甘肃", "青海", "宁夏", "新疆",
];

/**
 * Splits a compound name at administrative boundaries without separating a
 * single place: 上海市金山区 → ["上海市", "金山区"], 西藏昌都 → ["西藏", "昌都"].
 * Only used to find a city-level head; never to match a bare substring.
 */
function splitAdministrative(name: string): string[] {
  for (const suffix of SUFFIXES) {
    const at = name.indexOf(suffix);
    if (at > 0 && at + suffix.length < name.length) {
      return [name.slice(0, at + suffix.length), ...splitAdministrative(name.slice(at + suffix.length))];
    }
  }
  for (const province of PROVINCES) {
    // 北京路 is a street, not 北京: the province form must leave a real tail.
    if (name.length > province.length + 1 && name.startsWith(province)) {
      const rest = name.slice(province.length).replace(/^(特别行政区|自治区|省|市)/u, "");
      if (rest.length >= 2) return [province, ...splitAdministrative(rest)];
    }
  }
  return [name];
}

/**
 * Resolves a place mentioned by the model to one canonical city.
 *
 * Order: exact name → exact after dropping one suffix → the leading city of a
 * compound name. Anything else is unknown; a compound head must itself be a
 * whole place ("南京东路世纪广场" never yields "南京").
 */
export function resolvePlace(placeText: string): PlaceResolution {
  const raw = normalizePlaceName(placeText);
  if (raw.length < 2) return { status: "unknown", placeText };

  const direct = lookup(raw);
  if (direct) {
    const picked = pickDominant(direct);
    return picked
      ? { status: "resolved", place: toResolved(picked) }
      : { status: "ambiguous", placeText, candidateIds: direct.map(e => e.id) };
  }

  const stripped = stripSuffix(raw);
  if (stripped) {
    const hit = lookup(stripped);
    if (hit) {
      const picked = pickDominant(hit);
      return picked
        ? { status: "resolved", place: toResolved(picked) }
        : { status: "ambiguous", placeText, candidateIds: hit.map(e => e.id) };
    }
  }

  // Compound names: only an exact head counts, and only at city level. The tail
  // is ignored on purpose — 金山区 belongs to 上海市, but 南京东路 is not 南京.
  const parts = splitAdministrative(raw);
  for (const part of parts) {
    const candidate = normalizePlaceName(part).replace(/(特别行政区|自治区|自治州|地区|新区|街道|社区|省|市|区|县|镇|乡|村|旗|盟|州)$/u, "");
    if (candidate.length < 2) continue;
    const hit = lookup(candidate);
    if (hit) {
      const picked = pickDominant(hit);
      if (picked) return { status: "resolved", place: toResolved(picked) };
    }
  }

  return { status: "unknown", placeText };
}

/** The gazetteer is data, not a guess: callers can inspect what it holds. */
export function gazetteerStats(): { entries: number; names: number } {
  const { entries, index } = load();
  return { entries: entries.length, names: index.size };
}
