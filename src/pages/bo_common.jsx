// Éléments communs aux espaces de gestion : connexion renforcée, double signature.
import { useEffect, useState } from 'preact/hooks';
import { dispatch, useStore } from '../lib/store.js';
import { Btn, Modal, Note, DemoNote, Refs, Field, toast } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';
import { Brand } from '../ui/shell.jsx';
import { randHex } from '../lib/prng.js';
import { BUREAU, bureauRole } from '../data/remote.js';
import { L, tx } from '../lib/i18n.js';

export function BackOfficeLogin({ title, sub, user, methods, onDone, refs, note }) {
  const [m, setM] = useState(methods[0][0]);
  const [phase, setPhase] = useState('idle');
  const [id, setId] = useState('');
  const [code, setCode] = useState('');
  const go = () => {
    setPhase('wait');
    setTimeout(() => { setPhase('ok'); setTimeout(() => onDone(m), 450); }, 1100);
  };
  return (
    <main id="main" class="container-s" style={{ padding: '40px 16px 100px' }}>
      <div class="center mb-24"><Brand sub={sub} /></div>
      <section class="card" aria-labelledby="bo-login-h">
        <h1 id="bo-login-h" style={{ fontSize: '1.5rem' }}>{title}</h1>
        <p class="muted small">{L('Authentification forte, chaque connexion est journalisée.', 'Strong authentication, every sign-in is logged.')}</p>
        <div class="row mt-16" style={{ flexWrap: 'nowrap' }}>
          <span class="avatar" aria-hidden="true"><Icon name="user" size={18} /></span>
          <div><div class="strong">{user.name}</div><div class="small muted">{user.role}</div></div>
        </div>
        <fieldset class="mt-24">
          <legend style={{ fontSize: '.95rem' }}>{L('Méthode', 'Method')}</legend>
          <div class="choices">
            {methods.map(([k, label, desc, icon]) => (
              <label key={k} class={'choice ' + (m === k ? 'checked' : '')} style={{ minHeight: '56px', padding: '10px 14px' }}>
                <input type="radio" name="bo-m" checked={m === k} onChange={() => setM(k)} />
                <span class="tick" aria-hidden="true" />
                <span class="c-body"><span class="c-title" style={{ fontSize: '.95rem' }}>{label}</span>{desc && <span class="c-sub" style={{ display: 'block' }}>{desc}</span>}</span>
                <Icon name={icon} size={20} style={{ color: 'var(--text-2)' }} />
              </label>
            ))}
          </div>
        </fieldset>
        {m === 'pwd' && (
          <div class="grid g2 mt-16">
            <Field label={L('Identifiant', 'Username')} id="bo-id"><input class="input" id="bo-id" value={id} onInput={(e) => setId(e.currentTarget.value)} autocomplete="username" /></Field>
            <Field label={L('Code à usage unique', 'One-time code')} id="bo-otp"><input class="input mono" id="bo-otp" value={code} onInput={(e) => setCode(e.currentTarget.value)} inputMode="numeric" autocomplete="one-time-code" /></Field>
          </div>
        )}
        <div class="mt-16" aria-live="polite">
          {phase === 'wait' && <Note icon="key"><span class="row" style={{ gap: '10px' }}><span class="spin spin-dark" />{m === 'fido' ? L('Touchez votre clé de sécurité…', 'Touch your security key…') : m === 'cps' ? L('Lecture de la carte…', 'Reading the card…') : m === 'sso' ? L('Redirection vers le fournisseur d’identité…', 'Redirecting to the identity provider…') : L('Vérification du code…', 'Checking the code…')}</span></Note>}
          {phase === 'ok' && <Note tone="ok" icon="checkCircle">{L('Authentifié', 'Signed in')}</Note>}
        </div>
        <div class="row-between mt-16">
          {refs ? <Refs list={refs} /> : <span />}
          <Btn kind="primary" size="lg" onClick={() => { if (m === 'pwd' && (!id || !code)) { setId(user.login || 'demo.utilisateur'); setCode('428 913'); } go(); }} disabled={phase !== 'idle'}>{L('Se connecter (démo)', 'Sign in (demo)')}</Btn>
        </div>
      </section>
      {note && <div class="mt-16"><DemoNote>{note}</DemoNote></div>}
    </main>
  );
}

// Validation à double signature (CCTP 3 : actions critiques)
export function DualModal({ action, onClose, onDone, signers, me }) {
  const st = useStore();
  const [id] = useState('dual-' + randHex(8));
  const [who, setWho] = useState(null);
  const [phase, setPhase] = useState('choose');
  const others = (signers || BUREAU).filter((b) => b.name !== me);
  useEffect(() => {
    dispatch('r/dual/request', { id, opId: action.opId, kind: action.kind, label: action.label, reason: action.reason, by: me, target: action.target });
    return () => {};
  }, []);
  const cancel = () => {
    const d = st.remote.dual.find((x) => x.id === id);
    if (d && d.status === 'pending') dispatch('r/dual/cancel', { id });
    onClose();
  };
  const sign = () => {
    setPhase('wait');
    setTimeout(() => {
      dispatch('r/dual/approve', { id, by: who.name });
      setPhase('ok');
      toast(tx(action.label) + L(' : validé', ': approved'), 'ok');
      setTimeout(() => { onDone && onDone(); onClose(); }, 600);
    }, 1000);
  };
  return (
    <Modal title={L('Double signature', 'Dual signature')} onClose={cancel} footer={<><Btn onClick={cancel}>{L('Annuler', 'Cancel')}</Btn><Btn kind="primary" disabled={!who || phase !== 'choose'} onClick={sign}>{L('Signer en tant que second membre', 'Sign as second member')}</Btn></>}>
      <p><strong>{tx(action.label)}</strong></p>
      {action.reason && <p class="small muted">{tx(action.reason)}</p>}
      <div class="check-row"><span class="cr-ico cr-ok"><Icon name="check" size={16} stroke={3} /></span><div class="grow"><div class="strong small">{me}</div><div class="xs muted">{L('1re signature', '1st signature')}</div></div></div>
      <fieldset class="mt-16">
        <legend style={{ fontSize: '.95rem' }}>{L('2e signature', '2nd signature')}</legend>
        <div class="choices">
          {others.map((b) => (
            <label key={b.id} class={'choice ' + (who && who.id === b.id ? 'checked' : '')} style={{ minHeight: '52px', padding: '8px 12px' }}>
              <input type="radio" name="dual" checked={who && who.id === b.id} onChange={() => setWho(b)} />
              <span class="tick" aria-hidden="true" />
              <span class="c-body"><span class="c-title" style={{ fontSize: '.95rem' }}>{b.name}</span><span class="c-sub" style={{ display: 'block' }}>{bureauRole(b)}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div class="mt-12" aria-live="polite">
        {phase === 'wait' && <Note icon="key"><span class="row" style={{ gap: '10px' }}><span class="spin spin-dark" />{who.name}{L(' s’authentifie…', ' is signing…')}</span></Note>}
        {phase === 'ok' && <Note tone="ok" icon="checkCircle">{L('Validé et journalisé', 'Approved and logged')}</Note>}
      </div>
      <p class="xs muted mt-12">{L('Démo : seconde signature simulée ici. En production, depuis le poste du second membre.', 'Demo: second signature simulated here. In production, from the second member’s own device.')} <Refs list={['3']} /></p>
    </Modal>
  );
}
