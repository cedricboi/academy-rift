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
// A device that cannot hold 60 fps draws a steady 30 instead: an even 33 ms beat looks smoother than frames that
// wander between 17 and 50 ms. Decided from most recent frames, so one heavy frame at the start of a move does not count.
let PACE30 = false, jitter = 0;
function loop(now) {
  if (PACE30 && lastT && now - lastT < 27) { requestAnimationFrame(loop); return; }   // hold this frame, draw on the next beat
  const dt = Math.min(100, now - (lastT || now)); lastT = now;
  if (!SIM) { musicStep(dt); step(dt); } draw();
  if (PLAY && !SIM && !PACE30) { jitter = jitter * .93 + (dt > 24 ? .07 : 0); if (jitter > .5) PACE30 = true; }
  if (PLAY && !SIM && !LITE) { slow = slow * .95 + (dt > 40 ? .05 : 0); if (slow > .6) LITE = true; }   // most recent frames over 40 ms: go lite for the session
  if (PLAY || idleFrames-- > 0) requestAnimationFrame(loop); else running = false;
}
function startLoop() { idleFrames = 2;   // the game hides the canvas as soon as a move ends, so drawing on afterwards is wasted
  if (!running) { running = true; lastT = 0; requestAnimationFrame(loop); } }

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
// decoded before it is handed over, so the first frame that draws a sheet does not stop to decode it
const loadImg = src => new Promise(r => { const i = new Image(); i.decoding = 'async'; i.onload = () => (i.decode ? i.decode().catch(() => {}) : Promise.resolve()).then(() => r(i)); i.onerror = () => r(null); i.src = BASE + src; });
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
    if (!PLAY) { stageI = Math.floor(stage / 5) % STAGES.length; stageImgI = stage; resetWorld(); try { drawStageBack(); drawStageFront(); } catch (e) {} }   // grade this stage's layers now, not on the first hit
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
    const simg = (o.stage || 0) * 5 + Math.max(0, Math.min(4, (o.level || 1) - 1));   // picture: location x 5 + damage level
    if (!readyFor([actorId, allyId, tgtId], simg) || !SKILLS[actorId]) { res({ skipped: true }); return; }
    resetWorld(); stageI = (o.stage || 0) % STAGES.length; stageImgI = simg;
    hero.cid = actorId; hero.x = HOME; hero.y = 0; hero.armed = false; hero.angelLap = false;
    tgt.cid = tgtId; tgt.x = ENEMY; tgt.y = 0; tgt.armed = false; tgt.hidden = false; tgt.flip = !(CH[tgtId] && CH[tgtId].monster);
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

// ---------- Total War: the Crimson Host's monsters as targets, and monsters hitting back ----------
// A monster is registered like a fighter (its PixelLab sheets: idle and atk, 192 px frames, facing left).
function registerMonster(id, o) {
  if (CH[id]) return;
  const idle = { src: o.idle, n: o.idleN || 8, w: 192, h: 192 }, atk = { src: o.atk, n: o.atkN || 9, w: 192, h: 192 };
  const sheets = { idle, hurt: idle, atk };
  if (MAN) MAN.chars[id] = sheets; AS[id] = sheets;
  CH[id] = { name: (o.name || id).toUpperCase(), monster: true, hit: o.hit || 5, anch: { idle: 96, hurt: 96, atk: 96 },
    hurt: [0, 1, 2, 1, 0].map((f) => Math.min(f, idle.n - 1)), idle: range(0, idle.n - 1), idleMs: 140 };
}
// The monster lunges at the fighters: o = { actor, ally, target, stage, level, dmg, blocked, stunned }
function playCounter(o) {
  return new Promise((res) => {
    if (PLAY) endPlay();
    const simg = (o.stage || 0) * 5 + Math.max(0, Math.min(4, (o.level || 1) - 1));
    if (!readyFor([o.actor, o.ally, o.target], simg) || !CH[o.target]) { res({ skipped: true }); return; }
    resetWorld(); stageI = (o.stage || 0) % STAGES.length; stageImgI = simg;
    hero.cid = o.actor; hero.x = HOME; hero.y = 0; hero.armed = isNew(hero); tgt.cid = o.target; tgt.x = ENEMY; tgt.y = 0; tgt.flip = false; tgt.hidden = false; tgt.armed = false;
    ally.hidden = !o.ally; ally.cid = o.ally || 'E'; ally.x = EMI_X; ally.y = 0; ally.armed = isNew(ally);
    rest(hero); rest(ally); rest(tgt);
    MIRROR = false; cv.style.transform = '';
    PLAY = { o: { dmg: null }, res, heals: [], dmgShown: true }; busy = true; speed = 1; idleT = 0;
    audio(); startLoop();
    if (o.stunned) {   // the Ultimate stunned it: it shakes, but cannot strike
      later(200, () => { num0('STUNNED', ENEMY, FLOOR - 190, true, 0, 'resist'); tgtHurt(); });
      later(1300, () => endPlay());
    } else {
      const n = AS[tgt.cid].atk.n, hitF = Math.min(n - 2, CH[tgt.cid].hit);
      tween(tgt, 'x', ENEMY - 150, 320, 'inout');
      playA(tgt, 'atk', range(0, n - 1), range(0, n - 1).map((i) => (i === hitF ? 140 : 80)), { on: { [hitF]: () => {
        SFX.hit(); fxState.shake = 280; fxState.shakeMag = 5; fxState.flash = .18; fxState.flashCol = '255,120,120';
        fire('burst', hero.x + 30, FLOOR - 70, { anchor: 'center', fps: 60, glow: .4 });
        for (const a of [hero, ally]) if (!a.hidden) playA(a, 'hurt', CH[a.cid].hurt, 80, { after: () => rest(a) });
        if (o.dmg != null) num0('-' + o.dmg, hero.x + 20, FLOOR - 150, true, 0);
        if (o.blocked) num0(`BLOCKED ${o.blocked}%`, hero.x + 20, FLOOR - 196, false, 160, 'resist');
      } }, after: () => { rest(tgt); tween(tgt, 'x', ENEMY, 320, 'inout'); later(650, () => endPlay()); } });
    }
    clearTimeout(safety); safety = setTimeout(() => endPlay(), 6000);
  });
}

window.Theatre = {
  canvas: cv, init, prepare, readyFor: (cids, stage = 0) => readyFor([...new Set(cids.filter(Boolean).flatMap(c => c === 'E' ? ['E', 'EA'] : [c]))], stage),
  play: playAction, counter: playCounter, registerMonster, skip() { if (PLAY) endPlay(); },
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
