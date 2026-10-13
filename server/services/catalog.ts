// API shape of a product row, shared by catalog, cart and order responses.
export const dto = (p: any) => ({
  id: p.id,
  categoryId: p.category_id,
  slug: p.slug,
  name: p.name,
  image: p.image_url,
  price: new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(p.price_cents / 100),
  priceCents: p.price_cents,
  note: p.note || "",
  stone: p.stone || "",
  metal: p.metal || "",
  description: p.description || "",
  kind: p.kind,
  specifications: p.specifications || {},
  stockQty: p.stock_qty,
  images: p.images || [],
});
