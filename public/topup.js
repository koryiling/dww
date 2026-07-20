// Superadmin top-up: ID → verify the name → amount → confirm.
// The name check is the whole point of the two-step flow: crediting the wrong
// account is the easy mistake to make, and it is not easily undone.

const TOKEN_KEY = 'dww.admin.token';
const QUICK_AMOUNTS = [1000, 5000, 10000, 50000];

const $ = (id) => document.getElementById(id);
const num = new Intl.NumberFormat('en-US');

const els = {
  loginScreen: $('login-screen'), topupScreen: $('topup-screen'),
  loginForm: $('login-form'), adminUser: $('admin-user'), adminPass: $('admin-pass'),
  loginError: $('login-error'), logout: $('logout'),
  step1: $('step-1'), step2: $('step-2'), step3: $('step-3'),
  lookupForm: $('lookup-form'), lookupId: $('lookup-id'), lookupError: $('lookup-error'),
  foundName: $('found-name'), foundId: $('found-id'), foundCoins: $('found-coins'),
  amountForm: $('amount-form'), amount: $('amount'), quick: $('quick'),
  preview: $('preview'), amountError: $('amount-error'),
  cancel: $('cancel'), again: $('again'),
  doneName: $('done-name'), receipt: $('receipt'), toast: $('toast'),
};

let token = localStorage.getItem(TOKEN_KEY);
let target = null;

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
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

let toastTimer;
function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 3000);
}

function showStep(n) {
  els.step1.hidden = n !== 1;
  els.step2.hidden = n !== 2;
  els.step3.hidden = n !== 3;
}

/* ---- Login ---- */

els.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  els.loginError.hidden = true;
  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: { username: els.adminUser.value, password: els.adminPass.value },
    });
    if (!data.user.isAdmin) throw new Error('该账号不是管理员 / not an admin');
    token = data.token;
    localStorage.setItem(TOKEN_KEY, token);
    enterTopup();
  } catch (error) {
    els.loginError.textContent = error.message;
    els.loginError.hidden = false;
  }
});

els.logout.addEventListener('click', () => {
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
});

/* ---- Step 1: look the player up ---- */

els.lookupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  els.lookupError.hidden = true;
  const id = els.lookupId.value.trim();

  if (!/^\d{5}$/.test(id)) {
    els.lookupError.textContent = 'ID 必须是 5 位数字 / must be 5 digits';
    els.lookupError.hidden = false;
    return;
  }

  try {
    const { user } = await api(`/api/admin/lookup?userId=${encodeURIComponent(id)}`);
    target = user;
    els.foundName.textContent = user.username;
    els.foundId.textContent = user.id;
    els.foundCoins.textContent = num.format(user.coins);
    updatePreview();
    showStep(2);
  } catch (error) {
    els.lookupError.textContent = error.message;
    els.lookupError.hidden = false;
  }
});

/* ---- Step 2: amount, with the result spelled out before committing ---- */

function buildQuick() {
  els.quick.replaceChildren(
    ...QUICK_AMOUNTS.map((value) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lb-tab';
      button.textContent = `+${num.format(value)}`;
      button.addEventListener('click', () => {
        els.amount.value = value;
        updatePreview();
      });
      return button;
    })
  );
}

function updatePreview() {
  const amount = Number(els.amount.value);
  if (!target || !Number.isInteger(amount) || amount === 0) {
    els.preview.textContent = '';
    return;
  }
  els.preview.textContent =
    `${num.format(target.coins)} + ${num.format(amount)} = ${num.format(target.coins + amount)} 金币`;
}

els.amount.addEventListener('input', updatePreview);

els.cancel.addEventListener('click', () => {
  target = null;
  els.lookupId.value = '';
  showStep(1);
});

els.amountForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  els.amountError.hidden = true;

  const amount = Number(els.amount.value);
  if (!Number.isInteger(amount) || amount === 0) {
    els.amountError.textContent = '金额必须是非零整数 / must be a non-zero whole number';
    els.amountError.hidden = false;
    return;
  }

  // Last line of defence — the name is repeated here on purpose.
  const ok = confirm(
    `确认给 ${target.username} (ID ${target.id}) 充值 ${num.format(amount)} 金币？\n\n` +
    `Add ${num.format(amount)} coins to ${target.username}?\n` +
    `${num.format(target.coins)} → ${num.format(target.coins + amount)}`
  );
  if (!ok) return;

  try {
    const { user } = await api('/api/admin/reload', {
      method: 'POST',
      body: { userId: target.id, amount },
    });
    els.doneName.textContent = user.username;
    els.receipt.textContent =
      `${num.format(target.coins)} → ${num.format(user.coins)}  (+${num.format(amount)})`;
    showStep(3);
  } catch (error) {
    els.amountError.textContent = error.message;
    els.amountError.hidden = false;
  }
});

els.again.addEventListener('click', () => {
  target = null;
  els.lookupId.value = '';
  els.amount.value = 10000;
  showStep(1);
  els.lookupId.focus();
});

/* ---- Boot ---- */

function enterTopup() {
  els.loginScreen.hidden = true;
  els.topupScreen.hidden = false;
  buildQuick();
  showStep(1);
  els.lookupId.focus();
}

(async function boot() {
  if (!token) return;
  try {
    const data = await api('/api/state');
    if (data.me?.isAdmin) return enterTopup();
  } catch { /* show login */ }
  localStorage.removeItem(TOKEN_KEY);
  token = null;
})();
