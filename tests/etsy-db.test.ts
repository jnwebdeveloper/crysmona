import { test } from "node:test";
import assert from "node:assert/strict";
import app from "../server/app.js";
import { pool, q } from "../server/lib/db.js";

test(
  "Etsy connects with PKCE, detects shop and imports orders idempotently",
  { skip: process.env.INV_TEST_DATABASE !== "1" },
  async (t) => {
    const stamp = Date.now(),
      sku = "ETSY-TEST-" + stamp,
      receipt = String(stamp),
      shop = "777";
    let item: number | undefined;
    let current = {
      receipt_id: receipt,
      status: "Paid",
      is_paid: true,
      is_shipped: false,
      transactions: [{ sku, quantity: 2 }],
    };
    const names = [
      "ETSY_CLIENT_ID",
      "ETSY_SHARED_SECRET",
      "ETSY_REDIRECT_URI",
      "ETSY_SHOP_ID",
      "INV_ENCRYPTION_KEY",
    ];
    const old = Object.fromEntries(names.map((n) => [n, process.env[n]]));
    Object.assign(process.env, {
      ETSY_CLIENT_ID: "test-key",
      ETSY_SHARED_SECRET: "test-secret",
      ETSY_REDIRECT_URI:
        "https://crysmona.vercel.app/api/inventory/etsy/callback",
      INV_ENCRYPTION_KEY: Buffer.alloc(32, 6).toString("base64"),
    });
    delete process.env.ETSY_SHOP_ID;
    const realFetch = globalThis.fetch;
    t.mock.method(globalThis, "fetch", async (input: any, options: any) => {
      const url = String(input);
      if (!url.startsWith("https://api.etsy.com/"))
        return realFetch(input, options);
      if (url.endsWith("/oauth/token")) {
        assert.equal(options.body.get("code_verifier").length > 30, true);
        return new Response(
          JSON.stringify({
            access_token: "123.test-access",
            refresh_token: "test-refresh",
            expires_in: 3600,
          }),
        );
      }
      if (url.includes("/users/123/shops"))
        return new Response(
          JSON.stringify({
            shop_id: Number(shop),
            shop_name: "TestShop",
            user_id: 123,
          }),
        );
      return new Response(
        JSON.stringify({
          results:
            url.includes("limit=1") && !url.includes("limit=100")
              ? []
              : [current],
        }),
      );
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", () => r()));
    const base = `http://127.0.0.1:${(server.address() as any).port}/api/inventory`;
    let cookie = "";
    async function req(path: string, body?: any) {
      const r = await fetch(base + path, {
        redirect: "manual",
        method: body === undefined ? "GET" : "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (r.headers.get("set-cookie"))
        cookie = r.headers.get("set-cookie")!.split(";")[0];
      return r;
    }
    try {
      assert.equal(
        (
          await req("/auth/login", {
            email: "admin@crysmona.com",
            password: "CrysmonaAdmin@2026",
          })
        ).status,
        200,
      );
      const connect = await req("/etsy/connect");
      assert.equal(connect.status, 302);
      const url = new URL(connect.headers.get("location")!);
      assert.equal(url.searchParams.get("code_challenge_method"), "S256");
      assert.equal(url.searchParams.get("scope"), "transactions_r");
      const state = url.searchParams.get("state")!;
      const callback = await req(
        "/etsy/callback?state=" + state + "&code=test-code",
      );
      assert.equal(callback.status, 302);
      assert.match(callback.headers.get("location")!, /etsy=connected/);
      assert.match(
        (
          await req("/etsy/callback?state=" + state + "&code=test-code")
        ).headers.get("location")!,
        /etsy=expired/,
      );
      const saved = (
        await q("SELECT * FROM inv_integrations WHERE shop_id=$1", [shop])
      ).rows[0];
      assert.ok(saved);
      assert.ok(!saved.tokens.includes("test-access"));
      assert.equal(saved.shop_name, "TestShop");
      assert.equal((await req("/etsy/test", {})).status, 200);
      const data = await (await req("/data")).json();
      assert.equal(data.etsySetup.ready, true);
      assert.ok(!JSON.stringify(data).includes("test-secret"));
      assert.ok(!JSON.stringify(data).includes("test-access"));
      item = (
        await q(
          "INSERT INTO inv_items(sku,name,physical) VALUES($1,'Etsy test',10) RETURNING id",
          [sku],
        )
      ).rows[0].id;
      await q(
        "INSERT INTO inv_mappings(item_id,channel,external_sku) VALUES($1,'etsy',$2)",
        [item, sku],
      );
      assert.equal((await req("/sync/etsy", {})).status, 200);
      assert.equal((await req("/sync/etsy", {})).status, 200);
      const stock = async () =>
        (await q("SELECT physical,reserved FROM inv_items WHERE id=$1", [item]))
          .rows[0];
      assert.deepEqual(await stock(), { physical: 10, reserved: 2 });
      current = { ...current, status: "Canceled" };
      assert.equal((await req("/sync/etsy", {})).status, 200);
      assert.deepEqual(await stock(), { physical: 10, reserved: 0 });
      assert.equal(
        (
          await q(
            "SELECT status FROM inv_orders WHERE channel='etsy' AND external_id=$1",
            [receipt],
          )
        ).rows[0].status,
        "cancelled",
      );
      await req("/etsy/disconnect", {});
      assert.equal(
        (await q("SELECT 1 FROM inv_integrations WHERE shop_id=$1", [shop]))
          .rowCount,
        0,
      );
      assert.equal(
        (
          await q(
            "SELECT 1 FROM inv_orders WHERE channel='etsy' AND external_id=$1",
            [receipt],
          )
        ).rowCount,
        1,
      );
    } finally {
      await q("DELETE FROM inv_integrations WHERE shop_id=$1", [shop]);
      await q(
        "DELETE FROM inv_order_lines WHERE order_id IN (SELECT id FROM inv_orders WHERE channel='etsy' AND external_id=$1)",
        [receipt],
      );
      await q(
        "DELETE FROM inv_orders WHERE channel='etsy' AND external_id=$1",
        [receipt],
      );
      if (item) {
        await q("DELETE FROM inv_movements WHERE item_id=$1", [item]);
        await q("DELETE FROM inv_mappings WHERE item_id=$1", [item]);
        await q("DELETE FROM inv_items WHERE id=$1", [item]);
      }
      for (const n of names)
        old[n] === undefined
          ? delete process.env[n]
          : (process.env[n] = old[n]);
      await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
      await pool.end();
    }
  },
);
