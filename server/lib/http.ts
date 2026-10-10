import crypto from "node:crypto";
export const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");
// Vercel's edge overwrites x-real-ip with the connecting client's address, so it is
// only trusted there; elsewhere req.ip honours the explicit TRUST_PROXY allowlist.
export const clientIp = (req: any): string => {
  const vercelIp = process.env.VERCEL && req.headers["x-real-ip"];
  return (typeof vercelIp === "string" && vercelIp) || req.ip || "unknown";
};
// Value of one cookie from the request's Cookie header.
export const readCookie = (req: any, name: string): string | undefined =>
  String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(name + "="))
    ?.slice(name.length + 1);
