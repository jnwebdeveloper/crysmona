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


## Inventory management and refined tables

Inventory uses the admin palette (brown sidebar, cream workspace, gold controls), Montserrat body text and Georgia headings. Stock overview columns are Product/SKU, Location, Physical, Reserved, Available, Low stock, Stock status and Actions. **Low stock** is the editable alert threshold; available units at or below it trigger a low-stock alert, while zero units display Out of stock.

- **Create/read/update items:** Add inventory-only items or edit name, internal SKU, location and threshold. Website products continue to appear automatically. Editing internal SKUs does not rename website/channel SKUs.
- **Archive/restore:** Archive an item to remove it from active stock and make its website availability zero while retaining physical units and history. Clear reservations by fulfilling or cancelling orders first. Restore makes its unreserved stock available again.
- **Delete:** Permanently delete only empty items without website links, mappings, movements or order history. Archive used items instead.
- **Mappings:** Create, edit/reassign and delete standalone channel mappings. Active website product mappings cannot be deleted or have their channel/SKU renamed from inventory; change the website SKU in admin or archive the item. Existing orders keep the item they originally reserved.
- **Audit records:** Stock quantities change through documented movements. Movements, order records and sync history remain retained records rather than editable/deletable rows.
- **Tables:** Search, sortable columns, pagination (10/20/50/100 rows) and CSV export operate on the records loaded in the current view. The stock filter offers active, low stock, out of stock, archived and all items. Exports omit action buttons and respect the current filter/search.

The automatic installer adds `inv_items.archived` using `013-inventory-refinements.sql`. Tests for edit/delete protections, archiving and availability are in `tests/inventory-crud-db.test.ts` and require the same isolated database opt-in as other database tests.

## Dashboard, complete SKU search and partial shipments

`/inventory` now opens the Dashboard. It shows available/reserved units, orders awaiting shipment, partially shipped orders, low/out-of-stock counts, stock-health distribution, website order pipeline, recorded shipments today in IST, seven-day stock movements and recent activity. Counts come from database-wide aggregate queries; the attention list highlights up to eight items and links to the full catalog. Movement-chart deductions include all physical removals, not only shipments.

Stock rows show the complete internal SKU and every mapped website/Etsy SKU. Stock search matches all these SKUs, including old retained mappings. Choose **Rows → All** to display every loaded row on one page.

### Ship selected products or quantities

1. Open **Channel orders → Ship products** for a website order.
2. Review Ordered, Shipped and Remaining per product. Enter the quantity to ship now for each line; enter **0** for products to leave for later.
3. Optionally enter a carrier and tracking number, then confirm the shipment.
4. Only selected units reduce physical and reserved stock. The remaining units stay reserved. Admin and customer order status becomes **Partially shipped**.
5. Repeat for the remaining products. The final shipment changes the order to **Shipped**. Mark **Delivered** only after all units have shipped.

Shipment history retains quantities, timestamps, staff identity and optional carrier/tracking. Shipment requests use an idempotency key; retries cannot deduct stock twice, and conflicting or excessive quantities are rejected. Concurrent dispatches lock the order before changing stock. Products mapped to the same inventory item are handled together while retaining per-product shipment quantities. Remapping a SKU does not change a new order's original stock allocation.

Existing orders created before per-product snapshots are reconstructed only when their mappings still match their original reservation totals; otherwise the shipment is blocked for reconciliation. Already shipped historical orders remain shipped without a second deduction. Admin's whole-order Mark shipped action ships only the remaining units if the order is partially shipped. Its existing status history/stock ledger remains the audit record; detailed carrier/tracking shipment records are created through the inventory shipment form.

Full cancellation after partial shipping is blocked. Returns, refunds of remaining items and partial cancellation are separate workflows, not included in this change. Etsy shipment status is still managed in Etsy and imported by sync.

The automatic initializer applies `014-inventory-shipments.sql`, creating only `inv_` shipment tables and adding shipped quantities to inventory order lines. Tests in `tests/inventory-partial-db.test.ts` cover three-product orders, split quantities, duplicate/concurrent requests, overship rejection, shared stock SKUs, old-order reconstruction, remapping, customer status and dashboard counts.
