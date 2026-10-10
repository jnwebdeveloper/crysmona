import type { Product } from "../../shared/product";
export { type Product, formatPrice, money } from "../../shared/product";
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
