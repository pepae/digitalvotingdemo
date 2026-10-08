// Formats FR / EN (langue courante par défaut), fuseau Europe/Paris.
import { curLang } from './lang.js';
export const TZ = 'Europe/Paris';
const cache = {};
function dtf(lang, opts) {
  const k = lang + JSON.stringify(opts);
  if (!cache[k]) cache[k] = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', { timeZone: TZ, ...opts });
  return cache[k];
}

// Parties d'une date à Paris
export function parisParts(ts) {
  const p = {};
  for (const x of dtf('fr', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(ts)) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}
// Horodatage pour une date/heure exprimée à Paris
export function parisTs(y, m, d, h = 0, mi = 0) {
  let guess = Date.UTC(y, m - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const p = parisParts(guess);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
    guess += Date.UTC(y, m - 1, d, h, mi) - asUtc;
  }
  return guess;
}
// Jour J (minuit Paris) décalé de n jours, à l'heure h:mi
export function dayAt(base, nDays, h = 0, mi = 0) {
  const p = parisParts(base + nDays * 86400000);
  return parisTs(p.y, p.m, p.d, h, mi);
}

export const fmtDateLong = (ts, lang = curLang()) => dtf(lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(ts);
export const fmtDateMed = (ts, lang = curLang()) => dtf(lang, { day: 'numeric', month: 'long', year: 'numeric' }).format(ts);
export const fmtDate = (ts, lang = curLang()) => dtf(lang, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(ts);
export const fmtTime = (ts, lang = curLang()) => dtf(lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ts);
export const fmtTimeS = (ts, lang = curLang()) => dtf(lang, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(ts);
export const fmtDT = (ts, lang = curLang()) => fmtDate(ts, lang) + (lang === 'en' ? ' at ' : ' à ') + fmtTime(ts, lang);
export const fmtDTS = (ts, lang = curLang()) => fmtDate(ts, lang) + ' ' + fmtTimeS(ts, lang);
export function fmtPeriod(a, b, lang = curLang()) {
  if (lang === 'en') return `From ${fmtDateLong(a, 'en')}, ${fmtTime(a, 'en')} to ${fmtDateLong(b, 'en')}, ${fmtTime(b, 'en')} (Paris time)`;
  return `Du ${fmtDateLong(a, lang)}, ${fmtTime(a, lang).replace(':', ' h ')} au ${fmtDateLong(b, lang)}, ${fmtTime(b, lang).replace(':', ' h ')} (heure de Paris)`;
}

const nf = new Intl.NumberFormat('fr-FR');
const nfEn = new Intl.NumberFormat('en-GB');
export const fmtNum = (n, lang = curLang()) => (lang === 'en' ? nfEn : nf).format(Math.round(n));
export function fmtPct(x, d = 1, lang = curLang()) {
  if (!isFinite(x)) x = 0;
  const s = (x * 100).toFixed(d);
  return lang === 'en' ? s + ' %' : s.replace('.', ',') + ' %';
}
export function fmtDur(ms, lang = curLang()) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return (d ? d + (lang === 'en' ? 'd ' : ' j ') : '') + pad(h) + ':' + pad(m) + ':' + pad(sec);
}
export function fmtMMSS(ms) {
  if (ms < 0) ms = 0;
  const s = Math.ceil(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
export function relTime(ts, now, lang = curLang()) {
  const diff = Math.round((now - ts) / 1000);
  if (lang === 'en') {
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
    if (diff < 86400) return Math.floor(diff / 3600) + ' h ago';
    const de = Math.floor(diff / 86400);
    return de + ' day' + (de > 1 ? 's' : '') + ' ago';
  }
  if (diff < 60) return 'à l’instant';
  if (diff < 3600) return 'il y a ' + Math.floor(diff / 60) + ' min';
  if (diff < 86400) return 'il y a ' + Math.floor(diff / 3600) + ' h';
  const d = Math.floor(diff / 86400);
  return 'il y a ' + d + ' jour' + (d > 1 ? 's' : '');
}
export const initials = (name) => name.replace(/^(Dr|Pr|Mme|M\.)\s+/i, '').split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export const plural = (n, one, many) => (Math.abs(n) > 1 ? many : one);
export const maskEmail = (e) => e.replace(/^(.)[^@]*(@.*)$/, (m, a, b) => a + '•••••' + b);
