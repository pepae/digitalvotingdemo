// Composants d'interface partagés (accessibles : rôles ARIA, focus, clavier).
import { useEffect, useRef, useState, useId } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { href } from '../lib/router.js';
import { initials } from '../lib/format.js';
import { L } from '../lib/lang.js';

export function Btn({ kind = 'secondary', size, icon, iconRight, block, children, class: cls = '', href: to, ...rest }) {
  const c = ['btn', kind && 'btn-' + kind, size && 'btn-' + size, block && 'btn-block', cls].filter(Boolean).join(' ');
  const inner = <>{icon && <Icon name={icon} size={size === 'sm' || size === 'xs' ? 16 : 18} />}{children}{iconRight && <Icon name={iconRight} size={size === 'sm' || size === 'xs' ? 16 : 18} />}</>;
  if (to) return <a class={c} href={to.startsWith('#') || to.startsWith('http') ? to : href(to)} {...rest}>{inner}</a>;
  return <button type="button" class={c} {...rest}>{inner}</button>;
}

export function Chip({ tone, icon, children, class: cls = '', ...rest }) {
  return <span class={'chip ' + (tone ? 'chip-' + tone : '') + ' ' + cls} {...rest}>{icon && <Icon name={icon} size={14} />}{children}</span>;
}

export function Ref({ c, label }) {
  // Objectifs de la recommandation CNIL (ex. « 2-05 CNIL ») : renvoi vers la liste des objectifs couverts
  if (/ CNIL$/.test(c)) {
    const code = c.replace(/ CNIL$/, '');
    return <a class="cctp" href={href('/a-propos?cnil=' + code)} title={L('Objectif ' + code + ' de la recommandation CNIL (délibération n° 2026-045)', 'CNIL recommendation objective ' + code + ' (deliberation 2026-045)')}>CNIL {code}</a>;
  }
  if (c === 'CRT') return <span class="cctp" title={L('Cadre de réponse technique de l’appel d’offres', 'Technical response framework of the tender')}>CRT</span>;
  return <a class="cctp" href={href('/conformite?ref=' + encodeURIComponent(c))} title={L('Exigence ' + (label || 'CCTP') + ' ' + c + ' : voir la matrice de conformité', 'Requirement ' + (label || 'CCTP') + ' ' + c + ': see the compliance matrix')}>{label || 'CCTP'} {c}</a>;
}
export function Refs({ list }) {
  return <span class="row refs" style={{ gap: '6px', display: 'inline-flex' }}>{list.map((c) => <Ref key={c} c={c} />)}</span>;
}

export function DemoNote({ children, title }) {
  return <div class="demo-note" role="note"><span class="demo-tag">{title || L('Démo', 'Demo')}</span>{children}</div>;
}

// Explication repliée derrière un petit bouton (i) : le texte reste accessible sans encombrer l'écran
export function Tip({ children, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const k = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', f); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', f); document.removeEventListener('keydown', k); };
  }, [open]);
  return (
    <span class="tip" ref={ref}>
      <button type="button" class="tip-btn" aria-expanded={open ? 'true' : 'false'} aria-label={label || L('Plus d’informations', 'More information')} onClick={() => setOpen(!open)}><Icon name="info" size={15} /></button>
      {open && <span class="tip-pop" role="note">{children}</span>}
    </span>
  );
}

// Détails repliables (« En savoir plus »)
export function More({ label, children, open }) {
  return <details class="more" open={open}><summary>{label || L('En savoir plus', 'Learn more')}</summary><div>{children}</div></details>;
}
export function Note({ tone = 'info', children, icon }) {
  return <div class={tone + '-note'} role={tone === 'err' ? 'alert' : undefined} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>{icon && <Icon name={icon} size={18} style={{ flex: 'none', marginTop: '2px' }} />}<div>{children}</div></div>;
}

export function Card({ title, sub, actions, children, class: cls = '', tight, head, id, ...rest }) {
  return (
    <section class={'card ' + (tight ? 'card-tight ' : '') + cls} aria-labelledby={title && id ? id : undefined} {...rest}>
      {(title || actions || head) && (
        <div class="card-head">
          <div class="grow">{title && <h2 id={id} style={{ fontSize: '1.08rem' }}>{title}</h2>}{sub && <p class="card-sub">{sub}</p>}{head}</div>
          {actions && <div class="row" style={{ gap: '8px' }}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHead({ title, sub, actions, crumbs, refs }) {
  return (
    <div class="page-head">
      <div class="grow">
        {crumbs && <nav class="crumbs" aria-label={L('Fil d’Ariane', 'Breadcrumb')}>{crumbs.map((c, i) => <span key={i}>{c[1] ? <a href={href(c[1])}>{c[0]}</a> : c[0]}{i < crumbs.length - 1 && ' / '}</span>)}</nav>}
        <h1>{title}</h1>
        {sub && <p class="ph-sub">{sub}</p>}
        {refs && <div class="mt-8"><Refs list={refs} /></div>}
      </div>
      {actions && <div class="ph-actions">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, sub, tone, icon }) {
  return (
    <div class={'kpi ' + (tone ? 'k-' + tone : '')}>
      <div class="k-label">{icon && <Icon name={icon} size={16} />}{label}</div>
      <div class="k-value">{value}</div>
      {sub && <div class="k-sub">{sub}</div>}
    </div>
  );
}

export function Progress({ value, tone, thin, thick, label }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return <div class={'progress ' + (tone ? 'p-' + tone : '') + (thin ? ' p-thin' : '') + (thick ? ' p-thick' : '')} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(pct)} aria-label={label}><span style={{ width: pct + '%' }} /></div>;
}
export function BarRow({ label, value, max, right, tone, color }) {
  const v = max ? value / max : 0;
  return (
    <div class="bar-row">
      <div class="ellipsis" title={typeof label === 'string' ? label : undefined}>{label}</div>
      <div class="progress" role="presentation"><span style={{ width: Math.max(0, Math.min(100, v * 100)) + '%', background: color }} /></div>
      <div class="br-val">{right}</div>
    </div>
  );
}

let toastId = 0;
const toastListeners = new Set();
let toasts = [];
export function toast(msg, tone = 'info', ms = 4200) {
  const id = ++toastId;
  toasts = [...toasts, { id, msg, tone }];
  toastListeners.forEach((f) => f(toasts));
  setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); toastListeners.forEach((f) => f(toasts)); }, ms);
}
export function Toasts() {
  const [list, setList] = useState(toasts);
  useEffect(() => { toastListeners.add(setList); return () => toastListeners.delete(setList); }, []);
  return (
    <div class="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div class={'toast t-' + t.tone} key={t.id}>
          <Icon name={t.tone === 'ok' ? 'checkCircle' : t.tone === 'err' ? 'alert' : t.tone === 'warn' ? 'alert' : 'info'} size={18} />
          <div>{t.msg}</div>
          <button class="t-x" aria-label={L('Fermer la notification', 'Close notification')} onClick={() => { toasts = toasts.filter((x) => x.id !== t.id); toastListeners.forEach((f) => f(toasts)); }}><Icon name="x" size={16} /></button>
        </div>
      ))}
    </div>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
export function Modal({ title, onClose, children, footer, size, icon, closeLabel }) {
  const ref = useRef(null);
  const tid = useId();
  useEffect(() => {
    const prev = document.activeElement;
    const el = ref.current;
    const first = el && (el.querySelector('[data-autofocus]') || el.querySelector('.modal-body ' + FOCUSABLE) || el.querySelector(FOCUSABLE));
    if (first) setTimeout(() => first.focus(), 20);
    const onKey = (e) => {
      if (e.key === 'Escape' && onClose) { e.preventDefault(); onClose(); }
      if (e.key === 'Tab' && el) {
        const items = [...el.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
        if (!items.length) return;
        const f = items[0], l = items[items.length - 1];
        if (e.shiftKey && document.activeElement === f) { e.preventDefault(); l.focus(); }
        else if (!e.shiftKey && document.activeElement === l) { e.preventDefault(); f.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const ov = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ov; if (prev && prev.focus) prev.focus(); };
  }, []);
  return (
    <div class="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div class={'modal ' + (size ? 'modal-' + size : '')} role="dialog" aria-modal="true" aria-labelledby={tid} ref={ref}>
        <div class="modal-head">
          <h2 id={tid}>{title}</h2>
          {onClose && <button class="btn btn-ghost btn-icon" onClick={onClose} aria-label={closeLabel || L('Fermer', 'Close')}><Icon name="x" /></button>}
        </div>
        <div class="modal-body">{children}</div>
        {footer && <div class="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange, label }) {
  const ref = useRef(null);
  const onKey = (e) => {
    const i = tabs.findIndex((t) => t.id === value);
    let n = null;
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
    if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') n = 0;
    if (e.key === 'End') n = tabs.length - 1;
    if (n != null) { e.preventDefault(); onChange(tabs[n].id); setTimeout(() => { const b = ref.current && ref.current.querySelector('[aria-selected="true"]'); b && b.focus(); }, 0); }
  };
  return (
    <div class="tabs" role="tablist" aria-label={label} ref={ref} onKeyDown={onKey}>
      {tabs.map((t) => <button key={t.id} role="tab" type="button" id={'tab-' + t.id} aria-selected={t.id === value ? 'true' : 'false'} tabindex={t.id === value ? 0 : -1} aria-controls={'panel-' + t.id} onClick={() => onChange(t.id)}>{t.label}{t.badge != null && <span class="chip chip-gray" style={{ marginLeft: '6px', padding: '0 7px' }}>{t.badge}</span>}</button>)}
    </div>
  );
}
export function TabPanel({ id, children }) {
  return <div role="tabpanel" id={'panel-' + id} aria-labelledby={'tab-' + id} tabindex="0">{children}</div>;
}

export function Field({ label, hint, error, children, id, required }) {
  return (
    <div class="field">
      {label && <label for={id}>{label}{required && <span aria-hidden="true" class="err-text"> *</span>}</label>}
      {children}
      {hint && <div class="hint" id={id + '-hint'}>{hint}</div>}
      {error && <div class="err" id={id + '-err'} role="alert"><Icon name="alert" size={16} />{error}</div>}
    </div>
  );
}
export function Input({ id, value, onInput, error, hint, ...rest }) {
  const desc = [hint && id + '-hint', error && id + '-err'].filter(Boolean).join(' ') || undefined;
  return <input class="input" id={id} value={value} onInput={(e) => onInput && onInput(e.currentTarget.value)} aria-invalid={error ? 'true' : undefined} aria-describedby={desc} {...rest} />;
}
export function Select({ id, value, onChange, options, ...rest }) {
  return <select class="select" id={id} value={value} onChange={(e) => onChange(e.currentTarget.value)} {...rest}>{options.map((o) => <option key={o[0]} value={o[0]}>{o[1]}</option>)}</select>;
}
export function Switch({ checked, onChange, label, hint }) {
  return (
    <label class="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span class="sw" aria-hidden="true" />
      <span>{label}{hint && <span class="hint" style={{ display: 'block', fontWeight: 400 }}>{hint}</span>}</span>
    </label>
  );
}
export function Check({ checked, onChange, children, disabled }) {
  return <label class="check"><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.currentTarget.checked)} /><span>{children}</span></label>;
}

export function Stepper({ steps, current, label }) {
  return (
    <ol class="stepper" aria-label={label || L('Progression', 'Progress')}>
      {steps.map((s, i) => <li key={i} class={i < current ? 'done' : i === current ? 'cur' : ''} aria-current={i === current ? 'step' : undefined}><span>{s}</span>{i < current && <span class="sr-only"> {L('(terminé)', '(done)')}</span>}</li>)}
    </ol>
  );
}

export function KV({ items }) {
  return <dl class="kv">{items.filter(Boolean).map(([k, v], i) => [<dt key={'k' + i}>{k}</dt>, <dd key={'v' + i}>{v}</dd>])}</dl>;
}

export function Avatar({ name, small }) {
  return <span class={'avatar ' + (small ? 'avatar-s' : '')} aria-hidden="true">{initials(name)}</span>;
}

export function Pager({ page, total, size, onPage }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <nav class="row-between mt-12" aria-label="Pagination">
      <span class="small muted">{page + 1} / {pages}</span>
      <div class="row" style={{ gap: '6px' }}>
        <Btn size="sm" kind="ghost" icon="chevronLeft" disabled={page <= 0} onClick={() => onPage(page - 1)} aria-label={L('Page précédente', 'Previous page')} />
        <Btn size="sm" kind="ghost" iconRight="chevronRight" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label={L('Page suivante', 'Next page')} />
      </div>
    </nav>
  );
}

export function CheckRow({ ok, wait, title, sub, right }) {
  return (
    <div class="check-row">
      <span class={'cr-ico ' + (wait ? 'cr-wait' : ok ? 'cr-ok' : 'cr-err')}>{wait ? <span class="spin spin-dark" /> : <Icon name={ok ? 'check' : 'x'} size={16} stroke={3} />}</span>
      <div class="grow"><div class="strong small">{title}</div>{sub && <div class="xs muted">{sub}</div>}</div>
      {right}
    </div>
  );
}

export function useDisclosure(initial = false) {
  const [open, setOpen] = useState(initial);
  return [open, () => setOpen(true), () => setOpen(false), setOpen];
}

export function CopyField({ value, label }) {
  return (
    <div class="input-group">
      <input class="input mono" readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} style={{ fontSize: '.82rem' }} />
      <Btn size="sm" icon="copy" onClick={() => { try { navigator.clipboard.writeText(value); toast(L('Lien copié', 'Link copied'), 'ok'); } catch (e) { toast(L('Copie impossible', 'Copy failed'), 'warn'); } }}>{L('Copier', 'Copy')}</Btn>
    </div>
  );
}

export function Empty({ icon = 'inbox', title, children }) {
  return <div class="empty"><Icon name={icon} size={34} /><div class="strong mt-8">{title}</div>{children && <div class="small mt-8">{children}</div>}</div>;
}
