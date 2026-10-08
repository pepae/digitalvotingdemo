// Espace de l'expert indépendant : accès en lecture seule aux éléments de contrôle (CCTP 7.2.3, CNIL).
import { useState } from 'preact/hooks';
import { useStore, dispatch } from '../lib/store.js';
import { go } from '../lib/router.js';
import { BackOffice } from '../ui/shell.jsx';
import { Btn, Chip, Card, PageHead, KV, CheckRow, toast, Tip } from '../ui/kit.jsx';
import { BackOfficeLogin } from './bo_common.jsx';
import { urnResults } from '../lib/sim.js';
import { verifyChain } from '../lib/journal.js';
import { sha256, shortFp } from '../lib/sha256.js';
import { fmtDT } from '../lib/format.js';
import { downloadJSON, printHtml, esc } from '../lib/exporters.js';
import { ESTAB, opName } from '../data/remote.js';
import { L, tx } from '../lib/i18n.js';

const ME = { name: 'Cabinet Démo-Expertise', role: 'Expert indépendant (fictif) · lecture seule' };

export function ExpertView() {
  const st = useStore();
  const [checked, setChecked] = useState(null);
  if (!st.auth.r_expert) {
    return <BackOfficeLogin title={L('Expertise indépendante', 'Independent audit')} sub={L('Vote à distance · lecture seule', 'Remote voting · read-only')} user={{ name: ME.name, role: L('Expert indépendant (fictif)', 'Independent expert (fictitious)') }}
      methods={[['fido', L('Clé de sécurité (FIDO2)', 'Security key (FIDO2)'), L('Remise pour la mission', 'Issued for the audit'), 'key'], ['pwd', L('Code à usage unique', 'One-time code'), L('Application d’authentification', 'Authenticator app'), 'lock']]}
      refs={['7.2.3', '3']} note={L('Accès simulé en lecture seule, journalisé.', 'Simulated read-only access, logged.')}
      onDone={(m) => { dispatch('auth/login', { key: 'r_expert', user: { ...ME, method: m } }); dispatch('r/journal', { actor: ME.name, role: 'Expert indépendant', action: 'Connexion en lecture seule à l’espace d’expertise', detail: m === 'fido' ? 'Clé FIDO2' : 'Code à usage unique', op: 'ep26' }); }} />;
  }
  const R = st.remote;
  const op = R.ops.ep26;
  const report = R.journal.find((e) => e.action === 'Rapport d’expertise remis');
  const chain = verifyChain(R.journal);
  const runCheck = () => {
    const ok = Object.values(R.ops).every((o) => sha256(Object.values(o.seals).join('')) === o.sealHash);
    setChecked({ at: Date.now(), ok });
    dispatch('r/journal', { actor: ME.name, role: 'Expert indépendant', action: 'Vérification des scellés et du journal', detail: ok && chain.ok ? 'Conformes' : 'Écart détecté', op: 'ep26' });
    toast(ok ? L('Scellés conformes', 'Seals verified') : L('Écart sur un scellé', 'Seal mismatch'), ok ? 'ok' : 'err');
  };
  // Dossier exporté : contenu en français (pièce de l'expertise)
  const dossier = () => {
    const test = R.ops.test26;
    const r = urnResults(st, 'test-a', Date.now());
    downloadJSON('dossier-expert-' + test.id + '.json', {
      etablissement: ESTAB.name, operation: test.name, scelles: test.seals, empreinteSysteme: test.sealHash,
      journal: { entrees: chain.count, derniereEmpreinte: chain.last, integre: chain.ok },
      resultats: { inscrits: r.inscrits, votants: r.votants, exprimes: r.exprimes, voix: r.votes, sieges: r.seats },
      note: 'Dossier de démonstration (fictif) : en production, il permet de rejouer le dépouillement avec un outil indépendant.',
    });
  };
  const nav = [{ group: L('Expertise', 'Audit'), items: [{ path: '/distance/expert', label: L('Contrôles', 'Checks'), icon: 'fingerprint' }] }];
  const fp10 = (h) => <span class="fp">{shortFp(h, 10)}</span>;
  return (
    <BackOffice brandSub={L('Expertise · lecture seule', 'Audit · read-only')} nav={nav} current="/distance/expert" user={{ name: ME.name, role: L('Expert indépendant', 'Independent expert') }} context={<><Chip tone="gray">{ESTAB.name}</Chip><Chip tone="warn">{L('Lecture seule', 'Read-only')}</Chip></>} onLogout={() => { dispatch('auth/logout', { key: 'r_expert' }); go('/'); }}>
      <PageHead title={L('Contrôles de l’expert', 'Expert checks')} sub={opName(op)} refs={['7.2.3', '3', '6.1.4']} actions={<Btn kind="primary" icon="shieldCheck" onClick={runCheck}>{L('Vérifier les scellés et le journal', 'Verify seals and log')}</Btn>} />
      <div class="grid g2">
        <Card title={L('Rapport d’expertise', 'Audit report')}>
          <KV items={[[L('Remis le', 'Delivered'), report ? fmtDT(report.at) : L('Non remis', 'Not delivered')], [L('Conclusion', 'Conclusion'), report ? tx(report.detail) : ''], [L('Périmètre', 'Scope'), L('Code, cryptographie, hébergement, procédures, accessibilité', 'Code, cryptography, hosting, procedures, accessibility')], [L('Niveau', 'Level'), L('Niveau ' + op.level + ' (CNIL 2026-045)', 'Level ' + op.level + ' (CNIL 2026-045)')]]} />
          <div class="mt-12"><Btn size="sm" icon="print" onClick={() => printHtml(`<h1>Synthèse du rapport d’expertise (fictif)</h1><p>${esc(op.name)} · ${esc(ESTAB.name)}</p><p>Conclusion : ${esc(report ? report.detail : '')}.</p><p>Empreinte du système scellé : ${esc(op.seals.system)}</p>`)}>{L('Imprimer la synthèse', 'Print summary')}</Btn></div>
        </Card>
        <Card title={L('Scellés', 'Seals')} actions={<Tip>{L('Au niveau 3, le code exécuté chez l’électeur est publié avec son empreinte, comparée à la version scellée.', 'At level 3, the code run on the voter’s device is published with its fingerprint, compared with the sealed version.')}</Tip>}>
          <KV items={[[L('Système de vote', 'Voting system'), fp10(op.seals.system)], [L('Listes de candidats', 'Candidate lists'), fp10(op.seals.lists)], [L('Liste électorale', 'Electoral roll'), fp10(op.seals.electors)], [L('Horaires', 'Schedule'), fp10(op.seals.schedule)]]} />
        </Card>
        <Card title={L('Intégrité', 'Integrity')}>
          <CheckRow ok={chain.ok} title={chain.ok ? L('Journal intègre', 'Log intact') : L('Journal altéré', 'Log tampered')} sub={chain.ok ? L(chain.count + ' entrées', chain.count + ' entries') : null} />
          {checked && <CheckRow ok={checked.ok} title={checked.ok ? L('Scellés recalculés', 'Seals recomputed') : L('Écart sur un scellé', 'Seal mismatch')} sub={fmtDT(checked.at)} />}
          <CheckRow ok title={L('Aucune écriture possible', 'No write access')} />
        </Card>
        <Card title={L('Dossier de vérification', 'Audit file')}>
          <p class="small muted">{L('Scellés, journal et résultats du vote test, à rejouer avec un outil tiers.', 'Seals, log and test vote results, to replay with a third-party tool.')}</p>
          <Btn size="sm" icon="download" onClick={dossier}>{L('Télécharger (JSON)', 'Download (JSON)')}</Btn>
        </Card>
      </div>
    </BackOffice>
  );
}
