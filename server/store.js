// Persistence. Everything the app reads or writes goes through this module,
// so replacing the JSON file with SQLite/Postgres later touches only this file.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = join(ROOT, 'data');
const DATA_FILE = join(DATA_DIR, 'db.json');

const EMPTY = {
  secret: null,        // HMAC key for the draw
  users: {},           // id -> user
  sessions: {},        // token -> { userId, createdAt }
  pending: {},         // roundId -> { userId -> { animalId -> stake } }
  records: [],         // settled slips, newest first
  lastSettledRound: null,
};

let db;

export function load() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  if (existsSync(DATA_FILE)) {
    try {
      db = { ...EMPTY, ...JSON.parse(readFileSync(DATA_FILE, 'utf8')) };
    } catch (error) {
      // A corrupt file must not silently wipe every account.
      const backup = `${DATA_FILE}.corrupt-${Date.now()}`;
      renameSync(DATA_FILE, backup);
      console.error(`[store] db.json was unreadable (${error.message}).`);
      console.error(`[store] moved it to ${backup} and started fresh.`);
      db = structuredClone(EMPTY);
    }
  } else {
    db = structuredClone(EMPTY);
  }

  if (!db.secret) {
    db.secret = randomBytes(32).toString('hex');
    save();
  }
  return db;
}

// Atomic: write a temp file, then rename over the real one. A crash mid-write
// leaves the previous good file intact rather than a half-written one.
export function save() {
  const tmp = `${DATA_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(db, null, 2));
  renameSync(tmp, DATA_FILE);
}

export const data = () => db;

/* ---- Users ---- */

export const newId = () => randomUUID().slice(0, 8).toUpperCase();

export function findUserByName(username) {
  const wanted = username.trim().toLowerCase();
  return Object.values(db.users).find((u) => u.username.toLowerCase() === wanted);
}

export function createUser(user) {
  // Short, readable ids are what the superadmin types to reload someone.
  let id = newId();
  while (db.users[id]) id = newId();
  db.users[id] = { id, ...user };
  save();
  return db.users[id];
}

/* ---- Sessions ---- */

export function createSession(userId) {
  const token = randomBytes(24).toString('hex');
  db.sessions[token] = { userId, createdAt: Date.now() };
  save();
  return token;
}

export function userForToken(token) {
  const session = token && db.sessions[token];
  return session ? db.users[session.userId] ?? null : null;
}

export function destroySession(token) {
  delete db.sessions[token];
  save();
}

/* ---- Bets ---- */

export function addBet(roundId, userId, animalId, stake) {
  const round = (db.pending[roundId] ??= {});
  const slip = (round[userId] ??= {});
  slip[animalId] = (slip[animalId] ?? 0) + stake;
  save();
}

export function takePending(roundId) {
  const round = db.pending[roundId] ?? {};
  delete db.pending[roundId];
  return round;
}

/* ---- Records ---- */

export function addRecord(record) {
  db.records.unshift(record);
  save();
}

export function recordsSince(sinceMs) {
  return db.records.filter((r) => r.at >= sinceMs);
}
