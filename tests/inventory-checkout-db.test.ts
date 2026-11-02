import { test } from "node:test";
import assert from "node:assert/strict";
import app from "../server/app.js";
import { pool, q } from "../server/lib/db.js";
import { ensureInventorySchema } from "../server/inventory/schema.js";
import {
  placeOrder,
  cancelOrder,
  quote,
  updateFulfillment,
  releaseUnpaidOrder,
} from "../server/services/orders.js";

test(
  "inventory drives website availability, atomic order creation and fulfillment",
  { skip: process.env.INV_TEST_DATABASE !== "1" },
  async () => {
    await ensureInventorySchema();
    const stamp = Date.now();
    const sku = `CHECK-${stamp}`;
    const slug = `check-${stamp}`;
    let user: number | undefined,
      item: number | undefined,
      product: number | undefined;
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", () => r()));
    const base = `http://127.0.0.1:${(server.address() as any).port}`;
    try {
      user = (
        await q(
          "INSERT INTO users(email,name,phone) VALUES($1,$2,$3) RETURNING id",
          [`check-${stamp}@test.invalid`, "Stock tester", String(stamp)],
        )
      ).rows[0].id;
      product = (
        await q(
          "INSERT INTO products(name,slug,sku,price_cents,stock_qty,image_url) VALUES('Inventory-driven product',$1,$2,1000,999,'/test.jpg') RETURNING id",
          [slug, sku],
        )
      ).rows[0].id;
      let p = await (await fetch(`${base}/api/products/${slug}`)).json();
      assert.equal(p.stockQty, 0, "unmapped stock must not fall back to 999");
      item = (
        await q(
          "INSERT INTO inv_items(sku,name,physical) VALUES($1,'Stock test',5) RETURNING id",
          [sku],
        )
      ).rows[0].id;
      await q(
        "INSERT INTO inv_mappings(item_id,channel,external_sku) VALUES($1,'website',$2)",
        [item, sku],
      );
      p = await (await fetch(`${base}/api/products/${slug}`)).json();
      assert.equal(p.stockQty, 5);
      const input = {
        userId: user!,
        items: [{ slug, qty: 3 }],
        address: {
          name: "Tester",
          email: "stock@test.invalid",
          line1: "Test street",
          city: "Test",
          postal_code: "123",
          country: "US",
        },
        paymentMethod: "cod",
      };
      // Competing buyers can both quote five units but only one may reserve three.
      const attempts = await Promise.allSettled([
        placeOrder(input),
        placeOrder(input),
      ]);
      assert.equal(attempts.filter((a) => a.status === "fulfilled").length, 1);
      assert.equal(attempts.filter((a) => a.status === "rejected").length, 1);
      let rows = (await q("SELECT * FROM orders WHERE user_id=$1", [user]))
        .rows;
      assert.equal(rows.length, 1, "losing checkout rolls its order back");
      const order = rows[0];
      let stock = (
        await q("SELECT physical,reserved FROM inv_items WHERE id=$1", [item])
      ).rows[0];
      assert.deepEqual(stock, { physical: 5, reserved: 3 });
      assert.equal(
        (
          await q(
            "SELECT count(*)::int n FROM inv_orders WHERE external_id=$1",
            [order.order_number],
          )
        ).rows[0].n,
        1,
      );
      p = await (await fetch(`${base}/api/products/${slug}`)).json();
      assert.equal(p.stockQty, 2);
      await assert.rejects(quote([{ slug, qty: 3 }], ""));
      await cancelOrder({ orderNumber: order.order_number, userId: user! });
      stock = (
        await q("SELECT physical,reserved FROM inv_items WHERE id=$1", [item])
      ).rows[0];
      assert.deepEqual(stock, { physical: 5, reserved: 0 });
      const second = await placeOrder({ ...input, items: [{ slug, qty: 2 }] });
      const id = String((second.body as any).id);
      const login = await fetch(base + "/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@crysmona.com",
          password: "CrysmonaAdmin@2026",
        }),
      });
      assert.equal(login.status, 200);
      const adminCookie = login.headers.get("set-cookie")!.split(";")[0];
      const fulfill = await fetch(base + "/api/admin/orders/" + id, {
        method: "PUT",
        headers: { "Content-Type": "application/json", cookie: adminCookie },
        body: JSON.stringify({
          ...(await q("SELECT * FROM orders WHERE id=$1", [id])).rows[0],
          status: "processing",
        }),
      });
      assert.equal(fulfill.status, 200, await fulfill.text());
      const adminProducts = await (
        await fetch(base + "/api/admin/products", {
          headers: { cookie: adminCookie },
        })
      ).json();
      assert.equal(
        adminProducts.find((p: any) => p.id === product).stock_qty,
        3,
      );
      await updateFulfillment(id, "processing", "1");
      await updateFulfillment(id, "shipped", "1");
      await updateFulfillment(id, "shipped", "1");
      await updateFulfillment(id, "delivered", "1");
      stock = (
        await q("SELECT physical,reserved FROM inv_items WHERE id=$1", [item])
      ).rows[0];
      assert.deepEqual(stock, { physical: 3, reserved: 0 });
      await assert.rejects(updateFulfillment(id, "processing", "1"));
      await assert.rejects(
        cancelOrder({
          orderNumber: (second.body as any).orderNumber,
          userId: user!,
        }),
      );
      // Exercise the pending-payment release path without calling an external payment provider.
      const third = await placeOrder({ ...input, items: [{ slug, qty: 1 }] });
      const thirdId = String((third.body as any).id);
      await q(
        "UPDATE orders SET status='awaiting_payment',payment_method='paypal' WHERE id=$1",
        [thirdId],
      );
      await releaseUnpaidOrder(thirdId, user!, "Test abandoned checkout");
      await releaseUnpaidOrder(thirdId, user!, "Retry");
      stock = (
        await q("SELECT physical,reserved FROM inv_items WHERE id=$1", [item])
      ).rows[0];
      assert.deepEqual(stock, { physical: 3, reserved: 0 });
      // Admin stock edits cannot change customer availability.
      await q("UPDATE products SET stock_qty=777 WHERE id=$1", [product]);
      p = await (await fetch(`${base}/api/products/${slug}`)).json();
      assert.equal(p.stockQty, 3);
    } finally {
      if (item) {
        await q("DELETE FROM inv_order_lines WHERE item_id=$1", [item]);
        await q(
          "DELETE FROM inv_orders WHERE external_id IN (SELECT order_number FROM orders WHERE user_id=$1)",
          [user],
        );
        await q("DELETE FROM inv_movements WHERE item_id=$1", [item]);
        await q("DELETE FROM inv_mappings WHERE item_id=$1", [item]);
        await q("DELETE FROM inv_items WHERE id=$1", [item]);
      }
      if (user) {
        await q(
          "DELETE FROM order_status_history WHERE order_id IN (SELECT id FROM orders WHERE user_id=$1)",
          [user],
        );
        await q(
          "DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id=$1)",
          [user],
        );
        await q("DELETE FROM orders WHERE user_id=$1", [user]);
        await q("DELETE FROM users WHERE id=$1", [user]);
      }
      if (product) await q("DELETE FROM products WHERE id=$1", [product]);
      await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
      await pool.end();
    }
  },
);
