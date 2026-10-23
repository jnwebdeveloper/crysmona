import assert from "node:assert/strict";
import { test } from "node:test";
import cart from "../server/routes/cart.js";
import { pool } from "../server/lib/db.js";
import { hash } from "../server/lib/http.js";
import { claimGuestState } from "../server/auth/customer/guest.js";
import { customer } from "../server/auth/customer/session.js";

const handler = (method: string) =>
  (cart as any).stack.find((layer: any) => layer.route?.methods[method]).route
    .stack[0].handle;
const response = () => ({
  cookies: [] as string[],
  body: undefined as any,
  append(_name: string, value: string) {
    this.cookies.push(value);
  },
  json(value: any) {
    this.body = value;
  },
});

test("guest bag is saved and reloaded under the cookie owner, with stock validation", async (t) => {
  const writes: any[] = [];
  let savedQty = 0;
  t.mock.method(pool, "query", async (sql: string, args: any[]) => {
    if (sql.includes("JOIN products"))
      return {
        rows: savedQty
          ? [
              {
                id: 1,
                slug: "stone",
                name: "Stone",
                price_cents: 200,
                stock_qty: 3,
                quantity: savedQty,
              },
            ]
          : [],
      };
    return { rows: [], rowCount: 1 };
  });
  t.mock.method(
    pool,
    "connect",
    async () =>
      ({
        query: async (sql: string, args: any[]) => {
          if (sql.startsWith("SELECT id,stock_qty"))
            return { rows: [{ id: 1, stock_qty: 3 }] };
          if (sql.startsWith("INSERT INTO carts")) {
            writes.push(args);
            savedQty = args[2];
          }
          return { rows: [] };
        },
        release() {},
      }) as any,
  );
  const initial = response();
  await handler("get")({ headers: {} }, initial);
  assert.deepEqual(initial.body, []);
  assert.match(initial.cookies[0], /HttpOnly; SameSite=Lax/);
  const cookie = initial.cookies[0].split(";")[0];
  const token = cookie.slice(cookie.indexOf("=") + 1);
  await handler("put")(
    { headers: { cookie }, body: { items: [{ slug: "stone", qty: 2 }] } },
    response(),
  );
  assert.deepEqual(writes[0], ["guest:" + hash(token), 1, 2]);
  const reload = response();
  await handler("get")({ headers: { cookie } }, reload);
  assert.equal(reload.body[0].qty, 2);
  assert.equal(reload.body[0].product.slug, "stone");
  await assert.rejects(
    handler("put")(
      { headers: { cookie }, body: { items: [{ slug: "stone", qty: 4 }] } },
      response(),
    ),
    /unavailable/,
  );
});

test("signed-in bags use the session owner and guest items merge on login", async (t) => {
  const calls: { sql: string; args: any[] }[] = [];
  t.mock.method(pool, "query", async (sql: string, args: any[]) => {
    calls.push({ sql, args });
    return {
      rows: sql.includes("FROM sessions") ? [{ id: 42 }] : [],
      rowCount: 1,
    };
  });
  await handler("get")(
    { headers: { cookie: "crysmona_session=session-token" } },
    response(),
  );
  assert.deepEqual(calls.find((c) => c.sql.includes("JOIN products"))?.args, [
    "user:42",
  ]);
  await claimGuestState(
    { headers: { cookie: "crysmona_guest=guest-token" } },
    42,
  );
  const merge = calls.find((c) => c.sql.startsWith("INSERT INTO carts"));
  assert.deepEqual(merge?.args, ["user:42", "guest:" + hash("guest-token")]);
  assert.match(merge!.sql, /carts.quantity\+EXCLUDED.quantity/);
  assert.ok(
    calls.some(
      (c) =>
        c.sql.startsWith("DELETE FROM carts") &&
        c.args[0] === "guest:" + hash("guest-token"),
    ),
  );
});

test("order authentication still rejects a guest", async () => {
  let error: any;
  await customer({ headers: {} }, {}, (e: any) => {
    error = e;
  });
  assert.equal(error.status, 401);
});
