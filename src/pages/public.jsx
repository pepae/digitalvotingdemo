// Pages publiques : accueil de la démonstration, matrice CCTP, accessibilité, architecture, mentions.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { PublicShell, profiles } from '../ui/shell.jsx';
import { Btn, Chip, Note, Refs, Tip, toast } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';
import { href, absUrl } from '../lib/router.js';
import * as CCTP from '../data/cctp.js';
import { PAGE_KB, TENDER } from '../config.js';
import { VOTERS } from '../data/remote.js';
import { esc } from '../lib/exporters.js';
import { L } from '../lib/i18n.js';

const { CCTP_ROWS, PART_LABELS } = CCTP;

const CRED = {
  'distance-admin': () => L('Clé FIDO2 simulée', 'Simulated FIDO2 key'),
  'distance-organisateur': () => L('Clé FIDO2 simulée', 'Simulated FIDO2 key'),
  'distance-votant': () => VOTERS.camille.login + ' / ' + VOTERS.camille.password,
  'seance-admin': () => L('SSO simulé', 'Simulated SSO'),
  'seance-organisateur': () => L('Code à usage unique simulé', 'Simulated one-time code'),
  'seance-votant': () => 'PIN 482 615',
};

function copyLink(path) {
  const v = absUrl(path);
  try { navigator.clipboard.writeText(v); toast(L('Lien direct copié', 'Direct link copied'), 'ok'); } catch (e) { toast(v, 'info', 8000); }
}

function SolutionColumn({ sol, title, sub, scenario }) {
  return (
    <section class="sol-col" aria-labelledby={'sol-' + sol}>
      <div class="sol-head">
        <div class="grow"><h2 id={'sol-' + sol} style={{ margin: 0, fontSize: '1.35rem' }}>{title}</h2><div class="small muted">{sub}</div></div>
        <Tip>{scenario}</Tip>
      </div>
      {profiles().filter((p) => p.sol === sol).map((p) => (
        <div class="row" key={p.path} style={{ flexWrap: 'nowrap', gap: '4px' }}>
          <a class="profile-card grow" href={href(p.path)}>
            <span class="pc-ico"><Icon name={p.icon} size={18} /></span>
            <span class="grow" style={{ minWidth: 0 }}>
              <span class="pc-title" style={{ display: 'block' }}>{p.title}</span>
              <span class="pc-desc" style={{ display: 'block' }}>{p.who}</span>
              <span class="cred" style={{ display: 'inline-block', marginTop: '4px' }} title={L('Accès de démonstration', 'Demo access')}>{CRED[sol + '-' + p.id]()}</span>
            </span>
          </a>
          <button class="btn btn-ghost btn-icon btn-sm" onClick={() => copyLink(p.path)} aria-label={L('Copier le lien direct : ', 'Copy direct link: ') + p.title} title={L('Copier le lien direct', 'Copy direct link')}><Icon name="link" size={16} /></button>
        </div>
      ))}
    </section>
  );
}

export function Landing() {
  const facts = [
    ['1 · 2 · 3', L('niveaux de sécurité CNIL', 'CNIL security levels'), ['2.5']],
    [L('3 sur 5', '3 of 5'), L('parts de clé pour dépouiller', 'key shares needed to count'), ['3.3']],
    ['SHA-256', L('journal chaîné, preuves vérifiables', 'hash-chained log, verifiable proofs'), ['6.1.4']],
    [L('99,9 %', '99.9%'), L('disponibilité, bascule de secours', 'availability, automatic failover'), ['6.1.1']],
    [L('Quorum', 'Quorum'), L('en direct, procurations, amendements', 'live, proxies, amendments'), ['4']],
    ['RGAA', L('clavier, contraste, FALC, FR / EN', 'keyboard, contrast, easy read, FR / EN'), ['2.9', '2.10']],
    [PAGE_KB + L(' ko', ' KB'), L('sans police, script ni traceur externe', 'no external fonts, scripts or trackers'), ['2.13']],
    ['Export', L('formats ouverts, réversibilité', 'open formats, reversibility'), ['2.15']],
  ];
  const tours = [
    { t: L('Électeur', 'Voter'), d: '5 min', steps: [[L('Se connecter', 'Sign in'), '/distance/electeur'], [L('Voter CSE puis F3SCT', 'Vote CSE then F3SCT'), '/distance/electeur'], [L('Vérifier son bulletin', 'Verify the ballot'), '/distance/verifier'], [L('Voir l’émargement', 'See the roll signature'), '/distance/bureau/emargement']] },
    { t: L('Bureau de vote', 'Polling station'), d: '6 min', steps: [[L('Cérémonie des clés', 'Key ceremony'), '/distance/bureau/scellement'], [L('Participation et alertes', 'Turnout and alerts'), '/distance/bureau/tableau'], [L('Clôture et parts de clé', 'Closing and key shares'), '/distance/bureau/depouillement'], [L('Résultats et PV', 'Results and minutes'), '/distance/bureau/resultats']] },
    { t: L('Séance en direct', 'Live meeting'), d: '4 min', steps: [[L('Console organisateur', 'Organiser console'), '/seance/organisateur/s/cme/console'], [L('Participant (2e onglet)', 'Participant (2nd tab)'), '/seance/participant'], [L('Voter et proclamer', 'Vote and announce'), '/seance/organisateur/s/cme/console'], [L('Sceller le PV', 'Seal the minutes'), '/seance/organisateur/s/cme/pv']] },
  ];
  const others = [
    ['/distance/expert', 'fingerprint', L('Expert indépendant', 'Independent expert')],
    ['/distance/verifier', 'search', L('Vérification publique', 'Public verification')],
    ['/seance/projection/cme', 'tv', L('Écran de projection', 'Projection screen')],
    ['/seance/organisateur/seances', 'wand', L('Séance de test', 'Test meeting')],
  ];
  return (
    <PublicShell current="/">
      <section class="hero">
        <div class="container">
          <h1>{L('Vote électronique, à distance et en séance.', 'E-voting, remote and in meetings.')}</h1>
          <p class="lead">{L('Démonstration interactive pour les établissements publics de santé.', 'Interactive demo for public healthcare facilities.')} <span style={{ whiteSpace: 'nowrap' }}>{L('Données fictives.', 'Fictitious data.')}</span></p>
          <div class="row mt-24">
            <Btn kind="primary" size="lg" href="#acces" onClick={(e) => { e.preventDefault(); const el = document.getElementById('acces'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{L('Choisir un profil', 'Choose a profile')}</Btn>
            <Btn size="lg" kind="ghost" href="/conformite" iconRight="chevronRight">{L('Matrice de conformité', 'Compliance matrix')}</Btn>
          </div>
        </div>
      </section>

      <section class="section" id="acces" aria-labelledby="h-acces" style={{ scrollMarginTop: '110px' }}>
        <div class="container">
          <div class="section-title"><h2 id="h-acces" class="sr-only">{L('Accès de démonstration', 'Demo access')}</h2><Refs list={['2.6', 'CRT']} /></div>
          <div class="grid g2">
            <SolutionColumn sol="distance" title={L('Vote à distance', 'Remote voting')} sub={L('Élections sur plusieurs jours', 'Elections over several days')} scenario={L('Étude de cas DQE : élections professionnelles de 8 500 agents en niveau 3 (6 urnes) et élections CME de 2 500 électeurs en niveau 2.', 'DQE case study: staff elections for 8,500 employees at level 3 (6 ballot boxes) and CME elections for 2,500 voters at level 2.')} />
            <SolutionColumn sol="seance" title={L('Vote en séance', 'Meeting voting')} sub={L('Votes en direct, en salle ou à distance', 'Live votes, in the room or remote')} scenario={L('Séance plénière de CME en direct (67 membres, procurations, amendements, élection à trois tours, vote groupé, scrutin de liste), AG de GIP en vote pondéré, CSIRMT en simultané.', 'Live CME plenary (67 members, proxies, amendments, three-round election, grouped vote, list vote), GIP general meeting with weighted votes, CSIRMT running at the same time.')} />
          </div>
          <nav class="row mt-16" aria-label={L('Autres accès', 'Other access')} style={{ gap: '4px 18px', justifyContent: 'center' }}>
            {others.map(([to, ic, l]) => <a key={to} href={href(to)} class="small" style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}><Icon name={ic} size={15} />{l}</a>)}
          </nav>
        </div>
      </section>

      <section class="section" aria-labelledby="h-tours">
        <div class="container">
          <div class="section-title"><h2 id="h-tours">{L('Parcours guidés', 'Guided tours')}</h2><span class="small muted">{L('Les profils partagent le même état, y compris entre onglets.', 'Profiles share one state, even across tabs.')}</span></div>
          <div class="grid g3">
            {tours.map((tr) => (
              <div class="card" key={tr.t}>
                <div class="row-between"><h3 class="mb-0">{tr.t}</h3><span class="xs muted">{tr.d}</span></div>
                <ol class="list-plain mt-12 stack stack-s">
                  {tr.steps.map(([l, p], i) => <li key={i} class="row" style={{ flexWrap: 'nowrap', gap: '10px' }}><span class="tag-num">{i + 1}</span><a href={href(p)}>{l}</a></li>)}
                </ol>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section class="section" aria-labelledby="h-feat">
        <div class="container">
          <div class="section-title"><h2 id="h-feat">{L('En bref', 'At a glance')}</h2></div>
          <div class="grid g4 facts">
            {facts.map(([v, l, refs]) => (
              <div class="kpi" key={l}>
                <div class="k-value">{v}</div>
                <div class="k-sub">{l}</div>
                <Refs list={refs} />
              </div>
            ))}
          </div>
        </div>
      </section>
      <div class="page-end-spacer" />
    </PublicShell>
  );
}

export function Conformite({ q }) {
  const [scope, setScope] = useState('all');
  const [text, setText] = useState('');
  const focusRef = q.ref || '';
  const en = L(false, true);
  const req = (r) => (en && r.reqEn) || r.req;
  const how = (r) => (en && r.howEn) || r.how;
  const parts = en && CCTP.PART_LABELS_EN ? CCTP.PART_LABELS_EN : PART_LABELS;
  useEffect(() => {
    if (!focusRef) return;
    setTimeout(() => { const el = document.querySelector('tr.hl'); if (el) el.scrollIntoView({ block: 'center' }); }, 120);
  }, [focusRef]);
  const rows = useMemo(() => CCTP_ROWS.filter((r) => (scope === 'all' || r.s === scope || r.s === 'C') && (!text || (r.req + ' ' + r.how + ' ' + (r.reqEn || '') + ' ' + (r.howEn || '') + ' ' + r.ref).toLowerCase().includes(text.toLowerCase()))), [scope, text]);
  const partIds = [...new Set(rows.map((r) => r.part))];
  return (
    <PublicShell current="/conformite">
      <div class="container section">
        <div class="page-head">
          <div class="grow">
            <h1>{L('Matrice de conformité', 'Compliance matrix')}</h1>
            <p class="ph-sub">{L('Chaque exigence du CCTP, reliée à l’écran qui la démontre.', 'Every CCTP requirement, linked to the screen that shows it.')} {focusRef && <strong>{focusRef === 'CRT' ? 'CRT' : '§ ' + focusRef}</strong>}</p>
          </div>
          <div class="ph-actions"><Btn kind="ghost" icon="print" onClick={() => window.print()}>{L('Imprimer', 'Print')}</Btn></div>
        </div>
        <div class="row mb-16">
          <div class="seg" role="group" aria-label={L('Filtrer par solution', 'Filter by solution')}>
            {[['all', L('Toutes', 'All')], ['D', L('À distance', 'Remote')], ['S', L('En séance', 'Meeting')]].map(([k, l]) => <button key={k} aria-pressed={scope === k ? 'true' : 'false'} onClick={() => setScope(k)}>{l}</button>)}
          </div>
          <div class="grow" style={{ maxWidth: '380px' }}>
            <label class="sr-only" for="cctp-search">{L('Rechercher une exigence', 'Search requirements')}</label>
            <input id="cctp-search" class="input" placeholder={L('Rechercher', 'Search')} value={text} onInput={(e) => setText(e.currentTarget.value)} />
          </div>
          <span class="small muted">{rows.length}</span>
        </div>
        {partIds.map((p) => (
          <div key={p} class="mb-24">
            <h2>{parts[p]}</h2>
            <div class="table-wrap">
              <table class="table">
                <thead><tr><th style={{ width: '64px' }}>§</th><th>{L('Exigence', 'Requirement')}</th><th>{L('Démonstration', 'Shown in the demo')}</th><th style={{ width: '96px' }}><span class="sr-only">{L('Solution', 'Solution')}</span></th><th style={{ width: '70px' }}><span class="sr-only">{L('Lien', 'Link')}</span></th></tr></thead>
                <tbody>
                  {rows.filter((r) => r.part === p).map((r, i) => (
                    <tr key={i} class={focusRef && (r.ref === focusRef || r.ref.startsWith(focusRef + '.')) ? 'hl' : ''}>
                      <td class="strong">{r.ref}</td>
                      <td>{req(r)}</td>
                      <td class="muted">{how(r)}</td>
                      <td>{r.s === 'D' ? <Chip>{L('À distance', 'Remote')}</Chip> : r.s === 'S' ? <Chip tone="ok">{L('En séance', 'Meeting')}</Chip> : <Chip tone="gray">{L('Commun', 'Both')}</Chip>}</td>
                      <td><a class="btn btn-xs" href={href(r.to)}>{L('Voir', 'Open')}</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {!rows.length && <p class="muted">{L('Aucun résultat.', 'No results.')}</p>}
      </div>
    </PublicShell>
  );
}

export function Accessibilite() {
  const measures = [
    [L('Lien d’évitement, titres et régions structurés.', 'Skip link, structured headings and landmarks.')],
    [L('Navigation complète au clavier, focus toujours visible, modales avec piège de focus.', 'Full keyboard navigation, always-visible focus, modals that trap focus.')],
    [L('Contraste renforcé, taille du texte (jusqu’à +37,5 %), espacement adapté.', 'High contrast, text size (up to +37.5%), wider spacing.')],
    [L('Formulaires étiquetés, erreurs reliées aux champs, aucun délai imposé pour voter.', 'Labelled forms, errors tied to fields, no time limit to vote.')],
    [L('Bulletins en vrais boutons radio et cases à cocher, légendés pour les lecteurs d’écran.', 'Ballots built from real radio buttons and checkboxes, labelled for screen readers.')],
    [L('Zones dynamiques annoncées par des régions ARIA « live ».', 'Live updates announced through ARIA live regions.')],
    [L('Mode « Facile à lire » (FALC), interface français / anglais.', 'Easy-read mode (FALC), French / English interface.')],
    [L('Graphiques doublés de tableaux de données.', 'Charts backed by data tables.')],
    [L('Utilisable à 320 px de large et avec un zoom de 200 %.', 'Usable at 320 px wide and at 200% zoom.')],
    [L('Respect de la préférence « réduire les animations ».', 'Honours the “reduce motion” setting.')],
  ];
  return (
    <PublicShell current="/accessibilite">
      <div class="container-m section">
        <h1>{L('Déclaration d’accessibilité', 'Accessibility statement')}</h1>
        <p class="lead">{L('Projet · RGAA 4.1.2', 'Draft · RGAA 4.1.2')} <Refs list={['2.9', '2.10']} /></p>
        <div class="card mt-24 stack stack-l">
          <section>
            <h2>{L('État de conformité', 'Compliance status')}</h2>
            <p><strong>{L('Non conforme', 'Not compliant')}</strong>{L(' : aucun audit n’a encore été réalisé, la réglementation impose donc ce statut.', ': no audit has been carried out yet, so the regulations require this status.')}</p>
            <p class="small muted mb-0">{L('La déclaration sera mise à jour après un audit RGAA indépendant, avec le taux de conformité mesuré.', 'The statement will be updated after an independent RGAA audit, with the measured compliance rate.')}</p>
          </section>
          <section>
            <h2>{L('Engagement', 'Commitment')}</h2>
            <p class="mb-0">{L('Portail électeur, portail d’administration et solution de vote en séance accessibles selon l’article 47 de la loi n° 2005-102 et la directive (UE) 2016/2102.', 'Voter portal, administration portal and meeting voting made accessible under article 47 of French law 2005-102 and Directive (EU) 2016/2102.')}</p>
          </section>
          <section>
            <h2>{L('Mesures en place', 'Measures in place')}</h2>
            <ul class="list-check">
              {measures.map(([x]) => <li key={x}><Icon name="check" size={18} />{x}</li>)}
            </ul>
          </section>
          <section>
            <h2>{L('Calendrier prévisionnel', 'Planned schedule')}</h2>
            <div class="table-wrap"><table class="table"><tbody>
              <tr><td>{L('Audit RGAA indépendant des trois portails', 'Independent RGAA audit of the three portals')}</td><td class="muted">{L('Avant la mise en production', 'Before go-live')}</td></tr>
              <tr><td>{L('Tests avec des utilisateurs en situation de handicap', 'Tests with disabled users')}</td><td class="muted">{L('Avant la mise en production', 'Before go-live')}</td></tr>
              <tr><td>{L('Correction des non-conformités bloquantes', 'Fix blocking issues')}</td><td class="muted">{L('Avant tout scrutin', 'Before any election')}</td></tr>
              <tr><td>{L('Déclaration définitive et schéma pluriannuel', 'Final statement and multi-year plan')}</td><td class="muted">{L('Après l’audit', 'After the audit')}</td></tr>
            </tbody></table></div>
          </section>
          <section>
            <h2>{L('Contact et recours', 'Contact and appeal')}</h2>
            <p class="mb-0">{L('Le centre d’assistance fournit une alternative accessible. À défaut de réponse satisfaisante, saisir le Défenseur des droits.', 'The support centre provides an accessible alternative. Without a satisfactory answer, contact the Défenseur des droits (French ombudsman).')}</p>
          </section>
        </div>
      </div>
    </PublicShell>
  );
}

function ArchDiagram() {
  const T = (fr, en) => L(fr, en);
  return (
    <svg class="diagram" viewBox="0 0 920 305" role="img" aria-labelledby="arch-t arch-d">
      <title id="arch-t">{T('Architecture de la solution de vote à distance', 'Remote voting architecture')}</title>
      <desc id="arch-d">{T('Le bulletin est chiffré sur le terminal de l’électeur, déposé dans l’urne (dispositif principal et de secours), l’émargement est séparé. Après clôture, les détenteurs de parts de clé déchiffrent le total agrégé. Résultats et preuves sont vérifiables.', 'The ballot is encrypted on the voter’s device and stored in the ballot box (primary and backup systems); the roll signature is kept separately. After closing, key holders decrypt the aggregate total. Results and proofs are verifiable.')}</desc>
      <defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#86868B" /></marker></defs>
      <g font-size="13" fill="#1D1D1F">
        <rect x="16" y="110" width="170" height="100" rx="16" fill="#F5F5F7" />
        <text x="101" y="148" text-anchor="middle" font-weight="600">{T('Terminal électeur', 'Voter device')}</text>
        <text x="101" y="172" text-anchor="middle" font-size="12" fill="#6E6E73">{T('chiffrement local', 'local encryption')}</text>
        <rect x="262" y="30" width="220" height="110" rx="16" fill="#F5F5F7" />
        <text x="372" y="66" text-anchor="middle" font-weight="600">{T('Urnes chiffrées', 'Encrypted ballot boxes')}</text>
        <text x="372" y="90" text-anchor="middle" font-size="12" fill="#6E6E73">{T('anonymes, non datées', 'anonymous, undated')}</text>
        <text x="372" y="112" text-anchor="middle" font-size="12" fill="#1E7B45">{T('principal ⇄ secours (UE)', 'primary ⇄ backup (EU)')}</text>
        <rect x="262" y="190" width="220" height="100" rx="16" fill="#F5F5F7" />
        <text x="372" y="230" text-anchor="middle" font-weight="600">{T('Émargement', 'Voter roll')}</text>
        <text x="372" y="254" text-anchor="middle" font-size="12" fill="#6E6E73">{T('horodaté, séparé du bulletin', 'timestamped, apart from ballots')}</text>
        <rect x="560" y="30" width="170" height="110" rx="16" fill="#EEF2FE" />
        <text x="645" y="66" text-anchor="middle" font-weight="600" fill="#2F5BEA">{T('Bureau de vote', 'Polling station')}</text>
        <text x="645" y="90" text-anchor="middle" font-size="12" fill="#6E6E73">{T('5 parts, seuil 3', '5 shares, threshold 3')}</text>
        <rect x="560" y="190" width="170" height="100" rx="16" fill="#F5F5F7" />
        <text x="645" y="230" text-anchor="middle" font-weight="600">{T('Journal chaîné', 'Hash-chained log')}</text>
        <text x="645" y="254" text-anchor="middle" font-size="12" fill="#6E6E73">SHA-256</text>
        <rect x="790" y="100" width="118" height="120" rx="16" fill="#EAF6EF" />
        <text x="849" y="150" text-anchor="middle" font-weight="600" fill="#1E7B45">{T('Résultats', 'Results')}</text>
        <text x="849" y="174" text-anchor="middle" font-size="12" fill="#6E6E73">{T('+ preuves', '+ proofs')}</text>
      </g>
      <g stroke="#86868B" stroke-width="1.5" fill="none" marker-end="url(#ar)">
        <path d="M186 150 C 220 140, 230 100, 258 92" />
        <path d="M186 175 C 220 195, 230 230, 258 238" />
        <path d="M482 85 L 556 85" />
        <path d="M730 85 C 760 85, 770 130, 788 140" />
        <path d="M482 240 L 556 240" />
      </g>
      <g font-size="11.5" fill="#6E6E73">
        <text x="188" y="98" text-anchor="middle">{T('bulletin chiffré', 'encrypted ballot')}</text>
        <text x="182" y="240" text-anchor="middle">{T('émargement', 'roll signature')}</text>
        <text x="490" y="76">{T('total agrégé', 'aggregate')}</text>
      </g>
    </svg>
  );
}

export function APropos({ q = {} }) {
  useEffect(() => {
    if (!q.cnil) return;
    const el = document.getElementById('cnil-' + q.cnil.split(' ')[0]);
    if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('hl'); }
  }, [q.cnil]);
  const cnil = [
    ['1-02', '1-02', L('Vote indivisible : suffrage, dépôt, émargement et accusé en une opération.', 'Indivisible vote: choice, deposit, roll signature and receipt in one step.')],
    ['1-07', '1-07', L('Identité et bulletin séparés : bulletin non daté, émargement à part.', 'Identity kept apart from ballot: undated ballot, separate roll.')],
    ['1-08', '1-08 · 3-04', L('Secret de dépouillement réparti entre les membres du bureau.', 'Counting secret split among polling station members.')],
    ['1-09', '1-09', L('Dépouillement de l’urne entière uniquement, après clôture.', 'Only the whole ballot box can be counted, after closing.')],
    ['1-11', '1-11 · 3-02', L('Dépouillement vérifiable a posteriori, y compris par un outil tiers.', 'Count verifiable afterwards, including with a third-party tool.')],
    ['2-02', '2-02 → 2-04', L('Contrôles automatiques et manuels, alertes immédiates, journal des alertes.', 'Automatic and manual checks, instant alerts, alert log.')],
    ['2-05', '2-05', L('Une urne et une clé par scrutin ; suspension d’une urne sans impact sur les autres.', 'One box and one key per election; one box can be suspended without affecting others.')],
    ['2-07', '2-07', L('Vérification individuelle par code, jusqu’à l’expiration des délais de recours.', 'Individual verification by code, until the appeal deadline expires.')],
    ['3-05', '3-05', L('Code source exécuté sur le terminal de l’électeur publié avant le scrutin.', 'Source code run on the voter’s device published before the election.')],
  ];
  return (
    <PublicShell current="/a-propos">
      <div class="container section">
        <h1>{L('Architecture et sécurité', 'Architecture and security')}</h1>
        <p class="lead" style={{ maxWidth: '720px' }}>{L('Le bulletin est chiffré sur le terminal de l’électeur. Seul le total de chaque urne est déchiffré, après clôture, par le bureau de vote réuni.', 'The ballot is encrypted on the voter’s device. Only each box’s total is decrypted, after closing, by the assembled polling station.')}</p>
        <div class="card mt-16"><ArchDiagram /></div>
        <div class="grid g2 mt-24">
          <div class="card">
            <h2>{L('Répartition des rôles', 'Who does what')}</h2>
            <div class="stack">
              <div><strong>VoteBase</strong><p class="small muted mb-0">{L('Plateforme SaaS et portails, hébergement, exploitation, assistance, gestion de projet.', 'SaaS platform and portals, hosting, operations, support, project management.')}</p></div>
              <div><strong>Shutter</strong> <span class="small muted">(brainbot)</span><p class="small muted mb-0">{L('Chiffrement à seuil, cérémonie des clés, dépouillement vérifiable, scellement. Composants open source.', 'Threshold encryption, key ceremony, verifiable counting, sealing. Open-source components.')}</p></div>
            </div>
          </div>
          <div class="card">
            <h2>{L('Objectifs CNIL', 'CNIL objectives')}</h2>
            <p class="xs muted">{L('Délibération n° 2026-045 du 19 mars 2026', 'Deliberation 2026-045 of 19 March 2026')}</p>
            <ul class="list-check small cnil-list">
              {cnil.map(([id, code, txt]) => <li id={'cnil-' + id} key={id}><Icon name="check" size={18} /><span><strong>{code}</strong> {txt}</span></li>)}
            </ul>
          </div>
          <div class="card">
            <h2>{L('Hébergement et continuité', 'Hosting and continuity')}</h2>
            <ul class="list-check small">
              <li><Icon name="check" size={18} />{L('Données et sauvegardes dans l’Union européenne ; option France ISO 27001.', 'Data and backups in the European Union; France ISO 27001 option.')}</li>
              <li><Icon name="check" size={18} />{L('Dispositif de secours identique, bascule automatique (décret n° 2024-1038).', 'Identical backup system, automatic failover (decree 2024-1038).')}</li>
              <li><Icon name="check" size={18} />{L('Disponibilité 99,9 %, DIMA de 30 minutes pendant le vote.', '99.9% availability, 30-minute maximum outage during voting.')}</li>
              <li><Icon name="check" size={18} />{L('Une urne et une clé par scrutin.', 'One box and one key per election.')}</li>
            </ul>
          </div>
          <div class="card">
            <h2>{L('Navigateurs', 'Browsers')}</h2>
            <ul class="list-check small">
              <li><Icon name="check" size={18} />{L('Aucune installation : ordinateur, tablette ou smartphone.', 'Nothing to install: computer, tablet or phone.')}</li>
              <li><Icon name="check" size={18} />{L('Chrome, Edge, Firefox, Safari, y compris versions de plus de trois ans (Chrome 80, Safari 13).', 'Chrome, Edge, Firefox, Safari, including versions over three years old (Chrome 80, Safari 13).')}</li>
              <li><Icon name="check" size={18} />{L('Bas débit : page légère, sans ressource externe.', 'Low bandwidth: light page, no external resources.')}</li>
              <li><Icon name="info" size={18} />{L('Internet Explorer n’est plus maintenu depuis 2022 : Edge le remplace.', 'Internet Explorer is unsupported since 2022: Edge replaces it.')}</li>
            </ul>
          </div>
          <div class="card">
            <h2>{L('Intelligence artificielle', 'Artificial intelligence')}</h2>
            <p class="small">{L('Aucune IA dans la chaîne de vote ni dans l’ordre d’affichage des candidatures. Hors annexe III, point 8 b) du règlement (UE) 2024/1689.', 'No AI in the voting chain or in candidate ordering. Outside Annex III, point 8(b) of Regulation (EU) 2024/1689.')}</p>
            <p class="small muted mb-0">{L('Les outils d’IA de conception ou de support sont déclarés dans l’annexe « Conformité RGPD et IA ».', 'AI tools used for design or support are declared in the “GDPR and AI compliance” annex.')}</p>
          </div>
        </div>
        <h2 class="mt-32">{L('Références', 'References')}</h2>
        <div class="table-wrap"><table class="table"><tbody>
          <tr><td class="strong">{L('Décret n° 2024-1038', 'Decree 2024-1038')}</td><td class="muted">{L('Vote électronique, élections professionnelles de la fonction publique', 'E-voting for public service staff elections')}</td></tr>
          <tr><td class="strong">{L('Délibération CNIL n° 2026-045', 'CNIL deliberation 2026-045')}</td><td class="muted">{L('Sécurité du vote par internet, trois niveaux de risque', 'Internet voting security, three risk levels')}</td></tr>
          <tr><td class="strong">ANSSI-PA-118</td><td class="muted">{L('Vote par internet pour les élections non politiques', 'Internet voting for non-political elections')}</td></tr>
          <tr><td class="strong">RGAA · RGESN · RGPD · AI Act</td><td class="muted">{L('Accessibilité, écoconception, données, IA', 'Accessibility, eco-design, data, AI')}</td></tr>
        </tbody></table></div>
      </div>
    </PublicShell>
  );
}

export function Mentions() {
  return (
    <PublicShell current="/mentions">
      <div class="container-m section">
        <h1>{L('Données de la démonstration', 'Demo data')}</h1>
        <div class="card stack">
          <p>{L('Tout fonctionne dans votre navigateur : aucune donnée envoyée, aucun cookie, aucun traceur, aucune ressource externe.', 'Everything runs in your browser: no data sent, no cookies, no trackers, no external resources.')}</p>
          <p>{L('L’état de la démo est conservé localement pour rester cohérent entre profils et onglets. Il se réinitialise après trois jours ou via le menu Options du bandeau.', 'The demo state is stored locally to stay consistent across profiles and tabs. It resets after three days or from the Options menu in the top bar.')}</p>
          <p>{L('Établissements, syndicats, personnes, identifiants et coordonnées sont fictifs. Ne saisissez aucune donnée réelle.', 'Facilities, unions, people, identifiers and contact details are fictitious. Do not enter real data.')}</p>
          <p class="small muted mb-0">{L('Démonstration pour l’appel d’offres ' + esc(TENDER.buyer) + ' n° ' + TENDER.ref + '. Ce n’est pas un service de vote en production.', 'Demo for ' + esc(TENDER.buyer) + ' tender ' + TENDER.ref + '. This is not a production voting service.')}</p>
        </div>
      </div>
    </PublicShell>
  );
}
