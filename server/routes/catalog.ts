import express from "express";
import { bad } from "../lib/errors.js";
import { dto } from "../services/catalog.js";
import { q } from "../lib/db.js";
import { expireUnpaidOrders } from "../services/orders.js";
const app = express.Router();
// Product reads release stock held by abandoned PayPal checkouts first, so shoppers
// do not see items as sold out that nobody paid for (at most one check a minute).
app.get("/api/products", async (_req, res) => {
  await expireUnpaidOrders();
  const { rows } = await q(
    `SELECT p.*, COALESCE((SELECT json_agg(i ORDER BY i.sort_order,i.id) FROM product_images i WHERE i.product_id=p.id), '[]'::json) images
     FROM products p LEFT JOIN admin_record_order o ON o.resource='products' AND o.record_id=p.id
     WHERE p.active=true ORDER BY o.position NULLS LAST,p.created_at,p.name`,
  );
  res.json(rows.map(dto));
});
app.get("/api/products/:slug", async (req, res) => {
  await expireUnpaidOrders();
  const { rows } = await q(
    "SELECT * FROM products WHERE slug=$1 AND active=true",
    [req.params.slug],
  );
  if (!rows[0]) throw bad("Product not found.", 404);
  const images = await q(
    "SELECT media_url,alt_text,media_type FROM product_images WHERE product_id=$1 ORDER BY sort_order,id",
    [rows[0].id],
  );
  res.json({ ...dto(rows[0]), images: images.rows });
});
app.get("/api/storefront", async (_req, res) => {
  const [content, navigation, categories, settings, reviews] =
    await Promise.all([
      q(
        "SELECT t.* FROM content_blocks t LEFT JOIN admin_record_order o ON o.resource='content_blocks' AND o.record_id=t.id ORDER BY o.position NULLS LAST,t.block_key",
      ),
      q(
        "SELECT t.*,COALESCE(o.position,t.sort_order) AS sort_order FROM navigation t LEFT JOIN admin_record_order o ON o.resource='navigation' AND o.record_id=t.id WHERE t.active=true ORDER BY o.position NULLS LAST,t.sort_order,t.label",
      ),
      q(
        "SELECT t.*,COALESCE(o.position,t.sort_order) AS sort_order FROM categories t LEFT JOIN admin_record_order o ON o.resource='categories' AND o.record_id=t.id WHERE t.active=true ORDER BY o.position NULLS LAST,t.sort_order,t.name",
      ),
      q("SELECT key,value FROM settings"),
      q("SELECT * FROM reviews WHERE active=true"),
    ]);
  res.json({
    content: content.rows,
    navigation: navigation.rows,
    categories: categories.rows,
    settings: Object.fromEntries(settings.rows.map((r) => [r.key, r.value])),
    reviews: reviews.rows,
  });
});

app.get("/api/seo", async (req, res) => {
  const path = String(req.query.path || "/");
  let { rows } = await q(
    "SELECT * FROM seo_pages WHERE path=$1 AND active=true LIMIT 1",
    [path],
  );
  if (!rows[0] && path.startsWith("/product/")) {
    const slug = path.split("/").pop();
    const product = (
      await q(
        "SELECT name,description,image_url FROM products WHERE slug=$1 AND active=true",
        [slug],
      )
    ).rows[0];
    if (product)
      rows = [
        {
          path,
          title: product.name + " | Crysmona",
          description: product.description,
          og_title: product.name,
          og_description: product.description,
          og_image: product.image_url,
          active: true,
        },
      ];
  }
  res.json(rows[0] || null);
});
app.get("/api/settings/public", async (_req, res) => {
  const { rows } = await q(
    "SELECT setting_key,setting_value FROM site_settings WHERE setting_key IN ('meta_pixel_id','ga4_measurement_id','analytics_consent_required','site_url')",
  );
  res.json(
    Object.fromEntries(rows.map((r: any) => [r.setting_key, r.setting_value])),
  );
});

app.get("/robots.txt", async (_req, res) => {
  const cfg =
    (
      await q(
        "SELECT setting_value FROM site_settings WHERE setting_key='site_url'",
      )
    ).rows[0]?.setting_value || "http://localhost:5173";
  res
    .type("text/plain")
    .send(
      `User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${cfg.replace(/\/$/, "")}/sitemap.xml\n`,
    );
});
app.get("/sitemap.xml", async (_req, res) => {
  const cfg =
    (
      await q(
        "SELECT setting_value FROM site_settings WHERE setting_key='site_url'",
      )
    ).rows[0]?.setting_value || "http://localhost:5173";
  const base = cfg.replace(/\/$/, "");
  const products = (
    await q("SELECT slug,updated_at FROM products WHERE active=true")
  ).rows;
  const pages = [
    "/",
    "/gemstones",
    "/jewellery",
    "/our-craft",
    "/about",
    "/contact",
    "/privacy",
    "/terms",
    "/returns",
  ];
  const urls = [
    ...pages.map((path) => ({ path, date: new Date().toISOString() })),
    ...products.map((p) => ({
      path: "/product/" + p.slug,
      date: p.updated_at,
    })),
  ];
  res
    .type("application/xml")
    .send(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${base}${u.path}</loc><lastmod>${new Date(u.date).toISOString()}</lastmod></url>`).join("")}</urlset>`,
    );
});

export default app;
