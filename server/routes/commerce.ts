import express from "express";
import crypto from "node:crypto";
import { bad, customer, pool, q } from "../core.js";
const app = express.Router();
async function quote(items: any[], coupon: string, client: any = pool) {
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
  for (const [slug, qty] of [...grouped].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
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
  const config = Object.fromEntries(
    settings.rows.map((r: any) => [r.key, r.value]),
  );
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
      throw bad(
        "This discount code is unavailable or the minimum order is not met.",
      );
    discount = Math.min(
      subtotal,
      c.discount_type === "percent"
        ? Math.round((subtotal * c.discount_value) / 100)
        : c.discount_value,
    );
  }
  return {
    subtotal,
    shipping,
    discount,
    total: subtotal + shipping - discount,
    lines,
  };
}
app.post("/api/checkout/quote", async (req, res) => {
  const result = await quote(req.body.items, req.body.coupon || "");
  res.json({ ...result, lines: undefined });
});
export const paypalReady = () =>
  Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
app.get("/api/paypal/config", (_req, res) =>
  res.json({
    available: paypalReady(),
    currency: "USD",
    sandbox: process.env.PAYPAL_ENV !== "live",
  }),
);
async function paypal(path: string, body: any, requestId?: string) {
  if (!paypalReady())
    throw bad("PayPal is not configured. Please choose cash on delivery.", 503);
  const base =
    process.env.PAYPAL_ENV === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";
  const tokenResponse = await fetch(base + "/v1/oauth2/token", {
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
  if (!tokenResponse.ok)
    throw bad("PayPal could not connect. Please try again later.", 502);
  const token: any = await tokenResponse.json();
  const response = await fetch(base + path, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token.access_token,
      "Content-Type": "application/json",
      "PayPal-Request-Id": requestId || crypto.randomUUID(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const data: any = await response.json();
  if (!response.ok)
    throw bad(
      "PayPal could not complete this request. Please retry or choose another payment method.",
      502,
    );
  return data;
}
async function releaseOrder(id: string, userId: string) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const { rows } = await c.query(
      "SELECT * FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [id, userId],
    );
    const order = rows[0];
    if (order?.status === "awaiting_payment") {
      const lines = await c.query(
        "SELECT product_id,quantity FROM order_items WHERE order_id=$1",
        [id],
      );
      for (const l of lines.rows)
        await c.query(
          "UPDATE products SET stock_qty=stock_qty+$1 WHERE id=$2",
          [l.quantity, l.product_id],
        );
      await c.query(
        "UPDATE orders SET status='cancelled',payment_status='failed' WHERE id=$1",
        [id],
      );
    }
    await c.query("INSERT INTO order_status_history(order_id,status,note,actor) VALUES($1,$2,$3,'system')",[order.id,order.status,"Order created"]);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
app.post("/api/orders", customer, async (req: any, res) => {
  const { items, address, paymentMethod, coupon } = req.body;
  if (!["cod", "paypal"].includes(paymentMethod))
    throw bad("Choose a supported payment method.");
  if (paymentMethod === "paypal" && !paypalReady())
    throw bad("PayPal is not configured yet.", 503);
  for (const field of [
    "name",
    "email",
    "line1",
    "city",
    "postal_code",
    "country",
  ])
    if (!String(address?.[field] || "").trim())
      throw bad("Complete your contact and delivery address.");
  const c = await pool.connect();
  let order: any;
  try {
    await c.query("BEGIN");
    const result = await quote(items, coupon || "", c);
    for (const l of result.lines) {
      const r = await c.query(
        "UPDATE products SET stock_qty=stock_qty-$1 WHERE id=$2 AND stock_qty>=$1",
        [l.qty, l.product.id],
      );
      if (!r.rowCount) throw bad("Stock changed. Please update your bag.");
    }
    const number = "CRY-" + crypto.randomBytes(6).toString("hex").toUpperCase();
    const amount =
      paymentMethod === "paypal" ? (result.total / 100).toFixed(2) : null;
    const r = await c.query(
      "INSERT INTO orders(order_number,user_id,status,payment_status,payment_method,subtotal_cents,shipping_cents,discount_cents,total_cents,shipping_address,paypal_amount,coupon_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *",
      [
        number,
        req.customer.id,
        paymentMethod === "paypal" ? "awaiting_payment" : "placed",
        "pending",
        paymentMethod,
        result.subtotal,
        result.shipping,
        result.discount,
        result.total,
        JSON.stringify(address),
        amount,
        coupon || null,
      ],
    );
    order = r.rows[0];
    for (const l of result.lines)
      await c.query(
        "INSERT INTO order_items(order_id,product_id,product_name,sku,unit_price_cents,quantity,image_url) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          order.id,
          l.product.id,
          l.product.name,
          l.product.sku,
          l.product.price_cents,
          l.qty,
          l.product.image_url,
        ],
      );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  if (paymentMethod === "paypal") {
    try {
      const origin = process.env.WEB_ORIGIN || "http://localhost:5173";
      const result = await paypal(
        "/v2/checkout/orders",
        {
          intent: "CAPTURE",
          purchase_units: [
            {
              reference_id: String(order.id),
              custom_id: String(order.id),
              amount: { currency_code: "USD", value: order.paypal_amount },
            },
          ],
          payment_source: {
            paypal: {
              experience_context: {
                return_url: origin + "/checkout/paypal?reference=" + order.id,
                cancel_url:
                  origin + "/checkout/paypal?cancel=1&reference=" + order.id,
                user_action: "PAY_NOW",
                shipping_preference: "NO_SHIPPING",
              },
            },
          },
        },
        String(order.id),
      );
      const redirect = result.links?.find(
        (l: any) => l.rel === "payer-action" || l.rel === "approve",
      )?.href;
      if (!redirect) throw bad("PayPal did not return an approval link.", 502);
      await q("UPDATE orders SET paypal_order_id=$1 WHERE id=$2", [
        result.id,
        order.id,
      ]);
      return res.status(201).json({ redirect, reference: order.id });
    } catch (e) {
      await releaseOrder(order.id, req.customer.id);
      throw e;
    }
  }
  res.status(201).json({
    id: order.id,
    orderNumber: order.order_number,
    total: order.total_cents / 100,
    status: "Order placed",
    createdAt: order.created_at,
  });
});
app.post("/api/paypal/cancel", customer, async (req: any, res) => {
  await releaseOrder(String(req.body.reference), req.customer.id);
  res.json({ ok: true });
});
app.post("/api/paypal/capture", customer, async (req: any, res) => {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const { rows } = await c.query(
      "SELECT * FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.body.reference, req.customer.id],
    );
    const o = rows[0];
    if (!o || o.paypal_order_id !== req.body.token)
      throw bad("This payment does not belong to your order.", 403);
    if (o.payment_status === "paid") {
      await c.query("COMMIT");
      return res.json({ ok: true, orderNumber: o.order_number });
    }
    if (o.status !== "awaiting_payment")
      throw bad("This order is no longer awaiting payment.");
    const result = await paypal(
      "/v2/checkout/orders/" +
        encodeURIComponent(o.paypal_order_id) +
        "/capture",
      {},
      o.id + "-capture",
    );
    const capture = result.purchase_units?.[0]?.payments?.captures?.[0];
    if (
      result.status !== "COMPLETED" ||
      capture?.status !== "COMPLETED" ||
      capture.amount?.currency_code !== "USD" ||
      capture.amount?.value !== o.paypal_amount
    )
      throw bad(
        "Payment is not yet confirmed. Please retry confirmation.",
        409,
      );
    await c.query(
      "UPDATE orders SET payment_status='paid',status='placed',paypal_capture_id=$1,updated_at=now() WHERE id=$2",
      [capture.id, o.id],
    );
    await c.query("INSERT INTO order_status_history(order_id,status,note,actor) VALUES($1,'placed','PayPal payment captured','system')",[o.id]);
    const user=(await c.query("SELECT email,phone FROM users WHERE id=$1",[o.user_id])).rows[0];
    const recipient=user?.email||user?.phone; if(recipient) await c.query("INSERT INTO notification_outbox(user_id,order_id,channel,template,recipient,payload) VALUES($1,$2,$3,'order_confirmed',$4,$5)",[o.user_id,o.id,user.email?'email':'sms',recipient,JSON.stringify({orderNumber:o.order_number})]);
    if(o.coupon_code){const cp=(await c.query("SELECT id FROM coupons WHERE upper(code)=upper($1)",[o.coupon_code])).rows[0];if(cp){await c.query("INSERT INTO coupon_redemptions(coupon_id,user_id,order_id) VALUES($1,$2,$3) ON CONFLICT(order_id) DO NOTHING",[cp.id,o.user_id,o.id]);await c.query("UPDATE coupons SET used_count=(SELECT count(*) FROM coupon_redemptions WHERE coupon_id=$1) WHERE id=$1",[cp.id])}}
    await c.query("COMMIT");
    res.json({ ok: true, orderNumber: o.order_number });
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
});
app.get("/api/orders/:orderNumber", customer, async (req: any, res) => {
  const { rows } = await q("SELECT * FROM orders WHERE order_number=$1 AND user_id=$2", [req.params.orderNumber, req.customer.id]);
  const o = rows[0];
  if (!o) throw bad("Order not found.", 404);
  const lines = await q("SELECT i.*,p.slug,p.stone,p.kind FROM order_items i LEFT JOIN products p ON p.id=i.product_id WHERE order_id=$1 ORDER BY i.id", [o.id]);
  const history=(await q("SELECT status,note,actor,created_at FROM order_status_history WHERE order_id=$1 ORDER BY created_at",[o.id])).rows;
  res.json({
    id:o.order_number, createdAt:o.created_at, total:o.total_cents/100, subtotal:o.subtotal_cents/100, shipping:o.shipping_cents/100, discount:o.discount_cents/100,
    status:o.status.replace(/_/g," "), history, paymentStatus:o.payment_status, paymentMethod:o.payment_method, shippingAddress:o.shipping_address, paypalOrderId:o.paypal_order_id, paypalCaptureId:o.paypal_capture_id,
    items:lines.rows.map(i=>({qty:i.quantity,product:{slug:i.slug||"",name:i.product_name,image:i.image_url,price:"$"+(i.unit_price_cents/100).toLocaleString("en-US"),stone:i.stone||"",note:"",description:"",kind:i.kind}}))
  });
});
app.get("/api/orders", customer, async (req: any, res) => {
  const { rows } = await q(
    "SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC",
    [req.customer.id],
  );
  const out = [];
  for (const o of rows) {
    const lines = await q(
      "SELECT i.*,p.slug,p.stone,p.kind FROM order_items i LEFT JOIN products p ON p.id=i.product_id WHERE order_id=$1",
      [o.id],
    );
    out.push({
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
      items: lines.rows.map((i) => ({
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
    });
  }
  res.json(out);
});


// Customer cancellation. Paid PayPal orders are refunded through PayPal; inventory is restored once.
app.post("/api/orders/:orderNumber/cancel", customer, async (req:any,res) => {
  const c=await pool.connect();
  try {
    await c.query("BEGIN");
    const o=(await c.query("SELECT * FROM orders WHERE order_number=$1 AND user_id=$2 FOR UPDATE",[req.params.orderNumber,req.customer.id])).rows[0];
    if(!o) throw bad("Order not found.",404);
    if(!["placed","processing"].includes(o.status)) throw bad("This order can no longer be cancelled.",409);
    let refund:any=null;
    if(o.payment_method==="paypal" && o.payment_status==="paid" && o.paypal_capture_id){
      refund=await paypal("/v2/payments/captures/"+encodeURIComponent(o.paypal_capture_id)+"/refund",{amount:{value:(o.total_cents/100).toFixed(2),currency_code:"USD"}},o.id+"-refund");
      await c.query("UPDATE orders SET payment_status='refunded',refund_status='completed',refund_amount_cents=total_cents,refunded_at=now() WHERE id=$1",[o.id]);
    }
    const lines=(await c.query("SELECT product_id,quantity FROM order_items WHERE order_id=$1",[o.id])).rows;
    for(const l of lines) if(l.product_id) await c.query("UPDATE products SET stock_qty=stock_qty+$1 WHERE id=$2",[l.quantity,l.product_id]);
    await c.query("UPDATE orders SET status='cancelled',cancelled_at=now(),updated_at=now() WHERE id=$1",[o.id]);
    await c.query("INSERT INTO order_status_history(order_id,status,note,actor) VALUES($1,'cancelled',$2,'customer')",[o.id,refund?.id?"PayPal refund "+refund.id:"Customer cancellation"]);
    await c.query("INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id) VALUES('customer',$1,'cancel_order','order',$2)",[String(req.customer.id),String(o.id)]);
    await c.query("COMMIT"); res.json({ok:true,refunded:Boolean(refund)});
  } catch(e){await c.query("ROLLBACK");throw e} finally{c.release()}
});

export default app;
