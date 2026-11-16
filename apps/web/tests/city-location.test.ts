import { test } from "node:test";
import assert from "node:assert/strict";
import type { GeoEventPlace } from "@aihot/contracts/site";
import { isLocalEvent, locationFromIpResult, readerLocation, staticReaderLocation } from "../app/features/cities/reader-city.ts";
import { cityCountryLabel } from "../app/features/cities/geo.ts";
const place: GeoEventPlace = { id: "canonical-beijing", name: "北京市", countryCode: "CN", region: "北京", city: "北京市", lat: 39.9, lon: 116.4, precision: "city" };
test("local badge uses reviewed city events, including canonical IDs outside the old dictionary", () => {
  const reader = staticReaderLocation("beijing");
  assert.equal(isLocalEvent([place], reader), true);
  assert.equal(isLocalEvent(undefined, reader), false);
  assert.equal(isLocalEvent([{ ...place, countryCode: "US" }], reader), false);
  assert.equal(isLocalEvent([{ ...place, precision: "region" }], reader), false);
  assert.equal(isLocalEvent([{ ...place, region: "其他地区" }], reader), false);
  assert.equal(isLocalEvent([place], null), false);
});
test("stored city validation strips extra fields and rejects invalid coordinates or names", () => {
  assert.ok(readerLocation(place));
  assert.equal(readerLocation({ ...place, lat: NaN }), null);
  assert.equal(readerLocation({ ...place, lon: 999 }), null);
  assert.equal(readerLocation({ ...place, countryCode: "cn" }), null);
  assert.equal(readerLocation({ ...place, city: {} }), null);
  assert.equal(readerLocation({ ...place, name: "" }), null);
  assert.ok(!("ip" in readerLocation({ ...place, ip: "not-retained" })!));
});
test("IP matching uses country and region and refuses ambiguous catalog names", () => {
  const a = { ...place, id: "springfield-a", countryCode: "US", name: "Springfield", city: "Springfield", region: "Illinois" };
  const b = { ...a, id: "springfield-b", region: "Massachusetts" };
  assert.equal(locationFromIpResult("Springfield", "Illinois", "US", [a,b])?.id, a.id);
  assert.equal(locationFromIpResult("Springfield", "Unknown", "US", [a,b]), null);
  assert.equal(locationFromIpResult("Springfield", "Illinois", "GB", [a,b]), null);
  assert.equal(locationFromIpResult("Beijing", "Beijing", "CN", [])?.id, "beijing");
});

test("country labels are stable across Node and browser ICU versions", () => {
  assert.equal(cityCountryLabel("MO"), "澳门");
  assert.equal(cityCountryLabel("HK"), "香港");
  assert.equal(cityCountryLabel("TW"), "台湾");
  assert.equal(cityCountryLabel("CN"), "中国");
  assert.equal(cityCountryLabel("FR"), "法国");
  assert.equal(cityCountryLabel("ZZ"), "ZZ");
});
