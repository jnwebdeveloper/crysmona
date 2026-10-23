# Features — developer reference

How each feature works under the hood: the rules, where the code lives, and how
to change it safely. Add a section here whenever a feature has logic that
someone will need to understand or adjust later.

Related docs: [usecases.md](usecases.md) (admin behaviour step by step),
[r2-production-setup.md](r2-production-setup.md) (media storage).

## Contents

1. [Product recommendations: Similar items and You may also like](#1-product-recommendations-similar-items-and-you-may-also-like)

---

## 1. Product recommendations: Similar items and You may also like

**Where it shows:** store webapp, on the product page (`ProductDetail`, shared by
jewellery and gemstones), below the specifications. "Similar items" comes first,
then "You may also like".

### Code

| File | Role |
|---|---|
| `src/lib/recommendations.ts` | All the rules: `similarItems()`, `youMayAlsoLike()`, `RECOMMENDATION_COUNT` |
| `src/components/ProductRecommendations.tsx` | Renders both sections with `ProductCard`; hides a section with nothing to show |
| `src/pages/ProductDetail.tsx` | Renders `<ProductRecommendations product={product} />` for both kinds |
| `src/styles/styles.css` (`.recommend`) | Section layout: 4 cards per row on desktop, 2 at ≤ 900px, 1 at ≤ 560px |
| `server/services/catalog.ts` (`dto`) | Sends the product fields the rules use, including `featured` |

Everything runs in the browser, using the catalog the store already loads
(`useStore().catalog`, from `GET /api/products`). There is no extra API call or
database query. The results are recalculated when the product or catalog changes.

### Data used

| Product field | Source (admin product form) | Used for |
|---|---|---|
| `kind` | Collection (jewellery / gemstone) | Similar items stays within the same kind |
| `categoryId` | Category | Same-category match; other-category bonus |
| `stone` | Stone | Same-stone match |
| `specifications["Stone Name"]`, `["Gemstone Name"]` | Gemstone specifications | Extra words for the stone match |
| `specifications["Gemstone Type" / "Gemstone Shape" / "Gemstone Color"]` | Gemstone specifications | Gemstone trait matches |
| `metal` | Metal | Jewellery metal match |
| `priceCents` | Price | Similar-price match |
| `featured` | Featured | You may also like bonus |
| `stockQty` | Stock quantity | Sold-out products (≤ 0) are never recommended |

### Rules that apply to both sections

- **Count:** at most `RECOMMENDATION_COUNT` (4) products per section.
- **Never included:** the current product, and sold-out products (`stockQty <= 0`).
- **Ranking:** highest score first. On a tie, the admin's catalog order wins (the
  order of `/api/products`, set by drag-and-drop in the admin webapp).
- **No duplicates:** You may also like excludes everything shown in Similar items.
- **Empty section:** if no product qualifies, the section isn't rendered.

### Similar items: `similarItems(product, catalog)`

"More like this one." Candidates are **in-stock products of the same kind**
(jewellery with jewellery, gemstone with gemstone). Every candidate is listed, so
when few score well the rest still fill the section in catalog order.

| Signal | Points | Applies to |
|---|---|---|
| Same category (`categoryId`) | +3 | both |
| Same stone (see [stone matching](#stone-matching)) | +3 | both |
| Same Gemstone Type | +1 | gemstone pages |
| Same Gemstone Shape | +1 | gemstone pages |
| Same Gemstone Color | +1 | gemstone pages |
| Same metal (case-insensitive) | +1 | jewellery pages |
| Price within ±30% of the current product | +1 | both |

### You may also like: `youMayAlsoLike(product, catalog, exclude)`

"Goes well with this." Candidates are **all in-stock products of either kind**,
minus the current product and the Similar items.

| Signal | Points | Example |
|---|---|---|
| Other kind **and** same stone | +4 | Turquoise pendant → Turquoise gemstone, and vice versa |
| Featured | +2 | Products ticked "Featured" in the admin |
| Jewellery page: jewellery from a **different** category | +2 | Pendant page → rings, bracelets |
| Other kind (any stone) | +1 | Keeps the mix of jewellery and gemstones |
| Price within ±30% | +1 | |

### Stone matching

`sameStone(a, b)` is true when the two products share a stone word.

- Words come from `stone`, plus `specifications["Stone Name"]` and
  `specifications["Gemstone Name"]`, lower-cased and split on non-letters.
- Words of 2 letters or fewer are ignored, and so are generic words (`generic`
  set): natural, stone(s), gemstone(s), genuine, real, the, and, of.
- So "Natural Turquoise" matches "Turquoise", and "Purple Copper Turquoise"
  matches both of them. A product with no stone set matches nothing.

### Worked example (local seed catalog)

| Product page | Similar items | You may also like |
|---|---|---|
| Green Turquoise Pendant | Purple Copper Turquoise Pendant first (same category and stone), then other pendants | Turquoise gemstone first (+4 other kind with same stone), then other gemstones |
| Turquoise (gemstone) | Other gemstones | Turquoise pendants first, then other jewellery |

### How to change it

- **Number of products:** change `RECOMMENDATION_COUNT`. Also check `.recommend > div`
  in `styles.css` (4 columns), so the row stays even.
- **Weights:** edit the points in the `score` callbacks in `similarItems` /
  `youMayAlsoLike`. Keep the "other kind and same stone" bonus as the highest in
  You may also like, or the complementary pieces get pushed out.
- **A new signal**, e.g. a shared tag: add the field to `dto` in
  `server/services/catalog.ts` and to `Product` in `shared/product.ts`, then add a
  line to the relevant `score` callback.
- **Showing sold-out items again:** remove the `inStock` filter, and sort them last
  instead (e.g. subtract a large number from their score).
- **Titles and small headings:** in `ProductRecommendations.tsx`
  ("MORE LIKE THIS" / "Similar items", "CURATED FOR YOU" / "You may also like").
- **Hand-picked related products** (possible later): store them in a join table,
  send them with the product, and put them first in the list before the scored
  results.

### Testing a change

The functions are pure, so they can be checked in the browser console on the
running dev site:

```js
const r = await import("/src/lib/recommendations.ts");
const catalog = await fetch("/api/products").then((x) => x.json());
const p = catalog.find((x) => x.slug === "green-turquoise-pendant");
const similar = r.similarItems(p, catalog);
similar.map((x) => x.name);
r.youMayAlsoLike(p, catalog, similar).map((x) => x.name);
```

Check at least one jewellery page, one gemstone page, a product whose stone
exists in the other kind, and a catalog with a sold-out product.
