// Générateurs pseudo-aléatoires déterministes (données fictives reproductibles).
export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rng = (seed) => mulberry32(hashSeed(String(seed)));
export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
export function shuffle(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const randInt = (r, min, max) => min + Math.floor(r() * (max - min + 1));

// Aléa "réel" (non déterministe) pour les identifiants générés lors des actions
export function randHex(n = 16) {
  let s = '';
  try {
    const a = new Uint8Array(Math.ceil(n / 2));
    crypto.getRandomValues(a);
    for (const b of a) s += b.toString(16).padStart(2, '0');
    return s.slice(0, n);
  } catch (e) {
    for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }
}
const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randCode(groups = 3, len = 4) {
  const hex = randHex(groups * len * 2);
  let out = [];
  for (let g = 0; g < groups; g++) {
    let s = '';
    for (let i = 0; i < len; i++) s += B32[parseInt(hex.substr((g * len + i) * 2, 2), 16) % B32.length];
    out.push(s);
  }
  return out.join('-');
}
export const randDigits = (n = 6) => {
  const hex = randHex(n * 2);
  let s = '';
  for (let i = 0; i < n; i++) s += parseInt(hex.substr(i * 2, 2), 16) % 10;
  return s;
};
