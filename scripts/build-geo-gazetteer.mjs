// Builds the offline place gazetteer used by automatic geo review.
//
// Source: GeoNames cities15000 (CC BY 4.0). We keep every Chinese place plus
// large foreign cities, because the site's news is mostly Chinese but still
// reports overseas events. Coordinates are never invented: they come straight
// from the dump, and each entry links back to its geonames.org page.
//
// Usage:
//   node scripts/build-geo-gazetteer.mjs --cities=/tmp/cities15000.txt --out=industry/geo/gazetteer.json
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const CITIES = arg("cities", "/tmp/cities15000.txt");
const OUT = arg("out", "industry/geo/gazetteer.json");
const MIN_FOREIGN_POPULATION = Number(arg("min-pop", "500000"));

const CJK_ONLY = /^[\u4e00-\u9fa5\u00b7]+$/u;
const HOME_COUNTRIES = new Set(["CN", "TW", "HK", "MO"]);

function chineseNames(fields) {
  const seen = new Set();
  for (const raw of [fields.name, ...(fields.alternatenames || "").split(",")]) {
    const name = raw.trim();
    if (!name || name.length > 24) continue;
    if (!CJK_ONLY.test(name)) continue;
    seen.add(name);
  }
  return [...seen];
}

const rows = readFileSync(CITIES, "utf8").split("\n").filter(Boolean);
const places = [];
let skippedNoCoord = 0;

for (const line of rows) {
  const f = line.split("\t");
  const [geonameid, name, asciiname, alternatenames, latRaw, lonRaw, , , countryCode, , admin1] = f;
  if (!geonameid || !countryCode) continue;
  const population = Number(f[14] || 0);
  const isHome = HOME_COUNTRIES.has(countryCode);
  if (!isHome && population < MIN_FOREIGN_POPULATION) continue;

  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    skippedNoCoord += 1;
    continue;
  }

  const zh = chineseNames({ name, alternatenames });
  const display = zh[0] ?? name;
  places.push({
    id: `geonames-${geonameid}`,
    name: display,
    ascii: asciiname || name,
    zh,
    cc: countryCode,
    admin1: admin1 || null,
    lat: Math.round(lat * 10000) / 10000,
    lon: Math.round(lon * 10000) / 10000,
    pop: population,
  });
}

places.sort((a, b) => b.pop - a.pop);

const payload = {
  source: "https://download.geonames.org/export/dump/cities15000.zip",
  license: "CC BY 4.0",
  attribution: "GeoNames (https://www.geonames.org)",
  minForeignPopulation: MIN_FOREIGN_POPULATION,
  count: places.length,
  places,
};

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload) + "\n");
const withZh = places.filter(p => p.zh.length > 0).length;
console.log(JSON.stringify({ out: OUT, places: places.length, withChineseName: withZh, skippedNoCoord, bytes: JSON.stringify(payload).length }, null, 2));
