# Turns the Skill Lab engine (skill_lab.html, the lab page's source) into the game's battle theatre: public/theatre/engine.js
# Run: python3 tools/theatre/build_theatre.py
# Same skills, sprites and effects; no lab UI; assets loaded per battle from public/theatre/manifest.json.
import os, re
S = os.path.dirname(os.path.abspath(__file__)); os.chdir(S)
OUT = os.path.join(S, '..', '..', 'public', 'theatre', 'engine.js')
t = open('skill_lab.html').read()
js = t[t.index('<script>\nconst AS = window.__AS;') + len('<script>\n'):t.rindex('</script>')]

def rep(a, b, n=1):
    global js
    assert js.count(a) == n, (a[:90], js.count(a)); js = js.replace(a, b)

HEAD = open('theatre_head.js').read()
API = open('theatre_api.js').read()

rep("const AS = window.__AS;\nconst BGM_SRC = window.__BGM;\nconst cv = document.getElementById('cv'), ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;\n", HEAD)
# music: the game owns the battle track; the theatre only ducks it under the big moments
rep("const BGM_VOL = .38;", "let BGM_VOL = .38;")
rep("const bgm = new Audio(BGM_SRC); bgm.loop = true; bgm.volume = BGM_VOL; bgm.playsInline = true; bgm.preload = 'auto';",
    "let bgm = { volume: 0, paused: true, play() { return Promise.resolve(); }, pause() {} };")
rep("function startMusic() { if (musicOn && bgm.paused) bgm.play().catch(() => {}); }", "function startMusic() {}")
rep("function musicStep(dt) {", "function musicStep(dt) { if (!PLAY && duckLv === 1) return;")
# sound clips come from files instead of inline data
rep("const SND = window.__SFX;", "const SND = { src: {}, loud: {} };")
rep("""  for (const [k, uri] of Object.entries(SND.src)) { const bin = atob(uri.split(',')[1]), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    A.decodeAudioData(u8.buffer, b => BUF[k] = b, () => {}); } }""",
    """  for (const [k, url] of Object.entries(SND.src)) fetch(BASE + url).then(r => r.arrayBuffer()).then(ab => A.decodeAudioData(ab, b => BUF[k] = b, () => {})).catch(() => {}); }""")
# the end of every skill hands control back to the game
rep("function done() { sitDown(hero, () => { busy = false; idleT = 0; setButtons(); }); }",
    "function done() { speed = 1.6; sitDown(hero, () => { speed = 1; busy = false; idleT = 0; finishPlay(); }); }")
rep("  document.querySelectorAll('.skill').forEach((b, k) => b.classList.toggle('on', k === i));\n", "")
rep("for (const k of Object.keys(NEWC)) if (!AS[k]) delete SKILLS[k];", "")
rep("let speed = 1, loopOn = true,", "let speed = 1, loopOn = false,")
# real numbers: the lab's sample number is replaced by the battle's result (see num() in the API)
rep("function num(v, x, y, big, delay = 0, kind) {", "function num0(v, x, y, big, delay = 0, kind) {")
rep("""  if (n.kind === 'heal') { g.addColorStop(0, '#f2fff8'); g.addColorStop(.6, '#a8f0cf'); g.addColorStop(1, '#2fb383'); }""",
    """  if (n.kind === 'heal') { g.addColorStop(0, '#f2fff8'); g.addColorStop(.6, '#a8f0cf'); g.addColorStop(1, '#2fb383'); }
  else if (n.kind === 'weak' || n.kind === 'crit') { g.addColorStop(0, '#fffbe0'); g.addColorStop(.6, '#ffe45c'); g.addColorStop(1, '#f2a516'); }
  else if (n.kind === 'miss' || n.kind === 'resist') { g.addColorStop(0, '#ffffff'); g.addColorStop(.6, '#cfd8e6'); g.addColorStop(1, '#7d8aa0'); }""")
# an absent or knocked-out partner is not drawn; a knocked-out target sinks away at the end
rep("[ally.x, 28], [tgt.x + enemy.kb, 32]", "[ally.hidden ? -999 : ally.x, 28], [tgt.hidden ? -999 : tgt.x + enemy.kb, 32]")
rep("  drawActor(ally);\n  drawActor(tgt);\n", "  if (!ally.hidden) drawActor(ally);\n  if (!tgt.hidden) drawActor(tgt);\n")
# the live scene and the snapshot buffer must never be served from the filter cache
rep("const scene = document.createElement('canvas'); scene.width = W; scene.height = H;", "const scene = document.createElement('canvas'); scene.width = W; scene.height = H; scene.__dyn = true;")
js = js.replace("Lexend, system-ui, sans-serif", '"Rift Body", Lexend, system-ui, sans-serif')
rep("const layers = {}; for (const k of ['far', 'floor', 'fg']) { const c = document.createElement('canvas');", "const layers = {}; for (const k of ['far', 'floor', 'fg']) { const c = document.createElement('canvas'); c.__raw = true;")
rep("const tintCv = document.createElement('canvas');", "const tintCv = document.createElement('canvas'); tintCv.__raw = true;")
rep("  const gx = w * .12, gy = h * .12; ctx.drawImage(im, i * F.w, 0, F.w, F.h, x - gx, y - gy, w + gx * 2, h + gy * 2); ctx.filter = 'none';",
    "  const gx = w * .12, gy = h * .12; if (!LITE) ctx.drawImage(im, i * F.w, 0, F.w, F.h, x - gx, y - gy, w + gx * 2, h + gy * 2); ctx.filter = 'none';")
rep("  if (a < .02) return; tctx.clearRect(0, 0, 192, 192);", "  if (a < .02 || LITE) return; tctx.clearRect(0, 0, 192, 192);")
rep("  if (fxState.chroma > 0) { const k", "  if (fxState.chroma > 0 && !LITE) { const k")
# drop the lab's controls and asset loader; the API takes their place
js = js[:js.index('/* ---------- controls ---------- */')] + API
open(OUT, 'w').write("// Academy Rift battle theatre: the Skill Lab engine, played for every strike, skill and ultimate.\n// Built from the Skill Lab by build_theatre.py; edit the lab and rebuild rather than editing this file.\n(function () {\n" + js + "\n})();\n")
print('engine.js', round(os.path.getsize(OUT) / 1e3), 'kB')
