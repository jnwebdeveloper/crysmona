import express from "express";
import { claimGuestState } from "../auth/customer/guest.js";
import {
  demoMode,
  findOrCreateCustomer,
  parsePhone,
  requestOtp,
  smsEnabled,
  verifyOtp,
} from "../auth/customer/otp.js";
import { customer, endSession, startSession } from "../auth/customer/session.js";
import { clientIp, hash } from "../lib/http.js";
import { log, maskPhone } from "../lib/logger.js";

// Customer phone sign-in (OTP), current customer, and sign-out.
const router = express.Router();

router.get("/api/auth/config", (_req, res) =>
  res.json({ demo: demoMode(), sms: smsEnabled() }),
);

router.post("/api/auth/request-otp", async (req: any, res) => {
  const phone = parsePhone(req.body.phone);
  const result = await requestOtp(phone, hash("ip:" + clientIp(req)), req.id);
  res.json({ ok: true, ...result });
});

router.post("/api/auth/verify-otp", async (req: any, res) => {
  const phone = parsePhone(req.body.phone);
  await verifyOtp(phone, req.body.otp);
  const user = await findOrCreateCustomer(phone);
  await startSession(res, user.id);
  await claimGuestState(req, user.id);
  log.info("customer signed in", { requestId: req.id, userId: user.id, phone: maskPhone(phone) });
  res.json(user);
});

router.get("/api/auth/me", customer, (req: any, res) =>
  res.json({ id: req.customer.id, phone: req.customer.phone, name: req.customer.name }),
);

router.post("/api/auth/logout", customer, async (req, res) => {
  await endSession(req, res);
  res.json({ ok: true });
});

export default router;
