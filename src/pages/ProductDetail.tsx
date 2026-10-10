import { useState } from "react";

import {
  ArrowRight,
  Minus,
  Plus,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Star,
  Truck,
} from "lucide-react";

import { go as navTo, useStore } from "../lib/Store";
import ProductGallery from "../components/ProductGallery";
import { Product } from "../lib/model";

import SubscribeForm from "../components/SubscribeForm";
import ProductCard from "../components/ProductCard";
export default function ProductDetail({
  product,
  add,
}: {
  product: Product;
  add: (p: Product, qty?: number) => void;
}) {
  const { catalog: products, store } = useStore();
  const [q, setQ] = useState(1);
  return (
    <main className="page product-page">
      <div className="crumbs">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navTo("/");
          }}
        >
          HOME
        </a>{" "}
        /{" "}
        <a
          href="/jewellery"
          onClick={(e) => {
            e.preventDefault();
            navTo("/jewellery");
          }}
        >
          JEWELLERY
        </a>{" "}
        / {product.name.toUpperCase()}
      </div>
      <section className="pdp-hero">
        <ProductGallery product={product} />
        <article className="pdp-info">
          <span>CRYSMONA SIGNATURE</span>
          <h1>{product.name}</h1>
          <strong>{product.price}</strong>
          <p>{product.description}</p>
          <div className="pdp-meta">
            <b>Stone</b>
            <span>{product.stone}</span>
            <b>Metal</b>
            <span>{product.metal || "—"}</span>
          </div>
          <p
            className={
              (product.stockQty ?? 0) <= 0
                ? "stock-status sold-out"
                : "stock-status"
            }
          >
            {(product.stockQty ?? 0) <= 0
              ? "This piece has found its home. Discover another favourite below."
              : `${product.stockQty} available`}
          </p>
          <div className="qty">
            <span>Quantity</span>
            <div>
              <button
                aria-label="Decrease quantity"
                disabled={q <= 1}
                onClick={() => setQ(Math.max(1, q - 1))}
              >
                <Minus />
              </button>
              <b>{q}</b>
              <button
                aria-label="Increase quantity"
                disabled={q >= (product.stockQty ?? 0)}
                onClick={() => setQ(q + 1)}
              >
                <Plus />
              </button>
            </div>
          </div>
          <button
            className="pdp-add"
            disabled={(product.stockQty ?? 0) <= 0}
            onClick={() => add(product, q)}
          >
            {(product.stockQty ?? 0) <= 0 ? "SOLD OUT" : "ADD TO BAG"}{" "}
            <ShoppingBag />
          </button>
          <button
            className="pdp-buy"
            disabled={(product.stockQty ?? 0) <= 0}
            onClick={() => {
              add(product, q);
              navTo("/checkout");
            }}
          >
            BUY IT NOW
          </button>
          <div className="pdp-perks">
            <span>
              <Truck />
              Free shipping over $
              {(
                Number(store.settings.free_shipping_threshold_cents || 0) / 100
              ).toLocaleString("en-US")}
            </span>
            <span>
              <RotateCcw />
              7-day easy returns
            </span>
            <span>
              <ShieldCheck />
              Authenticity assured
            </span>
          </div>
        </article>
      </section>
      <section className="recommend">
        <span>CURATED FOR YOU</span>
        <h2>You may also like</h2>
        <div>
          {products
            .filter((p) => p.slug !== product.slug)
            .slice(0, 3)
            .map((p) => (
              <ProductCard key={p.slug} p={p} add={add} />
            ))}
        </div>
      </section>
      <section className="pdp-story">
        <img src="/assets/jewellery-1.jpg" />
        <article>
          <span>THE CRYSMONA PROMISE</span>
          <h2>Crafted around the stone.</h2>
          <p>
            Every piece begins with the natural character of its gemstone. Our
            settings are designed to complement its colour, pattern and
            individuality rather than hide them.
          </p>
          <button onClick={() => navTo("/our-craft")}>
            DISCOVER OUR CRAFT <ArrowRight />
          </button>
        </article>
      </section>
      <section className="reviews">
        <div>
          <span>REVIEWS</span>
          <h2>Stories from our customers</h2>
        </div>
        {store.reviews.filter((r: any) => r.product_id === product.id)
          .length ? (
          store.reviews
            .filter((r: any) => r.product_id === product.id)
            .map((r: any) => (
              <blockquote key={r.id}>
                <div
                  className="rating"
                  aria-label={r.rating + " out of 5 stars"}
                >
                  {Array.from({ length: r.rating }, (_, i) => (
                    <Star key={i} />
                  ))}
                </div>
                {r.body}
                <footer>— {r.author}</footer>
              </blockquote>
            ))
        ) : (
          <p>Be the first to share the story of your piece.</p>
        )}
      </section>
      <section className="newsletter">
        <div>
          <h2>Get The Latest From Crysmona</h2>
          <p>Sign up for gemstone stories, new arrivals and private offers.</p>
        </div>
        <SubscribeForm />
      </section>
    </main>
  );
}
