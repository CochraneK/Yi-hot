import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardTags, cardTagValues } from '@aihot/industry/card-tags';
import { normalizeTags } from '@aihot/backend/editorial/vocabulary';

test('cards reuse registered entity labels and retain unregistered model tags',()=>{
  assert.deepEqual(cardTags(['entity:tencent-charity','新项目标签','新项目标签']),['腾讯公益','新项目标签']);
  assert.deepEqual(cardTagValues('腾讯公益'),['腾讯公益','entity:tencent-charity']);
  assert.deepEqual(cardTagValues('新项目标签'),['新项目标签']);
  assert.deepEqual(cardTags(['entity:unknown']),[]);
});

test('other fields is an exclusive deterministic fallback',()=>{
  assert.deepEqual(normalizeTags(['政策','养老服务']),['政策','养老服务','其他领域']);
  assert.deepEqual(normalizeTags(['政策','儿童教育','养老服务','其他领域']),['政策','儿童教育','养老服务']);
  assert.deepEqual(normalizeTags(['非公益']),['非公益']);
  assert.deepEqual(cardTags(['政策','养老服务','其他领域']),['养老服务','其他领域','政策']);
});

test('cards use concise labels while old slash tags remain filter-compatible',()=>{
  assert.deepEqual(cardTags(['政策/监管','乡村教育']),['乡村教育','政策']);
  assert.deepEqual(cardTagValues('政策'),['政策','政策/监管']);
  assert.deepEqual(cardTagValues('政策与监管'),['政策与监管','政策','政策/监管']);
  assert.deepEqual(cardTags(['募集/数据']),['募集']);
  assert.deepEqual(cardTags(['机构动态','项目更新','研究/报告']),['机构','项目','研究']);
  assert.deepEqual(cardTagValues('机构'),['机构','机构动态']);
});
