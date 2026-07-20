# 大胃王 (replica) — Animal Wheel

Multiplayer betting wheel on Cloudflare Workers + D1. Every player shares one
synchronized round clock, so everyone sees the same countdown and the same
winner regardless of when they opened the page.

**Live:** https://dww.koryiling511.workers.dev

Game logic is ported from [`animal_wheel.ps1`](animal_wheel.ps1); the UI follows
[`example layout.png`](example%20layout.png).

## Pages

| | |
|---|---|
| `/` | the game |
| `/admin.html` | superadmin hub |
| `/topup.html` | add coins — ID → check the name → amount → confirm |
| `/reset.html` | clear a forgotten password — search by username or ID |

## Deploy

```sh
wrangler deploy                                   # ship
wrangler d1 execute dww --remote --file=schema.sql # first time only
wrangler tail                                      # live logs
```

Config lives in [`wrangler.jsonc`](wrangler.jsonc):

| Var | Default | Purpose |
|---|---|---|
| `ADMIN_USER` | `yueyue` | the first account registered under this name becomes superadmin |
| `TZ_OFFSET_MINUTES` | `480` | leaderboard day/week boundaries in local time (UTC+8) |

> **Claim the admin account immediately after deploying**, before sharing the
> URL. Register `yueyue` on the game page with a password of your choosing —
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

### ⚠️ The paytable loses money

Exact RTP with the weights above — every bet returns **over 100%**:

| bet | RTP |
|---|---|
| 乌龟 / 刺猬 / 浣熊 / 小象 | 102.25% |
| 猫咪 | 102.74% |
| 狐狸 | 107.14% |
| 猪猪 | 114.97% |
| 狮子 | **132.09%** |
| all 8 | 108.24% |

Cause: the plates add win chance without reducing payouts. 狮子 wins on
`3.00/102.2` but pays as if it won on `2.20/102.2`. Adjust the weights in
[`src/wheel.js`](src/wheel.js) to fix.

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
schema.sql   D1 tables
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
| `GET /api/leaderboard?range=day\|week\|month` | net totals |
| `GET /api/admin/lookup?userId=` | name for an ID, before topping up |
| `GET /api/admin/search?q=` | find by username **or** ID |
| `POST /api/admin/reload` | `{ userId, amount }` — additive |
| `POST /api/admin/clear-password` | `{ userId }` |

## Two implementations

Both live in this repo and share `public/` verbatim — the client never knew
which backend it was talking to, because the API is identical.

| | `src/` | `server/` |
|---|---|---|
| runs on | Cloudflare Workers | any Node host |
| storage | D1 (SQL) | `data/db.json` |
| hashing | PBKDF2 | scrypt |
| start | `wrangler deploy` | `node server/index.js` |

`src/` is what's deployed. `server/` is kept as a local dev option that needs
no Cloudflare account — handy for offline work.
