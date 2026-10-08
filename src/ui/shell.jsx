// Gabarits de pages : barre de démonstration, badge « Propulsé par », coques publique / back-office / électeur.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon, Mark, ShutterShield, VoteBaseMark } from './icons.jsx';
import { Btn, Modal, Switch, toast } from './kit.jsx';
import { dispatch, getState, useStore } from '../lib/store.js';
import { href, go } from '../lib/router.js';
import { t, L } from '../lib/i18n.js';
import { fmtDT, fmtTime } from '../lib/format.js';
import { tx } from '../lib/tx.js';

const P = [
  { sol: 'distance', id: 'admin', path: '/distance/admin', icon: 'settings', title: ['Administrateur', 'Administrator'], who: ['Paul Renaud · cellule élections', 'Paul Renaud · elections unit'], desc: ['Paramétrage, supervision, dépouillement, archives', 'Setup, monitoring, counting, archives'] },
  { sol: 'distance', id: 'organisateur', path: '/distance/bureau', icon: 'seal', title: ['Bureau de vote', 'Polling station'], who: ['Hélène Garnier · présidente', 'Hélène Garnier · chair'], desc: ['Clés, participation, clôture, résultats', 'Keys, turnout, closing, results'] },
  { sol: 'distance', id: 'votant', path: '/distance/electeur', icon: 'ballot', title: ['Électeur', 'Voter'], who: ['Camille Martin ou Dr Julien Lefèvre', 'Camille Martin or Dr Julien Lefèvre'], desc: ['Connexion, vote, accusé, vérification', 'Sign in, vote, receipt, verification'] },
  { sol: 'seance', id: 'admin', path: '/seance/admin', icon: 'settings', title: ['Administrateur', 'Administrator'], who: ['Isabelle Roux · affaires générales', 'Isabelle Roux · general affairs'], desc: ['Instances, membres, sécurité, abonnement', 'Bodies, members, security, subscription'] },
  { sol: 'seance', id: 'organisateur', path: '/seance/organisateur', icon: 'gavel', title: ['Organisateur de séance', 'Meeting organiser'], who: ['Claire Fontaine · secrétaire de la CME', 'Claire Fontaine · CME secretary'], desc: ['Ordre du jour, console, quorum, PV', 'Agenda, console, quorum, minutes'] },
  { sol: 'seance', id: 'votant', path: '/seance/participant', icon: 'hand', title: ['Participant', 'Participant'], who: ['Dr Sophie Bernard · membre de la CME', 'Dr Sophie Bernard · CME member'], desc: ['Accès par lien, QR code ou PIN, vote', 'Join by link, QR code or PIN, vote'] },
];
const pick = (x) => (Array.isArray(x) ? L(x[0], x[1]) : x);
// Profils de démonstration exigés au CRT, libellés dans la langue courante
export const profiles = () => P.map((p) => ({ ...p, title: pick(p.title), who: pick(p.who), desc: pick(p.desc) }));
export const PROFILES = P;

function useDismiss(open, setOpen, ref) {
  useEffect(() => {
    if (!open) return;
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const k = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', f); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', f); document.removeEventListener('keydown', k); };
  }, [open]);
}

export function LangToggle() {
  const st = getState();
  return (
    <div class="lang-seg" role="group" aria-label={L('Langue', 'Language')}>
      {[['fr', 'FR', 'Français'], ['en', 'EN', 'English']].map(([k, l, full]) => <button key={k} lang={k} aria-pressed={st.settings.lang === k ? 'true' : 'false'} aria-label={full} title={full} onClick={() => dispatch('settings/set', { key: 'lang', value: k })}>{l}</button>)}
    </div>
  );
}

export function DemoBar() {
  const st = useStore();
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const ref = useRef(null);
  const ref2 = useRef(null);
  useDismiss(open, setOpen, ref);
  useDismiss(more, setMore, ref2);
  const list = profiles();
  const item = (p) => <a role="menuitem" key={p.path} href={href(p.path)} onClick={() => setOpen(false)}><Icon name={p.icon} size={18} /><span><span>{p.title}</span><span class="db-who">{p.who}</span></span></a>;
  return (
    <div class="demo-bar" role="region" aria-label={L('Bandeau de démonstration', 'Demo bar')}>
      <div class="container" style={{ maxWidth: 'none' }}>
        <a class="db-btn" href={href('/')} aria-label={L('Accueil de la démonstration', 'Demo home')}><span class="demo-tag">{L('Démo', 'Demo')}</span></a>
        <span class="db-text">{L('Données fictives', 'Fictitious data')}</span>
        <div class="db-actions">
          <div class="db-menu" ref={ref}>
            <button class="db-btn" aria-expanded={open ? 'true' : 'false'} aria-haspopup="true" onClick={() => setOpen(!open)}><Icon name="users" size={14} /><span>{L('Profils', 'Profiles')}</span><Icon name="chevronDown" size={14} /></button>
            {open && (
              <div class="db-pop" role="menu">
                <div class="db-grp">{L('Vote à distance', 'Remote voting')}</div>
                {list.filter((p) => p.sol === 'distance').map(item)}
                <div class="db-grp">{L('Vote en séance', 'Meeting voting')}</div>
                {list.filter((p) => p.sol === 'seance').map(item)}
                <div class="db-sep" />
                <a role="menuitem" href={href('/distance/verifier')} onClick={() => setOpen(false)}><Icon name="search" size={18} />{L('Vérifier un bulletin', 'Verify a ballot')}</a>
                <a role="menuitem" href={href('/seance/projection/cme')} onClick={() => setOpen(false)} target="_blank" rel="noopener"><Icon name="tv" size={18} />{L('Écran de projection', 'Projection screen')}</a>
                <a role="menuitem" href={href('/conformite')} onClick={() => setOpen(false)}><Icon name="fileCheck" size={18} />{L('Matrice CCTP', 'CCTP matrix')}</a>
              </div>
            )}
          </div>
          <LangToggle />
          <div class="db-menu" ref={ref2}>
            <button class="db-btn" aria-expanded={more ? 'true' : 'false'} aria-haspopup="true" aria-label={L('Options de la démonstration', 'Demo options')} title={L('Options', 'Options')} onClick={() => setMore(!more)}><Icon name="settings" size={14} /></button>
            {more && (
              <div class="db-pop" role="menu" style={{ width: 'min(280px, 92vw)' }}>
                <button class="db-item" role="menuitemcheckbox" aria-checked={st.settings.refs ? 'true' : 'false'} onClick={() => dispatch('settings/set', { key: 'refs', value: !st.settings.refs })}><Icon name={st.settings.refs ? 'check' : 'fileCheck'} size={16} />{L('Renvois CCTP', 'CCTP references')}<span class="xs muted" style={{ marginLeft: 'auto' }}>{st.settings.refs ? L('affichés', 'shown') : L('masqués', 'hidden')}</span></button>
                <button class="db-item" role="menuitem" onClick={() => { setMore(false); setConfirm(true); }}><Icon name="refresh" size={16} />{L('Réinitialiser la démo', 'Reset the demo')}</button>
              </div>
            )}
          </div>
        </div>
      </div>
      {confirm && (
        <Modal title={L('Réinitialiser la démonstration ?', 'Reset the demo?')} onClose={() => setConfirm(false)} size="s" footer={<><Btn onClick={() => setConfirm(false)}>{L('Annuler', 'Cancel')}</Btn><Btn kind="primary" onClick={() => { dispatch('demo/reset', {}); setConfirm(false); toast(L('Démonstration réinitialisée', 'Demo reset'), 'ok'); go('/'); }}>{L('Réinitialiser', 'Reset')}</Btn></>}>
          <p class="muted mb-0">{L('Votes, séances et journaux reviennent à leur état initial, dans tous les onglets.', 'Votes, meetings and logs return to their initial state in every tab.')}</p>
        </Modal>
      )}
    </div>
  );
}

export function PoweredBy() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const k = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open]);
  return (
    <>
      {open && (
        <div class="powered-pop" role="dialog" aria-label={L('À propos de la solution', 'About the solution')}>
          <div class="row-between"><h3 style={{ margin: 0 }}>{L('Une solution du groupement', 'A consortium solution')}</h3><button class="btn btn-ghost btn-icon btn-sm" aria-label={L('Fermer', 'Close')} onClick={() => setOpen(false)}><Icon name="x" size={18} /></button></div>
          <div class="stack stack-s mt-12">
            <div class="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}><VoteBaseMark size={22} /><div><strong>VoteBase</strong><div class="small muted">{L('Plateforme, portails, exploitation, assistance.', 'Platform, portals, operations, support.')}</div></div></div>
            <div class="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}><ShutterShield size={22} /><div><strong>Shutter</strong> <span class="small muted">(brainbot)</span><div class="small muted">{L('Chiffrement à seuil, dépouillement vérifiable, scellement.', 'Threshold encryption, verifiable counting, sealing.')}</div></div></div>
          </div>
          <a class="btn btn-sm mt-16" href={href('/a-propos')} onClick={() => setOpen(false)}>{L('Architecture et sécurité', 'Architecture and security')}<Icon name="arrowRight" size={16} /></a>
        </div>
      )}
      <button class="powered" onClick={() => setOpen(!open)} aria-expanded={open ? 'true' : 'false'} aria-label={L('Propulsé par VoteBase et Shutter : en savoir plus', 'Powered by VoteBase and Shutter: learn more')}>
        <span class="pw-lbl">{L('Propulsé par', 'Powered by')}</span>
        <span class="pw-vb"><VoteBaseMark size={14} />VoteBase</span>
        <span class="pw-amp">&amp;</span>
        <span class="pw-sh"><ShutterShield size={14} />Shutter</span>
      </button>
    </>
  );
}

export function Brand({ sub, to = '/' }) {
  return (
    <a class="brand" href={href(to)}>
      <span class="b-mark"><Mark size={32} /></span>
      <span><span class="b-name" style={{ display: 'block' }}>{L('Vote électronique', 'E-voting')}</span>{sub !== '' && <span class="b-sub">{sub || L('Démonstration', 'Demo')}</span>}</span>
    </a>
  );
}

export function PublicShell({ children, current }) {
  const nav = [['/', L('Démo', 'Demo')], ['/conformite', L('Conformité', 'Compliance')], ['/a-propos', L('Sécurité', 'Security')], ['/accessibilite', L('Accessibilité', 'Accessibility')]];
  return (
    <>
      <header class="pub-header">
        <div class="container">
          <div class="pub-nav-pill">
            <Brand />
            <nav class="pub-nav" aria-label={L('Navigation principale', 'Main navigation')}>
              {nav.map(([p, l]) => <a key={p} href={href(p)} aria-current={current === p ? 'page' : undefined}>{l}</a>)}
            </nav>
          </div>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer class="pub-footer">
        <div class="container stack stack-s">
          <div class="foot-row">
            <a href={href('/conformite')}>{L('Matrice de conformité', 'Compliance matrix')}</a>
            <a href={href('/accessibilite')}>{L('Accessibilité', 'Accessibility')}</a>
            <a href={href('/a-propos')}>{L('Architecture et sécurité', 'Architecture and security')}</a>
            <a href={href('/mentions')}>{L('Données de la démo', 'Demo data')}</a>
          </div>
          <div>{L('AOO Resah n° 2026-R032-000-000 · données fictives · aucun cookie, aucun traceur.', 'Resah tender 2026-R032-000-000 · fictitious data · no cookies, no trackers.')}</div>
        </div>
      </footer>
    </>
  );
}

export function BackOffice({ brandSub, nav, current, user, context, children, onLogout }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [current]);
  return (
    <div class="bo">
      {open && <div class="side-scrim" onClick={() => setOpen(false)} />}
      <aside class={'bo-side ' + (open ? 'open' : '')} aria-label={L('Menu de l’espace', 'Section menu')}>
        <Brand sub={brandSub} />
        <nav class="bo-nav" aria-label="Sections">
          {nav.map((g, gi) => (
            <div key={gi}>
              {g.group && <div class="bo-nav-grp">{g.group}</div>}
              {g.items.map((it) => <a key={it.path} href={href(it.path)} aria-current={current === it.path ? 'page' : undefined}><Icon name={it.icon} size={17} />{it.label}{it.badge ? <span class="nav-badge">{it.badge}</span> : null}</a>)}
            </div>
          ))}
        </nav>
      </aside>
      <div class="bo-main">
        <div class="bo-top">
          <button class="btn btn-sm menu-btn" onClick={() => setOpen(true)} aria-label={L('Ouvrir le menu', 'Open menu')}><Icon name="menu" size={18} />Menu</button>
          <div class="bo-ctx">{context}</div>
          <div class="bo-a11y"><Popover label="" ariaLabel={L('Accessibilité : contraste, taille du texte, espacement', 'Accessibility: contrast, text size, spacing')} icon="a11y"><A11yPanel /></Popover></div>
          {user && (
            <div class="bo-user">
              <span class="avatar" aria-hidden="true">{user.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
              <span class="small" style={{ lineHeight: 1.2 }}><span style={{ fontWeight: 500 }}>{user.name}</span><br /><span class="muted xs">{user.role}</span></span>
              <Btn size="sm" kind="ghost" icon="logout" onClick={onLogout} aria-label={L('Se déconnecter', 'Sign out')} title={L('Se déconnecter', 'Sign out')} />
            </div>
          )}
        </div>
        <MaintenanceBanner />
        <main id="main" class="bo-content">{children}</main>
      </div>
    </div>
  );
}

// Annonce d'une intervention planifiée, diffusée à tous les utilisateurs (CCTP 6.2.3)
export function MaintenanceBanner() {
  const st = useStore();
  const m = st.maintenance;
  const [hidden, setHidden] = useState(false);
  if (!m || hidden || m.end < Date.now()) return null;
  return (
    <div class="maint-banner" role="status">
      <Icon name="calendar" size={18} />
      <div class="grow small"><strong>{L('Maintenance programmée', 'Scheduled maintenance')}</strong> · {fmtDT(m.start)} → {fmtTime(m.end)}{m.msg ? ' · ' + tx(m.msg) : ''}</div>
      <button class="btn btn-xs btn-ghost" onClick={() => setHidden(true)} aria-label={L('Masquer cette annonce', 'Hide this notice')}><Icon name="x" size={14} /></button>
    </div>
  );
}

export function A11yPanel({ voter }) {
  const st = getState();
  const s = st.settings;
  const set = (key, value) => dispatch('settings/set', { key, value });
  return (
    <div class="stack stack-s">
      <Switch checked={!!s.contrast} onChange={(v) => set('contrast', v)} label={t('contrast')} />
      <Switch checked={!!s.dys} onChange={(v) => set('dys', v)} label={t('spacing')} />
      {voter && <Switch checked={!!s.falc} onChange={(v) => set('falc', v)} label={t('falc') + ' (FALC)'} />}
      <div>
        <div class="label mb-8">{t('textSize')}</div>
        <div class="seg" role="group" aria-label={t('textSize')}>
          {[0, 1, 2, 3].map((n) => <button key={n} aria-pressed={(s.font || 0) === n ? 'true' : 'false'} onClick={() => set('font', n)} style={{ fontSize: (0.8 + n * 0.12) + 'rem' }}>A{n ? '+'.repeat(n) : ''}</button>)}
        </div>
      </div>
    </div>
  );
}

export function Popover({ label, icon, children, align = 'right', pressed, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(open, setOpen, ref);
  return (
    <div class="rel" ref={ref}>
      <button class="tool-btn" aria-expanded={open ? 'true' : 'false'} aria-pressed={pressed ? 'true' : undefined} aria-label={ariaLabel} title={ariaLabel} onClick={() => setOpen(!open)}><Icon name={icon} size={16} />{label}</button>
      {open && <div class="pop" style={align === 'left' ? { left: 0, right: 'auto' } : null}>{children}</div>}
    </div>
  );
}

export function LangSwitch() {
  const st = getState();
  return (
    <div class="seg" role="group" aria-label={t('lang')}>
      {[['fr', 'FR', 'Français'], ['en', 'EN', 'English']].map(([k, l, full]) => <button key={k} lang={k} aria-pressed={st.settings.lang === k ? 'true' : 'false'} aria-label={full} onClick={() => dispatch('settings/set', { key: 'lang', value: k })}>{l}</button>)}
    </div>
  );
}
