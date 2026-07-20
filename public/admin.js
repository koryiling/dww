// Superadmin hub: approve top-up requests, review the audit trail, see who
// has received the most, and list players.
// Every check that matters happens on the server; this is only the UI.

const TOKEN_KEY = 'dww.admin.token';
const $ = (id) => document.getElementById(id);
const num = new Intl.NumberFormat('en-US');

const els = {
  loginScreen: $('login-screen'), adminScreen: $('admin-screen'),
  loginForm: $('login-form'), adminUser: $('admin-user'), adminPass: $('admin-pass'),
  loginError: $('login-error'), logout: $('logout'),
  pendingList: $('pending-list'), pendingCount: $('pending-count'),
  refreshPending: $('refresh-pending'),
  statTabs: $('stat-tabs'), statList: $('stat-list'),
  auditTabs: $('audit-tabs'), auditList: $('audit-list'),
  userList: $('user-list'), refreshUsers: $('refresh-users'),
  toast: $('toast'),
};

let token = localStorage.getItem(TOKEN_KEY);
let statRange = 'today';
let auditFilter = '';
let stats = { today: [], allTime: [] };

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
    if (!data.user.isAdmin) throw new Error('该账号不是管理员 / not an admin');
    token = data.token;
    localStorage.setItem(TOKEN_KEY, token);
    await enterAdmin();
  } catch (error) {
    els.loginError.textContent = error.message;
    els.loginError.hidden = false;
  }
});

els.logout.addEventListener('click', () => {
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
});

/* ---- Approvals ---- */

async function loadPending() {
  try {
    const { requests } = await api('/api/admin/topups?status=pending');
    els.pendingCount.textContent = requests.length;

    if (requests.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'panel-empty';
      empty.textContent = '没有待审批的申请 / nothing pending';
      els.pendingList.replaceChildren(empty);
      return;
    }

    els.pendingList.replaceChildren(...requests.map((req) => {
      const li = document.createElement('li');
      li.className = 'panel-item';

      const dot = document.createElement('span');
      dot.className = 'lb-dot';
      dot.style.background = req.color;

      const name = document.createElement('span');
      name.className = 'panel-user';
      name.textContent = req.username;

      const id = document.createElement('span');
      id.className = 'uid';
      id.textContent = req.userId;

      const amount = document.createElement('span');
      amount.className = 'panel-delta';
      amount.textContent = `+${num.format(req.amount)}`;

      const meta = document.createElement('span');
      meta.className = 'panel-picks';
      meta.textContent = `现有 ${num.format(req.coins)} · ${when(req.createdAt)}`;

      const approve = document.createElement('button');
      approve.className = 'lb-tab active';
      approve.textContent = '批准';
      approve.addEventListener('click', () => decide(req, 'approve', approve));

      const reject = document.createElement('button');
      reject.className = 'lb-tab';
      reject.textContent = '拒绝';
      reject.addEventListener('click', () => decide(req, 'reject', reject));

      li.append(dot, name, id, meta, amount, approve, reject);
      return li;
    }));
  } catch (error) {
    toast(error.message);
  }
}

async function decide(req, action, button) {
  const verb = action === 'approve' ? '批准 approve' : '拒绝 reject';
  if (!confirm(
    `${verb}：${req.username} (ID ${req.userId}) 申请 ${num.format(req.amount)} 金币？\n\n` +
    (action === 'approve'
      ? `${num.format(req.coins)} → ${num.format(req.coins + req.amount)}`
      : '不会发放金币 / no coins will be given')
  )) return;

  // Disable immediately — the server rejects a second decision anyway, but
  // there is no reason to let a double click get that far.
  button.disabled = true;
  try {
    await api('/api/admin/topup-decide', { method: 'POST', body: { id: req.id, action } });
    toast(action === 'approve'
      ? `已批准 ${req.username} +${num.format(req.amount)}`
      : `已拒绝 ${req.username}`);
    await Promise.all([loadPending(), loadAudit(), loadStats(), loadUsers()]);
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
}

els.refreshPending.addEventListener('click', loadPending);

/* ---- Ranking ---- */

async function loadStats() {
  try {
    stats = await api('/api/admin/topup-stats');
    renderStats();
  } catch (error) {
    toast(error.message);
  }
}

function renderStats() {
  const rows = stats[statRange] ?? [];
  if (rows.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'lb-empty';
    empty.textContent = '暂无充值记录 / no top-ups yet';
    els.statList.replaceChildren(empty);
    return;
  }
  els.statList.replaceChildren(...rows.map((row, index) => {
    const li = document.createElement('li');
    li.className = 'lb-item';
    const rank = document.createElement('span');
    rank.className = 'lb-rank';
    rank.textContent = ['🥇', '🥈', '🥉'][index] ?? index + 1;

    const name = document.createElement('span');
    name.className = 'lb-name';
    name.textContent = row.username ?? '(deleted)';

    const id = document.createElement('span');
    id.className = 'uid';
    id.textContent = row.userId;

    const times = document.createElement('span');
    times.className = 'lb-rounds';
    times.textContent = `${row.times} 次`;

    const total = document.createElement('span');
    total.className = 'lb-net is-win';
    total.textContent = `+${num.format(row.total)}`;

    li.append(rank, name, id, times, total);
    return li;
  }));
}

els.statTabs.addEventListener('click', (event) => {
  const tab = event.target.closest('.lb-tab');
  if (!tab) return;
  statRange = tab.dataset.range;
  for (const el of els.statTabs.children) el.classList.toggle('active', el === tab);
  renderStats();
});

/* ---- Audit trail ---- */

const ACTION_LABEL = {
  topup_manual: '手动充值 Manual',
  topup_approve: '批准充值 Approved',
  topup_reject: '拒绝充值 Rejected',
  topup_request: '申请充值 Requested',
  clear_password: '清除密码 Password cleared',
  register: '注册 Registered',
};

async function loadAudit() {
  try {
    const query = auditFilter ? `?action=${encodeURIComponent(auditFilter)}` : '';
    const { entries } = await api(`/api/admin/audit${query}`);

    if (entries.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'panel-empty';
      empty.textContent = '暂无记录 / nothing yet';
      els.auditList.replaceChildren(empty);
      return;
    }

    els.auditList.replaceChildren(...entries.map((entry) => {
      const li = document.createElement('li');
      li.className = 'panel-item';

      const tag = document.createElement('span');
      tag.className = 'panel-tag';
      tag.textContent = ACTION_LABEL[entry.action] ?? entry.action;

      // "who did it to whom" — the actor is absent for self-service actions.
      const who = document.createElement('span');
      who.className = 'panel-user';
      who.textContent = entry.actorName
        ? `${entry.actorName} → ${entry.targetName ?? '—'}`
        : (entry.targetName ?? '—');

      const time = document.createElement('span');
      time.className = 'panel-picks';
      time.textContent = when(entry.at);

      li.append(tag, who, time);

      if (entry.amount !== null && entry.amount !== undefined) {
        const amount = document.createElement('span');
        amount.className = 'panel-delta';
        amount.textContent = `${entry.amount >= 0 ? '+' : ''}${num.format(entry.amount)}`;
        li.append(amount);
      }
      return li;
    }));
  } catch (error) {
    toast(error.message);
  }
}

els.auditTabs.addEventListener('click', (event) => {
  const tab = event.target.closest('.lb-tab');
  if (!tab) return;
  auditFilter = tab.dataset.action;
  for (const el of els.auditTabs.children) el.classList.toggle('active', el === tab);
  loadAudit();
});

/* ---- Players ---- */

async function loadUsers() {
  try {
    const { users } = await api('/api/admin/users');
    els.userList.replaceChildren(...users.map((user) => {
      const li = document.createElement('li');
      li.className = 'panel-item';

      const dot = document.createElement('span');
      dot.className = 'lb-dot';
      dot.style.background = user.color;

      const name = document.createElement('span');
      name.className = 'panel-user';
      name.textContent = user.username;

      const id = document.createElement('span');
      id.className = 'uid';
      id.textContent = user.id;

      const coins = document.createElement('span');
      coins.className = 'panel-delta';
      coins.textContent = `${num.format(user.coins)} 🪙`;

      li.append(dot, name, id);
      if (user.isAdmin) {
        const tag = document.createElement('span');
        tag.className = 'panel-tag';
        tag.textContent = 'ADMIN';
        li.append(tag);
      }
      if (user.mustReset) {
        const tag = document.createElement('span');
        tag.className = 'panel-tag';
        tag.textContent = '待重设';
        li.append(tag);
      }
      li.append(coins);
      return li;
    }));
  } catch (error) {
    toast(error.message);
  }
}

els.refreshUsers.addEventListener('click', loadUsers);

/* ---- Boot ---- */

async function enterAdmin() {
  els.loginScreen.hidden = true;
  els.adminScreen.hidden = false;
  await Promise.all([loadPending(), loadStats(), loadAudit(), loadUsers()]);
  setInterval(loadPending, 20_000);   // new requests appear without a refresh
}

(async function boot() {
  if (!token) return;
  try {
    const data = await api('/api/state');
    if (data.me?.isAdmin) return enterAdmin();
  } catch { /* show the login form */ }
  localStorage.removeItem(TOKEN_KEY);
  token = null;
})();
