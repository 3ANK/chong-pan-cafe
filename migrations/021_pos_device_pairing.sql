-- One-time pairing codes and revocable Android POS device credentials.
-- Store only SHA-256 hashes of access tokens and pairing codes.
CREATE TABLE IF NOT EXISTS pos_pairing_codes (
  code_hash TEXT PRIMARY KEY,
  device_label TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pos_pairing_expiry ON pos_pairing_codes(expires_at);
CREATE TABLE IF NOT EXISTS pos_devices (
  token_hash TEXT PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  device_label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen TEXT,
  revoked_at TEXT
);
