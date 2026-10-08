// Console d'administration du vote en séance.
import { useMemo, useState } from 'preact/hooks';
import { useStore, dispatch } from '../lib/store.js';
import { go, href } from '../lib/router.js';
import { BackOffice } from '../ui/shell.jsx';
import { Btn, Chip, Card, PageHead, Kpi, Note, Refs, KV, toast, Empty, Select, Pager, DemoNote, Tip } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';
import { BackOfficeLogin } from './bo_common.jsx';
import { INSTANCES, instanceL } from '../data/seance.js';
import { statusChip, votableItems, pvSeanceHtml } from './seance_common.jsx';
import { fmtDT, fmtDTS, fmtDate, dayAt } from '../lib/format.js';
import { verifyChain } from '../lib/journal.js';
import { shortFp, sha256 } from '../lib/sha256.js';
import { downloadJSON, downloadDoc, printHtml } from '../lib/exporters.js';
import { rng, pick } from '../lib/prng.js';
import { FIRST_F, FIRST_M, LAST } from '../data/names.js';
import { SUPPORT } from '../config.js';
import { L, tx } from '../lib/i18n.js';

const ME = { name: 'Isabelle Roux', role: 'Administratrice · Direction des affaires générales et juridiques' };
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const meRole = () => L('Administratrice', 'Administrator');
// Noms courts des instances (sigles) ; « Directoire » et « AG GIP » ont un équivalent anglais
const SHORT_EN = { Directoire: 'Exec. board', 'AG GIP': 'GIP AGM' };
const shortL = (s) => L(s, s.split(', ').map((x) => SHORT_EN[x] || x).join(', '));

// Ligne de réglage à la manière des préférences système : libellé à gauche, interrupteur à droite
function SwitchRow({ title, sub, checked, onChange }) {
  return (
    <label class="switch member-row" style={{ justifyContent: 'space-between', width: '100%', padding: '9px 0' }}>
      <span style={{ minWidth: 0 }}><span>{title}</span>{sub && <span class="xs muted" style={{ display: 'block', fontWeight: 400 }}>{sub}</span>}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span class="sw" aria-hidden="true" />
    </label>
  );
}

export function SeanceAdminGate({ page }) {
  const st = useStore();
  if (!st.auth.s_admin) {
    return <BackOfficeLogin title={L('Administration', 'Administration')} sub={L('Vote en séance', 'Meeting voting')} user={{ ...ME, role: L(ME.role, 'Administrator · Legal and general affairs') }}
      methods={[['sso', L('Authentification unique (SSO)', 'Single sign-on (SSO)'), L('SAML 2.0 ou OpenID Connect + second facteur', 'SAML 2.0 or OpenID Connect + second factor'), 'building'], ['fido', L('Clé de sécurité FIDO2', 'FIDO2 security key'), null, 'key'], ['pwd', L('Identifiant et code à usage unique', 'Username and one-time code'), null, 'lock']]}
      refs={['2.6', '5.2']} note={L('Connexion simulée.', 'Simulated sign-in.')}
      onDone={(m) => { dispatch('auth/login', { key: 's_admin', user: { ...ME, method: m } }); dispatch('s/journal', { actor: ME.name, role: 'Administratrice', action: 'Connexion à la console d’administration', detail: m.toUpperCase(), op: '' }); if (!page) go('/seance/admin/accueil'); }} />;
  }
  const nav = [
    { group: L('Pilotage', 'Manage'), items: [{ path: '/seance/admin/accueil', label: L('Vue d’ensemble', 'Overview'), icon: 'home' }, { path: '/seance/admin/instances', label: L('Instances', 'Bodies'), icon: 'building' }, { path: '/seance/admin/annuaire', label: L('Annuaire', 'Directory'), icon: 'users' }, { path: '/seance/admin/organisateurs', label: L('Organisateurs', 'Organisers'), icon: 'shield' }] },
    { group: L('Réglages', 'Settings'), items: [{ path: '/seance/admin/integrations', label: L('Intégrations', 'Integrations'), icon: 'layers' }, { path: '/seance/admin/securite', label: L('Sécurité', 'Security'), icon: 'lock' }, { path: '/seance/admin/abonnement', label: L('Abonnement', 'Subscription'), icon: 'calendar' }] },
    { group: L('Traçabilité', 'Records'), items: [{ path: '/seance/admin/journal', label: L('Journal', 'Log'), icon: 'hash' }, { path: '/seance/admin/archives', label: L('Archives', 'Archive'), icon: 'archive' }, { path: '/seance/admin/support', label: L('Assistance', 'Support'), icon: 'phone' }] },
  ];
  const key = page || 'accueil';
  const P = { accueil: Overview, instances: Instances, annuaire: Annuaire, organisateurs: Organisateurs, integrations: Integrations, securite: Securite, abonnement: Abonnement, journal: Journal, archives: Archives, support: Support }[key] || Overview;
  return (
    <BackOffice brandSub={L('Vote en séance · administration', 'Meeting voting · admin')} nav={nav} current={'/seance/admin/' + key} user={{ name: ME.name, role: meRole() }} context={<Chip tone="gray">{L('CHU de Montclair (fictif)', 'CHU de Montclair (fictitious)')}</Chip>} onLogout={() => { dispatch('auth/logout', { key: 's_admin' }); go('/seance/admin'); }}>
      <P />
    </BackOffice>
  );
}

function Overview() {
  const st = useStore();
  const list = Object.values(st.seance.seances);
  const sub = st.seance.subscription;
  return (
    <>
      <PageHead title={L('Vue d’ensemble', 'Overview')} refs={['4', '5.1']} />
      <div class="grid g4 mb-16">
        <Kpi label={L('Instances', 'Bodies')} value={String(INSTANCES.length)} />
        <Kpi label={L('Séances en cours', 'Live meetings')} value={String(list.filter((s) => s.status === 'live').length)} />
        <Kpi label={L('Membres', 'Members')} value="312" />
        <Kpi label={L('Abonnement', 'Subscription')} value={L('Semestriel', '6 months')} sub={L('Jusqu’au ', 'Until ') + fmtDate(sub.end)} />
      </div>
      <Card title={L('Séances', 'Meetings')}>
        <div class="table-wrap"><table class="table table-compact"><thead><tr><th>{L('Séance', 'Meeting')}</th><th>Date</th><th>{L('Instance', 'Body')}</th><th>{L('Statut', 'Status')}</th><th class="num">{L('Membres', 'Members')}</th><th class="num">Votes</th></tr></thead><tbody>
          {list.map((s) => <tr key={s.id}><td class="strong">{s.title}</td><td class="nowrap">{fmtDT(s.date)}</td><td>{shortL(INSTANCES.find((i) => i.id === s.instance).short)}</td><td>{statusChip(s.status)}</td><td class="num">{s.members.length}</td><td class="num">{votableItems(s).filter((x) => s.done[x.id]).length}/{votableItems(s).length}</td></tr>)}
        </tbody></table></div>
      </Card>
    </>
  );
}

function Instances() {
  return (
    <>
      <PageHead title={L('Instances', 'Bodies')} refs={['4.2', '2.2']} actions={<Btn kind="primary" icon="plus" onClick={() => toast(L('Assistant de création (démo)', 'Creation wizard (demo)'), 'info')}>{L('Créer une instance', 'New body')}</Btn>} />
      <div class="table-wrap"><table class="table table-compact"><thead><tr><th>{L('Instance', 'Body')}</th><th>Type</th><th class="num">{L('Membres', 'Members')}</th><th>Quorum</th><th>{L('Majorité', 'Majority')}</th><th>{L('Procurations', 'Proxies')}</th><th>Options</th></tr></thead><tbody>
        {INSTANCES.map((i0) => { const i = instanceL(i0); return <tr key={i.id}><td class="strong">{i.name}</td><td class="small">{i.type}</td><td class="num">{i.members}</td><td class="small">{i.quorum}</td><td class="small">{i.majority}</td><td class="nowrap">{i.proxyMax ? i.proxyMax + ' max.' : L('Non', 'No')}</td><td class="small">{[i.secretDesign && L('Désignations secrètes', 'Secret appointments'), i.weighted && L('Vote pondéré', 'Weighted vote')].filter(Boolean).join(', ') || '-'}</td></tr>; })}
      </tbody></table></div>
    </>
  );
}

function Annuaire() {
  const [page, setPage] = useState(0);
  const [qq, setQ] = useState('');
  const [sync, setSync] = useState(false);
  const rows = useMemo(() => {
    const r = rng('annuaire');
    const out = [];
    for (let i = 0; i < 312; i++) {
      const f = r() < 0.5;
      out.push({ id: i, name: (r() < 0.6 ? 'Dr ' : f ? 'Mme ' : 'M. ') + pick(r, f ? FIRST_F : FIRST_M) + ' ' + pick(r, LAST), inst: pick(r, ['CME', 'CME, CS', 'CSIRMT', 'Directoire', 'CSE', 'CS', 'AG GIP']), src: r() < 0.82 ? 'LDAP' : r() < 0.5 ? 'CSV' : 'Manuel', mail: r() < 0.97 });
    }
    return out;
  }, []);
  const filtered = rows.filter((x) => !qq || (x.name + ' ' + x.inst + ' ' + shortL(x.inst)).toLowerCase().includes(qq.toLowerCase()));
  return (
    <>
      <PageHead title={L('Annuaire', 'Directory')} refs={['4.2', '5.2']} actions={<><Btn icon="upload" onClick={() => toast(L('CSV importé : 312 lignes, 0 doublon', 'CSV imported: 312 rows, no duplicates'), 'ok')}>{L('Importer (CSV)', 'Import (CSV)')}</Btn><Btn kind="primary" icon="refresh" disabled={sync} onClick={() => { setSync(true); setTimeout(() => { setSync(false); toast(L('Synchronisé : 3 arrivées, 1 départ', 'Synced: 3 joined, 1 left'), 'ok'); }, 1500); }}>{sync ? L('Synchronisation…', 'Syncing…') : L('Synchroniser', 'Sync')}</Btn></>} />
      <div class="row mb-12"><label class="sr-only" for="an-q">{L('Rechercher', 'Search')}</label><input id="an-q" class="input" style={{ maxWidth: '320px' }} placeholder={L('Nom ou instance', 'Name or body')} value={qq} onInput={(e) => { setQ(e.currentTarget.value); setPage(0); }} /><span class="small muted">{L(`${filtered.length} membres`, `${filtered.length} members`)}</span></div>
      <div class="table-wrap"><table class="table table-compact"><thead><tr><th>{L('Membre', 'Member')}</th><th>{L('Instances', 'Bodies')}</th><th>Source</th><th>{L('Courriel', 'Email')}</th></tr></thead><tbody>
        {filtered.slice(page * 20, page * 20 + 20).map((x) => <tr key={x.id}><td class="strong">{x.name}</td><td>{shortL(x.inst)}</td><td class="muted">{x.src === 'Manuel' ? L('Manuel', 'Manual') : x.src}</td><td>{x.mail ? <Chip tone="ok">{L('Vérifié', 'Verified')}</Chip> : <Chip tone="warn">{L('À compléter', 'Missing')}</Chip>}</td></tr>)}
      </tbody></table></div>
      <Pager page={page} total={filtered.length} size={20} onPage={setPage} />
    </>
  );
}

function Organisateurs() {
  const rows = [
    ['Mme Claire Fontaine', L('CME, Conseil de surveillance', 'CME, Supervisory board'), L('Secrétaire de séance', 'Meeting secretary'), 'TOTP'],
    ['Pr Laurent Mercier', 'CME', L('Président de séance', 'Chair'), L('Clé FIDO2', 'FIDO2 key')],
    [tx('Direction des soins'), 'CSIRMT', L('Organisateur', 'Organiser'), 'TOTP'],
    ['M. Philippe Rolland', shortL('Directoire'), L('Président de séance', 'Chair'), L('Clé FIDO2', 'FIDO2 key')],
    [tx('Direction du GIP'), shortL('AG GIP'), L('Organisateur', 'Organiser'), 'TOTP'],
  ];
  return (
    <>
      <PageHead title={L('Organisateurs', 'Organisers')} sub={L('Sans accès au contenu des votes secrets', 'No access to secret ballots')} refs={['2.6', '4.2']} actions={<Btn icon="plus" onClick={() => toast(L('Invitation envoyée', 'Invitation sent'), 'ok')}>{L('Ajouter un organisateur', 'Add organiser')}</Btn>} />
      <div class="table-wrap"><table class="table table-compact"><thead><tr><th>{L('Organisateur', 'Organiser')}</th><th>{L('Instances', 'Bodies')}</th><th>{L('Rôle', 'Role')}</th><th>{L('Second facteur', 'Second factor')}</th></tr></thead><tbody>{rows.map((r) => <tr key={r[0]}><td class="strong">{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td></tr>)}</tbody></table></div>
    </>
  );
}

function Integrations() {
  const [on, setOn] = useState({ teams: true, zoom: true, webex: true, url: true, ldap: true, sso: true, fc: true, ged: true, para: false, actes: false, sirh: true, boitiers: false, api: true });
  const groups = [
    [L('Visioconférence', 'Video conferencing'), L('Lien unique dans l’invitation, sans installation.', 'One link in the invitation, nothing to install.'), [['teams', 'Microsoft Teams'], ['zoom', 'Zoom'], ['webex', 'Cisco Webex'], ['url', L('Autre (lien URL)', 'Other (URL link)')]]],
    [L('Identité', 'Identity'), null, [['ldap', 'LDAP / Active Directory', L('Import des membres', 'Member import')], ['sso', 'SSO SAML 2.0 / OpenID Connect', L('Organisateurs et administrateurs', 'Organisers and admins')], ['fc', 'FranceConnect+', L('Participants', 'Participants')], ['sirh', L('SIRH', 'HR system'), L('Statuts des membres', 'Member status')]]],
    [L('Documents', 'Documents'), null, [['ged', L('GED', 'Document management'), L('Dépôt des PV (PDF/A + XML)', 'Minutes filed (PDF/A + XML)')], ['para', L('Parapheur électronique', 'E-signature workflow'), L('Signature des délibérations', 'Resolution signing')], ['actes', '@CTES', L('Contrôle de légalité', 'Legality check')]]],
    [L('Autres', 'Other'), null, [['boitiers', L('Boîtiers de vote', 'Voting keypads'), L('Télécommandes en salle', 'In-room keypads')], ['api', L('API REST', 'REST API'), L('Connecteurs sur mesure', 'Custom connectors')]]],
  ];
  return (
    <>
      <PageHead title={L('Intégrations', 'Integrations')} refs={['5.2']} />
      <div class="grid g2">
        {groups.map(([g, tip, items]) => (
          <Card key={g} title={tip ? <>{g} <Tip>{tip}</Tip></> : g}>
            <div>{items.map(([k, l, d]) => <SwitchRow key={k} title={l} sub={d} checked={on[k]} onChange={(v) => { setOn({ ...on, [k]: v }); toast(l + (v ? L(' activé', ' on') : L(' désactivé', ' off')), 'ok'); }} />)}</div>
          </Card>
        ))}
      </div>
      <Keypads />
    </>
  );
}

// Boîtiers de vote : appairage simulé d'une base radio et attribution aux membres (CCTP 5.2)
function Keypads() {
  const [st1, setSt1] = useState('idle');
  const [pairs, setPairs] = useState([]);
  const run = () => {
    setSt1('scan');
    setTimeout(() => {
      const r = rng('kp');
      setPairs(Array.from({ length: 8 }, (_, i) => ({ id: 'BV-' + String(1040 + i * 7), member: (r() < 0.5 ? 'Mme ' + pick(r, FIRST_F) : 'M. ' + pick(r, FIRST_M)) + ' ' + pick(r, LAST), batt: 70 + Math.floor(r() * 30) })));
      setSt1('ok');
      toast(L('8 boîtiers appairés', '8 keypads paired'), 'ok');
    }, 1400);
  };
  return (
    <Card class="mt-16" title={<>{L('Boîtiers de vote', 'Voting keypads')} <Tip>{L('Simulé. Une base radio reçoit les votes ; chaque boîtier est nominatif et émarge comme un terminal. Modèles compatibles : voir l’offre.', 'Simulated. A radio base receives the votes; each keypad is assigned to a member and signs in like a device. Compatible models: see the offer.')}</Tip></>}
      actions={<Btn icon="refresh" disabled={st1 === 'scan'} onClick={run}>{st1 === 'scan' ? L('Recherche…', 'Searching…') : st1 === 'ok' ? L('Relancer', 'Pair again') : L('Appairer (démo)', 'Pair (demo)')}</Btn>}>
      {pairs.length > 0 ? <div class="table-wrap"><table class="table table-compact"><thead><tr><th>{L('Boîtier', 'Keypad')}</th><th>{L('Attribué à', 'Assigned to')}</th><th class="num">{L('Batterie', 'Battery')}</th></tr></thead><tbody>{pairs.map((p1) => <tr key={p1.id}><td class="mono">{p1.id}</td><td>{p1.member}</td><td class="num">{p1.batt} %</td></tr>)}</tbody></table></div> : <p class="small muted mb-0">{L('Aucun boîtier appairé.', 'No keypads paired.')}</p>}
    </Card>
  );
}

function Securite() {
  const st = useStore();
  const [m, setM] = useState({ lien: true, pin: true, mdp: true, fc: true, cert: true, badge: true, deleg: true });
  const labels = { lien: L('Lien personnel à usage unique', 'Single-use personal link'), pin: L('Code PIN de séance', 'Meeting PIN'), mdp: L('Identifiant, mot de passe, question', 'ID, password, question'), fc: 'FranceConnect+', cert: L('Certificat ou carte CPS', 'Certificate or CPS card'), badge: L('Badge nominatif', 'Name badge'), deleg: L('Identifiant délégué', 'Delegated ID') };
  const sec = st.seance.security || { threshold: 3, lockMin: 5 };
  const alerts = st.seance.alerts || [];
  const set = (key, value, label) => { dispatch('s/security/set', { key, value, label, by: ME.name }); toast(L('Paramètre enregistré', 'Setting saved'), 'ok'); };
  return (
    <>
      <PageHead title={L('Sécurité', 'Security')} refs={['4.1', '4.3', '2.7']} />
      <div class="grid g2">
        <Card title={L('Alertes', 'Alerts')}>
          <div aria-live="polite">
            {alerts.length ? alerts.slice(0, 6).map((a) => (
              <div key={a.id} class="check-row">
                <span class={'cr-ico ' + (a.status === 'nouvelle' ? 'cr-err' : 'cr-ok')}><Icon name={a.type === 'geo' ? 'globe' : a.type === 'usurpation' ? 'user' : 'lock'} size={16} /></span>
                <div class="grow" style={{ minWidth: 0 }}><div class="strong small">{tx(a.title)}</div><div class="xs muted">{fmtDT(a.at)}{a.src ? ' · ' + a.src : ''}</div><div class="xs mt-8">{tx(a.detail)}</div></div>
                {a.status === 'nouvelle' ? <Btn size="xs" icon="check" onClick={() => dispatch('s/alert/ack', { id: a.id, by: ME.name })}>{L('Acquitter', 'Acknowledge')}</Btn> : <span class="xs muted">{cap(tx(a.status))}</span>}
              </div>
            )) : <Empty icon="bell" title={L('Aucune alerte', 'No alerts')} />}
          </div>
          <div class="mt-12"><DemoNote>{L(`${sec.threshold} erreurs sur l’`, `${sec.threshold} wrong answers on the `)}<a href={href('/seance/participant')}>{L('accès participant', 'participant sign-in')}</a>{L(' déclenchent une alerte.', ' raise an alert.')}</DemoNote></div>
        </Card>
        <Card title={L('Verrouillage', 'Lockout')}>
          <div class="member-row" style={{ justifyContent: 'space-between' }}><label for="ss-t">{L('Essais avant blocage', 'Attempts before lockout')}</label><Select id="ss-t" style={{ width: 'auto' }} value={String(sec.threshold)} onChange={(v) => set('threshold', +v, 'Seuil de blocage')} options={[['3', '3'], ['5', '5'], ['10', '10']]} /></div>
          <div class="member-row" style={{ justifyContent: 'space-between' }}><label for="ss-l">{L('Durée du blocage', 'Lockout duration')}</label><Select id="ss-l" style={{ width: 'auto' }} value={String(sec.lockMin)} onChange={(v) => set('lockMin', +v, 'Durée du blocage (min)')} options={[['5', '5 min'], ['15', '15 min'], ['30', '30 min']]} /></div>
          <div class="mt-16"><KV items={[[L('Anomalies', 'Anomalies'), L('Force brute, connexion hors UE, terminal partagé', 'Brute force, non-EU sign-in, shared device')], [L('Réémission', 'Reissue'), L('Canaux séparés, anciens révoqués', 'Separate channels, old ones revoked')], [L('Sessions', 'Sessions'), L('Expirent en fin de séance', 'Expire when the meeting ends')]]} /></div>
        </Card>
        <Card title={L('Modes d’accès', 'Sign-in methods')}>
          <div>{Object.entries(labels).map(([k, l]) => <SwitchRow key={k} title={l} checked={m[k]} onChange={(v) => setM({ ...m, [k]: v })} />)}</div>
        </Card>
        <Card title={<>{L('Niveaux de sécurité', 'Security levels')} <Tip>{L('Le vote en séance n’est pas soumis aux niveaux CNIL : le niveau se choisit selon l’enjeu.', 'Meeting votes are outside the CNIL levels: pick the level by what is at stake.')}</Tip></>}>
          <KV items={[[L('Standard', 'Standard'), L('Lien unique ou PIN, émargement horodaté', 'Single link or PIN, timestamped sign-in')], [L('Renforcé', 'Enhanced'), L('Identifiants séparés et question, vote secret chiffré', 'Separate credentials and question, encrypted secret ballot')], [L('Élevé', 'High'), L('FranceConnect+ ou certificat, horodatage qualifié', 'FranceConnect+ or certificate, qualified timestamp')]]} />
        </Card>
      </div>
    </>
  );
}

function Abonnement() {
  const st = useStore();
  const sub = st.seance.subscription;
  return (
    <>
      <PageHead title={L('Abonnement', 'Subscription')} refs={['5.1']} />
      <div class="grid g2">
        <Card title={tx(sub.plan)}>
          <KV items={[[L('Période', 'Period'), fmtDate(sub.start) + ' → ' + fmtDate(sub.end)], [L('Capacité', 'Capacity'), tx(sub.participants)], [L('Séances', 'Meetings'), L('Illimitées', 'Unlimited')], [L('Facturation', 'Billing'), L('En une fois, Chorus Pro', 'Single invoice, Chorus Pro')], [L('Prestations', 'Services'), L('À la demande', 'On request')], [L('Engagement', 'Commitment'), L('Selon l’offre', 'As per the offer')]]} />
        </Card>
        <Card title={L('Inclus', 'Included')}>
          <ul class="list-check small">{[L('Hébergement et maintenance', 'Hosting and maintenance'), L('Montées de version', 'Upgrades'), L('Assistance 24 h/24, numéro gratuit', '24/7 support, free number'), L('Réversibilité', 'Reversibility'), L('Toutes les intégrations', 'All integrations')].map((x) => <li key={x}><Icon name="check" size={18} />{x}</li>)}</ul>
        </Card>
      </div>
    </>
  );
}

function Journal() {
  const st = useStore();
  const [res, setRes] = useState(null);
  return (
    <>
      <PageHead title={L('Journal scellé', 'Sealed log')} sub={L('Chaîné par empreintes', 'Hash-chained')} refs={['6.1.4']} actions={<><Btn kind="primary" icon="shieldCheck" onClick={() => setRes(verifyChain(st.seance.journal))}>{L('Vérifier l’intégrité', 'Check integrity')}</Btn><Btn icon="download" onClick={() => downloadJSON('journal-seances.json', st.seance.journal)}>{L('Exporter', 'Export')}</Btn></>} />
      {res && <div class="mb-16">{res.ok ? <Note tone="ok" icon="checkCircle">{L(`Chaîne intègre : ${res.count} entrées`, `Chain intact: ${res.count} entries`)}</Note> : <Note tone="err" icon="alert">{L(`Altération à l’entrée n° ${res.at}`, `Tampering at entry ${res.at}`)}</Note>}</div>}
      <div class="table-wrap"><table class="table table-compact"><thead><tr><th class="num">{L('N°', 'No.')}</th><th>{L('Horodatage', 'Time')}</th><th>{L('Acteur', 'Actor')}</th><th>Action</th><th>{L('Détail', 'Detail')}</th><th>{L('Empreinte', 'Hash')}</th></tr></thead><tbody>
        {st.seance.journal.slice().reverse().slice(0, 200).map((e) => <tr key={e.i}><td class="num">{e.i}</td><td class="nowrap">{fmtDTS(e.at)}</td><td><div class="strong">{tx(e.actor)}</div><div class="xs muted">{tx(e.role)}</div></td><td>{tx(e.action)}</td><td class="small">{tx(e.detail)}</td><td><span class="fp">{e.hash.slice(0, 10)}</span></td></tr>)}
      </tbody></table></div>
    </>
  );
}

function Archives() {
  const st = useStore();
  const list = Object.values(st.seance.seances).filter((s) => s.status === 'closed');
  return (
    <>
      <PageHead title={L('Archives', 'Archive')} refs={['7.3.4']} />
      {list.length ? (
        <div class="table-wrap"><table class="table table-compact"><thead><tr><th>{L('Séance', 'Meeting')}</th><th>Date</th><th>{L('Scellé', 'Seal')}</th><th>{L('Conservée jusqu’au', 'Kept until')}</th><th><span class="sr-only">{L('Actions', 'Actions')}</span></th></tr></thead><tbody>
          {list.map((s) => <tr key={s.id}><td class="strong">{s.title}</td><td>{fmtDate(s.date)}</td><td><span class="fp">{shortFp(sha256('pv-' + s.id), 5)}</span></td><td>{fmtDate(dayAt(s.date, 730, 0, 0))}</td><td class="row" style={{ gap: '6px' }}><Btn size="xs" icon="print" onClick={() => printHtml(pvSeanceHtml(st, s))}>{L('PV (PDF)', 'Minutes (PDF)')}</Btn><Btn size="xs" icon="file" onClick={() => downloadDoc('pv-' + s.id + '.doc', 'Procès-verbal', pvSeanceHtml(st, s))}>Word</Btn><Btn size="xs" icon="download" onClick={() => downloadJSON('historique-' + s.id + '.json', { seance: s.title, date: new Date(s.date).toISOString(), votes: Object.values(st.seance.votes).filter((v) => v.sid === s.id).map((v) => ({ point: v.itemId, tour: v.round, resultat: v.result && v.result.text, votants: v.final && v.final.votants })) })}>{L('Historique', 'History')}</Btn></td></tr>)}
        </tbody></table></div>
      ) : <Empty icon="archive" title={L('Aucune séance archivée', 'No archived meetings')} />}
    </>
  );
}

function Support() {
  return (
    <>
      <PageHead title={L('Assistance', 'Support')} refs={['7.3.3', '6.2']} />
      <Card style={{ maxWidth: '760px' }}>
        <KV items={[
          [L('Téléphone', 'Phone'), <span>{SUPPORT.phone} <span class="muted small">{L('gratuit, 24 h/24 · numéro de démo', 'free, 24/7 · demo number')}</span></span>],
          [L('Courriel', 'Email'), <span>{SUPPORT.email} <span class="muted small">{L('ticket sous 10 min', 'ticket within 10 min')}</span></span>],
          [L('En séance', 'During meetings'), L('Technicien à distance ou sur site', 'Technician, remote or on site')],
          [L('Incidents', 'Incidents'), L('Processus ITIL', 'ITIL process')],
        ]} />
      </Card>
    </>
  );
}
