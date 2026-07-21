-- 大胃王 (replica) — Supabase / Postgres schema.
--
-- Ported from schema.sql (Cloudflare D1 / SQLite). Differences from the
-- original:
--   * INTEGER PRIMARY KEY AUTOINCREMENT  ->  BIGINT GENERATED ALWAYS AS IDENTITY
--   * All numeric columns are BIGINT. Timestamps are stored as Date.now()
--     (epoch milliseconds ~1.7e12) which overflow Postgres INT4, so BIGINT is
--     required for those; the rest are BIGINT too for uniformity, and the
--     Netlify function parses BIGINT back to JS numbers.
--   * Everything else (TEXT, DEFAULT, REFERENCES, indexes, ON CONFLICT usage
--     in the app) is already portable.
--
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste ->
-- Run.

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  username       TEXT NOT NULL,
  username_lower TEXT NOT NULL UNIQUE,
  salt           TEXT,
  hash           TEXT,
  color          TEXT NOT NULL,
  avatar         TEXT,
  bio            TEXT,
  seat           BIGINT,
  last_seen      BIGINT,
  birthday       TEXT,
  coins          BIGINT NOT NULL,
  is_admin       BIGINT NOT NULL DEFAULT 0,
  is_super       BIGINT NOT NULL DEFAULT 0,
  perms          TEXT,
  must_reset     BIGINT NOT NULL DEFAULT 0,
  created_at     BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS bets (
  round_id  BIGINT NOT NULL,
  user_id   TEXT NOT NULL REFERENCES users(id),
  animal_id TEXT NOT NULL,
  stake     BIGINT NOT NULL,
  PRIMARY KEY (round_id, user_id, animal_id)
);

CREATE INDEX IF NOT EXISTS idx_bets_round ON bets(round_id);

CREATE TABLE IF NOT EXISTS records (
  id          TEXT PRIMARY KEY,
  round_id    BIGINT NOT NULL,
  user_id     TEXT NOT NULL REFERENCES users(id),
  at          BIGINT NOT NULL,
  landed_id   TEXT NOT NULL,
  landed_name TEXT NOT NULL,
  is_plate    BIGINT NOT NULL,
  rows_json   TEXT NOT NULL,
  staked      BIGINT NOT NULL,
  won         BIGINT NOT NULL,
  net         BIGINT NOT NULL,
  paid        BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_records_at ON records(at);
CREATE INDEX IF NOT EXISTS idx_records_round ON records(round_id);
CREATE INDEX IF NOT EXISTS idx_records_user ON records(user_id);

CREATE TABLE IF NOT EXISTS topup_requests (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  amount     BIGINT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  credited   BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  decided_at BIGINT,
  decided_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_topup_status ON topup_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_topup_user ON topup_requests(user_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at          BIGINT NOT NULL,
  action      TEXT NOT NULL,
  actor_id    TEXT,
  actor_name  TEXT,
  target_id   TEXT,
  target_name TEXT,
  amount      BIGINT,
  detail      TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action, at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(target_id, at DESC);

CREATE TABLE IF NOT EXISTS chat (
  id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id  TEXT NOT NULL REFERENCES users(id),
  username TEXT NOT NULL,
  color    TEXT NOT NULL,
  avatar   TEXT,
  text     TEXT NOT NULL,
  kind     TEXT NOT NULL DEFAULT 'msg',
  at       BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_at ON chat(at DESC);

CREATE TABLE IF NOT EXISTS gifts (
  id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  from_id   TEXT NOT NULL,
  from_name TEXT NOT NULL,
  to_id     TEXT NOT NULL,
  to_name   TEXT NOT NULL,
  gift_id   TEXT NOT NULL,
  emoji     TEXT NOT NULL,
  cost      BIGINT NOT NULL,
  received  BIGINT NOT NULL,
  at        BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gifts_at ON gifts(at DESC);
CREATE INDEX IF NOT EXISTS idx_gifts_from ON gifts(from_id);
CREATE INDEX IF NOT EXISTS idx_gifts_to ON gifts(to_id);

CREATE TABLE IF NOT EXISTS star_wins (
  id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id  TEXT NOT NULL,
  username TEXT NOT NULL,
  emoji    TEXT NOT NULL,
  name     TEXT,
  value    BIGINT NOT NULL,
  qty      BIGINT NOT NULL,
  at       BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_star_at ON star_wins(at DESC);
CREATE INDEX IF NOT EXISTS idx_star_user ON star_wins(user_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_star_value ON star_wins(value, at DESC);

CREATE TABLE IF NOT EXISTS inventory (
  user_id  TEXT NOT NULL,
  item_key TEXT NOT NULL,
  emoji    TEXT NOT NULL,
  name     TEXT,
  value    BIGINT NOT NULL,
  count    BIGINT NOT NULL,
  PRIMARY KEY (user_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_inv_user ON inventory(user_id);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
