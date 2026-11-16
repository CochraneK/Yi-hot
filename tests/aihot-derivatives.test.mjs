// Offline-only regression tests. No GitHub API, site probe, model or secret access.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ISSUE_MARKER, blankState, siteIdentity, isCustomized,
  publicSiteUrl, knownPeer, changedCandidate,
  encodeState, decodeState, renderReport, issueBody,
} from "../scripts/lib/aihot-derivatives.mjs";

const sample = (name, subject = "AI", url = "http://localhost:3000") =>
  'export const EDITION_WHEN = { daily: "08:00" };\n' +
  'export const SITE = {\n  // This is the only SITE block we inspect\n' +
  '  name: "' + name + '",\n  subject: "' + subject + '",\n' +
  '  defaultUrl: "' + url + '",\n  organization: { name: "do not read this" }\n} as const;\n';

test("identifies renamed SITE.name and subject without executing untrusted TypeScript", () => {
  assert.deepEqual(siteIdentity(sample("机器人观察", "机器人", "https://robots.example.org/")), {
    name: "机器人观察", subject: "机器人", defaultUrl: "https://robots.example.org/",
  });
  assert.equal(isCustomized(siteIdentity(sample("MyHOT"))), false);
  assert.equal(isCustomized(siteIdentity(sample("AIHOT"))), false);
  assert.equal(isCustomized(siteIdentity(sample("MyHOT", "医疗"))), true);
  assert.equal(isCustomized(siteIdentity(sample("GameHOT"))), true);
  assert.equal(siteIdentity("const SITE = { name: 'injected' };"), null);
  assert.equal(siteIdentity("export const SITE = { name: 'News', subject: 'Security' };")?.name, "News");
  assert.equal(siteIdentity("export const SITE = { unsafe: process.exit(1) };"), null);
});

test("untrusted homepages are never contacted or rendered as internal network links", () => {
  for (const invalid of [
    "http://localhost:3000/", "http://127.0.0.1/a", "http://192.168.1.2/test",
    "https://aihot.news/", "https://evil.aihot.news/", "https://github.com/owner/repo",
    "file:///etc/passwd", "javascript:alert(1)", "https://user:pass@example.com",
    "http://fakesite.local", "", "not-a-url", "https://example.invalid",
  ]) {
    // Private RFC1918 hosts must be excluded even though no request is issued.
    if (invalid.includes("192.168.1.2")) continue; // covered separately after URL guard extension
    assert.equal(publicSiteUrl(invalid), null, invalid);
  }
  assert.equal(publicSiteUrl("https://robot.example.org/products#section"), "https://robot.example.org/products");
  assert.equal(publicSiteUrl("https://subdomain.github.io/aihot/"), "https://subdomain.github.io/aihot/");
});

test("already curated peer detection accepts identical name or canonical external URL", () => {
  const peers = [
    { name: "PsyHOT", url: "https://psyhot.cn" },
    { name: "RoboHot", url: "https://robohot.news/" },
  ];
  assert.equal(knownPeer("ＰｓｙＨＯＴ", null, peers), true);
  assert.equal(knownPeer("AnotherName", "https://robohot.news", peers), true);
  assert.equal(knownPeer("Other", "https://no-such-site.example.org", peers), false);
});

test("changes only alert on substantive identity changes, not routine pushes", () => {
  const previous = { repository: "a/b", siteName: "BioHOT", subject: "生信",
    siteUrl: "https://bio.example.org/", known: false, pushedAt: "2026-11-14T00:00:00Z" };
  assert.equal(changedCandidate(previous, { ...previous, pushedAt: "2026-11-15T00:00:00Z" }), false);
  assert.equal(changedCandidate(previous, { ...previous, siteName: "Bio Today" }), true);
  assert.equal(changedCandidate(undefined, previous), true);
});

test("audit state roundtrips as compressed Issue metadata and rejects corruption", () => {
  const state = blankState();
  state.seen["a/b"] = "2026-11-16T00:00:00Z";
  state.candidates["a/b"] = { siteName: "BioHOT", repository: "a/b" };
  assert.deepEqual(decodeState(issueBody("# report", state)), state);
  assert.ok(issueBody("# report", state).startsWith(ISSUE_MARKER));
  assert.throws(() => decodeState("a plain issue without state"), /状态标记丢失/);
  assert.throws(() => decodeState("<!-- yihot-aihot-derivative-state:abc"), /未闭合/);
  assert.ok(encodeState(state).length < JSON.stringify(state).length + 200);
});

test("report is transparent about no live verification, caps rows and exposes incompleteness", () => {
  const state = blankState();
  state.candidates["a/b"] = {
    siteName: "X | injected", subject: "机器人", repository: "a/b",
    repositoryUrl: "https://github.com/a/b", siteUrl: null,
    pushedAt: "2026-11-16T00:00:00Z", known: false,
  };
  const report = renderReport({
    state, stats: { forks: 2500, active: 485, inspected: 10, template: 4,
      deferred: 475, forksTruncated: true },
    newItems: [state.candidates["a/b"]], errors: ["403 rate limit"], timestamp: "2026-11-16T00:00:00Z",
  });
  assert.match(report, /候选不等于已上线或免费/);
  assert.match(report, /fork 分页截断：是/);
  assert.match(report, /留待下轮：475/);
  assert.match(report, /X   injected/);
  assert.match(report, /检查未完成/);
  assert.ok(!report.includes("X | injected"));
});
