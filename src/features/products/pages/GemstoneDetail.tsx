import { ArrowRight, Gem, Heart, Minus, Plus, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { go, useStore } from "../../../app/Store";
import ProductGallery from "../components/ProductGallery";
import { Product } from "../model";
export default function GemstoneDetail({
  product,
  add,
}: {
  product: Product;
  add: (p: Product, qty?: number) => void;
}) {
  const [qty, setQty] = useState(1);
  const { catalog } = useStore();
  return (
    <main className="page gem-detail">
      <div className="crumbs">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            go("/");
          }}
        >
          HOME
        </a>{" "}
        /{" "}
        <a
          href="/gemstones"
          onClick={(e) => {
            e.preventDefault();
            go("/gemstones");
          }}
        >
          GEMSTONES
        </a>{" "}
        / {product.name.toUpperCase()}
      </div>
      <section className="gem-detail-hero">
        <ProductGallery product={product} gemstone />
        <article className="gem-detail-info">
          <span className="eyebrow">THE GEMSTONE COLLECTION</span>
          <h1>{product.name}</h1>
          <p className="gem-subtitle">
            {product.specifications?.["Gemstone Shape"] || "Distinctive stones"}{" "}
            · {product.specifications?.["Gemstone Type"] || "Cabochon"}
          </p>
          <strong className="gem-detail-price">{product.price}</strong>
          <p>{product.description}</p>
          {product.specifications?.["Number Of Pieces"] && (
            <div className="gem-lot">
              <Gem />
              <span>
                <b>
                  A collection of {product.specifications["Number Of Pieces"]}{" "}
                  pieces
                </b>
                <small>
                  {product.specifications["Gemstone Weight"]} · Price shown for
                  this collection
                </small>
              </span>
            </div>
          )}
          <p
            className={
              (product.stockQty ?? 0) <= 0
                ? "stock-status sold-out"
                : "stock-status"
            }
          >
            {(product.stockQty ?? 0) <= 0
              ? "This collection has found its home. Save it to your wishlist and check back soon."
              : `${product.stockQty} available`}
          </p>
          <div className="gem-buy-row">
            <div className="gem-quantity">
              <button
                aria-label="Decrease quantity"
                disabled={qty === 1}
                onClick={() => setQty(Math.max(1, qty - 1))}
              >
                <Minus />
              </button>
              <span>{qty}</span>
              <button
                aria-label="Increase quantity"
                disabled={qty >= (product.stockQty ?? 0)}
                onClick={() => setQty(qty + 1)}
              >
                <Plus />
              </button>
            </div>
            <button
              className="gem-add"
              disabled={(product.stockQty ?? 0) <= 0}
              onClick={() => add(product, qty)}
            >
              {(product.stockQty ?? 0) <= 0 ? "SOLD OUT" : "ADD TO BAG"}
              <ArrowRight />
            </button>
          </div>
          <div className="gem-promises">
            <span>
              <ShieldCheck /> Thoughtfully selected
            </span>
            <span>
              <Heart /> Each stone is individual
            </span>
          </div>
        </article>
      </section>
      <section className="gem-specs">
        <div>
          <span className="eyebrow">A CLOSER LOOK</span>
          <h2>Details of your stone</h2>
          <p>Every characteristic, in one place.</p>
        </div>
        <dl>
          {Object.entries(product.specifications || {}).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="gem-related">
        <span className="eyebrow">KEEP EXPLORING</span>
        <h2>More colours to fall for</h2>
        <div>
          {catalog
            .filter((p) => p.kind === "gemstone" && p.slug !== product.slug)
            .slice(0, 4)
            .map((p) => (
              <a
                key={p.slug}
                href={"/product/" + p.slug}
                onClick={(e) => {
                  e.preventDefault();
                  go("/product/" + p.slug);
                }}
              >
                <img src={p.image} alt={p.name} />
                <h3>{p.name}</h3>
                <span>{p.price}</span>
              </a>
            ))}
        </div>
      </section>
    </main>
  );
}
