// Builds the county-level division table: every 区 / 县 / 县级市 with the
// prefecture city it belongs to.
//
// The map reads at city level, but the resolution layer must not throw the
// finer grain away. A story datelined 江宁区 is about 江宁区; folding it to 南京
// loses the only detail the writer gave, and folding 秦安县 into 天水 while
// leaving 昆山 standing alone was an arbitrary line. So every county-level unit
// becomes its own row here, carrying the city it sits in:
//
//   * resolution keeps the name the text used (江宁区 stays 江宁区)
//   * the parent city is what the picker, the map and the heat counts use
//   * coordinates are inherited from the parent city, because the source list
//     has no coordinate for a district — the note says so instead of pretending
//
// Source: china-division 2.7.0 (MIT), built from the national administrative
// division list. Only the three files needed for the join are read.
//
// Usage:
//   node scripts/build-geo-divisions.mjs \
//     --dir=/tmp/geo-div/package/dist --out=industry/geo/divisions.json
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const DIR = arg("dir", "/tmp/geo-div/package/dist");
const OUT = arg("out", "industry/geo/divisions.json");
const GAZETTEER = arg("gazetteer", "industry/geo/gazetteer.json");

const read = file => JSON.parse(readFileSync(path.join(DIR, file), "utf8"));
const areas = read("areas.json");
const cities = read("cities.json");
const provinces = read("provinces.json");
const gazetteer = JSON.parse(readFileSync(GAZETTEER, "utf8")).places;

const cityByCode = new Map(cities.map(c => [c.code, c]));
const provinceByCode = new Map(provinces.map(p => [p.code, p]));

/** 北京市 → 北京. Municipalities list their districts under a 市辖区 pseudo-city. */
const strip = name => String(name ?? "").replace(/市$/u, "").trim();
const cityNameOf = area => {
  const city = cityByCode.get(area.cityCode);
  const province = provinceByCode.get(area.provinceCode);
  const raw = !city || city.name === "市辖区" || city.name === "县" ? province?.name ?? "" : city.name;
  return strip(raw);
};

/** County-level units that report straight to a province have no prefecture. */
const PROVINCE_DIRECT = /(省|自治区)直辖县级行政区划/u;

/**
 * Gazetteer lookup, same dominance rule the resolver uses: one candidate wins
 * outright, a shared name needs 3x the population and a 100k floor. A city the
 * dump does not carry (阿里地区, 伊犁哈萨克自治州) yields nothing, and its
 * divisions are left out rather than pinned to a guess.
 */
const gazByName = new Map();
for (const entry of gazetteer) {
  for (const key of [entry.name, entry.ascii, ...(entry.zh ?? [])]) {
    const name = String(key ?? "").normalize("NFKC").replace(/\s+/gu, "").trim();
    if (name.length < 2) continue;
    const bucket = gazByName.get(name);
    if (bucket) { if (!bucket.includes(entry)) bucket.push(entry); }
    else gazByName.set(name, [entry]);
    if (name.endsWith("市") && name.length > 2) {
      const bare = name.slice(0, -1);
      const other = gazByName.get(bare);
      if (other) { if (!other.includes(entry)) other.push(entry); }
      else gazByName.set(bare, [entry]);
    }
  }
}

const pickCity = name => {
  const list = gazByName.get(name);
  if (!list?.length) return null;
  const sorted = [...list].sort((a, b) => b.pop - a.pop);
  if (sorted.length === 1) return sorted[0];
  const [best, second] = sorted;
  return best.pop >= 100000 && best.pop >= second.pop * 3 ? best : null;
};

const KIND = name => {
  if (/市$/u.test(name)) return "city";       // 县级市
  if (/(区|新区|林区|特区)$/u.test(name)) return "district";
  if (/(县|旗|自治县|自治旗)$/u.test(name)) return "county";
  return "county";
};

const divisions = new Map();
let skippedNoCity = 0;
let skippedSameName = 0;
let provinceDirect = 0;

for (const area of areas) {
  const name = String(area.name ?? "").trim();
  if (!name || name.length < 2) continue;
  const rawCity = cityByCode.get(area.cityCode)?.name ?? "";
  if (PROVINCE_DIRECT.test(rawCity)) { provinceDirect += 1; continue; }
  const city = cityNameOf(area);
  if (!city) continue;
  // A row named after its own city is the city, not a district of it.
  if (name === city || strip(name) === city) { skippedSameName += 1; continue; }
  const parent = pickCity(city);
  if (!parent) { skippedNoCity += 1; continue; }
  const row = {
    id: "", // filled after sorting, so the numbering is stable
    name,
    kind: KIND(name),
    cityId: parent.id,
    city: parent.name,
    province: parent.province ?? null,
    lat: parent.lat,
    lon: parent.lon,
  };
  const bucket = divisions.get(name);
  if (bucket) {
    if (!bucket.some(item => item.cityId === row.cityId)) bucket.push(row);
  } else divisions.set(name, [row]);
}

// Stable ids: <cityId>-d<nn>, numbered by name inside the city. Rebuilding the
// file from the same source must not renumber a place the review layer already
// wrote down.
const rows = [...divisions.values()].flat().sort((a, b) =>
  a.cityId.localeCompare(b.cityId) || a.name.localeCompare(b.name, "zh"));
const seq = new Map();
for (const row of rows) {
  const n = (seq.get(row.cityId) ?? 0) + 1;
  seq.set(row.cityId, n);
  row.id = `${row.cityId}-d${String(n).padStart(2, "0")}`;
}
const byName = {};
for (const row of rows) {
  const bucket = byName[row.name];
  if (bucket) bucket.push(row);
  else byName[row.name] = [row];
}

const sortedNames = Object.keys(byName).sort((a, b) => a.localeCompare(b, "zh"));
const payload = {
  source: "china-division 2.7.0",
  repo: "https://github.com/modood/Administrative-divisions-of-China",
  license: "MIT",
  note: "区/县/县级市 → 所属地级市。坐标继承自所属城市中心（源数据无区级坐标），coordinate_precision 仍记 city。重名保留全部候选，解析时按上下文或直接拒绝，不猜。",
  count: rows.length,
  names: sortedNames.length,
  ambiguous: sortedNames.filter(name => byName[name].length > 1).length,
  divisions: Object.fromEntries(sortedNames.map(name => [name, byName[name]])),
};

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(payload)}\n`);

const sample = ["江宁区", "朝阳区", "浦东新区", "秦安县", "昆山市", "义乌市", "巴青县", "昌黎县", "渝水区"];
console.log(JSON.stringify({
  out: OUT,
  areas: areas.length,
  divisions: rows.length,
  names: payload.names,
  ambiguous: payload.ambiguous,
  provinceDirect,
  skippedNoCity,
  skippedSameName,
  bytes: JSON.stringify(payload).length,
  samples: sample.map(name => `${name}→${(byName[name] ?? [{ city: "?", kind: "?" }]).map(d => `${d.city}(${d.kind},${d.id})`).join("/")}`),
}, null, 2));
