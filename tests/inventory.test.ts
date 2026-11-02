import { test } from "node:test";
import assert from "node:assert/strict";
import { stockDelta, move } from "../server/inventory/stock.js";
import { encrypt, decrypt } from "../server/inventory/etsy.js";
test("stock actions preserve the distinction between physical and reserved units", () => {
  assert.deepEqual(stockDelta("reserve", 3), [0, 3]);
  assert.deepEqual(stockDelta("ship", 3), [-3, -3]);
  assert.deepEqual(stockDelta("release", 3), [0, -3]);
  assert.deepEqual(stockDelta("receive", 3), [3, 0]);
  for (const n of [0, -1, 1.2, NaN, 1000001])
    assert.throws(() => stockDelta("receive", n));
  assert.throws(() => stockDelta("unknown", 1));
});
test("failed stock availability update never writes a movement", async () => {
  const calls: string[] = [];
  const c = {
    query: async (sql: string) => {
      calls.push(sql);
      return { rowCount: 0, rows: [] };
    },
  };
  await assert.rejects(
    move(c as any, 1, "reserve", 3, "test", "staff"),
    /Insufficient/,
  );
  assert.equal(calls.length, 1);
  assert.match(calls[0], /reserved\+\$3<=physical\+\$2/);
});
test("duplicate stock references do not consume stock twice", async () => {
  let count = 0;
  const c = {
    query: async () => {
      count++;
      return { rowCount: 1, rows: [{}] };
    },
  };
  await move(c as any, 1, "remove", 3, "order", "staff", "unique-order");
  assert.equal(count, 1);
});
test("OAuth tokens are encrypted with authentication and reject tampering", () => {
  process.env.INV_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  const plain = JSON.stringify({
    access_token: "private",
    refresh_token: "secret",
  });
  const value = encrypt(plain);
  assert.equal(decrypt(value), plain);
  assert.ok(!value.includes("private"));
  assert.notEqual(encrypt(plain), value);
  const bytes = Buffer.from(value, "base64");
  bytes[15] ^= 1;
  assert.throws(() => decrypt(bytes.toString("base64")));
  delete process.env.INV_ENCRYPTION_KEY;
  assert.throws(() => encrypt(plain));
});

import { readFile } from "node:fs/promises";
import { INVENTORY_SCHEMA_SQL } from "../server/inventory/schema.js";
test("serverless inventory schema matches the standalone migration", async () => {
  const migration = (
    await readFile(
      new URL("../database/011-inventory.sql", import.meta.url),
      "utf8",
    )
  )
    .trim()
    .replace(/^BEGIN;/, "")
    .replace(/COMMIT;$/, "")
    .trim();
  assert.equal(INVENTORY_SCHEMA_SQL.trim(), migration);
  assert.ok(
    [...migration.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].every(
      (match) => match[1].startsWith("inv_"),
    ),
  );
});

import { INVENTORY_AUTO_PRODUCTS_SQL } from "../server/inventory/schema.js";
test("serverless automatic product linking matches its migration", async () => {
  const migration = (
    await readFile(
      new URL("../database/012-inventory-auto-products.sql", import.meta.url),
      "utf8",
    )
  )
    .trim()
    .replace(/^BEGIN;/, "")
    .replace(/COMMIT;$/, "")
    .trim();
  assert.equal(INVENTORY_AUTO_PRODUCTS_SQL.trim(), migration);
});
