import { readFile } from "node:fs/promises";
import { pool } from "../lib/db.js";

// Targeted migration for existing installations: product galleries gain videos
// (product_images.image_url becomes media_url, plus media_type). No seed data changes.
try {
  await pool.query(
    await readFile(
      new URL("../../database/010-product-video.sql", import.meta.url),
      "utf8",
    ),
  );
  const { rows } = await pool.query(
    "SELECT media_type, count(*)::int AS count FROM product_images GROUP BY media_type ORDER BY media_type",
  );
  console.log("Product video migration applied.", rows);
} finally {
  await pool.end();
}
