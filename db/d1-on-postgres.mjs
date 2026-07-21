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

export function makeD1(sql) {
  function statement(text, params) {
    return {
      // .bind() returns a new statement carrying the arguments, matching D1.
      bind: (...args) => statement(text, args),

      async first() {
        const rows = await exec(sql, text, params);
        return rows[0] ?? null;
      },

      async all() {
        const rows = await exec(sql, text, params);
        return { results: rows, meta: { changes: rows.count } };
      },

      async run() {
        const rows = await exec(sql, text, params);
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
      return sql.begin(async (tx) => {
        const out = [];
        for (const s of stmts) {
          const rows = await exec(tx, s._text, s._params);
          out.push({ results: rows, meta: { changes: rows.count } });
        }
        return out;
      });
    },
  };
}
