// Builds the district → city table used to fold 市辖区 back into their city.
//
// cities15000 treats the big districts as places of their own (浦东新区 5.68M,
// 万州区 1.55M), so a story datelined 江宁区 used to stay unresolved while
// 朝阳区 resolved to 朝阳市 in Liaoning — a district name stripped to a city name
// that only shares the characters. A district is not a city on this site's map;
// it belongs to one.
//
// Source: china-division 2.7.0 (MIT), built from the national administrative
// division list. Only the three files needed for the join are read.
//
// Usage:
//   node scripts/build-geo-districts.mjs \
//     --dir=/tmp/geo-div/package/dist --out=industry/geo/districts.json
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const DIR = arg("dir", "/tmp/geo-div/package/dist");
const OUT = arg("out", "industry/geo/districts.json");

const read = file => JSON.parse(readFileSync(path.join(DIR, file), "utf8"));
const areas = read("areas.json");
const cities = read("cities.json");
const provinces = read("provinces.json");

const cityByCode = new Map(cities.map(c => [c.code, c]));
const provinceByCode = new Map(provinces.map(p => [p.code, p]));

/** 北京市 → 北京. Municipalities list their districts under a 市辖区 pseudo-city. */
const cityNameOf = area => {
  const city = cityByCode.get(area.cityCode);
  const province = provinceByCode.get(area.provinceCode);
  const raw = !city || city.name === "市辖区" || city.name === "县" ? province?.name ?? "" : city.name;
  return raw.replace(/市$/u, "");
};

const districts = new Map();
for (const area of areas) {
  const name = String(area.name ?? "").trim();
  const city = cityNameOf(area).trim();
  if (!name || !city || name.length < 2) continue;
  // 市辖区 only. A county-level city (昆山, 义乌, 瑞安) is a city in its own right
  // and the picker offers it by that name; folding it into its prefecture would
  // move an event 80 km and rename the city under the reader's feet. Counties
  // (秦安县) stay where they are for the same reason: they are already below the
  // prefecture and this pass is about the 区 inside a city.
  if (!name.endsWith("区")) continue;
  // A district that carries its city's own name is not a fold: 东区 under 攀枝花
  // is still 攀枝花, but a row named 重庆 would be the city itself.
  if (name === city) continue;
  const bucket = districts.get(name);
  if (bucket) { if (!bucket.includes(city)) bucket.push(city); }
  else districts.set(name, [city]);
}

const sorted = [...districts.entries()].sort((a, b) => a[0].localeCompare(b[0], "zh"));
const payload = {
  source: "china-division 2.7.0",
  repo: "https://github.com/modood/Administrative-divisions-of-China",
  license: "MIT",
  note: "区/县名 → 所属地级市（直辖市取市名）。重名区县保留全部候选，解析时按上下文或直接拒绝，不猜。",
  count: sorted.length,
  ambiguous: sorted.filter(([, list]) => list.length > 1).length,
  districts: Object.fromEntries(sorted),
};

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(payload)}\n`);
console.log(JSON.stringify({
  out: OUT,
  areas: areas.length,
  districts: sorted.length,
  ambiguous: payload.ambiguous,
  bytes: JSON.stringify(payload).length,
  samples: ["江宁区", "浦东新区", "朝阳区", "万州区", "霍城县", "巫山县"].map(name => `${name}→${(districts.get(name) ?? ["?"]).join("/")}`),
}, null, 2));
