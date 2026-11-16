import test from "node:test";
import assert from "node:assert/strict";
import { CITY_PLACES, cityClues, mentionsCity, placeById, placeByIpResult, embedMapLink } from "../app/features/cities/geo.ts";

test("unique IDs, bounded centres and no duplicate names within a country", () => {
  assert.equal(new Set(CITY_PLACES.map((p) => p.id)).size, CITY_PLACES.length);
  assert.equal(new Set(CITY_PLACES.map((p) => p.countryCode + "/" + p.name)).size, CITY_PLACES.length);
  assert.ok(CITY_PLACES.every((p) => p.lat >= -90 && p.lat <= 90 && p.lon >= -180 && p.lon <= 180));
});

test("multi-city headline gives distinct clues", () => {
  const story = { title: "北京与上海开展跨地区合作", summary: "活动汇总" };
  assert.deepEqual(cityClues(story).map((p) => p.id), ["beijing", "shanghai"]);
});

test("summary-only mentions are text clues", () => {
  const story = { title: "儿童公益项目取得进展", summary: "项目与成都合作伙伴有关" };
  assert.deepEqual(cityClues(story).map((p) => p.id), ["chengdu"]);
});

test("legacy place dictionary keeps country-scoped Hong Kong IP matching", () => {
  assert.equal(placeByIpResult("Hong Kong", "Hong Kong", "HK")?.id, "hongkong");
});

test("English aliases use word boundaries, not arbitrary substrings", () => {
  assert.equal(mentionsCity("Paris hosts summit", placeById("paris")!), true);
  assert.equal(mentionsCity("Comparison of programs", placeById("paris")!), false);
});

test("IP result is country-scoped and exact-city; ambiguity falls back", () => {
  assert.equal(placeByIpResult("Beijing", "Beijing", "CN")?.id, "beijing");
  assert.equal(placeByIpResult("London", "England", "GB")?.id, "london");
  assert.equal(placeByIpResult("London", "England", "US"), null);
  assert.equal(placeByIpResult("", "", "CN"), null);
});

test("map is an opt-in HTTPS origin", () => {
  const url = embedMapLink(placeById("wuhan")!);
  assert.equal(new URL(url).origin, "https://www.openstreetmap.org");
  assert.ok(url.includes("marker="));
});
