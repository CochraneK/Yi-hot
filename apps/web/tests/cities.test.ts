import test from "node:test";
import assert from "node:assert/strict";
import { CITY_PLACES, cityClues, localHeadline, mentionsCity, placeById, placeByIpResult, embedMapLink } from "../app/features/cities/geo.ts";

test("unique IDs, bounded centres and no duplicate names within a country", () => {
  assert.equal(new Set(CITY_PLACES.map((p) => p.id)).size, CITY_PLACES.length);
  assert.equal(new Set(CITY_PLACES.map((p) => p.countryCode + "/" + p.name)).size, CITY_PLACES.length);
  assert.ok(CITY_PLACES.every((p) => p.lat >= -90 && p.lat <= 90 && p.lon >= -180 && p.lon <= 180));
});

test("multi-city headline gives distinct clues and cannot be labelled local", () => {
  const story = { title: "北京与上海开展跨地区合作", summary: "活动汇总" };
  assert.deepEqual(cityClues(story).map((p) => p.id), ["beijing", "shanghai"]);
  assert.equal(localHeadline(story, "beijing"), false);
});

test("summary-only mentions are clues but do not trigger local badge", () => {
  const story = { title: "儿童公益项目取得进展", summary: "项目与成都合作伙伴有关" };
  assert.deepEqual(cityClues(story).map((p) => p.id), ["chengdu"]);
  assert.equal(localHeadline(story, "chengdu"), false);
});

test("headline place is local when uniquely mentioned; no match means no badge", () => {
  assert.equal(localHeadline({ title: "广州举行公益论坛" }, "guangzhou"), true);
  assert.equal(localHeadline({ title: "广州举行公益论坛" }, "beijing"), false);
  assert.equal(localHeadline({ title: "公益论坛" }, null), false);
  assert.equal(localHeadline({ title: "北京某机构在四川开展公益活动" }, "beijing"), false);
  assert.equal(localHeadline({ title: "北京大学发布援助倡议" }, "beijing"), false);
  assert.equal(localHeadline({ title: "在北京举办公益论坛" }, "beijing"), true);
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
