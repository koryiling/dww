# 大胃王 (replica) — Animal Wheel

Multiplayer betting wheel. All players share one synchronized round clock, so
everyone sees the same countdown and the same winner regardless of when they
opened the page.

Game logic is ported from [`animal_wheel.ps1`](animal_wheel.ps1); the UI follows
[`example layout.png`](example%20layout.png).

## Run

Requires Node 18+ (Node 24 LTS is installed at
`%LOCALAPPDATA%\Programs\nodejs`). **No dependencies, no install step.**

```sh
node server/index.js
```

| URL | |
|---|---|
| http://localhost:3000/ | game |
| http://localhost:3000/admin.html | superadmin console |

### Environment

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | listen port |
| `DWW_ADMIN_USER` | `koryiling` | reserved superadmin username |
| `DWW_ADMIN_PASSWORD` | *(generated)* | set the admin password; also **recovers a lost one** — set it and restart |

On first boot the superadmin is created and its password printed to the console
once. If you lose it, restart with `DWW_ADMIN_PASSWORD` set.

## Rules

Ten landing spots: the 8 animals plus 菜盘 and 肉盘. Weights total 102.2 and are
normalized to 100.

| | 乌龟 | 刺猬 | 浣熊 | 小象 | 猫咪 | 狐狸 | 猪猪 | 狮子 | 菜盘 | 肉盘 |
|---|---|---|---|---|---|---|---|---|---|---|
| weight | 19.4 | 19.4 | 19.4 | 19.4 | 9.7 | 6.5 | 3.9 | 2.2 | 1.5 | 0.8 |
| payout | 5× | 5× | 5× | 5× | 10× | 15× | 25× | 45× | — | — |

The plates are **not shown on the board**. When one lands, every animal on that
plate pays out — but only the ones you actually bet on.

Rounds: **60s betting → 5s draw**, looping forever.
`roundId = floor(epochMs / 65000)`, so the schedule is identical everywhere.

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
[`server/wheel.js`](server/wheel.js) to fix.

## Accounts

- Register with username + password, and pick a favourite colour (used for your
  dot on the leaderboard and your bet chips).
- Everyone starts with **10,000 coins**. There is no self-serve top-up — when
  you run dry, the superadmin reloads you by **user ID**.
- **Forgot password:** the admin clears it from the console, which signs that
  user out everywhere; the user then sets a new one on the *重设密码 / Reset
  password* tab. The admin never sees or chooses the password.

Passwords are scrypt-hashed with a per-user salt. The draw is
`HMAC-SHA256(server secret, roundId)` — identical for all players, reproducible
for auditing, unpredictable to clients.

## Layout

```
server/
  index.js   HTTP API + static host (node:http only)
  wheel.js   odds, payouts, round schedule, draw
  store.js   persistence — the ONLY file that knows where data lives
  auth.js    scrypt hashing
public/
  index.html app.js i18n.js styles.css   game (中文 / English)
  admin.html admin.js                    superadmin console
data/        db.json — gitignored, holds hashes + the draw secret
```

## API

| | |
|---|---|
| `GET /api/config` | board data (no odds — weights stay server-side) |
| `POST /api/register` `/api/login` `/api/logout` | auth |
| `POST /api/reset-password` | only after an admin clears the password |
| `GET /api/state` | clock, phase, your bets, last result |
| `POST /api/bet` | `{ animalId, amount }` |
| `GET /api/records` | every player's slips |
| `GET /api/leaderboard?range=day\|week\|month` | net totals |
| `GET /api/admin/users` | admin |
| `POST /api/admin/reload` | `{ userId, amount }` |
| `POST /api/admin/clear-password` | `{ userId }` |

## Deploying

⚠️ **Cloudflare Pages cannot host this as-is.** Pages serves static files only,
and Workers has no `node:http` server or filesystem — `server/` would need a
rewrite onto Workers + D1/KV before it runs there.

Runs unmodified on any Node host: Render, Railway, Fly.io, or a VPS.
