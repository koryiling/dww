// Player-facing top-up page: pick a preset amount, it goes straight to the
// superadmin's approval queue. No coins move until they approve.

import { applyStatic, lang, setLang, t, tError, toggleLang } from './i18n.js';

const TOKEN_KEY = 'dww.token';
const AMOUNTS = [500, 1000, 5000, 100000, 150000];

const $ = (id) => document.getElementById(id);
const num = new Intl.NumberFormat('en-US');

const els = {
  buyScreen: $('buy-screen'), needLogin: $('need-login'),
  balance: $('balance'), amounts: $('amounts'),
  pendingBanner: $('pending-banner'), pendingAmount: $('pending-amount'),
  history: $('history'), toast: $('toast'), lang: $('lang'),
};

const token = localStorage.getItem(TOKEN_KEY);
let pending = false;

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
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

let toastTimer;
function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 3200);
}

els.lang.addEventListener('click', () => {
  toggleLang();
  applyStatic();
  buildAmounts();
  loadRequests();
});

/* ---- Amount cards ---- */

function buildAmounts() {
  els.amounts.replaceChildren(...AMOUNTS.map((amount) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'amount-card';
    card.disabled = pending;

    const icon = document.createElement('span');
    icon.className = 'amount-icon';
    // Bigger amounts get a fuller stack of coins — a quick visual ladder.
    icon.textContent = amount >= 100000 ? '💎' : amount >= 5000 ? '💰' : '🪙';

    const value = document.createElement('span');
    value.className = 'amount-value';
    value.textContent = num.format(amount);

    const unit = document.createElement('span');
    unit.className = 'amount-unit';
    unit.textContent = t('coinsUnit');

    card.append(icon, value, unit);
    card.addEventListener('click', () => request(amount));
    return card;
  }));
}

async function request(amount) {
  if (pending) return toast(t('request_pending'));

  const ok = confirm(
    `${t('confirmRequest').replace('{amount}', num.format(amount))}`
  );
  if (!ok) return;

  try {
    await api('/api/topup-request', { method: 'POST', body: { amount } });
    toast(t('requestSent'));
    await loadRequests();
  } catch (error) {
    toast(tError(error));
  }
}

/* ---- State ---- */

const STATUS_KEY = { pending: 'statusPending', approved: 'statusApproved', rejected: 'statusRejected' };

async function loadRequests() {
  try {
    const { request: latest, history } = await api('/api/topup-request');
    pending = latest?.status === 'pending';

    els.pendingBanner.hidden = !pending;
    if (pending) {
      els.pendingAmount.textContent = `+${num.format(latest.amount)} ${t('coinsUnit')}`;
    }
    buildAmounts();

    if (!history?.length) {
      const empty = document.createElement('li');
      empty.className = 'panel-empty';
      empty.textContent = t('noRecords');
      els.history.replaceChildren(empty);
      return;
    }

    els.history.replaceChildren(...history.map((row) => {
      const li = document.createElement('li');
      li.className = `panel-item ${row.status === 'approved' ? 'is-win'
        : row.status === 'rejected' ? 'is-loss' : ''}`;

      const tag = document.createElement('span');
      tag.className = 'panel-tag';
      tag.textContent = t(STATUS_KEY[row.status] ?? 'statusPending');

      const time = document.createElement('span');
      time.className = 'panel-picks';
      time.textContent = new Date(row.createdAt).toLocaleString();

      const amount = document.createElement('span');
      amount.className = 'panel-delta';
      amount.textContent = `+${num.format(row.amount)}`;

      li.append(tag, time, amount);
      return li;
    }));
  } catch (error) {
    if (error.status === 401) return showLogin();
    toast(tError(error));
  }
}

function showLogin() {
  els.buyScreen.hidden = true;
  els.needLogin.hidden = false;
}

/* ---- Boot ---- */

(async function boot() {
  setLang(lang());
  applyStatic();

  if (!token) return showLogin();

  try {
    const state = await api('/api/state');
    if (!state.me) return showLogin();
    els.balance.textContent = num.format(state.me.coins);
    document.documentElement.style.setProperty('--user-color', state.me.color);
  } catch {
    return showLogin();
  }

  els.buyScreen.hidden = false;
  buildAmounts();
  await loadRequests();

  // Reflects an approval without needing a manual refresh.
  setInterval(loadRequests, 15_000);
})();
