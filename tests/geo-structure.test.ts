import { test } from "node:test";
import assert from "node:assert/strict";
import { groundGeoCandidates, type GeoCandidate } from "../packages/backend/src/editorial/geography.ts";

const article = {
  title: "北京某公益组织在四川凉山开展儿童教育项目",
  bodyText: "北京某公益组织在四川凉山开展儿童教育项目，项目面向凉山地区儿童。",
  excerpt: null,
  xPost: null,
  translationZh: null,
};

const sample = (place: string, role: GeoCandidate["role"], evidence: string): GeoCandidate => ({ place, role, evidence });

test("distinguishes activity location and institution location without claiming verification", () => {
  const hints = groundGeoCandidates(article, [
    sample("四川凉山", "event", "在四川凉山开展儿童教育项目"),
    sample("北京", "publisher", "北京某公益组织"),
  ]);
  assert.deepEqual(hints.map((x) => [x.place, x.role]), [["四川凉山", "event"], ["北京", "publisher"]]);
});

test("rejects hallucinated places, made-up quotations and metadata-only source locations", () => {
  const hints = groundGeoCandidates(article, [
    sample("火星", "event", "在火星举行培训"),
    sample("四川", "event", "在四川举办了大型会议"),
    sample("深圳", "publisher", "深圳"),
    sample("北京", "publisher", "北京某公益组织"),
  ]);
  assert.deepEqual(hints, [sample("北京", "publisher", "北京某公益组织")]);
});

test("retains legitimate multi-place evidence, deduplicates and bounds cardinality", () => {
  const b = {
    title: "上海、北京、南京、成都、武汉五地联动",
    bodyText: null,
    excerpt: "上海、北京、南京、成都、武汉五地联动",
    xPost: null,
    translationZh: null,
  };
  const hints = groundGeoCandidates(b, [
    sample("上海", "mentioned", "上海、北京、南京、成都、武汉五地联动"),
    sample("上海", "mentioned", "上海、北京、南京、成都、武汉五地联动"),
    sample("北京", "mentioned", "上海、北京、南京、成都、武汉五地联动"),
    sample("南京", "mentioned", "上海、北京、南京、成都、武汉五地联动"),
    sample("成都", "mentioned", "上海、北京、南京、成都、武汉五地联动"),
    sample("武汉", "mentioned", "上海、北京、南京、成都、武汉五地联动"),
  ]);
  assert.equal(hints.length, 4);
  assert.deepEqual(hints.map((h) => h.place), ["上海", "北京", "南京", "成都"]);
});

test("X post and translation evidence can be grounded; source name and author are excluded", () => {
  const b = {
    title: "公益进展",
    bodyText: null,
    excerpt: null,
    xPost: { text: "在东京组织研讨会", quoted: { text: "伦敦机构发布公告" } },
    translationZh: "开展于纽约的公益培训",
  };
  assert.deepEqual(groundGeoCandidates(b, [
    sample("东京", "event", "在东京组织研讨会"),
    sample("伦敦", "publisher", "伦敦机构发布公告"),
    sample("纽约", "event", "开展于纽约的公益培训"),
    sample("新加坡", "event", "来源为新加坡"),
  ]).map((h) => h.place), ["东京", "伦敦", "纽约"]);
});

test("grounding disallows absence of material and artificial evidence stitched across fields", () => {
  assert.deepEqual(groundGeoCandidates({
    title: "北京", bodyText: "举行公益活动", excerpt: null, xPost: null, translationZh: null,
  }, [sample("北京", "event", "北京举行公益活动")]), []);
});
