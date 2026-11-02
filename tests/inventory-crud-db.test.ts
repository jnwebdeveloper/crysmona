import { test } from "node:test";
import assert from "node:assert/strict";
import app from "../server/app.js";
import { pool, q } from "../server/lib/db.js";

test(
  "inventory CRUD edits thresholds, protects history and handles archived availability",
  { skip: process.env.INV_TEST_DATABASE !== "1" },
  async () => {
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", () => r()));
    const base = `http://127.0.0.1:${(server.address() as any).port}`;
    let cookie = "";
    const ids: number[] = [];
    const tag = "CRUD-" + Date.now();
    let product: number | undefined;
    async function request(
      path: string,
      method = "GET",
      body?: unknown,
      status = 200,
    ) {
      const res = await fetch(base + "/api/inventory" + path, {
        method,
        headers: { cookie, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.headers.get("set-cookie"))
        cookie = res.headers.get("set-cookie")!.split(";")[0];
      const data = await res.json();
      assert.equal(res.status, status, JSON.stringify(data));
      return data;
    }
    try {
      await request("/auth/login", "POST", {
        email: "admin@crysmona.com",
        password: "CrysmonaAdmin@2026",
      });
      const item = await request(
        "/items",
        "POST",
        { sku: tag, name: "Test item", reorder_level: 5 },
        201,
      );
      ids.push(item.id);
      await request(`/items/${item.id}`, "PUT", {
        sku: tag,
        name: "Updated item",
        location: "Shelf A",
        reorder_level: 12,
        physical: 100,
      });
      let row = (await q("SELECT * FROM inv_items WHERE id=$1", [item.id]))
        .rows[0];
      assert.equal(row.reorder_level, 12);
      assert.equal(
        row.physical,
        0,
        "metadata endpoint must not overwrite stock",
      );
      assert.equal(row.location, "Shelf A");
      await request(
        `/items/${item.id}`,
        "PUT",
        { sku: tag, name: "Test", reorder_level: -1 },
        400,
      );
      const mapping = await request("/mappings", "POST", {
        item_id: item.id,
        channel: "etsy",
        external_sku: tag + "-ETSY",
      });
      await request(`/mappings/${mapping.id}`, "PUT", {
        item_id: item.id,
        channel: "etsy",
        external_sku: tag + "-ETSY2",
        listing_id: "123",
      });
      await request(`/items/${item.id}`, "DELETE", {}, 409);
      await request(`/mappings/${mapping.id}`, "DELETE", {});
      await request(`/items/${item.id}`, "DELETE", {});
      product = (
        await q(
          "INSERT INTO products(name,slug,sku,price_cents,image_url) VALUES('Archive test',$1,$2,100,'/test.jpg') RETURNING id",
          [tag.toLowerCase(), tag + "-WEB"],
        )
      ).rows[0].id;
      const websiteItem = (
        await q(
          "SELECT item_id FROM inv_mappings WHERE channel='website' AND external_sku=$1",
          [tag + "-WEB"],
        )
      ).rows[0].item_id;
      ids.push(websiteItem);
      await request("/movements", "POST", {
        item_id: websiteItem,
        action: "receive",
        quantity: 10,
        reason: "Test stock",
      });
      const getStock = async () =>
        (
          await (
            await fetch(base + "/api/products/" + tag.toLowerCase())
          ).json()
        ).stockQty;
      assert.equal(await getStock(), 10);
      await request(`/items/${websiteItem}/archive`, "PATCH", {
        archived: true,
      });
      assert.equal(await getStock(), 0);
      await request(
        "/movements",
        "POST",
        {
          item_id: websiteItem,
          action: "receive",
          quantity: 1,
          reason: "Archived",
        },
        400,
      );
      await request(`/items/${websiteItem}/archive`, "PATCH", {
        archived: false,
      });
      assert.equal(await getStock(), 10);
      await request("/movements", "POST", {
        item_id: websiteItem,
        action: "reserve",
        quantity: 2,
        reason: "Test hold",
      });
      await request(
        `/items/${websiteItem}/archive`,
        "PATCH",
        { archived: true },
        409,
      );
      await request("/movements", "POST", {
        item_id: websiteItem,
        action: "release",
        quantity: 2,
        reason: "Release hold",
      });
      await request(`/items/${websiteItem}`, "DELETE", {}, 409);
      const websiteMap = (
        await q(
          "SELECT id FROM inv_mappings WHERE channel='website' AND external_sku=$1",
          [tag + "-WEB"],
        )
      ).rows[0].id;
      await request(`/mappings/${websiteMap}`, "DELETE", {}, 409);
      const data = await request("/data");
      assert.equal(
        data.items.find((i: any) => i.id === websiteItem).physical,
        10,
      );
    } finally {
      await q("DELETE FROM inv_movements WHERE item_id=ANY($1::int[])", [ids]);
      await q("DELETE FROM inv_mappings WHERE item_id=ANY($1::int[])", [ids]);
      await q("DELETE FROM inv_items WHERE id=ANY($1::int[])", [ids]);
      if (product) await q("DELETE FROM products WHERE id=$1", [product]);
      await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
      await pool.end();
    }
  },
);
