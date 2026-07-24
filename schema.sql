CREATE TABLE IF NOT EXISTS payment_orders (
  order_id TEXT PRIMARY KEY,
  public_token_hash TEXT NOT NULL,
  plan_key TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  contact TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_status TEXT,
  transaction_id TEXT UNIQUE,
  payment_method TEXT,
  provider_expires_in TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  terms_accepted_at INTEGER NOT NULL,
  last_provider_check_at INTEGER,
  last_webhook_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_orders_transaction
  ON payment_orders(transaction_id)
  WHERE transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_orders_status
  ON payment_orders(provider_status);

CREATE TABLE IF NOT EXISTS payment_rate_limits (
  client_key TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL
);

