// Logique partagée du vote en séance : ouverture et clôture des votes, libellés, résultats, procès-verbal.
import { dispatch, getState, TAB } from '../lib/store.js';
import { buildPlan, expectedBallots, tally, decide, voteKey, flatAgenda, findItem, quorumInfo, voteRemaining, arrivedBallots, roundLabel, QUORUM_RULES, QUORUM_RULES_EN } from '../lib/sim.js';
import { EXPR_LABELS, EXPR_LABELS_EN, EXPR_COLORS, MAJORITY_LABELS, MAJORITY_LABELS_EN, STATUS_LABELS, INSTANCES } from '../data/seance.js';
import { Chip, BarRow, Note, Tip } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';
import { fmtDT, fmtTime, fmtTimeS, fmtNum, fmtPct, fmtDate, fmtDateLong } from '../lib/format.js';
import { esc } from '../lib/exporters.js';
import { ESTAB } from '../data/remote.js';
import { L, curLang } from '../lib/lang.js';
import { resultText } from '../lib/tx.js';

// Le libellé de fonction suit la langue de l'interface (getter évalué à l'affichage).
export const ORG = { name: 'Mme Claire Fontaine', get role() { return L('Secrétaire de séance · affaires médicales', 'Meeting secretary · medical affairs'); } };

// Couleurs des modalités (palette de l'interface)
export const EXPR_TONES = { pour: 'var(--green-dot)', contre: 'var(--red)', abstention: '#AEAEB2', nppv: 'var(--orange-dot)', refus: 'var(--text-2)', blanc: '#D2D2D7' };

export function activeVote(st, sid) {
  return Object.values(st.seance.votes).find((v) => v.sid === sid && (v.status === 'open' || v.status === 'suspended')) || null;
}
export function lastVote(st, sid, itemId) {
  const vs = Object.values(st.seance.votes).filter((v) => v.sid === sid && v.itemId === itemId);
  vs.sort((a, b) => b.round - a.round || b.openedAt - a.openedAt);
  return vs[0] || null;
}
export function votableItems(seance) {
  return flatAgenda(seance.agenda).filter((i) => i.kind === 'vote' || i.kind === 'election');
}
export function optionLabel(item, id, lang = curLang()) {
  const v = item.vote;
  if (v.type === 'resolution' || v.type === 'multi') return (lang === 'en' ? EXPR_LABELS_EN : EXPR_LABELS)[id] || id;
  if (id === 'blanc') return lang === 'en' ? 'Blank vote' : 'Vote blanc';
  const list = v.candidates || v.lists || v.options || [];
  const x = list.find((o) => o.id === id);
  return x ? x.name : id;
}
// Libellé court d'une modalité (barres de résultats, projection)
export function exprShort(k, lang = curLang()) {
  if (k === 'nppv') return 'NPPV';
  if (k === 'refus') return lang === 'en' ? 'Refused' : 'Refus de vote';
  return (lang === 'en' ? EXPR_LABELS_EN : EXPR_LABELS)[k] || k;
}
// Libellé d'un choix quel que soit le type de vote (simple, multiple, vote groupé)
export function choiceLabel(item, choice, lang = curLang()) {
  const v = item.vote;
  if (choice && typeof choice === 'object' && !Array.isArray(choice)) return v.questions.map((qq) => qq.num + ' : ' + (choice[qq.id] ? optionLabel(item, choice[qq.id], lang).replace(' (NPPV)', '') : '-')).join(' · ');
  if (Array.isArray(choice)) return v.type === 'classement' ? choice.map((x, i) => (i + 1) + '. ' + optionLabel(item, x, lang)).join(' · ') : choice.map((x) => optionLabel(item, x, lang)).join(', ');
  return optionLabel(item, choice, lang);
}
export function voteTypeLabel(item, lang = curLang()) {
  const v = item.vote;
  const n = (v.questions || []).length;
  if (lang === 'en') {
    const mode = v.mode === 'secret' ? 'Secret ballot' : v.mode === 'pondere' ? 'Weighted vote (statutory votes)' : 'Named vote (digital show of hands)';
    const rounds = { 1: ' in one round', 2: ' in two rounds', 3: ' in three rounds' }[v.rounds || 1];
    const type = { resolution: 'Resolution', multi: 'Grouped vote (' + n + ' questions)', uninominal: 'Single-seat election' + rounds, plurinominal: 'Multi-seat election (' + v.seats + ' seats)', liste: 'Single-round list vote (' + v.seats + ' seats, highest average)', classement: 'Ranking (preferential)', sondage: 'Non-binding poll' }[v.type];
    return mode + ' · ' + type + (v.blocked ? ' · block vote' : '');
  }
  const mode = v.mode === 'secret' ? 'Vote à bulletin secret' : v.mode === 'pondere' ? 'Vote pondéré (voix statutaires)' : 'Vote nominatif (main levée dématérialisée)';
  const rounds = { 1: ' à un tour', 2: ' à deux tours', 3: ' à trois tours' }[v.rounds || 1];
  const type = { resolution: 'Résolution', multi: 'Vote groupé (' + n + ' questions)', uninominal: 'Scrutin uninominal' + rounds, plurinominal: 'Scrutin plurinominal (' + v.seats + ' sièges)', liste: 'Scrutin de liste à un tour (' + v.seats + ' sièges, plus forte moyenne)', classement: 'Vote de classement (préférentiel)', sondage: 'Sondage non décisionnaire' }[v.type];
  return mode + ' · ' + type + (v.blocked ? ' · vote bloqué' : '');
}
// Version courte (deux mots) pour l'interface : « Nominatif · Résolution »
export function voteTypeShort(item, lang = curLang()) {
  const v = item.vote;
  const en = lang === 'en';
  const R = v.rounds || 1;
  const n = (v.questions || []).length;
  const mode = v.mode === 'secret' ? 'Secret' : v.mode === 'pondere' ? (en ? 'Weighted' : 'Pondéré') : (en ? 'Named' : 'Nominatif');
  const type = en
    ? { resolution: 'Resolution', multi: 'Grouped (' + n + ' questions)', uninominal: 'Single-seat, ' + (R > 1 ? R + ' rounds' : 'one round'), plurinominal: 'Multi-seat (' + v.seats + ' seats)', liste: 'List (' + v.seats + ' seats)', classement: 'Ranking', sondage: 'Poll' }[v.type]
    : { resolution: 'Résolution', multi: 'Vote groupé (' + n + ' questions)', uninominal: 'Uninominal à ' + (R > 1 ? R + ' tours' : 'un tour'), plurinominal: 'Plurinominal (' + v.seats + ' sièges)', liste: 'Liste (' + v.seats + ' sièges)', classement: 'Classement', sondage: 'Sondage' }[v.type];
  return mode + ' · ' + type + (v.blocked ? (en ? ' · block vote' : ' · vote bloqué') : '');
}
export function quorumLabel(item, lang = curLang()) {
  const r = item.vote && item.vote.quorum;
  return r && r !== 'instance' ? (lang === 'en' ? QUORUM_RULES_EN : QUORUM_RULES)[r] : null;
}
export function roundOf(item, vote, lang = curLang()) {
  return roundLabel(vote.round, item.vote.rounds || 1, lang);
}

export function openVote(seance, item, round = 1, opts = {}) {
  const withdrawn = opts.withdrawn || [];
  const plan = buildPlan(seance, item, round, withdrawn);
  const expected = expectedBallots(seance).length;
  let options = null;
  if (round > 1 && item.vote.type === 'uninominal') options = [...item.vote.candidates.map((c) => c.id).filter((id) => !withdrawn.includes(id)), 'blanc'];
  // Le libellé est écrit dans le journal chaîné : il reste en français.
  dispatch('s/vote/open', { sid: seance.id, itemId: item.id, round, duration: opts.duration || item.vote.duration || 60, plan, options, withdrawn, expected, by: ORG.name, label: item.num + '. ' + item.title + (round > 1 ? ' · ' + roundLabel(round, item.vote.rounds || 1, 'fr').toLowerCase() : ''), tab: TAB });
}

export function closeVote(vote, by = ORG.name) {
  const st = getState();
  const seance = st.seance.seances[vote.sid];
  const item = findItem(seance, vote.itemId);
  const now = Date.now();
  const tl = tally(seance, item, vote, now);
  const result = decide(seance, item, vote, tl);
  const nominal = item.vote.mode !== 'secret';
  const final = {
    counts: tl.counts, borda: tl.borda, votants: tl.votants, votantsW: tl.votantsW, weighted: tl.weighted,
    ballots: nominal ? tl.ballots.map((b) => ({ memberId: b.memberId, proxyFor: b.proxyFor || null, choice: b.choice, at: b.at })) : [],
    participants: tl.ballots.map((b) => ({ memberId: b.memberId, proxyFor: b.proxyFor || null, at: b.at })),
    expected: vote.expected,
  };
  const finalElapsed = vote.status === 'open' ? (vote.activeMs || 0) + (now - vote.resumedAt) : vote.activeMs || 0;
  dispatch('s/vote/close', { key: voteKey(vote.sid, vote.itemId, vote.round), result, final, by, finalElapsed });
}

export function ResultView({ item, vote, compact, lang = curLang() }) {
  if (!vote || !vote.result) return null;
  const T = (fr, en) => (lang === 'en' ? en : fr);
  const r = vote.result;
  const f = vote.final;
  const v = item.vote;
  const tone = r.kind === 'resolution' ? (r.adopted ? 'adopted' : 'rejected') : r.nextRound || r.secondRound ? 'neutral' : 'adopted';
  const unit = f.weighted ? T(' voix', ' votes') : '';
  const R = v.rounds || 1;
  const text = lang === curLang() ? resultText(r) : lang === 'en' ? r.textEn || r.text : r.text;
  const maj = (k) => (lang === 'en' ? MAJORITY_LABELS_EN : MAJORITY_LABELS)[k] || k;
  const maxOf = (arr) => Math.max(1, ...arr.map((y) => y.votes));
  const blancRow = (max) => (r.blanc ? <BarRow label={T('Votes blancs', 'Blank votes')} value={r.blanc} max={max} right={fmtNum(r.blanc, lang)} color={EXPR_TONES.blanc} /> : null);
  return (
    <div class="stack stack-s">
      <div class={'result-banner ' + tone} role="status">
        <Icon name={r.kind === 'resolution' ? (r.adopted ? 'checkCircle' : 'xCircle') : r.nextRound || r.secondRound ? 'route' : r.kind === 'multi' ? 'listCheck' : 'flag'} size={26} />
        <div class="grow">
          <div class="rb-title">{text}</div>
          <div class="small">{T(fmtNum(f.votants, lang) + ' votant' + (f.votants > 1 ? 's' : '') + ' sur ' + fmtNum(f.expected, lang), fmtNum(f.votants, lang) + ' of ' + fmtNum(f.expected, lang) + ' voted')}{f.weighted ? ' (' + fmtNum(f.votantsW, lang) + unit + ')' : ''} · {T('clos à ', 'closed at ')}{fmtTimeS(vote.closedAt, lang)}</div>
        </div>
      </div>
      {r.kind === 'multi' && (
        <div class="stack stack-s">
          {r.questions.map((qq) => {
            const cc = f.counts[qq.id] || {};
            const tot = Math.max(1, ['pour', 'contre', 'abstention', 'nppv'].reduce((a, k) => a + (cc[k] || 0), 0));
            return (
              <div key={qq.id} class="mq-row">
                <div class="row-between" style={{ alignItems: 'flex-start' }}><div class="small"><strong>{qq.num}.</strong> {qq.title}</div><Chip tone={qq.adopted ? 'ok' : 'err'}>{qq.adopted ? T('Adoptée', 'Adopted') : T('Rejetée', 'Rejected')}{qq.casting ? T(' (voix prépondérante)', ' (casting vote)') : ''}</Chip></div>
                {['pour', 'contre', 'abstention'].filter((k) => v.expr.includes(k)).map((k) => <BarRow key={k} label={exprShort(k, lang)} value={cc[k] || 0} max={tot} right={fmtNum(cc[k] || 0, lang) + unit} color={EXPR_TONES[k]} />)}
              </div>
            );
          })}
          {!compact && <p class="small muted mb-0">{maj(v.majority)} · {T('une décision par question', 'one decision per question')}</p>}
        </div>
      )}
      {r.kind === 'liste' && (
        <div>
          {r.ranked.map((x) => <BarRow key={x.id} label={x.name} value={x.votes} max={maxOf(r.ranked)} right={fmtNum(x.votes, lang) + ' · ' + x.seats + T(' siège' + (x.seats > 1 ? 's' : ''), ' seat' + (x.seats > 1 ? 's' : ''))} />)}
          {blancRow(maxOf(r.ranked))}
          {!compact && <div class="small mt-12">{r.ranked.filter((x) => x.seats).map((x) => <div key={x.id}><strong>{x.name}</strong> : {x.elected.join(', ')}</div>)}</div>}
          {!compact && <p class="small muted mt-8 mb-0">{T('Exprimés : ', 'Votes cast: ')}{fmtNum(r.exprimes, lang)} · {T(r.seats + ' sièges à la plus forte moyenne', r.seats + ' seats by highest average')}</p>}
        </div>
      )}
      {r.kind === 'resolution' && (
        <div>
          {['pour', 'contre', 'abstention', 'nppv', 'refus'].filter((k) => v.expr.includes(k)).map((k) => <BarRow key={k} label={<span title={optionLabel(item, k, lang)}>{exprShort(k, lang)}</span>} value={f.counts[k] || 0} max={Math.max(1, (f.counts.pour || 0) + (f.counts.contre || 0) + (f.counts.abstention || 0) + (f.counts.nppv || 0))} right={fmtNum(f.counts[k] || 0, lang) + unit} color={EXPR_TONES[k]} />)}
          {!compact && (
            <p class="small muted mt-8 mb-0">
              {maj(v.majority)} · {T('exprimés : ', 'votes cast: ')}{fmtNum(r.exprimes, lang)}
              {(v.abstNotCounted || (r.needed && v.majority !== 'simple')) && <> <Tip>{v.abstNotCounted ? T('Abstentions et NPPV ne comptent pas comme suffrages exprimés.', 'Abstentions and NPPV do not count as votes cast.') : ''}{r.needed && v.majority !== 'simple' ? T(' Seuil d’adoption : ', ' Threshold: ') + fmtNum(r.needed, lang) + (f.weighted ? T(' voix pondérées', ' weighted votes') : T(' voix', ' votes')) + '.' : ''}</Tip></>}
            </p>
          )}
        </div>
      )}
      {(r.kind === 'election' || r.kind === 'sondage') && (
        <div>
          {r.ranked.map((x) => <BarRow key={x.id} label={<span>{r.elected && r.elected.includes(x.id) && <Icon name="checkCircle" size={14} style={{ color: 'var(--green)', verticalAlign: '-2px', marginRight: '4px' }} />}{x.name}</span>} value={x.votes} max={maxOf(r.ranked)} right={fmtNum(x.votes, lang)} />)}
          {blancRow(maxOf(r.ranked))}
          {!compact && r.kind === 'election' && r.needed > 0 && <p class="small muted mt-8 mb-0">{T('Exprimés : ', 'Votes cast: ')}{fmtNum(r.exprimes, lang)} · {v.type === 'plurinominal' || R === 1 || vote.round >= R ? T('majorité relative', 'relative majority') : T('majorité absolue : ', 'absolute majority: ') + fmtNum(r.needed, lang)}</p>}
        </div>
      )}
      {r.kind === 'classement' && (
        <div>
          {r.ranked.map((x, i) => <BarRow key={x.id} label={(i + 1) + '. ' + x.name} value={x.votes} max={Math.max(1, r.ranked[0].votes)} right={fmtNum(x.votes, lang) + ' pts'} />)}
          {!compact && <p class="small muted mt-8 mb-0">{T('Méthode de Borda (4 points au 1er rang, 3 au 2e…)', 'Borda count (4 points for 1st, 3 for 2nd…)')}</p>}
        </div>
      )}
    </div>
  );
}

export function memberName(seance, id) { const m = seance.members.find((x) => x.id === id); return m ? m.name : id; }

// ------------------------------------------------------------------ Documents officiels (toujours en français)
// Bloc de résultat d'un scrutin (procès-verbal de séance et procès-verbal de scrutin)
function voteBlockHtml(seance, it, v) {
  const r = v.result, f = v.final;
  const nppv = it.vote.expr && it.vote.expr.includes('nppv');
  let det = '';
  if (r.kind === 'resolution') det = `<table><tr><th>Votants</th><th>Pour</th><th>Contre</th><th>Abstentions</th>${nppv ? '<th>NPPV</th>' : ''}<th>Exprimés</th></tr><tr><td>${f.votants}</td><td>${r.pour}</td><td>${r.contre}</td><td>${r.abst}</td>${nppv ? `<td>${r.nppv}</td>` : ''}<td>${r.exprimes}</td></tr></table>`;
  else if (r.kind === 'multi') det = `<table><tr><th>Question</th><th>Pour</th><th>Contre</th><th>Abstentions</th><th>Exprimés</th><th>Décision</th></tr>${r.questions.map((qq) => `<tr><td>${esc(qq.num)}. ${esc(qq.title)}</td><td>${qq.pour}</td><td>${qq.contre}</td><td>${qq.abst}</td><td>${qq.exprimes}</td><td>${qq.adopted ? 'Adoptée' : 'Rejetée'}</td></tr>`).join('')}</table><p style="font-size:9pt">${f.votants} votants · une décision par question au sein d’un même scrutin.</p>`;
  else if (r.kind === 'liste') det = `<table><tr><th>Liste</th><th>Voix</th><th>Sièges</th><th>Élu·e·s</th></tr>${r.ranked.map((x) => `<tr><td>${esc(x.name)}</td><td>${x.votes}</td><td>${x.seats}</td><td>${esc(x.elected.join(', '))}</td></tr>`).join('')}${r.blanc ? `<tr><td>Blancs</td><td>${r.blanc}</td><td></td><td></td></tr>` : ''}</table>`;
  else det = `<table><tr><th>${r.kind === 'classement' ? 'Rang' : 'Candidat·e / option'}</th><th>${r.kind === 'classement' ? 'Points' : 'Voix'}</th></tr>${r.ranked.map((x, i) => `<tr><td>${r.kind === 'classement' ? (i + 1) + '. ' : ''}${esc(x.name)}</td><td>${x.votes}</td></tr>`).join('')}${r.blanc ? `<tr><td>Blancs</td><td>${r.blanc}</td></tr>` : ''}</table>`;
  const nominal = it.vote.mode !== 'secret' && f.ballots && f.ballots.length ? `<p style="font-size:9pt"><strong>Votes nominatifs :</strong> ${f.ballots.slice().sort((a, b) => memberName(seance, a.memberId).localeCompare(memberName(seance, b.memberId))).map((b) => esc(memberName(seance, b.memberId)) + (b.proxyFor ? ' (pour ' + esc(memberName(seance, b.proxyFor)) + ')' : '') + ' : ' + esc(choiceLabel(it, b.choice, 'fr'))).join(' ; ')}.</p>` : `<p style="font-size:9pt">Vote secret : ${f.votants} votants ; rupture cryptographique entre l’identité et le bulletin.</p>`;
  const R = it.vote.rounds || 1;
  const ql = quorumLabel(it, 'fr');
  return `<p><strong>${esc(voteTypeLabel(it, 'fr'))}</strong>${v.round > 1 ? ' · ' + esc(roundLabel(v.round, R, 'fr').toLowerCase()) : ''} · ouvert à ${fmtTimeS(v.openedAt, 'fr')}, clos à ${fmtTimeS(v.closedAt, 'fr')}${ql ? ' · quorum requis : ' + esc(ql.toLowerCase()) : ''}.</p>${det}<p><strong>Décision : ${esc(r.text)}.</strong></p>${nominal}`;
}

// Procès-verbal d'un scrutin (un vote, un tour)
export function pvVoteHtml(seance, it, v) {
  const inst = INSTANCES.find((i) => i.id === seance.instance) || { name: seance.title };
  const parts = (v.final.participants || []).slice().sort((a, b) => a.at - b.at);
  return `<div class="doc-meta"><span>${esc(ESTAB.name)} · ${esc(inst.name)}</span><span>Procès-verbal de scrutin · ${esc(fmtDT(Date.now(), 'fr'))}</span></div>
  <h1>Procès-verbal du scrutin : point ${esc(it.num)}</h1>
  <p><strong>${esc(it.title)}</strong></p>
  <p>Séance du ${esc(fmtDateLong(seance.date, 'fr'))} · ${esc(seance.place)} · président : ${esc(memberName(seance, seance.president))} · secrétaire : ${esc(seance.secretary)}</p>
  ${voteBlockHtml(seance, it, v)}
  <h2>Émargements horodatés de ce scrutin</h2>
  <p style="font-size:9pt">${parts.length} émargement(s), enregistrés au moment du vote${it.vote.mode === 'secret' ? ', dissociés des bulletins (vote secret)' : ''} : ${parts.map((p) => esc(memberName(seance, p.memberId)) + (p.proxyFor ? ' (procuration de ' + esc(memberName(seance, p.proxyFor)) + ')' : '') + ' ' + esc(fmtTimeS(p.at, 'fr'))).join(' ; ') || 'aucun'}.</p>
  <div class="sig"><div>Le président de séance<br>${esc(memberName(seance, seance.president))}</div><div>Le secrétaire de séance<br>${esc(seance.secretary)}</div></div>
  <p style="font-size:8.5pt;color:#666">Démonstration · données fictives · empreinte du scrutin conservée dans le journal scellé.</p>`;
}

// Procès-verbal de séance (Word, PDF, aperçu)
export function pvSeanceHtml(st, seance) {
  const inst = INSTANCES.find((i) => i.id === seance.instance) || { name: seance.title };
  const q = quorumInfo(seance);
  const items = flatAgenda(seance.agenda);
  const present = seance.members.filter((m) => m.present);
  const proxies = seance.members.filter((m) => !m.present && m.proxyTo);
  const absent = seance.members.filter((m) => !m.present && !m.proxyTo && m.voting);
  const rows = items.map((it) => {
    const votes = Object.values(st.seance.votes).filter((v) => v.sid === seance.id && v.itemId === it.id && v.status === 'closed').sort((a, b) => a.round - b.round);
    if (it.kind === 'info' || it.kind === 'group') return `<h2>${esc(it.num)}. ${esc(it.title)}</h2>${it.kind === 'group' ? '<p>Point examiné à travers les votes ci-dessous.</p>' : '<p>Point d’information, sans vote.</p>'}`;
    if (!votes.length) return `<h2>${esc(it.num)}. ${esc(it.title)}</h2><p><em>Point non soumis au vote au moment de l’édition du procès-verbal.</em></p>`;
    return `<h2>${esc(it.num)}. ${esc(it.title)}</h2>` + votes.map((v) => voteBlockHtml(seance, it, v)).join('');
  }).join('');
  return `<div class="doc-meta"><span>${esc(ESTAB.name)} · ${esc(inst.name)}</span><span>Procès-verbal généré automatiquement le ${esc(fmtDT(Date.now(), 'fr'))}</span></div>
  <h1>Procès-verbal de la séance du ${esc(fmtDateLong(seance.date, 'fr'))}</h1>
  <p><strong>Instance :</strong> ${esc(inst.name)} · <strong>Lieu :</strong> ${esc(seance.place)} · <strong>Ouverture :</strong> ${seance.openedAt ? esc(fmtTime(seance.openedAt, 'fr')) : ''}${seance.closedAt ? ' · <strong>Clôture :</strong> ' + esc(fmtTime(seance.closedAt, 'fr')) : ''}</p>
  <p><strong>Président :</strong> ${esc(memberName(seance, seance.president))} · <strong>Secrétaire de séance :</strong> ${esc(seance.secretary)}</p>
  <h2>Présences et quorum</h2>
  <p>${q.present} membres présents ayant voix délibérative sur ${q.total} (${q.salle} en salle, ${q.visio} en visioconférence) · ${proxies.length} procuration(s) · quorum requis : ${q.required} · <strong>${q.ok ? 'quorum atteint' : 'quorum non atteint'}</strong>.</p>
  <p style="font-size:9pt"><strong>Présents :</strong> ${present.map((m) => esc(m.name) + (m.status !== 'titulaire' ? ' (' + esc(STATUS_LABELS[m.status].toLowerCase()) + ')' : '')).join(', ')}.</p>
  <p style="font-size:9pt"><strong>Représentés :</strong> ${proxies.map((m) => esc(m.name) + ' par ' + esc(memberName(seance, m.proxyTo))).join(', ') || 'aucun'}. <strong>Absents :</strong> ${absent.map((m) => esc(m.name)).join(', ') || 'aucun'}.</p>
  ${rows}
  <div class="sig"><div>Le président de séance<br>${esc(memberName(seance, seance.president))}</div><div>Le secrétaire de séance<br>${esc(seance.secretary)}</div></div>
  <p style="font-size:8.5pt;color:#666">Démonstration · données fictives · émargements horodatés à l’arrivée et à chaque vote conservés dans le journal scellé.</p>`;
}

export function pvXml(st, seance) {
  const items = flatAgenda(seance.agenda);
  const x = (s) => esc(s);
  const votes = items.map((it) => {
    const vs = Object.values(st.seance.votes).filter((v) => v.sid === seance.id && v.itemId === it.id && v.status === 'closed');
    const body = (v) => {
      const r = v.result;
      if (r.kind === 'resolution') return `      <pour>${r.pour}</pour>\n      <contre>${r.contre}</contre>\n      <abstention>${r.abst}</abstention>\n      <nppv>${r.nppv}</nppv>\n`;
      if (r.kind === 'multi') return r.questions.map((qq) => `      <question numero="${x(qq.num)}" pour="${qq.pour}" contre="${qq.contre}" abstention="${qq.abst}" decision="${qq.adopted ? 'adoptee' : 'rejetee'}">${x(qq.title)}</question>\n`).join('');
      if (r.kind === 'liste') return r.ranked.map((l) => `      <liste libelle="${x(l.name)}" voix="${l.votes}" sieges="${l.seats}"/>\n`).join('');
      return r.ranked.map((o) => `      <option libelle="${x(o.name)}" voix="${o.votes}"/>\n`).join('');
    };
    return vs.map((v) => `    <deliberation numero="${x(it.num)}" tour="${v.round}">\n      <objet>${x(it.title)}</objet>\n      <modalite>${x(voteTypeLabel(it, 'fr'))}</modalite>\n      <ouverture>${new Date(v.openedAt).toISOString()}</ouverture>\n      <cloture>${new Date(v.closedAt).toISOString()}</cloture>\n      <votants>${v.final.votants}</votants>\n${body(v)}      <decision>${x(v.result.text)}</decision>\n    </deliberation>`).join('\n');
  }).filter(Boolean).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Export structuré du procès-verbal (alimentation parapheur, GED, site internet, télétransmission). Démonstration. -->\n<seance id="${x(seance.id)}" instance="${x(seance.instance)}" date="${new Date(seance.date).toISOString()}">\n  <etablissement>${x(ESTAB.name)}</etablissement>\n  <president>${x(memberName(seance, seance.president))}</president>\n  <secretaire>${x(seance.secretary)}</secretaire>\n  <quorum present="${quorumInfo(seance).present}" requis="${quorumInfo(seance).required}"/>\n  <deliberations>\n${votes}\n  </deliberations>\n</seance>\n`;
}

export function statusChip(s) {
  if (s === 'live') return <Chip tone="live">{L('En cours', 'Live')}</Chip>;
  if (s === 'planned') return <Chip tone="sky">{L('Planifiée', 'Scheduled')}</Chip>;
  return <Chip tone="gray">{L('Clôturée', 'Closed')}</Chip>;
}
