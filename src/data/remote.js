// Données de référence : vote à distance (établissement, scrutins, listes, candidatures).
// Toutes les personnes, organisations syndicales et établissements sont fictifs.
import { rng, shuffle, pick } from '../lib/prng.js';
import { FIRST_F, FIRST_M, LAST, GRADES_A, GRADES_B, GRADES_C } from './names.js';
import { curLang } from '../lib/lang.js';

export const ESTAB = {
  name: 'CHU de Montclair',
  long: 'Centre hospitalier universitaire de Montclair',
  domain: 'chu-montclair.example',
  dir: 'Direction des ressources humaines et des relations sociales',
};

export const SITES = [
  { id: 's1', name: 'Hôpital Bellevue', w: 0.34 },
  { id: 's2', name: 'Hôpital Nord', w: 0.24 },
  { id: 's3', name: 'Pôle gériatrique Les Cèdres', w: 0.16 },
  { id: 's4', name: 'Centre Pasteur', w: 0.15 },
  { id: 's5', name: 'Site des Tilleuls', w: 0.11 },
];

// Organisations syndicales fictives (logos générés)
export const UNIONS = {
  csm: { id: 'csm', acr: 'CSM', name: 'Collectif soignant de Montclair', color: '#0B7A70', shape: 'circle' },
  uahm: { id: 'uahm', acr: 'UAHM', name: 'Union des agents hospitaliers de Montclair', color: '#B4530A', shape: 'square' },
  sapm: { id: 'sapm', acr: 'SAPM', name: 'Syndicat autonome des personnels de Montclair', color: '#6B3FA0', shape: 'tri' },
  fssm: { id: 'fssm', acr: 'FSSM', name: 'Fédération solidaire santé Montclair', color: '#2F6B2F', shape: 'wave' },
};

export const PROFESSIONS_DE_FOI = {
  csm: {
    title: 'Faire entendre la voix de celles et ceux qui soignent',
    intro: 'Le Collectif soignant de Montclair rassemble des agents de tous les métiers et de tous les sites. Nous portons une conviction simple : la qualité des soins dépend des conditions de travail.',
    points: ['Des effectifs ajustés à la charge réelle, service par service, avec un suivi trimestriel en CSE.', 'Un plan de prévention des risques professionnels co-construit avec la F3SCT et réellement financé.', 'La reconnaissance du travail de nuit et des week-ends dans l’organisation des plannings.', 'Un accès simplifié à la formation continue sur le temps de travail.'],
  },
  uahm: {
    title: 'Des droits respectés, un dialogue social exigeant',
    intro: 'L’Union des agents hospitaliers de Montclair défend chaque agent, titulaire ou contractuel, avec une permanence sur chacun des cinq sites.',
    points: ['Un accompagnement individuel pour chaque situation (carrière, mobilité, temps partiel).', 'La transparence sur les recrutements et les remplacements.', 'La titularisation des contractuels sur emplois permanents.', 'Des locaux de repos dignes sur tous les sites.'],
  },
  sapm: {
    title: 'Indépendants, proches du terrain',
    intro: 'Le Syndicat autonome des personnels de Montclair n’est affilié à aucune confédération. Nos élus restent au contact des services et rendent compte de chaque séance.',
    points: ['Un compte rendu public de chaque instance dans les quinze jours.', 'La qualité de vie au travail comme indicateur suivi en CSE.', 'Une politique de logement et de transport pour les agents des sites périphériques.', 'Un droit à la déconnexion réel pour les personnels d’encadrement.'],
  },
  fssm: {
    title: 'Solidaires pour un hôpital public attractif',
    intro: 'La Fédération solidaire santé Montclair agit pour l’égalité professionnelle et la santé au travail de tous les agents.',
    points: ['L’égalité salariale et l’accès aux promotions sans discrimination.', 'Un plan pluriannuel contre les troubles musculo-squelettiques.', 'Le soutien aux aidants familiaux parmi les agents.', 'Des crèches et solutions de garde adaptées aux horaires hospitaliers.'],
  },
};

export const CME_COLLEGES = [
  { id: 'c1', name: 'Collège 1 · Professeurs des universités-praticiens hospitaliers', short: 'PU-PH', electors: 180, seats: 4 },
  { id: 'c2', name: 'Collège 2 · Maîtres de conférences-praticiens hospitaliers', short: 'MCU-PH', electors: 95, seats: 2 },
  { id: 'c3', name: 'Collège 3 · Praticiens hospitaliers', short: 'PH', electors: 1120, seats: 8 },
  { id: 'c4', name: 'Collège 4 · Praticiens contractuels et associés', short: 'Contractuels', electors: 520, seats: 4 },
  { id: 'c5', name: 'Collège 5 · Personnels enseignants et hospitaliers non titulaires (CCA, AHU)', short: 'CCA-AHU', electors: 410, seats: 2 },
  { id: 'c6', name: 'Collège 6 · Sages-femmes', short: 'Sages-femmes', electors: 105, seats: 1 },
  { id: 'c7', name: 'Collège 7 · Pharmaciens, biologistes et odontologistes', short: 'Pharm./bio./odonto.', electors: 70, seats: 2 },
];

const SPECIALTIES = ['Cardiologie', 'Anesthésie-réanimation', 'Médecine d’urgence', 'Pédiatrie', 'Gériatrie', 'Psychiatrie', 'Radiologie', 'Oncologie', 'Chirurgie viscérale', 'Néphrologie', 'Pneumologie', 'Gynécologie-obstétrique', 'Neurologie', 'Médecine interne', 'Rhumatologie', 'Hématologie'];

// Définition des urnes (une urne = un scrutin avec sa clé de chiffrement propre)
export function buildUrns() {
  const urns = {};
  const ep = [
    ['cse-a', 'CSE', 'A', 2610, 5, 0.63], ['cse-b', 'CSE', 'B', 2140, 4, 0.58], ['cse-c', 'CSE', 'C', 3750, 6, 0.54],
    ['f3-a', 'F3SCT', 'A', 2610, 3, 0.61], ['f3-b', 'F3SCT', 'B', 2140, 3, 0.56], ['f3-c', 'F3SCT', 'C', 3750, 4, 0.52],
  ];
  for (const [id, inst, cat, electors, seats, pf] of ep) {
    urns[id] = {
      id, op: 'ep26', instance: inst,
      instanceLong: inst === 'CSE' ? 'Comité social d’établissement' : 'Formation spécialisée en matière de santé, de sécurité et de conditions de travail',
      college: 'Catégorie ' + cat, collegeKey: cat, electors, seats, pFinal: pf,
      type: 'list', lists: inst === 'F3SCT' && cat === 'B' ? ['csm', 'uahm', 'sapm'] : ['csm', 'uahm', 'sapm', 'fssm'],
    };
  }
  const cmePf = { c1: 0.71, c2: 0.66, c3: 0.58, c4: 0.49, c5: 0.44, c6: 0.69, c7: 0.73 };
  for (const c of CME_COLLEGES) {
    urns['cme-' + c.id] = {
      id: 'cme-' + c.id, op: 'cme26', instance: 'CME', instanceLong: 'Commission médicale d’établissement',
      college: c.name, collegeKey: c.short, electors: c.electors, seats: c.seats, pFinal: cmePf[c.id],
      type: 'pluri', candidates: cmeCandidates(c),
    };
  }
  // Vote test (J-9), 24 votants test, niveau 3, résultats contrôlés
  urns['test-a'] = { id: 'test-a', op: 'test26', instance: 'CSE', instanceLong: 'Comité social d’établissement (vote test)', college: 'Collège test', collegeKey: 'T', electors: 24, seats: 3, pFinal: 1, type: 'list', lists: ['csm', 'uahm', 'sapm', 'fssm'] };
  return urns;
}

function cmeCandidates(c) {
  const n = c.seats * 2 - (c.seats > 4 ? 4 : 0) + 1;
  const r = rng('cme-cand-' + c.id);
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = r() < 0.5;
    const title = c.id === 'c1' ? 'Pr' : c.id === 'c5' ? '' : c.id === 'c6' ? 'Mme' : 'Dr';
    const first = pick(r, f ? FIRST_F : FIRST_M);
    const last = pick(r, LAST);
    const name = (title ? (c.id === 'c6' ? (f ? 'Mme ' : 'M. ') : title + ' ') : '') + first + ' ' + last;
    const spec = c.id === 'c6' ? 'Maïeutique' : c.id === 'c7' ? pick(r, ['Pharmacie', 'Biologie médicale', 'Odontologie']) : pick(r, SPECIALTIES);
    out.push({ id: c.id + '-k' + (i + 1), name, spec, site: pick(r, ['Hôpital Bellevue', 'Hôpital Nord', 'Centre Pasteur']) });
  }
  return out.sort((a, b) => a.name.split(' ').slice(-1)[0].localeCompare(b.name.split(' ').slice(-1)[0], 'fr'));
}

// Candidats d'une liste syndicale pour une urne donnée (2 × sièges)
export function listCandidates(urn, unionId) {
  const r = rng('cand-' + urn.id + '-' + unionId);
  const grades = urn.collegeKey === 'A' ? GRADES_A : urn.collegeKey === 'B' ? GRADES_B : GRADES_C;
  const out = [];
  for (let i = 0; i < Math.max(4, urn.seats * 2); i++) {
    const f = r() < 0.62;
    out.push({ rank: i + 1, name: pick(r, f ? FIRST_F : FIRST_M) + ' ' + pick(r, LAST).toUpperCase(), grade: pick(r, grades), site: pick(r, ['Hôpital Bellevue', 'Hôpital Nord', 'Les Cèdres', 'Centre Pasteur', 'Les Tilleuls']) });
  }
  return out;
}

// Ordre d'affichage tiré au sort publiquement (identique pour tous les électeurs)
export function drawOrder(urn) {
  return shuffle(rng('tirage-' + urn.id), urn.lists);
}

export const VOTERS = {
  camille: {
    id: 'camille', op: 'ep26', name: 'Camille Martin', first: 'Camille', last: 'Martin',
    title: 'Infirmière en soins généraux', college: 'Catégorie A', site: 'Hôpital Bellevue', service: 'Pôle médecine · Unité de soins 3B',
    login: 'EP26-4821-7730', password: 'pVx7-Kq2m', birth: '14/03/1988', phone: '06 •• •• •• 47', email: 'c•••••@chu-montclair.example',
    factor: 'totp', urns: ['cse-a', 'f3-a'], matricule: '048217',
  },
  julien: {
    id: 'julien', op: 'cme26', name: 'Dr Julien Lefèvre', first: 'Julien', last: 'Lefèvre',
    title: 'Praticien hospitalier · Cardiologie', college: 'Collège 3 · Praticiens hospitaliers', site: 'Hôpital Nord', service: 'Service de cardiologie',
    login: 'CME26-1093-2214', password: 'Lm4r-Zt8w', birth: '02/11/1979', phone: '06 •• •• •• 23', email: 'j•••••@chu-montclair.example',
    factor: 'sms', urns: ['cme-c3'], matricule: '010932',
  },
};

export const BUREAU = [
  { id: 'hg', name: 'Hélène Garnier', role: 'Présidente du bureau de vote centralisateur', short: 'Présidente', holder: true, org: 'Direction' },
  { id: 'md', name: 'Marc Dubois', role: 'Secrétaire du bureau de vote', short: 'Secrétaire', holder: false, org: 'Direction' },
  { id: 'nb', name: 'Nadia Benali', role: 'Assesseure, déléguée de liste CSM', short: 'Assesseure', holder: true, org: 'CSM' },
  { id: 'tl', name: 'Thomas Leroy', role: 'Assesseur, délégué de liste UAHM', short: 'Assesseur', holder: true, org: 'UAHM' },
  { id: 'sm', name: 'Sandrine Morel', role: 'Assesseure, déléguée de liste SAPM', short: 'Assesseure', holder: true, org: 'SAPM' },
  { id: 'kh', name: 'Karim Haddad', role: 'Assesseur, délégué de liste FSSM', short: 'Assesseur', holder: true, org: 'FSSM' },
];

export const STAFF = [
  { id: 'pr', name: 'Paul Renaud', role: 'administrateur', label: 'Administrateur fonctionnel (cellule élections, DRH)', mfa: 'Clé FIDO2', scope: 'Toutes opérations' },
  { id: 'ac', name: 'Aline Caron', role: 'operateur', label: 'Opératrice (exploitation prestataire)', mfa: 'TOTP', scope: 'EP 2026, CME 2026' },
  { id: 'hg', name: 'Hélène Garnier', role: 'president', label: 'Présidente du bureau de vote', mfa: 'Clé FIDO2', scope: 'EP 2026' },
  { id: 'md', name: 'Marc Dubois', role: 'secretaire', label: 'Secrétaire du bureau de vote', mfa: 'TOTP', scope: 'EP 2026' },
  { id: 'nb', name: 'Nadia Benali', role: 'assesseur', label: 'Assesseure (CSM)', mfa: 'Clé FIDO2', scope: 'EP 2026' },
  { id: 'tl', name: 'Thomas Leroy', role: 'assesseur', label: 'Assesseur (UAHM)', mfa: 'Clé FIDO2', scope: 'EP 2026' },
  { id: 'sm', name: 'Sandrine Morel', role: 'assesseur', label: 'Assesseure (SAPM)', mfa: 'Clé FIDO2', scope: 'EP 2026' },
  { id: 'kh', name: 'Karim Haddad', role: 'assesseur', label: 'Assesseur (FSSM)', mfa: 'Clé FIDO2', scope: 'EP 2026' },
  { id: 'ob', name: 'Isabelle Faure', role: 'observateur', label: 'Observatrice (représentante de la direction générale)', mfa: 'TOTP', scope: 'EP 2026 (lecture)' },
  { id: 'ex', name: 'Cabinet Démo-Expertise', role: 'expert', label: 'Expert indépendant mandaté par l’établissement', mfa: 'Certificat', scope: 'Toutes opérations (audit)' },
];

export const ROLE_LABELS = {
  administrateur: 'Administrateur', operateur: 'Opérateur', president: 'Président du bureau', secretaire: 'Secrétaire du bureau',
  assesseur: 'Assesseur', observateur: 'Observateur', expert: 'Expert indépendant',
};
export const ROLE_LABELS_EN = {
  administrateur: 'Administrator', operateur: 'Operator', president: 'Polling station chair', secretaire: 'Polling station secretary',
  assesseur: 'Assessor', observateur: 'Observer', expert: 'Independent expert',
};
export const roleLabel = (k) => (curLang() === 'en' ? ROLE_LABELS_EN[k] : ROLE_LABELS[k]) || k;

// Libellés des membres du bureau et du personnel dans la langue courante
const BUREAU_EN = { hg: ['Chair of the central polling station', 'Chair'], md: ['Polling station secretary', 'Secretary'], nb: ['Assessor, CSM list delegate', 'Assessor'], tl: ['Assessor, UAHM list delegate', 'Assessor'], sm: ['Assessor, SAPM list delegate', 'Assessor'], kh: ['Assessor, FSSM list delegate', 'Assessor'] };
export const bureauRole = (b) => (curLang() === 'en' && BUREAU_EN[b.id] ? BUREAU_EN[b.id][0] : b.role);
export const bureauShort = (b) => (curLang() === 'en' && BUREAU_EN[b.id] ? BUREAU_EN[b.id][1] : b.short);
const STAFF_EN = { pr: ['Functional administrator (elections unit, HR)', 'All operations'], ac: ['Operator (supplier operations)', null], hg: ['Polling station chair', null], md: ['Polling station secretary', null], nb: ['Assessor (CSM)', null], tl: ['Assessor (UAHM)', null], sm: ['Assessor (SAPM)', null], kh: ['Assessor (FSSM)', null], ob: ['Observer (general management representative)', 'EP 2026 (read only)'], ex: ['Independent expert appointed by the hospital', 'All operations (audit)'] };
export const staffLabel = (s) => (curLang() === 'en' && STAFF_EN[s.id] ? STAFF_EN[s.id][0] : s.label);
export const staffScope = (s) => (curLang() === 'en' && STAFF_EN[s.id] && STAFF_EN[s.id][1] ? STAFF_EN[s.id][1] : s.scope);
// Nom d'une opération (scrutin) dans la langue courante
export const opName = (op) => (op && curLang() === 'en' && op.name_en ? op.name_en : op && op.name);
const VOTER_EN = { camille: { title: 'General care nurse', college: 'Category A', service: 'Medicine division · Care unit 3B' }, julien: { title: 'Hospital practitioner · Cardiology', college: 'College 3 · Hospital practitioners', service: 'Cardiology department' } };
export const voterL = (v) => (v && curLang() === 'en' && VOTER_EN[v.id] ? { ...v, ...VOTER_EN[v.id] } : v);
