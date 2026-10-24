import assert from "node:assert/strict";
import { test } from "node:test";
import { csvCell, productsCsv } from "../shared/productExport.js";

test("export retains unpublished products, all fields, specifications, and ordered media references", () => {
  const csv = productsCsv(
    [
      {
        id: 1,
        slug: "rare-stone",
        name: 'A "rare", stone',
        active: false,
        stock_qty: 0,
        image_url: "/assets/main.jpg",
        specifications: { Origin: "India" },
        description: "First line\nSecond line",
        custom_field: "retained",
        gallery: [
          {
            media_url: "/assets/detail.jpg",
            alt_text: "Detail",
            media_type: "image",
          },
          {
            media_url: "https://cdn.example.com/video.mp4",
            media_type: "video",
          },
        ],
      },
    ],
    "https://crysmona.example",
  );
  assert.ok(csv.includes('"product_url"'));
  assert.ok(csv.includes("https://crysmona.example/product/rare-stone"));
  assert.ok(csv.includes('"active"'));
  assert.ok(csv.includes('"false"'));
  assert.ok(csv.includes('"custom_field"'));
  assert.ok(csv.includes('"retained"'));
  assert.ok(csv.includes('"A ""rare"", stone"'));
  assert.ok(csv.includes("https://crysmona.example/assets/main.jpg"));
  assert.ok(csv.includes("https://crysmona.example/assets/detail.jpg"));
  assert.ok(csv.includes("https://cdn.example.com/video.mp4"));
  assert.ok(csv.includes('""Origin"":""India""'));
  assert.ok(csv.includes('"First line\nSecond line"'));
});

test("CSV safely escapes formulas and produces headers for an empty catalog", () => {
  for (const value of ["=SUM(A1)", "+123", "@formula", "-12", " \t=1"]) {
    assert.ok(csvCell(value).startsWith("\"'"));
  }
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(0), '"0"');
  assert.ok(productsCsv([], "https://crysmona.example").includes('"gallery"'));
});
