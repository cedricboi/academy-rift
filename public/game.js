// ===== Academy Rift — client =====
import { CHARACTERS, CHAR_BY_ID, ELEMENT_COLORS, ITEMS, ITEM_BY_ID } from "./data/characters.js";
import { TOPICS, BLOOM_META } from "./data/topics.js";
import { FOLDERS, DEFAULT_FOLDER, folderOf } from "./data/folders.js";
import { setupShop, itemIcon } from "./shop.js";

const socket = io();
let myId = null;
let room = null;
let inputLocked = false;
let mySelected = -1;
let myAnswerCorrect = false;   // gates attacking — set from answerResult
let stealMeta = null;          // { originalUid, originalName, seconds, startedAt } while steal window is open

// ============================================================
//  ASSET MAP — all character art wired to uploaded files.
//  To swap art: update these paths.  null = CSS placeholder.
// ============================================================
const NAME = { jun:"Jun",saya:"Saya",raiden:"Raiden",nao:"Nao",emi:"Emi",kuro:"Kuro",taiga:"Taiga",hina:"Hina",mina:"Mina",renji:"Renji" };

// Numbered art sets (mapped to character ids by element/identity).
const IDLE_NUM    = { kuro:1, jun:2, hina:3, emi:4, mina:5, saya:6, renji:7, raiden:8, nao:9, taiga:10 };   // transparent idle/ready
const ATK_NUM     = { emi:1, hina:2, jun:3, kuro:4, mina:5, nao:6, raiden:7, renji:8, saya:9, taiga:10 };    // ultimate splash set
const COSTUME_NUM = { emi:1, kuro:2, jun:3, hina:4, raiden:5, mina:6, nao:7, saya:8, renji:9, taiga:10 };    // Attack Costume folder (black bg)
const CARD_NUM = { mina:1, kuro:2, jun:3, hina:4, emi:5, saya:6, renji:7, raiden:8, nao:9, taiga:10 };    // pre-designed player cards
const ULT_DIR  = "assets/Ultimate Scene/ChatGPT Image Jun 15, 2026, 06_22_41 AM";

const SKILL_SHEET_NUM = { raiden:1, nao:2, hina:3, jun:4, saya:5, taiga:6, renji:7, kuro:8, emi:9, mina:10 };
// Answer-feedback banners (drop the two graphics in here as 1.png / 2.png).
const ANSWER_IMG = {
  correct: "assets/Answer%20Feedback/correct.webp",
  wrong:   "assets/Answer%20Feedback/wrong.webp",
};
// Flash the CORRECT/WRONG banner over a greyed scene for ~1 second.
function showAnswerBanner(correct) {
  const el = $("answerBanner"), img = $("answerBannerImg");
  if (!el || !img) return;
  img.src = correct ? ANSWER_IMG.correct : ANSWER_IMG.wrong;
  el.classList.remove("hidden");
  void el.offsetWidth;                 // reflow so the fade-in plays
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.classList.add("hidden"), 220);   // hide after fade-out
  }, 1000);
}
function setBattleDim(on) {
  const d = $("battleDim");
  if (!d) return;
  d.classList.toggle("hidden", false);
  d.classList.toggle("active", on);
  if (!on) setTimeout(() => { if (!d.classList.contains("active")) d.classList.add("hidden"); }, 280);
}
const ASSETS = {
  portraits: Object.fromEntries(CHARACTERS.map((c) => [c.id, `assets/Character Profile Art/${NAME[c.id]}.webp`])),
  idle:   (id) => `assets/Chracter Art Transparent background/${IDLE_NUM[id]}.webp`,
  attack: (id) => `assets/Attack Costume/${COSTUME_NUM[id]}.webp`,
  card:   (id) => `assets/Player cards/${CARD_NUM[id]}.webp`,
  bigcard:  (id) => `assets/Character Card/${id}.webp`,
  cardinfo: (id) => `assets/Chracter Card Information/${id}.webp`,
  skillSheet: (id) => `assets/Skill Menu Art/${SKILL_SHEET_NUM[id] || 1}.webp`,
  ult:    (id) => `${ULT_DIR} (${ATK_NUM[id]}).webp`,
  bg: { castle: "assets/CASTLE BACKGROUND.webp", opening: "assets/Opening Scene.webp", shop: null, lobby: null },
  // battle backdrops: six places, each in five damage levels. The server picks the place per battle (battle.stage)
  // and every Ultimate breaks it one level further (battle.stageLevel), so all four players see the same scene.
  stages: ["library", "alchemy-lab", "rooftop", "courtyard", "classroom", "hallway"].flatMap((n) => [1, 2, 3, 4, 5].map((l) => `assets/stages/${n}-${l}.webp`)),
};
const stageImg = (stage, level) => (Math.max(0, stage | 0) % 6) * 5 + Math.max(0, Math.min(4, (level || 1) - 1));
let arenaBg = "", arenaKey = "";
function setArenaBg(stage, level = 1) {
  const url = Number.isInteger(stage) ? ASSETS.stages[stageImg(stage, level)] : (arenaBg || ASSETS.bg.castle);
  if (!url || url === arenaBg) return;
  const key = Number.isInteger(stage) ? `${stage}` : "", worse = key && key === arenaKey && level > 1;
  arenaBg = url; arenaKey = key;
  const put = () => { $("arena").style.backgroundImage = `url('${encodeURI(url)}')`; $("arena").style.setProperty("--stage-img", `url('${encodeURI(url)}')`); };
  if (!worse) return put();
  // the same place, broken further by an Ultimate: a rift flash and a shake as the new picture lands
  const im = new Image(); im.src = encodeURI(url);
  const land = () => { const a = $("arena"); a.classList.remove("rift-break"); void a.offsetWidth; a.classList.add("rift-break"); setTimeout(put, 180); setTimeout(() => a.classList.remove("rift-break"), 1100); };
  (im.decode ? im.decode() : Promise.resolve()).then(land, land);
}
// the next damage level of this battle's place is fetched ahead, so it is ready when an Ultimate lands
function preloadStage(stage, level) { for (const l of [level, level + 1]) if (l <= 5) { const im = new Image(); im.src = encodeURI(ASSETS.stages[stageImg(stage, l)]); } }

// Music tracks. playsInline keeps iOS from hijacking them into a fullscreen player.
// ---- player settings (top-right gear): volumes and battle display, kept on this device ----
const SET_KEY = "riftSettings";
const settings = Object.assign({ music: 70, sfx: 85, camera: true, graphics: "auto", calm: false, fps: false },
  (() => { try { return JSON.parse(localStorage.getItem(SET_KEY)) || {}; } catch { return {}; } })());
if (settings.lite === true && !settings._gfxMigrated) settings.graphics = "smooth";   // the old "Light cinematics" switch
settings._gfxMigrated = true; delete settings.lite;
// Graphics: Smooth (idle at 3 frames a second, light cinematics, no extras) · Balanced (5 a second, drifting light)
// · Detailed (full-speed idle, drifting light and a slowly breathing stage). Auto starts on Balanced and drops to Smooth
// for good on a device that cannot keep up; the choice is remembered per device.
const GFX_AUTO_KEY = "riftGfxAuto";
let gfxAuto = (() => { try { return localStorage.getItem(GFX_AUTO_KEY) === "smooth" ? "smooth" : "balanced"; } catch { return "balanced"; } })();
const gfxLevel = () => (settings.graphics === "auto" ? gfxAuto : ["smooth", "balanced", "quality"].includes(settings.graphics) ? settings.graphics : "balanced");
const SOUND = { music: settings.music / 100, sfx: settings.sfx / 100 };   // what is playing now, after the teacher's class setting
const lobbyBGM = new Audio("assets/Intro Theme.mp3");
lobbyBGM.loop = true;
lobbyBGM.volume = 0.55;
lobbyBGM.playsInline = true;

const battleBGM = new Audio();
battleBGM.preload = "none";                 // fetched when the first battle starts, not with the page (30 students share the Wi-Fi)
battleBGM.src = "assets/Victory Fanfare.mp3";
battleBGM.loop = true;
battleBGM.volume = 0.55;
battleBGM.playsInline = true;

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Server time correction: an iPad whose clock is off would otherwise show wrong timers.
let clockSkew = 0;
const srvNow = () => Date.now() + clockSkew;
// ?watch=CODE opens a watch-only view of a class tournament's live battles (used
// by the teacher's projector page). It never joins as a player and plays no music.
const WATCH = (() => {
  const q = new URLSearchParams(location.search), code = q.get("watch");
  return code ? { code: code.toUpperCase().slice(0, 4), matchId: q.get("m") } : null;
})();
let spectating = null;   // { matchId, a, b, code } while watching someone else's battle
const SCREENS = ["title","tutorial","home","room","tourney","battle","result"];
function showScreen(id) {
  const was = SCREENS.find((s) => $(s).classList.contains("active"));
  SCREENS.forEach((s) => $(s).classList.toggle("active", s === id));
  if (id !== "tourney" && shop?.isOpen()) shop.close("battle");   // a battle is starting
  if (id === was || WATCH) return;                // same screen re-render → don't touch music
  // music: battle screen uses battleBGM, all others use lobbyBGM. Only (re)start a
  // track if it's actually paused, so re-entering the same screen never restarts it.
  if (id === "battle") {
    if (!lobbyBGM.paused) { lobbyBGM.pause(); lobbyBGM.currentTime = 0; }
    if (battleBGM.paused) { battleBGM.currentTime = 0; battleBGM.play().catch(() => {}); }
  } else {
    if (!battleBGM.paused) { battleBGM.pause(); battleBGM.currentTime = 0; }
    if (lobbyBGM.paused) lobbyBGM.play().catch(() => {});
  }
}

// ---- profile ----
function loadProfile() { try { return JSON.parse(localStorage.getItem("academyRift")) || { coins:500, inv:{} }; } catch { return { coins:500, inv:{} }; } }
function saveProfile(p) { localStorage.setItem("academyRift", JSON.stringify(p)); }
let profile = loadProfile();
function refreshCoins() { const el = $("homeCoins"); if (el) el.textContent = profile.coins; }

// Start the lobby theme as early as possible. Browsers block audio autoplay until
// the first user gesture, so we (a) try on load, and (b) guarantee it on the very
// first interaction — i.e. the moment the player clicks "ENTER THE RIFT".
function startLobbyMusicOnce() {
  if (WATCH) return;
  if (!$("battle").classList.contains("active") && lobbyBGM.paused) {
    lobbyBGM.play().catch(() => {});
  }
  // iOS only lets an audio element play later (outside a gesture) if it has played
  // at least once *inside* a gesture. Prime the battle track silently so the
  // lobby→battle switch works on iPads.
  const v = battleBGM.volume;
  battleBGM.muted = true;
  battleBGM.play().then(() => {
    battleBGM.pause(); battleBGM.currentTime = 0; battleBGM.muted = false; battleBGM.volume = v;
  }).catch(() => { battleBGM.muted = false; });
  window.removeEventListener("pointerdown", startLobbyMusicOnce, true);
  window.removeEventListener("keydown", startLobbyMusicOnce, true);
}
document.addEventListener("DOMContentLoaded", () => { if (!WATCH) lobbyBGM.play().catch(() => {}); });
window.addEventListener("pointerdown", startLobbyMusicOnce, true);
window.addEventListener("keydown", startLobbyMusicOnce, true);

// ============================================================
//  AVATAR HELPERS
// ============================================================
// Portrait: full body art — used in roster cards and HP cards
function portrait(charId) {
  const c = CHAR_BY_ID[charId]; if (!c) return "";
  const src = ASSETS.portraits[charId];
  if (src) return `<img src="${src}" alt="${c.name}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;object-position:top center;" />`;
  return placeholderDiv(c, ELEMENT_COLORS[c.element]);
}

// ---- Battle sprites --------------------------------------------------------
// Most idle/attack art is already transparent, but a few pngs still ship with a
// white background. transparentize() auto-detects those (opaque white corners)
// and flood-fills the white away; already-transparent art is used untouched.
const artCache = {};   // url -> usable src (dataURL if cleaned, else the url)

// If an image has a lot of near-white *opaque* pixels (a white background or an
// inset white panel), key the white out to alpha. Already-transparent art has
// little near-white area and is left untouched.
function transparentize(url) {
  if (artCache[url] !== undefined) return Promise.resolve(artCache[url]);
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      try {
        const W = im.naturalWidth, H = im.naturalHeight;
        const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(im, 0, 0);
        const data = ctx.getImageData(0, 0, W, H), d = data.data;
        let white = 0;
        for (let i = 0; i < d.length; i += 4)
          if (d[i+3] > 200 && d[i] > 236 && d[i+1] > 236 && d[i+2] > 236) white++;
        if (white / (W * H) > 0.16) {                       // has a white bg/panel → key it out
          for (let i = 0; i < d.length; i += 4) {
            if (d[i+3] === 0) continue;
            const mn = Math.min(d[i], d[i+1], d[i+2]);
            if (mn > 230) d[i+3] = 0;                         // solid white → clear
            else if (mn > 198) d[i+3] = Math.min(d[i+3], Math.round((230 - mn) / 32 * 255)); // edge feather
          }
          ctx.putImageData(data, 0, 0);
          artCache[url] = cv.toDataURL("image/png");
        } else artCache[url] = encodeURI(url);               // already transparent
      } catch (e) { artCache[url] = encodeURI(url); }
      res(artCache[url]);
    };
    im.onerror = () => { artCache[url] = encodeURI(url); res(artCache[url]); };
    im.src = encodeURI(url);
  });
}

// Attack Costume PNGs ship on a SOLID BLACK background. Flood-fill the black away
// from the borders so only the *background* black is removed — interior black
// outlines / dark hair / shadow FX (not touching the edge) are preserved. Result
// is a clean cut-out sprite that looks solid when held on-screen.
function blackKnockout(url) {
  if (artCache[url] !== undefined) return Promise.resolve(artCache[url]);
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      try {
        const W = im.naturalWidth, H = im.naturalHeight;
        const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(im, 0, 0);
        const img = ctx.getImageData(0, 0, W, H), d = img.data;
        const BG = 46;                                   // near-black background threshold
        const isBg = (p) => d[p] < BG && d[p+1] < BG && d[p+2] < BG;
        const seen = new Uint8Array(W * H);
        const stack = [];
        const visit = (x, y) => {
          if (x < 0 || y < 0 || x >= W || y >= H) return;
          const p = y * W + x; if (seen[p]) return; seen[p] = 1;
          if (isBg(p * 4)) { d[p*4+3] = 0; stack.push(x, y); }   // background → transparent
        };
        for (let x = 0; x < W; x++) { visit(x, 0); visit(x, H-1); }
        for (let y = 0; y < H; y++) { visit(0, y); visit(W-1, y); }
        while (stack.length) {
          const y = stack.pop(), x = stack.pop();
          visit(x+1, y); visit(x-1, y); visit(x, y+1); visit(x, y-1);
        }
        // soft feather: dark pixels touching a cleared pixel get partial alpha (kills the halo)
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const p = (y * W + x) * 4;
          if (d[p+3] === 0) continue;
          const mx = Math.max(d[p], d[p+1], d[p+2]);
          if (mx > 110) continue;                        // only dim edge pixels
          let adj = false;
          if (x>0   && d[p-4+3]===0) adj = true;
          if (x<W-1 && d[p+4+3]===0) adj = true;
          if (y>0   && d[p-W*4+3]===0) adj = true;
          if (y<H-1 && d[p+W*4+3]===0) adj = true;
          if (adj) d[p+3] = Math.min(d[p+3], Math.round(mx / 110 * 255));
        }
        ctx.putImageData(img, 0, 0);
        artCache[url] = cv.toDataURL("image/png");
      } catch (e) { artCache[url] = encodeURI(url); }
      res(artCache[url]);
    };
    im.onerror = () => { artCache[url] = encodeURI(url); res(artCache[url]); };
    im.src = encodeURI(url);
  });
}


// Every fighter has an arena sprite sheet, so the old idle/costume art (keyed out pixel by pixel on the main thread,
// a half-second freeze per fighter on a slow iPad) is only prepared for a fighter that has no sheet.
function preloadArt(ids) {
  const jobs = [];
  [...new Set(ids)].forEach((id) => {
    if (!ARENA[spriteId(id)]) jobs.push(transparentize(ASSETS.idle(id)), blackKnockout(ASSETS.attack(id)));
    const im = new Image(); im.src = encodeURI(ASSETS.ult(id));   // warm cut-in art
  });
  return Promise.all(jobs);
}

const idleSrc   = (id) => artCache[ASSETS.idle(id)]   || encodeURI(ASSETS.idle(id));
const attackSrc = (id) => artCache[ASSETS.attack(id)] || encodeURI(ASSETS.attack(id));

// Costume state: uids currently wearing their ATTACK costume (set on a correct
// answer, held through the action, cleared when the attack resolves). Render is
// pose-aware so the swap survives DOM rebuilds between the answer and the attack.
const attackPosed = new Set();

function chibiImg(charId, uid) {
  const posed = uid && attackPosed.has(uid) ? " posed" : "";
  const id = spriteId(charId, uid), a = ARENA[id], p = POSE[id];
  // Each fighter is one frame-sized box whose background steps through the sheet. (A whole sheet as a sliding <img> made a
  // layer up to 15 frames wide per fighter; clipped, scaled and tilted by the camera, those were what made the zoom stutter.)
  if (p && uid && focusPose.uid === uid) {          // the camera is on them: the pose plays once, then they hold their battle stance
    const n = p[0], since = Date.now() - focusPose.start;
    return `<div class="chibi spr posing${posed}" style="--n:${n};--ax:${(p[1] / 192).toFixed(3)};--pdur:${n * 70}ms;--psteps:${n - 1};--pend:${(-(n - 1) / n * 100).toFixed(4)}%;--pdelay:-${since}ms"><div class="spr-frame" style="background-image:url(theatre/arena/${id}_pose_ol.webp)"></div></div>`;
  }
  if (a) return `<div class="chibi spr${posed}" style="--n:${a[0]};--dur:${a[0] * a[1]}ms;--ax:${(a[2] / 192).toFixed(3)};--bend:${(100 * a[0] / (a[0] - 1)).toFixed(4)}%"><div class="spr-frame" style="background-image:url(theatre/arena/${id}.webp)"></div></div>`;
  const src = posed ? attackSrc(charId) : idleSrc(charId);
  return `<img class="chibi${posed}" src="${src}" alt="" draggable="false" />`;
}

// Swap a fighter INTO their attack costume and keep it until cleared.
function setAttackPose(uid) {
  const already = attackPosed.has(uid);
  attackPosed.add(uid);
  const el = tokenEl(uid); if (!el) return;
  el.classList.add("posed");
  const img = el.querySelector("img.chibi");
  const c = room?.battle?.combatants?.find((x) => x.uid === uid);
  if (img && c) { img.src = attackSrc(c.charId); img.classList.add("posed"); }
  if (!already && c) {                      // burst of elemental FX at the moment of transformation
    const col = fxColor(c.element);
    spawnEfx(uid, "ring", col, 0.5);
    spawnEfx(uid, "burst", col, 0.5);
  }
}

// Revert a fighter back to their idle costume.
function clearAttackPose(uid) {
  if (!attackPosed.has(uid)) return;
  attackPosed.delete(uid);
  const el = tokenEl(uid); if (!el) return;
  el.classList.remove("posed");
  const img = el.querySelector("img.chibi");
  const c = room?.battle?.combatants?.find((x) => x.uid === uid);
  if (img && c) { img.src = idleSrc(c.charId); img.classList.remove("posed"); }
}

// Card portrait — uses the Ultimate Scene splash art, framed to the upper body.
function thumb(charId) {
  const c = CHAR_BY_ID[charId]; if (!c) return "";
  return `<img src="${encodeURI(ASSETS.ult(charId))}" alt="${c.name}" style="width:100%;height:100%;object-fit:cover;object-position:top center;" />`;
}

function placeholderDiv(c, col) {
  return `<div class="placeholder" style="background:linear-gradient(160deg,${col}40,#000)">
    <span class="pl-init">${c.name.split(" ")[0]}</span>
    <div class="pl-head"></div>
    <div class="pl-body" style="background:linear-gradient(${col},#1a0a10)"></div>
    <span class="pl-badge" style="background:${col}">${c.element}</span>
  </div>`;
}

function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2800);
}

// ============================================================
//  SOUND FX — synthesized via WebAudio (no audio files needed)
// ============================================================
const SFX = (() => {
  let ctx = null, master = null, musicGain = null;
  const ac = () => {
    if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = SOUND.sfx; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = SOUND.music; musicGain.connect(ctx.destination); }
    return ctx;
  };
  const out = () => (ac(), master);
  function tone(freq, dur, type = "sine", gain = 0.18, slideTo = null) {
    try {
      const c = ac(), o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
      g.gain.setValueAtTime(gain, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g).connect(out()); o.start(); o.stop(c.currentTime + dur);
    } catch (e) {}
  }
  function noise(dur, gain = 0.22, hp = 700) {
    try {
      const c = ac(), n = c.createBufferSource();
      const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      n.buffer = buf;
      const g = c.createGain(); g.gain.setValueAtTime(gain, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      const f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp;
      n.connect(f).connect(g).connect(out()); n.start(); n.stop(c.currentTime + dur);
    } catch (e) {}
  }
  const lib = {
    select:  () => tone(680, 0.06, "square", 0.1),
    strike:  () => { noise(0.18, 0.22, 500); tone(190, 0.18, "sawtooth", 0.16, 90); },
    spell:   () => { tone(520, 0.28, "triangle", 0.16, 900); tone(780, 0.2, "sine", 0.08); },
    hit:     () => { noise(0.12, 0.2, 900); tone(150, 0.12, "square", 0.14, 70); },
    crit:    () => { noise(0.24, 0.3, 600); tone(220, 0.26, "sawtooth", 0.2, 80); tone(900, 0.18, "square", 0.1); },
    weak:    () => { tone(1200, 0.12, "square", 0.16, 1900); noise(0.16, 0.2, 1200); },
    heal:    () => { tone(523, 0.16, "sine", 0.14, 784); setTimeout(() => tone(784, 0.2, "sine", 0.1), 70); },
    ultimate:() => { tone(110, 0.6, "sawtooth", 0.22, 55); tone(440, 0.6, "square", 0.12, 1320); noise(0.6, 0.16, 400); },
    correct: () => { tone(659, 0.1, "square", 0.15); setTimeout(() => tone(988, 0.18, "square", 0.15), 95); },
    wrong:   () => { tone(240, 0.2, "sawtooth", 0.14, 150); },
    sync:    () => { tone(740, 0.12, "triangle", 0.16, 1480); setTimeout(() => tone(1480, 0.18, "triangle", 0.12), 100); },
    fizzle:  () => { tone(320, 0.22, "sine", 0.1, 120); },
    buy:     () => { tone(1319, 0.08, "square", 0.1); setTimeout(() => tone(1760, 0.22, "square", 0.1), 80); },
    bell:    () => { tone(1568, 0.9, "sine", 0.12); tone(2350, 0.6, "sine", 0.05); setTimeout(() => tone(1568, 0.7, "sine", 0.07), 160); },
  };
  // Recorded clips (Sonniss GDC 2026 Game Audio Bundle, royalty-free) in assets/sfx. They load on the
  // first tap; until a clip has loaded, the synthesized sound above plays instead, so nothing is ever silent.
  // loud = each clip's measured short-term loudness, used to level them against each other.
  const CLIPS = { ui_select: -16.4, heavy1: -14.6, heavy2: -13.5, heavy3: -14.9, punch1: -15.0, punch2: -13.5, punch3: -12.8, punch4: -13.8,
    smack: -14.8, spell: -9.3, whoosh: -16.5, cutsweep: -7.0, metalhit: -13.0, shatter: -8.8, glass: -13.4, twinkle: -14.4,
    braamHorn: -11.1, chordhit: -18.5, ui_correct: -13.9, ui_wrong: -6.6, ui_sync: -12.1, ui_fizzle: -10.3, shimmerhit: -16.6 };
  const buf = {}; let bus = null, loading = false;
  function load() {
    if (loading) return; loading = true;
    const c = ac(); bus = c.createDynamicsCompressor(); bus.threshold.value = -12; bus.ratio.value = 4; bus.connect(out());
    for (const k of Object.keys(CLIPS)) fetch(`assets/sfx/${k}.mp3`).then((r) => r.arrayBuffer())
      .then((a) => new Promise((ok, no) => c.decodeAudioData(a, ok, no))).then((b) => { buf[k] = b; }).catch(() => {});
  }
  function clip(name, vol = 1, rate = 1, delay = 0) {
    if (Array.isArray(name)) name = name[Math.floor(Math.random() * name.length)];
    const b = buf[name]; if (!b) return false;
    try {
      const c = ac(), src = c.createBufferSource(), g = c.createGain(); src.buffer = b; src.playbackRate.value = rate;
      g.gain.value = vol * Math.min(1, Math.pow(10, (-15 - CLIPS[name]) / 20)) * 0.85;
      src.connect(g).connect(bus || out()); src.start(c.currentTime + delay); return true;
    } catch (e) { return false; }
  }
  let routed = false;
  function routeMusic() {
    if (routed || !ctx) return; routed = true;
    for (const el of [lobbyBGM, battleBGM]) { try { ctx.createMediaElementSource(el).connect(musicGain); } catch (e) {} }
  }
  const PUNCH = ["punch1", "punch2", "punch3", "punch4"], HEAVY = ["heavy1", "heavy2", "heavy3"];
  const rec = {
    select:  () => clip("ui_select", 0.7, 1 + Math.random() * 0.06),
    strike:  () => clip(HEAVY, 0.9, 0.95 + Math.random() * 0.1),
    spell:   () => clip("spell", 0.6) && clip("whoosh", 0.4, 1.2),
    hit:     () => clip(PUNCH, 0.8, 0.92 + Math.random() * 0.16) && clip("smack", 0.5),
    crit:    () => clip("cutsweep", 0.8) && clip("metalhit", 0.7),
    weak:    () => clip("shatter", 0.8) && clip("glass", 0.5),
    heal:    () => clip("spell", 0.55, 1.1) && clip("twinkle", 0.6, 1, 0.12),
    ultimate:() => clip("chordhit", 1) && clip("braamHorn", 0.6),
    correct: () => clip("ui_correct", 0.8),
    wrong:   () => clip("ui_wrong", 0.6),
    sync:    () => clip("ui_sync", 0.8) && clip("shimmerhit", 0.5),
    fizzle:  () => clip("ui_fizzle", 0.6),
    buy:     () => clip("twinkle", 0.75, 1.15) && clip("ui_correct", 0.45, 1.25),
  };
  return {
    play: (k) => { if (!(rec[k] && rec[k]())) (lib[k] || (() => {}))(); },
    unlock: () => { try { const c = ac(); if (c.state === "suspended") c.resume(); load(); routeMusic(); } catch (e) {} },
    // volumes from the settings panel: the element volume alone does nothing on iPads, so music also runs through a gain node
    setVolumes(music, sfx) { if (!ctx) return; master.gain.value = sfx; musicGain.gain.value = music; },
  };
})();
document.addEventListener("pointerdown", () => SFX.unlock(), { capture: true });

// Auntie's shop between tournament rounds (shop.js draws it; the server keeps the coins and the bag)
var shop = setupShop({ socket, SFX });   // var: showScreen can run before this line
let lastEarned = 0;

// ============================================================
//  BATTLE THEATRE — the Skill Lab cinematics, played for every strike, skill and ultimate
// ============================================================
// theatre/engine.js (built from the Skill Lab) draws the fight on its own canvas: the actor, their partner and
// the target, on this battle's stage. The server waits for the animation before the next turn starts.
// If the art is not loaded yet, the old stage effects play instead, so a slow connection never holds anyone up.
const TH = window.Theatre || null;
const LAB = { jun: "J", kuro: "K", emi: "E", saya: "S", raiden: "R", nao: "N", taiga: "T", hina: "H", mina: "M", renji: "X" };
// stage idle loops (theatre/arena/<id>.webp): frames, ms per frame, where the fighter stands in the 192 px frame
const ARENA = { J: [8, 120, 72], K: [10, 160, 80], E: [8, 150, 96], EA: [8, 150, 96], S: [8, 140, 96], R: [8, 140, 96],
  N: [8, 140, 96], T: [8, 140, 96], H: [8, 140, 96], M: [8, 140, 96], X: [8, 140, 96] };
// the pose a fighter strikes when the camera lands on them (theatre/arena/<id>_pose_ol.webp, with its outline): frames, where they stand in the 192 px frame
const POSE = { J: [14, 80], K: [13, 80], E: [11, 96], EA: [11, 96], S: [15, 96], R: [15, 96], N: [15, 96], T: [15, 96], H: [15, 96], M: [15, 96], X: [15, 96] };
let focusPose = { uid: null, start: 0 };
const angelUids = new Set();      // an Emi who used Aurora Covenant keeps her angel form for the rest of the battle
let theatreOn = false, heldRoom = null, theatreDone = Promise.resolve();
if (TH) {
  TH.init({ stages: ASSETS.stages });
  TH.setMusic(battleBGM);
  $("theatre").appendChild(TH.canvas);
  document.addEventListener("pointerdown", () => TH.unlock(), { capture: true });
}
const labId = (c) => (c ? LAB[c.charId] : null);

// ============================================================
//  SETTINGS PANEL (top-right gear)
// ============================================================
const MUSIC_BASE = 0.55;
function applySettings() {
  const rule = tView?.settings?.studentSound || "on";          // the teacher's class-wide sound setting
  SOUND.music = rule === "on" ? settings.music / 100 : 0;
  SOUND.sfx = rule === "off" ? 0 : settings.sfx / 100;
  SFX.setVolumes(SOUND.music, SOUND.sfx);
  for (const el of [lobbyBGM, battleBGM]) { el.volume = Math.min(1, MUSIC_BASE * SOUND.music); el.muted = SOUND.music === 0; }
  const gfx = gfxLevel();
  if (TH) { TH.setSfxVolume(SOUND.sfx); TH.setCalm(settings.calm); TH.setLite(gfx === "smooth"); }
  for (const g of ["smooth", "balanced", "quality"]) document.body.classList.toggle("gfx-" + g, gfx === g);
  document.body.classList.toggle("calm", !!settings.calm);
  fpsMeter(!!settings.fps);
  const note = $("setRule");
  const mus = $("setPanel")?.querySelector('[data-vol="music"]'); if (mus) mus.disabled = rule !== "on";
  const fx = $("setPanel")?.querySelector('[data-vol="sfx"]'); if (fx) fx.disabled = rule === "off";
  if (note) { note.textContent = rule === "sfx" ? "Your teacher has turned music off for the class." : rule === "off" ? "Your teacher has turned sound off for the class." : ""; note.classList.toggle("hidden", rule === "on"); }
  if (room?.battle) updateCamera();
}
// a small frame-rate readout, to check how smooth battles are on a class iPad
let fpsRaf = 0;
function fpsMeter(on) {
  const el = $("fpsMeter"); if (!el) return;
  el.classList.toggle("hidden", !on); cancelAnimationFrame(fpsRaf); if (!on) return;
  let n = 0, t0 = performance.now(), worst = 0, last = t0;
  const tick = (t) => { n++; worst = Math.max(worst, t - last); last = t;
    if (t - t0 >= 1000) { const f = Math.round(n * 1000 / (t - t0)); el.textContent = `${f} fps · slowest ${Math.round(worst)} ms`; el.dataset.ok = f >= 50 ? "good" : f >= 30 ? "fair" : "poor"; n = 0; t0 = t; worst = 0; }
    fpsRaf = requestAnimationFrame(tick); };
  fpsRaf = requestAnimationFrame(tick);
}
// Auto graphics: during the first battle on this device, if the stage cannot hold about 45 fps, drop to Smooth for good.
let gfxWatch = null;
function watchGraphics() {
  if (settings.graphics !== "auto" || gfxAuto === "smooth" || gfxWatch) return;
  const frames = []; let last = 0, t0 = 0;
  const tick = (t) => {
    const a = $("arena"), live = $("battle")?.classList.contains("active") && a && !a.classList.contains("theatre-on") && !document.hidden;
    if (live && last && t - last < 500) { frames.push(t - last); if (!t0) t0 = t; }
    last = t;
    if (frames.length >= 360 || (t0 && t - t0 > 12000)) {
      const s = frames.slice(30).sort((x, y) => x - y), med = s[s.length >> 1] || 16;
      gfxWatch = "done";
      if (med > 22 && settings.graphics === "auto") {
        gfxAuto = "smooth"; try { localStorage.setItem(GFX_AUTO_KEY, "smooth"); } catch {}
        applySettings(); toast("Graphics set to Smooth to keep this device running smoothly (change it in ⚙ Settings).");
      }
      return;
    }
    requestAnimationFrame(tick);
  };
  gfxWatch = "running"; requestAnimationFrame(tick);
}
function saveSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch {} applySettings(); }
function renderSettingsPanel() {
  const p = $("setPanel"); if (!p) return;
  const sw = (key, on, off) => `<div class="set-seg" role="group">${[[true, on], [false, off]].map(([v, l]) =>
    `<button type="button" data-set="${key}" data-v="${v}" class="${settings[key] === v ? "on" : ""}" aria-pressed="${settings[key] === v}">${l}</button>`).join("")}</div>`;
  const fs = document.fullscreenEnabled || document.webkitFullscreenEnabled;
  p.innerHTML = `
    <h2 class="set-title">Settings</h2>
    <p class="set-rule hidden" id="setRule"></p>
    <label class="set-row"><span class="set-label">Music</span>
      <input type="range" min="0" max="100" step="5" value="${settings.music}" data-vol="music" aria-label="Music volume" />
      <output class="set-val">${settings.music}</output></label>
    <label class="set-row"><span class="set-label">Sound effects</span>
      <input type="range" min="0" max="100" step="5" value="${settings.sfx}" data-vol="sfx" aria-label="Sound effects volume" />
      <output class="set-val">${settings.sfx}</output></label>
    <div class="set-row"><span class="set-label">Battle camera</span>${sw("camera", "Zoom in", "Stay wide")}</div>
    <div class="set-row set-col"><span class="set-label">Graphics</span>
      <div class="set-seg set-seg4" role="group">${[["auto", "Auto"], ["smooth", "Smooth"], ["balanced", "Balanced"], ["quality", "Detailed"]].map(([v, l]) =>
        `<button type="button" data-gfx="${v}" class="${settings.graphics === v ? "on" : ""}" aria-pressed="${settings.graphics === v}">${l}</button>`).join("")}</div></div>
    <p class="set-help">${{ auto: `Auto picks for this device (now ${gfxAuto === "smooth" ? "Smooth" : "Balanced"}).`,
      smooth: "Smooth: the steadiest frame rate. Fighters move at 3 frames a second and cinematics are lighter.",
      balanced: "Balanced: fighters move at 5 frames a second, with drifting light over the stage.",
      quality: "Detailed: full-speed fighters, drifting light and a slowly moving stage. Best on newer devices." }[settings.graphics] || ""}</p>
    <div class="set-row"><span class="set-label">Flashes and shaking</span>${sw("calm", "Calm", "Full")}</div>
    <div class="set-row"><span class="set-label">Frame rate</span>${sw("fps", "Show", "Hide")}</div>
    ${fs ? `<button type="button" class="set-full" data-full="1">${document.fullscreenElement || document.webkitFullscreenElement ? "Leave full screen" : "Full screen"}</button>` : ""}`;
  p.querySelectorAll("[data-vol]").forEach((r) => r.addEventListener("input", () => {
    settings[r.dataset.vol] = +r.value; r.nextElementSibling.textContent = r.value; saveSettings();
  }));
  p.querySelectorAll("[data-gfx]").forEach((b) => b.addEventListener("click", () => {
    settings.graphics = b.dataset.gfx; saveSettings(); renderSettingsPanel(); SFX.play("select");
  }));
  p.querySelectorAll("[data-set]").forEach((b) => b.addEventListener("click", () => {
    settings[b.dataset.set] = b.dataset.v === "true"; saveSettings(); renderSettingsPanel(); SFX.play("select");
  }));
  p.querySelector("[data-full]")?.addEventListener("click", () => {
    const d = document, el = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    setTimeout(renderSettingsPanel, 300);
  });
  applySettings();
}
function toggleSettings(open) {
  const p = $("setPanel"), b = $("setBtn"); if (!p) return;
  const show = open ?? p.classList.contains("hidden");
  if (show) renderSettingsPanel();
  p.classList.toggle("hidden", !show); b.setAttribute("aria-expanded", show);
}
$("setBtn")?.addEventListener("click", (e) => { e.stopPropagation(); toggleSettings(); });
document.addEventListener("pointerdown", (e) => { const p = $("setPanel"); if (p && !p.classList.contains("hidden") && !p.contains(e.target) && e.target !== $("setBtn")) toggleSettings(false); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") toggleSettings(false); });
setTimeout(applySettings, 0);
const spriteId = (charId, uid) => { const id = LAB[charId]; return id === "E" && uid && angelUids.has(uid) ? "EA" : id; };
function prepTheatre(cids, stage = 0) { if (TH) TH.prepare(cids.filter(Boolean), stage).catch(() => {}); }

// Plays one action as a cinematic. Returns false when it cannot (no art yet, or not an attack-type action).
function playTheatre({ actor, action, name, events }) {
  const b = room?.battle;
  if (!TH || !b || !["strike", "spell", "ultimate"].includes(action)) return false;
  const all = b.combatants, find = (uid) => all.find((c) => c.uid === uid);
  const actC = find(actor); if (!actC) return false;
  const evs = events || [], hits = evs.filter((e) => e.dmg != null);
  const foes = all.filter((c) => c.team !== actC.team), mates = all.filter((c) => c.team === actC.team && c.uid !== actC.uid);
  const tgtC = (hits[0] && find(hits[0].target)) ||
    evs.filter((e) => ["debuff", "stun", "fizzle"].includes(e.kind)).map((e) => find(e.target)).find((c) => c && c.team !== actC.team) ||
    foes.find((c) => c.alive) || foes[0];
  const allyC = mates.find((c) => c.alive) || null;
  const idx = action === "spell" ? actC.skills.findIndex((s) => s.name === name) : -1;
  const kind = action === "ultimate" ? "ult" : idx >= 0 ? "skill" : "strike";
  const stage = b.stage || 0, level = b.stageLevel || 1, simg = stageImg(stage, level), cids = [labId(actC), labId(allyC), labId(tgtC)];
  if (!TH.readyFor(cids, simg)) { prepTheatre(all.map(labId), simg); return false; }
  const myTeam = room.players.find((p) => p.id === myId)?.team ?? 0;
  const opts = {
    actor: cids[0], ally: cids[1], target: cids[2], kind, index: idx, stage, level, mirror: actC.team !== myTeam,
    angel: { actor: angelUids.has(actC.uid), ally: !!allyC && angelUids.has(allyC.uid), target: !!tgtC && angelUids.has(tgtC.uid) },
    dmg: hits.length ? hits.reduce((n, e) => n + e.dmg, 0) : null,
    crit: hits.some((e) => e.crit), weak: hits.some((e) => e.eff === "WEAK"), resist: hits.some((e) => e.eff === "RESIST"),
    miss: !hits.length && evs.some((e) => e.kind === "fizzle"), ko: !!tgtC && hits.some((e) => e.ko && e.target === tgtC.uid),
    heals: evs.filter((e) => e.heal != null).map((e) => e.heal),
  };
  clearAttackPose(actor);
  theatreOn = true; hideMoves(); updateCamera();
  $("arena").classList.add("theatre-on"); $("arena").classList.toggle("theatre-ult", kind === "ult");
  theatreDone = TH.play(opts).then(() => {
    if (actC.charId === "emi" && action === "ultimate") angelUids.add(actC.uid);
    theatreOn = false; applySettings();
    $("arena").classList.remove("theatre-on", "theatre-ult");
    showActionLog(actC, action, name, evs);
    const s = heldRoom; heldRoom = null;
    if (s) onRoom(s); else { updateBars(); if (room?.status === "battle") renderBattle(); }
  });
  return true;
}

// ============================================================
//  NAVIGATION
// ============================================================
document.querySelectorAll("[data-go]").forEach((b) =>
  b.addEventListener("click", () => {
    const dest = b.dataset.go;
    if (dest === "home") { refreshCoins(); showScreen("home"); }
    else if (dest === "tutorial") openTutorial();
    else showScreen(dest);
  })
);

// ============================================================
//  TUTORIAL
// ============================================================
const TUT_SLIDES = 5;
let tutSlide = 0;
function tutGoTo(i) {
  tutSlide = i;
  document.querySelectorAll(".tut-slide").forEach((s, j) => s.classList.toggle("active", j === i));
  document.querySelectorAll(".tut-dot").forEach((d, j) => d.classList.toggle("active", j === i));
  $("tutNext").querySelector("span").textContent = i >= TUT_SLIDES - 1 ? "START! ⚔" : "NEXT →";
}
// Build dots
{
  const dots = $("tutDots");
  for (let i = 0; i < TUT_SLIDES; i++) {
    const d = document.createElement("div");
    d.className = "tut-dot" + (i === 0 ? " active" : "");
    d.addEventListener("click", () => tutGoTo(i));
    dots.appendChild(d);
  }
}
$("tutSkip").addEventListener("click", () => { refreshCoins(); showScreen("home"); });
$("tutNext").addEventListener("click", () => {
  if (tutSlide >= TUT_SLIDES - 1) { refreshCoins(); showScreen("home"); }
  else tutGoTo(tutSlide + 1);
});

// ---- the practice fight: offered after ENTER THE RIFT, and from the lobby ----
const PRACTICE_KEY = "riftPracticeDone";
const practiceDoneBefore = () => { try { return localStorage.getItem(PRACTICE_KEY) === "1"; } catch { return false; } };
function openTutorial() {
  const back = practiceDoneBefore();
  $("prKicker").textContent = back ? "WELCOME BACK" : "FIRST TIME HERE?";
  // someone who has practised before is pointed at the lobby first
  $("prStart").className = "shard-btn " + (back ? "ghost" : "primary");
  $("prStart").querySelector("span").textContent = back ? "▶ PRACTISE AGAIN" : "▶ START PRACTICE";
  $("prSkip").className = "shard-btn " + (back ? "primary" : "ghost");
  $("prSkip").querySelector("span").textContent = back ? "GO TO LOBBY ▶" : "SKIP TO LOBBY";
  $("practiceIntro").classList.remove("hidden");
  $("rulesCard").classList.add("hidden");
  tutGoTo(0);
  showScreen("tutorial");
}
function startPractice() {
  SFX.play("select");
  resetBattleView();
  socket.emit("startPractice", { name: $("nameInput").value.trim() });
}
$("prStart").addEventListener("click", startPractice);
$("homePractice").addEventListener("click", startPractice);
$("prSkip").addEventListener("click", () => { refreshCoins(); showScreen("home"); });
$("prRules").addEventListener("click", () => {
  SFX.play("select");
  $("practiceIntro").classList.add("hidden");
  $("rulesCard").classList.remove("hidden");
  tutGoTo(0);
});

$("createBtn").addEventListener("click", () => socket.emit("createRoom", { name: $("nameInput").value.trim() || "Player" }));
$("joinBtn").addEventListener("click", () => {
  const code = $("codeInput").value.trim().toUpperCase();
  if (code.length !== 4) return ($("homeMsg").textContent = "Enter a 4-letter code.");
  const saved = loadTSession();
  socket.emit("joinRoom", { name: $("nameInput").value.trim() || "Player", code, token: saved?.code === code ? saved.token : undefined });
});
$("switchBtn").addEventListener("click", () => socket.emit("switchTeam"));
$("cdClose").addEventListener("click", closeCharDetail);
$("charDetail").addEventListener("click", (e) => { if (e.target.id === "charDetail") closeCharDetail(); });
$("readyBtn").addEventListener("click", () => {
  const meP = room?.players.find((p) => p.id === myId);
  socket.emit("setReady", { ready: !(meP && meP.ready) });
});
$("addBotABtn").addEventListener("click", () => socket.emit("addBot", { team: 0 }));
$("addBotBBtn").addEventListener("click", () => socket.emit("addBot", { team: 1 }));
$("startBtn").addEventListener("click", () => socket.emit("startMatch"));
$("rematchBtn").addEventListener("click", () => {
  if (room?.hostId === myId) socket.emit("rematch");
  else toast("Waiting for the host to restart…");
});

// ============================================================
//  SOCKET EVENTS
// ============================================================
socket.on("connect", () => {
  myId = socket.id;
  if (WATCH) return socket.emit("tWatch", { code: WATCH.code, matchId: spectating?.matchId || WATCH.matchId });
  // back in a class tournament after a reload or a dropped connection
  const t = loadTSession();
  if (t) socket.emit("tRejoin", { code: t.code, token: t.token });
});
socket.on("joined", ({ code, you }) => { if (you) myId = you; $("roomCode").textContent = code; });
socket.on("errorMsg", (m) => { $("homeMsg").textContent = m; $("roomMsg").textContent = m; toast(m); });
socket.on("toast", (m) => toast(m));

let preppedKey = "";
const preDecoded = [];   // keeps decoded pictures alive for the battle
socket.on("room", (s) => onRoom(s));
function onRoom(s) {
  // the same turn still resolving: hold the update until the cinematic ends; a new question means it must stop now
  if (theatreOn && s.status === "battle" && s.battle?.phase !== "question" && s.code === room?.code) { heldRoom = s; return; }
  if (theatreOn) { heldRoom = null; TH.skip(); }
  if (s.practice && s.code === practiceLeft) return;           // a practice fight we just left
  if (s.tournament) {
    const mine = s.players.some((p) => p.id === myId);
    if (mine) { if (spectating) leaveSpectate(false); }                       // own battle starts
    else if (!spectating || (spectating.code && spectating.code !== s.code)) return;   // not ours, not watched
    else spectating.code = s.code;
  }
  room = s;
  if (typeof s.serverNow === "number") clockSkew = s.serverNow - Date.now();
  if (s.status === "lobby") { preppedKey = ""; angelUids.clear(); renderRoom(); if (!$("topicScreen").classList.contains("hidden")) renderTopicSelect(s.hostId === myId); showScreen("room"); prepTheatre(s.players.map((p) => LAB[p.character])); }
  else if (s.status === "battle") ensureChibisThenRender(s.battle.combatants);
}

// battleStart can arrive before or after the room(battle) broadcast — handle bg here,
// but the authoritative sprite prep happens whenever battle data lands (ensureChibisThenRender).
socket.on("battleStart", () => {
  setTimeout(watchGraphics, 3000);
  angelUids.clear();
  setArenaBg(room?.status === "battle" ? room.battle?.stage : undefined, room?.battle?.stageLevel);
  showScreen("battle");
});

// Render immediately (fallback sprites), then upgrade to transparent chibis once ready.
function ensureChibisThenRender(combatants) {
  setArenaBg(room?.battle?.stage, room?.battle?.stageLevel);
  if (room?.battle) { preloadStage(room.battle.stage || 0, room.battle.stageLevel || 1); prepTheatre([], stageImg(room.battle.stage || 0, (room.battle.stageLevel || 1) + 1)); }
  showScreen("battle");
  renderBattle();
  const ids = combatants.map((c) => c.charId);
  const mine = combatants.find((c) => c.uid === myId);
  if (mine && !ensureChibisThenRender._sheet?.[mine.charId]) {            // skill cards open instantly later
    (ensureChibisThenRender._sheet ||= {})[mine.charId] = true;
    new Image().src = encodeURI(ASSETS.skillSheet(mine.charId));
  }
  const key = ids.slice().sort().join(",");
  if (key === preppedKey) return;
  preppedKey = key;
  prepTheatre(ids.map((id) => LAB[id]), stageImg(room?.battle?.stage || 0, room?.battle?.stageLevel || 1));
  // decode the stage poses and the skill cards now, so the first spotlight and the first skill sheet do not stall
  const dec = (u) => { const im = new Image(); im.src = encodeURI(u); im.decode?.().catch(() => {}); return im; };
  preDecoded.length = 0;
  for (const id of new Set(ids.map((x) => LAB[x]).flatMap((x) => (x === "E" ? ["E", "EA"] : [x])))) preDecoded.push(dec(`theatre/arena/${id}_pose_ol.webp`), dec(`theatre/arena/${id}.webp`));
  if (mine) preDecoded.push(dec(ASSETS.skillSheet(mine.charId)));
  preloadArt(ids).then((done) => { if (done.length && room?.status === "battle") renderBattle(); });
}

socket.on("answerResult", ({ uid, correct, correctIndex, correctAll, explain }) => {
  if (uid === myId) { myAnswerCorrect = correct; SFX.play(correct ? "correct" : "wrong"); showAnswerBanner(correct); }
  if (correct) setAttackPose(uid);
  // after a wrong answer the right one stays secret while others can still steal it
  const right = correctAll || (correctIndex != null ? [correctIndex] : null);
  if (right) lastReveal = { key: qKey(room?.battle?.question), right, explain };
  document.querySelectorAll("#mcqChoices .choice").forEach((b, i) => {
    b.disabled = true;
    if (right && right.includes(i)) b.classList.add("correct");
    else if (i === mySelected && uid === myId) b.classList.add("wrong");
  });
  if (uid === myId) {
    const fb = $("mcqFeedback");
    fb.className = "mcq-feedback " + (correct ? "good" : "bad");
    const hinted = !!hintFor(room?.battle?.question);
    fb.textContent = correct
      ? (hinted ? "✓ CORRECT! You used a hint, so this move is not powered up." : `✓ CORRECT! Your attacks are powered up.${explain ? "  " + explain : ""}`)
      : "✗ Not this time. You guard this turn.";
    fb.classList.remove("hidden");
  }
  stopTimer();
});

// ---- hints: asked for on your own question, at a cost ----
let myHint = null;          // { startedAt, kind: "text"|"fifty", text, removed }
let hintArmed = false;      // first tap shows the cost, the second tap uses the hint
socket.on("hint", (h) => { myHint = h; hintArmed = false; applyHint(); if (room?.battle) renderBattle(); });
socket.on("hintUsed", ({ uid, hpCost }) => {
  if (hpCost) floatAt(uid, `-${hpCost} HP`, "dmg");
  spawnEfx(uid, "ring", "#F2B84B", 0.4);
});
const hintFor = (q) => (myHint && q && myHint.startedAt === q.startedAt ? myHint : null);
function hintCostText(q) {
  return q?.hintCost === "hp" ? "Your move won't be powered up, half Sync, and you lose 10% HP." : "Your move won't be powered up and you get half Sync.";
}
// Show the hint (or take the wrong answers away) in the question card.
function applyHint() {
  const q = room?.battle?.question, h = hintFor(q), box = $("mcqHintBox");
  if (!box) return;
  if (!h) { box.classList.add("hidden"); box.textContent = ""; return; }
  box.classList.remove("hidden");
  if (h.kind === "text") box.innerHTML = `<b>💡 HINT</b><span>${esc(h.text)}</span>`;
  else {
    box.innerHTML = `<b>💡 HINT</b><span>${h.removed.length === 1 ? "One wrong answer has" : "Two wrong answers have"} been taken away.</span>`;
    document.querySelectorAll("#mcqChoices .choice").forEach((btn, i) => {
      if (h.removed.includes(i)) { btn.disabled = true; btn.classList.add("removed"); }
    });
  }
}
// The hint button in your question card: how many are left, and what it costs.
function updateHintButton(q, me, asking) {
  const btn = $("mcqHint"); if (!btn) return;
  const used = !!hintFor(q);
  const left = me?.hintsLeft ?? 0;
  if (!asking || !q?.hint || (!used && left <= 0)) { btn.classList.add("hidden"); hintArmed = false; return; }
  btn.classList.remove("hidden");
  btn.disabled = used;
  btn.classList.toggle("armed", hintArmed && !used);
  btn.classList.toggle("used", used);
  btn.innerHTML = used ? "💡 HINT USED"
    : hintArmed ? `<b>TAP AGAIN FOR THE HINT</b><small>${esc(hintCostText(q))}</small>`
    : `<b>💡 HINT</b><small>${left} left</small>`;
}
$("mcqHint")?.addEventListener("click", () => {
  const q = room?.battle?.question;
  if (!q || hintFor(q) || inputLocked) return;
  if (!hintArmed) { hintArmed = true; SFX.play("select"); updateHintButton(q, room.battle.combatants.find((c) => c.uid === myId), true); return; }
  hintArmed = false; SFX.play("select");
  socket.emit("useHint");
});

// Nobody stole the question: now everyone may see the right answer.
socket.on("answerReveal", ({ correctIndex, correctAll, explain }) => {
  lastReveal = { key: qKey(room?.battle?.question), right: correctAll || [correctIndex], explain };
});

// Steal window opened (original player answered wrong)
socket.on("stealOpen", ({ originalUid, originalName, seconds, untimed }) => {
  stealMeta = { originalUid, originalName, seconds, untimed: !!untimed, startedAt: srvNow() };
  renderBattle();
});

// Result after a steal attempt
socket.on("stealResult", ({ uid, correct, correctIndex, correctAll, explain }) => {
  if (correct) {
    // Successful steal — close window for everyone
    stealMeta = null;
    if (uid === myId) { myAnswerCorrect = true; SFX.play("correct"); showAnswerBanner(true); }
    const right = correctAll || [correctIndex];
    lastReveal = { key: qKey(room?.battle?.question), right, explain };
    document.querySelectorAll("#mcqChoices .choice").forEach((b, i) => {
      b.disabled = true;
      if (right.includes(i)) b.classList.add("correct");
      else if (i === mySelected && uid === myId) b.classList.add("wrong");
    });
    const fb = $("mcqFeedback");
    fb.className = "mcq-feedback good steal";
    fb.textContent = `⚡ ${nameOf(uid)} stole the turn! Attacks do half damage.`;
    fb.classList.remove("hidden");
    stopTimer();
    bannerFlash(`⚡ ${nameOf(uid)} STOLE THE TURN!`, "mine");
    toast(`⚡ ${nameOf(uid)} stole the turn! (half damage)`);
  } else {
    // Failed steal — only lock out the player who got it wrong; others stay active
    if (uid === myId) {
      SFX.play("wrong");
      document.querySelectorAll("#mcqChoices .choice").forEach((b) => { b.disabled = true; });
      const fb = $("mcqFeedback");
      fb.className = "mcq-feedback bad";
      fb.textContent = "✗ Not that one. The others can still try.";
      fb.classList.remove("hidden");
    }
    // Don't touch stealMeta, don't stop the timer — window stays open for others
    if (uid !== myId) toast(`${nameOf(uid)} tried to steal and missed.`);
  }
});

// Both teammates answered correctly → sync surge
socket.on("teamSync", ({ team, amount, streak }) => {
  if (spectating) return;
  const myTeam = room?.players.find((p) => p.id === myId)?.team ?? 0;
  if (team === myTeam) { SFX.play("sync"); bannerFlash(`🔥 ${streak || 2} RIGHT IN A ROW · SYNC +${amount || ""}`, "mine"); }
});

function bannerFlash(text, cls) {
  const tb = $("turnBanner"); if (!tb) return;
  // remember what was there before the first of several quick flashes, so a flash
  // that lands during another one doesn't leave the older banner stuck on screen
  if (!bannerFlash._t) bannerFlash._prev = [tb.textContent, tb.className];
  tb.textContent = text; tb.className = "turn-banner " + (cls || "");
  clearTimeout(bannerFlash._t);
  bannerFlash._t = setTimeout(() => { [tb.textContent, tb.className] = bannerFlash._prev; bannerFlash._t = null; }, 1400);
}

// element → vivid effect colour
const EL_FX = { Fire:"#ff5a2c", Water:"#3aa0ff", Electric:"#ffd84d", Thunder:"#ffd84d",
  Wind:"#7cf2a0", Earth:"#caa46a", Light:"#fff2a8", Shadow:"#b061ff", Dark:"#b061ff",
  Ice:"#9be8ff", Nature:"#7cf2a0", Psychic:"#ff6df0" };
const fxColor = (el) => EL_FX[el] || elemColor(el);

// Spawn a battle effect (slash / ring / burst / impact) centered on a fighter.
function spawnEfx(uid, type, colorHex, dy = 0.45) {
  const el = tokenEl(uid); if (!el) return;
  const anchor = el.querySelector(".chibi") || el;
  const ar = $("arena").getBoundingClientRect(), r = anchor.getBoundingClientRect();
  const d = document.createElement("div");
  d.className = "efx " + type;
  d.style.left = (r.left - ar.left + r.width / 2) + "px";
  d.style.top  = (r.top  - ar.top  + r.height * dy) + "px";
  d.style.setProperty("--ef", colorHex);
  $("fxLayer").appendChild(d);
  setTimeout(() => d.remove(), 900);
}

let actedKey = "";       // the turn whose move has already played, so the camera does not swing back onto that fighter
socket.on("actionResult", (msg) => {
  actedKey = `${msg.actor}|${room?.battle?.question?.startedAt}`;
  if (theatreOn) TH.skip();
  if (playTheatre(msg)) return;
  stageEffects(msg);
});
function stageEffects({ actor, action, name, events, why }) {
  if (why === "wrong") { const a = room?.battle?.combatants?.find((c) => c.uid === actor); if (a && actor !== myId) toast(`${upper(a.name)} gave the wrong reason. The Ultimate became a Strike.`); }
  const actC  = room?.battle?.combatants?.find((c) => c.uid === actor);
  const col   = fxColor(actC?.element);
  const type  = action;   // server sends the action TYPE as a string ("strike"/"spell"/"ultimate"/…)
  showActionLog(actC, type, name, events);   // narrate what just happened

  // actor: lunge (the attack costume is already worn from the correct answer),
  // plus a cast effect + sound. Revert to idle once the attack resolves.
  const af = tokenEl(actor);
  if (af && (type === "strike" || type === "spell" || type === "ultimate")) {
    const cls = af.dataset.facing === "left" ? "attackL" : "attack";
    af.classList.add(cls); setTimeout(() => af.classList.remove(cls), 500);
    setAttackPose(actor);                                  // ensure the costume is on for the swing
    af.classList.add("striking");
    setTimeout(() => { af.classList.remove("striking"); clearAttackPose(actor); }, 900);
  } else if (af) {
    clearAttackPose(actor);                                // non-attack action (defend/item/tag) → back to idle
  }
  if (type === "strike")   SFX.play("strike");
  if (type === "spell")  { spawnEfx(actor, "ring",  col, 0.5); SFX.play("spell"); }
  if (type === "ultimate") spawnEfx(actor, "burst", col, 0.5);

  let weak = false, hitSound = false;
  (events || []).forEach((ev) => {
    if (ev.dmg != null) {
      const tf = tokenEl(ev.target);
      if (tf) { tf.classList.add("hurt"); setTimeout(() => tf.classList.remove("hurt"), 420); }
      const tcol = ev.eff === "WEAK" ? "#FFE45C" : col;
      spawnEfx(ev.target, type === "spell" ? "burst" : "slash", tcol);
      spawnEfx(ev.target, "impact", tcol);
      if (ev.crit) spawnEfx(ev.target, "burst", "#F2B84B");
      floatAt(ev.target, (ev.crit ? "CRIT " : "") + "-" + ev.dmg, ev.crit ? "crit" : "dmg");
      if (!hitSound) { SFX.play(ev.crit ? "crit" : "hit"); hitSound = true; }
      if (ev.eff === "WEAK") { weak = true; floatAt(ev.target, "WEAK!", "weakpop"); spawnEfx(ev.target, "impact", "#FFE45C"); SFX.play("weak"); }
      if (ev.ko) floatAt(ev.target, "K.O.!", "crit");
    } else if (ev.heal != null) { floatAt(ev.target, "+" + ev.heal + " HP", "heal"); spawnEfx(ev.target, "burst", "#55F28B", 0.5); SFX.play("heal"); }
    else if (ev.kind === "sp") floatAt(ev.target, "+SP", "heal");
    else if (ev.kind === "ultimate") { flash(); cutIn(actor, ev.name); SFX.play("ultimate"); }
    else if (ev.kind === "guard") { floatAt(ev.target, "GUARD", "heal"); spawnEfx(ev.target, "ring", "#38E8D6", 0.5); }
    else if (ev.kind === "defend") floatAt(ev.target, "DEFEND", "heal");
    else if (ev.kind === "sync") floatAt(ev.target, "SYNC+", "heal");
    else if (ev.kind === "fizzle") { floatAt(ev.target, ev.miss ? "MISS!" : "MISS!", "weakpop"); SFX.play("fizzle"); }
    else if (ev.kind === "revive") { floatAt(ev.target, "REVIVE!", "heal"); spawnEfx(ev.target, "burst", "#F2B84B", 0.5); }
    else if (ev.kind === "buff") { const lbl = ev.eff === "def" ? "DEF↑" : ev.eff === "acc" ? "FOCUS↑" : "ATK↑"; floatAt(ev.target, lbl, "heal"); spawnEfx(ev.target, "ring", col, 0.5); }
    else if (ev.kind === "debuff") { const lbl = ev.eff === "timer" ? "−4s" : ev.eff === "accuracy" ? "ACC↓" : ev.eff === "atk" ? "ATK↓" : ev.eff === "def" ? "DEF↓" : "WEAKEN"; floatAt(ev.target, lbl, "weakpop"); spawnEfx(ev.target, "ring", "#A855F7", 0.5); }
    else if (ev.kind === "cleanse") { floatAt(ev.target, "CLEANSED", "heal"); spawnEfx(ev.target, "burst", "#FFE9A8", 0.5); }
    else if (ev.kind === "stun-skip") { floatAt(ev.target, "STUNNED", "weakpop"); }
    else if (ev.kind === "stun") { floatAt(ev.target, "STUNNED!", "weakpop"); spawnEfx(ev.target, "ring", "#9be8ff", 0.5); }
  });
  if (weak) {
    const tb = $("turnBanner");
    tb.classList.add("weak");
    setTimeout(() => tb.classList.remove("weak"), 900);
  }
  // re-render HP bars without rebuilding DOM (avoids animation flicker)
  updateBars();
}

// Action narration popup: "Saya used Crystal Lock — 142 dmg to Renji ⚡WEAK"
function showActionLog(actC, type, name, events) {
  if (!actC) return;
  const myTeam = room.players.find((p) => p.id === myId)?.team ?? 0;
  const isAlly = actC.team === myTeam;
  const cName = (uid) => room?.battle?.combatants?.find((c) => c.uid === uid)?.charName || "someone";

  const DEBUFF_TXT = { timer: "−4s answer time", accuracy: "lowered accuracy", atk: "lowered ATK", def: "lowered DEF" };
  let totalDmg = 0; const dmgT = []; const heals = []; const guards = []; const kos = [];
  let weak = false, crit = false, resist = false, other = "";
  (events || []).forEach((ev) => {
    if (ev.dmg != null) {
      totalDmg += ev.dmg;
      const n = cName(ev.target); if (!dmgT.includes(n)) dmgT.push(n);
      if (ev.eff === "WEAK") weak = true;
      if (ev.eff === "RESIST") resist = true;
      if (ev.crit) crit = true;
      if (ev.ko) kos.push(n);
    } else if (ev.heal != null) heals.push(`+${ev.heal} HP → ${cName(ev.target)}`);
    else if (ev.kind === "guard") { const n = cName(ev.target); if (!guards.includes(n)) guards.push(n); }
    else if (ev.kind === "buff") other = ev.eff === "def" ? "hardened defense" : ev.eff === "acc" ? "sharpened focus" : "powered up";
    else if (ev.kind === "debuff") other = DEBUFF_TXT[ev.eff] ? `${DEBUFF_TXT[ev.eff]} on ${cName(ev.target)}` : `weakened ${cName(ev.target)}`;
    else if (ev.kind === "cleanse") other = `cleansed ${cName(ev.target)}`;
    else if (ev.kind === "defend") other = "braced for impact";
    else if (ev.kind === "sp") other = `restored ${ev.sp} SP`;
    else if (ev.kind === "revive") other = `revived ${cName(ev.target)}`;
    else if (ev.kind === "stun-skip") other = "is stunned — skips the turn";
    else if (ev.kind === "stun") other = `${cName(ev.target)} misses their next turn`;
    else if (ev.kind === "fizzle") other = ev.miss ? "missed! (accuracy down)" : "missed!";
  });
  if (guards.length && !other) other = `shielded ${guards.join(", ")}`;

  // verb + skill name
  const verb = type === "stunned" ? "" : type === "steal" ? "" : type === "strike" ? "strikes with" :
               type === "ultimate" ? "unleashes" : type === "defend" ? "uses" : type === "tag" ? "uses" : "uses";
  const parts = [];
  if (totalDmg > 0) {
    let d = `${totalDmg} dmg → ${dmgT.join(", ")}`;
    if (crit) d = "CRIT " + d;
    if (weak) d += "  ⚡WEAK";
    else if (resist) d += "  🛡RESIST";
    parts.push(d);
  }
  if (heals.length) parts.push(heals.join(" · "));
  if (other) parts.push(other);
  if (kos.length) parts.push(`💀 ${kos.join(", ")} K.O.!`);
  const detail = parts.join("  ·  ");

  const col = ELEMENT_COLORS[actC.element] || "#fff";
  const log = $("actionLog");
  log.style.setProperty("--lcol", col);
  log.className = "action-log " + (isAlly ? "ally" : "foe") + (type === "ultimate" ? " ult" : "");
  log.innerHTML = (type === "stunned")
    ? `<span class="al-actor">${actC.charName}</span><span class="al-detail">is stunned — skips the turn</span>`
    : `<span class="al-actor">${actC.charName}</span>` +
      `<span class="al-verb">${verb}</span>` +
      `<span class="al-skill" style="color:${col}">${name || ""}</span>` +
      (detail ? `<span class="al-detail">${detail}</span>` : "");
  log.classList.add("show");
  clearTimeout(showActionLog._t);
  showActionLog._t = setTimeout(() => log.classList.remove("show"), 3000);
}

// Persona-style ultimate cut-in: the full Ultimate Scene splash slides across.
function cutIn(uid, name) {
  const c = room?.battle?.combatants?.find((x) => x.uid === uid);
  const ci = $("cutin"); if (!ci || !c) { toast("⚡ " + name); return; }
  if (cutIn._busy) return;                              // already showing — never double-trigger
  cutIn._busy = true;
  const src = ASSETS.ult(c.charId);
  ci.innerHTML = `<img class="cutin-art" src="${encodeURI(src)}" alt="">` +
    `<span class="cutin-name">${name}</span>`;
  // restart the entry animation cleanly each time
  ci.classList.remove("hidden");
  void ci.offsetWidth;
  // show ONCE, hold for 2s, then disappear (CSS animation holds its end state)
  clearTimeout(cutIn._t);
  cutIn._t = setTimeout(() => { ci.classList.add("hidden"); cutIn._busy = false; }, 2000);
}

socket.on("battleEnd", (d) => { if (theatreOn) theatreDone.then(() => battleEnded(d)); else battleEnded(d); });
function battleEnded({ winnerTeam, reason, rewards, tournament, practice }) {
  attackPosed.clear();
  if (spectating) return spectatedBattleEnded(winnerTeam, reason);
  stopMatchClock();
  if (practice) return showPracticeDone();
  $("practiceDone").classList.add("hidden"); $("practiceAgain").classList.add("hidden");
  const myTeam = room.players.find((p) => p.id === myId)?.team ?? 0;
  const won = myTeam === winnerTeam;
  const draw = winnerTeam === -1;
  const r = rewards[myId];
  if (r) { profile.coins += r.coins; saveProfile(profile); refreshCoins(); }
  $("resultTitle").textContent = draw ? "DRAW" : won ? "VICTORY!" : "DEFEAT";
  $("resultTitle").className = "result-title" + (won ? "" : " lose");

  const review  = (r && r.review) || [];
  const answered = review.length;
  const gotRight = review.filter((x) => x.correct).length;
  // one entry per question, newest attempt last, and whether it was put right later in the battle
  const seen = new Map();
  for (const x of review) { const k = x.qid || x.q; const e = seen.get(k) || { ...x, wrong: 0, fixed: false }; if (x.correct) { if (e.wrong) e.fixed = true; } else { e.wrong++; e.chosen = x.chosen; } seen.set(k, e); }
  const missed   = [...seen.values()].filter((x) => x.wrong > 0).sort((a, b) => a.fixed - b.fixed);

  const timeLine = reason === "time"
    ? (draw ? "Time up. Both teams had the same HP and the same number of correct answers."
            : won ? "Time up. Your team had more HP left." : "Time up. The other team had more HP left.")
    : "";
  const lines = [
    `<div class="reward-line"><span>${draw ? "🤝 Neither team could win this one." : won ? "🏆 Your team won the Rift!" : "Study hard and try again!"}</span></div>`,
    ...(timeLine ? [`<div class="reward-line"><span>⏱ ${timeLine}</span></div>`] : []),
    ...(answered ? [`<div class="reward-line"><span>✅ You answered</span><span>${gotRight} / ${answered} correct</span></div>`] : []),
    ...(r?.along?.answered ? [`<div class="reward-line"><span>👥 Answering along</span><span>${r.along.right} / ${r.along.answered} correct</span></div>`] : []),
    ...(tournament && r?.coins ? [`<div class="reward-line coins"><span>🪙 Coins earned · spend them at Auntie's shop</span><span>+${r.coins}</span></div>`,
      ...(r.coinParts ? [`<div class="reward-line coin-parts"><span>Battle ${r.coinParts.battle} · answers ${r.coinParts.answers}${r.coinParts.fixedCount ? ` · <b>${r.coinParts.fixedCount} mistake${r.coinParts.fixedCount > 1 ? "s" : ""} put right +${r.coinParts.fixed}</b>` : " · put a mistake right for +40 each"}</span></div>`] : [])] : []),
    ...(r?.why?.asked ? [`<div class="reward-line"><span>⚡ Ultimate reasons</span><span>${r.why.right} / ${r.why.asked} right</span></div>`] : []),
  ];
  lastEarned = tournament && r?.coins ? r.coins : 0;

  // Learning recap — show the questions THIS player got wrong, with the right answer + why.
  let recap = "";
  if (missed.length) {
    recap = `<div class="review-block">
      <h3 class="review-head">📖 ${missed.length > 1 ? `Review these ${missed.length} questions` : "Review this question"}</h3>` +
      missed.map((x) => {
        const chosen = x.chosen >= 0 ? `${"ABCD"[x.chosen]}. ${esc(x.choices[x.chosen])}` : "No answer (timed out)";
        const rights = (x.answers || [x.answer]).map((k) => `✓ ${"ABCD"[k]}. ${esc(x.choices[k])}`).join("<br>");
        const bm = BLOOM_META[x.bloom];
        const badge = bm ? `<span class="review-bloom" style="color:${bm.color};border-color:${bm.color}">${bm.icon} ${x.bloom}</span>` : "";
        return `<div class="review-item ${x.fixed ? "fixed" : ""}">
          <div class="review-q"><span class="review-topic">${esc(x.topic)}</span>${badge}${x.fixed ? `<span class="review-fixed">✓ Put right later</span>` : x.wrong > 1 ? `<span class="review-fixed bad">Wrong ${x.wrong} times</span>` : ""}<span class="review-qtext">${esc(x.q)}</span></div>
          ${x.lo && x.lo !== x.topic ? `<div class="review-lo">Learning objective: ${esc(x.lo)}</div>` : ""}
          ${x.image ? `<img class="review-pic" src="${esc(x.image)}" alt="Picture for this question" loading="lazy" />` : ""}
          <div class="review-your">Your answer: ${chosen}</div>
          <div class="review-correct">${rights}</div>
          ${x.explain ? `<div class="review-explain">${esc(x.explain)}</div>` : ""}
        </div>`;
      }).join("") + `</div>`;
  } else if (answered) {
    recap = `<div class="review-block"><h3 class="review-head good">🌟 Perfect — you answered every question correctly!</h3></div>`;
  }

  $("resultBody").innerHTML = lines.join("") + recap + reportHTML(r?.report, !!tournament);
  bindReport(r?.report, !!tournament);
  const inTourney = !!tournament;
  $("rematchBtn").style.display = !inTourney && room.hostId === myId ? "" : "none";
  $("lobbyBtn").style.display = inTourney ? "none" : "";
  $("backToTourney").classList.toggle("hidden", !inTourney);
  updateWatchFromResult();
  showScreen("result");
}

// ---- the Rift Report: write it down ----
// Two or three short prompts from what this player missed (or, with nothing missed, from today's objectives), answered
// in full sentences. Only after writing do they see the right answer to compare with. In a tournament the answers go
// to the teacher's learning report.
function reportHTML(rep, inTourney) {
  if (!rep?.prompts?.length) return "";
  return `<div class="report-block" id="riftReport">
    <h3 class="review-head">✍️ Write it down</h3>
    <p class="report-sub">Answer in full sentences, using the proper terms.${inTourney ? " Your teacher will read your answers." : ""}</p>
    ${rep.prompts.map((p, i) => `<div class="report-item" data-pid="${esc(p.id)}">
      <label class="report-q" for="rp${i}">${i + 1}. ${esc(p.text)}</label>
      <textarea id="rp${i}" rows="2" maxlength="600" placeholder="Write your answer here"></textarea>
      <div class="report-model hidden">${p.kind === "lo" ? "Compare with the question you missed:" : "Compare with the right answer:"} <b>${esc(p.model)}</b>${p.lo ? `<small>Learning objective: ${esc(p.lo)}</small>` : ""}</div>
    </div>`).join("")}
    <button type="button" class="shard-btn small" id="reportSend"><span>${inTourney ? "SEND TO MY TEACHER" : "CHECK MY ANSWERS"}</span></button>
    <p class="report-done hidden" id="reportDone"></p>
  </div>`;
}
function bindReport(rep, inTourney) {
  const btn = $("reportSend"); if (!btn || !rep) return;
  btn.addEventListener("click", () => {
    const answers = rep.prompts.map((p, i) => ({ id: p.id, text: $("rp" + i)?.value.trim() || "" }));
    if (answers.filter((a) => a.text.length >= 3).length < answers.length) { toast("Write an answer for each one first."); return; }
    SFX.play("select");
    if (inTourney) socket.emit("tReport", { answers });
    document.querySelectorAll("#riftReport textarea").forEach((t) => (t.readOnly = true));
    document.querySelectorAll("#riftReport .report-model").forEach((m) => m.classList.remove("hidden"));
    btn.disabled = true;
    const done = $("reportDone"); done.classList.remove("hidden");
    done.textContent = inTourney ? "Sent. Now compare each answer with the right one." : "Now compare each answer with the right one.";
  });
}

// ============================================================
//  ROOM RENDER
// ============================================================
function nameOf(uid) {
  const c = room?.battle?.combatants?.find((x) => x.uid === uid);
  if (c) return c.name;
  return room?.players.find((x) => x.id === uid)?.name || "Player";
}

function renderRoom() {
  $("roomCode").textContent = room.code;
  const isHost = room.hostId === myId;
  const meP = room.players.find((p) => p.id === myId);
  renderTopicSelect(isHost);

  [["slotsA",0],["slotsB",1]].forEach(([elId, team]) => {
    const wrap = $(elId); wrap.innerHTML = "";
    const list = room.players.filter((p) => p.team === team);
    for (let i = 0; i < 2; i++) {
      const p = list[i];
      if (!p) { wrap.insertAdjacentHTML("beforeend", `<div class="slot empty">— open slot —</div>`); continue; }
      const cls = ["slot"]; if (p.id === myId) cls.push("me"); if (p.ready) cls.push("ready");
      const charData = p.character ? CHAR_BY_ID[p.character] : null;
      const sub = charData ? `${charData.name} · ${charData.element}` : "choosing…";
      const rm = (isHost && p.bot) ? `<span class="rm" data-rm="${p.id}">✕</span>` : "";
      const thumbHtml = p.character ? `<div class="mini">${thumb(p.character)}</div>` : `<div class="mini-empty"></div>`;
      wrap.insertAdjacentHTML("beforeend",
        `<div class="${cls.join(" ")}">${thumbHtml}
         <div><div class="slot-name">${esc(p.name)}${p.id===myId?" (you)":""}</div>
         <div class="slot-sub">${p.ready?"✓ ready · ":""}${sub}</div></div>${rm}</div>`);
    }
  });
  document.querySelectorAll("[data-rm]").forEach((el) =>
    el.addEventListener("click", () => socket.emit("removePlayer", { id: el.dataset.rm })));

  $("readyBtn").querySelector("span").textContent = meP?.ready ? "✗ UNREADY" : "✓ READY";
  $("addBotABtn").style.display = isHost ? "" : "none";
  $("addBotBBtn").style.display = isHost ? "" : "none";
  const t0 = room.players.filter((p) => p.team === 0).length;
  const t1 = room.players.filter((p) => p.team === 1).length;
  const canStart = isHost && t0===2 && t1===2 && room.players.every((p) => p.character);
  $("startBtn").style.display = isHost ? "" : "none";
  $("startBtn").disabled = !canStart;
  $("startBtn").querySelector("span").textContent = canStart ? "⚔ START MATCH" : "⚔ NEED 2v2 + PICKS";

  // the two cards: topics and your fighter
  $("topicCard").innerHTML = `<span class="rc-label">Topics tested</span><span class="rc-value">${esc(topicSummary())}</span>
    <span class="rc-action">${isHost ? "Change topics" : "See topics"}</span>`;
  const mc = meP?.character && CHAR_BY_ID[meP.character];
  $("fighterCard").style.setProperty("--ecol", mc ? ELEMENT_COLORS[mc.element] : "var(--gold)");
  $("fighterCard").innerHTML = mc
    ? `<span class="rc-port">${portrait(mc.id)}</span><span class="rc-text"><span class="rc-label">Your fighter</span><span class="rc-value">${esc(mc.name)}</span>
       <span class="rc-meta" style="color:${ELEMENT_COLORS[mc.element]}">${esc(mc.element)} · ${esc(mc.role)}</span><span class="rc-action">Change fighter</span></span>`
    : `<span class="rc-port empty">?</span><span class="rc-text"><span class="rc-label">Your fighter</span><span class="rc-value">Not chosen yet</span><span class="rc-action">Choose fighter</span></span>`;
  fighterPicker.mine = meP?.character || null; fighterPicker.tags = {};
  for (const p of room.players) if (p.character && p.id !== myId) (fighterPicker.tags[p.character] ||= []).push(p.bot ? "BOT" : upper(p.name));
  if (!$("fighterScreen").classList.contains("hidden") && fighterPicker.from === "room") renderRoster();
  // first time in a room without a fighter: the fighter screen opens by itself
  if (meP && !meP.character && fighterPicker.autoRoom !== room.code) { fighterPicker.autoRoom = room.code; openFighterScreen("room"); }
}

// ---- topics: a short summary on the room card, the full list on its own screen ----
function topicSummary() {
  const chosen = String(room?.topicId || "mixed").split(",");
  const names = chosen.map((id) => TOPICS.find((t) => t.id === id)?.name || (room.topicParts || []).find((p) => p.id === id)?.title
    || (hubSets || []).find((p) => p.id === id)?.title || "Your question set");
  return names.length > 3 ? `${names.slice(0, 2).join(", ")} and ${names.length - 2} more` : names.join(", ");
}
function openTopicScreen() { SFX.play("select"); renderTopicSelect(room?.hostId === myId); $("topicScreen").classList.remove("hidden"); }

// ---- choose your fighter: one screen for the room and the class tournament ----
const fighterPicker = { from: null, mine: null, tags: {}, onPick: null, autoRoom: null };
function renderRoster() {
  const ros = $("roster");
  ros.innerHTML = CHARACTERS.map((c) => {
    const col = ELEMENT_COLORS[c.element], picked = fighterPicker.mine === c.id, tags = [picked ? "YOU" : "", ...(fighterPicker.tags[c.id] || [])].filter(Boolean);
    return `<button type="button" class="rcard ${picked ? "picked" : ""}" data-pick="${c.id}" style="--ecol:${col}">
        <i class="rgem"></i>
        <div class="rport">${portrait(c.id)}</div>
        <div class="rname">${NAME[c.id]}</div>
        <div class="relem" style="color:${col}">${c.element}</div>
        <div class="rrole">${c.role}</div>
        ${tags.length ? `<span class="rtag">${esc(tags.join(" · "))}</span>` : ""}
      </button>`;
  }).join("");
  ros.querySelectorAll("[data-pick]").forEach((el) => el.addEventListener("click", () =>
    openCharDetail(el.dataset.pick, (charId) => { closeFighterScreen(); if (fighterPicker.onPick) fighterPicker.onPick(charId); else socket.emit("pickCharacter", { charId }); })));
}
function openFighterScreen(from, onPick = null) {
  fighterPicker.from = from; fighterPicker.onPick = onPick;
  $("fighterSub").textContent = from === "tourney" && !fighterPicker.mine ? "Tap a fighter to see their skills. If you do not pick, you get a random fighter." : "Tap a fighter to see their skills.";
  renderRoster(); $("fighterScreen").classList.remove("hidden");
}
function closeFighterScreen() { $("fighterScreen").classList.add("hidden"); }

// ---- host topic picker (spans Bloom's taxonomy), plus the teacher's own sets ----
let hubSets = null, hubSetsAt = 0;
function loadHubSets() {
  if (Date.now() - hubSetsAt < 15000) return;
  hubSetsAt = Date.now();
  socket.emit("getSets", (list) => {
    hubSets = Array.isArray(list) ? list : [];
    if (room?.status === "lobby" && !room.tournament) renderTopicSelect(room.hostId === myId);
  });
}
// Topics sit in folders (Sec 1, Sec 2, Sec 3 G1): one folder open at a time keeps the screen short.
// The chapter quizzes and the teacher's sets carry their folder; the built-in cell topics are in the last folder.
let topicFolder = null;
function renderTopicSelect(isHost) {
  const wrap = $("topicPanel"); if (!wrap) return;
  // the host can tick several topics and question sets; the battle draws from all of them
  const chosen = new Set(String(room.topicId || "mixed").split(","));
  if (isHost) loadHubSets();
  const sets = isHost ? (hubSets || []) : (room.topicParts || []).filter((p) => p.own).map((p) => ({ id: p.id, title: p.title, count: null, folder: p.folder }));
  const items = (fid) => [
    ...sets.filter((x) => folderOf(x.folder) === fid).map((x) => ({ id: x.id, icon: x.library ? "📘" : "📝", name: x.title,
      blurb: x.count != null ? `${x.count} question${x.count === 1 ? "" : "s"}${x.library ? "" : " from the question hub"}` : "From the question hub" })),
    ...(fid === DEFAULT_FOLDER ? TOPICS.map((t) => ({ id: t.id, icon: t.icon, name: t.name, blurb: t.blurb })) : []),
  ];
  const inFolder = (fid) => items(fid).filter((t) => chosen.has(t.id)).length;
  if (!topicFolder || !FOLDERS.some((f) => f.id === topicFolder)) topicFolder = (FOLDERS.find((f) => inFolder(f.id)) || FOLDERS[0]).id;
  const tabs = FOLDERS.map((f) => { const n = inFolder(f.id);
    return `<button class="topic-folder ${f.id === topicFolder ? "on" : ""}" data-folder="${f.id}" role="tab" aria-selected="${f.id === topicFolder}">
      <span class="tf-name">${esc(f.name)}</span>${n ? `<span class="tf-n">${n} ticked</span>` : ""}</button>`; }).join("");
  const list = items(topicFolder);
  const chips = list.map((t) => `
    <button class="topic-chip-btn ${t.id.startsWith("set:") ? "hubset" : ""} ${chosen.has(t.id) ? "active" : ""}" data-topic="${esc(t.id)}" ${isHost ? "" : "disabled"} aria-pressed="${chosen.has(t.id)}">
      <span class="tc-icon">${t.icon}</span>
      <span class="tc-name">${esc(t.name)}</span>
      <span class="tc-blurb">${esc(t.blurb)}</span>
    </button>`).join("") || `<p class="topic-empty">${isHost ? "Nothing in this folder yet." : "The host has not chosen anything from this folder."}</p>`;
  wrap.innerHTML =
    `<p class="pick-sub">${isHost ? "Open a folder and tap one or more. The battle mixes questions from everything you choose, across folders." : "The host chooses the topics for this room."}</p>
     <div class="topic-folders" role="tablist">${tabs}</div>
     <div class="topic-chips">${chips}</div>
     <p class="topic-bloom-note">Each topic mixes Bloom's levels — 📗 Remember · 📘 Understand · 📙 Apply · 📕 Analyse · 📓 Evaluate</p>`;
  wrap.querySelectorAll("[data-folder]").forEach((b) => b.addEventListener("click", () => { topicFolder = b.dataset.folder; SFX.play("select"); renderTopicSelect(isHost); }));
  if (isHost) wrap.querySelectorAll("[data-topic]").forEach((b) => b.addEventListener("click", () => {
    const v = b.dataset.topic;
    let next = new Set(chosen);
    if (next.has(v)) next.delete(v);
    else {
      next.add(v);
      // "Mixed" already holds every built-in topic, so it and single built-in topics replace each other
      if (v === "mixed") next = new Set([...next].filter((x) => x === "mixed" || x.startsWith("set:")));
      else if (!v.startsWith("set:")) next.delete("mixed");
      else if (chosen.size === 1 && chosen.has("mixed")) next.delete("mixed");   // the first set picked over the starting "Mixed" replaces it
    }
    if (!next.size) { toast("Choose at least one topic or question set."); return; }
    SFX.play("select");
    socket.emit("setTopic", { topicId: [...next].join(",") });
  }));
}

// ---- in-battle Bloom's level badge ----
// ---- picture for a question from the question hub ----
function setMcqPic(src) {
  const box = $("mcqPic"), img = $("mcqPicImg"); if (!box) return;
  if (!src) { box.classList.add("hidden"); img.removeAttribute("src"); return; }
  if (img.getAttribute("src") !== src) img.src = src;
  box.classList.remove("hidden");
}

function setBloomChip(bloom) {
  const el = $("mcqBloom"); if (!el) return;
  const m = BLOOM_META[bloom];
  if (!m) { el.classList.add("hidden"); return; }
  el.textContent = `${m.icon} ${bloom}`;
  el.style.color = m.color; el.style.borderColor = m.color;
  el.title = m.tip;
  el.classList.remove("hidden");
}

// ---- character detail overlay: big card art + skills/stats info sheet ----
function openCharDetail(charId, onPick) {
  const c = CHAR_BY_ID[charId]; if (!c) return;
  SFX.play("select");
  const ov = $("charDetail");
  $("cdArt").src   = encodeURI(ASSETS.bigcard(charId));
  $("cdSheet").innerHTML = skillSheetHTML(c);
  $("cdSheet").style.setProperty("--ecol", ELEMENT_COLORS[c.element]);
  $("cdName").textContent = c.name;
  $("cdMeta").innerHTML = `<span style="color:${ELEMENT_COLORS[c.element]}">${c.element}</span> · ${c.role}`;
  $("cdPick").onclick = () => { if (onPick) onPick(charId); else socket.emit("pickCharacter", { charId }); closeCharDetail(); };
  ov.classList.add("show");
}
function closeCharDetail() { $("charDetail").classList.remove("show"); }

// The skills sheet beside the card art, written from the game data so it always matches what the moves do.
// Skill icons come from assets/Skill Icons/<id>.webp (five icons in a row) when that file exists; until then each icon is an element gem.
const KIND_TXT = { atk: "Attack", heavy: "Heavy attack", heal: "Heal", buff: "Buff", guard: "Guard", debuff: "Debuff", cleanse: "Cleanse" };
const ULT_TXT = { damage: "Heavy damage to the enemy team", stun: "Damage, and the target misses their next turn", heal: "Heals the whole team", shield: "Shields the whole team" };
function skillSheetHTML(c) {
  const icons = `--sk-img:url('${encodeURI(`assets/Skill Icons/${c.id}.webp`)}')`;
  const tags = (sk) => [KIND_TXT[sk.kind] || sk.kind, sk.power ? `Power ${sk.power}` : "", `${sk.sp} SP`, sk.cd ? `Cooldown ${sk.cd}` : ""].filter(Boolean)
    .map((t) => `<span class="cs-tag">${t}</span>`).join("");
  const skill = (sk, i) => `<li class="cs-sk"><i class="sk-ico" style="${icons};--i:${i}"></i><div class="cs-body">
      <div class="cs-name"><b>${esc(sk.name)}</b>${tags(sk)}</div><p class="cs-desc">${esc(sk.desc)}</p></div></li>`;
  const u = c.ultimate;
  return `<div class="cs-scroll">
    <div class="cs-crest"><span class="cs-el">${esc(c.element)}</span><i></i><span>${esc(c.role)}</span></div>
    <div class="cs-stats">
      <div class="cs-stat"><b>${c.hp}</b><span>HP</span></div><div class="cs-stat"><b>${c.sp}</b><span>SP</span></div><div class="cs-stat"><b>${c.atk}</b><span>ATK</span></div><div class="cs-stat"><b>${c.def || 0}%</b><span>DEF</span></div>
      <div class="cs-match">Weak to <b>${esc(c.weakTo)}</b> · Resists <b>${esc((c.resists || []).join(", "))}</b></div>
    </div>
    <h4 class="cs-h">Skills</h4>
    <ul class="cs-list">${c.skills.map(skill).join("")}</ul>
    <h4 class="cs-h">Ultimate</h4>
    <ul class="cs-list"><li class="cs-sk ult"><i class="sk-ico" style="${icons};--i:4"></i><div class="cs-body">
      <div class="cs-name"><b>${esc(u.name)}</b><span class="cs-tag">Power ${u.power}</span><span class="cs-tag">Team Sync 100</span></div>
      <p class="cs-desc">${ULT_TXT[u.archetype] || ""}.</p></div></li></ul>
  </div>`;
}

// ============================================================
//  BATTLE RENDER  — strict stage: corner cards + chibi lanes
// ============================================================
const tokenEl = (uid) => document.querySelector(`.tok[data-uid="${uid}"]`);
const cardEl  = (uid) => document.querySelector(`.pcard[data-uid="${uid}"]`);
const fighterEl = tokenEl;   // FX/targeting anchor on the chibi
const rnd = (n) => Math.max(0, Math.round(n));
const pct = (a, b) => Math.max(0, Math.min(100, (a / b) * 100));

// element → rgba (for auras / effect tints)
function hexRGBA(hex, a) {
  const h = (hex || "#D4143A").replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}
const elemColor = (el) => ELEMENT_COLORS[el] || "#D4143A";

// ---- slim HUD along the top: one row per fighter ----
function hudRowHTML(c, side, acting) {
  const hp = pct(c.hp, c.maxHp), sp = pct(c.sp, c.maxSp);
  const me = c.uid === myId;
  return `<div class="hud-row ${c.alive ? "" : "dead"} ${acting ? "acting" : ""}" data-uid="${c.uid}">
    <div class="hud-face">${thumb(c.charId)}</div>
    <div class="hud-info">
      <div class="hud-line">
        <span class="hud-char">${esc(c.charName.split(" ")[0])}</span>
        <span class="hud-player ${me ? "me" : ""}">${esc(c.name)}${me ? " · you" : ""}</span>
        <span class="hud-hp">${rnd(c.hp)}</span>
      </div>
      <div class="hud-bar hp"><i class="${hp <= 30 ? "low" : ""}" style="width:${hp}%"></i></div>
      <div class="hud-bar sp"><i style="width:${sp}%"></i></div>
    </div>
  </div>`;
}

// ambient elemental particles rising around a fighter

// Fighter on the stage — large ready-stance art with element aura + particles,
// and a flag above the head (YOU, NAME IS ANSWERING, TAP TO HIT…).
function tokenHTML(c, facing, acting, side) {
  const col = fxColor(c.element);
  const posed = attackPosed.has(c.uid) ? " posed" : "";
  return `<div class="tok ${c.alive?"":"down"} ${acting?"acting":""}${posed}" data-uid="${c.uid}" data-facing="${facing}" data-side="${side}" data-el="${c.element}"
       style="--glow:${hexRGBA(col,0.8)};--pc:${col};--ef:${col}">
    <div class="tok-spot"></div>
    <div class="tok-aura"></div>
    ${chibiImg(c.charId, c.uid)}
    <div class="tok-tag">${esc(c.charName.split(" ")[0])}</div>
    <div class="tok-flag"></div>
  </div>`;
}

// ---- flags above the fighters ----
let baseFlags = new Map();     // uid → { html, cls } from the turn state
let targetFlags = new Map();   // uid → { html, cls } while you pick a target
function applyFlags() {
  document.querySelectorAll("#arena .tok").forEach((t) => {
    const f = targetFlags.get(t.dataset.uid) || baseFlags.get(t.dataset.uid);
    const el = t.querySelector(".tok-flag"); if (!el) return;
    el.className = "tok-flag" + (f ? " on " + f.cls : "");
    el.innerHTML = f ? f.html : "";
  });
}
const upper = (s) => String(s || "").toUpperCase();

function renderBattle() {
  const b = room.battle; if (!b) return;
  const myTeam  = room.players.find((p) => p.id === myId)?.team ?? 0;
  const enmTeam = myTeam === 0 ? 1 : 0;
  const allies  = b.combatants.filter((c) => c.team === myTeam);
  const foes    = b.combatants.filter((c) => c.team === enmTeam);
  // on a stolen turn the stealer is the one acting
  const actor = b.phase === "steal-action" && b.stealActor ? b.stealActor : b.current;
  const act = (c) => c && actor === c.uid;

  const lanes = [["laneAllyFront", allies[0], "right", "ally"], ["laneAllyBack", allies[1], "right", "ally"],
                 ["laneEnemyFront", foes[0], "left", "foe"], ["laneEnemyBack", foes[1], "left", "foe"]];
  // Each room update used to rebuild all four fighters and the HUD, restarting every sprite and costing a frame or two.
  // Now a fighter is rebuilt only when something it shows has changed.
  for (const [id, c, facing, side] of lanes) {
    const el = $(id);
    const key = c ? [c.uid, c.charId, spriteId(c.charId, c.uid), c.alive, act(c), attackPosed.has(c.uid), focusPose.uid === c.uid ? focusPose.start : 0, facing, side, c.element].join("|") : "";
    if (el.dataset.k === key) continue;
    el.dataset.k = key; el.innerHTML = c ? tokenHTML(c, facing, act(c), side) : "";
  }
  putHTML($("hudMineRows"), allies.map((c) => hudRowHTML(c, "mine", act(c))).join(""));
  putHTML($("hudFoeRows"), foes.map((c) => hudRowHTML(c, "foe", act(c))).join(""));
  $("arena").classList.toggle("spectating", !!spectating);
  $("arena").classList.toggle("practice", !!room.practice);

  setSyncMine(b.sync[myTeam]); setSyncFoe(b.sync[enmTeam]);
  setMatchClock(b.msLeft);
  const rounds = tView?.settings?.rounds, round = tView?.round;
  $("hudRound").textContent = room.tournament && !spectating && round && rounds ? `ROUND ${round} OF ${rounds}` : "";

  const cur    = b.combatants.find((c) => c.uid === b.current);
  const myTurn = b.current === myId;
  const stealActorC = b.stealActor ? b.combatants.find((c) => c.uid === b.stealActor) : null;
  renderDock(b, cur, myTurn, stealActorC);
}

// countdowns tick several times a second; the page is only touched when the shown text actually changes
function setText(el, t) { if (el.textContent !== t) el.textContent = t; }
// set innerHTML only when it differs from what this element was last given
function putHTML(el, html) { if (el._html !== html) { el._html = html; el.innerHTML = html; } }
function setSyncMine(val) {
  $("syncMine").style.width = Math.min(100, val) + "%";
  $("hudMine").classList.toggle("ready", val >= 100);
}
function setSyncFoe(val) {
  $("syncFoe").style.width = Math.min(100, val) + "%";
  $("hudFoe").classList.toggle("ready", val >= 100);
}

// Live-update the HUD and sync after combat without rebuilding the stage
function updateBars() {
  const b = room?.battle; if (!b) return;
  const myTeam = room.players.find((p) => p.id === myId)?.team ?? 0;
  b.combatants.forEach((c) => {
    const row = document.querySelector(`.hud-row[data-uid="${c.uid}"]`);
    if (row) {
      const hp = pct(c.hp, c.maxHp), sp = pct(c.sp, c.maxSp);
      const hpi = row.querySelector(".hud-bar.hp i"), spi = row.querySelector(".hud-bar.sp i");
      if (hpi) { hpi.style.width = hp + "%"; hpi.classList.toggle("low", hp <= 30); }
      if (spi) spi.style.width = sp + "%";
      const n = row.querySelector(".hud-hp"); if (n) n.textContent = rnd(c.hp);
      row.classList.toggle("dead", !c.alive);
    }
    const tok = tokenEl(c.uid); if (tok) tok.classList.toggle("down", !c.alive);
  });
  setSyncMine(b.sync[myTeam]); setSyncFoe(b.sync[myTeam === 0 ? 1 : 0]);
}

// ---- what each screen shows, turn by turn ----
//   someone else answers → small question strip at the top, the stage stays big
//   you answer           → big question card in the middle, stage dimmed behind it
//   you got it right     → the card closes and a move strip runs along the bottom
//   steal chance         → a shorter answer panel rises for a few seconds
let lastReveal = null;          // { key, right, explain } once the right answer may be shown
const qKey = (q) => q ? `${q.startedAt}|${q.q}` : "";
function localDeadline(startedAt, seconds) { return Date.now() + (startedAt + seconds * 1000 - srvNow()); }

function setStage(mode) {
  const a = $("arena");
  for (const m of ["asking", "stealing", "moving"]) a.classList.toggle(m, mode === m);
}
function showWait(text) {
  const w = $("waitBox");
  if (!text) { w.classList.add("hidden"); return; }
  $("waitText").textContent = text; w.classList.remove("hidden");
}
// ---- answering along with someone else's question ----
// Everyone in the battle answers every question: on another player's turn the strip at the top carries the answers
// too. You find out if you were right when the question is over, and a right answer adds a little to your team's Sync.
let along = { key: "", choice: null, told: "" };
function alongState(q, meC, open) {
  if (!q || !meC || spectating || room?.practice) return null;
  const key = qKey(q);
  if (along.key !== key) along = { key, choice: null, told: "" };
  const right = lastReveal && lastReveal.key === key ? lastReveal.right : null;
  if (open) {
    const wait = q.recall ? Math.max(0, q.startedAt + q.recall * 1000 - srvNow()) : 0;
    if (wait > 0) setTimeout(() => { if (room?.battle?.phase === "question") renderBattle(); }, wait + 60);
    return { mode: wait > 0 ? "recall" : along.choice == null ? "ask" : "locked", choice: along.choice, n: q.choices.length, recall: Math.ceil(wait / 1000) };
  }
  if (along.choice == null || !right) return null;
  const ok = right.includes(along.choice);
  if (along.told !== key) { along.told = key; if (ok) toast("✓ You answered along correctly: +2 Sync for your team."); }
  return { mode: "result", ok, picked: q.choices[along.choice] };
}
function alongHTML(a, q) {
  if (!a) return "";
  if (a.mode === "result") return `<div class="qs-along ${a.ok ? "ok" : "bad"}"><span class="qa-tag">${a.ok ? "✓ You were right" : `✗ You picked ${esc(a.picked)}`}</span></div>`;
  if (a.mode === "recall") return `<div class="qs-along"><span class="qa-tag">ANSWER ALONG</span><span class="qa-think">Read the question and think of the answer. The choices appear in a moment.</span></div>`;
  return `<div class="qs-along"><span class="qa-tag">${a.mode === "locked" ? "LOCKED IN" : "ANSWER ALONG"}</span>${q.choices.map((c, i) =>
    `<button type="button" class="qa-btn ${a.choice === i ? "picked" : ""}" data-along="${i}" ${a.mode === "locked" ? "disabled" : ""}><b>${"ABCD"[i]}</b>${esc(c)}</button>`).join("")}</div>`;
}
$("qStrip").addEventListener("click", (e) => {
  const b = e.target.closest("[data-along]"); if (!b || b.disabled || along.choice != null) return;
  along.choice = +b.dataset.along; SFX.play("select");
  socket.emit("shadowAnswer", { choiceIndex: along.choice });
  renderBattle();
});

function renderStrip(s) {
  const el = $("qStrip");
  if (!s) { el.classList.add("hidden"); return; }
  const key = JSON.stringify(s);
  if (el.dataset.key === key && !el.classList.contains("hidden")) return;     // unchanged: keep the countdown smooth
  el.dataset.key = key;
  const q = s.q;
  el.innerHTML = `${q.image ? `<div class="qs-pic"><img src="${esc(q.image)}" alt="Picture for this question" /></div>` : ""}
    <div class="qs-body">
      <span class="qs-label ${s.cls || ""}">${esc(s.label)}${q.topic ? ` · ${esc(q.topic)}` : ""}</span>
      <span class="qs-q">${esc(q.q)}</span>
      ${s.answer ? `<span class="qs-ans">✓ ${esc(s.answer)}</span>` : ""}
    </div>
    ${s.deadline ? `<span class="qs-timer" data-deadline="${s.deadline}"></span>` : ""}
    ${alongHTML(s.along, q)}`;
  el.classList.remove("hidden");
  tickDeadlines();
}
// every countdown on the stage reads its own deadline
function tickDeadlines() {
  document.querySelectorAll("#arena [data-deadline]").forEach((el) => {
    const left = Math.max(0, Math.ceil((Number(el.dataset.deadline) - Date.now()) / 1000));
    setText(el, `0:${String(left).padStart(2, "0")}`);
  });
}
setInterval(tickDeadlines, 250);

function revealText(q) {
  if (!lastReveal || lastReveal.key !== qKey(q)) return "";
  return lastReveal.right.map((i) => q.choices[i]).filter(Boolean).join("  /  ");
}

// The question card (your turn) or the steal panel, built once per question.
function fillQuestionCard(mode, q, cur, onPick) {
  const mcq = $("mcq");
  const key = `${mode}|${q.whyKey || qKey(q)}`;
  mcq.classList.remove("hidden");
  mcq.classList.toggle("ask", mode === "ask");
  mcq.classList.toggle("steal", mode === "steal");
  if (mcq.dataset.key === key) return;
  mcq.dataset.key = key;
  $("mcqPlayerThumb").innerHTML = cur?.charId ? thumb(cur.charId) : "";
  $("mcqPlayerName").textContent = mode === "steal" ? "⚡ STEAL CHANCE" : mode === "why" ? "⚡ ULTIMATE: WHY?" : "YOUR TURN";
  const stealName = room?.practice && cur ? NAME[cur.charId] : stealMeta?.originalName;
  $("mcqSub").textContent = mode === "steal"
    ? `Answer right to steal ${stealName || "their"}'s turn. Your attacks do half damage.`
    : mode === "why" ? "Pick the reason your answer is right. The right reason unleashes your Ultimate."
    : q.retry ? "Back again: you got this one wrong earlier. Get it right this time." : "";
  mcq.classList.toggle("why", mode === "why");
  applyRetryNote(mode === "ask" ? q : null);
  $("mcqTopic").textContent = q.topic || "";
  setBloomChip(mode === "steal" ? null : q.bloom);
  $("mcqQ").textContent = q.q;
  setMcqPic(q.image);
  $("mcqFeedback").className = "mcq-feedback hidden"; $("mcqFeedback").textContent = "";
  const wrap = $("mcqChoices"); wrap.innerHTML = ""; mySelected = -1;
  wrap.classList.toggle("long", q.choices.some((ch) => String(ch).length > 24));
  q.choices.forEach((ch, i) => {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.innerHTML = `<span class="choice-key">${"ABCD"[i]}</span><span class="choice-txt">${esc(ch)}</span>`;
    btn.addEventListener("click", () => { if (inputLocked || btn.disabled) return; mySelected = i; lockBriefly(); onPick(i); });
    wrap.appendChild(btn);
  });
  // Reading time: the choices stay covered for a few seconds so the question is read and the answer remembered before it is recognised
  clearInterval(fillQuestionCard._recall);
  const recallLeft = mode === "ask" && q.recall ? Math.max(0, q.startedAt + q.recall * 1000 - srvNow()) : 0;
  wrap.classList.toggle("recalling", recallLeft > 0);
  wrap.querySelector(".mcq-recall")?.remove();
  if (recallLeft > 0) {
    const cover = document.createElement("div"); cover.className = "mcq-recall";
    const end = Date.now() + recallLeft;
    const tick = () => { const n = Math.ceil((end - Date.now()) / 1000);
      if (n <= 0) { clearInterval(fillQuestionCard._recall); wrap.classList.remove("recalling"); cover.remove(); return; }
      cover.innerHTML = `<b>Read the question</b><span>Think of the answer. The choices appear in ${n}</span>`; };
    tick(); wrap.appendChild(cover); fillQuestionCard._recall = setInterval(tick, 200);
  }
  stopTimer();
  const untimed = mode === "steal" ? !!stealMeta?.untimed : !!q.untimed;   // practice: no clock
  mcq.classList.toggle("untimed", untimed);
  if (untimed) $("mcqTimer").textContent = "";
  else if (mode === "steal" && stealMeta) startTimerFrom(stealMeta.seconds, stealMeta.startedAt);
  else startTimerFrom(q.seconds, q.startedAt);
  hintArmed = false;
  if (mode === "ask") applyHint(); else { $("mcqHintBox").classList.add("hidden"); }
}
// The Ultimate's "why" check: the reasons arrive only to the player who picked the Ultimate
let whyCard = null, whyHoldUntil = 0;
socket.on("whyOpen", ({ q, answer, reasons, seconds, startedAt }) => {
  SFX.play("sync");
  whyCard = { q: `Your answer “${answer}” was right. WHY is it right?\n${q}`, choices: reasons, topic: "ULTIMATE", seconds, startedAt, whyKey: startedAt };
  if (room?.battle) renderBattle();
});
function lockWhy(i) {
  $("mcqChoices").querySelectorAll(".choice").forEach((b, k) => { b.disabled = true; b.classList.toggle("picked", k === i); });
}
socket.on("whyResult", ({ ok, chosen, right }) => {
  const fb = $("mcqFeedback");
  const btns = $("mcqChoices").querySelectorAll(".choice");
  btns.forEach((b, k) => { b.disabled = true; if (k === chosen) b.classList.add(ok ? "correct" : "wrong"); if (!ok && b.querySelector(".choice-txt")?.textContent === right) b.classList.add("correct"); });
  fb.className = "mcq-feedback " + (ok ? "good" : "bad");
  fb.textContent = ok ? "Right reason! Your Ultimate is unleashed." : chosen < 0 ? `Time's up. The reason: ${right} Your gauge stays full for next time.` : `Not quite. The reason: ${right} Your gauge stays full, so it is a Strike this time.`;
  SFX.play(ok ? "correct" : "wrong");
  whyCard = null;
  whyHoldUntil = Date.now() + (ok ? 900 : 2800);       // keep the reason on screen for a moment
  setTimeout(() => { if (room?.battle?.phase !== "why") hideQuestionCard(); }, ok ? 950 : 2850);
});

// A question coming back: what the player picked last time, and what was wrong with that answer
let lastPick = null;
socket.on("yourQuestion", ({ question, lastPick: lp }) => {
  lastPick = lp ? { ...lp, startedAt: question?.startedAt } : null;
  const mcq = $("mcq");
  if (!mcq.classList.contains("hidden") && mcq.classList.contains("ask")) applyRetryNote(room?.battle?.question);
});
function applyRetryNote(q) {
  const box = $("mcqNote");
  const lp = q && q.retry && lastPick && lastPick.startedAt === q.startedAt ? lastPick : null;
  if (!lp) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  box.innerHTML = lp.chosen < 0
    ? `<b>↺ BACK AGAIN</b> Last time the time ran out on this one. Read it carefully.`
    : `<b>↺ BACK AGAIN</b> Last time you picked <em>${"ABCD"[lp.chosen]}. ${esc(lp.text)}</em>${lp.note ? `<span>${esc(lp.note)}</span>` : `<span>That was not right. Think again before you answer.</span>`}`;
  box.classList.remove("hidden");
}

function hideQuestionCard() {
  const mcq = $("mcq");
  if (mcq.classList.contains("why") && Date.now() < whyHoldUntil) return;   // the reason is still being shown
  if (!mcq.classList.contains("hidden")) stopTimer();
  mcq.classList.add("hidden"); mcq.classList.remove("ask", "steal", "why"); mcq.dataset.key = "";
}

function renderDock(b, cur, myTurn, stealActorC) {
  if (b.phase !== "steal") stealMeta = null;
  const myTeam = room.players.find((p) => p.id === myId)?.team ?? 0;
  const meC = b.combatants.find((c) => c.uid === myId);
  const q = b.question;
  const side = (c) => (c && c.team === myTeam ? "ally" : "foe");
  const who = (c) => upper((room.practice && c && c.uid !== myId ? NAME[c.charId] : c?.name) || "Player");
  baseFlags = new Map();
  const actor = b.phase === "steal-action" && b.stealActor ? b.stealActor : b.current;
  if (meC && !spectating && actor !== myId) baseFlags.set(myId, { html: "YOU", cls: "you" });
  const flag = (c, text, cls) => { if (c) baseFlags.set(c.uid, { html: esc(text), cls: cls || side(c) }); };
  let mode = "", strip = null, wait = "";
  let keepMoves = false;

  if (b.phase === "question") {
    if (myTurn && !spectating) {
      mode = "asking";
      fillQuestionCard("ask", q, cur, (i) => socket.emit("answer", { choiceIndex: i }));
    } else {
      hideQuestionCard();
      strip = { label: `${who(cur)}'S QUESTION${q.hinted ? " · 💡 HINT USED" : ""}`, cls: side(cur), q, deadline: q.untimed ? null : localDeadline(q.startedAt, q.seconds), along: alongState(q, meC, true) };
      flag(cur, q.hinted ? `${who(cur)} IS ANSWERING · 💡 HINT` : `${who(cur)} IS ANSWERING`);
    }

  } else if (b.phase === "reveal") {
    // a right answer stays on screen for a moment
    if (myTurn && !spectating && !$("mcq").classList.contains("hidden")) { mode = "asking"; stopTimer(); }
    else { hideQuestionCard(); strip = { label: `${who(cur)} GOT IT RIGHT`, cls: "good", q, answer: revealText(q) }; }
    flag(cur, "✓ CORRECT", "good");

  } else if (b.phase === "steal") {
    const canSteal = stealMeta && !spectating && meC?.alive && b.stealOf !== myId;
    const original = b.combatants.find((c) => c.uid === b.stealOf);
    if (canSteal) {
      mode = "stealing";
      fillQuestionCard("steal", q, original, (i) => socket.emit("steal", { choiceIndex: i }));
    } else {
      hideQuestionCard();
      const deadline = stealMeta && !stealMeta.untimed ? localDeadline(stealMeta.startedAt, stealMeta.seconds) : null;
      strip = b.stealOf === myId
        ? { label: "WRONG. THE OTHERS CAN TRY TO STEAL IT", cls: "steal", q, deadline }
        : { label: `STEAL CHANCE: ${who(original)} GOT IT WRONG`, cls: "steal", q, deadline };
    }
    flag(original, "✗ WRONG", "bad");

  } else if (b.phase === "why") {
    const whyC = b.combatants.find((c) => c.uid === b.whyUid);
    if (b.whyUid === myId && whyCard && !spectating) {
      mode = "asking";
      fillQuestionCard("why", whyCard, whyC, (i) => { socket.emit("whyAnswer", { index: i }); lockWhy(i); });
    } else {
      hideQuestionCard();
      flag(whyC, `⚡ ${who(whyC)} IS EXPLAINING WHY`, "good");
      strip = { label: `ULTIMATE CHECK: ${who(whyC)} MUST GIVE THE REASON`, cls: "good", q, answer: revealText(q) };
    }

  } else if (b.phase === "steal-action") {
    hideQuestionCard();
    if (b.stealActor === myId && stealActorC && !spectating) { mode = "moving"; keepMoves = true; buildMovePanel(stealActorC, b, true); }
    else flag(stealActorC, `⚡ ${who(stealActorC)} STOLE THE TURN`, "steal");

  } else if (b.phase === "action") {
    hideQuestionCard();
    if (myTurn && !spectating) {
      if (myAnswerCorrect) { mode = "moving"; keepMoves = true; buildMovePanel(cur, b); }
      else wait = "Guarding…";
    } else flag(cur, `${who(cur)} IS CHOOSING A MOVE`);

  } else {
    hideQuestionCard();
    const ans = q && revealText(q);
    if (ans) strip = { label: "THE ANSWER", cls: "good", q, answer: ans };
  }

  if (strip && !strip.along && b.phase !== "question") strip.along = alongState(q, meC, false);   // how their answer-along went
  if (!keepMoves) hideMoves();
  updateHintButton(q, meC, mode === "asking" && b.phase === "question");
  setStage(mode); renderStrip(strip); showWait(wait);
  applyFlags();
  updateCoach();
  updateCamera();
}

// ---- the camera: when someone is choosing a move, it zooms onto them with a Dutch tilt and the rest of the stage goes dark.
// The move menu then bursts out of your own fighter. While you pick a target, it pulls back so every fighter is in view.
function updateCamera() {
  const b = room?.battle, a = $("arena"), cam = $("stagecam"); if (!cam) return;
  let actor = b && !theatreOn && (b.phase === "steal-action" ? b.stealActor : b.phase === "action" ? b.current : null);
  // While your own move menu is open the camera always stays on you, so the menu keeps bursting out of your fighter.
  // (Without this, a stray result from earlier in the turn could drop the menu back to the old strip at the bottom.)
  const myMenu = !!b && !theatreOn && !spectating && !$("commands").classList.contains("hidden")
    && ((b.phase === "action" && b.current === myId) || (b.phase === "steal-action" && b.stealActor === myId));
  if (actor && `${actor}|${b.question?.startedAt}` === actedKey && !myMenu) actor = null;
  if (myMenu) actor = myId;
  if ((actor || null) !== focusPose.uid) {            // a new fighter in the spotlight: they strike a pose
    const old = focusPose.uid; focusPose = { uid: actor || null, start: Date.now() };
    [old, actor].forEach((uid) => refreshChibi(uid));
  }
  const tok = actor ? tokenEl(actor) : null;
  document.querySelectorAll("#arena .tok.focus").forEach((t) => t !== tok && t.classList.remove("focus"));
  if (!tok && myMenu && !updateCamera._retry) {
    updateCamera._retry = true;
    for (const id of ["laneAllyFront", "laneAllyBack", "laneEnemyFront", "laneEnemyBack"]) $(id).dataset.k = "";
    renderBattle(); updateCamera._retry = false; return;
  }
  if (!tok) { a.classList.remove("focus", "p5", "aim"); cam.style.transform = ""; return; }
  const W = a.clientWidth, H = a.clientHeight, mid = (t) => [t.parentElement.offsetLeft, t.parentElement.offsetTop + t.offsetHeight * 0.52];
  const ally = tok.dataset.side === "ally";
  if (movePicking) {                                  // aiming: the camera swings over to the targets
    const ts = [...document.querySelectorAll("#arena .tok.target-pick")].map(mid);
    if (ts.length) {
      const ax = ts.reduce((n, p) => n + p[0], 0) / ts.length, ay = ts.reduce((n, p) => n + p[1], 0) / ts.length;
      const tx = W * (ax > W / 2 ? 0.6 : 0.4), ty = H * 0.6;
      cam.style.transformOrigin = `${ax}px ${ay}px`;
      cam.style.transform = `translate(${tx - ax}px, ${ty - ay}px) rotate(${ax > W / 2 ? 2.5 : -2.5}deg) scale(1.14)`;
    }
    a.classList.add("focus", "aim"); a.classList.toggle("p5", actor === myId); return;
  }
  a.classList.remove("aim");
  const [cx, cy] = mid(tok);                          // the fighter's middle, before any zoom
  const zoom = settings.camera !== false;
  const tx = zoom ? W * (ally ? 0.3 : 0.7) : cx, ty = zoom ? H * 0.56 : cy, s = zoom ? 1.38 : 1, r = zoom ? (ally ? -4 : 4) : 0;  // where the camera puts them, how close, how tilted
  const c = b.combatants.find((x) => x.uid === actor);
  a.style.setProperty("--fcol", fxColor(c?.element)); $("focusName").textContent = upper(c?.charName.split(" ")[0] || "");
  cam.style.transformOrigin = `${cx}px ${cy}px`;
  cam.style.transform = `translate(${tx - cx}px, ${ty - cy}px) rotate(${r}deg) scale(${s})`;
  a.style.setProperty("--fx", tx + "px"); a.style.setProperty("--fy", ty + "px");
  a.style.setProperty("--cx", cx + "px"); a.style.setProperty("--cy", cy + "px");
  a.style.setProperty("--sx", cx + W * 0.3 + "px"); a.style.setProperty("--sy", cy + H * 0.3 + "px");   // the same point inside the shade, which starts 30% out
  tok.classList.add("focus");
  a.classList.add("focus"); a.classList.toggle("focus-foe", !ally);
  a.classList.toggle("p5", actor === myId && !$("commands").classList.contains("hidden"));
}
window.addEventListener("resize", () => updateCamera());
function refreshChibi(uid) {
  const tok = uid && tokenEl(uid), c = uid && room?.battle?.combatants.find((x) => x.uid === uid);
  const old = tok && tok.querySelector(".chibi"); if (!old || !c) return;
  old.outerHTML = chibiImg(c.charId, uid);
}

// ---- your move: one strip along the bottom ----
// After a right answer: Strike, the four skills, the Ultimate and items in one
// row. A move with one possible target goes straight away; otherwise the
// targets light up on the stage and you tap one. A wrong answer guards
// automatically on the server, so there is no menu for it.
const isOffSkill = (sk) => sk.kind === "atk" || sk.kind === "heavy" || sk.kind === "debuff";
const MOVE_SECONDS = 12;                 // matches ACTION_SECONDS on the server
let moveSel = null;                      // { kind: "strike"|"skill"|"item", index|itemId }
let movePicking = false;                 // a move is chosen and its targets are lit up
let moveKey = "";                        // which turn the strip belongs to
let moveDeadline = 0, moveTimerInt = null, itemsOpen = false;

function skillEffect(sk) {
  if (sk.kind === "atk") return `${sk.element} hit`;
  if (sk.kind === "heavy") return `Heavy ${sk.element.toLowerCase()} hit`;
  if (sk.kind === "heal") return "Heal a teammate";
  if (sk.kind === "cleanse") return "Clear debuffs";
  if (sk.kind === "debuff") return "Weaken an enemy";
  if (sk.kind === "buff") return "Power up your team";
  if (sk.kind === "guard") return sk.target === "party" ? "Shield both of you" : sk.target === "self" ? "Shield yourself" : "Shield a teammate";
  return "Skill";
}

// Who a move can be aimed at. [] means it needs no target.
function moveTargets(sel, me, b) {
  const enemies = b.combatants.filter((c) => c.team !== me.team && c.alive);
  const alliesAlive = b.combatants.filter((c) => c.team === me.team && c.alive);
  if (!sel) return [];
  if (sel.kind === "strike") return enemies;
  if (sel.kind === "skill") {
    const sk = me.skills[sel.index];
    if (isOffSkill(sk)) return enemies;
    if (sk.kind === "heal" || sk.kind === "cleanse" || (sk.kind === "guard" && sk.target !== "party" && sk.target !== "self")) return alliesAlive;
    return [];
  }
  if (sel.kind === "item") {
    if (sel.itemId === "crystal" || sel.itemId === "chilli") return [];      // the whole team / yourself
    if (sel.itemId === "revive") return b.combatants.filter((c) => c.team === me.team && !c.alive);
    if (sel.itemId === "durian") return enemies;
    return alliesAlive;
  }
  return [];
}
function targetVerb(sel, me) {
  if (sel.kind === "strike" || (sel.kind === "skill" && isOffSkill(me.skills[sel.index])) || sel.itemId === "durian") return "TAP TO HIT";
  if (sel.kind === "skill") { const k = me.skills[sel.index].kind; return k === "heal" ? "TAP TO HEAL" : k === "cleanse" ? "TAP TO CLEANSE" : "TAP TO SHIELD"; }
  if (sel.itemId === "revive") return "TAP TO REVIVE";
  return "TAP TO GIVE TO";
}

function moveAction(sel, targetId) {
  if (sel.kind === "strike") return { type: "strike", targetId };
  if (sel.kind === "skill") return { type: "spell", skillIndex: sel.index, targetId };
  if (sel.kind === "item") return { type: "item", itemId: sel.itemId, targetId };
  if (sel.kind === "ult") return { type: "ultimate" };
}

function chooseMove(sel, me, b) {
  SFX.play("select");
  moveSel = sel; itemsOpen = false;
  const targets = moveTargets(sel, me, b);
  if (targets.length <= 1) return send(moveAction(sel, targets[0]?.uid));   // nothing to choose
  buildMovePanel(me, b, buildMovePanel._half);
}

function hideMoves() {
  closeSkillSheet();
  movePicking = false;
  const cmds = $("commands");
  if (!cmds.classList.contains("hidden")) cmds.classList.add("hidden");
  clearInterval(moveTimerInt); moveTimerInt = null;
  if (targetFlags.size) { targetFlags = new Map(); clearTargets(); }
}

function buildMovePanel(me, b, halfPower = false) {
  const key = `${me.uid}:${b.question?.startedAt}:${b.phase}`;
  const fresh = key !== moveKey;                 // slide the strip in only when it first appears
  if (key !== moveKey) {                         // a new turn: fresh strip and timer
    moveKey = key; moveSel = null; itemsOpen = false;
    moveDeadline = Date.now() + MOVE_SECONDS * 1000;
  }
  if (!moveTimerInt) moveTimerInt = setInterval(tickMoveTimer, 250);
  buildMovePanel._half = halfPower;
  const cmds = $("commands");
  cmds.classList.remove("hidden");
  const cds = me.cooldowns || {};
  const syncPct = Math.min(100, Math.round(b.sync[me.team] || 0));
  const ultReady = syncPct >= 100;
  const selIs = (k, i) => moveSel && moveSel.kind === k && (i === undefined || moveSel.index === i || moveSel.itemId === i);
  const enemiesLeft = b.combatants.filter((c) => c.team !== me.team && c.alive).length;

  // practice: each turn teaches one move; the others wait for a later lesson
  const lesson = room?.practice?.lesson;
  const only = !lesson || lesson === "free" ? null : halfPower ? "strike" : ({ strike: "strike", skills: "skills", ult: "ult" })[lesson] || null;
  const later = (k) => (only && only !== k ? "later" : "");
  const usable = me.skills.filter((sk, i) => !(cds[i] > 0) && me.sp >= sk.sp).length;
  const chosenSkill = moveSel?.kind === "skill" ? me.skills[moveSel.index] : null;
  const skills = `<button class="ms-move skills ${chosenSkill ? "sel" : ""} ${later("skills")}" data-move="skills" ${later("skills") ? "disabled" : ""}><i class="ms-sk" aria-hidden="true"></i>
      <span class="ms-name big">SKILLS</span>
      <span class="ms-eff">${chosenSkill ? `${esc(chosenSkill.name)} chosen` : `${usable} of ${me.skills.length} ready · tap to see them`}</span>
    </button>`;

  const itemList = Object.entries(me.items || {}).filter(([, n]) => n > 0);
  const itemsLeft = itemList.reduce((a, [, n]) => a + n, 0);
  const itemsPop = itemsOpen && itemList.length ? `<div class="ms-items ${itemList.length > 4 ? "many" : ""}">${itemList.map(([id, n]) => {
    const it = ITEM_BY_ID[id] || { name: id };
    const needsDead = id === "revive" && !b.combatants.some((c) => c.team === me.team && !c.alive);
    return `<button class="ms-item ${selIs("item", id) ? "sel" : ""}" data-move="item" data-item="${id}" ${needsDead ? "disabled" : ""}>
      <span class="ms-item-top"><span class="ms-item-row"><img class="ms-item-ico" src="${itemIcon(id)}" alt="">${esc(it.name)}</span><small>×${n}</small></span>
      <span class="ms-item-desc">${needsDead ? "Nobody on your team is knocked out" : esc(it.desc || "")}</span></button>`;
  }).join("")}</div>` : "";

  const targets = moveTargets(moveSel, me, b);
  const picking = moveSel && targets.length > 1;
  movePicking = !!picking;
  const hintedMove = !halfPower && !!hintFor(b.question);
  const hint = picking ? (targetVerb(moveSel, me) === "TAP TO HIT" ? "Tap an enemy" : "Tap a teammate")
    : halfPower ? "Half damage" : hintedMove ? "Hint used: not powered up" : "Powered up";

  const html = `<div class="ms ${fresh ? "enter" : ""}">
    <div class="ms-state"><i class="ms-sk" aria-hidden="true"></i>
      <span class="ms-ok ${halfPower ? "steal" : ""}">${halfPower ? "⚡ STOLEN" : hintedMove ? "✓ CORRECT · 💡" : "✓ CORRECT"}</span>
      <span class="ms-timer" id="mpTimer"></span>
      <span class="ms-hint ${picking ? "go" : ""}">${hint}</span>
    </div>
    <button class="ms-move strike ${selIs("strike") ? "sel" : ""} ${later("strike")}" data-move="strike" ${later("strike") ? "disabled" : ""}><i class="ms-sk" aria-hidden="true"></i>
      <span class="ms-name big">STRIKE</span>
      <span class="ms-eff">${esc(me.element)} hit on one enemy</span>
    </button>
    ${skills}
    <button class="ms-move ult ${ultReady && !later("ult") ? "ready" : ""} ${later("ult")}" data-move="ult" ${ultReady && !later("ult") ? "" : "disabled"}><i class="ms-sk" aria-hidden="true"></i>
      <span class="ms-k">ULTIMATE</span>
      <span class="ms-name">${esc(me.ultimate?.name || "Ultimate")}</span>
      <span class="ms-eff">${ultEffect(me.ultimate)}${ultReady ? "" : ` · Sync ${syncPct}%`}</span>
    </button>
    <button class="ms-move items ${itemsOpen || moveSel?.kind === "item" ? "sel" : ""} ${later("items")}" data-move="items" ${itemsLeft && !later("items") ? "" : "disabled"}><i class="ms-sk" aria-hidden="true"></i>
      <span class="ms-name">ITEMS</span><span class="ms-eff">${itemsLeft} left</span>
    </button>
    ${itemsPop}
    ${picking ? `<button class="ms-back" data-move="back"><i class="ms-sk" aria-hidden="true"></i>BACK</button>` : ""}
  </div>`;
  // Room updates arrive every few seconds while the menu is up; an unchanged menu is left alone (rebuilding it
  // repainted every shard). The buttons read the latest fighter and battle from M, not from the render they were made in.
  const M = buildMovePanel._m = { me, b, halfPower };
  const hkey = html.replace(/class="ms[^"]*"/, 'class="ms"');
  const same = !fresh && cmds._html === hkey && cmds.querySelector(".ms");
  if (!same) { cmds._html = hkey; cmds.innerHTML = html; }
  tickMoveTimer();
  if (fresh) setTimeout(() => cmds.querySelector(".ms.enter")?.classList.remove("enter"), 1150);   // shards landed

  if (!same) cmds.querySelectorAll("[data-move]").forEach((el) => el.addEventListener("click", () => {
    if (inputLocked) return;
    const { me, b, halfPower } = buildMovePanel._m;
    const m = el.dataset.move;
    if (m === "strike") chooseMove({ kind: "strike" }, me, b);
    else if (m === "skill") chooseMove({ kind: "skill", index: +el.dataset.i }, me, b);
    else if (m === "item") chooseMove({ kind: "item", itemId: el.dataset.item }, me, b);
    else if (m === "items") { SFX.play("select"); itemsOpen = !itemsOpen; buildMovePanel(me, b, halfPower); }
    else if (m === "skills") { SFX.play("select"); itemsOpen = false; openSkillSheet(me, b, halfPower); }
    else if (m === "ult") { SFX.play("select"); send({ type: "ultimate" }); }
    else if (m === "back") { SFX.play("select"); moveSel = null; buildMovePanel(me, b, halfPower); }
  }));

  // targets light up on the stage: tap the fighter or the flag above them
  clearTargets();
  targetFlags = new Map();
  if (picking) {
    const verb = targetVerb(moveSel, me);
    targets.forEach((c) => {
      targetFlags.set(c.uid, { cls: "target", html:
        `<span class="tf-verb">${verb} ${esc(upper(c.charName.split(" ")[0]))}</span>
         <span class="tf-bar"><i style="width:${pct(c.hp, c.maxHp)}%"></i></span>
         <span class="tf-hp">${rnd(c.hp)} / ${c.maxHp} HP</span>` });
      const el = fighterEl(c.uid); if (!el) return;
      el.classList.add("target-pick");
      const h = () => { if (moveSel) send(moveAction(moveSel, c.uid)); };
      el._th = h; el.addEventListener("click", h);
    });
  }
  applyFlags();
  updateCoach();
  updateCamera();
}

// What each ultimate does, in a few words.
function ultEffect(ult) {
  return { stun: "Hits both enemies; the next one misses a turn", heal: "Heals your team, hits both enemies",
           shield: "Shields your team, hits both enemies" }[ult?.archetype] || "Big hit on both enemies";
}

// ---- skill cards: the character's skill art, each card tappable ----
// Every card shows what the skill does, its SP cost, its power and its cooldown
// (CD: turns before it can be used again). Skills you can't use yet are dimmed.
function openSkillSheet(me, b, halfPower) {
  closeSkillSheet();
  const cds = me.cooldowns || {};
  const el = document.createElement("div");
  el.id = "skillSheet"; el.className = "ss-overlay";
  el.innerHTML = `
    <div class="ss-head">
      <span class="ss-tag">${esc(upper(me.charName.split(" ")[0]))}'S SKILLS</span>
      <span class="ss-sub">Tap a card to use that skill.${halfPower ? " Stolen turn: attacks do half damage." : ""}</span>
      <span class="ss-timer" data-deadline="${moveDeadline}"></span>
    </div>
    <div class="ss-box">
      <div class="ss-art">
        <img class="ss-img" src="${encodeURI(ASSETS.skillSheet(me.charId))}" alt="${esc(me.charName)}'s four skills" decoding="async" />
        <div class="ss-grid">${me.skills.map((sk, i) => {
          const cd = cds[i] || 0;
          const why = cd > 0 ? `Ready in ${cd} turn${cd > 1 ? "s" : ""}` : me.sp < sk.sp ? `Needs ${sk.sp} SP` : "";
          return `<button class="ss-card ${why ? "locked" : ""}" data-sk="${i}" ${why ? "disabled" : ""}
              aria-label="${esc(sk.name)}: ${esc(sk.desc || skillEffect(sk))} Costs ${sk.sp} SP.${why ? " " + why + "." : ""}">
            ${why ? `<span class="ss-lock">${why}</span>` : ""}</button>`;
        }).join("")}</div>
      </div>
    </div>
    <div class="ss-foot">
      <span class="ss-sp">Your SP <b>${rnd(me.sp)}</b> / ${me.maxSp}</span>
      <span class="ss-key">SP = cost · CD = turns before you can use it again</span>
      <button class="ss-back" data-ss="back">← BACK</button>
    </div>`;
  $("arena").appendChild(el);
  tickDeadlines();
  el.querySelectorAll("[data-sk]").forEach((card) => card.addEventListener("click", () => {
    if (inputLocked || card.disabled) return;
    const i = +card.dataset.sk;
    spawnEfx(me.uid, "ring", fxColor(me.skills[i].element), 0.5);
    closeSkillSheet();
    chooseMove({ kind: "skill", index: i }, me, b);
  }));
  el.querySelector("[data-ss=back]").addEventListener("click", () => { SFX.play("select"); closeSkillSheet(); });
  updateCoach();
}
function closeSkillSheet() {
  const el = $("skillSheet"); if (!el) return;
  el.remove(); updateCoach();
}

function tickMoveTimer() {
  const el = $("mpTimer");
  if (!el) return;
  const left = Math.max(0, Math.ceil((moveDeadline - Date.now()) / 1000));
  setText(el, `0:${String(left).padStart(2, "0")}`);
  el.classList.toggle("low", left <= 4);
}

function clearTargets() {
  document.querySelectorAll(".tok.target-pick").forEach((el) => {
    el.classList.remove("target-pick");
    if (el._th) { el.removeEventListener("click", el._th); delete el._th; }
  });
}
function send(action) {
  if (inputLocked) return;
  closeSkillSheet();
  lockBriefly(); clearTargets();
  socket.emit("action", action);
  targetFlags = new Map(); applyFlags();
  $("commands").classList.add("hidden");
  setStage("");
  movePicking = false; updateCoach();
}
function lockBriefly() { inputLocked = true; setTimeout(() => (inputLocked=false), 700); }

// ---- timer ----
let timerInt = null;
function startTimer(seconds) {
  stopTimer();
  const fill = $("mcqTimerFill");
  barRun(fill, 1, seconds);
  let left = seconds;
  timerRing(1, seconds); $("mcqTimer").textContent = fmt(left);
  timerInt = setInterval(() => { left--; $("mcqTimer").textContent = fmt(Math.max(0,left)); timerRing(left / seconds, left); if (left<=0) stopTimer(); }, 1000);
}
function stopTimer() { clearInterval(timerInt); timerInt = null; }
// the lantern ring round the timer ticks down once a second, like a clock (a continuous animation repainted every frame)
function timerRing(frac, secsLeft) {
  const t = $("mcqTimer"); t.classList.toggle("low", secsLeft <= 5);
  t.style.setProperty("--tp", Math.max(0, Math.min(1, frac)).toFixed(3));
}
// the bar shrinks with a transform, which the graphics chip runs without redrawing the page
function barRun(fill, from, secs) {
  fill.style.transition = "none"; fill.style.width = "100%"; fill.style.transformOrigin = "left center"; fill.style.transform = `scaleX(${from})`;
  void fill.offsetWidth;
  fill.style.transition = `transform ${secs}s linear`; fill.style.transform = "scaleX(0)";
}
// Start timer accounting for time already elapsed since the server set startedAt.
// Rounds to whole seconds so the CSS bar and number counter stay perfectly in sync.
function startTimerFrom(totalSeconds, startedAt) {
  const elapsed   = startedAt ? (srvNow() - startedAt) / 1000 : 0;
  const remaining = Math.max(0, totalSeconds - elapsed);
  const left      = Math.round(remaining);            // whole seconds — syncs CSS + counter
  const fraction  = totalSeconds > 0 ? left / totalSeconds : 1;
  stopTimer();
  const fill = $("mcqTimerFill");
  barRun(fill, fraction, left);
  let count = left;
  timerRing(fraction, left); $("mcqTimer").textContent = fmt(count);
  timerInt = setInterval(() => { count--; $("mcqTimer").textContent = fmt(Math.max(0,count)); timerRing(count / Math.max(1, totalSeconds), count); if (count<=0) stopTimer(); }, 1000);
}
function fmt(s) { return "0:" + String(s).padStart(2,"0"); }

// ---- fx ----
function floatAt(uid, text, cls) {
  const el = tokenEl(uid); if (!el) return;
  const anchor = el.querySelector(".chibi") || el;
  const ar = $("arena").getBoundingClientRect();
  const r  = anchor.getBoundingClientRect();
  const fx = document.createElement("div");
  fx.className = "fx " + cls; fx.textContent = text;
  fx.style.left = (r.left - ar.left + r.width/2) + "px";
  fx.style.top  = (r.top  - ar.top  + r.height*0.35) + "px";
  $("fxLayer").appendChild(fx);
  setTimeout(() => fx.remove(), 1200);
}
function flash() {
  let f = $("arena").querySelector(".flash");
  if (!f) { f = document.createElement("div"); f.className="flash"; $("arena").appendChild(f); }
  f.classList.remove("go"); void f.offsetWidth; f.classList.add("go");
}


refreshCoins();

// ============================================================
//  CLASS TOURNAMENT (student side)
//  The teacher runs the tournament from /teacher. Students join with the same
//  JOIN box as a normal room; the server recognises a tournament code.
// ============================================================
const T_KEY = "riftTournament";
let tView = null;          // latest tournament state for this student

function loadTSession() { try { return JSON.parse(localStorage.getItem(T_KEY)); } catch { return null; } }
function saveTSession(v) { try { localStorage.setItem(T_KEY, JSON.stringify(v)); } catch {} }
function clearTSession() { try { localStorage.removeItem(T_KEY); } catch {} tView = null; }

// A join link such as https://…/?join=ABCD fills in the code for the student.
{
  const code = new URLSearchParams(location.search).get("join");
  if (code) $("codeInput").value = code.toUpperCase().slice(0, 4);
}

// The fighter detail overlay sits inside the room screen; move it to the top
// level so the tournament screen can open it too.
$("game").appendChild($("charDetail"));
$("game").appendChild($("fighterScreen")); $("game").appendChild($("topicScreen"));
$("topicCard").addEventListener("click", openTopicScreen);
$("fighterCard").addEventListener("click", () => { SFX.play("select"); openFighterScreen("room"); });
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => { SFX.play("select"); $(b.dataset.close).classList.add("hidden"); }));
for (const id of ["fighterScreen", "topicScreen"]) $(id).addEventListener("click", (e) => { if (e.target.id === id) $(id).classList.add("hidden"); });

socket.on("tJoined", ({ code, you, token, name }) => {
  myId = you;
  saveTSession({ code, token, name });
  $("tnCode").textContent = code;
  const onBattle = $("battle").classList.contains("active") || $("result").classList.contains("active");
  if (!onBattle) showScreen("tourney");
});

socket.on("tState", (v) => {
  const ruleWas = tView?.settings?.studentSound;
  tView = v;
  if (v?.settings?.studentSound !== ruleWas) applySettings();
  renderTourney();
  // a round started without us (late joiner, bye) or we are idle on another screen
  const idle = ["title", "tutorial", "home", "room"].some((s) => $(s).classList.contains("active"));
  if (idle) showScreen("tourney");
});

socket.on("tGone", () => clearTSession());
socket.on("tKicked", (msg) => {
  clearTSession();
  toast(msg);
  $("homeMsg").textContent = msg;
  showScreen("home");
});

$("tnLeave").addEventListener("click", () => {
  const sure = !tView || tView.status === "finished" || confirm("Leave the class tournament?");
  if (!sure) return;
  socket.emit("tLeave");
  clearTSession();
  myId = socket.id;
  showScreen("home");
});
$("backToTourney").addEventListener("click", () => {
  renderTourney(); showScreen("tourney");
  // after every battle, Auntie's shop opens on the way back (the next round can still start; the shop then closes)
  if (tView && tView.status !== "finished" && !tView.you?.inBattle) {
    shop.open({ coins: tView.you.coins, bag: tView.you.bag, earned: lastEarned });
    lastEarned = 0;
  }
});

// ---- battle clock (top of the arena) ----
let matchDeadline = null, matchClockInt = null;
function setMatchClock(msLeft) {
  const el = $("matchClock");
  if (msLeft == null) { stopMatchClock(); return; }
  matchDeadline = Date.now() + msLeft;
  el.classList.remove("hidden");
  $("arena").classList.add("clocked");            // the question strip sits just under the clock
  const tick = () => {
    const t = Math.max(0, Math.ceil((matchDeadline - Date.now()) / 1000));
    setText(el, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`);
    el.classList.toggle("low", t <= 30);
  };
  tick();
  if (!matchClockInt) matchClockInt = setInterval(tick, 500);
}
function stopMatchClock() {
  clearInterval(matchClockInt); matchClockInt = null; matchDeadline = null;
  $("arena").classList.remove("clocked");
  $("matchClock").classList.add("hidden");
}

// ---- tournament screen ----
const ordinalOf = (n) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const outcomeText = (m) => {
  if (!m.result) return `In battle with ${esc(m.vs)}`;
  if (m.result.winner === "draw") return `Drew with ${esc(m.vs)}`;
  const won = m.result.winner === m.mySide;
  return `${won ? "Beat" : "Lost to"} ${esc(m.vs)}${m.result.reason === "time" ? " on time" : ""}`;
};

function renderTourney() {
  const v = tView; if (!v) return;
  $("tnCode").textContent = v.code;
  tDeadline = v.startsIn != null ? Date.now() + v.startsIn : null;
  // only touch what changed, so pictures do not flicker on every update
  const put = (id, html) => { const el = $(id); if (el._html !== html) { el._html = html; el.innerHTML = html; } };
  put("tnYou", `You are <b>${esc(v.you.name)}</b>${v.partner ? ` · partner <b>${esc(v.partner.name)}</b>` : ""}`);
  put("tnStatus", statusHtml(v));
  const finished = v.status === "finished";
  put("tnLeft", finished ? standingsHtml(v) : partnerHtml(v) + fighterHtml(v));
  put("tnShop", finished ? "" : shopDoorHtml(v));
  shop.update(v.you, shopNextHtml(v));
  put("tnRight", finished ? historyHtml(v) : watchHtml(v) + standingsHtml(v) + historyHtml(v));
  tickCountdowns();
  updateWatchFromResult();
}

// One click handler for the whole tournament screen (its contents are redrawn often).
$("tourney").addEventListener("click", (e) => {
  const el = e.target.closest("[data-mate],[data-fighter],[data-watch],[data-ready],[data-shop],#tnLeavePair");
  if (!el || !tView) return;
  if (el.dataset.shop) { SFX.play("select"); shop.open({ coins: tView.you.coins, bag: tView.you.bag }); }
  else if (el.dataset.mate) {
    SFX.play("select");
    socket.emit("tChoosePartner", { pid: tView.you.wants === el.dataset.mate ? null : el.dataset.mate });
  } else if (el.dataset.fighter) {
    SFX.play("select"); openFighterScreen("tourney", (charId) => socket.emit("tPickFighter", { charId }));
  } else if (el.dataset.watch) {
    SFX.play("select");
    socket.emit("tWatch", { matchId: el.dataset.watch });
  } else if (el.dataset.ready) {
    SFX.play("select");
    socket.emit("tReady", { ready: el.dataset.ready === "1" });
  } else if (el.id === "tnLeavePair") socket.emit("tLeavePair");
});

// ---- countdown to the next round ----
let tDeadline = null;
function tickCountdowns() {
  const left = tDeadline ? Math.max(0, Math.ceil((tDeadline - Date.now()) / 1000)) : 0;
  document.querySelectorAll(".tn-count").forEach((el) => {
    setText(el, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`);
  });
}
setInterval(tickCountdowns, 500);

function statusHtml(v) {
  const rounds = v.settings.rounds;
  const last = v.myMatches.filter((m) => m.result).slice(-1)[0];
  const counting = v.startsIn != null;
  const nextNo = v.status === "lobby" ? 1 : v.round + 1;
  if (v.status === "finished") {
    const place = v.mine ? `You finished <b>${ordinalOf(v.mine.rank)}</b> of ${v.totalPairs} pairs with <b>${v.mine.points}</b> points.` : "The tournament is over.";
    return `<div class="tn-banner final">🏆 FINAL RESULTS<span>${place}</span></div>`;
  }
  if (v.status === "lobby") {
    if (counting) return `<div class="tn-banner live"><div>ROUND 1 STARTS IN <b class="tn-count"></b></div><span>Everyone is ready. Good luck!</span></div>`;
    if (v.settings.autoStart !== "ready" || v.hold) {
      return `<div class="tn-banner">WAITING FOR ROUND 1<span>${v.hold ? "Your teacher has paused the start." : v.you.pairId ? "Your teacher starts the round. Pick your fighter while you wait." : "Get into a pair, then pick your fighter."}</span></div>`;
    }
    const btn = v.you.ready
      ? `<button class="shard-btn ghost small tn-ready-btn" data-ready="0"><span>✓ READY · TAP TO UNDO</span></button>`
      : `<button class="shard-btn primary tn-ready-btn" data-ready="1"><span>I'M READY</span></button>`;
    const todo = v.you.pairId ? "Pick your fighter, then tap I'M READY." : "Choose a partner and a fighter, then tap I'M READY. Anyone without a partner is paired at random.";
    return `<div class="tn-banner tn-banner-row"><div>WAITING FOR ROUND 1<span>${v.you.ready ? "You are ready." : todo}
      <b>${v.readyCount}</b> of ${v.onlineCount} ready. Round 1 starts when everyone is ready.</span></div>${btn}</div>`;
  }
  if (v.status === "round") {
    if (v.myBye) return `<div class="tn-banner">ROUND ${v.round} OF ${rounds}<span>${v.myBye.kind === "freewin" ? "No opponent is left for your pair this round, so you get a free win (+3 points)." : "No opponent is left for your pair this round, so you sit this one out."} Watch a battle below.</span></div>`;
    const mine = v.myMatches.find((m) => m.round === v.round);
    if (mine && !mine.result) return `<div class="tn-banner live">ROUND ${v.round} OF ${rounds}<span>Your battle against ${esc(mine.vs)} is on.</span></div>`;
    if (mine) return `<div class="tn-banner">ROUND ${v.round} OF ${rounds}<span>${outcomeText(mine)}. The next round starts when every battle has finished. Watch one below.</span></div>`;
    return `<div class="tn-banner">ROUND ${v.round} OF ${rounds}<span>You joined during this round. You will play from the next round. Watch a battle below.</span></div>`;
  }
  // between rounds
  const lastLine = last ? `Round ${last.round}: ${outcomeText(last)}.` : "";
  if (counting) return `<div class="tn-banner live"><div>ROUND ${nextNo} OF ${rounds} STARTS IN <b class="tn-count"></b></div><span>${lastLine} Get ready. The round starts by itself.</span></div>`;
  return `<div class="tn-banner">NEXT: ROUND ${nextNo} OF ${rounds}<span>${lastLine} ${v.hold ? "Your teacher has paused the tournament." : "Your teacher starts the next round."}</span></div>`;
}

function watchHtml(v) {
  if (v.status !== "round" || !v.liveMatches?.length) return "";
  return `<div class="tn-card"><h3 class="tn-h">WATCH A BATTLE <span class="tn-sub">${v.liveMatches.length} still going</span></h3>
    <div class="tn-watch">${v.liveMatches.map((m) => `
      <button class="tn-watch-btn" data-watch="${m.id}">
        <span class="tn-wa">${esc(m.a)}</span><b>VS</b><span class="tn-wb">${esc(m.b)}</span>
        <i>${m.hpA}% · ${m.hpB}% HP</i>
      </button>`).join("")}</div></div>`;
}

function partnerHtml(v) {
  if (v.partner) {
    const p = v.partner;
    const state = p.bot ? "A bot plays with you." : p.connected ? "" : `<em class="tn-off">offline</em>`;
    const leave = v.status === "lobby" && v.settings.pairing === "students"
      ? `<button class="shard-btn ghost small" id="tnLeavePair"><span>CHANGE PARTNER</span></button>` : "";
    return `<div class="tn-card"><h3 class="tn-h">YOUR PARTNER</h3>
      <div class="tn-partner">${miniFighter(p.character)}<div><div class="tn-pname">${esc(p.name)} ${state}</div>
      <div class="tn-psub">${p.character ? `${esc(CHAR_BY_ID[p.character]?.name || "")}` : "Has not picked a fighter yet"}</div></div></div>${leave}</div>`;
  }
  if (v.settings.pairing !== "students") {
    return `<div class="tn-card"><h3 class="tn-h">YOUR PARTNER</h3>
      <p class="tn-text">Your teacher is making the pairs. Wait here. If you have no partner when the round starts, you are paired at random.</p></div>`;
  }
  const mates = v.classmates;
  const list = mates.length ? mates.map((m) => `
      <button class="tn-mate ${v.you.wants === m.pid ? "chosen" : ""} ${m.wantsYou ? "wants" : ""}" data-mate="${m.pid}">
        <span>${esc(m.name)}</span>${m.wantsYou ? `<b>picked you</b>` : ""}${v.you.wants === m.pid ? `<b>waiting…</b>` : ""}
      </button>`).join("")
    : "";
  const waiting = v.you.wants ? (mates.find((m) => m.pid === v.you.wants)?.name || "") : "";
  return `<div class="tn-card"><h3 class="tn-h">CHOOSE YOUR PARTNER</h3>
    <p class="tn-text">${waiting
      ? `You picked <b>${esc(waiting)}</b>. You become a pair when they pick you too. Tap their name again to cancel.`
      : "Tap a classmate's name. When they tap your name too, you are a pair."}</p>
    ${list ? `<div class="tn-mates">${list}</div>` : `<p class="tn-text">Nobody else is free right now. If you are still on your own when the round starts, you are paired at random.</p>`}</div>`;
}

// the shop door on the tournament screen: Auntie's signboard along the bottom, with coins and what is in the bag
function shopDoorHtml(v) {
  const bag = Object.entries(v.you.bag || {}).flatMap(([id, n]) => Array(n > 0 ? n : 0).fill(id));
  return `<button class="tn-shop" data-shop="1" type="button" aria-label="Open Auntie's Magic Mama shop">
    <img class="tns-face" src="assets/shop/auntie_face.webp" alt="">
    <img class="tns-board" src="assets/shop/sign.webp" alt="Auntie's Magic Mama">
    <span class="tns-side"><span class="tns-c"><i class="mm-coin"></i>${v.you.coins || 0}<small>coins</small></span>
      ${bag.length ? `<span class="tns-bag">${bag.map((id) => `<img src="${itemIcon(id)}" alt="${esc(ITEM_BY_ID[id]?.name || id)}">`).join("")}</span>` : `<span class="tns-s">Buy items for your next battle</span>`}</span>
    <span class="tns-go">ENTER ▶</span>
  </button>`;
}
// the round countdown, shown on the shop sign
function shopNextHtml(v) {
  if (v.status === "finished") return "";
  const nextNo = v.status === "lobby" ? 1 : v.round + 1;
  if (v.startsIn != null) return `Round ${nextNo} starts in <b class="tn-count"></b>`;
  if (v.status === "round") return `Round ${v.round} is on`;
  return `Next: round ${nextNo} of ${v.settings.rounds}`;
}

function miniFighter(charId) {
  return charId ? `<div class="mini">${portrait(charId)}</div>` : `<div class="mini-empty"></div>`;
}

function fighterHtml(v) {
  if (v.status === "finished") return "";
  if (v.settings.fighters === "random") {
    return `<div class="tn-card"><h3 class="tn-h">YOUR FIGHTER</h3><p class="tn-text">Fighters are given out at random each round.</p></div>`;
  }
  const mine = v.you.character, theirs = v.partner?.character, mc = mine && CHAR_BY_ID[mine];
  fighterPicker.mine = mine || null; fighterPicker.tags = theirs && !v.partner?.bot ? { [theirs]: [upper(v.partner.name)] } : {};
  if (!$("fighterScreen").classList.contains("hidden") && fighterPicker.from === "tourney") renderRoster();
  return `<div class="tn-card"><h3 class="tn-h">YOUR FIGHTER</h3>
    <button type="button" class="room-card fighter tn-fpick" data-fighter="open" style="--ecol:${mc ? ELEMENT_COLORS[mc.element] : "var(--gold)"}">
      ${mc ? `<span class="rc-port">${portrait(mc.id)}</span><span class="rc-text"><span class="rc-value">${esc(mc.name)}</span>
        <span class="rc-meta" style="color:${ELEMENT_COLORS[mc.element]}">${esc(mc.element)} · ${esc(mc.role)}</span><span class="rc-action">Change fighter</span></span>`
      : `<span class="rc-port empty">?</span><span class="rc-text"><span class="rc-value">Not chosen yet</span><span class="rc-meta">If you do not pick, you get a random fighter.</span><span class="rc-action">Choose fighter</span></span>`}
    </button></div>`;
}

function standingsHtml(v) {
  if (v.standings) {
    if (!v.standings.length) return `<div class="tn-card"><h3 class="tn-h">LEADERBOARD</h3><p class="tn-text">Pairs appear here once everyone is paired.</p></div>`;
    const started = v.standings.some((r) => r.played > 0);
    const rows = v.standings.map((r) => `<tr class="${r.pairId === v.you.pairId ? "me" : ""}">
      <td>${started ? r.rank : "–"}</td><td class="l">${esc(r.name)}</td><td class="pts">${r.points}</td><td>${r.wins}-${r.draws}-${r.losses}</td></tr>`).join("");
    return `<div class="tn-card"><h3 class="tn-h">${v.status === "finished" ? "FINAL STANDINGS" : "LEADERBOARD"}</h3>
      <table class="tn-table"><thead><tr><th>#</th><th class="l">Pair</th><th>Pts</th><th>W-D-L</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  if (v.mine && v.mine.played > 0) {
    return `<div class="tn-card"><h3 class="tn-h">YOUR PLACE</h3>
      <div class="tn-place"><b>${ordinalOf(v.mine.rank)}</b> of ${v.totalPairs} pairs · ${v.mine.points} points</div>
      <p class="tn-text">The full leaderboard is on the board at the front.</p></div>`;
  }
  return `<div class="tn-card"><h3 class="tn-h">LEADERBOARD</h3><p class="tn-text">${v.round > 0 ? "The leaderboard is hidden until the end." : "Points appear after Round 1. A win is 3 points and a draw is 1."}</p></div>`;
}

function historyHtml(v) {
  const done = v.myMatches.filter((m) => m.result);
  if (!done.length) return "";
  return `<div class="tn-card"><h3 class="tn-h">YOUR BATTLES</h3><ul class="tn-hist">${done.map((m) =>
    `<li class="${m.result.winner === "draw" ? "draw" : m.result.winner === m.mySide ? "win" : "loss"}"><span>Round ${m.round}</span>${outcomeText(m)}</li>`).join("")}</ul></div>`;
}


// ============================================================
//  WATCHING A BATTLE (spectator view)
// ============================================================
socket.on("tWatching", (d) => {
  if (!d.matchId) {
    spectating = null;
    $("spectateBar").classList.add("hidden");
    if (WATCH) {                                   // projector view: wait for the next battle
      showWatchWait(d.gone ? "This tournament has ended." : "No battles are running right now. The next one will appear here.");
      if (!d.gone) setTimeout(() => socket.emit("tWatch", { code: WATCH.code }), 4000);
    } else {
      toast("No battles are running right now.");
      renderTourney(); showScreen("tourney");
    }
    return;
  }
  hideWatchWait();
  spectating = { matchId: d.matchId, a: d.a, b: d.b, code: null };
  preppedKey = "";
  attackPosed.clear();
  stealMeta = null;
  $("spectateNames").innerHTML = `${esc(d.a)} <b>VS</b> ${esc(d.b)}`;
  $("spectateNext").classList.toggle("hidden", d.liveCount < 2);
  $("spectateBack").classList.toggle("hidden", !!WATCH);
  $("spectateBar").classList.remove("hidden");
});

function leaveSpectate(toTourney) {
  if (!spectating) return;
  spectating = null;
  socket.emit("tUnwatch");
  $("spectateBar").classList.add("hidden");
  stopMatchClock();
  if (toTourney) { renderTourney(); showScreen("tourney"); }
}

function spectatedBattleEnded(winnerTeam, reason) {
  const s = spectating;
  stopMatchClock();
  const msg = winnerTeam === -1 ? "DRAW" : `${winnerTeam === 0 ? s.a : s.b} WIN${reason === "time" ? " ON TIME" : ""}!`;
  bannerFlash("🏆 " + msg, "mine");
  toast(winnerTeam === -1 ? `${s.a} and ${s.b} drew.` : `${winnerTeam === 0 ? s.a : s.b} won${reason === "time" ? " on time" : ""}.`);
  setTimeout(() => {
    if (spectating !== s) return;                  // already moved on
    if (WATCH) socket.emit("tWatch", { code: WATCH.code, next: true });
    else leaveSpectate(true);
  }, 3000);
}

$("spectateNext").addEventListener("click", () => socket.emit("tWatch", { code: WATCH?.code, next: true }));
$("spectateBack").addEventListener("click", () => leaveSpectate(true));
$("watchFromResult").addEventListener("click", () => socket.emit("tWatch", {}));
function updateWatchFromResult() {
  $("watchFromResult").classList.toggle("hidden", !(tView?.status === "round" && tView.liveMatches?.length));
}

function showWatchWait(text) {
  let el = $("watchWait");
  if (!el) {
    el = document.createElement("div"); el.id = "watchWait"; el.className = "watch-wait";
    $("game").appendChild(el);
  }
  el.textContent = text;
  el.classList.remove("hidden");
}
function hideWatchWait() { $("watchWait")?.classList.add("hidden"); }
if (WATCH) showWatchWait("Connecting to the tournament…");

// ============================================================
//  PRACTICE FIGHT — the coach
//  The server runs the script (practice.js): which lesson this turn teaches,
//  and when the fight waits for NEXT. Here the coach (Emi, your partner) says
//  what to do, and an arrow points at the button to tap.
// ============================================================
let coachSpotFn = null, coachShown = "";
let practiceLeft = null;      // the code of a practice fight the student walked out of

// A practice answer that was wrong can be tried again.
socket.on("practiceRetry", ({ steal }) => {
  SFX.play("wrong");
  const btn = document.querySelectorAll("#mcqChoices .choice")[mySelected];
  if (btn) { btn.disabled = true; btn.classList.add("wrong", "tried"); }
  const fb = $("mcqFeedback");
  fb.className = "mcq-feedback bad";
  fb.textContent = steal ? "✗ Not that one. Try again!"
    : "✗ Not quite. In a real battle a wrong answer means you guard and can't attack. Here, try again!";
  fb.classList.remove("hidden");
});

function coachMessage(p, b) {
  const me = b.combatants.find((c) => c.uid === myId);
  const byChar = (id) => b.combatants.find((c) => c.charId === id);
  const nm = (c) => (c ? esc(NAME[c.charId] || c.charName) : "");
  const cur = b.combatants.find((c) => c.uid === b.current);
  const renji = byChar("renji"), nao = byChar("nao");
  const flagOf = (c) => () => { const t = c && tokenEl(c.uid); return t?.querySelector(".tok-flag.on") || t; };
  const q = (sel) => () => document.querySelector(sel);
  const m = (tag, text, extra = {}) => ({ tag, text, ...extra });

  // the fight is waiting for NEXT
  switch (p.gate) {
    case "intro": return m("PRACTICE FIGHT", `Hi, I'm <b>Emi</b>, your partner! You are <b>${nm(me)}</b>, at the front on the left. The two on the right are our rivals. Nothing is timed here, so take your time.`, { next: true, spot: flagOf(me) });
    case "foeTurn": return m("THEIR TURN", `Now it's <b>${nm(cur)}</b>'s turn. Turns go round: you, a rival, me, then the other rival. Read their question at the top too!`, { next: true });
    case "foeHit": return m("YOUR HP", `Ouch, ${nm(renji)} hit you! Your <b>HP</b> is the green bar at the top left. At 0 you are knocked out. Don't worry, I'll heal you.`, { next: true, spot: q(`.hud-row[data-uid="${myId}"]`), arrow: false });
    case "partnerTurn": return m("TEAM SYNC", `My turn! Every right answer fills our <b>SYNC</b> gauge, top left. When it is full, you can use your <b>Ultimate</b>.`, { next: true, spot: q("#hudMine .hud-sync") });
    case "stealSetup": return m("WATCH THIS", `<b>${nm(nao)}</b>'s turn. Read this question too. If ${nm(nao)} gets it wrong, you can <b>steal</b> the turn!`, { next: true });
  }

  const mine = b.current === myId;
  if (b.phase === "question" && mine) {
    if (p.lesson === "strike") return m("YOUR TURN", "Every turn starts with a question. Tap the right answer and you get to <b>attack</b>.");
    if (p.lesson === "skills") return m("YOUR TURN", "Your turn again. Answer this one, then you will try a <b>skill</b>.");
    if (p.lesson === "ult") {
      if (hintFor(b.question)) return m("HINTS", "There's your clue. Now pick the answer.");
      return m("HINTS", "This one is harder. Tap <b>💡 HINT</b> twice for a clue. The price: your move won't be powered up.", { spot: q("#mcqHint:not(.hidden)") });
    }
    return m("FINISH IT", "Finish the fight! Every move is unlocked now, even <b>Items</b>. Answer, then pick any move you like.");
  }
  if (b.phase === "reveal" && mine) return m("CORRECT!", "Right answer! Get ready to attack.");
  if (b.phase === "steal" && b.stealOf !== myId && stealMeta)
    return m("STEAL!", `${nm(cur)} got it wrong, so ${nm(cur)} must <b>guard</b>. Answer it yourself to <b>steal</b> the turn!`);

  const myMove = (b.phase === "action" && mine && myAnswerCorrect) || (b.phase === "steal-action" && b.stealActor === myId);
  if (myMove && !$("commands").classList.contains("hidden") || myMove && $("skillSheet")) {
    if ($("skillSheet")) return m("SKILL CARDS", "<b>SP</b> is what a skill costs: the pink bar under your HP. <b>CD</b> is how many turns before you can use it again. Tap <b>Ember Slash</b>.", { spot: q('#skillSheet .ss-card[data-sk="0"]:not(:disabled)') });
    if (movePicking) {
      if (p.lesson === "skills" && moveSel?.kind === "skill" && renji?.alive)
        return m("WEAK SPOT", `<b>${nm(renji)}</b> is weak to <b>Fire</b>, and you are a Fire fighter! Hit ${nm(renji)} for a <b>WEAK</b> hit: extra damage.`, { spot: flagOf(renji) });
      return m("PICK A TARGET", "Now tap a rival to hit them. Their HP shows above their heads.");
    }
    if (b.phase === "steal-action") return m("STOLEN TURN", "You stole it! A stolen turn only does <b>half damage</b>. Tap <b>STRIKE</b>.", { spot: q(".ms-move.strike") });
    if (p.lesson === "strike") return m("ATTACK", "A right answer lets you attack. Tap <b>STRIKE</b>.", { spot: q(".ms-move.strike") });
    if (p.lesson === "skills") return m("SKILLS", "Skills are special moves. Tap <b>SKILLS</b> to see your four skill cards.", { spot: q(".ms-move.skills") });
    if (p.lesson === "ult") return m("ULTIMATE", `Our <b>SYNC</b> gauge is full! Tap <b>ULTIMATE</b> ${renji?.alive && nao?.alive ? "to hit both rivals at once" : "for a huge hit"}.`, { spot: q(".ms-move.ult") });
    return m("FINISH IT", "Pick any move you like. <b>ITEMS</b> heal you, give SP or bring back a knocked-out teammate.");
  }

  if (!cur || b.phase == null) return m("PRACTICE FIGHT", "Get ready…");
  const partner = cur.team === me?.team && cur.uid !== myId;
  if (b.phase === "question") return m("WATCH", partner ? "I'm answering this one. Read along at the top." : `<b>${nm(cur)}</b> is answering. Read along at the top.`);
  if (cur.uid === myId) return m("NICE!", "Watch what your move does.");
  return m("WATCH", partner ? "Watch my move!" : `<b>${nm(cur)}</b> is making a move.`);
}

function updateCoach() {
  const box = $("coach"); if (!box) return;
  const p = room?.practice, b = room?.battle;
  if (!p || !b || spectating || !$("battle").classList.contains("active")) {
    box.classList.add("hidden"); coachSpotFn = null; applyCoachSpot(); coachShown = ""; return;
  }
  const msg = coachMessage(p, b);
  if (!$("coachFace").firstChild) $("coachFace").innerHTML = `<img src="${encodeURI(ASSETS.portraits.emi)}" alt="Emi" />`;
  const key = msg.tag + "|" + msg.text;
  if (key !== coachShown) {
    $("coachTag").textContent = msg.tag;
    $("coachText").innerHTML = msg.text;
    if (coachShown) { box.classList.remove("bump"); void box.offsetWidth; box.classList.add("bump"); }
    coachShown = key;
  }
  $("coachSide").classList.toggle("hidden", !msg.next);
  box.classList.remove("hidden");
  // under the question strip when someone else's question is showing, otherwise at the top
  const strip = $("qStrip");
  box.style.top = strip.classList.contains("hidden") ? ""
    : (strip.getBoundingClientRect().bottom - $("arena").getBoundingClientRect().top + 8) + "px";
  coachSpotFn = msg.spot || null;
  coachArrowOn = msg.arrow !== false;
  applyCoachSpot();
}

// a glowing ring around what to tap, and an arrow pointing at it
let coachArrowOn = true;
function applyCoachSpot() {
  const el = coachSpotFn ? coachSpotFn() : null;
  const arrow = $("coachArrow"), ring = $("coachRing");
  const r = el?.getBoundingClientRect();
  if (!el || !r.width || !r.height) { arrow.classList.add("hidden"); ring.classList.add("hidden"); return; }
  const ar = $("arena").getBoundingClientRect();
  const pad = 5;
  Object.assign(ring.style, { left: (r.left - ar.left - pad) + "px", top: (r.top - ar.top - pad) + "px",
    width: (r.width + pad * 2) + "px", height: (r.height + pad * 2) + "px" });
  ring.classList.toggle("hidden", !!el.closest(".tok"));      // fighters already light up when they can be tapped
  if (!coachArrowOn) { arrow.classList.add("hidden"); return; }
  const up = r.top - ar.top < ar.height * 0.15;         // right at the top: point up at it from below
  arrow.classList.toggle("up", up);
  arrow.style.left = (r.left - ar.left + r.width / 2) + "px";
  arrow.style.top = (up ? r.bottom - ar.top + pad + 4 : r.top - ar.top - pad - 4) + "px";
  arrow.classList.remove("hidden");
}
setInterval(() => { if (room?.practice && $("battle").classList.contains("active")) applyCoachSpot(); }, 250);

$("coachNext").addEventListener("click", () => {
  SFX.play("select");
  $("coachSide").classList.add("hidden");
  socket.emit("coachNext");
});
$("coachExit").addEventListener("click", () => {
  SFX.play("select");
  socket.emit("leavePractice");
  practiceLeft = room?.code || null;
  resetBattleView();
  room = null;
  updateCoach();
  refreshCoins(); showScreen("home");
});

// Forget what the last battle left on the stage.
function resetBattleView() {
  stealMeta = null; lastReveal = null; myHint = null; moveKey = "";
  attackPosed.clear();
  hideMoves(); hideQuestionCard(); stopMatchClock();
  $("qStrip").classList.add("hidden");
}

function showPracticeDone() {
  try { localStorage.setItem(PRACTICE_KEY, "1"); } catch {}
  $("coach").classList.add("hidden"); $("coachArrow").classList.add("hidden"); $("coachRing").classList.add("hidden");
  $("resultTitle").textContent = "PRACTICE COMPLETE!";
  $("resultTitle").className = "result-title small";
  const tips = [
    ["Answer right to attack.", "Answer wrong and you guard for that turn."],
    ["Steal a turn", "when someone answers wrong. Stolen attacks do half damage."],
    ["Skills cost SP.", "CD is the number of turns before you can use one again."],
    ["Hit weak spots", "for extra damage and extra Sync."],
    ["Fill the Sync gauge", "with right answers, then use your Ultimate."],
    ["A hint helps,", "but your move won't be powered up."],
    ["Items:", "HP Boost, SP Boost and Revive. One of each per battle."],
  ];
  $("resultBody").innerHTML = `<div class="reward-line"><span>🎓 You know how to play!</span></div>
    <ul class="practice-tips">${tips.map(([a, b]) => `<li><b>${a}</b> ${b}</li>`).join("")}</ul>
    <p class="practice-note">In a real battle every question and every move has a timer. Every fighter has their own four skills: tap a fighter in the lobby to see them.</p>`;
  ["rematchBtn", "lobbyBtn"].forEach((id) => { $(id).style.display = "none"; });
  $("watchFromResult").classList.add("hidden"); $("backToTourney").classList.add("hidden");
  $("practiceDone").classList.remove("hidden"); $("practiceAgain").classList.remove("hidden");
  showScreen("result");
}
$("practiceDone").addEventListener("click", () => { SFX.play("select"); room = null; refreshCoins(); showScreen("home"); });
$("practiceAgain").addEventListener("click", startPractice);
