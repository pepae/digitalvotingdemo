// Espace organisateur du vote en séance : séances, préparation, console de pilotage, PV, projection.
import { useEffect, useState } from 'preact/hooks';
import { useStore, useNow, dispatch, TAB } from '../lib/store.js';
import { go, href, absUrl } from '../lib/router.js';
import { BackOffice } from '../ui/shell.jsx';
import { Btn, Chip, Card, PageHead, Kpi, BarRow, Note, DemoNote, Ref, Refs, Modal, Tabs, TabPanel, KV, toast, Empty, Field, Switch, Select, Stepper, Progress, CopyField, Tip, More } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';
import { BackOfficeLogin } from './bo_common.jsx';
import { INSTANCES, DOCS, STATUS_LABELS, MAJORITY_LABELS, exprLabel, majorityLabel, statusLabel, instanceL, buildSmallMembers } from '../data/seance.js';
import { voteKey, findItem, flatAgenda, quorumInfo, quorumFor, QUORUM_RULES, QUORUM_RULES_EN, voteRemaining, arrivedBallots, expectedBallots, tally, roundLabel, ordinalFr, ordinalEn } from '../lib/sim.js';
import { ORG, activeVote, lastVote, votableItems, optionLabel, choiceLabel, voteTypeLabel, voteTypeShort, quorumLabel, openVote, closeVote, ResultView, pvSeanceHtml, pvVoteHtml, pvXml, statusChip, memberName, exprShort } from './seance_common.jsx';
import { DocViewer, QrSvg } from './seance_participant.jsx';
import { fmtDT, fmtDTS, fmtTime, fmtTimeS, fmtMMSS, fmtNum, fmtDateLong, fmtDateMed, dayAt } from '../lib/format.js';
import { downloadCSV, downloadDoc, downloadXML, printHtml, esc } from '../lib/exporters.js';
import { sha256, shortFp } from '../lib/sha256.js';
import { randHex, randCode, randDigits } from '../lib/prng.js';
import { L, tx, resultText } from '../lib/i18n.js';

// ------------------------------------------------------------------ Libellés d'affichage
const DOC_KIND_EN = { 'Procès-verbal': 'Minutes', Note: 'Note', Annexe: 'Annex', 'Rapport de présentation': 'Report', 'Projet de délibération': 'Draft resolution' };
const docKind = (k) => L(k, DOC_KIND_EN[k] || k);
const TAG_EN = { 'Motion préalable': 'Preliminary motion', Amendement: 'Amendment', 'Sous-amendement': 'Sub-amendment', 'Vote sur l’ensemble': 'Whole text', Sondage: 'Poll', 'Vote groupé': 'Grouped vote' };
const tagL = (t) => L(t, TAG_EN[t] || t);
// Destinataires des transmissions : [valeur enregistrée, libellé affiché, icône]
const TARGETS = () => [
  ['Parapheur électronique', L('Parapheur électronique', 'E-signature workflow'), 'stamp'],
  ['GED de l’établissement', L('GED de l’établissement', 'Document management'), 'database'],
  ['Publication sur le site internet', L('Site internet', 'Website'), 'globe'],
  ['@CTES (collectivités : contrôle de légalité)', L('@CTES (contrôle de légalité)', '@CTES (legality check)'), 'send'],
];
const targetL = (t) => { const x = TARGETS().find((y) => y[0] === t); return x ? x[1] : tx(t); };
const pinFmt = (p) => (p || '').replace(/(\d{3})(\d{3})/, '$1 $2');
const partUrl = (s) => absUrl('/seance/participant?pin=' + s.pin);
const ordL = (n, R) => L(ordinalFr(n, R), ordinalEn(n));
const whenL = (ts) => L(fmtDateMed(ts) + ' à ' + fmtTime(ts), fmtDateMed(ts) + ' at ' + fmtTime(ts));
const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const isRes = (v) => v.type === 'resolution' || v.type === 'multi';
// Choix proposés pour un vote, en une ligne
function optionsText(it) {
  const v = it.vote;
  const ex = () => v.expr.map((e) => exprShort(e)).join(' / ');
  if (v.type === 'resolution') return ex();
  if (v.type === 'multi') return L(v.questions.length + ' questions', v.questions.length + ' questions') + ' · ' + ex();
  if (v.type === 'liste') return L(v.lists.length + ' listes + blanc', v.lists.length + ' lists + blank');
  const n = (v.candidates || v.options).length;
  return n + ' options' + (v.type === 'uninominal' || v.type === 'plurinominal' ? L(' + blanc', ' + blank') : '');
}
// Règles complémentaires d'un vote (abstentions, voix prépondérante, quorum)
function rulesText(it) {
  const v = it.vote;
  const out = [];
  if (v.abstNotCounted && isRes(v)) out.push(L('abstentions non comptées', 'abstentions not counted'));
  if (v.casting && isRes(v)) out.push(L('voix prépondérante du président', 'chair’s casting vote'));
  if (v.blocked) out.push(L('vote bloqué', 'block vote'));
  return out.join(' · ');
}

export function OrganizerGate({ sid, sub, page, q }) {
  const st = useStore();
  if (!st.auth.s_org) {
    return <BackOfficeLogin title={L('Espace organisateur', 'Organiser area')} sub={L('Vote en séance · organisateur', 'Meeting voting · organiser')} user={ORG}
      methods={[['pwd', L('Identifiant et code à usage unique', 'Username and one-time code'), L('Application d’authentification', 'Authenticator app'), 'lock'], ['sso', L('Authentification unique (SSO)', 'Single sign-on (SSO)'), 'SAML 2.0 · OpenID Connect', 'building'], ['fido', L('Clé de sécurité FIDO2', 'FIDO2 security key'), null, 'key']]}
      refs={['2.6', '4.2']} note={L('Connexion simulée. L’organisateur ne voit jamais le contenu des votes secrets.', 'Simulated sign-in. The organiser never sees how anyone voted in a secret ballot.')}
      onDone={(m) => { dispatch('auth/login', { key: 's_org', user: { ...ORG, method: m } }); if (!page && !sid) go('/seance/organisateur/seances'); }} />;
  }
  const nav = [
    { group: L('Séances', 'Meetings'), items: [{ path: '/seance/organisateur/seances', label: L('Mes séances', 'My meetings'), icon: 'calendar' }, { path: '/seance/organisateur/nouvelle', label: L('Nouvelle séance', 'New meeting'), icon: 'plus' }] },
    { group: L('En cours · CME', 'Live · CME'), items: [{ path: '/seance/organisateur/s/cme', label: L('Préparation', 'Preparation'), icon: 'list' }, { path: '/seance/organisateur/s/cme/console', label: 'Console', icon: 'gavel' }, { path: '/seance/organisateur/s/cme/pv', label: L('Procès-verbal', 'Minutes'), icon: 'fileCheck' }] },
  ];
  let current = '/seance/organisateur/seances';
  let body;
  if (page === 'nouvelle') { current = '/seance/organisateur/nouvelle'; body = <NewSeance />; }
  else if (sid) {
    current = '/seance/organisateur/s/' + sid + (sub ? '/' + sub : '');
    body = sub === 'console' ? <Console key={sid} sid={sid} /> : sub === 'pv' ? <PvPage key={sid} sid={sid} /> : <Prep key={sid + (sub || '')} sid={sid} q={q} sub={sub} />;
  } else body = <SeanceList />;
  return (
    <BackOffice brandSub={L('Vote en séance · organisateur', 'Meeting voting · organiser')} nav={nav} current={current} user={{ name: ORG.name, role: L('Secrétaire de séance (CME)', 'Meeting secretary (CME)') }} context={<Chip tone="sky">{L('CHU de Montclair (fictif)', 'CHU de Montclair (fictitious)')}</Chip>} onLogout={() => { dispatch('auth/logout', { key: 's_org' }); go('/seance/organisateur'); }}>
      {body}
    </BackOffice>
  );
}

// ------------------------------------------------------------------ Liste des séances
function SeanceList() {
  const st = useStore();
  const list = Object.values(st.seance.seances).sort((a, b) => (a.status === 'live' ? -1 : 0) - (b.status === 'live' ? -1 : 0) || a.date - b.date);
  return (
    <>
      <PageHead title={L('Mes séances', 'My meetings')} refs={['4', '4.2', '5.3']} actions={<><Btn onClick={createTestSeance}>{L('Nouvelle séance de test', 'New test meeting')}</Btn><Btn kind="primary" icon="plus" href="/seance/organisateur/nouvelle">{L('Nouvelle séance', 'New meeting')}</Btn></>} />
      <div class="card" style={{ padding: '4px 20px' }}>
        {list.map((s, i) => {
          const inst = INSTANCES.find((x) => x.id === s.instance);
          const votable = votableItems(s);
          const done = votable.filter((it) => s.done[it.id]).length;
          return (
            <div key={s.id} class="row-between" style={{ padding: '14px 0', borderTop: i ? '1px solid var(--border)' : 0 }}>
              <div class="grow" style={{ minWidth: '220px' }}>
                <div class="row" style={{ gap: '8px' }}>
                  <a href={href('/seance/organisateur/s/' + s.id)} class="strong" style={{ color: 'var(--text)', textDecoration: 'none' }}>{s.title}</a>
                  {statusChip(s.status)}
                  {s.test && <Chip tone="warn">Test</Chip>}
                  {s.weighted && <Chip tone="gray">{L('Pondéré', 'Weighted')}</Chip>}
                </div>
                <div class="small muted" style={{ marginTop: '2px' }}>{inst.short} · {whenL(s.date)}</div>
              </div>
              <div class="small muted nowrap">{L(s.members.length + ' membres', s.members.length + ' members')} · {done}/{votable.length} votes</div>
              <div class="row" style={{ gap: '6px' }}>
                <Btn size="sm" href={'/seance/organisateur/s/' + s.id}>{L('Préparer', 'Prepare')}</Btn>
                {s.status !== 'closed' && <Btn size="sm" kind="primary" href={'/seance/organisateur/s/' + s.id + '/console'}>Console</Btn>}
                <Btn size="sm" kind="ghost" href={'/seance/organisateur/s/' + s.id + '/pv'}>{L('PV', 'Minutes')}</Btn>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// Séance de test (bac à sable) : prise en main avec l'organisateur avant la première utilisation (CCTP 5.3)
function createTestSeance() {
  const id = 'test' + randHex(4);
  const RES = ['pour', 'contre', 'abstention'];
  const members = buildSmallMembers(id, 6, 6, ['Membre volontaire (séance de test)']).map((m) => ({ ...m, present: true, mode: 'salle', arrivedAt: Date.now() }));
  const agenda = [
    { id: 'e1', num: '1', title: 'Vote d’essai nominatif', kind: 'vote', vote: { mode: 'nominatif', type: 'resolution', expr: [...RES, 'nppv'], majority: 'simple', abstNotCounted: true, casting: true, duration: 30, dist: { pour: 0.6, contre: 0.2, abstention: 0.1, nppv: 0.1 } } },
    { id: 'e2', num: '2', title: 'Élection d’essai à bulletin secret (deux tours)', kind: 'election', vote: { mode: 'secret', type: 'uninominal', rounds: 2, desist: true, majority: 'absolue-relative', duration: 30, candidates: [{ id: 'a', name: 'Candidat·e A (fictif)', spec: 'Test' }, { id: 'b', name: 'Candidat·e B (fictif)', spec: 'Test' }, { id: 'c', name: 'Candidat·e C (fictif)', spec: 'Test' }], dist: { a: 0.4, b: 0.4, c: 0.2 }, dist2: { a: 0.6, b: 0.4 } } },
    { id: 'e3', num: '3', title: 'Sondage d’essai', kind: 'vote', vote: { mode: 'secret', type: 'sondage', duration: 30, options: [{ id: 'o1', name: 'Option 1' }, { id: 'o2', name: 'Option 2' }], dist: { o1: 0.5, o2: 0.5 } } },
  ];
  dispatch('s/seance/create', { by: ORG.name, seance: { id, instance: 'cme', test: true, title: 'Séance de test · bac à sable', short: 'Test', date: Date.now(), place: 'Bac à sable (aucune donnée réelle)', visio: null, status: 'planned', pin: randDigits(6), president: members[0].id, secretary: ORG.name, weighted: false, agenda, members, current: 'e1', done: {} } });
  toast(L('Séance de test créée (6 membres fictifs)', 'Test meeting created (6 fictitious members)'), 'ok');
  go('/seance/organisateur/s/' + id);
}

// ------------------------------------------------------------------ Nouvelle séance
function NewSeance() {
  const [step, setStep] = useState(0);
  const [d, setD] = useState({ instance: 'cs', title: 'Conseil de surveillance · séance extraordinaire', date: '', time: '17:30', place: 'Salle du conseil, Hôpital Bellevue', mode: 'hybride', visio: 'Microsoft Teams', source: 'instance', agenda: 'Approbation du procès-verbal de la séance précédente\nAvis sur le projet d’établissement 2027-2031\nÉlection du vice-président (vote secret)\nQuestions diverses', duration: 60, showPartial: false, proxQuorum: false, files: [], csv: null, imported: null });
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  useEffect(() => { set('date', new Date(dayAt(Date.now(), 12, 12, 0)).toISOString().slice(0, 10)); }, []);
  const create = () => {
    const id = 's' + randHex(5);
    const lines = d.agenda.split('\n').map((x) => x.trim()).filter(Boolean);
    const RES = ['pour', 'contre', 'abstention'];
    const agenda = lines.map((l, i) => {
      const secret = /secret|élection|election|désignation/i.test(l);
      const info = /questions diverses|information|ouverture de la séance/i.test(l);
      if (info) return { id: 'n' + i, num: String(i + 1), title: l, kind: 'info' };
      if (secret) return { id: 'n' + i, num: String(i + 1), title: l, kind: 'election', vote: { mode: 'secret', type: 'uninominal', rounds: 2, desist: true, majority: 'absolue-relative', duration: 90, candidates: [{ id: 'c1', name: 'Mme Valérie Dupuis', spec: 'Personnalité qualifiée' }, { id: 'c2', name: 'M. Olivier Garcia', spec: 'Représentant des collectivités' }], dist: { c1: 0.56, c2: 0.4, blanc: 0.04 } } };
      return { id: 'n' + i, num: String(i + 1), title: l, kind: 'vote', vote: { mode: 'nominatif', type: 'resolution', expr: RES, majority: 'simple', abstNotCounted: true, casting: true, duration: d.duration, dist: { pour: 0.82, contre: 0.08, abstention: 0.1 } } };
    });
    const members = buildSmallMembers(id, 15, 15, ['Représentant·e des collectivités', 'Personnalité qualifiée', 'Représentant·e des personnels', 'Représentant·e des usagers']).map((m) => ({ ...m, present: true, arrivedAt: Date.now() }));
    const date = new Date(d.date + 'T' + d.time).getTime();
    dispatch('s/seance/create', { by: ORG.name, seance: { id, instance: d.instance, title: d.title, short: INSTANCES.find((i) => i.id === d.instance).short, date, place: d.place + (d.mode !== 'presentiel' ? ' · ' + d.mode + ' (' + d.visio + ')' : ''), visio: d.mode !== 'presentiel' ? d.visio : null, status: 'planned', pin: randDigits(6), president: members[0].id, secretary: ORG.name, weighted: false, proxiesCountForQuorum: d.proxQuorum, showPartial: d.showPartial, agenda, members, files: d.files, current: agenda[0].id, done: {} } });
    toast(L('Séance créée, liens prêts à envoyer', 'Meeting created, links ready to send'), 'ok');
    go('/seance/organisateur/s/' + id);
  };
  const steps = [L('Instance et date', 'Body and date'), L('Participants', 'Participants'), L('Ordre du jour', 'Agenda'), L('Paramètres', 'Settings')];
  return (
    <>
      <PageHead title={L('Nouvelle séance', 'New meeting')} refs={['4.2', '4']} />
      <Stepper steps={steps} current={step} />
      <div class="card">
        {step === 0 && (
          <div class="grid g2">
            <Field label={L('Instance', 'Body')} id="ns-i"><Select id="ns-i" value={d.instance} onChange={(v) => set('instance', v)} options={INSTANCES.map((i) => [i.id, instanceL(i).name])} /></Field>
            <Field label={L('Intitulé', 'Title')} id="ns-t"><input class="input" id="ns-t" value={d.title} onInput={(e) => set('title', e.currentTarget.value)} /></Field>
            <Field label="Date" id="ns-d"><input class="input" id="ns-d" type="date" value={d.date} onInput={(e) => set('date', e.currentTarget.value)} /></Field>
            <Field label={L('Heure', 'Time')} id="ns-h"><input class="input" id="ns-h" type="time" value={d.time} onInput={(e) => set('time', e.currentTarget.value)} /></Field>
            <Field label={L('Lieu', 'Place')} id="ns-l"><input class="input" id="ns-l" value={d.place} onInput={(e) => set('place', e.currentTarget.value)} /></Field>
            <Field label={L('Format', 'Format')} id="ns-m"><Select id="ns-m" value={d.mode} onChange={(v) => set('mode', v)} options={[['presentiel', L('Présentiel', 'In person')], ['hybride', L('Hybride (salle et visio)', 'Hybrid (room and video)')], ['distanciel', L('À distance', 'Remote')]]} /></Field>
            {d.mode !== 'presentiel' && <Field label={L('Visioconférence', 'Video conferencing')} id="ns-v"><Select id="ns-v" value={d.visio} onChange={(v) => set('visio', v)} options={[['Microsoft Teams', 'Microsoft Teams'], ['Zoom', 'Zoom'], ['Cisco Webex', 'Cisco Webex'], ['Autre', L('Autre (lien URL)', 'Other (URL link)')]]} /></Field>}
          </div>
        )}
        {step === 1 && (
          <fieldset><legend>{L('Participants habilités à voter', 'Eligible voters')}</legend>
            <div class="choices">
              {[['instance', L('Membres de l’instance', 'Body members'), L('Annuaire à jour, statuts et suppléances', 'Current directory, statuses and deputies')], ['csv', L('Fichier CSV', 'CSV file'), L('Nom, prénom, courriel, statut, voix', 'Name, first name, email, status, votes')], ['ldap', L('Annuaire de l’établissement', 'Hospital directory'), 'LDAP / Active Directory']].map(([k, l, s]) => <label key={k} class={'choice ' + (d.source === k ? 'checked' : '')}><input type="radio" name="ns-src" checked={d.source === k} onChange={() => set('source', k)} /><span class="tick" aria-hidden="true" /><span class="c-body"><span class="c-title">{l}</span><span class="c-sub" style={{ display: 'block' }}>{s}</span></span></label>)}
            </div>
            {d.source === 'csv' && (
              <div class="mt-12">
                {!d.csv ? <Btn size="sm" icon="upload" onClick={() => set('csv', { name: 'membres_conseil_surveillance.csv', rows: 15, err: 0, supp: 2 })}>{L('Importer un CSV (démo)', 'Import a CSV (demo)')}</Btn>
                  : <Note tone="ok" icon="checkCircle">{d.csv.name} : {L(d.csv.rows + ' lignes, ' + d.csv.err + ' erreur, ' + d.csv.supp + ' suppléants rattachés', d.csv.rows + ' rows, ' + d.csv.err + ' errors, ' + d.csv.supp + ' deputies linked')}</Note>}
              </div>
            )}
            <p class="small muted mt-12 mb-0">{L('15 membres convoqués, chacun avec un lien personnel.', '15 members invited, each with a personal link.')}</p>
          </fieldset>
        )}
        {step === 2 && (
          <div class="stack">
            <Field label={L('Ordre du jour', 'Agenda')} id="ns-a" hint={L('Un point par ligne', 'One item per line')}><textarea class="textarea" id="ns-a" rows="7" value={d.agenda} onInput={(e) => set('agenda', e.currentTarget.value)} aria-describedby="ns-a-hint" /></Field>
            <div class="row">
              <Btn size="sm" icon="upload" onClick={() => { set('agenda', 'Ouverture de la séance et constat du quorum (information)\nApprobation du procès-verbal de la séance du 12 juin\nAvis sur le projet d’établissement 2027-2031\nAvis sur le compte financier 2025\nDésignation du représentant au comité stratégique du GHT (vote secret)\nQuestions diverses'); set('imported', 'ordre_du_jour_CS_seance_extraordinaire.docx'); }}>{L('Importer un document', 'Import a document')}</Btn>
              <Btn size="sm" icon="file" onClick={() => set('files', [{ name: 'Rapport de présentation du projet d’établissement.pdf', size: '2,4 Mo', kind: 'Rapport de présentation' }, { name: 'Projet de délibération.pdf', size: '310 Ko', kind: 'Projet de délibération' }, { name: 'Annexe financière.xlsx', size: '96 Ko', kind: 'Annexe' }])}>{L('Joindre des documents', 'Attach documents')}</Btn>
              <Tip>{L('« Élection », « désignation » ou « secret » : vote secret. « Questions diverses » : sans vote.', '“Élection”, “désignation” or “secret”: secret ballot. “Questions diverses”: no vote.')}</Tip>
            </div>
            {d.imported && <Note tone="ok" icon="checkCircle">{d.imported} : {L(d.agenda.split('\n').filter(Boolean).length + ' points détectés', d.agenda.split('\n').filter(Boolean).length + ' items found')}</Note>}
            {d.files.length > 0 && <div class="stack stack-s">{d.files.map((f) => <div key={f.name} class="member-row"><Icon name="file" size={18} /><div class="grow small"><strong>{f.name}</strong><div class="xs muted">{docKind(f.kind)} · {f.size}</div></div><button class="btn btn-xs" onClick={() => set('files', d.files.filter((x) => x !== f))} aria-label={L('Retirer ', 'Remove ') + f.name}><Icon name="x" size={13} /></button></div>)}</div>}
          </div>
        )}
        {step === 3 && (
          <div class="stack">
            <Field label={L('Durée de vote par défaut', 'Default voting time')} id="ns-du"><Select id="ns-du" value={String(d.duration)} onChange={(v) => set('duration', +v)} options={[['30', '30 s'], ['60', '1 min'], ['120', '2 min'], ['300', '5 min']]} /></Field>
            <Switch checked={d.showPartial} onChange={(v) => set('showPartial', v)} label={L('Afficher les résultats partiels pendant le vote', 'Show partial results during the vote')} />
            <Switch checked={d.proxQuorum} onChange={(v) => set('proxQuorum', v)} label={L('Les procurations comptent pour le quorum', 'Proxies count towards quorum')} />
          </div>
        )}
        <div class="row-between mt-24">
          <Btn icon="arrowLeft" disabled={step === 0} onClick={() => setStep(step - 1)}>{L('Précédent', 'Back')}</Btn>
          {step < 3 ? <Btn kind="primary" iconRight="arrowRight" onClick={() => setStep(step + 1)}>{L('Suivant', 'Next')}</Btn> : <Btn kind="primary" icon="check" onClick={create}>{L('Créer la séance', 'Create meeting')}</Btn>}
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Préparation
function Prep({ sid, q, sub }) {
  const st = useStore();
  const s = st.seance.seances[sid];
  const [tab, setTab] = useState(q.tab || (sub === 'presence' ? 'part' : 'odj'));
  const [doc, setDoc] = useState(null);
  const [add, setAdd] = useState(false);
  if (!s) return <Empty title={L('Séance introuvable', 'Meeting not found')} />;
  const inst = INSTANCES.find((i) => i.id === s.instance);
  const il = instanceL(inst);
  const items = flatAgenda(s.agenda);
  const qi = quorumInfo(s);
  const exportPresence = () => downloadCSV(L('liste-de-presence-', 'attendance-') + s.id + '.csv', [L('Nom', 'Name'), L('Fonction', 'Role'), L('Statut', 'Status'), L('Voix', 'Votes'), L('Présence', 'Attendance'), L('Mode', 'Mode'), L('Arrivée', 'Arrival'), L('Procuration à', 'Proxy to')], s.members.map((m) => [m.name, m.title, statusLabel(m.status), m.weight, m.present ? L('Présent', 'Present') : tx(m.absence) || L('Absent', 'Absent'), m.present ? (m.mode === 'visio' ? L('Visioconférence', 'Video') : L('Salle', 'Room')) : '', m.arrivedAt && m.present ? fmtTime(m.arrivedAt) : '', m.proxyTo ? memberName(s, m.proxyTo) : '']));
  return (
    <>
      <PageHead crumbs={[[L('Mes séances', 'My meetings'), '/seance/organisateur/seances'], [tx(s.short)]]} title={s.title} sub={L(fmtDateLong(s.date) + ' à ' + fmtTime(s.date), fmtDateLong(s.date) + ' at ' + fmtTime(s.date))} actions={<>
        {s.status === 'planned' && <Btn kind="primary" icon="play" onClick={() => { dispatch('s/seance/open', { sid, by: ORG.name }); go('/seance/organisateur/s/' + sid + '/console'); }}>{L('Ouvrir la séance', 'Open meeting')}</Btn>}
        {s.status === 'live' && <Btn kind="primary" icon="gavel" href={'/seance/organisateur/s/' + sid + '/console'}>Console</Btn>}
        <Btn icon="fileCheck" href={'/seance/organisateur/s/' + sid + '/pv'}>{L('Procès-verbal', 'Minutes')}</Btn>
      </>} />
      <Tabs label={L('Préparation de la séance', 'Meeting preparation')} value={tab} onChange={setTab} tabs={[{ id: 'odj', label: L('Ordre du jour', 'Agenda'), badge: items.length }, { id: 'part', label: 'Participants', badge: s.members.length }, { id: 'param', label: L('Paramètres', 'Settings') }, { id: 'conv', label: L('Convocation et accès', 'Invitations and access') }]} />
      {tab === 'odj' && (
        <TabPanel id="odj">
          <div class="row mb-12" style={{ justifyContent: 'flex-end' }}><Refs list={['4.2']} /><Btn size="sm" icon="plus" onClick={() => setAdd(true)}>{L('Ajouter un point', 'Add item')}</Btn></div>
          <div class="stack stack-s">
            {items.map((it) => <PrepItem key={it.id} s={s} it={it} onDoc={setDoc} />)}
          </div>
          {(s.files || []).length > 0 && <div class="mt-16"><Card tight title={L('Pièces jointes', 'Attachments')}>{s.files.map((f) => <div key={f.name} class="member-row"><Icon name="file" size={18} /><div class="grow small"><strong>{f.name}</strong><div class="xs muted">{docKind(f.kind)} · {f.size}</div></div></div>)}</Card></div>}
          <div class="mt-16">
            <More label={L('Règles de vote disponibles', 'Available voting rules')}>
              <ul class="small" style={{ margin: 0, paddingLeft: '18px' }}>
                <li>{L('Vote nominatif, secret (identité dissociée du bulletin) ou pondéré', 'Named, secret (identity kept apart from the ballot) or weighted vote')}</li>
                <li>{L('Uninominal à un, deux ou trois tours avec désistements, plurinominal, liste à un tour', 'Single-seat in one, two or three rounds with withdrawals, multi-seat, single-round list')}</li>
                <li>{L('Vote groupé, amendement, sous-amendement, motion préalable', 'Grouped vote, amendment, sub-amendment, preliminary motion')}</li>
                <li>{L('Majorité simple, absolue, qualifiée, deux tiers ; quorum paramétrable par vote', 'Simple, absolute, qualified or two-thirds majority; quorum set per vote')}</li>
                <li>{L('Abstentions non comptées, voix prépondérante du président, vote bloqué', 'Abstentions not counted, chair’s casting vote, block vote')}</li>
              </ul>
            </More>
          </div>
        </TabPanel>
      )}
      {tab === 'part' && (
        <TabPanel id="part">
          <div class="grid g4 mb-16">
            <Kpi label={L('Convoqués', 'Invited')} value={String(s.members.length)} />
            <Kpi label={s.weighted ? L('Voix statutaires', 'Statutory votes') : L('Voix délibératives', 'Voting members')} value={fmtNum(qi.total)} />
            <Kpi label={L('Présents', 'Present')} value={fmtNum(qi.present)} tone={qi.ok ? 'ok' : 'warn'} sub={L('Quorum : ', 'Quorum: ') + qi.required} />
            <Kpi label={L('Procurations', 'Proxies')} value={String(qi.proxiesN)} />
          </div>
          <div class="row-between mb-8"><Ref c="4" /><div class="row"><Btn size="sm" icon="download" onClick={exportPresence}>{L('Exporter (CSV)', 'Export (CSV)')}</Btn><Btn size="sm" icon="print" onClick={() => printHtml(presenceHtml(s))}>{L('Liste de présence', 'Sign-in sheet')}</Btn></div></div>
          <div class="table-wrap"><table class="table table-compact"><thead><tr><th>{L('Membre', 'Member')}</th><th>{L('Statut', 'Status')}</th><th class="num">{L('Voix', 'Votes')}</th><th>{L('Présence', 'Attendance')}</th><th>{L('Procuration', 'Proxy')}</th></tr></thead><tbody>
            {s.members.map((m) => <tr key={m.id}><td><div class="strong">{m.name}</div><div class="xs muted">{m.title}</div></td><td class="small">{statusLabel(m.status)}</td><td class="num">{m.voting ? m.weight : '0'}</td><td>{m.present ? <Chip tone="ok">{m.mode === 'visio' ? L('Visio', 'Video') : L('Salle', 'Room')}{m.arrivedAt ? ' · ' + fmtTime(m.arrivedAt) : ''}</Chip> : <Chip tone="gray">{tx(m.absence) || L('Absent·e', 'Absent')}</Chip>}</td><td class="small">{m.proxyTo ? L('Donnée à ', 'Given to ') + memberName(s, m.proxyTo) : ''}</td></tr>)}
          </tbody></table></div>
        </TabPanel>
      )}
      {tab === 'param' && (
        <TabPanel id="param">
          <div class="grid g2">
            <Card title={L('Quorum et majorité', 'Quorum and majority')}>
              <KV items={[[L('Instance', 'Body'), il.name], [L('Quorum', 'Quorum'), il.quorum], [L('Calcul', 'Calculation'), L('Automatique, en temps réel', 'Automatic, live')], [L('Majorité par défaut', 'Default majority'), il.majority], [L('Procurations', 'Proxies'), inst.proxyMax ? L(inst.proxyMax + ' par membre au plus', 'Up to ' + inst.proxyMax + ' per member') : L('Non autorisées', 'Not allowed')]]} />
              <div class="mt-16 stack stack-s">
                <Switch checked={!!s.proxiesCountForQuorum} onChange={(v) => dispatch('s/settings', { sid, key: 'proxiesCountForQuorum', value: v })} label={L('Les procurations comptent pour le quorum', 'Proxies count towards quorum')} />
                <Switch checked={!!s.showPartial} onChange={(v) => dispatch('s/settings', { sid, key: 'showPartial', value: v })} label={L('Afficher les résultats partiels pendant le vote', 'Show partial results during the vote')} />
              </div>
            </Card>
            <Card title={L('Sécurité', 'Security')}>
              <KV items={[[L('Accès', 'Access'), L('Lien unique, PIN, identifiants, FranceConnect+, certificat, badge', 'Unique link, PIN, credentials, FranceConnect+, certificate, badge')], [L('Votes secrets', 'Secret votes'), L('Chiffrés sur le terminal, séparés de l’émargement', 'Encrypted on the device, kept apart from sign-in')], [L('Intégrité', 'Integrity'), L('Scellements successifs, journal chaîné', 'Successive seals, chained log')], [L('Archivage', 'Archiving'), L('PV signé et horodaté, 2 ans sous scellés', 'Signed, timestamped minutes, 2 years under seal')]]} />
            </Card>
          </div>
        </TabPanel>
      )}
      {tab === 'conv' && (
        <TabPanel id="conv">
          <div class="grid g2">
            <Card title={L('Liens personnels', 'Personal links')}>
              <KV items={[[L('Envoi', 'Sent'), fmtDT(dayAt(s.date, -8, 9, 0))], [L('Destinataires', 'Recipients'), L(s.members.length + ' membres', s.members.length + ' members')], [L('Lieu', 'Place'), tx(s.place)], [L('Visioconférence', 'Video'), s.visio ? s.visio + L(' (lien partagé, sans installation)', ' (shared link, no install)') : L('Présentiel', 'In person')], [L('Validité', 'Valid for'), L('Usage unique, cette séance', 'Single use, this meeting')]]} />
              <div class="mt-12"><Btn size="sm" icon="send" onClick={() => toast(L('Liens renvoyés aux non-ouvreurs', 'Links resent to unopened invites'), 'ok')}>{L('Renvoyer les liens', 'Resend links')}</Btn></div>
            </Card>
            <Card title={L('Accès en salle', 'Room access')}>
              <div class="row" style={{ alignItems: 'center' }}><div class="qr-box"><QrSvg text={partUrl(s)} size={120} /></div><div><div class="xs muted">{L('Code PIN', 'PIN')}</div><div class="code-big">{pinFmt(s.pin)}</div></div></div>
              <div class="mt-12"><CopyField value={partUrl(s)} label={L('Lien participant', 'Participant link')} /></div>
            </Card>
          </div>
        </TabPanel>
      )}
      {doc && <DocViewer id={doc} onClose={() => setDoc(null)} />}
      {add && <AddItem s={s} onClose={() => setAdd(false)} />}
    </>
  );
}

// Un point de l'ordre du jour : résumé sur une ligne, paramètres du vote en dépliant
function PrepItem({ s, it, onDoc }) {
  const v = it.vote;
  const head = (
    <>
      <span class="tag-num">{it.num}</span>
      <span class="grow" style={{ minWidth: 0 }}>
        <span class="row" style={{ gap: '8px' }}>{it.tag && <Chip tone="gray">{tagL(it.tag)}</Chip>}<span class="strong">{it.title}</span></span>
        <span class="xs muted" style={{ display: 'block', fontWeight: 400 }}>{v ? voteTypeShort(it) : it.kind === 'group' ? L('Plusieurs votes successifs', 'Several successive votes') : L('Information, sans vote', 'Information, no vote')}</span>
      </span>
      {s.done[it.id] && <Icon name="checkCircle" size={18} style={{ color: 'var(--green)', flex: 'none' }} label={L('Traité', 'Done')} />}
    </>
  );
  const docs = (it.docs || []).length > 0 && <div class="row" style={{ gap: '6px' }}>{it.docs.map((dd) => <button key={dd} class="btn btn-xs" onClick={() => onDoc(dd)}><Icon name="file" size={13} />{docKind(DOCS[dd].kind)}</button>)}</div>;
  const indent = it.parent ? { marginLeft: '24px' } : undefined;
  if (!v && !docs) return <div class="acc" style={{ ...indent, display: 'flex', gap: '10px', alignItems: 'center', padding: '14px 16px', background: '#fff', borderRadius: 'var(--radius)', boxShadow: '0 0 0 1px var(--border)' }}>{head}</div>;
  const choices = v && (v.candidates || v.options) ? (v.candidates || v.options).map((c) => c.name).join(' · ') : v && v.lists ? v.lists.map((l) => l.name + ' (' + l.candidates.length + ')').join(' · ') : v && isRes(v) ? v.expr.map((e) => exprLabel(e)).join(' / ') : null;
  const rows = v ? [
    [L('Modalité', 'Method'), voteTypeLabel(it)],
    choices && [L('Choix', 'Options'), choices],
    v.questions && [L('Questions', 'Questions'), <ul style={{ margin: 0, paddingLeft: '18px' }}>{v.questions.map((qq) => <li key={qq.id}>{qq.num}. {qq.title}</li>)}</ul>],
    v.majority && [L('Majorité', 'Majority'), majorityLabel(v.majority)],
    rulesText(it) && [L('Règles', 'Rules'), cap(rulesText(it))],
    [L('Quorum', 'Quorum'), quorumLabel(it) || L('Quorum de l’instance', 'Body quorum')],
    [L('Durée', 'Duration'), v.duration + ' s'],
  ].filter(Boolean) : [];
  return (
    <details class="acc" style={indent}>
      <summary style={{ fontWeight: 400 }}>{head}</summary>
      <div class="acc-body small">
        {rows.length > 0 && <KV items={rows} />}
        {docs && <div class={rows.length ? 'mt-12' : ''}>{docs}</div>}
      </div>
    </details>
  );
}

function presenceHtml(s) {
  return `<div class="doc-meta"><span>${esc(s.title)}</span><span>${esc(fmtDateLong(s.date, 'fr'))}</span></div><h1>Liste de présence</h1><table><thead><tr><th>Membre</th><th>Statut</th><th>Présence</th><th>Arrivée</th><th>Procuration</th><th>Signature</th></tr></thead><tbody>${s.members.map((m) => `<tr><td>${esc(m.name)}</td><td>${esc(STATUS_LABELS[m.status])}</td><td>${m.present ? (m.mode === 'visio' ? 'Visioconférence' : 'Salle') : esc(m.absence || 'Absent·e')}</td><td>${m.present && m.arrivedAt ? fmtTime(m.arrivedAt, 'fr') : ''}</td><td>${m.proxyTo ? esc(memberName(s, m.proxyTo)) : ''}</td><td>${m.present ? 'Émargement électronique' : ''}</td></tr>`).join('')}</tbody></table>`;
}

function AddItem({ s, onClose }) {
  const [title, setTitle] = useState('Avis sur le règlement intérieur révisé');
  const [mode, setMode] = useState('nominatif');
  const [type, setType] = useState('resolution');
  const [majority, setMajority] = useState('simple');
  const [quorum, setQuorum] = useState('instance');
  const [nppv, setNppv] = useState(false);
  const [refus, setRefus] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [rounds, setRounds] = useState('2');
  const [seats, setSeats] = useState('4');
  const [lines, setLines] = useState('');
  const presets = { resolution: '', uninominal: 'Mme Valérie Dupuis\nM. Olivier Garcia\nDr Lucie Gaillard', liste: 'Liste « Ensemble pour le territoire »\nListe « Proximité et qualité »', multi: 'Approbation de la convention A\nApprobation de la convention B\nApprobation de la convention C', sondage: 'Option A\nOption B' };
  const pickType = (t1) => { setType(t1); setLines(presets[t1]); if (t1 === 'uninominal' || t1 === 'liste') setMode('secret'); };
  const save = () => {
    const n = s.agenda.length + 1;
    const id = 'x' + randHex(4);
    const names = lines.split('\n').map((x) => x.trim()).filter(Boolean);
    const expr = ['pour', 'contre', 'abstention', ...(nppv ? ['nppv'] : []), ...(refus && mode !== 'secret' ? ['refus'] : [])];
    const even = (ids, extra = {}) => { const o = {}; ids.forEach((k, i) => { o[k] = (ids.length - i) / ((ids.length * (ids.length + 1)) / 2); }); return { ...o, ...extra }; };
    let vote;
    if (type === 'resolution') vote = { mode, type, expr, majority, quorum, blocked, abstNotCounted: true, casting: true, duration: 60, dist: { pour: 0.7, contre: 0.12, abstention: 0.1, nppv: nppv ? 0.05 : 0, refus: refus ? 0.03 : 0 } };
    else if (type === 'multi') vote = { mode, type, expr, majority, quorum, blocked, abstNotCounted: true, casting: true, duration: 90, questions: names.map((t1, i) => ({ id: 'q' + (i + 1), num: 'Q' + (i + 1), title: t1, dist: { pour: 0.75 - i * 0.12, contre: 0.15 + i * 0.1, abstention: 0.1 } })) };
    else if (type === 'uninominal') { const c = names.map((nm, i) => ({ id: 'c' + (i + 1), name: nm, spec: '', born: 1960 + i * 4 })); vote = { mode, type, rounds: +rounds, desist: +rounds > 1, majority: +rounds === 3 ? 'abs2-rel3' : +rounds === 2 ? 'absolue-relative' : 'relative', quorum, duration: 90, candidates: c, dist: even(c.map((x) => x.id), { blanc: 0.03 }) }; }
    else if (type === 'liste') { const l = names.map((nm, i) => ({ id: 'l' + (i + 1), name: nm, candidates: Array.from({ length: +seats }, (_, k) => 'Candidat·e ' + (k + 1) + ' · ' + nm.replace(/^Liste\s*/, '')) })); vote = { mode, type, seats: +seats, majority: 'proportionnelle', quorum, duration: 90, lists: l, dist: even(l.map((x) => x.id), { blanc: 0.03 }) }; }
    else vote = { mode, type: 'sondage', quorum: 'aucun', duration: 60, options: names.map((nm, i) => ({ id: 'o' + (i + 1), name: nm })), dist: even(names.map((_, i) => 'o' + (i + 1))) };
    dispatch('s/item/add', { sid: s.id, item: { id, num: String(n), title, kind: type === 'uninominal' || type === 'liste' ? 'election' : 'vote', tag: type === 'multi' ? 'Vote groupé' : undefined, vote }, by: ORG.name });
    toast(L('Point ajouté', 'Item added'), 'ok');
    onClose();
  };
  const needLines = type !== 'resolution';
  return (
    <Modal title={L('Ajouter un point à l’ordre du jour', 'Add an agenda item')} size="l" onClose={onClose} footer={<><Btn onClick={onClose}>{L('Annuler', 'Cancel')}</Btn><Btn kind="primary" icon="check" onClick={save} disabled={!title.trim() || (needLines && lines.split('\n').filter((x) => x.trim()).length < 2)}>{L('Ajouter', 'Add')}</Btn></>}>
      <div class="stack">
        <Field label={L('Libellé', 'Title')} id="ai-t"><input class="input" id="ai-t" value={title} onInput={(e) => setTitle(e.currentTarget.value)} /></Field>
        <div class="grid g2">
          <Field label={L('Nature du scrutin', 'Ballot type')} id="ai-ty"><Select id="ai-ty" value={type} onChange={pickType} options={[['resolution', L('Résolution (pour / contre / abstention)', 'Resolution (for / against / abstain)')], ['multi', L('Vote groupé (plusieurs questions)', 'Grouped vote (several questions)')], ['uninominal', L('Élection uninominale (1 à 3 tours)', 'Single-seat election (1 to 3 rounds)')], ['liste', L('Scrutin de liste à un tour', 'Single-round list vote')], ['sondage', L('Sondage non décisionnaire', 'Non-binding poll')]]} /></Field>
          <Field label={L('Type de vote', 'Voting method')} id="ai-m"><Select id="ai-m" value={mode} onChange={setMode} options={[['nominatif', L('Nominatif (main levée)', 'Named (show of hands)')], ['secret', L('À bulletin secret', 'Secret ballot')], ['pondere', L('Pondéré', 'Weighted')]]} /></Field>
          {isRes({ type }) && <Field label={L('Majorité', 'Majority')} id="ai-ma"><Select id="ai-ma" value={majority} onChange={setMajority} options={Object.keys(MAJORITY_LABELS).filter((k) => !['relative', 'absolue-relative', 'abs2-rel3', 'proportionnelle'].includes(k)).map((k) => [k, majorityLabel(k)])} /></Field>}
          {type === 'uninominal' && <Field label={L('Nombre de tours', 'Rounds')} id="ai-r"><Select id="ai-r" value={rounds} onChange={setRounds} options={[['1', L('Un tour (majorité relative)', 'One round (relative majority)')], ['2', L('Deux tours (absolue puis relative)', 'Two rounds (absolute, then relative)')], ['3', L('Trois tours (absolue, absolue, relative)', 'Three rounds (absolute, absolute, relative)')]]} /></Field>}
          {type === 'liste' && <Field label={L('Sièges à pourvoir', 'Seats')} id="ai-s"><input class="input" id="ai-s" type="number" min="1" max="30" value={seats} onInput={(e) => setSeats(e.currentTarget.value)} /></Field>}
          <Field label={L('Quorum requis', 'Required quorum')} id="ai-q"><Select id="ai-q" value={quorum} onChange={setQuorum} options={Object.keys(QUORUM_RULES).map((k) => [k, L(QUORUM_RULES[k], QUORUM_RULES_EN[k])])} /></Field>
        </div>
        {needLines && <Field label={type === 'multi' ? L('Questions (une par ligne)', 'Questions (one per line)') : type === 'uninominal' ? L('Candidat·e·s (un·e par ligne)', 'Candidates (one per line)') : type === 'liste' ? L('Listes (une par ligne)', 'Lists (one per line)') : L('Options (une par ligne)', 'Options (one per line)')} id="ai-l"><textarea class="textarea" id="ai-l" rows="4" value={lines} onInput={(e) => setLines(e.currentTarget.value)} /></Field>}
        {isRes({ type }) && (
          <div class="grid g3">
            <Switch checked={nppv} onChange={setNppv} label={L('Proposer « NPPV » (conflit d’intérêts)', 'Offer “NPPV” (conflict of interest)')} />
            <Switch checked={refus} onChange={setRefus} label={L('Proposer « refus de vote »', 'Offer “refuse to vote”')} hint={L('Vote nominatif uniquement', 'Named votes only')} />
            <Switch checked={blocked} onChange={setBlocked} label={L('Vote bloqué', 'Block vote')} hint={L('Un seul vote sur le texte et les amendements retenus', 'One vote on the text and accepted amendments')} />
          </div>
        )}
        <div><Refs list={['4.2', '4']} /></div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Console de pilotage
function Console({ sid }) {
  const st = useStore();
  const now = useNow(500);
  const s = st.seance.seances[sid];
  const [sel, setSel] = useState(null);
  const [dur, setDur] = useState(null);
  const [doc, setDoc] = useState(null);
  const [r2, setR2] = useState(null);
  const [showQr, setShowQr] = useState(false);
  const [closeSeance, setCloseSeance] = useState(false);
  const [add, setAdd] = useState(false);
  const vote = s ? activeVote(st, sid) : null;
  useEffect(() => { if (vote && vote.status === 'open' && vote.tab === TAB && voteRemaining(vote, now) <= 0) { closeVote(vote); toast(L('Temps écoulé : résultat proclamé', 'Time up: result announced'), 'ok'); } }, [now]);
  if (!s) return <Empty title={L('Séance introuvable', 'Meeting not found')} />;
  document.title = 'Console · ' + s.short;
  const items = flatAgenda(s.agenda);
  const curId = vote ? vote.itemId : sel || s.current || items[0].id;
  const item = findItem(s, curId) || items[0];
  const lv = item.vote ? lastVote(st, sid, item.id) : null;
  const q = quorumInfo(s);
  const qv = quorumFor(s, item);
  const exp = expectedBallots(s);
  const R = item.vote ? item.vote.rounds || 1 : 1;
  const nextItem = () => { const i = items.findIndex((x) => x.id === item.id); const n = items.slice(i + 1).find((x) => x.kind !== 'group'); if (n) { setSel(n.id); dispatch('s/current', { sid, itemId: n.id }); if (item.kind === 'info' && !s.done[item.id]) dispatch('s/item/done', { sid, itemId: item.id }); } };
  const launch = (round = 1, withdrawn = []) => openVote(s, item, round, { duration: dur || item.vote.duration, withdrawn });
  const key = vote ? voteKey(vote.sid, vote.itemId, vote.round) : null;
  const arrived = vote ? arrivedBallots(vote, now) : [];
  const votedMembers = new Set(arrived.map((b) => b.key));
  const notVoted = vote && item.vote && item.vote.mode !== 'secret' ? exp.filter((b) => !votedMembers.has(b.key)) : [];
  const remaining = vote ? voteRemaining(vote, now) : 0;
  const partial = vote && s.showPartial ? tally(s, item, vote, now) : null;
  const doneN = items.filter((x) => s.done[x.id]).length;
  const wide = typeof window !== 'undefined' && window.innerWidth > 900;
  const proxiesN = exp.filter((b) => b.proxyFor).length;
  const presentN = s.members.filter((m) => m.present).length;
  const lbl = { fontSize: '.8rem', color: 'var(--text-2)', marginBottom: '6px' };
  const stat = (label, value, subline) => <div><div style={lbl}>{label}</div><div class="strong" style={{ fontSize: '1.05rem' }}>{value}</div>{subline && <div class="xs muted">{subline}</div>}</div>;
  return (
    <>
      <div class="row-between mb-16" style={{ alignItems: 'flex-end' }}>
        <div style={{ minWidth: 0 }}>
          <nav class="crumbs" aria-label={L('Fil d’Ariane', 'Breadcrumb')}><a href={href('/seance/organisateur/seances')}>{L('Mes séances', 'My meetings')}</a> / <a href={href('/seance/organisateur/s/' + sid)}>{tx(s.short)}</a> / Console</nav>
          <div class="row" style={{ gap: '10px' }}><h1 style={{ fontSize: '1.45rem', margin: 0 }}>{s.title}</h1>{statusChip(s.status)}</div>
        </div>
        <div class="row" style={{ gap: '4px' }}>
          <Btn size="sm" kind="ghost" icon="tv" href={'/seance/projection/' + sid} target="_blank" rel="noopener">{L('Projeter', 'Project')}</Btn>
          <Btn size="sm" kind="ghost" icon="qr" onClick={() => setShowQr(true)}>QR / PIN</Btn>
          <Btn size="sm" kind="ghost" icon="external" href="/seance/participant" target="_blank" rel="noopener">{L('Ouvrir un participant', 'Open participant view')}</Btn>
          {s.status === 'live' && <Btn size="sm" kind="danger" onClick={() => setCloseSeance(true)}>{L('Clore la séance', 'End meeting')}</Btn>}
        </div>
      </div>
      {s.status === 'planned' && <div class="mb-12"><Note tone="warn" icon="calendar">{L('Séance prévue le ', 'Scheduled for ') + fmtDT(s.date)}. <button class="linklike" onClick={() => dispatch('s/seance/open', { sid, by: ORG.name })}>{L('Ouvrir la séance (démo)', 'Open the meeting (demo)')}</button></Note></div>}
      {s.status === 'closed' && <div class="mb-12"><Note icon="archive">{L('Séance clôturée le ', 'Meeting closed on ') + fmtDT(s.closedAt || s.date)}. <a href={href('/seance/organisateur/s/' + sid + '/pv')}>{L('Voir le procès-verbal', 'View minutes')}</a></Note></div>}
      {!q.ok && s.status === 'live' && (
        <div class="mb-12 err-note" role="alert" style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <Icon name="alert" size={20} /><div class="grow"><strong>{L('Quorum non atteint', 'Quorum lost')}</strong> · {L(q.counted + ' présents, ' + q.required + ' requis', q.counted + ' present, ' + q.required + ' required')}</div>
          {vote && vote.status === 'open' && <Btn size="sm" icon="pause" onClick={() => dispatch('s/vote/suspend', { key, by: ORG.name, reason: 'Rupture de quorum' })}>{L('Suspendre le vote', 'Pause vote')}</Btn>}
          <Btn size="sm" onClick={() => { dispatch('s/journal', { actor: ORG.name, role: 'Organisateur', action: 'Report du point ' + item.num + ' faute de quorum', detail: item.title, op: sid }); toast(L('Point reporté (journalisé)', 'Item postponed (logged)'), 'ok'); }}>{L('Reporter le point', 'Postpone item')}</Btn>
          <Btn size="sm" onClick={() => { dispatch('s/journal', { actor: ORG.name, role: 'Organisateur', action: 'Ajournement de la séance faute de quorum', detail: 'Nouvelle convocation à prévoir', op: sid }); toast(L('Séance ajournée (journalisée)', 'Meeting adjourned (logged)'), 'warn'); }}>{L('Ajourner la séance', 'Adjourn meeting')}</Btn>
        </div>
      )}
      <div class="console">
        <section class="card card-tight" aria-labelledby="c-odj" style={wide ? { gridRow: 'span 2', position: 'sticky', top: 'calc(var(--demo-bar-h) + 66px)', maxHeight: 'calc(100vh - var(--demo-bar-h) - 82px)', overflowY: 'auto' } : { order: 1 }}>
          <div class="row-between mb-8" style={{ flexWrap: 'nowrap' }}>
            <h2 id="c-odj" style={{ fontSize: '1rem', margin: 0 }}>{L('Ordre du jour', 'Agenda')}</h2>
            <div class="row" style={{ gap: '6px', flexWrap: 'nowrap' }}><span class="xs muted nowrap">{doneN}/{items.length}</span><button class="btn btn-xs btn-ghost" onClick={() => setAdd(true)} aria-label={L('Ajouter un point', 'Add item')} title={L('Ajouter un point', 'Add item')}><Icon name="plus" size={14} /></button></div>
          </div>
          <Progress value={doneN / items.length} thin label={L('Avancement de l’ordre du jour', 'Agenda progress')} />
          <ul class="agenda mt-8">
            {items.map((it) => {
              const l = it.vote ? lastVote(st, sid, it.id) : null;
              const isCur = it.id === item.id;
              return (
                <li key={it.id} class={it.parent ? 'ag-sub' : ''}>
                  <button class="ag-item" aria-current={isCur ? 'true' : 'false'} disabled={!!vote && !isCur} onClick={() => { setSel(it.id); dispatch('s/current', { sid, itemId: it.id }); }} title={it.title}>
                    <span class="ag-num">{it.num}</span>
                    <span class="grow" style={{ minWidth: 0, display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{it.title}</span>
                    <span class="ag-st">{vote && vote.itemId === it.id ? <span class="dot dot-err" title={L('Vote en cours', 'Voting')} /> : l && l.status === 'closed' ? (l.result && l.result.secondRound ? <Icon name="route" size={14} /> : <Icon name="check" size={14} />) : s.done[it.id] ? <Icon name="check" size={14} /> : null}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section class="stack" aria-labelledby="c-item">
          <div class="card" style={{ padding: '24px' }}>
            <div class="row-between row-top">
              <div class="grow" style={{ minWidth: 0 }}>
                <div class="row" style={{ gap: '8px' }}><span class="tag-num">{item.num}</span>{item.tag && <span class="small muted">{tagL(item.tag)}</span>}{vote && <Chip tone="live">{vote.status === 'suspended' ? L('Suspendu', 'Paused') : L('Vote en cours', 'Voting')}</Chip>}</div>
                <h2 id="c-item" class="mt-8" style={{ fontSize: '1.4rem', letterSpacing: '-.01em' }}>{item.title}</h2>
                {item.vote && <div class="small muted">{voteTypeShort(item)}{vote && R > 1 ? ' · ' + roundLabel(vote.round, R) : ''} <Tip>{voteTypeLabel(item)}.{item.vote.majority ? ' ' + majorityLabel(item.vote.majority) + '.' : ''}{rulesText(item) ? ' ' + cap(rulesText(item)) + '.' : ''}</Tip></div>}
              </div>
              {(item.docs || []).length > 0 && <div class="row" style={{ gap: '6px' }}>{item.docs.map((d) => <button key={d} class="btn btn-xs" onClick={() => setDoc(d)}><Icon name="file" size={13} />{docKind(DOCS[d].kind)}</button>)}</div>}
            </div>

            {item.kind === 'info' && !vote && (
              <div class="mt-24 row-between"><span class="muted">{L('Point d’information, sans vote.', 'Information item, no vote.')}</span><Btn kind="primary" size="lg" iconRight="arrowRight" onClick={nextItem}>{L('Point suivant', 'Next item')}</Btn></div>
            )}
            {item.kind === 'group' && !vote && <p class="muted mt-16 mb-0">{L('Choisissez un sous-point dans l’ordre du jour.', 'Pick a sub-item in the agenda.')}</p>}

            {item.vote && !vote && (!lv || lv.status !== 'closed') && s.status !== 'live' && <p class="muted mt-16 mb-0">{s.status === 'planned' ? L('Ouvrez la séance pour lancer ce vote.', 'Open the meeting to start this vote.') : L('Point non soumis au vote.', 'Not put to the vote.')}</p>}
            {item.vote && !vote && (!lv || lv.status !== 'closed') && s.status === 'live' && (
              <div class="mt-24 stack">
                <div class="grid g3">
                  {stat(L('Votants attendus', 'Expected voters'), fmtNum(exp.length) + (s.weighted ? ' · ' + fmtNum(exp.reduce((a, b) => a + b.weight, 0)) + L(' voix', ' votes') : ''), proxiesN ? L('dont ' + proxiesN + ' procuration' + (proxiesN > 1 ? 's' : ''), 'incl. ' + proxiesN + ' prox' + (proxiesN > 1 ? 'ies' : 'y')) : null)}
                  {stat(L('Choix', 'Options'), optionsText(item))}
                  <div><label for="c-dur" style={{ ...lbl, display: 'block' }}>{L('Durée', 'Duration')}</label><Select id="c-dur" style={{ minHeight: '38px', padding: '6px 12px', width: 'auto', minWidth: '120px' }} value={String(dur || item.vote.duration)} onChange={(v) => setDur(+v)} options={[['30', '30 s'], ['60', '1 min'], ['90', L('1 min 30', '1 min 30 s')], ['120', '2 min'], ['300', '5 min']]} /></div>
                </div>
                <div class={'quorum-line ' + (qv.ok ? 'ok' : 'ko')}><Icon name={qv.ok ? 'checkCircle' : 'alert'} size={16} /><span><strong>{qv.ok ? L('Quorum atteint', 'Quorum met') : L('Quorum non atteint', 'Quorum not met')}</strong> {qv.counted} / {qv.required} · {qv.rule === 'instance' ? L('règle de l’instance', 'body rule') : qv.label.toLowerCase()}</span><Ref c="4.2" /></div>
                <div class="row"><Btn kind="primary" size="lg" icon="play" disabled={!qv.ok} onClick={() => launch(1)}>{L('Ouvrir le vote', 'Open the vote')}</Btn></div>
              </div>
            )}

            {vote && (
              <div class="mt-24 stack">
                <div class="grid g3" aria-live="polite">
                  <div><div style={lbl}>{L('Votes reçus', 'Votes in')}</div><div class="counter-big">{fmtNum(arrived.length)}<span style={{ fontSize: '.45em', color: 'var(--text-2)', letterSpacing: 0 }}> / {fmtNum(vote.expected)}</span></div></div>
                  <div><div style={lbl}>{vote.status === 'suspended' ? L('Vote suspendu', 'Vote paused') : L('Temps restant', 'Time left')}{R > 1 ? ' · ' + roundLabel(vote.round, R) : ''}</div><div class="counter-big timer" style={{ color: remaining < 10000 && vote.status === 'open' ? 'var(--red)' : undefined }}>{fmtMMSS(remaining)}</div></div>
                  <div><div style={lbl}>{L('Connectés', 'Connected')}</div><div class="counter-big">{fmtNum(presentN)}</div><div class="small" style={{ marginTop: '6px', color: q.ok ? 'var(--green)' : 'var(--red)' }}>{L('Quorum ', 'Quorum ')}{q.counted} / {q.required}</div></div>
                </div>
                <Progress value={arrived.length / Math.max(1, vote.expected)} thick label={L('Progression des votes', 'Voting progress')} />
                <div class="row-between">
                  <div class="row" style={{ gap: '8px' }}>
                    {vote.status === 'open'
                      ? <Btn kind="primary" size="lg" icon="stop" onClick={() => { closeVote(vote); toast(L('Résultat proclamé', 'Result announced'), 'ok'); }}>{L('Clôturer et proclamer', 'Close and announce')}</Btn>
                      : <Btn kind="primary" size="lg" icon="play" onClick={() => dispatch('s/vote/resume', { key, by: ORG.name })}>{L('Reprendre', 'Resume')}</Btn>}
                    {vote.status === 'open'
                      ? <Btn icon="pause" onClick={() => dispatch('s/vote/suspend', { key, by: ORG.name })}>{L('Suspendre', 'Pause')}</Btn>
                      : <Btn icon="stop" onClick={() => { closeVote(vote); toast(L('Résultat proclamé', 'Result announced'), 'ok'); }}>{L('Clôturer et proclamer', 'Close and announce')}</Btn>}
                    <Btn icon="plus" onClick={() => dispatch('s/vote/extend', { key, secs: 30, by: ORG.name })}>30 s</Btn>
                    <Btn icon="bell" disabled={!notVoted.length} onClick={() => toast(L('Relance envoyée à ' + notVoted.length + ' membres', 'Reminder sent to ' + notVoted.length + ' members'), 'ok')}>{L('Relancer', 'Remind')}</Btn>
                  </div>
                  <Btn kind="ghost" onClick={() => { dispatch('s/vote/cancel', { key, by: ORG.name, reason: 'Annulé par l’organisateur' }); toast(L('Vote annulé', 'Vote cancelled'), 'warn'); }}>{L('Annuler le vote', 'Cancel vote')}</Btn>
                </div>
                {partial
                  ? <Card tight title={L('Résultats partiels', 'Partial results')}>{item.vote.type === 'multi' ? item.vote.questions.map((qq) => <div key={qq.id} class="small mb-8"><strong>{qq.num}</strong> · {Object.entries(partial.counts[qq.id] || {}).map(([k, n]) => optionLabel(item, k) + ' ' + n).join(' · ')}</div>) : Object.entries(partial.counts).map(([k, n]) => <BarRow key={k} label={optionLabel(item, k)} value={n} max={Math.max(1, arrived.length)} right={fmtNum(n)} />)}</Card>
                  : <p class="xs muted mb-0"><Icon name="lock" size={13} style={{ verticalAlign: '-2px' }} /> {item.vote.mode === 'secret' ? L('Vote secret : résultats et non-votants masqués jusqu’à la clôture.', 'Secret ballot: results and non-voters hidden until closing.') : L('Résultats masqués jusqu’à la clôture.', 'Results hidden until closing.')} <Ref c="4" /></p>}
                {notVoted.length > 0 && (
                  <details class="acc"><summary>{L(notVoted.length + (notVoted.length > 1 ? ' membres n’ont' : ' membre n’a') + ' pas encore voté', notVoted.length + (notVoted.length > 1 ? ' members have' : ' member has') + ' not voted yet')}</summary><div class="acc-body small">{notVoted.slice(0, 40).map((b) => memberName(s, b.memberId) + (b.proxyFor ? L(' (procuration de ', ' (proxy for ') + memberName(s, b.proxyFor) + ')' : '')).join(' · ')}</div></details>
                )}
              </div>
            )}

            {item.vote && !vote && lv && lv.status === 'closed' && (
              <div class="mt-24 stack">
                <ResultView item={item} vote={lv} />
                <div class="row-between">
                  <div class="row" style={{ gap: '8px' }}>
                    {lv.result.nextRound ? <Btn kind="primary" size="lg" icon="route" onClick={() => setR2(item)}>{L('Organiser le ' + ordinalFr(lv.result.nextRound, R) + ' tour', 'Set up the ' + ordinalEn(lv.result.nextRound) + ' round')}</Btn> : <Btn kind="primary" size="lg" iconRight="arrowRight" onClick={nextItem}>{L('Point suivant', 'Next item')}</Btn>}
                    <Btn icon="tv" href={'/seance/projection/' + sid} target="_blank" rel="noopener">{L('Projeter', 'Project')}</Btn>
                    <Btn icon="print" onClick={() => printHtml(pvVoteHtml(s, item, lv))}>{L('PV du scrutin', 'Vote minutes')}</Btn>
                  </div>
                  <Btn kind="ghost" icon="refresh" onClick={() => launch(lv.round, lv.withdrawn || [])}>{L('Relancer le vote', 'Restart vote')}</Btn>
                </div>
                {item.vote.mode !== 'secret' && lv.final.ballots && lv.final.ballots.length > 0 && (
                  <details class="acc"><summary>{L('Votes nominatifs', 'Named votes')} ({lv.final.ballots.length})</summary><div class="acc-body"><div class="table-wrap scroll-box"><table class="table table-compact"><thead><tr><th>{L('Membre', 'Member')}</th><th>{L('Choix', 'Choice')}</th><th>{L('Heure', 'Time')}</th></tr></thead><tbody>{lv.final.ballots.slice().sort((a, b) => memberName(s, a.memberId).localeCompare(memberName(s, b.memberId))).map((b, i) => <tr key={i}><td>{memberName(s, b.memberId)}{b.proxyFor && <span class="xs muted"> · {L('pour ', 'for ')}{memberName(s, b.proxyFor)}</span>}</td><td>{choiceLabel(item, b.choice)}</td><td class="nowrap">{fmtTimeS(b.at)}</td></tr>)}</tbody></table></div></div></details>
                )}
                {item.vote.mode === 'secret' && <p class="xs muted mb-0">{L('Vue anonymisée : ' + lv.final.votants + ' votants émargés, aucun lien identité / bulletin.', 'Anonymised: ' + lv.final.votants + ' voters signed in, no link between identity and ballot.')}</p>}
                {(lv.final.participants || []).length > 0 && (
                  <details class="acc"><summary>{L('Émargements horodatés', 'Timestamped sign-ins')} ({lv.final.participants.length})</summary><div class="acc-body"><div class="table-wrap scroll-box"><table class="table table-compact"><thead><tr><th>{L('Membre', 'Member')}</th><th>{L('Heure', 'Time')}</th></tr></thead><tbody>{lv.final.participants.slice().sort((a, b) => a.at - b.at).map((p1, i) => <tr key={i}><td>{memberName(s, p1.memberId)}{p1.proxyFor && <span class="xs muted"> · {L('procuration de ', 'proxy for ')}{memberName(s, p1.proxyFor)}</span>}</td><td class="nowrap">{fmtTimeS(p1.at)}</td></tr>)}</tbody></table></div></div></details>
                )}
              </div>
            )}
          </div>
          <DemoNote>{L('Ouvrez un participant dans un autre onglet : votes et présence se synchronisent en direct.', 'Open a participant view in another tab: votes and attendance sync live.')}</DemoNote>
        </section>

        <PresencePanel s={s} q={q} narrow={!wide} />
      </div>
      {doc && <DocViewer id={doc} onClose={() => setDoc(null)} />}
      {add && <AddItem s={s} onClose={() => setAdd(false)} />}
      {r2 && <NextRound item={r2} lv={lastVote(st, sid, r2.id)} onClose={() => setR2(null)} onGo={(withdrawn) => { const prev = lastVote(st, sid, r2.id); setR2(null); openVote(s, r2, prev.result.nextRound, { duration: dur || r2.vote.duration, withdrawn: [...(prev.withdrawn || []), ...withdrawn] }); }} />}
      {showQr && <Modal title={L('Accès participant', 'Participant access')} onClose={() => setShowQr(false)} size="s"><div class="center"><div class="qr-box"><QrSvg text={partUrl(s)} size={200} /></div><div class="xs muted mt-12">{L('Code PIN', 'PIN')}</div><div class="code-big">{pinFmt(s.pin)}</div></div><div class="mt-16"><CopyField value={partUrl(s)} label={L('Lien partagé', 'Shared link')} /></div></Modal>}
      {closeSeance && <Modal title={L('Clore la séance ?', 'End the meeting?')} size="s" onClose={() => setCloseSeance(false)} footer={<><Btn onClick={() => setCloseSeance(false)}>{L('Annuler', 'Cancel')}</Btn><Btn kind="primary" icon="stop" onClick={() => { if (vote) closeVote(vote); dispatch('s/seance/close', { sid, by: ORG.name }); setCloseSeance(false); go('/seance/organisateur/s/' + sid + '/pv'); }}>{L('Clore et générer le PV', 'End and generate minutes')}</Btn></>}><p class="mb-0">{L('Le procès-verbal de séance et de chaque scrutin est généré automatiquement.', 'Minutes for the meeting and for each vote are generated automatically.')}</p></Modal>}
    </>
  );
}

function NextRound({ item, lv, onClose, onGo }) {
  const ranked = lv.result.ranked;
  const R = item.vote.rounds || 2;
  const next = lv.result.nextRound;
  const [w, setW] = useState(ranked.length > 2 ? [ranked[ranked.length - 1].id] : []);
  const last = next === R;
  return (
    <Modal title={roundLabel(next, R) + ' · ' + item.title} icon="route" onClose={onClose} footer={<><Btn onClick={onClose}>{L('Annuler', 'Cancel')}</Btn><Btn kind="primary" icon="play" onClick={() => onGo(w)} disabled={ranked.length - w.length < 1}>{L('Ouvrir le ' + ordinalFr(next, R) + ' tour', 'Open the ' + ordinalEn(next) + ' round')}</Btn></>}>
      <p class="small">{L('Aucune majorité absolue. ' + (last ? 'Ce tour se joue à la majorité relative' + (R === 3 ? ' (égalité : le plus âgé est élu)' : '') + '.' : 'La majorité absolue reste requise.') + ' Cochez les désistements.', 'No absolute majority. ' + (last ? 'This round is decided by relative majority' + (R === 3 ? ' (tie: the oldest wins)' : '') + '.' : 'An absolute majority is still required.') + ' Tick any withdrawals.')}</p>
      <div class="stack stack-s">
        {ranked.map((c) => <label key={c.id} class={'holder ' + (w.includes(c.id) ? '' : 'on')} style={{ cursor: 'pointer' }}><input type="checkbox" checked={w.includes(c.id)} onChange={(e) => setW(e.currentTarget.checked ? [...w, c.id] : w.filter((x) => x !== c.id))} style={{ width: '20px', height: '20px' }} /><div class="grow"><div class="strong">{c.name}</div><div class="xs muted">{L(c.votes + ' voix au ' + ordinalFr(lv.round, R) + ' tour', c.votes + ' votes in round ' + lv.round)}</div></div>{w.includes(c.id) ? <Chip tone="gray">{L('Se désiste', 'Withdraws')}</Chip> : <Chip tone="ok">{L('Maintenu·e', 'Stays in')}</Chip>}</label>)}
      </div>
      <div class="mt-12"><Refs list={['4', '4.2']} /></div>
    </Modal>
  );
}

function PresencePanel({ s, q, narrow }) {
  const [filter, setFilter] = useState('all');
  const voting = s.members.filter((m) => m.voting);
  const present = voting.filter((m) => m.present && m.id !== 'lmercier' && !m.persona);
  const list = s.members.filter((m) => filter === 'all' || (filter === 'present' ? m.present : filter === 'absent' ? !m.present : !m.voting));
  return (
    <section class="c-right stack" aria-labelledby="c-pres" style={narrow ? { order: 2 } : undefined}>
      <div class="card card-tight">
        <div class="row-between">
          <h2 id="c-pres" style={{ fontSize: '1rem', margin: 0 }}>{L('Présence', 'Attendance')} <Tip>{L('Émargement horodaté à l’arrivée et à chaque vote ; le quorum est recalculé en direct.', 'Timestamped sign-in on arrival and at each vote; quorum is recalculated live.')}</Tip> <Ref c="4" /></h2>
          <Chip tone={q.ok ? 'ok' : 'err'}>{q.ok ? L('Quorum atteint', 'Quorum met') : L('Quorum non atteint', 'No quorum')}</Chip>
        </div>
        <div class="mt-12"><BarRow label={s.weighted ? L('Voix présentes', 'Votes present') : L('Présents', 'Present')} value={q.counted} max={q.total} right={L(q.counted + ' / ' + q.required + ' requis', q.counted + ' / ' + q.required + ' required')} color={q.ok ? 'var(--green-dot)' : 'var(--red)'} /></div>
        <div class="grid mt-12 small center" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}><div><div class="strong">{q.salle}</div><div class="xs muted">{L('en salle', 'in room')}</div></div><div><div class="strong">{q.visio}</div><div class="xs muted">{L('en visio', 'on video')}</div></div><div><div class="strong">{q.proxiesN}</div><div class="xs muted">{L('procurations', 'proxies')}</div></div></div>
        <div class="row mt-12" style={{ gap: '6px' }}>
          <Btn size="xs" icon="logout" disabled={present.length < 20} onClick={() => { dispatch('s/presence/bulk', { sid: s.id, ids: present.slice(0, 20).map((m) => m.id), present: false, by: ORG.name }); toast(L('20 départs : quorum recalculé', '20 left: quorum updated'), 'warn'); }}>{L('Simuler 20 départs', 'Simulate 20 departures')}</Btn>
          <Btn size="xs" icon="login" onClick={() => { const back = s.members.filter((m) => m.voting && !m.present && m.leftAt && !m.persona); dispatch('s/presence/bulk', { sid: s.id, ids: back.map((m) => m.id), present: true, by: ORG.name }); }}>{L('Retour des membres', 'Members return')}</Btn>
        </div>
      </div>
      <div class="card card-tight">
        <div class="seg mb-8" role="group" aria-label={L('Filtrer les membres', 'Filter members')}>{[['all', L('Tous', 'All')], ['present', L('Présents', 'Present')], ['absent', L('Absents', 'Absent')], ['inv', L('Sans voix', 'Non-voting')]].map(([k, l]) => <button key={k} aria-pressed={filter === k ? 'true' : 'false'} onClick={() => setFilter(k)}>{l}</button>)}</div>
        <div class="scroll-box" style={{ maxHeight: '460px' }}>
          {list.map((m) => (
            <div class="member-row" key={m.id}>
              <span class={'dot ' + (m.present ? 'dot-ok' : 'dot-err')} aria-hidden="true" />
              <div class="grow" style={{ minWidth: 0 }}>
                <div class="small strong ellipsis">{m.name}{m.persona && L(' (démo)', ' (demo)')}{m.president && L(' · président', ' · chair')}</div>
                <div class="xs muted ellipsis">{statusLabel(m.status)}{m.weight > 1 ? ' · ' + m.weight + L(' voix', ' votes') : ''}{m.present ? ' · ' + (m.mode === 'visio' ? L('visio', 'video') : L('salle', 'room')) + (m.arrivedAt ? ' ' + fmtTime(m.arrivedAt) : '') : m.proxyTo ? L(' · procuration à ', ' · proxy to ') + memberName(s, m.proxyTo) : m.absence ? ' · ' + tx(m.absence).toLowerCase() : ''}</div>
              </div>
              {m.voting && !m.persona && <button class="btn btn-xs" onClick={() => dispatch('s/presence', { sid: s.id, memberId: m.id, present: !m.present, mode: m.mode })} aria-label={(m.present ? L('Enregistrer le départ de ', 'Record departure of ') : L('Enregistrer l’arrivée de ', 'Record arrival of ')) + m.name}>{m.present ? L('Départ', 'Leave') : L('Arrivée', 'Arrive')}</button>}
            </div>
          ))}
        </div>
      </div>
      {(s.log || []).length > 0 && (
        <div class="card card-tight"><h3 style={{ fontSize: '.95rem' }}>{L('Arrivées et départs', 'Arrivals and departures')}</h3>{s.log.slice(0, 6).map((l, i) => <div class="xs member-row" key={i}><Icon name={l.kind === 'arrivée' ? 'login' : 'logout'} size={14} /><span class="grow">{l.name} · {l.kind === 'arrivée' ? L('arrivée', 'arrived') : L('départ', 'left')}</span><span class="muted">{fmtTimeS(l.at)}</span></div>)}</div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ Procès-verbal
function PvPage({ sid }) {
  const st = useStore();
  const s = st.seance.seances[sid];
  const [busy, setBusy] = useState(null);
  if (!s) return <Empty title={L('Séance introuvable', 'Meeting not found')} />;
  const pv = st.seance.pv[sid] || {};
  const html = pvSeanceHtml(st, s);
  const seal = () => {
    setBusy('seal');
    setTimeout(() => { const hash = sha256(html); dispatch('s/pv/seal', { sid, hash, token: 'TSA-' + randCode(2, 5), by: ORG.name }); setBusy(null); toast(L('PV scellé et horodaté', 'Minutes sealed and timestamped'), 'ok'); }, 1200);
  };
  const transmit = (target, label) => {
    setBusy(target);
    setTimeout(() => { dispatch('s/pv/transmit', { sid, target, ack: 'ACK-' + randCode(2, 4), by: ORG.name }); setBusy(null); toast(L('Transmis : ', 'Sent: ') + label, 'ok'); }, 1000);
  };
  const sealedAt = pv.sealedAt || s.pvSealedAt;
  const closedVotes = Object.values(st.seance.votes).filter((v) => v.sid === sid && v.status === 'closed').sort((a, b) => a.closedAt - b.closedAt);
  // Scellements successifs : avant (ordre du jour et membres), pendant (après chaque scrutin), après (procès-verbal)
  const seals = [
    s.openedAt && { at: s.openedAt, label: L('Ouverture : ordre du jour, membres et paramètres', 'Opening: agenda, members and settings'), hash: sha256('open-' + sid + JSON.stringify(s.agenda.map((x) => x.id)) + s.members.length) },
    ...closedVotes.map((v) => { const it = findItem(s, v.itemId); return { at: v.closedAt, label: L('Scrutin du point ', 'Vote on item ') + it.num + (v.round > 1 ? ' (' + roundLabel(v.round, it.vote.rounds || 1).toLowerCase() + ')' : ''), hash: sha256('vote-' + sid + v.itemId + v.round + JSON.stringify(v.result)) }; }),
    sealedAt && { at: sealedAt, label: L('Procès-verbal scellé et horodaté', 'Minutes sealed and timestamped'), hash: pv.hash || sha256('pv-' + sid) },
  ].filter(Boolean);
  return (
    <>
      <PageHead crumbs={[[L('Mes séances', 'My meetings'), '/seance/organisateur/seances'], [tx(s.short), '/seance/organisateur/s/' + sid], [L('Procès-verbal', 'Minutes')]]} title={L('Procès-verbal', 'Minutes')} refs={['4.2', '7.3.4']} actions={<>
        <Btn icon="file" onClick={() => downloadDoc('pv-' + sid + '.doc', 'Procès-verbal', html)}>Word</Btn>
        <Btn icon="print" onClick={() => printHtml(html)} title={L('PDF par l’impression du navigateur (PDF/A signé dans la solution livrée)', 'PDF via browser print (signed PDF/A in the delivered product)')}>PDF</Btn>
        <Btn icon="download" onClick={() => downloadXML('pv-' + sid + '.xml', pvXml(st, s))}>XML</Btn>
        <Btn icon="download" onClick={() => downloadCSV(L('presence-', 'attendance-') + sid + '.csv', [L('Nom', 'Name'), L('Statut', 'Status'), L('Présence', 'Attendance'), L('Arrivée', 'Arrival')], s.members.map((m) => [m.name, statusLabel(m.status), m.present ? L('Présent', 'Present') : tx(m.absence) || L('Absent', 'Absent'), m.present && m.arrivedAt ? fmtTime(m.arrivedAt) : '']))}>{L('Présences (CSV)', 'Attendance (CSV)')}</Btn>
      </>} />
      <div class="grid g-side">
        <div class="doc" lang="fr" dangerouslySetInnerHTML={{ __html: html }} />
        <div class="stack">
          <Card title={L('Scellement', 'Seal')}>
            {sealedAt
              ? <><Note tone="ok" icon="seal">{L('Scellé et horodaté le ', 'Sealed and timestamped on ') + fmtDTS(sealedAt)}</Note><div class="mt-12"><KV items={[[L('Empreinte', 'Fingerprint'), <span class="fp">{shortFp(pv.hash || sha256('dir-pv'), 8)}</span>], [L('Jeton', 'Token'), <span class="mono small">{pv.token || 'TSA-ARCH-2026'}</span>], [L('Autorité', 'Authority'), L('Horodatage qualifié eIDAS (simulé)', 'Qualified eIDAS timestamp (simulated)')]]} /></div></>
              : <><p class="small muted">{L('Empreinte SHA-256 et horodatage qualifié : toute modification devient détectable.', 'SHA-256 fingerprint and qualified timestamp: any later change is detectable.')}</p><Btn kind="primary" icon="seal" disabled={busy === 'seal'} onClick={seal}>{busy === 'seal' ? L('Scellement…', 'Sealing…') : L('Sceller et horodater', 'Seal and timestamp')}</Btn></>}
          </Card>
          <Card title={L('Transmissions', 'Send to')}>
            <div class="stack stack-s">
              {TARGETS().map(([t1, label, ic]) => <Btn key={t1} block icon={ic} disabled={!!busy} onClick={() => transmit(t1, label)}>{busy === t1 ? L('Transmission…', 'Sending…') : label}</Btn>)}
            </div>
            {(pv.transmissions || []).length > 0 && <div class="mt-12">{pv.transmissions.map((x, i) => <div class="member-row xs" key={i}><Icon name="checkCircle" size={14} style={{ color: 'var(--green)' }} /><span class="grow">{targetL(x.target)}</span><span class="mono">{x.ack}</span></div>)}</div>}
          </Card>
          <Card title={L('PV par scrutin', 'Minutes per vote')}>
            {closedVotes.length ? <div class="stack stack-s">{closedVotes.map((v) => { const it = findItem(s, v.itemId); return <div key={v.itemId + v.round} class="member-row"><div class="grow small" style={{ minWidth: 0 }}><strong>{L('Point ', 'Item ') + it.num}</strong>{v.round > 1 ? ' · ' + roundLabel(v.round, it.vote.rounds || 1).toLowerCase() : ''}<div class="xs muted ellipsis">{resultText(v.result)}</div></div><Btn size="xs" icon="print" onClick={() => printHtml(pvVoteHtml(s, it, v))}>PDF</Btn><Btn size="xs" icon="file" onClick={() => downloadDoc('pv-' + sid + '-' + it.num + '-t' + v.round + '.doc', 'Procès-verbal de scrutin', pvVoteHtml(s, it, v))}>Word</Btn></div>; })}</div> : <p class="small muted mb-0">{L('Aucun scrutin clos.', 'No closed votes yet.')}</p>}
          </Card>
          <Card title={L('Scellements successifs', 'Seal history')}>
            <ul class="timeline">{seals.map((x, i) => <li key={i} class="done"><span class="tl-dot" aria-hidden="true"><Icon name="check" size={11} /></span><div class="small"><strong>{fmtTimeS(x.at)}</strong> · {x.label}</div><div class="fp">{shortFp(x.hash, 8)}</div></li>)}</ul>
            <div class="mt-8"><Refs list={['6.1.3', '6.1.4']} /></div>
          </Card>
          <Card title={L('Archivage', 'Archiving')}>
            <KV items={[[L('Contenu', 'Contents'), L('PV de séance et par scrutin, résultats, émargements, horodatages', 'Meeting and per-vote minutes, results, sign-ins, timestamps')], [L('Conservation', 'Retention'), L('Durées légales, référentiel du bénéficiaire', 'Legal periods, client’s archiving rules')], [L('Historique', 'History'), L('Téléchargeable à tout moment', 'Downloadable at any time')]]} />
            <p class="xs muted mt-8 mb-0">{L('Démo : PDF par impression du navigateur, horodatage simulé.', 'Demo: PDF via browser print, simulated timestamp.')}</p>
          </Card>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Projection
const PJ = { green: '#30D158', red: '#FF6961', blue: '#64A8FF', grey: '#8E8E93', dim: '#48484A' };
const PJ_COLORS = { pour: PJ.green, contre: PJ.red, abstention: PJ.grey, nppv: '#FFB340', refus: PJ.dim, blanc: PJ.dim };
export function Projection({ sid }) {
  const st = useStore();
  const now = useNow(500);
  const s = st.seance.seances[sid];
  if (!s) return <div class="proj"><h1>{L('Séance introuvable', 'Meeting not found')}</h1></div>;
  document.title = 'Projection · ' + s.short;
  const vote = activeVote(st, sid);
  const items = flatAgenda(s.agenda);
  const curItem = vote ? findItem(s, vote.itemId) : findItem(s, s.current) || items[0];
  const lv = curItem && curItem.vote ? lastVote(st, sid, curItem.id) : null;
  const q = quorumInfo(s);
  const arrived = vote ? arrivedBallots(vote, now).length : 0;
  const big = { fontSize: 'clamp(1.1rem, .9rem + .6vw, 1.5rem)' };
  const bar = (n, tot, color) => <div class="pj-bar mt-8"><span style={{ width: (n / Math.max(1, tot)) * 100 + '%', background: color }} /></div>;
  return (
    <div class="proj">
      <div class="pj-top">
        <div style={{ minWidth: 0 }}>
          <div class="muted">{tx(s.short)} · {fmtDateLong(s.date)}</div>
          <h1 style={{ fontSize: 'clamp(1.1rem, .9rem + .8vw, 1.6rem)', fontWeight: 600, margin: '4px 0 0' }}>{s.title}</h1>
        </div>
        <div class="row" style={{ gap: '16px', alignItems: 'center', flexWrap: 'nowrap' }}>
          <div class="pj-card" style={{ padding: '14px 20px' }}>
            <div class="muted small">Quorum</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: q.ok ? PJ.green : PJ.red }}>{q.counted} / {q.required}</div>
          </div>
          <div class="qr"><QrSvg text={partUrl(s)} size={166} /><div class="center small" style={{ color: '#1D1D1F', marginTop: '6px', fontWeight: 600, letterSpacing: '.08em' }}>PIN {pinFmt(s.pin)}</div></div>
        </div>
      </div>
      <div style={{ marginTop: '5vh' }}>
        <div class="muted" style={big}>{L('Point ', 'Item ')}{curItem.num}{vote && vote.round > 1 ? ' · ' + roundLabel(vote.round, curItem.vote.rounds || 1) : ''}</div>
        <div class="pj-q mt-8">{curItem.title}</div>
        {curItem.vote && <div class="muted mt-8" style={big}>{voteTypeShort(curItem)}</div>}
      </div>
      {vote ? (
        <div class="grid g2 mt-32" style={{ maxWidth: '1100px' }}>
          <div class="pj-card"><div class="muted" style={big}>{L('Votes reçus', 'Votes in')}</div><div class="pj-big" aria-live="polite">{arrived}<span style={{ fontSize: '40%', color: PJ.grey }}> / {vote.expected}</span></div><div class="pj-bar mt-16"><span style={{ width: (arrived / Math.max(1, vote.expected)) * 100 + '%', background: PJ.blue }} /></div></div>
          <div class="pj-card"><div class="muted" style={big}>{vote.status === 'suspended' ? L('Vote suspendu', 'Vote paused') : L('Temps restant', 'Time left')}</div><div class="pj-big timer">{fmtMMSS(voteRemaining(vote, now))}</div><div class="muted mt-16" style={big}>{L('Votez sur votre appareil. Résultats à la clôture.', 'Vote on your device. Results when voting closes.')}</div></div>
        </div>
      ) : lv && lv.status === 'closed' ? (
        <div class="pj-card mt-32" style={{ maxWidth: '1100px', padding: '32px' }}>
          <div style={{ fontSize: 'clamp(1.6rem, 1rem + 2.4vw, 3rem)', fontWeight: 600, lineHeight: 1.15, letterSpacing: '-.02em', color: lv.result.kind === 'resolution' ? (lv.result.adopted ? PJ.green : PJ.red) : '#fff' }}>{resultText(lv.result)}</div>
          <div class="stack mt-24">
            {lv.result.kind === 'resolution' ? ['pour', 'contre', 'abstention', 'nppv'].filter((k) => curItem.vote.expr.includes(k)).map((k) => { const n = lv.final.counts[k] || 0; const tot = ['pour', 'contre', 'abstention', 'nppv'].reduce((a, x) => a + (lv.final.counts[x] || 0), 0); return <div key={k}><div class="row-between" style={{ fontSize: '1.3rem', fontWeight: 600 }}><span>{exprShort(k)}</span><span>{n}</span></div>{bar(n, tot, PJ_COLORS[k])}</div>; })
              : lv.result.kind === 'multi' ? lv.result.questions.map((qq) => <div key={qq.id} class="row-between" style={{ gap: '16px', alignItems: 'flex-start', fontSize: '1.15rem' }}><span style={{ fontWeight: 600 }}>{qq.num}. {qq.title}</span><span style={{ fontWeight: 600, color: qq.adopted ? PJ.green : PJ.red, whiteSpace: 'nowrap' }}>{qq.adopted ? L('Adoptée', 'Adopted') : L('Rejetée', 'Rejected')} · {qq.pour} / {qq.contre} / {qq.abst}</span></div>)
                : lv.result.ranked.map((x, i) => <div key={x.id}><div class="row-between" style={{ fontSize: '1.2rem', fontWeight: 600 }}><span>{lv.result.kind === 'classement' ? i + 1 + '. ' : ''}{x.name}</span><span>{x.votes}{lv.result.kind === 'classement' ? ' pts' : ''}{lv.result.kind === 'liste' ? ' · ' + x.seats + L(' siège' + (x.seats > 1 ? 's' : ''), ' seat' + (x.seats > 1 ? 's' : '')) : ''}</span></div>{bar(x.votes, lv.result.ranked[0].votes, i === 0 ? PJ.blue : PJ.dim)}</div>)}
          </div>
          <div class="muted mt-24" style={big}>{L(lv.final.votants + ' votants · clos à ' + fmtTimeS(lv.closedAt), lv.final.votants + ' voters · closed at ' + fmtTimeS(lv.closedAt))}</div>
        </div>
      ) : (
        <div class="pj-card mt-32" style={{ maxWidth: '900px' }}>
          <div class="muted" style={big}>{L('En attente du prochain vote', 'Waiting for the next vote')}</div>
          <div class="mt-16">{items.filter((x) => x.kind !== 'group').slice(0, 9).map((x) => <div key={x.id} class="row" style={{ gap: '12px', padding: '5px 0', flexWrap: 'nowrap', alignItems: 'baseline', opacity: s.done[x.id] ? 0.45 : 1 }}><strong style={{ minWidth: '2.6em' }}>{x.num}</strong><span class="grow">{x.title}</span>{s.done[x.id] && <Icon name="check" size={16} />}</div>)}</div>
        </div>
      )}
    </div>
  );
}
