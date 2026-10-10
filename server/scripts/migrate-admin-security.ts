import { readFile } from "node:fs/promises";
import { pool } from "../lib/db.js";

// Targeted, additive migration for existing installations; no seed data changes.
try {
  await pool.query(
    await readFile(
      new URL("../../database/009-admin-security.sql", import.meta.url),
      "utf8",
    ),
  );
  console.log("Admin security migration applied.");
} finally {
  await pool.end();
}
