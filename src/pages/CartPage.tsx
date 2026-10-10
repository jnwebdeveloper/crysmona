import { ArrowRight, Minus, Plus, ShoppingBag } from "lucide-react";

import { go as navTo } from "../lib/Store";
import { CartItem, formatPrice, money } from "../lib/model";

export default function CartPage({
  items,
  update,
  remove,
}: {
  items: CartItem[];
  update: (slug: string, qty: number) => void;
  remove: (slug: string) => void;
}) {
  const subtotal = items.reduce(
    (n, i) => n + money(i.product.price) * i.qty,
    0,
  );
  return (
    <main className="page cart-page">
      <section className="page-hero compact">
        <span>YOUR SELECTION</span>
        <h1>Shopping Bag</h1>
        <p>
          {items.length
            ? "Review your pieces before checkout."
            : "Your bag is currently empty."}
        </p>
      </section>
      {items.length ? (
        <section className="cart-layout">
          <div className="cart-items">
            {items.map(({ product, qty }) => (
              <article className="cart-item" key={product.slug}>
                <img src={product.image} alt={product.name} />
                <div>
                  <span>{product.stone}</span>
                  <h2 onClick={() => navTo("/product/" + product.slug)}>
                    {product.name}
                  </h2>
                  <p>{product.note}</p>
                  <button
                    className="remove"
                    onClick={() => remove(product.slug)}
                  >
                    REMOVE
                  </button>
                </div>
                <div className="cart-qty">
                  <button
                    aria-label={"Decrease quantity of " + product.name}
                    onClick={() => update(product.slug, qty - 1)}
                  >
                    <Minus />
                  </button>
                  <b>{qty}</b>
                  <button
                    aria-label={"Increase quantity of " + product.name}
                    disabled={qty >= (product.stockQty ?? 0)}
                    onClick={() => update(product.slug, qty + 1)}
                  >
                    <Plus />
                  </button>
                </div>
                <strong>
                  {formatPrice(
                    (product.priceCents ?? money(product.price) * 100) * qty,
                  )}
                </strong>
              </article>
            ))}
          </div>
          <aside className="cart-summary">
            <span>ORDER SUMMARY</span>
            <h2>Bag total</h2>
            <div>
              <p>
                Subtotal <b>{formatPrice(subtotal * 100)}</b>
              </p>
              <p>
                Shipping <b>Calculated at checkout</b>
              </p>
            </div>
            <strong>{formatPrice(subtotal * 100)}</strong>
            <button onClick={() => navTo("/checkout")}>
              PROCEED TO CHECKOUT <ArrowRight />
            </button>
            <small>Taxes and shipping calculated at checkout.</small>
          </aside>
        </section>
      ) : (
        <section className="empty-cart">
          <ShoppingBag />
          <h2>Your bag is waiting for a story.</h2>
          <button onClick={() => navTo("/jewellery")}>
            EXPLORE JEWELLERY <ArrowRight />
          </button>
        </section>
      )}
    </main>
  );
}
