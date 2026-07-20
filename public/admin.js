// Superadmin console — four categories in one page.
// 1 Appeals · 2 Manual top-up · 3 Password/Account · 4 All users
// Every check that matters is enforced on the server; this is the UI.

import { applyStatic, lang, setLang, t, tError, toggleLang } from './i18n.js';

const fmt = (key, vars) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), t(key));

const TOKEN_KEY = 'dww.admin.token';
const $ = (id) => document.getElementById(id);
const num = new Intl.NumberFormat('en-US');
const QUICK = [500, 1000, 5000, 100000, 150000];

const els = {
  loginScreen: $('login-screen'), adminScreen: $('admin-screen'),
  loginForm: $('login-form'), adminUser: $('admin-user'), adminPass: $('admin-pass'),
  loginError: $('login-error'), logout: $('logout'), toast: $('toast'),
  catNav: $('cat-nav'), appealBadge: $('appeal-badge'),

  pendingList: $('pending-list'), pendingCount: $('pending-count'),
  refreshPending: $('refresh-pending'), appealTable: $('appeal-table'),

  manualForm: $('manual-form'), manualTarget: $('manual-target'),
  manualFound: $('manual-found'), manualAmount: $('manual-amount'),
  manualQuick: $('manual-quick'), manualError: $('manual-error'),
  manualUsers: $('manual-users'), manualSearch: $('manual-search'),
  manualTable: $('manual-table'), manualMode: $('manual-mode'),
  amountField: $('amount-field'),

  pwSearchForm: $('pw-search-form'), pwSearch: $('pw-search'),
  pwResults: $('pw-results'), pwTable: $('pw-table'),

  usersTable: $('users-table'), userTotal: $('user-total'), userFilter: $('user-filter'),

  catAdmins: $('cat-admins'), grantForm: $('grant-form'), grantTarget: $('grant-target'),
  permGrid: $('perm-grid'), grantError: $('grant-error'), adminList: $('admin-list'),
};

let token = localStorage.getItem(TOKEN_KEY);
let allUsers = [];
let manualMode = 'add';   // add | deduct | set | clear
let me = null;            // the logged-in admin
const tableLimit = { appeal: 10, manual: 10, pw: 10 };

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

const when = (ms) => new Date(ms).toLocaleString();

/* ---- Login ---- */

els.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  els.loginError.hidden = true;
  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: { username: els.adminUser.value, password: els.adminPass.value },
    });
    if (!data.user.isAdmin) throw new Error(t('a_notAdmin'));
    me = data.user;
    token = data.token;
    localStorage.setItem(TOKEN_KEY, token);
    enterAdmin();
  } catch (error) {
    els.loginError.textContent = error.message;
    els.loginError.hidden = false;
  }
});

els.logout.addEventListener('click', () => {
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
});

/* ---- Category switching ---- */

els.catNav.addEventListener('click', (event) => {
  const button = event.target.closest('.cat-btn');
  if (!button) return;
  const cat = button.dataset.cat;

  for (const b of els.catNav.children) b.classList.toggle('active', b === button);
  for (const panel of document.querySelectorAll('.cat-panel')) {
    panel.hidden = panel.dataset.panel !== cat;
  }

  if (cat === 'appeals') { loadPending(); loadTable('appeal'); }
  if (cat === 'manual') { loadManualUsers(); loadTable('manual'); }
  if (cat === 'password') loadTable('pw');
  if (cat === 'users') loadUsers();
  if (cat === 'admins') loadAdmins();
});

/* ---- 5. Admins (super only) ---- */

async function loadAdmins() {
  try {
    const { admins } = await api('/api/admin/admins');
    els.adminList.replaceChildren(...admins.map((a) => {
      const li = document.createElement('li');
      li.className = 'panel-item';
      const perms = a.isSuper ? 'ALL' : (a.perms.length ? a.perms.join(', ') : t('a_permsNone'));
      li.innerHTML = `
        <span class="lb-dot" style="background:${a.color}"></span>
        <span class="panel-user">${escapeHtml(a.username)}</span>
        <span class="uid">${a.id}</span>
        <span class="panel-tag">${a.isSuper ? 'SUPER' : 'ADMIN'}</span>
        <span class="panel-picks">${escapeHtml(perms)}</span>`;
      if (!a.isSuper) {
        const edit = document.createElement('button');
        edit.className = 'lb-tab';
        edit.textContent = t('edit');
        edit.addEventListener('click', () => {
          els.grantTarget.value = a.id;
          for (const chk of els.permGrid.querySelectorAll('input')) {
            chk.checked = a.perms.includes(chk.value);
          }
          els.grantTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        li.append(edit);
      }
      return li;
    }));
  } catch (error) { toast(error.message); }
}

async function submitGrant(event) {
  event.preventDefault();
  els.grantError.hidden = true;
  const q = els.grantTarget.value.trim();
  const perms = [...els.permGrid.querySelectorAll('input:checked')].map((c) => c.value);
  try {
    let userId = q;
    if (!/^\d+$/.test(q)) {
      const { users } = await api(`/api/admin/search?q=${encodeURIComponent(q)}`);
      const match = users.find((u) => u.username.toLowerCase() === q.toLowerCase());
      if (!match) throw new Error(t('a_noUser'));
      userId = match.id;
    }
    const { user } = await api('/api/admin/grant', { method: 'POST', body: { userId, perms } });
    toast(fmt('a_grantOk', { name: user.username }));
    els.grantTarget.value = '';
    for (const chk of els.permGrid.querySelectorAll('input')) chk.checked = false;
    await Promise.all([loadAdmins(), (allUsers = [], loadManualUsers())]);
  } catch (error) {
    els.grantError.textContent = error.message;
    els.grantError.hidden = false;
  }
}

/* ---- Shared history tables ---- */

const TABLE_ACTIONS = {
  appeal: ['topup_approve', 'topup_reject'],
  manual: ['topup_manual'],
  pw: ['clear_password', 'delete_user'],
};

const actionLabel = (action) => t(`act_${action}`) === `act_${action}` ? action : t(`act_${action}`);

// The history shows 10 rows; "show more" fetches the next 10. Because the
// audit feed mixes categories, we over-fetch and filter to this table's
// actions, growing the request limit until we have enough of them.
async function loadTable(which) {
  const table = els[`${which}Table`];
  const wanted = TABLE_ACTIONS[which];
  try {
    const want = tableLimit[which];
    // Fetch generously so filtering still yields `want` rows of this kind.
    const { entries, hasMore: feedHasMore } =
      await api(`/api/admin/audit?limit=${want * 4 + 4}`);
    const rows = entries.filter((e) => wanted.includes(e.action));
    const shown = rows.slice(0, want);
    const more = rows.length > want || feedHasMore;

    const head = `<thead><tr>
      <th>${t('a_colTime')}</th><th>${t('a_colAction')}</th><th>${t('a_colUser')}</th>
      <th>ID</th><th>${t('a_colAmount')}</th><th>${t('a_colBy')}</th></tr></thead>`;

    if (shown.length === 0) {
      table.innerHTML = head + `<tbody><tr><td colspan="6" class="td-empty">${t('a_none')}</td></tr></tbody>`;
      return;
    }

    table.innerHTML = head + '<tbody>' + shown.map((e) => `
      <tr>
        <td>${when(e.at)}</td>
        <td><span class="cell-tag">${actionLabel(e.action)}</span></td>
        <td>${escapeHtml(e.targetName ?? '—')}</td>
        <td class="mono">${e.targetId ?? '—'}</td>
        <td class="mono">${e.amount != null ? (e.amount >= 0 ? '+' : '') + num.format(e.amount) : '—'}</td>
        <td>${escapeHtml(e.actorName ?? '—')}</td>
      </tr>`).join('') + '</tbody>';

    // "Show more" lives in a wrapper next to the table.
    const wrap = table.closest('.table-wrap');
    let btn = wrap.parentElement.querySelector('.show-more');
    if (more) {
      if (!btn) {
        btn = document.createElement('button');
        btn.className = 'lb-tab show-more';
        btn.addEventListener('click', () => { tableLimit[which] += 10; loadTable(which); });
        wrap.after(btn);
      }
      btn.textContent = t('a_showMore');
    } else if (btn) {
      btn.remove();
    }
  } catch (error) {
    toast(error.message);
  }
}

const escapeHtml = (t) => String(t).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---- 1. Appeals ---- */

async function loadPending() {
  try {
    const { requests } = await api('/api/admin/topups?status=pending');
    els.pendingCount.textContent = requests.length;
    els.appealBadge.textContent = requests.length;
    els.appealBadge.classList.toggle('zero', requests.length === 0);

    if (requests.length === 0) {
      els.pendingList.innerHTML = `<li class="panel-empty">${t('a_noPending')}</li>`;
      return;
    }

    els.pendingList.replaceChildren(...requests.map((req) => {
      const li = document.createElement('li');
      li.className = 'panel-item';
      li.innerHTML = `
        <span class="lb-dot" style="background:${req.color}"></span>
        <span class="panel-user">${escapeHtml(req.username)}</span>
        <span class="uid">${req.userId}</span>
        <span class="panel-picks">${t('a_have')} ${num.format(req.coins)} · ${when(req.createdAt)}</span>
        <span class="panel-delta">+${num.format(req.amount)}</span>`;

      const approve = document.createElement('button');
      approve.className = 'lb-tab active';
      approve.textContent = t('a_approve');
      approve.addEventListener('click', () => decide(req, 'approve', approve));

      const reject = document.createElement('button');
      reject.className = 'lb-tab';
      reject.textContent = t('a_reject');
      reject.addEventListener('click', () => decide(req, 'reject', reject));

      li.append(approve, reject);
      return li;
    }));
  } catch (error) { toast(error.message); }
}

async function decide(req, action, button) {
  const key = action === 'approve' ? 'a_confirmApprove' : 'a_confirmReject';
  if (!confirm(fmt(key, { name: req.username, id: req.userId, amount: num.format(req.amount) }))) return;
  button.disabled = true;
  try {
    await api('/api/admin/topup-decide', { method: 'POST', body: { id: req.id, action } });
    toast(`${t(action === 'approve' ? 'a_approve' : 'a_reject')} ${req.username}`);
    await Promise.all([loadPending(), loadTable('appeal')]);
  } catch (error) { toast(error.message); button.disabled = false; }
}

els.refreshPending.addEventListener('click', () => { loadPending(); loadTable('appeal'); });

/* ---- 2. Manual top-up ---- */

function buildQuick() {
  els.manualQuick.replaceChildren(...QUICK.map((v) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lb-tab';
    b.textContent = `+${num.format(v)}`;
    b.addEventListener('click', () => { els.manualAmount.value = v; });
    return b;
  }));
}

async function loadManualUsers(filter = '') {
  try {
    if (allUsers.length === 0) allUsers = (await api('/api/admin/users')).users;
    const f = filter.trim().toLowerCase();
    const list = allUsers.filter((u) =>
      !f || u.username.toLowerCase().includes(f) || u.id.includes(f));

    els.manualUsers.replaceChildren(...list.map((u) => {
      const li = document.createElement('li');
      li.className = 'panel-item pick';
      li.innerHTML = `
        <span class="lb-dot" style="background:${u.color}"></span>
        <span class="panel-user">${escapeHtml(u.username)}</span>
        <span class="uid">${u.id}</span>
        <span class="panel-delta">${num.format(u.coins)} 🪙</span>`;
      li.addEventListener('click', () => {
        els.manualTarget.value = u.id;
        showManualFound(u);
      });
      return li;
    }));
  } catch (error) { toast(error.message); }
}

function showManualFound(u) {
  els.manualFound.hidden = false;
  els.manualFound.innerHTML =
    `✔ <strong>${escapeHtml(u.username)}</strong> · ID ${u.id} · 现有 ${num.format(u.coins)} 🪙`;
}

els.manualSearch.addEventListener('input', () => loadManualUsers(els.manualSearch.value));

// Look the target up as it's typed, so the name is confirmed before topping up.
let lookupTimer;
els.manualTarget.addEventListener('input', () => {
  els.manualFound.hidden = true;
  clearTimeout(lookupTimer);
  const q = els.manualTarget.value.trim();
  if (!q) return;
  lookupTimer = setTimeout(async () => {
    try {
      const { users } = await api(`/api/admin/search?q=${encodeURIComponent(q)}`);
      const exact = users.find((u) => u.id === q) ?? users[0];
      if (exact) showManualFound(exact);
    } catch { /* silent */ }
  }, 300);
});

// Four ways to change a balance: add, deduct, set to an exact figure, or
// clear to zero. Clear needs no amount, so the amount box hides for it.
els.manualMode.addEventListener('click', (event) => {
  const button = event.target.closest('.mode-btn');
  if (!button) return;
  manualMode = button.dataset.mode;
  for (const b of els.manualMode.children) b.classList.toggle('active', b === button);
  els.amountField.hidden = manualMode === 'clear';
  els.manualQuick.hidden = manualMode === 'clear';
});

els.manualForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  els.manualError.hidden = true;
  const q = els.manualTarget.value.trim();
  const amount = Number(els.manualAmount.value);

  try {
    // Resolve a username to an id if needed.
    let userId = q;
    let name = q;
    if (!/^\d+$/.test(q)) {
      const { users } = await api(`/api/admin/search?q=${encodeURIComponent(q)}`);
      const match = users.find((u) => u.username.toLowerCase() === q.toLowerCase());
      if (!match) throw new Error(t('a_noUser'));
      userId = match.id;
      name = match.username;
    }

    const confirmKey = {
      add: 'a_confirmAdd', deduct: 'a_confirmDeduct',
      set: 'a_confirmSet', clear: 'a_confirmClearBal',
    }[manualMode];
    if (!confirm(fmt(confirmKey, { name, amount: num.format(amount) }))) return;

    let user;
    if (manualMode === 'add') {
      ({ user } = await api('/api/admin/reload', { method: 'POST', body: { userId, amount } }));
    } else if (manualMode === 'deduct') {
      ({ user } = await api('/api/admin/reload', { method: 'POST', body: { userId, amount: -amount } }));
    } else if (manualMode === 'set') {
      ({ user } = await api('/api/admin/set-coins', { method: 'POST', body: { userId, coins: amount } }));
    } else {
      ({ user } = await api('/api/admin/set-coins', { method: 'POST', body: { userId, coins: 0 } }));
    }

    toast(`${user.username} → ${num.format(user.coins)} 🪙`);
    els.manualTarget.value = '';
    els.manualFound.hidden = true;
    allUsers = [];
    await Promise.all([loadManualUsers(), loadTable('manual')]);
  } catch (error) {
    els.manualError.textContent = error.message;
    els.manualError.hidden = false;
  }
});

/* ---- 3. Password / Account ---- */

els.pwSearchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await pwSearch(els.pwSearch.value.trim());
});

async function pwSearch(q) {
  try {
    const { users } = await api(`/api/admin/search?q=${encodeURIComponent(q)}`);
    if (users.length === 0) {
      els.pwResults.innerHTML = `<li class="panel-empty">${t('a_noUser')}</li>`;
      return;
    }
    els.pwResults.replaceChildren(...users.map((u) => {
      const li = document.createElement('li');
      li.className = 'panel-item';
      li.innerHTML = `
        <span class="lb-dot" style="background:${u.color}"></span>
        <span class="panel-user">${escapeHtml(u.username)}</span>
        <span class="uid">${u.id}</span>
        <span class="panel-delta">${num.format(u.coins)} 🪙</span>`;

      // Role tags. The super account is untouchable; a regular admin can be
      // reset/deleted, but only by the super.
      if (u.isSuper) {
        const tag = document.createElement('span');
        tag.className = 'panel-tag';
        tag.textContent = 'SUPER';
        li.append(tag);
      } else if (u.isAdmin) {
        const tag = document.createElement('span');
        tag.className = 'panel-tag';
        tag.textContent = 'ADMIN';
        li.append(tag);
      } else if (u.mustReset) {
        const tag = document.createElement('span');
        tag.className = 'panel-tag';
        tag.textContent = t('a_awaitReset');
        li.append(tag);
      }

      // Actions allowed on this target?
      const canAct = !u.isSuper && (!u.isAdmin || me.isSuper);
      if (canAct) {
        if (!u.mustReset) {
          const clear = document.createElement('button');
          clear.className = 'lb-tab';
          clear.textContent = t('a_clearPw');
          clear.addEventListener('click', () => clearPassword(u));
          li.append(clear);
        }
        const del = document.createElement('button');
        del.className = 'lb-tab danger';
        del.textContent = t('a_deleteAcc');
        del.addEventListener('click', () => deleteUser(u));
        li.append(del);
      }
      return li;
    }));
  } catch (error) { toast(error.message); }
}

async function clearPassword(u) {
  if (!confirm(fmt('a_confirmClear', { name: u.username, id: u.id }))) return;
  try {
    await api('/api/admin/clear-password', { method: 'POST', body: { userId: u.id } });
    toast(fmt('a_cleared', { name: u.username }));
    await Promise.all([pwSearch(els.pwSearch.value.trim()), loadTable('pw')]);
  } catch (error) { toast(error.message); }
}

async function deleteUser(u) {
  const typed = prompt(fmt('a_deletePrompt', { name: u.username }));
  if (typed === null) return;
  try {
    await api('/api/admin/delete-user', { method: 'POST', body: { userId: u.id, confirm: typed } });
    toast(fmt('a_deleted', { name: u.username }));
    allUsers = [];
    await Promise.all([pwSearch(els.pwSearch.value.trim()), loadTable('pw')]);
  } catch (error) { toast(error.message); }
}

/* ---- 4. All users ---- */

async function loadUsers() {
  try {
    allUsers = (await api('/api/admin/users')).users;
    renderUsers(els.userFilter.value);
  } catch (error) { toast(error.message); }
}

function renderUsers(filter = '') {
  const f = filter.trim().toLowerCase();
  const list = allUsers.filter((u) =>
    !f || u.username.toLowerCase().includes(f) || u.id.includes(f));
  els.userTotal.textContent = allUsers.length;

  const head = `<thead><tr>
    <th>${t('a_colStatus')}</th><th>${t('a_colUser')}</th><th>ID</th>
    <th>${t('a_colCoins')}</th><th>${t('a_colBirthday')}</th><th></th></tr></thead>`;

  if (list.length === 0) {
    els.usersTable.innerHTML = head + `<tbody><tr><td colspan="6" class="td-empty">${t('a_none')}</td></tr></tbody>`;
    return;
  }

  els.usersTable.innerHTML = head + '<tbody>' + list.map((u) => `
    <tr>
      <td><span class="status-dot ${u.online ? 'on' : 'off'}"></span>${u.online ? t('a_online') : t('a_offline')}</td>
      <td>${escapeHtml(u.username)}${u.isAdmin ? ' <span class="cell-tag">ADMIN</span>' : ''}</td>
      <td class="mono">${u.id}</td>
      <td class="mono">🪙 ${num.format(u.coins)}</td>
      <td>${u.birthday ?? '—'}</td>
      <td>${u.mustReset ? `<span class="cell-tag">${t('a_awaitReset')}</span>` : ''}</td>
    </tr>`).join('') + '</tbody>';
}

els.userFilter.addEventListener('input', () => renderUsers(els.userFilter.value));

/* ---- Boot ---- */

const activeCat = () => document.querySelector('.cat-btn.active')?.dataset.cat ?? 'appeals';

// Reload whatever category is on screen so its dynamic content re-renders in
// the new language too.
function refreshActive() {
  const cat = activeCat();
  if (cat === 'appeals') { loadPending(); loadTable('appeal'); }
  else if (cat === 'manual') { loadManualUsers(els.manualSearch.value); loadTable('manual'); }
  else if (cat === 'password') loadTable('pw');
  else if (cat === 'users') renderUsers(els.userFilter.value);
}

for (const button of [$('lang-login'), $('lang-admin')]) {
  button?.addEventListener('click', () => {
    toggleLang();
    applyStatic();
    if (!els.adminScreen.hidden) refreshActive();
  });
}

// Show only the categories this admin is allowed to use, and land on the
// first one. The super sees everything plus the Admins tab.
function applyPermissions() {
  const can = (p) => me.isSuper || (me.perms ?? []).includes(p);
  const map = { appeals: 'appeals', manual: 'manual', password: 'password', users: 'users', admins: 'admins' };
  let first = null;
  for (const btn of els.catNav.children) {
    const cat = btn.dataset.cat;
    const allowed = cat === 'admins' ? me.isSuper : can(map[cat]);
    btn.hidden = !allowed;
    if (allowed && !first) first = btn;
  }
  els.catAdmins.hidden = !me.isSuper;

  // Activate the first permitted category.
  for (const btn of els.catNav.children) btn.classList.toggle('active', btn === first);
  for (const panel of document.querySelectorAll('.cat-panel')) {
    panel.hidden = panel.dataset.panel !== first?.dataset.cat;
  }
  return first?.dataset.cat;
}

els.grantForm.addEventListener('submit', submitGrant);

function enterAdmin() {
  els.loginScreen.hidden = true;
  els.adminScreen.hidden = false;
  applyStatic();
  buildQuick();

  const first = applyPermissions();
  if (first === 'appeals') { loadPending(); loadTable('appeal'); }
  else if (first === 'manual') { loadManualUsers(); loadTable('manual'); }
  else if (first === 'password') loadTable('pw');
  else if (first === 'users') loadUsers();
  else if (first === 'admins') loadAdmins();

  if (me.isSuper || (me.perms ?? []).includes('appeals')) {
    setInterval(loadPending, 20_000);
  }
}

(async function boot() {
  setLang(lang());
  applyStatic();
  if (!token) return;
  try {
    const data = await api('/api/state');
    if (data.me?.isAdmin) { me = data.me; return enterAdmin(); }
  } catch { /* show login */ }
  localStorage.removeItem(TOKEN_KEY);
  token = null;
})();
