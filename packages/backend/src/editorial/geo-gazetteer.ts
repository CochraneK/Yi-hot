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
  /** Chinese province for CN rows, 香港 / 澳门 / 台湾 for the three special regions. */
  province?: string | null;
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
  /**
   * The prefecture city a county-level unit belongs to. Present only when the
   * text named a 区 / 县 / 县级市: the map and the picker read at city level, so
   * they group by parent, while the stored place keeps the finer name.
   */
  parent?: ResolvedPlace;
}

export type PlaceResolution =
  | { status: "resolved"; place: ResolvedPlace }
  | { status: "ambiguous"; placeText: string; candidateIds: string[] }
  | { status: "unknown"; placeText: string };

const GAZETTEER_PATH = path.join(REPO_ROOT, "industry/geo/gazetteer.json");
const DIVISIONS_PATH = path.join(REPO_ROOT, "industry/geo/divisions.json");

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
    // 大理市 must answer to 大理州: register the suffix-free form too, so a
    // writer's 州/地区 wording does not turn a known city into an unknown one.
    const bare = stripSuffix(name);
    if (bare && bare.length >= 2 && !index.get(bare)?.includes(entry)) {
      const existing = index.get(bare);
      if (existing) existing.push(entry);
      else index.set(bare, [entry]);
    }
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
export function resetGazetteerCache() { cache = null; divisionCache = null; }

/**
 * County-level units: 区, 县 and 县级市, each with the prefecture city it sits
 * in. The grain is kept on purpose — 江宁区 stays 江宁区 instead of collapsing
 * to 南京 — because the writer named a district and that is the only detail the
 * story carries. The parent is what the map, the picker and the heat counts use,
 * so the finer row never splits a city's news on screen.
 *
 * 朝阳区 belongs to either 北京 or 长春 and never to 朝阳市, which is what
 * stripping the 区 and looking the head up would produce.
 */
interface DivisionRow {
  id: string;
  name: string;
  kind: "district" | "county" | "city";
  cityId: string;
  city: string;
  province: string | null;
  lat: number;
  lon: number;
}

let divisionCache: { byName: Map<string, DivisionRow[]>; byBare: Map<string, DivisionRow[]> } | null = null;

function divisions(): { byName: Map<string, DivisionRow[]>; byBare: Map<string, DivisionRow[]> } {
  if (divisionCache) return divisionCache;
  const raw = JSON.parse(readFileSync(DIVISIONS_PATH, "utf8")) as { divisions: Record<string, DivisionRow[]> };
  const byName = new Map<string, DivisionRow[]>();
  const bareRows = new Map<string, DivisionRow[]>();
  for (const [name, rows] of Object.entries(raw.divisions)) {
    const key = normalizePlaceName(name);
    byName.set(key, rows);
    // 昆山市 must answer to 昆山 too: the source list keeps the suffix, writers
    // do not. The bare form is registered only when one city owns it, so 朝阳
    // (北京 and 长春) stays out and keeps whatever the gazetteer says.
    const bare = stripSuffix(key);
    if (!bare || bare.length < 2) continue;
    // 东营区 strips to 东营, the city it belongs to. The bare form would then
    // answer for the city and turn 东营 into a district of itself, so a name
    // that equals its own prefecture keeps only the suffixed key.
    if (rows.every(row => row.city === bare)) continue;
    const bucket = bareRows.get(bare);
    if (!bucket) bareRows.set(bare, [...rows]);
    else for (const row of rows) if (!bucket.some(item => item.id === row.id)) bucket.push(row);
  }
  const byBare = new Map<string, DivisionRow[]>();
  for (const [bare, rows] of bareRows) {
    if (new Set(rows.map(row => row.cityId)).size === 1) byBare.set(bare, rows);
  }
  divisionCache = { byName, byBare };
  return divisionCache;
}

/** The county-level rows a name belongs to; null when the name is not one. */
export function divisionRows(name: string): DivisionRow[] | null {
  const key = normalizePlaceName(name);
  const { byName, byBare } = divisions();
  return byName.get(key) ?? byBare.get(key) ?? null;
}

/** Cities a county-level name belongs to; null when the name is not one. */
export function districtCities(name: string): string[] | null {
  const rows = divisionRows(name);
  return rows ? [...new Set(rows.map(row => row.city))] : null;
}

/**
 * True when a gazetteer entry is really a county-level unit of another city.
 * 浦东新区 and 万州区 carry city-sized populations in the dump but resolve to
 * 上海 and 重庆; offering them as pickable cities would split one city's news
 * across two rows and leave one of them permanently empty.
 */
export function isDistrictPlace(name: string): boolean {
  const rows = divisionRows(name);
  if (!rows) return false;
  const bare = normalizePlaceName(name);
  return rows.some(row => row.name !== bare || row.city !== bare);
}

/**
 * A name that many places share is only auto-resolved when one of them clearly
 * dominates. 3x with a 100k floor keeps 长沙 (3.09M vs 688k) while still refusing
 * two similarly sized places that happen to share a name. The cost of a wrong
 * city on a public map is higher than a missing one.
 */
function pickDominant(entries: GazetteerEntry[]): GazetteerEntry | null {
  if (entries.length === 1) return entries[0]!;
  const sorted = [...entries].sort((a, b) => b.pop - a.pop);
  const best = sorted[0]!;
  const second = sorted[1]!;
  if (best.pop >= 100000 && best.pop >= second.pop * 3) return best;
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
 * County-level name → its own place row, carrying the prefecture it sits in.
 *
 * 江宁区 resolves to 江宁区, not to 南京: the finer name is what the story said,
 * and it is the grain the reader can check. The parent city rides along so the
 * map, the picker and the heat counter can group at city level without the
 * stored place losing what the writer named.
 */
function toDivisionPlace(row: DivisionRow): ResolvedPlace {
  const cityUrl = `https://www.geonames.org/${row.cityId.replace("geonames-", "")}`;
  const parent: ResolvedPlace = {
    id: row.cityId, name: row.city, countryCode: "CN", region: row.province,
    city: row.city, lat: row.lat, lon: row.lon, precision: "city", sourceUrl: cityUrl,
  };
  return {
    id: row.id, name: row.name, countryCode: "CN", region: row.province,
    city: row.city, lat: row.lat, lon: row.lon, precision: "city",
    sourceUrl: cityUrl, parent,
  };
}

function resolveDivision(raw: string): PlaceResolution | null {
  const { byName, byBare } = divisions();
  let rows = byName.get(raw) ?? null;
  let matched = raw;
  if (!rows) {
    // A district can arrive with its city in front: 南京江宁区, 广西百色市田阳区.
    // The tail is the administrative unit; the head only helps choose between
    // same-named districts, never creates one.
    for (let len = Math.min(raw.length - 1, 8); len >= 2; len -= 1) {
      const hit = byName.get(raw.slice(-len));
      if (hit) { rows = hit; matched = raw.slice(-len); break; }
    }
  }
  if (!rows) rows = byBare.get(raw) ?? null;
  if (!rows) return null;

  const prefix = raw.slice(0, raw.length - matched.length);
  let picked = rows;
  if (picked.length > 1) {
    const hinted = picked.filter(row => prefix.includes(row.city));
    if (hinted.length === 1) picked = hinted;
  }
  if (picked.length > 1) {
    // 朝阳区 is 北京 and 长春. With nothing to choose by, stay undecided rather
    // than fold it into whichever city shares the characters (朝阳市).
    return { status: "ambiguous", placeText: raw, candidateIds: picked.map(row => row.id) };
  }
  return { status: "resolved", place: toDivisionPlace(picked[0]!) };
}

/**
 * Resolves a place mentioned by the model to one place row.
 *
 * Order: county-level unit (区/县/县级市, kept at its own grain with the city as
 * parent) → exact city name → exact after dropping one suffix → the leading city
 * of a compound name. Anything else is unknown; a compound head must itself be a
 * whole place ("南京东路世纪广场" never yields "南京").
 */
export function resolvePlace(placeText: string): PlaceResolution {
  const raw = normalizePlaceName(placeText);
  if (raw.length < 2) return { status: "unknown", placeText };

  // A neighbourhood is not a city, and neither is the city-name-shaped tail of
  // one: 袁州区昌黎社区 is in 江西宜春, but splitting at 区 and looking the tail
  // up finds 河北昌黎 — a pin 1500 km away. The neighbourhood segment is dropped
  // before any candidate is tried; the city segments in front of it still count,
  // which is how 四川省广元市朝天区李家镇望远山社区 resolves to 广元.
  const neighbourhood = /(社区|村委会|居委会|街道)$/u.test(raw);

  const division = resolveDivision(raw);
  if (division) return division;

  const direct = lookup(raw);
  if (direct) {
    const picked = pickDominant(direct);
    return picked
      ? { status: "resolved", place: toResolved(picked) }
      : { status: "ambiguous", placeText, candidateIds: direct.map(e => e.id) };
  }

  const stripped = neighbourhood ? null : stripSuffix(raw);
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
  const usable = neighbourhood && /(社区|村委会|居委会|街道)$/u.test(parts[parts.length - 1] ?? "")
    ? parts.slice(0, -1)
    : parts;
  for (const part of usable) {
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

/** Raw rows, for building a pickable city list. Resolution rules are not applied here. */
export function gazetteerEntries(): GazetteerEntry[] {
  return load().entries;
}
