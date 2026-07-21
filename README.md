# 大胃王 (replica) — Animal Wheel

Multiplayer betting wheel on Vercel + Supabase Postgres. Every player shares
one synchronized round clock, so everyone sees the same countdown and the same
winner regardless of when they opened the page.

Game logic is ported from [`animal_wheel.ps1`](animal_wheel.ps1); the UI follows
[`example layout.png`](example%20layout.png).

## Pages

| | |
|---|---|
| `/` | the game — superadmins get an **⚙ 管理后台** button, top-left |
| `/admin.html` | hub: approval queue, top-up ranking, audit trail, players |
| `/topup.html` | manual top-up — ID → check the name → amount → confirm |
| `/reset.html` | clear a forgotten password — search by username or ID |

Players who run dry press **申请充值 / Request top-up** in the game; the request
lands in the admin queue for approval or rejection. One open request per
player at a time.

## Deploy (Vercel + Supabase)

Static `public/` is served by Vercel's CDN; `/api/*` is one serverless
function (`api/[...path].mjs`) that wraps [`src/index.js`](src/index.js). The
database is Supabase Postgres, reached through the D1-compatible shim in
[`db/d1-on-postgres.mjs`](db/d1-on-postgres.mjs).

**One-time setup**

1. Create a Supabase project. In its SQL Editor, run
   [`schema.postgres.sql`](schema.postgres.sql) to create the tables.
2. Grab the **Transaction pooler** connection string (Project Settings →
   Database → Connection string → Transaction, port `6543`).

**Ship**

```sh
npm i -g vercel        # once
vercel login           # once
vercel                 # deploy a preview
vercel --prod          # deploy to production
```

Set these environment variables in the Vercel project (Settings → Environment
Variables), or with `vercel env add <NAME> production`:

| Var | Example | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres` | Supabase transaction pooler string |
| `ADMIN_USER` | `yue` | the first account registered under this name becomes superadmin |
| `TZ_OFFSET_MINUTES` | `480` | leaderboard day/week boundaries in local time (UTC+8) |

Run `vercel dev` for a local server (reads `.env`). Live logs: `vercel logs`.

> **Claim the admin account immediately after deploying**, before sharing the
> URL. Register `yue` on the game page with a password of your choosing —
> it is granted admin only while no admin exists, so it cannot be taken twice.
> No password is ever stored in the code or in this repo.

## Rules

Ten landing spots: the 8 animals plus 菜盘 and 肉盘. Weights total 102.2 and are
normalized to 100.

| | 乌龟 | 刺猬 | 浣熊 | 小象 | 猫咪 | 狐狸 | 猪猪 | 狮子 | 菜盘 | 肉盘 |
|---|---|---|---|---|---|---|---|---|---|---|
| weight | 19.4 | 19.4 | 19.4 | 19.4 | 9.7 | 6.5 | 3.9 | 2.2 | 1.5 | 0.8 |
| payout | 5× | 5× | 5× | 5× | 10× | 15× | 25× | 45× | — | — |

The plates are **not shown on the board**. When one lands, every animal on that
plate pays out — but only the ones the player actually bet on.

Rounds: **60s betting → 5s draw**, forever.
`roundId = floor(epochMs / 65000)`, so the schedule is identical everywhere and
**no process needs to be running** for a round to happen. The draw is
`HMAC-SHA256(secret, roundId)`: same for every player, reproducible for
auditing, unpredictable to clients. Settlement happens lazily on the next
request, and is idempotent — the record id is `<round>-<user>`, so concurrent
requests cannot double-pay.

### Weights are derived, not hand-written

Hand-picked weights are how the original ended up paying out 132% on 狮子. So
`deriveWeights()` in [`src/wheel.js`](src/wheel.js) solves for them instead.

An animal wins when its own spot lands **or** its plate lands:

```
RTP_i = (w_i + P) / 100 × payout_i
```

Set that to the target R and rearrange, then require the wheel to sum to 100:

```
w_i      = 100R / payout_i − P
Pv + Pm  = (Σ 100R/payout_i − 100) / (k − 1)      k = animals per plate
```

At `TARGET_RTP = 1.00` that gives **exactly 100% on every single bet** —
verified algebraically and over 300,000 simulated draws:

| | 乌龟 | 刺猬 | 浣熊 | 小象 | 猫咪 | 狐狸 | 猪猪 | 狮子 | 菜盘 | 肉盘 |
|---|---|---|---|---|---|---|---|---|---|---|
| weight | 19.3720 | 19.3720 | 19.3720 | 19.3720 | 9.6651 | 6.3317 | 3.6651 | 1.8873 | 0.6280 | 0.3349 |
| payout | 5× | 5× | 5× | 5× | 10× | 15× | 25× | 45× | — | — |
| win % | 20.00 | 20.00 | 20.00 | 20.00 | 10.00 | 6.667 | 4.00 | 2.222 | — | — |
| RTP | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | — | — |

**Want a house edge?** Lower `TARGET_RTP`. But there's a floor: the plates hand
out extra wins, so with these payouts the lowest reachable RTP is **97.19%**
(the no-plate case). Below that the payouts themselves have to come down, and
`deriveWeights()` throws rather than shipping a broken wheel.

## Accounts

- Username + password, plus a favourite colour used for your leaderboard dot
  and bet chips.
- Each player gets a **5-digit numeric ID** — short enough to read aloud, which
  is what the superadmin keys in to top someone up.
- Everyone starts on **10,000 coins**. No self-serve top-up: when a player runs
  dry, the superadmin credits them. Top-ups **add** to the existing balance.
- **Forgot password:** admin clears it on `/reset.html`, which signs that user
  out everywhere. The user then sets a new one on the *重设密码 / Reset
  password* tab. The admin never sees or chooses it. Coins and records survive.

Passwords are PBKDF2-SHA256 (50k iterations, per-user salt). Workers has no
scrypt, which is what the Node version on the `main` branch used.

## Layout

```
src/
  index.js   Worker fetch handler + routes + settlement
  wheel.js   odds, payouts, round schedule, draw
  auth.js    PBKDF2 hashing, token + id generation
public/
  index.html app.js i18n.js styles.css   game (中文 / English)
  admin.html admin.js                    hub
  topup.html topup.js                    add coins
  reset.html reset.js                    clear passwords
schema.postgres.sql   Supabase Postgres tables
```

## API

| | |
|---|---|
| `GET /api/config` | board data (no odds — weights stay server-side) |
| `POST /api/register` `/api/login` `/api/logout` | auth |
| `POST /api/reset-password` | only after an admin clears the password |
| `GET /api/state` | clock, phase, your bets, last result; settles due rounds |
| `POST /api/bet` | `{ animalId, amount }` |
| `GET /api/records` | every player's slips |
| `GET /api/leaderboard?range=day\|week\|month` | total staked per player, highest first |
| `GET` `POST /api/topup-request` | player asks for coins |
| `GET /api/admin/lookup?userId=` | name for an ID, before topping up |
| `GET /api/admin/search?q=` | find by username **or** ID |
| `GET /api/admin/topups?status=` | the approval queue |
| `POST /api/admin/topup-decide` | `{ id, action: approve\|reject }` |
| `GET /api/admin/audit?action=` | every action, newest first |
| `GET /api/admin/topup-stats` | who received the most — today and all time |
| `POST /api/admin/reload` | `{ userId, amount }` — additive |
| `POST /api/admin/clear-password` | `{ userId }` |

## Audit trail

`audit_log` is append-only and never updated or deleted. Every money movement
and access change writes a row: **who did it, to whom, how much, when**.

| action | logged when |
|---|---|
| `register` | an account is created |
| `topup_request` | a player asks for coins |
| `topup_approve` / `topup_reject` | the admin decides |
| `topup_manual` | the admin credits directly |
| `clear_password` | the admin clears a password |

The ranking on `/admin.html` is derived from it — `SUM(amount)` over
`topup_manual` + `topup_approve`, for today and all time.

Paying out twice is prevented structurally rather than by checking first:
approval flips `pending → approved` and credits **only while `credited = 0`**,
all inside one D1 transaction. A double click, or two admins acting at once,
credits exactly once.

## Portable by design

The API in `src/` is written to the Web `Request`/`Response` contract, so it
runs unchanged on Vercel's serverless runtime — `api/[...path].mjs` just builds
the `env` object (DB binding + vars) and calls `worker.fetch(request, env)`.
The `db/d1-on-postgres.mjs` shim reproduces Cloudflare D1's exact API
(`prepare().bind().first()/.all()/.run()` and `batch()`) on top of Supabase
Postgres, so the ~123 queries in `src/index.js` did not have to be rewritten.
