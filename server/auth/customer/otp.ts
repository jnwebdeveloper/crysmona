import { pool, q } from "../../lib/db.js";
import { bad } from "../../lib/errors.js";
import { log, maskPhone } from "../../lib/logger.js";
// SMS temporarily paused by owner, including on the live site.
// import { checkCode, sendCode, twilioReady } from "../../services/twilio.js";

// Temporary fixed-code customer login in every environment.
// Restore SMS delivery and verification below when ending the temporary mode.
const DEMO_CODE = "123456";
export const demoMode = () => true;
export const smsEnabled = () => false;

export function parsePhone(value: unknown) {
  const phone = String(value || "");
  if (!/^\d{10}$/.test(phone)) throw bad("Enter a 10-digit phone number.");
  return phone;
}

// Each SMS costs money, so sends are throttled in the database (shared by every
// serverless instance): 30s between codes and 5/hour per number, 10/hour per IP.
async function recordSend(phone: string, ipHash: string) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(hashtext('otp:' || $1))", [
      phone,
    ]);
    await c.query(
      "DELETE FROM otp_sends WHERE sent_at < now() - interval '1 day'",
    );
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
      throw bad(
        "Too many codes were requested. Please try again in an hour.",
        429,
      );
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

// Records a throttled login request and returns the temporary code. No SMS is sent.
export async function requestOtp(
  phone: string,
  ipHash: string,
  requestId?: string,
) {
  await recordSend(phone, ipHash); // Restore `const sendId =` for SMS cleanup below.
  log.info("otp requested", {
    requestId,
    phone: maskPhone(phone),
    mode: demoMode() ? "demo" : "twilio",
  });
  return { demoCode: DEMO_CODE };
  /* SMS delivery temporarily paused:
  if (demoMode()) return { demoCode: DEMO_CODE };
  try {
    await sendCode(phone);
  } catch (error) {
    // A failed delivery (e.g. invalid or unverified number) should not use up the quota.
    await q("DELETE FROM otp_sends WHERE id = $1", [sendId]);
    throw error;
  }
  return {};
  */
}

// Throws unless the code is valid for the phone.
export async function verifyOtp(phone: string, code: unknown) {
  const otp = String(code || "");
  if (!/^\d{4,10}$/.test(otp))
    throw bad("Enter the six-digit verification code.");
  /* SMS verification temporarily paused:
  if (twilioReady()) {
    // Twilio enforces expiry (10 minutes) and a maximum of 5 checks per code.
    if (!(await checkCode(phone, otp))) throw bad("That code is incorrect. Please try again.", 401);
    return;
  }
  */
  const recent = await q(
    "SELECT 1 FROM otp_sends WHERE phone = $1 AND sent_at > now() - interval '10 minutes' LIMIT 1",
    [phone],
  );
  if (!recent.rowCount) throw bad("Request a new verification code.", 401);
  if (otp !== DEMO_CODE)
    throw bad("That code is incorrect. Please try again.", 401);
}

// Finds or creates the customer account for a verified phone number.
export async function findOrCreateCustomer(phone: string) {
  const { rows } = await q(
    "INSERT INTO users(phone) VALUES($1) ON CONFLICT(phone) DO UPDATE SET updated_at=now() RETURNING id,phone,name,email",
    [phone],
  );
  return rows[0] as {
    id: number;
    phone: string;
    name: string | null;
    email: string | null;
  };
}
