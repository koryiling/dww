// Superadmin: clear a forgotten password so the user can set a new one.
// Search accepts a username as well as an ID, because someone locked out of
// their account usually can't tell you their ID.

const TOKEN_KEY = 'dww.admin.token';
const $ = (id) => document.getElementById(id);
const num = new Intl.NumberFormat('en-US');

const els = {
  loginScreen: $('login-screen'), resetScreen: $('reset-screen'),
  loginForm: $('login-form'), adminUser: $('admin-user'), adminPass: $('admin-pass'),
  loginError: $('login-error'), logout: $('logout'),
  searchForm: $('search-form'), query: $('query'),
  resultsCard: $('results-card'), results: $('results'), toast: $('toast'),
};

let token = localStorage.getItem(TOKEN_KEY);

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
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 3200);
}

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
    enterReset();
  } catch (error) {
    els.loginError.textContent = error.message;
    els.loginError.hidden = false;
  }
});

els.logout.addEventListener('click', () => {
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
});

els.searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await search(els.query.value.trim());
});

async function search(q) {
  try {
    const { users } = await api(`/api/admin/search?q=${encodeURIComponent(q)}`);
    els.resultsCard.hidden = false;

    if (users.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'panel-empty';
      empty.textContent = '找不到用户 / no match';
      els.results.replaceChildren(empty);
      return;
    }

    els.results.replaceChildren(...users.map(renderUser));
  } catch (error) {
    toast(error.message);
  }
}

function renderUser(user) {
  const li = document.createElement('li');
  li.className = 'panel-item';

  const name = document.createElement('span');
  name.className = 'panel-user';
  name.textContent = user.username;

  const id = document.createElement('span');
  id.className = 'uid';
  id.textContent = user.id;

  const coins = document.createElement('span');
  coins.className = 'panel-picks';
  coins.textContent = `${num.format(user.coins)} 🪙`;

  li.append(name, id, coins);

  if (user.isAdmin) {
    const tag = document.createElement('span');
    tag.className = 'panel-tag';
    tag.textContent = 'ADMIN';
    li.append(tag);
  }

  const action = document.createElement('span');
  action.style.marginLeft = 'auto';

  if (user.mustReset) {
    const tag = document.createElement('span');
    tag.className = 'panel-tag';
    tag.textContent = '待重设 / awaiting reset';
    action.append(tag);
  } else {
    const button = document.createElement('button');
    button.className = 'lb-tab active';
    button.textContent = '清除密码';
    button.addEventListener('click', () => clearPassword(user));
    action.append(button);
  }

  li.append(action);
  return li;
}

async function clearPassword(user) {
  const ok = confirm(
    `确认清除 ${user.username} (ID ${user.id}) 的密码？\n\n` +
    `Clear the password for ${user.username}?\n` +
    `• They are signed out on every device\n` +
    `• They must set a new password themselves on the Reset password tab\n` +
    `• Their coins and records are NOT affected`
  );
  if (!ok) return;

  try {
    await api('/api/admin/clear-password', { method: 'POST', body: { userId: user.id } });
    toast(`${user.username}：密码已清除，请通知用户自行重设`);
    await search(els.query.value.trim());
  } catch (error) {
    toast(error.message);
  }
}

function enterReset() {
  els.loginScreen.hidden = true;
  els.resetScreen.hidden = false;
  els.query.focus();
}

(async function boot() {
  if (!token) return;
  try {
    const data = await api('/api/state');
    if (data.me?.isAdmin) return enterReset();
  } catch { /* show login */ }
  localStorage.removeItem(TOKEN_KEY);
  token = null;
})();
