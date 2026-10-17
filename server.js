// ===== Academy Rift — authoritative 4-player (2v2) game server =====
// All combat is resolved here so clients can't cheat; question answers never
// leave the server. Real-time sync over Socket.IO. Empty/disconnected seats
// are driven by bots so a match always continues.
import express from "express";
import compression from "compression";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import os from "os";
import { CHAR_BY_ID, CHARACTERS, ITEM_BY_ID } from "./public/data/characters.js";
import { SYNC_CORRECT, SYNC_TEAM, makeCombatant, resolveAction, addSync, enemiesOf, alliesOf, decStatuses } from "./combat.js";
import { TOPIC_BY_ID } from "./public/data/topics.js";
import { QUESTIONS } from "./questions.js";
import { setupTournaments } from "./tournament.js";
import { setupTotalWar } from "./totalwar.js";
import { createBank, mountHub } from "./bank.js";
import { ANIM_MS } from "./public/data/animTimes.js";
import { PRACTICE_TEAM, PRACTICE_HP, newPractice, nextLesson, practiceQuestion, botPlan, botMove } from "./practice.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(compression({ threshold: 1024 }));   // code, styles and data go out gzipped (pictures and audio are compressed already)
const httpServer = createServer(app);
// battle updates are JSON of a few kB; deflating them cuts what a class of 30 pulls over the school Wi-Fi to about a fifth
const io = new Server(httpServer, { perMessageDeflate: { threshold: 1024 } });
// a last line of defence: log a stray error instead of letting it end every game on the server
process.on("uncaughtException", (e) => console.error("Uncaught error (server kept running):", e));
process.on("unhandledRejection", (e) => console.error("Unhandled rejection (server kept running):", e));
if (process.env.RENDER) app.set("trust proxy", 1);   // real visitor addresses behind Render's proxy

// Question hub (/hub): the teacher's own question sets, with pictures.
const bank = createBank({ builtIn: QUESTIONS, builtInTitle: "Sec 1 Cells (built-in)" });
mountHub(app, bank, { publicDir: join(__dirname, "public") });
// Static assets. The art/audio is heavy (hundreds of MB), so cache media hard in
// the browser and let it refresh in the background (stale-while-revalidate) — this
// makes screen-to-screen navigation and repeat visits load instantly. Code/markup
// is sent with no-cache so it always revalidates and deploys take effect at once.
// The teacher's tournament page lives at /teacher (projector screen).
app.get("/teacher", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(join(__dirname, "public", "teacher.html"));
});
// ---------- the teacher's learning report (/report) ----------
// Reads the tournament the teacher's page is running (its code and host token are in that browser's storage).
app.get("/report", (_req, res) => { res.setHeader("Cache-Control", "no-cache"); res.sendFile(join(__dirname, "public", "report.html")); });
app.get("/api/report", (req, res) => {
  const T = Tour.reportFor(req.query.code, String(req.get("x-host-token") || ""));
  if (!T) return res.status(404).json({ error: "This tournament is not running on the server any more, or this browser is not its teacher." });
  res.json(Tour.learningReport(T));
});
// An MCQ sheet of DIFFERENT questions on the learning objectives the class got wrong most: other questions from the
// chapter sets (or the built-in topics) on the same objective that were not asked in this tournament.
app.post("/api/report/sheet", express.json(), (req, res) => {
  const T = Tour.reportFor(req.body?.code, String(req.get("x-host-token") || ""));
  if (!T) return res.status(404).json({ error: "This tournament is not running on the server any more." });
  const rep = Tour.learningReport(T);
  const asked = new Set(T.learn ? [...T.learn.questions.keys()] : []);
  const perLo = Math.max(1, Math.min(4, +req.body?.perLo || 2)), minPct = Number.isFinite(+req.body?.below) ? Math.max(0, Math.min(100, +req.body.below)) : 80;
  const weak = rep.objectives.filter((o) => o.wrong > 0 && o.pct < minPct).slice(0, 15);
  const items = [], missing = [];
  for (const o of weak) {
    let alt = bank.sameObjective(o.lo, asked);
    if (!alt.length) alt = QUESTIONS.filter((q) => q.lo === o.lo && !asked.has(q.qid)).map((q) => ({ qid: q.qid, q: q.q, choices: q.choices, correct: [q.answer], lo: q.lo, chapter: 0, setTitle: q.topic }));
    if (!alt.length) { missing.push(o); continue; }
    items.push({ lo: o.lo, chapter: o.chapter, pct: o.pct, questions: shuffle(alt).slice(0, perLo).map((q) => ({ q: q.q, choices: q.choices, correct: q.correct, qid: q.qid, setTitle: q.setTitle })) });
  }
  res.json({ items, missing });
});

// Save the sheet as a question set in the hub, so the class can play it as a topic. Built on the server from the
// questions' ids, so only real questions from the game go in.
app.post("/api/report/sheet/save", express.json(), async (req, res) => {
  const T = Tour.reportFor(req.body?.code, String(req.get("x-host-token") || ""));
  if (!T) return res.status(404).json({ error: "This tournament is not running on the server any more." });
  const qids = (Array.isArray(req.body?.qids) ? req.body.qids : []).map(String).slice(0, 120);
  const pool = new Map([...bank.libraryQuestions(), ...QUESTIONS.map((q) => ({ qid: q.qid, q: q.q, choices: q.choices, correct: [q.answer], folder: "sec3g1", explain: q.explain || "" }))].map((q) => [q.qid, q]));
  const qs = qids.map((id) => pool.get(id)).filter(Boolean);
  if (!qs.length) return res.status(400).json({ error: "No questions to save." });
  const folders = {}; qs.forEach((q) => { folders[q.folder] = (folders[q.folder] || 0) + 1; });
  const folder = Object.entries(folders).sort((a, b) => b[1] - a[1])[0][0];
  const day = new Date().toLocaleDateString("en-SG", { day: "numeric", month: "short" });
  try {
    const set = await bank.create({ title: `Review sheet · ${day} · ${qs.length} questions`, folder, questions: qs.map((q) => ({ q: q.q, choices: q.choices, correct: q.correct, explain: q.explain || "" })) });
    res.json({ ok: true, title: set.title, id: set.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// QR code maker for the join link on the projector (served from node_modules, works offline).
app.get("/vendor/qrcode.mjs", (_req, res) => {
  res.type("application/javascript");
  res.sendFile(join(__dirname, "node_modules", "qrcode-generator", "dist", "qrcode.mjs"));
});
// This computer's Wi-Fi addresses, so the teacher page can show a link students
// can actually open when the teacher opened it as "localhost".
app.get("/api/addresses", (_req, res) => {
  const lan = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const ni of list || []) if (ni.family === "IPv4" && !ni.internal) lan.push(ni.address);
  res.json({ lan, port: Number(process.env.PORT || 3100) });
});
app.use(express.static(join(__dirname, "public"), {
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    if (/\.(png|jpe?g|webp|gif|svg|mp3|wav|ogg|woff2?|ttf)$/i.test(filePath))
      res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    else
      res.setHeader("Cache-Control", "no-cache");
  },
}));

// Test speed-up: RIFT_SPEED=20 runs every game timer 20x faster (used only by
// the automated tests; leave it unset for real play).
const SPEED = Math.max(1, Number(process.env.RIFT_SPEED) || 1);
const later = (fn, ms = 0) => setTimeout(fn, ms / SPEED);

// ---- tuning ----
const QUESTION_SECONDS = 21;        // time to answer (was 18; 3 more seconds to read and think)
const ACTION_SECONDS = 12;          // time to pick a move after a correct answer (was 20)
const REVEAL_MS = 1000;             // correct answer stays highlighted before the move panel (was 3000)
const NEXT_TURN_MS = 1300;          // pause after a move before the next turn (was 1700)
const ANIM_MARGIN_MS = 700;          // slack for loading and network delay on top of each cinematic
// How long to wait after a move: strikes, skills and ultimates play a cinematic on every screen (public/data/animTimes.js)
function afterMoveMs(actor, action) {
  const a = ANIM_MS[actor?.charId], t = action?.type;
  if (!a) return NEXT_TURN_MS;
  if (t === "strike") return a.strike + ANIM_MARGIN_MS;
  if (t === "spell") return (a.skills[action.skillIndex] ?? a.strike) + ANIM_MARGIN_MS;
  if (t === "ultimate") return a.ultimate + ANIM_MARGIN_MS;
  return NEXT_TURN_MS;
}
const STEAL_SECONDS = 6;            // closes early once everyone who can steal has tried (was a fixed 10)
// Hints: a player may ask for one on their own question. The price: a right answer
// after a hint is not powered up and fills only half as much Sync; with the "hp"
// cost the player also loses 10% of their max HP straight away.
const HINTS_PER_BATTLE = 2, HINT_HP_COST = 0.10, HINT_SYNC_FACTOR = 0.5;
const BOT_NAMES = ["Akira", "Mei", "Sora", "Riku", "Yuki", "Kai"];
// a bot name nobody in the room already has (players can be called Mei too)
function botName(room) {
  const taken = new Set(room.players.map((p) => p.name.replace(/ \(Bot\)$/, "").toLowerCase()));
  const free = BOT_NAMES.filter((n) => !taken.has(n.toLowerCase()));
  return rand(free.length ? free : BOT_NAMES) + " (Bot)";
}

const rooms = new Map();      // code -> room
const socketRoom = new Map(); // socket.id -> code

const rand = (a) => a[Math.floor(Math.random() * a.length)];

// Fisher-Yates shuffle (returns a new array).
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Every built-in question gets a stable id and, as its learning objective, its topic's name (the chapter sets carry
// the objectives from the AO map). The learning report and the "mistakes come back" queue key on these.
QUESTIONS.forEach((q, i) => { q.qid ||= `builtin:${i}`; q.lo ||= TOPIC_BY_ID[q.topicId]?.name || "Cells"; q.chapter ||= 0; });

// What a battle tests: one or more parts joined by commas. A part is a built-in
// topic ("micro", "parts"…, or "mixed" for all of them) or one of the teacher's
// own sets from the question hub ("set:<id>"). Everything chosen is tested together.
const MAX_TOPIC_PARTS = 20;
function topicParts(value) {
  const list = Array.isArray(value) ? value.join(",") : String(value || "");
  return [...new Set(list.split(",").map((p) => p.trim()).filter(Boolean))];
}
// Keep only parts that exist; null if nothing usable was chosen.
function normalizeTopics(value) {
  let parts = topicParts(value).filter((p) => TOPIC_BY_ID[p] || bank.isSetTopic(p)).slice(0, MAX_TOPIC_PARTS);
  if (parts.includes("mixed")) parts = ["mixed", ...parts.filter((p) => p.startsWith("set:"))];   // "mixed" already has every built-in topic
  return parts.length ? parts.join(",") : null;
}
function topicPartsInfo(value) {
  return topicParts(value).map((p) => p.startsWith("set:")
    ? { id: p, title: bank.topicName(p) || "A deleted set", own: true, folder: bank.topicFolder(p) }
    : TOPIC_BY_ID[p] ? { id: p, title: TOPIC_BY_ID[p].name, icon: TOPIC_BY_ID[p].icon } : null).filter(Boolean);
}
function topicLabel(value) {
  const parts = topicPartsInfo(value);
  if (!parts.length) return TOPIC_BY_ID.mixed.name;
  return parts.length <= 2 ? parts.map((p) => p.title).join(" + ") : `${parts[0].title} + ${parts.length - 1} more`;
}
function filterQuestions(topicId) {
  const pool = [];
  for (const p of topicParts(topicId)) {
    if (p === "mixed") pool.push(...QUESTIONS);
    else if (p.startsWith("set:")) pool.push(...(bank.gameQuestions(p) || []));
    else pool.push(...QUESTIONS.filter((q) => q.topicId === p));
  }
  const unique = [...new Set(pool)];
  return unique.length ? unique : QUESTIONS;   // everything chosen was deleted or empty: use all built-in questions
}

// Per-battle question deck: draw without replacement from the chosen topic pool,
// reshuffle when exhausted, so every question is seen once before any repeats and
// the order varies each match.
// Interleaved: when several topics or chapters are chosen, the deck deals one from each in turn (in a shuffled
// order each lap) instead of letting a shuffle bunch one chapter together. Mixed practice is remembered better.
function dealDeck(pool) {
  const groups = new Map();
  for (const q of pool) { const k = q.topicId || "x"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(q); }
  if (groups.size < 2) return shuffle(pool);
  const lists = [...groups.values()].map((g) => shuffle(g)), out = [];
  while (lists.some((l) => l.length)) for (const l of shuffle(lists)) if (l.length) out.push(l.pop());
  return out;
}
// Mistakes come back: a question a player got wrong (on their turn, answering along, or stealing) is asked to them
// again on their own turn a few questions later, and anything still wrong carries into their next tournament battle.
const RETRY_GAP = 3, RETRY_MAX = 6;
// A question comes back once per battle (still wrong after that, it is in the Rift Report and carries to the next
// battle), and at most every other turn of that player, so the battle keeps bringing new questions too.
function queueRetry(b, uid, q) {
  if (!q || b.practice || b.combatants[uid]?.bot) return;
  const list = (b.retry[uid] ||= []), done = (b.retried[uid] ||= new Set());
  if (done.has(q) || list.some((r) => r.q === q) || list.length >= RETRY_MAX) return;
  list.push({ q, due: (b.asked || 0) + RETRY_GAP });
}
function nextQuestion(b) {
  const lastWasRetry = b.lastRetry?.[b.current];
  b.qRetry = false;
  if (b.practice) return practiceQuestion(b.practice, !b.combatants[b.current]?.bot);
  const list = b.retry?.[b.current];
  const i = list && !lastWasRetry ? list.findIndex((r) => r.due <= (b.asked || 0)) : -1;
  (b.lastRetry ||= {})[b.current] = i >= 0;
  if (i >= 0) { b.qRetry = true; const q = list.splice(i, 1)[0].q; (b.retried[b.current] ||= new Set()).add(q); return q; }
  const pool = b.qPool && b.qPool.length ? b.qPool : QUESTIONS;
  if (!b.qDeck || b.qPos >= b.qDeck.length) { b.qDeck = dealDeck(pool); b.qPos = 0; }
  return b.qDeck[b.qPos++];
}

function makeRoomCode() {
  let c;
  do { c = Math.random().toString(36).substring(2, 6).toUpperCase(); } while (rooms.has(c) || Tour.has(c));
  return c;
}

// team with a free slot (max 2 each), preferring balance
function pickTeam(room) {
  const t0 = room.players.filter((p) => p.team === 0).length;
  const t1 = room.players.filter((p) => p.team === 1).length;
  if (t0 <= t1 && t0 < 2) return 0;
  if (t1 < 2) return 1;
  return t0 < 2 ? 0 : 1;
}

function publicRoom(room) {
  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    topicId: room.topicId || "mixed",
    topicName: topicLabel(room.topicId),
    topicParts: topicPartsInfo(room.topicId),
    tournament: room.tournament || null,
    practice: room.practice ? { lesson: room.practice.lesson, gate: room.practice.gate } : null,
    serverNow: Date.now(),          // lets clients correct for a wrong device clock
    players: room.players.map((p) => ({
      id: p.id, name: p.name, team: p.team, character: p.character, ready: p.ready, bot: p.bot,
    })),
    battle: room.battle ? publicBattle(room.battle) : null,
  };
}

// Battle backdrops rotate through the stage list (public/assets/stages). Starts at a
// random stage so different classes don't all open on the same scene.
const STAGE_COUNT = 6;
let stageTurn = Math.floor(Math.random() * STAGE_COUNT);
function nextStage() { stageTurn = (stageTurn + 1) % STAGE_COUNT; return stageTurn; }

function publicBattle(b) {
  return {
    stage: b.stage ?? 0,
    stageLevel: b.stageLevel || 1,
    streak: { 0: b.streak?.[0] || 0, 1: b.streak?.[1] || 0 },
    sync: { 0: Math.round(b.sync[0]), 1: Math.round(b.sync[1]) },
    current: b.current,
    stealOf: b.stealOf || null,
    stealActor: b.stealActor || null,
    currentName: b.combatants[b.current]?.name,
    currentTeam: b.combatants[b.current]?.team,
    phase: b.phase, whyUid: b.why?.sid || null,
    msLeft: b.endsAt ? Math.max(0, b.endsAt - Date.now()) : null,   // battle time limit
    question: b.phase ? b.publicQuestion : null,
    combatants: b.order.map((uid) => {
      const c = b.combatants[uid];
      return {
        uid: c.uid, name: c.name, team: c.team, bot: c.bot,
        charId: c.charId, charName: c.charName, element: c.element, role: c.role,
        weakTo: c.weakTo, resists: c.resists,
        hp: Math.max(0, Math.round(c.hp)), maxHp: c.maxHp,
        sp: Math.max(0, Math.round(c.sp)), maxSp: c.maxSp,
        alive: c.alive, defending: c.defending, shield: c.shield,
        cooldowns: { ...c.cooldowns },
        atkDown: c.atkDownTurns > 0, defDown: c.defDownTurns > 0,
        accDown: c.accDownTurns > 0, timerDown: c.timerDownTurns > 0,
        defUp: c.defUpTurns > 0, stunned: !!c.stunned, hintsLeft: c.hintsLeft ?? 0,
        skills: c.skills, ultimate: c.ultimate, items: c.items,
      };
    }),
  };
}

function broadcast(room) { io.to(room.code).emit("room", publicRoom(room)); }

// ---------- class tournaments ----------
const Tour = setupTournaments({
  io, rooms, bank, CHARACTERS, publicRoom, normalizeTopics, topicLabel, topicPartsInfo,
  isRoomCode: (c) => rooms.has(c),
  setSocketRoom: (sid, code) => socketRoom.set(sid, code),
  startBattle: (room) => beginBattle(room),
  timeUp: (room) => timeUp(room),
  later, SPEED,
});

// ---------- Total War (strategy mode, separate from the Arena) ----------
const TW = setupTotalWar({
  io, bank, CHARACTERS, normalizeTopics, topicLabel, filterQuestions,
  isRoomCode: (c) => rooms.has(c) || Tour.has(c),
  SPEED,
});

// A socket's player id: tournament students keep one id across reconnects;
// everyone else is known by their socket id.
const pidOf = (socket) => socket.data.pid || socket.id;

// ---------- lobby ----------
io.on("connection", (socket) => {
  Tour.bind(socket);
  TW.bind(socket);

  // ---- the practice fight: one student, three bots, a coach on screen ----
  socket.on("startPractice", ({ name } = {}) => {
    if (socket.data.pid) return socket.emit("errorMsg", "You are in a class tournament. Practise after it ends.");
    dropPractice(socket);
    leaveLobby(socket);
    const code = makeRoomCode();
    const nm = String(name || "").trim().slice(0, 14) || "Trainee";
    const p = newPractice(socket.id);
    const room = {
      code, status: "lobby", hostId: socket.id, battle: null, topicId: "mixed", practice: p,
      players: [
        { id: socket.id, name: nm, team: 0, character: PRACTICE_TEAM.student, ready: true, bot: false },
        { id: p.rivalA, name: "Rival (Bot)", team: 1, character: PRACTICE_TEAM.rivals[0], ready: true, bot: true },
        { id: p.partner, name: "Coach (Bot)", team: 0, character: PRACTICE_TEAM.partner, ready: true, bot: true },
        { id: p.rivalB, name: "Rival (Bot)", team: 1, character: PRACTICE_TEAM.rivals[1], ready: true, bot: true },
      ],
    };
    rooms.set(code, room);
    socketRoom.set(socket.id, code);
    socket.join(code);
    socket.emit("joined", { code, you: socket.id });
    beginBattle(room);
  });
  // the student tapped NEXT on the coach
  socket.on("coachNext", () => {
    const room = myRoom(), b = room?.battle;
    if (!room?.practice || !b?.coachWait) return;
    const go = b.coachWait; b.coachWait = null; room.practice.gate = null;
    broadcast(room);
    go();
  });
  socket.on("leavePractice", () => dropPractice(socket));

  socket.on("createRoom", ({ name }) => {
    dropPractice(socket);
    const code = makeRoomCode();
    const room = { code, status: "lobby", hostId: socket.id, players: [], battle: null, topicId: "mixed" };
    room.players.push({ id: socket.id, name: name || "Player", team: 0, character: null, ready: false, bot: false });
    rooms.set(code, room);
    socketRoom.set(socket.id, code);
    socket.join(code);
    socket.emit("joined", { code, you: socket.id });
    broadcast(room);
  });

  socket.on("joinRoom", ({ name, code, token }) => {
    dropPractice(socket);
    code = (code || "").toUpperCase();
    if (Tour.has(code)) return Tour.join(socket, { code, name, token });
    const room = rooms.get(code);
    if (!room) return socket.emit("errorMsg", "Room not found.");
    if (room.status !== "lobby") return socket.emit("errorMsg", "That match has already started.");
    const humans = room.players.filter((p) => !p.bot).length;
    if (humans >= 4) return socket.emit("errorMsg", "Room is full (4 players).");
    room.players.push({ id: socket.id, name: name || "Player", team: pickTeam(room), character: null, ready: false, bot: false });
    socketRoom.set(socket.id, code);
    socket.join(code);
    socket.emit("joined", { code, you: socket.id });
    broadcast(room);
  });

  const myRoom = () => rooms.get(socketRoom.get(socket.id));
  const me = (room) => room?.players.find((p) => p.id === socket.id);

  socket.on("switchTeam", () => {
    const room = myRoom(); if (!room || room.status !== "lobby") return;
    const p = me(room); if (!p) return;
    const other = p.team === 0 ? 1 : 0;
    if (room.players.filter((q) => q.team === other).length < 2) { p.team = other; p.ready = false; broadcast(room); }
  });

  socket.on("setTopic", ({ topicId }) => {
    const room = myRoom(); if (!room || room.status !== "lobby" || room.hostId !== socket.id) return;
    const v = normalizeTopics(topicId); if (!v) return;
    room.topicId = v; broadcast(room);
  });

  // The teacher's question sets from the hub, for the lobby's topic picker.
  socket.on("getSets", (cb) => { if (typeof cb === "function") cb(bank.playableSets()); });

  socket.on("pickCharacter", ({ charId }) => {
    const room = myRoom(); if (!room || room.status !== "lobby") return;
    const p = me(room); if (!p || !CHAR_BY_ID[charId]) return;
    p.character = charId; broadcast(room);
  });

  socket.on("setReady", ({ ready }) => {
    const room = myRoom(); if (!room || room.status !== "lobby") return;
    const p = me(room); if (!p) return;
    p.ready = !!ready && !!p.character; broadcast(room);
  });

  socket.on("addBot", ({ team }) => {
    const room = myRoom(); if (!room || room.status !== "lobby" || room.hostId !== socket.id) return;
    if (room.players.filter((p) => p.team === team).length >= 2) return;
    const id = "bot_" + Math.random().toString(36).slice(2, 8);
    room.players.push({
      id, name: botName(room), team, bot: true, ready: true,
      character: rand(CHARACTERS).id,
    });
    broadcast(room);
  });

  socket.on("removePlayer", ({ id }) => {
    const room = myRoom(); if (!room || room.status !== "lobby" || room.hostId !== socket.id) return;
    const idx = room.players.findIndex((p) => p.id === id && p.bot);
    if (idx >= 0) { room.players.splice(idx, 1); broadcast(room); }
  });

  socket.on("startMatch", () => {
    const room = myRoom(); if (!room || room.hostId !== socket.id || room.status !== "lobby") return;
    const t0 = room.players.filter((p) => p.team === 0);
    const t1 = room.players.filter((p) => p.team === 1);
    if (t0.length !== 2 || t1.length !== 2) return socket.emit("errorMsg", "Need exactly 2 players per team (add bots to fill).");
    if (!room.players.every((p) => p.character)) return socket.emit("errorMsg", "Everyone must pick a character.");
    beginBattle(room);
  });

  socket.on("answer", ({ choiceIndex } = {}) => handleAnswer(myRoom(), pidOf(socket), choiceIndex));
  socket.on("steal",  ({ choiceIndex } = {}) => handleSteal(myRoom(), pidOf(socket), choiceIndex));
  socket.on("useHint", () => handleHint(myRoom(), pidOf(socket)));
  socket.on("shadowAnswer", ({ choiceIndex } = {}) => handleShadow(myRoom(), pidOf(socket), choiceIndex));
  socket.on("action", (action) => handleAction(myRoom(), pidOf(socket), action));
  socket.on("whyAnswer", ({ index } = {}) => finishWhy(myRoom(), pidOf(socket), Number.isInteger(index) ? index : -1));

  socket.on("rematch", () => {
    const room = myRoom(); if (!room || room.status !== "finished" || room.hostId !== socket.id) return;
    room.players.forEach((p) => { if (!p.bot) p.ready = false; });
    room.status = "lobby"; room.battle = null;
    broadcast(room);
  });

  socket.on("disconnect", () => {
    if (dropPractice(socket)) return;
    const stale = Tour.onDisconnect(socket);   // also marks tournament students offline
    const room = myRoom(); socketRoom.delete(socket.id);
    if (!room || stale) return;
    const pid = pidOf(socket);
    if (room.status === "lobby") {
      room.players = room.players.filter((p) => p.id !== socket.id);
      if (room.players.filter((p) => !p.bot).length === 0) { rooms.delete(room.code); return; }
      if (room.hostId === socket.id) room.hostId = room.players.find((p) => !p.bot)?.id;
      broadcast(room);
    } else if (room.battle) {
      if (room.status !== "battle") return;
      // convert the seat to a bot so the battle keeps going (a tournament student
      // who reconnects takes the seat back)
      const c = room.battle.combatants[pid];
      if (!c || c.bot) return;
      c.bot = true;
      io.to(room.code).emit("toast", `${c.name} disconnected — a bot is playing for them.`);
      if (room.hostId === pid) room.hostId = room.players.find((p) => !p.bot && p.id !== pid)?.id || room.hostId;
      if (room.battle.current === pid && room.battle.phase === "question") { clearTimeout(room.battle.timers.q); botTurn(room); }
      else if (room.battle.current === pid && room.battle.phase === "action") { clearTimeout(room.battle.timers.a); botAction(room); }
      broadcast(room);
    }
  });
});

// A practice room ends when the student leaves it, starts another or disconnects.
function dropPractice(socket) {
  const code = socketRoom.get(socket.id), room = rooms.get(code);
  if (!room?.practice) return false;
  if (room.battle) clearTimers(room.battle);
  room.status = "finished";
  rooms.delete(code); socketRoom.delete(socket.id); socket.leave(code);
  return true;
}
// Leaving a waiting room without closing the page (for example to go and practise).
function leaveLobby(socket) {
  const room = rooms.get(socketRoom.get(socket.id));
  if (!room || room.practice || room.tournament || room.status !== "lobby") return;
  room.players = room.players.filter((p) => p.id !== socket.id);
  socket.leave(room.code); socketRoom.delete(socket.id);
  if (!room.players.some((p) => !p.bot)) { rooms.delete(room.code); return; }
  if (room.hostId === socket.id) room.hostId = room.players.find((p) => !p.bot)?.id;
  broadcast(room);
}

// Practice: hold the fight until the student taps NEXT on the coach. Each pause
// happens once per practice fight.
function practiceGate(room, key, go) {
  const p = room.practice, b = room.battle;
  if (!p || !b || p.seen[key]) return go();
  p.seen[key] = true; p.gate = key;
  b.coachWait = () => { if (room.status === "battle") go(); };
  broadcast(room);
}

// ---------- battle setup ----------
function beginBattle(room) {
  const make = (p) => makeCombatant(CHAR_BY_ID[p.character] || rand(CHARACTERS), p, room.settings?.hints ?? HINTS_PER_BATTLE);
  // what each student packed at Auntie's shop: items join the battle's own (Study Notes add a hint straight away)
  const make0 = make;
  const makeWithBag = (p) => { const c = make0(p); const bag = room.bags?.[p.id];
    if (bag) for (const [id, n] of Object.entries(bag)) { if (!(n > 0) || !ITEM_BY_ID[id]) continue;
      if (ITEM_BY_ID[id].passive) { if (id === "notes") c.hintsLeft += n; } else c.items[id] = (c.items[id] || 0) + n; }
    return c; };
  const t0 = room.players.filter((p) => p.team === 0).map(makeWithBag);
  const t1 = room.players.filter((p) => p.team === 1).map(makeWithBag);
  if (room.practice) for (const c of t1) if (PRACTICE_HP[c.charId]) c.maxHp = c.hp = PRACTICE_HP[c.charId];
  const combatants = {};
  [...t0, ...t1].forEach((c) => (combatants[c.uid] = c));
  const order = [t0[0].uid, t1[0].uid, t0[1].uid, t1[1].uid];

  const qPool = filterQuestions(room.topicId);
  room.battle = {
    combatants, order, ptr: 0, current: null, phase: null,
    stage: nextStage(),                      // battle backdrop, rotated so back-to-back battles differ
    sync: { 0: 0, 1: 0 }, streak: { 0: 0, 1: 0 }, publicQuestion: null, q: null,
    stageLevel: 1,                           // the stage breaks apart a step with every Ultimate (1 to 5)
    topicId: room.topicId || "mixed",
    qPool, qDeck: dealDeck(qPool), qPos: 0,  // topic-filtered deck, drawn without replacement, topics interleaved
    correctCount: {}, review: {}, timers: {},
    retry: {}, retried: {}, asked: 0, shadow: {},   // mistakes to ask again (and those already asked again), questions so far, answers-along
    // tournament battles carry the teacher's settings; normal rooms use the defaults
    qSeconds: room.settings?.questionSeconds ?? QUESTION_SECONDS,
    stealSeconds: room.settings?.stealSeconds ?? STEAL_SECONDS,
    hintCost: room.settings?.hintCost === "hp" ? "hp" : "weaker", hintCount: {},
    endsAt: null, limitTimer: null,
    practice: room.practice || null,
  };
  // a tournament hands over each student's questions still wrong from earlier battles: they come back early on
  if (room.retrySeed) {
    const byQid = new Map(qPool.map((q) => [q.qid, q]));
    for (const [pid, qids] of Object.entries(room.retrySeed)) {
      if (!combatants[pid]) continue;
      room.battle.retry[pid] = qids.map((id) => byQid.get(id)).filter(Boolean).slice(0, RETRY_MAX).map((q, k) => ({ q, due: 1 + k * 2 }));
      (room.battle.carried ||= {})[pid] = new Set(qids);    // wrong in an earlier battle: right this time counts as put right
    }
  }
  const limitMin = room.settings?.timeLimitMin || 0;
  if (limitMin > 0) {
    room.battle.endsAt = Date.now() + (1200 + limitMin * 60000) / SPEED;
    room.battle.limitTimer = later(() => timeUp(room), 1200 + limitMin * 60000);
  }
  room.status = "battle";
  io.to(room.code).emit("battleStart");
  broadcast(room);
  if (room.practice) later(() => { if (room.status === "battle") practiceGate(room, "intro", () => advance(room)); }, 900);
  else later(() => advance(room), 1200);
}

function aliveCount(b, team) {
  return b.order.filter((u) => b.combatants[u].team === team && b.combatants[u].alive).length;
}
function clearTimers(b) { Object.values(b.timers).forEach(clearTimeout); b.timers = {}; }

function advance(room) {
  const b = room.battle; if (!b || room.status !== "battle") return;
  if (aliveCount(b, 0) === 0 || aliveCount(b, 1) === 0) return endBattle(room);

  // Find the next alive combatant, SKIPPING any that are stunned (consume the stun).
  let tries = 0, uid, c;
  while (tries <= b.order.length * 2) {
    uid = b.order[b.ptr]; b.ptr = (b.ptr + 1) % b.order.length; tries++;
    c = b.combatants[uid];
    if (!c.alive) continue;
    if (c.stunned) {                                 // stunned → skip this turn
      c.stunned = false;
      decStatuses(c);                                // their effects still tick down
      io.to(room.code).emit("toast", `${c.name} is stunned and skips a turn!`);
      io.to(room.code).emit("actionResult", { actor: uid, action: "stunned", name: "Stunned", events: [{ kind: "stun-skip", target: uid }] });
      continue;
    }
    break;
  }
  b.current = uid;
  c.defending = false; // guard lasts only until your own next turn
  // Decrement skill cooldowns + status effect durations for this combatant
  for (const key of Object.keys(c.cooldowns)) {
    c.cooldowns[key]--;
    if (c.cooldowns[key] <= 0) delete c.cooldowns[key];
  }
  decStatuses(c);
  startQuestion(room);
}

function startQuestion(room) {
  const b = room.battle; const c = b.combatants[b.current];
  const p = room.practice;
  if (p && !c.bot) {                         // practice: the student's next lesson
    const lesson = nextLesson(p);
    if (lesson === "ult") b.sync[c.team] = 100;   // the Ultimate lesson needs a full gauge
  }
  const q = nextQuestion(b);
  b.q = q;
  // A timer debuff (Crystal Lock / Static Pulse / Shadow Bind) shaves 4s off this answer.
  b.asked = (b.asked || 0) + 1;
  // Reading time: every question shows on its own for a few seconds before the answers appear, so everyone reads it
  // properly and thinks of the answer before they can recognise it. The clock gets those seconds back.
  const recall = !p ? RECALL_SECONDS : 0;
  const seconds = Math.max(6, (b.qSeconds ?? QUESTION_SECONDS) - (c.timerDownTurns > 0 ? 4 : 0)) + recall;
  // practice: hints are only offered from the hint lesson on
  const hint = p && (p.lesson === "strike" || p.lesson === "skills" || c.bot) ? null : hintKind(q);
  b.publicQuestion = {
    q: q.q, choices: q.choices, topic: q.topic, bloom: q.bloom, image: q.image || null, seconds, startedAt: Date.now(),
    hint, hintCost: b.hintCost, hinted: false,   // the hint text itself is only sent to the player who asks
    untimed: !!p,                                // practice: no clock on anything
    recall, retry: !!b.qRetry,                   // answers hidden at first · a question this player got wrong before
  };
  b.shadow = {};
  Object.values(b.combatants).forEach((x) => { x._hinted = false; });   // a hint only counts for the question it was used on
  b.phase = "question";
  c._correct = false;
  broadcast(room);
  if (c.bot) {
    if (p) {                                 // practice: scripted, and sometimes the coach explains first
      b.botPlan = botPlan(p, c.uid);
      const think = () => { b.timers.bot = later(() => botTurn(room), 2200 + Math.floor(Math.random() * 800)); };
      if (b.botPlan.gate) practiceGate(room, b.botPlan.gate, think); else think();
      return;
    }
    // Bot takes 3–6 seconds to "think", giving human players time to read the question
    const thinkMs = (b.publicQuestion.recall || 0) * 1000 + 2000 + Math.floor(Math.random() * 3001);
    b.timers.bot = later(() => botTurn(room), thinkMs);
    openShadow(room);
    return;
  }
  // a question coming back: remind this player what they picked last time, and what was wrong with it
  io.to(c.uid).emit("yourQuestion", { question: b.publicQuestion, lastPick: b.qRetry ? lastPickFor(room, c.uid, q) : null });
  if (!p) b.timers.q = later(() => resolveAnswer(room, -1), seconds * 1000);
  openShadow(room);
}

// What a player picked the last time they got this question wrong (this battle, or a battle earlier in the
// tournament), with the misconception note for that option.
function lastPickFor(room, uid, q) {
  const k = q.qid || q.q;
  const prev = [...(room.battle.review?.[uid] || [])].reverse().find((r) => (r.qid || r.q) === k && !r.correct);
  const chosen = prev ? prev.chosen : room.retryPicks?.[uid]?.[q.qid];
  if (!Number.isInteger(chosen)) return null;
  if (chosen < 0) return { chosen: -1 };
  return { chosen, text: q.choices[chosen] || "", note: q.notes?.[chosen] || "" };
}

// ---------- answering along ----------
// While one player answers, every other student in the battle (knocked-out ones too) answers the same question on
// their own screen. Nobody is told if they were right until the question is over, so it never gives a steal away.
// A right answer adds a little Sync for their team; a wrong one comes back to them later.
const SHADOW_SYNC = 2, RECALL_SECONDS = 4;
function openShadow(room) {
  const b = room.battle; if (!b || b.practice) return;
  for (const c of Object.values(b.combatants))
    if (!c.bot && c.uid !== b.current) io.to(c.uid).emit("shadowOpen", { question: b.publicQuestion });
}
function handleShadow(room, sid, choiceIndex) {
  const b = room?.battle;
  if (!b || b.practice || b.phase !== "question" || sid === b.current || reading(b)) return;
  const c = b.combatants[sid];
  if (!c || c.bot || b.shadow[sid] || !Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= b.q.choices.length) return;
  const correct = isRight(b.q, choiceIndex);
  b.shadow[sid] = { choiceIndex, correct };
  recordReview(b, sid, b.q, choiceIndex, correct, "along");
  if (correct) addSync(room, c.team, SHADOW_SYNC); else queueRetry(b, sid, b.q);
  io.to(sid).emit("shadowLocked", { choiceIndex, startedAt: b.publicQuestion?.startedAt });
}

// What kind of hint a question has: the teacher's own hint text, or else
// "fifty" (two wrong answers are taken away) when there are enough wrong answers.
function hintKind(q) {
  if (q.hint && String(q.hint).trim()) return "text";
  const wrong = q.choices.map((_, i) => i).filter((i) => !isRight(q, i));
  return q.choices.length >= 3 && wrong.length >= 2 ? "fifty" : null;
}

function handleHint(room, sid) {
  const b = room?.battle;
  if (!b || b.phase !== "question" || b.current !== sid) return;
  const c = b.combatants[sid];
  if (!c || c.bot || c._hinted || !(c.hintsLeft > 0) || !b.publicQuestion?.hint) return;
  c._hinted = true; c.hintsLeft--;
  b.hintCount[sid] = (b.hintCount[sid] || 0) + 1;
  let payload;
  if (b.publicQuestion.hint === "text") payload = { kind: "text", text: b.q.hint };
  else {
    const wrong = shuffle(b.q.choices.map((_, i) => i).filter((i) => !isRight(b.q, i)));
    // leave one wrong answer when there are four choices, so it becomes a 50:50
    payload = { kind: "fifty", removed: wrong.slice(0, Math.min(2, wrong.length - 1)) };   // always leave one wrong answer
  }
  let hpCost = 0;
  if (b.hintCost === "hp") {
    hpCost = Math.min(Math.round(c.maxHp * HINT_HP_COST), Math.max(0, c.hp - 1));   // a hint never knocks you out
    c.hp -= hpCost;
  }
  b.publicQuestion = { ...b.publicQuestion, hinted: true };
  io.to(sid).emit("hint", { ...payload, startedAt: b.publicQuestion.startedAt });
  io.to(room.code).emit("hintUsed", { uid: sid, hpCost });
  broadcast(room);
}

// no answers while the question is still being read (the choices are not on screen yet)
const reading = (b) => !!b.publicQuestion?.recall && Date.now() < b.publicQuestion.startedAt + (b.publicQuestion.recall * 1000) / SPEED - 250;
function handleAnswer(room, sid, choiceIndex) {
  const b = room?.battle;
  if (!b || b.current !== sid || b.phase !== "question" || reading(b)) return;
  clearTimeout(b.timers.q);
  resolveAnswer(room, choiceIndex);
}

// Shared answer grading: tracks correctness, fills team sync, and rewards a
// team whose BOTH members answered correctly ("in sync") with a bonus.
function gradeAnswer(room, c, correct) {
  const b = room.battle;
  c._correct = correct;
  c._answered = true;
  b.correctCount[c.uid] = (b.correctCount[c.uid] || 0) + (correct ? 1 : 0);
  teamStreak(room, c.team, correct, c._hinted);
}

// The Sync gauge only fills when a team answers correctly IN A ROW: the first right answer starts the streak,
// every right answer after it adds to the gauge, and a wrong answer (or a missed steal) ends the streak.
const STREAK_SYNC = [0, 0, 20, 25, 30];          // gain for the 1st, 2nd, 3rd, 4th (and later) right answer in a row
function teamStreak(room, team, correct, hinted) {
  const b = room.battle; if (!b.streak) b.streak = { 0: 0, 1: 0 };
  if (!correct) { b.streak[team] = 0; return; }
  const n = ++b.streak[team];
  let gain = STREAK_SYNC[Math.min(n, STREAK_SYNC.length - 1)];
  if (hinted) gain = Math.round(gain * HINT_SYNC_FACTOR);
  if (gain > 0) { addSync(room, team, gain); io.to(room.code).emit("teamSync", { team, amount: gain, streak: n }); }
}

// Record a player's answer attempt for the end-of-match learning recap (humans only).
// how: "turn" (their own question), "along" (answering along with someone else's), "steal"
function recordReview(b, uid, q, chosen, correct, how = "turn") {
  if (!b.review) b.review = {};
  if (correct && q.why) (b.lastWhyQ ||= {})[uid] = q;
  (b.review[uid] ||= []).push({
    q: q.q, choices: q.choices, answer: q.answer, answers: rightAnswers(q), chosen, image: q.image || null,
    hinted: how === "turn" && !!b.combatants[uid]?._hinted && b.current === uid,
    correct, explain: q.explain, topic: q.topic, bloom: q.bloom, note: !correct && chosen >= 0 ? q.notes?.[chosen] || "" : "",
    qid: q.qid || null, lo: q.lo || q.topic || "", ao: q.ao || "", chapter: q.chapter || 0, how,
  });
}

// Hub questions can have more than one right answer.
const rightAnswers = (q) => (Array.isArray(q.answers) && q.answers.length ? q.answers : [q.answer]);
const isRight = (q, i) => Number.isInteger(i) && rightAnswers(q).includes(i);

function resolveAnswer(room, choiceIndex) {
  const b = room.battle; const c = b.combatants[b.current];
  const correct = isRight(b.q, choiceIndex);
  // practice: a wrong answer can be tried again (the coach explains that a real
  // battle would make you guard instead)
  if (room.practice && !c.bot && !correct) { io.to(c.uid).emit("practiceRetry", { choiceIndex }); return; }
  gradeAnswer(room, c, correct);
  if (!c.bot) { recordReview(b, c.uid, b.q, choiceIndex, correct); if (!correct) queueRetry(b, c.uid, b.q); }
  // After a wrong answer the right one stays secret while the others can still
  // steal the question; it is revealed when the steal window closes.
  const stealing = !correct && (b.stealSeconds ?? STEAL_SECONDS) > 0 && stealersOf(b, c.uid).length > 0;
  b.revealPending = stealing;
  io.to(room.code).emit("answerResult", stealing ? { uid: c.uid, correct, hinted: !!c._hinted } : {
    uid: c.uid, correct, hinted: !!c._hinted, correctIndex: b.q.answer, correctAll: rightAnswers(b.q), explain: b.q.explain,
  });

  // Wrong answer → open a steal window (works for both human and bot wrong answers).
  if (!correct) {
    const stealSecs = b.stealSeconds ?? STEAL_SECONDS;
    b.phase = "steal";
    b.stealOf = c.uid;
    b.stealAnswered = new Set();
    // steals switched off, or nobody else can steal (everyone else is a bot or knocked out)
    if (stealSecs <= 0 || !stealersOf(b, c.uid).length) return closeSteal(room);
    broadcast(room);
    io.to(room.code).emit("stealOpen", {
      originalUid: c.uid, originalName: c.name, seconds: stealSecs, untimed: !!room.practice,
    });
    if (!room.practice) b.timers.steal = later(() => closeSteal(room), stealSecs * 1000);
    return;
  }

  // Correct answer — hold on "reveal" briefly so everyone sees the highlighted
  // correct choice, then the player picks a move.
  b.phase = "reveal";
  broadcast(room);
  b.timers.reveal = later(() => {
    if (!room.battle || room.battle.phase !== "reveal") return;
    b.phase = "action";
    broadcast(room);
    if (c.bot) { b.timers.bot = later(() => botAction(room), 200); return; }
    io.to(c.uid).emit("chooseAction", { syncReady: b.sync[c.team] >= 100, correct: true });
    if (!room.practice) b.timers.a = later(() => handleAction(room, c.uid, { type: "strike" }, true), ACTION_SECONDS * 1000);
  }, REVEAL_MS);
}

// Players who could still steal this turn: alive, human, and not the one who answered wrong.
function stealersOf(b, originalUid) {
  return Object.values(b.combatants).filter((x) => x.alive && !x.bot && x.uid !== originalUid);
}

function handleSteal(room, sid, choiceIndex) {
  const b = room?.battle;
  if (!b || b.phase !== "steal") return;
  if (sid === b.stealOf) return;
  if (!b.stealAnswered) b.stealAnswered = new Set();
  if (b.stealAnswered.has(sid)) return;
  const stealer = b.combatants[sid];
  if (!stealer || !stealer.alive) return;
  const correct = isRight(b.q, choiceIndex);
  // practice: a missed steal can be tried again
  if (room.practice && !correct) { io.to(sid).emit("practiceRetry", { choiceIndex, steal: true }); return; }
  b.stealAnswered.add(sid);
  recordReview(b, sid, b.q, choiceIndex, correct, "steal");
  if (!correct) queueRetry(b, sid, b.q);
  io.to(room.code).emit("stealResult", correct ? {
    uid: sid, correct, correctIndex: b.q.answer, correctAll: rightAnswers(b.q), explain: b.q.explain,
  } : { uid: sid, correct });                 // a missed steal doesn't give the answer away to the others
  if (correct) b.revealPending = false;
  if (!correct) {
    teamStreak(room, stealer.team, false);      // a missed steal ends the team's streak
    // everyone who can steal has had a go: no need to wait out the window
    if (stealersOf(b, b.stealOf).every((x) => b.stealAnswered.has(x.uid))) closeSteal(room);
    return;
  }
  clearTimeout(b.timers.steal);
  gradeAnswer(room, stealer, true);
  stealer._correct   = true;   // allow attack actions
  stealer._halfPower = true;   // attacks do 50% damage this turn

  // Auto-guard the original wrong-answerer (no action choice for them)
  const original = b.combatants[b.stealOf];
  if (original) {
    const defEv = resolveAction(room, original, { type: "defend" });
    io.to(room.code).emit("actionResult", {
      actor: original.uid, action: "defend", name: "Defend", events: defEv,
    });
  }

  // Hand the action phase to the stealer
  b.stealActor = sid;
  delete b.stealOf; delete b.stealAnswered;
  b.phase = "steal-action";
  broadcast(room);
  // stealer is always human (bots don't steal), so send them the prompt
  io.to(sid).emit("chooseAction", { syncReady: b.sync[stealer.team] >= 100, correct: true, halfPower: true });
  if (!room.practice) b.timers.a = later(() => handleAction(room, sid, { type: "strike" }), ACTION_SECONDS * 1000);
}

function closeSteal(room) {
  const b = room.battle; if (!b || b.phase !== "steal") return;
  clearTimeout(b.timers.steal);
  if (b.revealPending) {                      // nobody stole it: now everyone may see the answer
    b.revealPending = false;
    io.to(room.code).emit("answerReveal", { correctIndex: b.q.answer, correctAll: rightAnswers(b.q), explain: b.q.explain });
  }
  const originalUid = b.stealOf;
  delete b.stealOf; delete b.stealAnswered;
  const original = b.combatants[originalUid];
  if (!original) { b.phase = "resolving"; broadcast(room); b.timers.next = later(() => advance(room), 500); return; }
  // A wrong answer means guarding this turn. It happens automatically, so nobody
  // waits for a menu with only one choice in it.
  b.phase = "resolving";
  const events = resolveAction(room, original, { type: "defend" });
  original._halfPower = false;
  io.to(room.code).emit("actionResult", { actor: original.uid, action: "defend", name: "Defend", events });
  broadcast(room);
  b.timers.next = later(() => advance(room), NEXT_TURN_MS);
}

// ---------- actions ----------
// Human-readable name for what an actor just did (for the client action popup).
function actionLabel(actor, action) {
  const t = action?.type;
  if (t === "spell") return actor.skills[action.skillIndex]?.name || "Skill";
  if (t === "ultimate") return actor.ultimate?.name || "Ultimate";
  if (t === "item") return ITEM_BY_ID[action.itemId]?.name || "Item";
  if (t === "strike") return "Strike";
  if (t === "defend") return "Defend";
  if (t === "tag") return "Guard Ally";
  return t || "Action";
}

function handleAction(room, sid, action, auto = false) {
  const b = room?.battle;
  if (!b) return;
  const isStealAction = b.phase === "steal-action" && b.stealActor === sid;
  if (!isStealAction && (b.current !== sid || b.phase !== "action")) return;
  clearTimeout(b.timers.a);
  const actor = b.combatants[sid];
  if (!actor) return;
  // Wrong-answer enforcement: only defend is permitted (unless this is a steal-action)
  if (!isStealAction && !actor._correct && action?.type !== "defend") {
    action = { type: "defend" };
  }
  // The Ultimate needs the reason too: a student who picks it is first asked why their answer was right
  if (action?.type === "ultimate" && !auto && !actor.bot && !room.practice && b.sync[actor.team] >= 100) {
    const wq = whySource(b, actor);
    if (wq) return askWhy(room, sid, action, isStealAction, wq);
  }
  doAction(room, sid, action, isStealAction);
}

// ---------- the Ultimate's "why" check ----------
// Two-tier question: after a right answer, the student who wants their Ultimate picks the reason the answer is right
// from three. The right reason unleashes the Ultimate. A wrong one turns it into a Strike, and the gauge stays full
// for next time, so understanding (not only recognising) is what unlocks the strongest move.
const WHY_SECONDS = 15;
function whySource(b, actor) {
  if (b.q?.why) return b.q;
  return b.lastWhyQ?.[actor.uid] || null;     // the question was recall only: use the last one they got right that has a reason
}
function askWhy(room, sid, action, steal, q) {
  const b = room.battle;
  const options = shuffle([{ t: q.why.right, ok: true }, ...q.why.wrong.map((t) => ({ t, ok: false }))]);
  b.phase = "why";
  b.why = { sid, action, steal, options, startedAt: Date.now() };
  const answer = rightAnswers(q).map((i) => q.choices[i]).filter(Boolean).join(" / ");
  io.to(sid).emit("whyOpen", { q: q.q, answer, reasons: options.map((o) => o.t), seconds: WHY_SECONDS, startedAt: b.why.startedAt });
  broadcast(room);
  b.timers.a = later(() => finishWhy(room, sid, -1), WHY_SECONDS * 1000 + 600);
}
function finishWhy(room, sid, index) {
  const b = room?.battle;
  if (!b || b.phase !== "why" || b.why?.sid !== sid) return;
  clearTimeout(b.timers.a);
  const { action, steal, options } = b.why; delete b.why;
  const ok = !!options[index]?.ok;
  const st = ((b.whyStats ||= {})[sid] ||= { asked: 0, right: 0 }); st.asked++; if (ok) st.right++;
  io.to(sid).emit("whyResult", { ok, chosen: index, right: options.find((o) => o.ok)?.t || "" });
  const actor = b.combatants[sid];
  const foe = enemiesOf(b, actor.team)[0];
  doAction(room, sid, ok ? action : { type: "strike", targetId: foe?.uid }, steal, ok ? "right" : "wrong");
}

function doAction(room, sid, action, isStealAction, why = null) {
  const b = room.battle, actor = b.combatants[sid];
  b.phase = "resolving";
  const events = resolveAction(room, actor, action || { type: "defend" });
  actor._halfPower = false;   // clear steal penalty after action resolves
  if (isStealAction) delete b.stealActor;
  io.to(room.code).emit("actionResult", {
    actor: actor.uid, action: action?.type || "defend", name: actionLabel(actor, action || { type: "defend" }), events, why,
  });
  broadcast(room);
  b.timers.next = later(() => advance(room), afterMoveMs(actor, action));
}

// ---------- bots ----------
function botTurn(room) {
  const b = room.battle; if (!b || room.status !== "battle" || b.phase !== "question" || !b.combatants[b.current]?.bot) return;
  const correct = room.practice ? b.botPlan?.correct !== false : Math.random() < 0.62;
  // Pick the right answer or a random wrong one, then run through the same
  // resolveAnswer path as humans so steal windows open on wrong bot answers.
  const wrongChoices = b.q.choices.map((_, i) => i).filter((i) => !isRight(b.q, i));
  const choiceIndex = correct ? b.q.answer : wrongChoices[Math.floor(Math.random() * wrongChoices.length)];
  resolveAnswer(room, choiceIndex);
}

function botAction(room) {
  const b = room.battle; if (!b || room.status !== "battle") return;
  const c = b.combatants[b.current]; if (!c) return;
  const enemies = enemiesOf(b, c.team);
  const allies = alliesOf(b, c.team);
  let action = { type: "strike", targetId: enemies[0]?.uid };
  if (!c._correct) {
    // wrong answer → guard only (same rule as human players)
    action = { type: "defend" };
  } else if (room.practice) {
    action = botMove(room.practice, c, b, b.botPlan);
  } else if (b.sync[c.team] >= 100 && Math.random() < 0.7) {
    action = { type: "ultimate" };
  } else {
    const lowAlly = allies.find((a) => a.alive && a.hp < a.maxHp * 0.35);
    const healSkill = c.skills.findIndex((s) => s.kind === "heal");
    if (lowAlly && healSkill >= 0 && c.sp >= c.skills[healSkill].sp) {
      action = { type: "spell", skillIndex: healSkill, targetId: lowAlly.uid };
    } else {
      // prefer an affordable attack skill that hits a weakness (skip skills on cooldown)
      const atkSkills = c.skills.map((s, i) => ({ s, i })).filter((x) => (x.s.kind === "atk" || x.s.kind === "heavy") && c.sp >= x.s.sp && !(c.cooldowns[x.i] > 0));
      const weakTarget = enemies.find((e) => e.weakTo === c.element);
      const tgt = weakTarget || rand(enemies);
      if (atkSkills.length && tgt) { const pick = rand(atkSkills); action = { type: "spell", skillIndex: pick.i, targetId: tgt.uid }; }
      else if (tgt) action = { type: "strike", targetId: tgt.uid };
    }
  }
  b.phase = "action";
  const events = resolveAction(room, c, action);
  io.to(room.code).emit("actionResult", { actor: c.uid, action: action.type, name: actionLabel(c, action), events });
  broadcast(room);
  const after = room.practice && b.botPlan?.after;    // practice: the coach explains what just happened
  if (after) b.timers.next = later(() => practiceGate(room, after, () => advance(room)), afterMoveMs(c, action));
  else b.timers.next = later(() => advance(room), afterMoveMs(c, action));
}

// ---------- end ----------
// forced: { winner: 0 | 1 | -1 (draw), reason } when the battle is stopped early
// ---------- the Rift Report: what each player gets at the end of a battle ----------
// The questions they missed (with the right answer and the learning objective), then two or three short written
// prompts to answer in full sentences. A prompt is the missed question asked without its options when it reads well
// on its own; otherwise it asks them to explain the learning objective in their own words.
// a stem that only makes sense with its options in front of it ("Which of these…", "Which is NOT…")
const needsOptions = (stem) => /which of|the following|which statement|which option|\bthese\b|\bbelow\b|\babove\b|\btrue\b|\bfalse\b|\bbest\b/i.test(stem) || /\bNOT\b/.test(stem);
function promptFor(r) {
  const stem = String(r.q || "").trim(), answer = (r.answers || [r.answer]).map((i) => r.choices?.[i]).filter(Boolean).join(" / ");
  // they picked a wrong answer: explaining why it is wrong makes them face the misconception itself
  const pick = Number.isInteger(r.lastPick) && r.lastPick >= 0 ? r.choices?.[r.lastPick] : null;
  if (pick && stem) {
    return { kind: "pick", text: `Question: ${stem}\nYou chose “${pick}”. Explain in a full sentence why that answer is wrong.`,
      model: `${r.lastNote ? r.lastNote + " " : ""}The right answer is “${answer}”.${r.explain ? " " + r.explain : ""}`, lo: r.lo, qid: r.qid };
  }
  if (stem && !needsOptions(stem) && !r.image) {
    return { kind: "direct", text: /[?]$/.test(stem) ? `Answer in a full sentence, using the proper term: ${stem}` : `Finish this sentence in your own words: ${stem.replace(/[.…\s]+$/, "")} …`, model: answer, lo: r.lo, qid: r.qid };
  }
  const lo = String(r.lo || "").trim().replace(/\.$/, "");
  const idea = lo.replace(/^(state|recognise|recognize|understand|show)\s+that\s+/i, "");
  return { kind: "lo", text: idea !== lo ? `Explain in your own words: ${idea}.` : `Write two or three sentences: ${lo}.`, model: `${stem} ${answer}`, lo: r.lo, qid: r.qid };
}
function buildReport(review) {
  const byQ = new Map();
  for (const r of review) { const k = r.qid || r.q; const e = byQ.get(k) || { ...r, tries: 0, wrong: 0, fixed: false }; e.tries++;
    if (r.correct) { if (e.wrong) e.fixed = true; } else { e.wrong++; if (r.chosen >= 0) { e.lastPick = r.chosen; e.lastNote = r.note || ""; } }
    byQ.set(k, e); }
  const missed = [...byQ.values()].filter((e) => e.wrong > 0).sort((a, b) => (a.fixed - b.fixed) || (b.wrong - a.wrong));
  let pick = missed.slice(0, 3);
  if (!pick.length) pick = shuffle([...new Map(review.map((r) => [r.lo, r])).values()]).slice(0, 2);   // nothing missed: explain two of today's objectives
  const prompts = pick.map((r, i) => ({ id: "p" + i, ...promptFor(r) }));
  return { missed: missed.map((e) => ({ q: e.q, lo: e.lo, wrong: e.wrong, fixed: e.fixed, right: (e.answers || [e.answer]).map((i) => e.choices?.[i]).filter(Boolean).join(" / ") })), prompts };
}

// Coins reward learning, not just winning: every question got wrong and then put right (later in the battle, or
// wrong in an earlier battle and right now) is worth FIX_COINS.
const FIX_COINS = 40;
function fixedCount(review, carried) {
  const st = new Map(); let n = 0;
  for (const x of review) {
    const k = x.qid || x.q, e = st.get(k) || { wrong: !!(x.qid && carried?.has(x.qid)), fixed: false };
    if (!x.correct) e.wrong = true; else if (e.wrong && !e.fixed) { e.fixed = true; n++; }
    st.set(k, e);
  }
  return n;
}

function endBattle(room, forced = null) {
  const b = room.battle;
  if (!b || room.status !== "battle") return;
  clearTimers(b);
  clearTimeout(b.limitTimer);
  b.phase = "over";
  const winner = forced ? forced.winner : (aliveCount(b, 0) > 0 ? 0 : 1);
  const reason = forced ? forced.reason : "ko";
  room.status = "finished";
  const rewards = {};
  room.players.forEach((p) => {
    const won = p.team === winner;
    const correct = b.correctCount[p.id] || 0;
    const review = b.review[p.id] || [];
    const along = review.filter((x) => x.how === "along");
    // shop items not used in this battle go back in the bag (the battle's own free items are used first)
    const bag = room.bags?.[p.id], left = {};
    if (bag) for (const [id, n] of Object.entries(bag)) { if (ITEM_BY_ID[id]?.passive) continue; const k = Math.min(n, b.combatants[p.id]?.items?.[id] || 0); if (k > 0) left[id] = k; }
    const alongRight = along.filter((x) => x.correct).length, fixed = fixedCount(review, b.carried?.[p.id]);
    const coinParts = { battle: won ? 250 : winner === -1 ? 200 : 150, answers: correct * 20 + alongRight * 5, fixed: fixed * FIX_COINS, fixedCount: fixed };
    rewards[p.id] = { bagLeft: bag ? left : null, won, coins: coinParts.battle + coinParts.answers + coinParts.fixed, coinParts, correct,
      why: b.whyStats?.[p.id] || null,
      along: { answered: along.length, right: along.filter((x) => x.correct).length }, review, report: p.bot ? null : buildReport(review) };
  });
  io.to(room.code).emit("battleEnd", { winnerTeam: winner, reason, rewards, tournament: room.tournament || null, practice: !!room.practice });
  broadcast(room);
  if (room.tournament) Tour.onBattleEnd(room, { winner, reason, rewards });
  if (room.practice) {                      // nothing more happens in a finished practice fight
    rooms.delete(room.code); socketRoom.delete(room.practice.student);
    io.sockets.sockets.get(room.practice.student)?.leave(room.code);
  }
}

// Time limit reached (or the teacher ended the round): the team with the larger
// share of its total HP left wins. Level HP → more correct answers wins. Still
// level → draw.
function timeUp(room) {
  const b = room.battle;
  if (!b || room.status !== "battle") return;
  const share = (team) => {
    let hp = 0, max = 0;
    for (const c of Object.values(b.combatants)) if (c.team === team) { hp += Math.max(0, c.hp); max += c.maxHp; }
    return max ? hp / max : 0;
  };
  const correct = (team) => Object.values(b.combatants)
    .filter((c) => c.team === team).reduce((n, c) => n + (b.correctCount[c.uid] || 0), 0);
  const h0 = share(0), h1 = share(1);
  let winner;
  if (Math.abs(h0 - h1) >= 0.005) winner = h0 > h1 ? 0 : 1;
  else if (correct(0) !== correct(1)) winner = correct(0) > correct(1) ? 0 : 1;
  else winner = -1;
  endBattle(room, { winner, reason: "time" });
}

const PORT = process.env.PORT || 3100;
// Bind to 0.0.0.0 so other devices on the same Wi-Fi (iPads, laptops) can connect.
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  🏰  ACADEMY RIFT server running\n`);
  console.log(`  ▶  This computer:   http://localhost:${PORT}`);
  // List every LAN IPv4 address so the host knows what URL to share on the network.
  const nets = os.networkInterfaces();
  const lan = [];
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] || []) {
      if (ni.family === "IPv4" && !ni.internal) lan.push(ni.address);
    }
  }
  if (lan.length) {
    console.log(`\n  📱  Same Wi-Fi (share with iPads / other computers):`);
    lan.forEach((ip) => console.log(`      http://${ip}:${PORT}`));
  }
  console.log(`\n  One player Creates a room, shares the 4-letter code; up to 4 play. 🎮`);
  console.log(`  🏆  Class tournament: the teacher opens /teacher on the projector, e.g. http://localhost:${PORT}/teacher\n`);
});
