// Espace participant du vote en séance (mobile d'abord) : accès par lien, PIN, QR code ; vote et accusé.
import { useEffect, useState } from 'preact/hooks';
import { useStore, useNow, dispatch, getState, TAB } from '../lib/store.js';
import { go, href, absUrl } from '../lib/router.js';
import { Btn, Chip, Modal, Note, DemoNote, Ref, Refs, Field, toast, KV, Tabs, TabPanel, Tip, More } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';
import { Popover, A11yPanel, MaintenanceBanner } from '../ui/shell.jsx';
import { DOCS, EXPR_COLORS, statusLabel } from '../data/seance.js';
import { voteKey, findItem, flatAgenda, quorumInfo, voteRemaining, arrivedBallots, roundLabel } from '../lib/sim.js';
import { activeVote, lastVote, votableItems, optionLabel, choiceLabel, voteTypeLabel, openVote, closeVote, ResultView } from './seance_common.jsx';
import { SUPPORT } from '../config.js';
import { brandStyle } from '../data/branding.js';
import { fmtTime, fmtTimeS, fmtMMSS, fmtDTS, fmtDate } from '../lib/format.js';
import { randCode } from '../lib/prng.js';
import { printHtml, esc } from '../lib/exporters.js';
import { qrPath } from '../lib/qr.js';
import { ESTAB } from '../data/remote.js';
import { L, curLang, tx } from '../lib/i18n.js';

const ME_ID = 'sbernard';
const GUEST_ID = 'inv1';
const PERSONA = { login: 'CME-SB-2041', password: 'Seance-7Qx', birth: '21/06/1983', email: 's•••••@chu-montclair.example' };
const initialsOf = (name) => name.replace(/^(Pr|Dr|Mme|M\.)\s+/, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

// Libellés anglais des types de documents et des étiquettes de points (le contenu reste en français)
const KIND_EN = { 'Procès-verbal': 'Minutes', Note: 'Note', Annexe: 'Appendix', 'Rapport de présentation': 'Report', 'Projet de délibération': 'Draft resolution' };
const TAG_EN = { 'Motion préalable': 'Preliminary motion', Amendement: 'Amendment', 'Sous-amendement': 'Sub-amendment', 'Vote sur l’ensemble': 'Final vote', Sondage: 'Poll', 'Vote groupé': 'Grouped vote' };
const kindL = (k) => L(k, KIND_EN[k] || tx(k));
const tagL = (t) => L(t, TAG_EN[t] || tx(t));

export function DocViewer({ id, onClose }) {
  const d = DOCS[id];
  if (!d) return null;
  return (
    <Modal title={d.title} size="l" onClose={onClose}>
      <div class="doc">
        <div class="doc-meta"><span>{ESTAB.name} · {kindL(d.kind)}</span><span>{d.pages} page{d.pages > 1 ? 's' : ''} · PDF</span></div>
        <h1>{d.title}</h1>
        {d.paras.map((p, i) => <p key={i}>{p}</p>)}
        <p class="small" style={{ color: 'var(--text-2)' }}>{L('Extrait d’un document fictif.', 'Excerpt from a fictitious document.')}</p>
      </div>
    </Modal>
  );
}

export function QrSvg({ text, size = 168 }) {
  const { d, n } = qrPath(text);
  return <svg width={size} height={size} viewBox={`-2 -2 ${n + 4} ${n + 4}`} role="img" aria-label={L('QR code d’accès à la séance', 'Meeting access QR code')} shape-rendering="crispEdges"><rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" /><path d={d} fill="#1D1D1F" /></svg>;
}

function PtShell({ children, seance, user }) {
  const st = useStore();
  const [help, setHelp] = useState(false);
  const b = st.remote.branding;
  return (
    <div class="pt-shell" lang={curLang()} style={st.settings.contrast ? null : brandStyle(b)}>
      <div class="pt-top">
        <div class="pt-in">
          <div class="grow" style={{ minWidth: 0 }}><h1 class="ellipsis">{seance ? seance.short + ' · ' + seance.title.split('·').slice(-1)[0].trim() : L('Vote en séance', 'Meeting voting')}</h1><div class="pt-sub ellipsis">{ESTAB.name}{seance ? ' · ' + fmtDate(seance.date) : ''}</div></div>
          <button class="pt-tool" onClick={() => setHelp(true)} aria-haspopup="dialog" aria-label={L('Aide', 'Help')}><Icon name="help" size={16} /><span class="pt-tool-l">{L('Aide', 'Help')}</span></button>
          <div class="pt-a11y"><Popover label="" ariaLabel={L('Accessibilité', 'Accessibility')} icon="a11y" align="right"><A11yPanel /></Popover></div>
          {user && <button class="pt-tool" onClick={() => { dispatch('auth/logout', { key: 's_part' }); go('/seance/participant'); }} aria-label={L('Se déconnecter', 'Sign out')}><Icon name="logout" size={16} /></button>}
        </div>
      </div>
      <MaintenanceBanner />
      <main id="main" class="pt-main">{children}</main>
      {help && <SeanceHelp onClose={() => setHelp(false)} />}
    </div>
  );
}

// Aide du participant : guide, tutoriel animé, FAQ, contact (CCTP 4.1)
const TUTO = () => [
  ['link', L('Je rejoins la séance', 'Join the meeting'), L('Lien personnel, QR code projeté ou code PIN.', 'Personal link, projected QR code or PIN.')],
  ['user', L('Je confirme mon identité', 'Confirm who you are'), L('Ma présence est émargée automatiquement.', 'Your attendance is signed in automatically.')],
  ['hand', L('Je vote', 'Vote'), L('Le bulletin s’affiche à l’ouverture. Je choisis, puis je confirme.', 'The ballot appears when voting opens. Choose, then confirm.')],
  ['edit', L('Je peux changer d’avis', 'Change your mind'), L('Jusqu’à la clôture du vote.', 'Until the vote closes.')],
  ['fileCheck', L('Je garde mon accusé', 'Keep your receipt'), L('En PDF ou par courriel, sans mon choix.', 'As a PDF or by email, without your choice.')],
];
const SFAQ = () => [
  [L('Je perds la connexion pendant un vote ?', 'What if I lose my connection?'), L('Rouvrez votre lien : la session reprend, votre vote est conservé.', 'Reopen your link: the session resumes and your vote is kept.')],
  [L('Comment voter avec une procuration ?', 'How do I vote as a proxy?'), L('Un second bulletin s’affiche, avec son propre accusé.', 'A second ballot appears, with its own receipt.')],
  [L('Le secret du vote est-il garanti ?', 'Is my vote secret?'), L('Oui : le choix est chiffré sur votre appareil et séparé de votre identité.', 'Yes: your choice is encrypted on your device and kept apart from your identity.')],
  [L('Puis-je voter depuis la visioconférence ?', 'Can I vote from a video call?'), L('Oui, le lien Teams, Zoom ou Webex s’ouvre dans le navigateur.', 'Yes, the Teams, Zoom or Webex link opens in your browser.')],
  [L('Invité·e : pourquoi pas de bulletin ?', 'Guest: why is there no ballot?'), L('Seuls les membres avec voix délibérative votent.', 'Only voting members can vote.')],
  [L('J’ai perdu mes identifiants.', 'I have lost my credentials.'), L('« Identifiants perdus ? » sur la page d’accès : nouveaux identifiants par deux canaux.', '“Lost credentials?” on the sign-in page: new ones arrive through two channels.')],
];
function SeanceHelp({ onClose }) {
  const [tab, setTab] = useState('note');
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const tuto = TUTO();
  useEffect(() => { if (!playing || tab !== 'tuto') return; const id = setInterval(() => setStep((x) => (x + 1) % tuto.length), 2200); return () => clearInterval(id); }, [playing, tab]);
  return (
    <Modal title={L('Aide', 'Help')} size="l" onClose={onClose}>
      <Tabs label={L('Rubriques d’aide', 'Help topics')} value={tab} onChange={setTab} tabs={[{ id: 'note', label: L('Guide', 'Guide') }, { id: 'tuto', label: L('Tutoriel vidéo', 'Video tutorial') }, { id: 'faq', label: 'FAQ' }, { id: 'contact', label: L('Contact', 'Contact') }]} />
      {tab === 'note' && (
        <TabPanel id="note">
          <ol class="list-plain stack stack-s">{tuto.map(([ic, t1, d], i) => <li key={ic} class="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}><span class="tag-num">{i + 1}</span><div><strong>{t1}</strong><div class="small muted">{d}</div></div></li>)}</ol>
          <div class="mt-12"><Btn size="sm" icon="print" onClick={() => printHtml('<h1>' + esc(L('Voter en séance', 'Voting in a meeting')) + '</h1><ol>' + tuto.map(([, t1, d]) => '<li><strong>' + esc(t1) + '</strong> : ' + esc(d) + '</li>').join('') + '</ol>')}>{L('Imprimer', 'Print')}</Btn></div>
        </TabPanel>
      )}
      {tab === 'tuto' && (
        <TabPanel id="tuto">
          <div class="tuto-screen" aria-live="polite">
            <div class="tuto-ico"><Icon name={tuto[step][0]} size={40} /></div>
            <div class="tuto-t">{step + 1}. {tuto[step][1]}</div>
            <div class="small">{tuto[step][2]}</div>
            <div class="tuto-dots" aria-hidden="true">{tuto.map((_, i) => <span key={i} class={i === step ? 'on' : ''} />)}</div>
          </div>
          <div class="row mt-12"><Btn size="sm" kind="primary" icon={playing ? 'pause' : 'play'} onClick={() => setPlaying(!playing)}>{playing ? L('Pause', 'Pause') : L('Lecture', 'Play')}</Btn><Btn size="sm" icon="arrowLeft" aria-label={L('Précédent', 'Previous')} onClick={() => setStep((step + tuto.length - 1) % tuto.length)} /><Btn size="sm" icon="arrowRight" aria-label={L('Suivant', 'Next')} onClick={() => setStep((step + 1) % tuto.length)} /></div>
          <p class="xs muted mt-8 mb-0">{L('Animation de démo, sans son. Version livrée : vidéo sous-titrée.', 'Silent demo animation. Delivered version: captioned video.')}</p>
        </TabPanel>
      )}
      {tab === 'faq' && <TabPanel id="faq"><div class="stack stack-s">{SFAQ().map(([q1, a]) => <details class="acc" key={q1}><summary>{q1}</summary><div class="acc-body small">{a}</div></details>)}</div></TabPanel>}
      {tab === 'contact' && <TabPanel id="contact"><KV items={[[L('Téléphone', 'Phone'), <span>{SUPPORT.phone} <span class="muted small">{L('gratuit, 24 h/24 · numéro de démo', 'free, 24/7 · demo number')}</span></span>], [L('Courriel', 'Email'), SUPPORT.email], [L('En salle', 'In the room'), L('Le secrétaire de séance vous aide', 'The meeting secretary can help')]]} /></TabPanel>}
      <div class="mt-12"><Ref c="4.1" /></div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Accès
export function ParticipantAccess({ q }) {
  const st = useStore();
  const seance = st.seance.seances.cme;
  const [tab, setTab] = useState(q.pin ? 'pin' : 'lien');
  const [step, setStep] = useState(0);
  const [pin, setPin] = useState(q.pin || '');
  const [ident, setIdent] = useState('');
  const [pw, setPw] = useState('');
  const [birth, setBirth] = useState('');
  const [mode, setMode] = useState('salle');
  const [err, setErr] = useState('');
  const [fails, setFails] = useState(0);
  const [wait, setWait] = useState(false);
  const [lost, setLost] = useState(!!q.perdu);
  const auth = st.auth.s_part;
  const sec = st.seance.security || { threshold: 3, lockMin: 5 };
  useEffect(() => { document.title = L('Vote en séance · accès', 'Meeting voting · sign in'); });
  useEffect(() => { if (q.pin) { setTab('pin'); setPin(q.pin); } }, [q.pin]);
  if (auth) { setTimeout(() => go('/seance/participant/s/' + auth.sid), 0); return null; }
  const enter = (method, memberId = ME_ID) => {
    setWait(true);
    setTimeout(() => {
      dispatch('auth/login', { key: 's_part', user: { memberId, sid: 'cme', method } });
      const m = getState().seance.seances.cme.members.find((x) => x.id === memberId);
      if (!m.present) dispatch('s/presence', { sid: 'cme', memberId, present: true, mode });
      go('/seance/participant/s/cme');
    }, 700);
  };
  const failOnce = (kind) => {
    const n = fails + 1;
    setFails(n);
    setErr(kind);
    if (n === sec.threshold) dispatch('s/alert', { alert: { type: 'bruteforce', title: 'Tentatives répétées d’accès participant', detail: sec.threshold + ' échecs consécutifs sur l’accès de la CME · accès bloqué ' + sec.lockMin + ' min · organisateur et administrateur alertés', sid: 'cme', src: '192.0.2.' + (40 + n) } });
  };
  const blocked = fails >= sec.threshold;
  const errMsg = { birth: L('Réponse incorrecte.', 'Incorrect answer.'), pin: L('PIN ou identifiant incorrect.', 'Incorrect PIN or ID.'), creds: L('Identifiants incorrects.', 'Incorrect credentials.') }[err];
  const errLine = () => (err ? <div class="err" role="alert"><Icon name="alert" size={16} />{errMsg} {blocked ? L(`Accès bloqué ${sec.lockMin} min, organisateur et administrateur alertés.`, `Locked for ${sec.lockMin} min, organiser and administrator alerted.`) : L(`Encore ${sec.threshold - fails} essai${sec.threshold - fails > 1 ? 's' : ''}.`, `${sec.threshold - fails} attempt${sec.threshold - fails > 1 ? 's' : ''} left.`)}</div> : null);
  const modeSel = () => (
    <div class="row-between" style={{ gap: '8px' }}>
      <span class="small">{L('Je participe', 'Attending')}</span>
      <div class="seg" role="group" aria-label={L('Mode de participation', 'Attendance mode')}>
        <button type="button" aria-pressed={mode === 'salle' ? 'true' : 'false'} onClick={() => setMode('salle')}>{L('En salle', 'In the room')}</button>
        <button type="button" aria-pressed={mode === 'visio' ? 'true' : 'false'} onClick={() => setMode('visio')}>{L('En visio', 'By video')}</button>
      </div>
    </div>
  );
  const submit = () => <button class="btn btn-primary btn-lg btn-block" type="submit" disabled={wait || blocked}>{wait ? <span class="spin" /> : null}{L('Entrer', 'Enter')}</button>;
  const sameBirth = (x) => x.replace(/\D/g, '') === PERSONA.birth.replace(/\D/g, '');
  return (
    <PtShell seance={seance}>
      <section class="card" aria-labelledby="pa-h">
        <h2 id="pa-h" class="mb-0">{L('Rejoindre la séance', 'Join the meeting')}</h2>
        {seance.openedAt && <p class="small muted">{L('Ouverte depuis ', 'Open since ')}{fmtTime(seance.openedAt)}</p>}
        <Tabs label={L('Mode d’accès', 'Sign-in method')} value={tab} onChange={(t1) => { setTab(t1); setErr(''); setStep(0); }} tabs={[{ id: 'lien', label: L('Lien personnel', 'Personal link') }, { id: 'pin', label: L('Code PIN', 'PIN code') }, { id: 'mdp', label: L('Identifiants', 'Credentials') }]} />
        {tab === 'lien' && (
          <TabPanel id="lien">
            {step === 0 ? (
              <div class="stack">
                <p class="small muted mb-0">{L('Lien reçu par courriel et dans l’invitation Teams.', 'Link sent by email and in the Teams invitation.')} <Tip>{L('Lien nominatif, à usage unique, valable pour cette séance.', 'Personal, single-use link, valid for this meeting only.')}</Tip></p>
                <Btn kind="primary" size="lg" block icon="link" onClick={() => setStep(1)}>{L('Ouvrir mon lien', 'Open my link')}</Btn>
              </div>
            ) : (
              <form class="stack" onSubmit={(e) => { e.preventDefault(); if (!sameBirth(birth)) return failOnce('birth'); enter('Lien personnel à usage unique'); }}>
                <p class="mb-0">{L('Bonjour', 'Hello')} <strong>Dr Sophie Bernard</strong></p>
                <Field label={L('Date de naissance', 'Date of birth')} id="pa-b"><input class="input" id="pa-b" placeholder={L('jj/mm/aaaa', 'dd/mm/yyyy')} value={birth} onInput={(e) => setBirth(e.currentTarget.value)} /></Field>
                {modeSel()}
                {errLine()}
                {submit()}
                <div class="center"><Btn size="sm" kind="ghost" onClick={() => setBirth(PERSONA.birth)}>{L('Remplir (démo)', 'Fill in (demo)')}</Btn></div>
              </form>
            )}
          </TabPanel>
        )}
        {tab === 'pin' && (
          <TabPanel id="pin">
            <form class="stack" onSubmit={(e) => { e.preventDefault(); if (pin.replace(/\s/g, '') !== seance.pin || ident.trim().toUpperCase() !== PERSONA.login) return failOnce('pin'); enter('Code PIN temporaire + identifiant'); }}>
              <div class="row" style={{ flexWrap: 'nowrap', gap: '14px' }}>
                <div class="qr-box" style={{ padding: '6px', flex: 'none', lineHeight: 0 }}><QrSvg text={absUrl('/seance/participant?pin=' + seance.pin)} size={84} /></div>
                <p class="small muted mb-0">{L('Scannez le QR code projeté en salle : le PIN se remplit seul.', 'Scan the QR code on the room screen: the PIN fills in by itself.')}</p>
              </div>
              <Field label={L('Code PIN de la séance', 'Meeting PIN')} id="pa-pin"><input class="input input-code" id="pa-pin" inputMode="numeric" maxLength={7} value={pin} onInput={(e) => setPin(e.currentTarget.value)} /></Field>
              <Field label={L('Identifiant', 'Member ID')} id="pa-id"><input class="input mono" id="pa-id" value={ident} onInput={(e) => setIdent(e.currentTarget.value)} autocomplete="username" /></Field>
              {modeSel()}
              {errLine()}
              {submit()}
              <div class="center"><Btn size="sm" kind="ghost" onClick={() => { setPin(seance.pin); setIdent(PERSONA.login); }}>{L('Remplir (démo)', 'Fill in (demo)')}</Btn></div>
            </form>
          </TabPanel>
        )}
        {tab === 'mdp' && (
          <TabPanel id="mdp">
            <form class="stack" onSubmit={(e) => { e.preventDefault(); if (ident.trim().toUpperCase() !== PERSONA.login || pw !== PERSONA.password || !sameBirth(birth)) return failOnce('creds'); enter('Identifiant, mot de passe et question personnelle'); }}>
              <Field label={L('Identifiant', 'Member ID')} id="pm-id"><input class="input mono" id="pm-id" value={ident} onInput={(e) => setIdent(e.currentTarget.value)} autocomplete="username" /></Field>
              <Field label={L('Mot de passe', 'Password')} id="pm-pw"><input class="input mono" id="pm-pw" type="password" value={pw} onInput={(e) => setPw(e.currentTarget.value)} autocomplete="current-password" /></Field>
              <Field label={L('Date de naissance', 'Date of birth')} id="pm-b"><input class="input" id="pm-b" placeholder={L('jj/mm/aaaa', 'dd/mm/yyyy')} value={birth} onInput={(e) => setBirth(e.currentTarget.value)} /></Field>
              {modeSel()}
              {errLine()}
              {submit()}
              <div class="row-between"><a href={href('/seance/participant?perdu=1')} class="small" onClick={(e) => { e.preventDefault(); setLost(true); }}>{L('Identifiants perdus ?', 'Lost credentials?')}</a><Btn size="sm" kind="ghost" onClick={() => { setIdent(PERSONA.login); setPw(PERSONA.password); setBirth(PERSONA.birth); }}>{L('Remplir (démo)', 'Fill in (demo)')}</Btn></div>
            </form>
          </TabPanel>
        )}
        <div class="mt-16">
          <More label={L('Autres méthodes', 'Other methods')}>
            <div class="stack stack-s">
              <Btn block onClick={() => enter('FranceConnect+')}>{L('FranceConnect+ (simulé)', 'FranceConnect+ (simulated)')}</Btn>
              <Btn block onClick={() => enter('Certificat ou carte professionnelle')}>{L('Carte CPS ou certificat', 'CPS card or certificate')}</Btn>
              <Btn block onClick={() => enter('Badge nominatif')}>{L('Badge nominatif', 'Name badge')}</Btn>
              <Btn block onClick={() => enter('Identifiant délégué')}>{L('Identifiant délégué', 'Delegated ID')}</Btn>
              {modeSel()}
            </div>
          </More>
        </div>
        <div class="mt-12"><Refs list={['4.1', '4.3', '4']} /></div>
      </section>
      <div class="mt-16"><DemoNote>
        <strong>Dr Sophie Bernard</strong>{L(', avec la procuration du Dr Antoine Petit.', ', holding a proxy for Dr Antoine Petit.')}
        <div class="mt-8">{L('Identifiant', 'ID')} <span class="cred">{PERSONA.login}</span>, {L('mot de passe', 'password')} <span class="cred">{PERSONA.password}</span>, {L('naissance', 'born')} <span class="cred">{PERSONA.birth}</span>, PIN <span class="cred">{seance.pin}</span></div>
        <div class="mt-8">{L('Invité sans droit de vote : ', 'Guest without voting rights: ')}<button class="linklike" onClick={() => enter('Lien personnel à usage unique', GUEST_ID)}>{L('entrer comme Dr Rémi Lacroix', 'enter as Dr Rémi Lacroix')}</button></div>
        <div class="mt-8">{L(`${sec.threshold} erreurs bloquent l’accès et alertent l’administrateur.`, `${sec.threshold} wrong answers lock access and alert the administrator.`)}</div>
      </DemoNote></div>
      {lost && <LostCreds onClose={() => setLost(false)} />}
    </PtShell>
  );
}

// Réémission sécurisée des identifiants (perte, non-réception)
function LostCreds({ onClose }) {
  const [step, setStep] = useState(0);
  const [mat, setMat] = useState('');
  const [b, setB] = useState('');
  const [err, setErr] = useState(false);
  const check = (e) => {
    e.preventDefault();
    if (mat.trim().toUpperCase() !== PERSONA.login || b.replace(/\D/g, '') !== PERSONA.birth.replace(/\D/g, '')) { setErr(true); return; }
    setErr(false); setStep(1);
    setTimeout(() => { setStep(2); dispatch('s/journal', { actor: 'Dr Sophie Bernard', role: 'Participant', action: 'Réémission sécurisée des identifiants', detail: 'Identité vérifiée · identifiant par courriel, mot de passe par SMS · anciens identifiants révoqués', op: 'cme' }); }, 1300);
  };
  return (
    <Modal title={L('Identifiants perdus', 'Lost credentials')} size="s" onClose={onClose} footer={step === 2 ? <Btn kind="primary" onClick={onClose}>{L('Fermer', 'Close')}</Btn> : null}>
      {step === 0 && (
        <form class="stack" onSubmit={check}>
          <p class="small muted mb-0">{L('Nouveaux identifiants par deux canaux ; les anciens sont révoqués.', 'New credentials through two channels; the old ones are revoked.')}</p>
          <Field label={L('Identifiant ou matricule', 'Member ID or staff number')} id="lc-m"><input class="input mono" id="lc-m" value={mat} onInput={(e) => setMat(e.currentTarget.value)} /></Field>
          <Field label={L('Date de naissance', 'Date of birth')} id="lc-b"><input class="input" id="lc-b" placeholder={L('jj/mm/aaaa', 'dd/mm/yyyy')} value={b} onInput={(e) => setB(e.currentTarget.value)} /></Field>
          {err && <div class="err" role="alert"><Icon name="alert" size={16} />{L('Aucun membre convoqué ne correspond.', 'No invited member matches.')}</div>}
          <div class="row-between"><Btn size="sm" kind="ghost" onClick={() => { setMat(PERSONA.login); setB(PERSONA.birth); }}>{L('Remplir (démo)', 'Fill in (demo)')}</Btn><button class="btn btn-primary" type="submit">{L('Vérifier', 'Verify')}</button></div>
        </form>
      )}
      {step === 1 && <p class="row"><span class="spin spin-dark" /> {L('Vérification…', 'Checking…')}</p>}
      {step === 2 && <Note tone="ok" icon="checkCircle">{L(`Identifiant envoyé à ${PERSONA.email}, mot de passe par SMS au 06 •• •• •• 41. Anciens identifiants révoqués.`, `ID sent to ${PERSONA.email}, password by text to 06 •• •• •• 41. Old credentials revoked.`)}</Note>}
      <div class="mt-12"><Ref c="4.1" /></div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Séance en cours
export function ParticipantSeance({ sid }) {
  const st = useStore();
  const now = useNow(500);
  const auth = st.auth.s_part;
  const [doc, setDoc] = useState(null);
  useEffect(() => { if (!auth) go('/seance/participant'); }, [auth]);
  const seance = st.seance.seances[sid];
  const vote = seance ? activeVote(st, sid) : null;
  // Clôture automatique à l'échéance, par l'onglet qui a ouvert le vote
  useEffect(() => { if (vote && vote.status === 'open' && vote.tab === TAB && voteRemaining(vote, now) <= 0) closeVote(vote); }, [now]);
  if (!auth || !seance) return null;
  document.title = L('Séance', 'Meeting') + ' · ' + seance.short;
  const me = seance.members.find((m) => m.id === auth.memberId);
  const proxyFrom = seance.members.filter((m) => m.proxyTo === me.id && !m.present && m.voting);
  const q = quorumInfo(seance);
  const items = flatAgenda(seance.agenda);
  const lastClosed = Object.values(st.seance.votes).filter((v) => v.sid === sid && v.status === 'closed').sort((a, b) => b.closedAt - a.closedAt)[0];
  const myVotes = Object.values(st.seance.votes).filter((v) => v.sid === sid && Object.keys(v.real || {}).some((k) => k.startsWith(me.id)));
  return (
    <PtShell seance={seance} user={me}>
      <section class="card card-tight mb-12" aria-label={L('Votre présence', 'Your attendance')}>
        <div class="row" style={{ flexWrap: 'nowrap' }}>
          <span class="avatar" aria-hidden="true">{initialsOf(me.name)}</span>
          <div class="grow" style={{ minWidth: 0 }}><div class="strong ellipsis">{me.name}</div><div class="xs muted">{statusLabel(me.status)}{me.weight > 1 ? ' · ' + L(`${me.weight} voix`, `${me.weight} votes`) : ''}</div></div>
          <Chip tone="ok">{me.mode === 'visio' ? L('En visio', 'By video') : L('En salle', 'In the room')}{me.arrivedAt ? ' · ' + fmtTime(me.arrivedAt) : ''}</Chip>
        </div>
        {proxyFrom.length > 0 && <div class="small mt-8">{L('Procuration de ', 'Proxy for ')}<strong>{proxyFrom.map((m) => m.name).join(', ')}</strong></div>}
        <div class="xs muted mt-8">{q.ok ? L('Quorum atteint', 'Quorum reached') : L('Quorum non atteint', 'Quorum not reached')} · {L(`${q.present} présents, ${q.required} requis`, `${q.present} present, ${q.required} needed`)} <Ref c="4" /></div>
      </section>

      {vote && !me.voting ? <NoVotePanel seance={seance} vote={vote} now={now} /> : vote ? <BallotPanel seance={seance} vote={vote} me={me} proxyFrom={proxyFrom} now={now} onDoc={setDoc} /> : (
        <section class="card mb-12 center" aria-live="polite">
          <Icon name="clock" size={28} style={{ color: 'var(--text-2)' }} />
          <h2 class="mt-8 mb-0" style={{ fontSize: '1.1rem' }}>{L('Aucun vote en cours', 'No vote in progress')}</h2>
          <p class="small muted mb-0">{me.voting ? L('Le bulletin s’affichera ici.', 'The ballot will appear here.') : L('Vous suivez la séance sans voter.', 'You follow the meeting without voting.')}</p>
          {lastClosed && <div class="mt-16" style={{ textAlign: 'left' }}><div class="small muted mb-8">{L('Dernier résultat · point ', 'Last result · item ')}{findItem(seance, lastClosed.itemId).num}</div><ResultView item={findItem(seance, lastClosed.itemId)} vote={lastClosed} compact /></div>}
        </section>
      )}

      {!vote && me.voting && <Autopilot seance={seance} />}

      <section class="card mb-12" aria-labelledby="pt-agenda">
        <h2 id="pt-agenda" style={{ fontSize: '1.05rem' }}>{L('Ordre du jour', 'Agenda')}</h2>
        <ul class="list-plain">
          {items.map((it) => {
            const lv = lastVote(st, sid, it.id);
            const done = seance.done[it.id];
            const isCur = vote && vote.itemId === it.id;
            return (
              <li key={it.id} class="member-row" style={{ display: 'block', paddingLeft: it.parent ? '18px' : 0 }}>
                <div class="row-between" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                  <div class="small"><strong>{it.num}.</strong> {it.tag && !it.title.startsWith(it.tag) && <span class="muted">{tagL(it.tag)} · </span>}{it.title}
                    {it.docs && <div class="row" style={{ gap: '14px' }}>{it.docs.map((d) => <button key={d} class="linklike small" style={{ padding: '4px 0' }} onClick={() => setDoc(d)}>{kindL(DOCS[d].kind)}</button>)}</div>}
                  </div>
                  {isCur ? <Chip tone="live">{L('Vote', 'Vote')}</Chip> : done ? <Chip tone={lv && lv.result && lv.result.kind === 'resolution' && !lv.result.adopted ? 'err' : 'ok'}>{lv && lv.result ? (lv.result.kind === 'resolution' ? (lv.result.adopted ? L('Adopté', 'Adopted') : L('Rejeté', 'Rejected')) : L('Clos', 'Closed')) : L('Traité', 'Done')}</Chip> : null}
                </div>
              </li>
            );
          })}
        </ul>
        <div class="mt-12"><Ref c="4.3" /></div>
      </section>

      {myVotes.length > 0 && (
        <section class="card" aria-labelledby="pt-mine">
          <h2 id="pt-mine" style={{ fontSize: '1.05rem' }}>{L('Mes accusés', 'My receipts')}</h2>
          {myVotes.map((v) => { const it = findItem(seance, v.itemId); return Object.entries(v.real).filter(([k]) => k.startsWith(me.id)).map(([k, r]) => (
            <div class="member-row" key={k + v.round}><div class="grow small" style={{ minWidth: 0 }}><div class="strong ellipsis">{it.num}. {it.title}</div><div class="xs muted">{v.round > 1 ? roundLabel(v.round, it.vote.rounds || 1) + ' · ' : ''}{r.proxyFor ? L('Procuration · ', 'Proxy · ') : ''}<span class="mono">{r.receipt}</span></div></div><Btn size="xs" icon="download" onClick={() => printHtml(receiptHtml(seance, it, v, r))}>PDF</Btn></div>
          )); })}
        </section>
      )}
      {doc && <DocViewer id={doc} onClose={() => setDoc(null)} />}
    </PtShell>
  );
}

function receiptHtml(seance, item, vote, r) {
  const nm = (id) => { const m = seance.members.find((x) => x.id === id); return m ? m.name : id; };
  return `<div class="doc-meta"><span>${esc(ESTAB.name)} · ${esc(seance.title)}</span><span>${esc(L('Accusé de réception', 'Receipt'))}</span></div><h1>${esc(L('Accusé de réception de vote', 'Vote receipt'))}</h1>
  <table><tbody><tr><th>${esc(L('Point', 'Item'))}</th><td>${esc(item.num)}. ${esc(item.title)}${vote.round > 1 ? ' · ' + esc(roundLabel(vote.round, item.vote.rounds || 1).toLowerCase()) : ''}</td></tr><tr><th>${esc(L('Votant', 'Voter'))}</th><td>${esc(nm(r.memberId))}${r.proxyFor ? ' (' + esc(L('procuration de ', 'proxy for ')) + esc(nm(r.proxyFor)) + ')' : ''}</td></tr><tr><th>${esc(L('Horodatage', 'Timestamp'))}</th><td>${esc(fmtDTS(r.at))}</td></tr><tr><th>${esc(L('N° d’accusé', 'Receipt no.'))}</th><td>${esc(r.receipt)}</td></tr><tr><th>${esc(L('Modalité', 'Method'))}</th><td>${esc(voteTypeLabel(item))}</td></tr></tbody></table>
  <p>${esc(L('Cet accusé ne mentionne pas le choix exprimé.', 'This receipt does not show the choice made.'))}</p><p style="font-size:8.5pt;color:#666">${esc(L('Démonstration · données fictives.', 'Demo · fictitious data.'))}</p>`;
}

// Participant sans voix délibérative : suit le vote, sans bulletin (CCTP 4.3)
function NoVotePanel({ seance, vote, now }) {
  const item = findItem(seance, vote.itemId);
  const remaining = voteRemaining(vote, now);
  return (
    <section class="vote-card mb-12" aria-labelledby="nv-h">
      <div class="vc-head"><h2 id="nv-h">{L('Point ', 'Item ')}{item.num}</h2><span class="timer"><Icon name="timer" size={16} /> {fmtMMSS(remaining)}</span></div>
      <div class="vc-body">
        <h3 style={{ fontSize: '1.15rem' }}>{item.title}</h3>
        <Note icon="lock">{L('Sans voix délibérative : pas de bulletin.', 'No voting rights: no ballot.')}</Note>
        <p class="xs muted mt-8 mb-0">{L(`${arrivedBallots(vote, now).length} votes sur ${vote.expected}`, `${arrivedBallots(vote, now).length} of ${vote.expected} votes cast`)} <Ref c="4.3" /></p>
      </div>
    </section>
  );
}

function Autopilot({ seance }) {
  const st = useStore();
  const items = votableItems(seance);
  const next = items.find((it) => { const lv = lastVote(st, seance.id, it.id); return !lv || (lv.result && lv.result.nextRound); });
  if (!next) return null;
  const lv = lastVote(st, seance.id, next.id);
  const round = lv && lv.result && lv.result.nextRound ? lv.result.nextRound : 1;
  // Démonstration : le dernier candidat se désiste entre deux tours s'il reste plus de deux candidats
  const withdrawn = round > 1 ? [...(lv.withdrawn || []), ...(lv.result.ranked.length > 2 ? [lv.result.ranked[lv.result.ranked.length - 1].id] : [])] : [];
  return (
    <div class="mb-12">
      <DemoNote>
        {L('Pas de console organisateur ouverte ?', 'No organiser console open?')}
        <div class="row mt-8" style={{ gap: '8px' }}><Btn size="sm" kind="primary" icon="play" onClick={() => openVote(seance, next, round, { duration: 45, withdrawn })}>{L(`Ouvrir le point ${next.num}`, `Open item ${next.num}`)}{round > 1 ? ' · ' + roundLabel(round, next.vote.rounds || 1).toLowerCase() : ''} (45 s)</Btn><Btn size="sm" href={'/seance/organisateur/s/' + seance.id + '/console'} target="_blank" rel="noopener" icon="external">{L('Console', 'Console')}</Btn></div>
      </DemoNote>
    </div>
  );
}

function BallotPanel({ seance, vote, me, proxyFrom, now, onDoc }) {
  const item = findItem(seance, vote.itemId);
  const v = item.vote;
  const key = voteKey(vote.sid, vote.itemId, vote.round);
  const remaining = voteRemaining(vote, now);
  const ballots = [{ voterKey: me.id, memberId: me.id, proxyFor: null, tab: L('Mon vote', 'My vote'), label: L('Mon vote', 'My vote'), weight: me.weight || 1 }, ...proxyFrom.map((p) => ({ voterKey: me.id + '>' + p.id, memberId: me.id, proxyFor: p.id, tab: proxyFrom.length > 1 ? p.name : L('Procuration', 'Proxy'), label: L('Procuration de ', 'Proxy for ') + p.name, weight: p.weight || 1 }))];
  const [cur, setCur] = useState(0);
  const b = ballots[Math.min(cur, ballots.length - 1)];
  const existing = vote.real[b.voterKey];
  const opts = vote.options || (v.type === 'resolution' ? v.expr : v.type === 'uninominal' || v.type === 'plurinominal' ? [...v.candidates.map((c) => c.id), 'blanc'] : v.type === 'liste' ? [...v.lists.map((l) => l.id), 'blanc'] : v.type === 'multi' ? [] : v.options.map((o) => o.id));
  const init = (ex) => (ex ? ex.choice : v.type === 'plurinominal' ? [] : v.type === 'classement' ? v.options.map((o) => o.id) : v.type === 'multi' ? {} : null);
  const [sel, setSel] = useState(init(existing));
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState(!existing);
  useEffect(() => { const ex = vote.real[ballots[Math.min(cur, ballots.length - 1)].voterKey]; setSel(init(ex)); setEditing(!ex); }, [cur, key]);
  const suspended = vote.status === 'suspended';
  const can = !suspended && remaining > 0;
  const valid = v.type === 'plurinominal' ? sel && sel.length > 0 && sel.length <= v.seats : v.type === 'classement' ? true : v.type === 'multi' ? !!sel && v.questions.every((qq) => sel[qq.id]) : !!sel;
  const cast = () => {
    const receipt = 'SV-' + randCode(2, 4);
    dispatch('s/vote/cast', { key, voterKey: b.voterKey, memberId: b.memberId, proxyFor: b.proxyFor, weight: b.weight, choice: sel, receipt, name: me.name });
    setConfirm(false); setEditing(false);
    toast(b.proxyFor ? L('Vote par procuration enregistré', 'Proxy vote recorded') : L('Vote enregistré', 'Vote recorded'), 'ok');
    if (cur < ballots.length - 1 && !vote.real[ballots[cur + 1].voterKey]) setTimeout(() => setCur(cur + 1), 600);
  };
  const label = (id) => optionLabel(item, id);
  const move = (i, d) => { const a = sel.slice(); const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setSel(a); };
  const hint = v.type === 'plurinominal' ? L(`${sel ? sel.length : 0} sur ${v.seats} choix`, `${sel ? sel.length : 0} of ${v.seats} chosen`) : v.type === 'liste' ? L(`Une liste · ${v.seats} sièges`, `One list · ${v.seats} seats`) : v.type === 'classement' ? L('1 = priorité la plus haute', '1 = top priority') : null;
  // Choix lisible dans la confirmation (une ligne par question pour un vote groupé)
  const choiceView = (choice) => (v.type === 'multi' && choice ? <div class="stack stack-s">{v.questions.map((qq) => <div key={qq.id}>{qq.num}{L(' : ', ': ')}<strong>{choice[qq.id] ? label(choice[qq.id]) : '-'}</strong></div>)}</div> : v.type === 'classement' && Array.isArray(choice) ? <ol class="mb-0" style={{ paddingLeft: '20px' }}>{choice.map((x) => <li key={x}><strong>{label(x)}</strong></li>)}</ol> : <strong>{choiceLabel(item, choice)}</strong>);
  return (
    <section class="vote-card mb-12" aria-labelledby="vc-h">
      <div class="vc-head">
        <h2 id="vc-h">{L('Point ', 'Item ')}{item.num}{vote.round > 1 ? ' · ' + roundLabel(vote.round, v.rounds || 1).toLowerCase() : ''}</h2>
        {suspended ? <Chip tone="warn" icon="pause">{L('Suspendu', 'Paused')}</Chip> : <span class="timer" aria-label={L('Temps restant ', 'Time left ') + fmtMMSS(remaining)}><Icon name="timer" size={16} /> {fmtMMSS(remaining)}</span>}
      </div>
      <div class="vc-body">
        <h3 style={{ fontSize: '1.2rem', lineHeight: 1.3 }}>{item.title}</h3>
        {(v.mode === 'secret' || hint) && (
          <div class="row xs muted mb-8" style={{ gap: '10px' }}>
            {v.mode === 'secret' && <span class="row" style={{ gap: '4px' }}><Icon name="lock" size={13} />{L('Vote secret', 'Secret ballot')}<Tip>{L('Votre choix est chiffré sur votre appareil et séparé de votre identité.', 'Your choice is encrypted on your device and kept apart from your identity.')}</Tip></span>}
            {hint && <span>{hint}</span>}
          </div>
        )}
        {item.docs && <div class="row mb-12" style={{ gap: '6px' }}>{item.docs.map((d) => <button key={d} class="btn btn-xs" onClick={() => onDoc(d)}><Icon name="file" size={13} />{kindL(DOCS[d].kind)}</button>)}</div>}
        {ballots.length > 1 && (
          <div class="seg mb-12" role="tablist" aria-label={L('Bulletins', 'Ballots')} style={{ display: 'flex', width: '100%' }}>
            {ballots.map((x, i) => <button key={x.voterKey} role="tab" aria-selected={i === cur ? 'true' : 'false'} title={x.label} style={{ flex: 1 }} onClick={() => setCur(i)}>{x.tab}{vote.real[x.voterKey] && <Icon name="check" size={13} style={{ marginLeft: '4px', verticalAlign: '-2px' }} />}</button>)}
          </div>
        )}
        {existing && !editing ? (
          <div class="stack stack-s" aria-live="polite">
            <Note tone="ok" icon="checkCircle"><strong>{b.proxyFor ? L('Vote par procuration enregistré', 'Proxy vote recorded') : L('Vote enregistré', 'Vote recorded')}</strong> · {fmtTimeS(existing.at)}{existing.changes ? L(` (modifié ${existing.changes} fois)`, ` (changed ${existing.changes}×)`) : ''}<div class="small">{L('Accusé ', 'Receipt ')}<span class="mono">{existing.receipt}</span></div></Note>
            {v.mode !== 'secret' && <div class="small">{L('Votre choix : ', 'Your choice: ')}<strong>{choiceLabel(item, existing.choice)}</strong></div>}
            <div class="row">
              {can && <Btn icon="edit" onClick={() => setEditing(true)}>{L('Modifier', 'Change')}</Btn>}
              <Btn kind="ghost" icon="download" onClick={() => printHtml(receiptHtml(seance, item, vote, existing))}>{L('Accusé (PDF)', 'Receipt (PDF)')}</Btn>
              <Btn kind="ghost" icon="mail" onClick={() => toast(L('Accusé envoyé à ', 'Receipt sent to ') + PERSONA.email, 'ok')}>{L('Par courriel', 'Email')}</Btn>
            </div>
            <div><Ref c="4.3" /></div>
          </div>
        ) : (
          <>
            {!can && <div class="mb-12"><Note tone="warn" icon="pause">{suspended ? L('Vote suspendu par l’organisateur.', 'Voting paused by the organiser.') : L('Temps écoulé.', 'Time is up.')}</Note></div>}
            <fieldset disabled={!can}>
              <legend class="sr-only">{item.title}</legend>
              {(v.type === 'resolution' || v.type === 'uninominal' || v.type === 'sondage') && (
                <div class="big-choice" role="radiogroup" aria-label={L('Votre choix', 'Your choice')}>
                  {opts.map((o) => <button type="button" key={o} class="bc-btn" role="radio" aria-checked={sel === o ? 'true' : 'false'} aria-pressed={sel === o ? 'true' : 'false'} onClick={() => setSel(o)}>{v.type === 'resolution' && <span class="bc-sw" style={{ background: EXPR_COLORS[o] }} aria-hidden="true" />}{label(o)}</button>)}
                </div>
              )}
              {v.type === 'liste' && (
                <div class="big-choice" role="radiogroup" aria-label={L('Choisissez une liste', 'Choose a list')}>
                  {opts.map((o) => { const l = v.lists.find((x) => x.id === o); return <button type="button" key={o} class="bc-btn" role="radio" aria-checked={sel === o ? 'true' : 'false'} aria-pressed={sel === o ? 'true' : 'false'} onClick={() => setSel(o)}><span>{label(o)}{l && <span class="xs muted" style={{ display: 'block', fontWeight: 400 }}>{l.candidates.slice(0, 2).join(', ')}… ({l.candidates.length})</span>}</span></button>; })}
                </div>
              )}
              {v.type === 'multi' && (
                <div class="stack stack-s">
                  {v.questions.map((qq) => (
                    <div key={qq.id} class="mq-q">
                      <div class="small strong mb-8" id={'mq-' + qq.id}>{qq.num}. {qq.title}</div>
                      <div class="big-choice mq-opts" role="radiogroup" aria-labelledby={'mq-' + qq.id}>
                        {(qq.expr || v.expr).map((o) => <button type="button" key={o} class="bc-btn" role="radio" aria-checked={sel && sel[qq.id] === o ? 'true' : 'false'} aria-pressed={sel && sel[qq.id] === o ? 'true' : 'false'} onClick={() => setSel({ ...(sel || {}), [qq.id]: o })}><span class="bc-sw" style={{ background: EXPR_COLORS[o] }} aria-hidden="true" />{label(o)}</button>)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {v.type === 'plurinominal' && (
                <div class="big-choice" role="group" aria-label={L(`Jusqu’à ${v.seats} candidats`, `Up to ${v.seats} candidates`)}>
                  {v.candidates.map((c) => { const on = sel.includes(c.id); const full = !on && sel.length >= v.seats; return <button type="button" key={c.id} class="bc-btn" role="checkbox" aria-checked={on ? 'true' : 'false'} aria-pressed={on ? 'true' : 'false'} disabled={full} onClick={() => setSel(on ? sel.filter((x) => x !== c.id) : [...sel, c.id])}><span>{c.name}<span class="xs muted" style={{ display: 'block', fontWeight: 400 }}>{c.spec}</span></span></button>; })}
                </div>
              )}
              {v.type === 'classement' && (
                <ol class="list-plain stack stack-s" aria-label={L('Classement (1 = priorité la plus haute)', 'Ranking (1 = top priority)')}>
                  {sel.map((id, i) => <li key={id} class="bc-btn" style={{ cursor: 'default' }}><span class="tag-num">{i + 1}</span><span class="grow">{label(id)}</span><button type="button" class="btn btn-xs" aria-label={L('Monter ', 'Move up ') + label(id)} onClick={() => move(i, -1)} disabled={i === 0}>↑</button><button type="button" class="btn btn-xs" aria-label={L('Descendre ', 'Move down ') + label(id)} onClick={() => move(i, 1)} disabled={i === sel.length - 1}>↓</button></li>)}
                </ol>
              )}
            </fieldset>
            <div class="stack stack-s mt-16">
              <Btn kind="primary" size="lg" block icon="check" disabled={!valid || !can} onClick={() => setConfirm(true)}>{L('Valider', 'Submit')}</Btn>
              {existing && <Btn kind="ghost" block onClick={() => { setSel(existing.choice); setEditing(false); }}>{L('Annuler', 'Cancel')}</Btn>}
            </div>
          </>
        )}
      </div>
      {confirm && (
        <Modal title={L('Confirmez-vous ce vote ?', 'Confirm this vote?')} size="s" onClose={() => setConfirm(false)} footer={<><Btn onClick={() => setConfirm(false)}>{L('Revenir', 'Back')}</Btn><Btn kind="primary" icon="check" onClick={cast} data-autofocus>{L('Confirmer', 'Confirm')}</Btn></>}>
          <p class="small muted mb-8">{b.label} · {L('point ', 'item ')}{item.num}</p>
          <div style={{ fontSize: '1.1rem' }}>{choiceView(sel)}</div>
        </Modal>
      )}
    </section>
  );
}
