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
    adminPage: '管理后台',
    requestTopup: '申请充值',
    requestPrompt: '要申请多少金币？',
    requestSent: '申请已提交，等待管理员审批',
    requestWaiting: '⏳ 待审批：{amount} 金币',
    request_pending: '你已有一个待审批的申请',

    topupTitle: '充值',
    topupSubtitle: '选择金额，提交给管理员审批',
    chooseAmount: '选择充值金额',
    confirmRequest: '申请 {amount} 金币？提交后需要管理员审批。',
    myRequests: '我的申请记录',
    pendingTitle: '等待管理员审批',
    pendingHelp: '审批通过后金币会自动加入你的账户。',
    statusPending: '待审批',
    statusApproved: '已批准',
    statusRejected: '已拒绝',
    backToGame: '返回游戏',
    pleaseLogin: '请先登录',

    panel: '面板',
    playersIn: '本轮参与：',
    peopleUnit: '人',
    myRecords: '我的记录',
    birthday: '生日',
    edit: '编辑资料',
    save: '保存',
    cancel: '取消',
    refresh: '刷新',
    top3: '本局前三名',
    waiting: '等待中…',
    dashboard: '我的数据',
    totalSpend: '总下注',
    totalIncome: '总收入',
    netProfit: '净盈亏',
    totalTopup: '总充值',
    roundsPlayed: '已玩 {rounds} 局 · 赢 {wins} · 输 {losses}',
    gameRecords: '游戏记录',
    winRecords: '赢的记录',
    loseRecords: '输的记录',
    topupRecords: '充值记录',
    notSet: '未设置',
    saved: '已保存',
    bad_birthday: '生日格式需为 YYYY-MM-DD',

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
    adminPage: 'Admin',
    requestTopup: 'Request top-up',
    requestPrompt: 'How many coins would you like to request?',
    requestSent: 'Request sent — waiting for the admin to approve',
    requestWaiting: '⏳ Pending: {amount} coins',
    request_pending: 'You already have a request awaiting approval',

    topupTitle: 'Top-up',
    topupSubtitle: 'Pick an amount — the admin approves it',
    chooseAmount: 'Choose an amount',
    confirmRequest: 'Request {amount} coins? The admin has to approve it.',
    myRequests: 'My requests',
    pendingTitle: 'Waiting for admin approval',
    pendingHelp: 'Coins are added automatically once approved.',
    statusPending: 'Pending',
    statusApproved: 'Approved',
    statusRejected: 'Rejected',
    backToGame: 'Back to game',
    pleaseLogin: 'Please log in first',

    panel: 'Panel',
    playersIn: 'Players in:',
    peopleUnit: '',
    myRecords: 'My Records',
    birthday: 'Birthday',
    edit: 'Edit profile',
    save: 'Save',
    cancel: 'Cancel',
    refresh: 'Refresh',
    top3: 'This round · Top 3',
    waiting: 'Waiting…',
    dashboard: 'My stats',
    totalSpend: 'Total spend',
    totalIncome: 'Total income',
    netProfit: 'Net profit',
    totalTopup: 'Total top-ups',
    roundsPlayed: '{rounds} rounds · {wins} won · {losses} lost',
    gameRecords: 'Game records',
    winRecords: 'Wins',
    loseRecords: 'Losses',
    topupRecords: 'Top-ups',
    notSet: 'Not set',
    saved: 'Saved',
    bad_birthday: 'Birthday must be YYYY-MM-DD',

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
