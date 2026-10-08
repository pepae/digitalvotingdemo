import os, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
import json
from playwright.sync_api import sync_playwright
OUT = os.environ.get('SHOTS_DIR', str(ROOT / 'tests' / 'shots')) + '/'
os.makedirs(OUT, exist_ok=True)
URL = os.environ.get('DEMO_URL', (ROOT / 'dist' / 'index.html').as_uri())
errors = []
def shot(pg, n, full=True): pg.screenshot(path=OUT + 'f2_' + n + '.png', full_page=full)
def select_item(org, text):
    org.click('.ag-item:has-text("' + text + '")'); org.wait_for_timeout(300)
def close_vote(org, wait=3000):
    org.wait_for_timeout(wait); org.click('text=Clôturer et proclamer'); org.wait_for_timeout(800)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1440, 'height': 900})
    org = ctx.new_page()
    org.on('pageerror', lambda e: errors.append(('org pageerror', str(e))))
    org.on('console', lambda m: errors.append(('org console', m.text)) if m.type == 'error' else None)
    org.goto(URL + '#/seance/organisateur/s/cme/console'); org.wait_for_timeout(500)
    org.click('text=Se connecter (démo)'); org.wait_for_timeout(1900)
    part = ctx.new_page()
    part.set_viewport_size({'width': 420, 'height': 900})
    part.on('pageerror', lambda e: errors.append(('part pageerror', str(e))))
    part.on('console', lambda m: errors.append(('part console', m.text)) if m.type == 'error' else None)
    part.goto(URL + '#/seance/participant'); part.wait_for_timeout(500)
    part.click('role=tab[name="Code PIN"]'); part.wait_for_timeout(200)
    part.click('text=Remplir (démo)'); part.click('button[type=submit]'); part.wait_for_timeout(1200)
    # Help modal
    part.click('.pt-tool:has-text("Aide")'); part.wait_for_timeout(300); part.click('role=tab[name="Tutoriel vidéo"]'); part.wait_for_timeout(200); shot(part, '00_help', False)
    part.keyboard.press('Escape'); part.wait_for_timeout(200)
    # p3 election, 3-round rules
    org.bring_to_front(); select_item(org, 'Élection du vice-président')
    org.click('text=Ouvrir le vote'); org.wait_for_timeout(800)
    part.bring_to_front(); part.wait_for_timeout(400)
    part.click('.bc-btn >> nth=0'); part.click('text=Valider'); part.wait_for_timeout(300); part.click('.modal >> text=Confirmer'); part.wait_for_timeout(900)
    part.click('.bc-btn >> nth=1'); part.click('text=Valider'); part.wait_for_timeout(300); part.click('.modal >> text=Confirmer'); part.wait_for_timeout(500)
    org.bring_to_front(); close_vote(org, 21000)
    shot(org, '01_round1')
    print('round1 banner:', org.inner_text('.result-banner')[:160].replace('\n', ' | '))
    org.click('text=Organiser le deuxième tour'); org.wait_for_timeout(400); shot(org, '02_r2modal', False)
    org.click('text=Ouvrir le deuxième tour'); org.wait_for_timeout(800)
    part.bring_to_front(); part.wait_for_timeout(500); shot(part, '03_part_round2')
    print('participant header:', part.inner_text('.vc-head')[:80].replace('\n', ' | '))
    org.bring_to_front(); close_vote(org, 21000)
    print('round2 banner:', org.inner_text('.result-banner')[:200].replace('\n', ' | '))
    shot(org, '04_round2')
    # p4-2 per-vote quorum
    select_item(org, 'Avis de la CME sur le projet médical partagé')
    print('quorum line:', org.inner_text('.quorum-line')[:200].replace('\n', ' '))
    # p9 group vote
    select_item(org, 'Avis sur trois conventions')
    org.click('text=Ouvrir le vote'); org.wait_for_timeout(800)
    part.bring_to_front(); part.wait_for_timeout(500); shot(part, '05_part_multi')
    for bal in range(2):
        for qi in range(3):
            part.click('.mq-q >> nth=%d >> .bc-btn >> nth=%d' % (qi, (qi + bal) % 3)); part.wait_for_timeout(100)
        part.click('text=Valider'); part.wait_for_timeout(300); shot(part, '06_multi_confirm_%d' % bal, False)
        part.click('.modal >> text=Confirmer'); part.wait_for_timeout(900)
    shot(part, '07_part_multi_done')
    org.bring_to_front(); close_vote(org, 22000)
    shot(org, '08_org_multi')
    print('multi banner:', org.inner_text('.result-banner')[:120].replace('\n', ' | '))
    # p10 list vote
    select_item(org, 'Élection de la sous-commission qualité')
    org.click('text=Ouvrir le vote'); org.wait_for_timeout(800)
    part.bring_to_front(); part.wait_for_timeout(500); shot(part, '09_part_list')
    part.click('.bc-btn >> nth=1'); part.click('text=Valider'); part.wait_for_timeout(300); part.click('.modal >> text=Confirmer'); part.wait_for_timeout(900)
    part.click('.bc-btn >> nth=0'); part.click('text=Valider'); part.wait_for_timeout(300); part.click('.modal >> text=Confirmer'); part.wait_for_timeout(500)
    org.bring_to_front(); close_vote(org, 22000)
    shot(org, '10_org_list')
    print('list banner:', org.inner_text('.result-banner')[:200].replace('\n', ' | '))
    # projection of list result
    proj = ctx.new_page(); proj.set_viewport_size({'width': 1600, 'height': 900})
    proj.on('pageerror', lambda e: errors.append(('proj pageerror', str(e))))
    proj.goto(URL + '#/seance/projection/cme'); proj.wait_for_timeout(800); shot(proj, '11_proj_list', False)
    # PV page
    org.bring_to_front(); org.evaluate("location.hash='/seance/organisateur/s/cme/pv'"); org.wait_for_timeout(700)
    shot(org, '12_pv')
    # guest persona in fresh context
    ctx2 = b.new_context(viewport={'width': 420, 'height': 900})
    g = ctx2.new_page(); g.on('pageerror', lambda e: errors.append(('guest pageerror', str(e))))
    g.goto(URL + '#/seance/participant'); g.wait_for_timeout(500)
    g.click('text=entrer comme Dr Rémi Lacroix'); g.wait_for_timeout(1200)
    # open a vote via organizer in ctx2? Autopilot hidden for guest: open vote from org in ctx2
    o2 = ctx2.new_page(); o2.goto(URL + '#/seance/organisateur/s/cme/console'); o2.wait_for_timeout(500)
    o2.click('text=Se connecter (démo)'); o2.wait_for_timeout(1900)
    o2.click('.ag-item:has-text("Approbation du procès-verbal")'); o2.wait_for_timeout(300); o2.click('text=Ouvrir le vote'); o2.wait_for_timeout(800)
    g.bring_to_front(); g.wait_for_timeout(600); shot(g, '13_guest')
    print('guest panel:', g.inner_text('.vote-card')[:220].replace('\n', ' | '))
    # new séance test + additem
    org.evaluate("location.hash='/seance/organisateur/seances'"); org.wait_for_timeout(500)
    org.click('text=Nouvelle séance de test'); org.wait_for_timeout(800); shot(org, '14_test_seance')
    org.click('text=Ajouter un point'); org.wait_for_timeout(300)
    org.select_option('#ai-ty', 'liste'); org.wait_for_timeout(200); shot(org, '15_additem', False)
    org.click(".modal >> role=button[name=\"Ajouter\"]"); org.wait_for_timeout(400)
    print('agenda items:', org.locator('.tag-num').count())
    b.close()
print(json.dumps(errors, ensure_ascii=False, indent=1)[:4000])
