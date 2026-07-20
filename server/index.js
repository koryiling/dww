// 大胃王 (replica) — API + static host.
// Zero dependencies: node:http only, so `node server/index.js` is the whole
// install step.

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as store from './store.js';
import { hashPassword, verifyPassword } from './auth.js';
import {
  ANIMALS, animalById, CYCLE_MS, drawFor, isPlate, phaseAt,
  publicConfig, resolveWinners, roundIdAt, spotOf,
} from './wheel.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PUBLIC_DIR = join(ROOT, 'public');

const PORT = Number(process.env.PORT ?? 3000);
const STARTING_COINS = 10_000;
const ADMIN_USER = process.env.DWW_ADMIN_USER ?? 'koryiling';
const MAX_RECORDS_RETURNED = 200;

const db = store.load();

/* ---- Admin bootstrap ------------------------------------------------ */

function ensureAdmin() {
  let admin = store.findUserByName(ADMIN_USER);
  const supplied = process.env.DWW_ADMIN_PASSWORD;

  if (!admin) {
    const password = supplied ?? randomPassword();
    admin = store.createUser({
      username: ADMIN_USER,
      ...hashPassword(password),
      color: '#7aa84e',
      coins: STARTING_COINS,
      isAdmin: true,
      createdAt: Date.now(),
    });
    console.log('\n  ┌─ superadmin created ─────────────────────────');
    console.log(`  │  username : ${ADMIN_USER}`);
    console.log(`  │  password : ${supplied ? '(from DWW_ADMIN_PASSWORD)' : password}`);
    console.log(`  │  id       : ${admin.id}`);
    if (!supplied) console.log('  │  Save this now — it is not shown again.');
    console.log('  └──────────────────────────────────────────────\n');
  } else if (supplied) {
    // Env var wins, so a forgotten password is recoverable by restarting.
    // Clearing mustReset matters: without it an admin who cleared their own
    // password stays locked at the reset prompt even with the env var set.
    Object.assign(admin, hashPassword(supplied), { isAdmin: true });
    delete admin.mustReset;
    store.save();
  }
}

function randomPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return Array.from({ length: 14 }, () =>
    alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

/* ---- Settlement ----------------------------------------------------- */

// Round R is settled the moment R+1 begins. Every round strictly before the
// current one is therefore already resolved.
function settleDueRounds() {
  const current = roundIdAt(Date.now());
  if (db.lastSettledRound === null) {
    db.lastSettledRound = current - 1;
    store.save();
    return;
  }
  // If the server was down for a long time, don't grind through every
  // missed round — jump forward, settling only what could hold bets.
  const from = Math.max(db.lastSettledRound + 1, current - 1000);
  for (let roundId = from; roundId < current; roundId++) settleRound(roundId);

  if (db.lastSettledRound !== current - 1) {
    db.lastSettledRound = current - 1;
    store.save();
  }
}

function settleRound(roundId) {
  const spot = drawFor(roundId, db.secret);
  const winners = resolveWinners(spot);
  const winnerIds = new Set(winners.map((a) => a.id));
  const plate = isPlate(spot);
  const slips = store.takePending(roundId);
  const at = Date.now();

  for (const [userId, bets] of Object.entries(slips)) {
    const user = db.users[userId];
    if (!user) continue;

    const rows = Object.entries(bets).map(([animalId, stake]) => {
      const animal = animalById.get(animalId);
      const hit = winnerIds.has(animalId);
      return { animalId, stake, hit, win: hit ? stake * animal.payout : 0 };
    });

    const staked = rows.reduce((sum, r) => sum + r.stake, 0);
    const won = rows.reduce((sum, r) => sum + r.win, 0);

    user.coins += won; // the stake was already taken when the bet was placed
    store.addRecord({
      id: `${roundId}-${userId}`,
      at, roundId, userId,
      username: user.username,
      color: user.color,
      landedId: spot.id,
      landedName: spot.name,
      isPlate: plate,
      rows, staked, won,
      net: won - staked,
    });
  }

  db.lastSettledRound = roundId;
  db.lastResult = {
    roundId,
    landedId: spot.id,
    landedName: spot.name,
    landedArt: spot.art,
    isPlate: plate,
    winnerIds: [...winnerIds],
  };
  store.save();
}

/* ---- Leaderboard ---------------------------------------------------- */

function startOf(range) {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === 'week') {
    // Week starts Monday.
    const dayOffset = (midnight.getDay() + 6) % 7;
    midnight.setDate(midnight.getDate() - dayOffset);
  } else if (range === 'month') {
    midnight.setDate(1);
  }
  return midnight.getTime();
}

function leaderboard(range) {
  const totals = new Map();
  for (const record of store.recordsSince(startOf(range))) {
    const entry = totals.get(record.userId) ?? { net: 0, rounds: 0 };
    entry.net += record.net;
    entry.rounds += 1;
    totals.set(record.userId, entry);
  }
  return [...totals]
    .map(([userId, { net, rounds }]) => {
      const user = db.users[userId];
      return {
        userId,
        username: user?.username ?? '(deleted)',
        color: user?.color ?? '#7aa84e',
        net,
        rounds,
      };
    })
    .sort((a, b) => b.net - a.net)
    .slice(0, 20);
}

/* ---- HTTP plumbing -------------------------------------------------- */

const send = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(payload);
};

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

const tokenFrom = (req) => (req.headers.authorization ?? '').replace(/^Bearer /, '');
const publicUser = (u) => ({
  id: u.id, username: u.username, color: u.color, coins: u.coins, isAdmin: !!u.isAdmin,
});

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  const rel = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^([/\\])+/, '');
  const file = join(PUBLIC_DIR, rel);
  // normalize() collapses `..`, so this rejects anything outside public/.
  if (!file.startsWith(PUBLIC_DIR) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}

/* ---- Routes --------------------------------------------------------- */

async function handleApi(req, res, url) {
  const { pathname } = url;
  const me = store.userForToken(tokenFrom(req));
  const requireUser = () => {
    if (!me) { send(res, 401, { error: '请先登录', code: 'auth_required' }); return null; }
    return me;
  };

  if (pathname === '/api/config' && req.method === 'GET') {
    return send(res, 200, publicConfig);
  }

  if (pathname === '/api/register' && req.method === 'POST') {
    const { username = '', password = '', color = '#7aa84e' } = await readJson(req);
    const name = String(username).trim();

    if (!/^[\w一-龥]{2,16}$/.test(name)) {
      return send(res, 400, { error: '用户名需 2–16 位字母、数字或中文', code: 'bad_username' });
    }
    if (String(password).length < 4) {
      return send(res, 400, { error: '密码至少 4 位', code: 'short_password' });
    }
    if (store.findUserByName(name)) {
      return send(res, 409, { error: '该用户名已被使用', code: 'name_taken' });
    }
    if (!/^#[0-9a-f]{6}$/i.test(color)) {
      return send(res, 400, { error: '颜色格式无效', code: 'bad_color' });
    }

    const user = store.createUser({
      username: name,
      ...hashPassword(String(password)),
      color,
      coins: STARTING_COINS,
      isAdmin: false,
      createdAt: Date.now(),
    });
    return send(res, 200, { token: store.createSession(user.id), user: publicUser(user) });
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    const { username = '', password = '' } = await readJson(req);
    const user = store.findUserByName(String(username));

    // The admin cleared this password — send them to the reset form instead.
    if (user?.mustReset) {
      return send(res, 409, { error: '密码已被管理员清除，请设置新密码', code: 'needs_reset' });
    }
    // Same message either way — don't reveal which usernames exist.
    if (!user || !user.hash || !verifyPassword(String(password), user.salt, user.hash)) {
      return send(res, 401, { error: '用户名或密码错误', code: 'bad_credentials' });
    }
    return send(res, 200, { token: store.createSession(user.id), user: publicUser(user) });
  }

  // Only usable while the admin has the account flagged for reset, so this
  // is not a way to take over someone else's account.
  if (pathname === '/api/reset-password' && req.method === 'POST') {
    const { username = '', password = '' } = await readJson(req);
    const user = store.findUserByName(String(username));

    if (!user || !user.mustReset) {
      return send(res, 403, { error: '该账号未开放重设密码', code: 'reset_not_allowed' });
    }
    if (String(password).length < 4) {
      return send(res, 400, { error: '密码至少 4 位', code: 'short_password' });
    }

    Object.assign(user, hashPassword(String(password)));
    delete user.mustReset;
    store.save();
    return send(res, 200, { token: store.createSession(user.id), user: publicUser(user) });
  }

  if (pathname === '/api/logout' && req.method === 'POST') {
    store.destroySession(tokenFrom(req));
    return send(res, 200, { ok: true });
  }

  if (pathname === '/api/state' && req.method === 'GET') {
    const now = Date.now();
    const { roundId, phase, msLeft } = phaseAt(now);
    return send(res, 200, {
      now,
      roundId,
      phase,
      msLeft,
      lastResult: db.lastResult ?? null,
      me: me ? publicUser(me) : null,
      myBets: me ? (db.pending[roundId]?.[me.id] ?? {}) : {},
    });
  }

  if (pathname === '/api/bet' && req.method === 'POST') {
    if (!requireUser()) return;
    const { animalId, amount } = await readJson(req);

    const now = Date.now();
    const { roundId, phase } = phaseAt(now);
    if (phase !== 'betting') return send(res, 409, { error: '本轮已封盘', code: 'closed' });
    if (!animalById.has(animalId)) return send(res, 400, { error: '无效的下注目标', code: 'bad_target' });

    const stake = Number(amount);
    if (!Number.isInteger(stake) || stake <= 0) {
      return send(res, 400, { error: '下注金额无效', code: 'bad_amount' });
    }
    if (stake > me.coins) {
      return send(res, 400, { error: '余额不足，请联系管理员充值', code: 'insufficient' });
    }

    me.coins -= stake; // taken now so the balance can never go negative
    store.addBet(roundId, me.id, animalId, stake);
    store.save();
    return send(res, 200, {
      user: publicUser(me),
      myBets: db.pending[roundId][me.id],
    });
  }

  if (pathname === '/api/records' && req.method === 'GET') {
    // Every player can see every player's records, by design.
    const userId = url.searchParams.get('userId');
    const records = (userId ? db.records.filter((r) => r.userId === userId) : db.records)
      .slice(0, MAX_RECORDS_RETURNED);
    return send(res, 200, { records });
  }

  if (pathname === '/api/leaderboard' && req.method === 'GET') {
    const range = url.searchParams.get('range') ?? 'day';
    if (!['day', 'week', 'month'].includes(range)) {
      return send(res, 400, { error: '无效的时间范围', code: 'bad_range' });
    }
    return send(res, 200, { range, entries: leaderboard(range) });
  }

  /* ---- Admin ---- */

  if (pathname.startsWith('/api/admin/')) {
    if (!requireUser()) return;
    if (!me.isAdmin) return send(res, 403, { error: '需要管理员权限', code: 'admin_required' });

    if (pathname === '/api/admin/users' && req.method === 'GET') {
      const users = Object.values(db.users)
        .map((u) => ({ ...publicUser(u), mustReset: !!u.mustReset }))
        .sort((a, b) => a.username.localeCompare(b.username));
      return send(res, 200, { users });
    }

    if (pathname === '/api/admin/reload' && req.method === 'POST') {
      const { userId, amount } = await readJson(req);
      const target = db.users[String(userId).toUpperCase()];
      if (!target) return send(res, 404, { error: '找不到该用户 ID', code: 'user_not_found' });

      const delta = Number(amount);
      if (!Number.isInteger(delta) || delta === 0) {
        return send(res, 400, { error: '充值金额无效', code: 'bad_amount' });
      }
      if (target.coins + delta < 0) {
        return send(res, 400, { error: '扣款后余额会为负', code: 'negative_balance' });
      }

      target.coins += delta;
      store.save();
      console.log(`[admin] ${me.username} reloaded ${target.username} (${target.id}) by ${delta} -> ${target.coins}`);
      return send(res, 200, { user: publicUser(target) });
    }

    // Forgot-password flow: the admin clears the password, then the user
    // sets a new one themselves. The admin never sees or picks it.
    if (pathname === '/api/admin/clear-password' && req.method === 'POST') {
      const { userId } = await readJson(req);
      const target = db.users[String(userId).toUpperCase()];
      if (!target) return send(res, 404, { error: '找不到该用户 ID', code: 'user_not_found' });
      if (target.isAdmin && target.id !== me.id) {
        return send(res, 403, { error: '不能清除其他管理员的密码', code: 'admin_protected' });
      }

      target.hash = null;
      target.salt = null;
      target.mustReset = true;
      // Any device still logged in as them is signed out immediately.
      for (const [token, session] of Object.entries(db.sessions)) {
        if (session.userId === target.id) delete db.sessions[token];
      }
      store.save();
      console.log(`[admin] ${me.username} cleared password for ${target.username} (${target.id})`);
      return send(res, 200, { user: { ...publicUser(target), mustReset: true } });
    }
  }

  return send(res, 404, { error: 'Not found' });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error('[error]', error);
    if (!res.headersSent) send(res, 500, { error: '服务器错误' });
  }
});

ensureAdmin();
settleDueRounds();
setInterval(settleDueRounds, 1000).unref?.();

server.listen(PORT, () => {
  console.log(`  大胃王 (replica) running`);
  console.log(`  game   http://localhost:${PORT}/`);
  console.log(`  admin  http://localhost:${PORT}/admin.html`);
  console.log(`  round  ${CYCLE_MS / 1000}s cycle — ${ANIMALS.length} animals\n`);
});
