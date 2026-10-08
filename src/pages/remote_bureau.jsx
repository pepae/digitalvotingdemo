// Espace « organisateur » du vote à distance : bureau de vote électronique.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useStore, useNow, dispatch, getState } from '../lib/store.js';
import { go, href } from '../lib/router.js';
import { BackOffice } from '../ui/shell.jsx';
import { Btn, Chip, Card, PageHead, Kpi, BarRow, Note, DemoNote, Ref, Refs, Modal, Tabs, TabPanel, KV, Pager, CheckRow, toast, Empty, Field, Tip, More } from '../ui/kit.jsx';
import { Icon, UnionLogo } from '../ui/icons.jsx';
import { AreaChart, Ring } from '../ui/charts.jsx';
import { BackOfficeLogin, DualModal } from './bo_common.jsx';
import { BUREAU, UNIONS, SITES, ESTAB, bureauRole, bureauShort, opName } from '../data/remote.js';
import { opCounts, urnCount, participationSeries, siteSplit, urnResults, emargementPage } from '../lib/sim.js';
import { fmtDT, fmtDTS, fmtDate, fmtTime, fmtNum, fmtPct, fmtDur, relTime, dayAt } from '../lib/format.js';
import { sha256, shortFp, groupFp } from '../lib/sha256.js';
import { verifyChain } from '../lib/journal.js';
import { downloadCSV, downloadXLS, downloadDoc, downloadJSON, printHtml, esc } from '../lib/exporters.js';
import { L, tx } from '../lib/i18n.js';

const ME = { name: 'Hélène Garnier', role: 'Présidente du bureau de vote centralisateur' };
const HG = BUREAU.find((b) => b.id === 'hg');
const ORDER = { prep: 0, sealed: 1, open: 2, suspended: 2, ended: 3, closed: 4, 'sealed-after': 4, counted: 5, published: 6, archived: 7 };
const STATUS_L = { open: ['Scrutin ouvert', 'Voting open'], suspended: ['Scrutin suspendu', 'Voting suspended'], ended: ['Vote terminé', 'Voting ended'], closed: ['Scrutin clôturé', 'Voting closed'], 'sealed-after': ['Urnes scellées', 'Boxes sealed'], counted: ['Dépouillé', 'Counted'], published: ['Résultats proclamés', 'Results declared'], archived: ['Archivé', 'Archived'] };
export const opStatus = (s) => (STATUS_L[s] ? L(STATUS_L[s][0], STATUS_L[s][1]) : s);
// Compatibilité : STATUS_FR[s] renvoie le libellé dans la langue courante
export const STATUS_FR = {};
Object.keys(STATUS_L).forEach((k) => Object.defineProperty(STATUS_FR, k, { get: () => opStatus(k), enumerable: true }));
const statusTone = (s) => (s === 'open' ? 'ok' : s === 'suspended' ? 'warn' : s === 'published' || s === 'archived' ? 'sky' : 'gray');
// Libellé d'urne affiché (le collège stocké reste en français)
const uL = (u) => u.instance + ' · ' + tx(u.college);
// Libellé d'urne enregistré (journal, double signature) : toujours en français
const uFr = (u) => u.instance + ' · ' + u.college;
const initials = (n) => n.split(' ').map((w) => w[0]).join('');

function useOp() {
  const st = useStore();
  const a = st.auth.r_bureau;
  const opId = (a && a.op) || 'ep26';
  return st.remote.ops[opId];
}

export function BureauGate({ page, q }) {
  const st = useStore();
  if (!st.auth.r_bureau) {
    return <BackOfficeLogin title={L('Bureau de vote', 'Polling station')} sub={L('Vote à distance', 'Remote voting')} user={{ name: ME.name, role: bureauRole(HG) }}
      methods={[['fido', L('Clé de sécurité (FIDO2)', 'Security key (FIDO2)'), L('Recommandé', 'Recommended'), 'key'], ['cps', L('Carte CPS / e-CPS', 'CPS / e-CPS card'), null, 'shield'], ['pwd', L('Code à usage unique', 'One-time code'), L('Application d’authentification', 'Authenticator app'), 'lock']]}
      refs={['2.6', '3.3']} note={L('Connexion simulée, aucune clé requise.', 'Simulated sign-in, no key needed.')}
      onDone={(m) => { dispatch('auth/login', { key: 'r_bureau', user: { ...ME, op: q && q.op && st.remote.ops[q.op] ? q.op : 'ep26', method: m } }); dispatch('r/journal', { actor: ME.name, role: 'Présidente', action: 'Connexion à l’espace du bureau de vote', detail: m === 'fido' ? 'Clé de sécurité FIDO2' : m === 'cps' ? 'Carte CPS' : 'Code à usage unique', op: 'ep26' }); if (!page) go('/distance/bureau/tableau'); }} />;
  }
  return <BureauPages page={page || 'tableau'} q={q} />;
}

function BureauPages({ page, q }) {
  const st = useStore();
  const op = useOp();
  // Lien direct vers une opération : ?op=test26 (par exemple pour consulter des résultats déjà dépouillés)
  useEffect(() => { if (q && q.op && st.remote.ops[q.op] && st.auth.r_bureau.op !== q.op) dispatch('auth/login', { key: 'r_bureau', user: { ...st.auth.r_bureau, op: q.op } }); }, [q && q.op]);
  const newAlerts = st.remote.alerts.filter((a) => a.op === op.id && a.status === 'nouvelle').length;
  const nav = [
    { group: L('Avant', 'Before'), items: [
      { path: '/distance/bureau/donnees', label: L('Données électorales', 'Electoral data'), icon: 'database' },
      { path: '/distance/bureau/scellement', label: L('Clés et scellés', 'Keys and seals'), icon: 'key' },
    ] },
    { group: L('Pendant', 'During'), items: [
      { path: '/distance/bureau/tableau', label: L('Tableau de bord', 'Dashboard'), icon: 'chart' },
      { path: '/distance/bureau/alertes', label: L('Alertes', 'Alerts'), icon: 'bell', badge: newAlerts || null },
      { path: '/distance/bureau/emargement', label: L('Émargement', 'Voter roll'), icon: 'listCheck' },
      { path: '/distance/bureau/controles', label: L('Contrôles', 'Checks'), icon: 'shieldCheck' },
    ] },
    { group: L('Après', 'After'), items: [
      { path: '/distance/bureau/depouillement', label: L('Dépouillement', 'Count'), icon: 'unlock' },
      { path: '/distance/bureau/resultats', label: L('Résultats', 'Results'), icon: 'fileCheck' },
    ] },
    { group: L('Traçabilité', 'Audit'), items: [
      { path: '/distance/bureau/journal', label: L('Journal', 'Log'), icon: 'hash' },
      { path: '/distance/bureau/incidents', label: L('Procédures', 'Procedures'), icon: 'route' },
    ] },
  ];
  const ctx = (
    <>
      <label class="sr-only" for="op-sel">{L('Opération électorale', 'Election')}</label>
      <select id="op-sel" class="select" style={{ minHeight: '38px', width: 'auto', fontWeight: 600 }} value={op.id} onChange={(e) => dispatch('auth/login', { key: 'r_bureau', user: { ...st.auth.r_bureau, op: e.currentTarget.value } })}>
        {Object.values(st.remote.ops).map((o) => <option key={o.id} value={o.id}>{opName(o)}</option>)}
      </select>
      <Chip tone={statusTone(op.status)}>{opStatus(op.status)}</Chip>
      <Chip tone="gray">{L('Niveau ', 'Level ') + op.level}</Chip>
    </>
  );
  const P = { tableau: Dashboard, donnees: Donnees, alertes: Alertes, emargement: Emargement, controles: Controles, scellement: Scellement, depouillement: Depouillement, resultats: Resultats, journal: Journal, incidents: Incidents }[page] || Dashboard;
  return (
    <BackOffice brandSub={L('Bureau de vote', 'Polling station')} nav={nav} current={'/distance/bureau/' + page} user={{ name: ME.name, role: bureauShort(HG) }} context={ctx} onLogout={() => { dispatch('auth/logout', { key: 'r_bureau' }); go('/distance/bureau'); }}>
      <P op={op} q={q} />
    </BackOffice>
  );
}

function PhaseStrip({ op }) {
  const cur = ORDER[op.status] != null ? ORDER[op.status] : 2;
  const phases = [L('Préparation', 'Setup'), L('Scellement', 'Sealing'), L('Scrutin ouvert', 'Voting open'), L('Fin du vote', 'Voting ends'), L('Clôture', 'Closing'), L('Dépouillement', 'Count'), L('Proclamation', 'Declaration'), L('Archivage', 'Archiving')];
  return (
    <div class="phases" role="list" aria-label={L('Phases du scrutin', 'Election phases')}>
      {phases.map((l, i) => <div role="listitem" key={i} class={'phase ' + (i < cur ? 'done' : i === cur ? 'cur' : '')} aria-current={i === cur ? 'step' : undefined}>{l}{op.status === 'suspended' && i === cur && L(' (suspendu)', ' (suspended)')}</div>)}
    </div>
  );
}

// ------------------------------------------------------------------ Données électorales (avant le scrutin, CCTP 3.3)
function Donnees({ op }) {
  const st = useStore();
  const R = st.remote;
  const urns = op.urns.map((id) => R.urns[id]);
  const types = [
    [L('Uninominal', 'Single-seat'), L('Un siège, un ou plusieurs tours', 'One seat, one or more rounds')],
    [L('Plurinominal', 'Multi-seat'), L('Plusieurs sièges, panachage', 'Several seats, mixing allowed')],
    [L('Liste', 'List'), L('Plus forte moyenne ou plus fort reste', 'Highest average or largest remainder')],
    [L('Classement', 'Ranking'), L('Vote préférentiel', 'Preferential vote')],
    [L('Référendaire', 'Referendum'), L('Oui / non', 'Yes / no')],
    [L('Plusieurs tours', 'Multi-round'), L('Désistements et seuils paramétrables', 'Configurable withdrawals and thresholds')],
  ];
  return (
    <>
      <PageHead title={L('Données électorales', 'Electoral data')} refs={['3.3', '3']} />
      <div class="grid g-side">
        <div class="stack">
          <Card title={L('Paramétrage', 'Setup')}>
            <div class="table-wrap"><table class="table table-compact"><thead><tr><th>{L('Urne', 'Ballot box')}</th><th>Type</th><th class="num">{L('Tours', 'Rounds')}</th><th class="num">{L('Sièges', 'Seats')}</th><th class="num">{L('Inscrits', 'Voters')}</th><th>{L('Candidatures', 'Candidates')}</th></tr></thead><tbody>
              {urns.map((u) => <tr key={u.id}><td class="strong">{uL(u)}</td><td>{u.type === 'pluri' ? L('Plurinominal', 'Multi-seat') : L('Liste, proportionnelle', 'List, proportional')}</td><td class="num">{u.type === 'pluri' ? 2 : 1}</td><td class="num">{u.seats}</td><td class="num">{fmtNum(u.electors)}</td><td>{u.type === 'pluri' ? L(u.candidates.length + ' candidatures', u.candidates.length + ' candidates') : L(u.lists.length + ' listes', u.lists.length + ' lists')}</td></tr>)}
            </tbody></table></div>
            <div class="mt-12"><CheckRow ok title={L('Validé et scellé', 'Approved and sealed')} sub={L('Listes ', 'Lists ') + shortFp(op.seals.lists, 6) + ' · ' + L('horaires ', 'schedule ') + shortFp(op.seals.schedule, 6)} /></div>
          </Card>
          <Card title={L('Listes électorales', 'Electoral rolls')} actions={<Tip>{L('Rectifications en double signature ; liste définitive scellée à la cérémonie des clés.', 'Corrections need dual signature; the final roll is sealed at the key ceremony.')}</Tip>}>
            <div class="table-wrap"><table class="table table-compact"><thead><tr><th>Version</th><th>Date</th><th class="num">{L('Lignes', 'Rows')}</th><th>{L('Statut', 'Status')}</th><th>{L('Empreinte', 'Fingerprint')}</th></tr></thead><tbody>{R.imports.map((x) => <tr key={x.v}><td>v{x.v}</td><td class="nowrap">{fmtDT(x.at)}</td><td class="num">{fmtNum(x.rows)}</td><td>{tx(x.status)}</td><td><span class="fp">{shortFp(x.hash, 6)}</span></td></tr>)}</tbody></table></div>
          </Card>
        </div>
        <div class="stack">
          <Card title={L('Types de scrutin', 'Vote types')}>
            <KV items={types} />
          </Card>
          <Card title={L('Candidatures', 'Candidacies')}>
            <CheckRow ok title={L('Dépôt clos', 'Submissions closed')} sub={L('Professions de foi et logos', 'Manifestos and logos')} />
            <CheckRow ok title={L('Ordre tiré au sort', 'Order drawn by lot')} sub={L('Identique pour tous', 'Same for every voter')} />
            <div class="row mt-12"><Btn size="sm" icon="external" href="/distance/admin/candidatures">{L('Voir dans l’admin', 'Open in admin')}</Btn></div>
          </Card>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Tableau de bord
function Dashboard({ op }) {
  const st = useStore();
  const now = useNow(2000);
  const [dual, setDual] = useState(null);
  const [checking, setChecking] = useState(false);
  const fired = useRef(false);
  const c = opCounts(st, op.id, now);
  const hourAgo = opCounts(st, op.id, now - 3600000).ballots;
  const series = useMemo(() => participationSeries(st, op.id, now), [op.id, Math.floor(now / 10000), st.rev]);
  const alerts = st.remote.alerts.filter((a) => a.op === op.id);
  const newA = alerts.filter((a) => a.status === 'nouvelle');
  const lastCheck = st.remote.checks.find((x) => x.op === op.id);
  useEffect(() => {
    if (fired.current || op.id !== 'ep26' || op.status !== 'open') return;
    fired.current = true;
    const id = setTimeout(() => {
      const exists = getState().remote.alerts.some((a) => a.demoAuto);
      if (exists) return;
      dispatch('r/alert/add', { alert: { id: 'auto' + Date.now(), demoAuto: true, live: true, op: 'ep26', at: Date.now(), type: 'bruteforce', sev: 'haute', title: 'Attaque par dictionnaire', msg: 'Tentatives répétées depuis une même adresse sur 12 identifiants différents. Adresse bloquée automatiquement ; aucun compte compromis.', src: '203.0.113.42', status: 'nouvelle' } });
      toast(L('Nouvelle alerte : attaque bloquée', 'New alert: attack blocked'), 'warn', 6500);
    }, 20000);
    return () => clearTimeout(id);
  }, [op.id]);
  const runCheck = () => {
    setChecking(true);
    setTimeout(() => { setChecking(false); dispatch('r/check', { opId: op.id, kind: 'manual', ok: verifyChain(getState().remote.journal).ok, label: 'Contrôle déclenché par le bureau', by: ME.name }); toast(L('Contrôle terminé, tout est intègre', 'Check complete, all intact'), 'ok'); }, 1800);
  };
  const isOpen = op.status === 'open';
  const chain = verifyChain(st.remote.journal);
  return (
    <>
      <PageHead title={L('Tableau de bord', 'Dashboard')} refs={['3.3', '2-02 CNIL']} actions={<>
        <Btn icon="shieldCheck" onClick={runCheck} disabled={checking}>{checking ? L('Contrôle…', 'Checking…') : L('Lancer un contrôle', 'Run a check')}</Btn>
        {isOpen && <Btn kind="danger" icon="pause" onClick={() => setDual({ opId: op.id, kind: 'suspend', label: 'Suspension du scrutin « ' + op.name + ' »', reason: 'Procédure d’incident' })}>{L('Suspendre', 'Suspend')}</Btn>}
        {op.status === 'suspended' && <Btn kind="primary" icon="play" onClick={() => setDual({ opId: op.id, kind: 'resume', label: 'Reprise du scrutin « ' + op.name + ' »' })}>{L('Reprendre', 'Resume')}</Btn>}
      </>} />
      <div class="mb-16"><PhaseStrip op={op} /></div>
      {op.status === 'suspended' && <div class="mb-16"><Note tone="warn" icon="pause">{L('Scrutin suspendu depuis ' + fmtTime(op.suspendedAt) + '.', 'Voting suspended since ' + fmtTime(op.suspendedAt) + '.')}</Note></div>}
      <div class="grid g4 mb-16">
        <div class="kpi" style={{ flexDirection: 'row', alignItems: 'center', gap: '14px' }}><Ring value={c.voted / c.electors} size={84} stroke={9} label={L('Participation ', 'Turnout ') + fmtPct(c.voted / c.electors)} /><div style={{ minWidth: 0 }}><div class="k-label">{L('Participation', 'Turnout')}</div><div class="k-sub">{fmtNum(c.voted)} / {fmtNum(c.electors)}</div>{c.byInstance.length > 1 && <div class="k-sub">{c.byInstance.map((g) => g.instance + ' ' + fmtPct(g.voted / g.electors)).join(' · ')}</div>}</div></div>
        <Kpi label={L('Votes, dernière heure', 'Votes, last hour')} value={'+' + fmtNum(Math.max(0, c.ballots - hourAgo))} />
        <Kpi label={L('Alertes ouvertes', 'Open alerts')} value={String(newA.length)} tone={newA.length ? 'warn' : 'ok'} />
        <Kpi label={isOpen ? L('Clôture dans', 'Closes in') : L('Statut', 'Status')} value={isOpen ? <span class="timer" style={{ fontSize: '1.35rem' }}>{fmtDur(op.close - now)}</span> : opStatus(op.status)} sub={fmtDT(op.close)} />
      </div>
      <div class="grid g-side">
        <div class="stack">
          <Card title={L('Participation par urne', 'Turnout by ballot box')} actions={<><Tip>{L('Chaque urne peut être suspendue seule. Aucun résultat partiel : dépouillement après clôture, avec ' + op.threshold + ' détenteurs de clé.', 'Each box can be suspended on its own. No partial results: counting only after closing, with ' + op.threshold + ' key holders.')}</Tip><Refs list={['3.3', '2-05 CNIL']} /></>}>
            {c.per.map(({ urn, voted }) => (
              <div key={urn.id} class="urn-row">
                <div class="grow" style={{ minWidth: 0 }}><BarRow label={<span>{uL(urn)}{urn.suspendedAt && <span class="chip chip-warn" style={{ marginLeft: '6px', padding: '0 6px' }}>{L('suspendue', 'suspended')}</span>}</span>} value={voted} max={urn.electors} right={fmtPct(voted / urn.electors) + ' · ' + fmtNum(voted)} /></div>
                {isOpen && (urn.suspendedAt
                  ? <Btn size="xs" icon="play" onClick={() => setDual({ opId: op.id, kind: 'resume-urn', target: urn.id, label: 'Reprise de l’urne « ' + uFr(urn) + ' »' })} aria-label={L('Reprendre l’urne ' + uL(urn), 'Resume ballot box ' + uL(urn))}>{L('Reprendre', 'Resume')}</Btn>
                  : <Btn size="xs" kind="ghost" icon="pause" onClick={() => setDual({ opId: op.id, kind: 'suspend-urn', target: urn.id, label: 'Suspension de l’urne « ' + uFr(urn) + ' »', reason: 'Les autres urnes restent ouvertes.' })} aria-label={L('Suspendre l’urne ' + uL(urn), 'Suspend ballot box ' + uL(urn))}>{L('Suspendre', 'Suspend')}</Btn>)}
              </div>
            ))}
          </Card>
          <Card title={L('Évolution de la participation', 'Turnout over time')}>
            <AreaChart series={series} label={L('Participation cumulée', 'Cumulative turnout')} />
            <details class="mt-8"><summary class="small linklike">{L('Tableau de données', 'Data table')}</summary>
              <div class="table-wrap mt-8"><table class="table table-compact"><thead><tr><th>Date</th><th class="num">{L('Votants', 'Voters')}</th><th class="num">{L('Participation', 'Turnout')}</th></tr></thead><tbody>{series.filter((_, i) => i % 5 === 0 || i === series.length - 1).map((d) => <tr key={d.t}><td>{fmtDT(d.t)}</td><td class="num">{fmtNum(d.v)}</td><td class="num">{fmtPct(d.p)}</td></tr>)}</tbody></table></div>
            </details>
          </Card>
          <Card title={L('Participation par site', 'Turnout by site')}>
            {siteSplit(c.voted, op.id + '-all').map(({ site, n }) => <BarRow key={site.id} label={site.name} value={n} max={Math.round(c.electors * site.w)} right={fmtPct(n / Math.max(1, Math.round(c.electors * site.w))) + ' · ' + fmtNum(n)} />)}
          </Card>
        </div>
        <div class="stack">
          <Card title={L('Alertes', 'Alerts')} actions={<><Refs list={['3.1', '2-04 CNIL']} /><a class="btn btn-xs" href={href('/distance/bureau/alertes')}>{L('Toutes', 'All')}<Icon name="arrowRight" size={14} /></a></>}>
            <div aria-live="polite">
              {alerts.slice(0, 4).map((a) => <AlertRow key={a.id} a={a} compact />)}
              {!alerts.length && <Empty icon="bell" title={L('Aucune alerte', 'No alerts')} />}
            </div>
          </Card>
          <Card title={L('Intégrité', 'Integrity')}>
            <CheckRow ok title={L('Bulletins = émargements', 'Ballots = signatures')} sub={lastCheck ? L('Contrôlé ', 'Checked ') + relTime(lastCheck.at, now) : null} />
            <CheckRow ok title={L('Scellés intègres', 'Seals intact')} sub={shortFp(op.sealHash, 6)} />
            <CheckRow ok={!st.remote.tamper} title={st.remote.tamper ? L('Journal altéré', 'Log tampered') : L('Journal intègre', 'Log intact')} sub={st.remote.tamper ? L('Voir le journal', 'See the log') : L(chain.count + ' entrées', chain.count + ' entries')} />
            <CheckRow ok title={L('Secours synchronisé', 'Backup in sync')} />
          </Card>
          <Card title={L('Membres du bureau', 'Station members')}>
            {BUREAU.map((b) => <div class="member-row" key={b.id}><span class="avatar avatar-s" aria-hidden="true">{initials(b.name)}</span><div class="grow"><div class="strong">{b.name}</div><div class="xs muted">{bureauShort(b) + ' · ' + tx(b.org)}</div></div>{b.holder && <span title={L('Détient une part de clé', 'Holds a key share')} style={{ color: 'var(--text-2)', display: 'inline-flex' }}><Icon name="key" size={15} label={L('Part de clé', 'Key share')} /></span>}</div>)}
          </Card>
          <DemoNote>{L('Une alerte simulée arrive après 20 s.', 'A simulated alert arrives after 20 s.')}</DemoNote>
        </div>
      </div>
      {dual && <DualModal action={dual} me={ME.name} onClose={() => setDual(null)} signers={BUREAU} />}
    </>
  );
}

const ALERT_ICON = { bruteforce: 'lock', geo: 'globe', usurpation: 'user', reissue: 'key', dispo: 'server', integrite: 'shield' };
function AlertRow({ a, compact }) {
  const now = useNow(10000);
  const isNew = a.status === 'nouvelle';
  const tone = isNew ? (a.sev === 'haute' ? 'err' : 'warn') : 'ok';
  const ack = () => { dispatch('r/alert/ack', { id: a.id, by: ME.name, status: 'acquittée' }); toast(L('Alerte acquittée', 'Alert acknowledged'), 'ok'); };
  return (
    <div class={'check-row ' + (a.live && isNew ? 'anim-in' : '')}>
      <span class={'cr-ico ' + (isNew ? 'cr-err' : 'cr-ok')}><Icon name={ALERT_ICON[a.type] || 'alert'} size={16} /></span>
      {compact ? (
        <div class="grow" style={{ minWidth: 0 }}>
          <div class="row-between" style={{ gap: '8px', flexWrap: 'nowrap' }}><strong class="small ellipsis" style={{ minWidth: 0 }}>{tx(a.title)}</strong><span class="xs muted nowrap">{relTime(a.at, now)}</span></div>
          <div class="xs muted ellipsis" title={tx(a.msg)}>{tx(a.msg)}</div>
          {isNew && <div class="mt-8"><Btn size="xs" icon="check" onClick={ack}>{L('Acquitter', 'Acknowledge')}</Btn></div>}
        </div>
      ) : (
        <div class="grow" style={{ minWidth: 0 }}>
          <div class="row" style={{ gap: '6px' }}><strong class="small">{tx(a.title)}</strong><Chip tone={tone}>{tx(a.status)}</Chip></div>
          <div class="xs muted">{fmtDT(a.at)} · {a.src}</div>
          <div class="small mt-8">{tx(a.msg)}</div>
        </div>
      )}
      {isNew && !compact && <Btn size="xs" icon="check" onClick={ack}>{L('Acquitter', 'Acknowledge')}</Btn>}
    </div>
  );
}

// ------------------------------------------------------------------ Alertes
function Alertes({ op }) {
  const st = useStore();
  const [f, setF] = useState('all');
  const list = st.remote.alerts.filter((a) => a.op === op.id && (f === 'all' || a.type === f || (f === 'open' && a.status === 'nouvelle')));
  const simulate = () => {
    dispatch('r/alert/add', { alert: { id: 'm' + Date.now(), live: true, op: op.id, at: Date.now(), type: 'geo', sev: 'haute', title: 'Géolocalisation inhabituelle', msg: 'Connexion hors Union européenne bloquée pour l’identifiant EP26-••••-' + String(1000 + Math.floor(Math.random() * 9000)) + '. L’électeur a été contacté.', src: '198.51.100.' + Math.floor(Math.random() * 200), status: 'nouvelle' } });
    toast(L('Alerte simulée reçue', 'Simulated alert received'), 'warn');
  };
  const filters = [['all', L('Toutes', 'All')], ['open', L('À traiter', 'Open')], ['bruteforce', L('Force brute', 'Brute force')], ['geo', L('Géolocalisation', 'Location')], ['usurpation', L('Usurpation', 'Impersonation')], ['reissue', L('Réémissions', 'Reissues')]];
  return (
    <>
      <PageHead title={L('Alertes', 'Alerts')} refs={['3.1', '2.7', '2-04 CNIL']} actions={<Btn icon="bell" onClick={simulate}>{L('Simuler une alerte', 'Simulate an alert')}</Btn>} />
      <div class="row-between mb-16">
        <div class="seg" role="group" aria-label={L('Filtrer les alertes', 'Filter alerts')}>
          {filters.map(([k, l]) => <button key={k} aria-pressed={f === k ? 'true' : 'false'} onClick={() => setF(k)}>{l}</button>)}
        </div>
      </div>
      <div class="card" style={{ paddingTop: '6px', paddingBottom: '6px' }} aria-live="polite">{list.map((a) => <AlertRow key={a.id} a={a} />)}{!list.length && <Empty icon="bell" title={L('Aucune alerte', 'No alerts')} />}</div>
      <div class="mt-16">
        <More label={L('Règles de détection', 'Detection rules')}>
          <KV items={[
            [L('Force brute', 'Brute force'), L('Verrouillage après 5 échecs (paramétrable), adresses suspectes bloquées', 'Lockout after 5 failures (configurable), suspicious addresses blocked')],
            [L('Géolocalisation', 'Location'), L('Connexions hors UE bloquées et signalées', 'Sign-ins from outside the EU blocked and flagged')],
            [L('Usurpation', 'Impersonation'), L('Un terminal pour plusieurs identifiants : signalé', 'One device for several identifiers: flagged')],
            [L('Notification', 'Notification'), L('Membres du bureau alertés par SMS et courriel', 'Station members alerted by SMS and email')],
          ]} />
        </More>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Émargement
const canal = (c) => (c === 'Poste de travail' ? L(c, 'Computer') : c === 'Tablette' ? L(c, 'Tablet') : c);
function Emargement({ op }) {
  const st = useStore();
  const now = useNow(5000);
  const [urnId, setUrnId] = useState(op.urns[0]);
  const [page, setPage] = useState(0);
  const [qq, setQ] = useState('');
  useEffect(() => { setUrnId(op.urns[0]); setPage(0); }, [op.id]);
  const urn = st.remote.urns[urnId] || st.remote.urns[op.urns[0]];
  const data = emargementPage(st, urn.id, now, page, 25, qq);
  const exportCsv = () => {
    const rows = [];
    for (let p = 0; p < Math.ceil(Math.min(data.total, 2000) / 200); p++) emargementPage(st, urn.id, now, p, 200, qq).rows.forEach((r) => rows.push([r.nom, r.prenom, urn.college, r.site, fmtDTS(r.at), r.canal]));
    downloadCSV('emargement-' + urn.id + '.csv', ['Nom', 'Prénom', 'Collège', 'Site', 'Émargement', 'Canal'], rows);
    dispatch('r/journal', { actor: ME.name, role: 'Présidente', action: 'Export de la liste d’émargement', detail: uFr(urn) + ' · ' + rows.length + ' lignes', op: op.id });
  };
  return (
    <>
      <PageHead title={L('Liste d’émargement', 'Voter roll')} refs={['3.3', '3.2']} actions={<Btn icon="download" onClick={exportCsv}>{L('Exporter CSV', 'Export CSV')}</Btn>} />
      <div class="row mb-16">
        <label class="sr-only" for="em-urn">{L('Urne', 'Ballot box')}</label>
        <select id="em-urn" class="select" style={{ width: 'auto' }} value={urn.id} onChange={(e) => { setUrnId(e.currentTarget.value); setPage(0); }}>{op.urns.map((id) => <option key={id} value={id}>{uL(st.remote.urns[id])}</option>)}</select>
        <div class="grow" style={{ maxWidth: '360px' }}><label class="sr-only" for="em-q">{L('Rechercher un électeur', 'Search for a voter')}</label><input id="em-q" class="input" placeholder={L('Rechercher un nom', 'Search a name')} value={qq} onInput={(e) => { setQ(e.currentTarget.value); setPage(0); }} /></div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><span class="small muted">{L(fmtNum(data.total) + ' émargements', fmtNum(data.total) + ' signed')}</span>
        <Tip>{L('Réservée aux membres du bureau. Seuls les votants y figurent, horodatés, sans lien avec les bulletins. Consultations et exports journalisés.', 'Station members only. Lists voters who have voted, timestamped, with no link to ballots. Views and exports are logged.')}</Tip></span>
      </div>
      <div class="table-wrap">
        <table class="table">
          <caption class="sr-only">{L('Émargements de l’urne ', 'Signatures for ballot box ') + uL(urn)}</caption>
          <thead><tr><th>{L('Nom', 'Last name')}</th><th>{L('Prénom', 'First name')}</th><th>Site</th><th>{L('Émargement', 'Signed at')}</th><th>{L('Terminal', 'Device')}</th></tr></thead>
          <tbody>{data.rows.map((r) => <tr key={r.id} class={r.demo ? 'hl' : ''}><td class="strong">{r.nom}{r.demo && <Chip tone="sky" style={{ marginLeft: '8px' }}>{L('démo', 'demo')}</Chip>}</td><td>{r.prenom}</td><td>{r.site}</td><td class="nowrap">{fmtDTS(r.at)}</td><td>{canal(r.canal)}</td></tr>)}</tbody>
        </table>
      </div>
      <Pager page={page} total={data.total} size={25} onPage={setPage} />
    </>
  );
}

// ------------------------------------------------------------------ Contrôles
function Controles({ op }) {
  const st = useStore();
  const now = useNow(4000);
  const [run, setRun] = useState(-1);
  const steps = [L('Comptage des bulletins', 'Counting ballots'), L('Comptage des émargements', 'Counting signatures'), L('Recalcul des scellés', 'Recomputing seals'), L('Vérification du journal', 'Checking the log'), L('Synchronisation du secours', 'Backup sync')];
  const start = () => {
    setRun(0);
    let i = 0;
    const tick = () => { i++; setRun(i); if (i < steps.length) setTimeout(tick, 550); else { dispatch('r/check', { opId: op.id, kind: 'manual', ok: verifyChain(getState().remote.journal).ok, label: 'Contrôle déclenché par le bureau', by: ME.name }); toast(L('Contrôle terminé', 'Check complete'), 'ok'); } };
    setTimeout(tick, 550);
  };
  const chain = verifyChain(st.remote.journal);
  return (
    <>
      <PageHead title={L('Contrôles d’intégrité', 'Integrity checks')} sub={L('Automatiques toutes les 5 minutes', 'Automatic every 5 minutes')} refs={['2-02 CNIL', '2-03 CNIL', '6.1.3']} actions={<Btn kind="primary" icon="shieldCheck" onClick={start} disabled={run >= 0 && run < steps.length}>{L('Déclencher un contrôle', 'Run a check')}</Btn>} />
      <div class="grid g-side">
        <div class="stack">
          <Card title={L('Bulletins et émargements', 'Ballots and signatures')} actions={<Tip>{L('Deux enregistrements par vote : le bulletin, anonyme et non daté, et l’émargement, horodaté.', 'Two records per vote: the ballot, anonymous and undated, and the roll signature, timestamped.')}</Tip>}>
            <div class="table-wrap"><table class="table"><thead><tr><th>{L('Urne', 'Ballot box')}</th><th class="num">{L('Bulletins', 'Ballots')}</th><th class="num">{L('Émargements', 'Signatures')}</th><th>{L('État', 'Status')}</th></tr></thead><tbody>
              {op.urns.map((id) => { const u = st.remote.urns[id]; const n = urnCount(st, id, now); return <tr key={id}><td>{uL(u)}</td><td class="num">{fmtNum(n)}</td><td class="num">{fmtNum(n)}</td><td><Chip tone="ok">{L('Cohérent', 'Consistent')}</Chip></td></tr>; })}
            </tbody></table></div>
          </Card>
          {run >= 0 && (
            <Card title={L('Contrôle en cours', 'Check running')}>
              <ul class="proc" aria-live="polite">{steps.map((s, i) => <li key={i} class={run > i ? 'done' : run === i ? 'run' : ''}><span class="pi">{run > i ? <Icon name="check" size={14} stroke={3} /> : run === i ? <span class="spin" /> : i + 1}</span>{s}</li>)}</ul>
            </Card>
          )}
        </div>
        <div class="stack">
          <Card title={L('État', 'Status')}>
            <CheckRow ok title={L('Scellés intègres', 'Seals intact')} sub={shortFp(op.sealHash, 6)} />
            <CheckRow ok={chain.ok} title={chain.ok ? L('Journal intègre', 'Log intact') : L('Journal altéré', 'Log tampered')} sub={chain.ok ? L(chain.count + ' entrées', chain.count + ' entries') : L('Rupture à l’entrée n° ' + chain.at, 'Break at entry ' + chain.at)} />
            <CheckRow ok title={L('Urnes cloisonnées', 'Boxes isolated')} sub={L('Une clé par urne', 'One key per box')} />
          </Card>
          <Card title={L('Historique', 'History')}>
            <div class="scroll-box">{st.remote.checks.filter((x) => x.op === op.id).slice(0, 12).map((x, i) => <div class="member-row" key={i}><Icon name={x.ok ? 'checkCircle' : 'xCircle'} size={18} style={{ color: x.ok ? 'var(--green)' : 'var(--red)' }} /><div class="grow"><div class="small strong">{x.kind === 'manual' ? L('Manuel', 'Manual') : L('Automatique', 'Automatic')}{x.by ? ' · ' + x.by : ''}</div><div class="xs muted">{fmtDTS(x.at)}</div></div></div>)}</div>
          </Card>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Cérémonie des clés et scellés
function Scellement({ op }) {
  const st = useStore();
  const [replay, setReplay] = useState(false);
  const [verif, setVerif] = useState(null);
  const holders = op.holders.map((id) => BUREAU.find((b) => b.id === id));
  const verify = () => {
    setVerif('run');
    setTimeout(() => {
      const recomputed = sha256(Object.values(op.seals).join(''));
      setVerif(recomputed === op.sealHash ? 'ok' : 'ko');
      dispatch('r/journal', { actor: ME.name, role: 'Présidente', action: 'Vérification des scellés', detail: recomputed === op.sealHash ? 'Empreintes conformes' : 'Écart détecté', op: op.id });
    }, 1200);
  };
  const fp8 = (h) => <span class="fp">{shortFp(h, 8)}</span>;
  return (
    <>
      <PageHead title={L('Clés et scellés', 'Keys and seals')} refs={['3.3', '1-08 CNIL', '6.1.3']} actions={<><Btn icon="play" kind="primary" onClick={() => setReplay(true)}>{L('Rejouer la cérémonie', 'Replay ceremony')}</Btn><Btn icon="print" onClick={() => printHtml(ceremonyHtml(st, op))}>{L('PV de cérémonie', 'Ceremony minutes')}</Btn></>} />
      <div class="grid g-side">
        <div class="stack">
          <Card title={L('Cérémonie du ', 'Ceremony, ') + fmtDate(op.ceremonyAt)} actions={<><Chip tone="gray">{L('Seuil ', 'Threshold ') + op.threshold + ' / ' + op.holders.length}</Chip><Tip>{L('Personne seule, ni le prestataire, ne peut dépouiller. Chaque part reste sur la clé matérielle de son détenteur et n’est jamais réunie sur un serveur.', 'No single person, not even the supplier, can count the votes. Each share stays on its holder’s hardware key and is never combined on a server.')}</Tip></>}>
            {holders.map((h) => (
              <div class="holder" key={h.id}>
                <span class="avatar" aria-hidden="true">{initials(h.name)}</span>
                <div class="grow"><div class="strong">{h.name}</div><div class="xs muted">{bureauRole(h)}</div></div>
                <span class="fp" title={L('Empreinte de la part', 'Share fingerprint')}>{shortFp(sha256('share-' + h.id + '-' + op.id), 6)}</span>
              </div>
            ))}
          </Card>
          <Card title={L('Clés publiques', 'Public keys')}>
            <div class="table-wrap"><table class="table table-compact"><thead><tr><th>{L('Urne', 'Ballot box')}</th><th>{L('Empreinte', 'Fingerprint')}</th></tr></thead><tbody>
              {op.urns.map((id) => { const u = st.remote.urns[id]; return <tr key={id}><td>{uL(u)}</td><td><span class="fp">{groupFp(u.pkFp)}</span></td></tr>; })}
            </tbody></table></div>
          </Card>
        </div>
        <div class="stack">
          <Card title={L('Scellés', 'Seals')}>
            <KV items={[[L('Système de vote', 'Voting system'), fp8(op.seals.system)], [L('Listes de candidats', 'Candidate lists'), fp8(op.seals.lists)], [L('Liste électorale', 'Electoral roll'), fp8(op.seals.electors)], [L('Horaires', 'Schedule'), fp8(op.seals.schedule)], [L('Empreinte globale', 'Overall seal'), fp8(op.sealHash)]]} />
            <div class="mt-16"><Btn icon="shieldCheck" onClick={verify} disabled={verif === 'run'}>{verif === 'run' ? L('Recalcul…', 'Recomputing…') : L('Vérifier les scellés maintenant', 'Verify seals now')}</Btn></div>
            <div aria-live="polite" class="mt-12">{verif === 'ok' && <Note tone="ok" icon="checkCircle">{L('Empreintes identiques, aucune modification.', 'Fingerprints match, no changes.')}</Note>}{verif === 'ko' && <Note tone="err" icon="alert">{L('Écart détecté.', 'Mismatch detected.')}</Note>}</div>
          </Card>
          <Card title={L('Historique des scellés', 'Seal history')}>
            <ul class="timeline">
              {op.sealsHistory.slice().sort((a, b) => a.at - b.at).map((s, i) => <li key={i} class="done"><span class="tl-dot"><Icon name="check" size={12} stroke={3} /></span><div class="tl-title">{tx(s.label)}</div><div class="tl-sub">{fmtDT(s.at)} · <span class="mono">{shortFp(s.hash, 5)}</span></div></li>)}
            </ul>
          </Card>
        </div>
      </div>
      {replay && <CeremonyReplay op={op} onClose={() => setReplay(false)} />}
    </>
  );
}

// Procès-verbal de cérémonie : document en français
function ceremonyHtml(st, op) {
  const holders = op.holders.map((id) => BUREAU.find((b) => b.id === id));
  return `<div class="doc-meta"><span>${esc(ESTAB.name)} · ${esc(op.name)}</span><span>Procès-verbal de cérémonie des clés</span></div>
  <h1>Procès-verbal de la cérémonie de génération des clés et de scellement</h1>
  <p>Le ${esc(fmtDT(op.ceremonyAt, 'fr'))}, le bureau de vote électronique s’est réuni pour procéder à la génération distribuée des clés de chiffrement et au scellement du système de vote, en présence de l’expert indépendant.</p>
  <h2>Détenteurs de parts de clé (seuil ${op.threshold} sur ${op.holders.length})</h2>
  <table><thead><tr><th>Détenteur</th><th>Qualité</th><th>Empreinte de la part</th></tr></thead><tbody>${holders.map((h) => `<tr><td>${esc(h.name)}</td><td>${esc(h.role)}</td><td style="font-family:monospace">${shortFp(sha256('share-' + h.id + '-' + op.id), 8)}</td></tr>`).join('')}</tbody></table>
  <h2>Clés publiques publiées</h2>
  <table><thead><tr><th>Urne</th><th>Empreinte</th></tr></thead><tbody>${op.urns.map((id) => { const u = st.remote.urns[id]; return `<tr><td>${esc(u.instance)} · ${esc(u.college)}</td><td style="font-family:monospace;font-size:8pt">${u.pkFp}</td></tr>`; }).join('')}</tbody></table>
  <h2>Scellement</h2>
  <table><tbody><tr><th>Système</th><td style="font-family:monospace;font-size:8pt">${op.seals.system}</td></tr><tr><th>Listes de candidats</th><td style="font-family:monospace;font-size:8pt">${op.seals.lists}</td></tr><tr><th>Liste électorale</th><td style="font-family:monospace;font-size:8pt">${op.seals.electors}</td></tr><tr><th>Horaires</th><td style="font-family:monospace;font-size:8pt">${op.seals.schedule}</td></tr><tr><th>Empreinte globale</th><td style="font-family:monospace;font-size:8pt">${op.sealHash}</td></tr></tbody></table>
  <div class="sig">${holders.map((h) => `<div>${esc(h.name)}<br>Signature</div>`).join('')}</div>
  <p style="font-size:8.5pt;color:#666">Démonstration · données fictives.</p>`;
}

function CeremonyReplay({ op, onClose }) {
  const [step, setStep] = useState(0);
  const [present, setPresent] = useState(Object.fromEntries(op.holders.map((h) => [h, true])));
  const [gen, setGen] = useState(0);
  const [given, setGiven] = useState({});
  const holders = op.holders.map((id) => BUREAU.find((b) => b.id === id));
  const nPresent = Object.values(present).filter(Boolean).length;
  const newSeal = useMemo(() => sha256('replay-' + op.id + Date.now()), [step === 4]);
  useEffect(() => {
    if (step !== 1) return;
    setGen(0);
    let i = 0;
    const id = setInterval(() => { i++; setGen(i); if (i >= holders.length) clearInterval(id); }, 650);
    return () => clearInterval(id);
  }, [step]);
  const steps = [L('Présence', 'Attendance'), L('Génération', 'Generation'), L('Remise des parts', 'Share handover'), L('Clés publiques', 'Public keys'), L('Scellement', 'Seal')];
  const finish = () => { dispatch('r/journal', { actor: ME.name, role: 'Bureau de vote', action: 'Cérémonie des clés rejouée (environnement de démonstration)', detail: 'Simulation sans effet sur les urnes en production', op: op.id }); toast(L('Simulation terminée, urnes inchangées', 'Simulation done, boxes unchanged'), 'ok'); onClose(); };
  return (
    <Modal title={L('Cérémonie des clés (simulation)', 'Key ceremony (simulation)')} size="l" icon="key" onClose={onClose} footer={<>
      <Btn onClick={onClose}>{L('Fermer', 'Close')}</Btn>
      {step > 0 && step < 4 && <Btn icon="arrowLeft" onClick={() => setStep(step - 1)}>{L('Retour', 'Back')}</Btn>}
      {step < 4 && <Btn kind="primary" iconRight="arrowRight" disabled={(step === 0 && nPresent < op.holders.length) || (step === 1 && gen < holders.length) || (step === 2 && Object.keys(given).length < holders.length)} onClick={() => setStep(step + 1)}>{L('Étape suivante', 'Next step')}</Btn>}
      {step === 4 && <Btn kind="primary" icon="check" onClick={finish}>{L('Terminer', 'Finish')}</Btn>}
    </>}>
      <ol class="stepper">{steps.map((s, i) => <li key={i} class={i < step ? 'done' : i === step ? 'cur' : ''}><span>{i + 1}. {s}</span></li>)}</ol>
      {step === 0 && (
        <div class="stack stack-s">
          <p class="small muted">{L('Tous les détenteurs doivent être présents ; ' + op.threshold + ' suffiront au dépouillement.', 'All key holders must be present; ' + op.threshold + ' will be enough for the count.')}</p>
          {holders.map((h) => <label key={h.id} class={'holder ' + (present[h.id] ? 'on' : '')} style={{ cursor: 'pointer' }}><input type="checkbox" checked={present[h.id]} onChange={(e) => setPresent({ ...present, [h.id]: e.currentTarget.checked })} style={{ width: '20px', height: '20px' }} /><div class="grow"><div class="strong">{h.name}</div><div class="xs muted">{bureauRole(h)}</div></div>{present[h.id] && <Chip tone="ok" icon="check">{L('Identifié·e', 'Identified')}</Chip>}</label>)}
        </div>
      )}
      {step === 1 && (
        <div class="stack stack-s" aria-live="polite">
          <p class="small muted">{L('Personne, ni le serveur, ne connaît la clé privée complète.', 'Nobody, not even the server, ever knows the full private key.')}</p>
          {holders.map((h, i) => <div key={h.id} class={'holder ' + (gen > i ? 'on' : '')}><span class={'cr-ico ' + (gen > i ? 'cr-ok' : 'cr-wait')} style={{ width: '26px', height: '26px', borderRadius: '50%', display: 'grid', placeItems: 'center', flex: 'none' }}>{gen > i ? <Icon name="check" size={16} stroke={3} /> : gen === i ? <span class="spin spin-dark" /> : i + 1}</span><div class="grow"><div class="strong">{h.name}</div><div class="xs muted">{gen > i ? L('Engagement publié · ', 'Commitment published · ') + shortFp(sha256('commit-' + h.id + op.id), 6) : L('Calcul en cours…', 'Computing…')}</div></div></div>)}
        </div>
      )}
      {step === 2 && (
        <div class="stack stack-s">
          <p class="small muted">{L('Chaque part va sur la clé personnelle de son détenteur.', 'Each share goes onto its holder’s personal key.')}</p>
          {holders.map((h) => <div key={h.id} class={'holder ' + (given[h.id] ? 'on' : '')}><div class="grow"><div class="strong">{h.name}</div><div class="xs muted">{given[h.id] ? L('Part enregistrée · ', 'Share stored · ') + shortFp(sha256('share-' + h.id + '-' + op.id), 6) : L('En attente', 'Waiting')}</div></div>{!given[h.id] ? <Btn size="sm" kind="primary" icon="key" onClick={() => setGiven({ ...given, [h.id]: true })}>{L('Remettre la part', 'Hand over share')}</Btn> : <Chip tone="ok" icon="check">{L('Remise', 'Handed over')}</Chip>}</div>)}
        </div>
      )}
      {step === 3 && (
        <div class="stack stack-s">
          <p class="small muted">{L('Une clé publique par urne, utilisée par les électeurs pour chiffrer leur bulletin.', 'One public key per ballot box, used by voters to encrypt their ballot.')}</p>
          <div class="table-wrap"><table class="table table-compact"><tbody>{op.urns.map((id) => <tr key={id}><td class="strong">{uL(getState().remote.urns[id])}</td><td><span class="fp">{shortFp(sha256('replay-pk-' + id), 8)}</span></td><td><Chip tone="ok">{L('Publiée', 'Published')}</Chip></td></tr>)}</tbody></table></div>
        </div>
      )}
      {step === 4 && (
        <div class="stack">
          <Note tone="ok" icon="seal">{L('Système, listes et horaires scellés · ', 'System, lists and schedule sealed · ')}<span class="fp">{shortFp(newSeal, 10)}</span></Note>
          <p class="small muted">{L('Contrôle de vacuité : urnes et émargements vides (CNIL 1-10).', 'Empty check: boxes and voter roll are empty (CNIL 1-10).')}</p>
          <div><Btn icon="print" onClick={() => printHtml(ceremonyHtml(getState(), op))}>{L('Imprimer le PV', 'Print minutes')}</Btn></div>
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ Clôture et dépouillement
function Depouillement({ op }) {
  const st = useStore();
  const now = useNow(1000);
  const [dual, setDual] = useState(null);
  const [share, setShare] = useState(null);
  const [counting, setCounting] = useState(-1);
  const holders = op.holders.map((id) => BUREAU.find((b) => b.id === id));
  const shares = op.counting.shares || {};
  const nShares = Object.keys(shares).length;
  const s = op.status;
  const stage = s === 'open' || s === 'suspended' ? 0 : s === 'ended' ? 1 : s === 'closed' ? 2 : s === 'sealed-after' ? 3 : 4;
  const c = opCounts(st, op.id, now);
  const sealAfter = () => {
    const h = sha256('after-' + op.id + JSON.stringify(c.per.map((p) => [p.urn.id, p.voted])));
    dispatch('r/op/seal-after', { opId: op.id, hash: h, by: ME.name });
    toast(L('Urnes et émargements scellés', 'Boxes and roll sealed'), 'ok');
  };
  const runCount = () => {
    setCounting(0);
    let i = 0;
    const n = op.urns.length;
    const tick = () => { i++; setCounting(i); if (i < n) setTimeout(tick, 600); else setTimeout(() => { dispatch('r/count/done', { opId: op.id, hash: sha256('results-' + op.id + Date.now()) }); setCounting(-1); toast(L('Dépouillement terminé', 'Count complete'), 'ok'); }, 500); };
    setTimeout(tick, 700);
  };
  const steps = [L('Fin du vote', 'Voting ends'), L('Clôture', 'Close'), L('Scellement', 'Seal'), L('Parts de clé', 'Key shares'), L('Dépouillement', 'Count')];
  const nUrns = op.urns.length;
  return (
    <>
      <PageHead title={L('Clôture et dépouillement', 'Close and count')} sub={L(op.threshold + ' parts de clé sur ' + op.holders.length + ' requises', op.threshold + ' of ' + op.holders.length + ' key shares required')} refs={['3.3', '1-09 CNIL', '3-04 CNIL']} />
      <ol class="stepper" aria-label={L('Étapes', 'Steps')}>{steps.map((x, i) => <li key={i} class={i < stage ? 'done' : i === stage ? 'cur' : ''}><span>{i + 1}. {x}</span></li>)}</ol>
      {stage === 0 && (
        <Card title={L('Vote en cours', 'Voting in progress')}>
          <p>{L('Fin le ', 'Ends ')}<strong>{fmtDT(op.close)}</strong>{L(' (dans ' + fmtDur(op.close - now) + ')', ' (in ' + fmtDur(op.close - now) + ')')}</p>
          <DemoNote>{L('Avancez l’horloge pour continuer.', 'Skip ahead to continue.')}<div class="mt-8"><Btn kind="primary" size="sm" icon="zap" onClick={() => { dispatch('r/op/advanceEnd', { opId: op.id }); toast(L('Fin du vote simulée', 'End of voting simulated'), 'ok'); }}>{L('Avancer à la fin de la période de vote', 'Skip to end of voting')}</Btn></div></DemoNote>
        </Card>
      )}
      {stage === 1 && (
        <Card title={L('Prêt à clôturer', 'Ready to close')}>
          <KV items={[[L('Votants', 'Voters'), fmtNum(c.voted) + ' / ' + fmtNum(c.electors) + ' · ' + fmtPct(c.voted / c.electors)], [L('Bulletins', 'Ballots'), L(fmtNum(c.ballots) + ' dans ' + nUrns + ' urne' + (nUrns > 1 ? 's' : ''), fmtNum(c.ballots) + ' in ' + nUrns + ' box' + (nUrns > 1 ? 'es' : ''))], [L('Fin du vote', 'Voting ended'), op.demoEnded ? L('Simulée le ', 'Simulated ') + fmtDT(op.endedAt) : fmtDT(op.close)]]} />
          <div class="mt-16"><Btn kind="primary" icon="lock" onClick={() => setDual({ opId: op.id, kind: 'close', label: 'Clôture du scrutin « ' + op.name + ' »', reason: 'Après clôture, plus aucun bulletin ne peut être déposé.' })}>{L('Clôturer le scrutin', 'Close voting')}</Btn></div>
        </Card>
      )}
      {stage === 2 && (
        <Card title={L('Scellement', 'Seal')}>
          <div class="table-wrap mb-16"><table class="table table-compact"><thead><tr><th>{L('Urne', 'Ballot box')}</th><th class="num">{L('Bulletins', 'Ballots')}</th><th class="num">{L('Émargements', 'Signatures')}</th></tr></thead><tbody>{c.per.map(({ urn, voted }) => <tr key={urn.id}><td>{uL(urn)}</td><td class="num">{fmtNum(voted)}</td><td class="num">{fmtNum(voted)}</td></tr>)}</tbody></table></div>
          <Btn kind="primary" icon="seal" onClick={sealAfter}>{L('Sceller les urnes et les émargements', 'Seal boxes and roll')}</Btn>
        </Card>
      )}
      {stage === 3 && (
        <div class="grid g-side">
          <Card title={L('Parts de clé', 'Key shares')}>
            <div aria-live="polite">
              {holders.map((h) => (
                <div class={'holder ' + (shares[h.id] ? 'on' : '')} key={h.id}>
                  <span class="avatar" aria-hidden="true">{initials(h.name)}</span>
                  <div class="grow"><div class="strong">{h.name}</div><div class="xs muted">{shares[h.id] ? L('Preuve vérifiée · ', 'Proof verified · ') + fmtTime(shares[h.id]) : bureauShort(h)}</div></div>
                  {shares[h.id] ? <Chip tone="ok" icon="check">{L('Présentée', 'Presented')}</Chip> : <Btn size="sm" icon="key" disabled={nShares >= op.threshold} onClick={() => setShare(h)}>{L('Présenter sa part', 'Present share')}</Btn>}
                </div>
              ))}
            </div>
            <div class="mt-16"><BarRow label={L('Seuil', 'Threshold')} value={nShares} max={op.threshold} right={nShares + ' / ' + op.threshold} /></div>
            <div class="mt-16"><Btn kind="primary" size="lg" icon="unlock" disabled={nShares < op.threshold || counting >= 0} onClick={runCount}>{counting >= 0 ? L('Dépouillement en cours…', 'Counting…') : L('Lancer le dépouillement', 'Start count')}</Btn></div>
          </Card>
          <div class="stack">
            {counting >= 0 ? (
              <Card title={L('Dépouillement', 'Count')}>
                <ul class="proc" aria-live="polite">{op.urns.map((id, i) => <li key={id} class={counting > i ? 'done' : counting === i ? 'run' : ''}><span class="pi">{counting > i ? <Icon name="check" size={14} stroke={3} /> : counting === i ? <span class="spin" /> : i + 1}</span>{uL(st.remote.urns[id])}</li>)}</ul>
              </Card>
            ) : (
              <Card title={L('Déchiffrement à seuil', 'Threshold decryption')}>
                <p class="small muted mb-0">{L('Seul le total chiffré de chaque urne est déchiffré, avec preuve publiée ; la clé privée n’est jamais reconstituée.', 'Only each box’s encrypted total is decrypted, with a published proof; the private key is never rebuilt.')}</p>
              </Card>
            )}
          </div>
        </div>
      )}
      {stage === 4 && (
        <Card title={s === 'counted' ? L('Dépouillement terminé', 'Count complete') : s === 'published' ? L('Résultats proclamés', 'Results declared') : L('Scrutin archivé', 'Election archived')}>
          <KV items={[[L('Clôture', 'Closed'), op.closedAt ? fmtDT(op.closedAt) : ''], [L('Parts', 'Shares'), Object.keys(shares).map((id) => BUREAU.find((b) => b.id === id).name).join(', ')], [L('Dépouillement', 'Counted'), op.countedAt ? fmtDT(op.countedAt) : ''], s !== 'counted' && [L('Proclamation', 'Declared'), op.publishedAt ? fmtDT(op.publishedAt) : '']]} />
          <div class="row mt-16">
            <Btn kind="primary" href="/distance/bureau/resultats" icon="chart">{L('Voir les résultats', 'View results')}</Btn>
            {s === 'counted' && <Btn icon="flag" onClick={() => setDual({ opId: op.id, kind: 'publish', label: 'Proclamation des résultats « ' + op.name + ' »' })}>{L('Proclamer les résultats', 'Declare results')}</Btn>}
            {s === 'published' && op.id !== 'test26' && <Btn icon="archive" onClick={() => { dispatch('r/op/archive', { opId: op.id, by: ME.name }); toast(L('Archive scellée et transférée', 'Archive sealed and transferred'), 'ok'); }}>{L('Sceller et archiver', 'Seal and archive')}</Btn>}
          </div>
        </Card>
      )}
      {dual && <DualModal action={dual} me={ME.name} onClose={() => setDual(null)} signers={BUREAU} />}
      {share && <ShareModal h={share} op={op} onClose={() => setShare(null)} />}
    </>
  );
}

function ShareModal({ h, op, onClose }) {
  const [pin, setPin] = useState('');
  const [phase, setPhase] = useState('idle');
  const ok = () => { setPhase('wait'); setTimeout(() => { dispatch('r/share', { opId: op.id, holderId: h.id }); onClose(); toast(L('Part de ' + h.name + ' présentée', h.name + '’s share presented'), 'ok'); }, 1100); };
  return (
    <Modal title={L('Part de ' + h.name, h.name + '’s share')} size="s" icon="key" onClose={onClose} footer={<><Btn onClick={onClose}>{L('Annuler', 'Cancel')}</Btn><Btn kind="primary" icon="key" disabled={phase !== 'idle'} onClick={() => { if (!pin) setPin('••••••'); ok(); }}>{L('Présenter', 'Present')}</Btn></>}>
      <p class="small muted">{L('Insérez votre clé et saisissez votre code.', 'Insert your key and enter your code.')}</p>
      <Field label={L('Code personnel', 'Personal code')} id="pin"><input class="input mono" id="pin" type="password" value={pin} onInput={(e) => setPin(e.currentTarget.value)} placeholder={L('Démo : laisser vide', 'Demo: leave empty')} /></Field>
      <div class="mt-12" aria-live="polite">{phase === 'wait' && <Note icon="cpu"><span class="row" style={{ gap: '10px' }}><span class="spin spin-dark" />{L('Déchiffrement partiel…', 'Partial decryption…')}</span></Note>}</div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Résultats
// Procès-verbal de dépouillement : document en français
function pvHtml(st, op) {
  const now = Date.now();
  const res = op.urns.map((id) => urnResults(st, id, now));
  const body = res.map((r) => {
    if (r.urn.type === 'pluri') {
      return `<h2>${esc(r.urn.instance)} · ${esc(r.urn.college)}</h2><p>Inscrits : ${r.inscrits} · Votants : ${r.votants} · Blancs : ${r.blancs} · Suffrages exprimés : ${r.exprimes} · Sièges : ${r.urn.seats}</p>
      <table><thead><tr><th>Candidat·e</th><th>Voix</th><th>Résultat</th></tr></thead><tbody>${r.cands.map((c) => `<tr><td>${esc(c.name)}</td><td>${c.votes}</td><td>${c.elected ? 'Élu·e au 1er tour' : ''}</td></tr>`).join('')}</tbody></table>${r.seatsLeft ? `<p>${r.seatsLeft} siège(s) restant(s) à pourvoir au second tour.</p>` : ''}`;
    }
    return `<h2>${esc(r.urn.instance)} · ${esc(r.urn.college)}</h2><p>Inscrits : ${r.inscrits} · Votants : ${r.votants} (${fmtPct(r.votants / r.inscrits, 1, 'fr')}) · Blancs : ${r.blanc} · Suffrages exprimés : ${r.exprimes} · Sièges : ${r.urn.seats}</p>
    <table><thead><tr><th>Liste</th><th>Voix</th><th>%</th><th>Sièges</th></tr></thead><tbody>${r.order.map((id) => `<tr><td>${esc(UNIONS[id].name)} (${UNIONS[id].acr})</td><td>${r.votes[id]}</td><td>${fmtPct(r.votes[id] / r.exprimes, 1, 'fr')}</td><td>${r.seats[id]}</td></tr>`).join('')}</tbody></table>`;
  }).join('');
  return `<div class="doc-meta"><span>${esc(ESTAB.name)} · ${esc(op.name)}</span><span>Généré automatiquement le ${esc(fmtDT(now, 'fr'))}</span></div>
  <h1>Procès-verbal de dépouillement</h1>
  <p>Le bureau de vote électronique a procédé à la clôture du scrutin le ${esc(fmtDT(op.closedAt || op.close, 'fr'))}, au scellement des urnes et des listes d’émargement, puis au dépouillement par activation conjointe de ${Object.keys(op.counting.shares || {}).length} parts de clé sur ${op.holders.length}. Mode de scrutin : ${esc(op.mode)}.</p>
  ${body}
  <h2>Scellement des résultats</h2><p style="font-family:monospace;font-size:8pt">${esc((op.sealsHistory[op.sealsHistory.length - 1] || {}).hash || '')}</p>
  <div class="sig">${BUREAU.slice(0, 4).map((b) => `<div>${esc(b.name)}<br>${esc(b.short)}</div>`).join('')}</div>
  <p style="font-size:8.5pt;color:#666">Démonstration · données fictives.</p>`;
}

// Second tour d'un scrutin plurinominal (sièges non pourvus au premier tour)
function SecondTourCard({ op, urn, left }) {
  const st = useStore();
  const draft = st.remote.drafts.find((d) => d.round2Of === urn.id);
  const plan = () => {
    const open = dayAt(Date.now(), 14, 8, 0);
    dispatch('r/draft/add', { draft: { id: 'r2-' + urn.id, round2Of: urn.id, name: op.short + ' · second tour · ' + urn.collegeKey, instance: urn.instance, modeLabel: 'Scrutin plurinominal, second tour à la majorité relative', level: op.level, open, close: dayAt(open, 7, 17, 0), colleges: [urn.college], electors: urn.electors }, by: ME.name });
    toast(L('Second tour préparé', 'Second round prepared'), 'ok');
  };
  return (
    <div class="mt-16">
      <div class="row" style={{ gap: '6px' }}><span class="small">{L(left + ' siège(s) à pourvoir au second tour, à la majorité relative.', left + ' seat(s) left for a second round, by relative majority.')}</span><Tip>{L('Désistements possibles ; à égalité de voix, le plus âgé est élu. Validation en double signature puis nouvelle cérémonie des clés.', 'Withdrawals allowed; in a tie, the oldest candidate is elected. Dual signature, then a new key ceremony.')}</Tip></div>
      <div class="row mt-12">{draft ? <Chip tone="ok" icon="check">{L('Second tour le ', 'Second round on ') + fmtDT(draft.open)}</Chip> : <Btn kind="primary" size="sm" icon="route" onClick={plan}>{L('Préparer le second tour', 'Prepare second round')}</Btn>}<Ref c="2.3" /></div>
    </div>
  );
}

function Resultats({ op }) {
  const st = useStore();
  const now = Date.now();
  const ready = ['counted', 'published', 'archived'].includes(op.status);
  const [urnId, setUrnId] = useState(op.urns[0]);
  const [tab, setTab] = useState('global');
  useEffect(() => setUrnId(op.urns[0]), [op.id]);
  if (!ready) {
    return (
      <>
        <PageHead title={L('Résultats', 'Results')} refs={['3.3']} />
        <Card><Empty icon="lock" title={L('Disponibles après le dépouillement', 'Available after the count')}>{L('Aucun résultat partiel : ' + op.threshold + ' parts de clé requises après la clôture.', 'No partial results: ' + op.threshold + ' key shares needed after closing.')}
          <div class="row mt-16" style={{ justifyContent: 'center' }}>
            <Btn kind="primary" href="/distance/bureau/depouillement" icon="unlock">{L('Aller au dépouillement', 'Go to count')}</Btn>
            <Btn href="/distance/bureau/resultats" onClick={(e) => { e.preventDefault(); dispatch('auth/login', { key: 'r_bureau', user: { ...st.auth.r_bureau, op: 'test26' } }); }}>{L('Voir le vote test', 'View test vote')}</Btn>
          </div>
        </Empty></Card>
      </>
    );
  }
  const urn = st.remote.urns[urnId] || st.remote.urns[op.urns[0]];
  const r = urnResults(st, urn.id, now);
  const all = op.urns.map((id) => urnResults(st, id, now));
  // Exports : contenu en français (pièces du scrutin)
  const exportCsv = () => {
    const rows = [];
    all.forEach((x) => {
      if (x.urn.type === 'pluri') x.cands.forEach((c) => rows.push([x.urn.instance, x.urn.college, c.name, c.votes, '', c.elected ? 'Élu·e' : '']));
      else x.order.forEach((id) => rows.push([x.urn.instance, x.urn.college, UNIONS[id].name, x.votes[id], (x.votes[id] / x.exprimes * 100).toFixed(2), x.seats[id]]));
    });
    downloadCSV('resultats-' + op.id + '.csv', ['Instance', 'Collège', 'Liste / candidat', 'Voix', '% exprimés', 'Sièges / résultat'], rows);
  };
  const exportXls = () => {
    downloadXLS('resultats-' + op.id + '.xls', [
      { name: 'Synthèse', headers: ['Instance', 'Collège', 'Inscrits', 'Votants', 'Participation %', 'Blancs', 'Exprimés'], rows: all.map((x) => [x.urn.instance, x.urn.college, x.inscrits, x.votants, +(x.votants / x.inscrits * 100).toFixed(2), x.blanc != null ? x.blanc : x.blancs, x.exprimes]) },
      ...all.filter((x) => x.urn.type !== 'pluri').map((x) => ({ name: x.urn.instance + ' ' + x.urn.collegeKey, headers: ['Liste', 'Voix', '% exprimés', 'Sièges', ...SITES.map((s) => s.name)], rows: x.order.map((id) => [UNIONS[id].name, x.votes[id], +(x.votes[id] / x.exprimes * 100).toFixed(2), x.seats[id], ...x.bySite.map((b) => b.votes[id])]) })),
    ]);
  };
  const proofs = () => downloadJSON('dossier-verification-' + op.id + '.json', {
    operation: op.name, niveau: op.level, genere: new Date().toISOString(), seuil: op.threshold + '/' + op.holders.length,
    scellement: op.sealHash, journal: { entrees: st.remote.journal.length, derniere_empreinte: st.remote.journal[st.remote.journal.length - 1].hash },
    urnes: all.map((x) => ({ urne: x.urn.id, cle_publique: x.urn.pkFp, bulletins: x.votants, agregat_chiffre: sha256('agg-' + x.urn.id + x.votants), dechiffrements_partiels: Object.keys(op.counting.shares || {}).map((h) => ({ detenteur: h, preuve: sha256('proof-' + h + x.urn.id) })), resultat: x.urn.type === 'pluri' ? x.cands.map((c) => ({ candidat: c.name, voix: c.votes })) : { ...x.votes, blanc: x.blanc } })),
    note: 'Dossier de démonstration (fictif). En production, le dossier permet de vérifier le dépouillement avec un outil tiers (CNIL 3-02).',
  });
  const blank = (x) => (x.blanc != null ? x.blanc : x.blancs);
  return (
    <>
      <PageHead title={L('Résultats', 'Results')} sub={L('Dépouillé le ', 'Counted ') + fmtDT(op.countedAt)} refs={['3.3', '1-11 CNIL', '3-02 CNIL']} actions={<>
        <Btn icon="download" onClick={exportCsv}>CSV</Btn>
        <Btn icon="download" onClick={exportXls}>Excel</Btn>
        <Btn icon="print" onClick={() => printHtml(pvHtml(st, op))}>PDF</Btn>
        <Btn icon="file" onClick={() => downloadDoc('pv-depouillement-' + op.id + '.doc', 'Procès-verbal de dépouillement', pvHtml(st, op))}>{L('PV Word', 'Minutes (Word)')}</Btn>
        <Btn kind="primary" icon="fingerprint" onClick={proofs}>{L('Dossier de preuves', 'Proof file')}</Btn>
      </>} />
      <Tabs label={L('Vues des résultats', 'Result views')} value={tab} onChange={setTab} tabs={[{ id: 'global', label: L('Synthèse', 'Overview') }, { id: 'urne', label: L('Par urne (collège)', 'By ballot box') }, { id: 'site', label: L('Par bureau de vote virtuel', 'By site') }, { id: 'pv', label: L('Procès-verbal', 'Minutes') }]} />
      {tab === 'global' && (
        <TabPanel id="global">
          <div class="table-wrap"><table class="table"><thead><tr><th>{L('Urne', 'Ballot box')}</th><th class="num">{L('Inscrits', 'Registered')}</th><th class="num">{L('Votants', 'Voters')}</th><th class="num">{L('Participation', 'Turnout')}</th><th class="num">{L('Blancs', 'Blank')}</th><th class="num">{L('Exprimés', 'Valid')}</th><th>{L('Sièges', 'Seats')}</th></tr></thead><tbody>
            {all.map((x) => <tr key={x.urn.id}><td class="strong">{uL(x.urn)}</td><td class="num">{fmtNum(x.inscrits)}</td><td class="num">{fmtNum(x.votants)}</td><td class="num">{fmtPct(x.votants / x.inscrits)}</td><td class="num">{fmtNum(blank(x))}</td><td class="num">{fmtNum(x.exprimes)}</td><td>{x.urn.type === 'pluri' ? L(x.cands.filter((c) => c.elected).length + ' élu·e·s / ' + x.urn.seats, x.cands.filter((c) => c.elected).length + ' elected / ' + x.urn.seats) : x.order.filter((id) => x.seats[id]).map((id) => UNIONS[id].acr + ' ' + x.seats[id]).join(' · ')}</td></tr>)}
          </tbody></table></div>
        </TabPanel>
      )}
      {tab === 'urne' && (
        <TabPanel id="urne">
          <div class="row mb-16"><label class="sr-only" for="res-urn">{L('Urne', 'Ballot box')}</label><select id="res-urn" class="select" style={{ width: 'auto' }} value={urn.id} onChange={(e) => setUrnId(e.currentTarget.value)}>{op.urns.map((id) => <option key={id} value={id}>{uL(st.remote.urns[id])}</option>)}</select></div>
          <div class="grid g4 mb-16"><Kpi label={L('Inscrits', 'Registered')} value={fmtNum(r.inscrits)} /><Kpi label={L('Votants', 'Voters')} value={fmtNum(r.votants)} sub={fmtPct(r.votants / r.inscrits)} /><Kpi label={L('Blancs', 'Blank')} value={fmtNum(blank(r))} /><Kpi label={L('Exprimés', 'Valid votes')} value={fmtNum(r.exprimes)} /></div>
          {urn.type === 'pluri' ? (
            <Card title={L('Candidat·e·s · ' + urn.seats + ' sièges', 'Candidates · ' + urn.seats + ' seats')} actions={<Tip>{L('Élu·e au 1er tour : majorité absolue (' + fmtNum(r.threshold) + ' voix) et au moins un tiers des inscrits (' + fmtNum(r.minVotes) + ' voix).', 'Elected in round 1: absolute majority (' + fmtNum(r.threshold) + ' votes) and at least a third of registered voters (' + fmtNum(r.minVotes) + ' votes).')}</Tip>}>
              {r.cands.map((c) => <BarRow key={c.id} label={<span>{c.elected && <Icon name="checkCircle" size={14} style={{ color: 'var(--green)' }} label={L('Élu·e', 'Elected')} />} {c.name}</span>} value={c.votes} max={r.exprimes} right={fmtNum(c.votes)} />)}
              {r.seatsLeft > 0 && <SecondTourCard op={op} urn={urn} left={r.seatsLeft} />}
            </Card>
          ) : (
            <Card title={L('Voix et sièges', 'Votes and seats')}>
              {r.order.map((id) => <BarRow key={id} label={<span class="row" style={{ flexWrap: 'nowrap', gap: '8px' }}><UnionLogo u={UNIONS[id]} size={26} />{UNIONS[id].acr}</span>} value={r.votes[id]} max={r.exprimes} right={fmtPct(r.votes[id] / r.exprimes) + ' · ' + L(r.seats[id] + ' siège' + (r.seats[id] > 1 ? 's' : ''), r.seats[id] + ' seat' + (r.seats[id] > 1 ? 's' : ''))} />)}
              <div class="table-wrap mt-16"><table class="table table-compact"><thead><tr><th>{L('Liste', 'List')}</th><th class="num">{L('Voix', 'Votes')}</th><th class="num">{L('% exprimés', '% valid')}</th><th class="num">{L('Sièges', 'Seats')}</th></tr></thead><tbody>{r.order.map((id) => <tr key={id}><td>{UNIONS[id].name}</td><td class="num">{fmtNum(r.votes[id])}</td><td class="num">{fmtPct(r.votes[id] / r.exprimes)}</td><td class="num">{r.seats[id]}</td></tr>)}</tbody></table></div>
            </Card>
          )}
        </TabPanel>
      )}
      {tab === 'site' && (
        <TabPanel id="site">
          {all.filter((x) => x.urn.type !== 'pluri').length ? all.filter((x) => x.urn.type !== 'pluri').slice(0, 3).map((x) => (
            <Card key={x.urn.id} title={uL(x.urn)} class="mb-16">
              <div class="table-wrap"><table class="table table-compact"><thead><tr><th>Site</th><th class="num">{L('Votants', 'Voters')}</th>{x.order.map((id) => <th key={id} class="num">{UNIONS[id].acr}</th>)}<th class="num">{L('Blancs', 'Blank')}</th></tr></thead><tbody>
                {x.bySite.map((b) => <tr key={b.site.id}><td>{b.site.name}</td><td class="num">{fmtNum(b.votants)}</td>{x.order.map((id) => <td key={id} class="num">{fmtNum(b.votes[id])}</td>)}<td class="num">{fmtNum(b.blanc)}</td></tr>)}
              </tbody></table></div>
            </Card>
          )) : all.map((x) => <Card key={x.urn.id} title={tx(x.urn.college)} class="mb-16">{x.bySite.map((b) => <BarRow key={b.site.id} label={b.site.name} value={b.n} max={x.votants} right={fmtNum(b.n)} />)}</Card>)}
        </TabPanel>
      )}
      {tab === 'pv' && <TabPanel id="pv"><div class="doc" dangerouslySetInnerHTML={{ __html: pvHtml(st, op) }} /></TabPanel>}
    </>
  );
}

// ------------------------------------------------------------------ Journal
function Journal({ op }) {
  const st = useStore();
  const [res, setRes] = useState(null);
  const [all, setAll] = useState(false);
  const list = st.remote.journal.filter((e) => all || e.op === op.id || e.op === '');
  const verify = () => setRes(verifyChain(st.remote.journal));
  const tamper = () => { dispatch('r/journal/tamper', { index: 6 }); setRes(null); toast(L('Entrée n° 7 modifiée', 'Entry 7 modified'), 'warn'); };
  const restore = () => { dispatch('r/journal/restore', {}); setRes(null); toast(L('Journal restauré', 'Log restored'), 'ok'); };
  return (
    <>
      <PageHead title={L('Journal scellé', 'Sealed log')} sub={L('Chaque entrée est chaînée à la précédente', 'Each entry is chained to the previous one')} refs={['6.1.4', '7.2.4']} actions={<>
        <Btn kind="primary" icon="shieldCheck" onClick={verify}>{L('Vérifier l’intégrité', 'Verify integrity')}</Btn>
        <Btn icon="download" onClick={() => downloadJSON('journal-' + op.id + '.json', st.remote.journal)}>{L('Exporter JSON', 'Export JSON')}</Btn>
      </>} />
      <div aria-live="polite">
        {res && <div class="mb-16">{res.ok ? <Note tone="ok" icon="checkCircle"><strong>{L('Chaîne intègre', 'Chain intact')}</strong> · {L(res.count + ' entrées', res.count + ' entries')} · <span class="fp">{shortFp(res.last, 8)}</span></Note> : <Note tone="err" icon="alert"><strong>{L('Altération détectée à l’entrée n° ' + res.at + '.', 'Tampering detected at entry ' + res.at + '.')}</strong> {L(res.reason, /précédente/.test(res.reason) ? 'The link to the previous entry is broken.' : 'The entry no longer matches its hash.')}</Note>}</div>}
      </div>
      <DemoNote>
        <span class="row" style={{ gap: '10px', display: 'inline-flex' }}>{L('Altérez une entrée, puis vérifiez.', 'Tamper with an entry, then verify.')}{!st.remote.tamper ? <Btn size="sm" kind="danger" icon="edit" onClick={tamper}>{L('Simuler une altération', 'Simulate tampering')}</Btn> : <Btn size="sm" icon="refresh" onClick={restore}>{L('Restaurer le journal', 'Restore log')}</Btn>}</span>
      </DemoNote>
      <div class="row mt-16 mb-8"><label class="switch"><input type="checkbox" checked={all} onChange={(e) => setAll(e.currentTarget.checked)} /><span class="sw" aria-hidden="true" /><span>{L('Toutes les opérations', 'All elections')}</span></label></div>
      <div class="table-wrap">
        <table class="table table-compact">
          <thead><tr><th class="num">{L('N°', '#')}</th><th>{L('Horodatage', 'Time')}</th><th>{L('Acteur', 'Actor')}</th><th>Action</th><th>{L('Détail', 'Detail')}</th><th>{L('Empreinte', 'Hash')}</th></tr></thead>
          <tbody>{list.slice().reverse().map((e) => <tr key={e.i} class={res && !res.ok && res.at === e.i ? 'hl' : ''}><td class="num">{e.i}</td><td class="nowrap">{fmtDTS(e.at)}</td><td><div class="strong">{tx(e.actor)}</div><div class="xs muted">{tx(e.role)}</div></td><td>{tx(e.action)}</td><td class="small">{tx(e.detail)}</td><td><span class="fp">{e.hash.slice(0, 10)}</span></td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Procédures et interventions
function Incidents({ op }) {
  const st = useStore();
  const [dual, setDual] = useState(null);
  const procs = [
    [L('Suspension et reprise', 'Suspend and resume'), L('Double signature, message aux électeurs, aucune perte de données', 'Dual signature, voters notified, no data lost')],
    [L('Incidents (ITIL)', 'Incidents (ITIL)'), L('Accusé 10 min, GTI 1 h, GTR 4 h (incident bloquant)', 'Acknowledged in 10 min, response 1 h, fix 4 h (blocking incident)')],
    [L('Continuité (PRA/PCA)', 'Continuity (DRP/BCP)'), L('Bascule automatique, DIMA 30 min, testée avant chaque scrutin', 'Automatic failover, max. 30 min downtime, tested before each election')],
    [L('Information du bureau', 'Station informed'), L('Toute intervention est notifiée au bureau', 'Every intervention is reported to the station')],
  ];
  const dualStatus = (d) => (d.status === 'approved' ? L('Validée', 'Approved') : d.status === 'pending' ? L('En attente', 'Pending') : L('Annulée', 'Cancelled'));
  return (
    <>
      <PageHead title={L('Procédures', 'Procedures')} refs={['3', '6.2.2', '7.2.4']} actions={<>
        {op.status === 'open' && <Btn kind="danger" icon="pause" onClick={() => setDual({ opId: op.id, kind: 'suspend', label: 'Suspension du scrutin « ' + op.name + ' »', reason: 'Procédure d’incident' })}>{L('Suspendre le scrutin', 'Suspend voting')}</Btn>}
        {op.status === 'suspended' && <Btn kind="primary" icon="play" onClick={() => setDual({ opId: op.id, kind: 'resume', label: 'Reprise du scrutin « ' + op.name + ' »' })}>{L('Reprendre le scrutin', 'Resume voting')}</Btn>}
      </>} />
      <div class="grid g2">
        <Card title={L('Procédures documentées', 'Documented procedures')}>
          <KV items={procs} />
        </Card>
        <div class="stack">
          <Card title={L('Interventions', 'Interventions')}>
            {st.remote.interventions.map((x, i) => <div class="member-row" key={i}><div class="grow"><div class="small strong">{tx(x.label)}</div><div class="xs muted">{fmtDT(x.at)}{x.informed ? L(' · bureau informé', ' · station notified') : ''}</div></div></div>)}
          </Card>
          <Card title={L('Doubles signatures', 'Dual signatures')}>
            {st.remote.dual.length ? st.remote.dual.slice().reverse().slice(0, 8).map((d) => <div class="member-row" key={d.id}><div class="grow"><div class="small strong">{tx(d.label)}</div><div class="xs muted">{d.by}{d.by2 ? ' + ' + d.by2 : ''} · {fmtDT(d.at)}</div></div><Chip tone={d.status === 'approved' ? 'ok' : d.status === 'pending' ? 'warn' : 'gray'}>{dualStatus(d)}</Chip></div>) : <Empty icon="users" title={L('Aucune demande', 'No requests')} />}
          </Card>
        </div>
      </div>
      {dual && <DualModal action={dual} me={ME.name} onClose={() => setDual(null)} signers={BUREAU} />}
    </>
  );
}
