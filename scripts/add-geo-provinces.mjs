#!/usr/bin/env node
// Adds a Chinese province to every gazetteer row so the city picker can offer
// 省 → 市 instead of one 1,300-row list.
//
// GeoNames ships admin1 as a numeric code ("CN.32"); the English name behind that
// code lives in admin1CodesASCII.txt, and only that English name is stable enough
// to translate. Codes are looked up, never hard-coded, so a dump that renumbers a
// province does not silently move a city to the wrong province.
//
// Usage: node scripts/add-geo-provinces.mjs --admin1=<admin1CodesASCII.txt> [--gazetteer=industry/geo/gazetteer.json]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argOf = (name, fallback) => {
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const gazetteerPath = resolve(argOf("gazetteer", join(ROOT, "industry/geo/gazetteer.json")));
const admin1Path = resolve(argOf("admin1", join(ROOT, "tmp/admin1CodesASCII.txt")));

/** GeoNames admin1 English names for the 31 mainland provincial units it carries. */
const PROVINCE_ZH = {
  Anhui: "安徽", Zhejiang: "浙江", Jiangxi: "江西", Jiangsu: "江苏", Jilin: "吉林",
  Qinghai: "青海", Fujian: "福建", Heilongjiang: "黑龙江", Henan: "河南", Hebei: "河北",
  Hunan: "湖南", Hubei: "湖北", Xinjiang: "新疆", Tibet: "西藏", Gansu: "甘肃",
  Guangxi: "广西", Guizhou: "贵州", Guangdong: "广东", Hainan: "海南", Ningxia: "宁夏",
  "Inner Mongolia": "内蒙古", Liaoning: "辽宁", Shaanxi: "陕西", Shandong: "山东",
  Shanghai: "上海", Shanxi: "山西", Sichuan: "四川", Tianjin: "天津", Yunnan: "云南",
  Chongqing: "重庆", Beijing: "北京",
};

/** Hong Kong, Macao and Taiwan are country codes in GeoNames, not CN admin1 rows. */
const SPECIAL_REGION = { HK: "香港", MO: "澳门", TW: "台湾" };

const englishByCode = new Map();
for (const line of readFileSync(admin1Path, "utf8").split("\n")) {
  const [code, english] = line.split("\t");
  if (code?.startsWith("CN.")) englishByCode.set(code.slice(3), english);
}

const doc = JSON.parse(readFileSync(gazetteerPath, "utf8"));
let cn = 0, named = 0, unknown = 0;
const unknownCodes = new Map();
for (const place of doc.places) {
  if (place.cc === "CN") {
    cn += 1;
    const english = englishByCode.get(place.admin1);
    const zh = english ? PROVINCE_ZH[english] : null;
    place.province = zh ?? null;
    if (zh) named += 1;
    else {
      unknown += 1;
      const key = `${place.admin1}:${english ?? "?"}`;
      unknownCodes.set(key, (unknownCodes.get(key) ?? 0) + 1);
    }
  } else {
    place.province = SPECIAL_REGION[place.cc] ?? null;
  }
}

writeFileSync(gazetteerPath, `${JSON.stringify(doc)}\n`);
console.log(`provinces: CN ${named}/${cn} resolved, ${unknown} unmatched`);
if (unknownCodes.size) console.log("unmatched codes:", [...unknownCodes].map(([k, n]) => `${k}×${n}`).join(" "));
const perProvince = new Map();
for (const p of doc.places) if (p.cc === "CN" && p.province) perProvince.set(p.province, (perProvince.get(p.province) ?? 0) + 1);
console.log([...perProvince].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}${n}`).join(" "));
