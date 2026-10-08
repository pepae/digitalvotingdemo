// Routeur par ancre (#/...) : chaque profil dispose d'un lien direct partageable.
import { useEffect, useState } from 'preact/hooks';

// Une ancre interne (#acces, #main...) n'est pas une route : on défile vers l'élément sans changer d'écran.
const isAnchor = (h) => !!h && h !== '#' && !h.startsWith('#/');
let lastHash = isAnchor(window.location.hash) ? '#/' : window.location.hash || '#/';

function parse(h0) {
  const h = ((h0 != null ? h0 : window.location.hash) || '#/').replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  const q = {};
  if (qs) for (const part of qs.split('&')) { const [k, v] = part.split('='); if (k) q[decodeURIComponent(k)] = decodeURIComponent(v || ''); }
  return { path: path.replace(/\/+$/, '') || '/', q };
}

function scrollToAnchor(id) {
  const el = document.getElementById(id);
  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); }
}

export function useRoute() {
  const [r, setR] = useState(() => parse(lastHash));
  useEffect(() => {
    if (isAnchor(window.location.hash)) {
      const id = window.location.hash.slice(1);
      history.replaceState(null, '', lastHash);
      setTimeout(() => scrollToAnchor(id), 60);
    }
    const f = () => {
      const h = window.location.hash;
      if (isAnchor(h)) {
        history.replaceState(null, '', lastHash);
        scrollToAnchor(h.slice(1));
        return;
      }
      lastHash = h || '#/';
      setR(parse());
      window.scrollTo(0, 0);
      setTimeout(() => {
        const h = document.querySelector('main h1, [data-focus-first]');
        if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
      }, 30);
    };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}

export function match(pattern, path) {
  const ps = pattern.split('/').filter(Boolean);
  const xs = path.split('/').filter(Boolean);
  if (ps.length !== xs.length) return null;
  const params = {};
  for (let i = 0; i < ps.length; i++) {
    if (ps[i].startsWith(':')) params[ps[i].slice(1)] = decodeURIComponent(xs[i]);
    else if (ps[i] !== xs[i]) return null;
  }
  return params;
}

export function go(path) {
  if (window.location.hash === '#' + path) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else window.location.hash = path;
}
export const href = (path) => '#' + path;
export function absUrl(path) {
  const base = window.location.href.split('#')[0];
  return base + '#' + path;
}
