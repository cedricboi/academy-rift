// Academy Rift battle theatre: the Skill Lab engine, played for every strike, skill and ultimate.
// Built from the Skill Lab by build_theatre.py; edit the lab and rebuild rather than editing this file.
(function () {
const AS = { FX: {}, stages: [] };
let BASE = '', PLAY = null, MIRROR = false, LITE = false;   // LITE: a slow device drops the glow and light passes to keep time
const cv = document.createElement('canvas'); cv.width = 640; cv.height = 360; cv.className = 'theatre-cv'; cv.__dyn = true;

/* ---------- canvas filters on iPad and Safari ----------
   Safari has no ctx.filter, and the effects lean on it (element tints, glows, stage grading).
   Where it is missing, a filtered drawImage draws a cached copy of the source that has been filtered once in JS. */
const FILTER_OK = (() => { if (!window.__theatreNativeFilter) return false;   // the cached copies are faster than ctx.filter on every browser we measured
  if (window.__theatreNoFilter) return false; try { const c = document.createElement('canvas'); c.width = c.height = 2; const g = c.getContext('2d'); g.filter = 'grayscale(1)'; g.fillStyle = '#ff0000'; g.fillRect(0, 0, 2, 2); return g.getImageData(0, 0, 1, 1).data[1] > 40; } catch (e) { return false; } })();
if (!FILTER_OK) (function shim() {
  const P = CanvasRenderingContext2D.prototype, di = P.drawImage;
  Object.defineProperty(P, 'filter', { configurable: true, get() { return this.__f || 'none'; }, set(v) { this.__f = v; } });
  const cache = new Map(); let uid = 0, px = 0; const PX_MAX = 24e6;   // iPads cap canvas memory, so the cache is kept to about 100 MB
  const qf = f => f.replace(/(-?\d*\.?\d+)(px|deg)?/g, (m, n, u) => { n = +n; if (u === 'deg') return Math.round(n / 5) * 5 + 'deg'; if (u === 'px') return Math.round(n * 2) / 2 + 'px'; return String(Math.round(n * 20) / 20); });
  const clamp = v => v < 0 ? 0 : v > 1 ? 1 : v;
  function matrix(fn, v) {
    if (fn === 'brightness') return [v, 0, 0, 0, 0, v, 0, 0, 0, 0, v, 0];
    if (fn === 'contrast') { const o = .5 - .5 * v; return [v, 0, 0, o, 0, v, 0, o, 0, 0, v, o]; }
    if (fn === 'saturate' || fn === 'grayscale') { const s = fn === 'grayscale' ? 1 - Math.min(1, v) : v;
      return [.213 + .787 * s, .715 - .715 * s, .072 - .072 * s, 0, .213 - .213 * s, .715 + .285 * s, .072 - .072 * s, 0, .213 - .213 * s, .715 - .715 * s, .072 + .928 * s, 0]; }
    if (fn === 'sepia') { const a = 1 - Math.min(1, v);
      return [.393 + .607 * a, .769 - .769 * a, .189 - .189 * a, 0, .349 - .349 * a, .686 + .314 * a, .168 - .168 * a, 0, .272 - .272 * a, .534 - .534 * a, .131 + .869 * a, 0]; }
    if (fn === 'hue-rotate') { const r = v * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
      return [.213 + c * .787 - s * .213, .715 - c * .715 - s * .715, .072 - c * .072 + s * .928, 0,
              .213 - c * .213 + s * .143, .715 + c * .285 + s * .140, .072 - c * .072 - s * .283, 0,
              .213 - c * .213 - s * .787, .715 - c * .715 + s * .715, .072 + c * .928 + s * .072, 0]; }
    return null;
  }
  function blur(c, g, w, h, r) {   // a cheap blur: shrink, then stretch back with smoothing
    if (r < .6) return; const s = Math.max(1 / 10, Math.min(.7, 1 / (r * .8))), sw = Math.max(1, Math.round(w * s)), sh = Math.max(1, Math.round(h * s));
    const t = document.createElement('canvas'); t.width = sw; t.height = sh; const tg = t.getContext('2d'); tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high';
    di.call(tg, c, 0, 0, w, h, 0, 0, sw, sh); g.clearRect(0, 0, w, h); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; di.call(g, t, 0, 0, sw, sh, 0, 0, w, h);
  }
  function filtered(src, f) {
    const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height; if (!w || !h) return null;
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); di.call(g, src, 0, 0);
    const ops = [...f.matchAll(/([a-z-]+)\(\s*(-?\d*\.?\d+)\s*(px|deg)?\s*\)/g)].map(m => [m[1], +m[2]]);
    let run = [];
    const flush = () => {                                    // every colour step in a row, done in one pass over the pixels
      if (!run.length) return; const id = g.getImageData(0, 0, w, h), d = id.data, n = run.length, Ms = run; run = [];
      for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; let r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
        for (let k = 0; k < n; k++) { const M = Ms[k];   // each step clamps, as CSS filters do
          const r2 = M[0] * r + M[1] * gg + M[2] * b + M[3], g2 = M[4] * r + M[5] * gg + M[6] * b + M[7], b2 = M[8] * r + M[9] * gg + M[10] * b + M[11];
          r = r2 < 0 ? 0 : r2 > 1 ? 1 : r2; gg = g2 < 0 ? 0 : g2 > 1 ? 1 : g2; b = b2 < 0 ? 0 : b2 > 1 ? 1 : b2; }
        d[i] = r * 255; d[i + 1] = gg * 255; d[i + 2] = b * 255; }
      g.putImageData(id, 0, 0);
    };
    for (const [fn, v] of ops) {
      if (fn === 'blur') { flush(); blur(c, g, w, h, v); continue; }
      const M = matrix(fn, v); if (M) run.push(M);
    }
    flush(); return c;
  }
  P.drawImage = function (src, ...a) {
    const f = this.__f; if (!f || f === 'none' || !src) return di.call(this, src, ...a);
    if (src.__dyn) return;                                   // the live scene changes every frame, so its filtered copy is skipped
    if (src.__raw) return di.call(this, src, ...a);          // reused buffers (stage layers, tint scratch) are drawn as they are
    const key = (src.__fid || (src.__fid = ++uid)) + '|' + qf(f); let c = cache.get(key);
    if (c) { cache.delete(key); cache.set(key, c); } else { c = filtered(src, qf(f)); if (!c) return; put(key, c); }
    return di.call(this, c, ...a);
  };
  function put(key, c) { cache.set(key, c); px += c.width * c.height;
    while (px > PX_MAX && cache.size > 1) { const [k, old] = cache.entries().next().value; cache.delete(k); px -= old.width * old.height; old.width = old.height = 0; } }
  window.__theatreWarm = (src, f) => { const key = (src.__fid || (src.__fid = ++uid)) + '|' + qf(f); if (!cache.has(key)) { const c = filtered(src, qf(f)); if (c) put(key, c); } };
})();

const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
// When the enemy side acts, the canvas is mirrored with CSS so the actor stands on the right. Text is flipped back so it still reads.
for (const fn of ['fillText', 'strokeText']) { const o = ctx[fn]; ctx[fn] = function (s, x, y, mw) {
  if (!MIRROR) return mw === undefined ? o.call(this, s, x, y) : o.call(this, s, x, y, mw);
  this.save(); this.translate(x, y); this.scale(-1, 1); const al = this.textAlign; this.textAlign = al === 'left' || al === 'start' ? 'right' : al === 'right' || al === 'end' ? 'left' : al;
  mw === undefined ? o.call(this, s, 0, 0) : o.call(this, s, 0, 0, mw); this.restore(); }; }
const W = 640, H = 360, FLOOR = 300, HOME = 170, EMI_X = 82, ENEMY = 505, STRIKE = ENEMY - 130, FR = 192;
const CH = {
  J: { name: 'JUN KISARAGI', anch: { idle: 72, ign: 80, atk: 72, dash: 96, fb: 72, sc: 64, gd: 80, ult: 80, hurt: 72 }, hurt: [0, 5, 6, 5, 0], idle: [0, 1, 2, 3, 4, 5, 6, 7], idleMs: 120, dashF: [3, 4, 5, 6], afterTint: 'sepia(1) saturate(5) hue-rotate(-25deg) brightness(1.3)' },
  E: { name: 'EMI SHIRAISHI', anch: { idle: 96, ready: 96, mend: 96, veil: 96, purify: 96, hymn: 96, hurt: 96, ascend: 96 }, hurt: [0, 2, 3, 4, 2, 0], idle: [0, 1, 2, 3, 4, 5, 6, 7], idleMs: 150, afterTint: 'sepia(1) saturate(2.4) hue-rotate(5deg) brightness(1.6)' },
  EA: { name: 'EMI SHIRAISHI · ANGEL', anch: { idle: 96, ready: 96, mend: 96, veil: 96, purify: 96, hymn: 96, hurt: 96 }, hurt: [0, 2, 3, 4, 2, 0], idle: [0, 1, 2, 3, 4, 5, 6, 7], idleMs: 150, afterTint: 'sepia(1) saturate(2.4) hue-rotate(5deg) brightness(1.7)' },
  K: { name: 'KURO AMANE', anch: { idle: 80, transform: 80, equip: 80, dash: 96, hurt: 80, hex: 80, bind: 80, bloom: 80, mend: 80, ult: 80 }, hurt: [0, 1, 2, 3], idle: [0, 1, 2, 3, 4, 5, 4, 3, 2, 1], idleMs: 160, dashF: [3, 4, 5, 6], afterTint: 'sepia(1) saturate(4) hue-rotate(215deg) brightness(.95)' },
};
// Elements of the seven new characters. g = ground spread sprite, b = burst, big = signature effect.
// add = additive light (glows), col = light colour on characters, fl = flash colour, grade = colour wash.
const ELS = {
  ice:   { g: 'ice_g', b: 'ice_b', big: 'ice_big', add: true,  col: '#a8e4ff', fl: '220,240,255', wash: '#3a7cc0', bright: 1.04, pool: '#bfe9ff' },
  elec:  { g: 'el_g',  b: 'el_b',  big: 'el_big',  add: true,  col: '#ffe86a', fl: '255,250,205', wash: '#3a3460', bright: .78, pool: '#fff1a0' },
  wind:  { g: 'wi_g',  b: 'wi_b',  big: 'wi_big',  add: false, col: '#a8f0bc', fl: '225,255,230', wash: '#2f8a52', bright: 1, pool: '#c8ffd8' },
  earth: { g: 'ea_g',  b: 'ea_b',  big: 'ea_big',  add: false, col: '#ffc070', fl: '255,226,180', wash: '#b07a3a', bright: .86, pool: '#3a2410', dark: true },
  mind:  { g: 'mi_g',  b: 'mi_b',  big: 'mi_big',  add: true,  col: '#d6a4ff', fl: '236,214,255', wash: '#9a5cff', bright: .9, pool: '#d8b0ff' },
  water: { g: 'wa_g',  b: 'wa_b',  big: 'wa_big',  add: false, col: '#8fd0ff', fl: '214,240,255', wash: '#3a8fe0', bright: .96, pool: '#9fd8ff' },
  metal: { g: 'me_g',  b: 'me_b',  big: 'me_big',  add: false, col: '#e8f0f6', fl: '240,244,250', wash: '#8a98a8', bright: .92, pool: '#1a1e24', dark: true },
};
const ELKIND = {}; for (const [el, e] of Object.entries(ELS)) for (const k of [e.g, e.b, e.big]) ELKIND[k] = el;
const NEWC = {
  S: { id: 'saya', el: 'ice', name: 'SAYA MIZUNO', sk: ['pin', 'lock', 'veil', 'field'] },
  R: { id: 'raiden', el: 'elec', name: 'RAIDEN AOKI', sk: ['step', 'rush', 'charge', 'pulse'] },
  N: { id: 'nao', el: 'wind', name: 'NAO KAZEHARA', sk: ['breeze', 'gale', 'guard', 'mercy'] },
  T: { id: 'taiga', el: 'earth', name: 'TAIGA DOMOTO', sk: ['palm', 'stand', 'roar', 'shelter'] },
  H: { id: 'hina', el: 'mind', name: 'HINA KAGARI', sk: ['needle', 'break', 'snare', 'clarity'] },
  M: { id: 'mina', el: 'water', name: 'MINA ARAKAWA', sk: ['cut', 'guard', 'restore', 'current'] },
  X: { id: 'renji', el: 'metal', name: 'RENJI KUROSAWA', sk: ['smash', 'break', 'rush', 'shelter'] },
};
for (const [cid, n] of Object.entries(NEWC)) { const anch = {}; for (const k of ['idle', 'calm', 'sig', 'dash', 'hurt', 'ult', ...n.sk]) anch[k] = 96;
  CH[cid] = { name: n.name, el: n.el, anch, hurt: [0, 2, 3, 4, 3, 1], idle: [0, 1, 2, 3, 4, 5, 6, 7], idleMs: 140, dashF: [2, 3, 4, 5], afterTint: 'brightness(1.5) saturate(1.4)', armed: n.sk[0] }; }
const isNew = a => !!NEWC[a.cid];
let reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, MASTER = null, SFX_VOL = 1;
const rnd = (a, b) => a + Math.random() * (b - a);
const range = (a, b) => { const r = []; if (a <= b) for (let i = a; i <= b; i++) r.push(i); else for (let i = a; i >= b; i--) r.push(i); return r; };
const ease = { inout: p => p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2, out: p => 1 - Math.pow(1 - p, 3), in: p => p * p * p, lin: p => p };
const img = {};
let speed = 1, loopOn = false, soundOn = true, busy = false, idleT = 0, nextSkill = 0, last = 0;

/* ---------- actors ---------- */
const actor = (cid, x, flip) => ({ cid, x, home: x, y: 0, flip, anim: 'idle', f: 0, seq: null, armed: false });
const hero = actor('J', HOME, false), tgt = actor('K', ENEMY, true), ally = actor('E', EMI_X, false);
const isEmi = a => a.cid === 'E' || a.cid === 'EA';
const cam = { z: 1, fx: W / 2, fy: H / 2 };
const fxState = { eg: 0, egk: 'ice', dawn: 0, inferno: 0, black: 0, despair: 0, letter: 0, dim: 0, flash: 0, flashCol: '255,236,206', shake: 0, shakeMag: 5, chroma: 0, hitstop: 0, banner: null, cutin: null, buff: null, debuff: null };
let enemy = { kb: 0, hit: 0, burn: 0, curse: 0 }, emiGlow = 0, chainShot = null, moon = null, pools = [], shards = null, shatterNext = false, sigils = [], burn = null, burnNext = false, halo = null, elRain = null, snapNext = null, snapFX = null, web = null, circuit = null, featherRain = 0, allyCurse = 0, stageI = 0, stageBusy = false, cycled = false;
let fxs = [], scorch = [], trail = [], nums = [], streaks = [], timers = [], tweens = [], lastTrailX = HOME, trailing = 0;

function later(ms, fn) { timers.push({ t: ms, fn }); }
function tween(obj, key, to, dur, e = 'inout', from) { tweens.push({ obj, key, from: from ?? obj[key], to, dur, age: 0, e: ease[e] }); }
function playA(a, anim, frames, durs, opts = {}) {
  a.anim = anim; a.seq = { frames, durs: Array.isArray(durs) ? durs : frames.map(() => durs), i: 0, t: 0, loop: !!opts.loop, on: opts.on || {}, after: opts.after };
  a.f = frames[0]; fireFrame(a, 0);
}
const play = (...args) => playA(hero, ...args);
function fireFrame(a, i) { const s = a.seq; if (s && s.on[s.frames[i]]) s.on[s.frames[i]](); }
function rest(a) { if (isNew(a) && a.armed) { playA(a, CH[a.cid].armed, [0], 1000, { loop: true }); return; }
  if (a.cid === 'K' && a.armed) playA(a, 'hex', [0], 1000, { loop: true }); else if (isEmi(a) && a.armed) playA(a, 'mend', [0], 1000, { loop: true }); else playA(a, 'idle', CH[a.cid].idle, CH[a.cid].idleMs, { loop: true }); }
const idlePose = () => rest(hero);
// Kuro tears off his Discipline Committee armband and it becomes his chain weapon; afterwards it winds back into an armband
// Jun: whirls his blade overhead, stabs it into the floor and fire erupts up the steel and races across the ground
function standUp(a, then) { if (a.armed) { then && then(); return; }
  if (isNew(a)) { a.armed = true; const n = AS[a.cid].sig.n, fr = range(0, n - 1);   // the signature flourish into battle stance
    playA(a, 'sig', fr, fr.map(i => i < 3 ? 100 : 75), { on: { [Math.round(n * .55)]: () => sigFX(a) }, after: () => { rest(a); then && then(); } }); return; }
  if (isEmi(a)) { a.armed = true; const n = AS[a.cid].ready.n, fr = range(0, n - 1);   // Emi opens her eyes and raises her staff; holy light blooms around her
    playA(a, 'ready', fr, fr.map(i => i < 3 ? 110 : 80), { on: { [n - 2]: () => holyFX(a) }, after: () => { rest(a); then && then(); } }); return; }
  if (a.cid === 'J') { a.armed = true; playA(a, 'ign', range(0, 13), [90, 80, 80, 70, 60, 60, 60, 90, 120, 90, 80, 80, 90, 150],
    { on: { 3: () => { SFX.swing(); SFX.ignite(); orb(a.x + 10, FLOOR - 120, 40, 260, '#ffb050'); }, 5: () => SFX.swing(), 7: () => ignFX(a) }, after: () => { rest(a); then && then(); } }); return; }
  a.armed = true;
  playA(a, 'transform', range(0, 12), [110, 100, 90, 90, 80, 80, 80, 70, 70, 80, 90, 100, 160], { on: { 5: () => tearFX(a) }, after: () => { rest(a); then && then(); } }); }
function sitDown(a, then) { if (isNew(a)) { if (a.armed) { a.armed = false; const n = AS[a.cid].calm.n; playA(a, 'calm', range(0, n - 1), 50, { after: () => { rest(a); then && then(); } }); } else then && then(); return; }
  if (isEmi(a)) { if (a.armed) { a.armed = false; const n = AS[a.cid].ready.n; playA(a, 'ready', range(n - 1, 0), 45, { after: () => { rest(a); then && then(); } }); } else then && then(); return; }
  if (a.cid === 'J') a.armed = false; if (a.cid !== 'K' || !a.armed) { then && then(); return; } SFX.chain(.5);
  playA(a, 'equip', range(0, 10), [90, 90, 90, 90, 90, 100, 100, 110, 120, 130, 160], { after: () => { a.armed = false; rest(a); then && then(); } }); }
function ignFX(a) { const bx = a.x + 44; SFX.slamFire(); fxState.shake = 280; fxState.shakeMag = 4; fxState.flash = .18; fxState.flashCol = '255,236,206';
  orb(bx + 6, FLOOR - 8, 50, 300, '#ff9a40');
  fire('burst', bx + 10, FLOOR - 20, { anchor: 'center', fps: 55, scale: .5, glow: .3, alpha: .8 });
  fire('pillar', bx + 14, FLOOR + 6, { loop: true, scale: .5, life: 800, fps: 60, grow: 120, lights: true, glow: .3 });
  for (let k = 1; k <= 6; k++) later(k * 45, () => { groundFire(bx + k * 26, rnd(.45, .65), rnd(1500, 2100)); groundFire(bx - 20 - k * 22, rnd(.4, .55), rnd(1300, 1800)); });
  for (let q = 0; q < 34; q++) ember(bx + rnd(-16, 16), FLOOR - rnd(0, 26), { vx: rnd(-1.4, 1.4), vy: rnd(-3.4, -1.2), life: rnd(700, 1400) });
  for (let q = 0; q < 16; q++) spark(bx, FLOOR - 14, .7);
  tween(fxState, 'inferno', .35, 150); later(500, () => tween(fxState, 'inferno', 0, 700)); }
const GS = { ice: .85, elec: 1, wind: .55, earth: .95, mind: .7, water: .8, metal: .85 };
function sprout(el, x, scale, life, o = {}) { if (el === 'wind' && Math.random() < .4) return null; return fire(ELS[el].g, x + rnd(-3, 3), FLOOR + 5, Object.assign({ loop: true, scale: scale * (GS[el] || 1), life, fps: 90, layer: Math.random() < .45 ? 'back' : 'front', glow: .25, lights: true }, o)); }
function elemPool(el, x, R, life) { const p = { x, R, age: 0, life, grow: Math.min(500, life * .2), ph: Math.random() * 6, el }; pools.push(p); return p; }
function elemTrail(el, x) { if (Math.random() < .5) elemPool(el, x, rnd(18, 26), rnd(1300, 1800)); if (Math.random() < .6) sprout(el, x, rnd(.45, .65), rnd(1200, 1800));
  for (let i = 0; i < 3; i++) ember(x + rnd(-10, 10), FLOOR - rnd(0, 30), { pal: el, vy: rnd(-1.4, -.4), life: rnd(600, 1100) }); }
function spreadLine(el, x0, x1, n, life, step = 30, scale = [.6, .95]) { for (let k = 0; k < n; k++) later(k * step, () => { const x = x0 + (x1 - x0) * (k / Math.max(1, n - 1)) + rnd(-8, 8); sprout(el, x, rnd(scale[0], scale[1]), rnd(life * .85, life)); if (k % 2 === 0) elemPool(el, x, rnd(26, 40), life); }); }
function egPulse(el, amt, inMs = 200, hold = 600, outMs = 800) { fxState.egk = el; tween(fxState, 'eg', amt, inMs); later(inMs + hold, () => tween(fxState, 'eg', 0, outMs)); }
function elHit(el, o = {}) { const x = o.x ?? ENEMY;   // the standard elemental hit on the enemy: impact, burst sprite, ground spread
  impactFX(Object.assign({ pal: el }, o)); fire(ELS[el].b, x, (o.y ?? FLOOR - 62), { anchor: 'center', fps: 60, scale: o.bs ?? 1, glow: ADDK.has(ELS[el].b) ? .15 : .4, follow: true, alpha: ADDK.has(ELS[el].b) ? .62 : 1 });
  for (const dx of o.spots ?? [-40, -14, 16, 42]) sprout(el, x + dx, rnd(.7, 1.05), rnd(1800, 2500), { follow: true }); elemPool(el, x, o.pool ?? 80, 2400); }
function ticks(el, list, y = FLOOR - 70) { list.forEach(([v, t, dx, dy, big]) => { num(v, ENEMY + (dx ?? 0), FLOOR - 120 + (dy ?? 0), !!big, t); if (t > 0 && !big) later(t, () => tick(ENEMY, y, el, 3)); }); }
function healOn(el, x, v, delay = 0) { later(delay, () => { SFX.heal(); SFX.chime(); emiGlow = 1300; fire(ELS[el].b, x, FLOOR - 60, { anchor: 'center', fps: 70, scale: .7, glow: .3, alpha: .8 });
  for (const dx of [-30, -8, 14, 34]) sprout(el, x + dx, rnd(.6, .9), rnd(1500, 2000)); elemPool(el, x, 64, 2000);
  for (let q = 0; q < 26; q++) ember(x + rnd(-24, 24), FLOOR - rnd(10, 110), { pal: el, vy: rnd(-1.8, -.6), life: rnd(800, 1400) }); num(v, x + 30, FLOOR - 150, true, 0, 'heal'); }); }
function guardBlock(el, x, label = 'BLOCKED') { const b = fire('sburst', ENEMY - 30, FLOOR - 70, { anchor: 'center', loop: true, scale: .4, life: 300, fps: 50, glow: .5 }); tween(b, 'x', x, 280, 'in'); SFX.dark();
  later(280, () => { SFX.shield(); fxState.shake = 220; fxState.shakeMag = 3; for (let q = 0; q < 24; q++) spark(x, FLOOR - 66, .8, q % 2 ? el : 'shadow'); orb(x, FLOOR - 66, 60, 260, ELS[el].col); num(label, x - 30, FLOOR - 160, false, 0, 'heal'); }); }
function sigFX(a) {   // the correct-answer moment for the new characters: their element erupts around them
  const el = CH[a.cid].el, x = a.x; SFX.el(el, 'sig'); fxState.flash = .16; fxState.flashCol = ELS[el].fl; orb(x + 20, FLOOR - 70, 70, 360, ELS[el].col);
  elemPool(el, x, 76, 2300); for (const dx of [-54, -30, 28, 52, 74]) sprout(el, x + dx, rnd(.7, 1), rnd(1800, 2400));
  for (let q = 0; q < 26; q++) ember(x + rnd(-40, 50), FLOOR - rnd(20, 110), { pal: el, vx: rnd(-1.5, 1.5), vy: rnd(-2.2, -.3), life: rnd(700, 1300) }); egPulse(el, .3, 150, 300, 700); }
function holyFX(a) { SFX.holy(); const sx = a.x + 40, sy = FLOOR - 92; fxState.flash = .16; fxState.flashCol = '255,246,220';
  orb(sx, sy, 60, 360, '#ffe9a8'); orb(sx, sy, 22, 240, '#ffffff'); lightPool(a.x, 72, 2300);
  for (const [dx, sc] of [[-52, .75], [-28, .9], [30, .95], [56, .8]]) lilySprout(a.x + dx, sc, rnd(1900, 2500));
  for (let q = 0; q < 26; q++) ember(sx + rnd(-12, 12), sy + rnd(-12, 12), { pal: 'light', vx: rnd(-1.6, 1.6), vy: rnd(-2.2, -.2), life: rnd(700, 1300) });
  if (a.cid === 'EA') for (let q = 0; q < 14; q++) feather(a.x + rnd(-40, 40), FLOOR - rnd(70, 120), rnd(-1.2, 1.2), rnd(-1.4, .2));
  tween(fxState, 'dawn', .22, 200); later(600, () => tween(fxState, 'dawn', 0, 700)); }
function tearFX(a) { SFX.rip(); SFX.chain(); SFX.dark(); const x = a.x - 6, y = FLOOR - 104;
  orb(x, y, 70, 320, '#b483ff'); orb(x, y, 30, 200, '#ffffff'); fxState.flash = .25; fxState.flashCol = '226,206,255';
  for (let q = 0; q < 26; q++) parts.push({ t: 'shred', x, y, px: x, py: y, vx: rnd(-3.5, 3.5), vy: rnd(-4, -.5), g: .14, drag: .97, life: rnd(600, 1100), age: 0, c: Math.random() < .3 ? '#d9a63a' : '#7d3fd6', s: rnd(2, 4), rot: rnd(0, 6), vr: rnd(-.3, .3) });
  for (let q = 0; q < 20; q++) spark(x, y, .6, 'shadow');
  darkPool(a.x, 75, 2600); for (const dx of [-34, 30, 52]) darkSprout(a.x + dx, rnd(.7, 1), rnd(1800, 2400));
  tween(fxState, 'despair', .3, 200); later(500, () => tween(fxState, 'despair', 0, 600)); }
function tgtHurt() { if (tgt.seq && tgt.anim === 'standup') return; if (tgt.cid === 'J' && Math.random() < .5 && !(tgt.hurtV > performance.now())) { tgt.hurtV = performance.now() + 900; voice('v_gasp', { vol: .6, rate: rnd(.95, 1.05) }); } playA(tgt, 'hurt', CH[tgt.cid].hurt, 80, { after: () => rest(tgt) }); }

/* ---------- battle music ---------- */
let BGM_VOL = .38; let musicOn = true, duckT = 0, duckLv = 1;
let bgm = { volume: 0, paused: true, play() { return Promise.resolve(); }, pause() {} };
function startMusic() {}
function duck(level = .35, ms = 700) { duckLv = Math.min(duckLv, level); duckT = Math.max(duckT, ms); }
function musicStep(dt) { if (!PLAY && duckLv === 1) return; if (duckT > 0) { duckT -= dt; if (duckT <= 0) duckLv = 1; }
  const want = BGM_VOL * duckLv; bgm.volume = Math.max(0, Math.min(1, bgm.volume + (want - bgm.volume) * Math.min(1, dt / 120))); }

/* ---------- sound ---------- */
let A = null, noise = null;
function audio() { if (A || !soundOn) return A; try { A = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } MASTER = A.createGain(); MASTER.gain.value = SFX_VOL; MASTER.connect(A['desti' + 'nation']); loadSfx();
  noise = A.createBuffer(1, A.sampleRate * 2, A.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return A; }
function env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
function nz(type, f0, f1, dur, peak, delay = 0, q = 1, atk) { if (!A || !soundOn) return; const t = A.currentTime + delay;
  const s = A.createBufferSource(); s.buffer = noise; s.loop = true; const f = A.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur); const g = A.createGain(); env(g, t, atk ?? Math.min(.03, dur / 4), peak, dur);
  s.connect(f).connect(g).connect(MASTER); s.start(t); s.stop(t + dur + .05); }
function tone(type, f0, f1, dur, peak, delay = 0) { if (!A || !soundOn) return; const t = A.currentTime + delay; const o = A.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); const g = A.createGain(); env(g, t, .005, peak, dur); o.connect(g).connect(MASTER); o.start(t); o.stop(t + dur + .05); }
function crackle(dur, n) { for (let i = 0; i < n; i++) nz('highpass', 2500, 2000, .015 + Math.random() * .02, rnd(.06, .25), Math.random() * dur, .7); }
// Sound effects: recorded clips from the Sonniss GDC 2026 Game Audio Bundle (royalty-free), trimmed and normalised.
const SND = { src: {}, loud: {} };
const BUF = {}; let sfxBus = null, sfxLoading = false;
function loadSfx() { if (sfxLoading || !A) return; sfxLoading = true;
  sfxBus = A.createDynamicsCompressor(); sfxBus.threshold.value = -12; sfxBus.ratio.value = 4; sfxBus.attack.value = .003; sfxBus.release.value = .2;
  const out = A.createGain(); out.gain.value = .9; sfxBus.connect(out).connect(MASTER);
  for (const [k, url] of Object.entries(SND.src)) fetch(BASE + url).then(r => r.arrayBuffer()).then(ab => A.decodeAudioData(ab, b => BUF[k] = b, () => {})).catch(() => {}); }
// play a clip: a name or a list to pick from at random. vol is relative to a common loudness.
function smp(name, o = {}) { if (!A || !soundOn) return; if (Array.isArray(name)) name = name[Math.random() * name.length | 0]; const b = BUF[name]; if (!b) return;
  const t = A.currentTime + (o.delay || 0), src = A.createBufferSource(), g = A.createGain(); src.buffer = b; src.playbackRate.value = o.rate || 1;
  const norm = Math.min(1, Math.pow(10, (-15 - (SND.loud[name] ?? -15)) / 20)), v = (o.vol ?? 1) * norm; g.gain.setValueAtTime(v, t);
  const len = o.dur ? Math.min(o.dur, b.duration - (o.offset || 0)) : null;
  if (len) { g.gain.setValueAtTime(v, t + Math.max(0, len - .25) / (o.rate || 1)); g.gain.linearRampToValueAtTime(.0001, t + len / (o.rate || 1)); }
  src.connect(g).connect(sfxBus || MASTER); src.start(t, o.offset || 0, len ? len + .02 : undefined); }
const PUNCH = ['punch1', 'punch2', 'punch3', 'punch4'], CLINK = ['clink1', 'clink2', 'clink3'];
const voice = (n, o) => smp(n, Object.assign({ vol: .8 }, o));
const SFX = {
  dash() { smp('whoosh', { vol: .9, rate: rnd(.95, 1.1) }); },
  ignite() { smp('firewhoosh', { vol: .7, rate: 1.15, dur: 1.1 }); },
  swing() { if (isEmi(hero)) smp('whoosh', { vol: .5, rate: 1.35 }); else if (hero.cid === 'K') smp('metalwhoosh', { vol: .9, rate: rnd(.95, 1.1) }); else smp(Math.random() < .5 ? 'bladeswing' : 'slice', { vol: .9 }); },
  hit() { smp('metalhit', { vol: .9 }); smp('blast', { vol: .75 }); smp(PUNCH, { vol: .55 }); },
  small() { smp(PUNCH, { vol: .75, rate: rnd(.9, 1.15) }); },
  roar(d = 1.4) { smp('firewhoosh', { vol: .8, rate: .85 }); smp('crackle', { vol: .55, dur: Math.min(3, d + .4) }); },
  boom() { smp(Math.random() < .5 ? 'boomA' : 'boomB', { vol: 1 }); smp('cutsweep', { vol: .6 }); },
  charge(d = 1) { smp('jet', { vol: .6, dur: Math.min(3, d + .3) }); },
  shield() { if (isEmi(hero)) { smp('shimmerhit', { vol: .8 }); smp('magicbells', { vol: .45, dur: 2.5 }); } else smp('elec', { vol: .6 }); },
  fall() { smp('drop', { vol: .7 }); smp('debris', { vol: .5, rate: 1.2 }); },
  cutin() { smp('chordhit', { vol: 1 }); smp('swoosh', { vol: .6 }); },
  back() { smp('swoosh', { vol: .5, rate: .9 }); },
  // Kuro: chains and shadow
  whirl() { smp('metalwhoosh', { vol: .9, rate: rnd(.9, 1.1) }); smp(CLINK, { vol: .5, delay: .05 }); },
  chain(v = 1) { smp(CLINK, { vol: .7 * v, rate: rnd(.9, 1.2) }); smp(CLINK, { vol: .5 * v, rate: rnd(.9, 1.2), delay: .05 }); },
  yank() { smp('whip', { vol: .9 }); SFX.chain(1.2); },
  dark() { smp('tentacle', { vol: .8 }); },
  slam() { smp('smash', { vol: 1 }); smp('metalring', { vol: .5 }); SFX.chain(1.3); },
  heal() { smp('spell', { vol: .7 }); },
  chime() { smp('twinkle', { vol: .7, rate: rnd(.97, 1.05) }); },
  rip() { smp('rip', { vol: 1 }); smp('whip', { vol: .35, rate: 1.3 }); },
  tide() { smp('swell', { vol: .7 }); smp('debris', { vol: .5, rate: .8 }); },
  tickc() { smp('tick', { vol: 1, rate: rnd(.98, 1.02) }); },
  bell() { smp('bell', { vol: 1 }); },
  hum(d = 2) { if (hero.cid === 'K') smp('braamDark', { vol: .85 }); else if (hero.cid === 'J') smp('braamHorn', { vol: .8 }); else smp('astral', { vol: .6, dur: Math.min(6, d) }); },
  slamFire() { smp('blast', { vol: .9 }); smp('firewhoosh', { vol: .7, rate: 1.1 }); },
  rune() { smp('firewhoosh', { vol: .3, rate: 1.7, dur: .5 }); smp('ui_pop' in BUF ? 'ui_pop' : 'tick', { vol: .4, rate: .7 }); },
  gong() { smp('metalring', { vol: 1 }); smp('braamHorn', { vol: .55, dur: 3 }); },
  sizzle(d = 1) { smp('crackle', { vol: .7, dur: Math.min(3, d + .3) }); },
  choir(d = 2) { smp('astral', { vol: .55, dur: Math.min(6, d + 1) }); smp('shimloop', { vol: .4, dur: Math.min(4, d + .5) }); },
  holy() { smp('shimmerhit', { vol: .7 }); },
  glide() { smp('whoosh', { vol: .45, rate: 1.25 }); },
  wing() { smp('confetti', { vol: .9 }); smp('debris', { vol: .7, rate: 1.2 }); smp('shimmerhit', { vol: .8 }); smp('magicbells', { vol: .6, dur: 3 }); },
  bellHoly() { smp('bell', { vol: .8, rate: 1.5 }); smp('magicbells', { vol: .6, dur: 3.5 }); },
  shatter() { smp('glass', { vol: .9 }); smp('shatter', { vol: .9 }); },
  // element sounds for the new characters: kind = sig | hit | cast | big | spread
  el(el, kind) { const S = ELSFX[el] && ELSFX[el][kind]; if (S) for (const [n, o] of S) smp(n, Object.assign({}, o, { rate: (o.rate || 1) * rnd(.96, 1.05) })); },
};
const ELSFX = {
  ice:   { sig: [['icecrack', { vol: .8 }], ['shimmerhit', { vol: .5, rate: 1.2 }]], hit: [['icecrush', { vol: .9 }], ['shatter', { vol: .7 }]], cast: [['glass', { vol: .7 }]], big: [['icefissure', { vol: 1 }], ['shatter', { vol: .8 }]], spread: [['icecrack', { vol: .35, rate: 1.3 }]] },
  elec:  { sig: [['arc', { vol: .9 }], ['buzz', { vol: .5, dur: .8 }]], hit: [['arc', { vol: 1 }], ['blast', { vol: .7 }]], cast: [['buzz', { vol: .6, dur: 1.4 }]], big: [['arcup', { vol: .8 }], ['arc', { vol: 1, delay: .1 }]], spread: [['arc', { vol: .3, rate: 1.4 }]] },
  wind:  { sig: [['whoosh', { vol: .9 }], ['windloop', { vol: .5, dur: 1.5 }]], hit: [['debris', { vol: .7, rate: 1.2 }], ['whoosh', { vol: .8, rate: .9 }]], cast: [['windloop', { vol: .6, dur: 2 }]], big: [['windloop', { vol: .8, dur: 3 }], ['debris', { vol: .8 }]], spread: [['whoosh', { vol: .35, rate: 1.4 }]] },
  earth: { sig: [['thud', { vol: .9 }], ['crumble', { vol: .7 }]], hit: [['smash', { vol: 1 }], ['crumble', { vol: .7 }]], cast: [['rumble', { vol: .7, dur: 2 }]], big: [['rumble', { vol: .9 }], ['boomB', { vol: .7 }]], spread: [['crumble', { vol: .35, rate: 1.2 }]] },
  mind:  { sig: [['shuffle', { vol: .9 }], ['shimmerhit', { vol: .4, rate: .8 }]], hit: [['glitch', { vol: .7, dur: 1 }], ['glass', { vol: .6 }]], cast: [['cardflick', { vol: 1 }], ['magiccreate', { vol: .5 }]], big: [['glitch', { vol: .8 }], ['swell', { vol: .6 }]], spread: [['cards', { vol: .4 }]] },
  water: { sig: [['waterpop', { vol: .9 }], ['bubbles', { vol: .6 }]], hit: [['waterhit', { vol: 1 }], ['waterpop', { vol: .5 }]], cast: [['pour', { vol: .6, dur: 1.8 }]], big: [['waterhit', { vol: 1 }], ['swell', { vol: .5 }]], spread: [['bubbles', { vol: .35, rate: 1.2 }]] },
  metal: { sig: [['tink', { vol: .9 }], ['clink1', { vol: .6 }]], hit: [['metalhit', { vol: 1 }], ['metalring', { vol: .5 }]], cast: [['scrape', { vol: .6, dur: 1.6 }]], big: [['scrape', { vol: .8 }], ['metalring', { vol: .8 }]], spread: [['tink', { vol: .35, rate: 1.3 }]] },
};
const VOX = { S: ['v_exhale', 1, 'v_fyell', 1.05], R: ['v_yell', 1, 'v_aiyah', 1.05], N: ['v_yell', 1.12, 'v_yell', 1], T: ['v_aiyah', .8, 'v_aiyah', .78], H: ['v_exhale', 1.1, 'v_fyell', 1.12], M: ['v_exhale', .95, 'v_fyell', .98], X: ['v_aiyah', .86, 'v_aiyah', .84] };
const shout = (big) => { const v = VOX[hero.cid]; if (v) voice(big ? v[2] : v[0], { rate: big ? v[3] : v[1], vol: big ? .9 : .7 }); };

/* ---------- effects (PixelLab animations) ---------- */
const HALPHA = { lpillar: .5, ldome: .38, lveil: .55, aurora: .42 };
const HOLY = new Set(['lpillar', 'lily', 'ldome', 'lveil', 'aurora']), NORMAL = new Set(['sun', 'lily']);
const ADDK = new Set(['el_g', 'el_b', 'el_big']);   // light-like effects glow; solid things (crystals, rocks, cards, blades, water) are drawn normally
for (const k of Object.keys(ELKIND)) if (!ADDK.has(k)) NORMAL.add(k);
const SHAD = new Set(['sthorn', 'scoil', 'sflower', 'sheal', 'svoid', 'sburst', 'tendril1', 'tendril2', 'bfire1', 'bfire2', 'hands', 'miasma', 'darktide']);
const BOOST = { ice_b: 1.05, el_b: 1.0, wi_b: 1.4, ea_b: 1.4, mi_b: 1.05, wa_b: 1.4, me_b: 1.4, ice_big: 1.3, el_big: 1.4, wi_big: 1.3, ea_big: 1.3, mi_big: 1, wa_big: 1.4, me_big: 1.2, lpillar: 1.3, lily: 1, ldome: 1.3, lveil: 1.3, aurora: 1.6, sun: 1.3, slash: 1.7, burst: 1.8, pillar: 1.3, wave: 1.35, blast: 1.4, storm: 1.15, aura: 1.15, wall: 1.2, bigsword: 1.25, g1: 1.2, g2: 1.2, sthorn: 1.25, scoil: 1.1, sflower: 1.2, sheal: 1.2, svoid: 1.2, sburst: 1.5, tendril1: 1.2, tendril2: 1.2, bfire1: 1.2, bfire2: 1.2, hands: 1.15, miasma: 1.15, darktide: 1.3 };
const LIGHT = { ice_g: .14, el_g: .2, wi_g: .08, ea_g: .06, mi_g: .16, wa_g: .1, me_g: .1, ice_b: 1.1, el_b: 1.5, wi_b: .7, ea_b: .6, mi_b: 1.2, wa_b: .8, me_b: 1, ice_big: 1.1, el_big: 1.8, wi_big: .9, ea_big: .5, mi_big: 1, wa_big: .9, me_big: .8, lpillar: 1.1, lily: .14, ldome: .6, lveil: .8, aurora: .8, sun: .8, slash: 1, burst: 1.4, pillar: 1.2, wave: .9, blast: 1.8, storm: 1.6, aura: .6, wall: 1, bigsword: 1, g1: .22, g2: .22, sthorn: .9, scoil: .6, sflower: 1, sheal: .8, svoid: 1.6, sburst: 1.3, tendril1: .18, tendril2: .18, bfire1: .25, bfire2: .25, hands: .6, miasma: 1, darktide: .9 };
function fire(kind, x, y, o = {}) {
  const F = AS.FX[kind];
  const f = Object.assign({ kind, x, y, age: -(o.delay || 0), scale: 1, sy: 1, fps: 70, loop: false, phase: Math.random() * F.n | 0, follow: false, glow: .35, grow: 0, fade: 0, anchor: 'bottom', alpha: 1, layer: 'front', hold: 0 }, o);
  if (f.life == null) f.life = f.loop ? 1200 : F.n * f.fps + f.hold;
  if (f.loop && !o.grow) f.grow = 120; if (f.loop && !o.fade) f.fade = 320; if (f.hold && !o.fade) f.fade = Math.min(500, f.hold);
  fxs.push(f); return f;
}
function fxIntensity(f) { if (f.age < 0) return 0; const rest = f.life - f.age, k = Math.min(1, f.age / 120, rest / 300); return (LIGHT[f.kind] || .3) * f.scale * Math.max(0, k); }
function drawFx(f) {
  if (f.age < 0) return; const F = AS.FX[f.kind], im = img.fx[f.kind];
  let i = Math.floor(f.age / f.fps); if (f.loop) i = (i + f.phase) % F.n; else if (i >= F.n) { if (f.hold) i = F.n - 1; else return; }
  let sy = f.sy, al = f.alpha;
  if (f.grow && f.age < f.grow) sy *= ease.out(f.age / f.grow);
  const rest = f.life - f.age; if (f.fade && rest < f.fade) { const k = rest / f.fade; sy *= f.loop ? k : 1; al *= Math.min(1, k * 1.5); }
  const bs = f.scale * (BOOST[f.kind] || 1), w = Math.round(F.w * bs), h = Math.round(F.h * bs * sy);
  if (w < 1 || h < 1) return;
  let x = Math.round(f.x + (f.follow ? enemy.kb : 0) - w / 2); const y = Math.round(f.anchor === 'center' ? f.y - h / 2 : f.y - h);
  ctx.imageSmoothingEnabled = true; ctx.save(); if (f.flip) { ctx.translate(2 * x + w, 0); ctx.scale(-1, 1); }
  const tk = f.tint && f.el ? f.kind + '|' + f.el : null, bt = tk && img.fxT && img.fxT[tk];
  const src = bt ? bt[0] : im, glow = bt ? bt[1] : img.fxG && img.fxG[f.kind];
  const tf = f.tint && !bt ? f.tint + ' ' : '';
  if ((SHAD.has(f.kind) && f.kind !== 'sheal') || NORMAL.has(f.kind) || f.tint) {   // shadow (and the sun, so its red detail survives): the darkness stays dark, the violet edges glow
    ctx.globalAlpha = Math.max(0, al); if (tf) ctx.filter = f.tint; ctx.drawImage(src, i * F.w, 0, F.w, F.h, x, y, w, h);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.max(0, al) * (f.tint ? .14 + (f.glow || 0) * .2 : .35 + (f.glow || 0) * .4); ctx.filter = tf + 'blur(9px)';
  } else {                  // fire: additive light
    const ha = HALPHA[f.kind] ?? 1, gk = HOLY.has(f.kind) ? .45 : 1;   // holy light is softer so the characters inside it stay visible
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.max(0, al) * .95 * ha; if (tf) ctx.filter = f.tint; ctx.drawImage(src, i * F.w, 0, F.w, F.h, x, y, w, h);
    ctx.globalAlpha = Math.max(0, al) * (.3 + (f.glow || 0) * .35) * ha * gk; ctx.filter = tf + 'blur(10px)';
  }
  const gx = w * .12, gy = h * .12;
  if (!LITE) { if (glow) { const gw = glow.width / F.n; ctx.filter = 'none'; ctx.drawImage(glow, i * gw, 0, gw, glow.height, x - gx, y - gy, w + gx * 2, h + gy * 2); }
    else ctx.drawImage(src, i * F.w, 0, F.w, F.h, x - gx, y - gy, w + gx * 2, h + gy * 2); }
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false; ctx.restore();
}
function groundFire(x, scale, life) {
  fire(Math.random() < .5 ? 'g1' : 'g2', x + rnd(-2, 2), FLOOR + 3, { loop: true, scale, life: life || rnd(1700, 2300), fps: 75, lights: true, layer: Math.random() < .45 ? 'back' : 'front' });
  scorch.push({ x, w: rnd(9, 13), age: 0, life: 3200 });
}
function darkPool(x, R, life) { const p = { x, R, age: 0, life, grow: Math.min(700, life * .25), ph: Math.random() * 6 }; pools.push(p); return p; }
function lightPool(x, R, life) { const p = { x, R, age: 0, life, grow: Math.min(500, life * .2), ph: Math.random() * 6, light: true }; pools.push(p); return p; }
function lilySprout(x, scale, life) { return fire('lily', x + rnd(-3, 3), FLOOR + 5, { loop: true, scale, life, fps: 110, layer: Math.random() < .45 ? 'back' : 'front', glow: .2, lights: true }); }
function holyTrail(x) { lightPool(x, rnd(24, 34), rnd(1600, 2200)); lilySprout(x, rnd(.55, .8), rnd(1500, 2100));
  for (let i = 0; i < 3; i++) ember(x + rnd(-10, 10), FLOOR - rnd(0, 30), { pal: 'light', vy: rnd(-1.4, -.4), life: rnd(600, 1100) }); }
function trailFX(x, back) { if (isNew(hero)) elemTrail(CH[hero.cid].el, x); else if (hero.cid === 'J') groundFire(x, back ? rnd(.38, .5) : rnd(.5, .7), back ? rnd(900, 1300) : undefined); else if (isEmi(hero)) holyTrail(x); else shadowTrail(x); }
function feather(x, y, vx, vy) { parts.push({ t: 'feather', x, y, px: x, py: y, vx, vy, g: .025, drag: .975, life: rnd(1400, 2400), age: 0, rot: rnd(0, 6), vr: rnd(-.08, .08), ph: rnd(0, 6) }); }
function glide(x, ms, then) { trailing = x > hero.x ? 1 : -1; lastTrailX = hero.x; SFX.glide(); tween(hero, 'x', x, ms, 'inout'); later(ms, () => { trailing = 0; then && then(); }); }
function darkSprout(x, scale, life) { const k = ['tendril1', 'tendril2', 'bfire1', 'bfire2'][Math.random() * 4 | 0];
  fire(k, x + rnd(-3, 3), FLOOR + 4, { loop: true, scale, life, fps: 85, layer: Math.random() < .45 ? 'back' : 'front', glow: .3 }); }
function shadowTrail(x) {
  darkPool(x, rnd(26, 36), rnd(1800, 2400)); darkSprout(x, rnd(.55, .8), rnd(1700, 2300));
  for (let i = 0; i < 2; i++) smoke(x + rnd(-8, 8), FLOOR - rnd(4, 20), .8, '#1a0a28');
  for (let i = 0; i < 2; i++) ember(x + rnd(-10, 10), FLOOR - rnd(0, 30), { pal: 'shadow', vy: rnd(-1.2, -.3), life: rnd(600, 1100) });
}
function drawPools() {
  for (const p of pools) { const k = Math.min(1, p.age / p.grow), out = Math.min(1, (p.life - p.age) / 500), r = p.R * ease.out(k), wob = 1 + .04 * Math.sin(p.age / 260 + p.ph);
    if (r < 2) continue;
    if (p.el) { const e = ELS[p.el]; ctx.globalCompositeOperation = e.dark ? 'source-over' : 'lighter'; ctx.globalAlpha = (e.dark ? .5 : .3) * out; ctx.drawImage(softTint(e.pool), p.x - r * 1.25 * wob, FLOOR + 2 - r * .42, r * 2.5 * wob, r * .84);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .5 * out; ctx.strokeStyle = e.col; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(p.x, FLOOR + 2, r * .95 * wob, r * .26, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; continue; }
    if (p.light) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .55 * out; ctx.drawImage(softTint('#ffdf8a'), p.x - r * 1.25 * wob, FLOOR + 2 - r * .42, r * 2.5 * wob, r * .84);
      ctx.globalAlpha = .6 * out; ctx.strokeStyle = '#fff1c4'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(p.x, FLOOR + 2, r * .95 * wob, r * .26, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; continue; } ctx.globalAlpha = .82 * out; ctx.drawImage(softTint('#04010a'), p.x - r * 1.25 * wob, FLOOR + 2 - r * .42, r * 2.5 * wob, r * .84);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .45 * out; ctx.strokeStyle = '#8c4dff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(p.x, FLOOR + 2, r * .95 * wob, r * .26, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; }
  ctx.globalAlpha = 1;
}
function num0(v, x, y, big, delay = 0, kind) { later(delay, () => nums.push({ v, x: x + rnd(-6, 6), y: y + rnd(-4, 4), age: 0, big, kind })); }
function banner(text, ms = 1500) { fxState.banner = { text, age: 0, life: ms }; }
const PAL = { ice: ['#ffffff', '#e0f6ff', '#9fdcff', '#5ab0ff'], elec: ['#ffffff', '#fff8b0', '#ffe44a', '#ffb800'], wind: ['#f4fff4', '#c8f7d2', '#7ee49a', '#44bf6a'],
  earth: ['#ffe8c4', '#e0a860', '#b07a3a', '#7a4e24'], mind: ['#ffffff', '#f2d8ff', '#cf98ff', '#9a58f2'], water: ['#ffffff', '#d8f2ff', '#8ad0ff', '#3c96e8'], metal: ['#ffffff', '#f0f4f8', '#c6d0d8', '#ffd890'], light: ['#ffffff', '#fff3c4', '#ffe08a', '#ffd36b'], fire: ['#fff1c4', '#ffd36b', '#ffa340', '#ff7a30'], shadow: ['#f3dcff', '#c99bff', '#9a5cff', '#6a2dd1'], heal: ['#ffffff', '#e6dcff', '#b9f5e6', '#c9b6ff'] };
function impactFX(o = {}) {
  const pal = o.pal || 'fire'; { const big = (o.power ?? 1) > 1.2; duck(big ? .22 : .5, big ? 1400 : 550); }
  fxState.hitstop = o.stop ?? 150; fxState.shake = reduce ? 0 : (o.shake ?? 260); fxState.shakeMag = o.mag ?? 5; fxState.flash = (o.flash ?? .9) * (ELS[pal] ? .36 : 1);
  fxState.flashCol = pal === 'shadow' ? '226,206,255' : ELS[pal] ? ELS[pal].fl : '255,236,206';
  fxState.chroma = reduce ? 0 : Math.min(ELS[pal] ? 360 : 900, o.chroma ?? 0); enemy.hit = 300; enemy.kb = o.kb ?? 22;
  if (pal === 'fire') enemy.burn = Math.max(enemy.burn, o.burn ?? 1500); else if (ELS[pal]) { enemy.etint = ELS[pal].col; enemy.et = Math.max(enemy.et || 0, o.curse ?? 1500); } else enemy.curse = Math.max(enemy.curse, o.curse ?? 1500);
  burstParticles(o.x ?? ENEMY, o.y ?? FLOOR - 62, o.power ?? 1, pal);
  if (o.streaks) for (let i = 0; i < o.streaks; i++) streaks.push({ x: o.x ?? ENEMY, y: o.y ?? FLOOR - 60, a: rnd(0, Math.PI * 2), len: rnd(60, 200), w: rnd(1, 3), age: 0, life: rnd(200, 380), col: pal === 'shadow' ? '226,200,255' : ELS[pal] ? ELS[pal].fl : '255,236,190' });
  tgtHurt();
}
function tick(x, y, pal = 'fire', mag = 3) { SFX.small(); enemy.hit = 160; fxState.shake = 160; fxState.shakeMag = mag; for (let q = 0; q < 18; q++) spark(x, y, .6, pal); orb(x, y, 50, 220, pal === 'shadow' ? '#b07aff' : ELS[pal] ? ELS[pal].col : '#ffb050'); tgtHurt(); }
function burnOnEnemy(ms) {
  for (const [dx, dy, sc] of [[-14, -54, .45], [12, -80, .4], [4, -24, .5]]) fire('g1', ENEMY + dx, FLOOR + dy, { loop: true, scale: sc, life: ms, fps: 80, follow: true, glow: .25 });
}

/* ---------- particles ---------- */
let parts = [], windOn = false;
const soft = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.4, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c; })();
const tinted = {}; function softTint(col) { if (tinted[col]) return tinted[col]; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.drawImage(soft, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, 64, 64); return tinted[col] = c; }
function ember(x, y, o = {}) { const P = PAL[o.pal || 'fire']; parts.push({ t: 'ember', x, y, px: x, py: y, vx: o.vx ?? rnd(-.4, .4), vy: o.vy ?? rnd(-1.6, -.5), g: o.g ?? -.004, drag: o.drag ?? .99, life: o.life ?? rnd(700, 1700), age: 0, c: P[Math.random() * 4 | 0], s: Math.random() < .25 ? 2 : 1.3, ph: Math.random() * 6 }); }
function spark(x, y, sp = 1, pal = 'fire') { const a = rnd(-Math.PI, Math.PI), v = rnd(3, 9) * sp, P = PAL[pal]; parts.push({ t: 'spark', x, y, px: x, py: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * .75 - 1, g: .16, drag: .94, life: rnd(260, 620), age: 0, c: P[Math.random() * 3 | 0] }); }
function smoke(x, y, s = 1, col = '#140a08') { parts.push({ t: 'smoke', x, y, vx: rnd(-.25, .25), vy: rnd(-.7, -.25), g: 0, drag: .995, life: rnd(1500, 2600), age: 0, r: rnd(18, 30) * s, gr: rnd(.02, .04) * s, col }); }
function orb(x, y, r, life = 420, col = '#ffb050') { parts.push({ t: 'orb', x, y, vx: 0, vy: 0, g: 0, drag: 1, life, age: 0, r, c: col }); }
function burstParticles(x, y, power = 1, pal = 'fire') {
  if (pal === 'mind') for (let i = 0; i < 10 * power; i++) card(x, y, rnd(-4, 4), rnd(-4, 1));
  const sh = pal === 'shadow';
  const li = pal === 'light' || !!ELS[pal]; orb(x, y, (ELS[pal] ? 80 : 120) * power, 380, sh ? '#9a5cff' : ELS[pal] ? ELS[pal].col : li ? '#ffe9a8' : '#ffd27a'); orb(x, y, (sh ? 30 : ELS[pal] ? 22 : 60) * power, 260, sh ? '#e2ccff' : '#ffffff');
  for (let i = 0; i < 70 * power; i++) spark(x, y, .7 + power * .3, pal);
  for (let i = 0; i < 50 * power; i++) ember(x + rnd(-40, 40) * power, y + rnd(-40, 40) * power, { pal, vx: rnd(-1.5, 1.5), vy: rnd(-2.6, -.4), life: rnd(900, 2200) });
  if (!li) for (let i = 0; i < 8 * power; i++) smoke(x + rnd(-40, 40) * power, y + rnd(-30, 20), .9 + power * .4, sh ? '#1a0a28' : '#140a08');
}
function stepParts(d) {
  const k = d / 16, wind = windOn ? .9 : 0;
  for (const p of parts) { p.age += d; p.px = p.x; p.py = p.y; p.vx = p.vx * Math.pow(p.drag, k) + (p.t === 'ember' ? Math.sin((p.ph += .08 * k)) * .04 + wind * .05 : 0); p.vy = p.vy * Math.pow(p.drag, k) + p.g * k; if (p.t === 'feather') { p.vx += Math.sin(p.ph += .06 * k) * .05 * k; p.rot += p.vr * k; } p.x += p.vx * k; p.y += p.vy * k; if (p.t === 'smoke') p.r += p.gr * d; }
  parts = parts.filter(p => p.age < p.life);
  for (const f of fxs) { if (f.age < 0 || !f.loop) continue; const sh = SHAD.has(f.kind), fireG = f.kind === 'g1' || f.kind === 'g2', ground = fireG || f.kind === 'lily' || (ELKIND[f.kind] && f.kind.endsWith('_g')), rate = ground ? .004 : .02;
    if (Math.random() < rate * d * f.scale) ember(f.x + (f.follow ? enemy.kb : 0) + rnd(-14, 14) * f.scale, f.y - rnd(20, 60) * f.scale, { pal: (f.el && ELS[f.el] ? f.el : ELKIND[f.kind]) || (f.kind === 'sheal' ? 'heal' : HOLY.has(f.kind) ? 'light' : sh ? 'shadow' : 'fire') });
    if ((fireG || f.kind === 'pillar' || f.kind === 'storm') && Math.random() < .0012 * d) smoke(f.x + rnd(-10, 10), f.y - 60 * f.scale, .7); }
  if (elRain && elRain.t > 0) { elRain.t -= d; if (Math.random() < d * .06) { const e = elRain.el, side = e === 'wind'; ember(side ? -10 : rnd(-20, W + 20), side ? rnd(40, FLOOR) : -10, { pal: e, vx: side ? rnd(3, 6) : rnd(-.5, .5), vy: side ? rnd(-.6, .4) : rnd(.6, 1.6), g: side ? 0 : .01, drag: 1, life: 2600 }); } }
  if (featherRain > 0) { featherRain -= d; if (Math.random() < d * .05) feather(rnd(-20, W + 20), -12, rnd(-.4, .4), rnd(.4, 1)); }
  if (windOn && Math.random() < d * .06) ember(-10, rnd(60, FLOOR), { vx: rnd(3, 5.5), vy: rnd(-.8, .2), g: -.002, drag: 1, life: 2000 });
}
function drawParts(kind) {
  for (const p of parts) { if ((p.t === 'smoke') !== (kind === 'smoke')) continue; const k = p.age / p.life;
    if (p.t === 'smoke') { ctx.globalAlpha = .28 * Math.sin(Math.PI * Math.min(1, k * 1.4)); ctx.drawImage(softTint(p.col), p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); continue; }
    ctx.globalCompositeOperation = 'lighter';
    if (p.t === 'orb') { ctx.globalAlpha = (1 - k) * .9; const r = p.r * (.6 + k * .6); ctx.drawImage(softTint(p.c), p.x - r, p.y - r, r * 2, r * 2); }
    else if (p.t === 'card') { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.max(0, Math.min(1, (1 - k) * 2.5)); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot += p.vr);
      ctx.fillStyle = '#1c0f2e'; ctx.fillRect(-4, -6, 8, 12); ctx.fillStyle = '#b07aff'; ctx.fillRect(-3, -5, 6, 10); ctx.fillStyle = '#f2e0ff'; ctx.fillRect(-1, -2, 2, 4); ctx.restore(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= .4; ctx.drawImage(softTint('#c890ff'), p.x - 8, p.y - 8, 16, 16); }
    else if (p.t === 'feather') { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.max(0, Math.min(1, (1 - k) * 2)); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = '#c9c2b4'; ctx.fillRect(-4, 0, 8, 2); ctx.fillStyle = '#ffffff'; ctx.fillRect(-4, -1, 7, 2); ctx.restore(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= .3; ctx.drawImage(softTint('#fff1c4'), p.x - 5, p.y - 5, 10, 10); }
    else if (p.t === 'shred') { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.max(0, 1 - k); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot += p.vr); ctx.fillStyle = p.c; ctx.fillRect(-p.s, -p.s / 3, p.s * 2, p.s * .7); ctx.restore(); }
    else { const fl = p.t === 'ember' ? .65 + .35 * Math.sin(p.age / 40 + p.ph * 3) : 1; ctx.globalAlpha = Math.max(0, (1 - k) * fl);
      ctx.strokeStyle = p.c; ctx.lineWidth = p.t === 'spark' ? 1.6 : p.s; ctx.beginPath(); ctx.moveTo(p.px - p.vx * (p.t === 'spark' ? 1.5 : 1), p.py - p.vy * (p.t === 'spark' ? 1.5 : 1)); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.globalAlpha *= .35; ctx.drawImage(softTint(p.c), p.x - 5, p.y - 5, 10, 10); }
    ctx.globalCompositeOperation = 'source-over'; }
  ctx.globalAlpha = 1;
}

/* ---------- light from effects on characters and the room ---------- */
const tintCv = document.createElement('canvas'); tintCv.__raw = true; tintCv.width = tintCv.height = 192; const tctx = tintCv.getContext('2d');
function lightAt(x) { let Lf = 0, Ls = 0, Lh = 0, Ll = 0, Le = 0, ec = null;
  for (const f of fxs) { const i = fxIntensity(f); if (!i) continue; const dx = (f.x + (f.follow ? enemy.kb : 0)) - x, v = i / (1 + (dx / 110) * (dx / 110));
    const ek = (f.el && ELS[f.el]) ? f.el : ELKIND[f.kind]; if (ek) { Le += v; ec = ELS[ek].col; } else if (f.kind === 'sheal') Lh += v; else if (HOLY.has(f.kind)) Ll += v; else if (SHAD.has(f.kind)) Ls += v; else Lf += v; }
  const fl = fxState.flash * .8, fc = fxState.flashCol, holy = fc.startsWith('255,246'), elf = Object.values(ELS).find(e => e.fl === fc); if (elf) { Le += fl; ec = ec || elf.col; } return { e: Math.min(1.2, Le), ec: ec || '#ffffff', f: Math.min(1.4, Lf + (fc.startsWith('226') || holy || elf ? 0 : fl)), s: Math.min(1.4, Ls + (fc.startsWith('226') ? fl : 0)), h: Math.min(1.2, Lh), l: Math.min(1.3, Ll + (holy ? fl : 0)) }; }
function roomLight() { let Lf = 0, Ls = 0, Ll = 0, Le = 0, ec = null; for (const f of fxs) { const i = fxIntensity(f) * .5; const ek = (f.el && ELS[f.el]) ? f.el : ELKIND[f.kind]; if (ek) { Le += i; ec = ELS[ek].col; } else if (HOLY.has(f.kind)) Ll += i; else if (SHAD.has(f.kind)) Ls += i; else Lf += i; } return { f: Math.min(.75, Lf), s: Math.min(1.2, Ls), l: Math.min(.8, Ll), e: Math.min(.7, Le), ec }; }
function tintPass(src, sx, sy, sw, sh, dx, dy, dw, dh, col, a) {
  if (a < .02 || LITE) return; tctx.clearRect(0, 0, 192, 192); tctx.globalCompositeOperation = 'source-over'; tctx.drawImage(src, sx, sy, sw, sh, 0, 0, dw, dh);
  tctx.globalCompositeOperation = 'source-atop'; tctx.fillStyle = col; tctx.fillRect(0, 0, dw, dh);
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * (.92 + .08 * Math.sin(performance.now() / 60)); ctx.drawImage(tintCv, 0, 0, dw, dh, dx, dy, dw, dh); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
function drawActor(a, opt = {}) {
  const C = CH[a.cid], im = img[a.cid][a.anim], ax = C.anch[a.anim] ?? 80, x = opt.x ?? a.x, f = opt.f ?? a.f, anim = opt.anim ?? a.anim;
  const kb = a === tgt ? enemy.kb : 0;
  ctx.save(); ctx.translate(Math.round(x + kb), Math.round(FLOOR - FR + 8 + a.y)); if (a.flip) ctx.scale(-1, 1);
  const src = img[a.cid][anim];
  if (opt.alpha != null) { ctx.globalAlpha = opt.alpha; ctx.filter = opt.tint || 'none'; ctx.drawImage(src, f * FR, 0, FR, FR, -C.anch[anim], 0, FR, FR); ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.restore(); return; }
  ctx.drawImage(src, f * FR, 0, FR, FR, -ax, 0, FR, FR);
  const L = lightAt(x + kb);
  tintPass(src, f * FR, 0, FR, FR, -ax, 0, FR, FR, '#ff7a2a', Math.min(.3, L.f * .22));
  tintPass(src, f * FR, 0, FR, FR, -ax, 0, FR, FR, '#9a5cff', Math.min(.42, L.s * .3));
  tintPass(src, f * FR, 0, FR, FR, -ax, 0, FR, FR, '#d9ccff', Math.min(.4, L.h * .3));
  tintPass(src, f * FR, 0, FR, FR, -ax, 0, FR, FR, '#fff0c0', Math.min(.22, L.l * .18));
  if (L.e > .02) tintPass(src, f * FR, 0, FR, FR, -ax, 0, FR, FR, L.ec, Math.min(.16, L.e * .13));
  if (a === ally && emiGlow > 0) tintPass(src, f * FR, 0, FR, FR, -ax, 0, FR, FR, '#fff4c8', .18 * Math.min(1, emiGlow / 400));
  if (a === ally && allyCurse > 0) { ctx.globalAlpha = .35; ctx.filter = 'brightness(.2) sepia(1) hue-rotate(220deg) saturate(3)'; ctx.drawImage(src, f * FR, 0, FR, FR, -ax, 0, FR, FR); ctx.filter = 'none'; ctx.globalAlpha = 1; }
  tintPass(src, f * FR, 0, FR, FR, -ax, 0, FR, FR, STAGES[stageI].amb, STAGES[stageI].ambA);
  tintPass(src, f * FR, 0, FR, FR, -ax, 0, FR, FR, '#ff5a1a', fxState.inferno * .08);
  if (a === tgt) {
    if (enemy.et > 0) tintPass(src, f * FR, 0, FR, FR, -ax, 0, FR, FR, enemy.etint, .22 + .08 * Math.sin(performance.now() / 60));
    if (enemy.burn > 0) tintPass(src, f * FR, 0, FR, FR, -ax, 0, FR, FR, '#ff5a1a', .2 + .1 * Math.sin(performance.now() / 45));
    if (enemy.curse > 0) { ctx.globalAlpha = .3; ctx.filter = 'brightness(.2) sepia(1) hue-rotate(220deg) saturate(3)'; ctx.drawImage(src, f * FR, 0, FR, FR, -ax, 0, FR, FR); ctx.filter = 'none'; ctx.globalAlpha = 1; }
    if (enemy.hit > 0 && Math.floor(enemy.hit / 50) % 2 === 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .7; ctx.drawImage(src, f * FR, 0, FR, FR, -ax, 0, FR, FR); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
  }
  ctx.restore();
}

/* ---------- moves shared by skills ---------- */
function dashTo(x, ms, then) { play('dash', CH[hero.cid].dashF, 60, { loop: true }); trailing = 1; lastTrailX = hero.x; SFX.dash(); if (hero.cid === 'J') groundFire(hero.x, .6); else shadowTrail(hero.x);
  tween(hero, 'x', x, ms, 'inout'); later(ms, () => { trailing = 0; if (hero.cid === 'J') groundFire(hero.x + 6, .75); then && then(); }); }
function dashHome(then) { play('dash', [...CH[hero.cid].dashF].reverse(), 70, { loop: true }); trailing = -1; lastTrailX = hero.x; SFX.back();
  tween(hero, 'x', HOME, 420, 'out'); later(420, () => { trailing = 0; idlePose(); then && then(); }); }
function done() { speed = 1.6; sitDown(hero, () => { speed = 1; busy = false; idleT = 0; finishPlay(); }); }

/* ---------- skills ---------- */
const SKILLS = {
J: [

 { name: 'Ember Slash', tag: '20 SP · Fire', run() {
    banner('Ember Slash'); dashTo(STRIKE, 360, () => {
      play('atk', range(1, 12), [80, 80, 90, 150, 60, 70, 90, 90, 90, 90, 100, 120], { on: {
        2: () => SFX.ignite(), 5: () => { SFX.swing(); voice('v_yell'); },
        6: () => { SFX.hit(); impactFX({ chroma: 120 }); tween(fxState, 'inferno', .3, 120); later(500, () => tween(fxState, 'inferno', 0, 800)); fire('slash', ENEMY - 10, FLOOR - 58, { anchor: 'center', fps: 55, glow: .45 }); fire('burst', ENEMY, FLOOR - 62, { anchor: 'center', fps: 60, delay: 40, glow: .5 });
          for (const [dx, sc] of [[-22, .7], [4, .9], [26, .7]]) fire('g2', ENEMY + dx, FLOOR + 4, { loop: true, scale: sc, life: 1600, fps: 60, follow: true, lights: true });
          burnOnEnemy(1800); num(612, ENEMY - 4, FLOOR - 110, true); num(48, ENEMY - 44, FLOOR - 96, false, 700); num(48, ENEMY + 40, FLOOR - 84, false, 1350); later(700, () => tick(ENEMY, FLOOR - 70)); later(1350, () => tick(ENEMY, FLOOR - 70)); } } });
      later(1020, () => dashHome(done)); }); } },
 { name: 'Flame Break', tag: '35 SP · Fire', run() {
    banner('Flame Break'); dashTo(260, 260, () => {
      play('fb', range(0, 12), [90, 80, 80, 80, 80, 90, 120, 70, 70, 80, 90, 100, 140], { on: {
        3: () => SFX.ignite(),
        7: () => { SFX.swing(); SFX.roar(1.6); fxState.shake = 200; fxState.shakeMag = 3;
          const w = fire('wave', 300, FLOOR + 4, { loop: true, scale: 1.25, life: 520, fps: 60, lights: true, grow: 80, fade: 120 });
          tween(w, 'x', ENEMY - 30, 420, 'in'); let gx = 300;
          for (let k = 0; k < 8; k++) later(k * 50, () => { gx = 300 + (ENEMY - 330) * ease.in(k / 8); groundFire(gx, rnd(.55, .75), rnd(1900, 2500)); });
          later(420, () => { SFX.hit(); impactFX({ chroma: 220, streaks: 10, flash: .7, power: 1.3 }); tween(fxState, 'inferno', .5, 150); later(1100, () => tween(fxState, 'inferno', 0, 900));
            fire('burst', ENEMY, FLOOR - 70, { anchor: 'center', fps: 60, glow: .5 });
            fire('pillar', ENEMY, FLOOR + 6, { loop: true, scale: 1.35, life: 1500, fps: 65, grow: 220, follow: true, lights: true, glow: .45 });
            burnOnEnemy(2200);
            [[402, 0], [418, 260], [455, 520], [1210, 900]].forEach(([v, t], i) => { num(v, ENEMY + (i % 2 ? 30 : -30), FLOOR - 120 - i * 14, i === 3, t); if (i) later(t, () => { SFX.small(); enemy.hit = 160; tgtHurt(); fxState.shake = 140; fxState.shakeMag = 3; for (let q = 0; q < 18; q++) spark(ENEMY, FLOOR - 70, .6); orb(ENEMY, FLOOR - 70, 50, 220); }); });
          }); } } });
      later(1900, () => dashHome(done)); }); } },
 { name: 'Scorch Drive', tag: '55 SP · Fire · Heavy', run() {
    banner('Scorch Drive'); tween(fxState, 'dim', .6, 300); tween(fxState, 'inferno', .3, 900); tween(cam, 'z', 1.18, 700, 'inout'); cam.fx = HOME + 30; cam.fy = FLOOR - 70;
    const aura = fire('aura', HOME, FLOOR + 24, { loop: true, scale: 1.15, life: 1250, fps: 60, layer: 'back', lights: true, grow: 300, glow: .5 });
    play('sc', [0, 1, 2, 3, 4, 3, 4, 3, 4], [90, 110, 110, 110, 120, 110, 110, 110, 120]); SFX.charge(1.1);
    fxState.shake = 1100; fxState.shakeMag = 1.5;
    for (let q = 0; q < 70; q++) later(q * 14, () => { const a = rnd(0, Math.PI * 2), r = rnd(70, 120); ember(HOME + Math.cos(a) * r, FLOOR - 60 + Math.sin(a) * r * .6, { vx: -Math.cos(a) * 2.2, vy: -Math.sin(a) * 1.4, g: 0, drag: .97, life: 600 }); });
    later(1000, () => {
      tween(cam, 'z', 1, 160, 'out'); trailing = 1; lastTrailX = hero.x; SFX.dash(); voice('v_aiyah');
      play('sc', range(7, 12), [60, 140, 140, 120, 120, 140]); tween(hero, 'x', STRIKE + 10, 150, 'in');
      later(150, () => { trailing = 0; SFX.boom();
        impactFX({ stop: 230, shake: 520, mag: 8, flash: 1, chroma: 520, streaks: 22, kb: 34, burn: 2200, power: 1.7 }); tween(fxState, 'inferno', .65, 120); later(900, () => tween(fxState, 'inferno', 0, 1000));
        for (let k = 0; k < 10; k++) later(k * 35, () => { groundFire(ENEMY - 30 - k * 24, rnd(.5, .7), rnd(1800, 2400)); groundFire(ENEMY + 30 + k * 14, rnd(.5, .7), rnd(1800, 2400)); });
        cam.fx = ENEMY; cam.fy = FLOOR - 70; tween(cam, 'z', 1.28, 90, 'out'); later(260, () => tween(cam, 'z', 1, 600, 'inout'));
        fire('burst', ENEMY, FLOOR - 64, { anchor: 'center', fps: 55, scale: 1.3, glow: .6 });
        fire('blast', ENEMY + 6, FLOOR + 10, { fps: 85, scale: 1.25, glow: .45, delay: 60, follow: true });
        for (const dx of [-60, -30, 30, 62]) groundFire(ENEMY + dx, rnd(.6, .85), rnd(2000, 2600));
        burnOnEnemy(2400); num(1486, ENEMY, FLOOR - 140, true, 80); num(88, ENEMY - 46, FLOOR - 92, false, 900); num(88, ENEMY + 44, FLOOR - 84, false, 1500);
        later(900, () => tick(ENEMY, FLOOR - 70)); later(1500, () => tick(ENEMY, FLOOR - 70)); tween(fxState, 'dim', 0, 900);
      });
      later(1150, () => dashHome(done)); }); } },
 { name: 'Burning Cover', tag: '30 SP · Fire · Guard', run() {
    banner('Burning Cover'); tween(hero, 'x', HOME + 36, 260, 'out'); play('gd', range(0, 8), [80, 80, 80, 90, 90, 120, 140, 160, 600], { on: {
      3: () => { SFX.shield(); SFX.roar(2.4); tween(fxState, 'inferno', .25, 300); later(2000, () => tween(fxState, 'inferno', 0, 700));
        fire('wall', HOME + 140, FLOOR + 6, { loop: true, scale: 1.25, sy: 1.1, life: 2600, fps: 70, grow: 320, lights: true, glow: .45 });
        for (const dx of [104, 126, 152, 176]) fire('g2', HOME + dx, FLOOR + 4, { loop: true, scale: rnd(.55, .75), life: 2600, fps: 70, lights: true, grow: 260 });
        fxState.buff = { age: 0, life: 2400 }; } } });
    later(2700, () => { tween(hero, 'x', HOME, 300, 'inout'); later(300, () => { idlePose(); done(); }); }); } },
 { name: 'Crimson Verdict', tag: 'ULTIMATE · Sync 100', ult: true, run() {
    // act 1: black bars close in, the room starts to bake, the cut-in
    tween(fxState, 'letter', 1, 400); tween(fxState, 'dim', .62, 500); tween(fxState, 'inferno', .25, 900); SFX.hum(6.5);
    SFX.cutin(); fxState.cutin = { age: 0, life: 1250, title: 'CRIMSON VERDICT', sub: 'JUN KISARAGI · ULTIMATE', col: 'rgba(190,24,30,.92)', img: 'portraitJ' };
    let sw = null;
    later(1250, () => {
      banner('Crimson Verdict', 1500);
      // act 2: the verdict is written. A fire sigil spins up behind Jun, another writes itself under the enemy, and a crimson sun tears open the sky
      play('ult', range(0, 9), [120, 120, 130, 160, 180, 200, 220, 240, 260, 280]); SFX.charge(2.4);
      fire('aura', HOME, FLOOR + 24, { loop: true, scale: 1.1, life: 4300, fps: 60, layer: 'back', lights: true, grow: 300, glow: .3, alpha: .6 });
      const sb = { x: HOME - 4, y: FLOOR - 92, s: 0, flat: 1, rot: 0, spin: .9, a: .7, rev: 1, pulse: 0 }; sigils.push(sb); tween(sb, 's', 1.15, 600, 'out');
      const sf = { x: ENEMY, y: FLOOR + 4, s: 1.9, flat: .3, rot: 0, spin: -.6, a: 1, rev: 0, pulse: .4 }; sigils.push(sf); tween(sf, 'rev', 1, 1100, 'inout');
      for (let r = 0; r < 8; r++) later(200 + r * 120, () => { SFX.rune(); if (r !== 3 && r !== 4) groundFire(ENEMY - 150 + r * 43, rnd(.45, .6), 4000); });
      const sun = fire('sun', ENEMY - 40, 20, { anchor: 'center', loop: true, scale: .2, life: 3400, fps: 90, layer: 'back', grow: 1, fade: 300, glow: .25, lights: true });
      tween(sun, 'scale', 1.0, 1400, 'out'); tween(sun, 'y', 82, 1400, 'out');
      later(300, () => { SFX.roar(2.5); tween(fxState, 'inferno', .55, 1400); windOn = true; });
      cam.fx = W / 2 + 60; cam.fy = 150; tween(cam, 'z', 1.08, 2200, 'inout');
      later(330, () => tween(hero, 'y', -22, 400, 'out'));
      // fire floods the whole hall outward from Jun
      for (let q = 0; q < 18; q++) later(500 + q * 60, () => { const x = HOME + 50 + (q / 18) * (W - HOME) + rnd(-10, 10); if (Math.abs(x - ENEMY) > 36) groundFire(x, rnd(.45, .7), rnd(2900, 3600)); if (q < 4) groundFire(HOME - 50 - q * 26, rnd(.4, .55), 3200); });
      for (let q = 0; q < 110; q++) later(q * 20, () => ember(rnd(0, W), FLOOR - rnd(0, 20), { vy: rnd(-3.2, -1.2), life: rnd(900, 1600) }));
      // act 3: the sentence. Both sigils flare, pillars of fire ring the enemy, a giant blade forms inside the sun
      later(1800, () => { SFX.gong(); fxState.flash = .4; fxState.flashCol = '255,236,206'; fxState.shake = 320; fxState.shakeMag = 3; sb.pulse = 1; sf.pulse = 1; tween(cam, 'z', 1, 500, 'out');
        for (const dx of [-150, -75, 75, 150]) fire('pillar', ENEMY + dx, FLOOR + 6, { loop: true, scale: rnd(.85, 1.05), life: 2300, fps: 65, grow: 220, lights: true, delay: rnd(0, 200) });
        sw = fire('bigsword', ENEMY - 40, 120, { loop: true, scale: .4, life: 1800, fps: 70, glow: .6, grow: 1, fade: 200 }); tween(sw, 'scale', 1.6, 500, 'out'); SFX.ignite(); });
      // act 4: Jun swings down; the sun and the blade fall as one, and the moment burns away
      later(2900, () => { SFX.fall(); voice('v_aiyah', { vol: .9 }); play('ult', [10, 11, 12], [90, 160, 900]); tween(hero, 'y', 0, 240, 'in');
        tween(sw, 'y', FLOOR + 30, 300, 'in'); tween(sun, 'y', FLOOR - 70, 300, 'in'); tween(sun, 'x', ENEMY, 300, 'in'); tween(sun, 'scale', .55, 300, 'in');
        later(270, () => { burnNext = true; });
        later(300, () => { SFX.boom(); later(130, SFX.boom); later(260, () => SFX.sizzle(2));
          sun.fade = 200; sun.life = sun.age + 200; sf.pulse = 1.6; tween(sf, 'a', 0, 1800); tween(sb, 'a', 0, 500);
          impactFX({ stop: 300, shake: 900, mag: 11, flash: 1, chroma: 950, streaks: 36, kb: 34, burn: 3200, power: 2.6 });
          cam.fx = ENEMY - 40; cam.fy = FLOOR - 80; tween(cam, 'z', 1.3, 100, 'out'); later(450, () => tween(cam, 'z', 1, 1000, 'inout'));
          fire('blast', ENEMY, FLOOR + 12, { fps: 90, scale: 1.6, glow: .45 }); fire('burst', ENEMY, FLOOR - 62, { anchor: 'center', fps: 50, scale: 2 });
          fire('storm', ENEMY, FLOOR - 70, { loop: true, anchor: 'center', scale: 1.7, life: 1700, fps: 55, glow: .5, grow: 200 });
          for (const dx of [-180, -120, -60, 60, 120, 180]) fire('pillar', ENEMY + dx, FLOOR + 6, { loop: true, scale: rnd(.8, 1.1), life: 2000, fps: 65, grow: 200, lights: true, delay: rnd(0, 250) });
          for (let k = 0; k < 9; k++) groundFire(ENEMY - 200 + k * 48, rnd(.55, .8), rnd(2400, 3000));
          burnOnEnemy(3000);
          [[1104, 0], [1188, 220], [1236, 440], [1302, 660], [3870, 1050]].forEach(([v, t], i) => { num(v, ENEMY + [-50, 40, -30, 50, 0][i], FLOOR - 124 - [0, 18, 34, 10, 48][i], i === 4, t + 60); if (i) later(t, () => tick(ENEMY, FLOOR - 80, 'fire', 5)); });
          later(1600, () => { tween(fxState, 'inferno', 0, 1400); tween(fxState, 'dim', 0, 1200); windOn = false; });
          later(2600, () => tween(fxState, 'letter', 0, 500)); later(2900, () => { sigils = []; idlePose(); done(); });
        }); }); }); } },
],
K: [
 { name: 'Hex Thorn', tag: '20 SP · Shadow', run() {
    banner('Hex Thorn'); dashTo(ENEMY - 180, 300, () => {
      play('hex', range(1, 12), [70, 60, 60, 55, 55, 55, 60, 90, 60, 160, 110, 120], { on: {
        1: () => SFX.whirl(), 4: () => SFX.whirl(), 8: () => SFX.swing(),
        9: () => { SFX.chain(); SFX.dark(); impactFX({ pal: 'shadow', chroma: 200, curse: 1800, power: 1.2 });
          tween(fxState, 'despair', .45, 200); later(1300, () => tween(fxState, 'despair', 0, 800));
          darkPool(ENEMY, 95, 2600);
          fire('sburst', ENEMY, FLOOR - 64, { anchor: 'center', fps: 55, glow: .5 });
          fire('sthorn', ENEMY, FLOOR + 10, { fps: 70, scale: 1.25, delay: 60, follow: true, hold: 300 });
          fire('hands', ENEMY + 4, FLOOR + 12, { loop: true, scale: .85, life: 1500, fps: 80, grow: 220, follow: true, delay: 120 });
          for (const dx of [-70, -40, 38, 72]) darkSprout(ENEMY + dx, rnd(.8, 1.1), rnd(1800, 2500));
          num(540, ENEMY - 4, FLOOR - 120, true); num(36, ENEMY - 46, FLOOR - 96, false, 700); num(36, ENEMY + 40, FLOOR - 86, false, 1350);
          later(700, () => tick(ENEMY, FLOOR - 70, 'shadow')); later(1350, () => tick(ENEMY, FLOOR - 70, 'shadow')); } } });
      later(1180, () => dashHome(done)); }); } },
 { name: 'Shadow Bind', tag: '34 SP · Shadow · Answer time −4s', run() {
    banner('Shadow Bind'); darkPool(hero.x + 10, 60, 2400);
    play('bind', range(1, 12), [70, 70, 70, 90, 90, 90, 110, 110, 110, 120, 110, 120], { on: {
      1: () => SFX.swing(),
      2: () => { chainShot = { age: 0, life: 1700 }; SFX.chain(.8);
        for (let q = 0; q < 8; q++) later(q * 18, () => darkSprout(hero.x + 60 + q * 36, rnd(.6, .8), rnd(1500, 2000)));
        later(150, () => { SFX.chain(); SFX.dark(); impactFX({ pal: 'shadow', stop: 90, shake: 160, mag: 3, flash: .35, kb: 6, power: .7, curse: 2300 });
          tween(fxState, 'despair', .5, 300); later(1700, () => tween(fxState, 'despair', 0, 800));
          darkPool(ENEMY, 100, 2400);
          fire('hands', ENEMY, FLOOR + 12, { loop: true, scale: 1, life: 2000, fps: 80, grow: 260, follow: true });
          fire('scoil', ENEMY, FLOOR - 64, { anchor: 'center', loop: true, scale: 1.05, life: 2000, fps: 70, follow: true, grow: 220, glow: .5 });
          num(318, ENEMY, FLOOR - 128, true); fxState.debuff = { text: 'ANSWER TIME −4s', age: 0, life: 2000 }; }); },
      5: () => { SFX.yank(); fxState.shake = 220; fxState.shakeMag = 4; enemy.kb = -16; tgtHurt(); for (let q = 0; q < 24; q++) spark(ENEMY, FLOOR - 64, .5, 'shadow'); } } });
    later(2050, done); } },
 { name: 'Curse Bloom', tag: '40 SP · Shadow · Heavy', run() {
    banner('Curse Bloom'); tween(fxState, 'dim', .55, 300); tween(fxState, 'despair', .4, 400); dashTo(300, 240, () => {
      play('bloom', range(1, 12), [70, 60, 55, 50, 50, 50, 90, 140, 110, 110, 110, 140], { on: {
        1: () => SFX.whirl(), 3: () => SFX.whirl(), 5: () => SFX.whirl(),
        7: () => { SFX.slam(); SFX.tide(); fxState.shake = 260; fxState.shakeMag = 6;
          const t = fire('darktide', 350, FLOOR + 6, { loop: true, scale: 1.2, life: 560, fps: 60, grow: 80, fade: 140, layer: 'front' }); tween(t, 'x', ENEMY - 40, 460, 'in');
          for (let q = 0; q < 9; q++) later(q * 50, () => { const x = 350 + (ENEMY - 380) * ease.in(q / 9); darkPool(x, 50, 2800); darkSprout(x, rnd(.7, 1), rnd(2200, 2900)); });
          later(460, () => { fire('sflower', ENEMY, FLOOR + 16, { fps: 100, scale: 1.5, hold: 900, follow: true, glow: .5 }); darkPool(ENEMY, 130, 3200); });
          later(900, () => { SFX.dark(); SFX.boom(); tween(fxState, 'despair', .85, 200);
            impactFX({ pal: 'shadow', x: ENEMY, y: FLOOR - 50, stop: 230, shake: 540, mag: 8, flash: .35, chroma: 520, streaks: 22, kb: 28, power: 1.2, curse: 2600 });
            cam.fx = ENEMY; cam.fy = FLOOR - 70; tween(cam, 'z', 1.25, 90, 'out'); later(260, () => tween(cam, 'z', 1, 600, 'inout'));
            fire('sthorn', ENEMY, FLOOR + 12, { fps: 65, scale: 1.7, follow: true, hold: 420 }); fire('sthorn', ENEMY - 62, FLOOR + 12, { fps: 65, scale: 1.1, delay: 80, hold: 360 }); fire('sthorn', ENEMY + 60, FLOOR + 12, { fps: 65, scale: 1.1, delay: 140, hold: 360 });
            fire('miasma', ENEMY, FLOOR + 14, { loop: true, scale: 1.1, life: 1700, fps: 70, grow: 260, follow: true, delay: 120 });
            fire('hands', ENEMY - 40, FLOOR + 12, { loop: true, scale: .8, life: 1600, fps: 80, grow: 200, delay: 200 }); fire('hands', ENEMY + 46, FLOOR + 12, { loop: true, scale: .75, life: 1500, fps: 80, grow: 200, delay: 300 });
            fire('sburst', ENEMY, FLOOR - 60, { anchor: 'center', fps: 55, scale: 1.05, glow: .25 });
            num(1318, ENEMY, FLOOR - 146, true, 60); num(66, ENEMY - 46, FLOOR - 92, false, 900); num(66, ENEMY + 44, FLOOR - 84, false, 1500);
            later(900, () => tick(ENEMY, FLOOR - 70, 'shadow')); later(1500, () => tick(ENEMY, FLOOR - 70, 'shadow')); }); } } });
      later(2600, () => { tween(fxState, 'dim', 0, 700); tween(fxState, 'despair', 0, 900); dashHome(done); }); }); } },
 { name: 'Dark Mend', tag: '32 SP · Shadow · Heal', run() {
    banner('Dark Mend'); darkPool(hero.x, 70, 2200); for (const dx of [-30, 30]) darkSprout(hero.x + dx, .7, 1900);
    play('mend', range(0, 8), [90, 100, 110, 140, 160, 180, 180, 150, 130], { on: {
      2: () => { SFX.heal(); SFX.chain(.4);
        fire('sheal', hero.x + 6, FLOOR + 8, { loop: true, scale: .75, life: 1500, fps: 80, layer: 'back', glow: .4 });
        for (let q = 0; q < 44; q++) later(q * 22, () => ember(hero.x + 30 + rnd(-6, 6), FLOOR - 92 + rnd(-6, 6), { pal: 'heal', vx: rnd(-3.4, -2.2), vy: rnd(-1.1, .4), g: .01, drag: .985, life: 700 }));
        later(380, () => { fire('sheal', EMI_X, FLOOR + 8, { loop: true, scale: 1.1, life: 1800, fps: 80, grow: 260, glow: .3, alpha: .8 }); });
        later(820, () => { SFX.chime(); emiGlow = 1300; num('+420', EMI_X + 34, FLOOR - 150, true, 0, 'heal'); for (let q = 0; q < 30; q++) ember(EMI_X + rnd(-24, 24), FLOOR - rnd(10, 110), { pal: 'heal', vy: rnd(-1.6, -.6), life: rnd(800, 1500) }); }); } } });
    later(1900, done); } },
 { name: 'Midnight Collapse', tag: 'ULTIMATE · Sync 100', ult: true, run() {
    // act 1: the world loses its colour, black bars close in, the cut-in
    tween(fxState, 'letter', 1, 400); tween(fxState, 'despair', 1, 900); tween(fxState, 'dim', .7, 600); SFX.hum(7.5);
    SFX.cutin(); fxState.cutin = { age: 0, life: 1250, title: 'MIDNIGHT COLLAPSE', sub: 'KURO AMANE · DISCIPLINE COMMITTEE', col: 'rgba(52,16,104,.95)', img: 'portraitK' };
    later(1250, () => {
      banner('Midnight Collapse', 1500);
      // act 2: an eclipsed moon rises behind the throne, a clock face swims into view over it
      moon = { x: W / 2 + 40, y: H + 140, s: 1.75, a: 0, clock: 0, min: 270, crack: 0 };
      tween(moon, 'y', 112, 1500, 'out'); tween(moon, 'a', 1, 900);
      cam.fx = W / 2 + 60; cam.fy = 170; tween(cam, 'z', 1.08, 2800, 'inout');
      play('ult', range(0, 8), [200, 200, 220, 240, 260, 280, 300, 320, 340]);
      fire('aura', hero.x, FLOOR + 24, { loop: true, scale: 1.1, life: 3400, fps: 70, layer: 'back', grow: 400, glow: 0, alpha: 0 });
      darkPool(hero.x, 80, 5600); for (const dx of [-40, 36]) darkSprout(hero.x + dx, .9, 5200);
      later(800, () => tween(moon, 'clock', .85, 500));
      for (let s = 0; s < 12; s++) later(1350 + s * 125, () => { moon.min = 270 + (s + 1) * 7.5; SFX.tickc(); });
      // act 3: midnight strikes, darkness floods the hall from both sides
      later(2900, () => { SFX.bell(); fxState.flash = .45; fxState.flashCol = '226,206,255'; moon.crack = 1; fxState.shake = 300; fxState.shakeMag = 3;
        tween(cam, 'z', 1, 500, 'out');
        const l = fire('darktide', -60, FLOOR + 8, { loop: true, scale: 1.35, life: 900, fps: 55, grow: 60, fade: 200 }); tween(l, 'x', ENEMY - 110, 650, 'in');
        const r = fire('darktide', W + 60, FLOOR + 8, { loop: true, scale: 1.35, life: 900, fps: 55, grow: 60, fade: 200, flip: true }); tween(r, 'x', ENEMY + 90, 650, 'in');
        SFX.tide(); later(200, () => SFX.tide());
        for (let q = 0; q < 26; q++) later(q * 28, () => { const x = 30 + Math.random() * (W - 60); darkPool(x, rnd(40, 80), 4200); darkSprout(x, rnd(.7, 1.2), rnd(3300, 4300)); });
        later(380, () => { fire('miasma', ENEMY, FLOOR + 16, { loop: true, scale: 1.25, life: 1500, fps: 70, grow: 300, follow: true });
          for (const [dx, sc, dl] of [[-62, .9, 0], [0, 1.15, 120], [64, .9, 220]]) fire('hands', ENEMY + dx, FLOOR + 14, { loop: true, scale: sc, life: 2600, fps: 80, grow: 260, delay: dl, follow: true });
          chainShot = { age: 0, life: 1300 }; SFX.chain(); });
      });
      // act 4: Kuro drags the night down; the moon falls onto the enemy and collapses
      later(3900, () => { play('ult', range(9, 12), [100, 130, 150, 900]); SFX.fall();
        tween(moon, 'y', FLOOR - 70, 380, 'in'); tween(moon, 'x', ENEMY, 380, 'in'); tween(moon, 's', .9, 380, 'in'); tween(moon, 'clock', 0, 200);
        later(330, () => { shatterNext = true; });
        later(380, () => { SFX.boom(); later(140, () => SFX.dark()); later(260, () => SFX.boom());
          tween(moon, 's', 0, 260, 'in'); later(270, () => moon = null);
          impactFX({ pal: 'shadow', x: ENEMY, y: FLOOR - 62, stop: 320, shake: 900, mag: 11, flash: 1, chroma: 950, streaks: 36, kb: 34, power: 2.6, curse: 3200 });
          cam.fx = ENEMY - 30; cam.fy = FLOOR - 80; tween(cam, 'z', 1.3, 100, 'out'); later(450, () => tween(cam, 'z', 1, 1000, 'inout'));
          for (const dx of [-150, -100, -52, 52, 100, 150]) fire('sthorn', ENEMY + dx, FLOOR + 12, { fps: 65, scale: rnd(1, 1.4), delay: rnd(0, 240), hold: 600 });
          fire('sburst', ENEMY, FLOOR - 62, { anchor: 'center', fps: 50, scale: 2 }); fire('sflower', ENEMY, FLOOR + 16, { fps: 90, scale: 2.1, hold: 1200, follow: true });
          fire('miasma', ENEMY, FLOOR + 16, { loop: true, scale: 1.5, life: 1800, fps: 60, follow: true, delay: 200 });
          [[1012, 0], [1096, 220], [1188, 440], [1240, 660], [3720, 1050]].forEach(([vv, t], i) => { num(vv, ENEMY + [-50, 40, -30, 50, 0][i], FLOOR - 124 - [0, 18, 34, 10, 48][i], i === 4, t + 60); if (i) later(t, () => tick(ENEMY, FLOOR - 80, 'shadow', 5)); });
          later(1600, () => { tween(fxState, 'despair', 0, 1400); tween(fxState, 'dim', 0, 1200); });
          later(2600, () => tween(fxState, 'letter', 0, 500));
          later(2900, done);
        }); }); }); } },
],
E: [
 { name: 'Mending Touch', tag: '30 SP · Light · Heal', run() {
    banner('Mending Touch'); glide(HOME + 40, 280, () => {
      play('mend', range(0, 11), [80, 80, 80, 70, 70, 80, 90, 90, 90, 90, 100, 120], { on: {
        2: () => { SFX.holy(); orb(hero.x + 44, FLOOR - 70, 50, 300, '#fff1c4'); },
        3: () => { SFX.swing(); voice('v_exhale', { vol: .6 }); const sx = hero.x + 40, sy = FLOOR - 72;   // a ribbon of healing light arcs back to her ally
          for (let q = 0; q < 50; q++) later(q * 12, () => ember(sx + rnd(-4, 4), sy + rnd(-4, 4), { pal: 'light', vx: (ally.x + 6 - sx) / 42 + rnd(-.3, .3), vy: rnd(-1.6, -.7), g: .06, drag: 1, life: 760 }));
          later(560, () => { SFX.chime(); SFX.heal(); emiGlow = 1400;
            fire('lpillar', ally.x, FLOOR + 8, { loop: true, scale: .6, life: 1400, fps: 80, grow: 200, lights: true, glow: .4 }); lightPool(ally.x, 72, 2100);
            for (const dx of [-36, -14, 16, 38]) lilySprout(ally.x + dx, rnd(.7, 1), rnd(1700, 2300));
            for (let q = 0; q < 30; q++) ember(ally.x + rnd(-24, 24), FLOOR - rnd(10, 100), { pal: 'light', vy: rnd(-1.8, -.6), life: rnd(800, 1500) });
            num('+320', ally.x + 30, FLOOR - 150, true, 0, 'heal'); }); } } });
      later(1750, () => glide(HOME, 380, done)); }); } },
 { name: 'Heal Veil', tag: '36 SP · Light · Big heal', run() {
    banner('Heal Veil'); tween(fxState, 'dawn', .3, 500); let sv;
    play('veil', range(0, 11), [80, 80, 90, 100, 110, 110, 100, 90, 80, 80, 100, 140], { on: {
      3: () => { SFX.choir(1.8); sv = { x: ally.x, y: FLOOR + 4, s: 0, flat: .3, rot: 0, spin: .8, a: .9, rev: 1, pulse: 0, kind: 'lsigil' }; sigils.push(sv); tween(sv, 's', 1.0, 400, 'out');
        for (let q = 0; q < 34; q++) later(q * 14, () => { const a = rnd(0, Math.PI * 2), r = rnd(50, 90), tx = hero.x + 6, ty = FLOOR - 150; ember(tx + Math.cos(a) * r, ty + Math.sin(a) * r * .7, { pal: 'light', vx: -Math.cos(a) * 2.4, vy: -Math.sin(a) * 1.7, g: 0, drag: .96, life: 480 }); }); },
      9: () => { SFX.holy(); SFX.heal(); fxState.flash = .3; fxState.flashCol = '255,246,220'; sv.pulse = 1; emiGlow = 2200;
        fire('lveil', ally.x, FLOOR + 12, { loop: true, scale: 1.05, life: 2000, fps: 70, grow: 300, lights: true, glow: .4 }); lightPool(ally.x, 92, 2600);
        for (const dx of [-50, -30, -10, 12, 32, 52]) lilySprout(ally.x + dx, rnd(.7, 1.05), rnd(2000, 2600));
        for (let q = 0; q < 26; q++) feather(ally.x + rnd(-40, 40), FLOOR - rnd(90, 150), rnd(-1, 1), rnd(-1, .4));
        num('+450', ally.x + 30, FLOOR - 154, true, 0, 'heal'); num('+45', ally.x - 16, FLOOR - 126, false, 700, 'heal'); num('+45', ally.x + 44, FLOOR - 118, false, 1300, 'heal');
        later(700, () => SFX.chime()); later(1300, () => SFX.chime()); later(1700, () => tween(sv, 'a', 0, 500)); } } });
    later(2700, () => { tween(fxState, 'dawn', 0, 800); sigils = sigils.filter(x => x !== sv); done(); }); } },
 { name: 'Purify', tag: '26 SP · Light · Cleanse', run() {
    banner('Purify');   // a curse clings to her ally first
    const curse = [-24, 0, 22].map(dx => fire(Math.random() < .5 ? 'tendril1' : 'bfire1', ally.x + dx, FLOOR + 4, { loop: true, scale: .6, life: 1600, fps: 85, glow: .3 })), cp = darkPool(ally.x, 52, 1600); allyCurse = 1600;
    glide(HOME + 34, 240, () => {
      play('purify', range(0, 9), [80, 80, 70, 60, 60, 60, 70, 80, 110, 150], { on: {
        3: () => { SFX.swing(); SFX.holy(); voice('v_exhale', { vol: .6, rate: 1.05 }); fxState.shake = 160; fxState.shakeMag = 2;   // the sweep sends light racing across the whole floor
          for (let k = 0; k < 15; k++) later(k * 28, () => { const xr = hero.x + 34 + k * 26, xl = hero.x - 26 - k * 15;
            lilySprout(xr, rnd(.6, .9), rnd(1500, 2000)); lightPool(xr, 28, 1600);
            if (k < 9) { lilySprout(xl, rnd(.6, .9), rnd(1500, 2000)); lightPool(xl, 28, 1600); }
            ember(xr, FLOOR - rnd(0, 20), { pal: 'light', vy: rnd(-2.4, -1), life: 900 }); }); },
        5: () => later(120, () => { SFX.chime(); SFX.heal(); allyCurse = 0; for (const f of curse) f.life = f.age + 160; cp.life = cp.age + 300;
          burstParticles(ally.x, FLOOR - 60, .7, 'light'); fire('lpillar', ally.x, FLOOR + 8, { loop: true, scale: .7, life: 1000, fps: 80, grow: 140, lights: true });
          for (let q = 0; q < 20; q++) spark(ally.x + rnd(-20, 20), FLOOR - rnd(10, 60), .6, 'light'); emiGlow = 1000;
          num('CLEANSED', ally.x + 24, FLOOR - 150, false, 0, 'heal'); }) } });
      later(1500, () => glide(HOME, 360, done)); }); } },
 { name: 'Barrier Hymn', tag: '34 SP · Light · Party guard', run() {
    banner('Barrier Hymn'); tween(fxState, 'dawn', .2, 400); let dome;
    play('hymn', range(0, 11), [90, 90, 100, 110, 120, 130, 130, 130, 120, 110, 100, 120], { on: {
      2: () => { SFX.choir(2.6); for (let q = 0; q < 30; q++) later(q * 40, () => ember(hero.x + rnd(-30, 30), FLOOR - rnd(60, 130), { pal: 'light', vy: rnd(-1.2, -.4), vx: rnd(-.4, .4), life: 1000 })); },
      5: () => { SFX.shield(); const mx = (ally.x + hero.x) / 2 + 6;
        dome = fire('ldome', mx, FLOOR + 12, { loop: true, scale: 1.25, life: 3000, fps: 80, grow: 350, lights: true, glow: .2 });
        lightPool(mx, 118, 3000); for (const dx of [-96, -60, 60, 96]) lilySprout(mx + dx, rnd(.7, .95), 2800);
        fxState.buff = { age: 0, life: 2600 };
        later(1100, () => {   // Kuro's shadow bolt strikes the barrier and breaks apart on it
          const b = fire('sburst', ENEMY - 30, FLOOR - 70, { anchor: 'center', loop: true, scale: .4, life: 300, fps: 50, glow: .5 }); tween(b, 'x', mx + 92, 280, 'in'); SFX.dark();
          later(280, () => { SFX.shield(); fxState.shake = 220; fxState.shakeMag = 3; tween(dome, 'scale', 1.36, 80, 'out'); later(90, () => tween(dome, 'scale', 1.25, 300, 'inout'));
            for (let q = 0; q < 26; q++) spark(mx + 92, FLOOR - 66, .8, q % 2 ? 'light' : 'shadow'); orb(mx + 92, FLOOR - 66, 60, 260, '#fff1c4');
            num('BLOCKED', mx + 30, FLOOR - 160, false, 0, 'heal'); }); }); } } });
    later(3100, () => { tween(fxState, 'dawn', 0, 600); done(); }); } },
 { name: 'Aurora Covenant', tag: 'ULTIMATE · Sync 100', ult: true, run() {
    const angel = hero.cid === 'EA';
    // act 1: black bars, the light softens, the cut-in
    tween(fxState, 'letter', 1, 400); tween(fxState, 'dim', .32, 500); SFX.choir(3);
    SFX.cutin(); fxState.cutin = { age: 0, life: 1250, title: 'AURORA COVENANT', sub: 'EMI SHIRAISHI · ULTIMATE', col: 'rgba(176,132,44,.95)', img: 'portraitE' };
    later(1250, () => {
      banner('Aurora Covenant', 1500);
      // act 2: heaven answers. Sigils open beneath and behind her and a pillar of light falls on her
      const sg = { x: hero.x, y: FLOOR + 4, s: 0, flat: .3, rot: 0, spin: .5, a: 1, rev: 1, pulse: 0, kind: 'lsigil' }; sigils.push(sg); tween(sg, 's', 1.6, 700, 'out');
      const sv = { x: hero.x - 2, y: FLOOR - 100, s: 0, flat: 1, rot: 0, spin: -.4, a: .5, rev: 1, pulse: 0, kind: 'lsigil' }; sigils.push(sv); tween(sv, 's', 1.25, 800, 'out');
      tween(fxState, 'dawn', .35, 900); SFX.choir(4);
      fire('lpillar', hero.x, FLOOR + 10, { loop: true, scale: 1.4, sy: 1.5, life: 2400, fps: 70, grow: 300, lights: true, glow: .45, layer: 'back' });
      for (let q = 0; q < 60; q++) later(q * 24, () => ember(hero.x + rnd(-40, 40), FLOOR - rnd(0, 20), { pal: 'light', vy: rnd(-3, -1), life: rnd(800, 1400) }));
      const wingBurst = () => { SFX.wing(); fxState.flash = .5; fxState.flashCol = '255,246,220'; fxState.shake = 320; fxState.shakeMag = 4; tween(fxState, 'dawn', .42, 300);
        orb(hero.x, FLOOR - 80, 140, 500, '#fff1c4'); orb(hero.x, FLOOR - 80, 50, 320, '#ffffff'); sg.pulse = 1; sv.pulse = 1;
        for (let q = 0; q < 90; q++) { const a = rnd(0, Math.PI * 2), v = rnd(2, 6); feather(hero.x, FLOOR - 84, Math.cos(a) * v, Math.sin(a) * v * .7 - 1); }
        for (let q = 0; q < 18; q++) streaks.push({ x: hero.x, y: FLOOR - 84, a: rnd(0, Math.PI * 2), len: rnd(60, 180), w: rnd(1, 3), age: 0, life: rnd(260, 420), col: '255,240,200' }); };
      if (!angel) play('ascend', range(0, 14), [150, 120, 120, 120, 120, 140, 100, 90, 90, 90, 90, 90, 110, 140, 360], { on: { 1: () => SFX.holy(), 6: wingBurst }, after: () => { hero.cid = 'EA'; hero.armed = true; rest(hero); buildSkills(); } });
      else { play('hymn', range(0, 7), 130); later(900, wingBurst); later(1100, () => rest(hero)); }
      // act 3: aurora unfurls across the sky and lilies of light bloom over the whole floor
      later(2100, () => { SFX.choir(3.5); featherRain = 2600;
        for (const [x, y, sc, fl] of [[110, 62, 1.5, false], [330, 46, 1.8, true], [545, 64, 1.5, false]]) fire('aurora', x, y, { anchor: 'center', loop: true, scale: sc, life: 3600, fps: 110, layer: 'back', grow: 400, fade: 600, glow: .35, lights: true, flip: fl, alpha: .8 });
        for (let q = 0; q < 26; q++) later(q * 45, () => { const x = 20 + (q / 26) * (W - 40) + rnd(-8, 8); if (Math.abs(x - hero.x) > 24) lilySprout(x, rnd(.7, 1.05), rnd(3000, 3800)); if (q % 2 === 0) lightPool(x, rnd(30, 50), 3600); }); });
      // act 4: she raises her staff and the covenant is sealed over the whole party
      later(3000, () => play('veil', range(0, 11), [80, 80, 90, 100, 110, 110, 100, 90, 80, 80, 100, 160], { on: { 9: () => {
        SFX.bellHoly(); SFX.heal(); fxState.flash = .5; fxState.flashCol = '255,246,220'; fxState.shake = 260; fxState.shakeMag = 3; halo = { x: hero.x + 20, y: FLOOR - 90, age: 0 };
        sg.pulse = 1.6; sv.pulse = 1.6; emiGlow = 2600;
        for (const x of [ally.x, hero.x]) { fire('lpillar', x, FLOOR + 8, { loop: true, scale: .7, life: 1500, fps: 70, grow: 160, lights: true, alpha: .8 }); fire('lveil', x, FLOOR + 12, { loop: true, scale: .85, life: 1900, fps: 70, grow: 300, lights: true, alpha: .8 }); }
        num('+740', ally.x + 10, FLOOR - 150, true, 120, 'heal'); num('+740', hero.x + 50, FLOOR - 190, true, 300, 'heal');
        [700, 1200, 1700].forEach((t, i) => { num('+88', ally.x + (i % 2 ? 36 : -12), FLOOR - 128, false, t, 'heal'); num('+88', hero.x + (i % 2 ? -10 : 40), FLOOR - 136, false, t + 90, 'heal'); later(t, () => SFX.chime()); }); } }, after: () => rest(hero) }));
      later(5200, () => { tween(fxState, 'dawn', 0, 1400); tween(fxState, 'dim', 0, 1200); tween(sg, 'a', 0, 1000); tween(sv, 'a', 0, 800); });
      later(6000, () => tween(fxState, 'letter', 0, 500)); later(6500, () => { sigils = []; done(); }); }); } },
],
};
SKILLS.EA = SKILLS.E;

// ---------- the seven new characters ----------
function act(name, peak, fn, o = {}) { const n = AS[hero.cid][name].n, fr = range(0, n - 1), du = o.durs || fr.map(i => i < 3 ? 95 : i < 7 ? 72 : 95);
  play(name, fr, du, { on: Object.assign({ [Math.min(n - 1, peak)]: fn }, o.on || {}), after: o.after || (() => rest(hero)) }); return du.reduce((a, b) => a + b, 0); }
function shot(el, x0, y0, ms, then, sc = .45) { const b = fire(ELS[el].b, x0, y0, { anchor: 'center', loop: true, scale: sc, life: ms + 40, fps: 45, glow: .5, lights: true }); tween(b, 'x', ENEMY - 10, ms, 'in');
  for (let q = 0; q < 10; q++) later(q * ms / 10, () => ember(b.x, b.y + rnd(-6, 6), { pal: el, vx: rnd(-1.5, -.5), vy: rnd(-.5, .5), life: 400 })); later(ms, then); }
function debuff(text) { fxState.debuff = { text, age: 0, life: 2000 }; }
function buff(text, who, col) { fxState.buff = { age: 0, life: 2400, text, who, col }; }
function cine(o) {   // shared opening for the new ultimates: black bars, the element washes the room, the cut-in
  tween(fxState, 'letter', 1, 400); tween(fxState, 'dim', o.dim ?? .45, 500); fxState.egk = o.el; tween(fxState, 'eg', o.eg ?? .55, 900);
  SFX.cutin(); if (o.open) o.open(); fxState.cutin = { age: 0, life: 1250, title: o.title, sub: CH[hero.cid].name.replace(/ /g, ' ') + ' · ULTIMATE', col: o.col, img: 'portrait' + hero.cid }; }
function cineEnd(at, doneAt) { later(at, () => { tween(fxState, 'eg', 0, 1400); tween(fxState, 'dim', 0, 1200); elRain && (elRain.t = 0); }); later(at + 900, () => tween(fxState, 'letter', 0, 500)); later(doneAt, () => { sigils = []; done(); }); }
function finale(el, nums5, big) { const f = big || 3000; nums5.forEach(([v, t], i) => { num(v, ENEMY + [-50, 40, -30, 50, 0][i], FLOOR - 124 - [0, 18, 34, 10, 48][i], i === 4, t + 60); if (i && i < 4) later(t, () => tick(ENEMY, FLOOR - 80, el, 5)); }); }
const ROW = (el) => { for (let q = 0; q < 26; q++) later(q * 28, () => { const x = 24 + (q / 26) * (W - 48) + rnd(-8, 8); if (Math.abs(x - hero.x) > 30 && Math.abs(x - ally.x) > 26) sprout(el, x, rnd(.7, 1.1), rnd(3000, 3800)); if (q % 2 === 0) elemPool(el, x, rnd(30, 50), 3600); }); };

// ---------- SAYA · ice ----------
// ---------- SAYA · ice ----------
// ---------- SAYA · ice ----------
SKILLS.S = [
 { name: 'Frost Pin', tag: '18 SP · Ice', run() {
    banner('Frost Pin'); converge('ice', hero.x + 46, FLOOR - 80, 30, 400, 30, 60);
    act('pin', 5, () => { SFX.el('ice', 'cast'); shout();
      [0, 90, 180].forEach((dl, k) => later(dl, () => shot('ice', hero.x + 50, FLOOR - 82 + (k - 1) * 10, 210, () => {   // three slivers in a tight fan
        SFX.el('ice', 'hit'); if (k === 2) { elHit('ice', { power: 1, bs: .8, chroma: 160, streaks: 8, spots: [-24, 22] }); camPunch(ENEMY, FLOOR - 70, 1.18); num(552, ENEMY, FLOOR - 120, true); }
        else { tick(ENEMY, FLOOR - 72 + (k - 1) * 10, 'ice', 3); fire('ice_b', ENEMY - 6, FLOOR - 72, { anchor: 'center', fps: 55, scale: .5, alpha: .7 }); } }, .35)));
      later(560, () => { ring('ice', ENEMY, 8, 64, 2400, [.75, 1.05]); efx('aura', 'ice', ENEMY, FLOOR + 22, { loop: true, scale: .9, life: 1700, fps: 60, layer: 'back', glow: .3, alpha: .7, follow: true }); egPulse('ice', .35, 200, 900); });   // the frostbite spreads
      ticks('ice', [[30, 1250, -44, 20], [30, 1750, 40, 30]]); }); later(2700, done); } },
 { name: 'Crystal Lock', tag: '34 SP · Ice · Answer time −4s', run() {
    banner('Crystal Lock'); afterimages(4); dashTo(STRIKE + 20, 300, () => { act('lock', 8, () => { SFX.el('ice', 'big'); shout(true);
      efx('slash', 'ice', ENEMY - 10, FLOOR - 62, { anchor: 'center', fps: 55, glow: .4 }); elHit('ice', { power: 1.3, stop: 200, chroma: 300, streaks: 14, curse: 2600 }); camPunch(ENEMY, FLOOR - 70, 1.25);
      for (const [dx, sc, dl] of [[-34, .6, 80], [32, .6, 160], [0, .85, 240]]) later(dl, () => { fire('ice_big', ENEMY + dx, FLOOR + 10, { scale: sc, fps: 90, hold: 1500, follow: true, glow: .2 }); SFX.el('ice', 'spread'); });   // the crystal cage closes
      later(1500, () => { SFX.shatter(); for (let q = 0; q < 30; q++) spark(ENEMY, FLOOR - 70, .9, 'ice'); fire('ice_b', ENEMY, FLOOR - 66, { anchor: 'center', fps: 55, scale: 1, alpha: .7 }); });
      egPulse('ice', .5, 200, 1300); later(300, () => debuff('ANSWER TIME −4s')); num(768, ENEMY, FLOOR - 132, true, 60); }); later(2000, () => dashHome(done)); }); } },
 { name: 'Snow Veil', tag: '28 SP · Ice · Guard', run() {
    banner('Snow Veil'); focusHero(1.12, 500); act('veil', 5, () => { SFX.el('ice', 'cast'); SFX.shield(); elemPool('ice', hero.x, 96, 2800);
      efx('storm', 'ice', hero.x + 4, FLOOR - 64, { loop: true, anchor: 'center', scale: .75, life: 2400, fps: 60, grow: 300, alpha: .55, glow: .25 });
      ring('ice', hero.x, 8, 66, 2600); elRain = { el: 'ice', t: 1800 };
      for (let q = 0; q < 90; q++) later(q * 22, () => { const a = q * .5; ember(hero.x + Math.cos(a) * 54, FLOOR - 64 + Math.sin(a) * 44, { pal: 'ice', vx: -Math.sin(a) * 1.6, vy: Math.cos(a) * 1.1 - .3, g: 0, drag: .99, life: 900 }); });
      buff('DMG −30%', 'self', '#bfe9ff'); egPulse('ice', .35, 300, 1300); later(400, () => tween(cam, 'z', 1, 500));
      later(1000, () => { guardBlock('ice', hero.x + 62); later(300, () => { SFX.shatter(); for (let q = 0; q < 24; q++) spark(hero.x + 62, FLOOR - 66, 1, 'ice'); }); }); }); later(3000, done); } },
 { name: 'Permafrost Field', tag: '40 SP · Ice · Enemy ATK −25%', run() {
    banner('Permafrost Field'); tween(fxState, 'dim', .4, 300); act('field', 5, () => { SFX.el('ice', 'big'); shout(); fxState.shake = 300; fxState.shakeMag = 4;
      const w = efx('wave', 'ice', hero.x + 60, FLOOR + 4, { loop: true, scale: 1.2, life: 560, fps: 60, grow: 80, fade: 140 }); tween(w, 'x', ENEMY - 20, 460, 'in');   // a sheet of black ice races across the floor
      spreadLine('ice', hero.x + 50, ENEMY + 80, 14, 3200, 32, [.6, 1]);
      later(460, () => { SFX.el('ice', 'hit'); elemPool('ice', ENEMY, 150, 3200); impactFX({ pal: 'ice', stop: 120, shake: 260, mag: 5, flash: .5, chroma: 260, kb: 6, power: .9, curse: 3200 });
        for (const [dx, dl] of [[-60, 0], [60, 90], [0, 180]]) later(dl, () => efx('pillar', 'ice', ENEMY + dx, FLOOR + 6, { loop: true, scale: .9, life: 1300, fps: 60, grow: 160, glow: .3, alpha: .8 }));
        camPunch(ENEMY, FLOOR - 60, 1.15); });
      egPulse('ice', .6, 300, 1500); later(560, () => debuff('ATK −25%')); });
    later(2900, () => { tween(fxState, 'dim', 0, 700); done(); }); } },
 { name: 'Zero Hour Prism', tag: 'ULTIMATE · Sync 100', ult: true, run() {
    cine({ el: 'ice', title: 'ZERO HOUR PRISM', col: 'rgba(40,110,190,.95)', open: () => smp('braamHorn', { vol: .55, rate: 1.25 }) });
    later(1250, () => { banner('Zero Hour Prism', 1500); elRain = { el: 'ice', t: 4600 };
      act('ult', 6, () => { SFX.el('ice', 'big'); }, { durs: range(0, 13).map(i => i < 6 ? 140 : 110) });
      ROW('ice'); const vort = efx('storm', 'ice', ENEMY, FLOOR - 70, { loop: true, anchor: 'center', scale: .3, life: 2600, fps: 55, grow: 1, fade: 300, alpha: .6, glow: .3 }); tween(vort, 'scale', 1.4, 1600, 'out');
      for (const [dx, sc, dl] of [[-120, .75, 300], [120, .75, 450], [-60, .6, 600], [70, .65, 700]]) later(dl, () => { fire('ice_big', ENEMY + dx, FLOOR + 10, { scale: sc, fps: 90, hold: 2700, glow: .2 }); SFX.el('ice', 'spread'); });
      const pr = { x: ENEMY, y: FLOOR - 196, s: 0, flat: 1, rot: Math.PI, spin: 0, a: .95, rev: 1, pulse: 0, kind: 'ice_big' }; later(900, () => { sigils.push(pr); tween(pr, 's', 1.6, 900, 'out'); SFX.holy(); });
      const clockFace = () => { moon = { x: ENEMY, y: 104, s: 1.1, a: 0, clock: 0, min: 270, crack: 0 }; tween(moon, 'clock', .8, 400); };   // zero hour: the hands sweep to midnight
      later(1100, clockFace); for (let k = 0; k < 8; k++) later(1300 + k * 100, () => { if (moon) moon.min = 270 + (k + 1) * 11.25; SFX.tickc(); });
      cam.fx = ENEMY - 60; cam.fy = 160; tween(cam, 'z', 1.08, 2000, 'inout');
      later(2200, () => { SFX.bellHoly(); fxState.flash = .22; fxState.flashCol = ELS.ice.fl; tween(fxState, 'eg', .45, 300); pr.pulse = 1.5; if (moon) moon.crack = 1; speedHold(500); });   // time stops
      later(2700, () => { tween(pr, 'y', FLOOR - 70, 260, 'in'); tween(pr, 's', .7, 260, 'in'); if (moon) tween(moon, 'clock', 0, 200); later(240, () => { freeze({ type: 'frost', life: 1500 }); });
        later(260, () => { moon = null; SFX.boom(); SFX.el('ice', 'hit'); SFX.shatter(); sigils = sigils.filter(x => x !== pr); shout(true);
          impactFX({ pal: 'ice', stop: 300, shake: 800, mag: 10, flash: .6, chroma: 900, streaks: 34, kb: 30, power: 1.8, curse: 3600 }); tween(fxState, 'eg', 0, 900);
          cam.fx = ENEMY - 30; cam.fy = FLOOR - 80; tween(cam, 'z', 1.28, 100, 'out'); later(450, () => tween(cam, 'z', 1, 1000, 'inout'));
          fire('ice_b', ENEMY, FLOOR - 62, { anchor: 'center', fps: 50, scale: 1.4, alpha: .7 }); efx('blast', 'ice', ENEMY, FLOOR + 12, { fps: 85, scale: 1.3, glow: .3, alpha: .8 });
          for (const dx of [-150, -90, 90, 150]) efx('pillar', 'ice', ENEMY + dx, FLOOR + 6, { loop: true, scale: rnd(.8, 1), life: 1600, fps: 60, grow: 200, delay: rnd(0, 200), alpha: .8 });
          finale('ice', [[964, 0], [1022, 220], [1080, 440], [1136, 660], [3410, 1050]]); later(1100, () => debuff('STUNNED')); }); });
      cineEnd(4700, 6100); }); } },
];
// ---------- RAIDEN · electric ----------
SKILLS.R = [
 { name: 'Spark Step', tag: '18 SP · Electric', run() {
    banner('Spark Step'); SFX.el('elec', 'sig'); const x0 = hero.x;
    afterimages(6, 60, 25); bolt(x0 + 10, FLOOR - 60, STRIKE + 30, FLOOR - 60, 300, '255,240,140', 2.5);   // he blinks across in a flash of static
    trailing = 1; lastTrailX = hero.x; play('dash', CH[hero.cid].dashF, 40, { loop: true }); tween(hero, 'x', STRIKE + 30, 120, 'in');
    later(130, () => { trailing = 0; act('step', 4, () => { SFX.el('elec', 'hit'); shout(); efx('slash', 'elec', ENEMY - 10, FLOOR - 64, { anchor: 'center', fps: 50, glow: .3 }); elHit('elec', { power: .9, chroma: 200, spots: [-24, 22] }); arcs(ENEMY, FLOOR - 66, 5, 70, '255,240,140'); num(220, ENEMY - 6, FLOOR - 118, false); },
      { on: { 6: () => { SFX.el('elec', 'hit'); tick(ENEMY, FLOOR - 70, 'elec', 4); efx('slash', 'elec', ENEMY, FLOOR - 70, { anchor: 'center', fps: 50, flip: true, glow: .3 }); arcs(ENEMY, FLOOR - 70, 4, 60, '255,240,140'); num(160, ENEMY + 30, FLOOR - 104, false); },
               8: () => { SFX.el('elec', 'big'); fire('el_big', ENEMY, FLOOR + 10, { fps: 60, scale: .75, alpha: .8, follow: true }); impactFX({ pal: 'elec', stop: 140, shake: 300, mag: 6, chroma: 300, kb: 26, power: 1.1 }); camPunch(ENEMY, FLOOR - 70, 1.2); num(576, ENEMY, FLOOR - 136, true); } } });
      later(1500, () => dashHome(done)); }); } },
 { name: 'Static Rush', tag: '55 SP · Electric · Heavy', run() {
    banner('Static Rush'); tween(fxState, 'dim', .55, 300); egPulse('elec', .6, 400, 1700); SFX.el('elec', 'cast'); focusHero(1.18, 700);
    efx('aura', 'elec', hero.x, FLOOR + 24, { loop: true, scale: 1.1, life: 1300, fps: 60, layer: 'back', grow: 300, glow: .4 }); converge('elec', hero.x, FLOOR - 66, 60, 900);
    for (let k = 0; k < 8; k++) later(k * 110, () => arcs(hero.x, FLOOR - 66, 2, 60, '255,240,140'));
    act('rush', 7, () => { SFX.el('elec', 'big'); SFX.boom(); shout(true); elHit('elec', { stop: 240, shake: 560, mag: 9, flash: 1, chroma: 600, streaks: 24, kb: 36, power: 1.8 });
      fire('el_big', ENEMY, FLOOR + 12, { fps: 60, scale: 1.05, glow: .3, follow: true, alpha: .8 }); efx('blast', 'elec', ENEMY + 6, FLOOR + 10, { fps: 85, scale: 1.2, glow: .3, delay: 60, follow: true });
      for (const dx of [-70, 70]) efx('pillar', 'elec', ENEMY + dx, FLOOR + 6, { loop: true, scale: .85, life: 1300, fps: 60, grow: 160, delay: 120, alpha: .8 });
      arcs(ENEMY, FLOOR - 66, 10, 120, '255,240,140'); spreadLine('elec', ENEMY - 130, ENEMY + 90, 10, 2200, 22);
      camPunch(ENEMY, FLOOR - 70, 1.3); num(1188, ENEMY, FLOOR - 140, true, 80); ticks('elec', [[88, 900, -46, 28], [88, 1500, 44, 36]]); later(900, () => arcs(ENEMY, FLOOR - 66, 4, 60, '255,240,140')); later(1500, () => arcs(ENEMY, FLOOR - 66, 4, 60, '255,240,140')); },
      { on: { 4: () => { tween(cam, 'z', 1, 160, 'out'); trailing = 1; lastTrailX = hero.x; afterimages(4); tween(hero, 'x', STRIKE + 20, 200, 'in'); later(200, () => trailing = 0); } } });
    later(2800, () => { tween(fxState, 'dim', 0, 700); dashHome(done); }); } },
 { name: 'Overcharge', tag: '30 SP · Electric · ATK +25%', run() {
    banner('Overcharge'); focusHero(1.12, 500); act('charge', 5, () => { SFX.el('elec', 'big'); shout(true); fxState.flash = .25; fxState.flashCol = ELS.elec.fl;
      fire('el_big', hero.x, FLOOR + 10, { fps: 60, scale: .85, alpha: .75 }); efx('aura', 'elec', hero.x, FLOOR + 24, { loop: true, scale: 1.15, life: 2200, fps: 60, layer: 'back', grow: 200, glow: .4 });   // he calls the lightning down onto himself
      for (const dx of [-44, -20, 22, 46]) sprout('elec', hero.x + dx, rnd(.8, 1.1), 2400);
      for (let k = 0; k < 12; k++) later(k * 140, () => { arcs(hero.x, FLOOR - 70, 2, 56, '255,240,140'); if (k % 3 === 0) SFX.el('elec', 'spread'); });
      egPulse('elec', .5, 200, 1400); buff('ATK +25%', 'self', '#ffe86a'); later(500, () => tween(cam, 'z', 1, 600)); }); later(2800, done); } },
 { name: 'Static Pulse', tag: '32 SP · Electric · Answer time −4s', run() {
    banner('Static Pulse'); act('pulse', 5, () => { SFX.el('elec', 'cast'); shout();
      const w = efx('wave', 'elec', hero.x + 60, FLOOR + 4, { loop: true, scale: 1, life: 400, fps: 60, grow: 60, fade: 120 }); tween(w, 'x', ENEMY - 30, 330, 'in');
      shot('elec', hero.x + 56, FLOOR - 72, 330, () => { SFX.el('elec', 'hit'); elHit('elec', { power: 1.1, chroma: 320, curse: 2400 }); debuff('ANSWER TIME −4s'); num(672, ENEMY, FLOOR - 128, true); camPunch(ENEMY, FLOOR - 70, 1.15);
        for (let q = 0; q < 10; q++) later(q * 150, () => { bolt(ENEMY + enemy.kb, FLOOR - 70, ENEMY + rnd(-70, 70), FLOOR + rnd(-4, 6), 200, '255,240,140', 1.6); if (q % 3 === 0) SFX.el('elec', 'spread'); }); }, .55); }); later(2600, done); } },
 { name: 'Final Circuit', tag: 'ULTIMATE · Sync 100', ult: true, run() {
    cine({ el: 'elec', title: 'FINAL CIRCUIT', col: 'rgba(150,120,20,.95)', dim: .75, eg: .7, open: () => { smp('braamHorn', { vol: .7, rate: .95 }); SFX.el('elec', 'cast'); } });
    later(1250, () => { banner('Final Circuit', 1500); elRain = { el: 'elec', t: 3800 };
      const sky = efx('storm', 'elec', ENEMY - 40, 60, { loop: true, anchor: 'center', scale: .3, life: 3000, fps: 55, grow: 1, fade: 300, alpha: .55, layer: 'back' }); tween(sky, 'scale', 1.5, 1500, 'out');
      const pts = []; for (let k = 0; k < 7; k++) pts.push(40 + k * 92); circuit = { age: 0, life: 4200, paths: pts.map((x) => { const p = [[x, FLOOR + 6]]; let cx = x, cy = FLOOR + 6; for (let s = 0; s < 6; s++) { if (s % 2) cy += rnd(-14, 14); else cx += (ENEMY - x) / 6; p.push([cx, Math.max(FLOOR - 8, Math.min(FLOOR + 18, cy))]); } p.push([ENEMY, FLOOR + 6]); return p; }) };
      pts.forEach((x, i) => later(200 + i * 230, () => { fire('el_big', x, FLOOR + 12, { fps: 60, scale: rnd(.75, .95), glow: .25, alpha: .8 }); bolt(ENEMY - 40, 60, x, FLOOR, 220, '255,240,140', 2.5); sprout('elec', x, 1, 3000); elemPool('elec', x, 50, 3200); fxState.flash = .3; fxState.flashCol = ELS.elec.fl; SFX.el('elec', 'hit'); fxState.shake = 160; fxState.shakeMag = 3; }));
      act('ult', 3, () => tween(hero, 'y', -44, 300, 'out'), { durs: range(0, 13).map(i => i < 8 ? 150 : 110) });
      cam.fx = W / 2 + 40; cam.fy = 150; tween(cam, 'z', 1.08, 2000, 'inout');
      later(2300, () => { SFX.el('elec', 'big'); tween(hero, 'y', 0, 200, 'in'); tween(cam, 'z', 1, 200); later(180, () => { freeze({ type: 'split', life: 1100 }); });
        later(200, () => { SFX.boom(); later(120, SFX.boom); shout(true); for (let k = 0; k < 5; k++) bolt(ENEMY - 40 + rnd(-60, 60), 40, ENEMY + rnd(-20, 20), FLOOR - 40, 400, '255,250,200', 3);
          fire('el_big', ENEMY, FLOOR + 14, { fps: 55, scale: 1.4, glow: .3, alpha: .8 }); fire('el_b', ENEMY, FLOOR - 62, { anchor: 'center', fps: 50, scale: 1.2, alpha: .6 }); efx('blast', 'elec', ENEMY, FLOOR + 12, { fps: 85, scale: 1.5, glow: .3 });
          for (const dx of [-170, -110, 110, 170]) efx('pillar', 'elec', ENEMY + dx, FLOOR + 6, { loop: true, scale: rnd(.8, 1.05), life: 1700, fps: 60, grow: 200, delay: rnd(0, 220), alpha: .8 });
          impactFX({ pal: 'elec', stop: 320, shake: 900, mag: 11, flash: 1, chroma: 950, streaks: 36, kb: 34, power: 2.6, curse: 3200 }); cam.fx = ENEMY - 30; cam.fy = FLOOR - 80; tween(cam, 'z', 1.3, 100, 'out'); later(450, () => tween(cam, 'z', 1, 1000, 'inout'));
          finale('elec', [[1350, 0], [1430, 220], [1505, 440], [1580, 660], [4870, 1050]]); }); });
      cineEnd(4400, 5700); }); } },
];
// ---------- NAO · wind ----------
SKILLS.N = [
 { name: 'Razor Breeze', tag: '18 SP · Wind', run() {
    banner('Razor Breeze'); act('breeze', 5, () => { SFX.el('wind', 'hit'); shout();
      const b = fire('wi_b', hero.x + 70, FLOOR - 62, { anchor: 'center', loop: true, scale: .9, life: 280, fps: 40 }); tween(b, 'x', ENEMY, 260, 'in');
      const s2 = efx('slash', 'wind', hero.x + 90, FLOOR - 60, { anchor: 'center', loop: true, scale: .8, life: 260, fps: 40, glow: .3, alpha: .8 }); tween(s2, 'x', ENEMY, 240, 'in');
      later(260, () => { elHit('wind', { power: 1, chroma: 160, streaks: 10, spots: [-26, 24] }); camPunch(ENEMY, FLOOR - 70, 1.15); num(400, ENEMY, FLOOR - 120, true);
        for (let q = 0; q < 22; q++) ember(ENEMY + rnd(-20, 20), FLOOR - rnd(30, 90), { pal: 'wind', vx: rnd(1, 4), vy: rnd(-2, 0), life: 900 });
        later(500, () => { SFX.swing(); SFX.el('wind', 'hit'); efx('slash', 'wind', ENEMY, FLOOR - 66, { anchor: 'center', fps: 45, flip: true, glow: .3 });   // the cut arrives half a second late
          streaks.push({ x: ENEMY, y: FLOOR - 64, a: -.3, len: 180, w: 2.5, age: 0, life: 300, col: '230,255,235' }); tick(ENEMY, FLOOR - 70, 'wind', 5); num(176, ENEMY + 36, FLOOR - 100, false); }); }); });
    later(2500, done); } },
 { name: 'Gale Trick', tag: '30 SP · Wind · Enemy accuracy −25%', run() {
    banner('Gale Trick'); act('gale', 5, () => { SFX.el('wind', 'big'); shout(); const w = fire('wi_big', hero.x + 80, FLOOR + 10, { loop: true, scale: .6, life: 2000, fps: 60, grow: 200 }); tween(w, 'x', ENEMY, 400, 'inout'); tween(w, 'scale', 1, 400, 'out');
      spreadLine('wind', hero.x + 70, ENEMY, 8, 1800, 40);
      later(420, () => { elHit('wind', { power: 1.1, curse: 2400, chroma: 200 }); efx('storm', 'wind', ENEMY, FLOOR - 66, { loop: true, anchor: 'center', scale: .8, life: 1500, fps: 55, grow: 200, follow: true, alpha: .7 }); debuff('ACCURACY −25%'); num(720, ENEMY, FLOOR - 130, true); camPunch(ENEMY, FLOOR - 70, 1.12);
        for (let q = 0; q < 18; q++) smoke(ENEMY + rnd(-50, 50), FLOOR - rnd(10, 100), 1, '#8a7a60'); for (let k = 0; k < 8; k++) later(k * 120, () => { enemy.kb = (k % 2 ? 10 : -10); tgtHurt(); }); }); egPulse('wind', .45, 300, 1200); }); later(2900, done); } },
 { name: 'Feather Guard', tag: '26 SP · Wind · Guard', run() {
    banner('Feather Guard'); act('guard', 3, () => { SFX.el('wind', 'cast'); for (let k = 0; k < 8; k++) later(k * 70, () => trail.push({ x: hero.x + rnd(-30, 30), f: hero.f, anim: hero.anim, a: .6 }));
      efx('aura', 'wind', hero.x, FLOOR + 24, { loop: true, scale: 1.05, life: 2400, fps: 60, layer: 'back', grow: 300, glow: .3 }); ring('wind', hero.x, 6, 60, 2400); buff('DMG −30%', 'self', '#c8ffd8'); egPulse('wind', .35, 300, 1300);
      for (let q = 0; q < 50; q++) later(q * 30, () => { const a = q * .6; ember(hero.x + Math.cos(a) * 46, FLOOR - 60 + Math.sin(a) * 40, { pal: 'wind', vx: -Math.sin(a) * 2, vy: Math.cos(a) * 1.2, g: 0, drag: .99, life: 700 }); });
      later(900, () => { const b = fire('sburst', ENEMY - 30, FLOOR - 70, { anchor: 'center', loop: true, scale: .4, life: 300, fps: 50 }); tween(b, 'x', hero.x - 40, 300, 'in'); SFX.dark();
        later(300, () => { for (let k = 0; k < 3; k++) trail.push({ x: hero.x + (k - 1) * 22, f: hero.f, anim: hero.anim, a: .9 }); num('MISS', hero.x - 10, FLOOR - 150, false, 0, 'heal'); SFX.el('wind', 'hit'); }); }); }); later(3000, done); } },
 { name: "Wind's Mercy", tag: '32 SP · Wind · Heal', run() {
    banner("Wind's Mercy"); act('mercy', 5, () => { SFX.el('wind', 'cast'); for (let q = 0; q < 50; q++) later(q * 16, () => { const a = q * .7; ember(ally.x + Math.cos(a) * 28, FLOOR - q * 2.2, { pal: 'wind', vx: -Math.sin(a) * 1.2, vy: -1.4, g: 0, drag: .99, life: 900 }); });
      fire('wi_big', ally.x, FLOOR + 10, { loop: true, scale: .6, life: 1400, fps: 60, grow: 200, alpha: .5 }); efx('pillar', 'wind', ally.x, FLOOR + 6, { loop: true, scale: .7, life: 1400, fps: 60, grow: 200, alpha: .55, delay: 200 });
      healOn('wind', ally.x, '+300', 450); }); later(2600, done); } },
 { name: 'Phantom Tempest', tag: 'ULTIMATE · Sync 100', ult: true, run() {
    cine({ el: 'wind', title: 'PHANTOM TEMPEST', col: 'rgba(30,120,70,.95)', open: () => smp('windloop', { vol: .8, dur: 3 }) });
    later(1250, () => { banner('Phantom Tempest', 1500); elRain = { el: 'wind', t: 4400 }; ROW('wind'); windOn = true;
      act('ult', 4, () => SFX.el('wind', 'big'), { durs: range(0, 13).map(i => 120) });
      const sky = efx('storm', 'wind', ENEMY - 20, 90, { loop: true, anchor: 'center', scale: .3, life: 3000, fps: 50, grow: 1, fade: 300, alpha: .55, layer: 'back' }); tween(sky, 'scale', 1.6, 1400, 'out');
      for (const [x0, dl] of [[60, 200], [W - 40, 400], [240, 650]]) later(dl, () => { const w = fire('wi_big', x0, FLOOR + 10, { loop: true, scale: 1.1, life: 2300, fps: 55, grow: 300 }); tween(w, 'x', ENEMY + rnd(-40, 40), 1600, 'inout'); SFX.el('wind', 'cast'); });
      cam.fx = W / 2 + 40; cam.fy = 160; tween(cam, 'z', 1.07, 1800, 'inout');
      later(2000, () => { tween(cam, 'z', 1, 300); for (let k = 0; k < 8; k++) later(k * 80, () => { const x = ENEMY + (k % 2 ? 64 : -64); trail.push({ x, f: 3, anim: 'dash', a: .85 }); SFX.swing(); tick(ENEMY, FLOOR - 70, 'wind', 4);   // phantom afterimages cut through
        efx('slash', 'wind', ENEMY, FLOOR - 66, { anchor: 'center', fps: 45, flip: k % 2 === 1, glow: .3, alpha: .8 }); streaks.push({ x: ENEMY, y: FLOOR - 64, a: rnd(-.6, .6), len: 200, w: 2.5, age: 0, life: 260, col: '230,255,235' }); }); });
      later(2750, () => { freeze({ type: 'slices', life: 1300 }); later(20, () => { SFX.boom(); SFX.el('wind', 'hit'); shout(true);
        impactFX({ pal: 'wind', stop: 280, shake: 800, mag: 10, flash: .9, chroma: 900, streaks: 34, kb: 32, power: 2.3, curse: 3200 }); fire('wi_b', ENEMY, FLOOR - 62, { anchor: 'center', fps: 50, scale: 2 }); efx('blast', 'wind', ENEMY, FLOOR + 12, { fps: 85, scale: 1.3, glow: .3 });
        cam.fx = ENEMY - 30; cam.fy = FLOOR - 80; tween(cam, 'z', 1.28, 100, 'out'); later(450, () => tween(cam, 'z', 1, 1000, 'inout'));
        finale('wind', [[930, 0], [990, 220], [1050, 440], [1100, 660], [3290, 1050]]); later(1100, () => debuff('STUNNED')); later(1600, () => windOn = false); }); });
      cineEnd(4600, 5900); }); } },
];
// ---------- TAIGA · earth ----------
SKILLS.T = [
 { name: 'Quake Palm', tag: '34 SP · Earth', run() {
    banner('Quake Palm'); act('palm', 5, () => { SFX.el('earth', 'sig'); shout(true); fxState.shake = 420; fxState.shakeMag = 5; camPunch(hero.x + 40, FLOOR - 70, 1.12);
      const w = efx('wave', 'earth', hero.x + 60, FLOOR + 4, { loop: true, scale: 1.2, life: 480, fps: 60, grow: 60, fade: 120 }); tween(w, 'x', ENEMY - 30, 400, 'in');
      for (let k = 0; k < 10; k++) later(k * 40, () => { const x = hero.x + 60 + (ENEMY - hero.x - 60) * k / 9; sprout('earth', x, rnd(.85, 1.2), 1900); smoke(x, FLOOR - 10, .9, '#6a4a2a'); if (k % 3 === 0) SFX.el('earth', 'spread'); });   // the shockwave rolls through the ground
      later(420, () => { SFX.el('earth', 'hit'); elHit('earth', { power: 1.3, chroma: 200, streaks: 10, stop: 180, shake: 420, mag: 7 }); efx('pillar', 'earth', ENEMY, FLOOR + 6, { loop: true, scale: 1, life: 1200, fps: 60, grow: 140, follow: true, alpha: .8 }); camPunch(ENEMY, FLOOR - 70, 1.22);
        for (let q = 0; q < 14; q++) smoke(ENEMY + rnd(-50, 50), FLOOR - rnd(0, 70), 1.1, '#6a4a2a'); num(864, ENEMY, FLOOR - 128, true); }); }); later(2600, done); } },
 { name: 'Iron Stand', tag: '28 SP · Earth · DEF +30%', run() {
    banner('Iron Stand'); focusHero(1.12, 500); act('stand', 4, () => { SFX.el('earth', 'big'); shout(true); fxState.shake = 420; fxState.shakeMag = 6; elemPool('earth', hero.x, 110, 2800);
      efx('aura', 'earth', hero.x, FLOOR + 24, { loop: true, scale: 1.2, life: 2400, fps: 60, layer: 'back', grow: 300, glow: .3 }); ring('earth', hero.x, 8, 74, 2600, [.9, 1.25]);
      for (let q = 0; q < 16; q++) smoke(hero.x + rnd(-70, 70), FLOOR - rnd(0, 30), 1.1, '#6a4a2a');
      for (let q = 0; q < 10; q++) later(q * 60, () => { const a = rnd(0, Math.PI * 2); parts.push({ t: 'shred', x: hero.x + Math.cos(a) * 50, y: FLOOR - 10, px: hero.x, py: FLOOR, vx: rnd(-1, 1), vy: rnd(-3.5, -2), g: .12, drag: .98, life: 1000, age: 0, c: q % 2 ? '#8a6038' : '#5a3a20', s: rnd(3, 5), rot: 0, vr: rnd(-.2, .2) }); });
      buff('DEF +30%', 'self', '#ffc070'); egPulse('earth', .4, 200, 1300); later(500, () => tween(cam, 'z', 1, 600)); }); later(2800, done); } },
 { name: 'Fortress Roar', tag: '50 SP · Earth · Heavy', run() {
    banner('Fortress Roar'); tween(fxState, 'dim', .5, 300); focusHero(1.15, 600); converge('earth', hero.x, FLOOR - 50, 40, 700);
    act('roar', 5, () => { SFX.el('earth', 'big'); shout(true); fxState.shake = 600; fxState.shakeMag = 7; tween(cam, 'z', 1, 150);
      spreadLine('earth', hero.x + 50, ENEMY - 40, 8, 2400, 32); later(300, () => { SFX.el('earth', 'hit'); SFX.boom(); fire('ea_big', ENEMY, FLOOR + 12, { scale: 1.05, fps: 80, hold: 1100, follow: true });
        efx('blast', 'earth', ENEMY, FLOOR + 12, { fps: 85, scale: 1.2, glow: .3, delay: 40, follow: true }); elHit('earth', { stop: 240, shake: 560, mag: 9, flash: .8, chroma: 450, streaks: 20, kb: 32, power: 1.7 }); camPunch(ENEMY, FLOOR - 70, 1.28);
        for (let k = 0; k < 3; k++) later(400 + k * 220, () => { const b = fire('ea_b', ENEMY + rnd(-40, 40), -30, { anchor: 'center', loop: true, scale: .6, life: 330, fps: 50 }); tween(b, 'y', FLOOR - 50, 300, 'in'); later(300, () => { SFX.el('earth', 'hit'); tick(ENEMY, FLOOR - 70, 'earth', 5); }); });   // boulders rain down after it
        num(1152, ENEMY, FLOOR - 140, true, 80); later(400, () => num(84, ENEMY - 46, FLOOR - 92, false)); later(620, () => num(84, ENEMY + 44, FLOOR - 84, false)); later(840, () => num(84, ENEMY, FLOOR - 100, false));
        for (let q = 0; q < 18; q++) smoke(ENEMY + rnd(-60, 60), FLOOR - rnd(0, 70), 1.3, '#6a4a2a'); }); egPulse('earth', .5, 300, 1500); });
    later(3000, () => { tween(fxState, 'dim', 0, 700); done(); }); } },
 { name: 'Shelter Stance', tag: '36 SP · Earth · Party guard', run() {
    banner('Shelter Stance'); act('shelter', 4, () => { SFX.el('earth', 'big'); shout(); const wx = hero.x + 112; fire('ea_big', wx, FLOOR + 10, { scale: .95, fps: 80, hold: 2400, glow: .2 }); elemPool('earth', wx, 80, 2800);
      for (let q = 0; q < 14; q++) smoke(wx + rnd(-40, 40), FLOOR - rnd(0, 60), 1.1, '#6a4a2a'); ring('earth', wx, 4, 50, 2400); fxState.shake = 360; fxState.shakeMag = 5; camPunch(wx, FLOOR - 70, 1.1);
      buff('DMG −30%', 'party', '#ffc070'); later(1000, () => { guardBlock('earth', wx + 20); later(300, () => { SFX.el('earth', 'hit'); for (let q = 0; q < 8; q++) smoke(wx + 20, FLOOR - 60, .8, '#6a4a2a'); }); }); }); later(3100, done); } },
 { name: "King's Bastion", tag: 'ULTIMATE · Sync 100', ult: true, run() {
    cine({ el: 'earth', title: "KING'S BASTION", col: 'rgba(120,80,30,.95)', open: () => { smp('braamHorn', { vol: .7, rate: .85 }); SFX.el('earth', 'cast'); } });
    later(1250, () => { banner("King's Bastion", 1500); elRain = { el: 'earth', t: 3600 }; ROW('earth'); fxState.shake = 3200; fxState.shakeMag = 1.6;
      act('ult', 6, () => { SFX.el('earth', 'big'); shout(true); }, { durs: range(0, 13).map(i => i < 6 ? 150 : 115) });
      efx('aura', 'earth', hero.x, FLOOR + 24, { loop: true, scale: 1.3, life: 3000, fps: 60, layer: 'back', grow: 300, glow: .3 });
      for (const [x, sc, dl] of [[ally.x - 30, 1.1, 400], [hero.x + 70, 1.25, 600], [ally.x + 40, .9, 800]]) later(dl, () => { fire('ea_big', x, FLOOR + 12, { scale: sc, fps: 80, hold: 2900, glow: .2, layer: 'back' }); SFX.el('earth', 'hit'); fxState.shake = 280; fxState.shakeMag = 5; for (let q = 0; q < 8; q++) smoke(x + rnd(-40, 40), FLOOR - rnd(0, 60), 1.2, '#6a4a2a'); });
      cam.fx = W / 2; cam.fy = 170; tween(cam, 'z', 1.07, 1600, 'inout');
      for (let k = 0; k < 7; k++) later(1200 + k * 150, () => { const b = fire('ea_b', ENEMY + rnd(-80, 80), -40, { anchor: 'center', loop: true, scale: rnd(.6, .9), life: 360, fps: 50 }); tween(b, 'y', FLOOR - 40, 340, 'in'); later(340, () => { SFX.el('earth', 'hit'); tick(ENEMY, FLOOR - 70, 'earth', 6); efx('blast', 'earth', b.x, FLOOR + 10, { fps: 90, scale: .6, glow: .2 }); }); });
      later(2500, () => { tween(cam, 'z', 1, 200); freeze({ type: 'wall', life: 1500 }); SFX.boom(); later(500, () => SFX.el('earth', 'hit'));
        later(30, () => { impactFX({ pal: 'earth', stop: 260, shake: 900, mag: 11, flash: .8, chroma: 700, streaks: 30, kb: 30, power: 2.2, curse: 3000 }); efx('pillar', 'earth', ENEMY, FLOOR + 6, { loop: true, scale: 1.3, life: 1600, fps: 60, grow: 160, alpha: .8 }); finale('earth', [[960, 0], [1020, 220], [1080, 440], [1140, 660], [3480, 1050]]);
          later(900, () => buff('SHIELD +580', 'party', '#ffc070')); }); });
      cineEnd(4600, 6000); }); } },
];
// ---------- HINA · mind ----------
SKILLS.H = [
 { name: 'Mind Needle', tag: '20 SP · Mind', run() {
    banner('Mind Needle'); act('needle', 5, () => { SFX.el('mind', 'cast'); shout();
      [0, 70, 140].forEach((dl, k) => later(dl, () => { const c = { t: 'card', x: hero.x + 50, y: FLOOR - 80, px: hero.x, py: FLOOR - 80, vx: 9.5, vy: (k - 1) * .5, g: 0, drag: 1, life: 600, age: 0, rot: 0, vr: .45 }; parts.push(c); SFX.el('mind', 'cast'); }));   // three cards like needles
      later(380, () => { SFX.el('mind', 'hit'); elHit('mind', { power: 1, chroma: 420, streaks: 10, spots: [-20, 22] }); camPunch(ENEMY, FLOOR - 70, 1.15); num(600, ENEMY, FLOOR - 124, true); egPulse('mind', .35, 150, 700);
        const sg = { x: ENEMY, y: FLOOR - 70, s: 0, flat: 1, rot: 0, spin: 2, a: .6, rev: 1, pulse: 1, kind: 'mi_big', follow: true }; sigils.push(sg); tween(sg, 's', .45, 160, 'out'); tween(sg, 'a', 0, 700); later(800, () => sigils = sigils.filter(x => x !== sg)); }); }); later(2400, done); } },
 { name: 'Focus Break', tag: '32 SP · Mind · Enemy accuracy −25%', run() {
    banner('Focus Break'); act('break', 4, () => { SFX.el('mind', 'big'); shout(); const sg = { x: ENEMY, y: FLOOR - 70, s: 0, flat: 1, rot: 0, spin: 1.4, a: .8, rev: 1, pulse: 1, kind: 'mi_big', follow: true }; sigils.push(sg); tween(sg, 's', .85, 200, 'out');
      efx('storm', 'mind', ENEMY, FLOOR - 66, { loop: true, anchor: 'center', scale: .7, life: 1200, fps: 60, grow: 160, follow: true, alpha: .6 });
      later(300, () => { SFX.shatter(); elHit('mind', { power: 1.2, chroma: 700, curse: 2400, stop: 180 }); camPunch(ENEMY, FLOOR - 70, 1.2); debuff('ACCURACY −25%'); num(768, ENEMY, FLOOR - 140, true); tween(sg, 'a', 0, 700);
        for (let q = 0; q < 16; q++) parts.push({ t: 'shred', x: ENEMY, y: FLOOR - 70, px: ENEMY, py: FLOOR - 70, vx: rnd(-4, 4), vy: rnd(-4, 1), g: .1, drag: .97, life: rnd(600, 1000), age: 0, c: q % 2 ? '#e8d4ff' : '#9a58f2', s: rnd(2, 4), rot: rnd(0, 6), vr: rnd(-.3, .3) }); });   // their focus shatters like glass
      egPulse('mind', .45, 200, 1100); later(1300, () => sigils = sigils.filter(x => x !== sg)); }); later(2700, done); } },
 { name: 'Logic Snare', tag: '48 SP · Mind · Heavy', run() {
    banner('Logic Snare'); tween(fxState, 'dim', .5, 300); act('snare', 4, () => { SFX.el('mind', 'cast'); const pts = []; for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; pts.push([ENEMY + Math.cos(a) * rnd(60, 90), FLOOR - 66 + Math.sin(a) * rnd(45, 70)]); }
      const lines = []; for (let k = 0; k < 12; k++) { lines.push([k, (k + 1) % 12]); lines.push([k, (k + 5) % 12]); } web = { pts, lines, age: 0, life: 1800, shrink: 900 };
      for (let k = 0; k < 16; k++) later(k * 40, () => { const a = k / 16 * Math.PI * 2; card(ENEMY + Math.cos(a) * 90, FLOOR - 66 + Math.sin(a) * 60, -Math.cos(a) * 1.5, -Math.sin(a) * 1, 900); });   // cards close in around the paradox
      later(800, () => SFX.el('mind', 'spread')); focusHero(1, 10); cam.fx = ENEMY; cam.fy = FLOOR - 70; tween(cam, 'z', 1.12, 800, 'inout'); },
      { on: { 9: () => { SFX.el('mind', 'big'); SFX.boom(); shout(true); elHit('mind', { stop: 240, shake: 500, mag: 8, flash: .8, chroma: 800, streaks: 22, kb: 30, power: 1.7 }); efx('blast', 'mind', ENEMY, FLOOR + 12, { fps: 85, scale: 1.2, glow: .3, follow: true }); camPunch(ENEMY, FLOOR - 70, 1.3);
        num(1128, ENEMY, FLOOR - 140, true, 80); ticks('mind', [[84, 900, -46, 28], [84, 1500, 44, 36]]); } } }); egPulse('mind', .55, 300, 1900);
    later(3000, () => { tween(fxState, 'dim', 0, 700); done(); }); } },
 { name: 'Clarity Field', tag: '30 SP · Mind · Party buff', run() {
    banner('Clarity Field'); act('clarity', 5, () => { SFX.el('mind', 'sig'); SFX.holy(); const sg = { x: (ally.x + hero.x) / 2, y: FLOOR + 4, s: 0, flat: .3, rot: 0, spin: .5, a: .9, rev: 0, pulse: 0, kind: 'mi_big' }; sigils.push(sg); tween(sg, 's', 1.7, 500, 'out'); tween(sg, 'rev', 1, 600, 'inout');
      for (const x of [ally.x, hero.x]) { elemPool('mind', x, 60, 2600); efx('aura', 'mind', x, FLOOR + 22, { loop: true, scale: .8, life: 2200, fps: 60, layer: 'back', grow: 300, glow: .3, alpha: .8 }); for (let q = 0; q < 6; q++) later(q * 120, () => card(x + rnd(-20, 20), FLOOR - 20, rnd(-.5, .5), rnd(-2.5, -1.5), 1200)); }
      buff('CLEAR MIND', 'party', '#d8b0ff'); later(1800, () => tween(sg, 'a', 0, 600)); later(2500, () => sigils = sigils.filter(x => x !== sg)); }); later(2900, done); } },
 { name: 'Thought Maze', tag: 'ULTIMATE · Sync 100', ult: true, run() {
    cine({ el: 'mind', title: 'THOUGHT MAZE', col: 'rgba(90,40,150,.95)', open: () => { smp('braamDark', { vol: .7, rate: 1.1 }); SFX.el('mind', 'sig'); } });
    later(1250, () => { banner('Thought Maze', 1500); elRain = { el: 'mind', t: 4200 }; ROW('mind');
      const eye = { x: ENEMY - 20, y: 150, s: 0, flat: 1, rot: 0, spin: .4, a: .55, rev: 0, pulse: 0, kind: 'mi_big' }; sigils.push(eye); tween(eye, 's', 2.4, 900, 'out'); tween(eye, 'rev', 1, 900, 'inout');
      const floor = { x: ENEMY, y: FLOOR + 4, s: 0, flat: .3, rot: 0, spin: -.6, a: .8, rev: 0, pulse: 0, kind: 'mi_big' }; later(300, () => { sigils.push(floor); tween(floor, 's', 2, 700, 'out'); tween(floor, 'rev', 1, 800, 'inout'); });
      act('ult', 5, () => SFX.el('mind', 'big'), { durs: range(0, 13).map(i => 130) });
      for (let k = 0; k < 40; k++) later(300 + k * 45, () => { const a = k / 40 * Math.PI * 6, r = 110 - k * 1.8; card(ENEMY + Math.cos(a) * r, FLOOR - 66 + Math.sin(a) * r * .6, -Math.sin(a) * 2, Math.cos(a) * 1.2, 1300); if (k % 6 === 0) SFX.el('mind', 'spread'); });   // a spiral of cards becomes the maze
      efx('storm', 'mind', ENEMY, FLOOR - 66, { loop: true, anchor: 'center', scale: 1, life: 2200, fps: 55, grow: 400, alpha: .45, delay: 400 });
      cam.fx = ENEMY - 40; cam.fy = 160; tween(cam, 'z', 1.08, 1800, 'inout');
      later(2300, () => { eye.pulse = 1.6; floor.pulse = 1.6; SFX.el('mind', 'big'); freeze({ type: 'kaleido', life: 1500 }); later(30, () => { SFX.boom(); shout(true); tween(cam, 'z', 1, 200);
        impactFX({ pal: 'mind', stop: 280, shake: 700, mag: 9, flash: .9, chroma: 1000, streaks: 30, kb: 26, power: 2.2, curse: 3200 }); fire('mi_b', ENEMY, FLOOR - 62, { anchor: 'center', fps: 50, scale: 1.4, alpha: .7 }); efx('blast', 'mind', ENEMY, FLOOR + 12, { fps: 85, scale: 1.4, glow: .3 });
        finale('mind', [[870, 0], [930, 220], [985, 440], [1040, 660], [3060, 1050]]); later(1100, () => debuff('STUNNED')); tween(eye, 'a', 0, 900); tween(floor, 'a', 0, 1200); }); });
      cineEnd(4500, 5900); }); } },
];
// ---------- MINA · water ----------
SKILLS.M = [
 { name: 'Tide Cut', tag: '20 SP · Water', run() {
    banner('Tide Cut'); act('cut', 5, () => { SFX.el('water', 'cast'); SFX.swing(); shout(); const b = fire('wa_b', hero.x + 70, FLOOR - 62, { anchor: 'center', loop: true, scale: .7, life: 280, fps: 40 }); tween(b, 'x', ENEMY, 250, 'in');
      const s2 = efx('slash', 'water', hero.x + 90, FLOOR - 60, { anchor: 'center', loop: true, scale: .85, life: 250, fps: 40, glow: .3, alpha: .8 }); tween(s2, 'x', ENEMY, 230, 'in');
      later(250, () => { SFX.el('water', 'hit'); elHit('water', { power: 1, chroma: 160, streaks: 10, spots: [-24, 22] }); camPunch(ENEMY, FLOOR - 70, 1.15); num(600, ENEMY, FLOOR - 124, true);
        for (let q = 0; q < 30; q++) ember(ENEMY + rnd(-10, 10), FLOOR - rnd(40, 80), { pal: 'water', vx: rnd(-3, 3), vy: rnd(-4, -1), g: .14, drag: .99, life: 900 }); }); }); later(2400, done); } },
 { name: 'Aqua Guard', tag: '28 SP · Water · Guard', run() {
    banner('Aqua Guard'); act('guard', 4, () => { SFX.el('water', 'sig'); SFX.shield(); fire('wa_b', hero.x + 4, FLOOR - 62, { anchor: 'center', loop: true, scale: 1, life: 2400, fps: 60, grow: 260, alpha: .38 });
      efx('storm', 'water', hero.x + 4, FLOOR - 64, { loop: true, anchor: 'center', scale: .7, life: 2400, fps: 60, grow: 300, alpha: .45 });
      for (let q = 0; q < 30; q++) later(q * 60, () => ember(hero.x + rnd(-40, 40), FLOOR - rnd(0, 20), { pal: 'water', vy: rnd(-1.6, -.6), life: 1200 }));
      elemPool('water', hero.x, 84, 2600); ring('water', hero.x, 6, 56, 2400); buff('DMG −30%', 'self', '#9fd8ff');
      later(900, () => { guardBlock('water', hero.x + 56); later(300, () => { SFX.el('water', 'hit'); for (let q = 0; q < 24; q++) ember(hero.x + 56, FLOOR - 66, { pal: 'water', vx: rnd(-3, 3), vy: rnd(-3, 0), g: .14, life: 800 }); }); }); }); later(2900, done); } },
 { name: 'Flow Restore', tag: '34 SP · Water · Big heal', run() {
    banner('Flow Restore'); act('restore', 5, () => { SFX.el('water', 'cast'); const sx = hero.x + 30, sy = FLOOR - 90;
      for (let q = 0; q < 56; q++) later(q * 11, () => ember(sx + rnd(-4, 4), sy + rnd(-4, 4), { pal: 'water', vx: (ally.x + 6 - sx) / 42 + rnd(-.3, .3), vy: rnd(-1.6, -.7), g: .06, drag: 1, life: 760 }));
      fire('wa_big', ally.x, FLOOR + 10, { scale: .65, fps: 70, alpha: .6, delay: 450 }); efx('pillar', 'water', ally.x, FLOOR + 6, { loop: true, scale: .7, life: 1400, fps: 60, grow: 200, alpha: .55, delay: 500 });   // a fountain lifts the wounds away
      healOn('water', ally.x, '+380', 560); }); later(2600, done); } },
 { name: 'Deep Current', tag: '28 SP · Water · Heal over time', run() {
    banner('Deep Current'); act('current', 5, () => { SFX.el('water', 'sig'); const w = efx('wave', 'water', hero.x - 20, FLOOR + 4, { loop: true, scale: .9, life: 420, fps: 60, grow: 60, fade: 120, flip: true }); tween(w, 'x', ally.x + 10, 360, 'in');
      spreadLine('water', hero.x + 20, ally.x - 10, 5, 2800, 40);
      later(300, () => { elemPool('water', ally.x, 96, 3000); for (const dx of [-34, -10, 14, 36]) sprout('water', ally.x + dx, rnd(.8, 1.1), 2800); emiGlow = 2600;
        efx('aura', 'water', ally.x, FLOOR + 22, { loop: true, scale: .85, life: 2400, fps: 60, layer: 'back', grow: 300, glow: .3 });
        [0, 600, 1200, 1800].forEach((t, i) => { num('+65', ally.x + (i % 2 ? 34 : -6), FLOOR - 130 - i * 6, false, t, 'heal'); later(t, () => { SFX.chime(); SFX.el('water', 'spread'); for (let q = 0; q < 10; q++) ember(ally.x + rnd(-20, 20), FLOOR - rnd(0, 20), { pal: 'water', vy: rnd(-2, -1), life: 900 }); }); }); }); }); later(3100, done); } },
 { name: 'Blue Reversal', tag: 'ULTIMATE · Sync 100', ult: true, run() {
    cine({ el: 'water', title: 'BLUE REVERSAL', col: 'rgba(30,80,160,.95)', open: () => { SFX.choir(3); SFX.el('water', 'cast'); } });
    later(1250, () => { banner('Blue Reversal', 1500); elRain = { el: 'water', t: 4000 }; ROW('water');
      act('ult', 5, () => SFX.el('water', 'big'), { durs: range(0, 13).map(i => 130) });
      const pool = efx('storm', 'water', hero.x, FLOOR - 50, { loop: true, anchor: 'center', scale: .4, life: 2600, fps: 55, grow: 1, fade: 300, alpha: .5, layer: 'back' }); tween(pool, 'scale', 1.5, 1400, 'out');   // a whirlpool rises around her
      for (const [x, fl, dl] of [[90, false, 300], [W - 90, true, 500]]) later(dl, () => { fire('wa_big', x, FLOOR + 12, { scale: 1.3, fps: 60, flip: fl, glow: .3 }); SFX.el('water', 'hit'); });
      for (let q = 0; q < 140; q++) later(q * 13, () => { const a = q * .32, r = 40 + q * .3; ember(hero.x + Math.cos(a) * r, FLOOR - 40 - q * .8, { pal: 'water', vx: -Math.sin(a) * .8, vy: -.6, g: 0, drag: .99, life: 900 }); });
      cam.fx = W / 2 - 60; cam.fy = 170; tween(cam, 'z', 1.07, 1800, 'inout');
      later(2300, () => { SFX.bellHoly(); tween(cam, 'z', 1, 300); freeze({ type: 'ripple', life: 1600 }); later(40, () => { shout(true); fxState.flash = .6; fxState.flashCol = ELS.water.fl; halo = { x: hero.x + 10, y: FLOOR - 80, age: 0 };
        for (const x of [ally.x, hero.x]) { fire('wa_b', x, FLOOR - 62, { anchor: 'center', fps: 60, scale: 1, alpha: .7 }); efx('pillar', 'water', x, FLOOR + 6, { loop: true, scale: .9, life: 1700, fps: 60, grow: 200, alpha: .6 }); elemPool('water', x, 84, 2800); }
        emiGlow = 2600; num('+700', ally.x + 10, FLOOR - 150, true, 120, 'heal'); num('+700', hero.x + 50, FLOOR - 190, true, 300, 'heal');
        [700, 1200].forEach(t => { num('+88', ally.x + 30, FLOOR - 128, false, t, 'heal'); num('+88', hero.x + 30, FLOOR - 136, false, t + 90, 'heal'); later(t, () => SFX.chime()); }); later(900, () => buff('WOUNDS REVERSED', 'party', '#9fd8ff')); }); });
      cineEnd(4500, 5900); }); } },
];
// ---------- RENJI · metal ----------
SKILLS.X = [
 { name: 'Iron Smash', tag: '22 SP · Metal', run() {
    banner('Iron Smash'); afterimages(3); dashTo(STRIKE + 10, 280, () => { act('smash', 5, () => { SFX.el('metal', 'hit'); shout(true); efx('slash', 'metal', ENEMY - 10, FLOOR - 62, { anchor: 'center', fps: 50, scale: 1.1, glow: .3 }); later(110, () => { efx('slash', 'metal', ENEMY + 4, FLOOR - 66, { anchor: 'center', fps: 50, scale: 1.1, glow: .3, flip: true }); SFX.el('metal', 'hit'); });
      arcs(ENEMY, FLOOR - 66, 6, 90, '225,238,255'); elHit('metal', { power: 1.2, chroma: 200, streaks: 14, stop: 180, shake: 380, mag: 7 }); camPunch(ENEMY, FLOOR - 70, 1.22); ring('metal', ENEMY, 6, 56, 2000, [.9, 1.2]);
      for (let q = 0; q < 30; q++) spark(ENEMY, FLOOR - 66, 1.1, 'metal'); num(612, ENEMY, FLOOR - 126, true); }); later(1500, () => dashHome(done)); }); } },
 { name: 'Guard Break', tag: '34 SP · Metal · Enemy DEF −25%', run() {
    banner('Guard Break'); dashTo(STRIKE + 20, 260, () => { act('break', 5, () => { SFX.el('metal', 'hit'); SFX.shatter(); shout(); elHit('metal', { power: 1.3, chroma: 320, curse: 2600, stop: 220 }); crackOn(ENEMY, FLOOR - 70, 1600); camPunch(ENEMY, FLOOR - 70, 1.25);   // the guard cracks open
      efx('burst', 'metal', ENEMY, FLOOR - 66, { anchor: 'center', fps: 55, scale: .9, glow: .3, follow: true }); efx('wave', 'metal', ENEMY - 60, FLOOR + 4, { scale: .9, fps: 55 }); arcs(ENEMY, FLOOR - 70, 5, 80, '225,238,255');
      for (let q = 0; q < 18; q++) parts.push({ t: 'shred', x: ENEMY, y: FLOOR - 66, px: ENEMY, py: FLOOR - 66, vx: rnd(-3.5, 3.5), vy: rnd(-4, -.5), g: .16, drag: .97, life: rnd(600, 1100), age: 0, c: q % 2 ? '#c6d0d8' : '#8a96a0', s: rnd(2, 4), rot: rnd(0, 6), vr: rnd(-.3, .3) });
      debuff('DEF −25%'); num(840, ENEMY, FLOOR - 134, true); }); later(1600, () => dashHome(done)); }); } },
 { name: 'Steel Rush', tag: '55 SP · Metal · Heavy', run() {
    banner('Steel Rush'); tween(fxState, 'dim', .5, 300); SFX.el('metal', 'cast'); focusHero(1.15, 600); converge('metal', hero.x, FLOOR - 60, 40, 600);
    act('rush', 6, () => { SFX.el('metal', 'big'); SFX.boom(); shout(true);
      elHit('metal', { stop: 250, shake: 580, mag: 9, flash: 1, chroma: 600, streaks: 24, kb: 40, power: 1.8 }); efx('blast', 'metal', ENEMY + 6, FLOOR + 10, { fps: 85, scale: 1.2, glow: .3, follow: true });
      efx('slash', 'metal', ENEMY, FLOOR - 64, { anchor: 'center', fps: 45, scale: 1.4, glow: .3 }); later(90, () => efx('slash', 'metal', ENEMY, FLOOR - 64, { anchor: 'center', fps: 45, scale: 1.4, glow: .3, flip: true }));
      for (const dx of [-80, 80]) efx('pillar', 'metal', ENEMY + dx, FLOOR + 6, { loop: true, scale: .8, life: 1200, fps: 60, grow: 160, delay: 140, alpha: .8 }); arcs(ENEMY, FLOOR - 66, 8, 120, '225,238,255');
      for (let q = 0; q < 40; q++) spark(ENEMY, FLOOR - 60, 1.3, 'metal'); camPunch(ENEMY, FLOOR - 70, 1.3); crackOn(ENEMY, FLOOR - 66, 1300);
      num(1248, ENEMY, FLOOR - 140, true, 80); ticks('metal', [[92, 900, -46, 28], [92, 1500, 44, 36]]); },
      { on: { 2: () => { tween(cam, 'z', 1, 150); trailing = 1; lastTrailX = hero.x; afterimages(5); tween(hero, 'x', STRIKE + 30, 300, 'in'); spreadLine('metal', hero.x + 20, STRIKE + 40, 7, 2200, 45);
        for (let q = 0; q < 20; q++) later(q * 15, () => spark(hero.x, FLOOR - 4, .7, 'metal')); later(300, () => trailing = 0); } } });   // sparks scream off the floor as he charges
    later(3000, () => { tween(fxState, 'dim', 0, 700); dashHome(done); }); } },
 { name: 'Steel Shelter', tag: '34 SP · Metal · Party guard', run() {
    banner('Steel Shelter'); act('shelter', 4, () => { SFX.el('metal', 'big'); shout(); const wx = hero.x + 80; for (const dx of [-20, -4, 12, 28, 44]) later((dx + 20) * 4, () => { sprout('metal', wx + dx, rnd(1.1, 1.4), 2800, { layer: 'front' }); SFX.el('metal', 'spread'); });
      efx('wall', 'metal', wx + 10, FLOOR + 6, { loop: true, scale: .9, life: 2400, fps: 70, grow: 300, alpha: .55, glow: .25 }); elemPool('metal', wx, 76, 2800);
      for (const x of [ally.x, hero.x]) efx('aura', 'metal', x, FLOOR + 22, { loop: true, scale: .8, life: 2300, fps: 60, layer: 'back', grow: 300, glow: .2, alpha: .75 }); ring('metal', wx, 6, 50, 2600, [.8, 1.1]);
      buff('DMG −30%', 'party', '#e8f0f6'); later(1000, () => { guardBlock('metal', wx + 20); later(300, () => { SFX.el('metal', 'hit'); for (let q = 0; q < 26; q++) spark(wx + 20, FLOOR - 66, 1, 'metal'); }); }); }); later(3100, done); } },
 { name: 'Chrome Guillotine', tag: 'ULTIMATE · Sync 100', ult: true, run() {
    cine({ el: 'metal', title: 'CHROME GUILLOTINE', col: 'rgba(70,80,96,.95)', open: () => { smp('braamHorn', { vol: .7, rate: .9 }); SFX.el('metal', 'cast'); } });
    later(1250, () => { banner('Chrome Guillotine', 1500); elRain = { el: 'metal', t: 3800 }; ROW('metal');
      for (let k = 0; k < 6; k++) later(200 + k * 160, () => { const x = ENEMY + (k % 2 ? 1 : -1) * (40 + k * 18); sprout('metal', x, 1.5, 3200); SFX.el('metal', 'spread'); for (let q = 0; q < 8; q++) spark(x, FLOOR - 10, .8, 'metal'); });   // blades rise and box the enemy in
      const bl = { x: ENEMY, y: -120, s: 1.5, flat: 1, rot: 0, spin: 0, a: 1, rev: 1, pulse: 0, kind: 'me_big' }; later(400, () => { sigils.push(bl); tween(bl, 'y', 60, 1400, 'out'); SFX.el('metal', 'big'); });
      act('ult', 4, () => { tween(hero, 'y', -46, 300, 'out'); shout(); }, { durs: range(0, 13).map(i => i < 8 ? 150 : 110) });
      const vt = efx('storm', 'metal', ENEMY, FLOOR - 70, { loop: true, anchor: 'center', scale: .3, life: 2100, fps: 50, grow: 1, fade: 250, alpha: .7, glow: .2, delay: 300 }); tween(vt, 'scale', 1.25, 1500, 'out'); egPulse('metal', .5, 400, 1800);
      for (let k = 0; k < 6; k++) later(1100 + k * 150, () => { efx('slash', 'metal', ENEMY + rnd(-20, 20), FLOOR - 66 + rnd(-16, 16), { anchor: 'center', fps: 40, scale: rnd(1, 1.35), glow: .3, flip: k % 2 === 1 }); tick(ENEMY, FLOOR - 66, 'metal', 4); arcs(ENEMY, FLOOR - 66, 2, 80, '225,238,255'); SFX.el('metal', 'hit'); });   // phantom cuts from every side
      cam.fx = ENEMY - 30; cam.fy = 150; tween(cam, 'z', 1.08, 1800, 'inout');
      later(2300, () => { tween(hero, 'y', 0, 200, 'in'); tween(bl, 'y', FLOOR - 70, 220, 'in'); tween(cam, 'z', 1, 200); later(200, () => { freeze({ type: 'guillotine', life: 1100 }); });
        later(220, () => { SFX.boom(); SFX.el('metal', 'hit'); later(120, SFX.boom); shout(true); sigils = sigils.filter(x => x !== bl);
          impactFX({ pal: 'metal', stop: 320, shake: 900, mag: 11, flash: .8, chroma: 950, streaks: 36, kb: 34, power: 2, curse: 3200 }); fire('me_b', ENEMY, FLOOR - 62, { anchor: 'center', fps: 50, scale: 1.6, alpha: .8 }); efx('blast', 'metal', ENEMY, FLOOR + 12, { fps: 85, scale: 1.5, glow: .3 });
          crackOn(ENEMY, FLOOR - 66, 1800); for (let q = 0; q < 60; q++) spark(ENEMY, FLOOR - 40, 1.5, 'metal'); arcs(ENEMY, FLOOR - 66, 12, 150, '225,238,255');
          for (const dx of [-150, -90, 90, 150]) efx('pillar', 'metal', ENEMY + dx, FLOOR + 6, { loop: true, scale: rnd(.8, 1), life: 1500, fps: 60, grow: 200, delay: rnd(0, 200), alpha: .8 }); ring('metal', ENEMY, 8, 110, 2600, [1, 1.4]);
          cam.fx = ENEMY - 30; cam.fy = FLOOR - 80; tween(cam, 'z', 1.3, 100, 'out'); later(450, () => tween(cam, 'z', 1, 1000, 'inout'));
          finale('metal', [[1080, 0], [1150, 220], [1210, 440], [1270, 660], [3910, 1050]]); later(1000, () => buff('SHIELD +670', 'party', '#e8f0f6')); }); });
      cineEnd(4500, 5900); }); } },
];
function speedHold(ms) { fxState.hitstop = Math.max(fxState.hitstop, ms); }



function startSkill(i) { audio(); if (busy || stageBusy) return; busy = true; if (i === SKILLS[hero.cid].length - 1) cycled = true; setButtons(); const list = SKILLS[hero.cid]; nextSkill = (i + 1) % list.length;
  standUp(hero, () => list[i].run()); }

/* ---------- update ---------- */
function stepActor(a, d) { const s = a.seq; if (!s) return; s.t += d;
  while (s.t >= s.durs[s.i]) { s.t -= s.durs[s.i]; s.i++; if (s.i >= s.frames.length) { if (s.loop) s.i = 0; else { s.i = s.frames.length - 1; s.t = 0; a.f = s.frames[s.i]; const af = s.after; s.after = null; if (af) af(); return; } } fireFrame(a, s.i); }
  a.f = s.frames[s.i]; }
function step(dt) {
  const d = dt * speed;
  fxState.flash = Math.max(0, fxState.flash - d / 240); if (reduce) { fxState.flash = Math.min(fxState.flash, .1); fxState.shake = 0; fxState.chroma = 0; } fxState.chroma = Math.max(0, fxState.chroma - d); if (shards) shards.age += 0;
  if (fxState.hitstop > 0) { fxState.hitstop -= d; fxState.shake = Math.max(0, fxState.shake - d); return; }
  for (const tm of timers) tm.t -= d; const due = timers.filter(tm => tm.t <= 0); timers = timers.filter(tm => tm.t > 0); due.forEach(tm => tm.fn());
  for (const tw of tweens) { tw.age += d; const p = Math.min(1, tw.age / tw.dur); tw.obj[tw.key] = tw.from + (tw.to - tw.from) * tw.e(p); }
  tweens = tweens.filter(tw => tw.age < tw.dur);
  stepActor(hero, d); stepActor(tgt, d); stepActor(ally, d);
  if (trailing === 1 && hero.x - lastTrailX > 9) { lastTrailX = hero.x; trailFX(hero.x - 4, false); }
  if (trailing === -1 && lastTrailX - hero.x > 14) { lastTrailX = hero.x; trailFX(hero.x + 6, true); }
  if (trailing && (trail.length === 0 || Math.abs(trail[trail.length - 1].x - hero.x) > 10)) trail.push({ x: hero.x, f: hero.f, anim: hero.anim, a: .55 });
  fxState.shake = Math.max(0, fxState.shake - d); enemy.hit = Math.max(0, enemy.hit - d); enemy.kb *= Math.pow(.86, d / 16); enemy.burn = Math.max(0, enemy.burn - d); enemy.curse = Math.max(0, enemy.curse - d); enemy.et = Math.max(0, (enemy.et || 0) - d); emiGlow = Math.max(0, emiGlow - d);
  for (const f of fxs) f.age += d; fxs = fxs.filter(f => f.age < f.life); stepParts(d);
  for (const sc of scorch) sc.age += d; scorch = scorch.filter(sc => sc.age < sc.life);
  for (const p of pools) p.age += d; pools = pools.filter(p => p.age < p.life);
  if (shards) { shards.age += d; if (shards.age > 1300) shards = null; }
  if (burn) stepBurn(d);
  if (halo) { halo.age += d; if (halo.age > 1700) halo = null; }
  if (snapFX) { snapFX.age += d; if (snapFX.age > snapFX.life) snapFX = null; }
  if (web) { web.age += d; if (web.age > web.life) web = null; }
  for (const b of bolts) b.age += d; bolts = bolts.filter(b => b.age < b.life); for (const c of cracks) c.age += d; cracks = cracks.filter(c => c.age < c.life);
  if (circuit) { circuit.age += d; if (circuit.age > circuit.life) circuit = null; }
  allyCurse = Math.max(0, allyCurse - d);
  for (const sg of sigils) { sg.rot += sg.spin * d / 1000; sg.pulse = Math.max(0, sg.pulse - d / 700); }
  for (const t of trail) t.a -= d / 300; trail = trail.filter(t => t.a > 0);
  for (const n of nums) n.age += d; nums = nums.filter(n => n.age < 1200);
  for (const st of streaks) st.age += d; streaks = streaks.filter(st => st.age < st.life);
  if (chainShot) { chainShot.age += d; if (chainShot.age > chainShot.life) chainShot = null; }
  for (const k of ['banner', 'cutin', 'buff', 'debuff']) { const b = fxState[k]; if (b) { b.age += d; if (b.age > b.life) fxState[k] = null; } }
  if (!busy && !stageBusy) { idleT += d; if (loopOn && idleT > 1800) { if (nextSkill === 0 && cycled) { cycled = false; idleT = 0; changeStage(); } else startSkill(nextSkill); } }
}

/* ---------- draw ---------- */
function drawNum(n) {
  const k = n.age, b = k < 180 ? -Math.sin(k / 180 * Math.PI) * (n.big ? 20 : 10) : 0, a = k > 900 ? 1 - (k - 900) / 300 : 1, y = n.y + b - k * .02;
  ctx.globalAlpha = Math.max(0, a); ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  ctx.font = n.big ? 'italic 900 40px Cinzel, Georgia, serif' : 'italic 700 22px Cinzel, Georgia, serif';
  ctx.lineWidth = n.big ? 6 : 4; ctx.strokeStyle = n.kind === 'heal' ? '#062a20' : '#2a0c04'; ctx.strokeText(n.v, n.x, y);
  const g = ctx.createLinearGradient(0, y - (n.big ? 34 : 18), 0, y);
  if (n.kind === 'heal') { g.addColorStop(0, '#f2fff8'); g.addColorStop(.6, '#a8f0cf'); g.addColorStop(1, '#2fb383'); }
  else if (n.kind === 'weak' || n.kind === 'crit') { g.addColorStop(0, '#fffbe0'); g.addColorStop(.6, '#ffe45c'); g.addColorStop(1, '#f2a516'); }
  else if (n.kind === 'miss' || n.kind === 'resist') { g.addColorStop(0, '#ffffff'); g.addColorStop(.6, '#cfd8e6'); g.addColorStop(1, '#7d8aa0'); }
  else { g.addColorStop(0, '#fff6dc'); g.addColorStop(.6, '#ffc7a8'); g.addColorStop(1, '#e8563a'); }
  ctx.fillStyle = g; ctx.fillText(n.v, n.x, y); ctx.globalAlpha = 1;
}
function drawChain() {
  if (!chainShot) return; const p = Math.min(1, chainShot.age / 150), k = chainShot.age > chainShot.life - 300 ? (chainShot.life - chainShot.age) / 300 : 1;
  const x0 = hero.x + 46, y0 = FLOOR - 86, x1 = x0 + ((ENEMY + enemy.kb - 10) - x0) * p, y1 = y0 + ((FLOOR - 66) - y0) * p, len = Math.hypot(x1 - x0, y1 - y0), sag = chainShot.age > 600 ? 0 : 6;
  ctx.globalAlpha = Math.max(0, k);
  ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(160,90,255,.5)'; ctx.lineWidth = 7; ctx.filter = 'blur(3px)';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag, x1, y1); ctx.stroke(); ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
  for (let s = 0; s < len; s += 7) { const t = s / len, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag;
    ctx.fillStyle = (s / 7) % 2 ? '#2a1640' : '#7b4cc8'; ctx.fillRect(Math.round(x - 2), Math.round(y - 1.5), 4, 3); ctx.fillStyle = '#d7b8ff'; ctx.fillRect(Math.round(x - 1), Math.round(y - 1.5), 2, 1); }
  ctx.globalAlpha = 1;
}
/* ---------- stages: six academy scenes, rotated between fights ---------- */
// hor = where the back wall meets the floor (canvas px). The far wall is softly blurred, the floor
// stays sharp, and the bottom strip is drawn blurred in front of the fighters for HD-2D depth.
const STAGES = [
  { name: 'Grand Library', hor: 211, far: .86, floor: .94, wash: 'rgba(14,8,34,.1)', amb: '#8f8cff', ambA: .06, rays: { col: '170,185,255', a: .05, ang: .28, xs: [[372, 50], [436, 30]] } },
  { name: 'Alchemy Lab', hor: 180, far: .86, floor: .94, wash: 'rgba(36,16,30,.08)', amb: '#ffb27a', ambA: .06, rays: { col: '255,190,130', a: .06, ang: -.55, xs: [[30, 60], [120, 40]] } },
  { name: 'Academy Rooftop', hor: 192, far: .9, floor: .98, wash: 'rgba(16,6,34,.1)', amb: '#a57cff', ambA: .07, rays: null },
  { name: 'Academy Gate', hor: 203, far: .84, floor: .92, wash: 'rgba(40,18,10,.08)', amb: '#ffc480', ambA: .06, rays: { col: '255,210,150', a: .05, ang: .2, xs: [[250, 60], [380, 40]] } },
  { name: 'Classroom 2-A', hor: 198, far: .84, floor: .92, wash: 'rgba(40,16,6,.08)', amb: '#ffad66', ambA: .07, rays: { col: '255,190,120', a: .07, ang: -.6, xs: [[30, 70], [120, 50], [200, 40]] } },
  { name: 'East Hallway', hor: 172, far: .88, floor: .96, wash: 'rgba(10,10,34,.1)', amb: '#8aa0ff', ambA: .06, rays: null },
];
const FGY = 318;
const layers = {}; for (const k of ['far', 'floor', 'fg']) { const c = document.createElement('canvas'); c.__raw = true; c.width = W + 40; c.height = H + 24; layers[k] = { c, g: c.getContext('2d'), key: '' }; }
function grade(b) { const D = fxState.despair, I = fxState.inferno;
  let f = `brightness(${(b * (1 - .6 * D) * (1 + .16 * I)).toFixed(2)}) saturate(${((1.05 - .9 * D) * (1 + .4 * I)).toFixed(2)})`;
  if (I > .01) f += ` sepia(${(I * .5).toFixed(2)}) hue-rotate(${(-I * 14).toFixed(0)}deg) saturate(${(1 + I * 1.1).toFixed(2)})`;
  const Eg = fxState.eg; if (Eg > .01) { const e = ELS[fxState.egk]; f += ` brightness(${(1 + (e.bright - 1) * Eg).toFixed(2)})` + (fxState.egk === 'metal' ? ` saturate(${(1 - Eg * .6).toFixed(2)})` : ''); }
  const Dn = fxState.dawn; if (Dn > .01) f += ` brightness(${(1 + Dn * .22).toFixed(2)}) sepia(${(Dn * .3).toFixed(2)}) saturate(${(1 - Dn * .1).toFixed(2)})`; return f; }
function stageLayer(k, filter) { const L = layers[k], key = stageI + filter; if (L.key !== key) { L.key = key; L.g.clearRect(0, 0, W + 40, H + 24); L.g.filter = filter; L.g.imageSmoothingEnabled = true; L.g.drawImage(img.stages[stageI], 0, 0, W + 40, H + 24); L.g.filter = 'none';
    if (k === 'fg') { const m = L.g.createLinearGradient(0, FGY + 12 - 16, 0, FGY + 12 + 14); m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(1, 'rgba(0,0,0,1)'); L.g.globalCompositeOperation = 'destination-in'; L.g.fillStyle = m; L.g.fillRect(0, 0, W + 40, H + 24); L.g.globalCompositeOperation = 'source-over'; } } return L.c; }
const gradeCv = {}; function gradeTo(name, base, opaque, extraDim = 1) {
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
function drawStageBack() {
  const S = STAGES[stageI], par = (cam.z - 1) * 60, I = fxState.inferno, t = performance.now();
  const far = gradeTo('far', stageLayer('far', `blur(1.3px) brightness(${S.far}) saturate(1.05)`), true);
  ctx.save(); ctx.beginPath(); ctx.rect(-60, -60, W + 120, S.hor + 60); ctx.clip();
  const wob = I > .04 ? I * 2.6 : (fxState.eg > .04 && (fxState.egk === 'water' || fxState.egk === 'mind')) ? fxState.eg * 3.2 : 0;
  if (wob && !reduce) { for (let y = 0; y < S.hor + 16; y += 3) { const off = Math.sin(y / (fxState.egk === 'water' && !I ? 13 : 8) + t / (fxState.egk === 'water' && !I ? 260 : 120)) * wob; ctx.drawImage(far, 0, y, W + 40, 3, -20 - par * .4 + off, y - 12, W + 40, 3); } }   // heat shimmer
  else ctx.drawImage(far, -20 - par * .4, -12);
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(-60, S.hor, W + 120, H + 60); ctx.clip(); ctx.drawImage(gradeTo('floor', stageLayer('floor', `brightness(${S.floor}) saturate(1.05)`), true), -20, -12); ctx.restore();
  const fade = ctx.createLinearGradient(0, S.hor - 10, 0, S.hor + 10); fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(.5, 'rgba(10,6,14,.16)'); fade.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = fade; ctx.fillRect(-40, S.hor - 10, W + 80, 20);
  ctx.fillStyle = S.wash; ctx.fillRect(-40, -40, W + 80, H + 80);
  if (I > .01) { const g = ctx.createLinearGradient(0, -40, 0, H); g.addColorStop(0, `rgba(255,60,20,${I * .22})`); g.addColorStop(.6, `rgba(255,90,30,${I * .08})`); g.addColorStop(1, `rgba(255,120,40,${I * .12})`);
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(-40, -40, W + 80, H + 80); ctx.globalCompositeOperation = 'source-over'; }
  const Eg = fxState.eg; if (Eg > .01) { const e = ELS[fxState.egk], k = fxState.egk;   // each element washes the room in its own way
    ctx.globalCompositeOperation = 'color'; ctx.globalAlpha = Eg * .32; ctx.fillStyle = e.wash; ctx.fillRect(-40, -40, W + 80, H + 80);
    ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = Eg * .45; ctx.fillRect(-40, -40, W + 80, H + 80); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (k === 'elec' && Math.random() < Eg * .025) fxState.flash = Math.max(fxState.flash, .25), fxState.flashCol = e.fl;
    if (k === 'wind') { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(220,255,230,${Eg * .25})`; ctx.lineWidth = 1; for (let i = 0; i < 14; i++) { const yy = (i * 47 + t * .25 * (1 + i % 3)) % (H + 40) - 20, xx = (i * 131 + t * .9) % (W + 200) - 100; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + 70, yy - 6); ctx.stroke(); } ctx.globalCompositeOperation = 'source-over'; }
    if (k === 'ice') { const g = ctx.createRadialGradient(W / 2, H / 2, H * .3, W / 2, H / 2, H * .85); g.addColorStop(0, 'rgba(220,245,255,0)'); g.addColorStop(1, `rgba(220,245,255,${Eg * .35})`); ctx.fillStyle = g; ctx.fillRect(-40, -40, W + 80, H + 80); }
    if (k === 'earth' && Math.random() < Eg * .3) smoke(rnd(0, W), FLOOR - rnd(0, 40), .8, '#5a3c20'); }
  const Dn = fxState.dawn; if (Dn > .01) { ctx.globalCompositeOperation = 'lighter'; const g = ctx.createLinearGradient(0, -40, 0, H); g.addColorStop(0, `rgba(255,240,200,${Dn * .28})`); g.addColorStop(1, `rgba(255,230,180,${Dn * .06})`); ctx.fillStyle = g; ctx.fillRect(-40, -40, W + 80, H + 80);
    ctx.filter = 'blur(10px)'; for (const [x, w] of [[180, 50], [300, 70], [440, 46]]) { ctx.save(); ctx.translate(x, -30); ctx.rotate(.12); const rg = ctx.createLinearGradient(0, 0, 0, 420); rg.addColorStop(0, `rgba(255,246,220,${Dn * .22})`); rg.addColorStop(1, 'rgba(255,246,220,0)'); ctx.fillStyle = rg; ctx.fillRect(0, 0, w, 420); ctx.restore(); }
    ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over'; }
  if (S.rays) { ctx.globalCompositeOperation = 'lighter';
    ctx.filter = 'blur(9px)';
    for (const [x, w] of S.rays.xs) { ctx.save(); ctx.translate(x, -20); ctx.rotate(S.rays.ang); const a = S.rays.a * (1 - fxState.dim) * (.85 + .15 * Math.sin(t / 900 + x)), g = ctx.createLinearGradient(0, 0, 0, 440);
      g.addColorStop(0, `rgba(${S.rays.col},${a})`); g.addColorStop(.7, `rgba(${S.rays.col},${a * .6})`); g.addColorStop(1, `rgba(${S.rays.col},0)`); ctx.fillStyle = g; ctx.fillRect(0, 0, w, 440); ctx.restore(); }
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over'; }
  if (fxState.dim > 0) { ctx.fillStyle = `rgba(6,2,8,${fxState.dim * .8})`; ctx.fillRect(-40, -40, W + 80, H + 80); }
}
function drawStageFront() {   // the blurred foreground strip in front of the fighters
  const S = STAGES[stageI], fg = gradeTo('fg', stageLayer('fg', `blur(2.2px) brightness(${(S.floor * .74).toFixed(3)}) saturate(1.05)`), false, (.74 - fxState.dim * .4) / .74);
  ctx.drawImage(fg, -20, -12);
}
function changeStage(next, then) { if (stageBusy) return; stageBusy = true; setButtons(); tween(fxState, 'black', 1, 350);
  later(360, () => { stageI = next ?? (stageI + 1) % STAGES.length; fxs = []; pools = []; scorch = []; parts = []; sigils = []; featherRain = 0;
    elRain = null; snapFX = null; web = null; circuit = null; bolts = []; cracks = [];
    if (hero.cid === 'EA') { if (hero.angelLap) { hero.cid = 'E'; hero.angelLap = false; hero.armed = false; rest(hero); buildSkills(); } else hero.angelLap = true; }   // auto-play shows one full lap in angel form, then she starts over
    banner(STAGES[stageI].name, 1500); tween(fxState, 'black', 0, 500); later(520, () => { stageBusy = false; idleT = 0; setButtons(); then && then(); }); }); }

/* ---------- fire sigils (Jun) ---------- */
function drawSigils() {
  ctx.imageSmoothingEnabled = true;
  for (const s of sigils) { if (s.a <= .01 || s.s <= .01) continue; const F = AS.FX[s.kind || 'sigil'], im = img.fx[s.kind || 'sigil'], sz = F.w * s.s; if (s.follow) s.x = ENEMY + enemy.kb;
    ctx.save(); ctx.translate(s.x, s.y); ctx.scale(1, s.flat); ctx.rotate(s.rot);
    if (s.rev < 1) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, sz, -Math.PI / 2, -Math.PI / 2 + s.rev * Math.PI * 2); ctx.closePath(); ctx.clip(); }
    const fi = F.n > 1 ? Math.floor(performance.now() / 110) % F.n : 0, sh = sz * F.h / F.w; ctx.globalCompositeOperation = NORMAL.has(s.kind) ? 'source-over' : 'lighter'; ctx.globalAlpha = Math.min(1, s.a * (1 + s.pulse * .6)); ctx.drawImage(im, fi * F.w, 0, F.w, F.h, -sz / 2, -sh / 2, sz, sh); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, s.a * (.45 + s.pulse * .8)); ctx.filter = 'blur(8px)'; ctx.drawImage(im, fi * F.w, 0, F.w, F.h, -sz / 2 - 8, -sh / 2 - 8, sz + 16, sh + 16); ctx.filter = 'none';
    ctx.restore(); }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false;
}

/* ---------- burn-through: the frame of the verdict burns away like paper (Jun's finisher) ---------- */
const BW = 192, BH = 108;
const mkc = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function drawHalo() {   // Emi's finisher: golden rings sweep out across the screen from her staff
  if (!halo) return; ctx.globalCompositeOperation = 'lighter';
  for (const dl of [0, 160, 320]) { const t = halo.age - dl; if (t < 0) continue; const k = Math.min(1, t / 1100), r = 20 + ease.out(k) * 780, a = (1 - k);
    ctx.strokeStyle = `rgba(255,232,160,${a * .9})`; ctx.lineWidth = 3 + 9 * a; ctx.filter = 'blur(2px)'; ctx.beginPath(); ctx.ellipse(halo.x, halo.y, r, r * .38, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${a * .8})`; ctx.lineWidth = 1.5 + 2 * a; ctx.filter = 'none'; ctx.beginPath(); ctx.ellipse(halo.x, halo.y, r, r * .38, 0, 0, Math.PI * 2); ctx.stroke(); }
  const b = Math.max(0, 1 - halo.age / 700); if (b > 0) { const g = ctx.createRadialGradient(halo.x, halo.y, 0, halo.x, halo.y, 380); g.addColorStop(0, `rgba(255,250,232,${b * .45})`); g.addColorStop(1, 'rgba(255,240,200,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  ctx.globalCompositeOperation = 'source-over';
}
function freeze(o) { const sn = mkc(W, H); sn.getContext('2d').drawImage(cv, 0, 0); snapFX = Object.assign({ snap: sn, age: 0, life: 1300 }, o); if (o.type === 'frost' || o.type === 'ripple') snapFX.field = noiseField(o.x ?? ENEMY, o.y ?? FLOOR - 62, o.type === 'frost'); }
let bolts = [], cracks = [];
function bolt(x0, y0, x1, y1, life = 260, col = '255,240,140', w = 2) { bolts.push({ x0, y0, x1, y1, age: 0, life, col, w }); }
function arcs(x, y, n, r, col) { for (let k = 0; k < n; k++) { const a = rnd(0, Math.PI * 2); bolt(x, y, x + Math.cos(a) * r * rnd(.6, 1), y + Math.sin(a) * r * .7 * rnd(.6, 1), rnd(160, 300), col, rnd(1.2, 2.2)); } }
function card(x, y, vx, vy, life = 900) { parts.push({ t: 'card', x, y, px: x, py: y, vx, vy, g: .05, drag: .97, life, age: 0, rot: rnd(0, 6), vr: rnd(-.25, .25) }); }
function crackOn(x, y, life = 1400) { const lines = []; for (let k = 0; k < 9; k++) { let a = k / 9 * Math.PI * 2 + rnd(-.2, .2), px = 0, py = 0; const seg = [[0, 0]]; for (let j = 0; j < 4; j++) { a += rnd(-.5, .5); px += Math.cos(a) * rnd(8, 16); py += Math.sin(a) * rnd(6, 13); seg.push([px, py]); } lines.push(seg); } cracks.push({ x, y, lines, age: 0, life }); }
function drawBolts() {
  ctx.globalCompositeOperation = 'lighter';
  for (const b of bolts) { const k = 1 - b.age / b.life, n = Math.max(4, Math.round(Math.hypot(b.x1 - b.x0, b.y1 - b.y0) / 12));
    for (const [w, a] of [[b.w * 4, .2], [b.w, .95]]) { ctx.strokeStyle = `rgba(${b.col},${a * k})`; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(b.x0, b.y0);
      for (let i = 1; i < n; i++) { const q = i / n; ctx.lineTo(b.x0 + (b.x1 - b.x0) * q + rnd(-7, 7), b.y0 + (b.y1 - b.y0) * q + rnd(-7, 7)); } ctx.lineTo(b.x1, b.y1); ctx.stroke(); } }
  for (const c of cracks) { const k = Math.min(1, c.age / 120), out = Math.min(1, (c.life - c.age) / 400), cx = c.x + enemy.kb;
    for (const seg of c.lines) { ctx.strokeStyle = `rgba(255,255,255,${.85 * out})`; ctx.lineWidth = 1.5; ctx.beginPath(); seg.forEach(([px, py], i) => { const q = Math.min(i / (seg.length - 1), k * 1.5); i ? ctx.lineTo(cx + px * q, c.y + py * q) : ctx.moveTo(cx, c.y); }); ctx.stroke(); } }
  ctx.globalCompositeOperation = 'source-over';
}
// recoloured copies of Jun's fire effects, so every element gets slashes, waves, pillars, blasts and storms
const TINT = { ice: 'sepia(1) saturate(3.5) hue-rotate(160deg) brightness(.98)', elec: 'sepia(1) saturate(3.5) hue-rotate(12deg) brightness(1.2)', wind: 'sepia(1) saturate(3) hue-rotate(80deg) brightness(.95)', earth: 'sepia(.85) saturate(1.5) hue-rotate(-12deg) brightness(.78)',
  mind: 'sepia(1) saturate(5) hue-rotate(225deg) brightness(.85)', water: 'sepia(1) saturate(4) hue-rotate(175deg) brightness(.9)', metal: 'sepia(1) saturate(1.6) hue-rotate(170deg) brightness(1.05) contrast(1.25)', light: 'sepia(.35) saturate(.8) brightness(1.3)' };
function efx(kind, el, x, y, o = {}) { return fire(kind, x, y, Object.assign({ tint: TINT[el], el }, o)); }
function camPunch(x, y = FLOOR - 70, z = 1.25) { cam.fx = x; cam.fy = y; tween(cam, 'z', z, 90, 'out'); later(260, () => tween(cam, 'z', 1, 650, 'inout')); }
function focusHero(z = 1.15, ms = 600) { cam.fx = hero.x + 30; cam.fy = FLOOR - 70; tween(cam, 'z', z, ms, 'inout'); }
function converge(el, x, y, n = 60, ms = 900, r0 = 70, r1 = 120) { for (let q = 0; q < n; q++) later(q * ms / n, () => { const a = rnd(0, Math.PI * 2), r = rnd(r0, r1); ember(x + Math.cos(a) * r, y + Math.sin(a) * r * .6, { pal: el, vx: -Math.cos(a) * 2.3, vy: -Math.sin(a) * 1.4, g: 0, drag: .97, life: 600 }); }); }
function afterimages(n = 5, spread = 30, step = 60) { for (let k = 0; k < n; k++) later(k * step, () => trail.push({ x: hero.x - k * spread / n, f: hero.f, anim: hero.anim, a: .7 })); }
function ring(el, x, n = 8, r = 70, life = 2200, sc = [.7, 1]) { for (let k = 0; k < n; k++) { const a = k / n * Math.PI; later(k * 40, () => sprout(el, x + Math.cos(a) * r * (k % 2 ? 1 : -1), rnd(sc[0], sc[1]), life)); } }
function noiseField(cx0, cy0, edges) { const nc = mkc(BW, BH), nx = nc.getContext('2d'); nx.imageSmoothingEnabled = true;
  for (const [w, h, a] of [[12, 7, 1], [32, 18, .45], [70, 40, .2]]) { const sc = mkc(w, h), sx = sc.getContext('2d'), id = sx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) { const v = Math.random() * 255; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; } sx.putImageData(id, 0, 0); nx.globalAlpha = a; nx.drawImage(sc, 0, 0, BW, BH); }
  const nd = nx.getImageData(0, 0, BW, BH).data, f = new Float32Array(BW * BH), cx = cx0 / W * BW, cy = cy0 / H * BH, md = Math.hypot(BW, BH) * .6;
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) { const i = y * BW + x, edge = Math.min(x, BW - 1 - x, y * 1.6, (BH - 1 - y) * 1.6) / (BH * .8);
    f[i] = (edges ? edge * .8 : Math.hypot(x - cx, (y - cy) * 1.4) / md * .78) + nd[i * 4] / 255 * .32; } return f; }
function drawSnapFX() {   // the seven new finishers: each ultimate ends on its own screen effect
  const F = snapFX; if (!F) return; const t = F.age / F.life, sn = F.snap, fa = { kaleido: .35, ripple: .4, slices: .5 }[F.type] ?? .62, out = t > fa ? 1 - (t - fa) / (1 - fa) : 1; ctx.save(); ctx.imageSmoothingEnabled = true;
  if (F.type === 'frost') {   // Saya: the frame freezes over from the edges, a prism of light sweeps through, then it thaws away
    const th = ease.out(Math.min(1, t / .45)) * 1.15, mk = F.mk || (F.mk = mkc(BW, BH)), mc = mk.getContext('2d'), id = F.id || (F.id = mc.createImageData(BW, BH)), dd = id.data;
    for (let i = 0; i < BW * BH; i++) { const dv = th - F.field[i], o = i * 4; dd[o] = 196; dd[o + 1] = 228; dd[o + 2] = 255; dd[o + 3] = dv <= 0 ? 0 : Math.min(dv < .06 ? 170 : 85, dv * 900); } mc.putImageData(id, 0, 0);
    ctx.globalAlpha = out; ctx.filter = 'saturate(.6) brightness(1.02) hue-rotate(-10deg)'; ctx.drawImage(sn, 0, 0); ctx.filter = 'none'; ctx.drawImage(mk, 0, 0, W, H); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = out * .25; ctx.filter = 'blur(3px)'; ctx.drawImage(mk, 0, 0, W, H); ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = out;
    if (t > .3 && t < .8) { const k = (t - .3) / .5, x = -260 + k * (W + 520); ctx.globalCompositeOperation = 'lighter'; ctx.translate(x, 0); ctx.rotate(.35); const g = ctx.createLinearGradient(-90, 0, 90, 0);
      ['rgba(255,80,80,0)', 'rgba(255,90,90,.5)', 'rgba(255,220,80,.6)', 'rgba(120,255,140,.6)', 'rgba(90,170,255,.6)', 'rgba(200,110,255,.5)', 'rgba(200,110,255,0)'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c)); ctx.fillStyle = g; ctx.fillRect(-90, -300, 180, 1000); }
  } else if (F.type === 'split' || F.type === 'guillotine') {   // Raiden: a bolt splits the frame on the diagonal. Renji: a blade cuts it straight down.
    const gx = F.type === 'split' ? ENEMY : ENEMY, ang = F.type === 'split' ? -1.05 : -Math.PI / 2, d = t < .12 ? t / .12 * 14 : 14 + ease.out(Math.min(1, (t - .12) / .45)) * 380, nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2), dx = Math.cos(ang) * 900, dy = Math.sin(ang) * 900, gy = FLOOR - 62;
    ctx.globalAlpha = out;
    for (const sgn of [1, -1]) { ctx.save(); ctx.beginPath(); ctx.moveTo(gx - dx, gy - dy); ctx.lineTo(gx + dx, gy + dy); ctx.lineTo(gx + dx + nx * 1400 * sgn, gy + dy + ny * 1400 * sgn); ctx.lineTo(gx - dx + nx * 1400 * sgn, gy - dy + ny * 1400 * sgn); ctx.closePath(); ctx.clip(); ctx.drawImage(sn, nx * d * sgn, ny * d * sgn); ctx.restore(); }
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = out; const col = F.type === 'split' ? '255,240,140' : '235,245,255';
    for (const [w, a] of [[16, .25], [5, .7], [2, 1]]) { ctx.strokeStyle = `rgba(${col},${a})`; ctx.lineWidth = w; ctx.beginPath();
      if (F.type === 'split') { for (let k = 0; k <= 24; k++) { const q = k / 24 * 2 - 1, j = k % 2 ? rnd(-9, 9) : 0; ctx.lineTo(gx + dx * q * .5 + nx * j, gy + dy * q * .5 + ny * j); } } else { ctx.moveTo(gx, -10); ctx.lineTo(gx, H + 10); } ctx.stroke(); }
  } else if (F.type === 'slices') {   // Nao: wind cuts the frame into slanted strips that slide apart
    ctx.globalAlpha = out; const n = 7, sl = .25, hh = H / n;
    for (let k = 0; k < n; k++) { const off = (k % 2 ? 1 : -1) * (t < .15 ? t / .15 * 20 : 20 + ease.in(Math.min(1, (t - .15) / .6)) * 420); ctx.save(); ctx.beginPath(); ctx.moveTo(-60, k * hh - sl * 60); ctx.lineTo(W + 60, k * hh + sl * (W + 60) - sl * 60 - W * sl); ctx.lineTo(W + 60, (k + 1) * hh + sl * (W + 60) - sl * 60 - W * sl); ctx.lineTo(-60, (k + 1) * hh - sl * 60); ctx.closePath(); ctx.clip(); ctx.drawImage(sn, off, 0); ctx.restore();
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(230,255,235,${.8 * out})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-60, k * hh - sl * 60); ctx.lineTo(W + 60, k * hh + sl * (W + 60) - sl * 60 - W * sl); ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; }
  } else if (F.type === 'kaleido') {   // Hina: the frame folds into a turning kaleidoscope of mirrored thoughts
    const n = 8, cx = F.x ?? ENEMY, cy = F.y ?? FLOOR - 70, sp = ease.inout(Math.min(1, t / .6)) * 1.2, R = 900; ctx.globalAlpha = out;
    for (let k = 0; k < n; k++) { const a0 = k / n * Math.PI * 2; ctx.save(); ctx.translate(cx, cy); ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a0, a0 + Math.PI * 2 / n + .01); ctx.closePath(); ctx.clip();
      ctx.rotate(sp * (k % 2 ? -1 : 1)); if (k % 2) ctx.scale(-1, 1); ctx.scale(1 + t * .15, 1 + t * .15); ctx.drawImage(sn, -cx, -cy); ctx.restore(); }
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(214,160,255,${.7 * out})`; ctx.lineWidth = 1.5; for (let k = 0; k < n; k++) { const a0 = k / n * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R); ctx.stroke(); }
  } else if (F.type === 'ripple') {   // Mina: the frame ripples and rewinds like a reflection in water
    ctx.globalAlpha = out; const A = 14 * (1 - t), ph = F.age / 90;
    for (let y = 0; y < H; y += 3) ctx.drawImage(sn, 0, y, W, 3, Math.sin(y / 11 + ph) * A, y, W, 3);
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(80,170,255,${.18 * out})`; ctx.fillRect(0, 0, W, H);
    for (let k = 0; k < 5; k++) { const yy = (H - ((F.age * .5 + k * 80) % (H + 40))); ctx.fillStyle = `rgba(200,240,255,${.25 * out})`; ctx.fillRect(0, yy, W, 2); }
  } else if (F.type === 'wall') {   // Taiga: a stone wall rises over the whole frame, then crumbles away
    const wi = img.fx.ea_big, Fw = AS.FX.ea_big, k1 = Math.min(1, t / .35), top = H - ease.out(k1) * (H + 30), cols = 6, rows = 4, bw = W / cols + 2, bh = (H + 40) / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const fall = t > .4 ? Math.max(0, t - .4 - ((c + r) % 3) * .05) : 0, fy = fall * fall * 2400, rot = fall * ((c + r) % 2 ? 2 : -2);
      if (fy > H + 100) continue; ctx.save(); ctx.translate(c * bw + bw / 2, top + r * bh + bh / 2 + fy); ctx.rotate(rot); ctx.filter = 'brightness(.85)'; ctx.drawImage(wi, (c % 2) * Fw.w * .3, (r % 2) * Fw.h * .3, Fw.w * .7, Fw.h * .7, -bw / 2 - 1, -bh / 2 - 1, bw + 2, bh + 2); ctx.filter = 'none'; ctx.restore(); }
  }
  ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none'; ctx.imageSmoothingEnabled = false;
}
function drawWeb() { if (!web) return; const k = Math.min(1, web.age / 500), out = Math.min(1, (web.life - web.age) / 300); ctx.globalCompositeOperation = 'lighter';   // Hina's web of logic
  for (const [a, b] of web.lines) { const p = web.pts[a], q = web.pts[b], sh = web.shrink ? 1 - ease.in(Math.min(1, Math.max(0, web.age - web.shrink) / 300)) : 1, cx = ENEMY + enemy.kb, cy = FLOOR - 66;
    const px = cx + (p[0] - cx) * sh, py = cy + (p[1] - cy) * sh, qx = cx + (q[0] - cx) * sh, qy = cy + (q[1] - cy) * sh;
    ctx.strokeStyle = `rgba(210,160,255,${.75 * out})`; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + (qx - px) * k, py + (qy - py) * k); ctx.stroke(); }
  ctx.globalCompositeOperation = 'source-over'; }
function drawCircuit() { if (!circuit) return; const k = Math.min(1, circuit.age / 700), out = Math.min(1, (circuit.life - circuit.age) / 400); ctx.globalCompositeOperation = 'lighter';   // Raiden's circuit traced across the floor
  for (const path of circuit.paths) { const n = Math.floor(path.length * k); ctx.strokeStyle = `rgba(255,236,120,${.8 * out})`; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < Math.max(1, n); i++) ctx.lineTo(path[i][0], path[i][1]); ctx.stroke();
    ctx.strokeStyle = `rgba(255,236,120,${.25 * out})`; ctx.lineWidth = 7; ctx.stroke(); }
  ctx.globalCompositeOperation = 'source-over'; }
function makeBurn() {
  const snap = mkc(W, H), sg = snap.getContext('2d'); sg.filter = 'sepia(.7) contrast(1.35) brightness(.72) saturate(1.2)'; sg.drawImage(cv, 0, 0); sg.filter = 'none';   // the frozen frame reads as old paper
  const nc = mkc(BW, BH), nx = nc.getContext('2d'); nx.imageSmoothingEnabled = true;
  for (const [w, h, a] of [[12, 7, 1], [32, 18, .45], [70, 40, .2]]) { const sc = mkc(w, h), sx = sc.getContext('2d'), id = sx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) { const v = Math.random() * 255; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; } sx.putImageData(id, 0, 0); nx.globalAlpha = a; nx.drawImage(sc, 0, 0, BW, BH); }
  const nd = nx.getImageData(0, 0, BW, BH).data, cx = ENEMY / W * BW, cy = (FLOOR - 62) / H * BH, md = Math.hypot(BW, BH) * .8, field = new Float32Array(BW * BH);
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) { const i = y * BW + x; field[i] = Math.hypot(x - cx, (y - cy) * 1.4) / md * .78 + nd[i * 4] / 255 * .34; }
  let mn = 9; for (let i = 0; i < field.length; i++) mn = Math.min(mn, field[i]); for (let i = 0; i < field.length; i++) field[i] -= mn - .01;   // the hole opens right at the impact
  const keep = mkc(BW, BH), edge = mkc(BW, BH), rim = mkc(BW, BH);
  burn = { snap, field, age: 0, th: 0, keep, edge, rim, kid: keep.getContext('2d').createImageData(BW, BH), eid: edge.getContext('2d').createImageData(BW, BH), rid: rim.getContext('2d').createImageData(BW, BH), tmp: mkc(W, H), sparks: [] };
}
function stepBurn(d) {
  burn.age += d; burn.th = ease.out(Math.min(1, burn.age / 1000)) * 1.15;
  for (let k = 0; k < 7; k++) { const i = Math.random() * BW * BH | 0; if (Math.abs(burn.field[i] - burn.th) < .03) burn.sparks.push({ x: (i % BW + .5) * W / BW, y: ((i / BW | 0) + .5) * H / BH, vx: rnd(-1, 1), vy: rnd(-2.6, -.6), age: 0, life: rnd(400, 800) }); }
  for (const p of burn.sparks) { p.age += d; p.x += p.vx * d / 16; p.y += p.vy * d / 16; p.vy -= .01 * d / 16; } burn.sparks = burn.sparks.filter(p => p.age < p.life);
  if (burn.age > 1100) burn = null;
}
function drawBurn() {
  if (!burn) return; const th = burn.th, F = burn.field, kd = burn.kid.data, ed = burn.eid.data, rd = burn.rid.data;
  for (let i = 0; i < BW * BH; i++) { const v = F[i], o = i * 4, dv = v - th;
    kd[o + 3] = dv <= 0 ? 0 : dv > .02 ? 255 : dv / .02 * 255;
    const e = Math.max(0, 1 - Math.abs(dv) / .06); ed[o] = 255; ed[o + 1] = 120 + 110 * e; ed[o + 2] = 40 + 60 * e * e; ed[o + 3] = e * 255;
    const r = dv > 0 && dv < .13 ? 1 - dv / .13 : 0; rd[o] = 26; rd[o + 1] = 8; rd[o + 2] = 2; rd[o + 3] = r * 235; }
  burn.keep.getContext('2d').putImageData(burn.kid, 0, 0); burn.edge.getContext('2d').putImageData(burn.eid, 0, 0); burn.rim.getContext('2d').putImageData(burn.rid, 0, 0);
  const t = burn.tmp.getContext('2d'); t.imageSmoothingEnabled = true; t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, W, H); t.drawImage(burn.snap, 0, 0);
  t.globalCompositeOperation = 'destination-in'; t.drawImage(burn.keep, 0, 0, W, H); t.globalCompositeOperation = 'source-atop'; t.drawImage(burn.rim, 0, 0, W, H); t.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = true; ctx.drawImage(burn.tmp, 0, 0);
  ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(burn.edge, 0, 0, W, H); ctx.globalAlpha = .8; ctx.filter = 'blur(6px)'; ctx.drawImage(burn.edge, -4, -4, W + 8, H + 8); ctx.filter = 'none';
  for (const p of burn.sparks) { ctx.globalAlpha = 1 - p.age / p.life; ctx.fillStyle = p.age < 150 ? '#fff1c4' : '#ffa340'; ctx.fillRect(p.x, p.y, 2, 2); }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false;
}
function drawWorld() {
  drawStageBack();
  drawMoon();
  ctx.globalCompositeOperation = 'lighter';
  for (const f of fxs) { if (f.age < 0 || !(f.lights || SHAD.has(f.kind))) continue; const k = Math.max(0, Math.min(1, (f.life - f.age) / 400)), gx = f.x + (f.follow ? enemy.kb : 0), R = 52 * f.scale + 22, sh = SHAD.has(f.kind);
    const g = ctx.createRadialGradient(gx, FLOOR, 2, gx, FLOOR, R); g.addColorStop(0, sh ? `rgba(150,80,255,${.3 * k})` : `rgba(255,140,50,${.34 * k})`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(gx, FLOOR, R, R * .34, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalCompositeOperation = 'source-over';
  for (const sc of scorch) { const k = 1 - sc.age / sc.life; ctx.fillStyle = `rgba(${sc.col || '14,6,4'},${.5 * k})`; ctx.beginPath(); ctx.ellipse(sc.x, FLOOR + 2, sc.w, 4, 0, 0, Math.PI * 2); ctx.fill(); }
  drawPools();
  drawCircuit();
  drawSigils();
  drawParts('smoke');
  for (const f of fxs) if (f.layer === 'back') drawFx(f);
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  for (const [x, rx] of [[hero.x, 34 - Math.min(14, -hero.y / 3)], [ally.hidden ? -999 : ally.x, 28], [tgt.hidden ? -999 : tgt.x + enemy.kb, 32]]) { ctx.beginPath(); ctx.ellipse(Math.round(x), FLOOR + 4, rx, 6, 0, 0, Math.PI * 2); ctx.fill(); }
  if (!ally.hidden) drawActor(ally);
  if (!tgt.hidden) drawActor(tgt);
  for (const t of trail) drawActor(hero, { x: t.x, f: t.f, anim: t.anim, alpha: t.a * .6, tint: CH[hero.cid].afterTint });
  drawActor(hero);
  drawChain();
  drawWeb();
  drawBolts();
  for (const f of fxs) if (f.layer !== 'back') drawFx(f);
  drawParts('glow');
  const RL = roomLight();
  if (RL.e > .02 && RL.ec) { const ee = Object.values(ELS).find(e => e.col === RL.ec); ctx.globalCompositeOperation = ee && ee.dark ? 'source-over' : 'lighter'; ctx.globalAlpha = RL.e * (ee && ee.dark ? .12 : .1); ctx.fillStyle = RL.ec; ctx.fillRect(-40, -40, W + 80, H + 80); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
  if (RL.l > .02) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,236,190,${RL.l * .09})`; ctx.fillRect(-40, -40, W + 80, H + 80); ctx.globalCompositeOperation = 'source-over'; }
  if (RL.f > .02) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,110,36,${RL.f * .13 * (.9 + .1 * Math.sin(performance.now() / 70))})`; ctx.fillRect(-40, -40, W + 80, H + 80); ctx.globalCompositeOperation = 'source-over'; }
  if (RL.s > .02) { ctx.fillStyle = `rgba(8,0,18,${Math.min(.3, RL.s * .14)})`; ctx.fillRect(-40, -40, W + 80, H + 80); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(120,60,230,${RL.s * .07})`; ctx.fillRect(-40, -40, W + 80, H + 80); ctx.globalCompositeOperation = 'source-over'; }
  drawStageFront();
  ctx.globalCompositeOperation = 'lighter';
  for (const st of streaks) { const k = st.age / st.life, r0 = 20 + k * 120; ctx.strokeStyle = `rgba(${st.col},${1 - k})`; ctx.lineWidth = st.w;
    ctx.beginPath(); ctx.moveTo(st.x + Math.cos(st.a) * r0, st.y + Math.sin(st.a) * r0 * .7); ctx.lineTo(st.x + Math.cos(st.a) * (r0 + st.len), st.y + Math.sin(st.a) * (r0 + st.len) * .7); ctx.stroke(); }
  ctx.globalCompositeOperation = 'source-over';
  for (const n of nums) drawNum(n);
}
function drawMoon() {
  if (!moon) return; const F = AS.FX.moon, w = F.w * moon.s, h = F.h * moon.s, x = moon.x - w / 2, y = moon.y - h / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = moon.a * .55; ctx.drawImage(softTint('#7a3cff'), moon.x - w, moon.y - h, w * 2, h * 2); ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = moon.a; ctx.drawImage(img.fx.moon, x, y, w, h);
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = moon.a * .5; ctx.filter = 'blur(8px)'; ctx.drawImage(img.fx.moon, x - 8, y - 8, w + 16, h + 16); ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
  if (moon.clock > .01) { const cw = AS.FX.clock.w * moon.s * .78, cx = moon.x, cy = moon.y;
    ctx.globalAlpha = moon.clock * (moon.crack ? .75 + .25 * Math.sin(performance.now() / 30) : 1); ctx.drawImage(img.fx.clock, cx - cw / 2, cy - cw / 2, cw, cw);
    const hand = (deg, len, wdt, col) => { const r = (deg - 90) * Math.PI / 180; ctx.strokeStyle = col; ctx.lineWidth = wdt; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(r) * len, cy + Math.sin(r) * len); ctx.stroke(); };
    hand(357, cw * .22, 5, '#1a0c06'); hand(357, cw * .22, 2.5, '#e2b04a'); hand(moon.min, cw * .36, 4, '#1a0c06'); hand(moon.min, cw * .36, 2, '#f2d38a');
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = moon.clock * .6; ctx.fillStyle = '#c99bff'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
  ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false;
}
function label(text, x, y, col, a) { ctx.globalAlpha = Math.max(0, a); ctx.font = '700 14px "Rift Body", Lexend, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#120a10'; ctx.strokeText(text, x, y); ctx.fillStyle = col; ctx.fillText(text, x, y); ctx.globalAlpha = 1; }
function drawUI() {
  const LB = Math.round(fxState.letter * 38); if (LB > 0) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, LB); ctx.fillRect(0, H - LB, W, LB); }
  const b = fxState.banner; if (b) { ctx.save(); ctx.translate(0, LB); const a = Math.min(1, b.age / 120, (b.life - b.age) / 200); ctx.globalAlpha = Math.max(0, a);
    ctx.font = '700 15px Cinzel, Georgia, serif'; ctx.textAlign = 'center'; const tw = ctx.measureText(b.text).width + 34, x = W / 2 - tw / 2;
    ctx.fillStyle = 'rgba(12,10,20,.82)'; ctx.fillRect(x, 18, tw, 28); ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, 18.5, tw - 1, 27);
    ctx.fillStyle = '#f4ecd8'; ctx.fillText(b.text, W / 2, 37); ctx.globalAlpha = 1; ctx.restore(); }
  const u = fxState.buff; if (u) { const a = Math.min(1, u.age / 200, (u.life - u.age) / 300), yy = -Math.min(1, u.age / 300) * 10; (u.who === 'self' ? [hero.x] : [EMI_X, hero.x]).forEach((x, i) => label(u.text || 'DMG -30%', x + (u.who === 'self' ? 0 : i ? 14 : -10), FLOOR - 136 + yy - (u.who === 'self' ? 0 : i * 18), u.col || '#ffd27a', a)); }
  const db = fxState.debuff; if (db) { const a = Math.min(1, db.age / 200, (db.life - db.age) / 300), yy = -Math.min(1, db.age / 300) * 10; label(db.text, ENEMY + enemy.kb, FLOOR - 178 + yy, '#d2b8ff', a); }
  const c = fxState.cutin; if (c) { const p = c.age / c.life, inP = Math.min(1, p / .18), outP = p > .78 ? (p - .78) / .22 : 0, slide = (1 - ease.out(inP)) * -W + ease.in(outP) * W;
    ctx.save(); ctx.translate(slide, 0); ctx.fillStyle = c.col; ctx.beginPath(); ctx.moveTo(0, 96); ctx.lineTo(W, 66); ctx.lineTo(W, 266); ctx.lineTo(0, 296); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.clip(); ctx.drawImage(img[c.img], 250 + p * 30, 40, 410, 310); ctx.restore();
    ctx.fillStyle = '#10060e'; ctx.fillRect(0, 92, W, 5); ctx.fillRect(0, 290, W, 5);
    ctx.font = 'italic 900 36px Cinzel, Georgia, serif'; ctx.textAlign = 'left'; ctx.lineWidth = 6; ctx.strokeStyle = '#14040c'; ctx.strokeText(c.title, 30, 200); ctx.fillStyle = '#fff1d6'; ctx.fillText(c.title, 30, 200);
    ctx.font = '600 14px "Rift Body", Lexend, system-ui, sans-serif'; ctx.fillStyle = '#e8dcff'; ctx.fillText(c.sub, 32, 224); ctx.restore(); }
}
const scene = document.createElement('canvas'); scene.width = W; scene.height = H; scene.__dyn = true; const sctx = scene.getContext('2d');
function draw() {
  const m = fxState.shake > 0 ? fxState.shakeMag : 0, sx = Math.round(rnd(-1, 1) * m), sy = Math.round(rnd(-1, 1) * m * .8);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
  ctx.setTransform(cam.z, 0, 0, cam.z, cam.fx - cam.fx * cam.z + sx, cam.fy - cam.fy * cam.z + sy);
  drawWorld();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (fxState.chroma > 0 && !LITE) { const k = Math.min(1, fxState.chroma / 300), o = Math.round(2 + 4 * k);
    sctx.clearRect(0, 0, W, H); sctx.drawImage(cv, 0, 0); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .26 * k;
    ctx.filter = 'sepia(1) saturate(12) hue-rotate(-40deg)'; ctx.drawImage(scene, -o, 0); ctx.filter = 'sepia(1) saturate(12) hue-rotate(150deg)'; ctx.drawImage(scene, o, 0);
    ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
  const D = fxState.despair, g = ctx.createRadialGradient(W / 2, H / 2, H * (.35 - .2 * D), W / 2, H / 2, H * (.85 - .15 * D)); g.addColorStop(0, 'rgba(0,0,0,0)'); const I = fxState.inferno; g.addColorStop(1, `rgba(${Math.round(6 + 20 * D + 70 * I)},${Math.round(4 + 8 * I)},${Math.round(12 + 30 * D)},${(.58 + .32 * D + .15 * I) * (1 - .45 * fxState.dawn)})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (shatterNext && !reduce) { shatterNext = false; makeShards(); }
  drawShards();
  if (burnNext) { burnNext = false; if (!reduce) makeBurn(); }
  drawBurn();
  drawHalo();
  if (snapNext) { const sn = mkc(W, H); sn.getContext('2d').drawImage(cv, 0, 0); snapFX = Object.assign({ snap: sn, age: 0, life: 1300 }, snapNext); snapNext = null; if (snapFX.type === 'frost' || snapFX.type === 'ripple') snapFX.field = noiseField(snapFX.x ?? ENEMY, snapFX.y ?? FLOOR - 62, snapFX.type === 'frost'); }
  drawSnapFX();
  if (fxState.flash > 0 && !reduce) { ctx.fillStyle = `rgba(${fxState.flashCol},${fxState.flash * .4})`; ctx.fillRect(0, 0, W, H); }
  if (fxState.black > 0) { ctx.fillStyle = `rgba(0,0,0,${fxState.black})`; ctx.fillRect(0, 0, W, H); }
  drawUI();
}
function makeShards() {
  const snap = document.createElement('canvas'); snap.width = W; snap.height = H; snap.getContext('2d').drawImage(cv, 0, 0);
  const cols = 9, rows = 6, cx = ENEMY, cy = FLOOR - 62, pts = [];
  for (let j = 0; j <= rows; j++) { pts.push([]); for (let i = 0; i <= cols; i++) { const edge = i === 0 || j === 0 || i === cols || j === rows; pts[j].push([i * W / cols + (edge ? 0 : rnd(-18, 18)), j * H / rows + (edge ? 0 : rnd(-14, 14))]); } }
  const list = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = pts[j][i], b = pts[j][i + 1], c = pts[j + 1][i + 1], d = pts[j + 1][i];
    for (const tri of [[a, b, c], [a, c, d]]) { const mx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, my = (tri[0][1] + tri[1][1] + tri[2][1]) / 3, dx = mx - cx, dy = my - cy, dist = Math.hypot(dx, dy) + 1;
      list.push({ tri, mx, my, vx: dx / dist * rnd(5, 11), vy: dy / dist * rnd(4, 9) - rnd(0, 3), vr: rnd(-.12, .12), delay: dist * .6 }); } }
  shards = { snap, list, age: -160 }; SFX.shatter();
}
function drawShards() {
  if (!shards) return; const t = shards.age;
  for (const s of shards.list) { const tt = Math.max(0, t - s.delay), k = tt / 16, ox = s.vx * k + (tt > 0 ? 0 : 0), oy = s.vy * k + .18 * k * k;
    if (tt > 900) continue; ctx.save(); ctx.globalAlpha = Math.max(0, 1 - tt / 900) * (t < 0 ? 1 : 1);
    ctx.translate(s.mx + ox, s.my + oy); ctx.rotate(s.vr * k); ctx.translate(-s.mx, -s.my);
    ctx.beginPath(); ctx.moveTo(...s.tri[0]); ctx.lineTo(...s.tri[1]); ctx.lineTo(...s.tri[2]); ctx.closePath(); ctx.clip();
    ctx.drawImage(shards.snap, 0, 0); ctx.strokeStyle = 'rgba(230,210,255,.8)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore(); }
}
function frame(now) { const dt = Math.min(50, now - (last || now)); last = now; musicStep(dt); step(dt); draw(); requestAnimationFrame(frame); }

/* ---------- theatre: the game drives the lab engine from here ---------- */
function setButtons() {}
function buildSkills() {}

// One real number per action. The lab's sample numbers are swapped for the battle's result:
// the first big damage number shows the real total (with WEAK / RESIST / CRITICAL), heal numbers show the real heals,
// and the lab's small "tick" numbers are left out so nothing on screen disagrees with the HP bars.
function num(v, x, y, big, delay = 0, kind) {
  if (!PLAY) return num0(v, x, y, big, delay, kind);
  if (kind === 'heal' || /^\+\d/.test(v)) { const h = PLAY.heals.shift(); if (h == null) return; return num0('+' + h, x, y, true, delay, 'heal'); }
  if (typeof v === 'string') return num0(v, x, y, big, delay, kind);
  if (!big || PLAY.dmgShown) return;
  showDamage(x, y, delay);
}
function showDamage(x, y, delay = 0) {
  const o = PLAY.o; PLAY.dmgShown = true;
  if (o.miss) { num0('MISS', x, y, true, delay, 'miss'); return; }
  if (o.dmg == null) return;
  num0(o.dmg, x, y, true, delay, o.crit ? 'crit' : undefined);
  const tag = o.weak ? ['WEAK!', 'weak'] : o.resist ? ['RESIST', 'resist'] : o.crit ? ['CRITICAL', 'crit'] : null;
  if (tag) num0(tag[0], x, y - 42, false, delay + 140, tag[1]);
}

// Basic strike: a dash in, one hit in the fighter's own style, a dash home. Shorter and lighter than any skill.
const STRIKE_HIT = { S: 5, R: 4, N: 5, T: 5, H: 5, M: 5, X: 5 };
const STRIKES = {
  J() { dashTo(STRIKE, 320, () => {
      play('atk', range(1, 12), [70, 70, 80, 120, 55, 60, 80, 80, 80, 80, 90, 100], { on: { 2: () => SFX.ignite(), 5: () => { SFX.swing(); voice('v_yell', { vol: .6 }); },
        6: () => { SFX.hit(); impactFX({ chroma: 80, power: .8 }); fire('slash', ENEMY - 10, FLOOR - 58, { anchor: 'center', fps: 55, glow: .4 });
          for (const [dx, sc] of [[-16, .6], [14, .7]]) fire('g2', ENEMY + dx, FLOOR + 4, { loop: true, scale: sc, life: 1100, fps: 60, follow: true, lights: true });
          num(1, ENEMY - 4, FLOOR - 110, true); } } });
      later(950, () => dashHome(done)); }); },
  K() { dashTo(ENEMY - 180, 280, () => {
      play('hex', range(1, 12), [60, 55, 55, 50, 50, 50, 55, 80, 55, 140, 100, 110], { on: { 1: () => SFX.whirl(), 8: () => SFX.swing(),
        9: () => { SFX.chain(); SFX.dark(); impactFX({ pal: 'shadow', chroma: 120, curse: 1200, power: .9 }); darkPool(ENEMY, 70, 1800);
          fire('sburst', ENEMY, FLOOR - 64, { anchor: 'center', fps: 55, glow: .5 }); for (const dx of [-40, 38]) darkSprout(ENEMY + dx, rnd(.7, .9), rnd(1400, 1900));
          num(1, ENEMY - 4, FLOOR - 120, true); } } });
      later(1050, () => dashHome(done)); }); },
  E() { const n = AS[hero.cid].purify.n;
    play('purify', range(0, n - 1), range(0, n - 1).map(i => i < 4 ? 90 : 80), { on: { 2: () => { SFX.holy(); orb(hero.x + 44, FLOOR - 74, 44, 300, '#fff1c4'); },
      4: () => { SFX.swing(); const sx = hero.x + 44, sy = FLOOR - 74;   // a lance of light flies to the enemy
        for (let q = 0; q < 40; q++) later(q * 8, () => ember(sx + rnd(-4, 4), sy + rnd(-4, 4), { pal: 'light', vx: (ENEMY - sx) / 30 + rnd(-.3, .3), vy: rnd(-.4, .4), g: 0, drag: 1, life: 520 }));
        later(380, () => { SFX.chime(); impactFX({ pal: 'light', chroma: 60, power: .8, curse: 0, flash: .3 }); fire('lpillar', ENEMY, FLOOR + 8, { scale: .55, fps: 60, glow: .3, follow: true });
          tween(fxState, 'dawn', .18, 150); later(500, () => tween(fxState, 'dawn', 0, 600)); num(1, ENEMY - 4, FLOOR - 118, true); }); } },
      after: () => rest(hero) });
    later(1500, done); },
};
STRIKES.EA = STRIKES.E;
for (const cid of Object.keys(NEWC)) STRIKES[cid] = () => { const el = CH[cid].el;
  afterimages(2); dashTo(STRIKE + 10, 280, () => { act(NEWC[cid].sk[0], STRIKE_HIT[cid], () => { SFX.el(el, 'hit'); shout();
    efx('slash', el, ENEMY - 8, FLOOR - 62, { anchor: 'center', fps: 50, glow: .3 }); elHit(el, { power: .9, chroma: 120, streaks: 8, stop: 120, shake: 260, mag: 5, curse: 1200 });
    camPunch(ENEMY, FLOOR - 70, 1.12); num(1, ENEMY, FLOOR - 120, true); }); later(1300, () => dashHome(done)); }); };

// ---------- running one action ----------
let SIM = false, slow = 0, running = false, lastT = 0, idleFrames = 0, safety = 0;
function loop(now) {
  const dt = Math.min(100, now - (lastT || now)); lastT = now;
  if (!SIM) { musicStep(dt); step(dt); } draw();
  if (PLAY && !SIM && !LITE) { slow = slow * .95 + (dt > 40 ? .05 : 0); if (slow > .6) LITE = true; }   // most recent frames over 40 ms: go lite for the session
  if (PLAY || idleFrames-- > 0) requestAnimationFrame(loop); else running = false;
}
function startLoop() { idleFrames = 30; if (!running) { running = true; lastT = 0; requestAnimationFrame(loop); } }

function resetWorld() {
  timers = []; tweens = []; fxs = []; parts = []; scorch = []; nums = []; pools = []; sigils = []; streaks = []; trail = []; featherRain = 0; elRain = null; snapFX = null; snapNext = null;
  web = null; circuit = null; bolts = []; cracks = []; shards = null; shatterNext = false; burn = null; burnNext = false; halo = null; moon = null; chainShot = null; emiGlow = 0; allyCurse = 0; trailing = 0;
  Object.assign(fxState, { eg: 0, dawn: 0, inferno: 0, black: 0, despair: 0, letter: 0, dim: 0, flash: 0, shake: 0, chroma: 0, hitstop: 0, banner: null, cutin: null, buff: null, debuff: null });
  Object.assign(enemy, { kb: 0, hit: 0, burn: 0, curse: 0, et: 0 }); Object.assign(cam, { z: 1, fx: W / 2, fy: H / 2 });
}
function finishPlay() {
  const P = PLAY; if (!P || P.ending) return; P.ending = true; const o = P.o; let wait = 380;
  if (!P.dmgShown && (o.dmg != null || o.miss)) { showDamage(ENEMY, FLOOR - 120); wait = 900; }
  for (const h of P.heals.splice(0)) { num0('+' + h, ally.hidden ? hero.x + 30 : ally.x + 30, FLOOR - 150, true, 0, 'heal'); wait = Math.max(wait, 900); }
  if (o.ko && !tgt.hidden) { later(wait - 300, () => { SFX.dark(); for (let q = 0; q < 16; q++) smoke(tgt.x + rnd(-30, 30), FLOOR - rnd(10, 110), 1.2, '#2a2230'); num0('K.O.', tgt.x, FLOOR - 160, true, 0, 'crit'); later(260, () => tgt.hidden = true); }); wait += 700; }
  later(wait, () => endPlay());
}
function endPlay() {
  const P = PLAY; if (!P) return; PLAY = null; clearTimeout(safety); busy = false;
  if (MUSIC.el) MUSIC.el.volume = MUSIC.vol;
  P.res({ angel: hero.cid === 'EA' });
}

const MUSIC = { el: null, vol: .38 };
const STAGE_URLS = [];
let MAN = null, initP = null, coreP = null; const charP = {}, stageP = {};
const loadImg = src => new Promise(r => { const i = new Image(); i.decoding = 'async'; i.onload = () => r(i); i.onerror = () => r(null); i.src = BASE + src; });
function init(o = {}) {
  if (initP) return initP; BASE = o.base || ''; if (o.stages) STAGE_URLS.push(...o.stages);
  initP = fetch(BASE + 'theatre/manifest.json').then(r => r.json()).then(m => { MAN = m;
    for (const [k, v] of Object.entries(m.FX)) AS.FX[k] = v;
    for (const [cid, anims] of Object.entries(m.chars)) AS[cid] = anims;
    Object.assign(SND.src, m.sfx); Object.assign(SND.loud, m.loud); img.fx = {}; img.stages = []; });
  return initP;
}
function loadCore() { return coreP || (coreP = init().then(() => { img.fxG = {}; img.fxT = {}; if (MAN.GS) AS.GS = MAN.GS;
  return Promise.all([...Object.entries(MAN.FX).map(([k, v]) => loadImg(v.src).then(i => { img.fx[k] = i; })),
    ...Object.entries(MAN.FXG || {}).map(([k, u]) => loadImg(u).then(i => { if (i) img.fxG[k] = i; }))]); })); }
const tintP = {};
function loadTints(el) { return tintP[el] || (tintP[el] = loadCore().then(() => Promise.all(Object.entries(MAN.FXT || {}).filter(([k]) => k.endsWith('|' + el))
  .map(([k, [a, b]]) => Promise.all([loadImg(a), loadImg(b)]).then(([x, y]) => { if (x && y) img.fxT[k] = [x, y]; }))))); }
// stages are scaled once to the size they are drawn at, so grading them (in JS on iPads) touches as few pixels as possible
function loadStage(i) { return stageP[i] || (stageP[i] = init().then(() => loadImg(STAGE_URLS[i % STAGE_URLS.length] || STAGE_URLS[0]).then(im => {
  if (!im) return; const c = document.createElement('canvas'); c.width = W + 40; c.height = H + 24; const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, c.width, c.height); img.stages[i] = c; }))); }
function loadChar(cid) {
  if (charP[cid]) return charP[cid];
  return (charP[cid] = init().then(() => { img[cid] = img[cid] || {}; const port = cid === 'EA' ? 'E' : cid;
    return Promise.all([...Object.entries(MAN.chars[cid]).map(([k, v]) => loadImg(v.src).then(i => { img[cid][k] = i; })),
      MAN.portraits[port] ? loadImg(MAN.portraits[port]).then(i => { img['portrait' + cid] = i; }) : null]); }));
}
// the element tints are filtered once up front on browsers without canvas filters, so the first cast does not stall
function warm(cids) {
  if (FILTER_OK || !window.__theatreWarm) return;
  const jobs = [];
  for (const c of cids) if (CH[c] && img[c] && img[c].dash) jobs.push([img[c].dash, CH[c].afterTint]);   // the afterimages of a dash
  if (!(MAN && MAN.FXT)) for (const el of new Set(cids.map(c => CH[c] && CH[c].el).filter(Boolean))) for (const k of ['slash', 'wave', 'pillar', 'blast', 'storm', 'aura', 'wall', 'burst']) if (img.fx[k]) { jobs.push([img.fx[k], TINT[el]]); jobs.push([img.fx[k], TINT[el] + ' blur(9px)']); }
  const idle = window.requestIdleCallback ? (fn) => requestIdleCallback(fn, { timeout: 4000 }) : (fn) => setTimeout(fn, 60);
  const next = () => { if (PLAY) return idle(next); const j = jobs.shift(); if (!j) return; window.__theatreWarm(j[0], j[1]); idle(next); }; idle(next);
}
function prepare(cids, stage = 0) {
  const all = [...new Set(cids.filter(Boolean).flatMap(c => c === 'E' ? ['E', 'EA'] : [c]))];
  const fonts = document.fonts ? Promise.all(['italic 900 40px Cinzel', '700 22px Cinzel', '600 14px "Rift Body"'].map(f => document.fonts.load(f).catch(() => {}))) : null;
  const els = [...new Set(all.map(c => CH[c] && CH[c].el).filter(Boolean))];
  return Promise.all([loadCore(), loadStage(stage), fonts, ...all.map(loadChar), ...els.map(loadTints)]).then(() => {
    warm(all);
    if (!PLAY) { stageI = stage; resetWorld(); try { drawStageBack(); drawStageFront(); } catch (e) {} }   // grade this stage's layers now, not on the first hit
  });
}
const readyFor = (cids, stage) => !!(MAN && img.fx && Object.keys(AS.FX).every(k => img.fx[k]) && img.stages[stage] && cids.filter(Boolean).every(c => img[c] && Object.keys(MAN.chars[c]).every(k => img[c][k])));

// o: { actor, ally, target: lab ids (J K E S R N T H M X), angel: { actor, ally, target } booleans for Emi's awakened form,
//      kind: 'strike' | 'skill' | 'ult', index, stage, mirror, dmg, crit, weak, resist, miss, ko, heals: [..] }
function playAction(o) {
  return new Promise(res => {
    if (PLAY) endPlay();
    const em = (c, a) => c === 'E' && a ? 'EA' : c;
    const actorId = em(o.actor, o.angel && o.angel.actor), allyId = o.ally ? em(o.ally, o.angel && o.angel.ally) : null, tgtId = em(o.target || (o.actor === 'K' ? 'J' : 'K'), o.angel && o.angel.target);
    if (!readyFor([actorId, allyId, tgtId], o.stage || 0) || !SKILLS[actorId]) { res({ skipped: true }); return; }
    resetWorld(); stageI = o.stage || 0;
    hero.cid = actorId; hero.x = HOME; hero.y = 0; hero.armed = false; hero.angelLap = false;
    tgt.cid = tgtId; tgt.x = ENEMY; tgt.y = 0; tgt.armed = false; tgt.hidden = false;
    ally.hidden = !allyId; ally.cid = allyId || 'E'; ally.x = EMI_X; ally.y = 0; ally.armed = false;
    rest(hero); rest(tgt); rest(ally);
    MIRROR = !!o.mirror; cv.style.transform = MIRROR ? 'scaleX(-1)' : '';
    if (MUSIC.el) { MUSIC.vol = MUSIC.el.volume; BGM_VOL = MUSIC.vol; bgm = MUSIC.el; }
    PLAY = { o, res, heals: (o.heals || []).slice(), dmgShown: false };
    busy = true; speed = 1.6; idleT = 0;
    const list = SKILLS[hero.cid], sk = o.kind === 'ult' ? list[list.length - 1] : o.kind === 'skill' ? list[o.index] : null;
    const run = sk ? () => sk.run() : STRIKES[hero.cid];
    audio(); if (o.kind === 'strike') { hero.armed = true; rest(hero); speed = 1; run(); } else standUp(hero, () => { speed = 1; run(); }); startLoop();
    clearTimeout(safety); safety = setTimeout(() => endPlay(), o.kind === 'ult' ? 16000 : 9000);
  });
}

window.Theatre = {
  canvas: cv, init, prepare, readyFor: (cids, stage = 0) => readyFor([...new Set(cids.filter(Boolean).flatMap(c => c === 'E' ? ['E', 'EA'] : [c]))], stage),
  play: playAction, skip() { if (PLAY) endPlay(); },
  get playing() { return !!PLAY; },
  unlock() { audio(); },
  setSound(on) { soundOn = !!on; },
  setMusic(el) { MUSIC.el = el; },
  setSfxVolume(v) { SFX_VOL = Math.max(0, Math.min(1, v)); if (MASTER) MASTER.gain.value = SFX_VOL; },
  setCalm(on) { reduce = !!on || matchMedia('(prefers-reduced-motion: reduce)').matches; },
  setLite(on) { LITE = !!on; },
  skillCount: cid => (SKILLS[cid] || []).length,
  skillNames: cid => (SKILLS[cid] || []).map(k => k.name),
  _sim(ms) { SIM = true; step(ms); },
};

})();
