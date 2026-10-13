import assert from "node:assert/strict";
import { test } from "node:test";
import { analyticsAllowed, normalizeConsent, routeEvents } from "../src/lib/analyticsConsent";
test("required consent blocks tracking until acceptance", () => {
 assert.equal(analyticsAllowed("true", ""),false);
 assert.equal(analyticsAllowed(true,"denied"),false);
 assert.equal(analyticsAllowed(true,"granted"),true);
});
test("declining is respected even when consent is optional", () => {
 assert.equal(analyticsAllowed("false","denied"),false);
 assert.equal(analyticsAllowed("false",""),true);
});
test("stored choices are validated", () => {
 assert.equal(normalizeConsent("granted"),"granted");
 assert.equal(normalizeConsent("denied"),"denied");
 assert.equal(normalizeConsent("invalid"),"");
 assert.equal(normalizeConsent(null),"");
});
test("direct product and checkout entry emit their events, admin emits none", () => {
 assert.deepEqual(routeEvents("/product/earrings"),["PageView","ViewContent"]);
 assert.deepEqual(routeEvents("/checkout"),["PageView","InitiateCheckout"]);
 assert.deepEqual(routeEvents("/"),["PageView"]);
 assert.deepEqual(routeEvents("/admin/products"),[]);
});
