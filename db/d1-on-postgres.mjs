// A thin shim that exposes Cloudflare D1's API on top of a Supabase Postgres
// connection (via the `postgres` / postgres.js driver).
//
// Why this exists: src/index.js makes ~123 database calls in the shape
//
//     await db.prepare(sql).bind(...args).first()   // one row or null
//     await db.prepare(sql).bind(...args).all()      // { results: [...] }
//     await db.prepare(sql).bind(...args).run()      // { meta: { changes } }
//     await db.batch([stmt, stmt, ...])              // atomic, array of results
//
// Rewriting every one of those to a Postgres client would be a huge, risky
// diff. Instead we reproduce that exact surface here, so the application code
// barely changes. The only SQL-dialect fixes needed were two `INSERT OR
// IGNORE` statements (now `ON CONFLICT DO NOTHING`); everything else the app
// already writes in portable SQL.

// D1/SQLite use `?` placeholders; Postgres uses `$1, $2, ...`. Rewrite them in
// order, skipping any `?` that sits inside a single-quoted SQL string literal.
function toPg(sql) {
  let out = '';
  let n = 0;
  let inStr = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'") {
      inStr = !inStr;
      out += c;
    } else if (c === '?' && !inStr) {
      out += '$' + ++n;
    } else {
      out += c;
    }
  }
  return out;
}

// Run one statement against a connection (`runner` is either the pool `sql`
// or a transaction-scoped `tx` inside batch()). postgres.js returns a
// result that is array-like over the rows and carries a `.count` property —
// rows returned for SELECT, rows affected for INSERT/UPDATE/DELETE. That maps
// straight onto D1's `.results` and `.meta.changes`.
async function exec(runner, text, params) {
  return runner.unsafe(toPg(text), params ?? []);
}

// Serverless functions open many short-lived connections to Supabase's pooler,
// which occasionally rejects or drops a fresh one on a cold start (a transient
// `28P01` auth race or an `08xxx` connection failure). These fail *before* the
// query executes, so retrying is safe and idempotent — it just turns a random
// 500 into a slightly slower success. We do NOT retry real query errors
// (constraint violations, etc.), only connection-level ones.
const TRANSIENT = new Set(['28P01', '08006', '08003', '08000', '08001', '57P01']);

function isTransient(err) {
  if (!err) return false;
  if (err.code && TRANSIENT.has(err.code)) return true;
  const m = String(err.message ?? '').toLowerCase();
  return m.includes('econnreset')
    || m.includes('connection terminated')
    || m.includes('connection closed')
    || m.includes('write conn')
    || m.includes('timeout');
}

async function withRetry(fn, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || i === attempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, 120 + i * 180));
    }
  }
  throw lastErr;
}

export function makeD1(sql) {
  function statement(text, params) {
    return {
      // .bind() returns a new statement carrying the arguments, matching D1.
      bind: (...args) => statement(text, args),

      async first() {
        const rows = await withRetry(() => exec(sql, text, params));
        return rows[0] ?? null;
      },

      async all() {
        const rows = await withRetry(() => exec(sql, text, params));
        return { results: rows, meta: { changes: rows.count } };
      },

      async run() {
        const rows = await withRetry(() => exec(sql, text, params));
        return { meta: { changes: rows.count } };
      },

      // Internal handles used by batch().
      _text: text,
      _params: params,
    };
  }

  return {
    prepare: (text) => statement(text, undefined),

    // D1's batch runs every statement in a single transaction and returns an
    // array of results. sql.begin() gives us the same atomicity: if any
    // statement throws, the whole transaction rolls back.
    async batch(stmts) {
      // Retry the whole transaction — a transient failure rolls it back fully,
      // so re-running it is safe.
      return withRetry(() => sql.begin(async (tx) => {
        const out = [];
        for (const s of stmts) {
          const rows = await exec(tx, s._text, s._params);
          out.push({ results: rows, meta: { changes: rows.count } });
        }
        return out;
      }));
    },
  };
}
