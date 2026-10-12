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
      const result = await api(cancel ? "/paypal/cancel" : "/paypal/capture", {
        method: "POST",
        body: JSON.stringify({
          reference: params.get("reference"),
          token: params.get("token"),
        }),
      });
      // PayPal can hold a payment for review; the order is kept and confirmed later.
      if (!cancel && result?.pending) {
        setStatus("pending");
        onComplete();
        return;
      }
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
            : status === "pending"
              ? "Payment under review"
              : status === "cancelled"
              ? "Payment cancelled"
              : cancel
                ? "Cancel this payment"
                : "Confirm your payment"}
        </h1>
        <p>
          {status === "complete"
            ? "Thank you. Your order is now saved in your account."
            : status === "pending"
              ? "PayPal is reviewing this payment. Your pieces are reserved and your order will be confirmed once PayPal completes it."
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
        {["complete", "pending", "cancelled"].includes(status) ? (
          <button
            onClick={() => go(status === "cancelled" ? "/checkout" : "/orders")}
          >
            {status === "cancelled" ? "RETURN TO CHECKOUT" : "VIEW MY ORDERS"}
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
