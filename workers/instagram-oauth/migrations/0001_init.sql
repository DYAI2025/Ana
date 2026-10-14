CREATE TABLE IF NOT EXISTS oauth_invites (
  invite_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_oauth_invite_expiry ON oauth_invites(expires_at);

CREATE TABLE IF NOT EXISTS oauth_attempts (
  state_hash TEXT PRIMARY KEY,
  cookie_hash TEXT NOT NULL,
  invite_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  FOREIGN KEY (invite_hash) REFERENCES oauth_invites(invite_hash)
);
CREATE INDEX IF NOT EXISTS idx_oauth_attempt_expiry ON oauth_attempts(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_attempt_invite ON oauth_attempts(invite_hash);

CREATE TABLE IF NOT EXISTS instagram_tokens (
  account_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  token_ciphertext TEXT NOT NULL,
  granted_permissions TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  connection_status TEXT NOT NULL DEFAULT 'CONNECTED',
  last_refresh_attempt_at INTEGER,
  last_refresh_error TEXT
);
