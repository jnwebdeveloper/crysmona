import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreProvider } from "../src/lib/Store";
import ProductGallery from "../src/components/ProductGallery";

test("all four thumbnails render immediately with the default image deduplicated", () => {
  const images = Array.from({ length: 4 }, (_, i) => ({
    image_url: `/image-${i}.jpg`,
    alt_text: `Photo ${i}`,
  }));
  const product = {
    slug: "earrings",
    name: "Earrings",
    image: images[0].image_url,
    images,
    note: "",
    price: "$2",
    stone: "",
    description: "",
  };
  const html = renderToStaticMarkup(
    <StoreProvider>
      <ProductGallery product={product} />
    </StoreProvider>,
  );
  assert.equal(
    (html.match(/aria-label="View product image /g) || []).length,
    4,
  );
  assert.ok(html.includes('aria-label="Next product image"'));
  assert.ok(html.includes("Image 1 of 4"));
});
