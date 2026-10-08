import os, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
from playwright.sync_api import sync_playwright
OUT = os.environ.get('SHOTS_DIR', str(ROOT / 'tests' / 'shots')) + '/'
os.makedirs(OUT, exist_ok=True)
URL = os.environ.get('DEMO_URL', (ROOT / 'dist' / 'index.html').as_uri())
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1280,'height':900})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL+'#/distance/electeur'); pg.wait_for_timeout(600)
    pg.get_by_role('button', name='Accessibilité').first.click(); pg.wait_for_timeout(300)
    pg.get_by_text('Contraste renforcé', exact=True).first.click(); pg.wait_for_timeout(150)
    pg.get_by_text('Facile à lire (FALC)').first.click(); pg.wait_for_timeout(150)
    pg.get_by_role('button', name='A++', exact=True).first.click(); pg.wait_for_timeout(150)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    print('class:', pg.evaluate("document.documentElement.className"))
    pg.screenshot(path=OUT+'a11y_voter.png')
    # contrast checks of a few computed colors
    print(pg.evaluate("""() => { const q = (s) => { const e = document.querySelector(s); if (!e) return null; const c = getComputedStyle(e); return [s, c.color, c.backgroundColor]; }; return [q('.vt-band h1'), q('.btn-primary'), q('.chip'), q('.muted')]; }"""))
    b.close()
print('errors', errs)
