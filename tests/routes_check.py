import os, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
import re, json
from playwright.sync_api import sync_playwright
URL = os.environ.get('DEMO_URL', (ROOT / 'dist' / 'index.html').as_uri())
src=open(ROOT / 'src' / 'data' / 'cctp.js',encoding='utf-8').read()
routes=sorted(set(re.findall(r"to: '([^']*)'", src)))
extra=['/distance/admin/overview','/distance/admin/roles','/distance/admin/tests','/seance/admin/instances','/seance/admin/annuaire','/seance/admin/organisateurs','/seance/admin/securite','/seance/admin/journal','/seance/admin/support','/seance/organisateur/s/cme/presence','/seance/organisateur/s/gip','/seance/organisateur/s/dir/pv','/distance/bureau/incidents']
errs=[]; bad=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1366,'height':900})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto(URL); pg.wait_for_timeout(300)
    for r in routes+extra:
        pg.evaluate("h => { location.hash = h }", '#'+r); pg.wait_for_timeout(500)
        btn = pg.locator('text=Se connecter (démo)')
        if btn.count() > 0: btn.first.click(); pg.wait_for_timeout(1900)
        h1 = pg.evaluate("() => { const h = document.querySelector('main h1, h1'); return h ? h.textContent.trim() : '(no h1)'; }")
        body = pg.inner_text('body')
        flag = ('Page introuvable' in body) or ('introuvable' in h1.lower())
        print(('BAD ' if flag else 'ok  ') + r + '  ->  ' + h1[:70])
        if flag: bad.append(r)
    b.close()
print('bad', bad); print('errors', errs[:10])
