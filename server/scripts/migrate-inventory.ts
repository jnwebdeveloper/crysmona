import "dotenv/config";
import { readFile } from "node:fs/promises";
import { pool } from "../lib/db.js";
try {
  await pool.query(
    await readFile(
      new URL("../../database/011-inventory.sql", import.meta.url),
      "utf8",
    ),
  );
  console.log("Inventory tables ready.");
} finally {
  await pool.end();
}
