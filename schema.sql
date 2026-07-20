-- 大胃王 (replica) — D1 schema

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  username       TEXT NOT NULL,
  username_lower TEXT NOT NULL UNIQUE,   -- case-insensitive uniqueness
  salt           TEXT,                   -- NULL while awaiting a reset
  hash           TEXT,
  color          TEXT NOT NULL,
  avatar         TEXT,                   -- emoji shown on the seat
  bio            TEXT,                   -- self-written intro shown on the profile
  seat           INTEGER,                -- 1..9 while seated, else NULL
  last_seen      INTEGER,                -- updated each poll; drives the online list
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
  kind     TEXT NOT NULL DEFAULT 'msg',   -- 'msg' | 'bcast' (big-gift broadcast)
  at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_at ON chat(at DESC);

-- Gifts between players. The receiver keeps a share of the cost; the rest is
-- the platform's cut (not credited anywhere).
CREATE TABLE IF NOT EXISTS gifts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id   TEXT NOT NULL,
  from_name TEXT NOT NULL,
  to_id     TEXT NOT NULL,
  to_name   TEXT NOT NULL,
  gift_id   TEXT NOT NULL,
  emoji     TEXT NOT NULL,
  cost      INTEGER NOT NULL,
  received  INTEGER NOT NULL,
  at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gifts_at ON gifts(at DESC);
CREATE INDEX IF NOT EXISTS idx_gifts_from ON gifts(from_id);
CREATE INDEX IF NOT EXISTS idx_gifts_to ON gifts(to_id);

-- Bag: gifts a player won in Star Travel, giftable in the ChatRoom.
CREATE TABLE IF NOT EXISTS inventory (
  user_id  TEXT NOT NULL,
  item_key TEXT NOT NULL,           -- star reward value as a string
  emoji    TEXT NOT NULL,
  name     TEXT,
  value    INTEGER NOT NULL,        -- coin value of one item
  count    INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_inv_user ON inventory(user_id);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
