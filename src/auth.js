// Password hashing for Workers.
//
// The Node build used scrypt; Workers' WebCrypto has no scrypt, so this uses
// PBKDF2-SHA256 — the closest primitive available on the platform.
//
// Iterations are a deliberate compromise: Workers' free plan caps CPU per
// request, and PBKDF2 is the only thing here heavy enough to approach it.
// Raise this if the plan allows more; login is the only path that pays it.
const ITERATIONS = 50_000;
const KEY_BITS = 256;

const encoder = new TextEncoder();

const toHex = (bytes) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

const fromHex = (hex) =>
  Uint8Array.from(hex.match(/.{2}/g).map((b) => parseInt(b, 16)));

async function derive(password, salt) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, KEY_BITS
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: toHex(salt), hash: toHex(await derive(password, salt)) };
}

export async function verifyPassword(password, saltHex, hashHex) {
  if (!saltHex || !hashHex) return false;
  const candidate = await derive(password, fromHex(saltHex));
  const expected = fromHex(hashHex);
  if (candidate.length !== expected.length) return false;

  // Constant-time: compare every byte regardless of where they differ.
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) diff |= candidate[i] ^ expected[i];
  return diff === 0;
}

export const randomToken = () => toHex(crypto.getRandomValues(new Uint8Array(24)));
export const randomSecret = () => toHex(crypto.getRandomValues(new Uint8Array(32)));

// 5-digit numeric ids — this is what the superadmin types to top someone up,
// so it has to be quick to read aloud and quick to key in. 10000–99999 gives
// 90k possibilities; register checks for a clash before using one.
export function newUserId() {
  const buf = crypto.getRandomValues(new Uint32Array(1));
  return String(10000 + (buf[0] % 90000));
}
