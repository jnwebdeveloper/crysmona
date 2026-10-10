import { ShoppingBag } from "lucide-react";

import { go as navTo } from "../lib/Store";
import { WishButton } from "./WishButton";
import { Product } from "../lib/model";

export default function ProductCard({
  p,
  add,
}: {
  p: Product;
  add: (p: Product) => void;
}) {
  return (
    <article className="shop-card">
      <div className="product-photo">
        <a
          href={"/product/" + p.slug}
          onClick={(e) => {
            e.preventDefault();
            navTo("/product/" + p.slug);
          }}
        >
          <img src={p.image} alt={p.name} />
        </a>
        <WishButton product={p} />
        {(p.stockQty ?? 0) <= 0 && (
          <span className="sold-out-badge">Sold out</span>
        )}
      </div>
      <div className="shop-card-body">
        <h3>
          <a
            href={"/product/" + p.slug}
            onClick={(e) => {
              e.preventDefault();
              navTo("/product/" + p.slug);
            }}
          >
            {p.name}
          </a>
        </h3>
        <p>{p.note}</p>
        <div className="product-price">
          <b>{p.price}</b>
          <button
            disabled={(p.stockQty ?? 0) <= 0}
            aria-label={(p.stockQty ?? 0) <= 0 ? "Sold out" : "Add to bag"}
            onClick={(e) => {
              e.stopPropagation();
              add(p);
            }}
          >
            {(p.stockQty ?? 0) <= 0 ? "Sold out" : <ShoppingBag />}
          </button>
        </div>
      </div>
    </article>
  );
}
