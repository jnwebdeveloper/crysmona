import type { RequestHandler } from "express";
import { bad } from "../errors.js";
import { hashToken, readSessionToken } from "./cookies.js";
import type { AdminRepository, SessionAccount } from "./repository.js";

declare global {
  namespace Express {
    interface Request {
      adminAccount?: SessionAccount;
      adminTokenHash?: string;
    }
  }
}

export function requireAdmin(repository: AdminRepository): RequestHandler {
  return async (req, _res, next) => {
    try {
      const token = readSessionToken(req.headers.cookie);
      if (!token) throw bad("Please sign in to the admin panel.", 401);
      const tokenHash = hashToken(token);
      const account = await repository.findSession(tokenHash);
      if (!account)
        throw bad("Your admin session has expired. Please sign in again.", 401);
      req.adminAccount = account;
      req.adminTokenHash = tokenHash;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function adminRequestSecurity(webOrigin: string): RequestHandler {
  const allowedOrigin = new URL(webOrigin).origin;
  return (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.headers.origin;
    const fetchSite = req.headers["sec-fetch-site"];
    // Same-site sibling domains are not trusted. Non-browser clients may omit both headers.
    if (
      (origin !== undefined && origin !== allowedOrigin) ||
      fetchSite === "cross-site" ||
      (origin === undefined &&
        fetchSite !== undefined &&
        fetchSite !== "same-origin")
    ) {
      return next(bad("Cross-site admin requests are not allowed.", 403));
    }
    next();
  };
}
