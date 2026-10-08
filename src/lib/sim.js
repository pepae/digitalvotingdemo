// Moteur de simulation de la démonstration (participation, dépouillement, séances).
// Tout est déterministe à partir des données d'état, pour rester cohérent entre onglets.
import { rng, shuffle } from './prng.js';
import { SITES, drawOrder } from '../data/remote.js';
import { curLang } from './lang.js';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const curve = (x) => 0.6 * Math.sqrt(x) + 0.4 * Math.pow(x, 3);

// ---------------------------------------------------------------- Vote à distance
export function opEnded(op) {
  return ['ended', 'closed', 'sealed-after', 'counted', 'published', 'archived'].includes(op.status);
}
// Activité « en direct » ajoutée à la courbe pour que les compteurs bougent pendant la démonstration :
// environ un vote par minute et par urne (depuis 45 min avant l'initialisation), plafonné à 12 % de la participation finale.
function liveExtra(state, urn, final, now) {
  const since = now - ((state.seededAt || now) - 45 * 60000);
  if (since <= 0) return 0;
  const r = rng('live-' + urn.id)();
  return Math.min(Math.floor(final * 0.12), Math.floor((since / 60000) * (0.7 + r * 0.6)));
}
export function urnCount(state, urnId, now) {
  const R = state.remote;
  const urn = R.urns[urnId];
  const op = R.ops[urn.op];
  const final = Math.floor(urn.electors * urn.pFinal);
  const demo = (R.extraVotes && R.extraVotes[urnId]) || 0;
  if (op.id === 'test26') return Math.min(urn.electors, final);
  if (now < op.open) return 0;
  const x = opEnded(op) ? 1 : clamp((now - op.open) / (op.close - op.open));
  const base = Math.floor(final * curve(x));
  const live = x < 1 ? liveExtra(state, urn, final, now) : 0;
  return Math.min(final, base + live) + demo;
}
// Compteurs d'une opération. Un même électeur peut voter dans plusieurs instances
// (CSE et F3SCT) : la participation se calcule par instance et sur le corps électoral
// distinct (op.electorate), jamais en additionnant les urnes.
export function opCounts(state, opId, now) {
  const R = state.remote;
  const op = R.ops[opId];
  const urns = op.urns.map((id) => R.urns[id]);
  let ballots = 0;
  const groups = {};
  const per = urns.map((u) => {
    const c = urnCount(state, u.id, now);
    ballots += c;
    const g = groups[u.instance] || (groups[u.instance] = { instance: u.instance, instanceLong: u.instanceLong, voted: 0, electors: 0, urns: 0 });
    g.voted += c; g.electors += u.electors; g.urns++;
    return { urn: u, voted: c };
  });
  const byInstance = Object.values(groups);
  const electors = op.electorate || Math.max(...byInstance.map((g) => g.electors));
  // Électeurs ayant voté au moins une fois : au moins le maximum des instances
  // (les votes CSE et F3SCT sont en pratique exprimés dans la même session).
  const voted = Math.min(electors, Math.max(...byInstance.map((g) => g.voted)));
  return { voted, electors, ballots, per, byInstance };
}
// Répartition par site (bureau de vote virtuel)
export function siteSplit(total, seed) {
  const r = rng('sites-' + seed);
  const w = SITES.map((s) => s.w * (0.85 + r() * 0.3));
  const sum = w.reduce((a, b) => a + b, 0);
  const raw = w.map((x) => (x / sum) * total);
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < rest; k++) out[order[k % out.length][1]]++;
  return SITES.map((s, i) => ({ site: s, n: out[i] }));
}
// Courbe de participation (série horaire) pour les graphiques
export function participationSeries(state, opId, now, points = 40) {
  const R = state.remote;
  const op = R.ops[opId];
  const end = opEnded(op) ? op.close : Math.min(now, op.close);
  const out = [];
  if (end <= op.open) return out;
  // Série calculée avec les mêmes compteurs que les indicateurs (électeurs distincts),
  // en simulant un scrutin encore ouvert pour les points passés.
  const live = { ...state, remote: { ...R, ops: { ...R.ops, [opId]: { ...op, status: 'open' } } } };
  for (let i = 0; i <= points; i++) {
    const t = op.open + ((end - op.open) * i) / points;
    const c = i === points ? opCounts(state, opId, now) : opCounts(live, opId, t);
    out.push({ t, v: c.voted, p: c.voted / c.electors });
  }
  return out;
}

function largestRemainder(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (w / sum) * total);
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < rest; k++) out[order[k % out.length][1]]++;
  return out;
}

// Répartition des sièges à la plus forte moyenne
export function dhondt(votes, seats) {
  const ids = Object.keys(votes);
  const won = Object.fromEntries(ids.map((i) => [i, 0]));
  for (let s = 0; s < seats; s++) {
    let best = null, bestQ = -1;
    for (const i of ids) {
      const q = votes[i] / (won[i] + 1);
      if (q > bestQ || (q === bestQ && votes[i] > votes[best])) { bestQ = q; best = i; }
    }
    if (best) won[best]++;
  }
  return won;
}

const LIST_BASE = { csm: 0.31, uahm: 0.27, sapm: 0.21, fssm: 0.15 };
export function listResults(state, urnId, now) {
  const R = state.remote;
  const urn = R.urns[urnId];
  const total = urnCount(state, urnId, now);
  const demo = R.myVotes && R.myVotes[urnId] ? R.myVotes[urnId].choice : null;
  const simTotal = total - ((R.extraVotes && R.extraVotes[urnId]) || 0);
  const r = rng('res-' + urnId);
  const ids = urn.lists;
  const w = ids.map((id) => LIST_BASE[id] * (0.75 + r() * 0.5));
  const blankShare = 0.04 + r() * 0.03;
  const wsum = w.reduce((a, b) => a + b, 0);
  const weights = [...w.map((x) => (x / wsum) * (1 - blankShare)), blankShare];
  const alloc = largestRemainder(simTotal, weights);
  const votes = {};
  ids.forEach((id, i) => { votes[id] = alloc[i]; });
  let blanc = alloc[ids.length];
  if (demo) { if (demo === 'blanc') blanc++; else votes[demo] = (votes[demo] || 0) + 1; }
  const exprimes = ids.reduce((a, id) => a + votes[id], 0);
  const seats = dhondt(votes, urn.seats);
  const bySite = siteSplit(total, urnId).map((s) => {
    const rr = rng('site-res-' + urnId + s.site.id);
    const ww = [...ids.map((id) => votes[id] * (0.85 + rr() * 0.3)), blanc];
    const a = largestRemainder(s.n, ww);
    const v = {}; ids.forEach((id, i) => { v[id] = a[i]; });
    return { site: s.site, votants: s.n, votes: v, blanc: a[ids.length] };
  });
  return { urn, inscrits: urn.electors, votants: total, blanc, exprimes, votes, seats, order: drawOrder(urn), bySite };
}

export function pluriResults(state, urnId, now) {
  const R = state.remote;
  const urn = R.urns[urnId];
  const total = urnCount(state, urnId, now);
  const demo = R.myVotes && R.myVotes[urnId] ? R.myVotes[urnId].choice : null;
  const simTotal = total - ((R.extraVotes && R.extraVotes[urnId]) || 0);
  const r = rng('pres-' + urnId);
  const blancs = Math.round(simTotal * (0.02 + r() * 0.02)) + (demo === 'blanc' ? 1 : 0);
  const exprimes = total - blancs;
  const cands = urn.candidates.map((c, i) => {
    const support = clamp(0.28 + r() * 0.42 + (i % 3 === 0 ? 0.08 : 0), 0.15, 0.8);
    let v = Math.round((simTotal - blancs) * support);
    if (Array.isArray(demo) && demo.includes(c.id)) v++;
    return { ...c, votes: v };
  }).sort((a, b) => b.votes - a.votes);
  const threshold = Math.floor(exprimes / 2) + 1;
  let elected = 0;
  for (const c of cands) {
    // Art. R. 6144-4 CSP : majorité absolue des suffrages exprimés et au moins un tiers des inscrits au 1er tour
    if (elected < urn.seats && c.votes >= threshold && c.votes >= urn.electors / 3) { c.elected = true; elected++; }
  }
  return { urn, inscrits: urn.electors, votants: total, blancs, exprimes, cands, threshold, minVotes: Math.ceil(urn.electors / 3), seatsLeft: urn.seats - elected, bySite: siteSplit(total, urnId) };
}

export function urnResults(state, urnId, now) {
  return state.remote.urns[urnId].type === 'pluri' ? pluriResults(state, urnId, now) : listResults(state, urnId, now);
}

// Liste d'émargement générée (lecture paginée, ordre antéchronologique)
import { FIRST_F, FIRST_M, LAST } from '../data/names.js';
export function emargementPage(state, urnId, now, page, size, query) {
  const R = state.remote;
  const urn = R.urns[urnId];
  const op = R.ops[urn.op];
  const total = urnCount(state, urnId, now);
  const demoCount = (R.extraVotes && R.extraVotes[urnId]) || 0;
  const rows = [];
  const end = opEnded(op) ? op.close : Math.min(now, op.close);
  const span = end - op.open;
  const simTotal = total - demoCount;
  const mk = (i) => {
    const r = rng('em-' + urnId + '-' + i);
    const f = r() < 0.6;
    const t = op.open + span * Math.pow((i + 1) / (simTotal + 1), 0.9) - r() * 60000;
    const site = SITES[Math.floor(r() * SITES.length)].name;
    return { id: urnId + '-' + i, nom: LAST[Math.floor(r() * LAST.length)].toUpperCase(), prenom: (f ? FIRST_F : FIRST_M)[Math.floor(r() * 50)], site, at: t, canal: r() < 0.58 ? 'Smartphone' : r() < 0.85 ? 'Poste de travail' : 'Tablette' };
  };
  const mine = [];
  if (R.myVotes) {
    for (const [uid, v] of Object.entries(R.myVotes)) if (uid === urnId) mine.push({ id: 'demo-' + uid, nom: v.voterLast.toUpperCase(), prenom: v.voterFirst, site: v.site, at: v.at, canal: 'Poste de travail', demo: true });
  }
  const q = (query || '').trim().toLowerCase();
  if (q) {
    for (let i = simTotal - 1; i >= 0 && rows.length < 400; i--) { const x = mk(i); if ((x.nom + ' ' + x.prenom).toLowerCase().includes(q)) rows.push(x); }
    const m = mine.filter((x) => (x.nom + ' ' + x.prenom).toLowerCase().includes(q));
    const all = [...m, ...rows];
    return { rows: all.slice(page * size, page * size + size), total: all.length };
  }
  const start = page * size;
  const out = [];
  for (let k = start; k < start + size && k < total; k++) {
    if (k < mine.length) out.push(mine[k]);
    else out.push(mk(simTotal - 1 - (k - mine.length)));
  }
  return { rows: out, total };
}

// ---------------------------------------------------------------- Vote en séance
export const voteKey = (sid, itemId, round = 1) => sid + ':' + itemId + ':' + round;

export function flatAgenda(agenda) {
  const out = [];
  for (const it of agenda) { out.push(it); if (it.children) for (const c of it.children) out.push({ ...c, parent: it.id }); }
  return out;
}
export function findItem(seance, itemId) {
  return flatAgenda(seance.agenda).find((i) => i.id === itemId);
}

export function quorumInfo(seance) {
  const voting = seance.members.filter((m) => m.voting);
  const present = voting.filter((m) => m.present);
  const weighted = seance.weighted;
  const tot = weighted ? voting.reduce((a, m) => a + m.weight, 0) : voting.length;
  const pres = weighted ? present.reduce((a, m) => a + m.weight, 0) : present.length;
  const proxies = voting.filter((m) => !m.present && m.proxyTo && seance.members.find((x) => x.id === m.proxyTo && x.present));
  const proxW = weighted ? proxies.reduce((a, m) => a + m.weight, 0) : proxies.length;
  const required = weighted ? Math.ceil(tot * 0.5) : Math.floor(tot / 2) + 1;
  const counted = pres + (seance.proxiesCountForQuorum ? proxW : 0);
  return { total: tot, present: pres, proxies: proxW, proxiesN: proxies.length, required, ok: counted >= required, counted, salle: present.filter((m) => m.mode !== 'visio').length, visio: present.filter((m) => m.mode === 'visio').length };
}

// Électeurs attendus pour un vote : présents avec voix + procurations détenues
export function expectedBallots(seance) {
  const out = [];
  for (const m of seance.members) {
    if (!m.voting || !m.present) continue;
    out.push({ key: m.id, memberId: m.id, weight: m.weight || 1 });
  }
  for (const m of seance.members) {
    if (!m.voting || m.present || !m.proxyTo) continue;
    const holder = seance.members.find((x) => x.id === m.proxyTo);
    if (holder && holder.present) out.push({ key: holder.id + '>' + m.id, memberId: holder.id, proxyFor: m.id, weight: m.weight || 1 });
  }
  return out;
}

function optionIds(item) {
  const v = item.vote;
  if (v.type === 'resolution') return v.expr;
  if (v.type === 'uninominal' || v.type === 'plurinominal') return [...v.candidates.map((x) => x.id), 'blanc'];
  if (v.type === 'liste') return [...v.lists.map((x) => x.id), 'blanc'];
  if (v.type === 'multi') return [];
  return v.options.map((x) => x.id);
}

// Libellés des tours de scrutin
export function ordinalFr(n, total) {
  if (n === 1) return 'premier';
  if (n === 2) return total === 2 ? 'second' : 'deuxième';
  if (n === 3) return 'troisième';
  return n + 'e';
}
export function ordinalEn(n) {
  return n === 1 ? 'first' : n === 2 ? 'second' : n === 3 ? 'third' : n + 'th';
}
export function roundLabel(round, total, lang = curLang()) {
  if (lang === 'en') { const e = ordinalEn(round); return e.charAt(0).toUpperCase() + e.slice(1) + ' round'; }
  const o = ordinalFr(round, total);
  return o.charAt(0).toUpperCase() + o.slice(1) + ' tour';
}

// Quorum requis pour un vote donné (paramétrable vote par vote, sinon règle de l'instance)
export const QUORUM_RULES = {
  instance: 'Quorum de l’instance',
  majorite: 'Majorité des membres ayant voix délibérative',
  'deux-tiers': 'Deux tiers des membres ayant voix délibérative',
  tiers: 'Un tiers des membres ayant voix délibérative',
  aucun: 'Aucun quorum requis pour ce vote',
};
export const QUORUM_RULES_EN = {
  instance: 'Body quorum',
  majorite: 'Majority of voting members',
  'deux-tiers': 'Two thirds of voting members',
  tiers: 'One third of voting members',
  aucun: 'No quorum required for this vote',
};
export function quorumFor(seance, item) {
  const q = quorumInfo(seance);
  const rule = item && item.vote && item.vote.quorum;
  const QR = curLang() === 'en' ? QUORUM_RULES_EN : QUORUM_RULES;
  if (!rule || rule === 'instance') return { ...q, rule: 'instance', label: QR.instance };
  const required = rule === 'deux-tiers' ? Math.ceil((q.total * 2) / 3) : rule === 'tiers' ? Math.ceil(q.total / 3) : rule === 'aucun' ? 0 : Math.floor(q.total / 2) + 1;
  return { ...q, rule, label: QR[rule] || rule, required, ok: q.counted >= required };
}

// Plan de vote simulé : délais d'arrivée et choix des membres simulés (hors participante démo)
export function buildPlan(seance, item, round, withdrawn = []) {
  const v = item.vote;
  const ballots = expectedBallots(seance).filter((b) => b.memberId !== 'sbernard');
  const r = rng('plan-' + seance.id + item.id + round + ballots.length);
  const order = shuffle(r, ballots);
  const n = order.length;
  const nVote = Math.round(n * (0.94 + r() * 0.05));
  const plan = [];
  const dist = (round > 1 && v['dist' + round]) || v.dist;
  if (v.type === 'multi') {
    const per = v.questions.map((qq) => {
      const ids = Object.keys(qq.dist);
      const counts = largestRemainder(nVote, ids.map((k) => qq.dist[k]));
      const ch = [];
      ids.forEach((k, i) => { for (let j = 0; j < counts[i]; j++) ch.push(k); });
      return shuffle(rng('mix-' + seance.id + item.id + qq.id + round), ch);
    });
    for (let i = 0; i < nVote; i++) {
      const choice = {};
      v.questions.forEach((qq, j) => { choice[qq.id] = per[j][i]; });
      plan.push({ key: order[i].key, memberId: order[i].memberId, proxyFor: order[i].proxyFor, weight: order[i].weight, delay: delayFor(r, i, nVote), choice });
    }
    return plan;
  }
  if (v.type === 'classement') {
    for (let i = 0; i < nVote; i++) {
      const rr = rng('rank-' + seance.id + item.id + i);
      const opts = v.options.map((o) => ({ id: o.id, s: (v.prefs[o.id] || 0.25) * (0.4 + rr() * 1.2) }));
      opts.sort((a, b) => b.s - a.s);
      plan.push({ key: order[i].key, memberId: order[i].memberId, proxyFor: order[i].proxyFor, weight: order[i].weight, delay: delayFor(r, i, nVote), choice: opts.map((o) => o.id) });
    }
    return plan;
  }
  let ids = Object.keys(dist).filter((k) => !withdrawn.includes(k));
  const weights = ids.map((k) => dist[k]);
  const counts = largestRemainder(nVote, weights);
  const choices = [];
  ids.forEach((k, i) => { for (let j = 0; j < counts[i]; j++) choices.push(k); });
  const mixed = shuffle(rng('mix-' + seance.id + item.id + round), choices);
  for (let i = 0; i < nVote; i++) {
    let choice = mixed[i];
    if (v.type === 'plurinominal') {
      const rr = rng('pl-' + seance.id + item.id + i);
      const first = choice;
      const others = v.candidates.map((c) => c.id).filter((x) => x !== first);
      const second = rr() < 0.85 ? others.sort((a, b) => (dist[b] || 0) * (0.6 + rr()) - (dist[a] || 0) * (0.6 + rr()))[0] : null;
      choice = second ? [first, second] : [first];
    }
    plan.push({ key: order[i].key, memberId: order[i].memberId, proxyFor: order[i].proxyFor, weight: order[i].weight, delay: delayFor(r, i, nVote), choice });
  }
  return plan;
}
function delayFor(r, i, n) {
  // 70 % des votes dans les 8 premières secondes, le reste jusqu'à ~22 s
  const x = (i + r()) / n;
  return Math.round(1200 + (x < 0.7 ? x / 0.7 * 7000 : 7000 + (x - 0.7) / 0.3 * 15000) + r() * 900);
}

export function voteElapsed(vote, now) {
  if (!vote) return 0;
  let e = vote.activeMs || 0;
  if (vote.status === 'open' && vote.resumedAt) e += now - vote.resumedAt;
  return e;
}
export function voteRemaining(vote, now) {
  return vote.duration * 1000 - voteElapsed(vote, now);
}

// Bulletins arrivés à l'instant t (simulés + réels)
export function arrivedBallots(vote, now) {
  const el = vote.status === 'closed' || vote.status === 'cancelled' ? (vote.finalElapsed != null ? vote.finalElapsed : voteElapsed(vote, now)) : voteElapsed(vote, now);
  const sim = vote.plan.filter((p) => p.delay <= el).map((p) => ({ ...p, at: vote.openedAt + p.delay }));
  const real = Object.entries(vote.real || {}).map(([key, x]) => ({ key, memberId: x.memberId, proxyFor: x.proxyFor, weight: x.weight || 1, choice: x.choice, at: x.at, real: true }));
  return [...sim, ...real];
}

export function tally(seance, item, vote, now) {
  const v = item.vote;
  const ballots = arrivedBallots(vote, now);
  const weighted = v.mode === 'pondere';
  const counts = {};
  const opts = vote.round > 1 && vote.options ? vote.options : optionIds(item);
  for (const o of opts) counts[o] = 0;
  if (v.type === 'multi') for (const qq of v.questions) { counts[qq.id] = {}; for (const e of qq.expr || v.expr) counts[qq.id][e] = 0; }
  let votants = 0, votantsW = 0;
  const borda = {};
  for (const b of ballots) {
    const w = weighted ? b.weight : 1;
    votants++; votantsW += b.weight;
    if (v.type === 'multi') {
      for (const qq of v.questions) { const c = b.choice && b.choice[qq.id]; if (c) counts[qq.id][c] = (counts[qq.id][c] || 0) + w; }
      continue;
    }
    if (v.type === 'classement') {
      const k = b.choice.length;
      b.choice.forEach((id, i) => { borda[id] = (borda[id] || 0) + (k - i) * w; });
      continue;
    }
    const ch = Array.isArray(b.choice) ? b.choice : [b.choice];
    for (const c of ch) counts[c] = (counts[c] || 0) + w;
  }
  return { counts, votants, votantsW, borda, ballots, weighted };
}

const joinFr = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' et ' + a[a.length - 1]);
const joinEn = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

// Décision sur une résolution (aussi utilisée pour chaque question d'un vote groupé)
function resolutionDecision(seance, rules, c, t, choiceOf) {
  const pour = c.pour || 0, contre = c.contre || 0, abst = c.abstention || 0, nppv = c.nppv || 0, refus = c.refus || 0;
  const exprimes = pour + contre + (rules.abstNotCounted ? 0 : abst);
  let adopted, needed;
  const rule = rules.majority;
  if (rule === 'simple') { adopted = pour > contre; needed = contre + 1; }
  else if (rule === 'absolue') { needed = Math.floor(exprimes / 2) + 1; adopted = pour >= needed; }
  else if (rule === 'absolue-membres') { const tot = seance.members.filter((m) => m.voting).reduce((a, m) => a + (t.weighted ? m.weight : 1), 0); needed = Math.floor(tot / 2) + 1; adopted = pour >= needed; }
  else if (rule === 'qualifiee') { needed = Math.ceil((exprimes * 3) / 5); adopted = pour >= needed; }
  else if (rule === 'deux-tiers') { needed = Math.ceil((exprimes * 2) / 3); adopted = pour >= needed; }
  let casting = false;
  if (pour === contre && rules.casting && pour > 0) {
    const pres = t.ballots.find((b) => b.memberId === seance.president && !b.proxyFor);
    if (pres) { adopted = choiceOf(pres) === 'pour'; casting = true; }
  }
  return { adopted, pour, contre, abst, nppv, refus, exprimes, needed, casting };
}

// Calcul automatique de la majorité et proclamation
export function decide(seance, item, vote, t) {
  const v = item.vote;
  const c = t.counts;
  if (v.type === 'resolution') {
    const r = resolutionDecision(seance, v, c, t, (b) => b.choice);
    return { kind: 'resolution', ...r, text: (r.adopted ? 'Adopté' : 'Rejeté') + (r.casting ? ' (voix prépondérante du président)' : ''), textEn: (r.adopted ? 'Adopted' : 'Rejected') + (r.casting ? ' (chair’s casting vote)' : '') };
  }
  if (v.type === 'multi') {
    const questions = v.questions.map((qq) => ({ id: qq.id, num: qq.num, title: qq.title, ...resolutionDecision(seance, { ...v, ...qq }, c[qq.id] || {}, t, (b) => b.choice && b.choice[qq.id]) }));
    const n = questions.filter((x) => x.adopted).length;
    return { kind: 'multi', questions, text: n + ' question' + (n > 1 ? 's adoptées' : ' adoptée') + ' sur ' + questions.length, textEn: n + ' of ' + questions.length + ' questions adopted' };
  }
  if (v.type === 'liste') {
    const blanc = c.blanc || 0;
    const votes = {};
    v.lists.forEach((l) => { votes[l.id] = c[l.id] || 0; });
    const exprimes = Object.values(votes).reduce((a, b) => a + b, 0);
    const seats = exprimes ? dhondt(votes, v.seats) : {};
    const ranked = v.lists.map((l) => ({ id: l.id, name: l.name, votes: votes[l.id], seats: seats[l.id] || 0, elected: l.candidates.slice(0, seats[l.id] || 0) })).sort((a, b) => b.votes - a.votes);
    const alloc = ranked.filter((x) => x.seats).map((x) => x.name.replace(/^Liste « (.*) »$/, '$1') + ' ' + x.seats).join(' · ');
    return { kind: 'liste', ranked, exprimes, blanc, seats: v.seats, text: v.seats + ' sièges répartis : ' + alloc, textEn: v.seats + ' seats allocated: ' + alloc };
  }
  if (v.type === 'uninominal') {
    const R = v.rounds || 1;
    const cands = (vote.options || optionIds(item)).filter((x) => x !== 'blanc');
    const blanc = c.blanc || 0;
    const exprimes = cands.reduce((a, id) => a + (c[id] || 0), 0);
    const ranked = cands.map((id) => { const k = v.candidates.find((x) => x.id === id); return { id, name: k.name, born: k.born, votes: c[id] || 0 }; }).sort((a, b) => b.votes - a.votes);
    const needed = Math.floor(exprimes / 2) + 1;
    if (vote.round < R && ranked[0].votes < needed) {
      const next = vote.round + 1;
      return { kind: 'election', ranked, exprimes, blanc, needed, nextRound: next, secondRound: true, text: 'Aucun candidat n’obtient la majorité absolue : ' + ordinalFr(next, R) + ' tour' + (next === R ? ' à la majorité relative' : ''), textEn: 'No absolute majority: ' + ordinalEn(next) + ' round' + (next === R ? ' by relative majority' : '') };
    }
    // Égalité de voix au tour décisif : le candidat le plus âgé est élu
    let winner = ranked[0], tie = false;
    const tied = ranked.filter((x) => x.votes === ranked[0].votes);
    if (tied.length > 1) { winner = tied.slice().sort((a, b) => (a.born || 9999) - (b.born || 9999))[0]; tie = true; }
    const how = R === 1 ? '(majorité relative, scrutin à un tour)' : ranked[0].votes >= needed && !tie ? 'au ' + ordinalFr(vote.round, R) + ' tour (majorité absolue)' : 'au ' + ordinalFr(vote.round, R) + ' tour (majorité relative)';
    const howEn = R === 1 ? '(relative majority, single round)' : 'in the ' + ordinalEn(vote.round) + ' round (' + (ranked[0].votes >= needed && !tie ? 'absolute' : 'relative') + ' majority)';
    return { kind: 'election', ranked, exprimes, blanc, needed, elected: [winner.id], tie, text: winner.name + ' est élu·e ' + how + (tie ? ' · égalité de voix : élu·e au bénéfice de l’âge' : ''), textEn: winner.name + ' is elected ' + howEn + (tie ? ' · tie: elected as the oldest candidate' : '') };
  }
  if (v.type === 'plurinominal') {
    const ranked = v.candidates.map((k) => ({ id: k.id, name: k.name, votes: c[k.id] || 0 })).sort((a, b) => b.votes - a.votes);
    const elected = ranked.slice(0, v.seats).map((x) => x.id);
    const names = ranked.slice(0, v.seats).map((x) => x.name);
    return { kind: 'election', ranked, exprimes: t.votants, blanc: c.blanc || 0, elected, text: joinFr(names) + (v.seats > 1 ? ' sont désigné·e·s' : ' est désigné·e'), textEn: joinEn(names) + (v.seats > 1 ? ' are appointed' : ' is appointed') };
  }
  if (v.type === 'classement') {
    const ranked = v.options.map((o) => ({ id: o.id, name: o.name, votes: t.borda[o.id] || 0 })).sort((a, b) => b.votes - a.votes);
    return { kind: 'classement', ranked, text: 'Priorité n° 1 : ' + ranked[0].name, textEn: 'Top priority: ' + ranked[0].name };
  }
  // sondage
  const ranked = v.options.map((o) => ({ id: o.id, name: o.name, votes: c[o.id] || 0 })).sort((a, b) => b.votes - a.votes);
  return { kind: 'sondage', ranked, text: 'Consultation non décisionnaire : « ' + ranked[0].name + ' » arrive en tête', textEn: 'Non-binding poll: “' + ranked[0].name + '” comes first' };
}
