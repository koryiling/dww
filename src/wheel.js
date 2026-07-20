// Wheel definition, round schedule and draw — the authoritative copy.
// Ported from animal_wheel.ps1.
//
// Weights live ONLY here. Clients get names, art and payouts, never the odds.
//
// Workers has no node:crypto, so the HMAC goes through WebCrypto and the
// draw is async. Everything else matches the Node version exactly.

// Return-to-player. 1.00 = a fair wheel: every bet returns exactly its stake
// over the long run, and the house neither gains nor loses.
//
// Lower it for a house edge — 0.97 keeps 3% of turnover. There is a floor:
// the plates hand out extra wins, so the lowest RTP reachable while they
// still exist is ~97.19% (that is the no-plate case). Below that, payouts
// have to come down instead. deriveWeights() throws rather than silently
// producing a broken wheel.
export const TARGET_RTP = 1.00;

// Relative size of the two plates — keeps the original 1.5 : 0.8 feel.
const PLATE_SPLIT = { veg: 15, meat: 8 };

const ANIMAL_SPEC = [
  { id: 'turtle',   name: '乌龟', en: 'Turtle',   art: '🐢', payout: 5,  plate: '菜盘' },
  { id: 'hedgehog', name: '刺猬', en: 'Hedgehog', art: '🦔', payout: 5,  plate: '菜盘' },
  { id: 'raccoon',  name: '浣熊', en: 'Raccoon',  art: '🦝', payout: 5,  plate: '菜盘' },
  { id: 'elephant', name: '小象', en: 'Elephant', art: '🐘', payout: 5,  plate: '菜盘' },
  { id: 'cat',      name: '猫咪', en: 'Cat',      art: '🐱', payout: 10, plate: '肉盘' },
  { id: 'fox',      name: '狐狸', en: 'Fox',      art: '🦊', payout: 15, plate: '肉盘' },
  { id: 'pig',      name: '猪猪', en: 'Pig',      art: '🐷', payout: 25, plate: '肉盘' },
  { id: 'lion',     name: '狮子', en: 'Lion',     art: '🦁', payout: 45, plate: '肉盘' },
];

const PLATE_SPEC = [
  { id: 'veg',  name: '菜盘', art: '🥬' },
  { id: 'meat', name: '肉盘', art: '🍖' },
];

// Solve for the weights that hit TARGET_RTP exactly.
//
//   an animal pays out when its own spot lands OR its plate lands, so
//       RTP_i = (w_i + P) / 100 * payout_i
//   setting that to R and rearranging:
//       w_i = 100R / payout_i - P
//   and requiring the whole wheel to sum to 100 pins the plate weights:
//       sum(w) + Pv + Pm = 100  =>  Pv + Pm = (Σ 100R/payout_i - 100) / (k - 1)
//   where k is the number of animals per plate.
function deriveWeights() {
  const inverseSum = ANIMAL_SPEC.reduce((sum, a) => sum + (100 * TARGET_RTP) / a.payout, 0);
  const perPlate = PLATE_SPEC.map((p) =>
    ANIMAL_SPEC.filter((a) => a.plate === p.name).length);

  if (new Set(perPlate).size !== 1) {
    throw new Error('deriveWeights assumes every plate holds the same number of animals');
  }
  const k = perPlate[0];

  const plateTotal = (inverseSum - 100) / (k - 1);
  if (plateTotal < 0) {
    throw new Error(
      `TARGET_RTP ${TARGET_RTP} is unreachable with these payouts — it needs ` +
      `negative plate weight. Raise TARGET_RTP or lower the payouts.`
    );
  }

  const splitTotal = PLATE_SPLIT.veg + PLATE_SPLIT.meat;
  const plates = PLATE_SPEC.map((p) => ({
    ...p,
    weight: (plateTotal * PLATE_SPLIT[p.id]) / splitTotal,
  }));
  const plateWeightByName = new Map(plates.map((p) => [p.name, p.weight]));

  const animals = ANIMAL_SPEC.map((a) => {
    const weight = (100 * TARGET_RTP) / a.payout - plateWeightByName.get(a.plate);
    if (weight <= 0) {
      throw new Error(`${a.name} ended up with weight ${weight} — payout ${a.payout} is too high`);
    }
    return { ...a, weight };
  });

  return { animals, plates };
}

const derived = deriveWeights();

export const ANIMALS = derived.animals;

// Hidden spots — real wheel weight, never shown on the board. When one lands,
// every animal on that plate pays out.
export const PLATES = derived.plates;

const WHEEL = [...ANIMALS, ...PLATES];
const TOTAL_WEIGHT = WHEEL.reduce((sum, s) => sum + s.weight, 0); // 100 by construction

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
