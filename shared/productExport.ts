// Preserve every database field; structured specifications and galleries use JSON.
// Neutralize formula prefixes so catalog text is safe to open in spreadsheet apps.
export function csvCell(value: unknown): string {
  let text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function productsCsv(products: Record<string, any>[], origin: string): string {
  const absolute = (url: string) => url ? new URL(url, origin).href : "";
  const rows = products.map((product) => ({
    ...product,
    image_url: absolute(product.image_url || ""),
    gallery: (product.gallery || []).map((item: Record<string, any>) => ({ ...item, media_url: absolute(item.media_url || "") })),
  }));
  const headers = Array.from(new Set(["id", "name", "sku", "slug", "image_url", "gallery", ...rows.flatMap(Object.keys)]));
  return [headers.map(csvCell).join(","), ...rows.map((row: Record<string, any>) => headers.map((key) => csvCell(row[key])).join(","))].join("\r\n");
}
