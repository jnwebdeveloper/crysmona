import { test } from "node:test";
import assert from "node:assert/strict";
import app from "../server/app.js";
import { pool, q } from "../server/lib/db.js";
import { ensureInventorySchema } from "../server/inventory/schema.js";
import {
  placeOrder,
  getOrder,
  updateFulfillment,
  cancelOrder,
} from "../server/services/orders.js";

test(
  "partial shipments preserve remaining reservations and track every website order line",
  { skip: process.env.INV_TEST_DATABASE !== "1" },
  async () => {
    await ensureInventorySchema();
    const stamp = Date.now(),
      products: any[] = [],
      items: number[] = [];
    let uid: number | undefined, order: any;
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", () => r()));
    const base = `http://127.0.0.1:${(server.address() as any).port}`;
    let cookie = "";
    async function request(path: string, body?: unknown, expected = 200) {
      const r = await fetch(base + "/api/inventory" + path, {
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
    try {
      await request("/auth/login", {
        email: "admin@crysmona.com",
        password: "CrysmonaAdmin@2026",
      });
      uid = (
        await q(
          "INSERT INTO users(name,phone,email) VALUES('Partial test',$1,$2) RETURNING id",
          [String(stamp), `partial-${stamp}@test.invalid`],
        )
      ).rows[0].id;
      for (let n = 0; n < 3; n++) {
        const p = (
          await q(
            "INSERT INTO products(name,slug,sku,price_cents,image_url) VALUES($1,$2,$3,100,'/test.jpg') RETURNING *",
            ["Partial " + n, `partial-${stamp}-${n}`, `PART-${stamp}-${n}`],
          )
        ).rows[0];
        products.push(p);
        const id = (
          await q(
            "SELECT item_id FROM inv_mappings WHERE channel='website' AND external_sku=$1",
            [p.sku],
          )
        ).rows[0].item_id;
        items.push(id);
        await q("UPDATE inv_items SET physical=10 WHERE id=$1", [id]);
      }
      const result = await placeOrder({
        userId: uid!,
        items: products.map((p, n) => ({ slug: p.slug, qty: [2, 3, 1][n] })),
        address: {
          name: "Test",
          email: "test@test.invalid",
          line1: "Street",
          city: "City",
          postal_code: "123",
          country: "US",
        },
        paymentMethod: "cod",
      });
      order = (
        await q("SELECT * FROM orders WHERE id=$1", [(result.body as any).id])
      ).rows[0];
      const inv = (
        await q(
          "SELECT * FROM inv_orders WHERE channel='website' AND external_id=$1",
          [order.order_number],
        )
      ).rows[0];
      const lines = (
        await q(
          "SELECT * FROM order_items WHERE order_id=$1 ORDER BY product_id",
          [order.id],
        )
      ).rows;
      const endpoint = `/orders/${inv.id}/shipments`;
      const first = {
        request_key: "partial-first-" + stamp,
        lines: [
          { order_item_id: lines[0].id, quantity: 1 },
          { order_item_id: lines[2].id, quantity: 1 },
        ],
        carrier: "Test courier",
        tracking_number: "TRACK-1",
      };
      assert.equal(
        (await request(endpoint, first, 201)).status,
        "partially_shipped",
      );
      await request(endpoint, first, 201);
      const state = async () =>
        (
          await q(
            "SELECT physical,reserved FROM inv_items WHERE id=ANY($1::int[]) ORDER BY id",
            [items],
          )
        ).rows;
      assert.deepEqual(await state(), [
        { physical: 9, reserved: 1 },
        { physical: 10, reserved: 3 },
        { physical: 9, reserved: 0 },
      ]);
      await request(
        endpoint,
        { ...first, lines: [{ order_item_id: lines[0].id, quantity: 2 }] },
        409,
      );
      await request(
        endpoint,
        {
          request_key: "partial-over-" + stamp,
          lines: [{ order_item_id: lines[2].id, quantity: 1 }],
        },
        409,
      );
      const customer = await getOrder(order.order_number, uid!);
      assert.equal(customer.status, "partially shipped");
      assert.equal(customer.items[0].shippedQty, 1);
      await assert.rejects(
        cancelOrder({ orderNumber: order.order_number, userId: uid! }),
      );
      await assert.rejects(
        updateFulfillment(String(order.id), "delivered", "1"),
      );
      const data = await request("/data");
      const row = data.orders.find((r: any) => r.id === inv.id);
      assert.equal(row.items[0].remaining, 1);
      assert.equal(row.items[1].remaining, 3);
      assert.equal(row.shipments.length, 1);
      assert.equal(row.shipments[0].tracking_number, "TRACK-1");
      assert.ok(
        data.items
          .find((i: any) => i.id === items[0])
          .channel_skus.some((m: any) => m.sku === products[0].sku),
      );
      const dashboard = await request("/dashboard");
      assert.ok(dashboard.orders.partial >= 1);
      assert.ok(dashboard.shipments.today >= 1);
      // Competing dispatch requests cannot ship the last unit twice.
      const competing = await Promise.allSettled([
        request(
          endpoint,
          {
            request_key: "partial-race-one-" + stamp,
            lines: [{ order_item_id: lines[0].id, quantity: 1 }],
          },
          201,
        ),
        request(
          endpoint,
          {
            request_key: "partial-race-two-" + stamp,
            lines: [{ order_item_id: lines[0].id, quantity: 1 }],
          },
          201,
        ),
      ]);
      assert.equal(competing.filter((r) => r.status === "fulfilled").length, 1);
      const last = await request(
        endpoint,
        {
          request_key: "partial-last-" + stamp,
          lines: [{ order_item_id: lines[1].id, quantity: 3 }],
          tracking_number: "TRACK-2",
        },
        201,
      );
      assert.equal(last.status, "shipped");
      assert.deepEqual(await state(), [
        { physical: 8, reserved: 0 },
        { physical: 7, reserved: 0 },
        { physical: 9, reserved: 0 },
      ]);
      await updateFulfillment(String(order.id), "shipped", "1");
      await updateFulfillment(String(order.id), "delivered", "1");
      assert.deepEqual(await state(), [
        { physical: 8, reserved: 0 },
        { physical: 7, reserved: 0 },
        { physical: 9, reserved: 0 },
      ]);
      assert.equal(
        (
          await q(
            "SELECT count(*)::int n FROM inv_shipments WHERE order_id=$1",
            [inv.id],
          )
        ).rows[0].n,
        3,
      );

      // Shared stock SKUs and pre-upgrade orders retain their original item allocation.
      await q(
        "UPDATE inv_mappings SET item_id=$1 WHERE channel='website' AND external_sku=$2",
        [items[0], products[1].sku],
      );
      const shared = await placeOrder({
        userId: uid!,
        items: products.map((p) => ({ slug: p.slug, qty: 1 })),
        address: {
          name: "Test",
          email: "test@test.invalid",
          line1: "Street",
          city: "City",
          postal_code: "123",
          country: "US",
        },
        paymentMethod: "cod",
      });
      const sharedOrder = (
        await q("SELECT * FROM orders WHERE id=$1", [(shared.body as any).id])
      ).rows[0];
      const sharedInv = (
        await q("SELECT id FROM inv_orders WHERE external_id=$1", [
          sharedOrder.order_number,
        ])
      ).rows[0];
      const sharedLines = (
        await q(
          "SELECT id FROM order_items WHERE order_id=$1 ORDER BY product_id",
          [sharedOrder.id],
        )
      ).rows;
      await q("DELETE FROM inv_website_lines WHERE order_id=$1", [
        sharedInv.id,
      ]);
      await request(
        `/orders/${sharedInv.id}/shipments`,
        {
          request_key: "shared-first-" + stamp,
          lines: [{ order_item_id: sharedLines[0].id, quantity: 1 }],
        },
        201,
      );
      await q(
        "UPDATE inv_mappings SET item_id=$1 WHERE channel='website' AND external_sku=$2",
        [items[1], products[1].sku],
      );
      await request(
        `/orders/${sharedInv.id}/shipments`,
        {
          request_key: "shared-last-" + stamp,
          lines: [
            { order_item_id: sharedLines[1].id, quantity: 1 },
            { order_item_id: sharedLines[2].id, quantity: 1 },
          ],
        },
        201,
      );
      assert.deepEqual(await state(), [
        { physical: 6, reserved: 0 },
        { physical: 7, reserved: 0 },
        { physical: 8, reserved: 0 },
      ]);
    } finally {
      if (uid) {
        await q(
          "DELETE FROM inv_order_lines WHERE order_id IN (SELECT i.id FROM inv_orders i JOIN orders o ON o.order_number=i.external_id AND i.channel='website' WHERE o.user_id=$1)",
          [uid],
        );
        await q(
          "DELETE FROM inv_orders WHERE channel='website' AND external_id IN (SELECT order_number FROM orders WHERE user_id=$1)",
          [uid],
        );
        await q("DELETE FROM orders WHERE user_id=$1", [uid]);
      }
      await q("DELETE FROM inv_movements WHERE item_id=ANY($1::int[])", [
        items,
      ]);
      await q("DELETE FROM inv_mappings WHERE item_id=ANY($1::int[])", [items]);
      await q("DELETE FROM inv_items WHERE id=ANY($1::int[])", [items]);
      await q("DELETE FROM products WHERE id=ANY($1::int[])", [
        products.map((p) => p.id),
      ]);
      if (uid) await q("DELETE FROM users WHERE id=$1", [uid]);
      await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
      await pool.end();
    }
  },
);
