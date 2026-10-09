import { createHash, randomBytes } from "node:crypto";
import type { CookieOptions, Response } from "express";

export const SESSION_COOKIE = "crysmona_admin";
export const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const newSessionToken = () => randomBytes(32).toString("hex");

export function readSessionToken(
  header: string | undefined,
): string | undefined {
  const values = (header || "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (values.length !== 1) return undefined;
  const token = values[0].slice(SESSION_COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : undefined;
}

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/api/admin",
  };
}
export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    ...cookieOptions(),
    maxAge: SESSION_LIFETIME_MS,
  });
}
export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}
