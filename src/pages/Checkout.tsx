import { ArrowRight, ShieldCheck, ShoppingBag } from "lucide-react";
import React, { useEffect, useState } from "react";
import { api, go, useStore } from "../lib/Store";
import { CartItem, formatPrice } from "../lib/model";
export default function Checkout({
  items,
  onLogin,
  onComplete,
}: {
  items: CartItem[];
  onLogin: () => void;
  onComplete: () => void;
}) {
  const { user } = useStore();
  const [method, setMethod] = useState("cod"),
    [config, setConfig] = useState<any>(null),
    [quote, setQuote] = useState<any>(null),
    [coupon, setCoupon] = useState(""),
    [applied, setApplied] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [address, setAddress] = useState({
      name: "",
      email: "",
      phone: "",
      line1: "",
      city: "",
      state: "",
      postal_code: "",
      country: "India",
    });
  const lines = items.map((i) => ({ slug: i.product.slug, qty: i.qty }));
  useEffect(() => {
    api("/paypal/config")
      .then(setConfig)
      .catch(() => setConfig({ available: false }));
  }, []);
  useEffect(() => {
    let current = true;
    setQuote(null);
    if (items.length)
      api("/checkout/quote", {
        method: "POST",
        body: JSON.stringify({ items: lines, coupon: applied }),
      })
        .then((data) => {
          if (current) {
            setQuote(data);
            setError("");
          }
        })
        .catch((e) => {
          if (current) setError(e.message);
        });
    return () => {
      current = false;
    };
  }, [JSON.stringify(lines), applied]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onLogin();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api("/orders", {
        method: "POST",
        body: JSON.stringify({
          items: lines,
          address,
          paymentMethod: method,
          coupon: applied,
        }),
      });
      if (result.redirect) {
        window.location.assign(result.redirect);
        return;
      }
      onComplete();
      if ((window as any).fbq) (window as any).fbq("track", "Purchase", {value: result.total, currency: "USD"});
      go("/orders");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="page checkout-page">
      <section className="checkout-head">
        <span>A FEW DETAILS, THEN IT’S YOURS</span>
        <h1>Complete your order</h1>
      </section>
      {!items.length ? (
        <section className="wishlist-empty">
          <ShoppingBag />
          <h2>Your bag is empty.</h2>
          <button onClick={() => go("/gemstones")}>
            EXPLORE GEMSTONES <ArrowRight />
          </button>
        </section>
      ) : (
        <div className="checkout-layout">
          <form className="checkout-form" onSubmit={submit}>
            {!user && (
              <div className="checkout-signin">
                <p>Sign in to save this order to your account.</p>
                <button type="button" onClick={onLogin}>
                  SIGN IN
                </button>
              </div>
            )}
            <fieldset>
              <legend>Contact & delivery</legend>
              <div className="two">
                {(
                  [
                    "name",
                    "email",
                    "phone",
                    "line1",
                    "city",
                    "state",
                    "postal_code",
                    "country",
                  ] as const
                ).map((key) => (
                  <label key={key}>
                    {
                      {
                        name: "Full name",
                        email: "Email address",
                        phone: "Phone number",
                        line1: "Street address",
                        city: "City",
                        state: "State",
                        postal_code: "Postal code",
                        country: "Country",
                      }[key]
                    }
                    <input
                      required
                      type={
                        key === "email"
                          ? "email"
                          : key === "phone"
                            ? "tel"
                            : "text"
                      }
                      value={address[key]}
                      onChange={(e) =>
                        setAddress({ ...address, [key]: e.target.value })
                      }
                    />
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Payment method</legend>
              <label
                className={
                  "payment-choice " + (method === "cod" ? "selected" : "")
                }
              >
                <input
                  type="radio"
                  name="payment"
                  checked={method === "cod"}
                  onChange={() => setMethod("cod")}
                />
                <span>
                  <b>Cash on delivery</b>
                  <small>Pay when your order arrives.</small>
                </span>
              </label>
              <label
                className={
                  "payment-choice " + (method === "paypal" ? "selected" : "")
                }
              >
                <input
                  type="radio"
                  name="payment"
                  checked={method === "paypal"}
                  onChange={() => setMethod("paypal")}
                  disabled={!config?.available}
                />
                <span>
                  <b className="paypal-wordmark">
                    Pay<span>Pal</span>
                  </b>
                  <small>
                    {config?.available
                      ? "Continue to PayPal to approve your payment."
                      : "PayPal is currently unavailable. Please use cash on delivery."}
                  </small>
                </span>
              </label>
              {method === "paypal" && quote && config?.available && (
                <p className="paypal-conversion">
                  PayPal checkout: <b>US${(quote.total / 100).toFixed(2)}</b>
                  <br />
                  All prices and payments are in USD.
                  {config.sandbox && (
                    <small> Sandbox checkout · Test payments only.</small>
                  )}
                </p>
              )}
            </fieldset>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="place-order"
              disabled={
                busy || !quote || (method === "paypal" && !config?.available)
              }
            >
              {busy
                ? "PLEASE WAIT…"
                : !user
                  ? "SIGN IN TO CONTINUE"
                  : method === "paypal"
                    ? "CONTINUE TO PAYPAL"
                    : "PLACE ORDER"}
              {quote && " · " + formatPrice(quote.total)}
              <ArrowRight />
            </button>
            <p className="checkout-fine">
              {method === "paypal"
                ? "Your order is confirmed only after PayPal verifies payment."
                : "Payment is collected on delivery."}
            </p>
          </form>
          <aside className="checkout-summary">
            <span>YOUR SELECTION</span>
            {items.map(({ product, qty }) => (
              <div className="checkout-product" key={product.slug}>
                <img src={product.image} alt={product.name} />
                <p>
                  <b>{product.name}</b>
                  <small>Qty {qty}</small>
                </p>
                <strong>{product.price}</strong>
              </div>
            ))}
            <div className="coupon-box">
              <label>
                Discount code
                <input
                  value={coupon}
                  onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                />
              </label>
              <button type="button" onClick={() => setApplied(coupon.trim())}>
                Apply
              </button>
              {applied && (
                <button
                  type="button"
                  onClick={() => {
                    setApplied("");
                    setCoupon("");
                  }}
                >
                  Remove
                </button>
              )}
            </div>
            {quote && (
              <div className="checkout-total">
                <p>
                  Subtotal <b>{formatPrice(quote.subtotal)}</b>
                </p>
                <p>
                  Shipping{" "}
                  <b>{quote.shipping ? formatPrice(quote.shipping) : "Free"}</b>
                </p>
                {quote.discount > 0 && (
                  <p>
                    Discount <b>−{formatPrice(quote.discount)}</b>
                  </p>
                )}
                <strong>
                  Total <b>{formatPrice(quote.total)}</b>
                </strong>
              </div>
            )}
            <small>
              <ShieldCheck /> Your payment details are handled by your payment
              provider.
            </small>
          </aside>
        </div>
      )}
    </main>
  );
}
