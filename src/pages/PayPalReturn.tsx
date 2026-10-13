import { ArrowRight, CheckCircle } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { api, go, useStore } from "../lib/Store";
import { useCart } from "../lib/cart";
import { useUi } from "../lib/ui";

// PayPal sends the customer here after approving (capture) or cancelling. The result
// is applied as soon as the page opens; a button appears only to retry, to sign in,
// or to move on. Repeating the request is safe: the server captures at most once.
type Status = "busy" | "login" | "retry" | "failed" | "complete" | "pending" | "cancelled";

export default function PayPalReturn() {
  const { user } = useStore();
  const { clear: onComplete } = useCart();
  const { openLogin: onLogin } = useUi();
  const [status, setStatus] = useState<Status>("busy"),
    [error, setError] = useState("");
  const [params] = useSearchParams();
  const cancel = params.get("cancel") === "1";
  const running = useRef(false);
  const finish = async () => {
    if (running.current) return;
    running.current = true;
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
      if (e.status === 401) {
        setStatus("login");
        onLogin();
        return;
      }
      setError(e.message);
      // Declined, not this customer's order, or no longer payable: retrying cannot help.
      setStatus([400, 402, 403, 404].includes(e.status) ? "failed" : "retry");
    } finally {
      running.current = false;
    }
  };
  // Runs on arrival, and again once the customer signs in if their session had expired.
  useEffect(() => {
    if (status === "busy" || status === "login") finish();
  }, [user?.id]);
  const done = ["complete", "pending", "cancelled", "failed"].includes(status);
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
                : status === "failed"
                  ? "Payment not completed"
                  : status === "login"
                    ? "Sign in to finish"
                    : cancel
                      ? "Cancelling your payment"
                      : "Confirming your payment"}
        </h1>
        <p>
          {status === "complete"
            ? "Thank you. Your order is now saved in your account."
            : status === "pending"
              ? "PayPal is reviewing this payment. Your pieces are reserved and your order will be confirmed once PayPal completes it."
              : status === "cancelled" || status === "failed"
                ? "Your bag is saved. You can choose another payment method."
                : status === "login"
                  ? "Your session has ended. Sign in with the same account to finish this payment."
                  : status === "retry"
                    ? "Your payment could not be confirmed yet. Trying again is safe: you will never be charged twice."
                    : "Please keep this page open. This only takes a moment."}
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {done ? (
          <button
            onClick={() =>
              go(status === "cancelled" || status === "failed" ? "/checkout" : "/orders")
            }
          >
            {status === "cancelled" || status === "failed" ? "RETURN TO CHECKOUT" : "VIEW MY ORDERS"}
            <ArrowRight />
          </button>
        ) : status === "login" ? (
          <button onClick={onLogin}>
            SIGN IN
            <ArrowRight />
          </button>
        ) : (
          <button disabled={status === "busy"} onClick={finish}>
            {status === "busy" ? (cancel ? "CANCELLING…" : "CONFIRMING…") : "TRY AGAIN"}
            <ArrowRight />
          </button>
        )}
      </section>
    </main>
  );
}
