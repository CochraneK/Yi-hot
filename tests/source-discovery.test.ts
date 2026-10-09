import "./setup.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDiscoveredFeeds } from "@aihot/backend/sources/discovery";

test("discovers native RSS, Atom and JSON Feed links without inventing URLs", () => {
  const html = `<html><head>
    <link rel="alternate" type="application/rss+xml" href="/feed.xml" title="News">
    <link rel="alternate" type="application/atom+xml; charset=utf-8" href="https://other.org/feed" title="Mirror">
    <link rel="alternate" type="application/feed+json" href="/feed.json">
    <link rel="alternate" type="text/html" href="/fake">
    <link rel="stylesheet" type="application/rss+xml" href="/not-a-feed">
    <link rel="alternate" type="application/rss+xml" href="/feed.xml#fragment">
    </head></html>`;
  const found = parseDiscoveredFeeds(html, "https://example.org/news");
  assert.deepEqual(found.map(x => [x.url, x.format, x.sameHost, x.verified]), [
    ["https://example.org/feed.xml", "rss", true, false],
    ["https://example.org/feed.json", "json", true, false],
    ["https://other.org/feed", "atom", false, false],
  ]);
});

test("ignores malformed protocols, credentials and non-feed links", () => {
  const html = `<head>
    <link rel="alternate" type="application/rss+xml" href="javascript:alert(1)">
    <link rel="alternate" type="application/rss+xml" href="ftp://example.org/rss">
    <link rel="alternate" type="application/rss+xml" href="https://user:pass@example.org/rss">
    <a href="/posts/1">not feed</a>
    </head>`;
  assert.deepEqual(parseDiscoveredFeeds(html, "https://example.org"), []);
  assert.deepEqual(parseDiscoveredFeeds(html, "file:///etc/passwd"), []);
});

test("caps discovery results and never marks HTML links as verified", () => {
  const html = "<head>" + Array.from({ length: 20 }, (_, i) =>
    `<link rel="alternate" type="application/rss+xml" href="/feed${i}">`).join("") + "</head>";
  const rows = parseDiscoveredFeeds(html, "https://example.org");
  assert.equal(rows.length, 12);
  assert.ok(rows.every(x => x.verified === false));
});
