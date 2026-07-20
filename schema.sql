-- 大胃王 (replica) — D1 schema

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  username       TEXT NOT NULL,
  username_lower TEXT NOT NULL UNIQUE,   -- case-insensitive uniqueness
  salt           TEXT,                   -- NULL while awaiting a reset
  hash           TEXT,
  color          TEXT NOT NULL,
  coins          INTEGER NOT NULL,
  is_admin       INTEGER NOT NULL DEFAULT 0,
  must_reset     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Bets awaiting settlement. Dropped once their round is paid out.
CREATE TABLE IF NOT EXISTS bets (
  round_id  INTEGER NOT NULL,
  user_id   TEXT NOT NULL REFERENCES users(id),
  animal_id TEXT NOT NULL,
  stake     INTEGER NOT NULL,
  PRIMARY KEY (round_id, user_id, animal_id)
);

CREATE INDEX IF NOT EXISTS idx_bets_round ON bets(round_id);

-- Settled slips. `id` is "<round>-<user>", so a round can only ever be
-- settled once per player no matter how many requests race to do it.
CREATE TABLE IF NOT EXISTS records (
  id          TEXT PRIMARY KEY,
  round_id    INTEGER NOT NULL,
  user_id     TEXT NOT NULL REFERENCES users(id),
  at          INTEGER NOT NULL,
  landed_id   TEXT NOT NULL,
  landed_name TEXT NOT NULL,
  is_plate    INTEGER NOT NULL,
  rows_json   TEXT NOT NULL,
  staked      INTEGER NOT NULL,
  won         INTEGER NOT NULL,
  net         INTEGER NOT NULL,
  paid        INTEGER NOT NULL DEFAULT 0   -- guards against double payout
);

CREATE INDEX IF NOT EXISTS idx_records_at ON records(at);
CREATE INDEX IF NOT EXISTS idx_records_round ON records(round_id);
CREATE INDEX IF NOT EXISTS idx_records_user ON records(user_id);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
