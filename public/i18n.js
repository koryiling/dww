// Language: 中文 / English.
// Server responses carry a stable `code`; we translate that rather than the
// server's own message, so the API never has to know the user's language.

const STRINGS = {
  zh: {
    subtitle: '– 多人同步 –',
    single: '单人',
    multi: '多人',

    login: '登入',
    register: '注册',
    reset: '重设密码',
    username: '用户名',
    password: '密码',
    newPassword: '新密码',
    favColor: '喜欢的颜色',
    submitLogin: '登入',
    submitRegister: '注册并开始',
    submitReset: '设置密码并登入',
    authHint: '每位玩家有专属 ID，余额不足时请联系管理员充值。',
    forgot: '忘记密码？',
    forgotHelp: '请联系管理员清除密码，然后在此重设。',

    timeLeft: '剩余时间：',
    seconds: '秒',
    coinsLabel: '金币：',
    playerLabel: '玩家：',
    coinsUnit: '金币',

    leaderboard: '排行榜',
    daily: '今日',
    weekly: '本周',
    monthly: '本月',
    lbEmpty: '本时段还没有记录',
    rounds: '局',

    viewRecords: '查看记录',
    pastResults: '历史开奖',
    allPlayers: '所有玩家',
    close: '关闭',
    noRecords: '暂无记录',
    plate: '整盘',

    placeBets: '请下注！',
    rolling: '开奖中…',
    nextRound: '下一轮即将开始…',
    connecting: '连接中…',

    logout: '登出',
    music: '音乐',
    language: 'English',

    auth_required: '请先登录',
    bad_username: '用户名需 2–16 位字母、数字或中文',
    short_password: '密码至少 4 位',
    name_taken: '该用户名已被使用',
    bad_color: '颜色格式无效',
    bad_credentials: '用户名或密码错误',
    needs_reset: '密码已被管理员清除，请设置新密码',
    reset_not_allowed: '该账号未开放重设密码',
    closed: '本轮已封盘',
    bad_target: '无效的下注目标',
    bad_amount: '金额无效',
    insufficient: '余额不足，请联系管理员充值',
    bad_range: '无效的时间范围',
    admin_required: '需要管理员权限',
    admin_protected: '不能清除其他管理员的密码',
    user_not_found: '找不到该用户 ID',
    negative_balance: '扣款后余额会为负',
  },

  en: {
    subtitle: '– Multiplayer –',
    single: 'Single Player',
    multi: 'Multiplayer',

    login: 'Login',
    register: 'Register',
    reset: 'Reset password',
    username: 'Username',
    password: 'Password',
    newPassword: 'New password',
    favColor: 'Favourite colour',
    submitLogin: 'Login',
    submitRegister: 'Register & play',
    submitReset: 'Set password & login',
    authHint: 'Every player gets their own ID. Out of coins? Ask the admin for a top-up.',
    forgot: 'Forgot password?',
    forgotHelp: 'Ask the admin to clear it, then set a new one here.',

    timeLeft: 'Time Left:',
    seconds: 'seconds',
    coinsLabel: 'Coins:',
    playerLabel: 'Player:',
    coinsUnit: 'coins',

    leaderboard: 'Leaderboard',
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    lbEmpty: 'No results in this period yet',
    rounds: 'rounds',

    viewRecords: 'View Records',
    pastResults: 'Past Results',
    allPlayers: 'all players',
    close: 'Close',
    noRecords: 'No records yet',
    plate: 'PLATE',

    placeBets: 'Place your bets!',
    rolling: 'Rolling…',
    nextRound: 'Next round is starting...',
    connecting: 'Connecting…',

    logout: 'Log out',
    music: 'Music',
    language: '中文',

    auth_required: 'Please log in first',
    bad_username: 'Username must be 2–16 letters, digits or Chinese characters',
    short_password: 'Password must be at least 4 characters',
    name_taken: 'That username is already taken',
    bad_color: 'Invalid colour',
    bad_credentials: 'Wrong username or password',
    needs_reset: 'The admin cleared your password — please set a new one',
    reset_not_allowed: 'This account is not open for a password reset',
    closed: 'Betting is closed for this round',
    bad_target: 'Invalid bet target',
    bad_amount: 'Invalid amount',
    insufficient: 'Not enough coins — ask the admin for a top-up',
    bad_range: 'Invalid time range',
    admin_required: 'Admin permission required',
    admin_protected: "Can't clear another admin's password",
    user_not_found: 'No user with that ID',
    negative_balance: 'That would put the balance below zero',
  },
};

const LANG_KEY = 'dww.lang';

// Default to Chinese unless the browser clearly prefers English.
let current = localStorage.getItem(LANG_KEY)
  ?? (navigator.language?.startsWith('zh') === false ? 'en' : 'zh');

export const lang = () => current;

export function setLang(next) {
  current = next;
  localStorage.setItem(LANG_KEY, next);
  document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
  applyStatic();
}

export const toggleLang = () => setLang(current === 'zh' ? 'en' : 'zh');

// Falls back to the key itself so a missing string is obvious, not blank.
export const t = (key) => STRINGS[current][key] ?? STRINGS.zh[key] ?? key;

// Translates an API failure: prefer our own copy for the code, fall back to
// whatever text the server sent.
export const tError = (error) =>
  (error?.code && STRINGS[current][error.code]) || error?.message || t('bad_amount');

// Any element with data-i18n="key" gets its text swapped on language change.
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll('[data-i18n-title]')) {
    el.title = t(el.dataset.i18nTitle);
  }
}
