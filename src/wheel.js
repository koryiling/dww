// Wheel definition, round schedule and draw — the authoritative copy.
// Ported from animal_wheel.ps1.
//
// Weights live ONLY here. Clients get names, art and payouts, never the odds.
//
// Workers has no node:crypto, so the HMAC goes through WebCrypto and the
// draw is async. Everything else matches the Node version exactly.

export const ANIMALS = [
  { id: 'turtle',   name: '乌龟', en: 'Turtle',   art: '🐢', weight: 19.4, payout: 5,  plate: '菜盘' },
  { id: 'hedgehog', name: '刺猬', en: 'Hedgehog', art: '🦔', weight: 19.4, payout: 5,  plate: '菜盘' },
  { id: 'raccoon',  name: '浣熊', en: 'Raccoon',  art: '🦝', weight: 19.4, payout: 5,  plate: '菜盘' },
  { id: 'elephant', name: '小象', en: 'Elephant', art: '🐘', weight: 19.4, payout: 5,  plate: '菜盘' },
  { id: 'cat',      name: '猫咪', en: 'Cat',      art: '🐱', weight: 9.7,  payout: 10, plate: '肉盘' },
  { id: 'fox',      name: '狐狸', en: 'Fox',      art: '🦊', weight: 6.5,  payout: 15, plate: '肉盘' },
  { id: 'pig',      name: '猪猪', en: 'Pig',      art: '🐷', weight: 3.9,  payout: 25, plate: '肉盘' },
  { id: 'lion',     name: '狮子', en: 'Lion',     art: '🦁', weight: 2.2,  payout: 45, plate: '肉盘' },
];

// Hidden spots — real wheel weight, never shown on the board. When one lands,
// every animal on that plate pays out.
export const PLATES = [
  { id: 'veg',  name: '菜盘', art: '🥬', weight: 1.5 },
  { id: 'meat', name: '肉盘', art: '🍖', weight: 0.8 },
];

const WHEEL = [...ANIMALS, ...PLATES];
const TOTAL_WEIGHT = WHEEL.reduce((sum, s) => sum + s.weight, 0); // 102.2

const plateMembers = new Map(
  PLATES.map((p) => [p.id, ANIMALS.filter((a) => a.plate === p.name)])
);

export const animalById = new Map(ANIMALS.map((a) => [a.id, a]));

const SEGMENTS = (() => {
  let acc = 0;
  return WHEEL.map((spot) => {
    const low = acc;
    acc += spot.weight;
    return { spot, low: (low / TOTAL_WEIGHT) * 100, high: (acc / TOTAL_WEIGHT) * 100 };
  });
})();

/* ---- Round schedule ----
   Derived from wall-clock time, so every player is on the same round no
   matter when they open the page — and no process needs to be running for
   a round to happen.                                                      */

export const BETTING_MS = 60_000;
export const DRAW_MS = 5_000;
export const CYCLE_MS = BETTING_MS + DRAW_MS;

export const roundIdAt = (t) => Math.floor(t / CYCLE_MS);

export function phaseAt(t) {
  const roundId = roundIdAt(t);
  const elapsed = t - roundId * CYCLE_MS;
  return elapsed < BETTING_MS
    ? { roundId, phase: 'betting', msLeft: BETTING_MS - elapsed }
    : { roundId, phase: 'drawing', msLeft: CYCLE_MS - elapsed };
}

/* ---- Draw ----
   A pure function of (secret, roundId): identical for every player,
   reproducible for auditing, unpredictable to clients.                     */

const hexToBytes = (hex) =>
  Uint8Array.from(hex.match(/.{2}/g).map((b) => parseInt(b, 16)));

export async function drawFor(roundId, secretHex) {
  const key = await crypto.subtle.importKey(
    'raw', hexToBytes(secretHex), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(`round:${roundId}`)
  );

  // 52 bits keeps the result inside Number's exact-integer range.
  const first64 = new DataView(signature).getBigUint64(0);
  const roll = (Number(first64 >> 12n) / 2 ** 52) * 100;

  const hit = SEGMENTS.find((s) => roll >= s.low && roll < s.high);
  return (hit ?? SEGMENTS[SEGMENTS.length - 1]).spot;
}

export function resolveWinners(spot) {
  return plateMembers.get(spot.id) ?? [spot];
}

export const isPlate = (spot) => plateMembers.has(spot.id);

export const publicConfig = {
  animals: ANIMALS.map(({ id, name, en, art, payout }) => ({ id, name, en, art, payout })),
  plates: PLATES.map(({ id, name, art }) => ({ id, name, art })),
  bettingMs: BETTING_MS,
  drawMs: DRAW_MS,
  cycleMs: CYCLE_MS,
};
