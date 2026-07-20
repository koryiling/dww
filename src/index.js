// 大胃王 (replica) — Cloudflare Worker API.
// public/ is served by the edge; anything unmatched falls through to here.
//
// No process runs between requests. That's fine: the draw is a pure function
// of the round number, so a round's outcome exists whether or not anyone is
// watching. Settlement happens lazily on the next request that needs it.

import {
  animalById, CYCLE_MS, drawFor, isPlate, phaseAt,
  publicConfig, resolveWinners, roundIdAt,
} from './wheel.js';
import {
  hashPassword, newUserId, randomSecret, randomToken, verifyPassword,
} from './auth.js';

const STARTING_COINS = 10_000;
const MAX_RECORDS = 200;
const MAX_ROUNDS_PER_REQUEST = 20;   // keeps one request off the CPU limit

/* ---- helpers ---- */

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const fail = (status, code, error) => json({ error, code }, status);

const publicUser = (row) => ({
  id: row.id,
  username: row.username,
  color: row.color,
  coins: row.coins,
  isAdmin: !!row.is_admin,
});

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

async function getSecret(db) {
  const row = await db.prepare('SELECT value FROM meta WHERE key = ?').bind('secret').first();
  if (row) return row.value;

  // First ever call — mint the draw secret. INSERT OR IGNORE means a race
  // between two cold requests still ends with exactly one secret.
  const secret = randomSecret();
  await db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)')
    .bind('secret', secret).run();
  const stored = await db.prepare('SELECT value FROM meta WHERE key = ?').bind('secret').first();
  return stored.value;
}

async function userForToken(db, request) {
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  if (!token) return null;
  return db.prepare(
    'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?'
  ).bind(token).first();
}

async function startSession(db, userId) {
  const token = randomToken();
  await db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)')
    .bind(token, userId, Date.now()).run();
  return token;
}

/* ---- Settlement ----
   Idempotent by construction: the record id is "<round>-<user>", and the
   payout only applies while that record's `paid` flag is still 0. Two
   players triggering the same round concurrently cannot double-pay.        */

async function settleDueRounds(db, secret, currentRound) {
  const pending = await db.prepare(
    `SELECT round_id, user_id, animal_id, stake FROM bets
      WHERE round_id < ? ORDER BY round_id LIMIT 500`
  ).bind(currentRound).all();

  if (!pending.results?.length) return;

  const byRound = new Map();
  for (const bet of pending.results) {
    const round = byRound.get(bet.round_id) ?? new Map();
    const slip = round.get(bet.user_id) ?? [];
    slip.push(bet);
    round.set(bet.user_id, slip);
    byRound.set(bet.round_id, round);
  }

  const at = Date.now();
  let processed = 0;

  for (const [roundId, slips] of byRound) {
    if (processed++ >= MAX_ROUNDS_PER_REQUEST) break;

    const spot = await drawFor(roundId, secret);
    const winnerIds = new Set(resolveWinners(spot).map((a) => a.id));
    const plate = isPlate(spot) ? 1 : 0;

    for (const [userId, bets] of slips) {
      const rows = bets.map((bet) => {
        const hit = winnerIds.has(bet.animal_id);
        return {
          animalId: bet.animal_id,
          stake: bet.stake,
          hit,
          win: hit ? bet.stake * animalById.get(bet.animal_id).payout : 0,
        };
      });

      const staked = rows.reduce((sum, r) => sum + r.stake, 0);
      const won = rows.reduce((sum, r) => sum + r.win, 0);
      const id = `${roundId}-${userId}`;

      // One transaction. Statement 2 sees statement 1's insert, so a fresh
      // record pays out once; an existing paid one fails the guard.
      await db.batch([
        db.prepare(
          `INSERT OR IGNORE INTO records
             (id, round_id, user_id, at, landed_id, landed_name, is_plate,
              rows_json, staked, won, net, paid)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
        ).bind(id, roundId, userId, at, spot.id, spot.name, plate,
               JSON.stringify(rows), staked, won, won - staked),

        db.prepare(
          `UPDATE users SET coins = coins + ?
            WHERE id = ? AND (SELECT paid FROM records WHERE id = ?) = 0`
        ).bind(won, userId, id),

        db.prepare('UPDATE records SET paid = 1 WHERE id = ?').bind(id),
      ]);
    }

    await db.prepare('DELETE FROM bets WHERE round_id = ?').bind(roundId).run();
  }
}

/* ---- Leaderboard window ----
   Cloudflare runs in UTC; players don't. TZ_OFFSET_MINUTES shifts the
   day/week/month boundaries to local time (default UTC+8).                 */

function windowStart(range, offsetMinutes) {
  const offsetMs = offsetMinutes * 60_000;
  const local = new Date(Date.now() + offsetMs);

  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const shifted = new Date(start);

  if (range === 'week') {
    shifted.setUTCDate(shifted.getUTCDate() - ((shifted.getUTCDay() + 6) % 7)); // Monday
  } else if (range === 'month') {
    shifted.setUTCDate(1);
  }
  return shifted.getTime() - offsetMs;
}

/* ---- Routes ---- */

async function handle(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;
  const db = env.DB;

  if (!pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });

  const method = request.method;
  const me = await userForToken(db, request);

  if (pathname === '/api/config' && method === 'GET') return json(publicConfig);

  /* -- auth -- */

  if (pathname === '/api/register' && method === 'POST') {
    const { username = '', password = '', color = '#7aa84e' } = await readJson(request);
    const name = String(username).trim();
    const lower = name.toLowerCase();

    if (!/^[\w一-龥]{2,16}$/.test(name)) {
      return fail(400, 'bad_username', '用户名需 2–16 位字母、数字或中文');
    }
    if (String(password).length < 4) return fail(400, 'short_password', '密码至少 4 位');
    if (!/^#[0-9a-f]{6}$/i.test(color)) return fail(400, 'bad_color', '颜色格式无效');

    const taken = await db.prepare('SELECT id FROM users WHERE username_lower = ?')
      .bind(lower).first();
    if (taken) return fail(409, 'name_taken', '该用户名已被使用');

    // The reserved name becomes superadmin — but only while no admin exists,
    // so it can't be claimed a second time.
    let isAdmin = 0;
    if (lower === String(env.ADMIN_USER ?? '').toLowerCase()) {
      const existing = await db.prepare('SELECT id FROM users WHERE is_admin = 1').first();
      if (!existing) isAdmin = 1;
    }

    const { salt, hash } = await hashPassword(String(password));

    // 90k possible ids, so a clash is rare but not impossible — check before
    // using one rather than letting a duplicate primary key surface as a 500.
    let id = null;
    for (let attempt = 0; attempt < 25 && !id; attempt++) {
      const candidate = newUserId();
      const clash = await db.prepare('SELECT id FROM users WHERE id = ?')
        .bind(candidate).first();
      if (!clash) id = candidate;
    }
    if (!id) return fail(503, 'id_exhausted', '无法分配用户 ID，请重试');

    await db.prepare(
      `INSERT INTO users
         (id, username, username_lower, salt, hash, color, coins, is_admin, must_reset, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    ).bind(id, name, lower, salt, hash, color, STARTING_COINS, isAdmin, Date.now()).run();

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
    return json({ token: await startSession(db, id), user: publicUser(user) });
  }

  if (pathname === '/api/login' && method === 'POST') {
    const { username = '', password = '' } = await readJson(request);
    const user = await db.prepare('SELECT * FROM users WHERE username_lower = ?')
      .bind(String(username).trim().toLowerCase()).first();

    if (user?.must_reset) {
      return fail(409, 'needs_reset', '密码已被管理员清除，请设置新密码');
    }
    // Same message either way — don't reveal which usernames exist.
    if (!user || !(await verifyPassword(String(password), user.salt, user.hash))) {
      return fail(401, 'bad_credentials', '用户名或密码错误');
    }
    return json({ token: await startSession(db, user.id), user: publicUser(user) });
  }

  if (pathname === '/api/reset-password' && method === 'POST') {
    const { username = '', password = '' } = await readJson(request);
    const user = await db.prepare('SELECT * FROM users WHERE username_lower = ?')
      .bind(String(username).trim().toLowerCase()).first();

    // Only reachable while an admin has flagged the account.
    if (!user?.must_reset) return fail(403, 'reset_not_allowed', '该账号未开放重设密码');
    if (String(password).length < 4) return fail(400, 'short_password', '密码至少 4 位');

    const { salt, hash } = await hashPassword(String(password));
    await db.prepare('UPDATE users SET salt = ?, hash = ?, must_reset = 0 WHERE id = ?')
      .bind(salt, hash, user.id).run();

    const updated = await db.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
    return json({ token: await startSession(db, user.id), user: publicUser(updated) });
  }

  if (pathname === '/api/logout' && method === 'POST') {
    const token = (request.headers.get('authorization') ?? '').replace(/^Bearer /, '');
    await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return json({ ok: true });
  }

  /* -- game -- */

  if (pathname === '/api/state' && method === 'GET') {
    const now = Date.now();
    const { roundId, phase, msLeft } = phaseAt(now);
    const secret = await getSecret(db);

    await settleDueRounds(db, secret, roundId);

    // The previous round's outcome is derivable, so nothing needs storing.
    const previous = await drawFor(roundId - 1, secret);
    const winners = resolveWinners(previous);

    let fresh = me;
    let myBets = {};
    if (me) {
      fresh = await db.prepare('SELECT * FROM users WHERE id = ?').bind(me.id).first();
      const bets = await db.prepare(
        'SELECT animal_id, stake FROM bets WHERE round_id = ? AND user_id = ?'
      ).bind(roundId, me.id).all();
      for (const bet of bets.results ?? []) myBets[bet.animal_id] = bet.stake;
    }

    return json({
      now, roundId, phase, msLeft,
      lastResult: {
        roundId: roundId - 1,
        landedId: previous.id,
        landedName: previous.name,
        landedArt: previous.art,
        isPlate: isPlate(previous),
        winnerIds: winners.map((a) => a.id),
      },
      me: fresh ? publicUser(fresh) : null,
      myBets,
    });
  }

  if (pathname === '/api/bet' && method === 'POST') {
    if (!me) return fail(401, 'auth_required', '请先登录');
    const { animalId, amount } = await readJson(request);
    const { roundId, phase } = phaseAt(Date.now());

    if (phase !== 'betting') return fail(409, 'closed', '本轮已封盘');
    if (!animalById.has(animalId)) return fail(400, 'bad_target', '无效的下注目标');

    const stake = Number(amount);
    if (!Number.isInteger(stake) || stake <= 0) return fail(400, 'bad_amount', '金额无效');

    // Deduct conditionally: the WHERE clause is the balance check, so two
    // simultaneous bets can never overdraw the account.
    const deducted = await db.prepare(
      'UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?'
    ).bind(stake, me.id, stake).run();

    if (deducted.meta.changes !== 1) {
      return fail(400, 'insufficient', '余额不足，请联系管理员充值');
    }

    await db.prepare(
      `INSERT INTO bets (round_id, user_id, animal_id, stake) VALUES (?, ?, ?, ?)
       ON CONFLICT (round_id, user_id, animal_id) DO UPDATE SET stake = stake + excluded.stake`
    ).bind(roundId, me.id, animalId, stake).run();

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(me.id).first();
    const bets = await db.prepare(
      'SELECT animal_id, stake FROM bets WHERE round_id = ? AND user_id = ?'
    ).bind(roundId, me.id).all();

    const myBets = {};
    for (const bet of bets.results ?? []) myBets[bet.animal_id] = bet.stake;
    return json({ user: publicUser(user), myBets });
  }

  if (pathname === '/api/records' && method === 'GET') {
    // Every player can see every player's records, by design.
    const userId = url.searchParams.get('userId');
    const query = userId
      ? db.prepare(
          `SELECT r.*, u.username, u.color FROM records r JOIN users u ON u.id = r.user_id
            WHERE r.user_id = ? ORDER BY r.at DESC LIMIT ?`
        ).bind(userId, MAX_RECORDS)
      : db.prepare(
          `SELECT r.*, u.username, u.color FROM records r JOIN users u ON u.id = r.user_id
            ORDER BY r.at DESC LIMIT ?`
        ).bind(MAX_RECORDS);

    const { results = [] } = await query.all();
    return json({
      records: results.map((row) => ({
        id: row.id,
        roundId: row.round_id,
        userId: row.user_id,
        username: row.username,
        color: row.color,
        at: row.at,
        landedId: row.landed_id,
        landedName: row.landed_name,
        isPlate: !!row.is_plate,
        rows: JSON.parse(row.rows_json),
        staked: row.staked,
        won: row.won,
        net: row.net,
      })),
    });
  }

  if (pathname === '/api/leaderboard' && method === 'GET') {
    const range = url.searchParams.get('range') ?? 'day';
    if (!['day', 'week', 'month'].includes(range)) {
      return fail(400, 'bad_range', '无效的时间范围');
    }
    const offset = Number(env.TZ_OFFSET_MINUTES ?? 480);
    const { results = [] } = await db.prepare(
      `SELECT r.user_id, u.username, u.color,
              SUM(r.net) AS net, COUNT(*) AS rounds
         FROM records r JOIN users u ON u.id = r.user_id
        WHERE r.at >= ?
        GROUP BY r.user_id
        ORDER BY net DESC
        LIMIT 20`
    ).bind(windowStart(range, offset)).all();

    return json({
      range,
      entries: results.map((row) => ({
        userId: row.user_id,
        username: row.username,
        color: row.color,
        net: row.net,
        rounds: row.rounds,
      })),
    });
  }

  /* -- admin -- */

  if (pathname.startsWith('/api/admin/')) {
    if (!me) return fail(401, 'auth_required', '请先登录');
    if (!me.is_admin) return fail(403, 'admin_required', '需要管理员权限');

    if (pathname === '/api/admin/users' && method === 'GET') {
      const { results = [] } = await db.prepare(
        'SELECT * FROM users ORDER BY username COLLATE NOCASE'
      ).all();
      return json({
        users: results.map((row) => ({ ...publicUser(row), mustReset: !!row.must_reset })),
      });
    }

    // Step 1 of the top-up flow: the admin keys in an ID and gets the name
    // back, so they can confirm they're crediting the right person before
    // any money moves.
    if (pathname === '/api/admin/lookup' && method === 'GET') {
      const target = await db.prepare('SELECT * FROM users WHERE id = ?')
        .bind(String(url.searchParams.get('userId') ?? '').trim()).first();
      if (!target) return fail(404, 'user_not_found', '找不到该用户 ID');
      return json({ user: { ...publicUser(target), mustReset: !!target.must_reset } });
    }

    // Search by ID or username — the password-reset page needs to find people
    // who, by definition, can't tell you their ID because they're locked out.
    if (pathname === '/api/admin/search' && method === 'GET') {
      const q = String(url.searchParams.get('q') ?? '').trim();
      if (!q) return json({ users: [] });

      const { results = [] } = await db.prepare(
        `SELECT * FROM users
          WHERE id = ? OR username_lower LIKE ?
          ORDER BY username COLLATE NOCASE LIMIT 10`
      ).bind(q, `%${q.toLowerCase()}%`).all();

      return json({
        users: results.map((row) => ({ ...publicUser(row), mustReset: !!row.must_reset })),
      });
    }

    if (pathname === '/api/admin/reload' && method === 'POST') {
      const { userId, amount } = await readJson(request);
      const target = await db.prepare('SELECT * FROM users WHERE id = ?')
        .bind(String(userId ?? '').trim()).first();
      if (!target) return fail(404, 'user_not_found', '找不到该用户 ID');

      const delta = Number(amount);
      if (!Number.isInteger(delta) || delta === 0) return fail(400, 'bad_amount', '充值金额无效');
      if (target.coins + delta < 0) {
        return fail(400, 'negative_balance', '扣款后余额会为负');
      }

      await db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?')
        .bind(delta, target.id).run();
      const updated = await db.prepare('SELECT * FROM users WHERE id = ?').bind(target.id).first();
      return json({ user: publicUser(updated) });
    }

    // Forgot-password: the admin clears it, the user sets the new one.
    // The admin never sees or chooses it.
    if (pathname === '/api/admin/clear-password' && method === 'POST') {
      const { userId } = await readJson(request);
      const target = await db.prepare('SELECT * FROM users WHERE id = ?')
        .bind(String(userId ?? '').trim()).first();
      if (!target) return fail(404, 'user_not_found', '找不到该用户 ID');
      if (target.is_admin && target.id !== me.id) {
        return fail(403, 'admin_protected', '不能清除其他管理员的密码');
      }

      await db.batch([
        db.prepare(
          'UPDATE users SET salt = NULL, hash = NULL, must_reset = 1 WHERE id = ?'
        ).bind(target.id),
        // Sign them out everywhere.
        db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id),
      ]);

      return json({ user: { ...publicUser(target), mustReset: true } });
    }
  }

  return fail(404, 'not_found', 'Not found');
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (error) {
      console.error(error);
      return fail(500, 'server_error', '服务器错误');
    }
  },
};
