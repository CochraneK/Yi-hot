// The pickable city list for the reader's own city.
//
// Two things this list is not allowed to do:
//   1. Offer a place the feed cannot filter by. Every id here is a gazetteer id,
//      the same one the review pipeline writes into geo_candidates, so a city
//      chosen today starts matching the moment an event lands there.
//   2. Offer townships. GeoNames carries every 街道 and 村 in cities15000; on the
//      mainland only entries above the population floor are cities a reader would
//      call home. Hong Kong, Macao and Taiwan are curated instead: their dumps are
//      full of housing estates, and the useful picks are the well-known divisions.
import type { GeoCatalogPlace, GeoCatalogRegion } from "@aihot/contracts/site";
import { isDistrictPlace, type DivisionRow, type GazetteerEntry } from "../editorial/geo-gazetteer.ts";

/** Mainland entries below this are townships; 昆山 and 义乌 are well above it. */
const CN_MIN_POP = 50_000;
const CJK = /[\u4e00-\u9fa5]/;

/** Conventional order: 华北 → 东北 → 华东 → 中南 → 西南 → 西北 → 港澳台. */
const PROVINCE_ORDER = [
  "北京", "天津", "河北", "山西", "内蒙古", "辽宁", "吉林", "黑龙江",
  "上海", "江苏", "浙江", "安徽", "福建", "江西", "山东",
  "河南", "湖北", "湖南", "广东", "广西", "海南",
  "重庆", "四川", "贵州", "云南", "西藏",
  "陕西", "甘肃", "青海", "宁夏", "新疆",
];

const SPECIAL_LABEL: Record<string, string> = { HK: "中国香港", MO: "中国澳门", TW: "中国台湾" };

/**
 * Hong Kong, Macao and Taiwan. The dump names these at district and estate level
 * (Choi Wan Estate, 元朗新墟), so the list is curated and the label is simplified
 * Chinese even where GeoNames only has 繁體 or a romanised name.
 */
const CURATED: Record<string, Array<{ id: string; name: string }>> = {
  HK: [
    { id: "geonames-1819729", name: "香港" },
    { id: "geonames-1819609", name: "九龙" },
    { id: "geonames-12747063", name: "新界" },
    { id: "geonames-12747064", name: "香港岛" },
  ],
  MO: [
    { id: "geonames-1821274", name: "澳门" },
    { id: "geonames-1821263", name: "氹仔" },
    { id: "geonames-1821292", name: "路环" },
  ],
  TW: [
    { id: "geonames-1668341", name: "台北" },
    { id: "geonames-12908892", name: "新北" },
    { id: "geonames-6696918", name: "桃园" },
    { id: "geonames-1668399", name: "台中" },
    { id: "geonames-1668355", name: "台南" },
    { id: "geonames-1673820", name: "高雄" },
    { id: "geonames-1678228", name: "基隆" },
    { id: "geonames-1675151", name: "新竹" },
    { id: "geonames-1678836", name: "嘉义" },
    { id: "geonames-1679136", name: "彰化" },
    { id: "geonames-1671566", name: "南投" },
    { id: "geonames-1674199", name: "宜兰" },
    { id: "geonames-1674504", name: "花莲" },
    { id: "geonames-1668295", name: "台东" },
    { id: "geonames-1671971", name: "苗栗" },
    { id: "geonames-1665196", name: "斗六" },
    { id: "geonames-1672228", name: "马公" },
    { id: "geonames-1678008", name: "金门" },
  ],
};

const PLACE_LIMIT = 3600;

/** Pure: gazetteer rows + event counts → the rows the picker shows. */
export function selectCatalogPlaces(
  entries: readonly GazetteerEntry[],
  counts: ReadonlyMap<string, number>,
  counties: readonly DivisionRow[] = [],
): GeoCatalogPlace[] {
  const places: GeoCatalogPlace[] = [];
  for (const entry of entries) {
    if (entry.cc !== "CN") continue;
    if (!entry.province || entry.pop < CN_MIN_POP || !CJK.test(entry.name)) continue;
    // 浦东新区 and 万州区 carry city-sized populations in the dump but are districts
    // of 上海 and 重庆; offering them as cities would split one city's news across
    // two entries. They come back below as counties of the city that contains them.
    if (isDistrictPlace(entry.name)) continue;
    places.push({
      id: entry.id,
      name: entry.name,
      region: entry.province,
      countryCode: "CN",
      lat: entry.lat,
      lon: entry.lon,
      count: counts.get(entry.id) ?? 0,
    });
  }
  // Counties hang under the cities already listed: a county whose prefecture the
  // gazetteer does not carry would be unreachable, so it is left out rather than
  // promoted to a city of its own.
  const known = new Map(places.map(place => [place.id, place]));
  for (const row of counties) {
    const city = known.get(row.cityId);
    if (!city || !CJK.test(row.name)) continue;
    places.push({
      id: row.id,
      name: row.name,
      region: row.province ?? city.region,
      countryCode: "CN",
      lat: row.lat,
      lon: row.lon,
      count: counts.get(row.id) ?? 0,
      parentId: row.cityId,
      level: "district",
    });
  }
  // Busiest first inside a province; the dump order is not reliable after merging.
  places.sort((a, b) => b.count - a.count);

  const byId = new Map(entries.map(e => [e.id, e]));
  for (const [cc, list] of Object.entries(CURATED)) {
    for (const item of list) {
      const entry = byId.get(item.id);
      if (!entry) continue;
      places.push({
        id: entry.id,
        name: item.name,
        region: SPECIAL_LABEL[cc]!,
        countryCode: cc,
        lat: entry.lat,
        lon: entry.lon,
        count: counts.get(entry.id) ?? 0,
      });
    }
  }
  return places.slice(0, PLACE_LIMIT);
}

/** Pure: the first-level list (省 / 特别行政区), in a fixed conventional order. */
export function catalogRegions(places: readonly GeoCatalogPlace[]): GeoCatalogRegion[] {
  const groups = new Map<string, GeoCatalogRegion>();
  for (const place of places) {
    const key = `${place.countryCode}:${place.region}`;
    const found = groups.get(key);
    // The count beside a province is cities, not rows: "四川 · 25" is a promise
    // a reader can scan, while "四川 · 153" counts counties they never open.
    if (found) { if (!place.parentId) found.cities += 1; }
    else groups.set(key, { key, label: place.region, countryCode: place.countryCode, cities: 1 });
  }
  const rank = (region: GeoCatalogRegion) => {
    if (region.countryCode !== "CN") return 100 + ["HK", "MO", "TW"].indexOf(region.countryCode);
    const index = PROVINCE_ORDER.indexOf(region.label);
    return index === -1 ? 99 : index;
  };
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label, "zh-Hans-CN"));
}
