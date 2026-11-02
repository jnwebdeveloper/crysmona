import type { PoolClient } from "pg";
import { bad } from "../lib/errors.js";
import { move } from "./stock.js";

// A website SKU must be explicitly mapped. No legacy product-stock fallback.
export const WEBSITE_STOCK_SQL = `COALESCE((SELECT i.physical-i.reserved FROM inv_mappings m JOIN inv_items i ON i.id=m.item_id WHERE m.channel='website' AND m.external_sku=p.sku),0)`;

// Caller holds a transaction. Lock the website order first on every code path,
// then inventory order and item IDs in a stable order to prevent racing syncs.
export async function syncWebsiteOrder(
  c: PoolClient,
  orderId: number | string,
  actor = "website",
) {
  const order = (
    await c.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [orderId])
  ).rows[0];
  if (!order || order.status === "draft") return;
  const status =
    order.status === "cancelled"
      ? "cancelled"
      : ["shipped", "delivered", "completed"].includes(order.status)
        ? "shipped"
        : "open";
  const existing = (
    await c.query(
      "SELECT * FROM inv_orders WHERE channel='website' AND external_id=$1 FOR UPDATE",
      [order.order_number],
    )
  ).rows[0];
  if (existing) {
    if (existing.status === status) return;
    if (existing.status !== "open")
      throw bad(
        "This inventory order is already final and cannot be reopened or reversed.",
        409,
      );
    if (status === "open") return;
    const lines = (
      await c.query(
        "SELECT * FROM inv_order_lines WHERE order_id=$1 ORDER BY item_id",
        [existing.id],
      )
    ).rows;
    for (const line of lines)
      await move(
        c,
        line.item_id,
        status === "shipped" ? "ship" : "release",
        line.quantity,
        `Website order ${order.order_number}: ${status}`,
        actor,
        `website:${order.order_number}:${status}:${line.item_id}`,
      );
    await c.query("UPDATE inv_orders SET status=$2 WHERE id=$1", [
      existing.id,
      status,
    ]);
    return;
  }
  // An old cancelled order has nothing left to reserve or release.
  if (status === "cancelled") return;
  const lines = (
    await c.query(
      "SELECT sku,quantity FROM order_items WHERE order_id=$1 ORDER BY id",
      [orderId],
    )
  ).rows;
  const grouped = new Map<number, number>();
  for (const line of lines) {
    const mapping = (
      await c.query(
        "SELECT item_id FROM inv_mappings WHERE channel='website' AND external_sku=$1 FOR SHARE",
        [line.sku],
      )
    ).rows[0];
    if (!mapping)
      throw bad(
        `Map website SKU ${line.sku || "(missing)"} before syncing order ${order.order_number}.`,
      );
    grouped.set(
      mapping.item_id,
      (grouped.get(mapping.item_id) || 0) + line.quantity,
    );
  }
  if (!grouped.size) throw bad("Order has no stock lines.");
  const created = (
    await c.query(
      "INSERT INTO inv_orders(channel,external_id,status) VALUES('website',$1,$2) RETURNING id",
      [order.order_number, status],
    )
  ).rows[0];
  for (const [id, quantity] of [...grouped].sort((a, b) => a[0] - b[0])) {
    await move(
      c,
      id,
      status === "shipped" ? "remove" : "reserve",
      quantity,
      `Website order ${order.order_number}`,
      actor,
      `website:${order.order_number}:import:${id}`,
    );
    await c.query(
      "INSERT INTO inv_order_lines(order_id,item_id,quantity) VALUES($1,$2,$3)",
      [created.id, id, quantity],
    );
  }
}

export async function releaseWebsiteOrder(
  c: PoolClient,
  orderId: number | string,
) {
  // Do not import a legacy order just to cancel it. If tracked, release once.
  const order = (
    await c.query("SELECT order_number FROM orders WHERE id=$1 FOR UPDATE", [
      orderId,
    ])
  ).rows[0];
  const inv = (
    await c.query(
      "SELECT * FROM inv_orders WHERE channel='website' AND external_id=$1 FOR UPDATE",
      [order.order_number],
    )
  ).rows[0];
  if (!inv || inv.status === "cancelled") return;
  if (inv.status !== "open")
    throw bad("Shipped inventory cannot be released by cancellation.", 409);
  for (const line of (
    await c.query(
      "SELECT * FROM inv_order_lines WHERE order_id=$1 ORDER BY item_id",
      [inv.id],
    )
  ).rows)
    await move(
      c,
      line.item_id,
      "release",
      line.quantity,
      `Website order ${order.order_number}: cancelled`,
      "website",
      `website:${order.order_number}:cancelled:${line.item_id}`,
    );
  await c.query("UPDATE inv_orders SET status='cancelled' WHERE id=$1", [
    inv.id,
  ]);
}
