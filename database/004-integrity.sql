CREATE INDEX IF NOT EXISTS products_category_idx ON products(category_id);
CREATE INDEX IF NOT EXISTS product_images_product_idx ON product_images(product_id);
CREATE INDEX IF NOT EXISTS addresses_user_idx ON addresses(user_id);
CREATE INDEX IF NOT EXISTS orders_user_idx ON orders(user_id);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_product_idx ON order_items(product_id);
CREATE INDEX IF NOT EXISTS reviews_product_idx ON reviews(product_id);
CREATE INDEX IF NOT EXISTS wishlists_product_idx ON wishlists(product_id);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='products_stock_nonnegative') THEN
  ALTER TABLE products ADD CONSTRAINT products_stock_nonnegative CHECK(stock_qty>=0);
 END IF;
END $$;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'USD';
