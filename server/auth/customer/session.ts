import crypto from "node:crypto";
import type { Request, Response } from "express";
import { q } from "../../lib/db.js";
import { bad } from "../../lib/errors.js";
import { hash, readCookie } from "../../lib/http.js";

// Customer sessions: a random token in the HttpOnly crysmona_session cookie, stored
// in the sessions table only as its SHA-256 hash, valid for 7 days.
export const SESSION_COOKIE = "crysmona_session";
const SESSION_DAYS = 7;

// Requires a signed-in customer; sets req.customer.
export async function customer(req: any, _res: any, next: any) {
  try {
    const token = readCookie(req, SESSION_COOKIE);
    if (!token) throw bad("Please sign in to continue.", 401);
    const { rows } = await q(
      "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=$1 AND expires_at>now()",
      [hash(token)],
    );
    if (!rows[0]) throw bad("Your session has expired. Please sign in again.", 401);
    req.customer = rows[0];
    next();
  } catch (e) {
    next(e);
  }
}

// The signed-in customer's id, or undefined (no error) for guests.
export async function currentCustomerId(req: Request): Promise<number | undefined> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return undefined;
  const { rows } = await q(
    "SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=$1 AND expires_at>now()",
    [hash(token)],
  );
  return rows[0]?.id;
}

export async function startSession(res: Response, userId: number) {
  const token = crypto.randomBytes(32).toString("hex");
  await q(
    `INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '${SESSION_DAYS} days')`,
    [hash(token), userId],
  );
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export async function endSession(req: Request, res: Response) {
  await q("DELETE FROM sessions WHERE token_hash=$1", [hash(readCookie(req, SESSION_COOKIE) || "")]);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}
