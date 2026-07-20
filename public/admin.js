// Superadmin console — reload coins and clear forgotten passwords.
// Every check that matters happens on the server; this is only the UI.

const TOKEN_KEY = 'dww.admin.token';
const $ = (id) => document.getElementById(id);
const num = new Intl.NumberFormat('en-US');

const els = {
  loginScreen: $('login-screen'), adminScreen: $('admin-screen'),
  loginForm: $('login-form'), username: $('username'), password: $('password'),
  loginError: $('login-error'), logout: $('logout'),
  reloadForm: $('reload-form'), reloadId: $('reload-id'), reloadAmount: $('reload-amount'),
  refresh: $('refresh'), userList: $('user-list'), toast: $('toast'),
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
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 3000);
}

els.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  els.loginError.hidden = true;
  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: { username: els.username.value, password: els.password.value },
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

els.reloadForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const { user } = await api('/api/admin/reload', {
      method: 'POST',
      body: {
        userId: els.reloadId.value.trim(),
        amount: Number(els.reloadAmount.value),
      },
    });
    toast(`${user.username} → ${num.format(user.coins)} coins`);
    els.reloadId.value = '';
    await loadUsers();
  } catch (error) {
    toast(error.message);
  }
});

els.refresh.addEventListener('click', loadUsers);

async function clearPassword(user) {
  const ok = confirm(
    `清除 ${user.username} (#${user.id}) 的密码？\n` +
    `Clear this password? They will set a new one themselves at the ` +
    `"重设密码 / Reset password" tab, and will be signed out everywhere.`
  );
  if (!ok) return;
  try {
    await api('/api/admin/clear-password', { method: 'POST', body: { userId: user.id } });
    toast(`${user.username} 需要重设密码 / must reset password`);
    await loadUsers();
  } catch (error) {
    toast(error.message);
  }
}

async function loadUsers() {
  try {
    const { users } = await api('/api/admin/users');
    els.userList.replaceChildren(
      ...users.map((user) => {
        const li = document.createElement('li');
        li.className = 'panel-item';

        const name = document.createElement('span');
        name.className = 'panel-user';
        name.textContent = user.username;

        const id = document.createElement('span');
        id.className = 'uid';
        id.textContent = `#${user.id}`;
        id.title = '点击复制 / click to copy';
        id.style.cursor = 'pointer';
        id.addEventListener('click', () => {
          els.reloadId.value = user.id;
          toast(`已填入 ${user.id}`);
        });

        const coins = document.createElement('span');
        coins.className = 'panel-delta';
        coins.textContent = `${num.format(user.coins)} 🪙`;

        li.append(name, id);
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

        const clear = document.createElement('button');
        clear.className = 'lb-tab';
        clear.textContent = '清除密码';
        clear.addEventListener('click', () => clearPassword(user));
        li.append(clear);

        return li;
      })
    );
  } catch (error) {
    toast(error.message);
  }
}

async function enterAdmin() {
  els.loginScreen.hidden = true;
  els.adminScreen.hidden = false;
  await loadUsers();
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
