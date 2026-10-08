import os, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
import json
from playwright.sync_api import sync_playwright
OUT = os.environ.get('SHOTS_DIR', str(ROOT / 'tests' / 'shots')) + '/'
os.makedirs(OUT, exist_ok=True)
URL = os.environ.get('DEMO_URL', (ROOT / 'dist' / 'index.html').as_uri())
errors = []
def shot(pg, n): pg.screenshot(path=OUT + 'fv_' + n + '.png', full_page=True)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1280, 'height': 860})
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(('pageerror', str(e))))
    pg.on('console', lambda m: errors.append(('console', m.text)) if m.type == 'error' else None)
    pg.goto(URL + '#/distance/electeur'); pg.wait_for_timeout(500)
    # brute force: 5 wrong passwords
    pg.fill('#v-id', 'EP26-4821-7730'); 
    for i in range(5):
        pg.fill('#v-pw', 'wrong' + str(i)); pg.click('button[type=submit]'); pg.wait_for_timeout(250)
    shot(pg, '01_locked')
    pg.click('text=Simuler le déblocage par l’assistance'); pg.wait_for_timeout(300)
    pg.click('text=Remplir (démo)'); pg.click('button[type=submit]'); pg.wait_for_timeout(300)
    shot(pg, '02_step2')
    pg.click('text=Remplir (démo)'); pg.click('button[type=submit]'); pg.wait_for_timeout(300)
    shot(pg, '03_step3')
    pg.click('text=Remplir (démo)'); pg.click('button[type=submit]'); pg.wait_for_timeout(600)
    shot(pg, '04_scrutins')
    pg.click('a:has-text("Voter") >> nth=0'); pg.wait_for_timeout(500)
    shot(pg, '05_info')
    pg.click('text=Profession de foi >> nth=0'); pg.wait_for_timeout(300); shot(pg, '05b_prof'); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.click('text=Accéder au bulletin de vote'); pg.wait_for_timeout(300)
    pg.click('.choice >> nth=1'); pg.wait_for_timeout(150)
    shot(pg, '06_choose')
    pg.click('text=Valider mon choix'); pg.wait_for_timeout(300)
    shot(pg, '07_confirm')
    pg.click('text=Confirmer et voter'); pg.wait_for_timeout(300)
    shot(pg, '08_modal')
    pg.click('text=Oui, je vote'); pg.wait_for_timeout(1200)
    shot(pg, '09_proc')
    pg.wait_for_timeout(2800)
    shot(pg, '10_receipt')
    code = pg.inner_text('.code-big')
    # second scrutin
    pg.click('a:has-text("Continuer")'); pg.wait_for_timeout(400)
    pg.click('text=Accéder au bulletin de vote'); pg.wait_for_timeout(200)
    pg.click('.choice-blank'); pg.click('text=Valider mon choix'); pg.wait_for_timeout(200)
    pg.click('text=Confirmer et voter'); pg.wait_for_timeout(200); pg.click('text=Oui, je vote'); pg.wait_for_timeout(4200)
    shot(pg, '11_receipt2')
    # not eligible
    pg.evaluate("location.hash='/distance/electeur/scrutin/cse-b'"); pg.wait_for_timeout(400); shot(pg, '12_noteligible')
    # verify
    pg.evaluate("c => { location.hash='/distance/verifier?code=' + encodeURIComponent(c) }", code); pg.wait_for_timeout(600); shot(pg, '13_verify')
    # EN + FALC
    pg.evaluate("location.hash='/distance/electeur/scrutins'"); pg.wait_for_timeout(300)
    pg.click('button[aria-label="English"]'); pg.wait_for_timeout(300); shot(pg, '14_en')
    pg.click('button[aria-label="Français"]'); pg.wait_for_timeout(200)
    pg.click('text=Se déconnecter'); pg.wait_for_timeout(300)
    # julien CME
    pg.click('text=Dr Julien Lefèvre · CME 2026 · niveau 2'); pg.wait_for_timeout(200)
    pg.click('text=Remplir (démo)'); pg.click('button[type=submit]'); pg.wait_for_timeout(250)
    pg.click('text=Remplir (démo)'); pg.click('button[type=submit]'); pg.wait_for_timeout(250)
    shot(pg, '15_sms')
    pg.click('text=Remplir (démo)'); pg.click('button[type=submit]'); pg.wait_for_timeout(500)
    pg.click('a:has-text("Voter") >> nth=0'); pg.wait_for_timeout(300)
    pg.click('text=Accéder au bulletin de vote'); pg.wait_for_timeout(200)
    for i in range(3): pg.click('.choice.is-multi >> nth=%d' % i); pg.wait_for_timeout(80)
    shot(pg, '16_pluri')
    print('code', code)
    b.close()
print(json.dumps(errors, ensure_ascii=False, indent=1)[:4000])
