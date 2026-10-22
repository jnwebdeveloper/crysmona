import { useMemo } from "react";
import { useStore } from "../lib/Store";
import { useCart } from "../lib/cart";
import type { Product } from "../lib/model";
import { similarItems, youMayAlsoLike } from "../lib/recommendations";
import ProductCard from "./ProductCard";

// "Similar items" and "You may also like" for a product page. A section with
// nothing to show is left out.
export default function ProductRecommendations({ product }: { product: Product }) {
  const { catalog } = useStore();
  const { add } = useCart();
  const [similar, alsoLike] = useMemo(() => {
    const similar = similarItems(product, catalog);
    return [similar, youMayAlsoLike(product, catalog, similar)];
  }, [product, catalog]);
  const section = (eyebrow: string, title: string, items: Product[]) =>
    items.length > 0 && (
      <section className="recommend" aria-label={title}>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <div>
          {items.map((p) => (
            <ProductCard key={p.slug} p={p} add={add} />
          ))}
        </div>
      </section>
    );
  return (
    <>
      {section("MORE LIKE THIS", "Similar items", similar)}
      {section("CURATED FOR YOU", "You may also like", alsoLike)}
    </>
  );
}
