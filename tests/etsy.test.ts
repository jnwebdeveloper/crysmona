import { test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../server/lib/db.js";
import {
  setup,
  config,
  discoverShop,
  receipts,
  orderState,
  encrypt,
  decrypt,
  testConnection,
} from "../server/inventory/etsy.js";
function configured(t: any) {
  const names = [
    "ETSY_CLIENT_ID",
    "ETSY_SHARED_SECRET",
    "ETSY_REDIRECT_URI",
    "ETSY_SHOP_ID",
    "INV_ENCRYPTION_KEY",
    "WEB_ORIGIN",
  ];
  const old = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  t.after(() => {
    for (const n of names)
      old[n] === undefined ? delete process.env[n] : (process.env[n] = old[n]);
  });
  Object.assign(process.env, {
    ETSY_CLIENT_ID: "test-key",
    ETSY_SHARED_SECRET: "test-secret",
    ETSY_REDIRECT_URI:
      "https://crysmona.vercel.app/api/inventory/etsy/callback",
    INV_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString("base64"),
  });
  delete process.env.ETSY_SHOP_ID;
  delete process.env.WEB_ORIGIN;
}
test("setup exposes readiness without exposing credential values", (t) => {
  configured(t);
  assert.equal(setup().ready, true);
  assert.ok(!JSON.stringify(setup()).includes("test-secret"));
  assert.ok(!JSON.stringify(setup()).includes("test-key"));
  process.env.ETSY_REDIRECT_URI = "http://wrong.test/callback";
  assert.equal(setup().ready, false);
  assert.throws(config);
});
test("OAuth discovers the authorized owners shop and verifies receipts permission", async (t) => {
  configured(t);
  const paths: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: any, options: any) => {
    paths.push(String(url));
    assert.equal(options.headers["x-api-key"], "test-key:test-secret");
    return new Response(
      JSON.stringify(
        String(url).includes("/users/")
          ? { shop_id: 77, user_id: 123, shop_name: "TestShop" }
          : { results: [] },
      ),
      { status: 200 },
    );
  });
  assert.deepEqual(await discoverShop({ access_token: "123.test-token" }), {
    id: "77",
    name: "TestShop",
  });
  assert.equal(paths.length, 2);
  process.env.ETSY_SHOP_ID = "88";
  await assert.rejects(
    discoverShop({ access_token: "123.test-token" }),
    /different shop/,
  );
  await assert.rejects(
    discoverShop({ access_token: "malformed" }),
    /invalid account/,
  );
});
test("pagination reads all receipts using only encrypted stored authorization", async (t) => {
  configured(t);
  const credentials = {
    access_token: "123.access",
    refresh_token: "refresh",
    expires_in: 3600,
  };
  t.mock.method(pool, "query", async () => ({
    rows: [
      {
        shop_id: "77",
        shop_name: "TestShop",
        tokens: encrypt(JSON.stringify(credentials)),
        expires_at: new Date(Date.now() + 3600000),
      },
    ],
  }));
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: any) => {
    calls++;
    assert.match(String(url), /shops\/77\/receipts/);
    return new Response(
      JSON.stringify({
        results:
          calls === 1
            ? Array.from({ length: 100 }, (_, n) => ({ receipt_id: n + 1 }))
            : [],
      }),
    );
  });
  assert.equal((await receipts()).length, 100);
  assert.equal(calls, 2);
});
test("expired access tokens refresh, are re-encrypted and remain server-side", async (t) => {
  configured(t);
  const old = { access_token: "123.old", refresh_token: "refresh-old" };
  let encrypted = "";
  t.mock.method(pool, "query", async (sql: string, params: any[]) => {
    if (sql.startsWith("INSERT")) {
      encrypted = params[1];
      return { rows: [] };
    }
    return {
      rows: [
        {
          shop_id: "77",
          shop_name: "TestShop",
          tokens: encrypt(JSON.stringify(old)),
          expires_at: new Date(0),
        },
      ],
    };
  });
  t.mock.method(globalThis, "fetch", async (url: any, options: any) => {
    if (String(url).includes("/oauth/token")) {
      assert.equal(options.body.get("grant_type"), "refresh_token");
      return new Response(
        JSON.stringify({
          access_token: "123.new",
          refresh_token: "refresh-new",
          expires_in: 3600,
        }),
      );
    }
    assert.equal(options.headers.Authorization, "Bearer 123.new");
    return new Response(JSON.stringify({ results: [] }));
  });
  const result = await testConnection();
  assert.deepEqual(result, { ok: true, shopId: "77", shopName: "TestShop" });
  assert.equal(JSON.parse(decrypt(encrypted)).refresh_token, "refresh-new");
  assert.ok(!JSON.stringify(result).includes("123.new"));
});
test("Etsy errors produce actionable safe messages and canceled receipts release holds", async (t) => {
  configured(t);
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("{}", { status: 429 }),
  );
  await assert.rejects(
    discoverShop({ access_token: "123.token" }),
    /rate limit/,
  );
  assert.equal(orderState({ status: "Canceled", is_paid: true }), "cancelled");
  assert.equal(
    orderState({ status: "cancelled", is_paid: false }),
    "cancelled",
  );
  assert.equal(orderState({ is_paid: true, is_shipped: true }), "shipped");
  assert.equal(orderState({ is_paid: true, is_shipped: false }), "open");
  assert.equal(orderState({ is_paid: false }), null);
});
