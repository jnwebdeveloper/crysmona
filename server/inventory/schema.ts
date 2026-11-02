import { pool } from "../lib/db.js";

// Embedded so serverless bundles do not depend on a runtime SQL file.
// Keep aligned with database/011-inventory.sql and 012-inventory-auto-products.sql.
export const INVENTORY_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS inv_items(id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,sku VARCHAR(100) UNIQUE NOT NULL,name VARCHAR(180) NOT NULL,product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,physical INTEGER NOT NULL DEFAULT 0 CHECK(physical>=0),reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved>=0 AND reserved<=physical),reorder_level INTEGER NOT NULL DEFAULT 5 CHECK(reorder_level>=0),location VARCHAR(120) NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS inv_sessions(token_hash TEXT PRIMARY KEY,admin_id INTEGER NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS inv_mappings(id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,item_id INTEGER NOT NULL REFERENCES inv_items(id),channel TEXT NOT NULL CHECK(channel IN ('website','etsy')),external_sku VARCHAR(100) NOT NULL,listing_id VARCHAR(100),UNIQUE(channel,external_sku));
CREATE TABLE IF NOT EXISTS inv_orders(id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,channel TEXT NOT NULL CHECK(channel IN ('website','etsy')),external_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('open','shipped','cancelled')),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(channel,external_id));
CREATE TABLE IF NOT EXISTS inv_order_lines(id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES inv_orders(id),item_id INTEGER NOT NULL REFERENCES inv_items(id),quantity INTEGER NOT NULL CHECK(quantity>0),UNIQUE(order_id,item_id));
CREATE TABLE IF NOT EXISTS inv_movements(id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,item_id INTEGER NOT NULL REFERENCES inv_items(id),physical_delta INTEGER NOT NULL,reserved_delta INTEGER NOT NULL,reason TEXT NOT NULL,actor TEXT NOT NULL,reference TEXT UNIQUE,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS inv_movements_item_idx ON inv_movements(item_id,created_at DESC);
CREATE TABLE IF NOT EXISTS inv_integrations(shop_id TEXT PRIMARY KEY,tokens TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS inv_oauth_states(state TEXT PRIMARY KEY,verifier TEXT NOT NULL,session_hash TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS inv_sync_history(id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,channel TEXT NOT NULL,status TEXT NOT NULL,message TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
`;
export const INVENTORY_AUTO_PRODUCTS_SQL = `
-- Auto-list website products without importing legacy stock or overwriting mappings.
CREATE OR REPLACE FUNCTION inv_product_sku() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sku IS NULL OR btrim(NEW.sku) = '' THEN
    NEW.sku := 'WEB-' || NEW.id || '-' || substr(md5(random()::text),1,8);
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION inv_link_website_product() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE inventory_id integer;
BEGIN
  -- A manually chosen mapping always wins.
  IF EXISTS(SELECT 1 FROM inv_mappings WHERE channel='website' AND external_sku=NEW.sku) THEN
    RETURN NEW;
  END IF;
  -- SKU edits retain the physical item used by the old SKU and historical orders.
  IF TG_OP='UPDATE' AND OLD.sku IS DISTINCT FROM NEW.sku THEN
    SELECT item_id INTO inventory_id FROM inv_mappings WHERE channel='website' AND external_sku=OLD.sku;
  END IF;
  IF inventory_id IS NULL THEN
    SELECT id INTO inventory_id FROM inv_items WHERE product_id=NEW.id ORDER BY id LIMIT 1;
  END IF;
  IF inventory_id IS NULL THEN
    INSERT INTO inv_items(sku,name,product_id) VALUES(NEW.sku,NEW.name,NEW.id)
      ON CONFLICT(sku) DO NOTHING RETURNING id INTO inventory_id;
    IF inventory_id IS NULL THEN
      SELECT id INTO inventory_id FROM inv_items WHERE sku=NEW.sku;
    END IF;
  END IF;
  INSERT INTO inv_mappings(item_id,channel,external_sku) VALUES(inventory_id,'website',NEW.sku)
    ON CONFLICT(channel,external_sku) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS inv_product_sku_trigger ON products;
CREATE TRIGGER inv_product_sku_trigger BEFORE INSERT OR UPDATE OF sku ON products
  FOR EACH ROW EXECUTE FUNCTION inv_product_sku();
DROP TRIGGER IF EXISTS inv_product_link_trigger ON products;
CREATE TRIGGER inv_product_link_trigger AFTER INSERT OR UPDATE OF sku,name ON products
  FOR EACH ROW EXECUTE FUNCTION inv_link_website_product();
-- Triggers also link older products on upgrade. Existing stock is never changed.
UPDATE products p SET sku=p.sku
WHERE p.sku IS NULL OR btrim(p.sku)='' OR NOT EXISTS(
 SELECT 1 FROM inv_mappings m WHERE m.channel='website' AND m.external_sku=p.sku
);
`;
export const INVENTORY_SHIPMENTS_SQL = `
ALTER TABLE inv_order_lines ADD COLUMN IF NOT EXISTS shipped_quantity INTEGER NOT NULL DEFAULT 0 CHECK(shipped_quantity>=0 AND shipped_quantity<=quantity);
UPDATE inv_order_lines l SET shipped_quantity=l.quantity FROM inv_orders o WHERE o.id=l.order_id AND o.status='shipped' AND l.shipped_quantity<>l.quantity;
CREATE TABLE IF NOT EXISTS inv_website_lines(order_item_id INTEGER PRIMARY KEY REFERENCES order_items(id) ON DELETE CASCADE,order_id INTEGER NOT NULL REFERENCES inv_orders(id) ON DELETE CASCADE,item_id INTEGER NOT NULL REFERENCES inv_items(id),quantity INTEGER NOT NULL CHECK(quantity>0),shipped_quantity INTEGER NOT NULL DEFAULT 0 CHECK(shipped_quantity>=0 AND shipped_quantity<=quantity));
CREATE TABLE IF NOT EXISTS inv_shipments(id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES inv_orders(id) ON DELETE CASCADE,request_key TEXT NOT NULL,payload_hash TEXT NOT NULL,carrier VARCHAR(120) NOT NULL DEFAULT '',tracking_number VARCHAR(180) NOT NULL DEFAULT '',actor TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(order_id,request_key));
CREATE TABLE IF NOT EXISTS inv_shipment_lines(shipment_id INTEGER NOT NULL REFERENCES inv_shipments(id) ON DELETE CASCADE,order_item_id INTEGER NOT NULL REFERENCES inv_website_lines(order_item_id) ON DELETE CASCADE,quantity INTEGER NOT NULL CHECK(quantity>0),PRIMARY KEY(shipment_id,order_item_id));
`;
let ready: Promise<void> | undefined;
export function ensureInventorySchema(): Promise<void> {
  return (ready ??= install().catch((error) => {
    ready = undefined;
    throw error;
  }));
}
async function install(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize cold starts across serverless instances.
    await client.query("SELECT pg_advisory_xact_lock(183621591, 1)");
    await client.query(INVENTORY_SCHEMA_SQL);
    await client.query(INVENTORY_AUTO_PRODUCTS_SQL);
    await client.query(
      "ALTER TABLE inv_items ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false",
    );
    await client.query(INVENTORY_SHIPMENTS_SQL);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
