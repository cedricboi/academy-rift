const AS = { FX: {}, stages: [] };
let BASE = '', PLAY = null, MIRROR = false, LITE = false;   // LITE: a slow device drops the glow and light passes to keep time
const cv = document.createElement('canvas'); cv.width = 640; cv.height = 360; cv.className = 'theatre-cv'; cv.__dyn = true;

/* ---------- canvas filters on iPad and Safari ----------
   Safari has no ctx.filter, and the effects lean on it (element tints, glows, stage grading).
   Where it is missing, a filtered drawImage draws a cached copy of the source that has been filtered once in JS. */
const FILTER_OK = (() => { if (window.__theatreNoFilter) return false; try { const c = document.createElement('canvas'); c.width = c.height = 2; const g = c.getContext('2d'); g.filter = 'grayscale(1)'; g.fillStyle = '#ff0000'; g.fillRect(0, 0, 2, 2); return g.getImageData(0, 0, 1, 1).data[1] > 40; } catch (e) { return false; } })();
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
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); di.call(g, src, 0, 0);
    const ops = [...f.matchAll(/([a-z-]+)\(\s*(-?\d*\.?\d+)\s*(px|deg)?\s*\)/g)].map(m => [m[1], +m[2]]);
    let id = null, d = null;
    const pixels = () => { if (!id) { id = g.getImageData(0, 0, w, h); d = id.data; } };
    const flush = () => { if (id) { g.putImageData(id, 0, 0); id = null; d = null; } };
    for (const [fn, v] of ops) {
      if (fn === 'blur') { flush(); blur(c, g, w, h, v); continue; }
      const M = matrix(fn, v); if (!M) continue; pixels();
      for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;   // each step clamps, as CSS filters do
        d[i] = clamp(M[0] * r + M[1] * gg + M[2] * b + M[3]) * 255; d[i + 1] = clamp(M[4] * r + M[5] * gg + M[6] * b + M[7]) * 255; d[i + 2] = clamp(M[8] * r + M[9] * gg + M[10] * b + M[11]) * 255; }
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
