// Profile page. Own profile = full edit + stats + received gifts.
// Someone else's (?id=…) = read-only name, id, bio and gift wall.

import { applyStatic, lang, setLang, t, tError } from './i18n.js';

const TOKEN_KEY = 'dww.token';
const COLORS = ['#7aa84e', '#e8873c', '#d9534f', '#c96bb0',
  '#7a6cd6', '#3f8fd0', '#33a89a', '#c8a415'];
const MAX_GIFTS = 6;

const $ = (id) => document.getElementById(id);
const num = new Intl.NumberFormat('en-US');
const token = localStorage.getItem(TOKEN_KEY);
const viewId = new URLSearchParams(location.search).get('id');

const els = {
  screen: $('screen'), avatar: $('profile-avatar'), name: $('profile-name'), id: $('profile-id'),
  bioView: $('bio-view'), bioText: $('bio-text'),
  editCard: $('edit-card'), statsCard: $('stats-card'),
  form: $('profile-form'), editName: $('edit-name'), editBirthday: $('edit-birthday'),
  editBio: $('edit-bio'), editAvatars: $('edit-avatars'), editSwatches: $('edit-swatches'),
  error: $('profile-error'),
  pwCard: $('pw-card'), pwForm: $('pw-form'), pwCurrent: $('pw-current'),
  pwNew: $('pw-new'), pwConfirm: $('pw-confirm'), pwError: $('pw-error'),
  stSpend: $('st-spend'), stIncome: $('st-income'), stNet: $('st-net'), stTopup: $('st-topup'),
  recvGifts: $('recv-gifts'), giftsMore: $('gifts-more'),
  lang: $('lang'), logout: $('logout'), toast: $('toast'),
};

let me = null, config = null;
let pick = { color: null, avatar: null };

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
  if (!res.ok) { const e = new Error(data.error ?? res.status); e.code = data.code; throw e; }
  return data;
}

let toastTimer;
function toast(m) {
  els.toast.textContent = m; els.toast.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2600);
}

els.lang.addEventListener('click', () => { setLang(lang() === 'zh' ? 'en' : 'zh'); applyStatic(); boot(); });
els.logout.addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST' }); } catch {}
  localStorage.removeItem(TOKEN_KEY);
  location.href = 'index.html';
});

function header(p) {
  els.avatar.textContent = p.avatar;
  els.name.textContent = p.username;
  els.id.textContent = p.id;
  document.documentElement.style.setProperty('--user-color', p.color);
}

async function renderReceived(userId) {
  try {
    const { gifts } = await api(`/api/gifts/received?userId=${encodeURIComponent(userId)}`);
    if (!gifts.length) {
      els.recvGifts.innerHTML = `<p class="hint" style="margin:0">${t('noGifts')}</p>`;
      els.giftsMore.hidden = true;
      return;
    }
    els.recvGifts.replaceChildren(...gifts.slice(0, MAX_GIFTS).map((g) => {
      const d = document.createElement('div');
      d.className = 'recv-gift';
      d.innerHTML = `<span class="recv-emoji">${g.emoji}</span><span class="recv-count">×${g.count}</span>`;
      return d;
    }));
    // More gift types than we show → the full aggregated received list.
    els.giftsMore.hidden = gifts.length <= MAX_GIFTS;
    els.giftsMore.href = `gifts.html?received=${encodeURIComponent(userId)}`;
  } catch { /* ignore */ }
}

/* ---- Own profile: editable ---- */

function buildPickers() {
  els.editSwatches.replaceChildren(...COLORS.map((c) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = `swatch ${c === me.color ? 'active' : ''}`;
    b.style.background = c;
    b.addEventListener('click', () => {
      pick.color = c;
      for (const el of els.editSwatches.children) el.classList.toggle('active', el === b);
    });
    return b;
  }));
  els.editAvatars.replaceChildren(...(config.avatars ?? []).map((emoji) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = `avatar-opt ${emoji === me.avatar ? 'active' : ''}`;
    b.textContent = emoji;
    b.addEventListener('click', () => {
      pick.avatar = emoji;
      for (const el of els.editAvatars.children) el.classList.toggle('active', el === b);
    });
    return b;
  }));
}

async function renderStats() {
  try {
    const s = await api('/api/me/stats');
    els.stSpend.textContent = num.format(s.spend);
    els.stIncome.textContent = num.format(s.income);
    els.stTopup.textContent = num.format(s.topups);
    els.stNet.textContent = `${s.net >= 0 ? '+' : '−'}${num.format(Math.abs(s.net))}`;
    els.stNet.className = s.net >= 0 ? 'is-win' : 'is-loss';
  } catch {}
}

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  els.error.hidden = true;
  try {
    const { user } = await api('/api/me/update', {
      method: 'POST',
      body: {
        username: els.editName.value,
        birthday: els.editBirthday.value,
        bio: els.editBio.value,
        color: pick.color ?? me.color,
        avatar: pick.avatar ?? me.avatar,
      },
    });
    me = user;
    header(user);
    toast(t('saved'));
  } catch (error) {
    els.error.textContent = tError(error);
    els.error.hidden = false;
  }
});

els.pwForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  els.pwError.hidden = true;
  const current = els.pwCurrent.value;
  const next = els.pwNew.value;
  if (next.length < 4) {
    els.pwError.textContent = '新密码至少 4 位 / At least 4 characters';
    els.pwError.hidden = false;
    return;
  }
  if (next !== els.pwConfirm.value) {
    els.pwError.textContent = '两次输入的新密码不一致 / Passwords do not match';
    els.pwError.hidden = false;
    return;
  }
  try {
    await api('/api/me/password', {
      method: 'POST',
      body: { currentPassword: current, newPassword: next },
    });
    els.pwForm.reset();
    toast('密码已更新 / Password updated');
  } catch (error) {
    els.pwError.textContent = tError(error);
    els.pwError.hidden = false;
  }
});

/* ---- Boot ---- */

async function boot() {
  setLang(lang());
  if (!token) { location.href = 'index.html'; return; }

  const state = await api('/api/state').catch(() => null);
  if (!state?.me) { localStorage.removeItem(TOKEN_KEY); location.href = 'index.html'; return; }
  me = state.me;

  const own = !viewId || viewId === me.id;
  els.screen.hidden = false;

  if (own) {
    config = await api('/api/config');
    header(me);
    els.bioView.hidden = true;
    els.editCard.hidden = false;
    els.pwCard.hidden = false;
    els.statsCard.hidden = false;
    els.logout.hidden = false;
    els.editName.value = me.username;
    els.editBirthday.value = me.birthday ?? '';
    els.editBio.value = me.bio ?? '';
    pick = { color: me.color, avatar: me.avatar };
    buildPickers();
    renderStats();
    renderReceived(me.id);
  } else {
    // Someone else — read-only.
    const { profile } = await api(`/api/profile?id=${encodeURIComponent(viewId)}`);
    header(profile);
    els.editCard.hidden = true;
    els.pwCard.hidden = true;
    els.statsCard.hidden = true;
    els.logout.hidden = true;
    els.bioView.hidden = false;
    els.bioText.textContent = profile.bio || t('noBio');
    renderReceived(profile.id);
  }
  applyStatic();
}

boot();
