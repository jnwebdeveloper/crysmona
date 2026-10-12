import crypto from "node:crypto";
import { bad } from "../lib/errors.js";
import { log } from "../lib/logger.js";

// PayPal Orders v2 REST client. Every call sends a PayPal-Request-Id, so retrying
// the same operation (same requestId) returns PayPal's original result instead of
// charging or refunding twice.
export const paypalReady = () =>
  Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);

export const paypalSandbox = () => process.env.PAYPAL_ENV !== "live";

// A string body is sent as-is (webhook verification must embed the event exactly as
// PayPal sent it); anything else is JSON-encoded. GET requests send no body.
async function call(path: string, body: unknown, requestId?: string, method = "POST") {
  if (!paypalReady())
    throw bad("PayPal is not configured. Please choose cash on delivery.", 503);
  const base = paypalSandbox()
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
  // PayPal-Request-Id is logged so a failure can be traced in PayPal's dashboard;
  // debug_id is what PayPal support asks for.
  const paypalRequestId = requestId || crypto.randomUUID();
  const started = Date.now();
  let tokenResponse: Response, response: Response;
  try {
    tokenResponse = await fetch(base + "/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            process.env.PAYPAL_CLIENT_ID + ":" + process.env.PAYPAL_CLIENT_SECRET,
          ).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    log.error("paypal token request failed", { path, paypalRequestId, error });
    throw bad("PayPal could not connect. Please try again later.", 502);
  }
  if (!tokenResponse.ok) {
    const failure: any = await tokenResponse.json().catch(() => ({}));
    log.error("paypal token rejected", {
      path,
      paypalRequestId,
      status: tokenResponse.status,
      paypalError: failure.error,
    });
    throw bad("PayPal could not connect. Please try again later.", 502);
  }
  const token: any = await tokenResponse.json();
  try {
    response = await fetch(base + path, {
      method,
      headers: {
        Authorization: "Bearer " + token.access_token,
        "Content-Type": "application/json",
        "PayPal-Request-Id": paypalRequestId,
      },
      body: method === "GET" ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch (error) {
    log.error("paypal request failed", { path, paypalRequestId, error });
    throw bad(
      "PayPal could not complete this request. Please retry or choose another payment method.",
      502,
    );
  }
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    log.error("paypal request rejected", {
      path,
      paypalRequestId,
      status: response.status,
      ms: Date.now() - started,
      paypalError: data.name,
      debugId: data.debug_id,
      issue: data.details?.[0]?.issue,
    });
    throw bad(
      "PayPal could not complete this request. Please retry or choose another payment method.",
      502,
    );
  }
  log.info("paypal request ok", {
    path,
    paypalRequestId,
    status: response.status,
    ms: Date.now() - started,
    paypalStatus: data.status,
  });
  return data;
}

// Creates a PayPal order and returns its id and the URL the customer approves at.
export async function createPayPalOrder(orderId: string, amount: string, origin: string) {
  const result = await call(
    "/v2/checkout/orders",
    {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: orderId,
          custom_id: orderId,
          amount: { currency_code: "USD", value: amount },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: origin + "/checkout/paypal?reference=" + orderId,
            cancel_url: origin + "/checkout/paypal?cancel=1&reference=" + orderId,
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
          },
        },
      },
    },
    orderId,
  );
  const approveUrl: string | undefined = result.links?.find(
    (l: any) => l.rel === "payer-action" || l.rel === "approve",
  )?.href;
  if (!approveUrl) throw bad("PayPal did not return an approval link.", 502);
  return { paypalOrderId: result.id as string, approveUrl };
}

// What a PayPal capture means for the order:
// - completed: money received for exactly the expected USD amount
// - pending: PayPal is holding the expected amount (review, receiving preferences,
//   eCheck); a PAYMENT.CAPTURE.COMPLETED or .DENIED webhook settles it later, or the
//   customer's next Confirm payment re-reads it
// - declined: PayPal refused the payment; the order can be released
// - unconfirmed: anything else (wrong amount or currency, unknown status)
export type CaptureOutcome =
  | { state: "completed" | "pending"; captureId: string; amount: string; reason?: string }
  | { state: "declined" | "unconfirmed"; captureId?: string; status?: string };

export function classifyCapture(capture: any, expectedAmount: string): CaptureOutcome {
  const amountOk =
    capture?.amount?.currency_code === "USD" && capture?.amount?.value === expectedAmount;
  if (amountOk && (capture.status === "COMPLETED" || capture.status === "PENDING"))
    return {
      state: capture.status === "COMPLETED" ? "completed" : "pending",
      captureId: capture.id,
      amount: capture.amount.value,
      reason: capture.status_details?.reason,
    };
  if (capture?.status === "DECLINED" || capture?.status === "FAILED")
    return { state: "declined", captureId: capture.id, status: capture.status };
  return { state: "unconfirmed", captureId: capture?.id, status: capture?.status };
}

// Captures an approved PayPal order and classifies the resulting capture.
export async function capturePayPalOrder(
  paypalOrderId: string,
  expectedAmount: string,
  requestId: string,
) {
  const result = await call(
    "/v2/checkout/orders/" + encodeURIComponent(paypalOrderId) + "/capture",
    {},
    requestId,
  );
  const capture = result.purchase_units?.[0]?.payments?.captures?.[0];
  const outcome = classifyCapture(capture, expectedAmount);
  if (outcome.state !== "completed")
    log.warn("paypal capture not completed", {
      paypalOrderId,
      paypalStatus: result.status,
      captureStatus: capture?.status,
      reason: capture?.status_details?.reason,
      capturedAmount: capture?.amount?.value,
      expectedAmount,
    });
  return outcome;
}

// Reads a capture's current state; used to re-check a pending capture when the
// customer presses Confirm payment again (the fallback where webhooks cannot reach
// the API, e.g. local development without a tunnel).
export async function getPayPalCapture(captureId: string, expectedAmount: string) {
  const capture = await call(
    "/v2/payments/captures/" + encodeURIComponent(captureId),
    undefined,
    undefined,
    "GET",
  );
  return classifyCapture(capture, expectedAmount);
}

export const webhookConfigured = () => Boolean(process.env.PAYPAL_WEBHOOK_ID);

// Asks PayPal whether a webhook delivery is genuine. rawBody must be the request body
// exactly as received: PayPal verifies the signature over those bytes.
export async function verifyPayPalWebhook(headers: Record<string, any>, rawBody: string) {
  const fields = {
    auth_algo: headers["paypal-auth-algo"],
    cert_url: headers["paypal-cert-url"],
    transmission_id: headers["paypal-transmission-id"],
    transmission_sig: headers["paypal-transmission-sig"],
    transmission_time: headers["paypal-transmission-time"],
    webhook_id: process.env.PAYPAL_WEBHOOK_ID,
  };
  if (Object.values(fields).some((v) => typeof v !== "string" || !v)) return false;
  const body = JSON.stringify(fields).slice(0, -1) + ',"webhook_event":' + rawBody + "}";
  const result = await call("/v1/notifications/verify-webhook-signature", body);
  return result.verification_status === "SUCCESS";
}

export async function refundPayPalCapture(captureId: string, amount: string, requestId: string) {
  const refund = await call(
    "/v2/payments/captures/" + encodeURIComponent(captureId) + "/refund",
    { amount: { value: amount, currency_code: "USD" } },
    requestId,
  );
  return { refundId: refund.id as string };
}
