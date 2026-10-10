import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { pool } from "../lib/db.js";
import { r2Ready, uploadImage } from "../services/r2.js";
const tables = ["products", "product_images", "categories", "content_blocks"];
const root = resolve("public");
try {
  const urls = new Set<string>();
  for (const table of tables) {
    const result = await pool.query(
      `SELECT DISTINCT image_url FROM ${table} WHERE image_url LIKE '/assets/%' OR image_url LIKE '/uploads/%'`,
    );
    for (const row of result.rows) urls.add(row.image_url);
  }
  if (!process.argv.includes("--apply")) {
    console.log(
      `${urls.size} local image references can be moved to Cloudflare R2. Run npm run media:migrate -- --apply after configuring R2.`,
    );
  } else {
    if (!r2Ready())
      throw new Error(
        "Configure all R2 environment variables before migrating images.",
      );
    for (const url of urls) {
      const path = resolve(root, "." + url);
      if (!path.startsWith(root + sep)) throw new Error("Invalid image path");
      const result = await uploadImage(await readFile(path));
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const table of tables)
          await client.query(
            `UPDATE ${table} SET image_url=$1 WHERE image_url=$2`,
            [result.url, url],
          );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
      console.log("Migrated " + url);
    }
  }
} finally {
  await pool.end();
}
