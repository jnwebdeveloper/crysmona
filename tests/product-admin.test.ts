import assert from "node:assert/strict";
import { test } from "node:test";
import { pool } from "../server/lib/db.js";
import { saveProduct } from "../server/routes/admin.js";
import { adminValidation } from "../shared/adminValidation.js";

test("new products do not require a manually entered slug, but require numeric values", () => {
  const product = {
    name: "Moonstone",
    kind: "gemstone",
    image_url: "/stone.jpg",
    price_cents: 0,
    stock_qty: 0,
  };
  assert.deepEqual(adminValidation("products", product), {});
  assert.ok(
    adminValidation("products", { ...product, price_cents: "" }).price_cents,
  );
  assert.ok(
    adminValidation("products", { ...product, stock_qty: -1 }).stock_qty,
  );
});

test("gallery saves include the default once and generate distinct valid product links", async (t) => {
  const calls: { sql: string; params?: any[] }[] = [];
  t.mock.method(pool, "connect", async () => ({
    query: async (sql: string, params?: any[]) => {
      calls.push({ sql, params });
      return {
        rows: [{ id: 7, image_url: "/default.jpg", name: "Moonstone" }],
      };
    },
    release() {},
  }));
  const first = { name: "Moonstone", image_url: "/default.jpg" } as Record<
    string,
    any
  >;
  const second = { ...first };
  await saveProduct(first, [
    { image_url: "/other.jpg" },
    { image_url: "/default.jpg" },
  ]);
  assert.match(first.slug, /^moonstone-[a-f0-9]{8}$/);
  assert.equal(
    calls.filter((c) => c.sql.startsWith("INSERT INTO product_images")).length,
    2,
  );
  assert.equal(calls.at(-1)?.sql, "COMMIT");
  await saveProduct(second, []);
  assert.notEqual(first.slug, second.slug);
});

test("invalid gallery URLs are rejected before starting a transaction", async () => {
  await assert.rejects(
    saveProduct({ name: "Moonstone" }, [{ image_url: "javascript:alert(1)" }]),
    /valid product images/,
  );
  await assert.rejects(
    saveProduct({ name: "Moonstone" }, [{ image_url: "" }]),
    /valid product images/,
  );
});

test("failed gallery writes roll back the product and release the connection", async (t) => {
  const calls: string[] = [];
  t.mock.method(pool, "connect", async () => ({
    query: async (sql: string) => {
      calls.push(sql);
      if (sql.startsWith("INSERT INTO product_images"))
        throw new Error("storage failure");
      return { rows: [{ id: 7, name: "Moonstone", image_url: "/stone.jpg" }] };
    },
    release() {
      calls.push("RELEASE");
    },
  }));
  await assert.rejects(
    saveProduct({ name: "Moonstone" }, [], "7"),
    /storage failure/,
  );
  assert.deepEqual(calls.slice(-2), ["ROLLBACK", "RELEASE"]);
  assert.ok(!calls.includes("COMMIT"));
});
