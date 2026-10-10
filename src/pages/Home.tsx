import HeroCarousel from "../components/HeroCarousel";

import {
  ArrowRight,
  Diamond,
  Gem,
  Gift,
  Hammer,
  HandHeart,
  Heart,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { go as navTo, useStore } from "../lib/Store";
import { Product } from "../lib/model";

import ProductCard from "../components/ProductCard";
export default function Home({ add }: { add: (p: Product) => void }) {
  const { catalog, store } = useStore();
  const products = catalog.filter((p) => p.kind !== "gemstone"),
    gems = catalog.filter((p) => p.kind === "gemstone");
  const block = (key: string) =>
    store.content.find((b: any) => b.block_key === key) || {};
  const hero = block("hero"),
    story = block("story"),
    signature = block("signature");
  return (
    <main id="home">
      <HeroCarousel
        slides={store.content.filter(
          (b: any) =>
            b.active &&
            (b.block_key === "hero" || b.block_key.startsWith("hero-")),
        )}
      />
      <section className="trust">
        <div>
          <Diamond />
          <p>
            <b>100% Natural Gemstones</b>
            <small>Authenticity you can trust</small>
          </p>
        </div>
        <div>
          <HandHeart />
          <p>
            <b>Thoughtfully Crafted</b>
            <small>Precision in every detail</small>
          </p>
        </div>
        <div>
          <ShieldCheck />
          <p>
            <b>Lifetime Support</b>
            <small>Care beyond purchase</small>
          </p>
        </div>
        <div>
          <Gift />
          <p>
            <b>Elegant Packaging</b>
            <small>Made for memorable moments</small>
          </p>
        </div>
      </section>
      <section className="gem-categories">
        <span>EXPLORE BY GEMSTONE</span>
        <h2>Gemstone Categories</h2>
        <p>Discover the natural beauty of handpicked gemstones.</p>
        <div className="gem-grid">
          {gems.map((gem) => (
            <a
              className="gem-card"
              href={"/product/" + gem.slug}
              key={gem.slug}
              onClick={(e) => {
                e.preventDefault();
                navTo("/product/" + gem.slug);
              }}
            >
              <div className="gem-image">
                {(gem.stockQty ?? 0) <= 0 && (
                  <span className="sold-out-badge">Sold out</span>
                )}
                <img
                  src={gem.image}
                  alt={gem.name + " gemstone cabochons"}
                  loading="lazy"
                />
              </div>
              <div className="gem-info">
                <small>GEMSTONE COLLECTION</small>
                <h3>{gem.name}</h3>
                <div>
                  <span>{gem.price}</span>
                  <ArrowRight aria-hidden="true" />
                </div>
              </div>
            </a>
          ))}
        </div>
        <a
          href="/gemstones"
          onClick={(e) => {
            e.preventDefault();
            navTo("/gemstones");
          }}
        >
          VIEW ALL GEMSTONES <ArrowRight />
        </a>
      </section>
      <section className="beauty">
        <div className="beauty-intro">
          <span>CURATED FOR YOU</span>
          <h2>
            Beauty Begins
            <br />
            with the Gem
          </h2>
          <p>
            Each piece is designed around the unique character of a natural
            stone — because every gem has a story, and so do you.
          </p>
          <button onClick={() => navTo("/jewellery")}>
            SHOP THE COLLECTION <ArrowRight />
          </button>
        </div>
        <div className="product-row">
          {products.slice(0, 3).map((p) => (
            <ProductCard key={p.slug} p={p} add={add} />
          ))}
        </div>
        <a className="view-all" onClick={() => navTo("/jewellery")}>
          VIEW ALL JEWELLERY <ArrowRight />
        </a>
      </section>
      <section className="jewellery">
        <span>EXPLORE OUR COLLECTIONS</span>
        <h2>Jewellery Categories</h2>
        <p>
          Timeless designs for every occasion. Find the perfect piece to express
          your style.
        </p>
        <div className="jewellery-row">
          {(store.categories.length
            ? store.categories
                .filter((c: any) => c.type === "jewellery")
                .map((c: any) => [c.name, c.image_url, c.slug])
            : []
          ).map(([n, img, slug]: string[]) => (
            <article key={n}>
              <div>
                <img src={img} alt={n} />
              </div>
              <h3>{n}</h3>
              <a
                href={"/jewellery?category=" + slug}
                onClick={(e) => {
                  e.preventDefault();
                  navTo("/jewellery?category=" + slug);
                }}
              >
                EXPLORE <ArrowRight />
              </a>
            </article>
          ))}
        </div>
      </section>
      {products.some((p) => p.slug === "purple-copper-turquoise-pendant") &&
        signature.id &&
        signature.active !== false && (
          <section className="signature">
            <div className="signature-media">
              <img
                src={signature.image_url || "/assets/signature-turquoise.jpeg"}
                alt="Turquoise pendant on natural linen"
              />
            </div>
            <article>
              <span>{signature.subtitle || "SIGNATURE PIECE"}</span>
              <h2 style={{ whiteSpace: "pre-line" }}>
                {signature.title || "Purple Copper\nTurquoise Pendant"}
              </h2>
              <p>
                {signature.body ||
                  "A rare blend of vibrant colour and natural artistry."}
              </p>
              <div className="sig-points">
                <b>
                  <Gem />
                  Natural
                  <br />
                  Gemstone
                </b>
                <b>
                  <HandHeart />
                  Handcrafted
                  <br />
                  Design
                </b>
                <b>
                  <ShieldCheck />
                  Premium
                  <br />
                  Quality
                </b>
              </div>
              <div className="signature-buy">
                <strong>
                  {
                    products.find(
                      (p) => p.slug === "purple-copper-turquoise-pendant",
                    )?.price
                  }
                </strong>
                <button
                  disabled={
                    (products.find(
                      (p) => p.slug === "purple-copper-turquoise-pendant",
                    )?.stockQty ?? 0) <= 0
                  }
                  onClick={() =>
                    add(
                      products.find(
                        (p) => p.slug === "purple-copper-turquoise-pendant",
                      )!,
                    )
                  }
                >
                  {(products.find(
                    (p) => p.slug === "purple-copper-turquoise-pendant",
                  )?.stockQty ?? 0) <= 0
                    ? "SOLD OUT"
                    : "ADD TO BAG"}{" "}
                  <ArrowRight />
                </button>
                <a
                  onClick={() =>
                    navTo("/product/purple-copper-turquoise-pendant")
                  }
                >
                  VIEW DETAILS
                </a>
              </div>
            </article>
          </section>
        )}
      <section className="why">
        <span>WHY CHOOSE CRYSMONA</span>
        <div>
          <article>
            <Gem />
            <b>Natural & Authentic</b>
            <p>100% genuine gemstones</p>
          </article>
          <article>
            <Sparkles />
            <b>Ethically Sourced</b>
            <p>Responsibly procured</p>
          </article>
          <article>
            <Hammer />
            <b>Expert Craftsmanship</b>
            <p>Designed to last</p>
          </article>
          <article>
            <Heart />
            <b>Meaningful Jewellery</b>
            <p>More than just an accessory</p>
          </article>
        </div>
      </section>
      {story.id && story.active !== false && (
        <section className="story">
          <div>
            <h2 style={{ whiteSpace: "pre-line" }}>
              {story.title || "Wear the Stone\nThat Speaks to You"}
            </h2>
            <p>
              {story.body ||
                "Jewellery with meaning. For every chapter of your story."}
            </p>
            <button onClick={() => navTo(story.cta_url || "/gemstones")}>
              {story.cta_label || "EXPLORE NOW"} <ArrowRight />
            </button>
          </div>
          <div className="story-art">
            <img
              src={story.image_url || "/assets/gem-turquoise.jpeg"}
              alt="Turquoise cabochons with distinctive natural patterns"
            />
          </div>
        </section>
      )}
    </main>
  );
}
