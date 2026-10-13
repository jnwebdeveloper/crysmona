import assert from "node:assert/strict";
import { test } from "node:test";
import { listRecords, moveRecord, validOrder } from "../shared/adminLists.js";
import { pageContent, isDiscoverBlock } from "../shared/pageContent.js";
import { dto } from "../server/services/catalog.js";

test("drag order works in either direction without mutating input", () => {
  const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.deepEqual(
    moveRecord(rows, 1, 3).map((r) => r.id),
    [2, 3, 1],
  );
  assert.deepEqual(
    moveRecord(rows, 3, 1).map((r) => r.id),
    [3, 1, 2],
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    [1, 2, 3],
  );
  assert.deepEqual(moveRecord(rows, 99, 1), rows);
});
test("ordering rejects duplicate, invalid and empty IDs", () => {
  assert.equal(validOrder([1, 2]), true);
  for (const ids of [[], [1, 1], [0], [1.5], ["1"], null])
    assert.equal(validOrder(ids), false);
});
test("filters combine with search and numeric sorting in both directions", () => {
  const rows = [
    { id: 1, name: "Silver ring", active: true, price: 100 },
    { id: 2, name: "Gold ring", active: false, price: 2 },
    { id: 3, name: "Silver pendant", active: true, price: 20 },
  ];
  assert.deepEqual(
    listRecords(rows, "silver", "active", "true", "price", "asc").map(
      (r) => r.id,
    ),
    [3, 1],
  );
  assert.deepEqual(
    listRecords(rows, "silver", "active", "true", "price", "desc").map(
      (r) => r.id,
    ),
    [1, 3],
  );
  assert.equal(
    listRecords(rows, "ring", "active", "false", "name", "asc").length,
    1,
  );
});
test("all Discover pages and their sections have unique editable defaults", () => {
  assert.equal(
    new Set(pageContent.map((b) => b.block_key)).size,
    pageContent.length,
  );
  for (const key of [
    "about",
    "contact",
    "craft",
    "about-feature",
    "craft-feature",
    "craft-step-1",
  ])
    assert.ok(isDiscoverBlock(key));
  assert.equal(isDiscoverBlock("hero"), false);
});
test("catalog retains all saved gallery images", () => {
  const images = Array.from({ length: 4 }, (_, i) => ({
    image_url: `/image-${i}.jpg`,
    alt_text: "Image",
  }));
  assert.deepEqual(dto({ price_cents: 100, images }).images, images);
});
