// Builds the offline place gazetteer used by automatic geo review.
//
// Names come from alternateNamesV2 filtered to language zh, not from the
// alternatenames column inside cities15000: that column is unordered and mixes
// districts into the parent city (深圳 resolved to 宝安, 成都 to 天府). The
// language-tagged file also carries an "is preferred name" flag, which is what
// makes 深圳 resolve to Shenzhen's own row.
//
// Source: GeoNames cities15000 + alternateNamesV2 (CC BY 4.0). We keep every
// Chinese place plus large foreign cities. Coordinates are never invented.
//
// Usage:
//   node scripts/build-geo-gazetteer.mjs \
//     --cities=/tmp/cities15000.txt --alternate=/tmp/alternateNamesV2.txt --out=industry/geo/gazetteer.json
import { readFileSync, writeFileSync, createReadStream, mkdirSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { pinyin } from "pinyin-pro";

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const CITIES = arg("cities", "/tmp/cities15000.txt");
const ALTERNATE = arg("alternate", "");
const OUT = arg("out", "industry/geo/gazetteer.json");
const MIN_FOREIGN_POPULATION = Number(arg("min-pop", "500000"));

const CJK_ONLY = /^[\u4e00-\u9fa5\u00b7]+$/u;
const HOME_COUNTRIES = new Set(["CN", "TW", "HK", "MO"]);

// Japanese shinjitai leak into Chinese aliases too (徳州市, 東営市). They read as
// typos on a Chinese page, so normalise the ones that actually appear instead of
// pulling in a full OpenCC table.
const JA_VARIANTS = {
  "徳": "德", "広": "广", "浜": "滨", "営": "营", "鶏": "鸡", "竜": "龙",
  "渓": "溪", "恵": "惠", "郷": "乡", "掲": "揭", "塩": "盐", "関": "关",
  "児": "儿", "鉄": "铁", "黒": "黑", "亜": "亚", "楽": "乐", "県": "县",
  "観": "观",
};

// Traditional forms that survive in the zh feed and would look inconsistent next
// to simplified titles. Only characters that actually occur in the dump.
const TRADITIONAL = {
  "貴": "贵", "陽": "阳", "長": "长", "銀": "银", "崑": "昆", "綿": "绵", "東": "东",
  "廣": "广", "臺": "台", "灣": "湾", "龍": "龙", "遼": "辽", "寧": "宁", "陝": "陕",
  "濟": "济", "齊": "齐", "廈": "厦", "門": "门", "漢": "汉", "蘭": "兰", "溫": "温",
  "慶": "庆", "興": "兴", "義": "义", "縣": "县", "鄉": "乡", "鎮": "镇", "區": "区",
  "島": "岛", "澤": "泽", "溝": "沟", "橋": "桥", "場": "场", "陽": "阳", "陰": "阴",
  "內": "内", "岡": "冈", "嶺": "岭", "嶺": "岭", "峽": "峡", "灘": "滩", "濱": "滨",
  "彌": "弥", "麗": "丽", "產": "产", "業": "业", "農": "农", "墾": "垦", "場": "场",
  "薩": "萨", "爾": "尔", "貝": "贝", "瑪": "玛", "羅": "罗", "倫": "伦", "維": "维",
  "聖": "圣", "約": "约", "紐": "纽", "頓": "顿", "華": "华", "盛": "盛", "舊": "旧",
  "萬": "万", "億": "亿", "邊": "边", "遠": "远", "運": "运", "達": "达", "遷": "迁",
  "過": "过", "還": "还", "這": "这", "進": "进", "開": "开", "關": "关", "陳": "陈",
  "陸": "陆", "隊": "队", "際": "际", "隨": "随", "難": "难", "靈": "灵", "韓": "韩",
  "顯": "显", "飛": "飞", "養": "养", "馬": "马", "駐": "驻", "驗": "验", "體": "体",
  "髮": "发", "鬥": "斗", "魯": "鲁", "鮮": "鲜", "鳥": "鸟", "鳴": "鸣", "黃": "黄",
  "點": "点", "黨": "党", "麼": "么", "麵": "面", "齡": "龄",
};

function normalizeName(name) {
  let out = "";
  for (const ch of name) out += JA_VARIANTS[ch] ?? TRADITIONAL[ch] ?? ch;
  return out;
}

const pinyinKey = value => pinyin(value, { toneType: "none", type: "array" }).join("").replace(/[^a-z]/g, "");
const asciiKey = value => String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");

/**
 * The Chinese alias list mixes in sub-places: 昆山 carries 玉山 (its own town),
 * 东塔 carries 灵武市 (its parent city). Language tags and the preferred flag do
 * not separate them — no row in the dump sets isPreferredName — so the only
 * dependable test is whether the Chinese name actually sounds like the place's
 * romanised name. 昆山市→kunshanshi matches Kunshan; 玉山→yushan does not.
 */
function agreesWithAscii(chinese, ascii) {
  const target = asciiKey(ascii);
  if (!target) return false;
  const key = pinyinKey(chinese);
  return key === target || key.startsWith(target) || target.startsWith(key);
}

/** A short, reader-facing name: drop 市, never a sub-place suffix like 镇. */
function pickDisplayName(names) {
  const notSubPlace = names.filter(name => !/(镇|乡|村|社区|街道)$/u.test(name));
  const pool = notSubPlace.length ? notSubPlace : names;
  const withCity = pool.find(name => name.endsWith("市") && name.length > 2);
  const chosen = withCity ?? pool[0];
  return chosen.length > 2 && chosen.endsWith("市") ? chosen.slice(0, -1) : chosen;
}

/** geonameid → Chinese names, preferred first. */
async function loadChineseNames(ids) {
  const bucket = new Map();
  if (!ALTERNATE) return bucket;
  const rl = createInterface({ input: createReadStream(ALTERNATE, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) {
    // alternateNameId \t geonameid \t isolanguage \t name \t isPreferredName \t …
    const tab1 = line.indexOf("\t");
    if (tab1 < 0) continue;
    const tab2 = line.indexOf("\t", tab1 + 1);
    if (tab2 < 0) continue;
    const geonameid = line.slice(tab1 + 1, tab2);
    if (!ids.has(geonameid)) continue;
    const tab3 = line.indexOf("\t", tab2 + 1);
    if (tab3 < 0) continue;
    const lang = line.slice(tab2 + 1, tab3);
    if (!lang.startsWith("zh")) continue;
    const tab4 = line.indexOf("\t", tab3 + 1);
    if (tab4 < 0) continue;
    const raw = line.slice(tab3 + 1, tab4);
    const tab5 = line.indexOf("\t", tab4 + 1);
    const preferred = tab5 < 0 ? "" : line.slice(tab4 + 1, tab5);
    const name = normalizeName(raw.trim());
    if (!name || name.length > 24 || !CJK_ONLY.test(name)) continue;
    const entry = bucket.get(geonameid) ?? { preferred: [], plain: [] };
    (preferred === "1" ? entry.preferred : entry.plain).push(name);
    bucket.set(geonameid, entry);
  }
  return bucket;
}

const rows = readFileSync(CITIES, "utf8").split("\n").filter(Boolean).map(line => line.split("\t"));
const ids = new Set(rows.map(f => f[0]).filter(Boolean));
const zhNames = await loadChineseNames(ids);

const places = [];
let skippedNoCoord = 0;
let withoutChinese = 0;

for (const f of rows) {
  const [geonameid, name, asciiname, , latRaw, lonRaw, , , countryCode, , admin1] = f;
  if (!geonameid || !countryCode) continue;
  const population = Number(f[14] || 0);
  if (!HOME_COUNTRIES.has(countryCode) && population < MIN_FOREIGN_POPULATION) continue;

  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    skippedNoCoord += 1;
    continue;
  }

  const entry = zhNames.get(geonameid);
  let zh = [...new Set([...(entry?.preferred ?? []), ...(entry?.plain ?? [])])];
  // Mainland only: Hong Kong, Macao and Taiwan are romanised by sound or by
  // English name (Hong Kong, Taipei), so a pinyin test would strip them.
  // Minority-language names romanise differently too (Aksu is 阿克苏, not Akesu):
  // when nothing passes the test, keep the first alias rather than losing the
  // place — the entry stays addressable, only the suspect aliases are dropped.
  if (countryCode === "CN" && zh.length) {
    const agreed = zh.filter(item => agreesWithAscii(item, asciiname || name));
    zh = agreed.length ? agreed : zh.slice(0, 1);
  }
  if (zh.length === 0) withoutChinese += 1;
  places.push({
    id: `geonames-${geonameid}`,
    name: zh.length ? pickDisplayName(zh) : name,
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
  source: "https://download.geonames.org/export/dump/",
  license: "CC BY 4.0",
  attribution: "GeoNames (https://www.geonames.org)",
  namesFrom: "alternateNamesV2 (isolanguage=zh, isPreferredName first)",
  minForeignPopulation: MIN_FOREIGN_POPULATION,
  count: places.length,
  places,
};

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload) + "\n");
console.log(JSON.stringify({ out: OUT, places: places.length, withChineseName: places.length - withoutChinese, withoutChinese, skippedNoCoord, bytes: JSON.stringify(payload).length }, null, 2));
