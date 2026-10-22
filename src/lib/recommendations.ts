import type { Product } from "./model";

// Product page recommendations, worked out from the catalog already loaded in
// the browser. Sold-out products are never recommended.
//
// Similar items: the same kind (jewellery or gemstone), ranked by category,
//   stone, gemstone traits or metal, and price.
// You may also like: complementary pieces — the other kind made with the same
//   stone (an amethyst pendant ↔ amethyst gemstones), jewellery from other
//   categories, and featured products — excluding anything in Similar items.
// Ties keep the admin's catalog order.

export const RECOMMENDATION_COUNT = 4;

const inStock = (p: Product) => (p.stockQty ?? 0) > 0;
const kindOf = (p: Product) => (p.kind === "gemstone" ? "gemstone" : "jewellery");

// Words naming the stone, ignoring generic ones ("Natural Amethyst" → amethyst).
const generic = new Set(["natural", "stone", "stones", "gemstone", "gemstones", "genuine", "real", "the", "and", "of"]);
function stoneWords(p: Product) {
  const text = [p.stone, p.specifications?.["Stone Name"], p.specifications?.["Gemstone Name"]]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return new Set(text.split(/[^a-z]+/).filter((w) => w.length > 2 && !generic.has(w)));
}
const sameStone = (a: Product, b: Product) => {
  const words = stoneWords(b);
  return [...stoneWords(a)].some((w) => words.has(w));
};
const same = (a?: string, b?: string) =>
  !!a?.trim() && a.trim().toLowerCase() === b?.trim().toLowerCase();
const similarPrice = (a: Product, b: Product) =>
  !!a.priceCents &&
  !!b.priceCents &&
  Math.abs(a.priceCents - b.priceCents) <= a.priceCents * 0.3;

function rank(candidates: Product[], score: (p: Product) => number) {
  return candidates
    .map((p, index) => ({ p, index, score: score(p) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ p }) => p);
}

export function similarItems(product: Product, catalog: Product[]) {
  const candidates = catalog.filter(
    (p) => p.slug !== product.slug && inStock(p) && kindOf(p) === kindOf(product),
  );
  const traits = ["Gemstone Type", "Gemstone Shape", "Gemstone Color"];
  return rank(candidates, (p) => {
    let score = 0;
    if (product.categoryId && p.categoryId === product.categoryId) score += 3;
    if (sameStone(product, p)) score += 3;
    if (kindOf(product) === "gemstone")
      for (const trait of traits)
        if (same(product.specifications?.[trait], p.specifications?.[trait])) score += 1;
    if (kindOf(product) === "jewellery" && same(product.metal, p.metal)) score += 1;
    if (similarPrice(product, p)) score += 1;
    return score;
  }).slice(0, RECOMMENDATION_COUNT);
}

export function youMayAlsoLike(
  product: Product,
  catalog: Product[],
  exclude: Product[] = [],
) {
  const skip = new Set([product.slug, ...exclude.map((p) => p.slug)]);
  const candidates = catalog.filter((p) => !skip.has(p.slug) && inStock(p));
  return rank(candidates, (p) => {
    let score = 0;
    const otherKind = kindOf(p) !== kindOf(product);
    if (otherKind && sameStone(product, p)) score += 4;
    if (p.featured) score += 2;
    if (
      kindOf(product) === "jewellery" &&
      kindOf(p) === "jewellery" &&
      product.categoryId &&
      p.categoryId !== product.categoryId
    )
      score += 2;
    if (otherKind) score += 1;
    if (similarPrice(product, p)) score += 1;
    return score;
  }).slice(0, RECOMMENDATION_COUNT);
}
