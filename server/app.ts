import cors from "cors";
import "dotenv/config";
import express from "express";
import crypto from "node:crypto";
import { q } from "./lib/db.js";
import { log } from "./lib/logger.js";
import admin from "./routes/admin.js";
import customerAuth from "./routes/customer-auth.js";
import catalog from "./routes/catalog.js";
import checkout from "./routes/checkout.js";
import orders from "./routes/orders.js";
import contact from "./routes/contact.js";
import media from "./routes/media.js";
import wishlist from "./routes/wishlist.js";
import cart from "./routes/cart.js";
import adminAuth from "./routes/admin-auth.js";
import { adminRequestSecurity } from "./auth/admin/middleware.js";
import { ensureStateSchema } from "./lib/schema.js";
import { storageConfig } from "./services/storage.js";
const webOrigin = process.env.WEB_ORIGIN || "http://localhost:5173";
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.WEB_ORIGIN || new URL(webOrigin).protocol !== "https:")
) {
  throw new Error(
    "Set WEB_ORIGIN to the HTTPS storefront origin in production.",
  );
}
if (process.env.PAYPAL_ENV !== "live" && (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET)) log.warn("PayPal sandbox is disabled until PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are configured.");
if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET && !process.env.PAYPAL_WEBHOOK_ID) log.warn("PayPal webhooks are disabled until PAYPAL_WEBHOOK_ID is configured; held payments settle only when the customer confirms again.");
const { active: mediaStorage } = storageConfig();
if (mediaStorage) log.info(`Media uploads go to storage ${mediaStorage.id}: ${mediaStorage.name}.`);
else log.warn("Image uploads are disabled until media storage (STORAGE_1_*) is configured.");
const app = express();
app.disable("x-powered-by");
// One log line per request, tagged with a request ID that is also returned to the
// client (X-Request-Id) so a customer-reported error can be matched to its log.
// Only the path is logged: query strings and bodies may carry personal data.
app.use((req: any, res, next) => {
  const started = process.hrtime.bigint();
  const vercelId = req.headers["x-vercel-id"];
  req.id = (typeof vercelId === "string" && vercelId) || crypto.randomUUID();
  res.setHeader("X-Request-Id", req.id);
  res.on("finish", () => {
    const status = res.statusCode;
    const fields = {
      requestId: req.id,
      method: req.method,
      path: req.path,
      status,
      ms: Number((process.hrtime.bigint() - started) / 1_000_000n),
    };
    if (status >= 500) log.error("request failed", fields);
    else if (status >= 400) log.warn("request rejected", fields);
    else log.info("request", fields);
  });
  next();
});
// Only explicitly configured proxy addresses may supply the client IP.
if (process.env.TRUST_PROXY) {
  const proxies = process.env.TRUST_PROXY.split(",").map((value) =>
    value.trim(),
  );
  if (
    proxies.some((value) => !value || value === "true" || /^\d+$/.test(value))
  ) {
    throw new Error(
      "TRUST_PROXY must list trusted proxy IP addresses or CIDRs, not a boolean or hop count.",
    );
  }
  app.set("trust proxy", proxies);
}
app.use(
  cors({
    origin: webOrigin,
    credentials: true,
  }),
);
app.use(
  express.json({
    limit: "2mb",
    // PayPal webhook signatures are verified against the exact bytes received.
    verify: (req: any, _res, buf) => {
      if (req.url?.startsWith("/api/paypal/webhook")) req.rawBody = buf.toString("utf8");
    },
  }),
);
// Serverless instances have no startup hook, so ensure state tables once per cold start.
let stateReady: Promise<void> | undefined;
if (process.env.VERCEL) {
  app.use("/api", async (_req, _res, next) => {
    await (stateReady ??= ensureStateSchema().catch((error) => {
      stateReady = undefined;
      throw error;
    }));
    next();
  });
}
app.get("/api/health", async (_req, res) => {
  await q("select 1");
  res.json({ ok: true, database: "connected" });
});
app.use(catalog);
app.use(customerAuth);
app.use(wishlist);
app.use(cart);
app.use(contact);
app.use(checkout);
app.use(orders);
app.use("/api/admin", adminRequestSecurity(webOrigin));
app.use(adminAuth);
app.use(admin);
app.use(media);
app.use((err: any, req: any, res: any, _next: any) => {
  const message =
    err.code === "23505"
      ? "A record with this value already exists."
      : err.code === "23503"
        ? "The referenced record is missing or still in use."
        : err.code === "22P02"
          ? "A field contains an invalid ID or value."
          : err.code === "23514"
            ? "A field is outside its allowed range."
            : err.status
              ? err.message
              : "The service is unavailable. Please try again.";
  const status =
    err.status ||
    (["23505", "23503", "22P02", "23514"].includes(err.code) ? 400 : 500);
  // Expected rejections (validation, auth) are already covered by the request line;
  // only unexpected failures need the stack. The client sees a generic message.
  if (status >= 500)
    log.error("unhandled error", { requestId: req.id, path: req.path, error: err });
  else
    log.debug("client error", { requestId: req.id, path: req.path, status, reason: message });
  res
    .status(status)
    .json(status >= 500 ? { error: message, requestId: req.id } : { error: message });
});
export default app;
