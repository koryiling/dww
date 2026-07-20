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

  sidebar: $('sidebar'), sideToggle: $('side-toggle'),
  identity: $('identity'), coinsTop: $('coins-top'),
  playerNameTop: $('player-name-top'), playerIdTop: $('player-id-top'),
  playerDotTop: $('player-dot-top'),
  onlineList: $('online-list'), onlineCount: $('online-count'),
  personPanel: $('person-panel'), personAvatar: $('person-avatar'),
  personName: $('person-name'), personProfile: $('person-profile'),
  personGift: $('person-gift'), personCancel: $('person-cancel'),

  seats: $('seats'), seatCount: $('seat-count'),
  chatList: $('chat-list'), chatForm: $('chat-form'), chatInput: $('chat-input'),
  chatFab: $('chat-fab'), chatFabDot: $('chat-fab-dot'), chatFloat: $('chat-float'),
  chatFloatMin: $('chat-float-min'), chatCats: $('chat-cats'),
  giftTabs: $('gift-tabs'), giftBoard: $('gift-board'),
  giftPanel: $('gift-panel'), giftRecipients: $('gift-recipients'),
  giftGrid: $('gift-grid'), giftClose: $('gift-close'),
  announce: $('announce'),

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
  editAvatar: null,
  mySeat: null,
  seatList: [],
  messages: [],
  chatCat: 'all',
  giftTargets: new Set(),
  lastChatId: 0,
  lastBcastId: 0,
  gifts: [],
  giftBoard: 'wealth',
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

/* ---- Sidebar (collapsible on phones, always open on desktop) ---- */

function togglePanel() {
  els.sidebar.classList.toggle('open');
  if (els.sidebar.classList.contains('open')) {
    els.sidebar.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

els.sideToggle.addEventListener('click', togglePanel);

// The identity chip opens the profile page (like a normal app).
els.identity.addEventListener('click', () => { location.href = 'profile.html'; });

// Top-level view switcher: ChatRoom / DWW / Coming Soon.
$('view-tabs').addEventListener('click', (event) => {
  const tab = event.target.closest('.game-tab');
  if (!tab) return;
  const view = tab.dataset.view;
  for (const b of $('view-tabs').children) b.classList.toggle('active', b === tab);
  for (const v of document.querySelectorAll('.game-view')) {
    v.hidden = v.id !== `view-${view}`;
  }
  els.sideToggle.style.display = view === 'dww' ? '' : 'none';
  if (view === 'chatroom') { loadRoom(); loadGiftBoard(); }
  // Load the star game's iframe only the first time its tab is opened.
  if (view === 'soon') {
    const frame = $('star-frame');
    if (!frame.src) frame.src = 'star.html';
  }
});

/* ---- Profile (top identity bar only; full profile lives on profile.html) ---- */

function renderProfile() {
  if (!state.me) return;
  els.playerNameTop.textContent = state.me.username;
  els.playerIdTop.textContent = `#${state.me.id}`;
  els.playerDotTop.style.background = state.me.color;
  els.adminLink.hidden = !state.me.isAdmin;
  document.documentElement.style.setProperty('--user-color', state.me.color);
}

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
  els.coinsTop.textContent = num.format(state.me.coins);
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
  // Settlement has just happened, so the boards changed.
  loadRoundTop({ pop: true });
  loadLeaderboard();
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

/* ---- Online room: seats + chat ---- */

async function loadRoom() {
  try {
    const { seats, online, mySeat, messages } = await api('/api/room');
    state.mySeat = mySeat;
    renderSeats(seats, mySeat);
    renderOnline(online ?? []);
    renderChat(messages);
  } catch { /* non-critical */ }
}

function renderOnline(people) {
  els.onlineCount.textContent = people.length;
  if (!people.length) {
    els.onlineList.innerHTML = `<p class="hint" style="margin:0">—</p>`;
    return;
  }
  els.onlineList.replaceChildren(...people.map((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'online-person';
    b.innerHTML = `<span class="online-dot" style="border-color:${p.color}">${p.avatar}</span>
      <span class="online-name"></span>`;
    b.querySelector('.online-name').textContent = p.username;
    // Clicking anyone (online list or seat) offers View Profile / Gift.
    b.addEventListener('click', () => openPersonMenu(p));
    return b;
  }));
}

/* ---- Person action chooser ---- */

function openPersonMenu(person) {
  els.personAvatar.textContent = person.avatar;
  els.personName.textContent = person.username;
  els.personProfile.onclick = () => { location.href = `profile.html?id=${encodeURIComponent(person.userId)}`; };
  els.personGift.onclick = () => {
    els.personPanel.hidden = true;
    if (person.userId === state.me?.id) return toast(t('pickRecipients'));
    openGiftModal(person);
  };
  els.personPanel.hidden = false;
}

els.personCancel.addEventListener('click', () => { els.personPanel.hidden = true; });
els.personPanel.addEventListener('click', (e) => { if (e.target === els.personPanel) els.personPanel.hidden = true; });

function renderSeats(seats, mySeat) {
  // Remember who's seated (minus me) for the gift recipient picker.
  state.seatList = seats.filter(Boolean).filter((o) => o.userId !== state.me?.id);
  const taken = seats.filter(Boolean).length;
  els.seatCount.textContent = `${taken}/9`;

  els.seats.replaceChildren(...seats.map((occ, index) => {
    const n = index + 1;
    const seat = document.createElement('div');
    const mine = occ && occ.userId === state.me?.id;
    seat.className = `seat ${occ ? 'taken' : 'empty'} ${mine ? 'mine' : ''}`;

    if (occ) {
      seat.innerHTML = `
        <span class="seat-avatar" style="border-color:${occ.color}">${occ.avatar}</span>
        <span class="seat-name"></span>`;
      seat.querySelector('.seat-name').textContent = occ.username;
      if (mine) {
        const leave = document.createElement('button');
        leave.className = 'seat-btn leave';
        leave.textContent = t('leaveSeat');
        leave.addEventListener('click', (e) => { e.stopPropagation(); leaveSeat(); });
        seat.append(leave);
      } else {
        // Tap someone's seat → View Profile / Send Gift.
        seat.classList.add('giftable');
        seat.addEventListener('click', () => openPersonMenu(occ));
      }
    } else {
      seat.innerHTML = `<span class="seat-num">${n}</span>`;
      const sit = document.createElement('button');
      sit.className = 'seat-btn';
      sit.textContent = t('sit');
      sit.addEventListener('click', () => sitSeat(n));
      seat.append(sit);
    }
    return seat;
  }));
}

async function sitSeat(n) {
  try {
    await api('/api/room/sit', { method: 'POST', body: { seat: n } });
    await loadRoom();
  } catch (error) { toast(tError(error)); }
}

async function leaveSeat() {
  try {
    await api('/api/room/leave', { method: 'POST' });
    await loadRoom();
  } catch (error) { toast(tError(error)); }
}

// Format a big-gift broadcast into celebratory words.
function bcastText(raw) {
  try {
    const g = JSON.parse(raw);
    return t('bcastMsg')
      .replace('{from}', g.from).replace('{to}', g.to)
      .replace('{emoji}', g.emoji).replace('{name}', g.name ?? '');
  } catch { return raw; }
}

// A normal gift line for the Gift feed.
function giftLineText(raw) {
  try {
    const g = JSON.parse(raw);
    return t('giftLine')
      .replace('{from}', g.from).replace('{to}', g.to)
      .replace('{emoji}', g.emoji).replace('{name}', g.name ?? '');
  } catch { return raw; }
}

const isGiftKind = (m) => m.kind === 'gift' || m.kind === 'bcast';

function renderChat(messages) {
  state.messages = messages;

  // Pop the banner for any big gift we haven't shown yet.
  const bcasts = messages.filter((m) => m.kind === 'bcast');
  const newest = bcasts[bcasts.length - 1];
  if (newest && newest.id > state.lastBcastId) {
    if (state.lastBcastId !== 0) showAnnouncement(bcastText(newest.text));
    state.lastBcastId = newest.id;
  }

  // Nudge the chat bubble when a new message arrives while minimized.
  const top = messages[messages.length - 1];
  if (top && top.id > state.lastChatId) {
    if (state.lastChatId !== 0 && els.chatFloat.hidden) els.chatFabDot.hidden = false;
    state.lastChatId = top.id;
  }

  renderChatFiltered();
}

// Category filter: all / chat (msg only) / gift (gift lines only).
function renderChatFiltered() {
  const cat = state.chatCat;
  const list = state.messages.filter((m) =>
    cat === 'chat' ? m.kind === 'msg'
    : cat === 'gift' ? isGiftKind(m)
    : true);

  if (!list.length) {
    els.chatList.innerHTML = `<li class="chat-empty">${t('noMessages')}</li>`;
    return;
  }
  const atBottom = els.chatList.scrollHeight - els.chatList.scrollTop - els.chatList.clientHeight < 40;

  els.chatList.replaceChildren(...list.map((m) => {
    const li = document.createElement('li');
    if (m.kind === 'bcast') {
      li.className = 'chat-bcast';
      li.textContent = bcastText(m.text);
      return li;
    }
    if (m.kind === 'gift') {
      li.className = 'chat-gift';
      li.textContent = giftLineText(m.text);
      return li;
    }
    li.className = `chat-msg ${m.userId === state.me?.id ? 'me' : ''}`;
    li.innerHTML = `
      <span class="chat-avatar">${m.avatar}</span>
      <span class="chat-body">
        <span class="chat-who" style="color:${m.color}"></span>
        <span class="chat-text"></span>
      </span>`;
    li.querySelector('.chat-who').textContent = m.username;
    li.querySelector('.chat-text').textContent = m.text;
    return li;
  }));

  if (atBottom) els.chatList.scrollTop = els.chatList.scrollHeight;
}

/* ---- Floating chat widget ---- */

els.chatFab.addEventListener('click', () => {
  els.chatFloat.hidden = false;
  els.chatFab.hidden = true;
  els.chatFabDot.hidden = true;
  els.chatList.scrollTop = els.chatList.scrollHeight;
});

els.chatFloatMin.addEventListener('click', () => {
  els.chatFloat.hidden = true;
  els.chatFab.hidden = false;
});

els.chatCats.addEventListener('click', (event) => {
  const tab = event.target.closest('.chat-cat');
  if (!tab) return;
  state.chatCat = tab.dataset.cat;
  for (const b of els.chatCats.children) b.classList.toggle('active', b === tab);
  renderChatFiltered();
});

let announceTimer;
function showAnnouncement(text) {
  els.announce.textContent = text;
  els.announce.hidden = false;
  els.announce.classList.remove('show');
  void els.announce.offsetWidth;   // restart the animation
  els.announce.classList.add('show');
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { els.announce.hidden = true; }, 6000);
}

els.chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = els.chatInput.value.trim();
  if (!text) return;
  els.chatInput.value = '';
  try {
    await api('/api/room/chat', { method: 'POST', body: { text } });
    await loadRoom();
    els.chatList.scrollTop = els.chatList.scrollHeight;
  } catch (error) { toast(tError(error)); }
});

/* ---- Gifts ---- */

async function loadGiftCatalog() {
  try { state.gifts = (await api('/api/gifts/catalog')).gifts; } catch { /* keep empty */ }
}

// The panel shows everyone seated as circles you can multi-select, then a
// gift grid that sends to all selected. It stays open so you can keep giving
// until you close it with ✕.
function openGiftModal(preselect) {
  state.giftTargets = new Set(preselect ? [preselect.userId] : []);
  renderRecipients();
  renderGiftGrid();
  els.giftPanel.hidden = false;
}

function renderRecipients() {
  if (!state.seatList.length) {
    els.giftRecipients.innerHTML = `<p class="hint" style="margin:0">${t('noMessages')}</p>`;
    return;
  }
  els.giftRecipients.replaceChildren(...state.seatList.map((occ) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `recipient ${state.giftTargets.has(occ.userId) ? 'on' : ''}`;
    b.innerHTML = `<span class="recipient-dot" style="border-color:${occ.color}">${occ.avatar}</span>
      <span class="recipient-name"></span>`;
    b.querySelector('.recipient-name').textContent = occ.username;
    b.addEventListener('click', () => {
      if (state.giftTargets.has(occ.userId)) state.giftTargets.delete(occ.userId);
      else state.giftTargets.add(occ.userId);
      b.classList.toggle('on');
    });
    return b;
  }));
}

function renderGiftGrid() {
  els.giftGrid.replaceChildren(...state.gifts.map((g) => {
    const b = document.createElement('button');
    b.className = 'gift-opt';
    b.innerHTML = `<span class="gift-emoji">${g.emoji}</span>
      <span class="gift-name">${g.name}</span>
      <span class="gift-cost">🪙 ${num.format(g.cost)}</span>`;
    b.addEventListener('click', () => sendGift(g));
    return b;
  }));
}

// Send one gift to every selected recipient. Stops early if you run dry.
async function sendGift(gift) {
  const targets = [...state.giftTargets];
  if (!targets.length) return toast(t('pickRecipients'));

  let sent = 0;
  for (const toUserId of targets) {
    try {
      const { user } = await api('/api/gifts/send', { method: 'POST', body: { toUserId, giftId: gift.id } });
      state.me = user;
      sent += 1;
    } catch (error) {
      toast(tError(error));
      break;   // usually insufficient — stop before charging further
    }
  }
  if (sent) {
    renderStats();
    renderProfile();
    toast(t('giftSent').replace('{gift}', `${gift.emoji}×${sent}`).replace('{name}', `${sent}`));
    loadGiftBoard();
  }
  // Panel stays open for more gifting.
}

els.giftClose.addEventListener('click', () => { els.giftPanel.hidden = true; });
els.giftPanel.addEventListener('click', (e) => { if (e.target === els.giftPanel) els.giftPanel.hidden = true; });

async function loadGiftBoard() {
  try {
    const { board, entries } = await api(`/api/gifts/boards?board=${state.giftBoard}`);
    if (!entries.length) {
      els.giftBoard.innerHTML = `<li class="lb-empty">${t('boardEmpty')}</li>`;
      return;
    }

    if (board === 'feed') {
      const rows = entries.slice(0, 10).map((e) => {
        const li = document.createElement('li');
        li.className = 'lb-item';
        li.innerHTML = `<span class="feed-line"></span><span class="lb-net is-win">${e.emoji}</span>`;
        li.querySelector('.feed-line').textContent =
          t('gaveGift').replace('{from}', e.from).replace('{to}', e.to).replace('{gift}', '');
        return li;
      });
      // "View more" opens the full records page.
      const more = document.createElement('li');
      more.className = 'lb-more';
      const link = document.createElement('a');
      link.href = 'gifts.html';
      link.className = 'lb-tab';
      link.textContent = t('viewMore');
      more.append(link);
      rows.push(more);
      els.giftBoard.replaceChildren(...rows);
      return;
    }

    const unit = board === 'charm' ? t('received') : t('spent');
    els.giftBoard.replaceChildren(...entries.map((e, i) => {
      const li = document.createElement('li');
      li.className = `lb-item ${e.userId === state.me?.id ? 'is-me' : ''}`;
      li.innerHTML = `
        <span class="lb-rank">${['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
        <span class="seat-avatar sm">${e.avatar}</span>
        <span class="lb-name"></span>
        <span class="lb-rounds">${e.times}</span>
        <span class="lb-net is-win">🪙 ${num.format(e.total)}</span>`;
      li.querySelector('.lb-name').textContent = e.name;
      return li;
    }));
  } catch { /* non-critical */ }
}

els.giftTabs.addEventListener('click', (event) => {
  const tab = event.target.closest('.lb-tab');
  if (!tab) return;
  state.giftBoard = tab.dataset.board;
  for (const el of els.giftTabs.children) el.classList.toggle('active', el === tab);
  loadGiftBoard();
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

// Player records (own only), opened from the 我的记录 button.
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
  await loadRequestStatus();
  await loadRoom();
  await loadGiftCatalog();

  setInterval(tickClock, 200);
  setInterval(poll, 30_000);
  setInterval(loadLeaderboard, 60_000);
  setInterval(loadRequestStatus, 30_000);
  setInterval(loadRoom, 5_000);   // seats + chat update near real-time
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
