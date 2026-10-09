import express from "express";
import { admin, adminAuthService, adminRepository } from "../auth/index.js";
import {
  clearSessionCookie,
  readSessionToken,
  setSessionCookie,
} from "../auth/cookies.js";
import { bad } from "../errors.js";

const router = express.Router();
// Vercel's edge overwrites x-real-ip with the connecting client's address, so it is
// only trusted there; elsewhere req.ip honours the explicit TRUST_PROXY allowlist.
const clientIp = (req: express.Request) => {
  const vercelIp = process.env.VERCEL && req.headers["x-real-ip"];
  return (typeof vercelIp === "string" && vercelIp) || req.ip || "unknown";
};
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
    res.json({ email: session.email });
  } catch (error) {
    if (error && typeof error === "object" && "retryAfter" in error)
      res.setHeader("Retry-After", String(error.retryAfter));
    throw error;
  }
});
router.get("/api/admin/auth/me", admin, (req, res) =>
  res.json({ email: req.adminAccount!.email }),
);
router.post("/api/admin/auth/logout", admin, async (req, res) => {
  await adminRepository.deleteSession(req.adminTokenHash!);
  clearSessionCookie(res);
  res.json({ ok: true });
});
export default router;
