// 大胃王 (replica) — client.
// The server owns the clock, the draw and every balance. This file only
// renders what it is told and forwards bets.

import { applyStatic, setLang, t, tError, toggleLang, lang } from './i18n.js';

const TOKEN_KEY = 'dww.token';
const COLORS = [
  '#7aa84e', '#e8873c', '#d9534f', '#c96bb0',
  '#7a6cd6', '#3f8fd0', '#33a89a', '#c8a415',
];
const CHIP_VALUES = [50, 500, 5000];

const $ = (id) => document.getElementById(id);
const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const els = {
  authScreen: $('auth-screen'), gameScreen: $('game-screen'),
  tabLogin: $('tab-login'), tabRegister: $('tab-register'), tabReset: $('tab-reset'),
  authForm: $('auth-form'), username: $('username'), password: $('password'),
  labelPassword: $('label-password'), resetHelp: $('reset-help'),
  colorField: $('color-field'), swatches: $('swatches'),
  authError: $('auth-error'), authSubmit: $('auth-submit'),
  langAuth: $('lang-auth'), langGame: $('lang-game'),
  board: $('board'), chips: $('chips'), timer: $('timer'), balance: $('balance'),
  playerName: $('player-name'), playerId: $('player-id'), playerDot: $('player-dot'),
  phaseText: $('phase-text'), toast: $('toast'), logout: $('logout'),
  lbTabs: $('lb-tabs'), lbList: $('lb-list'),
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
  chip: CHIP_VALUES[0],
  clockOffset: 0,   // serverNow - clientNow
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
    error.code = data.code;      // stable key, translated client-side
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
    loadLeaderboard();
  }
}

for (const button of [els.langAuth, els.langGame]) {
  button.addEventListener('click', () => { toggleLang(); refreshLanguage(); });
}

/* ---- Auth screen ---- */

function buildSwatches() {
  els.swatches.replaceChildren(
    ...COLORS.map((color) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'swatch';
      dot.style.background = color;
      dot.title = color;
      dot.addEventListener('click', () => {
        state.color = color;
        for (const el of els.swatches.children) el.classList.toggle('active', el === dot);
      });
      return dot;
    })
  );
  els.swatches.firstElementChild?.classList.add('active');
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
    // The admin cleared this password — drop them straight into the reset tab.
    if (error.code === 'needs_reset') {
      setMode('reset');
      els.authError.textContent = tError(error);
      els.authError.hidden = false;
    } else {
      els.authError.textContent = tError(error);
      els.authError.hidden = false;
    }
  } finally {
    els.authSubmit.disabled = false;
  }
});

els.logout.addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST' }); } catch { /* leaving anyway */ }
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
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
    tile.querySelector('.animal-name').textContent =
      lang() === 'zh' ? animal.name : animal.en;
    tile.addEventListener('click', () => placeBet(animal));
    els.board.append(tile);
    tiles.set(animal.id, tile);
  }
  renderBoard();
}

function buildChips() {
  els.chips.replaceChildren(
    ...CHIP_VALUES.map((value) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.value = String(value);
      chip.innerHTML = `<span class="chip-art">🪙</span>
        <span class="chip-amount">${num.format(value)}</span>
        <span class="chip-unit"></span>`;
      chip.querySelector('.chip-unit').textContent = t('coinsUnit');
      chip.addEventListener('click', () => { state.chip = value; renderChips(); });
      return chip;
    })
  );
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
    const name = tile.querySelector('.animal-name');
    const animal = animalById.get(id);
    if (name && animal) name.textContent = lang() === 'zh' ? animal.name : animal.en;
    tile.querySelector('.animal-stake').textContent = `${num.format(stake)} ${t('coinsUnit')}`;
    tile.classList.toggle('has-bet', stake > 0);
    tile.disabled = state.phase !== 'betting';
  }
}

function renderStats() {
  if (!state.me) return;
  els.balance.textContent = num.format(state.me.coins);
  els.playerName.textContent = state.me.username;
  els.playerId.textContent = `#${state.me.id}`;
  els.playerDot.style.background = state.me.color;
  document.documentElement.style.setProperty('--user-color', state.me.color);
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

/* ---- Reel (draw-phase animation) ---- */

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
}

/* ---- Clock ----
   The countdown runs locally off the server offset, so it stays smooth
   between polls and every player sees the same number.                 */

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
    if (phase === 'drawing') {
      startReel();
    } else {
      state.myBets = {};   // new round, clean slate
    }
    renderPhaseText();
    renderChips();
    renderBoard();

    // Poll on the transition rather than on a fast timer. The countdown is
    // driven locally, so the only moments we actually need the server are
    // when a round flips — which is also when the result lands.
    if (!first) poll();
  }
}

async function poll() {
  try {
    const data = await api('/api/state');
    state.clockOffset = data.now - Date.now();
    state.myBets = data.myBets ?? {};
    if (data.me) { state.me = data.me; renderStats(); }

    if (data.lastResult && data.lastResult.roundId !== state.lastResultId) {
      // Skip the first poll — that result belongs to a round we missed.
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

/* ---- Leaderboard ---- */

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
    els.lbList.replaceChildren(
      ...entries.map((entry, index) => {
        const li = document.createElement('li');
        li.className = `lb-item ${entry.userId === state.me?.id ? 'is-me' : ''}`;
        li.innerHTML = `
          <span class="lb-rank">${['🥇', '🥈', '🥉'][index] ?? index + 1}</span>
          <span class="lb-dot" style="background:${entry.color}"></span>
          <span class="lb-name"></span>
          <span class="lb-rounds">${entry.rounds} ${t('rounds')}</span>
          <span class="lb-net ${entry.net >= 0 ? 'is-win' : 'is-loss'}">${
            entry.net >= 0 ? '+' : '−'}${num.format(Math.abs(entry.net))}</span>
        `;
        li.querySelector('.lb-name').textContent = entry.username;
        return li;
      })
    );
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

els.viewRecords.addEventListener('click', async () => {
  try {
    const { records } = await api('/api/records');
    openPanel(`${t('viewRecords')} — ${t('allPlayers')}`, records.map((record) => {
      const li = document.createElement('li');
      li.className = `panel-item ${record.net >= 0 ? 'is-win' : 'is-loss'}`;
      const picks = record.rows
        .map((r) => `${animalById.get(r.animalId)?.art ?? ''}${num.format(r.stake)}`)
        .join(' ');
      li.innerHTML = `
        <span class="lb-dot" style="background:${record.color}"></span>
        <span class="panel-user"></span>
        <span>${faceOf(record)}</span>
        ${record.isPlate ? `<span class="panel-tag">${t('plate')}</span>` : ''}
        <span class="panel-picks">${picks}</span>
        <span class="panel-delta">${record.net >= 0 ? '+' : '−'}${num.format(Math.abs(record.net))}</span>
      `;
      li.querySelector('.panel-user').textContent = record.username;
      return li;
    }));
  } catch (error) { toast(tError(error)); }
});

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
  applyStatic();

  await poll();
  await loadLeaderboard();

  setInterval(tickClock, 200);
  // Slow safety net — tickClock polls on every phase change, so this only
  // catches drift and background tabs. Two round-trips per 65s round keeps
  // a full table of players inside Cloudflare's free request allowance.
  setInterval(poll, 30_000);
  setInterval(loadLeaderboard, 60_000);
}

(async function boot() {
  setLang(lang());          // stamps <html lang> and applies static strings
  buildSwatches();
  setMode('login');

  if (state.token) {
    try {
      const data = await api('/api/state');
      if (data.me) return enterGame(data.me);
    } catch { /* fall through to the login screen */ }
    localStorage.removeItem(TOKEN_KEY);
    state.token = null;
  }
})();
