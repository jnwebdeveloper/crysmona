import { useLayoutEffect, useRef, useState } from "react";

import {
  ArrowRight,
  Gem,
  Heart,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";

import { go as navTo, useStore } from "../lib/Store";
import ProductGallery from "../components/ProductGallery";
import ProductRecommendations from "../components/ProductRecommendations";
import RichText from "../components/RichText";
import { Product } from "../lib/model";
import { useCart } from "../lib/cart";

import SubscribeForm from "../components/SubscribeForm";
// Product page for both jewellery and gemstones. They share one layout; the
// wording and a few gemstone-only blocks (Shape · Type line, "collection of N
// pieces" box, promises row) depend on the kind.
const COPY = {
  jewellery: {
    crumb: ["JEWELLERY", "/jewellery"],
    eyebrow: "CRYSMONA SIGNATURE",
    soldOut: "This piece has found its home. Discover another favourite below.",
  },
  gemstone: {
    crumb: ["GEMSTONES", "/gemstones"],
    eyebrow: "THE GEMSTONE COLLECTION",
    soldOut:
      "This collection has found its home. Save it to your wishlist and check back soon.",
  },
} as const;

export default function ProductDetail({ product }: { product: Product }) {
  const { store, user } = useStore();
  const { add } = useCart();
  const [q, setQ] = useState(1);
  const isGem = product.kind === "gemstone";
  const copy = COPY[isGem ? "gemstone" : "jewellery"];
  const spec = product.specifications || {};
  // Breadcrumb: Home / Jewellery or Gemstones / category (when the product has an
  // active one) / product. The category links to the listing filtered by it.
  const category = store.categories?.find(
    (c: any) => c.id === product.categoryId && c.active !== false,
  );
  const crumbs: [string, string][] = [
    ["HOME", "/"],
    [copy.crumb[0], copy.crumb[1]],
    ...(category
      ? [[
          String(category.name).toUpperCase(),
          `${copy.crumb[1]}?category=${encodeURIComponent(category.slug)}`,
        ] as [string, string]]
      : []),
  ];
  // Jewellery: stone and metal lead the specifications table. Empty values are
  // left out, and a specification with the same name isn't repeated.
  const specs: [string, string][] = isGem
    ? []
    : [
        ["Stone", product.stone],
        ["Metal", product.metal || ""],
      ];
  for (const [key, value] of Object.entries(product.specifications || {}))
    if (!specs.some(([name]) => name.toLowerCase() === key.trim().toLowerCase()))
      specs.push([key, value]);
  const specRows = specs.filter(([, value]) => value?.trim());
  // On desktop the info column matches the gallery's height: the description
  // takes the space left, is cut off with "View more" when too long, and the buy
  // buttons line up with the bottom of the gallery. If even a 3-line description
  // doesn't fit, the column is allowed to grow instead ("tall").
  const infoRef = useRef<HTMLElement>(null);
  const descRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [tall, setTall] = useState(false);
  const [clamped, setClamped] = useState(false);
  useLayoutEffect(() => {
    const info = infoRef.current,
      desc = descRef.current;
    if (!info || !desc) return;
    const measure = () => {
      if (info.classList.contains("pdp-fit") && info.scrollHeight > info.clientHeight + 1) {
        setTall(true);
        return;
      }
      setClamped(!expanded && desc.scrollHeight > desc.clientHeight + 1);
    };
    measure();
    // When the gallery or window really changes size (images loading, resizing),
    // check again from the fitted layout.
    const gallery = info.previousElementSibling as HTMLElement | null;
    const size = () => `${gallery?.offsetHeight}x${window.innerWidth}`;
    let last = size();
    const recheck = () => {
      if (size() === last) return;
      last = size();
      setTall(false);
      measure();
    };
    const observer = new ResizeObserver(recheck);
    if (gallery) observer.observe(gallery);
    window.addEventListener("resize", recheck);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", recheck);
    };
  }, [expanded, tall, product.description]);
  return (
    <main className="page product-page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          {crumbs.map(([label, url]) => (
            <li key={url}>
              <a
                href={url}
                onClick={(e) => {
                  e.preventDefault();
                  navTo(url);
                }}
              >
                {label}
              </a>
            </li>
          ))}
          <li aria-current="page">{product.name.toUpperCase()}</li>
        </ol>
      </nav>
      <section className="pdp-hero">
        <ProductGallery product={product} />
        <article
          ref={infoRef}
          className={"pdp-info" + (!expanded && !tall ? " pdp-fit" : "")}
        >
          <span>{copy.eyebrow}</span>
          <h1>{product.name}</h1>
          {isGem && (
            <p className="gem-subtitle">
              {spec["Gemstone Shape"] || "Distinctive stones"} ·{" "}
              {spec["Gemstone Type"] || "Cabochon"}
            </p>
          )}
          <strong>{product.price}</strong>
          <div className="pdp-desc-wrap">
            <div
              ref={descRef}
              id="pdp-description"
              className={
                "pdp-desc" +
                (expanded ? " is-expanded" : "") +
                (clamped ? " is-clamped" : "")
              }
            >
              <RichText className="product-description" value={product.description} />
            </div>
            {(clamped || expanded) && (
              <button
                type="button"
                className="pdp-desc-toggle"
                aria-expanded={expanded}
                aria-controls="pdp-description"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? "View less" : "View more"}
              </button>
            )}
          </div>
          {isGem && spec["Number Of Pieces"] && (
            <div className="gem-lot">
              <Gem />
              <span>
                <b>A collection of {spec["Number Of Pieces"]} pieces</b>
                <small>
                  {spec["Gemstone Weight"]
                    ? spec["Gemstone Weight"] + " · "
                    : ""}
                  Price shown for this collection
                </small>
              </span>
            </div>
          )}
          {(product.stockQty ?? 0) <= 0 && (
            <p className="stock-status sold-out">{copy.soldOut}</p>
          )}
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
              if (user) navTo("/checkout");
            }}
          >
            BUY IT NOW
          </button>
          {isGem && (
            <div className="gem-promises">
              <span>
                <ShieldCheck /> Thoughtfully selected
              </span>
              <span>
                <Heart /> Each stone is individual
              </span>
            </div>
          )}
        </article>
      </section>
      {specRows.length > 0 && (
        <section className="gem-specs">
          {isGem ? (
            <div>
              <span className="eyebrow">A CLOSER LOOK</span>
              <h2>Details of your stone</h2>
              <p>Every characteristic, in one place.</p>
            </div>
          ) : (
            <div>
              <h2>Gemstone specifications</h2>
            </div>
          )}
          <dl>
            {specRows.map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <ProductRecommendations product={product} />
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
