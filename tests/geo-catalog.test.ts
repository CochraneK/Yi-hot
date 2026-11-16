import test from "node:test";
import assert from "node:assert/strict";
import { catalogRegions, selectCatalogPlaces } from "../packages/backend/src/publication/geo-catalog-select.ts";
import type { GazetteerEntry } from "../packages/backend/src/editorial/geo-gazetteer.ts";

const entry = (over: Partial<GazetteerEntry> & { id: string; name: string }): GazetteerEntry => ({
  ascii: over.name,
  zh: [over.name],
  cc: "CN",
  admin1: "32",
  province: "四川",
  lat: 30,
  lon: 104,
  pop: 500_000,
  ...over,
});

test("a township below the population floor is not offered as a city", () => {
  const places = selectCatalogPlaces([
    entry({ id: "geonames-1", name: "绵阳", pop: 1_550_000 }),
    entry({ id: "geonames-2", name: "程堂村", pop: 8_000 }),
  ], new Map());
  assert.deepEqual(places.map(p => p.name), ["绵阳"]);
});

test("a mainland place with no province cannot be filed under a 省", () => {
  const places = selectCatalogPlaces([entry({ id: "geonames-3", name: "崇明", province: null })], new Map());
  assert.equal(places.length, 0);
});

test("a romanised row is skipped: the picker is Chinese", () => {
  const places = selectCatalogPlaces([entry({ id: "geonames-4", name: "Shenzhenwan" })], new Map());
  assert.equal(places.length, 0);
});

test("Hong Kong, Macao and Taiwan use the curated list and the national label", () => {
  const places = selectCatalogPlaces([
    entry({ id: "geonames-1819729", name: "香港", cc: "HK", province: "香港", pop: 7_396_076 }),
    entry({ id: "geonames-1821274", name: "澳门", cc: "MO", province: "澳门", pop: 649_335 }),
    entry({ id: "geonames-1668341", name: "台北", cc: "TW", province: "台湾", pop: 7_871_900 }),
    // A housing estate in the same dump: never a city you pick as home.
    entry({ id: "geonames-999", name: "Choi Wan Estate", cc: "HK", province: "香港", pop: 30_000 }),
  ], new Map());
  assert.deepEqual(places.map(p => `${p.name}/${p.region}`), ["香港/中国香港", "澳门/中国澳门", "台北/中国台湾"]);
  assert.deepEqual(places.map(p => p.countryCode), ["HK", "MO", "TW"]);
});

test("event counts follow the id, and a city with no news still counts as zero", () => {
  const places = selectCatalogPlaces([
    entry({ id: "geonames-1", name: "绵阳" }),
    entry({ id: "geonames-2", name: "宜宾" }),
  ], new Map([["geonames-1", 7]]));
  const byName = new Map(places.map(p => [p.name, p.count]));
  assert.equal(byName.get("绵阳"), 7);
  assert.equal(byName.get("宜宾"), 0);
});

test("regions come in the conventional order, special regions last", () => {
  const places = selectCatalogPlaces([
    entry({ id: "geonames-1", name: "绵阳", province: "四川" }),
    entry({ id: "geonames-2", name: "北京", province: "北京" }),
    entry({ id: "geonames-3", name: "宜宾", province: "四川" }),
    entry({ id: "geonames-1819729", name: "香港", cc: "HK", province: "香港" }),
    entry({ id: "geonames-1668341", name: "台北", cc: "TW", province: "台湾" }),
    entry({ id: "geonames-1821274", name: "澳门", cc: "MO", province: "澳门" }),
  ], new Map());
  const regions = catalogRegions(places);
  assert.deepEqual(regions.map(r => r.label), ["北京", "四川", "中国香港", "中国澳门", "中国台湾"]);
  assert.equal(regions.find(r => r.label === "四川")?.cities, 2);
});
