// Portail électeur (vote à distance) : accueil, authentification, vote, accusé, aide, vérification.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useStore, useNow, dispatch } from '../lib/store.js';
import { t, L, curLang, tx } from '../lib/i18n.js';
import { go, href } from '../lib/router.js';
import { Btn, Chip, Modal, Note, DemoNote, Ref, Refs, Stepper, Field, toast, KV, Tabs, TabPanel, Tip } from '../ui/kit.jsx';
import { Icon, UnionLogo } from '../ui/icons.jsx';
import { LangSwitch, Popover, A11yPanel, MaintenanceBanner } from '../ui/shell.jsx';
import { brandStyle } from '../data/branding.js';
import { ESTAB, UNIONS, PROFESSIONS_DE_FOI, VOTERS, listCandidates, drawOrder, opName, voterL } from '../data/remote.js';
import { fmtPeriod, fmtDT, fmtDur, fmtTime, fmtNum, fmtDateLong, TZ } from '../lib/format.js';
import { sha256, groupFp } from '../lib/sha256.js';
import { randCode, randHex, randDigits, rng } from '../lib/prng.js';
import { printHtml, esc } from '../lib/exporters.js';
import { SUPPORT } from '../config.js';
import { urnCount } from '../lib/sim.js';

const en = () => curLang() === 'en';
// Les sigles (CSE, F3SCT, CME) restent identiques dans les deux langues
export const instName = (urn) => urn.instance;
export function instLong(urn) {
  if (!en()) return urn.instanceLong;
  return { CSE: 'Social committee', F3SCT: 'Health, safety and working conditions committee', CME: 'Medical committee' }[urn.instance] || tx(urn.instanceLong);
}
export const collegeName = (urn) => tx(urn.college);
function modeText(urn) {
  if (urn.type === 'pluri') return L('Plurinominal majoritaire à deux tours', 'Two-round majority vote');
  return L('Liste à un tour, proportionnelle à la plus forte moyenne', 'Single-round list vote, proportional (highest average)');
}
function opStatusKey(op, now) {
  if (op.status === 'suspended') return 'suspended';
  if (now < op.open) return 'notyet';
  if (op.status === 'open' && now <= op.close) return 'open';
  if (op.status === 'open' && now > op.close) return 'ended';
  if (op.status === 'ended') return 'ended';
  return 'closed';
}
const statusTone = (k) => (k === 'open' ? 'ok' : k === 'suspended' ? 'warn' : 'gray');
const statusIcon = (k) => (k === 'open' ? 'checkCircle' : k === 'suspended' ? 'pause' : 'clock');
const masked = (v) => v.login.replace(/-(\d{4})-/, '-••••-');
// Période courte : « 30 sept. 08:00 → 21 oct. 17:00 (heure de Paris) »
const dayMonth = (ts) => new Intl.DateTimeFormat(en() ? 'en-GB' : 'fr-FR', { timeZone: TZ, day: 'numeric', month: 'short' }).format(ts);
const shortPeriod = (op) => `${dayMonth(op.open)} ${fmtTime(op.open)} → ${dayMonth(op.close)} ${fmtTime(op.close)}` + L(' (heure de Paris)', ' (Paris time)');
const logout = () => { dispatch('auth/logout', { key: 'r_voter' }); go('/distance/electeur'); };
// Personnalisation : la couleur de l'établissement devient l'accent (boutons, liens, sélection)
const voterBrand = (b) => brandStyle(b);

// ------------------------------------------------------------------ Coque
function VoterShell({ children, op, user, band }) {
  const st = useStore();
  const b = st.remote.branding || {};
  return (
    <div lang={st.settings.lang} style={st.settings.contrast ? null : voterBrand(b)}>
      <header class="vt-header">
        <div class="vt-in">
          <a class="vt-estab" href={href('/distance/electeur')} style={{ textDecoration: 'none' }}>
            <span class="e-mark">{b.logo === 'monogram' ? <span class="e-mono" aria-hidden="true">CHU</span> : <Icon name={b.logo === 'heart' ? 'heartPulse' : 'building'} size={24} />}</span>
            <span><span class="e-name" style={{ display: 'block' }}>{ESTAB.name}</span><span class="e-sub">{op ? opName(op) : L('Espace électeur', 'Voter area')} · {L('établissement fictif', 'fictitious hospital')}</span></span>
          </a>
          <div class="vt-tools">
            <LangSwitch />
            <Popover label={t('a11y')} icon="a11y"><A11yPanel voter /></Popover>
            <a class="tool-btn" href={href('/distance/electeur/aide')}><Icon name="help" size={16} />{t('help')}</a>
            {user && <button class="tool-btn" onClick={() => { logout(); toast(L('Vous êtes déconnecté(e).', 'You are logged out.'), 'ok'); }}><Icon name="logout" size={16} />{t('logout')}</button>}
          </div>
        </div>
      </header>
      <MaintenanceBanner />
      {band}
      <main id="main">{children}</main>
      <footer class="vt-footer">
        <div class="vt-in">
          <span>{L('Assistance', 'Support')} {SUPPORT.phone} · {L('gratuit, 24 h/24', 'free, 24/7')}</span>
          <span class="row" style={{ gap: '4px 16px' }}>
            <a href={href('/distance/electeur/aide?tab=donnees')}>{t('help.data')}</a>
            <a href={href('/accessibilite')}>{L('Accessibilité', 'Accessibility')}</a>
            <a href={href('/distance/verifier')}>{t('help.verify')}</a>
          </span>
        </div>
      </footer>
    </div>
  );
}

function StatusBand({ op, title, sub }) {
  const now = useNow(1000);
  const k = opStatusKey(op, now);
  return (
    <div class="vt-band">
      <div class="vt-in center" style={{ maxWidth: '640px' }}>
        <h1 style={{ marginBottom: '8px' }}>{title}</h1>
        {sub && <p class="muted" style={{ fontSize: '1.08rem', margin: '0 0 16px' }}>{sub}</p>}
        <div class="row" style={{ justifyContent: 'center', gap: '8px 12px' }}>
          <Chip tone={statusTone(k)} icon={statusIcon(k)}>{t('status.' + k)}</Chip>
          {k === 'open' && <span class="small muted">{t('closesIn')} <span class="timer" style={{ color: 'var(--text)' }}>{fmtDur(op.close - now)}</span></span>}
          <Ref c="3.2" />
        </div>
        <div class="xs muted mt-8">{shortPeriod(op)}</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Accueil + connexion
export function VoterWelcome({ q }) {
  const st = useStore();
  const auth = st.auth.r_voter;
  const [persona, setPersona] = useState(q.e === 'julien' ? 'julien' : 'camille');
  const [chat, setChat] = useState(false);
  const v = VOTERS[persona];
  const op = st.remote.ops[v.op];
  const falc = st.settings.falc;
  const lg = curLang();
  useEffect(() => { document.title = L('Espace électeur', 'Voter area') + ' · ' + opName(op); }, [op, lg]);
  const now = useNow(5000);
  const sk = opStatusKey(op, now);
  const br = st.remote.branding || {};
  const title = br['title_' + lg] || t('w.title');
  const lead = (!falc && br['lead_' + lg]) || t('w.lead');
  const thr = st.remote.security.threshold;
  const steps = [['w.s1', 'login'], ['w.s2', 'list'], ['w.s3', 'lock'], ['w.s4', 'fileCheck']];
  return (
    <VoterShell op={op} band={<StatusBand op={op} title={title} sub={lead} />}>
      <div class="vt-main" style={{ maxWidth: '600px' }}>
        <div class="stack">
          {sk !== 'open' && <Note tone={sk === 'suspended' ? 'warn' : 'info'} icon={sk === 'suspended' ? 'pause' : sk === 'notyet' ? 'clock' : 'lock'}>{t('w.note.' + sk)}{sk === 'closed' && <> <a href={href('/distance/verifier')}>{t('help.verify')}</a></>}</Note>}
          {auth ? (
            <div class="card center">
              <h2>{L('Vous êtes connecté(e)', 'You are signed in')}</h2>
              <p class="muted">{VOTERS[auth.voterId].name}</p>
              <Btn kind="primary" href="/distance/electeur/scrutins" iconRight="arrowRight">{t('s.list')}</Btn>
            </div>
          ) : <LoginCard key={persona} persona={persona} />}

          {falc ? (
            <section class="card" aria-labelledby="h-how">
              <h2 id="h-how">{t('w.how')}</h2>
              <ol class="list-plain stack stack-s">
                {steps.map(([k, ic], i) => (
                  <li key={k} class="row" style={{ flexWrap: 'nowrap' }}>
                    <span class="tag-num" aria-hidden="true">{i + 1}</span>
                    <Icon name={ic} size={28} style={{ flex: 'none', color: 'var(--accent)' }} />
                    <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>{t(k)}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : (
            <section class="center" aria-labelledby="h-how" style={{ paddingTop: '8px' }}>
              <h2 id="h-how" class="muted" style={{ fontSize: '.85rem', fontWeight: 500, letterSpacing: 0, marginBottom: '10px' }}>{t('w.how')}</h2>
              <ol class="list-plain row small" style={{ justifyContent: 'center', gap: '8px 18px' }}>
                {steps.map(([k], i) => <li key={k} class="row" style={{ gap: '6px', flexWrap: 'nowrap' }}><span class="tag-num" aria-hidden="true">{i + 1}</span>{t(k)}</li>)}
              </ol>
            </section>
          )}

          <nav class="row small" aria-label={t('help')} style={{ justifyContent: 'center', gap: '6px 18px' }}>
            <a href={href('/distance/electeur/aide?tab=faq')}>{t('help.faq')}</a>
            <a href={href('/distance/electeur/aide?tab=tuto')}>{t('help.tuto')}</a>
            <a href={href('/distance/electeur/aide?tab=guide')}>{t('help.guide')}</a>
            <a href={href('/distance/electeur/liste')}>{t('help.list')}</a>
            <button class="linklike" style={{ fontWeight: 'inherit' }} onClick={() => setChat(true)}>{t('help.chat')}</button>
            <Refs list={['3.1', '2.8']} />
          </nav>

          <DemoNote>
            <div class="seg mt-8" role="group" aria-label={L('Électeur de démonstration', 'Demo voter')}>
              <button aria-pressed={persona === 'camille' ? 'true' : 'false'} onClick={() => setPersona('camille')}>{L('Camille Martin · EP 2026 · niveau 3', 'Camille Martin · EP 2026 · level 3')}</button>
              <button aria-pressed={persona === 'julien' ? 'true' : 'false'} onClick={() => setPersona('julien')}>{L('Dr Julien Lefèvre · CME 2026 · niveau 2', 'Dr Julien Lefèvre · CME 2026 · level 2')}</button>
            </div>
            <div class="small mt-8">
              {L('Identifiant', 'Identifier')} <span class="cred">{v.login}</span>, {L('mot de passe', 'password')} <span class="cred">{v.password}</span>, {L('naissance', 'born')} <span class="cred">{v.birth}</span>, {v.factor === 'totp' ? L('code TOTP affiché à l’étape 3.', 'TOTP code shown at step 3.') : L('code par SMS simulé.', 'simulated SMS code.')}
            </div>
            <div class="small mt-8">{L(`Astuce : ${thr} mauvais mots de passe verrouillent le compte.`, `Tip: ${thr} wrong passwords lock the account.`)}</div>
          </DemoNote>
        </div>
      </div>
      {chat && <ChatModal onClose={() => setChat(false)} />}
    </VoterShell>
  );
}

function totpCode(win) {
  const h = sha256('totp-camille-' + win);
  return String(parseInt(h.slice(0, 8), 16) % 1000000).padStart(6, '0');
}

function TotpWidget() {
  const now = useNow(500);
  const win = Math.floor(now / 30000);
  const left = 30 - Math.floor((now % 30000) / 1000);
  const r = 14, c = 2 * Math.PI * r;
  return (
    <div class="phone-note" aria-live="off">
      <div class="pn-app"><span>{L('Application d’authentification (simulée)', 'Authenticator app (simulated)')}</span><span>{left} s</span></div>
      <div class="totp">
        <svg class="ring" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r={r} stroke="rgba(255,255,255,.2)" stroke-width="4" fill="none" /><circle cx="17" cy="17" r={r} style={{ stroke: 'var(--green-dot)' }} stroke-width="4" fill="none" stroke-dasharray={`${(c * left) / 30} ${c}`} transform="rotate(-90 17 17)" /></svg>
        <div><div class="xs" style={{ opacity: 0.75 }}>CHU Montclair · Vote 2026</div><div class="tp-code">{totpCode(win).replace(/(\d{3})(\d{3})/, '$1 $2')}</div></div>
      </div>
    </div>
  );
}

function LoginCard({ persona }) {
  const st = useStore();
  const now = useNow(1000);
  const [step, setStep] = useState(1);
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [birth, setBirth] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [who, setWho] = useState(null);
  const [sms, setSms] = useState(null);
  const v = who ? VOTERS[who] : VOTERS[persona];
  const vs = st.remote.voters[v.id];
  const locked = vs.lockedUntil && vs.lockedUntil > now;
  const total = 3;
  const thr = st.remote.security.threshold;

  const fill = () => {
    setErr('');
    if (step === 1) { setId(v.login); setPw(v.password); }
    if (step === 2) setBirth(v.birth);
    if (step === 3) setCode(v.factor === 'totp' ? totpCode(Math.floor(Date.now() / 30000)) : sms || '');
  };
  const submit1 = (e) => {
    e.preventDefault();
    const match = Object.values(VOTERS).find((x) => x.login.toLowerCase() === id.trim().toLowerCase());
    const target = match || VOTERS[persona];
    const tvs = st.remote.voters[target.id];
    if (tvs.lockedUntil && tvs.lockedUntil > Date.now()) { setWho(target.id); return; }
    if (!match || match.password !== pw.trim()) {
      dispatch('r/voter/fail', { voterId: target.id, op: target.op, masked: masked(target) });
      const fails = (tvs.fails || 0) + 1;
      setWho(target.id);
      setErr(t('login.bad') + ' ' + (fails < thr ? t('login.left', { n: thr - fails }) : ''));
      return;
    }
    setErr(''); setWho(match.id); setStep(2);
  };
  const submit2 = (e) => {
    e.preventDefault();
    const norm = (s) => s.replace(/\D/g, '');
    if (norm(birth) !== norm(v.birth)) { setErr(t('login.badQ')); return; }
    setErr(''); setStep(3);
    if (v.factor === 'sms') { const c = randDigits(6); setSms(c); }
  };
  const submit3 = (e) => {
    e.preventDefault();
    const c = code.replace(/\s/g, '');
    const win = Math.floor(Date.now() / 30000);
    const ok = v.factor === 'totp' ? (c === totpCode(win) || c === totpCode(win - 1)) : c === sms;
    if (!ok) { setErr(t('login.badCode')); return; }
    dispatch('r/voter/ok', { voterId: v.id });
    dispatch('auth/login', { key: 'r_voter', user: { voterId: v.id } });
    go('/distance/electeur/scrutins');
  };
  const errBox = err && <div class="err" role="alert"><Icon name="alert" size={16} />{err}</div>;
  const fillBtn = <Btn size="sm" kind="ghost" icon="wand" onClick={fill}>{L('Remplir (démo)', 'Fill in (demo)')}</Btn>;

  if (locked) {
    return (
      <section class="card center" aria-labelledby="h-locked">
        <div class="big-ok"><span class="lock-ico"><Icon name="lock" size={34} /></span><h2 id="h-locked" class="mb-0">{t('login.locked.title')}</h2></div>
        <p class="muted mt-8">{t('login.locked.text', { time: fmtTime(vs.lockedUntil) })} <Refs list={['2.7', '3.1']} /></p>
        <div class="row" style={{ justifyContent: 'center' }}>
          <a class="btn btn-primary" href={'tel:' + SUPPORT.phone.replace(/\s/g, '')}><Icon name="phone" size={18} />{SUPPORT.phone}</a>
          <Btn href="/distance/electeur/identifiants" icon="key">{t('login.lost')}</Btn>
        </div>
        <div class="mt-16" style={{ textAlign: 'left' }}>
          <DemoNote>{L('Le bureau de vote a reçu une alerte.', 'The polling station has been alerted.')} <a href={href('/distance/bureau/alertes')}>{L('Voir', 'View')}</a><br /><button class="linklike" onClick={() => { dispatch('r/voter/unlock', { voterId: v.id, masked: masked(v), op: v.op, by: 'Assistance (démo)' }); setErr(''); setStep(1); }}>{L('Simuler le déblocage par l’assistance', 'Simulate a support unlock')}</button></DemoNote>
        </div>
      </section>
    );
  }

  return (
    <section class="card" aria-labelledby="h-login">
      <div class="row-between mb-16"><h2 id="h-login" class="mb-0">{t('login.title')}</h2><span class="small muted">{t('login.step', { n: step, t: total })} <Ref c="3" /></span></div>
      {step === 1 && (
        <form onSubmit={submit1} class="stack" noValidate>
          <Field label={t('login.id')} id="v-id" hint={t('login.idHint')} required>
            <input class="input mono" id="v-id" autocomplete="username" value={id} onInput={(e) => setId(e.currentTarget.value)} aria-describedby="v-id-hint" aria-invalid={err ? 'true' : undefined} required />
          </Field>
          <Field label={t('login.pw')} id="v-pw" hint={t('login.pwHint')} required>
            <div class="input-group">
              <input class="input mono" id="v-pw" type={show ? 'text' : 'password'} autocomplete="current-password" value={pw} onInput={(e) => setPw(e.currentTarget.value)} aria-describedby="v-pw-hint" aria-invalid={err ? 'true' : undefined} required />
              <Btn size="sm" icon={show ? 'eyeOff' : 'eye'} onClick={() => setShow(!show)} aria-pressed={show ? 'true' : 'false'}>{show ? t('login.hide') : t('login.show')}</Btn>
            </div>
          </Field>
          {errBox}
          <div class="row-between">
            <a class="small" href={href('/distance/electeur/identifiants')}>{t('login.lost')}</a>
            <div class="row">{fillBtn}<button type="submit" class="btn btn-primary">{t('login.continue')}<Icon name="arrowRight" size={18} /></button></div>
          </div>
        </form>
      )}
      {step === 2 && (
        <form onSubmit={submit2} class="stack" noValidate>
          <Field label={t('login.qLabel')} id="v-q" hint={t('login.qHint')} required>
            <input class="input" id="v-q" inputMode="numeric" value={birth} onInput={(e) => setBirth(e.currentTarget.value)} aria-describedby="v-q-hint" aria-invalid={err ? 'true' : undefined} autocomplete="off" />
          </Field>
          {errBox}
          <div class="row-between">
            <Btn size="sm" kind="ghost" icon="arrowLeft" onClick={() => { setStep(1); setErr(''); }}>{t('back')}</Btn>
            <div class="row">{fillBtn}<button type="submit" class="btn btn-primary">{t('login.continue')}<Icon name="arrowRight" size={18} /></button></div>
          </div>
        </form>
      )}
      {step === 3 && (
        <form onSubmit={submit3} class="stack" noValidate>
          <Field label={t('login.factor')} id="v-code" hint={v.factor === 'totp' ? t('login.totp') : t('login.sms', { phone: v.phone })} required>
            <input class="input input-code" id="v-code" inputMode="numeric" autocomplete="one-time-code" maxLength={7} value={code} onInput={(e) => setCode(e.currentTarget.value)} aria-describedby="v-code-hint" aria-invalid={err ? 'true' : undefined} />
          </Field>
          {errBox}
          {v.factor === 'totp' ? <TotpWidget /> : sms && (
            <div class="phone-note" role="note"><div class="pn-app"><span>{L('SMS · VOTE-CHU (simulé)', 'Text · VOTE-CHU (simulated)')}</span><span>{L('maintenant', 'now')}</span></div>{L('Votre code de vote : ', 'Your voting code: ')}<strong class="mono">{sms}</strong>. {L('Valable 5 min. Ne le communiquez à personne.', 'Valid 5 min. Never share it.')}</div>
          )}
          {v.factor === 'sms' && <div><button type="button" class="linklike small" onClick={() => { setSms(randDigits(6)); toast(L('Nouveau code envoyé', 'New code sent'), 'ok'); }}><Icon name="refresh" size={14} /> {t('login.resend')}</button></div>}
          <div class="row-between">
            <Btn size="sm" kind="ghost" icon="arrowLeft" onClick={() => { setStep(2); setErr(''); }}>{t('back')}</Btn>
            <div class="row">{fillBtn}<button type="submit" class="btn btn-primary">{L('Se connecter', 'Sign in')}<Icon name="login" size={18} /></button></div>
          </div>
        </form>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ Mes scrutins
function useVoter() {
  const st = useStore();
  const a = st.auth.r_voter;
  useEffect(() => { if (!a) go('/distance/electeur'); }, [a]);
  return a ? VOTERS[a.voterId] : null;
}

export function VoterScrutins() {
  const st = useStore();
  const now = useNow(1000);
  const v = useVoter();
  if (!v) return null;
  const op = st.remote.ops[v.op];
  const k = opStatusKey(op, now);
  document.title = t('s.list') + ' · ' + opName(op);
  const urns = v.urns.map((id) => st.remote.urns[id]);
  const vl = voterL(v);
  return (
    <VoterShell op={op} user={v}>
      <div class="vt-main vt-main-s">
        <h1 class="mb-8">{t('s.hello', { name: v.name })}</h1>
        <div class="row" style={{ gap: '8px 12px' }}>
          <Chip tone={statusTone(k)} icon={statusIcon(k)}>{t('status.' + k)}</Chip>
          {k === 'open' && <span class="small muted">{t('closesIn')} <span class="timer" style={{ color: 'var(--text)' }}>{fmtDur(op.close - now)}</span></span>}
        </div>
        {k !== 'open' && <div class="mt-16"><Note tone="warn" icon="clock">{k === 'suspended' ? t('w.note.suspended') : t('closed.text')}</Note></div>}

        <section class="mt-32" aria-labelledby="h-mine">
          <div class="row-between mb-12"><h2 id="h-mine" class="mb-0">{t('s.list')}</h2><Refs list={['3.2']} /></div>
          <div class="stack">
            {urns.map((u) => {
              const mv = st.remote.myVotes[u.id];
              const ku = u.suspendedAt && k === 'open' ? 'suspended' : k;
              const susp = ku === 'suspended' && k === 'open' && !mv;
              return (
                <div class="card" key={u.id}>
                  <div class="row-between row-top">
                    <div>
                      <h3 class="mb-0">{instName(u)} · {collegeName(u)}</h3>
                      <div class="small muted">{instLong(u)} · {t(u.seats > 1 ? 's.seats' : 's.seat', { n: u.seats })}</div>
                    </div>
                    {mv ? <Chip tone="ok" icon="checkCircle">{t('s.voted', { date: fmtDT(mv.at) })}</Chip> : susp && <Chip tone="warn" icon="pause">{t('status.suspended')}</Chip>}
                  </div>
                  {susp && <p class="small muted mt-8 mb-0">{L('Vos autres scrutins restent ouverts.', 'Your other elections stay open.')}</p>}
                  <div class="row mt-16">
                    {mv ? <Btn href={'/distance/electeur/recu/' + u.id} icon="fileCheck">{t('s.receipt')}</Btn> : <Btn kind="primary" href={'/distance/electeur/scrutin/' + u.id} disabled={ku !== 'open'} aria-disabled={ku !== 'open' ? 'true' : undefined} onClick={(e) => { if (ku !== 'open') e.preventDefault(); }} iconRight="arrowRight">{t('s.vote')}</Btn>}
                    <Btn kind="ghost" href={'/distance/electeur/scrutin/' + u.id + '?consult=1'} icon="list">{t('s.consult')}</Btn>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section class="card mt-24" aria-labelledby="h-info">
          <h2 id="h-info" style={{ fontSize: '1.05rem' }}>{t('s.info')}</h2>
          <KV items={[[t('s.job'), vl.title], [t('s.college'), vl.college], [t('s.site'), v.site], [t('s.bv'), v.site]]} />
        </section>
      </div>
    </VoterShell>
  );
}

// ------------------------------------------------------------------ Bulletin
function ProfModal({ unionId, onClose }) {
  const u = UNIONS[unionId];
  const p = PROFESSIONS_DE_FOI[unionId];
  return (
    <Modal title={L('Profession de foi · ', 'Manifesto · ') + u.acr} onClose={onClose} size="l" closeLabel={t('close')}>
      <div class="doc" lang="fr">
        <div class="doc-meta"><span>{u.name}</span><span>Document PDF original · 2 pages</span></div>
        <div class="row" style={{ flexWrap: 'nowrap' }}><UnionLogo u={u} size={56} /><h2 style={{ border: 0, margin: 0 }}>{p.title}</h2></div>
        <p class="mt-16">{p.intro}</p>
        <h2>Nos engagements</h2>
        <ul>{p.points.map((x) => <li key={x}>{x}</li>)}</ul>
        <p class="small" style={{ color: 'var(--text-2)' }}>Document fictif, publié tel que déposé par l’organisation syndicale.</p>
      </div>
      {en() && <p class="small muted mt-8">Original document in French.</p>}
    </Modal>
  );
}
function CandModal({ urn, unionId, onClose }) {
  const u = UNIONS[unionId];
  const cands = listCandidates(urn, unionId);
  return (
    <Modal title={L('Candidats · ', 'Candidates · ') + u.acr} onClose={onClose} closeLabel={t('close')}>
      <div class="table-wrap"><table class="table table-compact"><thead><tr><th>{L('N°', 'No.')}</th><th>{L('Nom', 'Name')}</th><th>{L('Grade', 'Grade')}</th><th>{t('s.site')}</th></tr></thead><tbody>
        {cands.map((c) => <tr key={c.rank}><td>{c.rank}</td><td class="strong">{c.name}</td><td>{c.grade}</td><td>{c.site}</td></tr>)}
      </tbody></table></div>
    </Modal>
  );
}

export function VoterBallot({ urnId, q }) {
  const st = useStore();
  const now = useNow(1000);
  const v = useVoter();
  const [step, setStep] = useState(0);
  const [choice, setChoice] = useState(null);
  const [multi, setMulti] = useState([]);
  const [confirm, setConfirm] = useState(false);
  const [proc, setProc] = useState(-1);
  const [prof, setProf] = useState(null);
  const [cands, setCands] = useState(null);
  const liveRef = useRef(null);
  if (!v) return null;
  const urn = st.remote.urns[urnId];
  const op = urn ? st.remote.ops[urn.op] : st.remote.ops[v.op];
  const eligible = urn && v.urns.includes(urnId);
  const k0 = opStatusKey(op, now);
  const k = urn && urn.suspendedAt && k0 === 'open' ? 'suspended' : k0;
  const consult = q.consult === '1';
  if (!eligible) {
    return (
      <VoterShell op={op} user={v}>
        <div class="vt-main vt-main-s">
          <div class="card center"><div class="big-ok"><span class="lock-ico"><Icon name="lock" size={32} /></span><h1 class="mb-0">{t('ne.title')}</h1></div><p class="muted mt-8">{t('ne.text')} <Ref c="3.2" /></p><Btn kind="primary" href="/distance/electeur/scrutins">{t('r.mine')}</Btn></div>
        </div>
      </VoterShell>
    );
  }
  const mv = st.remote.myVotes[urnId];
  if (mv && proc < 0) { setTimeout(() => go('/distance/electeur/recu/' + urnId), 0); return null; }
  document.title = L('Bulletin · ', 'Ballot · ') + instName(urn) + ' ' + collegeName(urn);
  const isPluri = urn.type === 'pluri';
  const order = isPluri ? null : drawOrder(urn);
  const nCands = (uid) => listCandidates(urn, uid).length + ' ' + L('candidat·e·s', 'candidates');
  const selectionLabel = () => {
    if (isPluri) return multi.includes('blanc') ? t('b.blank') : multi.map((id) => urn.candidates.find((c) => c.id === id).name).join(', ');
    return choice === 'blanc' ? t('b.blank') : UNIONS[choice].name + ' (' + UNIONS[choice].acr + ')';
  };
  const hasChoice = isPluri ? multi.length > 0 : !!choice;

  const cast = () => {
    setConfirm(false); setStep(3); setProc(0);
    const delays = [700, 650, 600, 650];
    let i = 0;
    const tick = () => {
      i++;
      setProc(i);
      if (i < 4) setTimeout(tick, delays[i]);
      else {
        const code = randCode(4, 4);
        const receipt = 'AR-' + (op.id === 'ep26' ? 'EP26' : 'CME26') + '-' + randCode(2, 4);
        const cipher = randHex(96);
        const fp = sha256(code + '|' + urnId + '|' + cipher);
        dispatch('r/vote', { urnId, voterId: v.id, choice: isPluri ? (multi.includes('blanc') ? 'blanc' : multi) : choice, receipt, code, fp, first: v.first, last: v.last, site: v.site, masked: masked(v) });
        setTimeout(() => go('/distance/electeur/recu/' + urnId), 500);
      }
    };
    setTimeout(tick, delays[0]);
  };

  const steps = [t('b.s1'), t('b.s2'), t('b.s3'), t('b.s4')];
  return (
    <VoterShell op={op} user={v}>
      <div class="vt-main vt-main-s">
        <nav class="crumbs" aria-label={L('Fil d’Ariane', 'Breadcrumb')}><a href={href('/distance/electeur/scrutins')}>{t('s.list')}</a></nav>
        <h1>{instName(urn)} · {collegeName(urn)}</h1>
        {!consult && <Stepper steps={steps} current={step} />}
        {k !== 'open' && !consult && <div class="mb-16"><Note tone="warn" icon={k === 'suspended' ? 'pause' : 'clock'}>{k === 'suspended' ? t('w.note.suspended') : t('closed.text')}</Note></div>}

        {(step === 0 || consult) && (
          <div class="stack">
            <section class="card" aria-labelledby="h-pres">
              <div class="row-between mb-12"><h2 id="h-pres" class="mb-0">{t('b.present')}</h2><Ref c="3.2" /></div>
              <KV items={[[L('Instance', 'Body'), instLong(urn)], [L('Sièges', 'Seats'), String(urn.seats)], [t('s.mode'), modeText(urn)], [t('period'), fmtPeriod(op.open, op.close)]]} />
            </section>
            <section class="card" aria-labelledby="h-cand">
              <div class="row mb-12" style={{ gap: '6px' }}><h2 id="h-cand" class="mb-0">{t('b.candidatures')}</h2>{!isPluri && <Tip>{t('b.order')}</Tip>}<Ref c="2.11" /></div>
              {isPluri ? (
                <div class="table-wrap"><table class="table table-compact"><thead><tr><th>{L('Candidat·e', 'Candidate')}</th><th>{L('Spécialité', 'Specialty')}</th><th>{t('s.site')}</th></tr></thead><tbody>
                  {urn.candidates.map((c) => <tr key={c.id}><td class="strong">{c.name}</td><td>{c.spec}</td><td>{c.site}</td></tr>)}
                </tbody></table></div>
              ) : (
                <div class="stack stack-s">
                  {order.map((uid) => { const u = UNIONS[uid]; return (
                    <div class="row-between" key={uid} style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '10px 12px' }}>
                      <div class="row" style={{ flexWrap: 'nowrap', flex: '1 1 240px', minWidth: 0 }}><UnionLogo u={u} size={44} /><div><div class="strong">{u.name}</div><div class="xs muted">{u.acr} · {nCands(uid)}</div></div></div>
                      <div class="row" style={{ gap: '6px' }}><Btn size="sm" icon="file" onClick={() => setProf(uid)}>{t('b.seeProf')}</Btn><Btn size="sm" kind="ghost" icon="users" onClick={() => setCands(uid)}>{t('b.seeList')}</Btn></div>
                    </div>
                  ); })}
                </div>
              )}
            </section>
            {!consult ? <div class="row" style={{ justifyContent: 'flex-end' }}><Btn kind="primary" size="lg" disabled={k !== 'open'} onClick={() => setStep(1)} iconRight="arrowRight">{t('b.toBallot')}</Btn></div> : <div class="row"><Btn href="/distance/electeur/scrutins" icon="arrowLeft">{t('r.mine')}</Btn>{k === 'open' && <Btn kind="primary" href={'/distance/electeur/scrutin/' + urnId} iconRight="arrowRight">{t('s.vote')}</Btn>}</div>}
          </div>
        )}

        {step === 1 && !consult && (
          <form class="card" onSubmit={(e) => { e.preventDefault(); if (hasChoice) setStep(2); }}>
            <fieldset>
              <legend>{t('b.choose')}</legend>
              <p class="small muted">{isPluri ? t('b.choosePluri', { n: urn.seats }) : t('b.chooseList')} {st.settings.falc && !isPluri && <strong>{t('b.oneBox')}</strong>}</p>
              <div class="choices" role={isPluri ? 'group' : 'radiogroup'} aria-label={t('b.choose')}>
                {isPluri ? urn.candidates.map((c) => {
                  const on = multi.includes(c.id);
                  const full = !on && multi.filter((x) => x !== 'blanc').length >= urn.seats;
                  return (
                    <label key={c.id} class={'choice is-multi ' + (on ? 'checked ' : '') + (full ? 'is-disabled' : '')}>
                      <input type="checkbox" name="cand" checked={on} disabled={full} onChange={() => setMulti(on ? multi.filter((x) => x !== c.id) : [...multi.filter((x) => x !== 'blanc'), c.id])} />
                      <span class="tick" aria-hidden="true" />
                      <span class="c-body"><span class="c-title">{c.name}</span><span class="c-sub" style={{ display: 'block' }}>{c.spec} · {c.site}</span></span>
                    </label>
                  );
                }) : order.map((uid) => {
                  const u = UNIONS[uid];
                  return (
                    <label key={uid} class={'choice ' + (choice === uid ? 'checked' : '')}>
                      <input type="radio" name="ballot" value={uid} checked={choice === uid} onChange={() => setChoice(uid)} />
                      <span class="tick" aria-hidden="true" />
                      <UnionLogo u={u} size={44} />
                      <span class="c-body"><span class="c-title">{u.name}</span><span class="c-sub" style={{ display: 'block' }}>{L('Liste', 'List')} {u.acr} · {nCands(uid)}</span></span>
                    </label>
                  );
                })}
                <label class={'choice choice-blank ' + (isPluri ? 'is-multi ' : '') + ((isPluri ? multi.includes('blanc') : choice === 'blanc') ? 'checked' : '')}>
                  <input type={isPluri ? 'checkbox' : 'radio'} name={isPluri ? 'cand' : 'ballot'} value="blanc" checked={isPluri ? multi.includes('blanc') : choice === 'blanc'} onChange={() => (isPluri ? setMulti(multi.includes('blanc') ? [] : ['blanc']) : setChoice('blanc'))} />
                  <span class="tick" aria-hidden="true" />
                  <span class="c-body"><span class="c-title">{t('b.blank')}</span><span class="c-sub" style={{ display: 'block' }}>{t('b.blankSub')}</span></span>
                </label>
              </div>
            </fieldset>
            {isPluri && <p class="small mt-12" aria-live="polite"><strong>{t('b.selected', { n: multi.includes('blanc') ? 0 : multi.length, max: urn.seats })}</strong></p>}
            <div class="row-between mt-16">
              <Btn icon="arrowLeft" onClick={() => setStep(0)}>{t('back')}</Btn>
              <span class="row" style={{ gap: '8px' }}><Ref c="3.2" /><button type="submit" class="btn btn-primary btn-lg" disabled={!hasChoice}>{t('b.validate')}<Icon name="arrowRight" size={18} /></button></span>
            </div>
          </form>
        )}

        {step === 2 && !consult && (
          <section class="card" aria-labelledby="h-conf">
            <h2 id="h-conf">{t('b.confirmTitle')}</h2>
            <div class="card card-sky card-flat">
              {!isPluri && choice !== 'blanc' ? <div class="row" style={{ flexWrap: 'nowrap' }}><UnionLogo u={UNIONS[choice]} size={48} /><div class="strong" style={{ fontSize: '1.15rem' }}>{selectionLabel()}</div></div> : <div class="strong" style={{ fontSize: '1.1rem' }}>{selectionLabel()}</div>}
            </div>
            <p class="small muted mt-12 mb-0"><Icon name="alert" size={14} /> {t('b.final')}</p>
            <div class="row-between mt-16">
              <Btn icon="edit" onClick={() => setStep(1)}>{t('b.modify')}</Btn>
              <Btn kind="primary" size="lg" icon="lock" onClick={() => setConfirm(true)}>{t('b.confirm')}</Btn>
            </div>
            <div class="mt-12"><Refs list={['3.2', '1-02 CNIL']} /></div>
          </section>
        )}

        {step === 3 && (
          <section class="card" aria-labelledby="h-proc">
            <div class="row-between mb-12"><h2 id="h-proc" class="mb-0">{L('Enregistrement de votre vote', 'Recording your vote')}</h2><Ref c="3.2" /></div>
            <ul class="proc" aria-live="polite" ref={liveRef}>
              {['b.proc1', 'b.proc2', 'b.proc3', 'b.proc4'].map((key, i) => (
                <li key={key} class={proc > i ? 'done' : proc === i ? 'run' : ''}>
                  <span class="pi">{proc > i ? <Icon name="check" size={14} stroke={3} /> : proc === i ? <span class="spin" /> : i + 1}</span>
                  <span>{t(key)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {confirm && (
          <Modal title={t('b.modalTitle')} onClose={() => setConfirm(false)} size="s" icon="lock" closeLabel={t('close')} footer={<><Btn onClick={() => setConfirm(false)}>{t('b.modalNo')}</Btn><Btn kind="primary" icon="check" onClick={cast} data-autofocus>{t('b.modalYes')}</Btn></>}>
            <p><strong>{selectionLabel()}</strong></p>
            <p class="small muted mb-0">{t('b.modalText')}</p>
          </Modal>
        )}
        {prof && <ProfModal unionId={prof} onClose={() => setProf(null)} />}
        {cands && <CandModal urn={urn} unionId={cands} onClose={() => setCands(null)} />}
      </div>
    </VoterShell>
  );
}

// ------------------------------------------------------------------ Accusé de réception
// Document généré (PDF) : contenu en français
export function receiptHtml(urn, op, mv, v) {
  return `<div class="doc-meta"><span>${esc(ESTAB.name)} · ${esc(op.name)}</span><span>Document généré le ${esc(fmtDT(Date.now(), 'fr'))}</span></div>
  <h1>Accusé de réception de vote</h1>
  <p style="text-align:center">Le vote de <strong>${esc(v.name)}</strong> a bien été enregistré.</p>
  <table><tbody>
  <tr><th>Scrutin</th><td>${esc(urn.instanceLong)} · ${esc(urn.college)}</td></tr>
  <tr><th>Émargement</th><td>${esc(fmtDT(mv.at, 'fr'))} (heure de Paris)</td></tr>
  <tr><th>N° d’accusé de réception</th><td>${esc(mv.receipt)}</td></tr>
  <tr><th>Code de vérification</th><td><strong>${esc(mv.code)}</strong></td></tr>
  <tr><th>Empreinte du bulletin chiffré</th><td style="font-family:monospace;font-size:8.5pt;word-break:break-all">${esc(mv.fp)}</td></tr>
  </tbody></table>
  <p>Ce document ne contient aucune indication sur le choix exprimé. Le code de vérification permet de contrôler, jusqu’à l’expiration des délais de recours, la présence du bulletin chiffré dans l’urne.</p>
  <p style="font-size:8.5pt;color:#666">Démonstration · données fictives · AOO Resah n° 2026-R032.</p>`;
}

export function VoterReceipt({ urnId }) {
  const st = useStore();
  const v = useVoter();
  if (!v) return null;
  const urn = st.remote.urns[urnId];
  const op = st.remote.ops[urn.op];
  const mv = st.remote.myVotes[urnId];
  if (!mv || mv.voterId !== v.id) { setTimeout(() => go('/distance/electeur/scrutins'), 0); return null; }
  document.title = L('Accusé de réception · ', 'Receipt · ') + instName(urn);
  const next = v.urns.map((id) => st.remote.urns[id]).find((u) => !st.remote.myVotes[u.id]);
  return (
    <VoterShell op={op} user={v}>
      <div class="vt-main vt-main-s">
        <Stepper steps={[t('b.s1'), t('b.s2'), t('b.s3'), t('b.s4')]} current={4} />
        <section class="card" aria-labelledby="h-ok">
          <div class="big-ok">
            <span class="bo-ico"><Icon name="check" size={44} stroke={3} /></span>
            <h1 id="h-ok" class="mb-0">{t('r.title')}</h1>
            <p class="muted mb-0">{t('r.text')}</p>
          </div>
          <div class="mt-24"><KV items={[[t('r.scrutin'), instLong(urn) + ' · ' + collegeName(urn)], [t('r.when'), fmtDT(mv.at) + L(' (heure de Paris)', ' (Paris time)')], [t('r.number'), <span class="mono">{mv.receipt}</span>]]} /></div>
          <div class="center mt-24">
            <div class="small muted">{t('r.code')} <Refs list={['2-07 CNIL']} /></div>
            <div class="mt-8"><span class="code-big" style={{ fontSize: 'clamp(1.1rem, .85rem + 1.6vw, 1.7rem)' }}>{mv.code}</span></div>
            <p class="small muted mt-8 mb-0">{t('r.codeHint')}</p>
          </div>
          <div class="row mt-16" style={{ justifyContent: 'center' }}>
            <Btn icon="download" onClick={() => printHtml(receiptHtml(urn, op, mv, v))}>{t('r.download')}</Btn>
            <Btn icon="mail" onClick={() => toast(t('r.emailSent', { email: v.email }), 'ok', 6000)}>{t('r.email')}</Btn>
            <Btn kind="ghost" icon="search" href={'/distance/verifier?code=' + encodeURIComponent(mv.code)}>{t('r.verify')}</Btn>
            <Ref c="3.2" />
          </div>
        </section>
        <section class="card mt-16">
          <div class="row-between">
            <div class="strong">{next ? L('Un autre scrutin vous attend', 'Another election is waiting') : t('r.done')}</div>
            {next ? (
              <div class="row"><Btn kind="ghost" icon="logout" onClick={logout}>{t('r.logout')}</Btn><Btn kind="primary" href={'/distance/electeur/scrutin/' + next.id} iconRight="arrowRight">{t('r.next', { name: instName(next) })}</Btn></div>
            ) : (
              <div class="row"><Btn kind="ghost" icon="logout" onClick={logout}>{t('logout')}</Btn><Btn href="/distance/electeur/scrutins">{t('r.mine')}</Btn></div>
            )}
          </div>
        </section>
        <div class="mt-16"><DemoNote>{L('Votre émargement apparaît côté bureau de vote.', 'You are now ticked off on the voter roll.')} <a href={href('/distance/bureau/emargement')}>{L('Voir', 'View')}</a></DemoNote></div>
      </div>
    </VoterShell>
  );
}

// ------------------------------------------------------------------ Identifiants perdus
// Libellés enregistrés dans l'état (en français : ils alimentent les alertes et le tableau des réémissions)
const REASON_FR = { notreceived: 'Identifiants non reçus', lost: 'Identifiants perdus', locked: 'Compte verrouillé' };
const CHANNEL_FR = { sms: 'Identifiant par courriel + mot de passe par SMS', post: 'Courrier postal', mixed: 'Identifiant par SMS + mot de passe par courriel' };

export function VoterLostCreds() {
  const st = useStore();
  const [step, setStep] = useState(0);
  const [reason, setReason] = useState('');
  const [f, setF] = useState({ last: '', first: '', birth: '', mat: '' });
  const [chan, setChan] = useState('sms');
  const [err, setErr] = useState('');
  const op = st.remote.ops.ep26;
  const reasons = [['notreceived', L('Je n’ai pas reçu mes identifiants', 'I did not receive my credentials')], ['lost', L('J’ai perdu mes identifiants', 'I lost my credentials')], ['locked', L('Mon compte est verrouillé', 'My account is locked')]];
  const target = Object.values(VOTERS).find((x) => x.last.toLowerCase() === f.last.trim().toLowerCase() && x.birth.replace(/\D/g, '') === f.birth.replace(/\D/g, '') && x.matricule === f.mat.trim());
  const verify = (e) => { e.preventDefault(); if (!target) { setErr(L('Identité non vérifiée. Vérifiez vos informations ou appelez l’assistance.', 'We could not verify your identity. Check your details or call support.')); return; } setErr(''); setStep(2); };
  const chanLabel = { sms: L('Identifiant par courriel, mot de passe par SMS', 'Identifier by email, password by text'), post: L('Les deux par courrier (3 à 5 jours)', 'Both by post (3 to 5 days)'), mixed: L('Identifiant par SMS, mot de passe par courriel', 'Identifier by text, password by email') };
  const send = () => {
    dispatch('r/reissue', { voterId: target.id, op: target.op, masked: masked(target), req: { id: 'r' + Date.now(), who: target.name + ' (démo)', reason: REASON_FR[reason], channel: CHANNEL_FR[chan], status: 'Envoyé' } });
    setStep(3);
  };
  const setFld = (key) => (e) => setF({ ...f, [key]: e.currentTarget.value });
  return (
    <VoterShell op={op} band={null}>
      <div class="vt-main vt-main-s">
        <nav class="crumbs" aria-label={L('Fil d’Ariane', 'Breadcrumb')}><a href={href('/distance/electeur')}>{L('Espace de vote', 'Voting area')}</a></nav>
        <h1 class="mb-8">{L('Identifiants perdus', 'Lost credentials')}</h1>
        <p class="muted">{L('Nouveaux identifiants après vérification d’identité.', 'New credentials after an identity check.')} <Tip>{L('Envoi par deux canaux distincts. Les anciens identifiants sont révoqués immédiatement.', 'Sent through two separate channels. Old credentials are revoked at once.')}</Tip> <Refs list={['3.1', '3']} /></p>
        <Stepper steps={[L('Motif', 'Reason'), L('Identité', 'Identity'), L('Envoi', 'Delivery'), L('Terminé', 'Done')]} current={step} />
        {step === 0 && (
          <div class="card"><fieldset>
            <legend>{L('Que se passe-t-il ?', 'What happened?')}</legend>
            <div class="choices">
              {reasons.map(([k, l]) => <label key={k} class={'choice ' + (reason === k ? 'checked' : '')}><input type="radio" name="reason" checked={reason === k} onChange={() => setReason(k)} /><span class="tick" aria-hidden="true" /><span class="c-body"><span class="c-title">{l}</span></span></label>)}
            </div>
            <div class="row mt-16" style={{ justifyContent: 'flex-end' }}><Btn kind="primary" disabled={!reason} onClick={() => setStep(1)} iconRight="arrowRight">{t('login.continue')}</Btn></div>
          </fieldset></div>
        )}
        {step === 1 && (
          <form class="card stack" onSubmit={verify} noValidate>
            <div class="grid g2">
              <Field label={L('Nom', 'Last name')} id="lc-last" required><input class="input" id="lc-last" value={f.last} onInput={setFld('last')} autocomplete="family-name" /></Field>
              <Field label={L('Prénom', 'First name')} id="lc-first"><input class="input" id="lc-first" value={f.first} onInput={setFld('first')} autocomplete="given-name" /></Field>
              <Field label={t('login.qLabel')} id="lc-birth" hint={t('login.qHint')} required><input class="input" id="lc-birth" value={f.birth} onInput={setFld('birth')} aria-describedby="lc-birth-hint" /></Field>
              <Field label={L('Matricule', 'Staff number')} id="lc-mat" required><input class="input mono" id="lc-mat" value={f.mat} onInput={setFld('mat')} /></Field>
            </div>
            {err && <div class="err" role="alert"><Icon name="alert" size={16} />{err}</div>}
            <div class="row-between"><Btn icon="arrowLeft" onClick={() => setStep(0)}>{t('back')}</Btn><div class="row"><Btn size="sm" kind="ghost" icon="wand" onClick={() => setF({ last: 'Martin', first: 'Camille', birth: '14/03/1988', mat: '048217' })}>{L('Remplir (démo)', 'Fill in (demo)')}</Btn><button class="btn btn-primary" type="submit">{L('Vérifier', 'Verify')}<Icon name="arrowRight" size={18} /></button></div></div>
          </form>
        )}
        {step === 2 && (
          <div class="card"><fieldset>
            <legend>{L('Comment les recevoir ?', 'How should we send them?')}</legend>
            <p class="small muted">{L('Toujours par deux canaux distincts.', 'Always through two separate channels.')}</p>
            <div class="choices">
              {Object.entries(chanLabel).map(([k, l]) => <label key={k} class={'choice ' + (chan === k ? 'checked' : '')}><input type="radio" name="chan" checked={chan === k} onChange={() => setChan(k)} /><span class="tick" aria-hidden="true" /><span class="c-body"><span class="c-title">{l}</span><span class="c-sub" style={{ display: 'block' }}>{k === 'post' ? L('Adresse connue de l’établissement', 'Address held by the hospital') : target.phone + ' · ' + target.email}</span></span></label>)}
            </div>
            <div class="row-between mt-16"><Btn icon="arrowLeft" onClick={() => setStep(1)}>{t('back')}</Btn><Btn kind="primary" icon="send" onClick={send}>{L('Envoyer', 'Send')}</Btn></div>
          </fieldset></div>
        )}
        {step === 3 && (
          <section class="card center">
            <div class="big-ok"><span class="bo-ico"><Icon name="send" size={36} /></span><h2 class="mb-0">{L('Identifiants envoyés', 'Credentials sent')}</h2></div>
            <p class="muted mt-8">{chanLabel[chan]}. {L('Les anciens identifiants ne fonctionnent plus.', 'Your old credentials no longer work.')}</p>
            <Btn kind="primary" href="/distance/electeur">{L('Retour à la connexion', 'Back to sign in')}</Btn>
            <div class="mt-16" style={{ textAlign: 'left' }}><DemoNote>{L('Demande tracée au journal et signalée au bureau de vote.', 'Request logged and reported to the polling station.')} <a href={href('/distance/bureau/alertes')}>{L('Voir', 'View')}</a></DemoNote></div>
          </section>
        )}
      </div>
    </VoterShell>
  );
}

// ------------------------------------------------------------------ Aide
const FAQ = [
  ['Où trouver mes identifiants ?', 'L’identifiant arrive par courrier, le mot de passe par SMS ou courriel. Ces deux canaux séparés protègent votre compte.'],
  ['Puis-je voter sur mon téléphone ?', 'Oui : smartphone, tablette ou ordinateur, même avec une connexion lente.'],
  ['Mon vote est-il secret ?', 'Oui. Votre bulletin est chiffré sur votre appareil et déposé sans votre identité ni l’heure. Seul le total est déchiffré, après la clôture, par plusieurs membres du bureau de vote.'],
  ['Puis-je changer d’avis ?', 'Oui, tant que vous n’avez pas confirmé. Ensuite, le vote est définitif.'],
  ['Comment vérifier mon vote ?', 'Avec le code de votre accusé de réception, jusqu’à la fin des délais de recours. Ce code ne révèle pas votre choix.'],
  ['J’ai perdu mes identifiants.', 'Utilisez « Identifiants perdus ? » ou appelez le numéro vert. Les anciens identifiants sont alors désactivés.'],
  ['Mon compte est verrouillé.', 'Après plusieurs échecs, l’accès est bloqué 30 minutes. L’assistance peut le débloquer après vérification de votre identité.'],
  ['J’ai plusieurs scrutins.', 'Votez pour l’un, puis continuez ou revenez plus tard pendant la période de vote.'],
  ['Puis-je voter blanc ?', 'Oui, sur chaque bulletin. Le vote blanc est compté à part.'],
  ['Je suis malvoyant(e).', 'Le portail fonctionne avec les lecteurs d’écran et au clavier. Contraste et taille du texte : menu Accessibilité.'],
];
const FAQ_EN = [
  ['Where are my credentials?', 'Your identifier comes by post, your password by text or email. Two separate channels protect your account.'],
  ['Can I vote on my phone?', 'Yes: phone, tablet or computer, even on a slow connection.'],
  ['Is my vote secret?', 'Yes. Your ballot is encrypted on your device and cast without your identity or the time. Only the total is decrypted, after closing, by several polling station members together.'],
  ['Can I change my mind?', 'Yes, until you confirm. After that, your vote is final.'],
  ['How do I check my vote?', 'With the code on your receipt, until the appeal deadline. The code does not reveal your choice.'],
  ['I lost my credentials.', 'Use “Lost your credentials?” or call the helpline. Your old credentials are then disabled.'],
  ['My account is locked.', 'After several failed attempts, access is blocked for 30 minutes. Support can unlock it after checking your identity.'],
  ['I have several elections.', 'Vote in one, then continue or come back later during the voting period.'],
  ['Can I cast a blank vote?', 'Yes, on every ballot. Blank votes are counted separately.'],
  ['I am visually impaired.', 'The portal works with screen readers and the keyboard. Contrast and text size: Accessibility menu.'],
];
const SLIDES = [
  ['login', 'Je me connecte', 'Identifiant, mot de passe, date de naissance, puis code.'],
  ['list', 'Je consulte', 'Je lis les listes et les professions de foi.'],
  ['ballot', 'Je choisis', 'Une liste ou le vote blanc. Je peux encore changer.'],
  ['lock', 'Je confirme', 'Mon bulletin est chiffré, puis déposé dans l’urne.'],
  ['fileCheck', 'Je garde mon accusé', 'Je note mon code de vérification.'],
];
const SLIDES_EN = [
  ['login', 'I sign in', 'Identifier, password, date of birth, then code.'],
  ['list', 'I read', 'I read the lists and manifestos.'],
  ['ballot', 'I choose', 'A list or a blank vote. I can still change.'],
  ['lock', 'I confirm', 'My ballot is encrypted, then cast.'],
  ['fileCheck', 'I keep my receipt', 'I note my verification code.'],
];

export function VoterHelp({ q }) {
  const st = useStore();
  const [tab, setTab] = useState(q.tab || 'faq');
  const [slide, setSlide] = useState(0);
  const [play, setPlay] = useState(false);
  const [chat, setChat] = useState(false);
  const op = st.remote.ops.ep26;
  useEffect(() => { if (!play) return; const id = setInterval(() => setSlide((s) => (s + 1) % 5), 3500); return () => clearInterval(id); }, [play]);
  const isEn = en();
  const slides = isEn ? SLIDES_EN : SLIDES;
  return (
    <VoterShell op={op}>
      <div class="vt-main vt-main-s">
        <nav class="crumbs" aria-label={L('Fil d’Ariane', 'Breadcrumb')}><a href={href('/distance/electeur')}>{L('Espace de vote', 'Voting area')}</a></nav>
        <div class="row-between"><h1>{t('help')}</h1><Refs list={['2.8', '3.1']} /></div>
        <Tabs label={L('Rubriques d’aide', 'Help topics')} value={tab} onChange={setTab} tabs={[{ id: 'faq', label: t('help.faq') }, { id: 'tuto', label: t('help.tuto') }, { id: 'guide', label: t('help.guide') }, { id: 'donnees', label: t('help.data') }, { id: 'contact', label: L('Contact', 'Contact') }]} />
        {tab === 'faq' && <TabPanel id="faq">{(isEn ? FAQ_EN : FAQ).map(([qq, a]) => <details class="acc" key={qq}><summary>{qq}</summary><div class="acc-body">{a}</div></details>)}</TabPanel>}
        {tab === 'tuto' && (
          <TabPanel id="tuto">
            <div class="card">
              <div class="row-between mb-16"><h2 class="mb-0">{L('Voter en 5 étapes', 'Voting in 5 steps')}</h2><Btn size="sm" icon={play ? 'pause' : 'play'} onClick={() => setPlay(!play)} aria-pressed={play ? 'true' : 'false'}>{play ? L('Pause', 'Pause') : L('Lecture', 'Play')}</Btn></div>
              <div class="card card-sky card-flat center" style={{ minHeight: '220px', display: 'grid', placeItems: 'center' }} aria-live="polite">
                <div class="anim-in" key={slide}>
                  <Icon name={slides[slide][0]} size={40} style={{ color: 'var(--accent)' }} />
                  <span class="sr-only">{L(`Étape ${slide + 1} sur 5`, `Step ${slide + 1} of 5`)}</span>
                  <h3 class="mt-12" style={{ fontSize: '1.4rem' }}>{slides[slide][1]}</h3>
                  <p class="muted mb-0" style={{ maxWidth: '520px' }}>{slides[slide][2]}</p>
                </div>
              </div>
              <div class="row-between mt-16">
                <Btn size="sm" icon="chevronLeft" onClick={() => setSlide((slide + 4) % 5)}>{L('Précédent', 'Previous')}</Btn>
                <div class="row" style={{ gap: '6px' }}>{slides.map((_, i) => <button key={i} class="btn btn-xs" aria-label={L('Étape ', 'Step ') + (i + 1)} aria-current={i === slide ? 'step' : undefined} style={i === slide ? { background: 'var(--accent)', color: '#fff' } : null} onClick={() => setSlide(i)}>{i + 1}</button>)}</div>
                <Btn size="sm" iconRight="chevronRight" onClick={() => setSlide((slide + 1) % 5)}>{L('Suivant', 'Next')}</Btn>
              </div>
              <p class="xs muted mt-12 mb-0">{L('En production : vidéo sous-titrée, transcription et langue des signes.', 'In production: captioned video, transcript and sign language.')}</p>
            </div>
          </TabPanel>
        )}
        {tab === 'guide' && (
          <TabPanel id="guide">
            <div class="card">
              <div class="row-between"><h2 class="mb-0">{L('Guide de l’électeur', 'Voter guide')}</h2><Btn size="sm" icon="print" onClick={() => printHtml(guideHtml(op))}>{L('Imprimer (PDF)', 'Print (PDF)')}</Btn></div>
              {isEn && <p class="small muted mt-8 mb-0">In French in this demo.</p>}
              <div class="doc mt-16" lang="fr" dangerouslySetInnerHTML={{ __html: guideHtml(op) }} />
            </div>
          </TabPanel>
        )}
        {tab === 'donnees' && (
          <TabPanel id="donnees">
            <div class="card stack">
              <h2>{L('Vos données personnelles', 'Your personal data')}</h2>
              <KV items={[
                [L('Responsable', 'Controller'), ESTAB.long + L(' (fictif), DRH', ' (fictitious), HR department')],
                [L('Finalité', 'Purpose'), L('Élections professionnelles par vote électronique', 'Staff elections by electronic voting')],
                [L('Base légale', 'Legal basis'), L('Obligation légale (décret n° 2024-1038)', 'Legal obligation (decree 2024-1038)')],
                [L('Données', 'Data'), L('Identité, collège, site, coordonnées, émargement', 'Identity, college, site, contact details, voter roll')],
                [L('Destinataires', 'Recipients'), L('Bureau de vote, prestataire (sous-traitant), expert indépendant', 'Polling station, voting provider (processor), independent expert')],
                [L('Hébergement', 'Hosting'), L('Union européenne uniquement', 'European Union only')],
                [L('Conservation', 'Retention'), L('2 ans sous scellés, puis suppression automatique', '2 years under seal, then deleted automatically')],
                [L('Vos droits', 'Your rights'), L('Accès, rectification, limitation : DPO de l’établissement', 'Access, rectification, restriction: the hospital’s DPO')],
              ]} />
              <p class="small muted mb-0"><Icon name="lock" size={14} /> {L('Votre vote n’est jamais lié à votre identité.', 'Your vote is never linked to your identity.')}</p>
            </div>
          </TabPanel>
        )}
        {tab === 'contact' && (
          <TabPanel id="contact">
            <div class="card">
              <KV items={[
                [L('Numéro vert', 'Helpline'), <><span class="strong">{SUPPORT.phone}</span><div class="xs muted">{L('Gratuit, ' + SUPPORT.hours, 'Free, 24/7')} · {L(SUPPORT.phoneNote, 'demo number')}</div></>],
                [L('Courriel', 'Email'), <><span class="strong">{SUPPORT.email}</span><div class="xs muted">{L('Réponse avec n° de ticket', 'Reply with a ticket number')}</div></>],
                [L('Discussion', 'Chat'), <Btn size="sm" kind="primary" icon="chat" onClick={() => setChat(true)}>{L('Démarrer', 'Start chat')}</Btn>],
              ]} />
            </div>
          </TabPanel>
        )}
        {chat && <ChatModal onClose={() => setChat(false)} />}
      </div>
    </VoterShell>
  );
}

// Document imprimable : contenu en français
const periodFr = (op) => `du ${fmtDateLong(op.open, 'fr')}, ${fmtTime(op.open, 'fr').replace(':', ' h ')} au ${fmtDateLong(op.close, 'fr')}, ${fmtTime(op.close, 'fr').replace(':', ' h ')} (heure de Paris)`;
function guideHtml(op) {
  return `<div class="doc-meta"><span>${esc(ESTAB.name)} · ${esc(op.name)}</span><span>Guide de l’électeur</span></div>
  <h1>Voter en ligne : mode d’emploi</h1>
  <h2>1. Vos identifiants</h2><p>Votre <strong>identifiant</strong> arrive par courrier postal, votre <strong>mot de passe</strong> par SMS ou courriel. Conservez-les séparément.</p>
  <h2>2. Se connecter</h2><p>Pendant la période de vote, ${esc(periodFr(op))} : identifiant, mot de passe, date de naissance, puis code de vérification.</p>
  <h2>3. Voter</h2><p>Consultez les candidatures, choisissez une liste ou le vote blanc, vérifiez puis confirmez. Le vote est alors définitif.</p>
  <h2>4. Garder l’accusé de réception</h2><p>Téléchargez-le ou recevez-le par courriel. Son code de vérification permet de contrôler la présence de votre bulletin dans l’urne.</p>
  <h2>Assistance</h2><p>Numéro vert gratuit ${esc(SUPPORT.phone)} (${esc(SUPPORT.hours)}), courriel ${esc(SUPPORT.email)}, discussion en ligne.</p>`;
}

function ChatModal({ onClose }) {
  // Les messages du conseiller sont stockés par clé pour suivre la langue choisie
  const [msgs, setMsgs] = useState([{ me: false, k: 'hello' }]);
  const [text, setText] = useState('');
  const REPLY = {
    hello: L('Bonjour, je suis Léa, du centre d’assistance. Comment puis-je vous aider ?', 'Hello, I’m Léa from the support centre. How can I help?'),
    lock: L('Votre compte est verrouillé par sécurité. Je peux le débloquer après vérification : votre nom et votre matricule ?', 'Your account is locked for security. I can unlock it after a check: your name and staff number?'),
    creds: L('Demandez de nouveaux identifiants via « Identifiants perdus ? ». Ils arrivent par deux canaux distincts.', 'Request new credentials via “Lost your credentials?”. They arrive through two separate channels.'),
    code: L('Le code change toutes les 30 secondes dans votre application. Nouveau téléphone ? Je peux vous réenrôler après vérification.', 'The code changes every 30 seconds in your app. New phone? I can re-enrol you after a check.'),
    secret: L('Votre bulletin est chiffré sur votre appareil et enregistré sans votre identité. Personne ne peut connaître votre vote.', 'Your ballot is encrypted on your device and stored without your identity. Nobody can know your vote.'),
    other: L('C’est noté. Un conseiller vous répond en moins de 2 minutes, ou appelez le ' + SUPPORT.phone + '.', 'Noted. An adviser will reply within 2 minutes, or call ' + SUPPORT.phone + '.'),
  };
  const reply = (m) => {
    const s = m.toLowerCase();
    if (/bloqu|verrou|lock/.test(s)) return 'lock';
    if (/identifiant|courrier|perdu|reçu|recu|credential|login|lost|letter/.test(s)) return 'creds';
    if (/code|sms|application|app\b|text/.test(s)) return 'code';
    if (/secret|anonym|confidenti|private/.test(s)) return 'secret';
    return 'other';
  };
  const send = (e) => { e.preventDefault(); if (!text.trim()) return; const m = text.trim(); setMsgs((x) => [...x, { me: true, text: m }]); setText(''); setTimeout(() => setMsgs((x) => [...x, { me: false, k: reply(m) }]), 700); };
  return (
    <Modal title={L('Discussion avec l’assistance', 'Chat with support')} onClose={onClose} icon="chat" closeLabel={t('close')} footer={<form class="input-group w-100" onSubmit={send}><label class="sr-only" for="chat-in">{L('Votre message', 'Your message')}</label><input id="chat-in" class="input" value={text} onInput={(e) => setText(e.currentTarget.value)} placeholder={L('Votre message', 'Type a message')} /><button class="btn btn-primary" type="submit"><Icon name="send" size={18} />{L('Envoyer', 'Send')}</button></form>}>
      <div class="stack stack-s" aria-live="polite" style={{ minHeight: '220px' }}>
        {msgs.map((m, i) => <div key={i} style={{ alignSelf: m.me ? 'flex-end' : 'flex-start', marginLeft: m.me ? 'auto' : 0, maxWidth: '85%', background: m.me ? 'var(--accent)' : 'var(--surface-2)', color: m.me ? '#fff' : 'var(--text)', border: '1px solid var(--border)', borderRadius: '14px', padding: '8px 12px', width: 'fit-content' }}>{m.me ? m.text : REPLY[m.k]}</div>)}
      </div>
      <p class="xs muted mt-12 mb-0">{L('Démo : réponses préenregistrées. En production, des conseillers répondent.', 'Demo: canned replies. In production, real advisers answer.')}</p>
    </Modal>
  );
}

// ------------------------------------------------------------------ Consultation de la liste électorale
export function VoterList() {
  const st = useStore();
  const [name, setName] = useState('');
  const [birth, setBirth] = useState('');
  const [res, setRes] = useState(null);
  const op = st.remote.ops.ep26;
  const search = (e) => {
    e.preventDefault();
    const v = Object.values(VOTERS).find((x) => x.last.toLowerCase() === name.trim().toLowerCase() && x.birth.replace(/\D/g, '') === birth.replace(/\D/g, ''));
    setRes(v ? { ok: true, v } : { ok: false });
  };
  return (
    <VoterShell op={op}>
      <div class="vt-main vt-main-s">
        <nav class="crumbs" aria-label={L('Fil d’Ariane', 'Breadcrumb')}><a href={href('/distance/electeur')}>{L('Espace de vote', 'Voting area')}</a></nav>
        <h1 class="mb-8">{t('help.list')}</h1>
        <p class="muted">{L('Une erreur ? Contactez la DRH.', 'Something wrong? Contact HR.')} <Ref c="3" /></p>
        <form class="card stack" onSubmit={search}>
          <div class="grid g2">
            <Field label={L('Nom', 'Last name')} id="li-n"><input class="input" id="li-n" value={name} onInput={(e) => setName(e.currentTarget.value)} /></Field>
            <Field label={t('login.qLabel')} id="li-b" hint={t('login.qHint')}><input class="input" id="li-b" value={birth} onInput={(e) => setBirth(e.currentTarget.value)} aria-describedby="li-b-hint" /></Field>
          </div>
          <div class="row-between"><Btn size="sm" kind="ghost" icon="wand" onClick={() => { setName('Martin'); setBirth('14/03/1988'); }}>{L('Remplir (démo)', 'Fill in (demo)')}</Btn><button class="btn btn-primary" type="submit"><Icon name="search" size={18} />{L('Rechercher', 'Search')}</button></div>
        </form>
        {res && (res.ok ? (
          <div class="card mt-16"><Note tone="ok" icon="checkCircle"><strong>{res.v.name}</strong> {L('est inscrit(e) sur :', 'is registered for:')}</Note>
            <ul class="mt-12 mb-0">{res.v.urns.map((id) => { const u = st.remote.urns[id]; return <li key={id}>{instLong(u)} · {collegeName(u)} ({opName(st.remote.ops[u.op])})</li>; })}</ul></div>
        ) : <div class="mt-16"><Note tone="warn" icon="alert">{L('Aucune inscription trouvée.', 'No registration found.')}</Note></div>)}
      </div>
    </VoterShell>
  );
}

// ------------------------------------------------------------------ Vérification publique
export function PublicVerify({ q }) {
  const st = useStore();
  const now = useNow(5000);
  const [code, setCode] = useState(q.code || '');
  const [res, setRes] = useState(null);
  const [urnId, setUrnId] = useState('cse-a');
  const op = st.remote.ops.ep26;
  const check = (e) => {
    e && e.preventDefault();
    const c = code.trim().toUpperCase();
    const hit = Object.entries(st.remote.myVotes).find(([, m]) => m.code === c);
    setRes(hit ? { ok: true, urn: st.remote.urns[hit[0]], m: hit[1] } : { ok: false });
    if (hit) setUrnId(hit[0]);
  };
  useEffect(() => { if (q.code) check(); }, []);
  const total = urnCount(st, urnId, now);
  const board = useMemo(() => {
    const out = [];
    const r = rng('board-' + urnId);
    const n = Math.min(total, 60);
    for (let i = 0; i < n; i++) out.push(sha256('ballot-' + urnId + '-' + Math.floor(r() * 1e9)));
    const mine = st.remote.myVotes[urnId];
    if (mine) out.push(mine.fp);
    return out.sort();
  }, [urnId, total > 0, st.remote.myVotes[urnId]]);
  const mineFp = res && res.ok ? res.m.fp : null;
  const myCodes = Object.values(st.remote.myVotes);
  return (
    <VoterShell op={op}>
      <div class="vt-main">
        <div class="row-between"><h1 class="mb-8">{L('Vérifier un bulletin', 'Check a ballot')}</h1><Refs list={['2-07 CNIL', '3.2']} /></div>
        <p class="muted">{L('Votre choix n’est jamais révélé.', 'Your choice is never revealed.')}</p>
        <div class="grid g-side">
          <div class="stack">
            <form class="card stack" onSubmit={check}>
              <Field label={t('r.code')} id="vf-code" hint={L('Sur votre accusé de réception', 'On your receipt') + ' · XXXX-XXXX-XXXX-XXXX'}><input class="input mono" id="vf-code" value={code} onInput={(e) => setCode(e.currentTarget.value)} aria-describedby="vf-code-hint" style={{ letterSpacing: '.08em' }} /></Field>
              <div class="row-between">
                {myCodes.length ? <Btn size="sm" kind="ghost" icon="wand" onClick={() => setCode(myCodes[0].code)}>{L('Mon code (démo)', 'My code (demo)')}</Btn> : <span class="xs muted">{L('Votez d’abord pour obtenir un code.', 'Vote first to get a code.')}</span>}
                <button class="btn btn-primary" type="submit"><Icon name="search" size={18} />{L('Vérifier', 'Check')}</button>
              </div>
            </form>
            {res && (res.ok ? (
              <div class="card anim-in">
                <Note tone="ok" icon="checkCircle"><strong>{L('Votre bulletin est dans l’urne.', 'Your ballot is in the ballot box.')}</strong></Note>
                <div class="mt-12"><KV items={[[t('r.scrutin'), instLong(res.urn) + ' · ' + collegeName(res.urn)], [L('Empreinte', 'Fingerprint'), <span class="fp">{groupFp(res.m.fp)}</span>], [L('Intégrité', 'Integrity'), L('Inchangé depuis le dépôt', 'Unchanged since cast')]]} /></div>
              </div>
            ) : <Note tone="warn" icon="alert">{L('Aucun bulletin pour ce code.', 'No ballot matches this code.')}</Note>)}
          </div>
          <section class="card" aria-labelledby="h-board">
            <div class="row mb-8" style={{ gap: '6px' }}><h2 id="h-board" class="mb-0" style={{ fontSize: '1.05rem' }}>{L('Tableau public', 'Public board')}</h2><Tip>{L('Empreintes des bulletins chiffrés, triées : ni heure, ni identité.', 'Fingerprints of encrypted ballots, sorted: no time, no identity.')}</Tip></div>
            <label class="sr-only" for="vf-urn">{L('Urne', 'Ballot box')}</label>
            <select id="vf-urn" class="select mb-8" value={urnId} onChange={(e) => setUrnId(e.currentTarget.value)}>{op.urns.map((id) => <option key={id} value={id}>{instName(st.remote.urns[id])} · {collegeName(st.remote.urns[id])}</option>)}</select>
            <div class="xs muted mb-8">{L(`${fmtNum(total)} bulletins · extrait`, `${fmtNum(total)} ballots · extract`)}</div>
            <div class="scroll-box" style={{ maxHeight: '320px' }}>
              {board.map((h) => <div key={h} class="mono xs" style={{ padding: '3px 6px', borderRadius: '6px', background: h === mineFp ? 'var(--green-soft)' : 'transparent', fontWeight: h === mineFp ? 600 : 400 }}>{h.slice(0, 32)}…{h === mineFp && ' ←'}</div>)}
            </div>
          </section>
        </div>
      </div>
    </VoterShell>
  );
}
