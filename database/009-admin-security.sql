-- Shared, atomic throttling survives restarts and multiple API processes.
CREATE TABLE IF NOT EXISTS admin_login_attempts (
  key_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL CHECK (attempts > 0),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_login_attempts_expiry_idx
  ON admin_login_attempts(expires_at);
