// Langue courante de l'interface (sans dépendance, pour éviter les imports circulaires).
// Le store la met à jour à chaque changement d'état ; L(fr, en) choisit le libellé.
let current = 'fr';
export const setCurLang = (l) => { current = l === 'en' ? 'en' : 'fr'; };
export const curLang = () => current;
export const L = (fr, en) => (current === 'en' ? en : fr);
