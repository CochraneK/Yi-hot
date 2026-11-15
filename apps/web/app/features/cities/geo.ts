/** Reader-side place clues, not verified event locations.
 * Coordinates are approximate city centres; never use them as street addresses.
 * Keep one dictionary for the map, local badge and regional search.
 */
export interface CityPlace {
  id: string;
  name: string;
  region: string;
  country: string;
  countryCode: string;
  lat: number;
  lon: number;
  aliases: readonly string[];
}

const p = (id: string, name: string, region: string, country: string, countryCode: string, lat: number, lon: number, aliases: string[] = []): CityPlace =>
  ({ id, name, region, country, countryCode, lat, lon, aliases });

export const CITY_PLACES: readonly CityPlace[] = [
  p("beijing", "北京", "北京", "中国", "CN", 39.904, 116.407, ["Beijing"]),
  p("tianjin", "天津", "天津", "中国", "CN", 39.084, 117.201, ["Tianjin"]),
  p("shanghai", "上海", "上海", "中国", "CN", 31.230, 121.474, ["Shanghai"]),
  p("chongqing", "重庆", "重庆", "中国", "CN", 29.564, 106.551, ["Chongqing"]),
  p("shijiazhuang", "石家庄", "河北", "中国", "CN", 38.042, 114.514, ["Shijiazhuang"]),
  p("taiyuan", "太原", "山西", "中国", "CN", 37.870, 112.549, ["Taiyuan"]),
  p("hohhot", "呼和浩特", "内蒙古", "中国", "CN", 40.842, 111.749, ["Hohhot"]),
  p("shenyang", "沈阳", "辽宁", "中国", "CN", 41.805, 123.432, ["Shenyang"]),
  p("changchun", "长春", "吉林", "中国", "CN", 43.817, 125.324, ["Changchun"]),
  p("harbin", "哈尔滨", "黑龙江", "中国", "CN", 45.803, 126.535, ["Harbin"]),
  p("nanjing", "南京", "江苏", "中国", "CN", 32.061, 118.797, ["Nanjing"]),
  p("hangzhou", "杭州", "浙江", "中国", "CN", 30.274, 120.155, ["Hangzhou"]),
  p("hefei", "合肥", "安徽", "中国", "CN", 31.821, 117.227, ["Hefei"]),
  p("fuzhou", "福州", "福建", "中国", "CN", 26.075, 119.297, ["Fuzhou"]),
  p("nanchang", "南昌", "江西", "中国", "CN", 28.683, 115.858, ["Nanchang"]),
  p("jinan", "济南", "山东", "中国", "CN", 36.651, 117.120, ["Jinan"]),
  p("zhengzhou", "郑州", "河南", "中国", "CN", 34.747, 113.625, ["Zhengzhou"]),
  p("wuhan", "武汉", "湖北", "中国", "CN", 30.592, 114.306, ["Wuhan"]),
  p("changsha", "长沙", "湖南", "中国", "CN", 28.228, 112.939, ["Changsha"]),
  p("guangzhou", "广州", "广东", "中国", "CN", 23.129, 113.264, ["Guangzhou", "Canton"]),
  p("nanning", "南宁", "广西", "中国", "CN", 22.817, 108.366, ["Nanning"]),
  p("haikou", "海口", "海南", "中国", "CN", 20.045, 110.199, ["Haikou"]),
  p("chengdu", "成都", "四川", "中国", "CN", 30.572, 104.067, ["Chengdu"]),
  p("guiyang", "贵阳", "贵州", "中国", "CN", 26.647, 106.630, ["Guiyang"]),
  p("kunming", "昆明", "云南", "中国", "CN", 25.039, 102.712, ["Kunming"]),
  p("lhasa", "拉萨", "西藏", "中国", "CN", 29.652, 91.172, ["Lhasa"]),
  p("xian", "西安", "陕西", "中国", "CN", 34.342, 108.940, ["Xi'an", "Xian"]),
  p("lanzhou", "兰州", "甘肃", "中国", "CN", 36.061, 103.834, ["Lanzhou"]),
  p("xining", "西宁", "青海", "中国", "CN", 36.617, 101.778, ["Xining"]),
  p("yinchuan", "银川", "宁夏", "中国", "CN", 38.487, 106.230, ["Yinchuan"]),
  p("urumqi", "乌鲁木齐", "新疆", "中国", "CN", 43.825, 87.617, ["Urumqi", "Ürümqi"]),
  p("hongkong", "香港", "香港", "中国", "HK", 22.319, 114.169, ["Hong Kong"]),
  p("macau", "澳门", "澳门", "中国", "MO", 22.199, 113.544, ["Macau", "Macao"]),
  p("taipei", "台北", "台湾", "中国", "TW", 25.033, 121.565, ["Taipei"]),
  p("shenzhen", "深圳", "广东", "中国", "CN", 22.543, 114.058, ["Shenzhen"]),
  p("suzhou", "苏州", "江苏", "中国", "CN", 31.299, 120.585, ["Suzhou"]),
  p("ningbo", "宁波", "浙江", "中国", "CN", 29.868, 121.544, ["Ningbo"]),
  p("qingdao", "青岛", "山东", "中国", "CN", 36.067, 120.383, ["Qingdao"]),
  p("dalian", "大连", "辽宁", "中国", "CN", 38.914, 121.615, ["Dalian"]),
  p("xiamen", "厦门", "福建", "中国", "CN", 24.479, 118.089, ["Xiamen"]),
  p("luoyang", "洛阳", "河南", "中国", "CN", 34.619, 112.454, ["Luoyang"]),
  p("linfen", "临汾", "山西", "中国", "CN", 36.088, 111.519, ["Linfen"]),
  p("tangshan", "唐山", "河北", "中国", "CN", 39.630, 118.180, ["Tangshan"]),
  p("qinhuangdao", "秦皇岛", "河北", "中国", "CN", 39.935, 119.597, ["Qinhuangdao"]),
  p("singapore", "新加坡", "新加坡", "新加坡", "SG", 1.352, 103.820, ["Singapore"]),
  p("tokyo", "东京", "东京", "日本", "JP", 35.676, 139.650, ["Tokyo"]),
  p("seoul", "首尔", "首尔", "韩国", "KR", 37.566, 126.978, ["Seoul"]),
  p("bangkok", "曼谷", "曼谷", "泰国", "TH", 13.756, 100.502, ["Bangkok"]),
  p("hanoi", "河内", "河内", "越南", "VN", 21.028, 105.854, ["Hanoi"]),
  p("kuala-lumpur", "吉隆坡", "吉隆坡", "马来西亚", "MY", 3.139, 101.687, ["Kuala Lumpur"]),
  p("london", "伦敦", "英格兰", "英国", "GB", 51.507, -0.128, ["London"]),
  p("paris", "巴黎", "法兰西岛", "法国", "FR", 48.857, 2.352, ["Paris"]),
  p("berlin", "柏林", "柏林", "德国", "DE", 52.520, 13.405, ["Berlin"]),
  p("moscow", "莫斯科", "莫斯科", "俄罗斯", "RU", 55.756, 37.617, ["Moscow"]),
  p("new-york", "纽约", "纽约州", "美国", "US", 40.713, -74.006, ["New York"]),
  p("washington", "华盛顿", "哥伦比亚特区", "美国", "US", 38.907, -77.037, ["Washington, D.C.", "Washington DC"]),
  p("los-angeles", "洛杉矶", "加利福尼亚", "美国", "US", 34.052, -118.244, ["Los Angeles"]),
  p("san-francisco", "旧金山", "加利福尼亚", "美国", "US", 37.775, -122.419, ["San Francisco"]),
  p("nairobi", "内罗毕", "内罗毕", "肯尼亚", "KE", -1.286, 36.817, ["Nairobi"]),
  p("geneva", "日内瓦", "日内瓦", "瑞士", "CH", 46.204, 6.143, ["Geneva"]),
];

const ALPHA = "abcdefghijklmnopqrstuvwxyz";
function hasTerm(text: string, term: string): boolean {
  const lower = text.toLocaleLowerCase();
  const target = term.toLocaleLowerCase();
  let start = 0;
  while (start < lower.length) {
    const i = lower.indexOf(target, start);
    if (i < 0) return false;
    const latin = [...target].some((ch) => ALPHA.includes(ch));
    const before = i === 0 ? "" : lower[i - 1]!;
    const after = lower[i + target.length] ?? "";
    if (!latin || (!(before && ALPHA.includes(before)) && !(after && ALPHA.includes(after)))) return true;
    start = i + target.length;
  }
  return false;
}

export function mentionsCity(text: string, place: CityPlace): boolean {
  return [place.name, ...place.aliases].some((s) => hasTerm(text, s));
}

/** At most three clues; title first. Mentions ≠ confirmed event locations. */
export function cityClues(article: { title: string; summary?: string | null }): CityPlace[] {
  const titleMatches = CITY_PLACES.filter((place) => mentionsCity(article.title, place));
  const summaryMatches = CITY_PLACES.filter((place) => !titleMatches.includes(place) && mentionsCity(article.summary ?? "", place));
  return [...titleMatches, ...summaryMatches].slice(0, 3);
}

export function placeById(id: string | null | undefined): CityPlace | null {
  return CITY_PLACES.find((p) => p.id === id) ?? null;
}

export function placeByIpResult(city: string, region: string, countryCode: string): CityPlace | null {
  if (!city || !countryCode) return null;
  const candidates = CITY_PLACES.filter((p) => p.countryCode === countryCode.toUpperCase());
  return candidates.find((p) => [p.name, ...p.aliases].some((a) => a.toLocaleLowerCase() === city.toLocaleLowerCase()))
    ?? candidates.find((p) => p.region.toLocaleLowerCase() === region.toLocaleLowerCase() && p.name.toLocaleLowerCase() === city.toLocaleLowerCase())
    ?? null;
}

/** Local is deliberately stricter than the map: one place explicitly named in the headline. */
export function localHeadline(article: { title: string; summary?: string | null }, readerCityId: string | null): boolean {
  const place = placeById(readerCityId);
  // Only an explicit Chinese city name qualifies for the badge; English aliases may be ambiguous homonyms.
  if (!place || !hasTerm(article.title, place.name)) return false;
  if (CITY_PLACES.filter((p) => mentionsCity(article.title, p)).length !== 1) return false;
  // Institution names are not event locations: a place name must directly introduce an event action
  // or follow an explicit location preposition. Suppress a competing province mention.
  const competingRegion = new Set(CITY_PLACES.filter((p) => p.country === "中国" && p.region !== place.region).map((p) => p.region));
  if ([...competingRegion].some((name) => hasTerm(article.title, name))) return false;
  const index = article.title.indexOf(place.name);
  const before = article.title.slice(Math.max(0, index - 3), index);
  const after = article.title.slice(index + place.name.length).replace(/^[市省区县]/, "");
  const actions = ["举行", "举办", "开展", "启动", "召开", "发生", "通报", "发布", "宣布", "新增", "启动", "：", ":"];
  return before.endsWith("在") || before.endsWith("于") || after.startsWith("市在") || actions.some((verb) => after.startsWith(verb));
}

export function openStreetMapLink(place: CityPlace): string {
  return "https://www.openstreetmap.org/?mlat=" + encodeURIComponent(place.lat) + "&mlon=" + encodeURIComponent(place.lon) + "#map=10/" + place.lat + "/" + place.lon;
}

export function embedMapLink(place: CityPlace): string {
  const dLat = 0.18, dLon = 0.28;
  const bbox = [place.lon - dLon, place.lat - dLat, place.lon + dLon, place.lat + dLat].join(",");
  return "https://www.openstreetmap.org/export/embed.html?bbox=" + encodeURIComponent(bbox) + "&marker=" + encodeURIComponent(place.lat + "," + place.lon);
}
