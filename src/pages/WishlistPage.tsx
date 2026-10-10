import { ArrowRight, Heart } from "lucide-react";
import React from "react";
import { go, useStore } from "../lib/Store";
import { Product } from "../lib/model";
import { WishButton } from "../components/WishButton";
export function WishlistPage({ add }: { add: (p: Product) => void }) {
  const { catalog, wishlist, toggle } = useStore();
  const items = catalog.filter((p) => wishlist.includes(p.slug));
  return (
    <main className="page wishlist-page">
      <section className="page-hero compact">
        <span>COLLECT WHAT YOU LOVE</span>
        <h1>My Wishlist</h1>
        <p>A little collection of pieces that speak to you.</p>
      </section>
      {items.length ? (
        <div className="wishlist-grid">
          {items.map((p) => (
            <article key={p.slug}>
              <div className="wishlist-photo">
                <a
                  href={"/product/" + p.slug}
                  onClick={(e) => {
                    e.preventDefault();
                    go("/product/" + p.slug);
                  }}
                >
                  <img src={p.image} alt={p.name} />
                </a>
                <WishButton product={p} />
              </div>
              <div className="wishlist-copy">
                <small>
                  {p.kind === "gemstone"
                    ? "GEMSTONE COLLECTION"
                    : "CRYSMONA JEWELLERY"}
                </small>
                <h2>
                  <a
                    href={"/product/" + p.slug}
                    onClick={(e) => {
                      e.preventDefault();
                      go("/product/" + p.slug);
                    }}
                  >
                    {p.name}
                  </a>
                </h2>
                <strong>{p.price}</strong>
                <button
                  disabled={(p.stockQty ?? 0) <= 0}
                  onClick={() => add(p)}
                >
                  {(p.stockQty ?? 0) <= 0 ? "SOLD OUT" : "ADD TO BAG"}{" "}
                  <ArrowRight />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="wishlist-empty">
          <Heart />
          <h2>Your favourites belong here.</h2>
          <p>
            Tap the heart on any gemstone or jewellery piece to save it for
            later.
          </p>
          <button onClick={() => go("/gemstones")}>
            DISCOVER GEMSTONES <ArrowRight />
          </button>
        </section>
      )}
      {wishlist.some((slug) => !catalog.some((p) => p.slug === slug)) && (
        <div className="wishlist-unavailable">
          <p>Some saved pieces are no longer available.</p>
          <button
            onClick={() =>
              wishlist
                .filter((slug) => !catalog.some((p) => p.slug === slug))
                .forEach(toggle)
            }
          >
            Remove unavailable pieces
          </button>
        </div>
      )}
    </main>
  );
}
