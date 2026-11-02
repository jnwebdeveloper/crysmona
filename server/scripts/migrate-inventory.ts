import "dotenv/config";
import { pool } from "../lib/db.js";
import { ensureInventorySchema } from "../inventory/schema.js";
try {
  await ensureInventorySchema();
  console.log("Inventory tables and automatic website product linking ready.");
} finally {
  await pool.end();
}
