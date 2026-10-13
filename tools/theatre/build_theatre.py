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
# player settings: sound-effects volume through one master gain, calm effects, lite mode
js = js.replace("A.destination", "MASTER")
rep("function audio() { if (A || !soundOn) return A; try { A = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }",
    "function audio() { if (A || !soundOn) return A; try { A = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } MASTER = A.createGain(); MASTER.gain.value = SFX_VOL; MASTER.connect(A['desti' + 'nation']);")
rep("const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;", "let reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, MASTER = null, SFX_VOL = 1;")
rep("  fxState.flash = Math.max(0, fxState.flash - d / 240);", "  fxState.flash = Math.max(0, fxState.flash - d / 240); if (reduce) { fxState.flash = Math.min(fxState.flash, .1); fxState.shake = 0; fxState.chroma = 0; }")
# stage grading: the stage layers are filtered once per stage, and the live colour grade (despair, inferno, element wash,
# dawn, dim) is painted over a copy with blend fills. Filtering the whole stage again every frame made battles stutter.
rep("function drawStageBack() {", """const gradeCv = {}; function gradeTo(name, base, opaque, extraDim = 1) {
  const D = fxState.despair, I = fxState.inferno, Eg = fxState.eg, Dn = fxState.dawn, e = ELS[fxState.egk];
  const fb = (1 - .6 * D) * (1 + .16 * I) * (Eg > .01 ? 1 + (e.bright - 1) * Eg : 1) * (1 + .22 * Dn) * extraDim;
  const ds = Math.max(0, .85 * D + (fxState.egk === 'metal' ? .6 * Eg : 0)), warm = I * .42 + Dn * .22;
  if (Math.abs(fb - 1) < .01 && ds < .01 && warm < .01) return base;
  const c = gradeCv[name] || (gradeCv[name] = Object.assign(document.createElement('canvas'), { width: base.width, height: base.height, __raw: true })), g = c.getContext('2d');
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, c.width, c.height); g.drawImage(base, 0, 0);
  const fill = (op, col, a) => { if (a < .005) return; g.globalCompositeOperation = op; g.globalAlpha = Math.min(1, a); g.fillStyle = col; g.fillRect(0, 0, c.width, c.height); };
  if (opaque) { fill('saturation', '#808080', ds); fill('color', I >= Dn ? '#ff7a2a' : '#ffd9a0', warm); }
  else fill('source-atop', '#ff8a40', warm * .35);
  if (fb < 1) fill('source-atop', '#000', 1 - fb); else fill('source-atop', '#fff', (fb - 1) * .55);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; return c; }
function drawStageBack() {""")
rep("  const far = stageLayer('far', `blur(${(1.3 + fxState.despair * 1.2).toFixed(1)}px) ` + grade(S.far));",
    "  const far = gradeTo('far', stageLayer('far', `blur(1.3px) brightness(${S.far}) saturate(1.05)`), true);")
rep("ctx.drawImage(stageLayer('floor', grade(S.floor)), -20, -12);", "ctx.drawImage(gradeTo('floor', stageLayer('floor', `brightness(${S.floor}) saturate(1.05)`), true), -20, -12);")
rep("  const S = STAGES[stageI], fg = stageLayer('fg', 'blur(2.2px) ' + grade(S.floor * (.74 - fxState.dim * .4)));",
    "  const S = STAGES[stageI], fg = gradeTo('fg', stageLayer('fg', `blur(2.2px) brightness(${(S.floor * .74).toFixed(3)}) saturate(1.05)`), false, (.74 - fxState.dim * .4) / .74);")
# effects use colour copies and glows baked by bake_fx.py, so nothing is filtered while a move plays
rep("""  const tf = f.tint ? f.tint + ' ' : '';
  if ((SHAD.has(f.kind) && f.kind !== 'sheal') || NORMAL.has(f.kind) || f.tint) {""", """  const tk = f.tint && f.el ? f.kind + '|' + f.el : null, bt = tk && img.fxT && img.fxT[tk];
  const src = bt ? bt[0] : im, glow = bt ? bt[1] : img.fxG && img.fxG[f.kind];
  const tf = f.tint && !bt ? f.tint + ' ' : '';
  if ((SHAD.has(f.kind) && f.kind !== 'sheal') || NORMAL.has(f.kind) || f.tint) {""")
rep("ctx.globalAlpha = Math.max(0, al); if (tf) ctx.filter = f.tint; ctx.drawImage(im, i * F.w, 0, F.w, F.h, x, y, w, h);",
    "ctx.globalAlpha = Math.max(0, al); if (tf) ctx.filter = f.tint; ctx.drawImage(src, i * F.w, 0, F.w, F.h, x, y, w, h);")
rep("ctx.globalAlpha = Math.max(0, al) * .95 * ha; if (tf) ctx.filter = f.tint; ctx.drawImage(im, i * F.w, 0, F.w, F.h, x, y, w, h);",
    "ctx.globalAlpha = Math.max(0, al) * .95 * ha; if (tf) ctx.filter = f.tint; ctx.drawImage(src, i * F.w, 0, F.w, F.h, x, y, w, h);")
rep("  const gx = w * .12, gy = h * .12; if (!LITE) ctx.drawImage(im, i * F.w, 0, F.w, F.h, x - gx, y - gy, w + gx * 2, h + gy * 2); ctx.filter = 'none';",
    """  const gx = w * .12, gy = h * .12;
  if (!LITE) { if (glow) { const gw = glow.width / F.n; ctx.filter = 'none'; ctx.drawImage(glow, i * gw, 0, gw, glow.height, x - gx, y - gy, w + gx * 2, h + gy * 2); }
    else ctx.drawImage(src, i * F.w, 0, F.w, F.h, x - gx, y - gy, w + gx * 2, h + gy * 2); }
  ctx.filter = 'none';""")
# battle stages v3: six locations, five damage levels each; stageI picks the location's light, stageImgI the picture
js = js[:js.index("const STAGES = [")] + """const STAGES = [
  { name: 'Grand Library', hor: 190, far: .96, floor: 1, wash: 'rgba(14,10,34,.06)', amb: '#9a9cff', ambA: .05, rays: null },
  { name: 'Science Lab', hor: 190, far: .96, floor: 1, wash: 'rgba(14,12,30,.06)', amb: '#9ab4ff', ambA: .05, rays: null },
  { name: 'Academy Rooftop', hor: 190, far: .96, floor: 1, wash: 'rgba(16,8,34,.06)', amb: '#a888ff', ambA: .06, rays: null },
  { name: 'Academy Courtyard', hor: 190, far: .96, floor: 1, wash: 'rgba(20,12,30,.06)', amb: '#b49cff', ambA: .05, rays: null },
  { name: 'Classroom 2-A', hor: 190, far: .96, floor: 1, wash: 'rgba(24,14,20,.05)', amb: '#c0a8ff', ambA: .05, rays: null },
  { name: 'East Corridor', hor: 190, far: .96, floor: 1, wash: 'rgba(10,12,34,.06)', amb: '#8aa8ff', ambA: .05, rays: null },
];
let stageImgI = 0;
""" + js[js.index("const FGY = 318;"):]
rep("function stageLayer(k, filter) { const L = layers[k], key = stageI + filter;", "function stageLayer(k, filter) { const L = layers[k], key = stageImgI + '|' + filter;")
js = js.replace("L.g.drawImage(img.stages[stageI], 0, 0, W + 40, H + 24)", "L.g.drawImage(img.stages[stageImgI], 0, 0, W + 40, H + 24)")
assert "img.stages[stageImgI]" in js
# drop the lab's controls and asset loader; the API takes their place
js = js[:js.index('/* ---------- controls ---------- */')] + API
open(OUT, 'w').write("// Academy Rift battle theatre: the Skill Lab engine, played for every strike, skill and ultimate.\n// Built from the Skill Lab by build_theatre.py; edit the lab and rebuild rather than editing this file.\n(function () {\n" + js + "\n})();\n")
print('engine.js', round(os.path.getsize(OUT) / 1e3), 'kB')
