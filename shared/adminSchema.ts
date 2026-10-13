export type Field = {
  key: string;
  label: string;
  type?: "number" | "boolean" | "text" | "textarea" | "select" | "specs";
  required?: boolean;
  options?: string[];
};
const f = (
  key: string,
  label: string,
  type: Field["type"] = "text",
  required = false,
  options?: string[],
): Field => ({ key, label, type, required, options });
export const resources: Record<string, { label: string; fields: Field[] }> = {
  products: {
    label: "Products & gemstones",
    fields: [
      f("name", "Product name", "text", true),
      f("slug", "URL slug"),
      f("kind", "Collection", "select", true, ["jewellery", "gemstone"]),
      f("sku", "SKU"),
      f("category_id", "Category ID"),
      f("image_url", "Main image", "text", true),
      f("price_cents", "Price (cents)", "number", true),
      f("stock_qty", "Stock quantity", "number", true),
      f("stone", "Stone"),
      f("metal", "Metal"),
      f("note", "Short description"),
      f("description", "Description", "textarea"),
      f("specifications", "Gemstone specifications", "specs"),
      f("featured", "Featured", "boolean"),
      f("active", "Published", "boolean"),
    ],
  },
  categories: {
    label: "Categories",
    fields: [
      f("name", "Name", "text", true),
      f("slug", "URL slug", "text", true),
      f("type", "Collection", "select", true, ["gemstone", "jewellery"]),
      f("image_url", "Image"),
      f("description", "Description", "textarea"),
      f("sort_order", "Display order", "number"),
      f("active", "Published", "boolean"),
    ],
  },
  product_images: {
    label: "Product gallery",
    fields: [
      f("product_id", "Product ID", "text", true),
      f("image_url", "Image", "text", true),
      f("alt_text", "Image description"),
      f("sort_order", "Display order", "number"),
    ],
  },
  content_blocks: {
    label: "Page content & banners",
    fields: [
      f("block_key", "Section key", "text", true),
      f("title", "Title"),
      f("subtitle", "Eyebrow"),
      f("body", "Body", "textarea"),
      f("image_url", "Image"),
      f("cta_label", "Button text"),
      f("cta_url", "Button destination"),
      f("active", "Published", "boolean"),
    ],
  },
  navigation: {
    label: "Navigation & mega menus",
    fields: [
      f("label", "Link label", "text", true),
      f("group_name", "Menu group", "select", true, [
        "Gemstones",
        "Jewellery",
        "Discover",
        "Footer",
      ]),
      f("url", "Destination", "text", true),
      f("sort_order", "Display order", "number"),
      f("active", "Published", "boolean"),
    ],
  },
  users: {
    label: "Customers",
    fields: [
      f("phone", "Phone", "text", true),
      f("name", "Full name"),
      f("email", "Email"),
    ],
  },
  addresses: {
    label: "Customer addresses",
    fields: [
      f("user_id", "Customer ID", "text", true),
      f("first_name", "First name"),
      f("last_name", "Last name"),
      f("line1", "Address", "text", true),
      f("line2", "Address line 2"),
      f("city", "City"),
      f("state", "State"),
      f("postal_code", "Postal code"),
      f("country", "Country"),
      f("phone", "Phone"),
    ],
  },
  orders: {
    label: "Orders",
    fields: [
      f("order_number", "Order number", "text", true),
      f("user_id", "Customer ID"),
      f("status", "Status", "select", true, [
        "draft",
        "placed",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
      ]),
      f("payment_status", "Payment status", "select", true, [
        "pending",
        "under_review",
        "paid",
        "failed",
        "refunded",
      ]),
      f("payment_method", "Payment method", "select", true, ["cod", "paypal"]),
      f("subtotal_cents", "Subtotal (cents)", "number", true),
      f("shipping_cents", "Shipping (cents)", "number"),
      f("discount_cents", "Discount (cents)", "number"),
      f("total_cents", "Total (cents)", "number", true),
    ],
  },
  order_items: {
    label: "Order line items",
    fields: [
      f("order_id", "Order ID", "text", true),
      f("product_id", "Product ID"),
      f("product_name", "Product name", "text", true),
      f("sku", "SKU"),
      f("unit_price_cents", "Unit price (cents)", "number", true),
      f("quantity", "Quantity", "number", true),
      f("image_url", "Image"),
    ],
  },
  coupons: {
    label: "Discount codes",
    fields: [
      f("code", "Code", "text", true),
      f("discount_type", "Discount type", "select", true, ["percent", "fixed"]),
      f("discount_value", "Percent or cents", "number", true),
      f("min_order_cents", "Minimum order (cents)", "number"),
      f("starts_at", "Starts (ISO date)"),
      f("ends_at", "Ends (ISO date)"),
      f("max_uses", "Maximum uses", "number"),
      f("per_customer_limit", "Uses per customer", "number"),
      f("active", "Enabled", "boolean"),
    ],
  },
  wishlists: {
    label: "Customer wishlists",
    fields: [
      f("user_id", "Customer ID", "text", true),
      f("product_id", "Product ID", "text", true),
    ],
  },
  enquiries: {
    label: "Contact enquiries",
    fields: [
      f("name", "Name", "text", true),
      f("email", "Email", "text", true),
      f("phone", "Phone"),
      f("message", "Message", "textarea", true),
      f("status", "Status", "select", true, ["new", "in_progress", "resolved"]),
    ],
  },
  subscribers: {
    label: "Newsletter subscribers",
    fields: [
      f("email", "Email", "text", true),
      f("active", "Subscribed", "boolean"),
    ],
  },
  reviews: {
    label: "Product reviews",
    fields: [
      f("product_id", "Product ID", "text", true),
      f("author", "Name", "text", true),
      f("rating", "Rating (1–5)", "number", true),
      f("body", "Review", "textarea", true),
      f("active", "Published", "boolean"),
    ],
  },
  seo_pages: {
    label: "SEO",
    fields: [
      f("path", "Page path", "text", true),
      f("title", "SEO title", "text", true),
      f("description", "Meta description", "textarea"),
      f("keywords", "Keywords", "textarea"),
      f("og_title", "Social title"),
      f("og_description", "Social description", "textarea"),
      f("og_image", "Social image"),
      f("active", "Enabled", "boolean"),
    ],
  },
  site_settings: {
    label: "Tracking & Pixel",
    fields: [
      f("setting_key", "Setting", "text", true),
      f("setting_value", "Value", "textarea"),
      f("description", "Description"),
    ],
  },
  settings: {
    label: "Store settings",
    fields: [
      f("key", "Setting key", "text", true),
      f("value", "Value", "textarea", true),
      f("description", "Description"),
    ],
  },
};
