import express from "express";
import {
  admin,
  adminAuthService,
  adminRepository,
} from "../auth/admin/index.js";
import {
  clearSessionCookie,
  readSessionToken,
  setSessionCookie,
} from "../auth/admin/cookies.js";
import { clientIp, hash } from "../lib/http.js";
import { log } from "../lib/logger.js";
import { bad } from "../lib/errors.js";

const router = express.Router();
router.post("/api/admin/auth/login", async (req, res) => {
  if (!req.is("application/json"))
    throw bad("Send login credentials as JSON.", 415);
  try {
    const session = await adminAuthService.login(
      req.body,
      clientIp(req),
      readSessionToken(req.headers.cookie),
    );
    setSessionCookie(res, session.token);
    log.info("admin signed in", {
      requestId: (req as any).id,
      admin: session.email,
    });
    res.json({ email: session.email });
  } catch (error) {
    // Failed admin logins are a security signal; the attempted password is never logged.
    log.warn("admin sign-in failed", {
      requestId: (req as any).id,
      ipHash: hash("ip:" + clientIp(req)).slice(0, 12),
      reason: error instanceof Error ? error.message : undefined,
    });
    if (error && typeof error === "object" && "retryAfter" in error)
      res.setHeader("Retry-After", String(error.retryAfter));
    throw error;
  }
});
router.get("/api/admin/auth/me", admin, (req, res) =>
  res.json({ email: req.adminAccount!.email }),
);
router.post("/api/admin/auth/password", admin, async (req, res) => {
  if (!req.is("application/json"))
    throw bad("Send the password change as JSON.", 415);
  await adminAuthService.changePassword(
    req.adminAccount!,
    req.body,
    clientIp(req),
    req.adminTokenHash!,
  );
  log.info("admin password changed", {
    requestId: (req as any).id,
    admin: req.adminAccount!.email,
  });
  res.json({ ok: true });
});
router.post("/api/admin/auth/logout", admin, async (req, res) => {
  await adminRepository.deleteSession(req.adminTokenHash!);
  clearSessionCookie(res);
  res.json({ ok: true });
});
export default router;
