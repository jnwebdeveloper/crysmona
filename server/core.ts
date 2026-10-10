import "dotenv/config";
import crypto from "node:crypto";
import { q } from "./db.js";
import { bad } from "./errors.js";
export { pool, q } from "./db.js";
export { bad } from "./errors.js";
export const dto = (p: any) => ({
  id: p.id,
  categoryId: p.category_id,
  slug: p.slug,
  name: p.name,
  image: p.image_url,
  price: new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(p.price_cents / 100),
  priceCents: p.price_cents,
  note: p.note || "",
  stone: p.stone || "",
  metal: p.metal || "",
  description: p.description || "",
  kind: p.kind,
  specifications: p.specifications || {},
  stockQty: p.stock_qty,
});
export const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");
// Vercel's edge overwrites x-real-ip with the connecting client's address, so it is
// only trusted there; elsewhere req.ip honours the explicit TRUST_PROXY allowlist.
export const clientIp = (req: any): string => {
  const vercelIp = process.env.VERCEL && req.headers["x-real-ip"];
  return (typeof vercelIp === "string" && vercelIp) || req.ip || "unknown";
};
export async function customer(req: any, res: any, next: any) {
  try {
    const token = (req.headers.cookie || "")
      .split(";")
      .map((x: string) => x.trim())
      .find((x: string) => x.startsWith("crysmona_session="))
      ?.split("=")[1];
    if (!token) throw bad("Please sign in to continue.", 401);
    const { rows } = await q(
      "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=$1 AND expires_at>now()",
      [hash(token)],
    );
    if (!rows[0])
      throw bad("Your session has expired. Please sign in again.", 401);
    req.customer = rows[0];
    next();
  } catch (e) {
    next(e);
  }
}
