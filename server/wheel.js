// Wheel definition and round scheduling — the authoritative copy.
// Ported from animal_wheel.ps1.
//
// Weights live ONLY on the server. Clients are told names, art and payouts,
// never the odds, so nobody can compute the edge from the page source.

import { createHmac } from 'node:crypto';

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

// Hidden spots — they hold wheel weight but are never shown on the board.
// When one lands, every animal on that plate pays out together.
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
const spotById = new Map(WHEEL.map((s) => [s.id, s]));

// Cumulative [low, high) bands over 0–100, matching Show-Wheel.
const SEGMENTS = (() => {
  let acc = 0;
  return WHEEL.map((spot) => {
    const low = acc;
    acc += spot.weight;
    return { spot, low: (low / TOTAL_WEIGHT) * 100, high: (acc / TOTAL_WEIGHT) * 100 };
  });
})();

/* ---- Round schedule -------------------------------------------------
   Rounds are derived from wall-clock time, so every player is on the same
   round no matter when they open the page. No handshake required.        */

export const BETTING_MS = 60_000;
export const DRAW_MS = 5_000;
export const CYCLE_MS = BETTING_MS + DRAW_MS; // 65s

export const roundIdAt = (t) => Math.floor(t / CYCLE_MS);
export const roundStart = (roundId) => roundId * CYCLE_MS;

export function phaseAt(t) {
  const roundId = roundIdAt(t);
  const elapsed = t - roundStart(roundId);
  return elapsed < BETTING_MS
    ? { roundId, phase: 'betting', msLeft: BETTING_MS - elapsed }
    : { roundId, phase: 'drawing', msLeft: CYCLE_MS - elapsed };
}

/* ---- Draw ----------------------------------------------------------
   The outcome is a pure function of (secret, roundId), so it is identical
   for every player and reproducible for auditing — but unpredictable to
   clients, who never see the secret.                                     */

export function drawFor(roundId, secret) {
  const digest = createHmac('sha256', secret).update(`round:${roundId}`).digest();
  // 52 bits keeps us inside Number's exact-integer range.
  const value = Number(digest.readBigUInt64BE(0) >> 12n) / 2 ** 52;
  const roll = value * 100;
  const hit = SEGMENTS.find((s) => roll >= s.low && roll < s.high);
  return (hit ?? SEGMENTS[SEGMENTS.length - 1]).spot;
}

export function resolveWinners(spot) {
  return plateMembers.get(spot.id) ?? [spot];
}

export const isPlate = (spot) => plateMembers.has(spot.id);
export const spotOf = (id) => spotById.get(id);

// What the client is allowed to know about the board.
export const publicConfig = {
  animals: ANIMALS.map(({ id, name, en, art, payout }) => ({ id, name, en, art, payout })),
  plates: PLATES.map(({ id, name, art }) => ({ id, name, art })),
  bettingMs: BETTING_MS,
  drawMs: DRAW_MS,
  cycleMs: CYCLE_MS,
};
