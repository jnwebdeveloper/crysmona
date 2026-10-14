import { ArrowRight, ShoppingBag } from "lucide-react";
import React, { useEffect, useState } from "react";

import Loader from "../components/Loader";
import { api, go as navTo, useStore } from "../lib/Store";
import { Order, money } from "../lib/model";

// Rendered inside RequireLogin, so a signed-in user is guaranteed.
export default function OrdersPage() {
  const { user, setUser } = useStore();
  const [orders, setOrders] = useState<Order[] | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("/orders")
      .then((data) => {
        setOrders(data);
        setError("");
      })
      .catch((e) => setError(e.message));
  }, [user?.id]);
  const signOut = async () => {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
    try {
      localStorage.removeItem("crysmona-user");
    } catch {}
  };
  if (!orders && !error)
    return (
      <main className="page">
        <Loader label="Loading your orders…" />
      </main>
    );
  return (
    <>
    <div className="account-strip">
      <span>Signed in as +91 {user?.phone}</span>
      <button onClick={signOut}>Sign out</button>
    </div>
    {error && <p className="form-error">{error}</p>}
    <main className="page orders-page">
      <section className="page-hero compact">
        <span>YOUR CRYSMONA</span>
        <h1>My Orders</h1>
        <p>Track and revisit the pieces you have chosen.</p>
      </section>
      {orders?.length ? (
        <section className="orders-list">
          {orders.map((o) => (
            <article className="order-card" key={o.id}>
              <header>
                <div>
                  <span>ORDER</span>
                  <h2>{o.id}</h2>
                </div>
                <div>
                  <span>PLACED</span>
                  <b>
                    {new Date(o.createdAt).toLocaleDateString("en-US", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </b>
                </div>
                <div>
                  <span>TOTAL</span>
                  <b>${o.total.toLocaleString("en-US")}</b>
                </div>
                <div className="order-card-actions"><em>{o.status.replace(/_/g, " ").replace(/^./, c => c.toUpperCase())}</em><button onClick={()=>navTo("/orders/"+encodeURIComponent(o.id))}>View details</button></div>
              </header>
              {o.items.map((i) => (
                <div className="order-item" key={i.product.slug}>
                  <img src={i.product.image} />
                  <div>
                    <h3>{i.product.name}</h3>
                    <p>
                      {i.product.stone} · Qty {i.qty}
                    </p>
                  </div>
                  <strong>
                    ${(money(i.product.price) * i.qty).toLocaleString("en-US")}
                  </strong>
                </div>
              ))}
            </article>
          ))}
        </section>
      ) : (
        <section className="empty-cart">
          <ShoppingBag />
          <h2>No orders yet.</h2>
          <p>Your completed orders will appear here.</p>
          <button onClick={() => navTo("/jewellery")}>
            EXPLORE JEWELLERY <ArrowRight />
          </button>
        </section>
      )}
    </main>
    </>
  );
}
