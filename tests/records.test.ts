// 监管记录映射：统一社会信用代码 → 组织类型，上游类型码 → 记录类型。
// 上游（chinanpo.mca.gov.cn）用 600406/600407 区分活动异常名录与严重违法失信名单，
// 用 600824/600825/600826 区分送达、列入、移出公告；码表变化时这里会漏数据，所以钉住。
import assert from "node:assert/strict";
import { test } from "node:test";
import { noticeTypeOf, orgKindOf } from "@aihot/backend/records/sync";

test("org kind comes from the first two digits of the unified code", () => {
  assert.equal(orgKindOf("51100000500003304A"), "social_group");
  assert.equal(orgKindOf("52421303MJJ053878U"), "private_non_enterprise");
  assert.equal(orgKindOf("531000007178346518"), "foundation");
  assert.equal(orgKindOf("12100000400001234X"), null);
  assert.equal(orgKindOf(null), null);
  assert.equal(orgKindOf(""), null);
});

test("notice type maps list kind times announcement kind", () => {
  // 活动异常名录：列入 / 移出 / 送达
  assert.equal(noticeTypeOf("600406", "600825"), "abnormal_enrol");
  assert.equal(noticeTypeOf("600406", "600826"), "abnormal_remove");
  assert.equal(noticeTypeOf("600406", "600824"), "delivery");
  // 严重违法失信名单：列入 / 移出 / 送达
  assert.equal(noticeTypeOf("600407", "600825"), "dishonesty_enrol");
  assert.equal(noticeTypeOf("600407", "600826"), "dishonesty_remove");
  assert.equal(noticeTypeOf("600407", "600824"), "delivery");
  // 未知码不猜，宁可漏也不要错分类
  assert.equal(noticeTypeOf("600406", "600999"), null);
  assert.equal(noticeTypeOf(null, "600825"), null);
});
