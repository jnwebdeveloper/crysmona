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
export type CartItem = { product: Product; qty: number };
export type Order = {
  id: string;
  createdAt: string;
  items: CartItem[];
  total: number;
  status: string;
  subtotal?: number;
  shipping?: number;
  discount?: number;
  paymentStatus?: string;
  paymentMethod?: string;
  shippingAddress?: Record<string,string>;
  paypalOrderId?: string;
  paypalCaptureId?: string;
  history?: {status:string;note?:string;actor?:string;created_at:string}[];
};
export const formatPrice = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
export const money = (value: string) => Number(value.replace(/[^\d.]/g, ""));
