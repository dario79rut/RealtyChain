module.exports = `
CREATE TABLE IF NOT EXISTS realtychain_records (
  namespace TEXT NOT NULL,
  store_name TEXT NOT NULL,
  record_key TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (namespace, store_name, record_key)
);
`;
