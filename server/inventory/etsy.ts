import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { q } from "../lib/db.js";
import { bad } from "../lib/errors.js";
function key() {
  const value = Buffer.from(process.env.INV_ENCRYPTION_KEY || "", "base64");
  if (value.length !== 32)
    throw bad(
      "Configure INV_ENCRYPTION_KEY as a base64 encoded 32-byte key.",
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
  const b = Buffer.from(value, "base64"),
    c = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
  c.setAuthTag(b.subarray(-16));
  return Buffer.concat([c.update(b.subarray(12, -16)), c.final()]).toString();
}
export function config() {
  const client = process.env.ETSY_CLIENT_ID,
    secret = process.env.ETSY_SHARED_SECRET,
    redirect = process.env.ETSY_REDIRECT_URI;
  if (!client || !secret || !redirect)
    throw bad("Configure Etsy client ID, shared secret and redirect URI.", 503);
  key();
  return { client, secret, redirect };
}
export async function tokens(params: Record<string, string>) {
  const response = await fetch("https://api.etsy.com/v3/public/oauth/token", {
    method: "POST",
    body: new URLSearchParams({ ...params, client_id: config().client }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw bad("Etsy authorization failed. Reconnect your shop.", 502);
  const data = (await response.json()) as any;
  if (!data.access_token || !data.refresh_token)
    throw bad("Invalid Etsy token response.", 502);
  return data;
}
export async function save(shop: string, data: any) {
  await q(
    `INSERT INTO inv_integrations(shop_id,tokens,expires_at) VALUES($1,$2,now()+$3*interval '1 second') ON CONFLICT(shop_id) DO UPDATE SET tokens=excluded.tokens,expires_at=excluded.expires_at`,
    [shop, encrypt(JSON.stringify(data)), data.expires_in],
  );
}
export async function receipts() {
  const shop = process.env.ETSY_SHOP_ID;
  if (!shop || !/^\d+$/.test(shop)) throw bad("Configure ETSY_SHOP_ID.", 503);
  const row = (
    await q("SELECT * FROM inv_integrations WHERE shop_id=$1", [shop])
  ).rows[0];
  if (!row) throw bad("Connect Etsy first.");
  let data = JSON.parse(decrypt(row.tokens));
  if (new Date(row.expires_at).getTime() < Date.now() + 60000) {
    data = await tokens({
      grant_type: "refresh_token",
      refresh_token: data.refresh_token,
    });
    await save(shop, data);
  }
  const results: any[] = [];
  for (let offset = 0; ; offset += 100) {
    const response = await fetch(
      `https://api.etsy.com/v3/application/shops/${shop}/receipts?limit=100&offset=${offset}`,
      {
        headers: {
          "x-api-key": `${config().client}:${config().secret}`,
          Authorization: `Bearer ${data.access_token}`,
        },
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok)
      throw bad(
        "Etsy order sync failed. Try reconnecting or retry later.",
        502,
      );
    const page = (await response.json()) as any;
    results.push(...page.results);
    if (page.results.length < 100) break;
    if (offset >= 9900) throw bad("Too many Etsy receipts for one sync.", 422);
  }
  return results;
}
