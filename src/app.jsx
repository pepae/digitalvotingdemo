// Application : routes, réglages d'affichage, éléments globaux.
import { useEffect } from 'preact/hooks';
import { useStore } from './lib/store.js';
import { useRoute, match, href } from './lib/router.js';
import { DemoBar, PoweredBy, PublicShell } from './ui/shell.jsx';
import { Toasts, Btn } from './ui/kit.jsx';
import { L } from './lib/i18n.js';
import { Landing, Conformite, Accessibilite, APropos, Mentions } from './pages/public.jsx';
import { VoterWelcome, VoterScrutins, VoterBallot, VoterReceipt, VoterLostCreds, VoterHelp, VoterList, PublicVerify } from './pages/remote_voter.jsx';
import { BureauGate } from './pages/remote_bureau.jsx';
import { AdminGate } from './pages/remote_admin.jsx';
import { ParticipantAccess, ParticipantSeance } from './pages/seance_participant.jsx';
import { OrganizerGate, Projection } from './pages/seance_organizer.jsx';
import { SeanceAdminGate } from './pages/seance_admin.jsx';
import { ExpertView } from './pages/expert.jsx';

const ROUTES = [
  ['/', (p, q) => <Landing />, ['Démonstration', 'Demo']],
  ['/conformite', (p, q) => <Conformite q={q} />, ['Matrice de conformité CCTP', 'CCTP compliance matrix']],
  ['/accessibilite', () => <Accessibilite />, ['Accessibilité', 'Accessibility']],
  ['/a-propos', (p, q) => <APropos q={q} />, ['Architecture et sécurité', 'Architecture and security']],
  ['/mentions', () => <Mentions />, ['Données de la démonstration', 'Demo data']],
  ['/distance/electeur', (p, q) => <VoterWelcome q={q} />],
  ['/distance/electeur/scrutins', () => <VoterScrutins />],
  ['/distance/electeur/scrutin/:id', (p, q) => <VoterBallot urnId={p.id} q={q} />],
  ['/distance/electeur/recu/:id', (p) => <VoterReceipt urnId={p.id} />],
  ['/distance/electeur/identifiants', () => <VoterLostCreds />, ['Identifiants perdus', 'Lost credentials']],
  ['/distance/electeur/aide', (p, q) => <VoterHelp q={q} />, ['Aide électeur', 'Voter help']],
  ['/distance/electeur/liste', () => <VoterList />, ['Vérifier mon inscription', 'Check my registration']],
  ['/distance/verifier', (p, q) => <PublicVerify q={q} />, ['Vérification d’un bulletin', 'Ballot verification']],
  ['/distance/bureau', (p, q) => <BureauGate q={q} />, ['Bureau de vote', 'Polling station']],
  ['/distance/bureau/:page', (p, q) => <BureauGate page={p.page} q={q} />, ['Bureau de vote', 'Polling station']],
  ['/distance/expert', () => <ExpertView />, ['Expertise indépendante', 'Independent audit']],
  ['/distance/admin', (p, q) => <AdminGate q={q} />, ['Administration · vote à distance', 'Administration · remote voting']],
  ['/distance/admin/:page', (p, q) => <AdminGate page={p.page} q={q} />, ['Administration · vote à distance', 'Administration · remote voting']],
  ['/distance/admin/:page/:sub', (p, q) => <AdminGate page={p.page} sub={p.sub} q={q} />, ['Administration · vote à distance', 'Administration · remote voting']],
  ['/seance/participant', (p, q) => <ParticipantAccess q={q} />],
  ['/seance/participant/s/:sid', (p) => <ParticipantSeance sid={p.sid} />],
  ['/seance/organisateur', (p, q) => <OrganizerGate q={q} />, ['Organisateur de séance', 'Meeting organiser']],
  ['/seance/organisateur/seances', (p, q) => <OrganizerGate page="seances" q={q} />, ['Mes séances', 'My meetings']],
  ['/seance/organisateur/nouvelle', (p, q) => <OrganizerGate page="nouvelle" q={q} />, ['Nouvelle séance', 'New meeting']],
  ['/seance/organisateur/s/:sid', (p, q) => <OrganizerGate sid={p.sid} q={q} />, ['Préparation de séance', 'Meeting preparation']],
  ['/seance/organisateur/s/:sid/:sub', (p, q) => <OrganizerGate sid={p.sid} sub={p.sub} q={q} />, ['Séance', 'Meeting']],
  ['/seance/projection/:sid', (p) => <Projection sid={p.sid} />],
  ['/seance/admin', () => <SeanceAdminGate />, ['Administration · vote en séance', 'Administration · meeting voting']],
  ['/seance/admin/:page', (p) => <SeanceAdminGate page={p.page} />, ['Administration · vote en séance', 'Administration · meeting voting']],
];

function NotFound() {
  return (
    <PublicShell>
      <div class="container-s section center">
        <h1>{L('Page introuvable', 'Page not found')}</h1>
        <p class="muted">{L('Ce lien ne correspond à aucun écran.', 'This link does not match any screen.')}</p>
        <Btn kind="primary" href="/">{L('Accueil de la démo', 'Demo home')}</Btn>
      </div>
    </PublicShell>
  );
}

export function App() {
  const st = useStore();
  const route = useRoute();
  const s = st.settings;
  useEffect(() => {
    const c = document.documentElement.classList;
    c.toggle('hc', !!s.contrast);
    c.toggle('dys', !!s.dys);
    c.toggle('no-refs', !s.refs);
    ['fs-1', 'fs-2', 'fs-3'].forEach((k) => c.remove(k));
    if (s.font) c.add('fs-' + s.font);
    document.documentElement.lang = s.lang === 'en' ? 'en' : 'fr';
  }, [s.contrast, s.dys, s.refs, s.font, s.lang]);
  let view = null, title = null;
  for (const [pat, render, ttl] of ROUTES) {
    const p = match(pat, route.path);
    if (p) { view = render(p, route.q); title = ttl; break; }
  }
  useEffect(() => { if (title) document.title = (Array.isArray(title) ? L(title[0], title[1]) : title) + L(' · Démonstration vote électronique', ' · E-voting demo'); }, [route.path, s.lang]);
  const projection = route.path.startsWith('/seance/projection/');
  return (
    <>
      <a class="skip-link" href="#main" onClick={(e) => { e.preventDefault(); const m = document.getElementById('main'); if (m) { m.setAttribute('tabindex', '-1'); m.focus(); } }}>{L('Aller au contenu', 'Skip to content')}</a>
      {!projection && <DemoBar />}
      {view || <NotFound />}
      <Toasts />
      <PoweredBy />
    </>
  );
}
