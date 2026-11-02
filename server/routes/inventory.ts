import { shipWebsiteItems } from "../inventory/shipments.js";
import { updateFulfillment } from "../services/orders.js";
import { syncWebsiteOrder } from "../inventory/website.js";
import { ensureInventorySchema } from "../inventory/schema.js";
import express from "express";
import { randomBytes, createHash } from "node:crypto";
import { pool, q } from "../lib/db.js";
import { bad } from "../lib/errors.js";
import { adminAuthService, adminRepository } from "../auth/admin/index.js";
import { hashToken } from "../auth/admin/cookies.js";
import { clientIp } from "../lib/http.js";
import { move } from "../inventory/stock.js";
import * as etsy from "../inventory/etsy.js";
const router = express.Router();
router.use(async (_req, _res, next) => {
  await ensureInventorySchema();
  next();
});
const cookie = "crysmona_inventory";
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/api/inventory",
};
function session(req: express.Request) {
  const token = (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(cookie + "="))
    ?.slice(cookie.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? hashToken(token) : "";
}
router.post("/auth/login", async (req, res) => {
  const result = await adminAuthService.login(
    req.body,
    clientIp(req),
    undefined,
  );
  try {
    const account = await adminRepository.findByEmail(result.email);
    await q(
      "INSERT INTO inv_sessions(token_hash,admin_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",
      [hashToken(result.token), account!.id],
    );
  } finally {
    await adminRepository.deleteSession(hashToken(result.token));
  }
  res.cookie(cookie, result.token, { ...cookieOptions, maxAge: 8 * 3600000 });
  res.json({ email: result.email });
});
router.use(async (req, _res, next) => {
  const row = (
    await q(
      "SELECT a.id,a.email FROM inv_sessions s JOIN admin_accounts a ON a.id=s.admin_id WHERE s.token_hash=$1 AND s.expires_at>now() AND a.active=true",
      [session(req)],
    )
  ).rows[0];
  if (!row) throw bad("Sign in to inventory.", 401);
  req.adminAccount = row;
  next();
});
router.get("/auth/me", (req, res) => res.json(req.adminAccount));
router.post("/auth/logout", async (req, res) => {
  await q("DELETE FROM inv_sessions WHERE token_hash=$1", [session(req)]);
  res.clearCookie(cookie, cookieOptions);
  res.json({ ok: true });
});
function text(value: unknown, max = 180) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw bad(`Enter text of 1–${max} characters.`);
  return value.trim();
}
function integer(value: unknown) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0 || n > 1000000)
    throw bad("Enter a valid nonnegative whole number.");
  return n;
}
router.get("/data", async (_req, res) => {
  const [items, mappings, orders, movements, history, products, integrations] =
    await Promise.all([
      q(
        `SELECT i.*,i.physical-i.reserved available,p.description,p.image_url,COALESCE((SELECT json_agg(json_build_object('channel',m.channel,'sku',m.external_sku) ORDER BY m.channel,m.external_sku) FROM inv_mappings m WHERE m.item_id=i.id),'[]'::json) channel_skus FROM inv_items i LEFT JOIN products p ON p.id=i.product_id ORDER BY i.id DESC`,
      ),
      q(
        "SELECT m.*,i.sku FROM inv_mappings m JOIN inv_items i ON i.id=m.item_id ORDER BY m.id DESC",
      ),
      q(`SELECT o.*,w.id website_order_id,w.status website_status,w.payment_status,w.payment_method,
        CASE WHEN o.channel='website' THEN COALESCE((SELECT json_agg(json_build_object('order_item_id',oi.id,'item_id',wl.item_id,'sku',oi.sku,'name',oi.product_name,'quantity',oi.quantity,'shipped_quantity',COALESCE(wl.shipped_quantity,CASE WHEN o.status='shipped' THEN oi.quantity ELSE 0 END),'remaining',oi.quantity-COALESCE(wl.shipped_quantity,CASE WHEN o.status='shipped' THEN oi.quantity ELSE 0 END)) ORDER BY oi.id) FROM order_items oi LEFT JOIN inv_website_lines wl ON wl.order_item_id=oi.id WHERE oi.order_id=w.id),'[]'::json)
        ELSE COALESCE((SELECT json_agg(json_build_object('sku',i.sku,'name',i.name,'quantity',l.quantity,'shipped_quantity',l.shipped_quantity,'remaining',l.quantity-l.shipped_quantity) ORDER BY l.item_id) FROM inv_order_lines l JOIN inv_items i ON i.id=l.item_id WHERE l.order_id=o.id),'[]'::json) END items,
        COALESCE((SELECT json_agg(json_build_object('id',s.id,'carrier',s.carrier,'tracking_number',s.tracking_number,'created_at',s.created_at,'lines',(SELECT json_agg(json_build_object('sku',oi.sku,'quantity',sl.quantity)) FROM inv_shipment_lines sl JOIN order_items oi ON oi.id=sl.order_item_id WHERE sl.shipment_id=s.id)) ORDER BY s.id DESC) FROM inv_shipments s WHERE s.order_id=o.id),'[]'::json) shipments
        FROM inv_orders o LEFT JOIN orders w ON o.channel='website' AND w.order_number=o.external_id ORDER BY o.id DESC LIMIT 200`),
      q(
        "SELECT m.*,i.sku FROM inv_movements m JOIN inv_items i ON i.id=m.item_id ORDER BY m.id DESC LIMIT 200",
      ),
      q("SELECT * FROM inv_sync_history ORDER BY id DESC LIMIT 100"),
      q("SELECT id,sku,name FROM products ORDER BY name"),
      q("SELECT shop_id,expires_at FROM inv_integrations"),
    ]);
  res.json({
    items: items.rows,
    mappings: mappings.rows,
    orders: orders.rows,
    movements: movements.rows,
    history: history.rows,
    products: products.rows,
    integrations: integrations.rows,
  });
});
router.get("/dashboard", async (_req, res) => {
  const [stock, orders, shipments, activity] = await Promise.all([
    q(
      `SELECT count(*)::int skus,COALESCE(sum(physical),0)::int physical,COALESCE(sum(reserved),0)::int reserved,COALESCE(sum(physical-reserved),0)::int available,count(*) FILTER(WHERE physical-reserved=0)::int out_of_stock,count(*) FILTER(WHERE physical-reserved>0 AND physical-reserved<=reorder_level)::int low_stock FROM inv_items WHERE archived=false`,
    ),
    q(
      `SELECT count(*) FILTER(WHERE status IN ('placed','processing'))::int awaiting_shipment,count(*) FILTER(WHERE status='partially_shipped')::int partial,count(*) FILTER(WHERE status='awaiting_payment')::int awaiting_payment,count(*) FILTER(WHERE status='shipped')::int in_transit,count(*) FILTER(WHERE status='delivered')::int delivered FROM orders WHERE status<>'draft'`,
    ),
    q(
      `SELECT count(*) FILTER(WHERE created_at>=date_trunc('day',now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')::int today FROM inv_shipments`,
    ),
    q(
      `SELECT date_trunc('day',created_at AT TIME ZONE 'Asia/Kolkata')::date::text AS "day",COALESCE(sum(GREATEST(physical_delta,0)),0)::int received,COALESCE(sum(GREATEST(-physical_delta,0)),0)::int dispatched FROM inv_movements WHERE created_at>=now()-interval '7 days' GROUP BY 1 ORDER BY 1`,
    ),
  ]);
  res.json({
    stock: stock.rows[0],
    orders: orders.rows[0],
    shipments: shipments.rows[0],
    activity: activity.rows,
  });
});
router.post("/orders/:id/shipments", async (req, res) =>
  res
    .status(201)
    .json(
      await shipWebsiteItems(
        integer(req.params.id),
        req.body,
        req.adminAccount!.email,
      ),
    ),
);
router.post("/orders/:id/fulfillment", async (req, res) => {
  const order = (
    await q(
      "SELECT w.id FROM inv_orders i JOIN orders w ON i.channel='website' AND i.external_id=w.order_number WHERE i.id=$1",
      [integer(req.params.id)],
    )
  ).rows[0];
  if (!order)
    throw bad(
      "Only website orders can be fulfilled here. Update Etsy shipments on Etsy, then sync.",
      404,
    );
  if (!["processing", "shipped", "delivered"].includes(req.body.status))
    throw bad("Choose processing, shipped or delivered.");
  res.json(
    await updateFulfillment(
      String(order.id),
      req.body.status,
      String(req.adminAccount!.id),
    ),
  );
});
router.post("/items", async (req, res) => {
  const b = req.body;
  const result = await q(
    "INSERT INTO inv_items(sku,name,product_id,reorder_level,location) VALUES($1,$2,$3,$4,$5) RETURNING *",
    [
      text(b.sku, 100),
      text(b.name),
      b.product_id ? integer(b.product_id) : null,
      integer(b.reorder_level ?? 5),
      typeof b.location === "string" ? b.location.slice(0, 120) : "",
    ],
  );
  res.status(201).json(result.rows[0]);
});
// Metadata can be edited; quantity changes must go through the stock ledger.
router.put("/items/:id", async (req, res) => {
  const b = req.body;
  const result = await q(
    `UPDATE inv_items SET sku=$2,name=$3,location=$4,reorder_level=$5 WHERE id=$1 RETURNING *`,
    [
      integer(req.params.id),
      text(b.sku, 100),
      text(b.name),
      typeof b.location === "string" ? b.location.slice(0, 120) : "",
      integer(b.reorder_level),
    ],
  );
  if (!result.rowCount) throw bad("Inventory item not found.", 404);
  res.json(result.rows[0]);
});
router.patch("/items/:id/archive", async (req, res) => {
  if (typeof req.body.archived !== "boolean")
    throw bad("Choose archive or restore.");
  const result = await q(
    "UPDATE inv_items SET archived=$2 WHERE id=$1 AND (reserved=0 OR $2=false) RETURNING *",
    [integer(req.params.id), req.body.archived],
  );
  if (!result.rowCount)
    throw bad(
      "Item is missing or has reservations. Fulfill or cancel open orders before archiving.",
      409,
    );
  res.json(result.rows[0]);
});
router.delete("/items/:id", async (req, res) => {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const id = integer(req.params.id);
    const item = (
      await c.query("SELECT * FROM inv_items WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!item) throw bad("Inventory item not found.", 404);
    if (item.product_id || item.physical || item.reserved)
      throw bad(
        "Only empty, unlinked items can be deleted. Archive this item instead.",
        409,
      );
    const used = await c.query(
      "SELECT 1 FROM inv_movements WHERE item_id=$1 UNION ALL SELECT 1 FROM inv_mappings WHERE item_id=$1 UNION ALL SELECT 1 FROM inv_order_lines WHERE item_id=$1 LIMIT 1",
      [id],
    );
    if (used.rowCount)
      throw bad(
        "This item has mappings or history. Archive it to preserve records.",
        409,
      );
    await c.query("DELETE FROM inv_items WHERE id=$1", [id]);
    await c.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
});
router.put("/mappings/:id", async (req, res) => {
  const b = req.body;
  if (!["website", "etsy"].includes(b.channel)) throw bad("Invalid channel.");
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const old = (
      await c.query("SELECT * FROM inv_mappings WHERE id=$1 FOR UPDATE", [
        integer(req.params.id),
      ])
    ).rows[0];
    if (!old) throw bad("Mapping not found.", 404);
    if (
      old.channel === "website" &&
      (b.channel !== old.channel ||
        text(b.external_sku, 100) !== old.external_sku) &&
      (await c.query("SELECT 1 FROM products WHERE sku=$1", [old.external_sku]))
        .rowCount
    )
      throw bad(
        "Change the website SKU in admin. This product mapping is automatic.",
        409,
      );
    const result = await c.query(
      "UPDATE inv_mappings SET item_id=$2,channel=$3,external_sku=$4,listing_id=$5 WHERE id=$1 RETURNING *",
      [
        old.id,
        integer(b.item_id),
        b.channel,
        text(b.external_sku, 100),
        b.listing_id ? text(b.listing_id, 100) : null,
      ],
    );
    await c.query("COMMIT");
    res.json(result.rows[0]);
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
});
router.delete("/mappings/:id", async (req, res) => {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const old = (
      await c.query("SELECT * FROM inv_mappings WHERE id=$1 FOR UPDATE", [
        integer(req.params.id),
      ])
    ).rows[0];
    if (!old) throw bad("Mapping not found.", 404);
    if (
      old.channel === "website" &&
      (await c.query("SELECT 1 FROM products WHERE sku=$1", [old.external_sku]))
        .rowCount
    )
      throw bad(
        "Website products are mapped automatically. Archive the inventory item to stop sales, or edit the mapping to select another item.",
        409,
      );
    await c.query("DELETE FROM inv_mappings WHERE id=$1", [old.id]);
    await c.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
});
router.post("/mappings", async (req, res) => {
  const b = req.body;
  if (!["website", "etsy"].includes(b.channel)) throw bad("Invalid channel.");
  res.json(
    (
      await q(
        "INSERT INTO inv_mappings(item_id,channel,external_sku,listing_id) VALUES($1,$2,$3,$4) ON CONFLICT(channel,external_sku) DO UPDATE SET item_id=excluded.item_id,listing_id=excluded.listing_id RETURNING *",
        [
          integer(b.item_id),
          b.channel,
          text(b.external_sku, 100),
          b.listing_id ? text(b.listing_id, 100) : null,
        ],
      )
    ).rows[0],
  );
});
router.post("/movements", async (req, res) => {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await move(
      c,
      integer(req.body.item_id),
      req.body.action,
      integer(req.body.quantity),
      text(req.body.reason, 500),
      req.adminAccount!.email,
    );
    await c.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
});
async function importOrder(
  channel: string,
  external: string,
  status: string,
  lines: { sku: string; quantity: number }[],
  actor: string,
) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      channel + external,
    ]);
    const existing = (
      await c.query(
        "SELECT * FROM inv_orders WHERE channel=$1 AND external_id=$2 FOR UPDATE",
        [channel, external],
      )
    ).rows[0];
    if (existing) {
      if (existing.status === "open" && status !== "open") {
        const saved = (
          await c.query(
            "SELECT * FROM inv_order_lines WHERE order_id=$1 ORDER BY item_id",
            [existing.id],
          )
        ).rows;
        for (const l of saved)
          await move(
            c,
            l.item_id,
            status === "shipped" ? "ship" : "release",
            l.quantity,
            `${channel} order ${external}: ${status}`,
            actor,
            `${channel}:${external}:${status}:${l.item_id}`,
          );
        await c.query("UPDATE inv_orders SET status=$2 WHERE id=$1", [
          existing.id,
          status,
        ]);
        if (status === "shipped")
          await c.query(
            "UPDATE inv_order_lines SET shipped_quantity=quantity WHERE order_id=$1",
            [existing.id],
          );
      }
      await c.query("COMMIT");
      return;
    }
    // Cancelled orders have no stock effect. Historical shipped orders consume physical stock once.
    if (status === "cancelled") {
      await c.query("COMMIT");
      return;
    }
    const mapped = new Map<number, number>();
    for (const line of lines) {
      const id = (
        await c.query(
          "SELECT item_id FROM inv_mappings WHERE channel=$1 AND external_sku=$2",
          [channel, line.sku],
        )
      ).rows[0]?.item_id;
      if (!id)
        throw bad(
          `Map ${channel} SKU ${line.sku || "(missing)"} before syncing order ${external}.`,
        );
      mapped.set(id, (mapped.get(id) || 0) + integer(line.quantity));
    }
    if (!mapped.size) throw bad(`Order ${external} has no stock lines.`);
    const order = (
      await c.query(
        "INSERT INTO inv_orders(channel,external_id,status) VALUES($1,$2,$3) RETURNING id",
        [channel, external, status],
      )
    ).rows[0];
    for (const [id, quantity] of [...mapped].sort((a, b) => a[0] - b[0])) {
      await move(
        c,
        id,
        status === "shipped" ? "remove" : "reserve",
        quantity,
        `${channel} order ${external}`,
        actor,
        `${channel}:${external}:import:${id}`,
      );
      await c.query(
        "INSERT INTO inv_order_lines(order_id,item_id,quantity,shipped_quantity) VALUES($1,$2,$3,$4)",
        [order.id, id, quantity, status === "shipped" ? quantity : 0],
      );
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
router.post("/sync/:channel", async (req, res) => {
  const channel = String(req.params.channel);
  if (!["website", "etsy"].includes(channel)) throw bad("Invalid channel.");
  let count = 0;
  try {
    if (channel === "website") {
      const orders = (
        await q(
          "SELECT id,order_number,status FROM orders WHERE status<>'draft' ORDER BY id",
        )
      ).rows;
      for (const order of orders) {
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          await syncWebsiteOrder(c, order.id, req.adminAccount!.email);
          await c.query("COMMIT");
        } catch (error) {
          await c.query("ROLLBACK");
          throw error;
        } finally {
          c.release();
        }
        count++;
      }
    } else {
      for (const order of await etsy.receipts()) {
        if (!order.is_paid && !order.is_canceled) continue;
        await importOrder(
          channel,
          String(order.receipt_id),
          order.is_canceled
            ? "cancelled"
            : order.is_shipped
              ? "shipped"
              : "open",
          (order.transactions || []).map((t: any) => ({
            sku: t.sku,
            quantity: t.quantity,
          })),
          req.adminAccount!.email,
        );
        count++;
      }
    }
    await q(
      "INSERT INTO inv_sync_history(channel,status,message) VALUES($1,$2,$3)",
      [channel, "success", `${count} orders checked`],
    );
    res.json({ count });
  } catch (e) {
    await q(
      "INSERT INTO inv_sync_history(channel,status,message) VALUES($1,$2,$3)",
      [channel, "failed", e instanceof Error ? e.message : "Sync failed"],
    );
    throw e;
  }
});
router.get("/etsy/connect", async (req, res) => {
  const cfg = etsy.config();
  const state = randomBytes(32).toString("hex"),
    verifier = randomBytes(32).toString("base64url");
  await q("DELETE FROM inv_oauth_states WHERE expires_at<now()");
  await q(
    "INSERT INTO inv_oauth_states(state,verifier,session_hash,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')",
    [state, verifier, session(req)],
  );
  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.client,
    redirect_uri: cfg.redirect,
    scope: "transactions_r",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  });
  res.redirect("https://www.etsy.com/oauth/connect?" + params);
});
router.get("/etsy/callback", async (req, res) => {
  const state = (
    await q(
      "DELETE FROM inv_oauth_states WHERE state=$1 AND session_hash=$2 AND expires_at>now() RETURNING verifier",
      [req.query.state, session(req)],
    )
  ).rows[0];
  if (!state || typeof req.query.code !== "string")
    throw bad("Etsy authorization expired. Connect again.");
  const shop = process.env.ETSY_SHOP_ID;
  if (!shop || !/^\d+$/.test(shop)) throw bad("Configure ETSY_SHOP_ID.", 503);
  const data = await etsy.tokens({
    grant_type: "authorization_code",
    code: req.query.code,
    redirect_uri: etsy.config().redirect,
    code_verifier: state.verifier,
  });
  await etsy.save(shop, data);
  res.redirect("/inventory/integrations");
});
router.post("/etsy/disconnect", async (_req, res) => {
  await q("DELETE FROM inv_integrations");
  res.json({ ok: true });
});
export default router;
