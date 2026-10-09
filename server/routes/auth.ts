import express from "express";
import crypto from "node:crypto";
import { bad, customer, hash, q } from "../core.js";
import { claimGuestState } from "../state.js";
const app = express.Router();
app.get("/api/auth/config", (_req, res) =>
  res.json({ demo: process.env.NODE_ENV !== "production" }),
);
const challenges = new Map<
  string,
  { code: string; expires: number; attempts: number; sent: number }
>();
app.post("/api/auth/request-otp", async (req, res) => {
  const phone = String(req.body.phone || "");
  if (!/^\d{10}$/.test(phone)) throw bad("Enter a 10-digit phone number.");
  if (process.env.NODE_ENV === "production")
    throw bad(
      "Phone sign-in is unavailable until an SMS provider is configured.",
      503,
    );
  const previous = challenges.get(phone);
  if (previous && Date.now() - previous.sent < 30000)
    throw bad("Please wait 30 seconds before requesting another code.", 429);
  challenges.set(phone, {
    code: "123456",
    expires: Date.now() + 300000,
    attempts: 0,
    sent: Date.now(),
  });
  res.json({ ok: true, demoCode: "123456" });
});
app.post("/api/auth/verify-otp", async (req, res) => {
  const phone = String(req.body.phone || "");
  const challenge = challenges.get(phone);
  if (!challenge || challenge.expires < Date.now() || challenge.attempts >= 5)
    throw bad("Request a new verification code.", 401);
  challenge.attempts++;
  if (String(req.body.otp) !== challenge.code)
    throw bad("That code is incorrect. Please try again.", 401);
  challenges.delete(phone);
  const { rows } = await q(
    "INSERT INTO users(phone) VALUES($1) ON CONFLICT(phone) DO UPDATE SET updated_at=now() RETURNING id,phone,name,email",
    [phone],
  );
  const token = crypto.randomBytes(32).toString("hex");
  await q(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
    [hash(token), rows[0].id],
  );
  await claimGuestState(req, rows[0].id);
  res.cookie("crysmona_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 604800000,
    path: "/",
  });
  res.json(rows[0]);
});
app.get("/api/auth/me", customer, (req: any, res) =>
  res.json({
    id: req.customer.id,
    phone: req.customer.phone,
    name: req.customer.name,
  }),
);

app.post("/api/auth/logout", customer, async (req: any, res) => {
  const token = (req.headers.cookie || "")
    .split(";")
    .map((x: string) => x.trim())
    .find((x: string) => x.startsWith("crysmona_session="))
    ?.split("=")[1];
  await q("DELETE FROM sessions WHERE token_hash=$1", [hash(token || "")]);
  res.clearCookie("crysmona_session", { path: "/" });
  res.json({ ok: true });
});

export default app;
