import express from "express";
import { customer } from "../auth/customer/session.js";
import { cancelOrder, getOrder, listOrders } from "../services/orders.js";

// A signed-in customer's order history, order detail and cancellation.
const router = express.Router();

router.get("/api/orders", customer, async (req: any, res) => {
  res.json(await listOrders(req.customer.id));
});

router.get("/api/orders/:orderNumber", customer, async (req: any, res) => {
  res.json(await getOrder(req.params.orderNumber, req.customer.id));
});

router.post("/api/orders/:orderNumber/cancel", customer, async (req: any, res) => {
  const { refunded } = await cancelOrder({
    orderNumber: req.params.orderNumber,
    userId: req.customer.id,
    requestId: req.id,
  });
  res.json({ ok: true, refunded });
});

export default router;
