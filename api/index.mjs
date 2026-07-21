// Vercel Serverless Function that replaces the Cloudflare Worker / Netlify
// Function. A rewrite in vercel.json sends every /api/* path (any depth) here,
// and it hands the request straight to the existing Worker in src/index.js —
// the Worker speaks the Web `Request`/`Response` contract, so no route code
// changes. (A `[...path]` catch-all filename was tried first but Vercel's
// zero-config routing only matched a single segment, 404-ing nested routes
// like /api/me/update; the explicit rewrite handles every depth.)
//
// This file works with BOTH function signatures Vercel might use:
//   - Web:   handler(request: Request) -> Response
//   - Node:  handler(req, res)          (adapted to Web below)
// so it runs the same whether Vercel invokes it as a Web or Node function.

import postgres from 'postgres';
import worker from '../src/index.js';
import { makeD1 } from '../db/d1-on-postgres.mjs';

// One connection pool, reused across warm invocations.
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
    // The app stores timestamps as Date.now() (epoch ms), which overflow INT4,
    // so those columns are BIGINT. postgres.js returns BIGINT as a string by
    // default; parse it back to a JS number (all values < 2^53, so lossless)
    // to match D1's behaviour.
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

function buildEnv() {
  return {
    DB: makeD1(getSql()),
    ADMIN_USER: process.env.ADMIN_USER,
    TZ_OFFSET_MINUTES: process.env.TZ_OFFSET_MINUTES,
  };
}

// Node IncomingMessage -> Web Request
async function toWebRequest(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const url = `${proto}://${host}${req.url}`;

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    // Let the Request rebuild these; a stale value breaks the body.
    if (k === 'content-length' || k === 'transfer-encoding' || k === 'connection') continue;
    if (Array.isArray(v)) v.forEach((val) => headers.append(k, val));
    else if (v != null) headers.set(k, v);
  }

  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.body !== undefined && req.body !== null) {
      // Vercel may have already parsed the body.
      body = typeof req.body === 'string' || Buffer.isBuffer(req.body)
        ? req.body
        : JSON.stringify(req.body);
    } else {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      body = chunks.length ? Buffer.concat(chunks) : undefined;
    }
  }

  return new Request(url, { method: req.method, headers, body });
}

// Web Response -> Node ServerResponse
async function sendWebResponse(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  const buf = Buffer.from(await response.arrayBuffer());
  res.end(buf);
}

export default async function handler(a, b) {
  const env = buildEnv();

  // Node signature: (req, res) — res has .end().
  if (b && typeof b.end === 'function') {
    const request = await toWebRequest(a);
    const response = await worker.fetch(request, env);
    return sendWebResponse(b, response);
  }

  // Web signature: (request) -> Response.
  return worker.fetch(a, env);
}
