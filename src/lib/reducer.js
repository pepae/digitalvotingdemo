// Réducteur d'actions (mutations en place, déterministes à partir de l'action)
import { seedState } from '../data/seed.js';
import { appendEntry } from './journal.js';
import { sha256 } from './sha256.js';
import { BUREAU } from '../data/remote.js';

export const LOCK_THRESHOLD = 5;
const MIN = 60000;

function rj(state, a, e) { appendEntry(state.remote.journal, { at: a.at, op: '', ...e }); }
function sj(state, a, e) { appendEntry(state.seance.journal, { at: a.at, op: '', ...e }); }

const H = {
  'settings/set': (s, p) => { s.settings[p.key] = p.value; },
  // La réinitialisation conserve les préférences d'affichage (langue, accessibilité)
  'demo/reset': (s, p, a) => { const n = seedState(a.at); n.settings = { ...n.settings, ...s.settings }; return n; },
  'auth/login': (s, p, a) => { s.auth[p.key] = { ...p.user, at: a.at }; },
  'auth/logout': (s, p) => { delete s.auth[p.key]; },

  // ---------------- Vote à distance
  'r/voter/fail': (s, p, a) => {
    const v = s.remote.voters[p.voterId];
    v.fails = (v.fails || 0) + 1;
    const thr = (s.remote.security && s.remote.security.threshold) || LOCK_THRESHOLD;
    const lockMin = (s.remote.security && s.remote.security.lockMin) || 30;
    if (v.fails >= thr) {
      v.lockedUntil = a.at + lockMin * MIN;
      s.remote.alerts.unshift({ id: 'al' + a.at, op: p.op, at: a.at, type: 'bruteforce', sev: 'haute', title: 'Force brute', msg: thr + ' échecs consécutifs sur l’identifiant ' + p.masked + '. Compte verrouillé ' + lockMin + ' minutes, déblocage par l’assistance après vérification d’identité.', src: '198.51.100.' + (a.at % 200), status: 'nouvelle', live: true });
      rj(s, a, { actor: 'Système', role: 'Détection', action: 'Alerte : tentatives répétées (force brute)', detail: 'Identifiant ' + p.masked + ' verrouillé ' + lockMin + ' min · bureau alerté en temps réel', op: p.op });
    }
  },
  'r/voter/ok': (s, p) => { const v = s.remote.voters[p.voterId]; v.fails = 0; },
  'r/voter/unlock': (s, p, a) => {
    const v = s.remote.voters[p.voterId]; v.fails = 0; v.lockedUntil = 0;
    rj(s, a, { actor: p.by || 'Assistance', role: 'Opérateur', action: 'Déverrouillage d’un compte électeur après vérification d’identité', detail: p.masked, op: p.op });
  },
  'r/vote': (s, p, a) => {
    const R = s.remote;
    R.myVotes[p.urnId] = { choice: p.choice, receipt: p.receipt, code: p.code, fp: p.fp, at: a.at, voterId: p.voterId, voterFirst: p.first, voterLast: p.last, site: p.site };
    R.extraVotes[p.urnId] = (R.extraVotes[p.urnId] || 0) + 1;
    rj(s, a, { actor: 'Électeur ' + p.masked, role: 'Électeur', action: 'Émargement enregistré', detail: 'Urne ' + R.urns[p.urnId].instance + ' · ' + R.urns[p.urnId].college + ' · accusé ' + p.receipt, op: R.urns[p.urnId].op });
  },
  'r/alert/add': (s, p) => { s.remote.alerts.unshift(p.alert); },
  'r/alert/ack': (s, p, a) => { const x = s.remote.alerts.find((y) => y.id === p.id); if (x) { x.status = p.status || 'acquittée'; x.by = p.by; x.ackAt = a.at; } },
  'r/journal': (s, p, a) => { rj(s, a, p); },
  'r/dual/request': (s, p, a) => { s.remote.dual.push({ ...p, at: a.at, status: 'pending' }); },
  'r/dual/cancel': (s, p) => { const d = s.remote.dual.find((x) => x.id === p.id); if (d) d.status = 'cancelled'; },
  'r/dual/approve': (s, p, a) => {
    const d = s.remote.dual.find((x) => x.id === p.id);
    if (!d || d.status !== 'pending') return;
    d.status = 'approved'; d.by2 = p.by; d.at2 = a.at;
    applyDual(s, d, a);
  },
  'r/op/advanceEnd': (s, p, a) => {
    const op = s.remote.ops[p.opId];
    op.status = 'ended'; op.endedAt = a.at; op.demoEnded = true;
    rj(s, a, { actor: 'Système', role: 'Automate', action: 'Fin de la période de vote (simulation de démonstration)', detail: 'Accès électeurs fermé · en attente de clôture par le bureau', op: op.id });
  },
  'r/op/seal-after': (s, p, a) => {
    const op = s.remote.ops[p.opId];
    op.status = 'sealed-after'; op.sealedAfterAt = a.at;
    op.sealsHistory.push({ at: a.at, label: 'Scellement des urnes et des listes d’émargement après clôture', hash: p.hash });
    rj(s, a, { actor: p.by, role: 'Bureau de vote', action: 'Scellement des urnes et des listes d’émargement', detail: 'Empreinte ' + p.hash.slice(0, 16), op: op.id });
  },
  'r/share': (s, p, a) => {
    const op = s.remote.ops[p.opId];
    op.counting.shares[p.holderId] = a.at;
    const h = BUREAU.find((b) => b.id === p.holderId);
    rj(s, a, { actor: h ? h.name : p.holderId, role: 'Détenteur de clé', action: 'Présentation d’une part de clé (déchiffrement partiel local)', detail: Object.keys(op.counting.shares).length + ' / ' + op.threshold + ' parts requises', op: op.id });
  },
  'r/count/done': (s, p, a) => {
    const op = s.remote.ops[p.opId];
    op.counting.status = 'done'; op.status = 'counted'; op.countedAt = a.at;
    op.sealsHistory.push({ at: a.at, label: 'Scellement des résultats et des preuves de déchiffrement', hash: p.hash });
    rj(s, a, { actor: 'Bureau de vote', role: 'Bureau de vote', action: 'Dépouillement réalisé (déchiffrement à seuil du total agrégé)', detail: 'Preuves de déchiffrement publiées · empreinte ' + p.hash.slice(0, 16), op: op.id });
  },
  'r/op/archive': (s, p, a) => {
    const op = s.remote.ops[p.opId];
    op.status = 'archived'; op.archivedAt = a.at;
    rj(s, a, { actor: p.by, role: 'Bureau de vote', action: 'Scellement final et archivage', detail: 'Conservation sous scellés 2 ans · purge automatique programmée', op: op.id });
  },
  'r/check': (s, p, a) => {
    s.remote.checks.unshift({ at: a.at, op: p.opId, kind: p.kind, ok: p.ok, label: p.label, by: p.by });
    rj(s, a, { actor: p.by || 'Système', role: p.kind === 'manual' ? 'Bureau de vote' : 'Automate', action: p.kind === 'manual' ? 'Contrôle d’intégrité déclenché manuellement' : 'Contrôle d’intégrité automatique', detail: p.ok ? 'Bulletins = émargements · scellés et journal intègres' : 'Anomalie détectée : ' + p.label, op: p.opId });
  },
  'r/reissue': (s, p, a) => {
    s.remote.reissues.unshift({ ...p.req, at: a.at });
    if (p.voterId) { const v = s.remote.voters[p.voterId]; v.reissued = true; v.fails = 0; v.lockedUntil = 0; }
    s.remote.alerts.unshift({ id: 'al' + a.at, op: p.op, at: a.at, type: 'reissue', sev: 'info', title: 'Réémission d’identifiants', msg: 'Demande en ligne après vérification d’identité. ' + p.req.channel + '. Anciens identifiants révoqués.', src: 'Portail électeur', status: 'nouvelle', live: true });
    rj(s, a, { actor: 'Électeur ' + (p.masked || ''), role: 'Électeur', action: 'Réémission sécurisée des identifiants', detail: p.req.channel + ' · anciens identifiants révoqués', op: p.op });
  },
  'r/draft/add': (s, p, a) => {
    s.remote.drafts.unshift({ ...p.draft, at: a.at, status: 'pending' });
    rj(s, a, { actor: p.by, role: 'Administrateur', action: 'Création d’un scrutin (en attente de double validation)', detail: p.draft.name, op: '' });
  },
  'r/failover': (s, p, a) => {
    const f = s.remote.failover;
    f.history.unshift({ at: a.at, dur: p.dur, ok: true, label: p.label });
    f.lastTest = a.at; f.lastDuration = p.dur;
    s.remote.interventions.unshift({ at: a.at, label: p.label, informed: true });
    rj(s, a, { actor: p.by, role: 'Administrateur', action: 'Test de bascule vers le dispositif de secours', detail: 'Bascule automatique en ' + p.dur + ' s · aucune perte de données · bureaux de vote informés', op: '' });
  },
  'r/journal/tamper': (s, p) => {
    const e = s.remote.journal[p.index];
    if (!e) return;
    s.remote.tamper = { index: p.index, detail: e.detail };
    e.detail = e.detail + ' [modifié]';
  },
  'r/journal/restore': (s) => {
    const t = s.remote.tamper;
    if (!t) return;
    s.remote.journal[t.index].detail = t.detail;
    s.remote.tamper = null;
  },
  'r/test/add': (s, p, a) => {
    s.remote.tests.unshift({ ...p.test, at: a.at });
    rj(s, a, { actor: p.by, role: 'Administrateur', action: 'Vote test exécuté', detail: p.test.label + ' · ' + p.test.voters + ' votants test · résultats conformes', op: 'test26' });
  },
  'r/ticket': (s, p, a) => {
    s.remote.tickets.unshift({ ...p.ticket, at: a.at });
  },
  'r/security/set': (s, p, a) => {
    s.remote.security[p.key] = p.value;
    rj(s, a, { actor: p.by, role: 'Administrateur', action: 'Modification de la politique de sécurité', detail: p.label + ' : ' + p.display, op: '' });
  },
  'r/import/add': (s, p, a) => {
    s.remote.imports.push(p.imp);
    rj(s, a, { actor: p.by, role: 'Administrateur', action: 'Import contrôlé de la liste électorale v' + p.imp.v, detail: p.imp.rows + ' lignes · ' + p.imp.err + ' anomalie(s) · empreinte ' + p.imp.hash.slice(0, 16), op: 'ep26' });
  },
  'r/exchange/add': (s, p, a) => {
    s.remote.exchanges.unshift({ ...p.x, at: a.at });
    rj(s, a, { actor: p.by, role: 'Administrateur', action: 'Dépôt sur la plateforme d’échange sécurisée', detail: p.x.name + ' · empreinte ' + p.x.hash.slice(0, 16), op: '' });
  },
  'r/import': (s, p, a) => {
    rj(s, a, { actor: p.by, role: 'Administrateur', action: 'Import contrôlé d’un fichier', detail: p.detail, op: p.op || '' });
  },

  // ---------------- Vote en séance
  's/seance/open': (s, p, a) => {
    const se = s.seance.seances[p.sid];
    se.status = 'live'; se.openedAt = a.at;
    sj(s, a, { actor: p.by, role: 'Organisateur', action: 'Ouverture de la séance', detail: se.title, op: p.sid });
  },
  's/seance/close': (s, p, a) => {
    const se = s.seance.seances[p.sid];
    se.status = 'closed'; se.closedAt = a.at;
    sj(s, a, { actor: p.by, role: 'Organisateur', action: 'Clôture de la séance', detail: 'Procès-verbal généré automatiquement', op: p.sid });
  },
  's/presence': (s, p, a) => {
    const se = s.seance.seances[p.sid];
    const m = se.members.find((x) => x.id === p.memberId);
    if (!m) return;
    m.present = p.present;
    if (p.present) { m.arrivedAt = a.at; m.mode = p.mode || m.mode || 'salle'; m.leftAt = null; if (m.absence === 'Non arrivé·e') m.absence = null; }
    else { m.leftAt = a.at; }
    se.log = se.log || [];
    se.log.unshift({ at: a.at, memberId: m.id, name: m.name, kind: p.present ? 'arrivée' : 'départ', mode: m.mode });
    sj(s, a, { actor: m.name, role: 'Participant', action: p.present ? 'Émargement à l’arrivée' : 'Départ en cours de séance', detail: (p.present ? (m.mode === 'visio' ? 'Visioconférence' : 'Salle') : 'Impact immédiat sur le quorum'), op: p.sid });
  },
  's/presence/bulk': (s, p, a) => {
    const se = s.seance.seances[p.sid];
    se.log = se.log || [];
    for (const id of p.ids) {
      const m = se.members.find((x) => x.id === id);
      if (!m) continue;
      m.present = p.present;
      if (p.present) { m.arrivedAt = a.at; m.leftAt = null; } else m.leftAt = a.at;
      se.log.unshift({ at: a.at, memberId: m.id, name: m.name, kind: p.present ? 'arrivée' : 'départ', mode: m.mode });
    }
    sj(s, a, { actor: p.by || 'Organisateur', role: 'Organisateur', action: p.present ? 'Retour de ' + p.ids.length + ' membres' : 'Départ de ' + p.ids.length + ' membres', detail: 'Quorum recalculé en temps réel', op: p.sid });
  },
  's/current': (s, p) => { s.seance.seances[p.sid].current = p.itemId; },
  's/item/done': (s, p, a) => { const se = s.seance.seances[p.sid]; se.done[p.itemId] = a.at; },
  's/vote/open': (s, p, a) => {
    const key = p.sid + ':' + p.itemId + ':' + p.round;
    s.seance.votes[key] = { sid: p.sid, itemId: p.itemId, round: p.round, status: 'open', openedAt: a.at, resumedAt: a.at, activeMs: 0, duration: p.duration, plan: p.plan, real: {}, options: p.options || null, withdrawn: p.withdrawn || [], expected: p.expected, by: p.by, tab: p.tab || null };
    const se = s.seance.seances[p.sid];
    se.current = p.itemId;
    sj(s, a, { actor: p.by, role: 'Organisateur', action: 'Ouverture du vote' + (p.round === 2 ? ' (second tour)' : ''), detail: p.label, op: p.sid });
  },
  's/vote/cast': (s, p, a) => {
    const v = s.seance.votes[p.key];
    if (!v || v.status !== 'open') return;
    const prev = v.real[p.voterKey];
    v.real[p.voterKey] = { memberId: p.memberId, proxyFor: p.proxyFor, weight: p.weight || 1, choice: p.choice, at: a.at, receipt: p.receipt, changes: prev ? (prev.changes || 0) + 1 : 0, firstAt: prev ? prev.firstAt : a.at };
    sj(s, a, { actor: p.name, role: 'Participant', action: prev ? 'Modification du vote avant clôture' : 'Vote enregistré (émargement horodaté)', detail: (p.proxyFor ? 'Au titre d’une procuration · ' : '') + 'Accusé ' + p.receipt, op: v.sid });
  },
  's/vote/suspend': (s, p, a) => {
    const v = s.seance.votes[p.key]; if (!v || v.status !== 'open') return;
    v.activeMs += a.at - v.resumedAt; v.status = 'suspended'; v.resumedAt = null;
    sj(s, a, { actor: p.by, role: 'Organisateur', action: 'Suspension du vote', detail: p.reason || '', op: v.sid });
  },
  's/vote/resume': (s, p, a) => {
    const v = s.seance.votes[p.key]; if (!v || v.status !== 'suspended') return;
    v.status = 'open'; v.resumedAt = a.at;
    sj(s, a, { actor: p.by, role: 'Organisateur', action: 'Reprise du vote', detail: '', op: v.sid });
  },
  's/vote/extend': (s, p, a) => {
    const v = s.seance.votes[p.key]; if (!v) return;
    v.duration += p.secs;
    sj(s, a, { actor: p.by, role: 'Organisateur', action: 'Prolongation du vote', detail: '+' + p.secs + ' s', op: v.sid });
  },
  's/vote/close': (s, p, a) => {
    const v = s.seance.votes[p.key]; if (!v) return;
    if (v.status === 'open') v.activeMs += a.at - v.resumedAt;
    v.finalElapsed = p.finalElapsed != null ? p.finalElapsed : v.activeMs;
    v.status = 'closed'; v.closedAt = a.at; v.result = p.result; v.final = p.final;
    const se = s.seance.seances[v.sid];
    if (!(p.result && p.result.secondRound)) se.done[v.itemId] = a.at;
    sj(s, a, { actor: p.by, role: 'Organisateur', action: 'Clôture du vote et proclamation', detail: p.result ? p.result.text : '', op: v.sid });
  },
  's/vote/cancel': (s, p, a) => {
    const v = s.seance.votes[p.key]; if (!v) return;
    if (v.status === 'open') v.activeMs += a.at - v.resumedAt;
    v.status = 'cancelled'; v.cancelledAt = a.at; v.finalElapsed = v.activeMs;
    sj(s, a, { actor: p.by, role: 'Organisateur', action: 'Annulation du vote', detail: p.reason || 'Le vote pourra être relancé', op: v.sid });
    delete s.seance.votes[p.key];
  },
  's/pv/seal': (s, p, a) => {
    s.seance.pv[p.sid] = { ...(s.seance.pv[p.sid] || {}), sealedAt: a.at, hash: p.hash, token: p.token };
    sj(s, a, { actor: p.by, role: 'Organisateur', action: 'Scellement et horodatage qualifié du procès-verbal', detail: 'Empreinte ' + p.hash.slice(0, 16) + ' · jeton ' + p.token, op: p.sid });
  },
  's/pv/transmit': (s, p, a) => {
    const pv = s.seance.pv[p.sid] = s.seance.pv[p.sid] || {};
    pv.transmissions = pv.transmissions || [];
    pv.transmissions.unshift({ at: a.at, target: p.target, ack: p.ack });
    sj(s, a, { actor: p.by, role: 'Organisateur', action: 'Transmission du procès-verbal', detail: p.target + ' · accusé ' + p.ack, op: p.sid });
  },
  's/seance/create': (s, p, a) => {
    s.seance.seances[p.seance.id] = p.seance;
    sj(s, a, { actor: p.by, role: 'Organisateur', action: 'Création de la séance', detail: p.seance.title, op: p.seance.id });
  },
  's/item/add': (s, p, a) => {
    const se = s.seance.seances[p.sid];
    se.agenda.splice(se.agenda.length - (se.agenda[se.agenda.length - 1] && se.agenda[se.agenda.length - 1].kind === 'info' ? 1 : 0), 0, p.item);
    sj(s, a, { actor: p.by, role: 'Organisateur', action: 'Ajout d’un point à l’ordre du jour', detail: p.item.title, op: p.sid });
  },
  's/settings': (s, p) => { const se = s.seance.seances[p.sid]; se[p.key] = p.value; },
  's/journal': (s, p, a) => { sj(s, a, p); },
  's/alert': (s, p, a) => {
    if (!s.seance.alerts) s.seance.alerts = [];
    s.seance.alerts.unshift({ id: 'sa' + a.at, at: a.at, status: 'nouvelle', ...p.alert });
    sj(s, a, { actor: 'Système', role: 'Détection', action: 'Alerte : ' + p.alert.title, detail: p.alert.detail, op: p.alert.sid || '' });
  },
  's/alert/ack': (s, p, a) => { const x = (s.seance.alerts || []).find((y) => y.id === p.id); if (x) { x.status = 'acquittée'; x.ackBy = p.by; x.ackAt = a.at; } sj(s, a, { actor: p.by, role: 'Administrateur', action: 'Alerte acquittée', detail: x ? x.title : '', op: x ? x.sid : '' }); },
  's/security/set': (s, p, a) => {
    if (!s.seance.security) s.seance.security = { threshold: 3, lockMin: 5 };
    s.seance.security[p.key] = p.value;
    sj(s, a, { actor: p.by, role: 'Administrateur', action: 'Paramètre de sécurité modifié', detail: p.label + ' : ' + p.value, op: '' });
  },
  'maintenance/set': (s, p, a) => {
    s.maintenance = p.m ? { ...p.m, at: a.at } : null;
    const e = { actor: p.by, role: 'Administrateur', action: p.m ? 'Annonce d’une maintenance programmée à tous les utilisateurs' : 'Retrait de l’annonce de maintenance', detail: p.m ? p.m.msg : '', op: '' };
    rj(s, a, e); sj(s, a, e);
  },
  'r/convocation': (s, p, a) => {
    if (!s.remote.convocations) s.remote.convocations = {};
    s.remote.convocations[p.opId] = a.at;
    rj(s, a, { actor: p.by, role: 'Administrateur', action: 'Convocation des détenteurs de parts de clé au dépouillement', detail: p.n + ' détenteurs convoqués (courriel et SMS)', op: p.opId });
  },
  'r/branding/set': (s, p, a) => {
    s.remote.branding = { ...(s.remote.branding || {}), ...p.branding };
    rj(s, a, { actor: p.by, role: 'Administrateur', action: 'Personnalisation des portails mise à jour', detail: Object.keys(p.branding).join(', '), op: '' });
  },
  's/ticket': (s, p, a) => { s.seance.tickets.unshift({ ...p.ticket, at: a.at }); },
};

function applyDual(s, d, a) {
  const R = s.remote;
  const op = d.opId ? R.ops[d.opId] : null;
  const who = d.by + ' + ' + d.by2;
  if (d.kind === 'suspend' && op) { op.status = 'suspended'; op.suspendedAt = a.at; R.interventions.unshift({ at: a.at, label: 'Suspension du scrutin : ' + (d.reason || 'procédure d’incident'), informed: true }); }
  if (d.kind === 'resume' && op) { op.status = op.demoEnded ? 'ended' : 'open'; op.resumedAt = a.at; }
  if (d.kind === 'close' && op) { op.status = 'closed'; op.closedAt = a.at; }
  if (d.kind === 'publish' && op) { op.status = 'published'; op.publishedAt = a.at; }
  if (d.kind === 'draft') { const x = R.drafts.find((y) => y.id === d.target); if (x) x.status = 'validated'; }
  // Suspension d'une seule urne sans affecter les autres scrutins (objectif CNIL 2-05)
  if (d.kind === 'suspend-urn' && R.urns[d.target]) { R.urns[d.target].suspendedAt = a.at; R.interventions.unshift({ at: a.at, label: 'Suspension de l’urne ' + R.urns[d.target].instance + ' · ' + R.urns[d.target].college + ' (les autres urnes restent ouvertes)', informed: true }); }
  if (d.kind === 'resume-urn' && R.urns[d.target]) { delete R.urns[d.target].suspendedAt; R.urns[d.target].resumedAt = a.at; }
  appendEntry(R.journal, { at: a.at, actor: who, role: 'Double signature', action: d.label, detail: d.reason || 'Action critique validée par deux membres habilités', op: d.opId || '' });
}

export function reduce(state, action) {
  const h = H[action.type];
  if (!h) return state;
  const out = h(state, action.payload || {}, action);
  return out || state;
}

export const hashOf = (x) => sha256(typeof x === 'string' ? x : JSON.stringify(x));
