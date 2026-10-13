import './setup.ts';
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, test } from 'node:test';
import { config } from '@aihot/backend/config';
import { closeDb } from '@aihot/backend/db';
import { fetchFeed, isWeRssFeed } from '@aihot/backend/sources/werss';
import { fetchRss } from '@aihot/backend/sources/rss';

const requests: string[] = [];
const body = '<p>' + '社区公益项目公开进展与志愿服务情况。'.repeat(30) + '</p>';
const server = http.createServer((req, res) => {
  requests.push(req.url ?? '/');
  if (req.url?.startsWith('/feed/redirect.rss')) {
    res.writeHead(302, { location: '/api/auth/token' }); res.end(); return;
  }
  res.writeHead(200, { 'content-type': 'application/rss+xml' });
  res.end(`<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>公众号</title>
    <item><title>公益项目进展</title><link>https://mp.weixin.qq.com/s/test-original</link>
    <pubDate>Sat, 10 Oct 2026 10:30:00 +0800</pubDate><content:encoded><![CDATA[${body}]]></content:encoded></item>
  </channel></rss>`);
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
config.weRssBaseUrl = base;
config.allowPrivateNetworkFetch = false;
after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await closeDb(); });

test('only configured WeRSS account feed paths bypass the private-network guard', async () => {
  assert.ok(isWeRssFeed(`${base}/feed/MP_123-abc.rss?limit=20&offset=0`));
  for (const address of [
    `${base}/api/auth/token`, `${base}/feed/all.rss?is_update=true`, `${base}/feed/a.rss?url=http://db`,
    `${base}/feed/../api/auth/token`, `${base}/feed/%2fapi.rss`, `${base}/feed/a.rss#admin`,
    'http://127.0.0.1:1/feed/a.rss', `http://user@127.0.0.1:${new URL(base).port}/feed/a.rss`,
  ]) {
    assert.equal(isWeRssFeed(address), false, address);
    await assert.rejects(fetchFeed(address, {}));
  }
  assert.equal(requests.length, 0, 'disallowed private targets are rejected before opening a connection');
  await assert.rejects(fetchFeed(`${base}/feed/redirect.rss`, {}), /redirects are not allowed/);
  assert.equal(requests.length, 1, 'redirect destination is never requested');
  assert.equal(isWeRssFeed(`${base}/feed/a.rss`, null), false);
});

test('WeRSS preserves original WeChat URLs, publication dates and body without refreshing upstream', async () => {
  const result = await fetchRss({ id: 'werss-test', kind: 'rss', participation_mode: 'editorial',
    config: { feedUrl: `${base}/feed/MP_123.rss?limit=20` } } as never);
  assert.equal(result.candidates.length, 1);
  const article = result.candidates[0]!;
  assert.equal(article.url, 'https://mp.weixin.qq.com/s/test-original');
  assert.equal(article.publishedAt?.toISOString(), '2026-10-10T02:30:00.000Z');
  assert.equal(article.bodyStatus, 'ok');
  assert.ok(article.bodyText?.includes('社区公益项目'));
  assert.equal(new URL(requests.at(-1)!, base).searchParams.get('is_update'), 'false');
  assert.equal(config.allowPrivateNetworkFetch, false);
});
