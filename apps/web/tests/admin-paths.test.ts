import assert from "node:assert/strict";
import { test } from "node:test";
import { safeAdminReturn } from "@aihot/contracts/admin-paths";
test("login retains deployed admin routes and legacy bookmarks, and rejects other paths", () => {
  assert.equal(safeAdminReturn("/yihot/admin/usage?days=14"), "/yihot/admin/usage?days=14");
  assert.equal(safeAdminReturn("/admin/content/item-1"), "/yihot/admin/content/item-1");
  for (const target of ["//evil.org", "/yihot/administer", "/futureme/admin", "/admin\\evil", "/admin\r\nLocation: x"]) {
    assert.equal(safeAdminReturn(target), "/yihot/admin");
  }
});
