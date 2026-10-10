// Product shape and price helpers used by both the storefront and the server
// (seed data and setup script).
export type Product = {
  id?: number;
  categoryId?: number;
  slug: string;
  name: string;
  image: string;
  note: string;
  price: string;
  priceCents?: number;
  stone: string;
  description: string;
  kind?: string;
  metal?: string;
  specifications?: Record<string, string>;
  stockQty?: number;
  images?: { image_url: string; alt_text: string }[];
};
export const formatPrice = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
// Parses a display price such as "$3,490" into a number of dollars.
export const money = (value: string) => Number(value.replace(/[^\d.]/g, ""));
