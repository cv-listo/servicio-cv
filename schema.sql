CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  email TEXT,
  plan_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ARS',
  status TEXT NOT NULL,
  discount_code TEXT,
  mp_preference_id TEXT,
  mp_payment_id TEXT,
  external_reference TEXT NOT NULL,
  data_json TEXT DEFAULT '{}',
  cv_json TEXT DEFAULT '{}',
  display_flags TEXT DEFAULT '{}',
  generated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email);

CREATE TABLE IF NOT EXISTS order_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS final_documents (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
