import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardTags, cardTagValues } from '@aihot/industry/card-tags';

test('cards reuse registered entity labels and retain unregistered model tags',()=>{
  assert.deepEqual(cardTags(['entity:tencent-charity','新项目标签','新项目标签']),['腾讯公益','新项目标签']);
  assert.deepEqual(cardTagValues('腾讯公益'),['腾讯公益','entity:tencent-charity']);
  assert.deepEqual(cardTagValues('新项目标签'),['新项目标签']);
  assert.deepEqual(cardTags(['entity:unknown']),[]);
});
