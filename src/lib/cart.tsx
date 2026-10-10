import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { api, go, useStore } from "./Store";
import { CartItem, Product } from "./model";
import { useUi } from "./ui";

// The bag lives on the server (guest or signed-in owner). This context loads it,
// keeps it consistent with the live catalog, and saves changes back in order.
type Cart = {
  items: CartItem[];
  count: number;
  ready: boolean;
  error: string;
  add: (product: Product, qty?: number) => void;
  update: (slug: string, qty: number) => void;
  remove: (slug: string) => void;
  clear: () => void;
};

const CartContext = createContext<Cart | null>(null);
const serialize = (items: CartItem[]) =>
  JSON.stringify(items.map((i) => ({ slug: i.product.slug, qty: i.qty })));

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { catalog, user, loading, catalogError } = useStore();
  const { showToast } = useUi();
  const [items, setItems] = useState<CartItem[]>([]),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const queue = useRef(Promise.resolve());
  // What the server already has; saves are skipped when nothing changed, so
  // loading the bag or refreshing the catalog does not write it straight back.
  const synced = useRef("");

  useEffect(() => {
    let live = true;
    setReady(false);
    api("/cart")
      .then((data: CartItem[]) => {
        if (!live) return;
        synced.current = serialize(data);
        setItems(data);
        setError("");
        setReady(true);
      })
      .catch((e) => {
        if (live) {
          synced.current = "[]";
          setItems([]);
          setError(e.message);
          setReady(true);
        }
        showToast(e.message);
      });
    return () => {
      live = false;
    };
  }, [user?.id]);

  // Re-bind bag lines to fresh catalog data (prices, stock) and drop vanished products.
  useEffect(() => {
    if (loading || catalogError) return;
    setItems((current) =>
      current.flatMap((item) => {
        const product = catalog.find((p) => p.slug === item.product?.slug);
        return product && Number.isInteger(item.qty) && item.qty > 0
          ? [{ product, qty: item.qty }]
          : [];
      }),
    );
  }, [catalog, loading, catalogError]);

  useEffect(() => {
    if (!ready) return;
    const body = serialize(items);
    if (body === synced.current) return;
    synced.current = body;
    queue.current = queue.current
      .then(() => api("/cart", { method: "PUT", body: JSON.stringify({ items: JSON.parse(body) }) }))
      .catch((e) => showToast(e.message));
  }, [items, ready]);

  const add = (product: Product, qty = 1) => {
    if ((product.stockQty ?? 0) <= 0) {
      showToast("This piece is currently out of stock.");
      return;
    }
    const existing = items.find((i) => i.product.slug === product.slug);
    if (product.stockQty !== undefined && (existing?.qty || 0) + qty > product.stockQty) {
      showToast("The requested quantity exceeds available stock.");
      return;
    }
    setItems((c) =>
      c.some((i) => i.product.slug === product.slug)
        ? c.map((i) => (i.product.slug === product.slug ? { ...i, qty: i.qty + qty } : i))
        : [...c, { product, qty }],
    );
    showToast(`${product.name} added to your bag`);
    if ((window as any).fbq)
      (window as any).fbq("track", "AddToCart", {
        content_name: product.name,
        content_ids: [product.slug],
        content_type: "product",
        value: product.priceCents ? product.priceCents / 100 : undefined,
        currency: "USD",
      });
    go("/cart");
  };

  const update = (slug: string, qty: number) => {
    const available = catalog.find((p) => p.slug === slug)?.stockQty ?? 0;
    if (qty > available) {
      showToast("The requested quantity exceeds available stock.");
      return;
    }
    setItems((c) =>
      qty < 1
        ? c.filter((i) => i.product.slug !== slug)
        : c.map((i) => (i.product.slug === slug ? { ...i, qty } : i)),
    );
  };

  const remove = (slug: string) =>
    setItems((c) => c.filter((i) => i.product.slug !== slug));

  return (
    <CartContext.Provider
      value={{
        items,
        count: items.reduce((n, i) => n + i.qty, 0),
        ready,
        error,
        add,
        update,
        remove,
        clear: () => setItems([]),
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const cart = useContext(CartContext);
  if (!cart) throw new Error("useCart must be used inside CartProvider");
  return cart;
}
