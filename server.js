// ===== Academy Rift — authoritative 4-player (2v2) game server =====
// All combat is resolved here so clients can't cheat; question answers never
// leave the server. Real-time sync over Socket.IO. Empty/disconnected seats
// are driven by bots so a match always continues.
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import os from "os";
import { CHAR_BY_ID, CHARACTERS, ITEM_BY_ID, effectiveness } from "./public/data/characters.js";
import { QUESTIONS } from "./questions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
// Static assets. The art/audio is heavy (hundreds of MB), so cache media hard in
// the browser and let it refresh in the background (stale-while-revalidate) — this
// makes screen-to-screen navigation and repeat visits load instantly. Code/markup
// is sent with no-cache so it always revalidates and deploys take effect at once.
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

// ---- tuning ----
const QUESTION_SECONDS = 18;
const ACTION_SECONDS = 20;
const CORRECT_MULT = 1.22;          // a correct answer empowers your action (was 1.35)
const SP_DMG_SCALE = 140;           // higher-SP skills hit harder: power * (1 + sp/SP_DMG_SCALE)
const DMG_SCALE = 0.4;              // global damage scale — lower = longer battles, more questions
const CRIT_CHANCE = 0.07;           // chance any hit crits (was 0.10)
const CRIT_MULT = 1.25;             // crit damage multiplier (was 1.5)
const STEAL_SECONDS = 10;
const SYNC_CORRECT = 25, SYNC_WEAK = 18, SYNC_SUPPORT = 14, SYNC_TEAM = 22; // 4 correct = 100%
const DEFAULT_ITEMS = { bento: 1, energy: 1, revive: 1 };
const BOT_NAMES = ["Akira", "Mei", "Sora", "Riku", "Yuki", "Kai"];

const rooms = new Map();      // code -> room
const socketRoom = new Map(); // socket.id -> code

const rand = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Fisher-Yates shuffle (returns a new array).
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Per-battle question deck: draw without replacement, reshuffle when exhausted,
// so every question is seen once before any repeats and the order varies each match.
function nextQuestion(b) {
  if (!b.qDeck || b.qPos >= b.qDeck.length) { b.qDeck = shuffle(QUESTIONS); b.qPos = 0; }
  return b.qDeck[b.qPos++];
}

function makeRoomCode() {
  let c;
  do { c = Math.random().toString(36).substring(2, 6).toUpperCase(); } while (rooms.has(c));
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
    players: room.players.map((p) => ({
      id: p.id, name: p.name, team: p.team, character: p.character, ready: p.ready, bot: p.bot,
    })),
    battle: room.battle ? publicBattle(room.battle) : null,
  };
}

function publicBattle(b) {
  return {
    sync: { 0: Math.round(b.sync[0]), 1: Math.round(b.sync[1]) },
    current: b.current,
    stealOf: b.stealOf || null,
    stealActor: b.stealActor || null,
    currentName: b.combatants[b.current]?.name,
    currentTeam: b.combatants[b.current]?.team,
    phase: b.phase,
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
        defUp: c.defUpTurns > 0, stunned: !!c.stunned,
        skills: c.skills, ultimate: c.ultimate, items: c.items,
      };
    }),
  };
}

function broadcast(room) { io.to(room.code).emit("room", publicRoom(room)); }

// ---------- lobby ----------
io.on("connection", (socket) => {
  socket.on("createRoom", ({ name }) => {
    const code = makeRoomCode();
    const room = { code, status: "lobby", hostId: socket.id, players: [], battle: null };
    room.players.push({ id: socket.id, name: name || "Player", team: 0, character: null, ready: false, bot: false });
    rooms.set(code, room);
    socketRoom.set(socket.id, code);
    socket.join(code);
    socket.emit("joined", { code, you: socket.id });
    broadcast(room);
  });

  socket.on("joinRoom", ({ name, code }) => {
    code = (code || "").toUpperCase();
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
      id, name: rand(BOT_NAMES) + " (Bot)", team, bot: true, ready: true,
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

  socket.on("answer", ({ choiceIndex }) => handleAnswer(myRoom(), socket.id, choiceIndex));
  socket.on("steal",  ({ choiceIndex }) => handleSteal(myRoom(), socket.id, choiceIndex));
  socket.on("action", (action) => handleAction(myRoom(), socket.id, action));

  socket.on("rematch", () => {
    const room = myRoom(); if (!room || room.status !== "finished" || room.hostId !== socket.id) return;
    room.players.forEach((p) => { if (!p.bot) p.ready = false; });
    room.status = "lobby"; room.battle = null;
    broadcast(room);
  });

  socket.on("disconnect", () => {
    const room = myRoom(); socketRoom.delete(socket.id);
    if (!room) return;
    if (room.status === "lobby") {
      room.players = room.players.filter((p) => p.id !== socket.id);
      if (room.players.filter((p) => !p.bot).length === 0) { rooms.delete(room.code); return; }
      if (room.hostId === socket.id) room.hostId = room.players.find((p) => !p.bot)?.id;
      broadcast(room);
    } else if (room.battle) {
      // convert the seat to a bot so the battle keeps going
      const c = room.battle.combatants[socket.id];
      if (c) { c.bot = true; io.to(room.code).emit("toast", `${c.name} disconnected — taken over by a bot.`); }
      if (room.hostId === socket.id) room.hostId = room.players.find((p) => !p.bot && p.id !== socket.id)?.id || room.hostId;
      if (room.battle.current === socket.id) { clearTimers(room.battle); botTurn(room); }
      broadcast(room);
    }
  });
});

// ---------- battle setup ----------
function beginBattle(room) {
  const make = (p) => {
    const base = CHAR_BY_ID[p.character] || rand(CHARACTERS);
    return {
      uid: p.id, name: p.name, bot: p.bot, team: p.team,
      charId: base.id, charName: base.name, element: base.element, role: base.role,
      weakTo: base.weakTo, resists: base.resists,
      maxHp: base.hp, hp: base.hp, maxSp: base.sp, sp: base.sp, atk: base.atk,
      skills: base.skills, ultimate: base.ultimate,
      alive: true, defending: false, shield: false, atkBuff: 0,
      cooldowns: {},       // skillIndex → turns remaining
      // status effects (turns remaining); decremented at the start of each own turn
      atkUpTurns: 0, defUpTurns: 0, atkDownTurns: 0, defDownTurns: 0, accDownTurns: 0,
      timerDownTurns: 0, accProtectTurns: 0, stunned: false,
      items: { ...DEFAULT_ITEMS }, _correct: false,
    };
  };
  const t0 = room.players.filter((p) => p.team === 0).map(make);
  const t1 = room.players.filter((p) => p.team === 1).map(make);
  const combatants = {};
  [...t0, ...t1].forEach((c) => (combatants[c.uid] = c));
  const order = [t0[0].uid, t1[0].uid, t0[1].uid, t1[1].uid];

  room.battle = {
    combatants, order, ptr: 0, current: null, phase: null,
    sync: { 0: 0, 1: 0 }, publicQuestion: null, q: null,
    qDeck: shuffle(QUESTIONS), qPos: 0,   // shuffled question deck, drawn without replacement
    correctCount: {}, timers: {},
  };
  room.status = "battle";
  io.to(room.code).emit("battleStart");
  broadcast(room);
  setTimeout(() => advance(room), 1200);
}

function aliveCount(b, team) {
  return b.order.filter((u) => b.combatants[u].team === team && b.combatants[u].alive).length;
}
function clearTimers(b) { Object.values(b.timers).forEach(clearTimeout); b.timers = {}; }

function advance(room) {
  const b = room.battle; if (!b) return;
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

// tick down all timed status effects on a combatant
function decStatuses(c) {
  for (const k of ["atkUpTurns", "defUpTurns", "atkDownTurns", "defDownTurns", "accDownTurns", "timerDownTurns", "accProtectTurns"]) {
    if (c[k] > 0) c[k]--;
  }
}

function startQuestion(room) {
  const b = room.battle; const c = b.combatants[b.current];
  const q = nextQuestion(b);
  b.q = q;
  // A timer debuff (Crystal Lock / Static Pulse / Shadow Bind) shaves 4s off this answer.
  const seconds = Math.max(6, QUESTION_SECONDS - (c.timerDownTurns > 0 ? 4 : 0));
  b.publicQuestion = { q: q.q, choices: q.choices, topic: q.topic, difficulty: q.difficulty, seconds, startedAt: Date.now() };
  b.phase = "question";
  c._correct = false;
  broadcast(room);
  if (c.bot) {
    // Bot takes 4–8 seconds to "think", giving human players time to read the question
    const thinkMs = 4000 + Math.floor(Math.random() * 4001);
    b.timers.bot = setTimeout(() => botTurn(room), thinkMs);
    return;
  }
  io.to(c.uid).emit("yourQuestion", { question: b.publicQuestion });
  b.timers.q = setTimeout(() => resolveAnswer(room, -1), seconds * 1000);
}

function handleAnswer(room, sid, choiceIndex) {
  const b = room?.battle;
  if (!b || b.current !== sid || b.phase !== "question") return;
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
  if (correct) {
    addSync(room, c.team, SYNC_CORRECT);
    const mate = b.order.map((u) => b.combatants[u]).find((x) => x.team === c.team && x.uid !== c.uid);
    if (mate && mate._answered && mate._correct) {       // both teammates correct → in sync!
      addSync(room, c.team, SYNC_TEAM);
      io.to(room.code).emit("teamSync", { team: c.team, amount: SYNC_TEAM });
    }
  }
}

function resolveAnswer(room, choiceIndex) {
  const b = room.battle; const c = b.combatants[b.current];
  const correct = choiceIndex === b.q.answer;
  gradeAnswer(room, c, correct);
  io.to(room.code).emit("answerResult", {
    uid: c.uid, correct, correctIndex: b.q.answer, explain: b.q.explain,
  });

  // Wrong answer → open a steal window (works for both human and bot wrong answers).
  if (!correct) {
    b.phase = "steal";
    b.stealOf = c.uid;
    b.stealAnswered = new Set();
    broadcast(room);
    io.to(room.code).emit("stealOpen", {
      originalUid: c.uid, originalName: c.name, seconds: STEAL_SECONDS,
    });
    b.timers.steal = setTimeout(() => closeSteal(room), STEAL_SECONDS * 1000);
    return;
  }

  // Correct answer — hold on "reveal" phase for 3s so everyone can see the
  // highlighted correct choice and absorb the explanation before action begins.
  b.phase = "reveal";
  broadcast(room);
  b.timers.reveal = setTimeout(() => {
    if (!room.battle || room.battle.phase !== "reveal") return;
    b.phase = "action";
    broadcast(room);
    if (c.bot) { b.timers.bot = setTimeout(() => botAction(room), 200); return; }
    io.to(c.uid).emit("chooseAction", { syncReady: b.sync[c.team] >= 100, correct: true });
    b.timers.a = setTimeout(() => handleAction(room, c.uid, { type: "strike" }, true), ACTION_SECONDS * 1000);
  }, 3000);
}

function handleSteal(room, sid, choiceIndex) {
  const b = room?.battle;
  if (!b || b.phase !== "steal") return;
  if (sid === b.stealOf) return;
  if (!b.stealAnswered) b.stealAnswered = new Set();
  if (b.stealAnswered.has(sid)) return;
  b.stealAnswered.add(sid);

  const stealer = b.combatants[sid];
  if (!stealer || !stealer.alive) return;
  const correct = choiceIndex === b.q.answer;
  io.to(room.code).emit("stealResult", {
    uid: sid, correct, correctIndex: b.q.answer, explain: b.q.explain,
  });
  if (correct) {
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
    b.timers.a = setTimeout(() => handleAction(room, sid, { type: "strike" }), ACTION_SECONDS * 1000);
  }
}

function closeSteal(room) {
  const b = room.battle; if (!b || b.phase !== "steal") return;
  clearTimeout(b.timers.steal);
  const originalUid = b.stealOf;
  b.phase = "action";
  delete b.stealOf; delete b.stealAnswered;
  broadcast(room);
  const original = b.combatants[originalUid];
  if (!original) { b.timers.next = setTimeout(() => advance(room), 500); return; }
  if (original.bot) { b.timers.bot = setTimeout(() => botAction(room), 500); return; }
  // Original player still takes their action but with wrong-answer penalty (can only defend/support)
  io.to(originalUid).emit("chooseAction", { syncReady: b.sync[original.team] >= 100, correct: false });
  b.timers.a = setTimeout(() => handleAction(room, originalUid, { type: "defend" }, true), ACTION_SECONDS * 1000);
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

function enemiesOf(b, team) { return b.order.map((u) => b.combatants[u]).filter((c) => c.team !== team && c.alive); }
function alliesOf(b, team) { return b.order.map((u) => b.combatants[u]).filter((c) => c.team === team); }

function handleAction(room, sid, action, auto = false) {
  const b = room?.battle;
  if (!b) return;
  const isStealAction = b.phase === "steal-action" && b.stealActor === sid;
  if (!isStealAction && (b.current !== sid || b.phase !== "action")) return;
  clearTimeout(b.timers.a);
  b.phase = "resolving";
  const actor = b.combatants[sid];
  if (!actor) return;
  // Wrong-answer enforcement: only defend is permitted (unless this is a steal-action)
  if (!isStealAction && !actor._correct && action?.type !== "defend") {
    action = { type: "defend" };
  }
  const events = resolveAction(room, actor, action || { type: "defend" });
  actor._halfPower = false;   // clear steal penalty after action resolves
  if (isStealAction) delete b.stealActor;
  io.to(room.code).emit("actionResult", {
    actor: actor.uid, action: action?.type || "defend", name: actionLabel(actor, action || { type: "defend" }), events,
  });
  broadcast(room);
  b.timers.next = setTimeout(() => advance(room), 1700);
}

function resolveAction(room, actor, action) {
  const b = room.battle;
  const cm = actor._correct ? CORRECT_MULT : 1;       // correct answer empowers the action
  const events = [];
  const enemies = enemiesOf(b, actor.team);
  const allies = alliesOf(b, actor.team);
  const pickEnemy = (id) => b.combatants[id] && b.combatants[id].alive && b.combatants[id].team !== actor.team
    ? b.combatants[id] : (enemies[0] || null);
  const fizzle = () => [{ kind: "fizzle", target: actor.uid }];   // wrong answer → attack fails
  const isOffSkill = (sk) => sk && (sk.kind === "atk" || sk.kind === "heavy" || sk.kind === "debuff");
  // accuracy debuff: 25% chance an offensive action whiffs (unless protected by Clarity Field)
  const misses = () => actor.accDownTurns > 0 && actor.accProtectTurns <= 0 && Math.random() < 0.25;
  const allyTarget = (id) => (b.combatants[id] && b.combatants[id].team === actor.team ? b.combatants[id] : actor);

  if (action.type === "strike") {
    if (!actor._correct) return fizzle();
    if (misses()) return [{ kind: "fizzle", target: actor.uid, miss: true }];
    const t = pickEnemy(action.targetId); if (!t) return events;
    events.push(damage(room, actor, t, actor.atk, actor.element, cm));
  } else if (action.type === "spell") {
    const sk = actor.skills[action.skillIndex]; if (!sk) return events;
    if ((actor.cooldowns[action.skillIndex] || 0) > 0) return fizzle(); // on cooldown
    if (isOffSkill(sk) && !actor._correct) return fizzle();
    if (actor.sp < sk.sp) { // not enough SP -> weak strike fallback (still needs a correct answer)
      if (!actor._correct) return fizzle();
      const t = pickEnemy(action.targetId);
      if (t) events.push(damage(room, actor, t, actor.atk * 0.6, actor.element, cm));
      return events;
    }
    if (isOffSkill(sk) && misses()) { actor.sp -= sk.sp; return [{ kind: "fizzle", target: actor.uid, miss: true }]; }
    actor.sp -= sk.sp;
    if ((sk.cd || 0) > 0) actor.cooldowns[action.skillIndex] = sk.cd;   // start cooldown

    if (sk.kind === "atk" || sk.kind === "heavy") {
      const t = pickEnemy(action.targetId);
      const power = sk.power * (1 + sk.sp / SP_DMG_SCALE);   // more SP invested = more damage
      if (t) events.push(damage(room, actor, t, power, sk.element, cm));

    } else if (sk.kind === "heal") {
      const t = allyTarget(action.targetId);
      const amt = Math.round(sk.power * cm);
      t.hp = Math.min(t.maxHp, t.hp + amt); if (t.hp > 0) t.alive = true;
      addSync(room, actor.team, SYNC_SUPPORT);
      events.push({ target: t.uid, heal: amt, kind: "heal" });

    } else if (sk.kind === "buff") {
      addSync(room, actor.team, SYNC_SUPPORT);
      if (sk.eff === "atk") { actor.atkUpTurns = 1; events.push({ target: actor.uid, kind: "buff", eff: "atk" }); }
      else if (sk.eff === "def") { actor.defUpTurns = 1; events.push({ target: actor.uid, kind: "buff", eff: "def" }); }
      else if (sk.eff === "accuracy") { allies.filter((a) => a.alive).forEach((a) => { a.accProtectTurns = 1; events.push({ target: a.uid, kind: "buff", eff: "acc" }); }); }
      else { actor.atkBuff += 20; events.push({ target: actor.uid, kind: "buff" }); }

    } else if (sk.kind === "guard") {
      addSync(room, actor.team, SYNC_SUPPORT);
      const targets = sk.target === "party" ? allies.filter((a) => a.alive) : [actor];
      targets.forEach((t) => { t.defUpTurns = Math.max(t.defUpTurns, 1); events.push({ target: t.uid, kind: "guard" }); });

    } else if (sk.kind === "cleanse") {
      addSync(room, actor.team, SYNC_SUPPORT);
      const t = allyTarget(action.targetId);
      t.atkDownTurns = 0; t.defDownTurns = 0; t.accDownTurns = 0; t.timerDownTurns = 0;
      events.push({ target: t.uid, kind: "cleanse" });

    } else if (sk.kind === "debuff") {
      const t = pickEnemy(action.targetId);
      if (t) {
        if (sk.power > 0) events.push(damage(room, actor, t, sk.power, sk.element, cm, { debuff: true }));
        if (sk.eff === "timer") t.timerDownTurns = 2;
        else if (sk.eff === "accuracy") t.accDownTurns = 2;
        else if (sk.eff === "atk") t.atkDownTurns = 2;
        else if (sk.eff === "def") t.defDownTurns = 2;
        events.push({ target: t.uid, kind: "debuff", eff: sk.eff });
      }
    }
  } else if (action.type === "defend") {
    actor.defending = true; events.push({ target: actor.uid, kind: "defend" });
  } else if (action.type === "item") {
    events.push(...useItem(room, actor, action.itemId, action.targetId, cm));
  } else if (action.type === "tag") {
    events.push({ target: actor.uid, kind: "tag" });
  } else if (action.type === "ultimate") {
    if (!actor._correct) return fizzle();
    if (b.sync[actor.team] < 100) return events;            // team sync gauge must be full
    b.sync[actor.team] = 0;                                  // consume the whole team's gauge
    const ult = actor.ultimate, arch = ult.archetype || "damage";
    if (arch === "heal") {                                   // hybrid: heal both allies + damage enemies
      const half = ult.power / 2;
      allies.filter((a) => a.alive).forEach((a) => { const amt = Math.round(half * cm); a.hp = Math.min(a.maxHp, a.hp + amt); events.push({ target: a.uid, heal: amt, kind: "heal" }); });
      enemies.forEach((t) => events.push(damage(room, actor, t, half, actor.element, cm, { ult: true })));
    } else if (arch === "shield") {                          // hybrid: shield both allies (2t) + damage enemies
      allies.filter((a) => a.alive).forEach((a) => { a.defUpTurns = Math.max(a.defUpTurns, 2); events.push({ target: a.uid, kind: "guard" }); });
      enemies.forEach((t) => events.push(damage(room, actor, t, ult.power, actor.element, cm, { ult: true })));
    } else if (arch === "stun") {                            // damage + stun all enemies (skip next turn)
      enemies.forEach((t) => { events.push(damage(room, actor, t, ult.power, actor.element, cm, { ult: true })); if (t.alive) t.stunned = true; });
    } else {                                                 // pure damage
      enemies.forEach((t) => events.push(damage(room, actor, t, ult.power, actor.element, cm, { ult: true })));
    }
    events.push({ kind: "ultimate", name: ult.name, actor: actor.uid });
  }
  return events;
}

function damage(room, actor, target, basePower, element, correctMult, opts = {}) {
  const eff = effectiveness(element, target);
  const crit = Math.random() < CRIT_CHANCE ? CRIT_MULT : 1;
  const defMult = target.defending ? 0.5 : 1;
  const shieldMult = target.shield ? 0.5 : 1;
  const variance = 0.9 + Math.random() * 0.2;
  // attacker mods: legacy +atkBuff%, Overcharge (+25%), Permafrost ATK-down (−25%)
  const buffMult = (1 + actor.atkBuff / 100) * (actor.atkUpTurns > 0 ? 1.25 : 1) * (actor.atkDownTurns > 0 ? 0.75 : 1);
  // target mods: guard/Iron Stand DEF-up (−30%), Guard Break DEF-down (+25%)
  const incomingMult = (target.defUpTurns > 0 ? 0.7 : 1) * (target.defDownTurns > 0 ? 1.25 : 1);
  const halfPowerMult = actor._halfPower ? 0.5 : 1;   // steal penalty
  let dmg = basePower * eff.mult * correctMult * crit * defMult * shieldMult * incomingMult * variance * buffMult * DMG_SCALE * halfPowerMult;
  dmg = Math.max(1, Math.round(dmg));
  target.hp = Math.max(0, target.hp - dmg);
  if (target.shield) target.shield = false;
  if (target.hp <= 0) target.alive = false;
  if (eff.tag === "WEAK") addSync(room, actor.team, SYNC_WEAK);
  return { target: target.uid, dmg, eff: eff.tag, crit: crit > 1, ko: !target.alive, kind: opts.ult ? "ult" : "hit" };
}

function useItem(room, actor, itemId, targetId, cm) {
  const b = room.battle; const events = [];
  if (!actor.items[itemId] || actor.items[itemId] <= 0) return events;
  const ally = b.combatants[targetId] && b.combatants[targetId].team === actor.team ? b.combatants[targetId] : actor;
  if (itemId === "bento") { const a = 500; ally.hp = Math.min(ally.maxHp, ally.hp + a); if (ally.hp > 0) ally.alive = true; events.push({ target: ally.uid, heal: a, kind: "heal" }); }
  else if (itemId === "energy") { ally.sp = Math.min(ally.maxSp, ally.sp + 150); events.push({ target: ally.uid, kind: "sp", sp: 150 }); }
  else if (itemId === "shield") { ally.shield = true; events.push({ target: ally.uid, kind: "guard" }); }
  else if (itemId === "crystal") { addSync(room, actor.team, 40); events.push({ target: actor.uid, kind: "sync" }); }
  else if (itemId === "revive") { const dead = alliesOf(b, actor.team).find((c) => !c.alive); if (dead) { dead.alive = true; dead.hp = Math.round(dead.maxHp * 0.5); events.push({ target: dead.uid, kind: "revive", heal: dead.hp }); } }
  actor.items[itemId]--;
  return events;
}

function addSync(room, team, amt) { room.battle.sync[team] = clamp(room.battle.sync[team] + amt, 0, 100); }

// ---------- bots ----------
function botTurn(room) {
  const b = room.battle; if (!b || !b.combatants[b.current]?.bot) return;
  const correct = Math.random() < 0.62;
  // Pick the right answer or a random wrong one, then run through the same
  // resolveAnswer path as humans so steal windows open on wrong bot answers.
  const wrongChoices = [0, 1, 2, 3].filter((i) => i !== b.q.answer);
  const choiceIndex = correct ? b.q.answer : wrongChoices[Math.floor(Math.random() * wrongChoices.length)];
  resolveAnswer(room, choiceIndex);
}

function botAction(room) {
  const b = room.battle; if (!b) return;
  const c = b.combatants[b.current]; if (!c) return;
  const enemies = enemiesOf(b, c.team);
  const allies = alliesOf(b, c.team);
  let action = { type: "strike", targetId: enemies[0]?.uid };
  if (!c._correct) {
    // wrong answer → guard only (same rule as human players)
    action = { type: "defend" };
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
  b.timers.next = setTimeout(() => advance(room), 1700);
}

// ---------- end ----------
function endBattle(room) {
  const b = room.battle;
  clearTimers(b);
  const winner = aliveCount(b, 0) > 0 ? 0 : 1;
  room.status = "finished";
  const rewards = {};
  room.players.forEach((p) => {
    const won = p.team === winner;
    const correct = b.correctCount[p.id] || 0;
    rewards[p.id] = { won, coins: (won ? 300 : 120) + correct * 20, science: correct * 20, correct };
  });
  io.to(room.code).emit("battleEnd", { winnerTeam: winner, rewards });
  broadcast(room);
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
  console.log(`\n  One player Creates a room, shares the 4-letter code; up to 4 play. 🎮\n`);
});
