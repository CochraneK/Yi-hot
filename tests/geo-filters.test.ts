import { test, after } from "node:test";
import assert from "node:assert/strict";
import { parseGeoFilters } from "@aihot/backend/publication/geo";
import { closeDb } from "@aihot/backend/db";
after(closeDb);
test("geo scope accepts global, region and finite bounded nearby queries", () => {
  assert.equal(parseGeoFilters({}).place, undefined);
  assert.deepEqual(parseGeoFilters({ country: "cn", region: "四川" }), { place: undefined, country: "CN", region: "四川" });
  assert.equal(parseGeoFilters({ lat: "30.5", lon: "104.1", radius: "100" }).radius, 100);
  for (const q of [{ place: "bad@id" }, { country: "China" }, { region: "四川" },
    { lat: "", lon: "0", radius: "1" }, { lat: "0", radius: "100" },
    { lat: "Infinity", lon: "0", radius: "100" }, { lat: "91", lon: "0", radius: "100" },
    { lat: "0", lon: "181", radius: "100" }, { lat: "0", lon: "0", radius: "1001" },
    { lat: "0", lon: "0", radius: "0" }]) assert.throws(() => parseGeoFilters(q));
});
