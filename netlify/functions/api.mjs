// Netlify Function that replaces the Cloudflare Worker.
//
// On Cloudflare, public/ was served by the edge and anything unmatched fell
// through to the Worker's fetch(). On Netlify the static site (public/) is
// served directly, and this function is registered — via `config.path` below —
// to handle exactly the /api/* routes the Worker used to.
//
// Netlify Functions (v2) hand us a standard Web `Request` and expect a Web
// `Response` back, which is the same contract the Worker's fetch() already
// speaks. So we can reuse src/index.js untouched: build the `env` object it
// expects (DB binding + vars) and hand the request straight to it.

import postgres from 'postgres';
import worker from '../../src/index.js';
import { makeD1 } from '../../db/d1-on-postgres.mjs';

// One connection pool, reused across warm invocations of this function.
let sql;

function getSql() {
  if (sql) return sql;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  sql = postgres(url, {
    // Supabase's transaction pooler (port 6543) does not support prepared
    // statements — this must be false or queries fail intermittently.
    prepare: false,
    ssl: 'require',
    // Serverless: keep the footprint tiny and let idle connections drop.
    max: 1,
    idle_timeout: 20,
    // The app stores timestamps as Date.now() (epoch ms), which overflow
    // INT4, so those columns are BIGINT. By default postgres.js returns
    // BIGINT as a string; parse it back to a JS number (all values here are
    // well under 2^53, so this is lossless) to match D1's behaviour.
    types: {
      int8: {
        to: 20,
        from: [20],
        serialize: (x) => String(x),
        parse: (x) => Number(x),
      },
    },
  });

  return sql;
}

export default async (request) => {
  const env = {
    DB: makeD1(getSql()),
    ADMIN_USER: process.env.ADMIN_USER,
    TZ_OFFSET_MINUTES: process.env.TZ_OFFSET_MINUTES,
  };

  // worker.fetch already wraps everything in try/catch and returns a 500 on
  // error, so we don't need our own here.
  return worker.fetch(request, env);
};

// Register this function for every /api/* path, preserving the original URL
// (so the Worker's `pathname === '/api/...'` routing keeps working).
export const config = { path: '/api/*' };
