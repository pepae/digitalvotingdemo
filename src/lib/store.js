// Store de la démonstration : état unique, persistance locale (try/catch) et synchronisation
// en direct entre onglets (BroadcastChannel) pour jouer organisateur et participant côte à côte.
import { useEffect, useState } from 'preact/hooks';
import { seedState, SEED_VERSION } from '../data/seed.js';
import { reduce } from './reducer.js';
import { randHex } from './prng.js';
import { setCurLang } from './lang.js';

const KEY = 'demo-vote-electronique-resah-2026';
const MAX_AGE = 3 * 86400000; // au-delà, la démonstration est réinitialisée (dates relatives)
export const TAB = randHex(8);

let state;
const listeners = new Set();
let bc = null;
try { if (typeof BroadcastChannel !== 'undefined') bc = new BroadcastChannel(KEY); } catch (e) { bc = null; }

function load() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.v === SEED_VERSION && Date.now() - s.seededAt < MAX_AGE) return s;
    }
  } catch (e) { /* stockage indisponible : la démo fonctionne en mémoire */ }
  return seedState(Date.now());
}
state = load();
setCurLang(state.settings.lang);

let saveT = null;
function scheduleSave() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }, 200);
}
let queued = false;
function notify() {
  if (queued) return;
  queued = true;
  Promise.resolve().then(() => { queued = false; listeners.forEach((f) => f()); });
}
function apply(action) {
  try { state = reduce(state, action) || state; } catch (e) { if (typeof console !== 'undefined') console.error('[démo] action', action.type, e); }
  state.rev = (state.rev || 0) + 1;
  setCurLang(state.settings.lang);
  notify();
  scheduleSave();
}
export function dispatch(type, payload = {}) {
  const action = { type, payload, at: Date.now(), tab: TAB };
  apply(action);
  if (bc) { try { bc.postMessage(action); } catch (e) { /* ignore */ } }
  return action;
}
if (bc) {
  bc.onmessage = (e) => { const a = e.data; if (a && a.type && a.tab !== TAB) apply(a); };
} else {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try { const s = JSON.parse(e.newValue); if (s && s.v === SEED_VERSION) { state = s; setCurLang(state.settings.lang); notify(); } } catch (err) { /* ignore */ }
  });
}

export const getState = () => state;
export function useStore() {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set((x) => x + 1);
    listeners.add(f);
    return () => listeners.delete(f);
  }, []);
  return state;
}
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
export const syncMode = bc ? 'BroadcastChannel' : 'storage';
