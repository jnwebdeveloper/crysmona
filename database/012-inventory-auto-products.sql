BEGIN;
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
COMMIT;
