# Démonstration vote électronique (à distance et en séance)

Maquette cliquable, données fictives. Interface en français et en anglais (bascule FR / EN dans le bandeau).

Live: https://pepae.github.io/digitalvotingdemo/

## Build

```bash
npm install
npm run build          # writes dist/index.html (single self-contained file)
cp dist/index.html .   # GitHub Pages serves index.html from the repo root
```

`OUT=path/index.html node build.mjs` builds somewhere else.

## Tests

Python 3 + Playwright (`pip install playwright && playwright install chromium`), after a build:

```bash
python tests/smoke.py "#/,#/distance/electeur" 1366
python tests/routes_check.py
python tests/flow_voter.py
```

Each script prints a JSON list of errors; `[]` means OK.

## Conventions

- UI strings: `L('français', 'English')` from `src/lib/i18n.js`. Text stored in state (hash-chained journal, alerts) stays French and is shown through `tx()`.
- No em dashes.
