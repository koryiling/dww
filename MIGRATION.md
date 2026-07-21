# Migrating dww: Cloudflare → Netlify + Supabase

This guide moves the app off Cloudflare (Workers + D1) onto **Netlify** (static
hosting + Functions) with **Supabase** (Postgres) as the database.

## What changed, and why so little

The app was already written mostly in portable code, so the migration is small:

| Concern | Cloudflare (before) | Netlify + Supabase (after) |
|---|---|---|
| Static files (`public/`) | Served by the edge | Served by Netlify (`publish = "public"`) |
| API code (`src/index.js`) | Worker `fetch()` | `netlify/functions/api.mjs` calls the same `fetch()` |
| Request/Response | Web standard | Web standard — **unchanged** |
| Password/crypto (`auth.js`, `wheel.js`) | Web Crypto globals | Same globals on Node 20 — **unchanged** |
| Database API | `env.DB` (D1) | `db/d1-on-postgres.mjs` shim over Supabase |
| Database engine | D1 / SQLite | Supabase / Postgres |
| Config vars | `wrangler.jsonc` `vars` | Netlify environment variables |

The database shim (`db/d1-on-postgres.mjs`) reproduces D1's exact API
(`prepare().bind().first()/.all()/.run()` and `batch()`) on top of Postgres, so
the ~123 queries in `src/index.js` did **not** have to be rewritten. Only two
`INSERT OR IGNORE` statements were changed to `ON CONFLICT DO NOTHING`.

### New / changed files
- `db/d1-on-postgres.mjs` — the D1-compatible Postgres shim (new)
- `netlify/functions/api.mjs` — the Netlify Function wrapping the Worker (new)
- `netlify.toml` — Netlify build config (new)
- `schema.postgres.sql` — the schema, ported to Postgres (new)
- `.env.example` — the environment variables you need (new)
- `src/index.js` — two SQL statements changed (`INSERT OR IGNORE` → `ON CONFLICT`)
- `package.json` — added `postgres` dependency, `dev` script, Node 20

---

## Step 1 — Create the Supabase project & database

1. Go to <https://supabase.com>, sign in, **New project**. Pick a name, a
   strong **database password** (save it), and a region close to your players.
2. Wait for it to provision (~2 min).
3. Open **SQL Editor → New query**. Paste the entire contents of
   `schema.postgres.sql` and click **Run**. This creates all tables/indexes.
4. Get your connection string: **Project Settings → Database → Connection
   string**, choose the **Transaction** pooler tab. It looks like:
   ```
   postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```
   Replace `[YOUR-PASSWORD]` with the password from step 1. **Use the pooler
   (port 6543), not the direct 5432 connection** — serverless functions open
   many short-lived connections and the pooler is built for that. The shim is
   already configured for it (`prepare: false`).

---

## Step 2 — Test locally (recommended before deploying)

1. Install dependencies:
   ```
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in `DATABASE_URL` (your Supabase
   pooler string), `ADMIN_USER` (e.g. `yue`), and `TZ_OFFSET_MINUTES` (e.g. `480`).
3. Install the Netlify CLI and run the dev server (serves `public/` and the
   function together):
   ```
   npm install -g netlify-cli
   netlify dev
   ```
4. Open the printed URL (usually <http://localhost:8888>). Register the
   `ADMIN_USER` account **first** — that account becomes superadmin. Place a
   bet, top up, send a gift, etc., to confirm the database works.

> `.env` is git-ignored — it holds your database password, never commit it.

---

## Step 3 — Push to GitHub

Your repo already points at `github.com/koryiling/dww`. Commit and push:
```
git add -A
git commit -m "Migrate to Netlify + Supabase"
git push
```

---

## Step 4 — Deploy on Netlify

1. Go to <https://app.netlify.com> → **Add new site → Import an existing
   project** → connect GitHub → pick the `dww` repo.
2. Netlify reads `netlify.toml`, so build settings are already correct
   (publish `public/`, functions in `netlify/functions`). Click **Deploy**.
3. Add the environment variables: **Site settings → Environment variables →
   Add** the same three keys from your `.env`:
   - `DATABASE_URL`
   - `ADMIN_USER`
   - `TZ_OFFSET_MINUTES`
4. Trigger a redeploy (**Deploys → Trigger deploy → Deploy site**) so the
   function picks up the variables.

---

## Step 5 — First-run & verify

1. Visit your `*.netlify.app` URL.
2. **Immediately register the `ADMIN_USER` account** (the username must match
   `ADMIN_USER` exactly). The first such registration is minted as superadmin —
   do it before sharing the URL, exactly as on Cloudflare.
3. Smoke-test: log in, place a bet, wait for a round to settle, open
   `/admin.html`, approve a top-up. Watch **Netlify → Functions → api** logs and
   **Supabase → Table editor** to confirm rows are being written.

---

## Migrating existing data (only if you had live data on D1)

If your Cloudflare D1 database has data you need to keep:

1. Export it:
   ```
   npx wrangler d1 export dww --output=dump.sql --remote
   ```
2. That dump is SQLite-flavoured. The **schema** part is replaced by
   `schema.postgres.sql`, so you only want the `INSERT` rows. Load just the
   data into Supabase (SQL Editor, or `psql "<direct-connection-string>" -f
   data-only.sql`). Watch for: SQLite writes booleans as `0/1` (already how this
   app stores them, so fine) and quotes strings the same way Postgres does.
   For a small dataset, hand-checking the `INSERT` statements is quickest.

If you're starting fresh, skip this section.

---

## Cleanup (optional)

These Cloudflare-only files are now unused and can be deleted once you're happy:
- `wrangler.jsonc`, `.wrangler/`
- `schema.sql` (superseded by `schema.postgres.sql`)

`src/index.js`, `src/auth.js`, `src/wheel.js`, and everything in `public/` are
still used — do not delete them.

---

## Troubleshooting

- **500s from `/api/*`, logs say `DATABASE_URL is not set`** — the env var is
  missing on Netlify, or you didn't redeploy after adding it.
- **Intermittent `prepared statement ... does not exist`** — you're on the
  direct (5432) connection instead of the transaction pooler (6543). Switch the
  connection string.
- **`password authentication failed`** — `[YOUR-PASSWORD]` wasn't substituted,
  or contains characters that need URL-encoding (e.g. `@` → `%40`).
- **Timestamps/coins look like strings** — the function parses Postgres BIGINT
  back to numbers via the `int8` type override in `netlify/functions/api.mjs`;
  don't remove it.
- **`/api/...` returns the static 404 page** — confirm `netlify/functions/api.mjs`
  deployed and that `export const config = { path: '/api/*' }` is intact.
