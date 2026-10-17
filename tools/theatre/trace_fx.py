# Which effect sheets each fighter's moves use, so a battle loads only those first (the rest follow in the background).
# Plays every strike, skill and Ultimate of every fighter (and a monster's counter) in a headless browser with an
# instrumented copy of public/theatre/engine.js, records every effect drawn, and writes manifest.json's "NEED" table.
#   node server.js (on PORT, default 3100) then: python3 tools/theatre/trace_fx.py [port]
import asyncio, json, os, sys, re
from playwright.async_api import async_playwright
T = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'theatre')
PORT = sys.argv[1] if len(sys.argv) > 1 else '3100'
src = open(os.path.join(T, 'engine.js')).read()
def patch(a, b):
    global src; assert src.count(a) == 1, a; src = src.replace(a, b)
patch("function fire(kind, x, y, o = {}) {", "function fire(kind, x, y, o = {}) { window.__rec(kind, o.el);")
patch("const F = AS.FX[s.kind || 'sigil'], im = img.fx[s.kind || 'sigil']", "const F = AS.FX[s.kind || 'sigil'], im = (window.__rec(s.kind || 'sigil'), img.fx[s.kind || 'sigil'])")
patch("_sim(ms) { SIM = true; step(ms); },", "_sim(ms) { SIM = true; step(ms); try { draw(); } catch (e) {} },")
PAGE = "<!doctype html><body><script>window.__used=new Set();window.__rec=(k,el)=>{window.__used.add(el?k+'|'+el:k)}</script><script src='/theatre/engine.js'></script></body>"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page()
        await pg.route('**/__trace.html', lambda r: r.fulfill(body=PAGE, content_type='text/html'))
        await pg.route('**/theatre/engine.js', lambda r: r.fulfill(body=src, content_type='application/javascript'))
        await pg.goto(f'http://localhost:{PORT}/__trace.html')
        need = await pg.evaluate("""async () => {
          const TH = window.Theatre; await TH.init({ base: '/', stages: ['assets/stages/library-1.webp'] });
          TH.registerMonster('golem', { idle: 'total-war/monsters/anim/golem_idle.webp', atk: 'total-war/monsters/anim/golem_atk.webp' });
          const ids = ['J','K','E','EA','S','R','N','T','H','M','X'];
          await TH.prepare([...ids, 'golem'], 0);
          const run = async (fn) => { window.__used = new Set(); const p = fn(); for (let t = 0; t < 400 && TH.playing; t++) TH._sim(50); TH.skip(); await p; return [...window.__used]; };
          const out = {};
          for (const a of ids) {
            const used = new Set(), n = TH.skillCount(a);
            const moves = [['strike', 0], ...Array.from({ length: Math.max(0, n - 1) }, (_, i) => ['skill', i]), ['ult', 0]];
            for (const [kind, index] of moves) for (const [ally, target] of [['E', 'K'], [null, 'golem'], ['K', 'J']]) {
              if (target === a || ally === a) continue;
              const angel = { actor: a === 'EA' }; const actor = a === 'EA' ? 'E' : a;
              (await run(() => TH.play({ actor, ally, target, angel, kind, index, stage: 0, level: 1, dmg: 300, heals: [100, 100], ko: false }))).forEach((k) => used.add(k));
              (await run(() => TH.play({ actor, ally, target, angel, kind, index, stage: 0, level: 1, dmg: 300, crit: true, ko: true }))).forEach((k) => used.add(k));
            }
            out[a] = [...used].sort();
          }
          out._counter = (await run(() => TH.counter({ actor: 'J', ally: 'E', target: 'golem', stage: 0, level: 1, dmg: 120, blocked: 30 })))
            .concat(await run(() => TH.counter({ actor: 'J', target: 'golem', stunned: true }))).sort();
          return out;
        }""")
        await b.close()
    man_p = os.path.join(T, 'manifest.json'); man = json.load(open(man_p))
    man['NEED'] = need
    json.dump(man, open(man_p, 'w'), separators=(',', ':'))
    allk = set(man['FX']); used = set(k.split('|')[0] for v in need.values() for k in v)
    print({k: len(v) for k, v in need.items()}, 'kinds used', len(used), 'of', len(allk), 'never used:', sorted(allk - used))
asyncio.run(main())
