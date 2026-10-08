import os, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
import sys, json, time
from playwright.sync_api import sync_playwright
OUT = os.environ.get('SHOTS_DIR', str(ROOT / 'tests' / 'shots')) + '/'
os.makedirs(OUT, exist_ok=True)
URL = os.environ.get('DEMO_URL', (ROOT / 'dist' / 'index.html').as_uri())
routes = sys.argv[1].split(',') if len(sys.argv) > 1 else []
width = int(sys.argv[2]) if len(sys.argv) > 2 else 1366
errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': width, 'height': 900}, device_scale_factor=1)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(('pageerror', pg.url, str(e))))
    pg.on('console', lambda m: errors.append(('console', pg.url, m.text)) if m.type == 'error' else None)
    pg.goto(URL)
    pg.wait_for_timeout(400)
    for r in routes:
        name = r.strip('/').replace('/', '_') or 'home'
        pg.evaluate("h => { location.hash = h }", r)
        pg.wait_for_timeout(700)
        # auto login on back-office login screens
        btn = pg.locator('text=Se connecter (démo)')
        if btn.count() > 0:
            btn.first.click()
            pg.wait_for_timeout(1900)
        pg.screenshot(path=OUT + f'{name}_{width}.png', full_page=True)
        h = pg.evaluate("() => document.documentElement.scrollWidth > window.innerWidth + 2")
        if h: errors.append(('overflow-x', r, str(pg.evaluate("() => document.documentElement.scrollWidth"))))
    b.close()
print(json.dumps(errors, ensure_ascii=False, indent=1)[:6000])
