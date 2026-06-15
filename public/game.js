// ===== Academy Rift — client =====
import { CHARACTERS, CHAR_BY_ID, ELEMENT_COLORS, ITEMS, ITEM_BY_ID } from "./data/characters.js";

const socket = io();
let myId = null;
let room = null;
let inputLocked = false;
let mySelected = -1;
let myAnswerCorrect = false;   // gates attacking — set from answerResult

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
const BM = "assets/UI%20Design%20Reference%20Battle/";
const BATTLE_IMGS = {
  strike:   `${BM}1.png`,
  spell:    `${BM}2.png`,
  defend:   `${BM}3.png`,
  item:     `${BM}4.png`,
  tag:      `${BM}5.png`,
  ultimate: `${BM}6.png`,
};
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
};

// Music tracks. playsInline keeps iOS from hijacking them into a fullscreen player.
const lobbyBGM = new Audio("assets/Midnight Combo.mp3");
lobbyBGM.loop = true;
lobbyBGM.volume = 0.55;
lobbyBGM.playsInline = true;

const battleBGM = new Audio("assets/Battle Music.mp3");
battleBGM.loop = true;
battleBGM.volume = 0.55;
battleBGM.playsInline = true;

const $ = (id) => document.getElementById(id);
const SCREENS = ["title","home","room","battle","result","shop"];
function showScreen(id) {
  const was = SCREENS.find((s) => $(s).classList.contains("active"));
  SCREENS.forEach((s) => $(s).classList.toggle("active", s === id));
  if (id === was) return;                         // same screen re-render → don't touch music
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
function refreshCoins() { $("homeCoins").textContent = profile.coins; $("shopCoins").textContent = profile.coins; }

// Start the lobby theme as early as possible. Browsers block audio autoplay until
// the first user gesture, so we (a) try on load, and (b) guarantee it on the very
// first interaction — i.e. the moment the player clicks "ENTER THE RIFT".
function startLobbyMusicOnce() {
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
document.addEventListener("DOMContentLoaded", () => { lobbyBGM.play().catch(() => {}); });
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

// Designed player-card frames — trim the transparent padding to a tight landscape card.
const cardCache = {};   // charId -> { src, ar }
function trimBoxFull(d, w, h) {
  let x0 = w, y0 = h, x1 = 0, y1 = 0, hit = false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    if (d[(y * w + x) * 4 + 3] > 16) { hit = true;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return hit ? { x0, y0, x1: x1 + 1, y1: y1 + 1 } : { x0: 0, y0: 0, x1: w, y1: h };
}
function processCard(id) {
  if (cardCache[id] !== undefined) return Promise.resolve(cardCache[id]);
  const url = ASSETS.card(id);
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      try {
        const W = im.naturalWidth, H = im.naturalHeight;
        const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(im, 0, 0);
        const b = trimBoxFull(ctx.getImageData(0, 0, W, H).data, W, H);
        const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
        const out = document.createElement("canvas"); out.width = bw; out.height = bh;
        out.getContext("2d").drawImage(cv, b.x0, b.y0, bw, bh, 0, 0, bw, bh);
        cardCache[id] = { src: out.toDataURL("image/png"), ar: bw / bh };
      } catch (e) { cardCache[id] = { src: encodeURI(url), ar: 3 }; }
      res(cardCache[id]);
    };
    im.onerror = () => { cardCache[id] = { src: encodeURI(url), ar: 3 }; res(cardCache[id]); };
    im.src = encodeURI(url);
  });
}
const cardData = (id) => cardCache[id] || { src: encodeURI(ASSETS.card(id)), ar: 3.1 };

function preloadArt(ids) {
  const jobs = [];
  [...new Set(ids)].forEach((id) => {
    jobs.push(transparentize(ASSETS.idle(id)), blackKnockout(ASSETS.attack(id)), processCard(id));
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
  const src = (uid && attackPosed.has(uid)) ? attackSrc(charId) : idleSrc(charId);
  const posed = uid && attackPosed.has(uid) ? " posed" : "";
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
  let ctx = null;
  const ac = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());
  function tone(freq, dur, type = "sine", gain = 0.18, slideTo = null) {
    try {
      const c = ac(), o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
      g.gain.setValueAtTime(gain, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur);
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
      n.connect(f).connect(g).connect(c.destination); n.start(); n.stop(c.currentTime + dur);
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
  };
  return {
    play: (k) => { (lib[k] || (() => {}))(); },
    unlock: () => { try { const c = ac(); if (c.state === "suspended") c.resume(); } catch (e) {} },
  };
})();
document.addEventListener("pointerdown", () => SFX.unlock(), { capture: true });

// ============================================================
//  NAVIGATION
// ============================================================
document.querySelectorAll("[data-go]").forEach((b) =>
  b.addEventListener("click", () => {
    const dest = b.dataset.go;
    if (dest === "home") { refreshCoins(); showScreen("home"); }
    else if (dest === "shop") { renderShop(); showScreen("shop"); }
    else showScreen(dest);
  })
);

$("createBtn").addEventListener("click", () => socket.emit("createRoom", { name: $("nameInput").value.trim() || "Player" }));
$("joinBtn").addEventListener("click", () => {
  const code = $("codeInput").value.trim().toUpperCase();
  if (code.length !== 4) return ($("homeMsg").textContent = "Enter a 4-letter code.");
  socket.emit("joinRoom", { name: $("nameInput").value.trim() || "Player", code });
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
socket.on("connect", () => { myId = socket.id; });
socket.on("joined", ({ code }) => { $("roomCode").textContent = code; });
socket.on("errorMsg", (m) => { $("homeMsg").textContent = m; $("roomMsg").textContent = m; toast(m); });
socket.on("toast", (m) => toast(m));

let preppedKey = "";
socket.on("room", (s) => {
  room = s;
  if (s.status === "lobby") { preppedKey = ""; renderRoom(); showScreen("room"); }
  else if (s.status === "battle") ensureChibisThenRender(s.battle.combatants);
});

// battleStart can arrive before or after the room(battle) broadcast — handle bg here,
// but the authoritative sprite prep happens whenever battle data lands (ensureChibisThenRender).
socket.on("battleStart", () => {
  if (ASSETS.bg.castle) $("arena").style.backgroundImage = `url('${encodeURI(ASSETS.bg.castle)}')`;
  showScreen("battle");
});

// Render immediately (fallback sprites), then upgrade to transparent chibis once ready.
function ensureChibisThenRender(combatants) {
  if (ASSETS.bg.castle) $("arena").style.backgroundImage = `url('${encodeURI(ASSETS.bg.castle)}')`;
  showScreen("battle");
  renderBattle();
  const ids = combatants.map((c) => c.charId);
  const key = ids.slice().sort().join(",");
  if (key === preppedKey) return;
  preppedKey = key;
  preloadArt(ids).then(() => { if (room?.status === "battle") renderBattle(); });
}

socket.on("answerResult", ({ uid, correct, correctIndex, explain }) => {
  if (uid === myId) { myAnswerCorrect = correct; SFX.play(correct ? "correct" : "wrong"); }
  if (correct) setAttackPose(uid);   // right answer → don the attack costume, and STAY in it
  document.querySelectorAll("#mcqChoices .choice").forEach((b, i) => {
    b.disabled = true;
    if (i === correctIndex) b.classList.add("correct");
    else if (i === mySelected && uid === myId) b.classList.add("wrong");
  });
  const fb = $("mcqFeedback");
  fb.className = "mcq-feedback " + (correct ? "good" : "bad");
  fb.textContent = (correct ? "✓ CORRECT!  Your attack is powered up." : "✗ WRONG.  You can only defend or support this turn.") +
    "  " + explain;
  fb.classList.remove("hidden");
  stopTimer();
  if (uid !== myId) toast(`${nameOf(uid)} answered ${correct ? "correctly ✓" : "wrong ✗"}.`);
});

// Both teammates answered correctly → sync surge
socket.on("teamSync", ({ team }) => {
  const myTeam = room?.players.find((p) => p.id === myId)?.team ?? 0;
  if (team === myTeam) { SFX.play("sync"); bannerFlash("⚡ TEAM IN SYNC!  +GAUGE", "mine"); }
});

function bannerFlash(text, cls) {
  const tb = $("turnBanner"); if (!tb) return;
  const prev = tb.textContent, prevCls = tb.className;
  tb.textContent = text; tb.className = "turn-banner " + (cls || "");
  clearTimeout(bannerFlash._t);
  bannerFlash._t = setTimeout(() => { tb.textContent = prev; tb.className = prevCls; }, 1400);
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

socket.on("actionResult", ({ actor, action, name, events }) => {
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
  });
  if (weak) {
    const tb = $("turnBanner");
    tb.classList.add("weak");
    setTimeout(() => tb.classList.remove("weak"), 900);
  }
  // re-render HP bars without rebuilding DOM (avoids animation flicker)
  updateBars();
});

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
    else if (ev.kind === "fizzle") other = ev.miss ? "missed! (accuracy down)" : "missed!";
  });
  if (guards.length && !other) other = `shielded ${guards.join(", ")}`;

  // verb + skill name
  const verb = type === "stunned" ? "" : type === "strike" ? "strikes with" : type === "ultimate" ? "unleashes" :
               type === "defend" ? "uses" : type === "tag" ? "uses" : "uses";
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

socket.on("battleEnd", ({ winnerTeam, rewards }) => {
  attackPosed.clear();
  const myTeam = room.players.find((p) => p.id === myId)?.team ?? 0;
  const won = myTeam === winnerTeam;
  const r = rewards[myId];
  if (r) { profile.coins += r.coins; saveProfile(profile); refreshCoins(); }
  $("resultTitle").textContent = won ? "VICTORY!" : "DEFEAT";
  $("resultTitle").className = "result-title" + (won ? "" : " lose");
  const lines = [
    `<div class="reward-line"><span>${won ? "🏆 Your team won the Rift!" : "Study hard and try again!"}</span></div>`,
    ...(r ? [
      `<div class="reward-line"><span>💰 Coins earned</span><span>+${r.coins}</span></div>`,
      `<div class="reward-line"><span>🧪 Science bonus</span><span>+${r.science}</span></div>`,
      `<div class="reward-line"><span>✅ Correct answers</span><span>${r.correct}</span></div>`,
      `<div class="reward-line"><span>👜 Total coins</span><span>${profile.coins}</span></div>`,
    ] : []),
  ];
  $("resultBody").innerHTML = lines.join("");
  $("rematchBtn").style.display = room.hostId === myId ? "" : "none";
  showScreen("result");
});

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
         <div><div class="slot-name">${p.name}${p.id===myId?" (you)":""}</div>
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

  // roster
  const ros = $("roster"); ros.innerHTML = "";
  CHARACTERS.forEach((c) => {
    const picked = meP?.character === c.id;
    const col = ELEMENT_COLORS[c.element];
    ros.insertAdjacentHTML("beforeend",
      `<div class="rcard ${picked?"picked":""}" data-pick="${c.id}" style="${picked?`--ecol:${col}`:``}">
        <div class="rport">${portrait(c.id)}</div>
        <div class="rname">${NAME[c.id]}</div>
        <div class="relem" style="color:${col}">${c.element}</div>
        <div class="rrole">${c.role}</div>
      </div>`);
  });
  ros.querySelectorAll("[data-pick]").forEach((el) =>
    el.addEventListener("click", () => openCharDetail(el.dataset.pick)));
}

// ---- character detail overlay: big card art + skills/stats info sheet ----
function openCharDetail(charId) {
  const c = CHAR_BY_ID[charId]; if (!c) return;
  SFX.play("select");
  const ov = $("charDetail");
  $("cdArt").src   = encodeURI(ASSETS.bigcard(charId));
  $("cdInfo").src  = encodeURI(ASSETS.cardinfo(charId));
  $("cdName").textContent = c.name;
  $("cdMeta").innerHTML = `<span style="color:${ELEMENT_COLORS[c.element]}">${c.element}</span> · ${c.role}`;
  $("cdPick").onclick = () => { socket.emit("pickCharacter", { charId }); closeCharDetail(); };
  ov.classList.add("show");
}
function closeCharDetail() { $("charDetail").classList.remove("show"); }

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

// Player card = designed frame art (portrait + element icon baked in) with the
// character name + HP/SP bars overlaid in the black middle. No level text.
function cardHTML(c, side, acting, label) {
  const hp = pct(c.hp, c.maxHp), sp = pct(c.sp, c.maxSp);
  const cd = cardData(c.charId);
  return `<div class="pcard ${side} ${c.alive?"":"dead"} ${acting?"acting":""}" data-uid="${c.uid}"
       style="--ar:${cd.ar};background-image:url('${cd.src}')">
    <span class="pc-label">${label}</span>
    <div class="pc-overlay">
      <div class="pc-name">${c.charName}</div>
      <div class="pc-bar hp"><i class="${hp<=30?"low":""}" style="width:${hp}%"></i><b>${rnd(c.hp)} / ${c.maxHp}</b></div>
      <div class="pc-bar sp"><i style="width:${sp}%"></i><b>${rnd(c.sp)} / ${c.maxSp}</b></div>
    </div>
  </div>`;
}

// ambient elemental particles rising around a fighter
function particleHTML() {
  let s = "";
  for (let i = 0; i < 5; i++) {
    const x = (8 + Math.random() * 84).toFixed(0), sz = (3 + Math.random() * 5).toFixed(1);
    const d = (Math.random() * 2.2).toFixed(2), dur = (1.6 + Math.random() * 1.1).toFixed(2);
    s += `<span class="p" style="--x:${x}%;--s:${sz}px;--d:${d}s;--dur:${dur}s"></span>`;
  }
  return s;
}

// Chibi sprite token — large ready-stance illustration with element aura + particles
function tokenHTML(c, facing, acting) {
  const col = fxColor(c.element);
  const posed = attackPosed.has(c.uid) ? " posed" : "";
  return `<div class="tok ${c.alive?"":"down"} ${acting?"acting":""}${posed}" data-uid="${c.uid}" data-facing="${facing}" data-el="${c.element}"
       style="--glow:${hexRGBA(col,0.8)};--pc:${col};--ef:${col}">
    <div class="tok-spot"></div>
    <div class="tok-aura"></div>
    <div class="tok-fxp">${particleHTML()}</div>
    ${chibiImg(c.charId, c.uid)}
    <div class="tok-tag">${c.charName.split(" ")[0]}</div>
  </div>`;
}

function fillSlot(slotId, laneId, c, side, facing, acting, label) {
  const slot = $(slotId), lane = $(laneId);
  if (!c) { slot.innerHTML = ""; lane.innerHTML = ""; return; }
  slot.innerHTML = cardHTML(c, side, acting, label);
  lane.innerHTML = tokenHTML(c, facing, acting);
}

function renderBattle() {
  const b = room.battle; if (!b) return;
  const myTeam  = room.players.find((p) => p.id === myId)?.team ?? 0;
  const enmTeam = myTeam === 0 ? 1 : 0;
  const allies  = b.combatants.filter((c) => c.team === myTeam);
  const foes    = b.combatants.filter((c) => c.team === enmTeam);
  const act = (c) => c && b.current === c.uid;

  fillSlot("slotAllyFront",  "laneAllyFront",  allies[0], "",    "right", act(allies[0]), "");
  fillSlot("slotAllyBack",   "laneAllyBack",   allies[1], "",    "right", act(allies[1]), "");
  fillSlot("slotEnemyFront", "laneEnemyFront", foes[0],   "foe", "left",  act(foes[0]),   "");
  fillSlot("slotEnemyBack",  "laneEnemyBack",  foes[1],   "foe", "left",  act(foes[1]),   "");

  setSyncMine(b.sync[myTeam]); setSyncFoe(b.sync[enmTeam]);

  const cur    = b.combatants.find((c) => c.uid === b.current);
  const myTurn = b.current === myId;
  const banner = $("turnBanner");
  banner.className = "turn-banner" + (myTurn ? " mine" : "");
  banner.textContent = cur ? (myTurn ? "⚡ YOUR TURN — " + cur.charName : cur.name + "'s turn…") : "…";

  renderDock(b, cur, myTurn);
}

function setSyncMine(val) {
  $("syncMine").style.width = Math.min(100, val) + "%";
  document.querySelector(".sync-gauge.mine").classList.toggle("ready", val >= 100);
}
function setSyncFoe(val) { $("syncFoe").style.width = Math.min(100, val) + "%"; }

// Live-update cards/sync after combat without rebuilding the stage
function updateBars() {
  const b = room.battle; if (!b) return;
  const myTeam = room.players.find((p) => p.id === myId)?.team ?? 0;
  b.combatants.forEach((c) => {
    const card = cardEl(c.uid);
    if (card) {
      const hp = pct(c.hp, c.maxHp), sp = pct(c.sp, c.maxSp);
      const hpi = card.querySelector(".pc-bar.hp i"), spi = card.querySelector(".pc-bar.sp i");
      const hpb = card.querySelector(".pc-bar.hp b"), spb = card.querySelector(".pc-bar.sp b");
      if (hpi) { hpi.style.width = hp + "%"; hpi.classList.toggle("low", hp <= 30); }
      if (spi) spi.style.width = sp + "%";
      if (hpb) hpb.textContent = `${rnd(c.hp)}/${c.maxHp}`;
      if (spb) spb.textContent = `${rnd(c.sp)}/${c.maxSp}`;
      card.classList.toggle("dead", !c.alive);
    }
    const tok = tokenEl(c.uid); if (tok) tok.classList.toggle("down", !c.alive);
  });
  setSyncMine(b.sync[myTeam]); setSyncFoe(b.sync[myTeam === 0 ? 1 : 0]);
}

// ---- dock ----
function renderDock(b, cur, myTurn) {
  const mcq  = $("mcq"), cmds = $("commands"), wait = $("waitBox");
  if (b.phase === "question") {
    cmds.classList.add("hidden"); wait.classList.add("hidden"); mcq.classList.remove("hidden"); setBattleDim(false);
    const q = b.question;
    // update player chip with portrait if available
    const charId = cur?.charId;
    $("mcqPlayerName").textContent = cur?.name || "PLAYER";
    $("mcqPlayerThumb").innerHTML = charId ? `<img src="${encodeURI(ASSETS.ult(charId))}" alt="" />` : "";
    $("mcqTopic").textContent = q.topic;
    $("mcqQ").textContent = q.q;
    $("mcqFeedback").classList.add("hidden");
    const wrap = $("mcqChoices"); wrap.innerHTML = ""; mySelected = -1;
    q.choices.forEach((ch, i) => {
      const btn = document.createElement("button");
      btn.className = "choice";
      btn.innerHTML = `<span class="choice-key">${"ABCD"[i]}</span><span class="choice-txt">${ch}</span>`;
      if (myTurn) btn.addEventListener("click", () => {
        if (inputLocked) return; mySelected = i; lockBriefly(); socket.emit("answer", { choiceIndex: i });
      }); else btn.disabled = true;
      wrap.appendChild(btn);
    });
    if (myTurn) startTimer(q.seconds);
    else { $("mcqTimer").textContent = "00:--"; stopTimer(); }
  } else if (b.phase === "action") {
    mcq.classList.add("hidden");
    if (myTurn) { wait.classList.add("hidden"); cmds.classList.remove("hidden"); buildCommands(cur, b); }
    else { cmds.classList.add("hidden"); setBattleDim(false); wait.classList.remove("hidden"); $("waitText").textContent = (cur?.name||"Opponent") + " is choosing an action…"; }
  } else {
    mcq.classList.add("hidden"); cmds.classList.add("hidden"); setBattleDim(false);
    wait.classList.remove("hidden"); $("waitText").textContent = "Resolving…";
  }
}

// ---- command shards ----
const isOffSkill = (sk) => sk.kind === "atk" || sk.kind === "heavy" || sk.kind === "debuff";
function skillDesc(sk) {
  const k = { atk: "Elemental strike", heavy: "Heavy elemental blow", heal: "Restore ally HP",
    buff: "Empower allies", guard: "Shield (reduce damage)", debuff: "Weaken the enemy", cleanse: "Cleanse debuffs" };
  return `${sk.element} · ${sk.sp} SP · ${k[sk.kind] || "skill"}`;
}

function buildCommands(me, b) {
  const cmds = $("commands");
  cmds.classList.remove("preview-mode");
  setBattleDim(true);
  const syncReady = b.sync[me.team] >= 100;
  const canAtk = myAnswerCorrect;
  const ultSub = !canAtk ? "Need correct answer" : syncReady ? me.ultimate.name : "Team Sync not full";
  cmds.innerHTML = `
    <div class="battle-menu">
      <button class="bm-btn ${canAtk?"":"locked"}" data-cmd="strike" ${canAtk?"":"disabled"}>
        <img src="${BATTLE_IMGS.strike}" alt="STRIKE" decoding="async" draggable="false">
      </button>
      <button class="bm-btn" data-cmd="spell">
        <img src="${BATTLE_IMGS.spell}" alt="SPELL" decoding="async" draggable="false">
      </button>
      <button class="bm-btn" data-cmd="defend">
        <img src="${BATTLE_IMGS.defend}" alt="DEFEND" decoding="async" draggable="false">
      </button>
      <button class="bm-btn" data-cmd="item">
        <img src="${BATTLE_IMGS.item}" alt="ITEM" decoding="async" draggable="false">
      </button>
      <button class="bm-btn" data-cmd="tag">
        <img src="${BATTLE_IMGS.tag}" alt="TAG" decoding="async" draggable="false">
      </button>
      <button class="bm-btn ${syncReady&&canAtk?"":"locked"}" data-cmd="ultimate" ${syncReady&&canAtk?"":"disabled"}>
        <img src="${BATTLE_IMGS.ultimate}" alt="ULTIMATE" decoding="async" draggable="false">
      </button>
    </div>`;
  cmds.querySelectorAll("[data-cmd]").forEach((el) =>
    el.addEventListener("click", () => { SFX.play("select"); onCommand(el.dataset.cmd, me, b); }));
}

function onCommand(cmd, me, b) {
  if (inputLocked) return;
  if (cmd === "strike")  return pickTarget("enemy", me, (uid) => send({ type:"strike", targetId:uid }));
  if (cmd === "defend")  return send({ type:"defend" });
  if (cmd === "tag")     return send({ type:"tag" });
  if (cmd === "ultimate") return send({ type:"ultimate" });
  if (cmd === "spell")   return spellMenu(me, b);
  if (cmd === "item")    return itemMenu(me, b);
}

function spellMenu(me, b) {
  // Show the character's skill-art sheet centered on the arena, with 4 click zones.
  const arena = $("arena");
  const cds = me.cooldowns || {};
  const sheetSrc = encodeURI(ASSETS.skillSheet(me.charId));

  // Remove any old overlay
  const old = document.getElementById("skillSheetOverlay");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.id = "skillSheetOverlay";
  overlay.className = "skill-sheet-overlay";
  overlay.innerHTML = `
    <div class="skill-sheet-box">
      <img class="skill-sheet-img" src="${sheetSrc}" alt="Skills" decoding="async" />
      <div class="skill-sheet-grid">
        ${me.skills.map((s, i) => {
          const off = isOffSkill(s);
          const onCd = (cds[i] || 0) > 0;
          const blocked = onCd || me.sp < s.sp || (off && !myAnswerCorrect);
          // off-skills locked behind a correct answer are simply greyed out (no caption)
          const whyTip = onCd ? `CD: ${cds[i]}t` : me.sp < s.sp ? "Low SP" : "";
          return `<button class="skill-zone ${blocked?"blocked":""}" data-sk="${i}" ${blocked?"disabled":""}>
            ${blocked ? `<span class="skill-zone-lock">${whyTip}</span>` : ""}
          </button>`;
        }).join("")}
      </div>
      <button class="skill-sheet-back" id="skillSheetBack">← BACK</button>
    </div>`;

  arena.appendChild(overlay);

  overlay.querySelectorAll("[data-sk]").forEach((el) => {
    el.addEventListener("click", () => {
      const i = +el.dataset.sk, sk = me.skills[i];
      SFX.play("select");
      spawnEfx(me.uid, "ring", fxColor(sk.element), 0.5);
      overlay.remove();
      showSkillDesc(i, sk, me, b);
    });
  });

  document.getElementById("skillSheetBack").addEventListener("click", () => {
    SFX.play("select");
    overlay.remove();
    buildCommands(me, b);
  });
}

function showSkillDesc(i, sk, me, b) {
  const cmds = $("commands");
  cmds.classList.add("preview-mode");
  const col = ELEMENT_COLORS[sk.element] || "#fff";
  const kindLabel = { atk: "Elemental Strike", heavy: "Heavy Blow", heal: "Healing", buff: "Buff", guard: "Guard / Shield", debuff: "Debuff", cleanse: "Cleanse" };
  const cdText = (sk.cd || 0) > 0 ? ` · Cooldown: ${sk.cd} turn${sk.cd > 1 ? "s" : ""}` : "";
  cmds.innerHTML = `
    <div class="skill-preview" style="border-color:${col}">
      <div class="skill-preview-name" style="color:${col}">${sk.name}</div>
      <div class="skill-preview-meta">${sk.element} · ${kindLabel[sk.kind] || "Skill"} · ${sk.sp} SP${cdText}</div>
      <div class="skill-preview-desc">${sk.desc || ""}</div>
    </div>
    <button class="cmd use-skill" data-use="1" style="border-color:${col}">
      <span class="cmd-name" style="color:${col}">USE ${sk.name.toUpperCase()}</span>
    </button>
    <button class="cmd back" data-back="1"><span class="cmd-name">← BACK</span></button>`;
  cmds.querySelector("[data-use]").addEventListener("click", () => {
    SFX.play("select");
    cmds.classList.remove("preview-mode");
    // single-ally targets (heal, cleanse, single-ally guard) → pick an ally;
    // self/party guards and buffs auto-target → no pick; offensive → pick an enemy.
    if (sk.kind === "heal" || sk.kind === "cleanse" || (sk.kind === "guard" && sk.target !== "party" && sk.target !== "self"))
      pickTarget("ally", me, (uid) => send({ type: "spell", skillIndex: i, targetId: uid }));
    else if (sk.kind === "buff" || sk.kind === "guard")
      send({ type: "spell", skillIndex: i });
    else
      pickTarget("enemy", me, (uid) => send({ type: "spell", skillIndex: i, targetId: uid }));
  });
  cmds.querySelector("[data-back]").addEventListener("click", () => { SFX.play("select"); cmds.classList.remove("preview-mode"); buildCommands(me, b); });
}

function itemMenu(me, b) {
  const cmds = $("commands");
  const owned = Object.entries(me.items).filter(([,n]) => n > 0);
  if (!owned.length) { toast("No items left."); return; }
  cmds.innerHTML = owned.map(([id,n]) => {
    const it = ITEM_BY_ID[id]||{name:id,desc:""};
    return `<button class="cmd item" data-it="${id}">
      <span class="cmd-name">${it.name} ×${n}</span>
      <span class="cmd-sub">${it.desc}</span>
    </button>`;
  }).join("") + `<button class="cmd back" data-back="1"><span class="cmd-name">← BACK</span></button>`;
  cmds.querySelectorAll("[data-it]").forEach((el) => el.addEventListener("click", () => {
    const id = el.dataset.it;
    if (id==="crystal") send({ type:"item", itemId:id });
    else pickTarget("ally", me, (uid) => send({ type:"item", itemId:id, targetId:uid }));
  }));
  cmds.querySelector("[data-back]").addEventListener("click", () => buildCommands(me, b));
}

function pickTarget(side, me, cb) {
  const b = room.battle;
  const valid = b.combatants.filter((c) => side==="enemy" ? (c.team!==me.team&&c.alive) : (c.team===me.team));
  $("turnBanner").textContent = side==="enemy" ? "SELECT A TARGET ▶" : "SELECT A TEAMMATE ▶";
  valid.forEach((c) => {
    const el = fighterEl(c.uid); if (!el) return;
    el.classList.add("target-pick");
    const h = () => { clearTargets(); cb(c.uid); };
    el._th = h; el.addEventListener("click", h);
  });
}
function clearTargets() {
  document.querySelectorAll(".tok.target-pick").forEach((el) => {
    el.classList.remove("target-pick");
    if (el._th) { el.removeEventListener("click", el._th); delete el._th; }
  });
}
function send(action) {
  if (inputLocked) return;
  lockBriefly(); clearTargets();
  socket.emit("action", action);
  $("commands").classList.add("hidden");
  $("waitBox").classList.remove("hidden");
  $("waitText").textContent = "Resolving…";
}
function lockBriefly() { inputLocked = true; setTimeout(() => (inputLocked=false), 700); }

// ---- timer ----
let timerInt = null;
function startTimer(seconds) {
  stopTimer();
  const fill = $("mcqTimerFill");
  fill.classList.remove("run"); fill.style.transition="none"; fill.style.width="100%";
  void fill.offsetWidth;
  fill.style.transition = `width ${seconds}s linear`; fill.style.width = "0%";
  let left = seconds;
  $("mcqTimer").textContent = fmt(left);
  timerInt = setInterval(() => { left--; $("mcqTimer").textContent = fmt(Math.max(0,left)); if (left<=0) stopTimer(); }, 1000);
}
function stopTimer() { clearInterval(timerInt); }
function fmt(s) { return "00:" + String(s).padStart(2,"0"); }

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

// ============================================================
//  SHOP
// ============================================================
function renderShop() {
  refreshCoins();
  const grid = $("shopGrid"); grid.innerHTML = "";
  ITEMS.forEach((it) => {
    const own    = profile.inv[it.id] || 0;
    const afford = profile.coins >= it.price;
    grid.insertAdjacentHTML("beforeend",
      `<div class="shop-item">
        <h4>${it.name}</h4>
        <div class="desc">${it.desc}</div>
        <div class="row"><span class="price">💰 ${it.price}</span><span class="own">owned: ${own}</span></div>
        <div class="row" style="margin-top:6px">
          <button class="buy" data-buy="${it.id}" ${afford?"":"disabled"}>BUY</button>
        </div>
      </div>`);
  });
  grid.querySelectorAll("[data-buy]").forEach((b) => b.addEventListener("click", () => {
    const it = ITEM_BY_ID[b.dataset.buy];
    if (profile.coins < it.price) return;
    profile.coins -= it.price; profile.inv[it.id] = (profile.inv[it.id]||0) + 1;
    saveProfile(profile); renderShop(); toast("Bought " + it.name + "!");
  }));
}

refreshCoins();
