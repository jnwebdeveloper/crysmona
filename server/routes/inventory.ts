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
        "SELECT i.*,i.physical-i.reserved available,p.description,p.image_url FROM inv_items i LEFT JOIN products p ON p.id=i.product_id ORDER BY i.id DESC",
      ),
      q(
        "SELECT m.*,i.sku FROM inv_mappings m JOIN inv_items i ON i.id=m.item_id ORDER BY m.id DESC",
      ),
      q("SELECT * FROM inv_orders ORDER BY id DESC LIMIT 200"),
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
        "INSERT INTO inv_order_lines(order_id,item_id,quantity) VALUES($1,$2,$3)",
        [order.id, id, quantity],
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
          "SELECT id,order_number,status FROM orders WHERE payment_status='paid' OR status='cancelled' ORDER BY id",
        )
      ).rows;
      for (const order of orders) {
        const lines = (
          await q(
            "SELECT sku,quantity FROM order_items WHERE order_id=$1 ORDER BY id",
            [order.id],
          )
        ).rows;
        await importOrder(
          channel,
          order.order_number,
          order.status === "cancelled"
            ? "cancelled"
            : ["shipped", "delivered", "completed"].includes(order.status)
              ? "shipped"
              : "open",
          lines,
          req.adminAccount!.email,
        );
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
