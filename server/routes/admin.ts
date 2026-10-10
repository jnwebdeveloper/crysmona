import { admin } from "../auth/admin/index.js";
import express from "express";
import { resources } from "../../shared/adminSchema.js";
import { adminValidation } from "../../shared/adminValidation.js";
import { bad } from "../lib/errors.js";
import { q } from "../lib/db.js";
import { paypalReady } from "../services/paypal.js";
const app = express.Router();
app.get("/api/admin/dashboard", admin, async (_req, res) => {
  const [p, o, u, e] = await Promise.all([
    q("SELECT count(*)::int count FROM products"),
    q("SELECT count(*)::int count FROM orders"),
    q("SELECT count(*)::int count FROM users"),
    q("SELECT count(*)::int count FROM enquiries WHERE status='new'"),
  ]);
  const [revenue,aov,low,top,recent]=await Promise.all([
    q("SELECT COALESCE(sum(total_cents),0)::bigint total FROM orders WHERE payment_status='paid'"),
    q("SELECT COALESCE(round(avg(total_cents)),0)::bigint total FROM orders WHERE status NOT IN ('cancelled','draft')"),
    q("SELECT count(*)::int count FROM products WHERE active=true AND stock_qty<=5"),
    q("SELECT i.product_name,sum(i.quantity)::int units FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.status<>'cancelled' GROUP BY i.product_name ORDER BY units DESC LIMIT 5"),
    q("SELECT order_number,status,total_cents,created_at FROM orders ORDER BY created_at DESC LIMIT 5")
  ]);
  res.json({products:p.rows[0].count,orders:o.rows[0].count,users:u.rows[0].count,enquiries:e.rows[0].count,paypalConfigured:paypalReady(),revenueCents:Number(revenue.rows[0].total),averageOrderCents:Number(aov.rows[0].total),lowStock:low.rows[0].count,topProducts:top.rows,recentOrders:recent.rows});
});
app.get("/api/admin/orders/:id/detail", admin, async (req, res) => {
  const order = (await q("SELECT o.*,u.phone,u.name AS customer_name,u.email AS customer_email FROM orders o LEFT JOIN users u ON u.id=o.user_id WHERE o.id=$1", [req.params.id])).rows[0];
  if (!order) throw bad("Order not found.", 404);
  const items = (await q("SELECT * FROM order_items WHERE order_id=$1 ORDER BY id", [order.id])).rows;
  const history = (await q("SELECT status,note,actor,created_at FROM order_status_history WHERE order_id=$1 ORDER BY created_at",[order.id])).rows;
  res.json({ ...order, items, history });
});
function validUrl(value: any) {
  return (
    !value ||
    (typeof value === "string" &&
      ((value.startsWith("/") && !value.startsWith("//")) ||
        /^https:\/\//.test(value)))
  );
}
for (const [table, definition] of Object.entries(resources)) {
  const validate = (body: any, create: boolean) => {
    const preliminary = adminValidation(table, body);
    const firstError = Object.values(preliminary)[0];
    if (firstError) throw bad(firstError);
    const clean: Record<string, any> = {};
    for (const field of definition.fields) {
      let value = body[field.key];
      if (value === undefined) {
        if (create && field.required) throw bad(field.label + " is required.");
        continue;
      }
      if (value === "" && !field.required) value = null;
      if (field.required && (value === null || value === ""))
        throw bad(field.label + " is required.");
      if (field.type === "number" && value !== null) {
        value = Number(value);
        if (!Number.isSafeInteger(value) || value < 0)
          throw bad(field.label + " must be a non-negative integer.");
      }
      if (field.type === "boolean" && typeof value !== "boolean")
        throw bad(field.label + " must be true or false.");
      if (field.options && value !== null && !field.options.includes(value))
        throw bad("Choose a valid " + field.label + ".");
      if (field.type === "specs") {
        if (
          !value ||
          typeof value !== "object" ||
          Array.isArray(value) ||
          Object.values(value).some((v) => typeof v !== "string")
        )
          throw bad("Specifications must contain text labels and values.");
      }
      if (
        ["image_url", "url", "cta_url"].includes(field.key) &&
        !validUrl(value)
      )
        throw bad("Use a relative path or an https URL.");
      clean[field.key] = value;
    }
    if (
      table === "order_items" &&
      clean.quantity !== undefined &&
      clean.quantity < 1
    )
      throw bad("Quantity must be at least one.");
    if (
      table === "settings" &&
      clean.key === "currency" &&
      clean.value !== "USD"
    )
      throw bad("Store currency must remain USD.");
    if (!Object.keys(clean).length) throw bad("No editable fields provided.");
    if (clean.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clean.slug))
      throw bad("Use lowercase words separated by hyphens for the URL slug.");
    if (
      table === "coupons" &&
      clean.discount_type === "percent" &&
      clean.discount_value > 100
    )
      throw bad("Percentage cannot exceed 100.");
    if (
      table === "settings" &&
      ["shipping_cents", "free_shipping_threshold_cents"].includes(clean.key) &&
      !/^\d+$/.test(clean.value)
    )
      throw bad("Shipping settings require a non-negative integer.");
    if (table === "reviews" && (clean.rating < 1 || clean.rating > 5))
      throw bad("Rating must be between 1 and 5.");
    if (table === "orders" && create) {
      if (clean.status !== "draft")
        throw bad("Manual orders must start as drafts.");
      if (clean.payment_status !== "pending")
        throw bad("Manual orders must start with payment pending.");
    }
    return clean;
  };
  app.get("/api/admin/" + table, admin, async (_req, res) =>
    res.json((await q(`SELECT * FROM ${table} ORDER BY id`)).rows),
  );
  app.post("/api/admin/" + table, admin, async (req, res) => {
    const values = validate(req.body, true);
    const keys = Object.keys(values);
    if (table === "order_items") {
      const order = await q("SELECT status FROM orders WHERE id=$1", [
        values.order_id,
      ]);
      if (order.rows[0]?.status !== "draft")
        throw bad("Only draft order line items can be edited.");
    }
    const { rows } = await q(
      `INSERT INTO ${table}(${keys.join(",")}) VALUES(${keys.map((_, i) => "$" + (i + 1)).join(",")}) RETURNING *`,
      keys.map((k) => values[k]),
    );
    res.status(201).json(rows[0]);
  });
  app.put("/api/admin/" + table + "/:id", admin, async (req, res) => {
    const existing = (
      await q(`SELECT * FROM ${table} WHERE id=$1`, [req.params.id])
    ).rows[0];
    if (!existing) throw bad("Record not found.", 404);
    const values = validate(req.body, false);
    validate({ ...existing, ...values }, false);
    if (table === "orders" && existing.status !== "draft") {
      for (const key of Object.keys(values))
        if (
          !["status"].includes(key) &&
          JSON.stringify(values[key]) !== JSON.stringify(existing[key])
        )
          throw bad(
            "Placed order amounts and payment records cannot be overwritten.",
          );
      if (
        !["placed", "processing", "shipped", "delivered"].includes(
          values.status,
        )
      )
        throw bad("Only fulfillment status can be updated for a placed order.");
      for (const key of Object.keys(values))
        if (key !== "status") delete values[key];
    }
    if (
      table === "orders" &&
      existing.status === "draft" &&
      ((values.status && values.status !== "draft") ||
        (values.payment_status && values.payment_status !== "pending"))
    )
      throw bad("Draft orders must be completed through checkout.");
    if (
      table === "orders" &&
      ["awaiting_payment", "cancelled"].includes(existing.status)
    )
      throw bad(
        "Payment and cancellation states cannot be changed through fulfillment.",
      );
    if (table === "order_items") {
      if (
        values.order_id &&
        Number(values.order_id) !== Number(existing.order_id)
      )
        throw bad("Order line items cannot be moved to another order.");
      const order = (
        await q("SELECT status FROM orders WHERE id=$1", [existing.order_id])
      ).rows[0];
      if (order?.status !== "draft")
        throw bad("Only draft order line items can be edited.");
    }
    const keys = Object.keys(values);
    const { rows } = await q(
      `UPDATE ${table} SET ${keys.map((k, i) => k + "=$" + (i + 1)).join(",")} WHERE id=$${keys.length + 1} RETURNING *`,
      [...keys.map((k) => values[k]), req.params.id],
    );
    if(table==="orders" && values.status && values.status!==existing.status){await q("INSERT INTO order_status_history(order_id,status,note,actor) VALUES($1,$2,'Status updated in admin','admin')",[req.params.id,values.status]);await q("INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,metadata) VALUES('admin',$1,'order_status_update','order',$2,$3)",[String((req as any).adminAccount?.id||''),String(req.params.id),JSON.stringify({from:existing.status,to:values.status})])}
    res.json(rows[0]);
  });
  app.delete("/api/admin/" + table + "/:id", admin, async (req, res) => {
    if (table === "orders") {
      const o = (
        await q("SELECT status FROM orders WHERE id=$1", [req.params.id])
      ).rows[0];
      if (o && o.status !== "draft")
        throw bad(
          "Only draft orders can be deleted. Completed order history is retained.",
        );
    }
    if (table === "order_items") {
      const o = (
        await q(
          "SELECT o.status FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.id=$1",
          [req.params.id],
        )
      ).rows[0];
      if (o?.status !== "draft")
        throw bad("Only draft order line items can be deleted.");
    }
    const result = await q(`DELETE FROM ${table} WHERE id=$1`, [req.params.id]);
    if (!result.rowCount) throw bad("Record not found.", 404);
    res.status(204).end();
  });
}

export default app;
