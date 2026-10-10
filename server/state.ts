import crypto from "node:crypto";
import { hash, q } from "./core.js";

export async function ensureStateSchema() {
  await q(`CREATE TABLE IF NOT EXISTS guest_sessions (token_hash TEXT PRIMARY KEY, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await q(`CREATE TABLE IF NOT EXISTS carts (owner_key TEXT NOT NULL, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 99), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(owner_key, product_id))`);
  await q(`CREATE TABLE IF NOT EXISTS guest_wishlists (owner_key TEXT NOT NULL, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(owner_key, product_id))`);
  await q(`CREATE INDEX IF NOT EXISTS carts_owner_idx ON carts(owner_key)`);
  await q(`CREATE INDEX IF NOT EXISTS guest_wishlists_owner_idx ON guest_wishlists(owner_key)`);
  await q(`CREATE TABLE IF NOT EXISTS otp_sends (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, phone TEXT NOT NULL, ip_hash TEXT NOT NULL, sent_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await q(`CREATE INDEX IF NOT EXISTS otp_sends_phone_idx ON otp_sends(phone, sent_at)`);
  await q(`CREATE INDEX IF NOT EXISTS otp_sends_ip_idx ON otp_sends(ip_hash, sent_at)`);
}

function cookie(req: any, name: string) {
  return (req.headers.cookie || "").split(";").map((v: string) => v.trim()).find((v: string) => v.startsWith(name + "="))?.slice(name.length + 1);
}
export async function owner(req: any, res: any) {
  const auth = cookie(req, "crysmona_session");
  if (auth) {
    const user = (await q("SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=$1 AND expires_at>now()", [hash(auth)])).rows[0];
    if (user) return `user:${user.id}`;
  }
  let token = cookie(req, "crysmona_guest");
  if (!token) {
    token = crypto.randomBytes(32).toString("base64url");
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.append("Set-Cookie", `crysmona_guest=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`);
  }
  const key = hash(token);
  await q("INSERT INTO guest_sessions(token_hash,expires_at) VALUES($1,now()+interval '30 days') ON CONFLICT(token_hash) DO UPDATE SET expires_at=EXCLUDED.expires_at", [key]);
  return `guest:${key}`;
}
export async function claimGuestState(req:any,userId:number){const token=cookie(req,"crysmona_guest");if(!token)return;const guest=`guest:${hash(token)}`,user=`user:${userId}`;await q("INSERT INTO carts(owner_key,product_id,quantity) SELECT $1,product_id,quantity FROM carts WHERE owner_key=$2 ON CONFLICT(owner_key,product_id) DO UPDATE SET quantity=LEAST(99,carts.quantity+EXCLUDED.quantity),updated_at=now()",[user,guest]);await q("DELETE FROM carts WHERE owner_key=$1",[guest]);await q("INSERT INTO wishlists(user_id,product_id) SELECT $1,product_id FROM guest_wishlists WHERE owner_key=$2 ON CONFLICT DO NOTHING",[userId,guest]);await q("DELETE FROM guest_wishlists WHERE owner_key=$1",[guest]);}
