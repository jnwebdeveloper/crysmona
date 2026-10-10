import "dotenv/config";
import assert from "node:assert/strict";
import pg from "pg";
import { hashPassword } from "../server/auth/admin/password.js";
import { randomBytes } from "node:crypto";
import { resources } from "../shared/adminSchema.js";
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const base = process.env.TEST_API_URL || "http://127.0.0.1:4011/api";
const marker = "verification-" + Date.now();
let product: any,
  user: any,
  cookie = "";
let checks = 0;
let adminCookie = "",
  adminId: number | undefined;
const adminEmail = marker + "@example.invalid",
  adminPassword = randomBytes(20).toString("hex");
async function call(path: string, method = "GET", body?: any, auth = false) {
  const r = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth || cookie
        ? {
            cookie: [cookie, auth ? adminCookie : ""]
              .filter(Boolean)
              .join("; "),
          }
        : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data, cookie: r.headers.get("set-cookie") };
}
function check(value: any, message: string) {
  assert.ok(value, message);
  checks++;
  console.log("PASS " + message);
}
try {
  const health = await call("/health");
  check(health.status === 200, "Database connected");
  const rows = (
    await db.query(
      "SELECT table_name,data_type FROM information_schema.columns WHERE table_schema='public' AND column_name='id'",
    )
  ).rows;
  check(
    rows.length > 0 &&
      rows.every((r) => ["integer", "bigint"].includes(r.data_type)),
    "All model IDs use integer database types",
  );
  check(
    (await db.query("SELECT current_database() name")).rows[0].name ===
      "crysmona",
    "Exact database name",
  );
  const catalog = await call("/products");
  check(
    catalog.data.length > 0 &&
      catalog.data.every(
        (p: any) => Number.isInteger(p.id) && p.price.startsWith("$"),
      ),
    "Database catalog uses numeric IDs and USD",
  );
  check(
    (await call("/admin/products")).status === 401,
    "Admin authentication enforced",
  );
  adminId = (
    await db.query(
      "INSERT INTO admin_accounts(email,password_hash) VALUES($1,$2) RETURNING id",
      [adminEmail, await hashPassword(adminPassword)],
    )
  ).rows[0].id;
  check(
    (
      await call("/admin/auth/login", "POST", {
        email: adminEmail,
        password: "incorrect",
      })
    ).status === 401,
    "Incorrect admin password rejected",
  );
  const adminLogin = await call("/admin/auth/login", "POST", {
    email: adminEmail,
    password: adminPassword,
  });
  check(
    adminLogin.status === 200 && !!adminLogin.cookie?.includes("HttpOnly"),
    "Email/password login sets HttpOnly cookie",
  );
  adminCookie = adminLogin.cookie!.split(";")[0];
  check(
    (await call("/admin/auth/me", "GET", undefined, true)).data.email ===
      adminEmail,
    "Admin session restored",
  );
  const legacy = await fetch(base + "/admin/products", {
    headers: { "x-admin-key": "crysmona-admin" },
  });
  check(legacy.status === 401, "Old access key no longer grants access");
  for (const resource of Object.keys(resources))
    check(
      (await call("/admin/" + resource, "GET", undefined, true)).status === 200,
      "Read admin " + resource,
    );
  const data = {
    name: marker,
    slug: marker,
    kind: "jewellery",
    image_url: "/assets/pendant-amethyst.jpg",
    price_cents: 12345,
    stock_qty: 0,
    active: true,
  };
  let result = await call("/admin/products", "POST", data, true);
  check(result.status === 201, "Create product with explicit zero quantity");
  product = result.data;
  check(
    (await call("/products/" + marker)).data.stockQty === 0,
    "Sold-out quantity reaches storefront",
  );
  check(
    (
      await call("/checkout/quote", "POST", {
        items: [{ slug: marker, qty: 1 }],
      })
    ).status === 400,
    "Sold-out checkout rejected",
  );
  check(
    (
      await call(
        "/admin/products/" + product.id,
        "PUT",
        { stock_qty: -1 },
        true,
      )
    ).status === 400,
    "Negative inventory rejected",
  );
  check(
    (
      await call(
        "/admin/products/" + product.id,
        "PUT",
        { stock_qty: 1.5 },
        true,
      )
    ).status === 400,
    "Fractional inventory rejected",
  );
  check(
    (await call("/admin/products/" + product.id, "PUT", { stock_qty: 1 }, true))
      .status === 200,
    "Inventory update persists",
  );
  const quote = await call("/checkout/quote", "POST", {
    items: [{ slug: marker, qty: 1, price: 1 }],
  });
  check(quote.data.subtotal === 12345, "Checkout prices come from database");
  check(
    (
      await call("/checkout/quote", "POST", {
        items: [{ slug: marker, qty: 2 }],
      })
    ).status === 400,
    "Excess inventory rejected",
  );
  const media = await call("/admin/media/config", "GET", undefined, true);
  check(
    media.status === 200 && media.data.available === false,
    "Unconfigured R2 reported honestly",
  );
  const upload = await fetch(base + "/admin/media/upload", {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "image/png",
    },
    body: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  });
  check(upload.status === 503, "No local upload fallback when R2 unavailable");
  const phone = "9" + String(Date.now()).slice(-9);
  check(
    (await call("/auth/request-otp", "POST", { phone })).status === 200,
    "Request development OTP",
  );
  check(
    (await call("/auth/verify-otp", "POST", { phone, otp: "000000" }))
      .status === 401,
    "Incorrect OTP rejected",
  );
  const login = await call("/auth/verify-otp", "POST", {
    phone,
    otp: "123456",
  });
  check(login.status === 200, "Development login");
  user = login.data;
  cookie = login.cookie!.split(";")[0];
  check(
    (await call("/wishlist", "PUT", { slugs: [marker] })).status === 200,
    "Wishlist saved",
  );
  check(
    (await call("/wishlist")).data.includes(marker),
    "Wishlist loaded from database",
  );
  const orderBody = {
    items: [{ slug: marker, qty: 1 }],
    address: {
      name: "Verification",
      email: "test@example.invalid",
      line1: "Test address",
      city: "Test",
      postal_code: "000000",
      country: "Test",
    },
    paymentMethod: "cod",
  };
  const orders = await Promise.all([
    call("/orders", "POST", orderBody),
    call("/orders", "POST", orderBody),
  ]);
  check(
    orders.filter((o) => o.status === 201).length === 1 &&
      orders.filter((o) => o.status === 400).length === 1,
    "Concurrent checkout cannot oversell",
  );
  check(
    (await call("/products/" + marker)).data.stockQty === 0,
    "Successful checkout decrements stock",
  );
  const order = orders.find((o) => o.status === 201)!.data;
  check(
    (await call("/admin/orders/" + order.id, "DELETE", undefined, true))
      .status === 400,
    "Placed order cannot be deleted",
  );
  check(
    (await call("/admin/orders/" + order.id, "PUT", { total_cents: 1 }, true))
      .status === 400,
    "Placed order financial values protected",
  );
  check(
    (await call("/orders")).data.some((o: any) => o.id === order.orderNumber),
    "Order history persists",
  );
  check((await call("/auth/logout", "POST")).status === 200, "Logout succeeds");
  check((await call("/auth/me")).status === 401, "Logged-out session rejected");
  check(
    (await call("/admin/auth/logout", "POST", {}, true)).status === 200,
    "Admin logout succeeds",
  );
  check(
    (await call("/admin/products", "GET", undefined, true)).status === 401,
    "Admin logout invalidates session",
  );
  console.log(`${checks} checks passed.`);
} finally {
  if (user) {
    await db.query("DELETE FROM orders WHERE user_id=$1", [user.id]);
    await db.query("DELETE FROM users WHERE id=$1", [user.id]);
  }
  if (product) await db.query("DELETE FROM products WHERE id=$1", [product.id]);
  if (adminId)
    await db.query("DELETE FROM admin_accounts WHERE id=$1", [adminId]);
  await db.end();
}
