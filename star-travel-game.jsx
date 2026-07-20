import React, { useState, useRef, useEffect } from "react";

// ------------------------------------------------------------------
// Reward tables — EXACT probabilities from the in-app rules screen
// ------------------------------------------------------------------
const STAR_REWARDS = [
  { gold: 5, prob: 0.58641 },
  { gold: 10, prob: 0.21 },
  { gold: 50, prob: 0.09119 },
  { gold: 166, prob: 0.05961 },
  { gold: 500, prob: 0.03649 },
  { gold: 2660, prob: 0.0119 },
  { gold: 5000, prob: 0.0035 },
  { gold: 6660, prob: 0.00075 },
  { gold: 28880, prob: 0.00015 },
];
const MOON_REWARDS = [
  { gold: 10, prob: 0.482 },
  { gold: 50, prob: 0.2001 },
  { gold: 100, prob: 0.1202 },
  { gold: 266, prob: 0.1 },
  { gold: 500, prob: 0.07 },
  { gold: 5000, prob: 0.02 },
  { gold: 6660, prob: 0.0067 },
  { gold: 33440, prob: 0.00075 },
  { gold: 120000, prob: 0.00025 },
];

const STAR_COST = 100;
const MOON_COST = 300;
const STAR_PACKS = [{ qty: 1, gold: 100 }, { qty: 10, gold: 1000 }, { qty: 30, gold: 3000 }];
const MOON_PACKS = [{ qty: 1, gold: 300 }, { qty: 10, gold: 3000 }, { qty: 30, gold: 9000 }];

// Each prize value is a named GIFT with its own emoji ------------------
const GIFTS = {
  5: { emoji: "🍬", zh: "星星糖", en: "Star Candy" },
  10: { emoji: "🌸", zh: "櫻花", en: "Blossom" },
  50: { emoji: "🍀", zh: "四葉草", en: "Clover" },
  100: { emoji: "🍩", zh: "甜甜圈", en: "Donut" },
  166: { emoji: "🎀", zh: "蝴蝶結", en: "Ribbon" },
  266: { emoji: "🎈", zh: "氣球", en: "Balloon" },
  500: { emoji: "💐", zh: "花束", en: "Bouquet" },
  2660: { emoji: "🎂", zh: "夢幻蛋糕", en: "Dream Cake" },
  5000: { emoji: "💎", zh: "鑽石", en: "Diamond" },
  6660: { emoji: "🌟", zh: "耀星", en: "Bright Star" },
  28880: { emoji: "👑", zh: "星耀皇冠", en: "Star Crown" },
  33440: { emoji: "🏆", zh: "榮耀獎盃", en: "Glory Trophy" },
  120000: { emoji: "🚀", zh: "夢想星艦", en: "Dream Starship" },
  // --- wishing-pool target gifts (crafted in the Miracle Wishing Pool) ---
  3000: { emoji: "🦀", zh: "彩·巨蟹座", en: "Cancer · Colour" },
  5200: { emoji: "💞", zh: "心動 520", en: "Heartbeat 520" },
  9990: { emoji: "🌌", zh: "幻·巨蟹座", en: "Cancer · Illusion" },
  18800: { emoji: "🔥", zh: "麻辣鮮師", en: "Spicy Master" },
  28800: { emoji: "🦄", zh: "夢幻獨角獸", en: "Dream Unicorn" },
  68800: { emoji: "🐉", zh: "祥龍獻瑞", en: "Auspicious Dragon" },
  99000: { emoji: "🏰", zh: "夢幻城堡", en: "Dream Castle" },
};

// Wishing-pool crafting targets + the success-rate curve
const WISH_TARGETS = [3000, 5200, 9990, 18800, 28800, 68800, 99000];
const WISH_RATIO = 6200 / 5200; // materials worth target×this = 100% (5200 -> 6200)
const wishFullCost = (v) => Math.round((v * WISH_RATIO) / 10) * 10;

// Rarity: >28880 = gold, >=10000 = silver, else normal
function tierOf(g) {
  if (g > 28880) return "gold";
  if (g >= 10000) return "silver";
  return "normal";
}
function frameStyle(tier) {
  if (tier === "gold")
    return { border: "2px solid #ffd84d", boxShadow: "0 0 14px #ffd84d, inset 0 0 10px rgba(255,216,77,.45)", background: "linear-gradient(180deg, rgba(255,216,77,.25), rgba(120,80,0,.3))" };
  if (tier === "silver")
    return { border: "2px solid #dbe3f2", boxShadow: "0 0 12px #dbe3f2, inset 0 0 10px rgba(219,227,242,.4)", background: "linear-gradient(180deg, rgba(219,227,242,.24), rgba(70,80,100,.32))" };
  return { border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.06)" };
}

// Room members you can gift to --------------------------------------
const MEMBERS = [
  { id: "host", name: "ω · HooYa", avatar: "🧑", seat_zh: "房主", seat_en: "Host" },
  { id: "peach", name: "Peach", avatar: "🍑", seat_zh: "1號麥", seat_en: "Seat 1" },
  { id: "luna", name: "小月亮 Luna", avatar: "🌙", seat_zh: "2號麥", seat_en: "Seat 2" },
  { id: "star", name: "星辰 Star", avatar: "⭐", seat_zh: "3號麥", seat_en: "Seat 3" },
  { id: "kitty", name: "別吵吵", avatar: "🐱", seat_zh: "4號麥", seat_en: "Seat 4" },
];

// i18n --------------------------------------------------------------
const T = {
  zh: {
    room: "月月庇护所 💕", coins: "金幣", starGame: "星際旅行", moonGame: "太空環游",
    star: "星星", moon: "月亮", travel: "旅行", voyage: "環游",
    toMoon: "› 太空環游", toStar: "‹ 星際旅行", going: "出發中…",
    rules: "規則", bag: "背包", exchange: "兌換材料", curGold: "當前金幣", topup: "充值 (demo)",
    starSec: "星際旅行 · 星星", moonSec: "太空環游 · 月亮",
    noGold: "金幣不足", noStar: "星星不足，去兌換", noMoon: "月亮不足，去兌換",
    won: (n) => `本次獲得 ${n} 份禮物`, toBag: "已放入背包", again: "再抽一次", totalValue: "本次總價值",
    give: "贈送", giveTitle: "選擇贈送對象", sent: (g, q, name, got) => `已將 ${q}×「${g}」贈送給 ${name}，對方獲得 🪙${fmt(got)}`,
    qty: "數量", recipientGets: "對方獲得 (70%)", appCut: "平臺抽成 (30%)", received: "已收到", appProfit: "平臺收益", max: "最大",
    wish: "許願池", wishTitle: "奇蹟許願池", addMat: "添加材料", matValue: "本次消耗材料價值", successRate: "本次許願成功概率",
    confirmWish: "確認許願", myRecords: "我的記錄", selectTarget: "選擇許願目標", pickMat: "從背包選擇材料",
    need100: (v) => `100% 需要材料價值 🪙${fmt(v)}`, wishOk: "許願成功！", wishFail: "許願失敗…材料已消耗",
    needMat: "請先添加材料", needTarget: "請先選擇目標", emptyLog: "還沒有許願記錄", ok: "成功", fail: "失敗", done: "完成", clearMat: "清空", own: "擁有",
    emptyBag: "背包空空，快去航行抽禮物吧～", bagValue: "背包總價值",
    perTravel: (v, c) => `每次${v}消耗 1 個道具（≈ ${c} 金幣），隨機獲得禮物`,
    rulesTitle: "航行說明 · 概率", rulesIntro: "以下為官方公示概率，數值即禮物價值（金幣）：",
    starProb: "星際旅行 獎勵概率", moonProb: "太空環游 獎勵概率",
    avg: (ev, c) => `每次消耗 ${c} 金幣 · 平均價值 ≈ ${Math.round(ev)} 金幣（${((ev / c) * 100).toFixed(1)}%）`,
    congrats: (name) => `恭喜 ${name} 在航行中收獲了`, you: "你",
    silver: "白銀", gold: "黃金", disclaimer: "本作品為復刻教學 demo，金幣與禮物均為虛擬、無真實價值，不涉及任何充值或提現。",
    sys: "系統通知：平臺倡導綠色交友，請警惕詐騙。本頁為模擬 demo。",
  },
  en: {
    room: "Yueyue Sanctuary 💕", coins: "coins", starGame: "Interstellar Travel", moonGame: "Space Voyage",
    star: "Star", moon: "Moon", travel: "Travel", voyage: "Voyage",
    toMoon: "› Space Voyage", toStar: "‹ Interstellar", going: "Launching…",
    rules: "Rules", bag: "Backpack", exchange: "Exchange", curGold: "Your coins", topup: "Top up (demo)",
    starSec: "Interstellar · Stars", moonSec: "Space Voyage · Moons",
    noGold: "Not enough coins", noStar: "Not enough stars — go exchange", noMoon: "Not enough moons — go exchange",
    won: (n) => `You won ${n} gift${n > 1 ? "s" : ""}`, toBag: "Added to backpack", again: "Spin again", totalValue: "Total value",
    give: "Give", giveTitle: "Choose who to give to", sent: (g, q, name, got) => `Sent ${q}× "${g}" to ${name} — they got 🪙${fmt(got)}`,
    qty: "Quantity", recipientGets: "They receive (70%)", appCut: "Platform fee (30%)", received: "Received", appProfit: "Platform earnings", max: "Max",
    wish: "Wishing Pool", wishTitle: "Miracle Wishing Pool", addMat: "Add material", matValue: "Materials value", successRate: "Success chance",
    confirmWish: "Confirm wish", myRecords: "My records", selectTarget: "Choose a target", pickMat: "Pick materials from backpack",
    need100: (v) => `100% needs 🪙${fmt(v)} of materials`, wishOk: "Wish granted!", wishFail: "Wish failed — materials consumed",
    needMat: "Add materials first", needTarget: "Choose a target first", emptyLog: "No wish records yet", ok: "Success", fail: "Failed", done: "Done", clearMat: "Clear", own: "Own",
    emptyBag: "Your backpack is empty — go spin for gifts!", bagValue: "Backpack value",
    perTravel: (v, c) => `Each ${v.toLowerCase()} spends 1 item (≈ ${c} coins) for a random gift`,
    rulesTitle: "Voyage Rules · Odds", rulesIntro: "Official published odds. Each value is the gift's coin worth:",
    starProb: "Interstellar Travel odds", moonProb: "Space Voyage odds",
    avg: (ev, c) => `Costs ${c} coins · avg value ≈ ${Math.round(ev)} coins (${((ev / c) * 100).toFixed(1)}%)`,
    congrats: (name) => `Congrats ${name} — won on a voyage:`, you: "You",
    silver: "SILVER", gold: "GOLD", disclaimer: "This is a fan-made teaching demo. Coins and gifts are virtual with no real value — no payment or cash-out.",
    sys: "Notice: this platform promotes safe socializing. Beware of scams. This page is a demo.",
  },
};

function weightedPick(rewards) {
  const r = Math.random();
  let acc = 0;
  for (const x of rewards) { acc += x.prob; if (r <= acc) return x.gold; }
  return rewards[rewards.length - 1].gold;
}
const fmt = (n) => n.toLocaleString("en-US");

// ---- little visuals ----------------------------------------------
function StarIcon({ size = 30, color = "#5fffc7" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ filter: `drop-shadow(0 0 6px ${color})` }}>
      <path d="M12 2l2.9 6.2 6.8.8-5 4.6 1.3 6.7L12 17.8 5.9 20.9 7.2 14.2l-5-4.6 6.8-.8z" fill={color} stroke="#fff" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}
function MoonIcon({ size = 30, color = "#ff5f8f" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ filter: `drop-shadow(0 0 6px ${color})` }}>
      <path d="M16.5 3.5A9 9 0 1020.5 15 7.5 7.5 0 0116.5 3.5z" fill={color} stroke="#fff" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}
function Rabbit({ spinning }) {
  return (
    <div style={{ position: "relative", width: 220, height: 210, margin: "0 auto", animation: spinning ? "wobble .5s ease-in-out infinite" : "float 3s ease-in-out infinite" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "radial-gradient(circle, rgba(120,220,255,.35), transparent 65%)", filter: "blur(4px)" }} />
      <svg viewBox="0 0 200 200" width="220" height="210">
        <ellipse cx="100" cy="140" rx="72" ry="24" fill="#3a2b6e" />
        <ellipse cx="100" cy="134" rx="72" ry="24" fill="url(#s)" stroke="#7ef0ff" strokeWidth="2" />
        <ellipse cx="100" cy="120" rx="46" ry="34" fill="rgba(150,230,255,.25)" stroke="#7ef0ff" strokeWidth="2" />
        <ellipse cx="100" cy="112" rx="26" ry="24" fill="#fdf3ff" />
        <ellipse cx="88" cy="80" rx="7" ry="20" fill="#fdf3ff" transform="rotate(-12 88 80)" />
        <ellipse cx="112" cy="80" rx="7" ry="20" fill="#fdf3ff" transform="rotate(12 112 80)" />
        <ellipse cx="88" cy="82" rx="3" ry="12" fill="#ffb6d5" transform="rotate(-12 88 82)" />
        <ellipse cx="112" cy="82" rx="3" ry="12" fill="#ffb6d5" transform="rotate(12 112 82)" />
        <circle cx="92" cy="110" r="3" fill="#4a3a6a" /><circle cx="108" cy="110" r="3" fill="#4a3a6a" />
        <circle cx="86" cy="116" r="4" fill="#ffc2dd" /><circle cx="114" cy="116" r="4" fill="#ffc2dd" />
        <defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#8f6bff" /><stop offset="100%" stopColor="#4bd6ff" /></linearGradient></defs>
      </svg>
      <div style={{ position: "absolute", top: 14, left: 74, animation: "twinkle 1.6s ease-in-out infinite" }}><StarIcon size={26} color="#ffe14d" /></div>
    </div>
  );
}
function TierRibbon({ tier, t }) {
  const c = tier === "gold" ? "#ffd84d" : "#dbe3f2";
  return (
    <span style={{ position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)", fontSize: 9, fontWeight: 900, letterSpacing: 1, color: "#1a0836", background: c, padding: "1px 8px", borderRadius: 999, boxShadow: `0 0 8px ${c}` }}>
      {tier === "gold" ? t.gold : t.silver}
    </span>
  );
}
function GiftChip({ gold, lang, t, big, count }) {
  const m = GIFTS[gold], tier = tierOf(gold), fr = frameStyle(tier);
  return (
    <div style={{ position: "relative", ...fr, borderRadius: 14, padding: big ? "14px 10px 10px" : "10px 8px 8px", textAlign: "center", minWidth: big ? 92 : 74 }}>
      {tier !== "normal" && <TierRibbon tier={tier} t={t} />}
      {count > 1 && <span style={{ position: "absolute", top: 4, right: 6, fontSize: 11, fontWeight: 800, background: "rgba(0,0,0,.5)", padding: "1px 6px", borderRadius: 8 }}>×{count}</span>}
      <div style={{ fontSize: big ? 40 : 28, lineHeight: 1 }}>{m.emoji}</div>
      <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4 }}>{lang === "zh" ? m.zh : m.en}</div>
      <div style={{ fontSize: 11, opacity: 0.9 }}>🪙 {fmt(gold)}</div>
    </div>
  );
}

// ------------------------------------------------------------------
export default function App() {
  const [lang, setLang] = useState("zh");
  const t = T[lang];
  const [gold, setGold] = useState(30000);
  const [stars, setStars] = useState(0);
  const [moons, setMoons] = useState(0);
  const [bag, setBag] = useState({}); // { [goldValue]: count }
  const [received, setReceived] = useState({}); // { [memberId]: coins received }
  const [appProfit, setAppProfit] = useState(0); // 30% platform cut collected
  const [wishLog, setWishLog] = useState([]); // wishing-pool attempt history
  const [mode, setMode] = useState("star");
  const [spinning, setSpinning] = useState(false);
  const [results, setResults] = useState(null);
  const [panel, setPanel] = useState(null); // shop | rules | bag
  const [flash, setFlash] = useState(null);
  const [banner, setBanner] = useState(null);
  const spinTimer = useRef(null);
  useEffect(() => () => clearTimeout(spinTimer.current), []);

  // Keep the game's gold in lock-step with the real account balance.
  const authTok = (typeof localStorage !== "undefined" && localStorage.getItem("dww.token")) || "";
  const syncedGold = useRef(null);
  useEffect(() => {
    if (!authTok) return;
    fetch("/api/state", { headers: { authorization: "Bearer " + authTok } })
      .then((r) => r.json())
      .then((d) => { if (d && d.me) { syncedGold.current = d.me.coins; setGold(d.me.coins); } })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!authTok || syncedGold.current === null) return;
    const delta = gold - syncedGold.current;
    if (delta === 0) return;
    syncedGold.current = gold;
    fetch("/api/coins/adjust", {
      method: "POST",
      headers: { authorization: "Bearer " + authTok, "content-type": "application/json" },
      body: JSON.stringify({ delta }),
    }).catch(() => {});
  }, [gold]);

  // The bag is the shared server inventory (same as the ChatRoom bag).
  // Load it on open, and again whenever the parent tab re-focuses this game,
  // so gifting in the ChatRoom is reflected here.
  function loadBag() {
    if (!authTok) return;
    fetch("/api/bag", { headers: { authorization: "Bearer " + authTok } })
      .then((r) => r.json())
      .then((d) => {
        const b = {};
        (d.items || []).forEach((it) => { b[it.key] = it.count; });
        setBag(b);
      })
      .catch(() => {});
  }
  // Real ChatRoom people you can gift to (seated + online), not fake members.
  const [members, setMembers] = useState([]);
  function loadMembers() {
    if (!authTok) return;
    fetch("/api/room", { headers: { authorization: "Bearer " + authTok } })
      .then((r) => r.json())
      .then((d) => {
        const seen = new Set(), list = [];
        (d.seats || []).filter(Boolean).forEach((s) => { if (!seen.has(s.userId)) { seen.add(s.userId); list.push(s); } });
        (d.online || []).forEach((o) => { if (!seen.has(o.userId)) { seen.add(o.userId); list.push(o); } });
        setMembers(list);
      })
      .catch(() => {});
  }
  useEffect(() => {
    loadBag(); loadMembers();
    const onMsg = (e) => { if (e && e.data === "sync-bag") { loadBag(); loadMembers(); } };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Consume bag items on the server (star gift / wishing pool materials).
  const bagRemove = (key, qty) => {
    if (!authTok) return;
    fetch("/api/bag/remove", {
      method: "POST",
      headers: { authorization: "Bearer " + authTok, "content-type": "application/json" },
      body: JSON.stringify({ key: String(key), qty }),
    }).catch(() => {});
  };
  const bagAdd = (key, qty) => {
    if (!authTok) return;
    fetch("/api/bag/add", {
      method: "POST",
      headers: { authorization: "Bearer " + authTok, "content-type": "application/json" },
      body: JSON.stringify({ key: String(key), emoji: GIFTS[key].emoji, name: GIFTS[key].zh, value: Number(key), qty }),
    }).catch(() => {});
  };

  const isStar = mode === "star";
  const cfg = isStar
    ? { name: t.starGame, rewards: STAR_REWARDS, cur: stars, setCur: setStars, cost: STAR_COST, Icon: StarIcon, color: "#5fffc7", verb: t.travel, curName: t.star }
    : { name: t.moonGame, rewards: MOON_REWARDS, cur: moons, setCur: setMoons, cost: MOON_COST, Icon: MoonIcon, color: "#ff5f8f", verb: t.voyage, curName: t.moon };

  const bagCount = Object.values(bag).reduce((a, b) => a + b, 0);
  const bagValue = Object.entries(bag).reduce((a, [g, c]) => a + Number(g) * c, 0);

  const showFlash = (m) => { setFlash(m); setTimeout(() => setFlash(null), 1800); };

  function buy(kind, pack) {
    if (gold < pack.gold) return showFlash(t.noGold);
    setGold((g) => g - pack.gold);
    if (kind === "star") setStars((s) => s + pack.qty); else setMoons((m) => m + pack.qty);
    showFlash(`+${pack.qty} ${kind === "star" ? t.star : t.moon}`);
  }

  function travel(count) {
    if (spinning) return;
    if (cfg.cur < count) { showFlash(isStar ? t.noStar : t.noMoon); setPanel("shop"); return; }
    cfg.setCur((c) => c - count);
    setSpinning(true); setResults(null);
    spinTimer.current = setTimeout(() => {
      const items = Array.from({ length: count }, () => weightedPick(cfg.rewards));
      setBag((b) => { const n = { ...b }; items.forEach((g) => (n[g] = (n[g] || 0) + 1)); return n; });
      // Record winnings into the server bag so they can be gifted in the room.
      if (authTok) {
        const counts = {};
        items.forEach((g) => (counts[g] = (counts[g] || 0) + 1));
        Object.entries(counts).forEach(([g, qty]) => {
          fetch("/api/bag/add", {
            method: "POST",
            headers: { authorization: "Bearer " + authTok, "content-type": "application/json" },
            body: JSON.stringify({ key: String(g), emoji: GIFTS[g].emoji, name: GIFTS[g].zh, value: Number(g), qty }),
          }).catch(() => {});
        });
        // Announce big wins (5000+) to everyone, everywhere.
        items.filter((g) => Number(g) >= 5000).forEach((g) => {
          fetch("/api/star/announce", {
            method: "POST",
            headers: { authorization: "Bearer " + authTok, "content-type": "application/json" },
            body: JSON.stringify({ emoji: GIFTS[g].emoji, name: GIFTS[g].zh, value: Number(g) }),
          }).catch(() => {});
        });
      }
      setResults({ items, mode });
      const big = items.filter((g) => tierOf(g) !== "normal");
      if (big.length) { const mx = Math.max(...big); setBanner({ gold: mx }); setTimeout(() => setBanner(null), 5000); }
      setSpinning(false);
    }, 1500);
  }

  // Gift a bag item to a REAL ChatRoom user. Goes through the shared server
  // bag: it removes the item and credits the receiver 70% as coins, and shows
  // in the ChatRoom feed — fully synced.
  function gift(goldValue, member, qty) {
    if (!authTok || !member?.userId) return;
    const gname = lang === "zh" ? GIFTS[goldValue].zh : GIFTS[goldValue].en;
    const toUser = Math.round(goldValue * qty * 0.7);
    fetch("/api/bag/give", {
      method: "POST",
      headers: { authorization: "Bearer " + authTok, "content-type": "application/json" },
      body: JSON.stringify({ toUserId: member.userId, key: String(goldValue), qty }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) { loadBag(); showFlash(t.sent(gname, qty, member.username, toUser)); }
        else showFlash(res.error || "✗");
      })
      .catch(() => {});
  }

  // Wishing pool: pledge materials (from bag) toward a target; roll success.
  function doWish(target, materials) {
    const materialValue = Object.entries(materials).reduce((a, [g, c]) => a + Number(g) * c, 0);
    const fullCost = wishFullCost(target);
    const prob = Math.min(1, materialValue / fullCost);
    const success = Math.random() < prob;
    setBag((b) => {
      const n = { ...b };
      Object.entries(materials).forEach(([g, c]) => { n[g] = (n[g] || 0) - c; if (n[g] <= 0) delete n[g]; });
      if (success) n[target] = (n[target] || 0) + 1;
      return n;
    });
    // Sync the combine to the shared server bag: materials leave, and on
    // success the combined item is added (so it shows in the ChatRoom bag and
    // can be gifted to others).
    Object.entries(materials).forEach(([g, c]) => bagRemove(g, c));
    if (success) bagAdd(target, 1);
    // Failed materials are lost to the house; on success the over-pledge margin is the house cut.
    setAppProfit((p) => p + (success ? Math.max(0, materialValue - target) : materialValue));
    setWishLog((l) => [{ target, success, materialValue, prob, ts: Date.now() }, ...l].slice(0, 40));
    if (success && tierOf(target) !== "normal") { setBanner({ gold: target }); setTimeout(() => setBanner(null), 5000); }
    return { success, target, materialValue, prob };
  }

  return (
    <div style={{ fontFamily: "'PingFang SC','Microsoft YaHei','Segoe UI',sans-serif", minHeight: "100vh", background: "radial-gradient(120% 80% at 50% 0%, #15663d 0%, #0a3a24 55%, #04160e 100%)", color: "#fff", display: "flex", justifyContent: "center", overflowX: "hidden" }}>
      <style>{`
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
        @keyframes wobble{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
        @keyframes twinkle{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.25)}}
        @keyframes pop{0%{transform:scale(.4);opacity:0}60%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}
        @keyframes slideup{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes bannerIn{0%{transform:translateY(-30px);opacity:0}15%,85%{transform:translateY(0);opacity:1}100%{transform:translateY(-30px);opacity:0}}
        @keyframes drift{from{background-position:0 0}to{background-position:0 -1000px}}
        .btn{transition:transform .08s;-webkit-tap-highlight-color:transparent}
        .btn:active{transform:translateY(2px) scale(.98)}
        .stars-bg{background-image:radial-gradient(1px 1px at 20px 30px,#fff,transparent),radial-gradient(1px 1px at 120px 80px,#cfe,transparent),radial-gradient(1px 1px at 200px 160px,#fff,transparent),radial-gradient(1px 1px at 300px 40px,#dbf,transparent),radial-gradient(1px 1px at 90px 240px,#fff,transparent);background-repeat:repeat;animation:drift 40s linear infinite}
      `}</style>

      <div style={{ width: "100%", maxWidth: 430, position: "relative", paddingBottom: 40 }}>
        <div className="stars-bg" style={{ position: "absolute", inset: 0, opacity: 0.5, pointerEvents: "none" }} />

        {/* wallet chips */}
        <div style={{ position: "relative", display: "flex", gap: 8, padding: "16px 18px 0" }}>
          <div style={chip("#5fffc7")} onClick={() => setPanel("shop")}><StarIcon size={18} /><b>{stars}</b><span style={{ opacity: 0.7, fontSize: 11 }}>{t.star}</span><span style={{ marginLeft: "auto", fontSize: 17 }}>＋</span></div>
          <div style={chip("#ff5f8f")} onClick={() => setPanel("shop")}><MoonIcon size={18} /><b>{moons}</b><span style={{ opacity: 0.7, fontSize: 11 }}>{t.moon}</span><span style={{ marginLeft: "auto", fontSize: 17 }}>＋</span></div>
          <div style={chip("#ffd84d")} onClick={() => setPanel("bag")}><span style={{ fontSize: 16 }}>🎒</span><b>{bagCount}</b><span style={{ opacity: 0.7, fontSize: 11 }}>{t.bag}</span></div>
        </div>

        {/* game stage */}
        <div style={{ position: "relative", margin: "16px 14px 0" }}>
          <div style={{ position: "relative", borderRadius: 22, padding: "18px 16px 20px", background: "linear-gradient(180deg, rgba(18,86,54,.92), rgba(8,42,28,.95))", border: `2px solid ${cfg.color}`, boxShadow: `0 0 18px ${cfg.color}55, inset 0 0 30px rgba(0,0,0,.4)` }}>
            <div style={{ textAlign: "center", position: "relative" }}>
              <div style={{ display: "inline-block", fontWeight: 900, fontSize: 25, letterSpacing: 2, padding: "4px 22px", color: "#fff", textShadow: `0 0 10px ${cfg.color}, 0 2px 0 #6a3bbf`, background: "linear-gradient(90deg, rgba(255,80,230,.25), rgba(80,200,255,.25))", borderRadius: 999, border: `1px solid ${cfg.color}88` }}>{cfg.name}</div>
              <button className="btn" onClick={() => setMode(isStar ? "moon" : "star")}
                style={{ position: "absolute", right: -6, top: 40, writingMode: lang === "zh" ? "vertical-rl" : "horizontal-tb", padding: lang === "zh" ? "12px 6px" : "8px 8px", fontWeight: 800, fontSize: 12.5, letterSpacing: lang === "zh" ? 3 : 0, color: "#fff", background: `linear-gradient(180deg, ${isStar ? "#ff5f8f" : "#5fffc7"}, rgba(0,0,0,.2))`, border: "none", borderRadius: lang === "zh" ? "12px 0 0 12px" : "10px", cursor: "pointer", boxShadow: `0 0 12px ${isStar ? "#ff5f8f" : "#5fffc7"}`, maxWidth: lang === "zh" ? "auto" : 90, lineHeight: 1.2 }}>
                {isStar ? t.toMoon : t.toStar}
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
              <cfg.Icon size={24} color={cfg.color} />
              <span style={{ fontWeight: 800, fontSize: 19 }}>{cfg.cur}</span>
              <button className="btn" onClick={() => setPanel("rules")} style={pill}>📜 {t.rules}</button>
              <button className="btn" onClick={() => setPanel("bag")} style={pill}>🎒 {t.bag}</button>
            </div>

            <div style={{ position: "relative", minHeight: 236, marginTop: 4 }}>
              {!results ? <Rabbit spinning={spinning} /> : <ResultView results={results} lang={lang} t={t} onClose={() => setResults(null)} onOpenBag={() => { setResults(null); setPanel("bag"); }} />}
              {spinning && <div style={{ textAlign: "center", fontWeight: 800, letterSpacing: 3, marginTop: -8, color: cfg.color }}>{t.going}</div>}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 8 }}>
              {[1, 10, 30].map((n) => (
                <button key={n} className="btn" disabled={spinning} onClick={() => travel(n)}
                  style={{ padding: "13px 4px", fontWeight: 800, fontSize: 14, color: "#fff", border: `1.5px solid ${cfg.color}`, borderRadius: 14, cursor: spinning ? "default" : "pointer", opacity: spinning ? 0.5 : 1, background: "linear-gradient(180deg, #d24bff, #7a2bd6)", boxShadow: `0 0 12px ${cfg.color}66, inset 0 -3px 6px rgba(0,0,0,.3)`, lineHeight: 1.25 }}>
                  {lang === "zh" ? `${cfg.verb}${n}次` : `${cfg.verb} ×${n}`}
                  <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.85, marginTop: 2, display: "flex", justifyContent: "center", alignItems: "center", gap: 3 }}>{n} <cfg.Icon size={12} color={cfg.color} /></div>
                </button>
              ))}
            </div>
            <div style={{ textAlign: "center", fontSize: 10.5, opacity: 0.6, marginTop: 8 }}>{t.perTravel(cfg.verb, cfg.cost)}</div>
          </div>
        </div>

        {/* wishing-pool entry */}
        <button className="btn" onClick={() => setPanel("wish")}
          style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "calc(100% - 28px)", margin: "14px 14px 0", padding: "13px 0", borderRadius: 16, border: "1.5px solid #ffe14d", background: "linear-gradient(90deg, rgba(14,74,46,.95), rgba(34,150,96,.95))", color: "#fff", fontWeight: 900, fontSize: 16, letterSpacing: 1, cursor: "pointer", boxShadow: "0 0 16px rgba(255,225,77,.4)" }}>
          <span style={{ fontSize: 20 }}>🔮</span> {t.wishTitle} <span style={{ fontSize: 16 }}>✨</span>
        </button>

      </div>

      {/* big-win banner */}
      {banner && (
        <div style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 70, width: "92%", maxWidth: 410, animation: "bannerIn 5s ease forwards" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 999, background: "linear-gradient(90deg, rgba(14,74,46,.95), rgba(34,140,90,.95))", border: `1px solid ${tierOf(banner.gold) === "gold" ? "#ffd84d" : "#dbe3f2"}`, boxShadow: `0 0 16px ${tierOf(banner.gold) === "gold" ? "#ffd84d" : "#dbe3f2"}` }}>
            <span style={{ fontSize: 20 }}>🎉</span>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>{t.congrats(t.you)}</span>
            <span style={{ fontSize: 20 }}>{GIFTS[banner.gold].emoji}</span>
            <span style={{ fontWeight: 900, color: "#ffe14d" }}>{fmt(banner.gold)}</span>
          </div>
        </div>
      )}

      {flash && <div style={{ position: "fixed", top: 76, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,.82)", padding: "10px 22px", borderRadius: 999, fontWeight: 800, zIndex: 60, border: "1px solid rgba(255,255,255,.2)", animation: "pop .3s ease", maxWidth: "90%", textAlign: "center" }}>{flash}</div>}

      {panel === "shop" && <ShopPanel gold={gold} t={t} onBuy={buy} onClose={() => setPanel(null)} />}
      {panel === "rules" && <RulesPanel lang={lang} t={t} onClose={() => setPanel(null)} />}
      {panel === "bag" && <BagPanel bag={bag} bagValue={bagValue} members={members} lang={lang} t={t} onGift={gift} onClose={() => setPanel(null)} />}
      {panel === "wish" && <WishPanel bag={bag} wishLog={wishLog} lang={lang} t={t} onWish={doWish} onClose={() => setPanel(null)} />}
    </div>
  );
}

const chip = (c) => ({ flex: 1, display: "flex", alignItems: "center", gap: 5, padding: "8px 10px", borderRadius: 14, background: "rgba(255,255,255,.08)", border: `1px solid ${c}66`, cursor: "pointer", fontSize: 13 });
const pill = { background: "rgba(255,255,255,.12)", border: "none", color: "#fff", borderRadius: 10, padding: "6px 10px", fontSize: 12, cursor: "pointer" };

function ResultView({ results, lang, t, onClose, onOpenBag }) {
  const color = results.mode === "star" ? "#5fffc7" : "#ff5f8f";
  const total = results.items.reduce((a, b) => a + b, 0);
  const grouped = {};
  results.items.forEach((g) => (grouped[g] = (grouped[g] || 0) + 1));
  const rows = Object.entries(grouped)
    .map(([g, c]) => ({ gold: Number(g), count: c }))
    .sort((a, b) => b.gold - a.gold); // rarest / most valuable first
  const single = results.items.length === 1;
  return (
    <div style={{ animation: "pop .35s ease", textAlign: "center", paddingTop: 6 }}>
      <div style={{ fontSize: 13, fontWeight: 800, opacity: 0.9 }}>{t.won(results.items.length)}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color, textShadow: `0 0 14px ${color}`, margin: "1px 0 2px" }}>
        {t.totalValue}　🪙 {fmt(total)}
      </div>
      <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 8 }}>{t.toBag} 🎒</div>
      <div style={{ maxHeight: 150, overflowY: "auto", display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", padding: "6px" }}>
        {rows.map((r) => <GiftChip key={r.gold} gold={r.gold} count={r.count} lang={lang} t={t} big={single} />)}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
        <button className="btn" onClick={onClose} style={{ padding: "8px 22px", borderRadius: 999, border: `1px solid ${color}`, background: "rgba(0,0,0,.3)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{t.again}</button>
        <button className="btn" onClick={onOpenBag} style={{ padding: "8px 22px", borderRadius: 999, border: "1px solid #ffd84d", background: "rgba(0,0,0,.3)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>🎒 {t.bag}</button>
      </div>
    </div>
  );
}

function Sheet({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,.55)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 430, maxHeight: "84vh", overflowY: "auto", background: "linear-gradient(180deg,#124e35,#08281c)", borderTop: "2px solid #7ef0ff", borderRadius: "22px 22px 0 0", boxShadow: "0 0 30px #7ef0ff55", animation: "slideup .3s ease", padding: "18px 18px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", marginBottom: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 18, letterSpacing: 1 }}>{title}</div>
          <button onClick={onClose} style={{ position: "absolute", right: 0, background: "rgba(255,255,255,.12)", border: "none", color: "#fff", width: 30, height: 30, borderRadius: "50%", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ShopPanel({ gold, t, onBuy, onClose }) {
  const box = (kind, p, color, Icon) => (
    <button key={kind + p.qty} className="btn" onClick={() => onBuy(kind, p)} disabled={gold < p.gold}
      style={{ flex: 1, padding: "16px 6px", borderRadius: 16, border: `1.5px solid ${color}`, background: "linear-gradient(180deg, rgba(90,40,150,.6), rgba(40,16,74,.9))", color: "#fff", cursor: gold < p.gold ? "default" : "pointer", opacity: gold < p.gold ? 0.45 : 1, boxShadow: `0 0 10px ${color}44` }}>
      <div style={{ position: "relative", display: "inline-block" }}>
        <Icon size={42} color={color} />
        <span style={{ position: "absolute", top: -6, right: -22, fontSize: 12, fontWeight: 800, background: "rgba(0,0,0,.4)", padding: "1px 6px", borderRadius: 8 }}>×{p.qty}</span>
      </div>
      <div style={{ marginTop: 8, fontWeight: 800, fontSize: 14 }}>🪙 {fmt(p.gold)}</div>
    </button>
  );
  return (
    <Sheet title={t.exchange} onClose={onClose}>
      <div style={{ textAlign: "center", fontSize: 13, opacity: 0.75, marginBottom: 4 }}>{t.curGold}　🪙 {fmt(gold)}</div>
      <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8, fontWeight: 800 }}><StarIcon size={18} /> {t.starSec}</div>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>{STAR_PACKS.map((p) => box("star", p, "#5fffc7", StarIcon))}</div>
      <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 8, fontWeight: 800 }}><MoonIcon size={18} /> {t.moonSec}</div>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>{MOON_PACKS.map((p) => box("moon", p, "#ff5f8f", MoonIcon))}</div>
    </Sheet>
  );
}

function RulesPanel({ lang, t, onClose }) {
  const table = (title, rewards, cost, color) => {
    const ev = rewards.reduce((a, r) => a + r.gold * r.prob, 0);
    return (
      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontWeight: 800 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: color, boxShadow: `0 0 8px ${color}` }} />{title}
        </div>
        <div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${color}44` }}>
          {rewards.map((r, i) => {
            const tier = tierOf(r.gold);
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", fontSize: 13, background: tier !== "normal" ? frameStyle(tier).background : i % 2 ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.09)", borderLeft: tier !== "normal" ? `3px solid ${tier === "gold" ? "#ffd84d" : "#dbe3f2"}` : "3px solid transparent" }}>
                <span style={{ fontSize: 16 }}>{GIFTS[r.gold].emoji}</span>
                <span style={{ flex: 1 }}>{lang === "zh" ? GIFTS[r.gold].zh : GIFTS[r.gold].en} · 🪙 {fmt(r.gold)}</span>
                {tier !== "normal" && <span style={{ fontSize: 9, fontWeight: 900, color: "#1a0836", background: tier === "gold" ? "#ffd84d" : "#dbe3f2", padding: "1px 6px", borderRadius: 999 }}>{tier === "gold" ? t.gold : t.silver}</span>}
                <span style={{ opacity: 0.85, minWidth: 58, textAlign: "right" }}>{(r.prob * 100).toFixed(3)}%</span>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 11.5, opacity: 0.65, marginTop: 6 }}>{t.avg(ev, cost)}</div>
      </div>
    );
  };
  return (
    <Sheet title={t.rulesTitle} onClose={onClose}>
      <div style={{ fontSize: 12.5, opacity: 0.8, lineHeight: 1.6 }}>{t.rulesIntro}</div>
      {table(t.starProb, STAR_REWARDS, STAR_COST, "#5fffc7")}
      {table(t.moonProb, MOON_REWARDS, MOON_COST, "#ff5f8f")}
      <div style={{ fontSize: 11, opacity: 0.5, marginTop: 16, lineHeight: 1.5 }}>{t.disclaimer}</div>
    </Sheet>
  );
}

function BagPanel({ bag, bagValue, members, lang, t, onGift, onClose }) {
  const [giving, setGiving] = useState(null); // gold value being gifted
  const [qty, setQty] = useState(1);
  const entries = Object.entries(bag).map(([g, c]) => ({ gold: Number(g), count: c })).sort((a, b) => b.gold - a.gold);
  const openGive = (g) => { setGiving(g); setQty(1); };
  return (
    <Sheet title={`🎒 ${t.bag}`} onClose={onClose}>
      {entries.length === 0 ? (
        <div style={{ textAlign: "center", opacity: 0.6, padding: "40px 0" }}>{t.emptyBag}</div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "center", gap: 16, fontSize: 12.5, opacity: 0.85, marginBottom: 12 }}>
            <span>{t.bagValue}　🪙 {fmt(bagValue)}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            {entries.map(({ gold, count }) => (
              <div key={gold} style={{ position: "relative" }}>
                <div style={{ position: "relative", ...frameStyle(tierOf(gold)), borderRadius: 14, padding: "14px 6px 8px", textAlign: "center" }}>
                  {tierOf(gold) !== "normal" && <TierRibbon tier={tierOf(gold)} t={t} />}
                  <div style={{ fontSize: 34, lineHeight: 1 }}>{GIFTS[gold].emoji}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, marginTop: 3 }}>{lang === "zh" ? GIFTS[gold].zh : GIFTS[gold].en}</div>
                  <div style={{ fontSize: 10.5, opacity: 0.85 }}>🪙 {fmt(gold)}</div>
                  <span style={{ position: "absolute", top: 4, right: 6, fontSize: 11, fontWeight: 800, background: "rgba(0,0,0,.45)", padding: "1px 6px", borderRadius: 8 }}>×{count}</span>
                </div>
                <button className="btn" onClick={() => openGive(gold)} style={{ width: "100%", marginTop: 5, padding: "6px 0", borderRadius: 10, border: "1px solid #ffd84d", background: "linear-gradient(180deg,#ffcf4d,#ff9a3d)", color: "#08281c", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>🎁 {t.give}</button>
              </div>
            ))}
          </div>
        </>
      )}

      {giving != null && (() => {
        const maxQty = bag[giving] || 0;
        const q = Math.min(qty, maxQty);
        const totalVal = giving * q;
        const toUser = Math.round(totalVal * 0.7);
        const cut = totalVal - toUser;
        const stepBtn = { width: 34, height: 34, borderRadius: 10, border: "1px solid rgba(255,255,255,.3)", background: "rgba(255,255,255,.1)", color: "#fff", fontSize: 20, fontWeight: 800, cursor: "pointer" };
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 55, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.6)" }} onClick={() => setGiving(null)}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "90%", maxWidth: 370, maxHeight: "88vh", overflowY: "auto", background: "linear-gradient(180deg,#124e35,#08281c)", border: "2px solid #ffd84d", borderRadius: 18, padding: "18px 16px", boxShadow: "0 0 24px #ffd84d55" }}>
              <div style={{ textAlign: "center", fontWeight: 800, marginBottom: 8 }}>{t.giveTitle}</div>
              <div style={{ textAlign: "center", fontSize: 30, marginBottom: 10 }}>{GIFTS[giving].emoji} <span style={{ fontSize: 13, opacity: 0.8 }}>🪙 {fmt(giving)}</span></div>

              {/* quantity stepper */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 13, opacity: 0.8 }}>{t.qty}</span>
                <button className="btn" style={stepBtn} onClick={() => setQty((v) => Math.max(1, v - 1))}>−</button>
                <span style={{ minWidth: 34, textAlign: "center", fontWeight: 900, fontSize: 18 }}>{q}</span>
                <button className="btn" style={stepBtn} onClick={() => setQty((v) => Math.min(maxQty, v + 1))}>＋</button>
                <button className="btn" onClick={() => setQty(maxQty)} style={{ padding: "6px 12px", borderRadius: 10, border: "1px solid #ffd84d", background: "rgba(255,216,77,.15)", color: "#ffd84d", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>{t.max} ×{maxQty}</button>
              </div>

              {/* 70 / 30 breakdown */}
              <div style={{ borderRadius: 12, overflow: "hidden", marginBottom: 14, border: "1px solid rgba(255,255,255,.15)" }}>
                <div style={splitRow("rgba(255,255,255,.06)")}><span>{t.totalValue}</span><span style={{ fontWeight: 800 }}>🪙 {fmt(totalVal)}</span></div>
                <div style={splitRow("rgba(95,255,199,.14)")}><span style={{ color: "#5fffc7" }}>{t.recipientGets}</span><span style={{ fontWeight: 900, color: "#5fffc7" }}>🪙 {fmt(toUser)}</span></div>
                <div style={splitRow("rgba(255,216,77,.12)")}><span style={{ color: "#ffd84d" }}>{t.appCut}</span><span style={{ fontWeight: 800, color: "#ffd84d" }}>🪙 {fmt(cut)}</span></div>
              </div>

              {members.length === 0 && (
                <div style={{ textAlign: "center", opacity: 0.6, padding: "16px 0" }}>—</div>
              )}
              {members.map((mb) => (
                <button key={mb.userId} className="btn" onClick={() => { onGift(giving, mb, q); setGiving(null); }}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", marginBottom: 7, borderRadius: 12, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.07)", color: "#fff", cursor: "pointer" }}>
                  <span style={{ fontSize: 22, width: 34, height: 34, display: "grid", placeItems: "center", background: "rgba(255,255,255,.1)", borderRadius: "50%" }}>{mb.avatar}</span>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{mb.username}</div>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>ID {mb.userId}</div>
                  </div>
                  <span style={{ marginLeft: "auto", fontSize: 18 }}>🎁</span>
                </button>
              ))}
            </div>
          </div>
        );
      })()}
    </Sheet>
  );
}

const splitRow = (bg) => ({ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px", fontSize: 13, background: bg });

// ------------------------------------------------------------------
// Miracle Wishing Pool — pledge backpack gifts as materials, craft a target
// ------------------------------------------------------------------
function WishPanel({ bag, wishLog, lang, t, onWish, onClose }) {
  const [target, setTarget] = useState(null);
  const [mats, setMats] = useState({}); // { [giftValue]: pledged count }
  const [picking, setPicking] = useState(false);
  const [result, setResult] = useState(null); // { success, target, prob }
  const [showLog, setShowLog] = useState(false);

  const matValue = Object.entries(mats).reduce((a, [g, c]) => a + Number(g) * c, 0);
  const fullCost = target ? wishFullCost(target) : 0;
  const prob = target ? Math.min(1, matValue / fullCost) : 0;
  const pct = Math.round(prob * 100);

  const bagList = Object.entries(bag).map(([g, c]) => ({ gold: Number(g), count: c })).sort((a, b) => a.gold - b.gold);
  const availOf = (g) => (bag[g] || 0) - (mats[g] || 0);
  const addMat = (g) => { if (availOf(g) > 0) setMats((m) => ({ ...m, [g]: (m[g] || 0) + 1 })); };
  const subMat = (g) => setMats((m) => { const n = { ...m }; n[g] = (n[g] || 0) - 1; if (n[g] <= 0) delete n[g]; return n; });
  const setMatExact = (g, val) => {
    let n = parseInt(val, 10); if (isNaN(n)) n = 0;
    n = Math.max(0, Math.min(bag[g] || 0, n));
    setMats((m) => { const nn = { ...m }; if (n <= 0) delete nn[g]; else nn[g] = n; return nn; });
  };

  function confirm() {
    if (!target) return;
    if (matValue <= 0) return;
    const r = onWish(target, mats);
    setResult(r);
    setMats({});
  }

  const matChips = Object.entries(mats).map(([g, c]) => ({ gold: Number(g), count: c })).sort((a, b) => b.gold - a.gold);

  return (
    <Sheet title={`🔮 ${t.wishTitle}`} onClose={onClose}>
      {/* target selector */}
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8, opacity: 0.9 }}>{t.selectTarget}</div>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
        {WISH_TARGETS.map((v) => {
          const m = GIFTS[v], tier = tierOf(v), sel = target === v;
          return (
            <button key={v} className="btn" onClick={() => setTarget(v)}
              style={{ flex: "0 0 auto", width: 92, ...frameStyle(tier), borderRadius: 14, padding: "14px 4px 8px", textAlign: "center", cursor: "pointer", position: "relative", outline: sel ? "3px solid #7ef0ff" : "none", outlineOffset: 1, color: "#fff" }}>
              {tier !== "normal" && <TierRibbon tier={tier} t={t} />}
              <div style={{ fontSize: 32, lineHeight: 1 }}>{m.emoji}</div>
              <div style={{ fontSize: 10.5, fontWeight: 700, marginTop: 3 }}>{lang === "zh" ? m.zh : m.en}</div>
              <div style={{ fontSize: 10.5, opacity: 0.85 }}>🪙 {fmt(v)}</div>
            </button>
          );
        })}
      </div>

      {/* materials */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "16px 0 8px" }}>
        <span style={{ fontWeight: 800, fontSize: 13 }}>{t.matValue}　🪙 {fmt(matValue)}</span>
        {matChips.length > 0 && <button className="btn" onClick={() => setMats({})} style={{ fontSize: 11, background: "rgba(255,255,255,.1)", border: "none", color: "#fff", borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}>{t.clearMat}</button>}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", minHeight: 60 }}>
        {matChips.map(({ gold, count }) => (
          <button key={gold} className="btn" onClick={() => subMat(gold)} title={t.remove}
            style={{ position: "relative", ...frameStyle(tierOf(gold)), borderRadius: 12, padding: "8px 10px", textAlign: "center", cursor: "pointer", color: "#fff" }}>
            <div style={{ fontSize: 24, lineHeight: 1 }}>{GIFTS[gold].emoji}</div>
            <div style={{ fontSize: 10, opacity: 0.85 }}>🪙 {fmt(gold)}</div>
            <span style={{ position: "absolute", top: -6, right: -6, fontSize: 10, fontWeight: 800, background: "#7a2bd6", padding: "1px 6px", borderRadius: 999 }}>×{count}</span>
          </button>
        ))}
        <button className="btn" onClick={() => setPicking(true)}
          style={{ width: 68, height: 68, borderRadius: 12, border: "2px dashed #7ef0ff", background: "rgba(126,240,255,.08)", color: "#7ef0ff", fontSize: 12, fontWeight: 700, cursor: "pointer", lineHeight: 1.3 }}>
          ＋<br />{t.addMat}
        </button>
      </div>

      {/* success bar */}
      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
          <span style={{ fontWeight: 800 }}>{t.successRate}</span>
          <span style={{ fontWeight: 900, color: pct >= 100 ? "#5fffc7" : pct >= 50 ? "#ffe14d" : "#ff8fb0" }}>{pct}%</span>
        </div>
        <div style={{ height: 14, borderRadius: 999, background: "rgba(255,255,255,.1)", overflow: "hidden", border: "1px solid rgba(255,255,255,.15)" }}>
          <div style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: "linear-gradient(90deg,#7ef0ff,#d24bff,#ffe14d)", transition: "width .35s ease" }} />
        </div>
        {target && <div style={{ fontSize: 11, opacity: 0.65, marginTop: 6 }}>{t.need100(fullCost)}</div>}
      </div>

      {/* actions */}
      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <button className="btn" onClick={() => setShowLog(true)} style={{ flex: 1, padding: "12px 0", borderRadius: 14, border: "1px solid #ffd84d", background: "rgba(0,0,0,.25)", color: "#fff", fontWeight: 800, cursor: "pointer" }}>📖 {t.myRecords}</button>
        <button className="btn" onClick={confirm} disabled={!target || matValue <= 0}
          style={{ flex: 2, padding: "12px 0", borderRadius: 14, border: "none", background: !target || matValue <= 0 ? "rgba(255,255,255,.15)" : "linear-gradient(90deg,#d24bff,#7ef0ff)", color: "#fff", fontWeight: 900, fontSize: 15, cursor: !target || matValue <= 0 ? "default" : "pointer", boxShadow: !target || matValue <= 0 ? "none" : "0 0 14px #d24bff88" }}>
          🔮 {t.confirmWish}
        </button>
      </div>
      {!target && <div style={{ textAlign: "center", fontSize: 11, opacity: 0.6, marginTop: 8 }}>{t.needTarget}</div>}
      {target && matValue <= 0 && <div style={{ textAlign: "center", fontSize: 11, opacity: 0.6, marginTop: 8 }}>{t.needMat}</div>}

      {/* material picker overlay */}
      {picking && (
        <div style={{ position: "fixed", inset: 0, zIndex: 56, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,.6)" }} onClick={() => setPicking(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 430, maxHeight: "70vh", overflowY: "auto", background: "linear-gradient(180deg,#124e35,#08281c)", borderTop: "2px solid #7ef0ff", borderRadius: "20px 20px 0 0", padding: "16px 16px 24px", animation: "slideup .3s ease" }}>
            <div style={{ textAlign: "center", fontWeight: 800, marginBottom: 12 }}>{t.pickMat}</div>
            {bagList.length === 0 ? (
              <div style={{ textAlign: "center", opacity: 0.6, padding: "30px 0" }}>{t.emptyBag}</div>
            ) : bagList.map(({ gold, count }) => (
              <div key={gold} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", marginBottom: 7, borderRadius: 12, ...frameStyle(tierOf(gold)) }}>
                <span style={{ fontSize: 24 }}>{GIFTS[gold].emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lang === "zh" ? GIFTS[gold].zh : GIFTS[gold].en}</div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>🪙 {fmt(gold)} · {t.own} {count}</div>
                </div>
                <button className="btn" onClick={() => subMat(gold)} style={miniStep}>−</button>
                <input type="number" inputMode="numeric" min={0} max={count} value={mats[gold] || 0}
                  onChange={(e) => setMatExact(gold, e.target.value)} onFocus={(e) => e.target.select()}
                  style={{ width: 46, textAlign: "center", fontWeight: 800, fontSize: 14, color: "#fff", background: "rgba(0,0,0,.3)", border: "1px solid rgba(255,255,255,.25)", borderRadius: 8, padding: "6px 2px" }} />
                <button className="btn" onClick={() => addMat(gold)} disabled={availOf(gold) <= 0} style={{ ...miniStep, opacity: availOf(gold) <= 0 ? 0.4 : 1 }}>＋</button>
                <button className="btn" onClick={() => setMatExact(gold, count)} style={{ padding: "6px 8px", fontSize: 11, fontWeight: 800, borderRadius: 8, border: "1px solid #7ef0ff", background: "rgba(126,240,255,.12)", color: "#7ef0ff", cursor: "pointer" }}>{t.max}</button>
              </div>
            ))}
            <button className="btn" onClick={() => setPicking(false)} style={{ width: "100%", marginTop: 8, padding: "12px 0", borderRadius: 14, border: "none", background: "linear-gradient(90deg,#22d38a,#7ef0ff)", color: "#08281c", fontWeight: 900, cursor: "pointer" }}>{t.done} · 🪙 {fmt(matValue)}{target ? ` · ${pct}%` : ""}</button>
          </div>
        </div>
      )}

      {/* result overlay */}
      {result && (
        <div style={{ position: "fixed", inset: 0, zIndex: 58, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.7)" }} onClick={() => setResult(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "84%", maxWidth: 320, textAlign: "center", padding: "26px 20px", borderRadius: 20, background: "linear-gradient(180deg,#124e35,#08281c)", border: `2px solid ${result.success ? "#5fffc7" : "#ff6b8f"}`, boxShadow: `0 0 28px ${result.success ? "#5fffc7" : "#ff6b8f"}66`, animation: "pop .35s ease" }}>
            <div style={{ fontSize: 54, animation: result.success ? "twinkle 1.2s ease-in-out infinite" : "none" }}>{result.success ? GIFTS[result.target].emoji : "💔"}</div>
            <div style={{ fontWeight: 900, fontSize: 18, marginTop: 10, color: result.success ? "#5fffc7" : "#ff8fb0" }}>{result.success ? t.wishOk : t.wishFail}</div>
            {result.success && <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>{lang === "zh" ? GIFTS[result.target].zh : GIFTS[result.target].en} · 🪙 {fmt(result.target)}</div>}
            <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>{t.successRate} {Math.round(result.prob * 100)}%</div>
            <button className="btn" onClick={() => setResult(null)} style={{ marginTop: 16, padding: "9px 26px", borderRadius: 999, border: "1px solid rgba(255,255,255,.3)", background: "rgba(0,0,0,.3)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>OK</button>
          </div>
        </div>
      )}

      {/* records overlay */}
      {showLog && (
        <div style={{ position: "fixed", inset: 0, zIndex: 57, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,.6)" }} onClick={() => setShowLog(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 430, maxHeight: "70vh", overflowY: "auto", background: "linear-gradient(180deg,#124e35,#08281c)", borderTop: "2px solid #ffd84d", borderRadius: "20px 20px 0 0", padding: "16px 16px 24px", animation: "slideup .3s ease" }}>
            <div style={{ textAlign: "center", fontWeight: 800, marginBottom: 12 }}>📖 {t.myRecords}</div>
            {wishLog.length === 0 ? (
              <div style={{ textAlign: "center", opacity: 0.6, padding: "30px 0" }}>{t.emptyLog}</div>
            ) : wishLog.map((w, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", marginBottom: 6, borderRadius: 10, background: "rgba(255,255,255,.06)", borderLeft: `3px solid ${w.success ? "#5fffc7" : "#ff6b8f"}` }}>
                <span style={{ fontSize: 22 }}>{GIFTS[w.target].emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{lang === "zh" ? GIFTS[w.target].zh : GIFTS[w.target].en}</div>
                  <div style={{ fontSize: 11, opacity: 0.65 }}>{t.matValue} 🪙 {fmt(w.materialValue)} · {Math.round(w.prob * 100)}%</div>
                </div>
                <span style={{ fontWeight: 800, fontSize: 13, color: w.success ? "#5fffc7" : "#ff8fb0" }}>{w.success ? t.ok : t.fail}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}

const miniStep = { width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(255,255,255,.3)", background: "rgba(255,255,255,.1)", color: "#fff", fontSize: 17, fontWeight: 800, cursor: "pointer" };
