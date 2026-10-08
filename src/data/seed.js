// État initial de la démonstration (dates relatives au moment de l'initialisation).
import { dayAt } from '../lib/format.js';
import { sha256 } from '../lib/sha256.js';
import { appendEntry } from '../lib/journal.js';
import { buildUrns, VOTERS, BUREAU, SITES, CME_COLLEGES } from './remote.js';
import { buildCmeMembers, buildGipMembers, buildSmallMembers, cmeAgenda, gipAgenda, csAgenda, csirmtAgenda } from './seance.js';

export const SEED_VERSION = 10;
const H = 3600000, MIN = 60000;

export function seedState(now) {
  const urns = buildUrns();
  const ep26open = dayAt(now, -8, 8, 0);
  const ep26close = dayAt(ep26open, 21, 17, 0);
  const cmeOpen = dayAt(now, -11, 8, 0);
  const cmeClose = dayAt(cmeOpen, 21, 17, 0);
  const testAt = dayAt(now, -12, 14, 0);

  for (const u of Object.values(urns)) u.pkFp = sha256('pk-' + u.id + '-' + ep26open);

  const ops = {
    ep26: {
      id: 'ep26', name: 'Élections professionnelles 2026', name_en: '2026 staff representative elections', short: 'EP 2026',
      desc: 'CSE et F3SCT · 3 collèges × 2 instances · 6 urnes distinctes', level: 3, type: 'list', mode: 'Scrutin de liste à un tour, représentation proportionnelle à la plus forte moyenne',
      open: ep26open, close: ep26close, status: 'open', urns: ['cse-a', 'cse-b', 'cse-c', 'f3-a', 'f3-b', 'f3-c'], electorate: 8500,
      holders: ['hg', 'nb', 'tl', 'sm', 'kh'], threshold: 3, ceremonyAt: dayAt(now, -10, 10, 0),
      enrol: { start: dayAt(now, -15, 8), end: dayAt(now, -9, 20) }, reminders: [7, 14, 19],
      counting: { shares: {}, status: 'none' }, scenario: 'DQE scénario 3 (SCN-EP-003)',
    },
    cme26: {
      id: 'cme26', name: 'Élections à la CME 2026', name_en: '2026 Medical Committee (CME) elections', short: 'CME 2026',
      desc: '7 collèges · multi-sites · scrutin plurinominal majoritaire à deux tours', level: 2, type: 'pluri', mode: 'Scrutin plurinominal majoritaire à deux tours (panachage autorisé dans la limite des sièges)',
      open: cmeOpen, close: cmeClose, status: 'open', urns: CME_COLLEGES.map((c) => 'cme-' + c.id), electorate: 2500,
      holders: ['hg', 'nb', 'tl'], threshold: 2, ceremonyAt: dayAt(now, -13, 11, 0), reminders: [7, 14, 19],
      counting: { shares: {}, status: 'none' }, scenario: 'DQE scénario 2 (SCN-CME-002)',
    },
    test26: {
      id: 'test26', name: 'Vote test · Élections professionnelles 2026', name_en: 'Test vote', short: 'Vote test',
      desc: 'Vote test réalisé en présence des organisations syndicales (24 votants test)', level: 3, type: 'list', mode: 'Scrutin de liste à un tour (jeu d’essai contrôlé)',
      open: testAt, close: testAt + 2 * H, status: 'published', urns: ['test-a'], electorate: 24, holders: ['hg', 'nb', 'tl', 'sm', 'kh'], threshold: 3,
      ceremonyAt: testAt - H, closedAt: testAt + 2 * H, countedAt: testAt + 2 * H + 20 * MIN, publishedAt: testAt + 2 * H + 35 * MIN,
      counting: { shares: { hg: testAt + 2 * H + 5 * MIN, nb: testAt + 2 * H + 7 * MIN, sm: testAt + 2 * H + 9 * MIN }, status: 'done' }, scenario: 'Recette avant scrutin',
    },
  };
  for (const op of Object.values(ops)) {
    op.seals = {
      system: sha256('system-v2026.10-' + op.id),
      lists: sha256('lists-' + op.id + JSON.stringify(op.urns)),
      electors: sha256('electors-v3-' + op.id),
      schedule: sha256('schedule-' + op.id + op.open + op.close),
    };
    op.sealHash = sha256(Object.values(op.seals).join(''));
    op.sealsHistory = [{ at: op.ceremonyAt + 25 * MIN, label: 'Scellement initial (système, listes, électeurs, horaires)', hash: op.sealHash }];
  }
  ops.ep26.sealsHistory.push({ at: ep26open - 2 * MIN, label: 'Contrôle de vacuité avant ouverture (6 urnes vides, 0 émargement)', hash: sha256('vacuite-ep26') });
  for (let d = 1; d <= 7; d += 3) ops.ep26.sealsHistory.push({ at: dayAt(ep26open, d, 0, 5), label: 'Scellement intermédiaire quotidien des urnes', hash: sha256('inter-ep26-' + d) });

  const journal = [];
  const J = (at, actor, role, action, detail, op = 'ep26') => appendEntry(journal, { at, actor, role, action, detail, op });
  J(dayAt(now, -45, 9, 12), 'Paul Renaud', 'Administrateur', 'Création de l’opération électorale', 'Élections professionnelles 2026 · niveau de sécurité 3 (délibération CNIL n° 2026-045)');
  J(dayAt(now, -38, 10, 3), 'Paul Renaud', 'Administrateur', 'Import de la liste électorale v1', '8 531 lignes · empreinte ' + sha256('ev1').slice(0, 16));
  J(dayAt(now, -34, 15, 40), 'Paul Renaud, Hélène Garnier', 'Double signature', 'Paramétrage des 6 urnes validé', '3 collèges × 2 instances (CSE, F3SCT) · clés distinctes par urne');
  J(dayAt(now, -30, 11, 21), 'Paul Renaud', 'Administrateur', 'Import de la liste électorale v2', '8 507 lignes · 24 rectifications après réclamations');
  J(dayAt(now, -26, 17, 0), 'Aline Caron', 'Opératrice', 'Dépôt des candidatures enregistré', '4 listes CSE, 4 listes F3SCT (3 en catégorie B) · professions de foi et logos');
  J(dayAt(now, -25, 10, 30), 'Hélène Garnier', 'Présidente', 'Tirage au sort public de l’ordre d’affichage des listes', 'En présence des délégués de liste');
  J(dayAt(now, -21, 16, 12), 'Paul Renaud, Hélène Garnier', 'Double signature', 'Liste électorale v3 définitive', '8 500 électeurs · empreinte ' + sha256('electors-v3-ep26').slice(0, 16));
  J(dayAt(now, -19, 9, 0), 'Aline Caron', 'Opératrice', 'Envoi des identifiants par courrier postal', '8 500 plis remis au routeur');
  J(dayAt(now, -17, 9, 0), 'Aline Caron', 'Opératrice', 'Envoi des mots de passe (SMS ou courriel)', 'Canal distinct de celui de l’identifiant');
  J(dayAt(now, -16, 18, 20), 'Cabinet Démo-Expertise', 'Expert indépendant', 'Rapport d’expertise remis', 'Solution conforme · aucune réserve bloquante');
  J(dayAt(now, -15, 8, 0), 'Système', 'Automate', 'Ouverture de la période d’enrôlement (application d’authentification)', 'Niveau 3 · enrôlement préalable obligatoire');
  J(dayAt(now, -14, 14, 0), 'Hélène Garnier', 'Présidente', 'Formation des membres du bureau de vote', 'Feuille d’émargement de la formation archivée');
  J(testAt, 'Hélène Garnier', 'Présidente', 'Vote test en présence des organisations syndicales', '24 votants test · résultats conformes au jeu d’essai', 'test26');
  J(testAt + 3 * H, 'Paul Renaud', 'Administrateur', 'Réinitialisation de l’environnement de test', 'Urnes de production vierges confirmées', 'test26');
  J(ops.ep26.ceremonyAt, 'Hélène Garnier + 4 assesseurs', 'Bureau de vote', 'Cérémonie des clés : génération distribuée', '5 détenteurs · seuil 3 · 6 clés publiques publiées');
  J(ops.ep26.ceremonyAt + 25 * MIN, 'Bureau de vote', 'Bureau de vote', 'Scellement du système, des listes et des horaires', 'Empreinte ' + ops.ep26.sealHash.slice(0, 16));
  J(dayAt(now, -9, 20, 0), 'Système', 'Automate', 'Clôture de l’enrôlement', '96,4 % des électeurs enrôlés · les autres utiliseront l’assistance');
  J(ep26open - 2 * MIN, 'Système', 'Automate', 'Contrôle de vacuité avant ouverture', '6 urnes vides · 0 émargement (CNIL objectif 1-10)');
  J(ep26open, 'Système', 'Automate', 'Ouverture du scrutin', 'Dispositif principal actif · dispositif de secours synchronisé');
  J(dayAt(now, -7, 21, 14), 'Système', 'Détection', 'Alerte : tentatives répétées (force brute)', 'Identifiant EP26-••••-1182 verrouillé 30 min · bureau alerté');
  J(dayAt(now, -6, 3, 2), 'Système', 'Détection', 'Alerte : connexion depuis une localisation inhabituelle', 'Connexion hors UE bloquée · identifiant EP26-••••-0457');
  J(dayAt(now, -5, 10, 0), 'Aline Caron', 'Opératrice', 'Réémission d’identifiants (3 demandes)', 'Vérification d’identité · envoi par canaux séparés');
  J(dayAt(now, -1, 8, 0), 'Système', 'Automate', 'Relance automatique J+7 des non-votants', 'SMS et courriel · aucune donnée de vote');
  J(dayAt(now, 0, 7, 30) > now ? now - 2 * H : dayAt(now, 0, 7, 30), 'Système', 'Automate', 'Contrôle d’intégrité automatique', 'Bulletins = émargements sur les 6 urnes · scellés intègres');
  J(cmeOpen, 'Système', 'Automate', 'Ouverture du scrutin', 'Élections CME 2026 · 7 urnes', 'cme26');
  // tri chronologique (le chaînage est recalculé)
  const sorted = journal.slice().sort((a, b) => a.at - b.at);
  const chained = [];
  for (const e of sorted) appendEntry(chained, { at: e.at, actor: e.actor, role: e.role, action: e.action, detail: e.detail, op: e.op });

  const alerts = [
    { id: 'a1', op: 'ep26', at: dayAt(now, -7, 21, 14), type: 'bruteforce', sev: 'haute', title: 'Force brute', msg: '6 échecs consécutifs sur l’identifiant EP26-••••-1182. Compte verrouillé 30 minutes.', src: '198.51.100.24', status: 'traitée', by: 'Aline Caron' },
    { id: 'a2', op: 'ep26', at: dayAt(now, -6, 3, 2), type: 'geo', sev: 'haute', title: 'Géolocalisation inhabituelle', msg: 'Connexion hors Union européenne bloquée pour l’identifiant EP26-••••-0457. L’électeur a été contacté.', src: '203.0.113.77', status: 'traitée', by: 'Hélène Garnier' },
    { id: 'a3', op: 'ep26', at: dayAt(now, -2, 12, 31), type: 'reissue', sev: 'info', title: 'Réémission d’identifiants', msg: 'Réémission après vérification d’identité (perte du courrier). Anciens identifiants révoqués.', src: 'Assistance', status: 'traitée', by: 'Aline Caron' },
    { id: 'a4', op: 'ep26', at: Math.min(now - 47 * MIN, dayAt(now, 0, 9, 41)), type: 'usurpation', sev: 'moyenne', title: 'Usurpation suspectée', msg: 'Un même terminal a été utilisé pour 4 identifiants distincts en 10 minutes (Site des Tilleuls). Vérification en cours avec l’encadrement.', src: '192.0.2.18', status: 'nouvelle' },
  ];

  const R = {
    ops, urns,
    voters: Object.fromEntries(Object.values(VOTERS).map((v) => [v.id, { fails: 0, lockedUntil: 0, reissued: false }])),
    myVotes: {}, extraVotes: {}, alerts, journal: chained, dual: [], checks: [
      { at: now - 4 * MIN, op: 'ep26', kind: 'auto', ok: true, label: 'Contrôle automatique (toutes les 5 minutes)' },
      { at: now - 9 * MIN, op: 'ep26', kind: 'auto', ok: true, label: 'Contrôle automatique (toutes les 5 minutes)' },
    ],
    reissues: [
      { id: 'r1', at: dayAt(now, -5, 9, 12), who: 'Agent catégorie C · Les Cèdres', reason: 'Courrier non reçu (NPAI)', channel: 'Identifiant par SMS + mot de passe par courriel', status: 'Envoyé' },
      { id: 'r2', at: dayAt(now, -5, 9, 40), who: 'Agent catégorie A · Hôpital Nord', reason: 'Mot de passe perdu', channel: 'Courrier postal', status: 'Distribué' },
      { id: 'r3', at: dayAt(now, -2, 12, 31), who: 'Agent catégorie B · Centre Pasteur', reason: 'Perte du courrier', channel: 'Identifiant par courriel + mot de passe par SMS', status: 'Envoyé' },
    ],
    tickets: [
      { id: 'INC-26-0412', at: dayAt(now, -6, 3, 6), sev: 'Majeur', title: 'Lenteurs ponctuelles du serveur SMS (opérateur B)', status: 'Résolu', gti: '18 min', gtr: '2 h 10', ack: '3 min' },
      { id: 'DEM-26-0420', at: dayAt(now, -3, 11, 2), sev: 'Mineur', title: 'Demande d’ajout d’un membre observateur', status: 'Résolu', gti: '35 min', gtr: '3 h', ack: '2 min' },
    ],
    failover: { active: 'principal', lastTest: dayAt(now, -13, 22, 0), lastDuration: 41, history: [{ at: dayAt(now, -13, 22, 0), dur: 41, ok: true, label: 'Test de bascule planifié (PRA)' }, { at: dayAt(now, -40, 22, 0), dur: 47, ok: true, label: 'Test de bascule planifié (PRA)' }] },
    drafts: [],
    tests: [{ at: testAt, op: 'test26', voters: 24, ok: true, label: 'Vote test avec les organisations syndicales' }],
    interventions: [
      { at: dayAt(now, -13, 22, 0), label: 'Test de bascule PRA (période pré-électorale, planifié)', informed: true },
      { at: dayAt(now, -6, 3, 6), label: 'Bascule vers l’opérateur SMS secondaire (incident fournisseur)', informed: true },
    ],
    tamper: null,
    branding: { preset: 'defaut', logo: 'building' },
    security: { threshold: 5, lockMin: 30, geo: true, usurp: true, countries: 'Union européenne', alertSms: true, alertMail: true, sessionMin: 15 },
    imports: [
      { v: 1, at: dayAt(now, -38, 10, 3), rows: 8531, dup: 19, err: 4, status: 'Remplacée', hash: sha256('ev1') },
      { v: 2, at: dayAt(now, -30, 11, 21), rows: 8507, dup: 0, err: 7, status: 'Remplacée', hash: sha256('ev2') },
      { v: 3, at: dayAt(now, -21, 16, 12), rows: 8500, dup: 0, err: 0, status: 'Définitive (double signature)', hash: sha256('electors-v3-ep26') },
    ],
    exchanges: [
      { id: 'x1', at: dayAt(now, -38, 9, 55), dir: 'in', name: 'liste_electorale_v1.csv', size: '1,2 Mo', by: 'DRH (Paul Renaud)', hash: sha256('ev1'), status: 'Contrôlé' },
      { id: 'x2', at: dayAt(now, -26, 16, 40), dir: 'in', name: 'candidatures_et_professions_de_foi.zip', size: '18,4 Mo', by: 'DRH (Paul Renaud)', hash: sha256('cand'), status: 'Contrôlé' },
      { id: 'x3', at: dayAt(now, -21, 16, 5), dir: 'in', name: 'liste_electorale_v3_definitive.csv', size: '1,2 Mo', by: 'DRH (Paul Renaud)', hash: sha256('electors-v3-ep26'), status: 'Validé (double signature)' },
      { id: 'x4', at: testAt + 3 * H, dir: 'out', name: 'pv_recette_vote_test.pdf', size: '214 Ko', by: 'Plateforme', hash: sha256('pvtest'), status: 'Remis' },
    ],
  };

  // ------------------------------------------------------------ Vote en séance
  const sStart = Math.floor((now - 22 * MIN) / (5 * MIN)) * 5 * MIN;
  const cmeMembers = buildCmeMembers();
  for (const m of cmeMembers) if (m.present) m.arrivedAt = sStart - Math.floor(((m.id.charCodeAt(1) * 37) % 13) * MIN);
  const seances = {
    cme: { id: 'cme', instance: 'cme', title: 'Commission médicale d’établissement · séance plénière', short: 'CME', date: sStart, place: 'Salle du conseil, Hôpital Bellevue · hybride (Microsoft Teams)', visio: 'Microsoft Teams', status: 'live', openedAt: sStart, pin: '482615', president: 'lmercier', secretary: 'Mme Claire Fontaine', proxiesCountForQuorum: false, showPartial: false, weighted: false, agenda: cmeAgenda(), members: cmeMembers, current: 'p2', done: { p1: sStart + 3 * MIN }, scenario: 'Instance d’établissement de santé' },
    csirmt: { id: 'csirmt', instance: 'csirmt', title: 'CSIRMT · séance ordinaire', short: 'CSIRMT', date: sStart + 10 * MIN, place: 'Salle B, Centre Pasteur · présentiel', visio: null, status: 'live', openedAt: sStart + 10 * MIN, pin: '730914', president: 'csirmt0', secretary: 'Direction des soins', weighted: false, agenda: csirmtAgenda(), members: buildSmallMembers('csirmt', 30, 27, ['Cadre de santé', 'Infirmier·e', 'Masseur-kinésithérapeute', 'Manipulateur·rice radio', 'Aide-soignant·e']), current: 'n1', done: {} },
    gip: { id: 'gip', instance: 'gip', title: 'Assemblée générale du GIP Montclair Santé Numérique', short: 'AG GIP', date: dayAt(now, 3, 10, 0), place: 'Siège du GIP · hybride (Zoom)', visio: 'Zoom', status: 'planned', pin: '615208', president: 'g0', secretary: 'Direction du GIP', weighted: true, proxiesCountForQuorum: true, agenda: gipAgenda(), members: buildGipMembers(), current: 'g1', done: {}, scenario: 'Vote pondéré (droits de vote statutaires)' },
    cs: { id: 'cs', instance: 'cs', title: 'Conseil de surveillance', short: 'CS', date: dayAt(now, 9, 17, 30), place: 'Salle du conseil · hybride (Cisco Webex)', visio: 'Cisco Webex', status: 'planned', pin: '204857', president: 'cs0', secretary: 'Direction générale', weighted: false, agenda: csAgenda(), members: buildSmallMembers('cs', 15, 15, ['Représentant·e des collectivités', 'Personnalité qualifiée', 'Représentant·e des personnels', 'Représentant·e des usagers']), current: 'c1', done: {} },
    test: { id: 'test', instance: 'cme', test: true, title: 'Session de test avec l’organisatrice · prise en main', short: 'Session de test', date: dayAt(now, -10, 15, 0), place: 'Visioconférence (Microsoft Teams) · séance fictive', visio: 'Microsoft Teams', status: 'closed', openedAt: dayAt(now, -10, 15, 0), closedAt: dayAt(now, -10, 15, 40), pin: null, president: 'test0', secretary: 'Mme Claire Fontaine', weighted: false, agenda: [
      { id: 't1', num: '1', title: 'Vote d’essai nominatif : approbation d’un texte fictif', kind: 'vote', vote: { mode: 'nominatif', type: 'resolution', expr: ['pour', 'contre', 'abstention'], majority: 'simple', abstNotCounted: true, casting: true, duration: 60, dist: { pour: 0.8, contre: 0, abstention: 0.2 } } },
      { id: 't2', num: '2', title: 'Élection d’essai à bulletin secret', kind: 'election', vote: { mode: 'secret', type: 'uninominal', rounds: 2, majority: 'absolue-relative', duration: 60, candidates: [{ id: 'tA', name: 'Candidat·e A (fictif)', spec: 'Test' }, { id: 'tB', name: 'Candidat·e B (fictif)', spec: 'Test' }], dist: { tA: 0.67, tB: 0.33 } } },
      { id: 't3', num: '3', title: 'Sondage d’essai sur le format des séances', kind: 'vote', vote: { mode: 'secret', type: 'sondage', duration: 60, options: [{ id: 'o1', name: 'Hybride' }, { id: 'o2', name: 'Présentiel' }], dist: { o1: 0.67, o2: 0.33 } } },
    ], members: buildSmallMembers('test', 6, 6, ['Membre volontaire (session de test)']).map((m) => ({ ...m, present: true })), current: null, done: {}, pvSealedAt: dayAt(now, -10, 15, 45) },
    dir: { id: 'dir', instance: 'dir', title: 'Directoire · séance du mois', short: 'Directoire', date: dayAt(now, -14, 9, 0), place: 'Bureau de la direction générale', visio: null, status: 'closed', openedAt: dayAt(now, -14, 9, 0), closedAt: dayAt(now, -14, 10, 40), pin: null, president: 'dir0', secretary: 'Direction générale', weighted: false, agenda: csAgenda().slice(0, 2).map((x, i) => ({ ...x, id: 'd' + (i + 1), title: i === 0 ? 'Avis sur le programme capacitaire hivernal' : 'Avis sur le plan de formation médicale continue' })), members: buildSmallMembers('dir', 9, 9, ['Membre du directoire']), current: null, done: {}, pvSealedAt: dayAt(now, -14, 11, 5), archived: true },
  };
  for (const s of Object.values(seances)) {
    if (s.id !== 'cme') {
      if (s.members.length && !s.members.find((m) => m.id === s.president)) s.president = s.members[0].id;
      for (const m of s.members) if (m.present) m.arrivedAt = (s.openedAt || s.date) - 5 * MIN;
    }
  }

  // Résultats de la séance clôturée du directoire (pour le procès-verbal archivé)
  const votes = {};
  seances.dir.agenda.forEach((it, i) => {
    const n = seances.dir.members.filter((m) => m.present && m.voting).length;
    const pour = n - (i === 0 ? 1 : 0), abst = i === 0 ? 1 : 0;
    votes['dir:' + it.id + ':1'] = { sid: 'dir', itemId: it.id, round: 1, status: 'closed', openedAt: seances.dir.openedAt + (20 + i * 25) * MIN, duration: 60, activeMs: 42000, finalElapsed: 42000, plan: [], real: {}, closedAt: seances.dir.openedAt + (21 + i * 25) * MIN, final: { counts: { pour, contre: 0, abstention: abst }, votants: n, ballots: [] }, result: { kind: 'resolution', adopted: true, pour, contre: 0, abst, nppv: 0, refus: 0, exprimes: pour, needed: 1, casting: false, text: 'Adopté', textEn: 'Adopted' } };
    seances.dir.done[it.id] = seances.dir.openedAt + (21 + i * 25) * MIN;
  });

  // Session de test avec l'organisatrice avant la première utilisation (CCTP 5.3)
  const T0 = seances.test.openedAt;
  votes['test:t1:1'] = { sid: 'test', itemId: 't1', round: 1, status: 'closed', openedAt: T0 + 5 * MIN, duration: 60, activeMs: 30000, finalElapsed: 30000, plan: [], real: {}, closedAt: T0 + 6 * MIN, final: { counts: { pour: 5, contre: 0, abstention: 1 }, votants: 6, expected: 6, ballots: [], participants: [] }, result: { kind: 'resolution', adopted: true, pour: 5, contre: 0, abst: 1, nppv: 0, refus: 0, exprimes: 5, needed: 1, casting: false, text: 'Adopté', textEn: 'Adopted' } };
  votes['test:t2:1'] = { sid: 'test', itemId: 't2', round: 1, status: 'closed', openedAt: T0 + 12 * MIN, duration: 60, activeMs: 35000, finalElapsed: 35000, plan: [], real: {}, closedAt: T0 + 13 * MIN, final: { counts: { tA: 4, tB: 2, blanc: 0 }, votants: 6, expected: 6, ballots: [], participants: [] }, result: { kind: 'election', ranked: [{ id: 'tA', name: 'Candidat·e A (fictif)', votes: 4 }, { id: 'tB', name: 'Candidat·e B (fictif)', votes: 2 }], exprimes: 6, blanc: 0, needed: 4, elected: ['tA'], text: 'Candidat·e A (fictif) est élu·e au premier tour (majorité absolue)', textEn: 'Candidate A (fictitious) is elected in the first round (absolute majority)' } };
  votes['test:t3:1'] = { sid: 'test', itemId: 't3', round: 1, status: 'closed', openedAt: T0 + 20 * MIN, duration: 60, activeMs: 28000, finalElapsed: 28000, plan: [], real: {}, closedAt: T0 + 21 * MIN, final: { counts: { o1: 4, o2: 2 }, votants: 6, expected: 6, ballots: [], participants: [] }, result: { kind: 'sondage', ranked: [{ id: 'o1', name: 'Hybride', votes: 4 }, { id: 'o2', name: 'Présentiel', votes: 2 }], text: 'Consultation non décisionnaire : « Hybride » arrive en tête', textEn: 'Non-binding poll: “Hybrid” comes first' } };
  for (const id of ['t1', 't2', 't3']) seances.test.done[id] = votes['test:' + id + ':1'].closedAt;

  const sjournal = [];
  const SJ = (at, actor, role, action, detail, op) => appendEntry(sjournal, { at, actor, role, action, detail, op });
  SJ(dayAt(now, -20, 10, 0), 'Mme Claire Fontaine', 'Organisatrice', 'Création de la séance', 'CME · séance plénière · 11 points à l’ordre du jour', 'cme');
  SJ(dayAt(now, -8, 9, 0), 'Mme Claire Fontaine', 'Organisatrice', 'Envoi des convocations et des liens personnels', '67 destinataires · documents joints (12)', 'cme');
  SJ(dayAt(now, -14, 9, 0), 'Système', 'Automate', 'Ouverture de la séance du directoire', '9 membres présents', 'dir');
  SJ(dayAt(now, -14, 10, 40), 'Système', 'Automate', 'Clôture de la séance et génération du procès-verbal', 'PV scellé et horodaté', 'dir');
  SJ(dayAt(now, -10, 15, 0), 'Mme Claire Fontaine', 'Organisatrice', 'Session de test avant la première utilisation', 'Prise en main accompagnée par le titulaire · 3 votes d’essai (nominatif, secret, sondage)', 'test');
  SJ(sStart, 'Mme Claire Fontaine', 'Organisatrice', 'Ouverture de la séance', 'Quorum atteint · émargement automatique à l’arrivée', 'cme');
  SJ(sStart + 3 * MIN, 'Mme Claire Fontaine', 'Organisatrice', 'Point 1 traité', 'Constat du quorum', 'cme');
  SJ(sStart + 10 * MIN, 'Direction des soins', 'Organisateur', 'Ouverture de la séance', 'CSIRMT · salle B', 'csirmt');

  return {
    v: SEED_VERSION, seededAt: now, rev: 0,
    settings: { lang: 'fr', falc: false, contrast: false, font: 0, dys: false, refs: false },
    auth: {},
    remote: R,
    maintenance: null,
    seance: { seances, votes, journal: sjournal, pv: {}, tickets: [], alerts: [
      { id: 'sa1', at: dayAt(now, -3, 18, 12), status: 'acquittée', type: 'geo', title: 'Connexion depuis un pays hors Union européenne', detail: 'Tentative d’accès à la séance du conseil de surveillance bloquée ; membre contacté', sid: 'cs', src: '198.51.100.23', ackBy: 'Isabelle Roux' },
    ], security: { threshold: 3, lockMin: 5, geo: true, alertMail: true }, subscription: { start: dayAt(now, -40, 0, 0), end: dayAt(now, 142, 0, 0), plan: 'Abonnement semestriel', participants: 'Jusqu’à 500 participants simultanés' } },
  };
}

export { SITES, BUREAU };
