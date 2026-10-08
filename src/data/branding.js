// Personnalisation aux couleurs du bénéficiaire (CCTP 2.8) : palettes validées (contraste AA sur blanc).
export const BRAND_PRESETS = {
  defaut: { label: 'Couleurs par défaut', c600: null },
  bleu: { label: 'Bleu institutionnel', c50: '#EAF2FB', c100: '#D3E4F6', c500: '#2F6DB5', c600: '#0B5394', c700: '#094479', c800: '#06335C', c900: '#05284A' },
  sarcelle: { label: 'Sarcelle', c50: '#E6F4F2', c100: '#C8E8E3', c500: '#1F8F82', c600: '#00796B', c700: '#00695C', c800: '#004D40', c900: '#003D33' },
  bordeaux: { label: 'Bordeaux', c50: '#F8EAEF', c100: '#F0D3DD', c500: '#B23A5F', c600: '#8E1B3F', c700: '#7A1636', c800: '#5E102A', c900: '#4A0C21' },
  vert: { label: 'Vert forêt', c50: '#ECF4EA', c100: '#D6E8D2', c500: '#4C8A3B', c600: '#2E6B1F', c700: '#265A1A', c800: '#1C4413', c900: '#16350F' },
};
export function brandStyle(b) {
  const p = b && BRAND_PRESETS[b.preset];
  if (!p || !p.c600) return null;
  // L'accent suit la palette ; les textes restent neutres
  return { '--accent': p.c600, '--accent-hover': p.c700, '--accent-soft': p.c50, '--indigo-50': p.c50, '--indigo-100': p.c100, '--indigo-200': p.c100, '--indigo-300': p.c500, '--indigo-500': p.c500, '--indigo-600': p.c600, '--indigo-700': p.c600, '--pt-brand': p.c800 };
}
