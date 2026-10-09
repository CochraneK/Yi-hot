// A daily's front-page picture comes from the item its lead is about: the editors' lead matched to an
// item by title, never simply the first highlight.
import "./setup.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReportCitation } from "@aihot/contracts/site";
import { leadItemOf } from "@aihot/backend/publication/reports";

const cite = (itemId: string, title: string) => ({ itemId, title }) as ReportCitation;
const rural = cite("a", "中国乡村发展基金会发布乡村儿童营养项目年度进展，覆盖 32 个省份");
const civil = cite("b", "民政部发布慈善组织公开募捐备案新规，明确信息公开与年报披露要求");

test("an editors' lead is matched to the item it is written about", () => {
  assert.equal(leadItemOf("民政部发布公开募捐备案新规，明确信息公开与年报要求", [rural, civil], [rural, civil])?.itemId, "b");
});

test("a lead that matches no item clearly has no item", () => {
  assert.equal(leadItemOf("多个基金会发布年报，行业透明度整体提升", [rural], [rural, civil]), undefined);
});

test("without an editors' lead the first highlight leads", () => {
  assert.equal(leadItemOf(undefined, [rural], [civil, rural])?.itemId, "a");
});
