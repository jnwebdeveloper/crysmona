import { createHash } from "node:crypto";
import { pool } from "../lib/db.js";
import { bad } from "../lib/errors.js";
import { ensureInventorySchema } from "./schema.js";
import { move } from "./stock.js";

export async function shipWebsiteItems(
  invId: number,
  input: any,
  actor: string,
) {
  if (
    typeof input.request_key !== "string" ||
    !/^[a-zA-Z0-9-]{16,100}$/.test(input.request_key)
  )
    throw bad("A valid shipment request key is required.");
  if (
    !Array.isArray(input.lines) ||
    !input.lines.length ||
    input.lines.length > 100
  )
    throw bad("Select at least one product to ship.");
  const seen = new Set<number>();
  const lines = input.lines
    .map((l: any) => {
      if (
        !Number.isSafeInteger(l.order_item_id) ||
        !Number.isSafeInteger(l.quantity) ||
        l.quantity < 1 ||
        seen.has(l.order_item_id)
      )
        throw bad("Use unique order lines and positive whole quantities.");
      seen.add(l.order_item_id);
      return { order_item_id: l.order_item_id, quantity: l.quantity };
    })
    .sort((a: any, b: any) => a.order_item_id - b.order_item_id);
  const carrier = String(input.carrier || "").trim(),
    tracking = String(input.tracking_number || "").trim();
  if (carrier.length > 120 || tracking.length > 180)
    throw bad("Carrier or tracking number is too long.");
  const hash = createHash("sha256")
    .update(JSON.stringify({ lines, carrier, tracking }))
    .digest("hex");
  await ensureInventorySchema();
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const source = (
      await c.query(
        "SELECT w.* FROM orders w JOIN inv_orders i ON i.channel='website' AND i.external_id=w.order_number WHERE i.id=$1 FOR UPDATE OF w",
        [invId],
      )
    ).rows[0];
    if (!source) throw bad("Website order not found.", 404);
    const inv = (
      await c.query("SELECT * FROM inv_orders WHERE id=$1 FOR UPDATE", [invId])
    ).rows[0];
    const previous = (
      await c.query(
        "SELECT * FROM inv_shipments WHERE order_id=$1 AND request_key=$2",
        [invId, input.request_key],
      )
    ).rows[0];
    if (previous) {
      if (previous.payload_hash !== hash)
        throw bad(
          "This shipment request was already used with different quantities.",
          409,
        );
      await c.query("COMMIT");
      return { shipmentId: previous.id, status: source.status, replayed: true };
    }
    if (
      !["placed", "processing", "partially_shipped"].includes(source.status) ||
      inv.status !== "open" ||
      source.refund_status === "pending"
    )
      throw bad("This order is not available for shipping.", 409);
    // Older orders predate per-product snapshots. Build them only when current mappings
    // still reconcile exactly to the original reserved inventory quantities.
    const existing = (
      await c.query("SELECT * FROM inv_website_lines WHERE order_id=$1", [
        invId,
      ])
    ).rows;
    if (!existing.length) {
      const original = (
        await c.query(
          "SELECT l.id,l.quantity,m.item_id FROM order_items l LEFT JOIN inv_mappings m ON m.channel='website' AND m.external_sku=l.sku WHERE l.order_id=$1 ORDER BY l.id",
          [source.id],
        )
      ).rows;
      const grouped = new Map<number, number>();
      for (const l of original) {
        if (!l.item_id)
          throw bad(
            "Map all original order SKUs before creating a shipment.",
            409,
          );
        grouped.set(l.item_id, (grouped.get(l.item_id) || 0) + l.quantity);
      }
      const reserved = (
        await c.query("SELECT * FROM inv_order_lines WHERE order_id=$1", [
          invId,
        ])
      ).rows;
      if (
        grouped.size !== reserved.length ||
        reserved.some(
          (r) =>
            grouped.get(r.item_id) !== r.quantity || r.shipped_quantity !== 0,
        )
      )
        throw bad(
          "Original inventory mappings changed. Reconcile this order before shipping.",
          409,
        );
      for (const l of original)
        await c.query(
          "INSERT INTO inv_website_lines(order_item_id,order_id,item_id,quantity) VALUES($1,$2,$3,$4)",
          [l.id, invId, l.item_id, l.quantity],
        );
    }
    const saved = (
      await c.query(
        "SELECT * FROM inv_website_lines WHERE order_id=$1 ORDER BY item_id,order_item_id FOR UPDATE",
        [invId],
      )
    ).rows;
    const grouped = new Map<number, number>();
    for (const l of lines) {
      const line = saved.find((r) => r.order_item_id === l.order_item_id);
      if (!line || l.quantity > line.quantity - line.shipped_quantity)
        throw bad(
          "A shipment quantity exceeds the remaining units or belongs to another order.",
          409,
        );
      grouped.set(line.item_id, (grouped.get(line.item_id) || 0) + l.quantity);
    }
    const shipment = (
      await c.query(
        "INSERT INTO inv_shipments(order_id,request_key,payload_hash,carrier,tracking_number,actor) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
        [invId, input.request_key, hash, carrier, tracking, actor],
      )
    ).rows[0];
    for (const [id, qty] of [...grouped].sort((a, b) => a[0] - b[0])) {
      await move(
        c,
        id,
        "ship",
        qty,
        `Shipment ${shipment.id}: ${source.order_number}`,
        actor,
        `website:shipment:${shipment.id}:${id}`,
      );
      await c.query(
        "UPDATE inv_order_lines SET shipped_quantity=shipped_quantity+$3 WHERE order_id=$1 AND item_id=$2",
        [invId, id, qty],
      );
    }
    for (const l of lines) {
      await c.query(
        "UPDATE inv_website_lines SET shipped_quantity=shipped_quantity+$2 WHERE order_item_id=$1",
        [l.order_item_id, l.quantity],
      );
      await c.query(
        "INSERT INTO inv_shipment_lines(shipment_id,order_item_id,quantity) VALUES($1,$2,$3)",
        [shipment.id, l.order_item_id, l.quantity],
      );
    }
    const remaining = (
      await c.query(
        "SELECT sum(quantity-shipped_quantity)::int n FROM inv_order_lines WHERE order_id=$1",
        [invId],
      )
    ).rows[0].n;
    const status = remaining > 0 ? "partially_shipped" : "shipped";
    await c.query("UPDATE orders SET status=$2,updated_at=now() WHERE id=$1", [
      source.id,
      status,
    ]);
    await c.query("UPDATE inv_orders SET status=$2 WHERE id=$1", [
      invId,
      remaining ? "open" : "shipped",
    ]);
    await c.query(
      "INSERT INTO order_status_history(order_id,status,note,actor) VALUES($1,$2,$3,'admin')",
      [
        source.id,
        status,
        `Shipment ${shipment.id}${carrier ? " · " + carrier : ""}${tracking ? " · " + tracking : ""}`,
      ],
    );
    await c.query(
      "INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,metadata) VALUES('admin',$1,'create_shipment','order',$2,$3)",
      [
        actor,
        String(source.id),
        JSON.stringify({ shipmentId: shipment.id, lines }),
      ],
    );
    await c.query("COMMIT");
    return { shipmentId: shipment.id, status };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
