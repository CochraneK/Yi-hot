import { test, after } from "node:test";
import assert from "node:assert/strict";
import { resolvePlace, gazetteerStats, normalizePlaceName } from "@aihot/backend/editorial/geo-gazetteer";
import { decideAutoApproval } from "@aihot/backend/editorial/geo-auto-review";
import { closeDb } from "@aihot/backend/db";
after(closeDb);

test("gazetteer loads with Chinese names", () => {
  const stats = gazetteerStats();
  assert.ok(stats.entries > 2000, `expected a real gazetteer, got ${stats.entries}`);
  assert.ok(stats.names > stats.entries, "aliases should add names beyond entries");
});

test("exact and suffixed city names resolve to one place", () => {
  for (const [input, expected] of [["北京", "geonames-1816670"], ["北京市", "geonames-1816670"], ["上海", "geonames-1796236"]]) {
    const result = resolvePlace(input);
    assert.equal(result.status, "resolved", `${input} should resolve`);
    if (result.status === "resolved") assert.equal(result.place.id, expected, input);
  }
  const suffixed = resolvePlace("东营市");
  assert.equal(suffixed.status, "resolved");
  if (suffixed.status === "resolved") assert.equal(suffixed.place.name.slice(0, 2), "东营");
});

test("a street is never read as the city in its name", () => {
  // 南京东路 is in Shanghai. Matching the prefix would put the event on Nanjing.
  assert.equal(resolvePlace("南京东路世纪广场").status, "unknown");
  assert.equal(resolvePlace("南京西路").status, "unknown");
  assert.equal(resolvePlace("北京路").status, "unknown");
});

test("names absent from the dump stay unknown instead of guessed", () => {
  assert.equal(resolvePlace("江宁区").status, "unknown");
  assert.equal(resolvePlace("雨花台区").status, "unknown");
  assert.equal(resolvePlace("银山社区").status, "unknown");
  assert.equal(resolvePlace("柳峰上岚村").status, "unknown");
});

test("compound administrative names resolve to their city head", () => {
  const result = resolvePlace("上海市金山区");
  assert.equal(result.status, "resolved");
  if (result.status === "resolved") assert.equal(result.place.name.slice(0, 2), "上海");
  const tibet = resolvePlace("西藏昌都");
  assert.equal(tibet.status, "resolved");
  if (tibet.status === "resolved") assert.equal(tibet.place.name.slice(0, 2), "昌都");
});

test("normalisation drops spacing and keeps the name intact", () => {
  assert.equal(normalizePlaceName(" 北 京 "), "北京");
  assert.equal(normalizePlaceName("北·京"), "北京");
});

test("auto approval refuses anything that is not an event location", () => {
  const base = { placeText: "北京", evidence: "11月15日，北京举办第七届公益论坛" };
  assert.equal(decideAutoApproval({ ...base, role: "publisher" }).approve, false);
  assert.equal(decideAutoApproval({ ...base, role: "mentioned" }).approve, false);
  assert.equal(decideAutoApproval({ ...base, role: "affected" }).approve, false);
});

test("auto approval refuses institutions, outlets and ranges", () => {
  const cases = [
    { placeText: "北京", evidence: "北京某基金会向四川捐赠物资" },
    { placeText: "北京", evidence: "北京市朝阳区某街道办事处组织活动" },
    { placeText: "上海", evidence: "上海日报报道了这次公益活动" },
    { placeText: "全国", evidence: "全国范围内开展志愿服务活动" },
  ];
  for (const item of cases) {
    const decision = decideAutoApproval({ ...item, role: "event" });
    assert.equal(decision.approve, false, `${item.placeText} in "${item.evidence}" must not auto-approve`);
  }
});

test("auto approval refuses quotes that only name the place", () => {
  const decision = decideAutoApproval({ placeText: "南京", role: "event", evidence: "南京" });
  assert.equal(decision.approve, false);
  assert.match(decision.reason, /only a place name/);
});

test("auto approval refuses places the gazetteer cannot settle", () => {
  const unknown = decideAutoApproval({ placeText: "江宁区", role: "event", evidence: "江宁区民政局举办集体婚礼" });
  assert.equal(unknown.approve, false);
  assert.match(unknown.reason, /not in gazetteer/);

  const bare = decideAutoApproval({ placeText: "银山社区", role: "event", evidence: "银山社区开展垃圾分类宣传" });
  assert.equal(bare.approve, false);
});

test("auto approval accepts a city with a clean event quote", () => {
  const decision = decideAutoApproval({ placeText: "成都", role: "event", evidence: "11月14日，成都在天府广场举行公益市集" });
  assert.equal(decision.approve, true);
  assert.ok(decision.place);
  assert.equal(decision.place.countryCode, "CN");
  assert.equal(decision.place.precision, "city");
  assert.match(decision.place.sourceUrl, /^https:\/\/www\.geonames\.org\/\d+$/);
});
