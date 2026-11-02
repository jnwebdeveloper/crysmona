import { test } from "node:test";
import assert from "node:assert/strict";
import { pool, q } from "../server/lib/db.js";
import {
  ensureInventorySchema,
  INVENTORY_AUTO_PRODUCTS_SQL,
} from "../server/inventory/schema.js";

test(
  "admin product writes automatically list and map inventory without resetting stock",
  { skip: process.env.INV_TEST_DATABASE !== "1" },
  async () => {
    await ensureInventorySchema();
    const tag = "AUTO-" + Date.now();
    const productIds: number[] = [];
    const itemIds: number[] = [];
    try {
      const p = (
        await q(
          "INSERT INTO products(name,slug,sku,price_cents,stock_qty,image_url) VALUES('Auto product',$1,$2,100,99,'/test.jpg') RETURNING *",
          [tag.toLowerCase(), tag],
        )
      ).rows[0];
      productIds.push(p.id);
      const linked = (
        await q(
          "SELECT i.* FROM inv_items i JOIN inv_mappings m ON m.item_id=i.id WHERE m.channel='website' AND m.external_sku=$1",
          [tag],
        )
      ).rows[0];
      assert.ok(linked);
      itemIds.push(linked.id);
      assert.equal(linked.physical, 0);
      assert.equal(linked.reserved, 0);
      assert.equal(linked.product_id, p.id);
      await q("UPDATE inv_items SET physical=50,reserved=2 WHERE id=$1", [
        linked.id,
      ]);
      await q("UPDATE products SET name=$2,stock_qty=1000 WHERE id=$1", [
        p.id,
        "Updated name",
      ]);
      await q(INVENTORY_AUTO_PRODUCTS_SQL);
      let stock = (
        await q("SELECT physical,reserved FROM inv_items WHERE id=$1", [
          linked.id,
        ])
      ).rows[0];
      assert.deepEqual(stock, { physical: 50, reserved: 2 });
      await q("UPDATE products SET sku=$2 WHERE id=$1", [p.id, tag + "-NEW"]);
      assert.equal(
        (
          await q(
            "SELECT item_id FROM inv_mappings WHERE channel='website' AND external_sku=$1",
            [tag + "-NEW"],
          )
        ).rows[0].item_id,
        linked.id,
      );
      assert.equal(
        (
          await q("SELECT count(*)::int n FROM inv_items WHERE product_id=$1", [
            p.id,
          ])
        ).rows[0].n,
        1,
      );
      // A deliberately remapped website product stays linked to the chosen stock item.
      const custom = (
        await q(
          "INSERT INTO inv_items(sku,name,physical) VALUES($1,'Shared stock',23) RETURNING id",
          [tag + "-CUSTOM"],
        )
      ).rows[0].id;
      itemIds.push(custom);
      await q(
        "UPDATE inv_mappings SET item_id=$1 WHERE channel='website' AND external_sku=$2",
        [custom, tag + "-NEW"],
      );
      await q(INVENTORY_AUTO_PRODUCTS_SQL);
      assert.equal(
        (
          await q(
            "SELECT item_id FROM inv_mappings WHERE channel='website' AND external_sku=$1",
            [tag + "-NEW"],
          )
        ).rows[0].item_id,
        custom,
      );
      // Missing SKUs are filled before the product is inserted, then mapped automatically.
      const blank = (
        await q(
          "INSERT INTO products(name,slug,price_cents,image_url) VALUES('No SKU',$1,100,'/test.jpg') RETURNING *",
          [tag.toLowerCase() + "-blank"],
        )
      ).rows[0];
      productIds.push(blank.id);
      assert.match(blank.sku, /^WEB-/);
      const blankItem = (
        await q(
          "SELECT item_id FROM inv_mappings WHERE channel='website' AND external_sku=$1",
          [blank.sku],
        )
      ).rows[0];
      assert.ok(blankItem);
      itemIds.push(blankItem.item_id);
      // Backfill recreates a missing automatic link but keeps existing physical stock.
      await q(
        "DELETE FROM inv_mappings WHERE channel='website' AND external_sku=$1",
        [blank.sku],
      );
      await q("UPDATE inv_items SET physical=7 WHERE id=$1", [
        blankItem.item_id,
      ]);
      await q(INVENTORY_AUTO_PRODUCTS_SQL);
      assert.equal(
        (
          await q(
            "SELECT item_id FROM inv_mappings WHERE channel='website' AND external_sku=$1",
            [blank.sku],
          )
        ).rows[0].item_id,
        blankItem.item_id,
      );
      assert.equal(
        (
          await q("SELECT physical FROM inv_items WHERE id=$1", [
            blankItem.item_id,
          ])
        ).rows[0].physical,
        7,
      );
    } finally {
      await q("DELETE FROM inv_mappings WHERE item_id=ANY($1::int[])", [
        itemIds,
      ]);
      await q("DELETE FROM inv_items WHERE id=ANY($1::int[])", [itemIds]);
      await q("DELETE FROM products WHERE id=ANY($1::int[])", [productIds]);
      await pool.end();
    }
  },
);
