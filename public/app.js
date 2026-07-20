// 大胃王 (replica) — client.
// The server owns the clock, the draw and every balance. This file only
// renders what it is told and forwards bets.

import { applyStatic, setLang, t, tError, toggleLang, lang } from './i18n.js';

const TOKEN_KEY = 'dww.token';
const COLORS = [
  '#7aa84e', '#e8873c', '#d9534f', '#c96bb0',
  '#7a6cd6', '#3f8fd0', '#33a89a', '#c8a415',
];
const CHIP_VALUES = [500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000];

const $ = (id) => document.getElementById(id);
const num = new Intl.NumberFormat('en-US');

const els = {
  authScreen: $('auth-screen'), gameScreen: $('game-screen'),
  tabLogin: $('tab-login'), tabRegister: $('tab-register'), tabReset: $('tab-reset'),
  authForm: $('auth-form'), username: $('username'), password: $('password'),
  labelPassword: $('label-password'), resetHelp: $('reset-help'),
  colorField: $('color-field'), swatches: $('swatches'),
  authError: $('auth-error'), authSubmit: $('auth-submit'),
  langAuth: $('lang-auth'), langGame: $('lang-game'),

  board: $('board'), chips: $('chips'), timer: $('timer'), balance: $('balance'),
  bettors: $('bettors'), phaseText: $('phase-text'), toast: $('toast'),
  adminLink: $('admin-link'), requestTopup: $('request-topup'),
  requestStatus: $('request-status'),

  sidebar: $('sidebar'), sideToggle: $('side-toggle'), refresh: $('refresh'),
  identity: $('identity'),
  playerNameTop: $('player-name-top'), playerIdTop: $('player-id-top'),
  playerDotTop: $('player-dot-top'),
  playerName: $('player-name'), playerId: $('player-id'), playerDot: $('player-dot'),
  playerBirthday: $('player-birthday'), logout: $('logout'),
  editProfile: $('edit-profile'), profileForm: $('profile-form'),
  editName: $('edit-name'), editBirthday: $('edit-birthday'),
  editSwatches: $('edit-swatches'), profileError: $('profile-error'),
  cancelEdit: $('cancel-edit'),

  stSpend: $('st-spend'), stIncome: $('st-income'), stNet: $('st-net'),
  stTopup: $('st-topup'), stRounds: $('st-rounds'),
  recordButtons: document.querySelector('.record-buttons'),

  podium: $('podium'), lbTabs: $('lb-tabs'), lbList: $('lb-list'),
  viewRecords: $('view-records'), pastResults: $('past-results'),
  panel: $('panel'), panelTitle: $('panel-title'),
  panelList: $('panel-list'), panelClose: $('panel-close'),
};

const state = {
  token: localStorage.getItem(TOKEN_KEY),
  me: null,
  config: null,
  mode: 'login',
  color: COLORS[0],
  editColor: null,
  chip: CHIP_VALUES[0],
  clockOffset: 0,
  phase: null,
  myBets: {},
  lastResultId: null,
  lbRange: 'day',
  reel: null,
  started: false,
};

const tiles = new Map();
const animalById = new Map();

/* ---- API ---- */

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(state.token ? { authorization: `Bearer ${state.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error ?? `HTTP ${res.status}`);
    error.code = data.code;
    error.status = res.status;
    throw error;
  }
  return data;
}

/* ---- Language ---- */

function refreshLanguage() {
  applyStatic();
  els.authSubmit.textContent = t(
    { login: 'submitLogin', register: 'submitRegister', reset: 'submitReset' }[state.mode]
  );
  els.labelPassword.textContent = t(state.mode === 'reset' ? 'newPassword' : 'password');
  if (state.started) {
    buildChips();
    renderBoard();
    renderPhaseText();
    renderProfile();
    loadLeaderboard();
  }
}

for (const button of [els.langAuth, els.langGame]) {
  button.addEventListener('click', () => { toggleLang(); refreshLanguage(); });
}

/* ---- Auth ---- */

function buildSwatchRow(container, onPick, selected) {
  container.replaceChildren(...COLORS.map((color) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = `swatch ${color === selected ? 'active' : ''}`;
    dot.style.background = color;
    dot.title = color;
    dot.addEventListener('click', () => {
      onPick(color);
      for (const el of container.children) el.classList.toggle('active', el === dot);
    });
    return dot;
  }));
}

function setMode(mode) {
  state.mode = mode;
  els.tabLogin.classList.toggle('active', mode === 'login');
  els.tabRegister.classList.toggle('active', mode === 'register');
  els.tabReset.classList.toggle('active', mode === 'reset');
  els.colorField.hidden = mode !== 'register';
  els.resetHelp.hidden = mode !== 'reset';
  els.authError.hidden = true;
  refreshLanguage();
}

els.tabLogin.addEventListener('click', () => setMode('login'));
els.tabRegister.addEventListener('click', () => setMode('register'));
els.tabReset.addEventListener('click', () => setMode('reset'));

els.authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  els.authError.hidden = true;
  els.authSubmit.disabled = true;

  const endpoint = { login: 'login', register: 'register', reset: 'reset-password' }[state.mode];
  try {
    const data = await api(`/api/${endpoint}`, {
      method: 'POST',
      body: {
        username: els.username.value,
        password: els.password.value,
        ...(state.mode === 'register' ? { color: state.color } : {}),
      },
    });
    state.token = data.token;
    localStorage.setItem(TOKEN_KEY, data.token);
    await enterGame(data.user);
  } catch (error) {
    if (error.code === 'needs_reset') setMode('reset');
    els.authError.textContent = tError(error);
    els.authError.hidden = false;
  } finally {
    els.authSubmit.disabled = false;
  }
});

els.logout.addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST' }); } catch { /* leaving anyway */ }
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
});

/* ---- Sidebar (collapsible on phones, always open on desktop) ---- */

function togglePanel() {
  els.sidebar.classList.toggle('open');
  if (els.sidebar.classList.contains('open')) {
    els.sidebar.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

els.sideToggle.addEventListener('click', togglePanel);
els.identity.addEventListener('click', togglePanel);

// Placeholder for the next game.
$('coming-soon').addEventListener('click', () => toast(t('comingSoonMsg')));

// Profile starts collapsed; clicking the header (but not the refresh button)
// expands it.
$('profile-head').addEventListener('click', (event) => {
  if (event.target.closest('#refresh')) return;
  $('profile').classList.toggle('collapsed');
});

els.refresh.addEventListener('click', async () => {
  els.refresh.classList.add('spinning');
  await Promise.all([poll(), loadRoundTop(), loadLeaderboard(), loadStats(), loadRequestStatus()]);
  setTimeout(() => els.refresh.classList.remove('spinning'), 400);
});

/* ---- Profile ---- */

function renderProfile() {
  if (!state.me) return;
  // Top identity bar (always visible).
  els.playerNameTop.textContent = state.me.username;
  els.playerIdTop.textContent = `#${state.me.id}`;
  els.playerDotTop.style.background = state.me.color;
  // Detailed profile card in the panel.
  els.playerName.textContent = state.me.username;
  els.playerId.textContent = state.me.id;
  els.playerDot.style.background = state.me.color;
  els.playerBirthday.textContent = state.me.birthday || t('notSet');
  els.adminLink.hidden = !state.me.isAdmin;
  document.documentElement.style.setProperty('--user-color', state.me.color);
}

els.editProfile.addEventListener('click', () => {
  els.editName.value = state.me.username;
  els.editBirthday.value = state.me.birthday ?? '';
  state.editColor = state.me.color;
  buildSwatchRow(els.editSwatches, (c) => { state.editColor = c; }, state.me.color);
  els.profileError.hidden = true;
  els.profileForm.hidden = false;
});

els.cancelEdit.addEventListener('click', () => { els.profileForm.hidden = true; });

els.profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  els.profileError.hidden = true;
  try {
    const { user } = await api('/api/me/update', {
      method: 'POST',
      body: {
        username: els.editName.value,
        birthday: els.editBirthday.value,
        color: state.editColor ?? state.me.color,
      },
    });
    state.me = user;
    renderProfile();
    renderStats();
    els.profileForm.hidden = true;
    toast(t('saved'));
    loadLeaderboard();
  } catch (error) {
    els.profileError.textContent = tError(error);
    els.profileError.hidden = false;
  }
});

/* ---- Board ---- */

function buildBoard() {
  els.board.replaceChildren();
  tiles.clear();
  for (const animal of state.config.animals) {
    animalById.set(animal.id, animal);
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'animal';
    tile.title = `${animal.name} ${animal.en} · ${animal.payout}×`;
    tile.innerHTML = `
      <span class="animal-name"></span>
      <span class="animal-art">${animal.art}</span>
      <span class="animal-stake"></span>
    `;
    tile.addEventListener('click', () => placeBet(animal));
    els.board.append(tile);
    tiles.set(animal.id, tile);
  }
  renderBoard();
}

// 1,000,000 is too wide for a chip, so the big ones read as 1M / 500K.
function chipLabel(value) {
  if (value >= 1_000_000) return `${value / 1_000_000}M`;
  if (value >= 1_000) return `${value / 1_000}K`;
  return String(value);
}

function buildChips() {
  els.chips.replaceChildren(...CHIP_VALUES.map((value) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.value = String(value);
    chip.title = `${num.format(value)} ${t('coinsUnit')}`;
    chip.innerHTML = `<span class="chip-art">🪙</span>
      <span class="chip-amount">${chipLabel(value)}</span>`;
    chip.addEventListener('click', () => { state.chip = value; renderChips(); });
    return chip;
  }));
  renderChips();
}

async function placeBet(animal) {
  if (state.phase !== 'betting') return toast(t('closed'));
  if (!state.me || state.chip > state.me.coins) return toast(t('insufficient'));
  try {
    const data = await api('/api/bet', {
      method: 'POST',
      body: { animalId: animal.id, amount: state.chip },
    });
    state.me = data.user;
    state.myBets = data.myBets;
    renderStats();
    renderBoard();
    renderChips();
  } catch (error) {
    toast(tError(error));
  }
}

/* ---- Rendering ---- */

function renderChips() {
  for (const chip of els.chips.children) {
    const value = Number(chip.dataset.value);
    chip.classList.toggle('active', value === state.chip);
    chip.disabled = state.phase !== 'betting' || !state.me || value > state.me.coins;
  }
}

function renderBoard() {
  for (const [id, tile] of tiles) {
    const stake = state.myBets[id] ?? 0;
    const animal = animalById.get(id);
    const name = tile.querySelector('.animal-name');
    if (name && animal) name.textContent = lang() === 'zh' ? animal.name : animal.en;
    tile.querySelector('.animal-stake').textContent = num.format(stake);
    tile.classList.toggle('has-bet', stake > 0);
    tile.disabled = state.phase !== 'betting';
  }
}

function renderStats() {
  if (!state.me) return;
  els.balance.textContent = num.format(state.me.coins);
}

function renderPhaseText() {
  els.phaseText.textContent =
    state.phase === 'drawing' ? t('rolling')
    : state.phase === 'betting' ? t('placeBets')
    : t('connecting');
}

let toastTimer;
function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2600);
}

/* ---- Reel ---- */

function startReel() {
  if (state.reel) return;
  const ids = [...tiles.keys()];
  let index = 0;
  const step = () => {
    for (const tile of tiles.values()) tile.classList.remove('ticking');
    tiles.get(ids[index % ids.length])?.classList.add('ticking');
    index += 1;
    state.reel = setTimeout(step, 110);
  };
  step();
}

function stopReel() {
  clearTimeout(state.reel);
  state.reel = null;
  for (const tile of tiles.values()) tile.classList.remove('ticking');
}

function revealResult(result) {
  stopReel();
  for (const tile of tiles.values()) tile.classList.remove('landed');
  for (const id of result.winnerIds) tiles.get(id)?.classList.add('landed');
  setTimeout(() => {
    for (const tile of tiles.values()) tile.classList.remove('landed');
  }, 4000);
  // Settlement has just happened, so the boards and my stats all changed.
  loadRoundTop({ pop: true });
  loadLeaderboard();
  loadStats();
}

/* ---- Clock ---- */

function tickClock() {
  if (!state.config) return;
  const { bettingMs, cycleMs } = state.config;
  const now = Date.now() + state.clockOffset;
  const elapsed = now % cycleMs;
  const betting = elapsed < bettingMs;

  els.timer.textContent = Math.ceil((betting ? bettingMs - elapsed : cycleMs - elapsed) / 1000);

  const phase = betting ? 'betting' : 'drawing';
  if (phase !== state.phase) {
    const first = state.phase === null;
    state.phase = phase;
    if (phase === 'drawing') startReel();
    else state.myBets = {};
    renderPhaseText();
    renderChips();
    renderBoard();
    if (!first) poll();
  }
}

async function poll() {
  try {
    const data = await api('/api/state');
    state.clockOffset = data.now - Date.now();
    state.myBets = data.myBets ?? {};
    els.bettors.textContent = num.format(data.bettors ?? 0);
    if (data.me) { state.me = data.me; renderStats(); renderProfile(); }

    if (data.lastResult && data.lastResult.roundId !== state.lastResultId) {
      if (state.lastResultId !== null) revealResult(data.lastResult);
      state.lastResultId = data.lastResult.roundId;
    }
    renderBoard();
    renderChips();
  } catch (error) {
    if (error.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      location.reload();
    }
  }
}

/* ---- Top-up request status ---- */

async function loadRequestStatus() {
  try {
    const { request } = await api('/api/topup-request');
    const pending = request?.status === 'pending';
    els.requestStatus.hidden = !pending;
    if (pending) {
      els.requestStatus.textContent =
        t('requestWaiting').replace('{amount}', num.format(request.amount));
    }
  } catch { /* non-critical */ }
}

/* ---- Podium + leaderboard ---- */

// Highest-paying animals stand in for the medals — 1st 🦁, 2nd 🐷, 3rd 🦊.
function podiumAvatars() {
  return [...(state.config?.animals ?? [])]
    .sort((a, b) => b.payout - a.payout)
    .slice(0, 3)
    .map((a) => a.art);
}

function renderPodium(entries, pop = false) {
  const avatars = podiumAvatars();
  // Visual order is 2nd, 1st, 3rd — the tallest step in the middle.
  const order = [1, 0, 2];

  els.podium.replaceChildren(...order.map((rank) => {
    const entry = entries[rank];
    const slot = document.createElement('div');
    slot.className = `podium-slot rank-${rank + 1}${entry ? '' : ' empty'}`;

    const avatar = document.createElement('div');
    avatar.className = 'podium-avatar';
    avatar.textContent = entry ? avatars[rank] ?? '🏆' : '❔';

    const medal = document.createElement('div');
    medal.className = 'podium-medal';
    medal.textContent = ['🥇', '🥈', '🥉'][rank];

    const name = document.createElement('div');
    name.className = 'podium-name';
    name.textContent = entry ? entry.username : t('waiting');

    const net = document.createElement('div');
    net.className = 'podium-net is-win';
    net.textContent = entry ? `+${num.format(entry.won)}` : '—';

    const step = document.createElement('div');
    step.className = 'podium-step';
    step.textContent = String(rank + 1);

    slot.append(avatar, medal, name, net, step);
    return slot;
  }));

  if (pop) {
    els.podium.classList.remove('pop');
    void els.podium.offsetWidth;   // restart the animation
    els.podium.classList.add('pop');
  }
}

// The podium is per-round: whoever won the most in the game that just
// finished. A fresh set every round, popping in as it lands.
async function loadRoundTop({ pop = false } = {}) {
  try {
    const { entries } = await api('/api/round-top');
    renderPodium(entries, pop);
  } catch { /* non-critical */ }
}

async function loadLeaderboard() {
  try {
    const { entries } = await api(`/api/leaderboard?range=${state.lbRange}`);

    if (entries.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'lb-empty';
      empty.textContent = t('lbEmpty');
      els.lbList.replaceChildren(empty);
      return;
    }

    els.lbList.replaceChildren(...entries.map((entry, index) => {
      const li = document.createElement('li');
      li.className = `lb-item ${entry.userId === state.me?.id ? 'is-me' : ''}`;
      li.innerHTML = `
        <span class="lb-rank">${['🥇', '🥈', '🥉'][index] ?? index + 1}</span>
        <span class="lb-dot" style="background:${entry.color}"></span>
        <span class="lb-name"></span>
        <span class="lb-rounds">${entry.rounds} ${t('rounds')}</span>
        <span class="lb-net is-win">🪙 ${num.format(entry.spent)}</span>
      `;
      li.querySelector('.lb-name').textContent = entry.username;
      return li;
    }));
  } catch { /* leaderboard is non-critical */ }
}

els.lbTabs.addEventListener('click', (event) => {
  const tab = event.target.closest('.lb-tab');
  if (!tab) return;
  state.lbRange = tab.dataset.range;
  for (const el of els.lbTabs.children) el.classList.toggle('active', el === tab);
  loadLeaderboard();
});

/* ---- Panels ---- */

function openPanel(title, items) {
  els.panelTitle.textContent = title;
  if (items.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'panel-empty';
    empty.textContent = t('noRecords');
    els.panelList.replaceChildren(empty);
  } else {
    els.panelList.replaceChildren(...items);
  }
  els.panel.hidden = false;
}

const closePanel = () => { els.panel.hidden = true; };

els.panelClose.addEventListener('click', closePanel);
els.panel.addEventListener('click', (event) => {
  if (event.target === els.panel) closePanel();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closePanel();
});

function faceOf(record) {
  const art = record.isPlate
    ? state.config.plates.find((p) => p.id === record.landedId)?.art ?? '🍽'
    : animalById.get(record.landedId)?.art ?? '';
  const animal = animalById.get(record.landedId);
  const name = record.isPlate || !animal || lang() === 'zh' ? record.landedName : animal.en;
  return `${art} ${name}`;
}

function recordItem(record) {
  const li = document.createElement('li');
  li.className = `panel-item ${record.net >= 0 ? 'is-win' : 'is-loss'}`;
  const picks = record.rows
    .map((r) => `${animalById.get(r.animalId)?.art ?? ''}${num.format(r.stake)}`)
    .join(' ');
  li.innerHTML = `
    <span>${faceOf(record)}</span>
    ${record.isPlate ? `<span class="panel-tag">${t('plate')}</span>` : ''}
    <span class="panel-picks">${picks}</span>
    <span class="panel-delta">${record.net >= 0 ? '+' : '−'}${num.format(Math.abs(record.net))}</span>
  `;
  return li;
}

/* ---- Personal dashboard ---- */

async function loadStats() {
  try {
    const s = await api('/api/me/stats');
    els.stSpend.textContent = num.format(s.spend);
    els.stIncome.textContent = num.format(s.income);
    els.stTopup.textContent = num.format(s.topups);
    els.stNet.textContent = `${s.net >= 0 ? '+' : '−'}${num.format(Math.abs(s.net))}`;
    els.stNet.className = s.net >= 0 ? 'is-win' : 'is-loss';
    els.stRounds.textContent = t('roundsPlayed')
      .replace('{rounds}', s.rounds).replace('{wins}', s.wins).replace('{losses}', s.losses);
  } catch { /* non-critical */ }
}

// All four views are the player's own data only.
async function openRecords(kind) {
  try {
    if (kind === 'topup') {
      const { history } = await api('/api/topup-request');
      const key = { pending: 'statusPending', approved: 'statusApproved', rejected: 'statusRejected' };
      return openPanel(t('topupRecords'), (history ?? []).map((row) => {
        const li = document.createElement('li');
        li.className = `panel-item ${row.status === 'approved' ? 'is-win' : row.status === 'rejected' ? 'is-loss' : ''}`;
        li.innerHTML = `
          <span class="panel-tag">${t(key[row.status] ?? 'statusPending')}</span>
          <span class="panel-picks">${new Date(row.createdAt).toLocaleString()}</span>
          <span class="panel-delta">+${num.format(row.amount)}</span>
        `;
        return li;
      }));
    }

    const { records } = await api(`/api/records?userId=${encodeURIComponent(state.me.id)}`);
    const filtered = kind === 'win' ? records.filter((r) => r.net > 0)
      : kind === 'lose' ? records.filter((r) => r.net < 0)
      : records;
    const title = { win: 'winRecords', lose: 'loseRecords', game: 'gameRecords' }[kind] ?? 'myRecords';
    openPanel(t(title), filtered.map(recordItem));
  } catch (error) {
    toast(tError(error));
  }
}

els.recordButtons.addEventListener('click', (event) => {
  const button = event.target.closest('[data-records]');
  if (button) openRecords(button.dataset.records);
});

// Own records only — other players' slips are not shown here.
els.viewRecords.addEventListener('click', () => openRecords('game'));

// Outcomes, not slips — so this one still spans everybody's rounds.
els.pastResults.addEventListener('click', async () => {
  try {
    const { records } = await api('/api/records');
    const seen = new Set();
    const rounds = records.filter((r) => !seen.has(r.roundId) && seen.add(r.roundId));
    openPanel(t('pastResults'), rounds.map((record) => {
      const li = document.createElement('li');
      li.className = 'panel-item';
      li.innerHTML = `
        <span>${faceOf(record)}</span>
        ${record.isPlate ? `<span class="panel-tag">${t('plate')}</span>` : ''}
        <span class="panel-delta">#${record.roundId}</span>
      `;
      return li;
    }));
  } catch (error) { toast(tError(error)); }
});

/* ---- Boot ---- */

async function enterGame(user) {
  state.me = user;
  state.config = await api('/api/config');
  els.authScreen.hidden = true;
  els.gameScreen.hidden = false;
  state.started = true;

  buildBoard();
  buildChips();
  renderStats();
  renderProfile();
  applyStatic();

  await poll();
  await loadRoundTop();
  await loadLeaderboard();
  await loadStats();
  await loadRequestStatus();

  setInterval(tickClock, 200);
  setInterval(poll, 30_000);
  setInterval(loadLeaderboard, 60_000);
  setInterval(loadRequestStatus, 30_000);
}

(async function boot() {
  setLang(lang());
  buildSwatchRow(els.swatches, (c) => { state.color = c; }, COLORS[0]);
  setMode('login');

  if (state.token) {
    try {
      const data = await api('/api/state');
      if (data.me) return enterGame(data.me);
    } catch { /* fall through to login */ }
    localStorage.removeItem(TOKEN_KEY);
    state.token = null;
  }
})();
