// Console d'administration du vote à distance.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useStore, useNow, dispatch, getState } from '../lib/store.js';
import { go } from '../lib/router.js';
import { BackOffice } from '../ui/shell.jsx';
import { Btn, Chip, Card, PageHead, Kpi, BarRow, Note, Refs, Modal, Tabs, TabPanel, KV, Pager, toast, Empty, Field, Switch, Check, Stepper, Select, Progress, Tip, More } from '../ui/kit.jsx';
import { Icon, UnionLogo } from '../ui/icons.jsx';
import { BackOfficeLogin, DualModal } from './bo_common.jsx';
import { BUREAU, UNIONS, SITES, ESTAB, STAFF, listCandidates, drawOrder, roleLabel, bureauRole, staffLabel, staffScope, opName } from '../data/remote.js';
import { opCounts, urnCount, urnResults } from '../lib/sim.js';
import { fmtDT, fmtDate, fmtTime, fmtNum, fmtPct, fmtDur, relTime, dayAt } from '../lib/format.js';
import { sha256, shortFp } from '../lib/sha256.js';
import { downloadCSV, downloadJSON, downloadXML, printHtml, esc } from '../lib/exporters.js';
import { randHex, rng, pick } from '../lib/prng.js';
import { FIRST_F, FIRST_M, LAST } from '../data/names.js';
import { SUPPORT } from '../config.js';
import { BRAND_PRESETS, brandStyle } from '../data/branding.js';
import { t, L, tx } from '../lib/i18n.js';

// Nom de l'administrateur : enregistré tel quel dans le journal
const ME = 'Paul Renaud';
const meUser = () => ({ name: ME, role: L('Administrateur fonctionnel · DRH', 'Functional administrator · HR') });

// Statut d'une opération, dans la langue courante
const statusL = (s) => ({
  open: L('Ouvert', 'Open'), suspended: L('Suspendu', 'Suspended'), ended: L('Vote terminé', 'Voting ended'), closed: L('Clôturé', 'Closed'),
  'sealed-after': L('Urnes scellées', 'Boxes sealed'), counted: L('Dépouillé', 'Counted'), published: L('Résultats proclamés', 'Results announced'), archived: L('Archivé', 'Archived'),
}[s] || s);
const StatusChip = ({ s }) => <Chip tone={s === 'open' ? 'ok' : s === 'suspended' ? 'warn' : 'gray'}>{statusL(s)}</Chip>;

// Ligne de réglage : libellé à gauche, contrôle à droite
function SetRow({ label, id, children }) {
  return <div class="member-row" style={{ justifyContent: 'space-between', gap: '16px' }}><label for={id} class="grow">{label}</label>{children}</div>;
}

export function AdminGate({ page, sub, q }) {
  const st = useStore();
  if (!st.auth.r_admin) {
    return <BackOfficeLogin title={L('Administration', 'Administration')} sub={L('Vote à distance · administration', 'Remote voting · admin')} user={meUser()}
      methods={[['fido', L('Clé de sécurité (FIDO2)', 'Security key (FIDO2)'), L('Imposée aux administrateurs', 'Required for administrators'), 'key'], ['sso', L('SSO de l’établissement', 'Hospital single sign-on'), L('SAML / OIDC, second facteur', 'SAML / OIDC, second factor'), 'building'], ['pwd', L('Identifiant et code à usage unique', 'Username and one-time code'), L('Application d’authentification', 'Authenticator app'), 'lock']]}
      refs={['2.6', '2.7']} note={L('Connexion simulée. L’administrateur ne voit ni résultats partiels ni émargement.', 'Simulated sign-in. Administrators never see partial results or the voter roll.')}
      onDone={(m) => { dispatch('auth/login', { key: 'r_admin', user: { name: ME, role: 'Administrateur fonctionnel · cellule élections (DRH)', method: m } }); dispatch('r/journal', { actor: ME, role: 'Administrateur', action: 'Connexion à la console d’administration', detail: m === 'fido' ? 'Clé FIDO2' : m === 'sso' ? 'SSO établissement' : 'Code à usage unique', op: '' }); if (!page) go('/distance/admin/accueil'); }} />;
  }
  const nav = [
    { group: L('Pilotage', 'Elections'), items: [{ path: '/distance/admin/accueil', label: L('Vue d’ensemble', 'Overview'), icon: 'home' }, { path: '/distance/admin/scrutins', label: L('Scrutins', 'Elections'), icon: 'urn' }, { path: '/distance/admin/scrutins/nouveau', label: L('Créer un scrutin', 'New election'), icon: 'plus' }, { path: '/distance/admin/depouillement', label: L('Dépouillement', 'Count'), icon: 'key' }] },
    { group: L('Données', 'Data'), items: [{ path: '/distance/admin/electeurs', label: L('Listes électorales', 'Electoral rolls'), icon: 'users' }, { path: '/distance/admin/candidatures', label: L('Candidatures', 'Candidates'), icon: 'list' }, { path: '/distance/admin/materiel', label: L('Matériel de vote', 'Voting material'), icon: 'mail' }, { path: '/distance/admin/echanges', label: L('Échanges', 'File exchange'), icon: 'inbox' }] },
    { group: L('Sécurité', 'Security'), items: [{ path: '/distance/admin/roles', label: L('Rôles', 'Roles'), icon: 'shield' }, { path: '/distance/admin/securite', label: L('Authentification', 'Authentication'), icon: 'lock' }, { path: '/distance/admin/personnalisation', label: L('Personnalisation', 'Branding'), icon: 'edit' }] },
    { group: L('Exploitation', 'Operations'), items: [{ path: '/distance/admin/supervision', label: L('Supervision', 'Monitoring'), icon: 'server' }, { path: '/distance/admin/test', label: L('Votes tests', 'Test votes'), icon: 'listCheck' }, { path: '/distance/admin/support', label: L('Assistance', 'Support'), icon: 'phone' }] },
    { group: L('Fin de cycle', 'End of cycle'), items: [{ path: '/distance/admin/archives', label: L('Archives', 'Archives'), icon: 'archive' }, { path: '/distance/admin/reversibilite', label: L('Réversibilité', 'Reversibility'), icon: 'database' }] },
  ];
  const key = sub ? page + '/' + sub : page || 'accueil';
  const P = { accueil: Overview, scrutins: Scrutins, 'scrutins/nouveau': Wizard, electeurs: Electeurs, candidatures: Candidatures, materiel: Materiel, echanges: Echanges, roles: Roles, securite: Securite, supervision: Supervision, test: Tests, support: Support, archives: Archives, reversibilite: Reversibilite, depouillement: GestionDepouillement, personnalisation: Personnalisation }[key] || Overview;
  return (
    <BackOffice brandSub={L('Vote à distance · administration', 'Remote voting · admin')} nav={nav} current={'/distance/admin/' + key} user={{ name: ME, role: roleLabel('administrateur') }} context={<Chip tone="gray" icon="building">{ESTAB.name}</Chip>} onLogout={() => { dispatch('auth/logout', { key: 'r_admin' }); go('/distance/admin'); }}>
      <P q={q} />
    </BackOffice>
  );
}

// ------------------------------------------------------------------ Gestion du dépouillement (CCTP 2.6)
function GestionDepouillement() {
  const st = useStore();
  const now = useNow(5000);
  const ops = Object.values(st.remote.ops);
  const STEPS = [['open', L('En cours', 'Open')], ['ended', L('Fin du vote', 'Voting ends')], ['closed', L('Clôture', 'Closing')], ['sealed-after', L('Scellement', 'Sealing')], ['counted', L('Dépouillement', 'Count')], ['published', L('Proclamation', 'Results')]];
  return (
    <>
      <PageHead title={L('Dépouillement', 'Count')} sub={L('Le déchiffrement reste au bureau de vote.', 'Only the polling station decrypts.')} refs={['2.6', '3.3']} />
      <div class="stack">
        {ops.map((o) => {
          const idx = Math.max(0, STEPS.findIndex(([k]) => k === (o.status === 'archived' ? 'published' : o.status)));
          const holders = o.holders.map((id) => BUREAU.find((b) => b.id === id)).filter(Boolean);
          const conv = (st.remote.convocations || {})[o.id];
          const done = ['counted', 'published', 'archived'].includes(o.status);
          return (
            <Card key={o.id} title={opName(o)} actions={<StatusChip s={o.status} />}>
              <div class="phases" role="list" aria-label={L('Étapes jusqu’à la proclamation', 'Steps to results')}>{STEPS.map(([k, l], i) => <div role="listitem" key={k} class={'phase ' + (i < idx ? 'done' : i === idx ? 'cur' : '')}>{l}</div>)}</div>
              <div class="grid g2 mt-16" style={{ alignItems: 'start' }}>
                <KV items={[[L('Fin du vote', 'Voting ends'), fmtDT(o.close) + (o.status === 'open' ? ' (' + L('dans ', 'in ') + fmtDur(o.close - now) + ')' : '')], [L('Dépouillement', 'Count'), fmtDT(dayAt(o.close, 0, 17, 30))], [L('Parts de clé', 'Key shares'), L(`${o.holders.length} détenteurs · seuil ${o.threshold}`, `${o.holders.length} holders · threshold ${o.threshold}`)], [L('Lieu', 'Place'), L('Bureau centralisateur et visio', 'Central polling room and video')]]} />
                <div>
                  <div class="xs muted mb-8">{L('Détenteurs de clés', 'Key holders')}</div>
                  {holders.map((h) => <div key={h.id} class="member-row"><span class="avatar avatar-s" aria-hidden="true">{h.name.split(' ').map((w) => w[0]).join('')}</span><div class="grow small"><strong>{h.name}</strong><div class="xs muted">{bureauRole(h)}</div></div>{done ? null : conv ? <Chip tone="ok">{L('Convoqué·e', 'Invited')}</Chip> : <Chip tone="gray">{L('À convoquer', 'To invite')}</Chip>}</div>)}
                </div>
              </div>
              <div class="row mt-12">
                {done ? <Btn size="sm" icon="chart" href="/distance/bureau/resultats">{L('Résultats', 'Results')}</Btn> : <>
                  <Btn kind="primary" size="sm" icon="send" disabled={!!conv} onClick={() => { dispatch('r/convocation', { opId: o.id, by: ME, n: o.holders.length }); toast(L('Convocations envoyées', 'Invitations sent'), 'ok'); }}>{conv ? L('Convoqués le ', 'Invited on ') + fmtDT(conv) : L('Convoquer les détenteurs de clés', 'Invite key holders')}</Btn>
                  <Btn size="sm" icon="external" href="/distance/bureau/depouillement">{L('Espace bureau', 'Polling station')}</Btn>
                </>}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Personnalisation (CCTP 2.8)
const PRESET_EN = { defaut: 'Default', bleu: 'Institutional blue', sarcelle: 'Teal', bordeaux: 'Burgundy', vert: 'Forest green' };
// L'aperçu applique aussi la palette à l'accent (boutons), que brandStyle ne couvre pas
const previewStyle = (d) => { const p = BRAND_PRESETS[d.preset]; const x = brandStyle(d); return x ? { ...x, '--accent': p.c600, '--accent-hover': p.c700, '--accent-soft': p.c50 } : undefined; };
function Personnalisation() {
  const st = useStore();
  const b = st.remote.branding || {};
  const [d, setD] = useState({ preset: b.preset || 'defaut', logo: b.logo || 'building', title_fr: b.title_fr || '', lead_fr: b.lead_fr || '', title_en: b.title_en || '', lead_en: b.lead_en || '' });
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const save = () => { dispatch('r/branding/set', { branding: d, by: ME }); toast(L('Personnalisation publiée', 'Branding published'), 'ok'); };
  const p = BRAND_PRESETS[d.preset];
  return (
    <>
      <PageHead title={L('Personnalisation', 'Branding')} refs={['2.8']} actions={<><Btn icon="external" href="/distance/electeur" target="_blank" rel="noopener">{L('Portail électeur', 'Voter portal')}</Btn><Btn kind="primary" icon="check" onClick={save}>{L('Publier', 'Publish')}</Btn></>} />
      <div class="grid g-side">
        <div class="stack">
          <Card title={L('Couleur', 'Colour')}>
            <div class="choices">
              {Object.entries(BRAND_PRESETS).map(([k, x]) => <label key={k} class={'choice ' + (d.preset === k ? 'checked' : '')}><input type="radio" name="br-c" checked={d.preset === k} onChange={() => set('preset', k)} /><span class="tick" aria-hidden="true" /><span class="swatch" style={{ background: x.c600 || 'var(--accent)' }} aria-hidden="true" /><span class="c-body"><span class="c-title">{L(x.label, PRESET_EN[k] || x.label)}</span></span></label>)}
            </div>
          </Card>
          <Card title={<>{L('Logo', 'Logo')} <Tip>{L('En production : import SVG ou PNG, texte alternatif obligatoire.', 'In production: SVG or PNG upload, alt text required.')}</Tip></>}>
            <div class="seg" role="group" aria-label={L('Logo', 'Logo')}>{[['building', L('Bâtiment', 'Building')], ['heart', L('Santé', 'Health')], ['monogram', L('Monogramme « CHU »', '“CHU” monogram')]].map(([k, l]) => <button key={k} aria-pressed={d.logo === k ? 'true' : 'false'} onClick={() => set('logo', k)}>{l}</button>)}</div>
          </Card>
          <Card title={<>{L('Textes d’accueil', 'Welcome text')} <Tip>{L('Vide : texte par défaut. La version FALC n’est pas modifiée.', 'Empty: default text. The easy-read version is not changed.')}</Tip></>}>
            <div class="grid g2">
              <Field label={L('Titre (FR)', 'Title (FR)')} id="br-t"><input class="input" id="br-t" placeholder="Bienvenue sur votre espace de vote" value={d.title_fr} onInput={(e) => set('title_fr', e.currentTarget.value)} /></Field>
              <Field label={L('Titre (EN)', 'Title (EN)')} id="br-te"><input class="input" id="br-te" placeholder="Your voting area" value={d.title_en} onInput={(e) => set('title_en', e.currentTarget.value)} /></Field>
              <Field label={L('Message (FR)', 'Message (FR)')} id="br-l"><textarea class="textarea" id="br-l" rows="3" placeholder="Votez en ligne et en toute confidentialité…" value={d.lead_fr} onInput={(e) => set('lead_fr', e.currentTarget.value)} /></Field>
              <Field label={L('Message (EN)', 'Message (EN)')} id="br-le"><textarea class="textarea" id="br-le" rows="3" placeholder="Vote online, in confidence." value={d.lead_en} onInput={(e) => set('lead_en', e.currentTarget.value)} /></Field>
            </div>
          </Card>
        </div>
        <Card title={L('Aperçu', 'Preview')}>
          <div class="brand-preview" style={previewStyle(d)}>
            <div class="bp-head"><span class="e-mark" style={{ color: 'var(--accent)' }}>{d.logo === 'monogram' ? <span class="e-mono">CHU</span> : <Icon name={d.logo === 'heart' ? 'heartPulse' : 'building'} size={22} />}</span><div><strong>{ESTAB.name}</strong><div class="xs muted">{L('Espace électeur', 'Voter area')}</div></div></div>
            <div class="bp-band"><div class="bp-title">{L(d.title_fr, d.title_en) || t('w.title')}</div><div class="small">{L(d.lead_fr, d.lead_en) || t('w.lead')}</div></div>
            <div class="bp-body"><span class="btn btn-primary btn-sm">{L('Continuer', 'Continue')}</span> <span class="btn btn-sm">{L('Aide', 'Help')}</span></div>
          </div>
          {p.c600 && <p class="xs muted mt-8 mb-0">{L('Contraste AA vérifié', 'AA contrast checked')}</p>}
        </Card>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Vue d'ensemble
function Overview() {
  const st = useStore();
  const now = useNow(3000);
  const ops = Object.values(st.remote.ops);
  const live = ops.filter((o) => o.status === 'open');
  const alerts = st.remote.alerts.filter((a) => a.status === 'nouvelle');
  const pending = st.remote.drafts.filter((d) => d.status === 'pending');
  const nUrns = live.reduce((a, o) => a + o.urns.length, 0);
  return (
    <>
      <PageHead title={L('Vue d’ensemble', 'Overview')} refs={['3', '3.3']} actions={<Btn kind="primary" icon="plus" href="/distance/admin/scrutins/nouveau">{L('Créer un scrutin', 'New election')}</Btn>} />
      <div class="grid g4 mb-16">
        <Kpi label={L('Scrutins en cours', 'Live elections')} value={String(live.length)} sub={L(`${nUrns} urnes ouvertes`, `${nUrns} ballot boxes open`)} />
        <Kpi label={L('Disponibilité (30 j)', 'Uptime (30 days)')} value={fmtPct(0.9998, 2)} tone="ok" sub={L('Objectif 99,9 %', 'Target 99.9 %')} />
        <Kpi label={L('Alertes ouvertes', 'Open alerts')} value={String(alerts.length)} tone={alerts.length ? 'warn' : 'ok'} />
        <Kpi label={L('Dernier test de bascule', 'Last failover test')} value={relTime(st.remote.failover.lastTest, now)} sub={st.remote.failover.lastDuration + ' s'} />
      </div>
      <div class="grid g-side">
        <div class="stack">
          {ops.map((o) => {
            const c = opCounts(st, o.id, now);
            return (
              <Card key={o.id} title={<>{opName(o)} <Tip>{tx(o.scenario)}</Tip></>} actions={<StatusChip s={o.status} />}>
                <div class="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
                  <div><div class="xs muted">{L('Période', 'Period')}</div><div class="small strong">{fmtDate(o.open)} → {fmtDate(o.close)}</div></div>
                  <div><div class="xs muted">{L('Électeurs', 'Voters')}</div><div class="small strong">{fmtNum(c.electors)} · {o.urns.length > 1 ? L(`${o.urns.length} urnes`, `${o.urns.length} boxes`) : L('1 urne', '1 box')}</div></div>
                  <div><div class="xs muted">{L('Niveau de sécurité', 'Security level')}</div><div class="small strong">{o.level}</div></div>
                </div>
                <div class="mt-12">{c.byInstance.length > 1
                  ? c.byInstance.map((g) => <BarRow key={g.instance} label={g.instance} value={g.voted} max={g.electors} right={fmtPct(g.voted / g.electors) + ' · ' + fmtNum(g.voted)} />)
                  : <BarRow label={L('Participation', 'Turnout')} value={c.voted} max={c.electors} right={fmtPct(c.voted / c.electors) + ' · ' + fmtNum(c.voted)} />}</div>
              </Card>
            );
          })}
        </div>
        <div class="stack">
          <Card title={L('À traiter', 'To do')}>
            {pending.map((d) => <div class="member-row" key={d.id}><Icon name="users" size={18} /><div class="grow small"><strong>{d.name}</strong><div class="xs muted">{L('Double validation en attente', 'Awaiting dual approval')}</div></div></div>)}
            {alerts.slice(0, 3).map((a) => <div class="member-row" key={a.id}><Icon name="bell" size={18} /><div class="grow small"><strong>{tx(a.title)}</strong><div class="xs muted">{fmtDT(a.at)}</div></div></div>)}
            <div class="member-row"><Icon name="calendar" size={18} /><div class="grow small"><strong>{L('Relance J+14', 'Day-14 reminder')}</strong><div class="xs muted">{fmtDT(dayAt(st.remote.ops.ep26.open, 14, 8, 0))}</div></div></div>
            {!pending.length && !alerts.length && <Empty icon="check" title={L('Rien à traiter', 'Nothing to do')} />}
          </Card>
          <Card title={L('Séparation des rôles', 'Role separation')}>
            <ul class="list-check small">
              <li><Icon name="check" size={18} />{L('Ni résultats partiels ni émargement', 'No partial results, no voter roll')}</li>
              <li><Icon name="check" size={18} />{L('Actions critiques à double signature', 'Critical actions need two signatures')}</li>
              <li><Icon name="check" size={18} />{L('Tout est journalisé', 'Everything is logged')}</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Scrutins
function Scrutins() {
  const st = useStore();
  const now = useNow(5000);
  return (
    <>
      <PageHead title={L('Scrutins', 'Elections')} refs={['3', '2.3']} actions={<Btn kind="primary" icon="plus" href="/distance/admin/scrutins/nouveau">{L('Créer un scrutin', 'New election')}</Btn>} />
      {Object.values(st.remote.ops).map((o) => (
        <Card key={o.id} title={opName(o)} sub={tx(o.mode)} class="mb-16" actions={<><StatusChip s={o.status} /><Chip tone="gray">{L('Niveau ', 'Level ') + o.level}</Chip></>}>
          <div class="table-wrap"><table class="table table-compact"><thead><tr><th>{L('Instance', 'Body')}</th><th>{L('Collège', 'College')}</th><th class="num">{L('Inscrits', 'Voters')}</th><th class="num">{L('Sièges', 'Seats')}</th><th>{L('Candidatures', 'Candidates')}</th><th class="num">{L('Participation', 'Turnout')}</th><th>{L('Clé publique', 'Public key')}</th></tr></thead><tbody>
            {o.urns.map((id) => { const u = st.remote.urns[id]; const n = urnCount(st, id, now); return <tr key={id}><td class="strong">{u.instance}</td><td>{tx(u.college)}</td><td class="num">{fmtNum(u.electors)}</td><td class="num">{u.seats}</td><td>{u.type === 'pluri' ? L(`${u.candidates.length} candidats`, `${u.candidates.length} candidates`) : L(`${u.lists.length} listes`, `${u.lists.length} lists`)}</td><td class="num">{fmtPct(n / u.electors)}</td><td><span class="fp">{shortFp(u.pkFp, 5)}</span></td></tr>; })}
          </tbody></table></div>
        </Card>
      ))}
      {st.remote.drafts.length > 0 && (
        <Card title={L('Brouillons', 'Drafts')}>
          {st.remote.drafts.map((d) => <div class="member-row" key={d.id}><div class="grow"><div class="strong small">{d.name}</div><div class="xs muted">{d.mode ? modeName(d.mode, d.rounds) : tx(d.modeLabel)} · {fmtDate(d.open)} → {fmtDate(d.close)}</div></div><Chip tone={d.status === 'validated' ? 'ok' : 'warn'}>{d.status === 'validated' ? L('Validé', 'Approved') : L('En attente', 'Pending')}</Chip></div>)}
        </Card>
      )}
    </>
  );
}

// ------------------------------------------------------------------ Assistant de création
const INSTANCES = () => [['CSE', L('Comité social d’établissement (CSE)', 'Social committee (CSE)')], ['F3SCT', L('Formation spécialisée SSCT (F3SCT)', 'Health and safety committee (F3SCT)')], ['CAPL', L('Commission administrative paritaire locale (CAPL)', 'Local joint committee (CAPL)')], ['CAPD', L('Commission administrative paritaire départementale (CAPD)', 'Departmental joint committee (CAPD)')], ['CCP', L('Commission consultative paritaire (CCP)', 'Joint advisory committee (CCP)')], ['CME', L('Commission médicale d’établissement (CME)', 'Medical committee (CME)')], ['CSIRMT', L('Commission des soins infirmiers, de rééducation et médico-techniques (CSIRMT)', 'Nursing, rehabilitation and medical technical committee (CSIRMT)')], ['CA', L('Conseil d’administration', 'Board of directors')], ['AUTRE', L('Autre élection ou consultation', 'Other election or poll')]];
// [clé, libellé FR (enregistré), libellé EN, précision FR, précision EN]
const MODES = [
  ['liste', 'Scrutin de liste à un tour', 'List vote, one round', 'Représentation proportionnelle', 'Proportional representation'],
  ['uni', 'Scrutin uninominal', 'Single-member vote', 'Un ou deux tours', 'One or two rounds'],
  ['pluri', 'Scrutin plurinominal', 'Multi-member vote', 'Plusieurs sièges, panachage possible', 'Several seats, mixing allowed'],
  ['classement', 'Scrutin de classement', 'Ranked vote', 'Vote préférentiel', 'Preferential'],
  ['referendum', 'Consultation référendaire', 'Referendum', 'Pour, contre, abstention', 'For, against, abstain'],
];
const roundsL = (k, n) => (k === 'uni' || k === 'pluri' ? L(` à ${n} tour${n > 1 ? 's' : ''}`, `, ${n} round${n > 1 ? 's' : ''}`) : '');
const modeName = (k, n) => { const m = MODES.find((x) => x[0] === k) || MODES[0]; return L(m[1], m[2]) + roundsL(k, n || 1); };
const LEVELS = () => ({
  1: { title: L('Niveau 1 · risque faible', 'Level 1 · low risk'), short: L('Mot de passe, canaux distincts', 'Password, separate channels'), auth: L('Identifiant et mot de passe par canaux distincts, ou lien personnel', 'Login and password through separate channels, or a personal link'), ex: L('Faibles enjeux (DQE scénario 1)', 'Low stakes (DQE scenario 1)'), obj: L('11 objectifs (1-01 à 1-11)', '11 objectives (1-01 to 1-11)') },
  2: { title: L('Niveau 2 · risque modéré', 'Level 2 · moderate risk'), short: L('Mot de passe + code unique', 'Password + one-time code'), auth: L('Mot de passe et code à usage unique (SMS ou application)', 'Password and one-time code (SMS or app)'), ex: L('Élections de représentants (DQE scénario 2)', 'Staff representative elections (DQE scenario 2)'), obj: L('20 objectifs, dont vérifiabilité (2-07)', '20 objectives, incl. verifiability (2-07)') },
  3: { title: L('Niveau 3 · risque significatif', 'Level 3 · significant risk'), short: L('Authentification forte, enrôlement', 'Strong authentication, enrolment'), auth: L('Authentification forte avec enrôlement (TOTP ou clé) et question personnelle', 'Strong authentication with enrolment (TOTP or key) and a personal question'), ex: L('Forts enjeux, contexte conflictuel (DQE scénario 3)', 'High stakes, contentious context (DQE scenario 3)'), obj: L('25 objectifs, dont analyse de risque et code client publié', '25 objectives, incl. risk analysis and published client code') },
});
const EXPR = () => [['pour', L('Pour', 'For')], ['contre', L('Contre', 'Against')], ['abstention', L('Abstention', 'Abstain')], ['nppv', L('Ne prend pas part au vote (NPPV)', 'Not taking part (NPPV)')], ['blanc', L('Vote blanc', 'Blank vote')]];

function Wizard() {
  const [step, setStep] = useState(0);
  const [d, setD] = useState(() => ({ name: L('Élections à la CSIRMT 2027', '2027 CSIRMT elections'), instance: 'CSIRMT', colleges: [L('Cadres de santé', 'Healthcare managers'), L('Personnels infirmiers, de rééducation et médico-techniques', 'Nursing, rehabilitation and medical technical staff'), L('Aides-soignants', 'Care assistants')], electors: 940, mode: 'liste', rounds: 1, seats: 9, desist: true, expr: { pour: false, contre: false, abstention: false, nppv: false, blanc: true }, blankCounted: true, panachage: false, order: 'tirage', openD: '', openT: '08:00', closeD: '', closeT: '17:00', drom: false, reminders: true, quorum: 0, majority: 'absolue', threshold1: 'aucun', tie: 'age', seatRule: 'pfm', level: 2, holders: 5, thr: 3, france27001: false, expert: true }));
  const [dual, setDual] = useState(null);
  const [newCol, setNewCol] = useState('');
  useEffect(() => {
    const now = Date.now();
    const o = new Date(dayAt(now, 30, 8, 0)), c = new Date(dayAt(now, 44, 17, 0));
    const iso = (x) => x.toISOString().slice(0, 10);
    setD((x) => ({ ...x, openD: iso(o), closeD: iso(c) }));
  }, []);
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const steps = [L('Instance', 'Body'), L('Mode', 'Method'), L('Expression', 'Options'), L('Période', 'Dates'), L('Règles', 'Rules'), L('Sécurité', 'Security'), L('Récapitulatif', 'Summary')];
  const LV = LEVELS();
  const MAJ = [['absolue', L('Majorité absolue', 'Absolute majority')], ['relative', L('Majorité relative', 'Relative majority')], ['qualifiee', L('Majorité qualifiée', 'Qualified majority')], ['na', L('Sans objet (proportionnelle)', 'N/A (proportional)')]];
  const SEATS = [['pfm', L('Plus forte moyenne', 'Highest average')], ['pfr', L('Plus fort reste', 'Largest remainder')]];
  const TIE = [['age', L('Le plus âgé est élu', 'Oldest is elected')], ['tirage', L('Tirage au sort', 'Draw by lot')], ['jeune', L('Le plus jeune est élu', 'Youngest is elected')]];
  const lbl = (list, k) => (list.find((x) => x[0] === k) || [k, k])[1];
  const create = () => {
    const id = 'draft-' + randHex(6);
    // Libellé du mode enregistré en français (trace), clés conservées pour l'affichage
    const m = MODES.find((x) => x[0] === d.mode);
    const modeLabel = m[1] + (d.mode === 'uni' || d.mode === 'pluri' ? ' à ' + d.rounds + ' tour' + (d.rounds > 1 ? 's' : '') : '');
    const draft = { id, name: d.name, instance: d.instance, modeLabel, mode: d.mode, rounds: d.rounds, level: d.level, open: new Date(d.openD + 'T' + d.openT).getTime(), close: new Date(d.closeD + 'T' + d.closeT).getTime(), colleges: d.colleges, electors: d.electors };
    dispatch('r/draft/add', { draft, by: ME });
    setDual({ kind: 'draft', target: id, label: 'Création du scrutin « ' + d.name + ' »' });
  };
  const exprSel = EXPR().filter(([k]) => d.expr[k]).map(([, l]) => l);
  return (
    <>
      <PageHead title={L('Créer un scrutin', 'New election')} refs={['3', '2.2', '2.3', '2.5']} />
      <Stepper steps={steps} current={step} />
      <div class="card">
        {step === 0 && (
          <div class="stack">
            <div class="grid g2">
              <Field label={L('Intitulé', 'Title')} id="w-name"><input class="input" id="w-name" value={d.name} onInput={(e) => set('name', e.currentTarget.value)} /></Field>
              <Field label={L('Instance', 'Body')} id="w-inst"><Select id="w-inst" value={d.instance} onChange={(v) => set('instance', v)} options={INSTANCES()} /></Field>
              <Field label={L('Électeurs (estimation)', 'Voters (estimate)')} id="w-el"><input class="input" id="w-el" type="number" min="1" value={d.electors} onInput={(e) => set('electors', +e.currentTarget.value)} /></Field>
              <Field label={L('Établissement', 'Hospital')} id="w-et"><input class="input" id="w-et" value={ESTAB.name} readOnly /></Field>
            </div>
            <div>
              <div class="label mb-8">{L('Collèges', 'Colleges')} <Tip>{L('Une urne et une clé de chiffrement par collège.', 'One ballot box and one encryption key per college.')}</Tip></div>
              <div class="row" style={{ gap: '6px' }}>{d.colleges.map((c) => <Chip key={c}>{c}<button class="linklike" aria-label={L('Retirer ', 'Remove ') + c} onClick={() => set('colleges', d.colleges.filter((x) => x !== c))} style={{ textDecoration: 'none' }}><Icon name="x" size={12} /></button></Chip>)}</div>
              <div class="input-group mt-8" style={{ maxWidth: '480px' }}><label class="sr-only" for="w-col">{L('Nouveau collège', 'New college')}</label><input id="w-col" class="input" placeholder={L('Ajouter un collège', 'Add a college')} value={newCol} onInput={(e) => setNewCol(e.currentTarget.value)} /><Btn size="sm" icon="plus" onClick={() => { if (newCol.trim()) { set('colleges', [...d.colleges, newCol.trim()]); setNewCol(''); } }}>{L('Ajouter', 'Add')}</Btn></div>
            </div>
          </div>
        )}
        {step === 1 && (
          <div class="stack">
            <fieldset><legend>{L('Mode de scrutin', 'Voting method')}</legend>
              <div class="choices">{MODES.map(([k, fr, en, sFr, sEn]) => <label key={k} class={'choice ' + (d.mode === k ? 'checked' : '')}><input type="radio" name="w-mode" checked={d.mode === k} onChange={() => set('mode', k)} /><span class="tick" aria-hidden="true" /><span class="c-body"><span class="c-title">{L(fr, en)}</span><span class="c-sub" style={{ display: 'block' }}>{L(sFr, sEn)}</span></span></label>)}</div>
            </fieldset>
            <div class="grid g3">
              <Field label={L('Tours', 'Rounds')} id="w-r"><Select id="w-r" value={String(d.rounds)} onChange={(v) => set('rounds', +v)} options={[['1', L('Un tour', 'One')], ['2', L('Deux tours', 'Two')], ['3', L('Plusieurs tours', 'Several')]]} /></Field>
              <Field label={L('Sièges', 'Seats')} id="w-s"><input class="input" id="w-s" type="number" min="1" value={d.seats} onInput={(e) => set('seats', +e.currentTarget.value)} /></Field>
              <div class="field"><span class="label">{L('Entre les tours', 'Between rounds')}</span><Switch checked={d.desist} onChange={(v) => set('desist', v)} label={L('Désistement autorisé', 'Withdrawal allowed')} /></div>
            </div>
          </div>
        )}
        {step === 2 && (
          <div class="stack">
            <fieldset><legend>{L('Options de vote', 'Voting options')} <Tip>{L('Pour / Contre / Abstention : consultations uniquement. Sinon, l’électeur choisit une liste ou des candidats.', 'For / Against / Abstain: referendums only. Otherwise voters pick a list or candidates.')}</Tip></legend>
              <div class="grid g3">{EXPR().map(([k, l]) => <Check key={k} checked={d.expr[k]} onChange={(v) => set('expr', { ...d.expr, [k]: v })}>{l}</Check>)}</div>
            </fieldset>
            <div class="grid g2">
              <Switch checked={d.blankCounted} onChange={(v) => set('blankCounted', v)} label={L('Vote blanc comptabilisé', 'Count blank votes')} />
              <Switch checked={d.panachage} onChange={(v) => set('panachage', v)} label={L('Panachage (plurinominal)', 'Mixing (multi-member)')} />
            </div>
            <Field label={L('Ordre des candidatures', 'Candidate order')} id="w-o"><Select id="w-o" value={d.order} onChange={(v) => set('order', v)} options={[['tirage', L('Tirage au sort public, identique pour tous', 'Public draw, same for everyone')], ['depot', L('Ordre de dépôt', 'Order of filing')], ['alpha', L('Ordre alphabétique', 'Alphabetical')]]} /></Field>
          </div>
        )}
        {step === 3 && (
          <div class="stack">
            <div class="grid g2">
              <Field label={L('Ouverture (date)', 'Opening date')} id="w-od"><input class="input" id="w-od" type="date" value={d.openD} onInput={(e) => set('openD', e.currentTarget.value)} /></Field>
              <Field label={L('Ouverture (heure de Paris)', 'Opening time (Paris)')} id="w-ot"><input class="input" id="w-ot" type="time" value={d.openT} onInput={(e) => set('openT', e.currentTarget.value)} /></Field>
              <Field label={L('Clôture (date)', 'Closing date')} id="w-cd"><input class="input" id="w-cd" type="date" value={d.closeD} onInput={(e) => set('closeD', e.currentTarget.value)} /></Field>
              <Field label={L('Clôture (heure de Paris)', 'Closing time (Paris)')} id="w-ct"><input class="input" id="w-ct" type="time" value={d.closeT} onInput={(e) => set('closeT', e.currentTarget.value)} /></Field>
            </div>
            <Switch checked={d.drom} onChange={(v) => set('drom', v)} label={L('Afficher aussi l’heure locale (DROM)', 'Also show local time (overseas)')} />
            <Switch checked={d.reminders} onChange={(v) => set('reminders', v)} label={L('Relances des non-votants (J+7, J+14, J+19)', 'Reminders to non-voters (days 7, 14, 19)')} />
          </div>
        )}
        {step === 4 && (
          <div class="grid g2">
            <Field label={L('Quorum (% des inscrits)', 'Quorum (% of voters)')} id="w-q" hint={L('0 = aucun', '0 = none')}><input class="input" id="w-q" type="number" min="0" max="100" value={d.quorum} onInput={(e) => set('quorum', +e.currentTarget.value)} aria-describedby="w-q-hint" /></Field>
            <Field label={L('Majorité', 'Majority')} id="w-m"><Select id="w-m" value={d.majority} onChange={(v) => set('majority', v)} options={MAJ} /></Field>
            <Field label={L('Répartition des sièges', 'Seat allocation')} id="w-sr"><Select id="w-sr" value={d.seatRule} onChange={(v) => set('seatRule', v)} options={SEATS} /></Field>
            <Field label={L('En cas d’égalité', 'Tie-break')} id="w-t"><Select id="w-t" value={d.tie} onChange={(v) => set('tie', v)} options={TIE} /></Field>
            <Field label={L('Seuil au 1er tour', 'First-round threshold')} id="w-th1" hint={L('CME : un tiers des inscrits', 'CME: one third of voters')}><Select id="w-th1" value={d.threshold1 || 'aucun'} onChange={(v) => set('threshold1', v)} options={[['aucun', L('Aucun', 'None')], ['quart', L('Un quart des inscrits', 'A quarter of voters')], ['tiers', L('Un tiers des inscrits', 'A third of voters')]]} aria-describedby="w-th1-hint" /></Field>
          </div>
        )}
        {step === 5 && (
          <div class="stack">
            <fieldset><legend>{L('Niveau de sécurité', 'Security level')} <Tip>{L('Délibération CNIL n° 2026-045.', 'CNIL deliberation 2026-045.')}</Tip></legend>
              <div class="grid g3">{[1, 2, 3].map((n) => <label key={n} class={'choice ' + (d.level === n ? 'checked' : '')} style={{ alignItems: 'flex-start' }}><input type="radio" name="w-l" checked={d.level === n} onChange={() => set('level', n)} /><span class="tick" aria-hidden="true" /><span class="c-body"><span class="c-title">{LV[n].title}</span><span class="c-sub" style={{ display: 'block' }}>{LV[n].short}</span></span></label>)}</div>
            </fieldset>
            <div class="grid g3">
              <Field label={L('Détenteurs de clé', 'Key holders')} id="w-h"><input class="input" id="w-h" type="number" min="2" max="9" value={d.holders} onInput={(e) => set('holders', +e.currentTarget.value)} /></Field>
              <Field label={L('Seuil de dépouillement', 'Count threshold')} id="w-th" hint={L('2 minimum', 'At least 2')}><input class="input" id="w-th" type="number" min="2" max={d.holders} value={d.thr} onInput={(e) => set('thr', Math.max(2, Math.min(d.holders, +e.currentTarget.value)))} aria-describedby="w-th-hint" /></Field>
              <div class="field"><span class="label">{L('Options', 'Options')}</span><Switch checked={d.france27001} onChange={(v) => set('france27001', v)} label={L('Hébergement France (ISO 27001)', 'Hosted in France (ISO 27001)')} /><Switch checked={d.expert} onChange={(v) => set('expert', v)} label={L('Expertise indépendante', 'Independent review')} /></div>
            </div>
            {d.level === 3 && <Note icon="info">{L('Niveau 3 : enrôlement préalable, expertise à chaque scrutin, code client publié.', 'Level 3: prior enrolment, expert review for each election, client code published.')}</Note>}
          </div>
        )}
        {step === 6 && (
          <KV items={[
            [L('Intitulé', 'Title'), d.name],
            [L('Instance', 'Body'), lbl(INSTANCES(), d.instance)],
            [L('Collèges', 'Colleges'), d.colleges.join(', ') + ' (' + L(`${d.colleges.length} urnes`, `${d.colleges.length} boxes`) + ')'],
            [L('Électeurs', 'Voters'), fmtNum(d.electors)],
            [L('Mode', 'Method'), modeName(d.mode, d.rounds) + ' · ' + L(`${d.seats} sièges`, `${d.seats} seats`)],
            [L('Options', 'Options'), exprSel.join(', ') || L('Listes ou candidats', 'Lists or candidates')],
            [L('Période', 'Dates'), d.openD + ' ' + d.openT + ' → ' + d.closeD + ' ' + d.closeT + L(' (Paris)', ' (Paris)')],
            [L('Règles', 'Rules'), (d.quorum ? L(`Quorum ${d.quorum} %`, `Quorum ${d.quorum} %`) : L('Sans quorum', 'No quorum')) + ' · ' + lbl(SEATS, d.seatRule)],
            [L('Égalité', 'Tie-break'), lbl(TIE, d.tie)],
            [L('Sécurité', 'Security'), L(`Niveau ${d.level} · ${d.thr} parts sur ${d.holders}`, `Level ${d.level} · ${d.thr} of ${d.holders} shares`) + (d.france27001 ? ' · ISO 27001' : '')],
          ]} />
        )}
        <div class="row-between mt-24">
          <Btn icon="arrowLeft" disabled={step === 0} onClick={() => setStep(step - 1)}>{L('Précédent', 'Back')}</Btn>
          {step < 6 ? <Btn kind="primary" iconRight="arrowRight" onClick={() => setStep(step + 1)}>{L('Suivant', 'Next')}</Btn> : <Btn kind="primary" icon="check" onClick={create}>{L('Créer le scrutin', 'Create election')}</Btn>}
        </div>
      </div>
      {dual && <DualModal action={dual} me={ME} signers={[BUREAU[0], { id: 'ac', name: 'Aline Caron', role: staffLabel(STAFF.find((s) => s.id === 'ac')) }, BUREAU[1]]} onClose={() => setDual(null)} onDone={() => go('/distance/admin/scrutins')} />}
    </>
  );
}

// ------------------------------------------------------------------ Listes électorales
function Electeurs() {
  const st = useStore();
  const [imp, setImp] = useState(null);
  const [page, setPage] = useState(0);
  const [qq, setQ] = useState('');
  const rows = useMemo(() => {
    const out = [];
    const r = rng('electors-list');
    for (let i = 0; i < 400; i++) {
      const f = r() < 0.6;
      const cat = r() < 0.31 ? 'A' : r() < 0.55 ? 'B' : 'C';
      out.push({ mat: String(10000 + Math.floor(r() * 89999)).padStart(6, '0'), nom: pick(r, LAST).toUpperCase(), prenom: pick(r, f ? FIRST_F : FIRST_M), cat, site: pick(r, SITES).name, ok: true });
    }
    out.unshift({ mat: '048217', nom: 'MARTIN', prenom: 'Camille', cat: 'A', site: 'Hôpital Bellevue', ok: true });
    return out;
  }, []);
  const filtered = rows.filter((x) => !qq || (x.nom + ' ' + x.prenom + ' ' + x.mat).toLowerCase().includes(qq.toLowerCase()));
  const runImport = () => {
    setImp({ phase: 'run', k: 0 });
    let k = 0;
    const tick = () => { k++; setImp({ phase: k < 5 ? 'run' : 'done', k }); if (k < 5) setTimeout(tick, 450); };
    setTimeout(tick, 450);
  };
  const checks = [L('Format et encodage (CSV UTF-8)', 'Format and encoding (CSV UTF-8)'), L('Champs obligatoires', 'Required fields'), L('Doublons', 'Duplicates'), L('Rattachement aux collèges et urnes', 'College and ballot box mapping'), L('Canaux d’envoi distincts', 'Separate delivery channels')];
  return (
    <>
      <PageHead title={L('Listes électorales', 'Electoral rolls')} refs={['3', '5.2']} actions={<Btn kind="primary" icon="upload" onClick={runImport}>{L('Importer', 'Import')}</Btn>} />
      {imp && (
        <Card title="liste_electorale_v4.csv" class="mb-16">
          <ul class="proc" aria-live="polite">{checks.map((c, i) => <li key={i} class={imp.k > i ? 'done' : imp.k === i ? 'run' : ''}><span class="pi">{imp.k > i ? <Icon name="check" size={14} stroke={3} /> : imp.k === i ? <span class="spin" /> : i + 1}</span>{c}</li>)}</ul>
          {imp.phase === 'done' && (
            <div class="mt-16 stack">
              <Note tone="warn" icon="alert">{L(`${fmtNum(8500)} lignes · 2 anomalies non bloquantes`, `${fmtNum(8500)} rows · 2 non-blocking issues`)} <Tip>{L('Téléphone manquant : mot de passe envoyé par courriel.', 'Missing phone number: password sent by email.')}</Tip></Note>
              <Note icon="lock">{L('La liste 2026 est déjà scellée : cette version sera un brouillon.', 'The 2026 roll is already sealed: this version becomes a draft.')}</Note>
              <div class="row"><Btn icon="check" onClick={() => { dispatch('r/import/add', { imp: { v: st.remote.imports.length + 1, at: Date.now(), rows: 8500, dup: 0, err: 2, status: 'Brouillon (scrutin futur)', hash: sha256('ev4') }, by: ME }); setImp(null); toast(L('Import enregistré', 'Import saved'), 'ok'); }}>{L('Enregistrer le brouillon', 'Save as draft')}</Btn><Btn kind="ghost" onClick={() => setImp(null)}>{L('Abandonner', 'Discard')}</Btn></div>
            </div>
          )}
        </Card>
      )}
      <div class="grid g-side">
        <Card title={L('Électeurs inscrits', 'Registered voters')} actions={<span class="xs muted">v3 · {fmtNum(8500)}</span>}>
          <div class="row mb-12"><label class="sr-only" for="el-q">{L('Rechercher', 'Search')}</label><input id="el-q" class="input" style={{ maxWidth: '320px' }} placeholder={L('Nom ou matricule', 'Name or staff ID')} value={qq} onInput={(e) => { setQ(e.currentTarget.value); setPage(0); }} /></div>
          <div class="table-wrap"><table class="table table-compact"><thead><tr><th>{L('Matricule', 'Staff ID')}</th><th>{L('Nom', 'Surname')}</th><th>{L('Prénom', 'First name')}</th><th>{L('Collège', 'College')}</th><th>Site</th><th>{L('Canaux', 'Channels')}</th></tr></thead><tbody>
            {filtered.slice(page * 20, page * 20 + 20).map((x) => <tr key={x.mat + x.nom}><td class="mono">{x.mat}</td><td class="strong">{x.nom}</td><td>{x.prenom}</td><td>{L('Catégorie ', 'Category ') + x.cat}</td><td>{x.site}</td><td class="small">{L('Courrier + SMS', 'Post + SMS')}</td></tr>)}
          </tbody></table></div>
          <Pager page={page} total={filtered.length} size={20} onPage={setPage} />
        </Card>
        <div class="stack">
          <Card title={L('Versions', 'Versions')}>
            {st.remote.imports.map((x) => <div class="member-row" key={x.v}><span class="tag-num">v{x.v}</span><div class="grow"><div class="small strong">{L(`${fmtNum(x.rows)} lignes · ${x.err} anomalie(s)`, `${fmtNum(x.rows)} rows · ${x.err} issue(s)`)}</div><div class="xs muted">{fmtDate(x.at)} · {tx(x.status)}</div></div><span class="fp">{shortFp(x.hash, 4)}</span></div>)}
          </Card>
          <Card title={L('Consultation', 'Public display')}>
            <KV items={[[L('Publiée le', 'Published'), fmtDT(dayAt(st.remote.ops.ep26.open, -16, 9, 0))], [L('Réclamations', 'Claims until'), fmtDate(dayAt(st.remote.ops.ep26.open, -10, 0, 0))], [L('Accès', 'Access'), L('Portail électeur', 'Voter portal')]]} />
            <div class="mt-12"><Btn size="sm" href="/distance/electeur/liste" icon="external">{L('Vue électeur', 'Voter view')}</Btn></div>
          </Card>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Candidatures
function Candidatures() {
  const st = useStore();
  const [urnId, setUrnId] = useState('cse-a');
  const urn = st.remote.urns[urnId];
  const order = urn.type === 'list' ? drawOrder(urn) : [];
  const drawAt = fmtDT(dayAt(st.remote.ops.ep26.open, -17, 10, 30));
  return (
    <>
      <PageHead title={L('Candidatures', 'Candidates')} refs={['3', '3.2', '2.11']} actions={<Btn href={'/distance/electeur/scrutin/' + urnId + '?consult=1'} icon="eye">{L('Aperçu électeur', 'Voter preview')}</Btn>} />
      <div class="row mb-16"><label class="sr-only" for="ca-u">{L('Urne', 'Ballot box')}</label><select id="ca-u" class="select" style={{ width: 'auto' }} value={urnId} onChange={(e) => setUrnId(e.currentTarget.value)}>{['cse-a', 'cse-b', 'cse-c', 'f3-a', 'f3-b', 'f3-c', 'cme-c3'].map((id) => <option key={id} value={id}>{st.remote.urns[id].instance} · {tx(st.remote.urns[id].college)}</option>)}</select></div>
      {urn.type === 'list' ? (
        <div class="stack">
          {order.map((uid, i) => { const u = UNIONS[uid]; const n = listCandidates(urn, uid).length; return (
            <Card key={uid} tight>
              <div class="row-between">
                <div class="row" style={{ flexWrap: 'nowrap' }}><span class="tag-num" title={L('Rang d’affichage', 'Display rank')}>{i + 1}</span><UnionLogo u={u} size={40} /><div><div class="strong">{u.name}</div><div class="xs muted">{L(`${n} candidats · déposée le ${fmtDate(dayAt(st.remote.ops.ep26.open, -18 + i, 0, 0))}`, `${n} candidates · filed ${fmtDate(dayAt(st.remote.ops.ep26.open, -18 + i, 0, 0))}`)}</div></div></div>
                <Chip tone="ok">{L('Recevable', 'Valid')}</Chip>
              </div>
            </Card>
          ); })}
          <p class="small muted mb-0">{L(`Ordre tiré au sort le ${drawAt}, identique pour tous.`, `Order drawn by lot on ${drawAt}, same for every voter.`)} <Tip>{L('Tirage public en présence des délégués de liste. Aucune liste n’est mise en avant (CCTP 2.11).', 'Public draw with list delegates present. No list is highlighted (CCTP 2.11).')}</Tip></p>
        </div>
      ) : (
        <Card title={L(`${urn.candidates.length} candidats · ${urn.seats} sièges`, `${urn.candidates.length} candidates · ${urn.seats} seats`)}><div class="table-wrap"><table class="table table-compact"><thead><tr><th>{L('Candidat·e', 'Candidate')}</th><th>{L('Spécialité', 'Specialty')}</th><th>Site</th><th>{L('Statut', 'Status')}</th></tr></thead><tbody>{urn.candidates.map((c) => <tr key={c.id}><td class="strong">{c.name}</td><td>{c.spec}</td><td>{c.site}</td><td><Chip tone="ok">{L('Recevable', 'Valid')}</Chip></td></tr>)}</tbody></table></div></Card>
      )}
    </>
  );
}

// ------------------------------------------------------------------ Matériel de vote
function Materiel() {
  const st = useStore();
  const ep = st.remote.ops.ep26;
  const camp = [
    [L('Identifiants (courrier)', 'Identifiers (post)'), 8500, 8431, 69, dayAt(ep.open, -11, 9, 0)],
    [L('Mots de passe (SMS)', 'Passwords (SMS)'), 7920, 7884, 36, dayAt(ep.open, -9, 9, 0)],
    [L('Mots de passe (courriel)', 'Passwords (email)'), 580, 571, 9, dayAt(ep.open, -9, 9, 30)],
    [L('Professions de foi imprimées', 'Printed manifestos'), 153000, 153000, 0, dayAt(ep.open, -12, 9, 0)],
    [L('Relance J+7', 'Day-7 reminder'), 6120, 6087, 33, dayAt(ep.open, 7, 8, 0)],
  ];
  const exportCsv = () => downloadCSV('suivi-des-envois.csv', [L('Envoi', 'Mailing'), L('Volume', 'Volume'), L('Délivrés', 'Delivered'), L('Échecs / NPAI', 'Failed / returned'), L('Date', 'Date')], camp.map((c) => [c[0], c[1], c[2], c[3], fmtDT(c[4])]));
  return (
    <>
      <PageHead title={L('Matériel de vote', 'Voting material')} refs={['7.2.2', '3.1']} actions={<Btn icon="download" onClick={exportCsv}>{L('Exporter (CSV)', 'Export (CSV)')}</Btn>} />
      <Card title={L('Envois', 'Mailings')} class="mb-16">
        <div class="table-wrap"><table class="table table-compact"><thead><tr><th>{L('Envoi', 'Mailing')}</th><th>{L('Date', 'Date')}</th><th class="num">{L('Délivrés', 'Delivered')}</th><th style={{ width: '20%' }}><span class="sr-only">%</span></th><th class="num">{L('Échecs', 'Failed')}</th></tr></thead><tbody>
          {camp.map(([l, vol, ok, ko, at]) => <tr key={l}><td class="strong">{l}</td><td class="nowrap">{fmtDT(at)}</td><td class="num">{fmtNum(ok)} / {fmtNum(vol)}</td><td><Progress value={ok / vol} thin tone={ko ? undefined : 'teal'} label={fmtPct(ok / vol)} /></td><td class="num">{ko ? <span class="warn-text">{fmtNum(ko)}</span> : '0'}</td></tr>)}
        </tbody></table></div>
        <p class="xs muted mt-12 mb-0">{L('Identifiant et mot de passe par canaux distincts.', 'Identifier and password go through separate channels.')}</p>
      </Card>
      <Card title={L('Réémissions d’identifiants', 'Credential reissues')}>
        <div class="table-wrap"><table class="table table-compact"><thead><tr><th>{L('Date', 'Date')}</th><th>{L('Demandeur', 'Requester')}</th><th>{L('Motif', 'Reason')}</th><th>{L('Canaux', 'Channels')}</th><th>{L('Statut', 'Status')}</th></tr></thead><tbody>{st.remote.reissues.map((r) => <tr key={r.id}><td class="nowrap">{fmtDT(r.at)}</td><td>{tx(r.who)}</td><td>{tx(r.reason)}</td><td class="small">{tx(r.channel)}</td><td><Chip tone="ok">{tx(r.status)}</Chip></td></tr>)}</tbody></table></div>
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ Échanges sécurisés
const sizeL = (s) => L(s, String(s).replace(',', '.').replace(' Mo', ' MB').replace(' Ko', ' KB'));
function Echanges() {
  const st = useStore();
  const [up, setUp] = useState(false);
  return (
    <>
      <PageHead title={L('Échanges sécurisés', 'Secure file exchange')} refs={['3.3']} actions={<Btn kind="primary" icon="upload" onClick={() => setUp(true)}>{L('Déposer', 'Upload')}</Btn>} />
      <div class="table-wrap"><table class="table"><thead><tr><th>{L('Sens', 'Direction')}</th><th>{L('Fichier', 'File')}</th><th>{L('Taille', 'Size')}</th><th>{L('Par', 'By')}</th><th>{L('Date', 'Date')}</th><th>{L('Empreinte', 'Fingerprint')}</th><th>{L('Statut', 'Status')}</th></tr></thead><tbody>
        {st.remote.exchanges.map((x) => <tr key={x.id}><td><Chip tone={x.dir === 'in' ? 'sky' : 'ok'}>{x.dir === 'in' ? L('Reçu', 'In') : L('Émis', 'Out')}</Chip></td><td class="strong mono" style={{ fontSize: '.82rem' }}>{x.name}</td><td class="nowrap">{sizeL(x.size)}</td><td class="nowrap">{tx(x.by)}</td><td class="nowrap">{fmtDT(x.at)}</td><td><span class="fp">{shortFp(x.hash, 6)}</span></td><td>{tx(x.status)}</td></tr>)}
      </tbody></table></div>
      <p class="xs muted mt-12">{L('Chiffrement de bout en bout, antivirus, accusé de dépôt horodaté.', 'End-to-end encryption, virus scan, timestamped receipt.')}</p>
      {up && (
        <Modal title={L('Déposer un fichier', 'Upload a file')} icon="upload" onClose={() => setUp(false)} footer={<><Btn onClick={() => setUp(false)}>{L('Annuler', 'Cancel')}</Btn><Btn kind="primary" icon="upload" onClick={() => { const name = 'rectificatif_liste_' + fmtDate(Date.now(), 'fr').replace(/\//g, '-') + '.csv'; dispatch('r/exchange/add', { x: { id: 'x' + Date.now(), dir: 'in', name, size: '38 Ko', by: 'DRH (Paul Renaud)', hash: sha256(name), status: 'Contrôlé' }, by: ME }); setUp(false); toast(L('Fichier déposé et contrôlé', 'File uploaded and checked'), 'ok'); }}>{L('Déposer', 'Upload')}</Btn></>}>
          <div class="card card-sky card-flat center"><Icon name="upload" size={28} /><div class="small mt-8">rectificatif_liste.csv · {sizeL('38 Ko')}</div></div>
          <p class="xs muted mt-12 mb-0">{L('Démo : un fichier d’exemple est utilisé.', 'Demo: a sample file is used.')}</p>
        </Modal>
      )}
    </>
  );
}

// ------------------------------------------------------------------ Rôles
const PERMS = () => [
  [L('Paramétrer scrutins et listes', 'Set up elections and lists'), ['administrateur']],
  [L('Importer les données', 'Import data'), ['administrateur', 'operateur']],
  [L('Gérer les comptes', 'Manage accounts'), ['administrateur']],
  [L('Suivre la participation', 'Monitor turnout'), ['president', 'secretaire', 'assesseur', 'observateur']],
  [L('Consulter l’émargement', 'View voter roll'), ['president', 'secretaire', 'assesseur']],
  [L('Détenir une part de clé', 'Hold a key share'), ['president', 'assesseur']],
  [L('Suspendre ou reprendre', 'Suspend or resume'), ['president', 'secretaire', 'assesseur']],
  [L('Organiser le dépouillement', 'Schedule the count'), ['administrateur']],
  [L('Clôturer et dépouiller', 'Close and count'), ['president', 'assesseur']],
  [L('Journaux et preuves', 'Logs and proofs'), ['president', 'secretaire', 'assesseur', 'observateur', 'expert']],
  [L('Superviser (sans résultats)', 'Monitor (no results)'), ['administrateur', 'operateur']],
  [L('Exploiter la plateforme', 'Run the platform'), ['operateur']],
  [L('Personnaliser, annoncer les maintenances', 'Branding, maintenance notices'), ['administrateur']],
  [L('Auditer (lecture seule)', 'Audit (read only)'), ['expert']],
];
const mfaL = (m) => ({ 'Clé FIDO2': L('Clé FIDO2', 'FIDO2 key'), Certificat: L('Certificat', 'Certificate') }[m] || m);
function Roles() {
  const roles = ['administrateur', 'operateur', 'president', 'secretaire', 'assesseur', 'observateur', 'expert'];
  return (
    <>
      <PageHead title={L('Rôles et habilitations', 'Roles and permissions')} sub={L('Second facteur obligatoire pour tous.', 'Second factor required for everyone.')} refs={['2.6', '3']} actions={<Btn icon="plus" onClick={() => toast(L('Invitation envoyée (démo)', 'Invitation sent (demo)'), 'ok')}>{L('Ajouter un membre', 'Add member')}</Btn>} />
      <Card title={L('Comptes', 'Accounts')} class="mb-16">
        <div class="table-wrap"><table class="table table-compact"><thead><tr><th>{L('Nom', 'Name')}</th><th>{L('Rôle', 'Role')}</th><th>{L('Fonction', 'Position')}</th><th>{L('Périmètre', 'Scope')}</th><th>{L('Second facteur', '2FA')}</th></tr></thead><tbody>{STAFF.map((s) => <tr key={s.id + s.role}><td class="strong">{s.name}</td><td><Chip>{roleLabel(s.role)}</Chip></td><td class="small">{staffLabel(s)}</td><td class="small">{staffScope(s)}</td><td class="small">{mfaL(s.mfa)}</td></tr>)}</tbody></table></div>
      </Card>
      <Card title={L('Habilitations', 'Permissions')}>
        <div class="table-wrap"><table class="table table-compact"><thead><tr><th>{L('Droit', 'Permission')}</th>{roles.map((r) => <th key={r} class="center">{roleLabel(r)}</th>)}</tr></thead><tbody>
          {PERMS().map(([p, rs]) => <tr key={p}><td>{p}</td>{roles.map((r) => <td key={r} class="center">{rs.includes(r) ? <Icon name="check" size={18} label={L('Autorisé', 'Allowed')} style={{ color: 'var(--green)' }} /> : <span class="muted-3" aria-label={L('Non autorisé', 'Not allowed')}>·</span>}</td>)}</tr>)}
        </tbody></table></div>
        <div class="mt-12"><More label={L('Actions à double signature', 'Dual-signature actions')}>{L('Validation des listes électorales, création ou modification d’un scrutin, suspension, reprise, clôture, proclamation, réémission massive d’identifiants.', 'Approving electoral rolls, creating or changing an election, suspending, resuming, closing, announcing results, bulk credential reissue.')}</More></div>
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ Sécurité
const OBJ = () => ({
  1: [['1-01', L('Solution sans faille majeure connue', 'No known major flaw')], ['1-02', L('Vote indivisible : bulletin, émargement, récépissé', 'Atomic vote: ballot, roll signature, receipt')], ['1-03', L('Authentification limitant l’usurpation', 'Authentication limiting impersonation')], ['1-04', L('Confidentialité dès la création du bulletin', 'Secrecy from ballot creation')], ['1-05', L('Confidentialité et intégrité en transit', 'Secrecy and integrity in transit')], ['1-06', L('Confidentialité et intégrité dans l’urne', 'Secrecy and integrity in the ballot box')], ['1-07', L('Étanchéité identité / vote', 'Identity kept apart from the vote')], ['1-08', L('Secret de dépouillement réparti au bureau', 'Decryption secret split across the polling station')], ['1-09', L('Dépouillement global après clôture uniquement', 'Count only after closing')], ['1-10', L('Urne et émargement vides à l’ouverture', 'Empty box and roll at opening')], ['1-11', L('Dépouillement vérifiable a posteriori', 'Count verifiable afterwards')]],
  2: [['2-01', L('Haute disponibilité', 'High availability')], ['2-02', L('Contrôles automatiques (bulletins = émargements)', 'Automatic checks (ballots = roll signatures)')], ['2-03', L('Contrôles déclenchables par le bureau', 'Checks run by the polling station')], ['2-04', L('Alertes immédiates et journal des alertes', 'Instant alerts and alert log')], ['2-05', L('Cloisonnement des scrutins', 'Elections isolated from each other')], ['2-06', L('Sécurité physique et logique du SI', 'Physical and IT security')], ['2-07', L('Vérifiabilité individuelle', 'Individual verifiability')], ['2-08', L('Authentification forte', 'Strong authentication')], ['2-09', L('Protocole publié avant le scrutin', 'Protocol published before the vote')]],
  3: [['3-01', L('Analyse de risque formalisée', 'Formal risk analysis')], ['3-02', L('Dépouillement vérifiable par un outil tiers', 'Count verifiable with a third-party tool')], ['3-03', L('Très haute disponibilité (perte d’un centre)', 'Very high availability (data centre loss)')], ['3-04', L('Secret de dépouillement jamais sur un serveur', 'Decryption secret never on a server')], ['3-05', L('Code source du client de vote publié', 'Voting client source code published')]],
});
function Securite() {
  const st = useStore();
  const sec = st.remote.security;
  const [lvl, setLvl] = useState('3');
  const [thr, setThr] = useState(sec.threshold);
  const [lock, setLock] = useState(sec.lockMin);
  const save = () => {
    dispatch('r/security/set', { key: 'threshold', value: Math.max(2, Math.min(10, +thr)), by: ME, label: 'Seuil de verrouillage', display: thr + ' essais' });
    dispatch('r/security/set', { key: 'lockMin', value: Math.max(5, +lock), by: ME, label: 'Durée de verrouillage', display: lock + ' min' });
    toast(L('Politique enregistrée', 'Policy saved'), 'ok');
  };
  const O = OBJ();
  const LV = LEVELS();
  const objs = [...O[1], ...(lvl !== '1' ? O[2] : []), ...(lvl === '3' ? O[3] : [])];
  return (
    <>
      <PageHead title={L('Authentification et alertes', 'Authentication and alerts')} refs={['2.5', '2.7', '3.1']} />
      <div class="grid g-side">
        <div class="stack">
          <Card title={<>{L('Niveaux de sécurité', 'Security levels')} <Tip>{L('Délibération CNIL n° 2026-045. Le niveau choisi fixe les mesures appliquées.', 'CNIL deliberation 2026-045. The chosen level sets the measures applied.')}</Tip></>}>
            <Tabs label={L('Niveau', 'Level')} value={lvl} onChange={setLvl} tabs={[{ id: '1', label: L('Niveau 1', 'Level 1') }, { id: '2', label: L('Niveau 2', 'Level 2') }, { id: '3', label: L('Niveau 3', 'Level 3') }]} />
            <TabPanel id={lvl}>
              <KV items={[[L('Authentification', 'Authentication'), LV[lvl].auth], [L('Exemple', 'Example'), LV[lvl].ex], [L('Objectifs', 'Objectives'), LV[lvl].obj]]} />
              <div class="table-wrap mt-16"><table class="table table-compact"><thead><tr><th>{L('Objectif', 'Objective')}</th><th>{L('Intitulé', 'Description')}</th><th class="center">{L('Couvert', 'Covered')}</th></tr></thead><tbody>{objs.map(([k, l]) => <tr key={k}><td class="strong nowrap">{k}</td><td>{l}</td><td class="center"><Icon name="check" size={16} label={L('Couvert', 'Covered')} style={{ color: 'var(--green)' }} /></td></tr>)}</tbody></table></div>
            </TabPanel>
          </Card>
        </div>
        <div class="stack">
          <Card title={L('Verrouillage', 'Lockout')}>
            <SetRow label={L('Essais avant verrouillage', 'Attempts before lockout')} id="s-thr"><input class="input" id="s-thr" type="number" min="2" max="10" style={{ width: '84px' }} value={thr} onInput={(e) => setThr(e.currentTarget.value)} /></SetRow>
            <SetRow label={L('Durée (min)', 'Duration (min)')} id="s-lock"><input class="input" id="s-lock" type="number" min="5" style={{ width: '84px' }} value={lock} onInput={(e) => setLock(e.currentTarget.value)} /></SetRow>
            <div class="row-between mt-12"><span class="xs muted">{L(`Actuel : ${sec.threshold} essais, ${sec.lockMin} min`, `Current: ${sec.threshold} attempts, ${sec.lockMin} min`)}</span><Btn kind="primary" size="sm" icon="check" onClick={save}>{L('Enregistrer', 'Save')}</Btn></div>
          </Card>
          <Card title={L('Détection', 'Detection')}>
            <div class="stack stack-s">
              <Switch checked={sec.geo} onChange={(v) => dispatch('r/security/set', { key: 'geo', value: v, by: ME, label: 'Contrôle de géolocalisation', display: v ? 'activé' : 'désactivé' })} label={L('Bloquer hors Union européenne', 'Block outside the EU')} />
              <Switch checked={sec.usurp} onChange={(v) => dispatch('r/security/set', { key: 'usurp', value: v, by: ME, label: 'Détection d’usurpation', display: v ? 'activée' : 'désactivée' })} label={L('Terminal partagé (usurpation)', 'Shared device (impersonation)')} />
              <Switch checked={sec.alertSms} onChange={(v) => dispatch('r/security/set', { key: 'alertSms', value: v, by: ME, label: 'Alertes SMS au bureau', display: v ? 'activées' : 'désactivées' })} label={L('Alerte SMS au bureau', 'SMS alert to polling station')} />
              <Switch checked={sec.alertMail} onChange={(v) => dispatch('r/security/set', { key: 'alertMail', value: v, by: ME, label: 'Alertes courriel au bureau', display: v ? 'activées' : 'désactivées' })} label={L('Alerte courriel au bureau', 'Email alert to polling station')} />
            </div>
          </Card>
          <Card title={L('Canaux', 'Channels')}>
            <KV items={[[L('Identifiant', 'Identifier'), L('Courrier postal', 'Post')], [L('Mot de passe', 'Password'), L('SMS ou courriel', 'SMS or email')], [L('Question', 'Question'), L('Connue du seul électeur', 'Known only to the voter')], [L('Niveau 3', 'Level 3'), L('Application TOTP ou clé', 'TOTP app or key')]]} />
          </Card>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Supervision
function Supervision() {
  const st = useStore();
  const now = useNow(1000);
  const f = st.remote.failover;
  const [sim, setSim] = useState(-1);
  const steps = [L('Incident simulé sur le principal', 'Simulated incident on primary'), L('Détection (sondes toutes les 5 s)', 'Detected (probes every 5 s)'), L('Bascule vers le secours', 'Traffic switched to backup'), L('Urnes et journal vérifiés', 'Ballot boxes and log checked'), L('Bureaux de vote informés', 'Polling stations informed')];
  const running = sim >= 0 && sim < steps.length;
  const run = () => {
    setSim(0);
    let i = 0;
    const tick = () => { i++; setSim(i); if (i < steps.length) setTimeout(tick, 900); else { const dur = 34 + Math.floor(Math.random() * 12); dispatch('r/failover', { dur, by: ME, label: 'Test de bascule à la demande (démonstration)' }); toast(L(`Bascule réussie en ${dur} s`, `Failover done in ${dur} s`), 'ok'); } };
    setTimeout(tick, 900);
  };
  const c = opCounts(st, 'ep26', now);
  const perHour = ['ep26', 'cme26'].reduce((a, id) => a + Math.max(0, opCounts(st, id, now).ballots - opCounts(st, id, now - 3600000).ballots), 0);
  return (
    <>
      <PageHead title={L('Supervision', 'Monitoring')} refs={['6.1.1', '2.12', '2.4', '3']} actions={<Btn kind="primary" icon="refresh" onClick={run} disabled={running}>{L('Tester la bascule', 'Test failover')}</Btn>} />
      <div class="grid g4 mb-16">
        <Kpi label={L('Disponibilité (30 j)', 'Uptime (30 days)')} value={fmtPct(0.9998, 2)} tone="ok" sub={L('Objectif 99,9 %', 'Target 99.9 %')} />
        <Kpi label={L('Interruption max. (DIMA)', 'Max. outage (DIMA)')} value="30 min" />
        <Kpi label={L('Perte de données', 'Data loss')} value={L('Aucune', 'None')} tone="ok" />
        <Kpi label={L('Bulletins (1 h)', 'Ballots (1 h)')} value={fmtNum(perHour)} sub={L(`Capacité : ${fmtNum(2000)} / h`, `Capacity: ${fmtNum(2000)} / h`)} />
      </div>
      <div class="grid g-side">
        <div class="stack">
          <Card title={<>{L('Continuité', 'Continuity')} <Tip>{L('Secours aux garanties identiques, bascule automatique et sans délai (décret n° 2024-1038).', 'Backup with identical guarantees, automatic and immediate failover (decree 2024-1038).')}</Tip></>}>
            <div class="grid g2">
              {[[L('Principal', 'Primary'), 'principal', 'A'], [L('Secours', 'Backup'), 'secours', 'B']].map(([l, k, site]) => {
                const active = running ? (k === 'secours' && sim >= 2) : f.active === k;
                return (
                  <div key={k} class="card card-tight card-flat" style={active ? { boxShadow: '0 0 0 1.5px var(--accent)' } : undefined}>
                    <div class="row-between"><strong>{l}</strong>{running && k === 'principal' && sim >= 1 ? <Chip tone="err">{L('Incident simulé', 'Simulated incident')}</Chip> : <Chip tone="ok">{k === 'principal' ? L('Actif', 'Active') : L('Synchronisé', 'In sync')}</Chip>}</div>
                    <div class="xs muted mt-8">{L(`Site ${site}, UE`, `Site ${site}, EU`)} · ISO 14001</div>
                  </div>
                );
              })}
            </div>
            <p class="xs muted mt-12 mb-0">{L('Serveurs, urnes et journal répliqués en continu.', 'Servers, ballot boxes and log replicated continuously.')}</p>
            {sim >= 0 && (
              <ul class="proc mt-16" aria-live="polite">{steps.map((s, i) => <li key={i} class={sim > i ? 'done' : sim === i ? 'run' : ''}><span class="pi">{sim > i ? <Icon name="check" size={14} stroke={3} /> : sim === i ? <span class="spin" /> : i + 1}</span>{s}</li>)}</ul>
            )}
          </Card>
          <Card title={L('Tests de bascule', 'Failover tests')}>
            <div class="table-wrap"><table class="table table-compact"><thead><tr><th>{L('Date', 'Date')}</th><th>{L('Type', 'Type')}</th><th class="num">{L('Durée', 'Duration')}</th><th>{L('Résultat', 'Result')}</th></tr></thead><tbody>{f.history.map((h, i) => <tr key={i}><td class="nowrap">{fmtDT(h.at)}</td><td>{tx(h.label)}</td><td class="num">{h.dur} s</td><td><Chip tone="ok">{L('Réussi', 'Passed')}</Chip></td></tr>)}</tbody></table></div>
          </Card>
        </div>
        <div class="stack">
          <Card title={L('Hébergement', 'Hosting')}>
            <KV items={[[L('Localisation', 'Location'), L('Union européenne', 'European Union')], [L('Option', 'Option'), L('France, ISO 27001', 'France, ISO 27001')], [L('Centres de données', 'Data centres'), 'ISO 14001'], [L('Sauvegardes', 'Backups'), L('Chiffrées, UE', 'Encrypted, EU')], [L('Accès', 'Access'), L('HTTPS uniquement', 'HTTPS only')]]} />
          </Card>
          <Card title={L('Dimensionnement', 'Capacity')}>
            <KV items={[[L('Électeurs', 'Voters'), L(`1 à ${fmtNum(100000)}+ par opération`, `1 to ${fmtNum(100000)}+ per election`)], [L('Simultanés', 'Concurrent'), L('Une clé par urne', 'One key per ballot box')], [L('Actuel', 'Current'), L(`${fmtNum(c.electors)} EP · ${fmtNum(2500)} CME`, `${fmtNum(c.electors)} EP · ${fmtNum(2500)} CME`)]]} />
            <details class="more mt-12"><summary>{L('Modèle de test de charge', 'Load test template')}</summary><div>
              <div class="table-wrap"><table class="table table-compact"><thead><tr><th>{L('Palier', 'Step')}</th><th class="num">{L('Électeurs', 'Voters')}</th><th class="num">{L('Votes / min', 'Votes / min')}</th><th>{L('Résultat', 'Result')}</th></tr></thead><tbody>{[['1', 10000, 300], ['2', 50000, 1200], ['3', 120000, 3000]].map(([a, b1, c1]) => <tr key={a}><td>{a}</td><td class="num">{fmtNum(b1)}</td><td class="num">{fmtNum(c1)}</td><td>{L('À mesurer', 'To measure')}</td></tr>)}</tbody></table></div>
              <p class="xs muted mt-8 mb-0">{L('Gabarit : mesures réelles remises avant chaque scrutin.', 'Template: real measurements supplied before each election.')}</p>
            </div></details>
          </Card>
          <MaintenanceCard />
        </div>
      </div>
    </>
  );
}

// Annonce des interventions planifiées à l'ensemble des utilisateurs (CCTP 6.1.1 et 6.2.3)
// Le message par défaut est enregistré en français ; null = message par défaut non modifié.
const MAINT_FR = 'Mise à jour de version. Le vote reste possible grâce à la bascule automatique.';
const MAINT_EN = 'Version update. Voting stays available through automatic failover.';
function MaintenanceCard() {
  const st = useStore();
  const m = st.maintenance;
  const start = dayAt(Date.now(), 2, 22, 0);
  const [msg, setMsg] = useState(null);
  return (
    <Card title={L('Maintenance programmée', 'Scheduled maintenance')}>
      {m && m.end > Date.now() ? (
        <>
          <Note tone="warn" icon="calendar">{L('Annonce publiée : ', 'Notice published: ')}{fmtDT(m.start)} → {fmtTime(m.end)}</Note>
          <div class="row mt-12"><Btn size="sm" icon="x" onClick={() => { dispatch('maintenance/set', { m: null, by: ME }); toast(L('Annonce retirée', 'Notice removed'), 'ok'); }}>{L('Retirer l’annonce', 'Remove notice')}</Btn></div>
        </>
      ) : (
        <div class="stack stack-s">
          <KV items={[[L('Créneau', 'Slot'), fmtDT(start) + ' → ' + fmtTime(start + 3600000)], [L('Diffusion', 'Shown to'), L('Tous les portails, bénéficiaire, Resah', 'All portals, client, Resah')]]} />
          <Field label={L('Message', 'Message')} id="mt-m"><textarea class="textarea" id="mt-m" rows="3" value={msg == null ? L(MAINT_FR, MAINT_EN) : msg} onInput={(e) => setMsg(e.currentTarget.value)} /></Field>
          <div><Btn kind="primary" size="sm" icon="send" onClick={() => { dispatch('maintenance/set', { m: { start, end: start + 3600000, msg: msg == null ? MAINT_FR : msg }, by: ME }); toast(L('Maintenance annoncée', 'Maintenance announced'), 'ok'); }}>{L('Publier l’annonce', 'Publish notice')}</Btn></div>
        </div>
      )}
      <div class="mt-12"><Refs list={['6.2.3', '6.1.1']} /></div>
    </Card>
  );
}

// ------------------------------------------------------------------ Votes tests
function Tests() {
  const st = useStore();
  const [run, setRun] = useState(-1);
  const steps = [L('Urne de test isolée', 'Isolated test ballot box'), L('Cérémonie des clés de test', 'Test key ceremony'), L('Dépôt de 24 bulletins connus', '24 known ballots cast'), L('Clôture et dépouillement', 'Closing and count'), L('Comparaison au résultat attendu', 'Compared with expected result')];
  const go1 = () => {
    setRun(0);
    let i = 0;
    const tick = () => { i++; setRun(i); if (i < steps.length) setTimeout(tick, 700); else { dispatch('r/test/add', { test: { op: 'test26', voters: 24, ok: true, label: 'Vote test complémentaire (démonstration)' }, by: ME }); toast(L('Vote test conforme', 'Test vote passed'), 'ok'); } };
    setTimeout(tick, 700);
  };
  const res = urnResults(st, 'test-a', Date.now());
  return (
    <>
      <PageHead title={L('Votes tests', 'Test votes')} sub={L('Avant chaque scrutin, avec les syndicats.', 'Before each election, with the unions.')} refs={['5.3', '7.2.2']} actions={<Btn kind="primary" icon="play" onClick={go1} disabled={run >= 0 && run < steps.length}>{L('Lancer un vote test', 'Run a test vote')}</Btn>} />
      <div class="grid g-side">
        <div class="stack">
          {run >= 0 && <Card title={L('Vote test en cours', 'Test vote running')}><ul class="proc" aria-live="polite">{steps.map((s, i) => <li key={i} class={run > i ? 'done' : run === i ? 'run' : ''}><span class="pi">{run > i ? <Icon name="check" size={14} stroke={3} /> : run === i ? <span class="spin" /> : i + 1}</span>{s}</li>)}</ul></Card>}
          <Card title={<>{L('Vote test de référence', 'Reference test vote')} <Tip>{L('24 bulletins aux choix connus, comparés au dépouillement.', '24 ballots with known choices, compared with the count.')}</Tip></>}>
            <div class="table-wrap"><table class="table table-compact"><thead><tr><th>{L('Liste', 'List')}</th><th class="num">{L('Attendu', 'Expected')}</th><th class="num">{L('Dépouillé', 'Counted')}</th><th class="num">{L('Écart', 'Diff.')}</th></tr></thead><tbody>{res.order.map((id) => <tr key={id}><td>{UNIONS[id].name}</td><td class="num">{res.votes[id]}</td><td class="num">{res.votes[id]}</td><td class="num ok-text">0</td></tr>)}<tr><td>{L('Vote blanc', 'Blank vote')}</td><td class="num">{res.blanc}</td><td class="num">{res.blanc}</td><td class="num ok-text">0</td></tr></tbody></table></div>
          </Card>
        </div>
        <Card title={L('Historique', 'History')}>
          {st.remote.tests.map((x, i) => <div class="member-row" key={i}><div class="grow"><div class="small strong">{tx(x.label)}</div><div class="xs muted">{fmtDT(x.at)} · {L(`${x.voters} votants test`, `${x.voters} test voters`)}</div></div><Chip tone="ok">{L('Conforme', 'Passed')}</Chip></div>)}
          <div class="mt-12"><Btn size="sm" icon="print" onClick={() => printHtml(`<div class="doc-meta"><span>${esc(ESTAB.name)}</span><span>PV de recette</span></div><h1>Procès-verbal de recette · vote test</h1><p>Vote test réalisé en présence de l’équipe projet et des représentants des organisations syndicales. Les résultats du dépouillement sont identiques au jeu d’essai (24 bulletins).</p><div class="sig"><div>Pour l’établissement</div><div>Pour le titulaire</div><div>Représentants des organisations syndicales</div></div>`)}>{L('PV de recette', 'Acceptance report')}</Btn></div>
        </Card>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Assistance
const SEV = () => [['Bloquant', L('Bloquant', 'Critical'), 'err', '1 h', '4 h'], ['Majeur', L('Majeur', 'Major'), 'warn', '2 h', '24 h'], ['Mineur', L('Mineur', 'Minor'), 'gray', '12 h', '48 h']];
function Support() {
  const st = useStore();
  const [open, setOpen] = useState(false);
  const [sev, setSev] = useState('Bloquant');
  const [desc, setDesc] = useState('');
  const submit = () => {
    const id = 'INC-26-' + String(500 + st.remote.tickets.length).padStart(4, '0');
    dispatch('r/ticket', { ticket: { id, sev, title: desc || 'Incident déclaré depuis la console (démonstration)', status: 'En cours', gti: sev === 'Bloquant' ? '≤ 1 h' : sev === 'Majeur' ? '≤ 2 h' : '≤ 12 h', gtr: sev === 'Bloquant' ? '≤ 4 h' : sev === 'Majeur' ? '≤ 24 h' : '≤ 48 h', ack: '< 10 min' } });
    setOpen(false); setDesc('');
    toast(L(`Ticket ${id} créé`, `Ticket ${id} created`), 'ok');
  };
  const S = SEV();
  const sevOf = (k) => S.find((x) => x[0] === k) || [k, tx(k), 'gray'];
  return (
    <>
      <PageHead title={L('Assistance et incidents', 'Support and incidents')} refs={['6.2.1', '6.2.2', '7.2.4']} actions={<Btn kind="primary" icon="alert" onClick={() => setOpen(true)}>{L('Déclarer un incident', 'Report incident')}</Btn>} />
      <div class="grid g2 mb-16">
        <Card title={L('Contacts', 'Contacts')}>
          <KV items={[[L('Numéro vert', 'Freephone'), <>{SUPPORT.phone}<div class="xs muted">{L(SUPPORT.hours, '24/7')} · {L(SUPPORT.phoneNote, 'demo number')}</div></>], [L('Courriel', 'Email'), SUPPORT.email], [L('Rapport', 'Report'), L('Sous 3 jours ouvrés', 'Within 3 working days')]]} />
        </Card>
        <Card title={<>{L('Engagements', 'Service levels')} <Tip>{L('En heures ouvrées. Pendant le vote : bascule automatique, DIMA 30 min.', 'In working hours. During voting: automatic failover, 30 min max. outage.')}</Tip></>}>
          <div class="table-wrap"><table class="table table-compact"><thead><tr><th>{L('Criticité', 'Severity')}</th><th class="num">{L('GTI', 'Response')}</th><th class="num">{L('GTR', 'Fix')}</th></tr></thead><tbody>{S.map(([k, l, , gti, gtr]) => <tr key={k}><td>{l}</td><td class="num">{gti}</td><td class="num">{gtr}</td></tr>)}</tbody></table></div>
        </Card>
      </div>
      <Card title={L('Tickets', 'Tickets')}>
        <div class="table-wrap"><table class="table table-compact"><thead><tr><th>{L('N°', 'No.')}</th><th>{L('Date', 'Date')}</th><th>{L('Criticité', 'Severity')}</th><th>{L('Objet', 'Subject')}</th><th>{L('GTI', 'Response')}</th><th>{L('GTR', 'Fix')}</th><th>{L('Statut', 'Status')}</th></tr></thead><tbody>{st.remote.tickets.map((x) => { const s = sevOf(x.sev); return <tr key={x.id}><td class="mono nowrap">{x.id}</td><td class="nowrap">{fmtDT(x.at)}</td><td><Chip tone={s[2]}>{s[1]}</Chip></td><td>{tx(x.title)}</td><td class="small nowrap">{tx(x.gti)}</td><td class="small nowrap">{tx(x.gtr)}</td><td>{tx(x.status)}</td></tr>; })}</tbody></table></div>
      </Card>
      {open && (
        <Modal title={L('Déclarer un incident', 'Report an incident')} icon="alert" onClose={() => setOpen(false)} footer={<><Btn onClick={() => setOpen(false)}>{L('Annuler', 'Cancel')}</Btn><Btn kind="primary" icon="send" onClick={submit}>{L('Déclarer', 'Report')}</Btn></>}>
          <div class="stack">
            <Field label={L('Criticité', 'Severity')} id="t-sev"><Select id="t-sev" value={sev} onChange={setSev} options={[['Bloquant', L('Bloquant : panne, résultat erroné', 'Critical: outage, wrong result')], ['Majeur', L('Majeur : service dégradé', 'Major: degraded service')], ['Mineur', L('Mineur : gêne limitée', 'Minor: limited impact')]]} /></Field>
            <Field label={L('Description', 'Description')} id="t-desc"><textarea class="textarea" id="t-desc" value={desc} onInput={(e) => setDesc(e.currentTarget.value)} placeholder={L('Décrivez l’incident', 'Describe the incident')} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}

// ------------------------------------------------------------------ Archives
function Archives() {
  const st = useStore();
  const now = Date.now();
  const t26 = st.remote.ops.test26;
  // nameFr : intitulé repris dans les documents (procès-verbal, manifeste), qui restent en français
  const items = [
    { name: opName(t26), nameFr: t26.name, at: t26.publishedAt, until: dayAt(t26.publishedAt, 730, 0, 0), purged: false, hash: sha256('archive-test26') },
    { name: L('Élections à la CSIRMT 2025', '2025 CSIRMT elections'), nameFr: 'Élections à la CSIRMT 2025', at: dayAt(now, -320, 18, 0), until: dayAt(now, 410, 0, 0), purged: false, hash: sha256('archive-csirmt25') },
    { name: L('Élections professionnelles 2022', '2022 staff elections'), nameFr: 'Élections professionnelles 2022', at: dayAt(now, -1400, 18, 0), until: dayAt(now, -670, 0, 0), purged: true, hash: sha256('archive-ep22') },
  ];
  ['ep26', 'cme26'].forEach((id) => { const o = st.remote.ops[id]; if (o.status === 'archived') items.unshift({ name: opName(o), nameFr: o.name, at: o.archivedAt, until: dayAt(o.archivedAt, 730, 0, 0), purged: false, hash: sha256('archive-' + id) }); });
  return (
    <>
      <PageHead title={L('Archives et purge', 'Archives and purge')} sub={L('Sous scellés deux ans, puis purge automatique.', 'Sealed for two years, then purged automatically.')} refs={['7.2.5', '2.13']} />
      <div class="table-wrap"><table class="table"><thead><tr><th>{L('Opération', 'Election')}</th><th>{L('Archivée le', 'Archived')}</th><th>{L('Conservée jusqu’au', 'Kept until')}</th><th>{L('Scellé', 'Seal')}</th><th>{L('Statut', 'Status')}</th><th><span class="sr-only">{L('Actions', 'Actions')}</span></th></tr></thead><tbody>
        {items.map((x) => <tr key={x.nameFr}><td class="strong">{x.name}</td><td class="nowrap">{fmtDate(x.at)}</td><td class="nowrap">{fmtDate(x.until)}</td><td><span class="fp">{shortFp(x.hash, 5)}</span></td><td><Chip tone={x.purged ? 'gray' : 'ok'}>{x.purged ? L('Purgé', 'Purged') : L('Sous scellés', 'Sealed')}</Chip></td><td>{x.purged ? <Btn size="xs" icon="file" onClick={() => printHtml(`<h1>Procès-verbal de purge</h1><p>Les données de l’opération « ${esc(x.nameFr)} » ont été supprimées le ${esc(fmtDate(x.until, 'fr'))} à l’échéance du délai de conservation, y compris les sauvegardes et éléments cryptographiques.</p>`)}>{L('PV de purge', 'Purge report')}</Btn> : <Btn size="xs" icon="download" onClick={() => downloadJSON('archive-' + x.hash.slice(0, 8) + '.json', { operation: x.nameFr, scelle: x.hash, contenu: ['programmes sources et exécutables', 'matériels de vote', 'fichiers d’émargement', 'résultats', 'sauvegardes'], conservation: fmtDate(x.until, 'fr') })}>{L('Manifeste', 'Manifest')}</Btn>}</td></tr>)}
      </tbody></table></div>
    </>
  );
}

// ------------------------------------------------------------------ Réversibilité
function Reversibilite() {
  const st = useStore();
  const exportAll = () => {
    const s = getState();
    downloadJSON('reversibilite-export-complet.json', { format: 'JSON (spécification ouverte)', genere: new Date().toISOString(), etablissement: ESTAB.name, operations: s.remote.ops, urnes: Object.values(s.remote.urns).map((u) => ({ ...u, candidates: u.candidates || undefined })), journal: s.remote.journal, alertes: s.remote.alerts, imports: s.remote.imports, echanges: s.remote.exchanges, seances: s.seance.seances, journal_seances: s.seance.journal });
    dispatch('r/journal', { actor: ME, role: 'Administrateur', action: 'Export complet en formats ouverts (réversibilité)', detail: 'JSON, CSV et XML', op: '' });
  };
  const exportCsv = () => {
    const now = Date.now();
    downloadCSV('reversibilite-urnes.csv', [L('Opération', 'Election'), L('Instance', 'Body'), L('Collège', 'College'), L('Inscrits', 'Voters'), L('Sièges', 'Seats'), L('Type', 'Type'), L('Bulletins déposés', 'Ballots cast'), L('Empreinte de la clé publique', 'Public key fingerprint')], Object.values(st.remote.urns).map((u) => [opName(st.remote.ops[u.op]), u.instance, tx(u.college), u.electors, u.seats, u.type === 'pluri' ? L('Plurinominal', 'Multi-member') : L('Liste', 'List'), urnCount(st, u.id, now), u.pkFp || '']));
    dispatch('r/journal', { actor: ME, role: 'Administrateur', action: 'Export CSV (réversibilité)', detail: 'Urnes et participation', op: '' });
  };
  const exportXml = () => downloadXML('referentiel-scrutins.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<operations>\n${Object.values(st.remote.ops).map((o) => `  <operation id="${o.id}" niveau="${o.level}">\n    <intitule>${esc(o.name)}</intitule>\n    <ouverture>${new Date(o.open).toISOString()}</ouverture>\n    <cloture>${new Date(o.close).toISOString()}</cloture>\n${o.urns.map((u) => `    <urne id="${u}" instance="${st.remote.urns[u].instance}" college="${esc(st.remote.urns[u].college)}" inscrits="${st.remote.urns[u].electors}" sieges="${st.remote.urns[u].seats}"/>`).join('\n')}\n  </operation>`).join('\n')}\n</operations>\n`);
  const plan = [[L('Préparation', 'Preparation'), L('Inventaire, plan remis sous 30 jours', 'Inventory, plan within 30 days')], [L('Transfert', 'Transfer'), L('Exports ouverts, aide au repreneur', 'Open exports, help for the new supplier')], [L('Validation', 'Sign-off'), L('Contrôle contradictoire, PV de clôture', 'Joint completeness check, closing report')], [L('Suppression', 'Deletion'), L('Données et clés supprimées sous 30 jours', 'Data and keys deleted within 30 days')]];
  const formats = [[L('Scrutins, urnes, paramétrage', 'Elections, ballot boxes, settings'), 'JSON, XML'], [L('Listes électorales, émargements', 'Electoral rolls, voter rolls'), 'CSV (UTF-8)'], [L('Résultats et procès-verbaux', 'Results and minutes'), 'CSV, PDF/A, ODT'], [L('Journaux et preuves', 'Logs and proofs'), L('JSON signé', 'Signed JSON')], [L('Séances et votes', 'Meetings and votes'), 'JSON, XML']];
  return (
    <>
      <PageHead title={L('Réversibilité', 'Reversibility')} sub={L('Formats ouverts, sans surcoût.', 'Open formats, at no extra cost.')} refs={['2.15']} actions={<><Btn kind="primary" icon="download" onClick={exportAll}>{L('Export complet (JSON)', 'Full export (JSON)')}</Btn><Btn icon="download" onClick={exportXml}>{L('Scrutins (XML)', 'Elections (XML)')}</Btn><Btn icon="download" onClick={exportCsv}>{L('Urnes (CSV)', 'Ballot boxes (CSV)')}</Btn></>} />
      <div class="grid g2">
        <Card title={<>{L('Plan de réversibilité', 'Exit plan')} <Tip>{L('Sur préavis de trois mois, sans rupture de service.', 'On three months’ notice, with no service interruption.')}</Tip></>}>
          <ul class="timeline">
            {plan.map(([t1, d], i) => <li key={i} class="done"><span class="tl-dot"><span class="xs">{i + 1}</span></span><div class="tl-title">{t1}</div><div class="tl-sub">{d}</div></li>)}
          </ul>
        </Card>
        <Card title={L('Formats', 'Formats')}>
          <div class="table-wrap"><table class="table table-compact"><thead><tr><th>{L('Données', 'Data')}</th><th>{L('Format', 'Format')}</th></tr></thead><tbody>
            {formats.map(([a, b], i) => <tr key={i}><td>{a}</td><td>{b}</td></tr>)}
          </tbody></table></div>
        </Card>
      </div>
    </>
  );
}
