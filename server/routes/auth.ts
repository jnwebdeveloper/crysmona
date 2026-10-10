import express from "express";
import crypto from "node:crypto";
import { bad, clientIp, customer, hash, pool, q } from "../core.js";
import { claimGuestState } from "../state.js";
import { checkCode, sendCode, twilioReady } from "../services/twilio.js";
import { log, maskPhone } from "../logger.js";
const app = express.Router();
// Without Twilio, development falls back to a fixed code and no SMS is sent;
// production refuses phone sign-in rather than accept a guessable code.
const DEMO_CODE = "123456";
const demoMode = () =>
  !twilioReady() && process.env.NODE_ENV !== "production";
app.get("/api/auth/config", (_req, res) =>
  res.json({ demo: demoMode(), sms: twilioReady() }),
);
// Each SMS costs money, so sends are throttled in the database (shared by every
// serverless instance): 30s between codes and 5/hour per number, 10/hour per IP.
async function recordSend(phone: string, ipHash: string) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(hashtext('otp:' || $1))", [phone]);
    await c.query("DELETE FROM otp_sends WHERE sent_at < now() - interval '1 day'");
    const { rows } = await c.query(
      `SELECT
         count(*) FILTER (WHERE phone = $1 AND sent_at > now() - interval '30 seconds')::int AS recent,
         count(*) FILTER (WHERE phone = $1 AND sent_at > now() - interval '1 hour')::int AS phone_hour,
         count(*) FILTER (WHERE ip_hash = $2 AND sent_at > now() - interval '1 hour')::int AS ip_hour
       FROM otp_sends WHERE (phone = $1 OR ip_hash = $2) AND sent_at > now() - interval '1 hour'`,
      [phone, ipHash],
    );
    const { recent, phone_hour, ip_hour } = rows[0];
    if (recent)
      throw bad("Please wait 30 seconds before requesting another code.", 429);
    if (phone_hour >= 5 || ip_hour >= 10)
      throw bad("Too many codes were requested. Please try again in an hour.", 429);
    const inserted = await c.query(
      "INSERT INTO otp_sends(phone, ip_hash) VALUES($1, $2) RETURNING id",
      [phone, ipHash],
    );
    await c.query("COMMIT");
    return inserted.rows[0].id as string;
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}
app.post("/api/auth/request-otp", async (req, res) => {
  const phone = String(req.body.phone || "");
  if (!/^\d{10}$/.test(phone)) throw bad("Enter a 10-digit phone number.");
  if (!twilioReady() && !demoMode())
    throw bad(
      "Phone sign-in is unavailable until an SMS provider is configured.",
      503,
    );
  const sendId = await recordSend(phone, hash("ip:" + clientIp(req)));
  log.info("otp requested", {
    requestId: (req as any).id,
    phone: maskPhone(phone),
    mode: demoMode() ? "demo" : "twilio",
  });
  if (demoMode()) return res.json({ ok: true, demoCode: DEMO_CODE });
  try {
    await sendCode(phone);
  } catch (error) {
    // A failed delivery (e.g. invalid or unverified number) should not use up the quota.
    await q("DELETE FROM otp_sends WHERE id = $1", [sendId]);
    throw error;
  }
  res.json({ ok: true });
});
app.post("/api/auth/verify-otp", async (req, res) => {
  const phone = String(req.body.phone || "");
  const otp = String(req.body.otp || "");
  if (!/^\d{10}$/.test(phone) || !/^\d{4,10}$/.test(otp))
    throw bad("Enter the code sent to your phone.");
  if (twilioReady()) {
    // Twilio enforces expiry (10 minutes) and a maximum of 5 checks per code.
    if (!(await checkCode(phone, otp)))
      throw bad("That code is incorrect. Please try again.", 401);
  } else if (demoMode()) {
    const recent = await q(
      "SELECT 1 FROM otp_sends WHERE phone = $1 AND sent_at > now() - interval '10 minutes' LIMIT 1",
      [phone],
    );
    if (!recent.rowCount) throw bad("Request a new verification code.", 401);
    if (otp !== DEMO_CODE)
      throw bad("That code is incorrect. Please try again.", 401);
  } else {
    throw bad("Phone sign-in is unavailable until an SMS provider is configured.", 503);
  }
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
  log.info("customer signed in", {
    requestId: (req as any).id,
    userId: rows[0].id,
    phone: maskPhone(phone),
  });
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
