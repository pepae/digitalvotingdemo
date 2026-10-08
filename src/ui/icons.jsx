// Pictogrammes (trait 2 px, 24 × 24), décoratifs par défaut (aria-hidden).
const P = {
  home: <path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" />,
  ballot: <><path d="M4 11h16v9H4z" /><path d="M8 11l2-7h7l-2 7" /><path d="M9 15.5h6" /></>,
  urn: <><rect x="4" y="9" width="16" height="12" rx="2" /><path d="M9 9V5h6v4" /><path d="M8 13h8" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18 14.8c2 .7 3.2 2.4 3.6 5.2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4.2-6 8-6s7 2 8 6" /></>,
  shield: <path d="M12 3 4.5 6v5.6c0 4.6 3.1 8.2 7.5 9.4 4.4-1.2 7.5-4.8 7.5-9.4V6z" />,
  shieldCheck: <><path d="M12 3 4.5 6v5.6c0 4.6 3.1 8.2 7.5 9.4 4.4-1.2 7.5-4.8 7.5-9.4V6z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 8.7-8.7M16 7l2.5 2.5M18.5 4.5 21 7" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10.5" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  unlock: <><rect x="5" y="10.5" width="14" height="10.5" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.7" /></>,
  seal: <><circle cx="12" cy="10" r="6" /><path d="m9 15-2 6 5-2.5L17 21l-2-6" /><path d="m9.8 10 1.6 1.6L14.5 8.6" /></>,
  chart: <><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-5M12 16V8M16 16v-3" /></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>,
  listCheck: <><path d="M11 6h9M11 12h9M11 18h9" /><path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5L7.5 17" /></>,
  file: <><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4" /><path d="M9 12h6M9 16h6" /></>,
  fileCheck: <><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4" /><path d="m9 14 2 2 4-4" /></>,
  download: <><path d="M12 4v11" /><path d="m7 10.5 5 5 5-5" /><path d="M4 19.5h16" /></>,
  upload: <><path d="M12 15.5V4" /><path d="m7 8.5 5-5 5 5" /><path d="M4 19.5h16" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  alert: <><path d="M12 3 2 20h20z" /><path d="M12 10v4.5M12 17.5v.5" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8 12.3 2.8 2.7L16 9.7" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  xCircle: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M4 4l16 16" /><path d="M9.9 5.8A9.3 9.3 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3 3.7M6.6 6.9A15.6 15.6 0 0 0 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.3-1" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.3-2.5 3.8M12 17v.4" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.4" /></>,
  phone: <path d="M5 3.5h3.5l1.8 4.6-2.3 1.4a11 11 0 0 0 6.5 6.5l1.4-2.3 4.6 1.8V19a2 2 0 0 1-2.1 2A16.5 16.5 0 0 1 3 5.6 2 2 0 0 1 5 3.5z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" /></>,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  play: <path d="M7 4.5v15l12-7.5z" />,
  pause: <path d="M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z" />,
  stop: <rect x="5.5" y="5.5" width="13" height="13" rx="1.5" />,
  refresh: <><path d="M20 11a8 8 0 0 0-14.3-4.8L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.3 4.8L20 16" /><path d="M20 20v-4h-4" /></>,
  qr: <><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="14" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="3.5" y="14" width="6.5" height="6.5" rx="1" /><path d="M14 14h3v3h-3zM18 18h2.5v2.5H18zM14 19.5h1.5M19.5 14v1.5" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  video: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10.5 5-3v9l-5-3z" /></>,
  screen: <><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M8 20h8M12 16v4" /></>,
  print: <><path d="M7 8V3.5h10V8" /><rect x="3.5" y="8" width="17" height="8" rx="1.5" /><path d="M7 13h10v7.5H7z" /></>,
  server: <><rect x="3.5" y="4" width="17" height="7" rx="1.5" /><rect x="3.5" y="13" width="17" height="7" rx="1.5" /><path d="M7 7.5h.01M7 16.5h.01" /></>,
  archive: <><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v11h14V9" /><path d="M10 13h4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  chevronLeft: <path d="m15 5-7 7 7 7" />,
  chevronDown: <path d="m5 9 7 7 7-7" />,
  arrowRight: <><path d="M4 12h15" /><path d="m13 6 6 6-6 6" /></>,
  arrowLeft: <><path d="M20 12H5" /><path d="m11 6-6 6 6 6" /></>,
  external: <><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v6H4V6h6" /></>,
  fingerprint: <><path d="M6.5 7.5A7 7 0 0 1 19 12v1.5" /><path d="M5 11.5c0 4 .8 6 2.2 8" /><path d="M9 20.5c-1-2.4-1.4-5-1.4-8a4.4 4.4 0 0 1 8.8 0c0 2.5.3 4.6 1 6.5" /><path d="M12 12c0 3.4.6 6.3 2 8.5" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>,
  database: <><ellipse cx="12" cy="5.5" rx="8" ry="2.5" /><path d="M4 5.5v13c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-13" /><path d="M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5" /></>,
  hand: <><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12" /><path d="M11 11V4a1.5 1.5 0 0 1 3 0v7" /><path d="M14 11.5V5.5a1.5 1.5 0 0 1 3 0V14" /><path d="M8 12.5 6.6 11a1.6 1.6 0 0 0-2.3 2.2L8 18c1.4 1.9 3 3 5.5 3a5 5 0 0 0 5-5V9.5a1.5 1.5 0 0 0-3 0" /></>,
  gavel: <><path d="m14 4 6 6M12 6l6 6M10.5 7.5l6 6" /><path d="m11 11-7 7 2 2 7-7" /><path d="M14 21h7" /></>,
  building: <><path d="M4 21V5l8-2v18M12 7l8 2.5V21" /><path d="M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2" /><path d="M2 21h20" /></>,
  heartPulse: <><path d="M20.4 6.6a5 5 0 0 0-8.4-1.7A5 5 0 0 0 3.6 11c.6 1.4 1.6 2.6 2.7 3.7L12 20l5.7-5.3" /><path d="M3 12h4l2-3 3 6 2-3h7" /></>,
  sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />,
  a11y: <><circle cx="12" cy="4.5" r="1.8" /><path d="M5 8.5c2.3.7 4.6 1 7 1s4.7-.3 7-1" /><path d="M12 9.5v5M9 21l3-6.5 3 6.5" /></>,
  contrast: <><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" /></>,
  text: <><path d="M4 6V4h12v2M10 4v16M7.5 20h5" /><path d="M14 13v-1.5h6V13M17 11.5V20M15.5 20h3" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  logout: <><path d="M15 4h4v16h-4" /><path d="M10 8l-4 4 4 4M6 12h10" /></>,
  login: <><path d="M15 4h4v16h-4" /><path d="M11 8l4 4-4 4M15 12H4" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  filter: <path d="M4 5h16l-6 7.5V19l-4 1.5v-8z" />,
  timer: <><circle cx="12" cy="13.5" r="7.5" /><path d="M12 9.5v4l2.5 1.5M9.5 3h5" /></>,
  zap: <path d="M13 2.5 4.5 13.5H12L11 21.5l8.5-11H12z" />,
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  pin: <><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></>,
  wifiOff: <><path d="M3 3l18 18" /><path d="M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M14.5 10.4A10 10 0 0 1 19 13M2 9.5a15 15 0 0 1 4.5-2.8M10.6 6.1A15 15 0 0 1 22 9.5" /><path d="M12 20h.01" /></>,
  leaf: <><path d="M5 19c0-8.5 5.5-14 15-14 0 9.5-5.5 15-14 15" /><path d="M5 19 13 11" /></>,
  scale: <><path d="M12 4v16M7 20h10M5 7h14" /><path d="m5 7-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z" /></>,
  route: <><circle cx="6" cy="19" r="2.5" /><circle cx="18" cy="5" r="2.5" /><path d="M8.5 19H17a3.5 3.5 0 0 0 0-7H7a3.5 3.5 0 0 1 0-7h8.5" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>,
  hash: <path d="M5 9h15M4 15h15M10 3 8 21M16 3l-2 18" />,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2.5v3.5M15 2.5v3.5M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5" /></>,
  send: <><path d="M21 3 10 14" /><path d="M21 3 14.5 21 10 14 3 9.5z" /></>,
  stamp: <><path d="M9 12.5V8.7a3 3 0 1 1 6 0v3.8" /><path d="M5 12.5h14l1 4H4z" /><path d="M5 19.5h14" /></>,
  inbox: <><path d="M3 13.5 5.5 5h13l2.5 8.5V19H3z" /><path d="M3 13.5h5l1.5 2.5h5l1.5-2.5h5" /></>,
  rank: <><path d="M4 20h4v-6H4zM10 20h4V8h-4zM16 20h4V11h-4z" /></>,
  wand: <><path d="m4 20 11-11M14 4v2M18 8h2M17.5 4.5l-1.4 1.4M19.5 10.5l-1.4-1.4" /></>,
  tv: <><rect x="2.5" y="5" width="19" height="13" rx="2" /><path d="m9 2.5 3 2.5 3-2.5M8 21h8" /></>,
  ticket: <path d="M3 8a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 1 0-4V4H3zM14 4v4M14 12v4" />,
};

export function Icon({ name, size = 20, stroke = 2, label, class: cls, style }) {
  const p = P[name] || P.info;
  return (
    <svg class={cls} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" aria-hidden={label ? undefined : 'true'} role={label ? 'img' : undefined} aria-label={label} focusable="false">
      {p}
    </svg>
  );
}

// Emblème générique de la plateforme (urne stylisée), neutre
export function Mark({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <rect width="40" height="40" rx="10" fill="#1D1D1F" />
      <path d="M15 19l2.2-7.5h9.2L24.2 19" fill="#fff" opacity=".5" />
      <path d="M11 19h18v11.5H11z" fill="#fff" />
      <path d="M16 24.6h8" stroke="#1D1D1F" stroke-width="2.2" stroke-linecap="round" />
    </svg>
  );
}

// Bouclier rayé (rappel simplifié de la marque Shutter Governance)
export function ShutterShield({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 1.8 3.5 5v6.3c0 5.2 3.5 9.3 8.5 10.9 5-1.6 8.5-5.7 8.5-10.9V5z" fill="#0044A4" />
      <path d="M6.2 7.6h11.6M5.9 10.6h12.2M6.2 13.6h11.6M7.4 16.6h9.2M9.4 19.3h5.2" stroke="#fff" stroke-width="1.5" />
    </svg>
  );
}
export function VoteBaseMark({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="20" height="20" rx="6" fill="#1D1D1F" />
      <path d="m7 12.5 3.2 3.2L17 8.8" stroke="#30D158" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

// Logo généré d'une organisation syndicale fictive
export function UnionLogo({ u, size = 48 }) {
  const shapes = {
    circle: <circle cx="38" cy="10" r="16" fill="#fff" />,
    square: <rect x="26" y="-6" width="28" height="28" rx="6" transform="rotate(20 40 8)" fill="#fff" />,
    tri: <path d="M24 48 48 6v42z" fill="#fff" />,
    wave: <path d="M-2 34c10-8 18 6 28-2s16 4 26-2v20H-2z" fill="#fff" />,
  };
  return (
    <div class="logo-mark" style={{ background: u.color, width: size + 'px', height: size + 'px' }} role="img" aria-label={'Logo ' + u.acr}>
      <svg viewBox="0 0 48 48" aria-hidden="true">{shapes[u.shape]}</svg>
      <span style={{ fontSize: size < 40 ? '.62rem' : '.8rem' }}>{u.acr}</span>
    </div>
  );
}
