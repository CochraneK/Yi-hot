// The public site's search words: what a reader typed becomes the terms the SQL matches. These are
// pure (no database), so they guard the tokenizer's behaviour on their own.
import assert from "node:assert/strict";
import { test } from "node:test";
import { searchTerms } from "@aihot/backend/publication/pool";

test("search terms split where Han meets a Latin word, not before digits", () => {
  assert.deepEqual(searchTerms("多模态RAG"), ["多模态", "rag"]);
  assert.deepEqual(searchTerms("claude code更新 gpt-5 deepseek v4"), ["claude", "code", "更新", "gpt-5", "deepseek", "v4"]);
  assert.deepEqual(searchTerms("v4版本"), ["v4", "版本"]);
  // Digits stay attached: "10月" is one term, not 10 and 月.
  assert.deepEqual(searchTerms("10月"), ["10月"]);
});

test("search terms stay lower-cased, capped at six, and keep LIKE metacharacters literal", () => {
  assert.deepEqual(searchTerms("  RAG  "), ["rag"]);
  assert.equal(searchTerms("a b c d e f g h").length, 6);
  assert.deepEqual(searchTerms("qx%_z"), ["qx\\%\\_z"]);
});
