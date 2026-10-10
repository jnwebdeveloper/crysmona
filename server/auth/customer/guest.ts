import crypto from "node:crypto";
import { q } from "../../lib/db.js";
import { hash, readCookie } from "../../lib/http.js";
import { currentCustomerId } from "./session.js";

// Guest identity for bag and wishlist (crysmona_guest cookie), and merging a
// guest's bag and wishlist into the customer account on sign-in.
const GUEST_COOKIE = "crysmona_guest";

// Owner key for bag/wishlist rows: "user:<id>" when signed in, otherwise
// "guest:<token hash>", issuing a guest cookie on first visit.
export async function owner(req: any, res: any) {
  const userId = await currentCustomerId(req);
  if (userId) return `user:${userId}`;
  let token = readCookie(req, GUEST_COOKIE);
  if (!token) {
    token = crypto.randomBytes(32).toString("base64url");
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.append("Set-Cookie", `${GUEST_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`);
  }
  const key = hash(token);
  await q(
    "INSERT INTO guest_sessions(token_hash,expires_at) VALUES($1,now()+interval '30 days') ON CONFLICT(token_hash) DO UPDATE SET expires_at=EXCLUDED.expires_at",
    [key],
  );
  return `guest:${key}`;
}

// Moves the guest's bag (quantities added, capped at 99) and wishlist to the user.
export async function claimGuestState(req: any, userId: number) {
  const token = readCookie(req, GUEST_COOKIE);
  if (!token) return;
  const guest = `guest:${hash(token)}`,
    user = `user:${userId}`;
  await q(
    "INSERT INTO carts(owner_key,product_id,quantity) SELECT $1,product_id,quantity FROM carts WHERE owner_key=$2 ON CONFLICT(owner_key,product_id) DO UPDATE SET quantity=LEAST(99,carts.quantity+EXCLUDED.quantity),updated_at=now()",
    [user, guest],
  );
  await q("DELETE FROM carts WHERE owner_key=$1", [guest]);
  await q(
    "INSERT INTO wishlists(user_id,product_id) SELECT $1,product_id FROM guest_wishlists WHERE owner_key=$2 ON CONFLICT DO NOTHING",
    [userId, guest],
  );
  await q("DELETE FROM guest_wishlists WHERE owner_key=$1", [guest]);
}
