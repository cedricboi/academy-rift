// Total War: the battle stage. The fighters' own Academy Rift sprites (theatre/c) face the Crimson Host's
// PixelLab sprites (monsters/anim). It only plays back what the server decided for each question:
// the Striker's blow, the supporters' hits, then the Crimson hitting back at the warband.
// mode 'pair' (a student's iPad): their own pair's fighter, plus whoever strikes this question.
// mode 'all' (the projector): every pair in the battle.
import { NODES } from './movement.js';
import { UNITS, CAMPS } from './rules.js';

const ROOT = '../';
// each standard's fighter: its sprite letter, the move it strikes with, the frame the blow lands on, and the hit effect
const HERO = {
  jun:   { L: 'J', strike: 'atk',    hit: 6, fx: 'slash',   dash: 1 },
  kuro:  { L: 'K', strike: 'hex',    hit: 9, fx: 'sburst',  dash: 0.55 },
  emi:   { L: 'E', strike: 'purify', hit: 5, fx: 'lpillar', dash: 0 },
  saya:  { L: 'S', strike: 'pin',    hit: 5, fx: 'ice_b',   dash: 1 },
  raiden:{ L: 'R', strike: 'step',   hit: 4, fx: 'el_b',    dash: 1 },
  nao:   { L: 'N', strike: 'breeze', hit: 5, fx: 'wi_b',    dash: 1 },
  taiga: { L: 'T', strike: 'palm',   hit: 5, fx: 'ea_b',    dash: 1 },
  hina:  { L: 'H', strike: 'needle', hit: 5, fx: 'mi_b',    dash: 1 },
  mina:  { L: 'M', strike: 'cut',    hit: 5, fx: 'wa_b',    dash: 1 },
  renji: { L: 'X', strike: 'smash',  hit: 5, fx: 'me_b',    dash: 1 },
};
const SCALE = { goblin_sappers: 0.85, rift_hound: 0.9, imp_swarm: 0.9, ogre: 1.3, wyvern: 1.3, golem: 1.4, warlord: 1.4,
  hollow_knight: 1.1, warlock: 1.05, moonhart: 1.15, galecrest: 1.15, mossback: 1.3, riftglass: 1.1, ferryman: 1.1, broodmother: 1.2 };
const FLIP = new Set(['moonhart', 'riftglass']);   // drawn facing right: mirrored so every enemy faces the class
const ATK_HIT = 5;                       // the frame of a monster's attack where the blow lands
const H = 360;                           // logical height; the width follows the screen

let MAN = null;
const manifest = () => MAN || (MAN = fetch(ROOT + 'theatre/manifest.json').then((r) => r.json()).catch(() => null));
const IMG = new Map();
function img(src) {
  if (!IMG.has(src)) { const i = new Image(); i.decoding = 'async'; i.src = src; IMG.set(src, i); }
  return IMG.get(src);
}
const ok = (i) => i && i.complete && i.naturalWidth > 0;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function backdropFor(node, kind) {
  if (kind === 'gate' || kind === 'boss') return 'gate';
  const k = NODES[node]?.kind;
  if (node === 0 || k === 'home') return 'academy';
  if (CAMPS[node] || k === 'lair' || k === 'buff') return 'lair';
  if (k === 'bridge' || k === 'ford') return 'bridge';
  if (k === 'ruin' || k === 'circle' || k === 'outpost') return 'ruins';
  return 'forest';
}

export function createStage(host, { mode = 'pair' } = {}) {
  const cv = document.createElement('canvas');
  cv.className = 'tw-stage';
  host.appendChild(cv);
  const g = cv.getContext('2d');
  let W = 760, scale = 1, dpr = 1;
  let heroes = [], enemies = [], fx = [], nums = [], tweens = [], waits = [], shake = 0, caption = null, bgName = 'forest';
  let man = null, raf = 0, last = 0, playing = null, guard = null;
  manifest().then((m) => { man = m; });

  function fit() {
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    scale = cv.height / H; W = cv.width / scale;
    layout();
  }
  new ResizeObserver(fit).observe(cv);

  // ---------------- sprites
  const sheetFor = (L, anim) => { const a = man?.chars?.[L]?.[anim]; return a ? { im: img(ROOT + a.src), n: a.n, w: a.w, h: a.h } : null; };
  const monSheet = (type, anim) => { const im = img(`monsters/anim/${type}_${anim}.webp`); return { im, n: ok(im) ? Math.round(im.naturalWidth / 192) : (anim === 'idle' ? 5 : 9), w: 192, h: 192, still: img(`monsters/${type}.png`) }; };

  function makeHero(p, i, n) {
    const H0 = HERO[p.char] || HERO.jun;
    return { kind: 'hero', key: p.key, char: p.char, L: H0.L, cfg: H0, label: p.label, me: !!p.me, homeX: 0, x: -200, y: 0, anim: 'idle', f: 0, ft: 0, fps: 8, loop: true, alpha: 1, flash: 0, s: 1.25, row: 0, slot: i, of: n, onFrame: null, after: null };
  }
  function makeEnemy(e, i) {
    return { kind: 'mon', type: e.type, hp: e.hp, max: e.max, down: e.hp <= 0, homeX: 0, x: 0, y: 0, anim: 'idle', f: 0, ft: Math.random() * 400, fps: 6, loop: true, alpha: e.hp <= 0 ? 0.25 : 1, flash: 0, s: 1.15 * (SCALE[e.type] || 1), slot: i, onFrame: null, after: null };
  }
  function layout() {
    const front = W * 0.26;
    heroes.forEach((h, i) => {
      if (mode === 'pair') { h.homeX = h.me ? front : front - 90; h.row = h.me ? 0 : 1; }
      else { const n = heroes.length, cols = Math.min(n, 4), col = i % cols, row = Math.floor(i / cols); h.homeX = W * 0.08 + (W * 0.32) * (cols > 1 ? col / (cols - 1) : 0.5) - row * 30; h.row = row; h.s = n > 4 ? 1.0 : 1.15; }
      if (!h.moving) h.x = h.homeX;
    });
    const n = enemies.length, span = Math.min(W * 0.36, 130 * Math.max(1, n - 1));
    enemies.forEach((e, i) => { e.homeX = W * 0.72 + (n > 1 ? -span / 2 + (span * i) / (n - 1) : 0); e.row = i % 2; if (!e.moving) e.x = e.homeX; });
  }

  // ---------------- what the server says is on the field
  function set({ pairs = [], foes = [], node = 0, kind = 'host' }) {
    bgName = backdropFor(node, kind);
    const keyed = new Map(heroes.map((h) => [h.key, h]));
    heroes = pairs.map((p, i) => { const h = keyed.get(p.key) || makeHero(p, i, pairs.length); h.label = p.label; h.me = !!p.me; return h; });
    const old = enemies;
    enemies = foes.map((e, i) => { const o = old[i] && old[i].type === e.type ? old[i] : makeEnemy(e, i); if (!playing) { o.hp = e.hp; o.max = e.max; o.down = e.hp <= 0; o.alpha = o.down ? 0.25 : 1; } return o; });
    layout();
    start();
  }

  // ---------------- the clock
  function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function loop(t) {
    const dt = Math.min(60, t - last); last = t;
    step(dt); draw();
    const shown = cv.offsetParent !== null;                // the battle screen is closed: stop drawing until it opens again
    raf = document.hidden || (!shown && !playing) ? 0 : requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
  const later = (ms) => new Promise((res) => waits.push({ t: ms, res }));
  function tween(o, k, to, dur, e = ease) { return new Promise((res) => tweens.push({ o, k, from: o[k], to, dur, age: 0, e, res })); }

  function step(dt) {
    for (const w of waits) w.t -= dt;
    for (const w of waits.filter((x) => x.t <= 0)) { waits.splice(waits.indexOf(w), 1); w.res(); }
    for (const tw of tweens) { tw.age += dt; const p = Math.min(1, tw.age / tw.dur); tw.o[tw.k] = tw.from + (tw.to - tw.from) * tw.e(p); }
    for (const tw of tweens.filter((x) => x.age >= x.dur)) { tweens.splice(tweens.indexOf(tw), 1); tw.res(); }
    for (const a of [...heroes, ...enemies, ...extras]) {
      a.ft += dt; const per = 1000 / a.fps;
      while (a.ft >= per) {
        a.ft -= per; a.f++;
        const n = frames(a);
        if (a.onFrame && a.onFrame[a.f]) { const fn = a.onFrame[a.f]; delete a.onFrame[a.f]; fn(); }
        if (a.f >= n) { if (a.loop) a.f = 0; else { a.f = n - 1; const done = a.after; a.after = null; a.onFrame = null; rest(a); done && done(); } }
      }
      a.flash = Math.max(0, a.flash - dt / 260);
    }
    for (const e of fx) e.age += dt;
    fx = fx.filter((e) => e.age < e.life);
    for (const n of nums) n.age += dt;
    nums = nums.filter((n) => n.age < 1300);
    shake = Math.max(0, shake - dt);
    if (caption) caption.age += dt;
    if (guard) { guard.age += dt; if (guard.age > guard.life) guard = null; }
  }
  function frames(a) {
    if (a.kind === 'mon') return monSheet(a.type, a.anim).n;
    return sheetFor(a.L, a.anim)?.n || 8;
  }
  function rest(a) { a.anim = 'idle'; a.f = 0; a.fps = a.kind === 'mon' ? 6 : 8; a.loop = true; }
  function play(a, anim, fps, onFrame = {}) { return new Promise((res) => { a.anim = anim; a.f = 0; a.ft = 0; a.fps = fps; a.loop = false; a.onFrame = onFrame; a.after = res; }); }

  // ---------------- drawing
  const tint = document.createElement('canvas'), tg = tint.getContext('2d');
  function sprite(im, sx, sw, sh, x, y, s, flip, alpha, flash) {
    const dw = sw * s, dh = sh * s;
    g.save(); g.globalAlpha = alpha;
    g.translate(x, y); if (flip) g.scale(-1, 1);
    g.drawImage(im, sx, 0, sw, sh, -dw / 2, -dh, dw, dh);
    if (flash > 0.02) {
      tint.width = sw; tint.height = sh; tg.clearRect(0, 0, sw, sh);
      tg.globalCompositeOperation = 'source-over'; tg.drawImage(im, sx, 0, sw, sh, 0, 0, sw, sh);
      tg.globalCompositeOperation = 'source-atop'; tg.fillStyle = '#ffffff'; tg.fillRect(0, 0, sw, sh);
      g.globalAlpha = alpha * Math.min(1, flash); g.drawImage(tint, 0, 0, sw, sh, -dw / 2, -dh, dw, dh);
    }
    g.restore();
  }
  function floorY(a) { return H - 34 - (a.row || 0) * 18; }
  function drawActor(a) {
    const y = floorY(a) + a.y;
    g.save(); g.globalAlpha = 0.35 * a.alpha; g.fillStyle = '#000'; g.beginPath(); g.ellipse(a.x, floorY(a) + 2, 46 * a.s, 9 * a.s, 0, 0, Math.PI * 2); g.fill(); g.restore();
    if (a.kind === 'mon') {
      const sh = monSheet(a.type, a.anim);
      const fl = FLIP.has(a.type);
      if (ok(sh.im)) sprite(sh.im, (a.f % sh.n) * 192, 192, 192, a.x, y + 6, a.s, fl, a.alpha, a.flash);
      else if (ok(sh.still)) sprite(sh.still, 0, 192, 192, a.x, y + 6, a.s, fl, a.alpha, a.flash);
      return;
    }
    const sh = sheetFor(a.L, a.anim) || sheetFor(a.L, 'idle');
    if (sh && ok(sh.im)) sprite(sh.im, (a.f % sh.n) * sh.w, sh.w, sh.h, a.x, y + 10, a.s, false, a.alpha, a.flash);
  }
  function drawFx(e) {
    const f = man?.FX?.[e.k]; if (!f) return;
    const im = img(ROOT + f.src); if (!ok(im)) return;
    const i = Math.min(f.n - 1, Math.floor((e.age / e.life) * f.n));
    g.save(); g.globalCompositeOperation = e.add ? 'lighter' : 'source-over'; g.globalAlpha = 0.95;
    const s = e.s || 1; g.drawImage(im, i * f.w, 0, f.w, f.h, e.x - (f.w * s) / 2, e.y - (f.h * s) / 2, f.w * s, f.h * s);
    g.restore();
  }
  function draw() {
    if (!cv.width) return;
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.imageSmoothingEnabled = false;
    if (shake > 0) g.translate((Math.random() - 0.5) * 8 * (shake / 300), (Math.random() - 0.5) * 6 * (shake / 300));
    const bg = img(`art/bg/${bgName}.webp`);
    if (ok(bg)) { const s = Math.max(W / bg.naturalWidth, H / bg.naturalHeight); g.drawImage(bg, (W - bg.naturalWidth * s) / 2, H - bg.naturalHeight * s, bg.naturalWidth * s, bg.naturalHeight * s); }
    else { g.fillStyle = '#121626'; g.fillRect(0, 0, W, H); }
    const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, 'rgba(8,10,20,.35)'); grad.addColorStop(1, 'rgba(8,10,20,.05)'); g.fillStyle = grad; g.fillRect(-10, -10, W + 20, H + 20);
    const all = [...enemies, ...heroes, ...extras].sort((a, b) => (b.row || 0) - (a.row || 0));
    for (const a of all) drawActor(a);
    if (guard) { const a = guard.age / guard.life; g.save(); g.globalAlpha = Math.max(0, 0.6 * (1 - a)); g.strokeStyle = '#7ff3e4'; g.lineWidth = 4; g.fillStyle = 'rgba(80,220,210,.12)';
      for (const h of heroes) { g.beginPath(); g.ellipse(h.x + 30, floorY(h) - 95 * h.s / 1.25, 74 * h.s / 1.25, 100 * h.s / 1.25, 0, 0, Math.PI * 2); g.fill(); g.stroke(); } g.restore(); }
    for (const e of fx) drawFx(e);
    for (const n of nums) {
      const p = n.age / 1300; g.save(); g.globalAlpha = p < 0.8 ? 1 : 1 - (p - 0.8) * 5;
      g.font = `700 ${n.big ? 34 : 22}px "Rift Pixel", Georgia, serif`; g.textAlign = 'center'; g.lineWidth = 5; g.strokeStyle = '#0b0d1a'; g.fillStyle = n.col;
      const y = n.y - 40 * ease(Math.min(1, p * 2)); g.strokeText(n.t, n.x, y); g.fillText(n.t, n.x, y); g.restore();
    }
    if (caption) {
      const p = caption.age; g.save(); g.globalAlpha = Math.min(1, p / 150);
      const room = W - 2 * Math.min(200, W * 0.24);              // keep clear of the enemy list in the corner
      let fs = 20; g.font = `700 ${fs}px "Rift Pixel", Georgia, serif`;
      while (fs > 12 && g.measureText(caption.t).width + 32 > room) { fs--; g.font = `700 ${fs}px "Rift Pixel", Georgia, serif`; }
      g.textAlign = 'center';
      const w = g.measureText(caption.t).width + 32, x = W / 2;
      g.fillStyle = 'rgba(8,10,20,.8)'; g.fillRect(x - w / 2, 12, w, fs + 16);
      g.strokeStyle = caption.col; g.lineWidth = 2; g.strokeRect(x - w / 2, 12, w, fs + 16);
      g.fillStyle = caption.col; g.fillText(caption.t, x, 12 + fs + 4); g.restore();
    }
  }

  // ---------------- one question, played back
  let extras = [];
  const say = (t, col = '#f3dca0') => { caption = { t, col, age: 0 }; };
  const num = (t, x, y, col, big = false) => nums.push({ t, x, y, col, big, age: 0 });
  const burst = (k, x, y, s = 1, add = true, life = 520) => fx.push({ k, x, y, s, add, life, age: 0 });
  const alive = () => enemies.filter((e) => !e.down);

  async function strike(h, target, dmg, half) {
    const cfg = h.cfg, homeX = h.x;
    const reach = target.x - 150 * (cfg.dash || 1) - (cfg.dash ? 0 : 0);
    h.moving = true;
    if (cfg.dash) await tween(h, 'x', homeX + (reach - homeX) * cfg.dash, 260);
    const n = sheetFor(h.L, cfg.strike)?.n || 12;
    const hitAt = Math.min(cfg.hit, n - 2);
    await play(h, cfg.strike, 15, { [hitAt]: () => {
      burst(cfg.fx, target.x - 6, floorY(target) - 80 * target.s, half ? 0.9 : 1.25, true, 560);
      target.flash = 1; shake = 260; num(`-${dmg}`, target.x, floorY(target) - 170 * target.s, '#ffd36b', true);
    } });
    if (cfg.dash) await tween(h, 'x', homeX, 300);
    h.moving = false;
  }

  async function playRound(r) {
    if (!r) return;
    const id = (playing = {});
    const firstAlive = enemies[r.target ?? 0] || alive()[0] || enemies[0];
    const who = r.stealer || r.striker;
    const main = r.strike ? 2 : r.stealer ? 1 : 0;
    // 1. the strike
    if (main && who && firstAlive) {
      say(r.stealer ? `${r.stealer.name} steals the strike!` : `${r.striker.name} strikes!`, r.stealer ? '#9fe8ff' : '#f3dca0');
      let h = heroes.find((x) => x.key === `p${who.pairNo}`);
      let temp = null;
      if (!h) { temp = makeHero({ key: 'tmp', char: who.char, label: who.name }, 0, 1); temp.x = -120; temp.homeX = -120; temp.row = 1; extras.push(temp); h = temp; await tween(temp, 'x', W * 0.2, 300); }
      await strike(h, firstAlive, r.mainHits ?? main, !!r.stealer);
      if (temp) { await tween(temp, 'x', -160, 280); extras = extras.filter((x) => x !== temp); }
    } else if (r.striker) {
      say(`${r.striker.name} missed. No strike this time.`, '#c7d4d1');
      await later(700);
    }
    if (id !== playing) return;
    // 2. the supporters' hits and War Cries
    const extra = (r.support || 0) + (r.warcry || 0);
    if (extra > 0 && firstAlive) {
      say(`${r.support ? `${r.support} supporter${r.support === 1 ? '' : 's'}` : ''}${r.support && r.warcry ? ' and ' : ''}${r.warcry ? `${r.warcry} War ${r.warcry === 1 ? 'Cry' : 'Cries'}` : ''} hit${extra === 1 && !r.warcry ? 's' : ''} too!`, '#9fe8ff');
      const k = Math.min(8, extra);
      for (let i = 0; i < k; i++) {
        const t = alive()[i % Math.max(1, alive().length)] || firstAlive;
        burst(i % 2 ? 'g2' : 'g1', t.x + (Math.random() - 0.5) * 50, floorY(t) - 70 - Math.random() * 60, 1.2, true, 420);
        t.flash = Math.max(t.flash, 0.6);
        await later(110);
      }
      await later(250);
    }
    // 3. the enemies take their damage (the server's numbers)
    if (r.enemiesAfter) r.enemiesAfter.forEach((e, i) => { const m = enemies[i]; if (!m) return; m.hp = e.hp; if (e.hp <= 0 && !m.down) { m.down = true; tween(m, 'alpha', 0.25, 500); num('Defeated', m.x, floorY(m) - 200 * m.s, '#ff8a9a'); } });
    if (r.fallen) await later(450);
    if (id !== playing) return;
    // 4. the Crimson hits back
    const blows = (r.counter || []).slice();
    if (blows.length) {
      say(r.guard > 0 ? `The Crimson hits back! ${Math.round(r.guard * 100)}% blocked` : 'The Crimson hits back!', '#ff8a9a');
      const attackers = alive();
      const seq = blows.map((b, i) => ({ b, m: attackers.filter((m) => m.type === b.type)[blows.slice(0, i).filter((x) => x.type === b.type).length] || attackers[i % Math.max(1, attackers.length)] }));
      const front = heroes.filter((h) => mode === 'all' || h.me);
      const lunge = async ({ b, m }) => {
        if (!m) return;
        m.moving = true;
        await Promise.all([
          tween(m, 'x', m.homeX - 70, 300),
          play(m, 'atk', 12, { [ATK_HIT]: () => {
            shake = 220;
            if (r.guard > 0) guard = { age: 0, life: 700 };
            for (const h of front) { h.flash = 0.8; play(h, 'hurt', 14); }
            const tgt = front[0] || heroes[0];
            if (tgt) num(`-${b.dmg}`, tgt.x, floorY(tgt) - 190, '#ff6b7f', true);
          } }),
        ]);
        await tween(m, 'x', m.homeX, 260);
        m.moving = false;
      };
      const first = seq.slice(0, 3), rest = seq.slice(3);
      for (const s of first) { if (id !== playing) return; await lunge(s); }
      if (rest.length) await Promise.all(rest.map(lunge));
    }
    caption = null;
    if (id === playing) playing = null;
  }

  function skip() {
    playing = null; tweens.forEach((t) => { t.o[t.k] = t.to; t.res(); }); tweens = []; waits.forEach((w) => w.res()); waits = [];
    extras = []; caption = null; for (const a of [...heroes, ...enemies]) { a.moving = false; a.x = a.homeX; rest(a); }
  }
  function preload(chars = [], types = []) {
    manifest().then((m) => {
      if (!m) return;
      for (const c of chars) { const L = HERO[c]?.L; if (!L) continue; for (const a of ['idle', 'hurt', HERO[c].strike]) { const s = m.chars[L]?.[a]; if (s) img(ROOT + s.src); } img(ROOT + m.FX[HERO[c].fx]?.src); }
      for (const k of ['g1', 'g2']) img(ROOT + m.FX[k].src);
    });
    for (const t of types) { img(`monsters/anim/${t}_atk.webp`); img(`monsters/anim/${t}_idle.webp`); img(`monsters/${t}.png`); }
  }
  return { set, playRound, skip, preload, get busy() { return !!playing; }, canvas: cv };
}

export const enemyName = (type) => UNITS[type]?.name || Object.values(CAMPS).find((c) => c.id === type)?.name || type;
