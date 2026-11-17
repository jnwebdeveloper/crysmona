import { readFile } from "node:fs/promises";
import { pool } from "../lib/db.js";

// Imports products from a CSV laid out like the admin's "Export all products":
//   npm run products:import -- <file.csv>            dry run: report only
//   npm run products:import -- <file.csv> --apply    save (one transaction)
//
// Rows are matched to existing products by SKU (unique and the same on every
// database); the CSV's id column is ignored. A matching SKU updates that
// product; a new SKU creates one, with an id assigned by the database.
// - slug: built from the slug column ("Rainbow Moonstone" → "rainbow-moonstone")
// - note (short description): the slug column's text; slug-like text such as
//   "pink-turquoise-earrings-3c81ef8c" becomes "Pink turquoise earrings"
// - price_cents column: the price in DOLLARS (29.99 → 2999 cents)
// - stock_qty: whole number
// - specifications: one "Label: value" per line; values on one line separated
//   by 3+ spaces count as separate lines; a line without ":" continues the
//   previous value
// - category: category_slug (or a name in CATEGORY_ALIASES) must match a category
// - featured and published are switched on
// - new products get DEFAULT_IMAGE as their main image (no gallery rows are
//   added; add photos in the admin); existing ones keep theirs
const DEFAULT_IMAGE = "/assets/amethyst.jpg";
const REQUIRED = ["name", "sku", "slug", "kind", "price_cents", "stock_qty", "category_slug"];
// Sheet values (after slugify) that differ from the category slugs.
const CATEGORY_ALIASES: Record<string, string> = {
  "pendant-necklace": "pendants",
  "pendant-necklaces": "pendants",
  // Local and production spell these categories differently; each value
  // falls back to the other spelling.
  braclets: "bracelets",
  bracelets: "braclets",
  "dangle-turquoise-earrings": "dangles",
  dangles: "dangle-turquoise-earrings",
};

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export const slugify = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 200)
    .replace(/-$/, "");

export function parseSpecifications(text: string) {
  const specs: Record<string, string> = {};
  let last = "";
  // A run of 3+ spaces starts a new specification, unless it only pads the gap
  // before a colon ("Color        : Purple").
  for (const piece of text.split(/\r?\n|\s{3,}(?=[^\s:])/)) {
    const line = piece.trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon > 0) {
      // Tidy labels like ", Chain Length" or "Item  name", and values like ":- 18 inches".
      last = line.slice(0, colon).replace(/^[\s,;]+/, "").replace(/\s+/g, " ").trim();
      specs[last] = line.slice(colon + 1).replace(/^[\s-]+/, "").trim();
    } else if (last) specs[last] = (specs[last] + " " + line).trim();
  }
  return specs;
}

const wholeNumber = (value: string) => /^\d+$/.test(value.trim()) ? Number(value) : NaN;

// "29.99" → 2999, "35" → 3500; anything else → NaN.
export const dollarsToCents = (value: string) =>
  /^\d+(\.\d{1,2})?$/.test(value.trim()) ? Math.round(Number(value) * 100) : NaN;

// The CSV's own value first, then its alias.
export const categoryKeys = (value: string) => {
  const key = slugify(value);
  return CATEGORY_ALIASES[key] ? [key, CATEGORY_ALIASES[key]] : [key];
};

// Turns slug-like text into words for the short description; other text is kept.
export function shortDescription(text: string) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)+$/.test(text)) return text;
  const words = text.replace(/-[0-9a-f]{8}$/, "").replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const apply = process.argv.includes("--apply");
  if (!file) throw new Error("Usage: npm run products:import -- <file.csv> [--apply]");
  const [header, ...lines] = parseCsv(await readFile(file, "utf8"));
  const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  const missing = REQUIRED.filter((h) => !(h in col));
  if (missing.length) throw new Error("Missing columns: " + missing.join(", "));
  const get = (row: string[], key: string) => (key in col ? row[col[key]] ?? "" : "").trim();

  const categories = new Map(
    (await pool.query("SELECT id, slug, type FROM categories")).rows.map((c) => [c.slug, c]),
  );
  const existing = new Map(
    (await pool.query("SELECT id, sku, slug FROM products WHERE sku IS NOT NULL")).rows.map((p) => [p.sku, p]),
  );
  const slugOwners = new Map(
    (await pool.query("SELECT id, slug FROM products")).rows.map((p) => [p.slug, p.id]),
  );

  const errors: string[] = [],
    warnings: string[] = [],
    plans: any[] = [];
  const seenSku = new Set<string>(),
    seenSlug = new Map<string, number>();
  lines.forEach((row, index) => {
    const line = index + 2;
    const fail = (message: string) => errors.push(`Row ${line}: ${message}`);
    const sku = get(row, "sku");
    const name = get(row, "name");
    const slugText = get(row, "slug");
    const slug = slugify(slugText);
    const kind = get(row, "kind").toLowerCase();
    const price = dollarsToCents(get(row, "price_cents"));
    const stock = wholeNumber(get(row, "stock_qty"));
    const category = categoryKeys(get(row, "category_slug"))
      .map((key) => categories.get(key))
      .find(Boolean);
    if (!sku) fail("sku is empty");
    else if (sku.length > 80) fail("sku is longer than 80 characters");
    else if (seenSku.has(sku)) fail(`sku ${sku} appears more than once`);
    seenSku.add(sku);
    if (!name) fail("name is empty");
    else if (name.length > 180) fail(`name is ${name.length} characters (max 180)`);
    if (!slug) fail("slug is empty");
    else if (seenSlug.has(slug)) fail(`slug "${slug}" is the same as row ${seenSlug.get(slug)}`);
    seenSlug.set(slug, line);
    if (!["jewellery", "gemstone"].includes(kind)) fail(`kind "${get(row, "kind")}" must be jewellery or gemstone`);
    if (!Number.isSafeInteger(price)) fail(`price "${get(row, "price_cents")}" must be dollars, like 29.99 or 35`);    if (!Number.isSafeInteger(stock)) fail(`stock_qty "${get(row, "stock_qty")}" must be a whole number`);
    if (!category) fail(`category_slug "${get(row, "category_slug")}" doesn't match a category`);
    else if (category.type !== kind) warnings.push(`Row ${line}: ${kind} product in ${category.type} category "${category.slug}"`);
    const match = existing.get(sku);
    const owner = slugOwners.get(slug);
    if (slug && owner && owner !== match?.id) fail(`slug "${slug}" is already used by another product (id ${owner})`);
    if (get(row, "stone").length > 140) fail("stone is longer than 140 characters");
    if (get(row, "metal").length > 120) fail("metal is longer than 120 characters");
    plans.push({
      line,
      action: match ? "update" : "create",
      id: match?.id,
      oldSlug: match?.slug,
      values: {
        name,
        sku,
        slug,
        note: shortDescription(slugText),
        description: get(row, "description"),
        stone: get(row, "stone"),
        metal: get(row, "metal"),
        price_cents: price,
        stock_qty: stock,
        kind,
        specifications: parseSpecifications(get(row, "specifications")),
        category_id: category?.id,
        featured: true,
        active: true,
      },
    });
  });

  const target = await pool.query("SELECT current_database() db");
  const host = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : "localhost (default)";
  console.log(`Database: ${host} / ${target.rows[0].db}`);
  console.log(`${file}: ${lines.length} rows`);
  for (const p of plans) {
    const v = p.values;
    console.log(
      `\nRow ${p.line} · ${p.action.toUpperCase()}${p.id ? ` product ${p.id}` : ""} · ${v.sku}` +
        `\n  slug: ${p.oldSlug && p.oldSlug !== v.slug ? `${p.oldSlug} → ` : ""}${v.slug}` +
        `\n  ${v.kind} · ${v.category_id ? [...categories.values()].find((c) => c.id === v.category_id)?.slug : "?"}` +
        ` · $${(v.price_cents / 100).toFixed(2)} · stock ${v.stock_qty} · ${Object.keys(v.specifications).length} specifications` +
        `\n  short description: ${v.note}`,
    );
    for (const [label, value] of Object.entries(v.specifications)) console.log(`    ${label}: ${value}`);
  }
  if (warnings.length) console.log("\nWarnings:\n  " + warnings.join("\n  "));
  const creates = plans.filter((p) => p.action === "create").length;
  console.log(`\nSummary: ${creates} new, ${plans.length - creates} updated, ${errors.length} errors`);
  if (errors.length) {
    console.log("\nErrors (nothing was saved):\n  " + errors.join("\n  "));
    process.exitCode = 1;
    return;
  }
  if (!apply) {
    console.log("\nDry run: nothing was saved. Add --apply to import.");
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const p of plans) {
      const v = { ...p.values, specifications: JSON.stringify(p.values.specifications) };
      const keys = Object.keys(v);
      if (p.action === "update") {
        await client.query(
          `UPDATE products SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(",")}, updated_at=now() WHERE id=$${keys.length + 1}`,
          [...Object.values(v), p.id],
        );
      } else {
        await client.query(
          `INSERT INTO products(${keys.join(",")},image_url) VALUES(${keys.map((_, i) => "$" + (i + 1)).join(",")},$${keys.length + 1})`,
          [...Object.values(v), DEFAULT_IMAGE],
        );
      }
    }
    await client.query("COMMIT");
    console.log(`\nImported: ${creates} new, ${plans.length - creates} updated.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Run only as a command, so tests can import the parsing helpers.
if (/import-products\.[jt]s$/.test(process.argv[1] || "")) {
  try {
    await main();
  } finally {
    await pool.end();
  }
}
