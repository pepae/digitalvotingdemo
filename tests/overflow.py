import os, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
import sys, json
from playwright.sync_api import sync_playwright
URL = os.environ.get('DEMO_URL', (ROOT / 'dist' / 'index.html').as_uri())
routes = sys.argv[1].split(',')
width = int(sys.argv[2]) if len(sys.argv) > 2 else 390
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': width, 'height': 900})
    pg.goto(URL); pg.wait_for_timeout(300)
    for r in routes:
        pg.evaluate("h => { location.hash = h }", r); pg.wait_for_timeout(600)
        btn = pg.locator('text=Se connecter (démo)')
        if btn.count() > 0: btn.first.click(); pg.wait_for_timeout(1900)
        res = pg.evaluate("""(w) => { const out=[]; document.querySelectorAll('body *').forEach(el => { const r = el.getBoundingClientRect(); if (r.right > w + 1 && r.width > 0) { const cs = getComputedStyle(el); out.push([el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : ''), Math.round(r.left), Math.round(r.right), (el.textContent||'').trim().slice(0,50)]); } }); return out.slice(0, 25); }""", width)
        print(r, json.dumps(res, ensure_ascii=False, indent=0)[:3000])
    b.close()
