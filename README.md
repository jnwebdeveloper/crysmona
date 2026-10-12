# Crysmona

React + TypeScript storefront, Express API and PostgreSQL. Prices and payments use **USD**, stored as integer cents. As requested, existing numeric prices were retained: INR 1,200 became USD 1,200, without conversion.

## Run locally

1. Copy `.env.example` to `.env` for a new installation. Keep existing credentials when upgrading.
2. Start PostgreSQL: `npm run db:up`. For this existing workstation, use `docker start crysmona-dev-db`; its port is 5436.
3. Set `DATABASE_URL` to the database **crysmona** (lowercase, following the PostgreSQL convention).
4. Run `npm install`, then `npm run db:setup`.
5. Run `npm run dev`. Store: http://localhost:5173. Admin: http://localhost:5173/admin. Both UIs intentionally share this single browser origin; Vite proxies `/api` internally to the API server on port 4000. Always open `localhost`, not `127.0.0.1`, during development.

For local development, `npm run db:setup` creates a bootstrap admin if that email does not already exist: **admin@crysmona.com** / **CrysmonaAdmin@2026**. Change it immediately with `npm run admin:reset`. Existing admin passwords are never overwritten by setup.

The database is named `crysmona` (lowercase). An older local database named `"Crysmona"` can be renamed with `ALTER DATABASE "Crysmona" RENAME TO crysmona;` while nothing is connected to it. Do not start a second database container on the same port.

## Structure

- `src/main.tsx`: application entry point only.
- `src/App.tsx`: the React Router route table. Admin is lazy-loaded as its own bundle; catalog-dependent routes sit under `RequireStore`, account routes under `RequireLogin`.
- `src/pages`: one file per route (home, listings, product, cart, checkout, PayPal return, orders, order detail, wishlist, contact, content pages, admin, 404).
- `src/components`: reusable UI shared by pages (store layout, route guards, header, footer, login modal, product card and gallery, wishlist button, hero carousel, subscribe form, loader).
- `src/lib`: non-UI state and helpers — `Store.tsx` (API client, `go()` navigation, catalog/user/wishlist), `cart.tsx` (bag context and server sync), `ui.tsx` (toast and login dialog), `model.ts` (types and price formatting).
- `src/hooks`: `useSeo` (per-route meta tags) and `useAnalytics` (Meta Pixel / GA4 with validated IDs).
- `src/styles`: global stylesheets.
- `server/index.ts` / `server/app.ts`: local entry (`listen`) and the Express app (middleware, routes, error handler); `api/index.ts` exports the same app for Vercel.
- `server/lib`: infrastructure — `db.ts` (PostgreSQL pool), `errors.ts`, `logger.ts` (structured logs), `http.ts` (client IP, hashing, cookie reading), `schema.ts` (the single definition of runtime tables, used by the API and `db:setup`).
- `server/auth/admin`: admin email/password sign-in (see the module map below).
- `server/auth/customer`: customer phone sign-in — `otp.ts` (Twilio/demo codes, send throttling), `session.ts` (session cookie, `customer` middleware), `guest.ts` (guest bag/wishlist identity and merge on sign-in).
- `server/routes`: thin HTTP handlers — catalog, cart, wishlist, contact, checkout (quote, place order, PayPal return), orders (history, detail, cancel), customer-auth, admin-auth, admin and media.
- `server/services`: business logic and providers — `orders.ts` (pricing, stock reservation, PayPal capture, cancellation and refunds), `paypal.ts`, `twilio.ts`, `storage.ts` (media buckets), `catalog.ts` (product API shape). PayPal calls run outside database transactions and use per-order request ids, so retries never charge or refund twice.
- `server/scripts`: command-line tools behind the `npm run db:setup`, `admin:create`, `admin:reset`, `media:migrate` and `db:migrate:admin` scripts.
- `shared/`: code used by both the storefront and the server — `adminSchema.ts`/`adminValidation.ts` (admin model fields and forms), `product.ts` (product type and price helpers).
- `database`: schema, transactional migrations and development seed records.

The browser fetches the catalog, inventory, pricing, navigation, page content and settings from PostgreSQL. An unavailable database shows an explicit retry state, never a fabricated preview catalog. Guest and authenticated bag/wishlist state is stored in PostgreSQL. Anonymous continuity uses an HttpOnly guest-session cookie; product data and final order totals are always checked against the database.

The 15 business tables use integer identity primary keys beginning at 1. Foreign keys preserve relations and are indexed. Existing UUIDs remain in `legacy_id` columns for traceability. Sessions use a hashed token primary key and an integer user foreign key. Identity sequences can contain gaps; IDs are never recycled.

## Products, quantity and banners

Add products in Admin → Products & gemstones. Price fields are USD cents (12345 = $123.45). New products start with quantity zero; set a positive whole number before selling. Sold-out cards and detail pages disable purchase controls. Checkout atomically reserves stock and rejects excess quantities.

Carousel slides are active content blocks named `hero`, `hero-02`, `hero-03`, etc. Edit image, title, body and link in Admin → Content. Controls support previous/next, slide selection and pause. Motion pauses while the user interacts and is disabled for reduced-motion preferences.

Support pages are editable content blocks `faq`, `shipping`, `returns`, `care`, `privacy`, and `terms`. Their initial text is basic guidance; the merchant must supply final business policies. Footer social links appear only when `instagram_url` or `facebook_url` are configured in Settings.

## Media storage (Vercel Blob, Cloudflare R2, Amazon S3, others)

Admin image uploads go to Vercel Blob or an S3-compatible bucket. Storage has **not yet been configured**; until it is, the admin shows a clear error and nothing is written to a local uploads directory. Existing bundled images remain available.

Several buckets can be configured as numbered blocks (`STORAGE_1_*`, `STORAGE_2_*`, …), each with `TYPE` `vercel-blob`, `r2`, `s3` or `custom`. `STORAGE_ACTIVE` picks the number that receives new uploads. Images uploaded earlier keep their full URL in the database and keep loading from their original bucket, so switching storage is an `.env` change plus an API restart. Every declared storage is validated at startup. `.env.example` documents each variable.

1. Vercel Blob: in Vercel, open Project → Storage → Create → Blob and connect the store; use its read/write token as `STORAGE_<n>_TOKEN` (or leave it empty on Vercel to use `BLOB_READ_WRITE_TOKEN`), then skip to step 3. Otherwise create a bucket and an access key that can only write to that bucket (R2: an object read/write API token; S3: an IAM user allowed `s3:PutObject` on `arn:aws:s3:::<bucket>/products/*`).
2. Make the bucket publicly readable over HTTPS (R2: custom domain or r2.dev; S3: CloudFront or a public-read bucket policy). A custom domain lets you move buckets later without rewriting saved URLs.
3. Fill in a `STORAGE_<n>_*` block in `.env` and set `STORAGE_ACTIVE`. The older `R2_*` variables still work as storage 1 when no `STORAGE_<n>_*` variables are set.
4. Restart the API. Use the image file input in any admin image field. JPEG, PNG and WebP files up to 8 MB (about 4.2 MB on Vercel, which caps function request bodies) are accepted, checked by signature and sent from memory to the active storage. Only the returned public URL is saved in the product/content record. Credentials never reach the browser.
5. To migrate existing database image references, run `npm run media:migrate` to preview the count; then `npm run media:migrate -- --apply` to upload to the active storage and replace database URLs. This preserves original local files. Unreferenced branding assets remain bundled.

Server-proxied uploads do not require browser-to-bucket CORS. Live storage delivery cannot be verified until credentials exist.

## Checkout and production dependencies

Set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV=sandbox` and the exact `WEB_ORIGIN` for PayPal. Store and PayPal amounts are both USD; the old INR exchange-rate setting is removed. Without credentials, PayPal is explicitly unavailable and development COD checkout remains usable.
Customer phone login sends real SMS codes through Twilio Verify when `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_VERIFY_SERVICE_SID` are set (`OTP_COUNTRY_CODE`, default `+91`, is prefixed to the 10-digit number). Twilio stores and checks the code (10-minute expiry, 5 attempts), and sends are throttled in the `otp_sends` table: 30 seconds between codes, 5 per number and 10 per IP per hour. Trial accounts only deliver to Verified Caller IDs. Without Twilio, development uses the fixed demo code 123456 and production rejects phone sign-in. Admin access uses email/password sign-in with a salted scrypt password hash and an 8-hour HttpOnly session stored in PostgreSQL. Create an account after database setup with `npm run admin:create`; it prompts for email and a hidden, confirmed password. See the admin authentication guide below for upgrades and resets. No access key is accepted. Before public launch, merchant decisions and integrations are still needed for production authentication, payment webhooks/reconciliation, refund processing, delivery policies and tax requirements. Live payments were not executed.

## Deploy to Vercel + Neon

The storefront and API deploy as one Vercel project on one origin. `vercel.json` builds the Vite app into `dist`, rewrites `/api/*` to the Express function in `api/index.ts` (which exports `server/app.ts`), and serves `index.html` for client routes such as `/admin` and `/checkout/paypal`. `server/index.ts` is only the local `listen()` entry.

1. In Neon, create a database named **crysmona** and copy the **pooled** connection string (host contains `-pooler`, keep `?sslmode=require`).
2. From your machine, point `DATABASE_URL` at Neon and run `npm run db:setup`, then `npm run admin:create`.
3. Import the GitHub repository in Vercel and set these environment variables: `DATABASE_URL`, `WEB_ORIGIN` (the exact `https://` production domain), `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV`, the `TWILIO_*` values and `OTP_COUNTRY_CODE` for phone login, and the `STORAGE_*` values for admin uploads. Do not set `DEFAULT_ADMIN_PASSWORD` or `TRUST_PROXY` on Vercel.
4. Deploy, then open `/api/health`; it should report `database: connected`.

On Vercel (`VERCEL` is set by the platform) the database pool is capped at 3 connections per instance, state tables are ensured once per cold start, and admin login rate limiting keys on Vercel's `x-real-ip` header. Admin writes and PayPal returns only work on the domain in `WEB_ORIGIN`, so test those on production rather than preview URLs.

## Verification

- `npm run build`
- `npm run check:server`
- `npm run test:integration` against a **development** API (default `http://127.0.0.1:4011/api`; override `TEST_API_URL`). Requires the same database as the API, development OTP, and currently assumes media storage is unconfigured. Creates isolated test fixtures and cleans them up.

Integration coverage includes all admin resource reads, product creation and inventory edits, numeric IDs, USD amounts, sold-out and invalid quantities, server-controlled pricing, concurrent last-item checkout, order-history protections, OTP sessions, wishlists and unconfigured-storage behavior. Desktop and 390px mobile storefront flows were inspected in the browser. Media storage and live PayPal are configuration-dependent and not claimed as verified.

## v2.2.1 — Orders, PayPal Sandbox, SEO & Meta Pixel

- Customer order details: `/orders/:orderNumber` with line items, totals, payment, fulfilment and delivery address.
- Admin Orders includes **View details** for line items, customer, payment and delivery information.
- **Add to bag** now adds the item and opens `/cart` immediately.
- PayPal checkout uses the server-side Orders v2 flow already included in this project. Configure a PayPal Developer Sandbox REST app in `.env`:
  `PAYPAL_ENV=sandbox`, `PAYPAL_CLIENT_ID=...`, `PAYPAL_CLIENT_SECRET=...`. Never expose the secret in frontend code. Switch `PAYPAL_ENV=live` and use separate live credentials when going live.
- Site-wide SEO reads from PostgreSQL `seo_pages`; product pages receive automatic product metadata when no explicit page row exists.
- Meta Pixel loads site-wide only when `meta_pixel_id` is configured. SPA navigation sends PageView events.
- Admin → Marketing → SEO manages metadata. Admin → Marketing → Pixel & tracking manages the Pixel ID. Leave the Pixel ID blank to disable it.

For an existing database, run `npm run db:setup` once after updating so the new `seo_pages` and `site_settings` tables and default SEO rows are created without deleting existing records.

## v2.3 production-commerce additions
- Store currency is USD throughout storefront, orders and PayPal.
- Order cancellation restores inventory; captured PayPal orders use the PayPal refund API.
- Order status history, refund fields, coupon-redemption model, product-variant model, notification outbox and audit log tables are included.
- Admin dashboard API now reports revenue, average order value, low stock, top products and recent orders.
- SEO adds canonical tags, JSON-LD, dynamic `/sitemap.xml` and `/robots.txt` endpoints.
- Meta Pixel and GA4 are consent-aware. Configure `meta_pixel_id`, `ga4_measurement_id`, `analytics_consent_required`, and `site_url` in admin tracking settings.
- Production OTP/SMS requires Twilio Verify credentials; transactional email still requires a provider. The app deliberately does not fabricate provider accounts or secrets.

Apply the new schema with `npm run db:setup` before starting the updated app.


## v2.3.1 SEO defaults

`npm run db:setup` now creates the SEO table when needed and automatically seeds the standard Crysmona storefront pages. Existing SEO values entered by an admin are preserved; only missing/blank default fields are filled. Product detail SEO continues to be generated dynamically from product data unless a dedicated strategy is added later.


## Admin authentication and password resets

For an existing installation, run `npm run db:migrate:admin` before starting the updated API. This additive migration creates only the shared login-attempt table. New installations also receive it through `npm run db:setup`. Existing accounts and passwords are preserved. Do not run the database tests against a production database.

```sh
npm run db:migrate:admin
npm run admin:create  # create a new account
npm run admin:reset   # reset an existing account
```

Both account commands prompt for an email and a hidden password, with confirmation. New passwords need at least 15 characters and accept spaces/Unicode, with a maximum of 1024 UTF-16 code units. Passwords are not printed. For automation, supply `ADMIN_EMAIL` and `ADMIN_PASSWORD` through a secret manager/environment; do not put passwords in command arguments, committed files, or logs. The development package includes a bootstrap admin configured by `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD`; `db:setup` creates it only when that email is absent. Change it immediately after first login. Production deployments should replace/remove these development defaults. Changing an environment variable alone does not update an existing account.

Resetting a password updates its hash and revokes all of that admin's sessions in one transaction. It also clears the account's login throttle; the source-IP throttle remains. A reset does not reactivate a disabled account. Database access is required; there is deliberately no unauthenticated web reset endpoint. A request already authorized before a reset may finish, but the old session cannot authorize subsequent requests.

### Module map

- `server/lib/db.ts` — shared PostgreSQL connection; production requires explicit `DATABASE_URL`.
- `server/auth/admin/validation.ts` — email normalization and separate login/new-password policies.
- `server/auth/admin/password.ts` — bounded scrypt work, encoded parameters, legacy verification.
- `server/auth/admin/repository.ts` — parameterized account/session queries and reset transactions.
- `server/auth/admin/rate-limit.ts` — atomic, database-backed login throttling.
- `server/auth/admin/service.ts` — login, legacy hash upgrade, creation and reset workflows.
- `server/auth/admin/cookies.ts` — token generation/hashing and cookie options.
- `server/auth/admin/middleware.ts` — typed session authentication and browser request protections.
- `server/auth/admin/index.ts` — wires the database, repository, limiter and service together.
- `server/routes/admin-auth.ts` — HTTP request/response handling only.
- `server/scripts/admin-account.ts` — shared command-line prompts and error handling.

New password hashes have the format `scrypt:v1:131072:8:1:<salt>:<digest>` (N=2^17, r=8, p=1, random 16-byte salt, 64-byte digest). Existing `scrypt:<salt>:<digest>` hashes continue to work and upgrade on successful login. Only known parameter sets and valid encodings are accepted; verification uses timing-safe comparison. Each API process permits at most two concurrent derivations plus sixteen queued jobs to bound memory use. Benchmark on your deployment hardware before changing these limits.

Sessions expire after eight hours. Only SHA-256 token hashes are stored in PostgreSQL. Cookies are HttpOnly, SameSite=Strict, restricted to `/api/admin`, and Secure in production. Admin responses use `Cache-Control: no-store`. Mutation requests reject untrusted browser origins (including sibling subdomains); login requires JSON. Non-browser API clients may omit browser-origin headers but still need valid credentials/session tokens.

Login attempts are limited to 10 per normalized email and 30 per source IP per 15-minute window, including successful attempts. Counters are shared across API processes and survive restarts. This deliberately trades some availability for resistance to guessing; a targeted account can be temporarily throttled. Requests over the limit return 429 with `Retry-After`. Behind a reverse proxy, set `TRUST_PROXY` to its exact addresses/CIDRs and ensure it overwrites forwarded headers; never trust arbitrary forwarded IPs. Without this setting the socket peer is used, so users behind an unconfigured proxy share the IP limit.

Production requires `WEB_ORIGIN` to be the exact HTTPS storefront origin and `DATABASE_URL` to be explicitly configured. Terminate HTTPS at your trusted ingress and keep frontend/API on the same site for the Strict cookie. MFA, breached-password screening, ingress-level traffic limits, and security-event monitoring remain deployment/future work; this refactor is not a complete security audit of the storefront or customer OTP/payment flows.

### Verification

```sh
npm run check:server
npm run test:auth
# Use a dedicated test database. The suite creates/drops its own random schema.
TEST_AUTH_DATABASE_URL=postgresql://... npm run test:auth:db
npm run build
```

The database tests cover reset atomicity/rollback, session revocation/rotation/expiry, stale/concurrent login during reset, shared account throttling and IP-based password spraying. The unit/HTTP tests cover legacy hashes, malformed encodings, validation, token parsing, generic login errors, cookie flags and browser-origin protection.

Security references: [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) and [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).
