// Journal chaîné par empreintes SHA-256 (intégrité garantie par procédé cryptographique, CCTP 6.1.4)
import { sha256 } from './sha256.js';

export const ZERO = '0'.repeat(64);
export function entryHash(prev, e) {
  return sha256([prev, e.i, e.at, e.actor, e.role, e.action, e.detail || '', e.op || ''].join('|'));
}
export function appendEntry(list, e) {
  const prev = list.length ? list[list.length - 1].hash : ZERO;
  const entry = { op: '', detail: '', ...e, i: list.length + 1, prev };
  entry.hash = entryHash(prev, entry);
  list.push(entry);
  return entry;
}
export function verifyChain(list) {
  let prev = ZERO;
  for (const e of list) {
    if (e.prev !== prev) return { ok: false, at: e.i, reason: 'Le lien avec l’entrée précédente est rompu.' };
    const h = entryHash(prev, e);
    if (h !== e.hash) return { ok: false, at: e.i, reason: 'Le contenu de l’entrée ne correspond plus à son empreinte.' };
    prev = e.hash;
  }
  return { ok: true, count: list.length, last: prev };
}
