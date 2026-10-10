CREATE TABLE IF NOT EXISTS guest_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS carts (
  owner_key TEXT NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 99),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_key, product_id)
);
CREATE TABLE IF NOT EXISTS guest_wishlists (
  owner_key TEXT NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_key, product_id)
);
CREATE INDEX IF NOT EXISTS carts_owner_idx ON carts(owner_key);
CREATE INDEX IF NOT EXISTS guest_wishlists_owner_idx ON guest_wishlists(owner_key);
-- Phone OTP send log: rate limits SMS requests per number and per client IP.
CREATE TABLE IF NOT EXISTS otp_sends (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phone TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otp_sends_phone_idx ON otp_sends(phone, sent_at);
CREATE INDEX IF NOT EXISTS otp_sends_ip_idx ON otp_sends(ip_hash, sent_at);
