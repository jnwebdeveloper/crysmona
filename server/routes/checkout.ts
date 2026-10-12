import express from "express";
import { customer } from "../auth/customer/session.js";
import { log } from "../lib/logger.js";
import {
  capturePayment,
  handlePayPalWebhook,
  placeOrder,
  quote,
  releaseUnpaidOrder,
} from "../services/orders.js";
import {
  paypalReady,
  paypalSandbox,
  verifyPayPalWebhook,
  webhookConfigured,
} from "../services/paypal.js";

// Checkout: pricing, placing an order, the PayPal approve/cancel return, and the
// PayPal webhook that settles captures PayPal left pending.
const router = express.Router();

router.post("/api/checkout/quote", async (req, res) => {
  const { lines: _lines, ...result } = await quote(req.body.items, req.body.coupon || "");
  res.json(result);
});

router.get("/api/paypal/config", (_req, res) =>
  res.json({ available: paypalReady(), currency: "USD", sandbox: paypalSandbox() }),
);

router.post("/api/orders", customer, async (req: any, res) => {
  const { items, address, paymentMethod, coupon } = req.body;
  const result = await placeOrder({
    userId: req.customer.id,
    items,
    address,
    paymentMethod,
    coupon,
    requestId: req.id,
  });
  res.status(201).json(result.body);
});

router.post("/api/paypal/capture", customer, async (req: any, res) => {
  const { orderNumber, pending } = await capturePayment({
    orderId: String(req.body.reference),
    userId: req.customer.id,
    paypalToken: req.body.token,
    requestId: req.id,
  });
  res.json({ ok: true, orderNumber, pending: Boolean(pending) });
});

// PayPal → us. Unauthenticated by design: authenticity comes from PayPal's signature
// check. Any non-2xx response makes PayPal redeliver the event later (up to 3 days).
router.post("/api/paypal/webhook", async (req: any, res) => {
  if (!webhookConfigured()) {
    log.warn("paypal webhook received but PAYPAL_WEBHOOK_ID is not set", { requestId: req.id });
    res.status(503).json({ error: "Webhook not configured." });
    return;
  }
  if (typeof req.rawBody !== "string" || !(await verifyPayPalWebhook(req.headers, req.rawBody))) {
    log.warn("paypal webhook signature rejected", { requestId: req.id, eventId: req.body?.id });
    res.status(400).json({ error: "Invalid signature." });
    return;
  }
  log.info("paypal webhook received", {
    requestId: req.id,
    eventId: req.body.id,
    type: req.body.event_type,
  });
  await handlePayPalWebhook(req.body, req.id);
  res.json({ ok: true });
});

router.post("/api/paypal/cancel", customer, async (req: any, res) => {
  await releaseUnpaidOrder(String(req.body.reference), req.customer.id, "PayPal payment cancelled by customer");
  res.json({ ok: true });
});

export default router;
