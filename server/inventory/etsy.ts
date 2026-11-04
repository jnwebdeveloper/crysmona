import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { q } from "../lib/db.js";
import { bad } from "../lib/errors.js";
const API = "https://api.etsy.com/v3/";
function key() {
  const value = Buffer.from(process.env.INV_ENCRYPTION_KEY || "", "base64");
  if (value.length !== 32)
    throw bad(
      "Set INV_ENCRYPTION_KEY to a base64-encoded 32-byte key in Vercel.",
      503,
    );
  return value;
}
export function encrypt(value: string) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", key(), iv);
  return Buffer.concat([
    iv,
    c.update(value),
    c.final(),
    c.getAuthTag(),
  ]).toString("base64");
}
export function decrypt(value: string) {
  const b = Buffer.from(value, "base64");
  if (b.length < 29)
    throw bad("Stored Etsy connection is invalid. Reconnect Etsy.", 409);
  const c = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
  c.setAuthTag(b.subarray(-16));
  return Buffer.concat([c.update(b.subarray(12, -16)), c.final()]).toString();
}
export function setup() {
  const expected =
    (process.env.WEB_ORIGIN?.startsWith("https://")
      ? process.env.WEB_ORIGIN
      : "https://crysmona.vercel.app"
    ).replace(/\/$/, "") + "/api/inventory/etsy/callback";
  const requirements = [
    {
      name: "ETSY_CLIENT_ID",
      present: Boolean(process.env.ETSY_CLIENT_ID?.trim()),
      description: "Etsy app Keystring",
    },
    {
      name: "ETSY_SHARED_SECRET",
      present: Boolean(process.env.ETSY_SHARED_SECRET?.trim()),
      description: "Etsy app Shared Secret",
    },
    {
      name: "ETSY_REDIRECT_URI",
      present: false,
      description: "Exact HTTPS callback URL",
    },
    {
      name: "INV_ENCRYPTION_KEY",
      present: false,
      description: "Base64-encoded 32-byte encryption key",
    },
  ];
  try {
    const url = new URL(process.env.ETSY_REDIRECT_URI || "");
    requirements[2].present =
      url.protocol === "https:" &&
      url.pathname === "/api/inventory/etsy/callback" &&
      !url.search &&
      !url.hash &&
      (!process.env.WEB_ORIGIN ||
        url.origin === new URL(process.env.WEB_ORIGIN).origin);
  } catch {}
  try {
    key();
    requirements[3].present = true;
  } catch {}
  return {
    ready: requirements.every((r) => r.present),
    requirements,
    callback: expected,
  };
}
export function config() {
  const s = setup();
  if (!s.ready)
    throw bad(
      "Finish Etsy setup: " +
        s.requirements
          .filter((r) => !r.present)
          .map((r) => r.name)
          .join(", ") +
        ".",
      503,
    );
  return {
    client: process.env.ETSY_CLIENT_ID!.trim(),
    secret: process.env.ETSY_SHARED_SECRET!.trim(),
    redirect: process.env.ETSY_REDIRECT_URI!,
  };
}
function rejectEtsy(status: number): never {
  if (status === 401)
    throw bad("Etsy authorization expired. Reconnect your shop.", 409);
  if (status === 403)
    throw bad(
      "Etsy denied shop access. Authorize the shop owner account with order-read access.",
      403,
    );
  if (status === 429)
    throw bad(
      "Etsy rate limit reached. Wait a few minutes before retrying.",
      429,
    );
  throw bad("Etsy could not complete this request. Try again later.", 502);
}
export async function tokens(params: Record<string, string>) {
  const response = await fetch(API + "public/oauth/token", {
    method: "POST",
    body: new URLSearchParams({ ...params, client_id: config().client }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw bad("Etsy authorization failed. Connect your shop again.", 409);
  const data = (await response.json()) as any;
  if (
    typeof data.access_token !== "string" ||
    typeof data.refresh_token !== "string" ||
    !Number.isFinite(data.expires_in) ||
    data.expires_in <= 0
  )
    throw bad("Invalid Etsy authorization response.", 502);
  return data;
}
async function request(path: string, access: string) {
  const cfg = config();
  const response = await fetch(API + "application/" + path, {
    headers: {
      "x-api-key": cfg.client + ":" + cfg.secret,
      Authorization: "Bearer " + access,
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) rejectEtsy(response.status);
  return response.json() as Promise<any>;
}
export async function discoverShop(data: any) {
  const owner = /^(\d+)\./.exec(data.access_token)?.[1];
  if (!owner)
    throw bad("Etsy returned an invalid account token. Connect again.", 502);
  const shop = await request(`users/${owner}/shops`, data.access_token);
  if (!shop.shop_id || String(shop.user_id) !== owner)
    throw bad(
      "No Etsy shop was found for this account. Sign in as the shop owner.",
      409,
    );
  if (
    process.env.ETSY_SHOP_ID &&
    String(shop.shop_id) !== process.env.ETSY_SHOP_ID
  )
    throw bad(
      "This account owns a different shop from ETSY_SHOP_ID. Use the configured shop owner account.",
      409,
    );
  await request(`shops/${shop.shop_id}/receipts?limit=1`, data.access_token);
  return {
    id: String(shop.shop_id),
    name: String(shop.shop_name || shop.shop_id),
  };
}
export async function save(shop: string, data: any, name?: string) {
  await q(
    `INSERT INTO inv_integrations(shop_id,tokens,expires_at,shop_name) VALUES($1,$2,now()+$3*interval '1 second',$4) ON CONFLICT(shop_id) DO UPDATE SET tokens=excluded.tokens,expires_at=excluded.expires_at,shop_name=COALESCE(NULLIF(excluded.shop_name,''),inv_integrations.shop_name)`,
    [shop, encrypt(JSON.stringify(data)), data.expires_in, name || ""],
  );
}
async function connection() {
  const rows = (await q("SELECT * FROM inv_integrations ORDER BY shop_id"))
    .rows;
  const row = process.env.ETSY_SHOP_ID
    ? rows.find((r) => r.shop_id === process.env.ETSY_SHOP_ID)
    : rows.length === 1
      ? rows[0]
      : undefined;
  if (!row)
    throw bad(
      rows.length > 1
        ? "More than one Etsy shop is stored. Disconnect and connect the intended shop."
        : "Connect Etsy first.",
      409,
    );
  return row;
}
const refreshing = new Map<string, Promise<any>>();
async function authorized() {
  const row = await connection();
  let data: any;
  try {
    data = JSON.parse(decrypt(row.tokens));
  } catch {
    throw bad(
      "Stored Etsy tokens cannot be read. Check INV_ENCRYPTION_KEY or reconnect Etsy.",
      409,
    );
  }
  if (new Date(row.expires_at).getTime() < Date.now() + 60000) {
    let pending = refreshing.get(row.shop_id);
    if (!pending) {
      pending = (async () => {
        const fresh = await tokens({
          grant_type: "refresh_token",
          refresh_token: data.refresh_token,
        });
        await save(row.shop_id, fresh);
        return fresh;
      })().finally(() => refreshing.delete(row.shop_id));
      refreshing.set(row.shop_id, pending);
    }
    data = await pending;
  }
  return { row, data };
}
export async function testConnection() {
  const { row, data } = await authorized();
  await request(`shops/${row.shop_id}/receipts?limit=1`, data.access_token);
  return {
    ok: true,
    shopId: row.shop_id,
    shopName: row.shop_name || row.shop_id,
  };
}
export async function receipts() {
  const { row, data } = await authorized();
  const results: any[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await request(
      `shops/${row.shop_id}/receipts?limit=100&offset=${offset}&sort_on=created&sort_order=asc`,
      data.access_token,
    );
    if (!Array.isArray(page.results))
      throw bad("Invalid Etsy order response. No orders were imported.", 502);
    results.push(...page.results);
    if (page.results.length < 100) break;
    if (offset >= 9900)
      throw bad(
        "More than 10,000 Etsy receipts need a batched import. No orders were imported.",
        422,
      );
  }
  return results;
}
export function orderState(
  order: any,
): "open" | "shipped" | "cancelled" | null {
  const status = String(order.status || "").toLowerCase();
  if (
    order.is_canceled === true ||
    status === "canceled" ||
    status === "cancelled"
  )
    return "cancelled";
  if (!order.is_paid) return null;
  return order.is_shipped ? "shipped" : "open";
}
