import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { pool } from "../lib/db.js";
import { storageConfig, uploadImage } from "../services/storage.js";
// Table → column holding the file URL.
const tables = {
  products: "image_url",
  product_images: "media_url",
  categories: "image_url",
  content_blocks: "image_url",
};
const root = resolve("public");
try {
  const urls = new Set<string>();
  for (const [table, column] of Object.entries(tables)) {
    const result = await pool.query(
      `SELECT DISTINCT ${column} AS url FROM ${table} WHERE ${column} LIKE '/assets/%' OR ${column} LIKE '/uploads/%'`,
    );
    for (const row of result.rows) urls.add(row.url);
  }
  if (!process.argv.includes("--apply")) {
    console.log(
      `${urls.size} local image references can be moved to media storage. Run npm run media:migrate -- --apply after configuring storage.`,
    );
  } else {
    const { active } = storageConfig();
    if (!active)
      throw new Error(
        "Configure media storage (STORAGE_1_*) before migrating images.",
      );
    console.log(`Uploading to storage ${active.id}: ${active.name}`);
    for (const url of urls) {
      const path = resolve(root, "." + url);
      if (!path.startsWith(root + sep)) throw new Error("Invalid image path");
      const result = await uploadImage(await readFile(path));
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const [table, column] of Object.entries(tables))
          await client.query(
            `UPDATE ${table} SET ${column}=$1 WHERE ${column}=$2`,
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
