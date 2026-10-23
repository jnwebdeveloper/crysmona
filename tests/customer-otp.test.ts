import assert from "node:assert/strict";
import { test } from "node:test";
import { pool } from "../server/lib/db.js";
import {
  demoMode,
  smsEnabled,
  requestOtp,
  verifyOtp,
  parsePhone,
} from "../server/auth/customer/otp.js";

test("temporary fixed code works in production with SMS credentials configured and no provider calls", async (t) => {
  const previous = { ...process.env };
  process.env.NODE_ENV = "production";
  process.env.TWILIO_ACCOUNT_SID = "configured";
  process.env.TWILIO_AUTH_TOKEN = "configured";
  process.env.TWILIO_VERIFY_SERVICE_SID = "configured";
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("SMS must not be called");
  });
  let recent = true;
  let throttled = false;
  t.mock.method(
    pool,
    "connect",
    async () =>
      ({
        query: async (sql: string) => {
          if (sql.includes("count(*) FILTER"))
            return {
              rows: [{ recent: throttled ? 1 : 0, phone_hour: 0, ip_hour: 0 }],
            };
          return { rows: [{ id: "request-1" }] };
        },
        release() {},
      }) as any,
  );
  t.mock.method(
    pool,
    "query",
    async () =>
      ({
        rows: recent ? [{ exists: 1 }] : [],
        rowCount: recent ? 1 : 0,
      }) as any,
  );
  try {
    assert.equal(demoMode(), true);
    assert.equal(smsEnabled(), false);
    assert.deepEqual(await requestOtp("9876543210", "test-ip"), {
      demoCode: "123456",
    });
    await verifyOtp("9876543210", "123456");
    await assert.rejects(verifyOtp("9876543210", "000000"), /incorrect/);
    recent = false;
    await assert.rejects(verifyOtp("9876543210", "123456"), /Request a new/);
    throttled = true;
    await assert.rejects(requestOtp("9876543210", "test-ip"), /30 seconds/);
    assert.equal((globalThis.fetch as any).mock.callCount(), 0);
    assert.throws(() => parsePhone("123"), /10-digit/);
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});
