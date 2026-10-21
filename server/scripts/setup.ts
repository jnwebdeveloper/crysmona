import "dotenv/config";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { seedProducts } from "../../database/seedProducts.js";
import { money } from "../../shared/product.js";
import { hashPassword } from "../auth/admin/password.js";
import { STATE_SCHEMA_SQL } from "../lib/schema.js";
const url = new URL(
  process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5436/crysmona",
);
if (decodeURIComponent(url.pathname.slice(1)) !== "crysmona")
  throw new Error("DATABASE_URL must point to the crysmona database.");
const pool = new pg.Client({ connectionString: url.toString() });
await pool.connect();
try {
  await pool.query("BEGIN");
  await pool.query(
    await readFile(
      new URL("../../database/003-numeric-usd.sql", import.meta.url),
      "utf8",
    ),
  );
  await pool.query(
    await readFile(new URL("../../database/schema.sql", import.meta.url), "utf8"),
  );
  await pool.query(
    await readFile(
      new URL("../../database/002-commerce.sql", import.meta.url),
      "utf8",
    ),
  );
  await pool.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  );
  const seeded = await pool.query(
    "SELECT 1 FROM schema_migrations WHERE version='v3-initial-content'",
  );
  if (!seeded.rowCount) {
    await pool.query(
      await readFile(
        new URL("../../database/001-seed-catalog.sql", import.meta.url),
        "utf8",
      ),
    );
    for (const p of seedProducts)
      await pool.query(
        `INSERT INTO products(name,slug,sku,description,note,stone,metal,image_url,price_cents,stock_qty,featured,kind,specifications) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,20,true,$10,$11) ON CONFLICT(slug) DO NOTHING`,
        [
          p.name,
          p.slug,
          "CRY-" + p.slug,
          p.description,
          p.note,
          p.stone,
          p.kind === "gemstone" ? "" : "Sterling Silver",
          p.image,
          money(p.price) * 100,
          p.kind,
          JSON.stringify(p.specifications || {}),
        ],
      );
    await pool.query(
      "UPDATE products SET image_url='/assets/signature-turquoise.jpeg' WHERE slug='purple-copper-turquoise-pendant' AND image_url='/assets/pendant-purple.jpg'",
    );
    for (const [key, value, description] of [
      ["shipping_cents", "25000", "Standard shipping fee in cents"],
      [
        "free_shipping_threshold_cents",
        "500000",
        "Free shipping threshold in cents",
      ],
      ["contact_email", "hello@crysmona.com", "Displayed store contact email"],
    ])
      await pool.query(
        "INSERT INTO settings(key,value,description) VALUES($1,$2,$3) ON CONFLICT(key) DO NOTHING",
        [key, value, description],
      );
    const blocks = [
      [
        "hero",
        "Stories Worn\nClose to You",
        "NATURAL GEMS. TIMELESS JEWELLERY.",
        "Discover unique gemstone jewellery crafted with meaning, for every you.",
        "/assets/hero-model-clean.jpg",
        "EXPLORE COLLECTIONS",
        "/gemstones",
      ],
      [
        "story",
        "Wear the Stone\nThat Speaks to You",
        "",
        "Jewellery with meaning. For every chapter of your story.",
        "/assets/gem-turquoise.jpeg",
        "EXPLORE NOW",
        "/gemstones",
      ],
      [
        "signature",
        "Purple Copper\nTurquoise Pendant",
        "SIGNATURE PIECE",
        "A rare blend of vibrant colour and natural artistry. Handcrafted to make every moment extraordinary.",
        "/assets/signature-turquoise.jpeg",
        "VIEW DETAILS",
        "/product/purple-copper-turquoise-pendant",
      ],
      [
        "craft",
        "From Stone to Story",
        "THE ART OF MAKING",
        "Every Crysmona piece begins with the gemstone — its colour, inclusions, shape and natural character guide every design decision.",
        "/assets/labradorite.jpg",
        "EXPLORE JEWELLERY",
        "/jewellery",
      ],
      [
        "about",
        "Made to Mean More",
        "OUR STORY",
        "Crysmona celebrates jewellery that feels personal: natural gemstones, thoughtful proportions and pieces designed to become part of your story.",
        "/assets/hero-model-clean.jpg",
        "DISCOVER GEMSTONES",
        "/gemstones",
      ],
    ];
    for (const b of blocks)
      await pool.query(
        "INSERT INTO content_blocks(block_key,title,subtitle,body,image_url,cta_label,cta_url) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(block_key) DO NOTHING",
        b,
      );
    if (!(await pool.query("SELECT 1 FROM navigation LIMIT 1")).rowCount) {
      for (const [i, p] of seedProducts.entries())
        await pool.query(
          "INSERT INTO navigation(label,group_name,url,sort_order) VALUES($1,$2,$3,$4)",
          [
            p.name,
            p.kind === "gemstone" ? "Gemstones" : "Jewellery",
            "/product/" + p.slug,
            i,
          ],
        );
      for (const [label, url] of [
        ["Our Craft", "/our-craft"],
        ["About Crysmona", "/about"],
        ["Contact & Enquiries", "/contact"],
      ])
        await pool.query(
          "INSERT INTO navigation(label,group_name,url) VALUES($1,$2,$3)",
          [label, "Discover", url],
        );
    }
    await pool.query(
      await readFile(
        new URL("../../database/005-seed-content.sql", import.meta.url),
        "utf8",
      ),
    );
    await pool.query(
      "INSERT INTO schema_migrations(version) VALUES('v3-initial-content')",
    );
  }
  await pool.query(
    await readFile(
      new URL("../../database/004-integrity.sql", import.meta.url),
      "utf8",
    ),
  );
  await pool.query(
    await readFile(
      new URL("../../database/006-admin-auth.sql", import.meta.url),
      "utf8",
    ),
  );
  await pool.query(
    await readFile(
      new URL("../../database/007-production-commerce.sql", import.meta.url),
      "utf8",
    ),
  );
  await pool.query(
    await readFile(
      new URL("../../database/008-seo-defaults.sql", import.meta.url),
      "utf8",
    ),
  );
  await pool.query(
    await readFile(
      new URL("../../database/009-admin-security.sql", import.meta.url),
      "utf8",
    ),
  );
  await pool.query(
    await readFile(
      new URL("../../database/010-product-video.sql", import.meta.url),
      "utf8",
    ),
  );
  // Development bootstrap admin. Created only when the email does not already exist,
  // so subsequent setup runs never overwrite a password changed by the owner.
  const bootstrapAdminEmail = (process.env.DEFAULT_ADMIN_EMAIL || "admin@crysmona.com")
    .trim()
    .toLowerCase();
  const bootstrapAdminPassword =
    process.env.DEFAULT_ADMIN_PASSWORD || "CrysmonaAdmin@2026";
  const existingAdmin = await pool.query(
    "SELECT 1 FROM admin_accounts WHERE email = $1",
    [bootstrapAdminEmail],
  );
  if (!existingAdmin.rowCount) {
    const passwordHash = await hashPassword(bootstrapAdminPassword);
    await pool.query(
      "INSERT INTO admin_accounts(email, password_hash, active) VALUES($1, $2, true)",
      [bootstrapAdminEmail, passwordHash],
    );
    console.log(`Development admin ready: ${bootstrapAdminEmail}`);
  }
  await pool.query(STATE_SCHEMA_SQL);
  await pool.query("COMMIT");
  console.log(
    "Crysmona schema and seed data are ready. Existing records were preserved.",
  );
} catch (error) {
  await pool.query("ROLLBACK");
  throw error;
} finally {
  await pool.end();
}
