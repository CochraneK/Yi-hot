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
  assert.equal(resolvePlace("银山社区").status, "unknown");
  assert.equal(resolvePlace("柳峰上岚村").status, "unknown");
});

test("a district keeps its own name and carries the city it sits in", () => {
  // The finer grain is what the story said. 江宁区 stays 江宁区; the parent is
  // what the picker and the heat map group by, so one city never splits in two.
  for (const [input, city] of [["江宁区", "南京"], ["静安区", "上海"], ["浦东新区", "上海"], ["万州区", "重庆"], ["城阳区", "青岛"], ["天河区", "广州"]]) {
    const result = resolvePlace(input);
    assert.equal(result.status, "resolved", `${input} should resolve`);
    if (result.status !== "resolved") continue;
    assert.equal(result.place.name, input, input);
    assert.equal(result.place.parent?.name, city, `${input} parent`);
  }
  // With the city in front the tail still wins, and the head decides between
  // same-named districts.
  const compound = resolvePlace("南京江宁区");
  assert.equal(compound.status, "resolved");
  if (compound.status === "resolved") {
    assert.equal(compound.place.name, "江宁区");
    assert.equal(compound.place.parent?.name, "南京");
  }
  const hinted = resolvePlace("北京朝阳区");
  assert.equal(hinted.status, "resolved");
  if (hinted.status === "resolved") {
    assert.equal(hinted.place.name, "朝阳区");
    assert.equal(hinted.place.parent?.name, "北京");
  }
});

test("a county-level city keeps its name and its prefecture", () => {
  // 昆山, 瑞安 and 义乌 are county-level cities. They are not folded away: the
  // stored place is 昆山市, and the map counts it under 苏州. The bare spelling
  // must answer the same way, or 昆山 and 昆山市 would land in two places.
  for (const [input, name, city] of [["昆山市", "昆山市", "苏州"], ["瑞安市", "瑞安市", "温州"], ["义乌市", "义乌市", "金华"], ["昆山", "昆山市", "苏州"]]) {
    const result = resolvePlace(input);
    assert.equal(result.status, "resolved", input);
    if (result.status === "resolved") {
      assert.equal(result.place.name, name, input);
      assert.equal(result.place.parent?.name, city, `${input} parent`);
    }
  }
  // A district that borrows its city's name must not swallow the city: 东营区
  // strips to 东营, and 东营 has to stay the city.
  const city = resolvePlace("东营");
  assert.equal(city.status, "resolved");
  if (city.status === "resolved") {
    assert.equal(city.place.name, "东营");
    assert.equal(city.place.parent, undefined);
  }
});

test("a district name is never stripped into a different city", () => {
  // 朝阳区 is 北京 and 长春. Stripping 区 leaves 朝阳, a city in 辽宁 — the one
  // outcome worse than leaving the name unresolved.
  const result = resolvePlace("朝阳区");
  assert.equal(result.status, "ambiguous");
  if (result.status === "ambiguous") assert.ok(result.candidateIds.length >= 2);
  assert.equal(resolvePlace("鼓楼区").status, "ambiguous");
});

test("compound administrative names resolve to the county-level unit", () => {
  const result = resolvePlace("上海市金山区");
  assert.equal(result.status, "resolved");
  if (result.status === "resolved") {
    assert.equal(result.place.name, "金山区");
    assert.equal(result.place.parent?.name, "上海");
  }
  // A prefecture-level city is not in the county list, so it stays itself.
  const tibet = resolvePlace("西藏昌都");
  assert.equal(tibet.status, "resolved");
  if (tibet.status === "resolved") {
    assert.equal(tibet.place.name.slice(0, 2), "昌都");
    assert.equal(tibet.place.parent, undefined);
  }
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
  // 色达县 belongs to a prefecture the gazetteer does not carry, so it stays pending.
  const unknown = decideAutoApproval({ placeText: "色达县", role: "event", evidence: "色达县的牧民搬进了新居" });
  assert.equal(unknown.approve, false);
  assert.match(unknown.reason, /not in gazetteer/);

  const bare = decideAutoApproval({ placeText: "银山社区", role: "event", evidence: "银山社区开展垃圾分类宣传" });
  assert.equal(bare.approve, false);
});

test("a district in a clean quote is approved at its own grain", () => {
  // The candidate keeps the name the model read (江宁区, so the evidence check
  // still finds it) and the place keeps it too, with 南京 as the parent.
  const decision = decideAutoApproval({ placeText: "江宁区", role: "event", evidence: "江宁区新开两条公交线路，九月起试运行" });
  assert.equal(decision.approve, true);
  assert.equal(decision.place?.name, "江宁区");
  assert.equal(decision.place?.parent?.name, "南京");
});

test("a village or township reusing a city name is not that city", () => {
  // Field samples that all reached the map before this rule: 太原村 is in Fujian,
  // 坪山乡 is in Guizhou, 园林街道 is a subdistrict of Qianjiang, 温泉镇 is a town.
  const cases = [
    { placeText: "太原村", evidence: "福建永泰县太原村的乡村教师坚守三十年" },
    { placeText: "坪山乡", evidence: "启动仪式在坪山乡举行，当地孩子第一次走进绘本馆" },
    { placeText: "园林街道", evidence: "园林街道建设街社区的张大爷点赞高龄津贴新举措" },
    { placeText: "温泉镇", evidence: "温泉镇的乡村医生每天骑车巡诊两个村" },
  ];
  for (const item of cases) {
    const decision = decideAutoApproval({ ...item, role: "event" });
    assert.equal(decision.approve, false, `${item.placeText} must not resolve to a same-named city`);
    assert.match(decision.reason, /sub-city unit/, item.placeText);
  }
});

test("a city named through a full administrative chain still resolves", () => {
  const decision = decideAutoApproval({
    placeText: "四川省广元市朝天区李家镇望远山社区",
    role: "event",
    evidence: "四川省广元市朝天区李家镇望远山社区的蓝莓园里，村民们正在采摘",
  });
  assert.equal(decision.approve, true);
  assert.equal(decision.place?.name.slice(0, 2), "广元");
});

test("datelines and branch offices are not event locations", () => {
  const dateline = decideAutoApproval({ placeText: "北京", role: "event", evidence: "新华社北京10月30日电" });
  assert.equal(dateline.approve, false);

  const branch = decideAutoApproval({ placeText: "北京", role: "event", evidence: "中国红十字会北京代表处今天挂牌" });
  assert.equal(branch.approve, false);

  const police = decideAutoApproval({ placeText: "宜昌", role: "event", evidence: "宜昌市公安局西陵区分局窑湾派出所所长介绍情况" });
  assert.equal(police.approve, false);

  const bureau = decideAutoApproval({ placeText: "上海", role: "event", evidence: "上海市金山区市场监管局回应称已立案" });
  assert.equal(bureau.approve, false);
  // 办 must not be read as 办公室: 举办 is an ordinary verb.
  assert.equal(decideAutoApproval({ placeText: "北京", role: "event", evidence: "11月15日，北京举办第七届公益论坛" }).approve, true);
});

test("auto approval accepts a city with a clean event quote", () => {
  const decision = decideAutoApproval({ placeText: "成都", role: "event", evidence: "11月14日，成都在天府广场举行公益市集" });
  assert.equal(decision.approve, true);
  assert.ok(decision.place);
  assert.equal(decision.place.countryCode, "CN");
  assert.equal(decision.place.precision, "city");
  assert.match(decision.place.sourceUrl, /^https:\/\/www\.geonames\.org\/\d+$/);
});
