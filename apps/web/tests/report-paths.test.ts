import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KINDS, kindFromPath } from '../app/features/report/format.ts';

test('weekly and monthly editions resolve with and without the deployed prefix',()=>{
  for(const prefix of ['', '/yihot']) {
    assert.equal(kindFromPath(prefix+'/weekly'),'weekly');
    assert.equal(kindFromPath(prefix+'/weekly/2026-W41'),'weekly');
    assert.equal(kindFromPath(prefix+'/monthly/2026-09'),'monthly');
    assert.equal(kindFromPath(prefix+'/daily'),'daily');
  }
  assert.deepEqual(KINDS,['weekly','monthly']);
});
