import { bad } from "../errors.js";

// Twilio Verify generates, delivers, stores and checks the code, so no OTP state
// lives on this server (required for serverless instances that share nothing).
export const twilioReady = () =>
  Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_VERIFY_SERVICE_SID,
  );

// The storefront collects a 10-digit national number; Twilio needs E.164.
export const toE164 = (phone: string) =>
  (process.env.OTP_COUNTRY_CODE || "+91").trim() + phone;

// Customer-facing messages for Twilio error codes worth distinguishing.
const messages: Record<number, [string, number]> = {
  21211: ["That phone number is not valid.", 400],
  60200: ["That phone number is not valid.", 400],
  60205: ["This number cannot receive SMS. Please use a mobile number.", 400],
  21608: [
    "This number is not verified on the Twilio trial account. Add it under Verified Caller IDs to test.",
    400,
  ],
  21614: ["That phone number cannot receive SMS.", 400],
  60203: ["Too many codes were requested. Please try again later.", 429],
  60202: ["Too many incorrect attempts. Please request a new code.", 429],
  60410: ["SMS to this number is temporarily blocked. Please try again later.", 429],
  20404: ["This code has expired. Please request a new one.", 401],
};

async function verify(path: string, form: Record<string, string>) {
  if (!twilioReady())
    throw bad("Phone sign-in is unavailable until SMS is configured.", 503);
  const auth = Buffer.from(
    process.env.TWILIO_ACCOUNT_SID + ":" + process.env.TWILIO_AUTH_TOKEN,
  ).toString("base64");
  let response: Response;
  try {
    response = await fetch(
      "https://verify.twilio.com/v2/Services/" +
        encodeURIComponent(process.env.TWILIO_VERIFY_SERVICE_SID!) +
        path,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + auth,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(form),
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    throw bad("We could not reach the SMS service. Please try again.", 502);
  }
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    const known = messages[body.code];
    if (known) throw bad(known[0], known[1]);
    console.error("Twilio Verify error", response.status, body.code, body.message);
    throw bad("We could not send or check the code. Please try again.", 502);
  }
  return body;
}

export async function sendCode(phone: string) {
  await verify("/Verifications", { To: toE164(phone), Channel: "sms" });
}

export async function checkCode(phone: string, code: string) {
  const result = await verify("/VerificationCheck", {
    To: toE164(phone),
    Code: code,
  });
  return result.status === "approved";
}
