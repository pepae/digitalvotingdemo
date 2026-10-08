import os, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
import json
from playwright.sync_api import sync_playwright
OUT = os.environ.get('SHOTS_DIR', str(ROOT / 'tests' / 'shots')) + '/'
os.makedirs(OUT, exist_ok=True)
URL = os.environ.get('DEMO_URL', (ROOT / 'dist' / 'index.html').as_uri())
errors = []
def shot(pg, n, full=True): pg.screenshot(path=OUT + 'r2_' + n + '.png', full_page=full)
def login(pg):
    b = pg.locator('text=Se connecter (démo)')
    if b.count(): b.first.click(); pg.wait_for_timeout(1900)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1366, 'height': 900})
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(('pageerror', str(e))))
    pg.on('console', lambda m: errors.append(('console', m.text)) if m.type == 'error' else None)
    # Branding
    pg.goto(URL + '#/distance/admin/personnalisation'); pg.wait_for_timeout(500); login(pg)
    pg.click('label.choice:has-text("Bordeaux")'); pg.click('button:has-text("Monogramme")')
    pg.fill('#br-t', 'Élections professionnelles 2026 : votez en ligne'); pg.wait_for_timeout(200)
    shot(pg, '01_brand')
    pg.click('role=button[name="Publier"]'); pg.wait_for_timeout(400)
    # Maintenance
    pg.evaluate("location.hash='/distance/admin/supervision'"); pg.wait_for_timeout(600)
    pg.click('text=Publier l’annonce'); pg.wait_for_timeout(400)
    # Gestion du dépouillement
    pg.evaluate("location.hash='/distance/admin/depouillement'"); pg.wait_for_timeout(600)
    pg.click('text=Convoquer les détenteurs de clés >> nth=0'); pg.wait_for_timeout(400); shot(pg, '02_depouillement')
    # Voter portal check
    v = ctx.new_page(); v.on('pageerror', lambda e: errors.append(('voter pageerror', str(e))))
    v.goto(URL + '#/distance/electeur'); v.wait_for_timeout(700)
    print('banner:', v.locator('.maint-banner').count(), '| btn color:', v.evaluate("getComputedStyle(document.querySelector('.btn-primary')).backgroundColor"), '| title:', v.inner_text('.vt-band h1'))
    shot(v, '03_voter_brand', False)
    # Per-urn suspension from bureau
    pg.evaluate("location.hash='/distance/bureau/tableau'"); pg.wait_for_timeout(600); login(pg)
    pg.click('.urn-row:has-text("F3SCT · Catégorie A") >> role=button[name*="Suspendre"]'); pg.wait_for_timeout(400)
    pg.locator('.modal .choice').first.click(); pg.click('text=Signer en tant que second membre'); pg.wait_for_timeout(2300)
    shot(pg, '04_bureau_urn_suspended')
    # voter login Camille and list
    v.bring_to_front()
    v.goto(URL + '#/distance/electeur'); v.wait_for_timeout(500)
    for i in range(3):
        v.click('text=Remplir (démo)'); v.click('button[type=submit]'); v.wait_for_timeout(700)
    v.wait_for_timeout(800)
    shot(v, '05_voter_scrutins')
    print('voter page:', v.url.split('#')[1], '|', v.inner_text('main')[:500].replace('\n', ' | '))
    # Expert
    e = ctx.new_page(); e.on('pageerror', lambda x: errors.append(('expert pageerror', str(x))))
    e.goto(URL + '#/distance/expert'); e.wait_for_timeout(500); login(e)
    e.click('text=Vérifier les scellés et le journal'); e.wait_for_timeout(500); shot(e, '06_expert')
    # Results deep link
    pg.bring_to_front(); pg.evaluate("location.hash='/distance/bureau/resultats?op=test26'"); pg.wait_for_timeout(900)
    print('results h1:', pg.inner_text('main h1'), '| op select:', pg.evaluate("document.querySelector('#op-sel').value"))
    shot(pg, '07_results_test')
    pg.evaluate("location.hash='/distance/bureau/donnees'"); pg.wait_for_timeout(600); shot(pg, '08_donnees')
    # CNIL ref link
    pg.evaluate("location.hash='/a-propos?cnil=2-05'"); pg.wait_for_timeout(700)
    print('cnil hl:', pg.locator('.cnil-list li.hl').count())
    b.close()
print(json.dumps(errors, ensure_ascii=False, indent=1)[:3000])
