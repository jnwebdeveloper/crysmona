import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { pool, q } from "../lib/db.js";
import { bad } from "../lib/errors.js";
import { log } from "../lib/logger.js";
import {
  capturePayPalOrder,
  createPayPalOrder,
  paypalReady,
  refundPayPalCapture,
} from "./paypal.js";

// Order lifecycle: pricing, placement (stock reservation), PayPal capture, customer
// cancellation with refund, and the order shapes returned to the storefront.
//
// External calls (PayPal) never run inside a database transaction: the transaction
// would hold row locks and a pooled connection for the length of the HTTP call, and
// a rollback after PayPal succeeded would leave money moved but the order unchanged.
// Instead each step re-checks the order state in a short transaction, and PayPal
// request ids make retries idempotent.

type Queryable = Pick<PoolClient, "query">;

async function transaction<T>(work: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const result = await work(c);
    await c.query("COMMIT");
    return result;
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}

async function restoreStock(c: Queryable, orderId: string) {
  const lines = await c.query(
    "SELECT product_id,quantity FROM order_items WHERE order_id=$1",
    [orderId],
  );
  for (const l of lines.rows)
    if (l.product_id)
      await c.query("UPDATE products SET stock_qty=stock_qty+$1 WHERE id=$2", [
        l.quantity,
        l.product_id,
      ]);
}

const addHistory = (c: Queryable, orderId: string, status: string, note: string, actor: string) =>
  c.query(
    "INSERT INTO order_status_history(order_id,status,note,actor) VALUES($1,$2,$3,$4)",
    [orderId, status, note, actor],
  );

// ---- pricing ----------------------------------------------------------------

export async function quote(items: any[], coupon: string, client: Queryable = pool) {
  if (!Array.isArray(items) || !items.length || items.length > 100)
    throw bad("Your bag is empty or invalid.");
  const grouped = new Map<string, number>();
  for (const item of items) {
    if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99)
      throw bad("Quantity must be between 1 and 99.");
    grouped.set(String(item.slug), (grouped.get(item.slug) || 0) + item.qty);
  }
  let subtotal = 0;
  const lines = [];
  for (const [slug, qty] of [...grouped].sort(([a], [b]) => a.localeCompare(b))) {
    if (qty > 99) throw bad("Quantity must be between 1 and 99 per product.");
    const { rows } = await client.query(
      "SELECT * FROM products WHERE slug=$1 AND active=true",
      [slug],
    );
    const p = rows[0];
    if (!p || p.stock_qty < qty)
      throw bad(`${p?.name || slug} is unavailable in the requested quantity.`);
    subtotal += p.price_cents * qty;
    lines.push({ product: p, qty });
  }
  const settings = await client.query("SELECT key,value FROM settings");
  const config = Object.fromEntries(settings.rows.map((r: any) => [r.key, r.value]));
  const shipping =
    subtotal >= Number(config.free_shipping_threshold_cents ?? 500000)
      ? 0
      : Number(config.shipping_cents ?? 25000);
  let discount = 0;
  if (coupon) {
    const { rows } = await client.query(
      "SELECT * FROM coupons WHERE upper(code)=$1 AND active=true AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>=now())",
      [coupon.toUpperCase()],
    );
    const c = rows[0];
    if (!c || subtotal < c.min_order_cents)
      throw bad("This discount code is unavailable or the minimum order is not met.");
    discount = Math.min(
      subtotal,
      c.discount_type === "percent"
        ? Math.round((subtotal * c.discount_value) / 100)
        : c.discount_value,
    );
  }
  return { subtotal, shipping, discount, total: subtotal + shipping - discount, lines };
}

// ---- placing an order -------------------------------------------------------

const REQUIRED_ADDRESS = ["name", "email", "line1", "city", "postal_code", "country"];

export async function placeOrder(input: {
  userId: number;
  items: any[];
  address: any;
  paymentMethod: string;
  coupon?: string;
  requestId?: string;
}) {
  const { userId, items, address, paymentMethod, requestId } = input;
  const coupon = input.coupon || "";
  if (!["cod", "paypal"].includes(paymentMethod))
    throw bad("Choose a supported payment method.");
  if (paymentMethod === "paypal" && !paypalReady())
    throw bad("PayPal is not configured yet.", 503);
  for (const field of REQUIRED_ADDRESS)
    if (!String(address?.[field] || "").trim())
      throw bad("Complete your contact and delivery address.");

  // Price, reserve stock and record the order atomically.
  const order = await transaction(async (c) => {
    const result = await quote(items, coupon, c);
    for (const l of result.lines) {
      const r = await c.query(
        "UPDATE products SET stock_qty=stock_qty-$1 WHERE id=$2 AND stock_qty>=$1",
        [l.qty, l.product.id],
      );
      if (!r.rowCount) throw bad("Stock changed. Please update your bag.");
    }
    const number = "CRY-" + crypto.randomBytes(6).toString("hex").toUpperCase();
    const status = paymentMethod === "paypal" ? "awaiting_payment" : "placed";
    const { rows } = await c.query(
      "INSERT INTO orders(order_number,user_id,status,payment_status,payment_method,subtotal_cents,shipping_cents,discount_cents,total_cents,shipping_address,paypal_amount,coupon_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *",
      [
        number,
        userId,
        status,
        "pending",
        paymentMethod,
        result.subtotal,
        result.shipping,
        result.discount,
        result.total,
        JSON.stringify(address),
        paymentMethod === "paypal" ? (result.total / 100).toFixed(2) : null,
        coupon || null,
      ],
    );
    const created = rows[0];
    for (const l of result.lines)
      await c.query(
        "INSERT INTO order_items(order_id,product_id,product_name,sku,unit_price_cents,quantity,image_url) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [created.id, l.product.id, l.product.name, l.product.sku, l.product.price_cents, l.qty, l.product.image_url],
      );
    await addHistory(c, created.id, status, "Order created", "customer");
    return created;
  });
  log.info("order created", {
    requestId,
    orderId: order.id,
    orderNumber: order.order_number,
    userId,
    paymentMethod,
    totalCents: order.total_cents,
  });

  if (paymentMethod !== "paypal")
    return {
      kind: "placed" as const,
      body: {
        id: order.id,
        orderNumber: order.order_number,
        total: order.total_cents / 100,
        status: "Order placed",
        createdAt: order.created_at,
      },
    };

  try {
    const origin = process.env.WEB_ORIGIN || "http://localhost:5173";
    const { paypalOrderId, approveUrl } = await createPayPalOrder(
      String(order.id),
      order.paypal_amount,
      origin,
    );
    await q("UPDATE orders SET paypal_order_id=$1 WHERE id=$2", [paypalOrderId, order.id]);
    return { kind: "redirect" as const, body: { redirect: approveUrl, reference: order.id } };
  } catch (error) {
    log.warn("paypal order creation failed; releasing stock", { requestId, orderId: order.id });
    await releaseUnpaidOrder(String(order.id), userId, "PayPal checkout could not be started");
    throw error;
  }
}

// Cancels an order that is still awaiting PayPal payment and returns its stock.
// Orders in any other state are left untouched.
export async function releaseUnpaidOrder(orderId: string, userId: number, note: string) {
  const released = await transaction(async (c) => {
    const { rows } = await c.query(
      "SELECT id,status FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [orderId, userId],
    );
    const order = rows[0];
    if (!order) throw bad("Order not found.", 404);
    if (order.status !== "awaiting_payment") return false;
    await restoreStock(c, order.id);
    await c.query(
      "UPDATE orders SET status='cancelled',payment_status='failed',cancelled_at=now(),updated_at=now() WHERE id=$1",
      [order.id],
    );
    await addHistory(c, order.id, "cancelled", note, "system");
    return true;
  });
  if (released) log.info("unpaid order released", { orderId, note });
  return released;
}

// ---- PayPal capture ---------------------------------------------------------

export async function capturePayment(input: {
  orderId: string;
  userId: number;
  paypalToken: string;
  requestId?: string;
}) {
  const { orderId, userId, paypalToken, requestId } = input;
  const { rows } = await q(
    "SELECT id,order_number,status,payment_status,paypal_order_id,paypal_amount FROM orders WHERE id=$1 AND user_id=$2",
    [orderId, userId],
  );
  const o = rows[0];
  if (!o || o.paypal_order_id !== paypalToken)
    throw bad("This payment does not belong to your order.", 403);
  if (o.payment_status === "paid") return { orderNumber: o.order_number };
  if (o.status !== "awaiting_payment") throw bad("This order is no longer awaiting payment.");

  // Outside any transaction; the request id makes a retried capture return the
  // original result instead of charging again.
  const capture = await capturePayPalOrder(o.paypal_order_id, o.paypal_amount, o.id + "-capture");
  if (!capture) throw bad("Payment is not yet confirmed. Please retry confirmation.", 409);

  return transaction(async (c) => {
    const current = (
      await c.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [o.id])
    ).rows[0];
    // A concurrent confirmation already recorded it.
    if (current.payment_status === "paid") return { orderNumber: current.order_number };
    if (current.status !== "awaiting_payment") {
      // Money was captured but the order was released meanwhile: needs a manual refund.
      log.error("paypal captured for an order no longer awaiting payment", {
        requestId,
        orderId: o.id,
        status: current.status,
        captureId: capture.captureId,
      });
      throw bad("This order was cancelled before payment completed. Please contact us for a refund.", 409);
    }
    await c.query(
      "UPDATE orders SET payment_status='paid',status='placed',paypal_capture_id=$1,updated_at=now() WHERE id=$2",
      [capture.captureId, o.id],
    );
    await addHistory(c, o.id, "placed", "PayPal payment captured", "system");
    const user = (await c.query("SELECT email,phone FROM users WHERE id=$1", [current.user_id])).rows[0];
    const recipient = user?.email || user?.phone;
    if (recipient)
      await c.query(
        "INSERT INTO notification_outbox(user_id,order_id,channel,template,recipient,payload) VALUES($1,$2,$3,'order_confirmed',$4,$5)",
        [current.user_id, o.id, user.email ? "email" : "sms", recipient, JSON.stringify({ orderNumber: current.order_number })],
      );
    if (current.coupon_code) {
      const cp = (
        await c.query("SELECT id FROM coupons WHERE upper(code)=upper($1)", [current.coupon_code])
      ).rows[0];
      if (cp) {
        await c.query(
          "INSERT INTO coupon_redemptions(coupon_id,user_id,order_id) VALUES($1,$2,$3) ON CONFLICT(order_id) DO NOTHING",
          [cp.id, current.user_id, o.id],
        );
        await c.query(
          "UPDATE coupons SET used_count=(SELECT count(*) FROM coupon_redemptions WHERE coupon_id=$1) WHERE id=$1",
          [cp.id],
        );
      }
    }
    log.info("order paid", {
      requestId,
      orderId: o.id,
      orderNumber: current.order_number,
      captureId: capture.captureId,
      amount: capture.amount,
    });
    return { orderNumber: current.order_number };
  });
}

// ---- customer cancellation --------------------------------------------------

// Paid PayPal orders are refunded through PayPal; stock is restored once.
export async function cancelOrder(input: { orderNumber: string; userId: number; requestId?: string }) {
  const { orderNumber, userId, requestId } = input;
  // 1. Validate and, for a paid PayPal order, mark the refund as pending.
  const o = await transaction(async (c) => {
    const order = (
      await c.query("SELECT * FROM orders WHERE order_number=$1 AND user_id=$2 FOR UPDATE", [orderNumber, userId])
    ).rows[0];
    if (!order) throw bad("Order not found.", 404);
    if (!["placed", "processing"].includes(order.status))
      throw bad("This order can no longer be cancelled.", 409);
    if (order.payment_method === "paypal" && order.payment_status === "paid" && order.paypal_capture_id)
      await c.query("UPDATE orders SET refund_status='pending',updated_at=now() WHERE id=$1", [order.id]);
    return order;
  });
  const needsRefund =
    o.payment_method === "paypal" && o.payment_status === "paid" && o.paypal_capture_id;

  // 2. Refund outside any transaction (idempotent per order via the request id).
  let refundId: string | undefined;
  if (needsRefund) {
    try {
      ({ refundId } = await refundPayPalCapture(
        o.paypal_capture_id,
        (o.total_cents / 100).toFixed(2),
        o.id + "-refund",
      ));
    } catch (error) {
      await q("UPDATE orders SET refund_status='failed',updated_at=now() WHERE id=$1", [o.id]);
      throw error;
    }
  }

  // 3. Record the cancellation; a concurrent request may already have done so.
  await transaction(async (c) => {
    const current = (await c.query("SELECT status FROM orders WHERE id=$1 FOR UPDATE", [o.id])).rows[0];
    if (current.status === "cancelled") return;
    if (needsRefund)
      await c.query(
        "UPDATE orders SET payment_status='refunded',refund_status='completed',refund_amount_cents=total_cents,refunded_at=now() WHERE id=$1",
        [o.id],
      );
    await restoreStock(c, o.id);
    await c.query("UPDATE orders SET status='cancelled',cancelled_at=now(),updated_at=now() WHERE id=$1", [o.id]);
    await addHistory(c, o.id, "cancelled", refundId ? "PayPal refund " + refundId : "Customer cancellation", "customer");
    await c.query(
      "INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id) VALUES('customer',$1,'cancel_order','order',$2)",
      [String(userId), String(o.id)],
    );
  });
  log.info("order cancelled by customer", { requestId, orderId: o.id, orderNumber: o.order_number, refundId });
  return { refunded: Boolean(refundId) };
}

// ---- storefront order shapes ------------------------------------------------

const ITEM_SELECT =
  "SELECT i.*,p.slug,p.stone,p.kind FROM order_items i LEFT JOIN products p ON p.id=i.product_id";

function toOrder(o: any, items: any[]) {
  return {
    id: o.order_number,
    createdAt: o.created_at,
    total: o.total_cents / 100,
    status: o.status.replace(/_/g, " "),
    subtotal: o.subtotal_cents / 100,
    shipping: o.shipping_cents / 100,
    discount: o.discount_cents / 100,
    paymentStatus: o.payment_status,
    paymentMethod: o.payment_method,
    shippingAddress: o.shipping_address,
    paypalOrderId: o.paypal_order_id,
    paypalCaptureId: o.paypal_capture_id,
    items: items.map((i) => ({
      qty: i.quantity,
      product: {
        slug: i.slug || "",
        name: i.product_name,
        image: i.image_url,
        price: "$" + (i.unit_price_cents / 100).toLocaleString("en-US"),
        stone: i.stone || "",
        note: "",
        description: "",
        kind: i.kind,
      },
    })),
  };
}

export async function listOrders(userId: number) {
  const orders = (
    await q("SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC", [userId])
  ).rows;
  if (!orders.length) return [];
  // One query for every order's lines instead of one query per order.
  const items = (
    await q(ITEM_SELECT + " WHERE i.order_id = ANY($1) ORDER BY i.id", [orders.map((o) => o.id)])
  ).rows;
  return orders.map((o) => toOrder(o, items.filter((i) => String(i.order_id) === String(o.id))));
}

export async function getOrder(orderNumber: string, userId: number) {
  const o = (
    await q("SELECT * FROM orders WHERE order_number=$1 AND user_id=$2", [orderNumber, userId])
  ).rows[0];
  if (!o) throw bad("Order not found.", 404);
  const [items, history] = await Promise.all([
    q(ITEM_SELECT + " WHERE order_id=$1 ORDER BY i.id", [o.id]),
    q("SELECT status,note,actor,created_at FROM order_status_history WHERE order_id=$1 ORDER BY created_at", [o.id]),
  ]);
  return { ...toOrder(o, items.rows), history: history.rows };
}
