import { Search, SlidersHorizontal } from "lucide-react";
import { useSearchParams } from "react-router";
import { useStore } from "../lib/Store";
import { useCart } from "../lib/cart";
import { money, type Product } from "../lib/model";
import ProductCard from "../components/ProductCard";

const priceOf = (product: Product) => product.priceCents != null ? product.priceCents / 100 : money(product.price);
const filterKeys = ["category", "stone", "metal", "min", "max", "stock", "q"];

export default function Listing({ kind }: { kind: "Gemstones" | "Jewellery" }) {
  const { catalog, store, loading, catalogError } = useStore();
  const { add } = useCart();
  const [params, setParams] = useSearchParams();
  const value = (key: string) => params.get(key) || "";
  const update = (key: string, next: string) => {
    setParams((current) => {
      const updated = new URLSearchParams(current);
      if (next) updated.set(key, next);
      else updated.delete(key);
      return updated;
    }, { replace: true });
  };
  const reset = () => setParams((current) => {
    const updated = new URLSearchParams(current);
    filterKeys.forEach((key) => updated.delete(key));
    return updated;
  }, { replace: true });
  const collection = catalog.filter((p) => kind === "Gemstones" ? p.kind === "gemstone" : p.kind !== "gemstone");
  const categories = store.categories.filter((c: any) => collection.some((p) => p.categoryId === c.id));
  const category = store.categories.find((c: any) => c.slug === value("category"));
  const options = (key: "stone" | "metal") => [...new Set(collection.map((p) => p[key]?.trim()).filter((item): item is string => Boolean(item)))].sort((a, b) => a.localeCompare(b));
  const stones = options("stone"), metals = options("metal");
  const active = filterKeys.some((key) => value(key));
  const min = value("min") === "" ? null : Number(value("min"));
  const max = value("max") === "" ? null : Number(value("max"));
  const invalidRange = min !== null && max !== null && min > max;
  const products = collection.filter((p) =>
    (!value("category") || p.categoryId === category?.id) &&
    (!value("stone") || p.stone?.trim() === value("stone")) &&
    (!value("metal") || p.metal?.trim() === value("metal")) &&
    (!value("stock") || (p.stockQty ?? 0) > 0) &&
    (min === null || priceOf(p) >= min) &&
    (max === null || priceOf(p) <= max) &&
    (!value("q").trim() || [p.name, p.stone, p.metal, p.note].join(" ").toLowerCase().includes(value("q").trim().toLowerCase()))
  ).sort((a, b) => {
    switch (value("sort")) {
      case "price-asc": return priceOf(a) - priceOf(b);
      case "price-desc": return priceOf(b) - priceOf(a);
      case "name": return a.name.localeCompare(b.name);
      default: return Number(Boolean(b.featured)) - Number(Boolean(a.featured));
    }
  });

  return (
    <main className="page listing">
      <section className="page-hero">
        <span>CRYSMONA COLLECTIONS</span>
        <h1>{category?.name || kind}</h1>
        <p>{kind === "Gemstones" ? "Natural stones selected for colour, pattern and individuality." : "Jewellery designed around the natural beauty of gemstones."}</p>
      </section>
      <section className="collection-filters" aria-label="Filter products">
        <div className="collection-filter-heading">
          <h2><SlidersHorizontal aria-hidden="true" /> Find your piece</h2>
          {active && <button type="button" onClick={reset}>Clear filters</button>}
        </div>
        <div className="collection-filter-fields">
          <label className="collection-search">Search collection
            <span><Search aria-hidden="true" /><input type="search" placeholder="Search pieces…" value={value("q")} onChange={(e) => update("q", e.target.value)} /></span>
          </label>
          <label>Category<select value={value("category")} onChange={(e) => update("category", e.target.value)}><option value="">All categories</option>{categories.map((c: any) => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></label>
          {stones.length > 0 && <label>Gemstone<select value={value("stone")} onChange={(e) => update("stone", e.target.value)}><option value="">All gemstones</option>{stones.map((stone) => <option key={stone}>{stone}</option>)}</select></label>}
          {metals.length > 0 && <label>Metal<select value={value("metal")} onChange={(e) => update("metal", e.target.value)}><option value="">All metals</option>{metals.map((metal) => <option key={metal}>{metal}</option>)}</select></label>}
          <fieldset className="collection-price"><legend>Price (USD)</legend><div><input aria-label="Minimum price in USD" type="number" min="0" step="0.01" placeholder="Min" value={value("min")} onChange={(e) => update("min", e.target.value)} /><span>–</span><input aria-label="Maximum price in USD" type="number" min="0" step="0.01" placeholder="Max" value={value("max")} onChange={(e) => update("max", e.target.value)} /></div></fieldset>
        </div>
        {invalidRange && <p className="collection-range-error" role="status">Minimum price must be less than or equal to maximum price.</p>}
        <div className="collection-results-bar">
          <div><p role="status" aria-live="polite">{loading ? "Loading pieces…" : `${products.length} ${products.length === 1 ? "piece" : "pieces"}`}</p><label className="collection-stock"><input type="checkbox" checked={value("stock") === "1"} onChange={(e) => update("stock", e.target.checked ? "1" : "")} /> In stock only</label></div>
          <label className="collection-sort">Sort by<select value={value("sort")} onChange={(e) => update("sort", e.target.value)}><option value="">Featured</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="name">Name: A–Z</option></select></label>
        </div>
      </section>
      {!loading && !products.length && <div className="collection-empty"><h2>{catalogError ? "The collection is temporarily unavailable." : active ? "No pieces match your selection." : "New pieces are on their way."}</h2><p>{catalogError || (active ? "Try adjusting your filters to discover more of the collection." : "Please check back soon.")}</p>{active && <button type="button" onClick={reset}>Clear filters</button>}</div>}
      <div className="listing-grid">{products.map((p) => <ProductCard key={p.slug} p={p} add={add} />)}</div>
    </main>
  );
}
