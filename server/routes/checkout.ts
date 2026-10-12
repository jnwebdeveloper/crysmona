import express from "express";
import { customer } from "../auth/customer/session.js";
import {
  capturePayment,
  placeOrder,
  quote,
  releaseUnpaidOrder,
} from "../services/orders.js";
import { paypalReady, paypalSandbox } from "../services/paypal.js";

// Checkout: pricing, placing an order, and the PayPal approve/cancel return.
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

router.post("/api/paypal/cancel", customer, async (req: any, res) => {
  await releaseUnpaidOrder(String(req.body.reference), req.customer.id, "PayPal payment cancelled by customer");
  res.json({ ok: true });
});

export default router;
