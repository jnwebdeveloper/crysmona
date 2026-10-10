import { ArrowRight, CheckCircle } from "lucide-react";
import React, { useState } from "react";
import { useSearchParams } from "react-router";
import { api, go, useStore } from "../lib/Store";
import { useCart } from "../lib/cart";
import { useUi } from "../lib/ui";
export default function PayPalReturn() {
  const { user } = useStore();
  const { clear: onComplete } = useCart();
  const { openLogin: onLogin } = useUi();
  const [status, setStatus] = useState("ready"),
    [error, setError] = useState("");
  const [params] = useSearchParams();
  const cancel = params.get("cancel") === "1";
  const finish = async () => {
    if (!user) {
      onLogin();
      return;
    }
    setStatus("busy");
    setError("");
    try {
      await api(cancel ? "/paypal/cancel" : "/paypal/capture", {
        method: "POST",
        body: JSON.stringify({
          reference: params.get("reference"),
          token: params.get("token"),
        }),
      });
      setStatus(cancel ? "cancelled" : "complete");
      if (!cancel) {
        onComplete();
        if ((window as any).fbq) (window as any).fbq("track", "Purchase", {currency: "USD"});
      }
    } catch (e: any) {
      setError(e.message);
      setStatus("ready");
    }
  };
  return (
    <main className="page">
      <section className="payment-result">
        <CheckCircle />
        <span>PAYPAL CHECKOUT</span>
        <h1>
          {status === "complete"
            ? "Payment confirmed"
            : status === "cancelled"
              ? "Payment cancelled"
              : cancel
                ? "Cancel this payment"
                : "Confirm your payment"}
        </h1>
        <p>
          {status === "complete"
            ? "Thank you. Your order is now saved in your account."
            : status === "cancelled"
              ? "Your bag is saved. You can choose another payment method."
              : cancel
                ? "Release the pending order and return to your bag."
                : "Finish confirming your payment securely with PayPal."}
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {["complete", "cancelled"].includes(status) ? (
          <button
            onClick={() => go(status === "complete" ? "/orders" : "/checkout")}
          >
            {status === "complete" ? "VIEW MY ORDERS" : "RETURN TO CHECKOUT"}
            <ArrowRight />
          </button>
        ) : (
          <button disabled={status === "busy"} onClick={finish}>
            {status === "busy"
              ? "CONFIRMING…"
              : cancel
                ? "CANCEL PAYMENT"
                : "CONFIRM PAYMENT"}
            <ArrowRight />
          </button>
        )}
      </section>
    </main>
  );
}
