import cors from "cors";
import "dotenv/config";
import express from "express";
import { q } from "./core.js";
import admin from "./routes/admin.js";
import auth from "./routes/auth.js";
import catalog from "./routes/catalog.js";
import commerce from "./routes/commerce.js";
import contact from "./routes/contact.js";
import media from "./routes/media.js";
import wishlist from "./routes/wishlist.js";
import cart from "./routes/cart.js";
import adminAuth from "./routes/admin-auth.js";
import { adminRequestSecurity } from "./auth/middleware.js";
import { ensureStateSchema } from "./state.js";
const webOrigin = process.env.WEB_ORIGIN || "http://localhost:5173";
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.WEB_ORIGIN || new URL(webOrigin).protocol !== "https:")
) {
  throw new Error(
    "Set WEB_ORIGIN to the HTTPS storefront origin in production.",
  );
}
if (process.env.PAYPAL_ENV !== "live" && (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET)) console.warn("PayPal sandbox is disabled until PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are configured.");
const app = express();
app.disable("x-powered-by");
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
app.use(express.json({ limit: "2mb" }));
app.get("/api/health", async (_req, res) => {
  await q("select 1");
  res.json({ ok: true, database: "connected" });
});
app.use(catalog);
app.use(auth);
app.use(wishlist);
app.use(cart);
app.use(contact);
app.use(commerce);
app.use("/api/admin", adminRequestSecurity(webOrigin));
app.use(adminAuth);
app.use(admin);
app.use(media);
app.use((err: any, _req: any, res: any, _next: any) => {
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
  if (!err.status) console.error(err.message);
  res
    .status(
      err.status ||
        (["23505", "23503", "22P02", "23514"].includes(err.code) ? 400 : 500),
    )
    .json({ error: message });
});
const port = Number(process.env.API_PORT || 4000);
ensureStateSchema()
  .then(() => {
    app.listen(port, "127.0.0.1", () =>
      console.log("Crysmona API ready on port " + port),
    );
  })
  .catch((error) => {
    console.error("Unable to initialize required database state:", error);
    process.exit(1);
  });
