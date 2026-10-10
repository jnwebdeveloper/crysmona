import { useSearchParams } from "react-router";
import { useStore } from "../lib/Store";
import { useCart } from "../lib/cart";

import ProductCard from "../components/ProductCard";
export default function Listing({ kind }: { kind: "Gemstones" | "Jewellery" }) {
  const { catalog, store } = useStore();
  const { add } = useCart();
  const [params] = useSearchParams();
  const selected = params.get("category");
  const category = store.categories.find((c: any) => c.slug === selected);
  const products = catalog.filter(
    (p) =>
      (kind === "Gemstones" ? p.kind === "gemstone" : p.kind !== "gemstone") &&
      (!selected || p.categoryId === category?.id),
  );
  return (
    <main className="page listing">
      <section className="page-hero">
        <span>CRYSMONA COLLECTIONS</span>
        <h1>{category?.name || kind}</h1>
        <p>
          {kind === "Gemstones"
            ? "Natural stones selected for colour, pattern and individuality."
            : "Jewellery designed around the natural beauty of gemstones."}
        </p>
      </section>
      {!products.length && (
        <p className="wishlist-empty">
          New pieces are on their way. Please check back soon.
        </p>
      )}
      <div className="listing-grid">
        {products.map((p) => (
          <ProductCard key={p.slug} p={p} add={add} />
        ))}
      </div>
    </main>
  );
}
