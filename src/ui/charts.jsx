// Graphiques SVG légers (aucune bibliothèque) : courbe de participation avec réticule et info-bulle.
import { useRef, useState } from 'preact/hooks';
import { L } from '../lib/lang.js';
import { fmtDate, fmtTime, fmtPct, fmtNum } from '../lib/format.js';

export function AreaChart({ series, height = 200, label, max = null, color = '#2F5BEA' }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  if (!series || series.length < 2) return <div class="empty small">Pas encore de données.</div>;
  const W = 640, H = height, padL = 44, padR = 14, padT = 12, padB = 26;
  const t0 = series[0].t, t1 = series[series.length - 1].t;
  const ymax = max != null ? max : Math.max(0.05, Math.ceil(Math.max(...series.map((d) => d.p)) * 10 + 0.5) / 10);
  const x = (t) => padL + ((t - t0) / Math.max(1, t1 - t0)) * (W - padL - padR);
  const y = (p) => padT + (1 - p / ymax) * (H - padT - padB);
  const line = series.map((d, i) => (i ? 'L' : 'M') + x(d.t).toFixed(1) + ' ' + y(d.p).toFixed(1)).join(' ');
  const area = line + ` L${x(t1).toFixed(1)} ${y(0)} L${x(t0).toFixed(1)} ${y(0)} Z`;
  const ticks = [0, ymax / 2, ymax];
  const xt = [0, 0.5, 1].map((k) => t0 + (t1 - t0) * k);
  const last = series[series.length - 1];
  const onMove = (e) => {
    const svg = ref.current; if (!svg) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    series.forEach((d, i) => { const dd = Math.abs(x(d.t) - px); if (dd < bd) { bd = dd; best = i; } });
    setHover(best);
  };
  const h = hover != null ? series[hover] : null;
  return (
    <figure style={{ margin: 0, position: 'relative' }}>
      <svg ref={ref} class="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={() => setHover(null)} tabindex="0"
        onKeyDown={(e) => { if (e.key === 'ArrowRight') setHover((v) => Math.min(series.length - 1, (v == null ? series.length - 2 : v) + 1)); if (e.key === 'ArrowLeft') setHover((v) => Math.max(0, (v == null ? series.length - 1 : v) - 1)); }}
        onBlur={() => setHover(null)}>
        {ticks.map((tk, i) => <g key={i}><line x1={padL} x2={W - padR} y1={y(tk)} y2={y(tk)} stroke="#EDEDF0" stroke-width="1" /><text x={padL - 8} y={y(tk) + 4} text-anchor="end">{fmtPct(tk, 0)}</text></g>)}
        {xt.map((t, i) => <text key={i} x={x(t)} y={H - 6} text-anchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>{fmtDate(t).slice(0, 5)}</text>)}
        <path d={area} fill={color} opacity="0.1" />
        <path d={line} fill="none" stroke={color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        <circle cx={x(last.t)} cy={y(last.p)} r="4.5" fill={color} stroke="#fff" stroke-width="2" />
        {h && <g><line x1={x(h.t)} x2={x(h.t)} y1={padT} y2={H - padB} stroke="#AEAEB2" stroke-width="1" /><circle cx={x(h.t)} cy={y(h.p)} r="4.5" fill={color} stroke="#fff" stroke-width="2" /></g>}
      </svg>
      {h && (
        <div style={{ position: 'absolute', top: '6px', left: Math.min(78, Math.max(8, (x(h.t) / W) * 100)) + '%', transform: 'translateX(-50%)', background: '#1D1D1F', color: '#fff', borderRadius: '8px', padding: '6px 10px', fontSize: '.78rem', pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: 'var(--shadow-2)' }} role="status">
          <strong style={{ fontSize: '.92rem' }}>{fmtPct(h.p)}</strong> · {fmtNum(h.v)} {L('votants', 'voters')}<br /><span style={{ opacity: 0.8 }}>{fmtDate(h.t)} {fmtTime(h.t)}</span>
        </div>
      )}
      <figcaption class="sr-only">{label}{L(' : ', ': ')}{fmtPct(last.p)}{L(' au ', ' on ')}{fmtDate(last.t)}.</figcaption>
    </figure>
  );
}

// Jauge circulaire simple (participation)
export function Ring({ value, size = 120, stroke = 12, color = '#2F5BEA', label }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EDEDF0" stroke-width={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} stroke-width={stroke} stroke-linecap="round" stroke-dasharray={`${c * Math.max(0, Math.min(1, value))} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray .5s ease' }} />
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" style={{ fontSize: size / 5.2 + 'px', fontWeight: 600, fill: '#1D1D1F', fontFamily: 'var(--font)' }}>{fmtPct(value, 1)}</text>
    </svg>
  );
}
