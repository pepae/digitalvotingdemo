import os, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
import json
from playwright.sync_api import sync_playwright
OUT = os.environ.get('SHOTS_DIR', str(ROOT / 'tests' / 'shots')) + '/'
os.makedirs(OUT, exist_ok=True)
URL = os.environ.get('DEMO_URL', (ROOT / 'dist' / 'index.html').as_uri())
errs=[]
def login(pg):
    btn = pg.locator('text=Se connecter (démo)')
    if btn.count() > 0: btn.first.click(); pg.wait_for_timeout(1900)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1366,'height':900})
    pg.on('pageerror', lambda e: errs.append(('pageerror', str(e))))
    pg.on('console', lambda m: errs.append(('console', m.text)) if m.type=='error' else None)
    pg.goto(URL); pg.wait_for_timeout(300)
    # --- Admin wizard (vote à distance)
    pg.evaluate("location.hash='#/distance/admin/scrutins'"); pg.wait_for_timeout(600); login(pg)
    pg.get_by_role('link', name='Créer un scrutin').first.click() if pg.get_by_role('link', name='Créer un scrutin').count() else pg.get_by_role('button', name='Créer un scrutin').first.click()
    pg.wait_for_timeout(500)
    for i in range(6):
        pg.get_by_role('button', name='Suivant').click(); pg.wait_for_timeout(250)
    pg.screenshot(path=OUT+'w_admin_recap.png', full_page=True)
    pg.get_by_role('button', name='Créer le scrutin').click(); pg.wait_for_timeout(500)
    pg.locator('.modal .choice').first.click(); pg.wait_for_timeout(200)
    pg.get_by_role('button', name='Signer en tant que second membre').click(); pg.wait_for_timeout(2200)
    print('admin url after create', pg.url.split('#')[1])
    pg.screenshot(path=OUT+'w_admin_after.png', full_page=True)
    txt = pg.inner_text('main')
    print('draft listed:', 'Brouillon' in txt or 'brouillon' in txt)
    # --- New séance wizard
    pg.evaluate("location.hash='#/seance/organisateur/nouvelle'"); pg.wait_for_timeout(600); login(pg)
    for i in range(3):
        pg.get_by_role('button', name='Suivant').click(); pg.wait_for_timeout(250)
    pg.screenshot(path=OUT+'w_seance_params.png', full_page=True)
    pg.get_by_role('button', name='Créer la séance').click(); pg.wait_for_timeout(900)
    print('seance url after create', pg.url.split('#')[1])
    pg.screenshot(path=OUT+'w_seance_after.png', full_page=True)
    # --- High contrast + FALC + large text on voter page
    pg.evaluate("location.hash='#/distance/electeur'"); pg.wait_for_timeout(600)
    pg.get_by_role('button', name='Accessibilité').first.click(); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT+'w_a11y_panel.png')
    for lbl in ['Contraste renforcé', 'Facile à lire']:
        loc = pg.get_by_text(lbl, exact=True)
        print(lbl, loc.count())
        if loc.count(): loc.first.click(); pg.wait_for_timeout(200)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT+'w_hc_falc.png', full_page=True)
    print('html class', pg.evaluate("document.documentElement.className"))
    b.close()
print(json.dumps(errs, ensure_ascii=False)[:3000])
