// Données de référence : vote en séance (instances, séances, membres, ordres du jour, documents).
// Toutes les personnes et organisations sont fictives.
import { rng, pick, shuffle } from '../lib/prng.js';
import { FIRST_F, FIRST_M, LAST } from './names.js';
import { curLang } from '../lib/lang.js';

const SPEC = ['Cardiologie', 'Anesthésie-réanimation', 'Médecine d’urgence', 'Pédiatrie', 'Gériatrie', 'Psychiatrie', 'Radiologie', 'Oncologie', 'Chirurgie orthopédique', 'Néphrologie', 'Pneumologie', 'Gynécologie-obstétrique', 'Neurologie', 'Médecine interne', 'Hématologie', 'Biologie médicale', 'Pharmacie', 'Chirurgie viscérale', 'Dermatologie', 'Endocrinologie', 'ORL', 'Ophtalmologie', 'Infectiologie', 'Médecine nucléaire'];

export const INSTANCES = [
  { id: 'cme', name: 'Commission médicale d’établissement', short: 'CME', type: 'Établissement de santé', members: 67, voting: 60, quorum: 'Majorité des membres ayant voix délibérative', majority: 'Majorité simple des suffrages exprimés', secretDesign: true, proxyMax: 1, weighted: false },
  { id: 'cs', name: 'Conseil de surveillance', short: 'CS', type: 'Établissement de santé', members: 15, voting: 15, quorum: 'Majorité des membres en exercice', majority: 'Majorité des suffrages exprimés', secretDesign: true, proxyMax: 1, weighted: false },
  { id: 'csirmt', name: 'Commission des soins infirmiers, de rééducation et médico-techniques', short: 'CSIRMT', type: 'Établissement de santé', members: 30, voting: 27, quorum: 'Majorité des membres ayant voix délibérative', majority: 'Majorité simple', secretDesign: false, proxyMax: 1, weighted: false },
  { id: 'dir', name: 'Directoire', short: 'Directoire', type: 'Établissement de santé', members: 9, voting: 9, quorum: 'Sans quorum statutaire (avis)', majority: 'Consensus / majorité simple', secretDesign: false, proxyMax: 0, weighted: false },
  { id: 'cse', name: 'Comité social d’établissement', short: 'CSE', type: 'Établissement de santé', members: 34, voting: 15, quorum: 'Moitié des représentants du personnel', majority: 'Majorité des représentants du personnel', secretDesign: false, proxyMax: 0, weighted: false },
  { id: 'gip', name: 'Assemblée générale du GIP Montclair Santé Numérique', short: 'AG GIP', type: 'Groupement d’intérêt public', members: 12, voting: 12, quorum: 'Membres représentant au moins 50 % des droits de vote', majority: 'Majorité des voix pondérées (2/3 pour le budget)', secretDesign: false, proxyMax: 2, weighted: true },
];

function person(r, women) {
  const f = r() < women;
  return { first: pick(r, f ? FIRST_F : FIRST_M), last: pick(r, LAST), f };
}

// Membres de la CME (67 dont 60 avec voix délibérative)
export function buildCmeMembers() {
  const r = rng('cme-members-v2');
  const used = new Set(['Bernard', 'Petit', 'Mercier']);
  const mk = (status, voting, i, extra = {}) => {
    let p; let guard = 0;
    do { p = person(r, 0.5); guard++; } while (used.has(p.last) && guard < 20);
    used.add(p.last);
    const pr = status === 'titulaire' && i < 9;
    return { id: 'm' + i, name: (pr ? 'Pr ' : 'Dr ') + p.first + ' ' + p.last, title: pick(r, SPEC), status, voting, weight: 1, ...extra };
  };
  const members = [];
  members.push({ id: 'lmercier', name: 'Pr Laurent Mercier', title: 'Président de la CME · Néphrologie', status: 'titulaire', voting: true, weight: 1, president: true });
  members.push({ id: 'sbernard', name: 'Dr Sophie Bernard', title: 'Anesthésie-réanimation', status: 'titulaire', voting: true, weight: 1, persona: true });
  members.push({ id: 'apetit', name: 'Dr Antoine Petit', title: 'Médecine d’urgence', status: 'titulaire', voting: true, weight: 1 });
  let i = 0;
  while (members.length < 52) members.push(mk('titulaire', true, i++));
  for (let k = 0; k < 4; k++) members.push(mk('suppleant', true, i++, { replaces: 'Titulaire empêché' }));
  for (let k = 0; k < 4; k++) members.push(mk('droit', true, i++, { title: 'Chef de pôle · ' + pick(r, SPEC) }));
  members.push({ id: 'dg', name: 'M. Philippe Rolland', title: 'Directeur général', status: 'consultatif', voting: false, weight: 0 });
  members.push({ id: 'pcsirmt', name: 'Mme Agnès Fleury', title: 'Présidente de la CSIRMT', status: 'consultatif', voting: false, weight: 0 });
  const inv = [['Mme Claire Fontaine', 'Directrice des affaires médicales (secrétaire de séance)'], ['Dr Rémi Lacroix', 'Médecin responsable de l’information médicale'], ['Dr Noémie Vidal', 'Coordonnatrice de la gestion des risques'], ['M. Bruno Hamon', 'Directeur des finances'], ['Dr Estelle Joly', 'Pharmacienne gérante']];
  inv.forEach(([n, t], k) => members.push({ id: 'inv' + k, name: n, title: t, status: 'invite', voting: false, weight: 0 }));

  // Présences initiales (séance ouverte à 14 h 00)
  const voting = members.filter((m) => m.voting && !m.persona && m.id !== 'apetit');
  const order = shuffle(rng('cme-presence'), voting.map((m) => m.id));
  const present = new Set(order.slice(0, 45));
  present.add('lmercier');
  const excused = new Set(order.slice(45, 57));
  for (const m of members) {
    if (m.persona) { m.present = false; continue; }
    if (m.id === 'apetit') { m.present = false; m.absence = 'Procuration'; m.proxyTo = 'sbernard'; continue; }
    if (!m.voting) { m.present = true; m.mode = m.status === 'invite' && m.id === 'inv2' ? 'visio' : 'salle'; continue; }
    if (present.has(m.id)) { m.present = true; m.mode = rng('mode' + m.id)() < 0.24 ? 'visio' : 'salle'; }
    else if (excused.has(m.id)) { m.present = false; m.absence = 'Excusé·e'; }
    else { m.present = false; m.absence = 'Non arrivé·e'; }
  }
  // Deux autres procurations entre membres présents
  const abs = members.filter((m) => m.absence === 'Excusé·e');
  const pres = members.filter((m) => m.present && m.voting && m.id !== 'lmercier');
  abs[0].proxyTo = 'lmercier'; abs[0].absence = 'Procuration';
  abs[1].proxyTo = pres[3].id; abs[1].absence = 'Procuration';
  return members;
}

export function buildGipMembers() {
  const orgs = [
    ['CHU de Montclair', 30], ['Centre hospitalier de Val-Brennes', 12], ['Centre hospitalier de Saint-Orlan', 9], ['Centre hospitalier de Pradel-sur-Lys', 8],
    ['Clinique mutualiste de Montclair', 7], ['EHPAD public Les Glycines', 4], ['EHPAD intercommunal du Parc', 4], ['Département de Montclair-et-Lys', 9],
    ['Agglomération de Montclair', 7], ['Centre régional de lutte contre le cancer', 5], ['Groupement de coopération sanitaire Imagerie', 3], ['Maison de santé pluriprofessionnelle des Rives', 2],
  ];
  const r = rng('gip-reps');
  return orgs.map(([org, w], i) => {
    const p = person(r, 0.5);
    return { id: 'g' + i, name: (p.f ? 'Mme ' : 'M. ') + p.first + ' ' + p.last, title: 'Représentant·e · ' + org, org, status: 'titulaire', voting: true, weight: w, present: i !== 6 && i !== 11, mode: i % 4 === 1 ? 'visio' : 'salle', proxyTo: i === 6 ? 'g1' : undefined, absence: i === 6 ? 'Procuration' : i === 11 ? 'Excusé·e' : undefined };
  });
}

export function buildSmallMembers(seed, n, nVoting, labels) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = person(r, 0.55);
    out.push({ id: seed + i, name: (p.f ? 'Mme ' : 'M. ') + p.first + ' ' + p.last, title: labels ? pick(r, labels) : 'Membre', status: i < nVoting ? 'titulaire' : 'invite', voting: i < nVoting, weight: i < nVoting ? 1 : 0, present: r() < 0.85, mode: r() < 0.2 ? 'visio' : 'salle' });
  }
  return out;
}

const D = (id, title, kind, pages, paras) => ({ id, title, kind, pages, paras });
export const DOCS = {
  'pv-prec': D('pv-prec', 'Projet de procès-verbal de la séance précédente', 'Procès-verbal', 9, ['La séance est ouverte à 14 h 05 sous la présidence du Pr Laurent Mercier. Le quorum est atteint (44 membres présents sur 60 ayant voix délibérative).', 'Point 2 : avis favorable sur le rapport annuel de la commission des usagers (unanimité des suffrages exprimés).', 'Point 3 : présentation du bilan de l’activité de la permanence des soins en établissement. Le président remercie les équipes pour leur mobilisation.', 'Point 4 : avis favorable sur la révision du règlement intérieur du bloc opératoire (52 pour, 3 contre, 4 abstentions).']),
  'cand-vp': D('cand-vp', 'Appel à candidatures et règles de l’élection du vice-président', 'Note', 2, ['Conformément au code de la santé publique et au règlement intérieur de la CME, le vice-président est élu au scrutin uninominal secret parmi les praticiens titulaires membres de la commission.', 'Aux deux premiers tours, la majorité absolue des suffrages exprimés est requise. Au troisième tour, la majorité relative suffit. Un candidat peut se désister entre deux tours.', 'En cas d’égalité des voix, le candidat le plus âgé est déclaré élu.', 'Trois candidatures ont été déposées dans les délais : Dr Élise Fournier, Pr Hugo Lambert et Dr Nora Saïdi.']),
  'pf-vp': D('pf-vp', 'Professions de foi des candidats à la vice-présidence', 'Annexe', 3, ['Dr Élise Fournier (Pédiatrie) : poursuivre la structuration des filières territoriales et renforcer l’attractivité médicale.', 'Pr Hugo Lambert (Oncologie) : faire de la recherche clinique un levier de qualité et d’innovation pour tous les sites.', 'Dr Nora Saïdi (Gériatrie) : placer le parcours de la personne âgée et la coordination ville-hôpital au cœur du projet médical.']),
  'pmp': D('pmp', 'Projet médical partagé du GHT 2027-2031 (synthèse)', 'Rapport de présentation', 14, ['Le projet médical partagé fixe les orientations stratégiques des établissements du groupement pour cinq ans, autour de neuf filières prioritaires.', 'Il prévoit notamment la consolidation de la filière cardio-neuro-vasculaire, la gradation des soins en pédiatrie et le déploiement de consultations avancées dans les sites de proximité.', 'Les indicateurs de suivi seront présentés chaque année à la CME et au comité stratégique du groupement.']),
  'pmp-delib': D('pmp-delib', 'Projet d’avis de la CME sur le projet médical partagé', 'Projet de délibération', 2, ['Vu le code de la santé publique, notamment ses articles relatifs aux groupements hospitaliers de territoire ;', 'Vu le projet médical partagé présenté par le comité médical du groupement ;', 'La commission médicale d’établissement émet un avis favorable sur le projet médical partagé 2027-2031, sous réserve des amendements adoptés en séance.']),
  'amdt1': D('amdt1', 'Amendement n° 1 et sous-amendement n° 1.1', 'Annexe', 1, ['Amendement n° 1 (présenté par Dr Nora Saïdi) : ajouter une dixième filière prioritaire « santé mentale périnatale », en lien avec les maternités du groupement.', 'Sous-amendement n° 1.1 (présenté par Dr Élise Fournier) : étendre cette filière aux maternités de niveau 1 du territoire.']),
  'motion': D('motion', 'Motion préalable de report', 'Note', 1, ['Motion déposée par trois membres de la CME demandant le report de l’examen du point 4 à la séance suivante, afin de disposer de l’avis du comité stratégique du groupement.']),
  'pi27': D('pi27', 'Programme d’investissement 2027 : fiches projets', 'Annexe', 8, ['Projet A : IRM 3 Tesla supplémentaire (Hôpital Bellevue).', 'Projet B : robot chirurgical mutualisé (bloc central).', 'Projet C : rénovation et extension des urgences adultes (Hôpital Nord).', 'Projet D : plateforme de télésurveillance des patients chroniques.']),
  'conv': D('conv', 'Projet de convention de coopération avec la Clinique Saint-Aubin de Montclair', 'Projet de délibération', 6, ['La convention organise la mutualisation de la permanence des soins en chirurgie orthopédique entre le CHU et la clinique.', 'Les membres de la CME ayant un lien d’intérêts avec la clinique sont invités à ne pas prendre part au vote (NPPV).']),
  'cs-rep': D('cs-rep', 'Désignation des représentants de la CME au conseil de surveillance', 'Note', 1, ['Deux sièges sont à pourvoir. Le scrutin est plurinominal, secret, à la majorité relative. Quatre candidatures ont été reçues.']),
  'hybride': D('hybride', 'Consultation sur le format des séances 2027', 'Note', 1, ['Consultation non décisionnaire destinée à éclairer le bureau de la CME sur l’organisation des séances de l’année prochaine.']),
  'conv-hu': D('conv-hu', 'Trois conventions hospitalo-universitaires (projets)', 'Projet de délibération', 5, ['Question 1 : convention avec la faculté de médecine de Montclair pour l’accueil des étudiants en deuxième cycle.', 'Question 2 : convention avec l’institut de formation en soins infirmiers pour la formation des infirmiers en pratique avancée.', 'Question 3 : convention avec l’école de sages-femmes du territoire pour les stages en salle de naissance.', 'Chaque question fait l’objet d’un vote distinct au sein d’un même scrutin.']),
  'sc-qual': D('sc-qual', 'Élection de la sous-commission qualité et pertinence : listes déposées', 'Note', 2, ['Six sièges sont à pourvoir au scrutin de liste à un tour, à la représentation proportionnelle à la plus forte moyenne, sans panachage ni vote préférentiel.', 'Trois listes ont été déposées dans les délais ; l’ordre de présentation des candidats sur chaque liste est celui du dépôt.', 'Le vote a lieu à bulletin secret.']),
};

// Ordre du jour de la CME (séance plénière)
export function cmeAgenda() {
  const RES = ['pour', 'contre', 'abstention'];
  return [
    { id: 'p1', num: '1', title: 'Ouverture de la séance et constat du quorum', kind: 'info' },
    { id: 'p2', num: '2', title: 'Approbation du procès-verbal de la séance précédente', kind: 'vote', docs: ['pv-prec'], vote: { mode: 'nominatif', type: 'resolution', expr: RES, majority: 'simple', abstNotCounted: true, casting: true, duration: 60, dist: { pour: 0.9, contre: 0.03, abstention: 0.07 } } },
    { id: 'p3', num: '3', title: 'Élection du vice-président de la CME', kind: 'election', docs: ['cand-vp', 'pf-vp'], vote: { mode: 'secret', type: 'uninominal', rounds: 3, desist: true, duration: 120, majority: 'abs2-rel3', candidates: [{ id: 'k1', name: 'Dr Élise Fournier', spec: 'Pédiatrie', born: 1974 }, { id: 'k2', name: 'Pr Hugo Lambert', spec: 'Oncologie', born: 1969 }, { id: 'k3', name: 'Dr Nora Saïdi', spec: 'Gériatrie', born: 1978 }], dist: { k1: 0.43, k2: 0.38, k3: 0.15, blanc: 0.04 }, dist2: { k1: 0.55, k2: 0.42, blanc: 0.03 }, dist3: { k1: 0.52, k2: 0.46, blanc: 0.02 } } },
    {
      id: 'p4', num: '4', title: 'Avis sur le projet médical partagé du GHT 2027-2031', kind: 'group', docs: ['pmp', 'pmp-delib'], children: [
        { id: 'p4-0', num: '4.0', tag: 'Motion préalable', title: 'Motion préalable : report de l’examen du point à la séance suivante', kind: 'vote', docs: ['motion'], vote: { mode: 'nominatif', type: 'resolution', expr: RES, majority: 'simple', abstNotCounted: true, casting: false, duration: 60, dist: { pour: 0.17, contre: 0.74, abstention: 0.09 } } },
        { id: 'p4-1', num: '4.1', tag: 'Amendement', title: 'Amendement n° 1 : création d’une filière « santé mentale périnatale »', kind: 'vote', docs: ['amdt1'], vote: { mode: 'nominatif', type: 'resolution', expr: RES, majority: 'simple', abstNotCounted: true, casting: true, duration: 60, dist: { pour: 0.62, contre: 0.27, abstention: 0.11 } } },
        { id: 'p4-11', num: '4.1.1', tag: 'Sous-amendement', title: 'Sous-amendement n° 1.1 : extension aux maternités de niveau 1', kind: 'vote', docs: ['amdt1'], vote: { mode: 'nominatif', type: 'resolution', expr: RES, majority: 'simple', abstNotCounted: true, casting: true, duration: 60, dist: { pour: 0.48, contre: 0.41, abstention: 0.11 } } },
        { id: 'p4-2', num: '4.2', tag: 'Vote sur l’ensemble', title: 'Avis de la CME sur le projet médical partagé (texte amendé)', kind: 'vote', docs: ['pmp-delib'], vote: { mode: 'nominatif', type: 'resolution', expr: RES, majority: 'absolue', quorum: 'deux-tiers', abstNotCounted: true, casting: true, duration: 90, dist: { pour: 0.79, contre: 0.12, abstention: 0.09 } } },
      ],
    },
    { id: 'p5', num: '5', title: 'Programme d’investissement 2027 : classement des priorités', kind: 'vote', docs: ['pi27'], vote: { mode: 'secret', type: 'classement', duration: 120, options: [{ id: 'oA', name: 'IRM 3 Tesla supplémentaire' }, { id: 'oB', name: 'Robot chirurgical mutualisé' }, { id: 'oC', name: 'Rénovation des urgences adultes' }, { id: 'oD', name: 'Plateforme de télésurveillance' }], prefs: { oA: 0.3, oB: 0.15, oC: 0.4, oD: 0.15 } } },
    { id: 'p6', num: '6', title: 'Convention de coopération avec la Clinique Saint-Aubin de Montclair', kind: 'vote', docs: ['conv'], vote: { mode: 'nominatif', type: 'resolution', expr: ['pour', 'contre', 'abstention', 'nppv'], majority: 'absolue', abstNotCounted: true, casting: true, duration: 90, dist: { pour: 0.66, contre: 0.1, abstention: 0.1, nppv: 0.14 } } },
    { id: 'p7', num: '7', title: 'Désignation de deux représentants de la CME au conseil de surveillance', kind: 'election', docs: ['cs-rep'], vote: { mode: 'secret', type: 'plurinominal', seats: 2, rounds: 1, majority: 'relative', duration: 120, candidates: [{ id: 'r1', name: 'Dr Marion Roche', spec: 'Psychiatrie' }, { id: 'r2', name: 'Pr Olivier Blanchard', spec: 'Chirurgie viscérale' }, { id: 'r3', name: 'Dr Karim Kaci', spec: 'Médecine interne' }, { id: 'r4', name: 'Dr Lucie Gaillard', spec: 'Radiologie' }], dist: { r1: 0.32, r2: 0.27, r3: 0.24, r4: 0.17 } } },
    { id: 'p8', num: '8', tag: 'Sondage', title: 'Consultation : format des séances en 2027', kind: 'vote', docs: ['hybride'], vote: { mode: 'secret', type: 'sondage', duration: 60, options: [{ id: 'h1', name: 'Hybride systématique (salle + visioconférence)' }, { id: 'h2', name: 'Hybride au cas par cas' }, { id: 'h3', name: 'Présentiel uniquement' }], dist: { h1: 0.52, h2: 0.36, h3: 0.12 } } },
    { id: 'p9', num: '9', tag: 'Vote groupé', title: 'Avis sur trois conventions hospitalo-universitaires (3 questions, un seul scrutin)', kind: 'vote', docs: ['conv-hu'], vote: { mode: 'nominatif', type: 'multi', expr: RES, majority: 'simple', abstNotCounted: true, casting: true, duration: 90, questions: [
      { id: 'q1', num: 'Q1', title: 'Convention avec la faculté de médecine (étudiants de deuxième cycle)', dist: { pour: 0.86, contre: 0.06, abstention: 0.08 } },
      { id: 'q2', num: 'Q2', title: 'Convention avec l’IFSI (infirmiers en pratique avancée)', dist: { pour: 0.74, contre: 0.15, abstention: 0.11 } },
      { id: 'q3', num: 'Q3', title: 'Convention avec l’école de sages-femmes (stages en salle de naissance)', dist: { pour: 0.41, contre: 0.47, abstention: 0.12 } },
    ] } },
    { id: 'p10', num: '10', title: 'Élection de la sous-commission qualité et pertinence (scrutin de liste à un tour, 6 sièges)', kind: 'election', docs: ['sc-qual'], vote: { mode: 'secret', type: 'liste', seats: 6, majority: 'proportionnelle', duration: 120, lists: [
      { id: 'l1', name: 'Liste « Parcours et pertinence »', candidates: ['Dr Marion Roche', 'Pr Olivier Blanchard', 'Dr Léa Moreau', 'Dr Paul Henry', 'Dr Inès Barbier', 'Dr Hugo Collin'] },
      { id: 'l2', name: 'Liste « Qualité des sites de proximité »', candidates: ['Dr Karim Kaci', 'Dr Julie Perrot', 'Dr Yann Le Gall', 'Dr Sarah Benoît', 'Dr Marc Vasseur', 'Dr Anne Royer'] },
      { id: 'l3', name: 'Liste « Recherche et innovation »', candidates: ['Pr Agnès Cousin', 'Dr Thomas Rivière', 'Dr Claire Lemaire', 'Dr Bruno Faure', 'Dr Emma Garnier', 'Dr Louis Masson'] },
    ], dist: { l1: 0.44, l2: 0.33, l3: 0.19, blanc: 0.04 } } },
    { id: 'p11', num: '11', title: 'Questions diverses et clôture de la séance', kind: 'info' },
  ];
}

export function gipAgenda() {
  const RES = ['pour', 'contre', 'abstention'];
  return [
    { id: 'g1', num: '1', title: 'Approbation du compte financier 2025', kind: 'vote', vote: { mode: 'pondere', type: 'resolution', expr: RES, majority: 'simple', abstNotCounted: true, casting: false, duration: 60, dist: { pour: 0.84, contre: 0.06, abstention: 0.1 } } },
    { id: 'g2', num: '2', title: 'Budget prévisionnel 2027 du groupement', kind: 'vote', vote: { mode: 'pondere', type: 'resolution', expr: RES, majority: 'deux-tiers', abstNotCounted: true, casting: false, duration: 90, dist: { pour: 0.72, contre: 0.18, abstention: 0.1 } } },
    { id: 'g3', num: '3', title: 'Adhésion du Centre hospitalier de Lys-Haute au groupement', kind: 'vote', vote: { mode: 'pondere', type: 'resolution', expr: RES, majority: 'deux-tiers', abstNotCounted: true, casting: false, duration: 90, dist: { pour: 0.9, contre: 0.02, abstention: 0.08 } } },
    { id: 'g4', num: '4', title: 'Élection de l’administrateur du groupement', kind: 'election', vote: { mode: 'secret', type: 'uninominal', rounds: 2, desist: true, majority: 'absolue-relative', duration: 120, candidates: [{ id: 'a1', name: 'Mme Delphine Arnaud', spec: 'CHU de Montclair' }, { id: 'a2', name: 'M. Vincent Morin', spec: 'CH de Val-Brennes' }], dist: { a1: 0.61, a2: 0.35, blanc: 0.04 } } },
  ];
}

export function csAgenda() {
  const RES = ['pour', 'contre', 'abstention'];
  return [
    { id: 'c1', num: '1', title: 'Approbation du procès-verbal de la séance du 12 juin', kind: 'vote', vote: { mode: 'nominatif', type: 'resolution', expr: RES, majority: 'simple', abstNotCounted: true, casting: true, duration: 60, dist: { pour: 0.93, contre: 0, abstention: 0.07 } } },
    { id: 'c2', num: '2', title: 'Délibération sur le compte financier', kind: 'vote', vote: { mode: 'nominatif', type: 'resolution', expr: RES, majority: 'absolue', abstNotCounted: true, casting: true, duration: 60, dist: { pour: 0.8, contre: 0.07, abstention: 0.13 } } },
    { id: 'c3', num: '3', title: 'Avis sur la politique d’amélioration continue de la qualité', kind: 'vote', vote: { mode: 'nominatif', type: 'resolution', expr: RES, majority: 'simple', abstNotCounted: true, casting: true, duration: 60, dist: { pour: 0.86, contre: 0.07, abstention: 0.07 } } },
  ];
}

export function csirmtAgenda() {
  const RES = ['pour', 'contre', 'abstention'];
  return [
    { id: 'n1', num: '1', title: 'Avis sur le projet de soins infirmiers, de rééducation et médico-techniques', kind: 'vote', vote: { mode: 'nominatif', type: 'resolution', expr: RES, majority: 'simple', abstNotCounted: true, casting: true, duration: 60, dist: { pour: 0.81, contre: 0.06, abstention: 0.13 } } },
    { id: 'n2', num: '2', title: 'Organisation de l’accueil des étudiants en santé', kind: 'vote', vote: { mode: 'nominatif', type: 'resolution', expr: RES, majority: 'simple', abstNotCounted: true, casting: true, duration: 60, dist: { pour: 0.9, contre: 0.03, abstention: 0.07 } } },
  ];
}

export const EXPR_LABELS = {
  pour: 'Pour', contre: 'Contre', abstention: 'Abstention', nppv: 'Ne prend pas part au vote (NPPV)', refus: 'Refus de vote', blanc: 'Vote blanc',
};
export const EXPR_LABELS_EN = {
  pour: 'For', contre: 'Against', abstention: 'Abstain', nppv: 'Not taking part (conflict of interest)', refus: 'Refuse to vote', blanc: 'Blank vote',
};
export const EXPR_COLORS = { pour: '#087F74', contre: '#B3204D', abstention: '#5F6479', nppv: '#8F4D00', refus: '#464B62', blanc: '#9BA7D5' };

export const MAJORITY_LABELS = {
  simple: 'Majorité simple (plus de « pour » que de « contre »)',
  absolue: 'Majorité absolue des suffrages exprimés',
  'absolue-membres': 'Majorité absolue des membres en exercice',
  qualifiee: 'Majorité qualifiée (3/5 des suffrages exprimés)',
  'deux-tiers': 'Majorité des deux tiers des suffrages exprimés',
  relative: 'Majorité relative',
  'absolue-relative': 'Majorité absolue au 1er tour, relative au 2nd tour',
  'abs2-rel3': 'Majorité absolue aux deux premiers tours, relative au troisième (égalité : le plus âgé est élu)',
  proportionnelle: 'Représentation proportionnelle à la plus forte moyenne',
};

export const STATUS_LABELS = {
  titulaire: 'Titulaire', suppleant: 'Suppléant·e en exercice', droit: 'Membre de droit', consultatif: 'Voix consultative', invite: 'Invité·e sans voix délibérative',
};
export const STATUS_LABELS_EN = {
  titulaire: 'Full member', suppleant: 'Acting deputy', droit: 'Ex officio member', consultatif: 'Advisory', invite: 'Guest (no vote)',
};
export const MAJORITY_LABELS_EN = {
  simple: 'Simple majority (more “for” than “against”)',
  absolue: 'Absolute majority of votes cast',
  'absolue-membres': 'Absolute majority of serving members',
  qualifiee: 'Qualified majority (3/5 of votes cast)',
  'deux-tiers': 'Two-thirds majority of votes cast',
  relative: 'Relative majority',
  'absolue-relative': 'Absolute majority in round 1, relative in round 2',
  'abs2-rel3': 'Absolute majority in rounds 1 and 2, relative in round 3 (tie: oldest wins)',
  proportionnelle: 'Proportional representation (highest average)',
};
// Libellés dans la langue courante
const pickL = (fr, en, k) => (curLang() === 'en' ? en[k] || fr[k] || k : fr[k] || k);
export const exprLabel = (k) => pickL(EXPR_LABELS, EXPR_LABELS_EN, k);
export const majorityLabel = (k) => pickL(MAJORITY_LABELS, MAJORITY_LABELS_EN, k);
export const statusLabel = (k) => pickL(STATUS_LABELS, STATUS_LABELS_EN, k);
const INSTANCE_EN = {
  cme: { name: 'Medical committee (CME)', quorum: 'Majority of voting members', majority: 'Simple majority of votes cast' },
  cs: { name: 'Supervisory board', quorum: 'Majority of serving members', majority: 'Majority of votes cast' },
  csirmt: { name: 'Nursing, rehabilitation and medical-technical committee (CSIRMT)', quorum: 'Majority of voting members', majority: 'Simple majority' },
  dir: { name: 'Executive board', quorum: 'No statutory quorum (opinion)', majority: 'Consensus / simple majority' },
  cse: { name: 'Social committee (CSE)', quorum: 'Half of staff representatives', majority: 'Majority of staff representatives' },
  gip: { name: 'General meeting of the GIP Montclair Santé Numérique', quorum: 'Members holding at least 50% of voting rights', majority: 'Majority of weighted votes (2/3 for the budget)' },
};
// Instance avec ses libellés dans la langue courante (name, quorum, majority, type)
export const instanceL = (inst) => (inst && curLang() === 'en' && INSTANCE_EN[inst.id] ? { ...inst, ...INSTANCE_EN[inst.id], type: inst.type === 'Établissement de santé' ? 'Healthcare facility' : 'Public interest group' } : inst);
