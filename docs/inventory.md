# Inventory workspace

Visit `/inventory` and sign in with an active staff account. Inventory has its own cookie and session table, so signing out does not end an admin session. No admin components or existing commerce write paths are changed.

## Installation

Use the existing `DATABASE_URL` pointing to `crysmona`. Run `npm run db:migrate:inventory` before deploying. This additive migration creates only `inv_` tables; it does not modify existing tables or seed inventory stock. Deploy the application normally to expose `/inventory` on the existing domain.

1. Add inventory items. Optionally link existing website products to display their description/image without copying prices or customer details.
2. Receive opening physical quantities from Stock movements. Set a shelf/bin and reorder threshold on creation.
3. Map every website and Etsy SKU before syncing. Multiple channel SKUs can map to one physical inventory item; Etsy listing IDs are optional references.
4. Sync website or Etsy orders from Integrations. Sync is explicitly manual. No stock quantities are pushed back to the website or Etsy.

**Opening stock:** Order imports include historical paid orders. Opening physical quantities must account for those sales before the first sync. A previously unseen shipped order deducts physical stock once; an open paid order reserves stock. When an imported open order ships, its reservation and physical stock decrease together; cancellation releases its reservation. Unpaid orders are ignored. Completed historical records are retained and not re-applied. Terminal orders are not reopened, and refunds/line edits after import require a documented manual adjustment. Do not manually release a channel reservation; allow the channel order status to drive it.

Imports lock each order and update its stock/ledger atomically. Unmapped SKUs or insufficient stock roll back that order and stop the sync with a visible error; prior successful orders remain committed and retries are safe. No customer details, shipping addresses, website prices or discounts are copied. History shows the latest 100 syncs and 200 movements/orders; older rows remain in the database.

## Etsy configuration

Register an Etsy app and set these server-only environment variables:

- `ETSY_CLIENT_ID`: app keystring.
- `ETSY_SHARED_SECRET`: app shared secret (sent with keystring in the x-api-key header).
- `ETSY_SHOP_ID`: numeric shop ID.
- `ETSY_REDIRECT_URI`: `https://crysmona.vercel.app/api/inventory/etsy/callback`, also registered in the Etsy app.
- `INV_ENCRYPTION_KEY`: a base64-encoded 32-byte cryptographically random key. Generate with `openssl rand -base64 32`. Keep it stable and secret; changing it requires reconnecting Etsy.

Connect Etsy from Integrations, approve read access to orders, then sync. The OAuth flow uses PKCE, a one-use state tied to the inventory session, ten-minute expiry, encrypted AES-256-GCM token storage, and token refresh. The inventory session must still be active when returning from Etsy. A missing SKU in an Etsy transaction is surfaced as an import error and must be corrected in Etsy. Listing mapping is maintained locally; listing publication and stock push are outside this implementation.

Official reference: https://developer.etsy.com/documentation/essentials/authentication/

## Checks

`npm run build`, `npm run check:server`, `npm run test:inventory`. To run tests where the tsx CLI cannot open its local IPC pipe: `node --import tsx --test tests/inventory.test.ts`.

Back up before deployment and run the migration against your normal database. Inventory schema installation is intentionally separate from existing `db:setup` so existing setup behavior stays unchanged.
