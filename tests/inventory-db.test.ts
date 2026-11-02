import { test } from "node:test";
import assert from "node:assert/strict";
import app from "../server/app.js";
import { pool, q } from "../server/lib/db.js";
// Explicit opt-in: run only against an isolated database created for testing.
test(
  "inventory API: isolation, reservations, order transitions and idempotent sync",
  { skip: process.env.INV_TEST_DATABASE !== "1" },
  async () => {
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) =>
      server.once("listening", () => resolve()),
    );
    const address = server.address() as any;
    const base = `http://127.0.0.1:${address.port}/api/inventory`;
    let cookie = "";
    async function request(path: string, body?: unknown, expected = 200) {
      const r = await fetch(base + path, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (r.headers.get("set-cookie"))
        cookie = r.headers.get("set-cookie")!.split(";")[0];
      const data = await r.json();
      assert.equal(r.status, expected, JSON.stringify(data));
      return data;
    }
    let item: number | undefined, order: number | undefined;
    try {
      await request("/data", undefined, 401);
      await request("/auth/login", {
        email: "admin@crysmona.com",
        password: "CrysmonaAdmin@2026",
      });
      const sku = "INV-TEST-" + Date.now();
      item = (
        await request(
          "/items",
          { sku, name: "Inventory test", reorder_level: 2 },
          201,
        )
      ).id;
      await request("/movements", {
        item_id: item,
        action: "receive",
        quantity: 10,
        reason: "Opening stock",
      });
      await request(
        "/movements",
        { item_id: item, action: "reserve", quantity: 11, reason: "Oversell" },
        400,
      );
      await request("/mappings", {
        item_id: item,
        channel: "website",
        external_sku: sku,
      });
      const product = (await q("SELECT id,stock_qty FROM products LIMIT 1"))
        .rows[0];
      const number = "INV-TEST-" + Date.now();
      order = (
        await q(
          "INSERT INTO orders(order_number,payment_status,subtotal_cents,total_cents) VALUES($1,'paid',100,100) RETURNING id",
          [number],
        )
      ).rows[0].id;
      await q(
        "INSERT INTO order_items(order_id,product_id,product_name,sku,unit_price_cents,quantity) VALUES($1,$2,$3,$4,100,3)",
        [order, product.id, "Test", sku],
      );
      await request("/sync/website", {});
      await request("/sync/website", {});
      let current = (
        await q("SELECT physical,reserved FROM inv_items WHERE id=$1", [item])
      ).rows[0];
      assert.deepEqual(current, { physical: 10, reserved: 3 });
      await q("UPDATE orders SET status='shipped' WHERE id=$1", [order]);
      await request("/sync/website", {});
      await request("/sync/website", {});
      current = (
        await q("SELECT physical,reserved FROM inv_items WHERE id=$1", [item])
      ).rows[0];
      assert.deepEqual(current, { physical: 7, reserved: 0 });
      assert.equal(
        (await q("SELECT stock_qty FROM products WHERE id=$1", [product.id]))
          .rows[0].stock_qty,
        product.stock_qty,
      );
      assert.equal(
        (
          await q(
            "SELECT count(*)::int n FROM inv_movements WHERE item_id=$1",
            [item],
          )
        ).rows[0].n,
        3,
      );
      await request(
        "/movements",
        {
          item_id: item,
          action: "release",
          quantity: 1,
          reason: "Invalid release",
        },
        400,
      );
      await request("/movements", {
        item_id: item,
        action: "reserve",
        quantity: 2,
        reason: "Manual hold",
      });
      await request("/movements", {
        item_id: item,
        action: "release",
        quantity: 2,
        reason: "Manual release",
      });
      await request("/auth/logout", {});
      await request("/data", undefined, 401);
    } finally {
      if (order) {
        await q("DELETE FROM order_items WHERE order_id=$1", [order]);
        await q("DELETE FROM orders WHERE id=$1", [order]);
      }
      if (item) {
        await q("DELETE FROM inv_order_lines WHERE item_id=$1", [item]);
        await q("DELETE FROM inv_orders WHERE external_id LIKE $1", [
          "INV-TEST-%",
        ]);
        await q("DELETE FROM inv_movements WHERE item_id=$1", [item]);
        await q("DELETE FROM inv_mappings WHERE item_id=$1", [item]);
        await q("DELETE FROM inv_items WHERE id=$1", [item]);
      }
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      await pool.end();
    }
  },
);
