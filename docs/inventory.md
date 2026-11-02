# Inventory workspace and website stock

`/inventory` uses active admin staff credentials with a separate session. Inventory tables use `inv_` prefixes in the existing database and initialize automatically on first use. No admin layout changes are required.

## Stock setup

1. Add a product in the website admin. An inventory item and website SKU mapping are created automatically in the same database transaction. Products without a SKU receive a generated `WEB-...` SKU.
2. Existing products missing mappings are linked automatically on upgrade. Existing manual mappings and physical/reserved stock are preserved. Existing matching item SKUs or product references are reused instead of creating duplicate items. Editing a website SKU retains the previous stock item and keeps the old mapping for historical order references.
3. Newly created inventory items start with **zero physical stock**, regardless of the old admin stock field. Receive physical stock using **Stock movements → Receive stock** before selling. Automatic listing does not import historical stock numbers.
4. Website availability is **physical − reserved**. Multiple channel SKUs may share one inventory item; Etsy SKU mapping remains manual. You can still create inventory-only items independently.
5. Manage quantities through inventory. The old product stock column is no longer authoritative; admin product listings/export and website reads show inventory availability. Legacy stock edits do not change available units.

## Website order flow

Creating a website order (COD or pending PayPal) writes the normal admin order, its inventory order, its item quantities and the stock reservation in the same transaction. If stock is insufficient, the whole order is rolled back. Competing checkouts cannot reserve the same available units twice.

Example: physical 50, reserved 0 → order for 2 → physical 50, reserved 2, available 48. Shipping that order → physical 48, reserved 0, available 48. Cancelling an unshipped order instead releases its reservation and restores available stock.

- New orders appear in admin and inventory automatically; no manual website sync is needed for new checkouts.
- Inventory orders show the website order status, payment status, SKUs and quantities. The inventory screen refreshes every 30 seconds while visible, or immediately with Refresh.
- Admin fulfillment updates and inventory stock changes commit together. Shipment consumes reserved physical stock once; delivery does not deduct again. Fulfillment cannot move backwards.
- Customer cancellation and abandoned/failed PayPal checkout release reservations once. Pending PayPal review retains the hold. Live PayPal provider behavior still requires configured credentials.
- Prices, discounts, descriptions, images, customers and payments remain in the normal website tables. Inventory stores operational order references and quantities, without copying customer addresses.

## Existing orders and reconciliation

**Sync website orders** reconciles existing non-draft orders through the same idempotent stock lifecycle. Older orders must have SKU mappings and sufficient stock before reconciliation. It stops on an unmapped SKU or insufficient stock; previously successful orders stay committed and retries are safe.

Before cutover, reconcile outstanding orders and past shipments with your opening stock. A previously unseen shipped order deducts physical units once. An open order reserves units, including pending COD/PayPal orders. An older cancelled order without an inventory record has no stock effect. Previously imported orders are not deducted again.

Do not manually release reservations owned by an imported order. Refunds/returns after shipment and edits to imported line quantities need a documented stock adjustment; terminal inventory orders cannot be reopened. History displays the latest 100 syncs and 200 movements/orders; older records remain stored.

## Etsy

Etsy receipt imports remain manual and never publish quantities back to Etsy. Map Etsy SKUs before importing. Optional listing IDs are local references.

Set these server-only environment variables:

- `ETSY_CLIENT_ID`: app keystring.
- `ETSY_SHARED_SECRET`: app shared secret.
- `ETSY_SHOP_ID`: numeric shop ID.
- `ETSY_REDIRECT_URI`: `https://crysmona.vercel.app/api/inventory/etsy/callback`, registered in your Etsy app.
- `INV_ENCRYPTION_KEY`: base64 encoded 32-byte random key. Generate with `openssl rand -base64 32` and keep stable.

Connect Etsy from Integrations and approve order read access. OAuth uses PKCE, session-bound expiring state, AES-256-GCM encrypted tokens and token refresh. Official reference: https://developer.etsy.com/documentation/essentials/authentication/

## Deployment and checks

Deploy the updated code normally. Existing inventory tables are reused. Automatic initialization also installs the `012-inventory-auto-products.sql` product-linking triggers and backfills missing website mappings. Deploying is sufficient; no separate command is required. The additive explicit installer remains available as `npm run db:migrate:inventory`.

Checks: `npm run build`, `npm run check:server`, `node --import tsx --test tests/inventory.test.ts`. Against an isolated test database with the existing schema/seed and an active development admin, run `INV_TEST_DATABASE=1 DATABASE_URL=... node --import tsx --test tests/inventory-checkout-db.test.ts tests/inventory-db.test.ts`. Never point fixture tests at production.
