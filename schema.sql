-- 大胃王 (replica) — D1 schema

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  username       TEXT NOT NULL,
  username_lower TEXT NOT NULL UNIQUE,   -- case-insensitive uniqueness
  salt           TEXT,                   -- NULL while awaiting a reset
  hash           TEXT,
  color          TEXT NOT NULL,
  avatar         TEXT,                   -- emoji shown on the seat
  seat           INTEGER,                -- 1..9 while seated, else NULL
  birthday       TEXT,                   -- YYYY-MM-DD, optional
  coins          INTEGER NOT NULL,
  is_admin       INTEGER NOT NULL DEFAULT 0,
  is_super       INTEGER NOT NULL DEFAULT 0,   -- the one account that can grant admin
  perms          TEXT,                          -- comma list: appeals,manual,password,users,admins
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

-- Players ask for coins; the superadmin approves or rejects.
-- `credited` guards the payout the same way records.paid does, so approving
-- twice cannot pay twice.
CREATE TABLE IF NOT EXISTS topup_requests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id),
  amount     INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  credited   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  decided_at INTEGER,
  decided_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_topup_status ON topup_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_topup_user ON topup_requests(user_id);

-- Append-only record of every action that moves money or changes access:
-- who did it, to whom, how much, when. Never updated or deleted.
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          INTEGER NOT NULL,
  action      TEXT NOT NULL,    -- topup_manual | topup_approve | topup_reject
                                -- | topup_request | clear_password | register
  actor_id    TEXT,             -- NULL when the player acted on themselves
  actor_name  TEXT,
  target_id   TEXT,
  target_name TEXT,
  amount      INTEGER,
  detail      TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action, at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(target_id, at DESC);

-- Room chat.
CREATE TABLE IF NOT EXISTS chat (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id  TEXT NOT NULL REFERENCES users(id),
  username TEXT NOT NULL,
  color    TEXT NOT NULL,
  avatar   TEXT,
  text     TEXT NOT NULL,
  at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_at ON chat(at DESC);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
