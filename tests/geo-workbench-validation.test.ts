import assert from "node:assert/strict";
import { test } from "node:test";
import { parseGeoReviewQuery, parseGeoReviewCommand, parseGeoPlaceCommand } from "@aihot/backend/admin/geo-workbench";

test("review commands do not accept client-selected reviewer, role or status", () => {
  const valid={action:"approve",placeId:"chengdu",reason:"已核对原文和事件角色"};
  assert.equal(parseGeoReviewCommand(valid).action,"approve");
  for(const extra of [{reviewer:"forged-admin"},{role:"event"},{review_status:"verified"}]) {
    assert.throws(()=>parseGeoReviewCommand({...valid,...extra}));
  }
  assert.throws(()=>parseGeoReviewCommand({action:"approve",reason:"missing place"}));
  assert.throws(()=>parseGeoReviewCommand({action:"reject",placeId:"chengdu",reason:"not event"}));
  assert.throws(()=>parseGeoReviewCommand({action:"reopen",reason:"短"}));
});
test("queue pagination, state and query sizes are bounded", () => {
  assert.equal(parseGeoReviewQuery({}).page,1);
  assert.equal(parseGeoReviewQuery({page:"2",status:"rejected",stale:"1"}).page,2);
  for(const bad of [{page:"0"},{page:"2.5"},{page:"1001"},{status:"approved"},{role:"hometown"},{q:"x".repeat(121)}]) {
    assert.throws(()=>parseGeoReviewQuery(bad));
  }
});
test("a web-created place needs finite numeric coordinates, precision, provenance and a reason", () => {
  const valid={id:"chengdu",name:"成都",countryCode:"CN",region:"四川",city:"成都",lat:30.65,lon:104.07,precision:"city",sourceUrl:"https://example.org/catalog/chengdu",reason:"已核查来源与城市代表坐标"};
  assert.equal(parseGeoPlaceCommand(valid).id,"chengdu");
  for(const patch of [{lat:"30.65"},{lat:null},{lat:91},{lon:Infinity},{sourceUrl:"http://example.org/geo"},{sourceUrl:"https://user:secret@example.org/geo"},{precision:"address"},{countryCode:"China"},{reason:""}]) {
    assert.throws(()=>parseGeoPlaceCommand({...valid,...patch}));
  }
});
