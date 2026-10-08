import os, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
from playwright.sync_api import sync_playwright
URL = os.environ.get('DEMO_URL', (ROOT / 'dist' / 'index.html').as_uri())
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1366,'height':900})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(500)
    pg.click('text=Choisir un profil >> nth=0'); pg.wait_for_timeout(900)
    print('after click:', pg.evaluate('location.hash'), '| notfound:', pg.locator('text=Page introuvable').count(), '| scrollY:', pg.evaluate('scrollY'))
    pg.goto(URL + '#acces'); pg.wait_for_timeout(900)
    print('direct #acces:', pg.evaluate('location.hash'), '| notfound:', pg.locator('text=Page introuvable').count(), '| scrollY:', pg.evaluate('scrollY'))
    pg.click('a.profile-card >> nth=0'); pg.wait_for_timeout(600)
    print('profile:', pg.evaluate('location.hash'))
    pg.go_back(); pg.wait_for_timeout(600); print('back:', pg.evaluate('location.hash'), pg.locator('text=Page introuvable').count())
    pg.keyboard.press('Tab'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    print('skip link:', pg.evaluate('location.hash'), pg.locator('text=Page introuvable').count())
    b.close()
print(errs)
