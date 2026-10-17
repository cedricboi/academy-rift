// ===== Academy Rift: Total War — the authoritative server for the strategy mode =====
// Kept apart from the 2v2 Arena: its own rooms, codes and socket events (all named tw*).
// The teacher commands the Crimson Host. Pairs of students march Crystal banners, alone or in
// warbands that vote on every step, to break into the Crimson Fortress.
// Answers never leave the server, and each student only receives what the fog of war lets them see.
import { randomBytes } from "crypto";
import { NODES } from "./public/total-war/movement.js";
import {
  HOME, FORTRESS, OUTPOSTS, UNITS, SUMMONABLE, CAMPS, neighbours, isAdjacent, cost, visibleNodes,
  tallyVotes, pairMP, energyPerTurn, energyCarry, auraFor, battleLength, questionHits, dealHits,
  nearestRally, stepTowards, hops, STACK_LIMIT, FORTRESS_LIMIT, READ_SECONDS, ANSWER_SECONDS, VOTE_SECONDS,
  JOIN_SECONDS, MUSTER_PER_TURN, CAMP_RETURN_TURNS, nodeName, PREPARE_SECONDS, counterAttack, resolveFor, siegeOf, HOLD_BONUS, WARD_HP,
} from "./public/total-war/rules.js";

const token = (n = 18) => randomBytes(n).toString("base64url");
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const rightAnswers = (q) => (Array.isArray(q.answers) && q.answers.length ? q.answers : [q.answer]);
const qKey = (q) => q.qid || q.q;

export function setupTotalWar(deps) {
  const { io, filterQuestions, normalizeTopics, topicLabel, CHARACTERS, bank, isRoomCode = () => false } = deps;
  const SPEED = deps.SPEED || 1;
  const ms = (s) => (s * 1000) / SPEED;          // game seconds → real milliseconds (tests run faster)
  const sessions = new Map();                    // code -> session
  const CHAR_IDS = new Set(CHARACTERS.map((c) => c.id));

  // ------------------------------------------------------------------ sessions
  function newCode() {
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    let c;
    do { c = "W" + Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * letters.length)]).join(""); }
    while (sessions.has(c) || isRoomCode(c));
    return c;
  }
  const defaultSettings = () => ({ commander: "Mr Cedric", topic: null, turns: 12, crimsonSeconds: PREPARE_SECONDS, crystalSeconds: 150, target: 25, warlordPct: 80 });

  function createSession() {
    const S = {
      code: newCode(), hostToken: token(), createdAt: Date.now(), lastActive: Date.now(),
      status: "lobby", winner: null, settings: defaultSettings(),
      students: new Map(), pairs: new Map(), bands: new Map(), units: new Map(), battles: new Map(),
      camps: Object.fromEntries(Object.keys(CAMPS).map((n) => [n, { alive: true, hp: CAMPS[n].hp, returnTurn: 0 }])),
      gate: { hp: UNITS.golem.hp, max: UNITS.golem.hp, broken: false },
      warlord: { hp: UNITS.warlord.hp, max: UNITS.warlord.hp, released: false },
      ward: { hp: WARD_HP, max: WARD_HP }, endedBy: null,
      buffs: {}, rally: new Set(), turn: 0, phase: null, phaseEndsAt: 0, phaseStartedAt: 0, teacherEnded: false,
      energy: 0, seq: 0, log: [], pool: null, timer: null, dirty: false,
    };
    sessions.set(S.code, S);
    return S;
  }
  const id = (S, p) => `${p}${++S.seq}`;
  const say = (S, text, tone = "info") => { S.log.push({ t: Date.now(), text, tone }); if (S.log.length > 30) S.log.shift(); };

  // ------------------------------------------------------------------ helpers
  const pairOf = (S, pid) => S.pairs.get(S.students.get(pid)?.pairId);
  const bandOf = (S, pairId) => [...S.bands.values()].find((b) => b.pairs.includes(pairId));
  const unitsAt = (S, n) => [...S.units.values()].filter((u) => u.node === n);
  const bandsAt = (S, n) => [...S.bands.values()].filter((b) => b.node === n);
  const crystalAt = (S, n) => bandsAt(S, n).length > 0;
  const buffOn = (S) => Object.fromEntries(Object.entries(S.buffs).filter(([, until]) => until >= S.turn).map(([k]) => [k, true]));
  const studentsOfBand = (S, b) => b.pairs.flatMap((pid) => S.pairs.get(pid)?.members || []);
  const pairLabel = (S, p) => `Pair ${p.no}`;
  const isConnected = (s) => s.sockets.size > 0;
  const warlordReady = (S) => {
    if (S.warlord.released) return true;
    const st = [...S.students.values()];
    if (!st.length) return false;
    return st.filter((s) => s.answered >= S.settings.target).length * 100 >= st.length * S.settings.warlordPct;
  };
  const campAt = (S, n) => (CAMPS[n] && S.camps[n].alive ? CAMPS[n] : null);
  const blocked = (S, n) => unitsAt(S, n).length > 0 || !!campAt(S, n) || n === FORTRESS;

  // fortress defenders: summoned units there, then the gate guardian, or the Warlord once the gate is broken
  function fortressEnemies(S) {
    const list = unitsAt(S, FORTRESS).map((u) => unitEnemy(S, u));
    if (!S.gate.broken) list.push({ ref: "gate", type: "golem", hp: S.gate.hp, max: S.gate.max, atk: UNITS.golem.atk });
    else list.push({ ref: "warlord", type: "warlord", hp: S.warlord.hp, max: S.warlord.max, atk: UNITS.warlord.atk });
    return list;
  }

  // ------------------------------------------------------------------ questions
  function poolOf(S) {
    if (!S.pool) S.pool = filterQuestions(S.settings.topic);
    return S.pool;
  }
  // Each student gets fresh questions; a wrong one comes back after a few others (as in the Arena).
  function pickFor(S, st) {
    const pool = poolOf(S);
    const due = st.redo.find((r) => r.after <= st.answered);
    if (due) { st.redo = st.redo.filter((r) => r !== due); const q = pool.find((x) => qKey(x) === due.key); if (q) return { q, retry: true }; }
    let fresh = pool.filter((q) => !st.seen.has(qKey(q)));
    if (!fresh.length) { st.seen.clear(); fresh = pool.slice(); }
    const q = fresh[Math.floor(Math.random() * fresh.length)];
    st.seen.add(qKey(q));
    return { q, retry: false };
  }
  const publicQ = (q, startedAt, extra = {}) => ({
    q: q.q, choices: q.choices, topic: q.topic || "", image: q.image || null,
    startedAt, recall: READ_SECONDS, seconds: ANSWER_SECONDS, ...extra,
  });
  const questionEnds = (Q) => Q.startedAt + ms(Q.recall + Q.seconds);
  const reading = (Q) => Date.now() < Q.startedAt + ms(Q.recall) - 150;

  function record(S, st, q, chosen) {
    const ok = chosen >= 0 && rightAnswers(q).includes(chosen);
    st.answered++; if (ok) st.correct++; else { st.wrong++; st.redo.push({ key: qKey(q), after: st.answered + 3 }); }
    st.lastAnswerAt = Date.now();
    st.history.push({ key: qKey(q), lo: q.lo || q.topic || "", ok });
    return ok;
  }

  // A student's own question when they are not in a battle: muster (MP for the next move) or a War Cry.
  function giveOwnQuestion(S, st, kind, battleId = null) {
    const { q, retry } = pickFor(S, st);
    st.own = { kind, battleId, q, startedAt: Date.now(), retry, result: null };
    S.dirty = true;
  }

  // ------------------------------------------------------------------ pairing and joining
  function addStudent(S, name) {
    const st = {
      pid: id(S, "s"), token: token(), name: String(name || "").trim().slice(0, 20) || "Student",
      sockets: new Set(), pairId: null, want: null, char: null, ready: false, answered: 0, correct: 0, wrong: 0, musterThisTurn: 0,
      seen: new Set(), redo: [], history: [], own: null, lastAnswerAt: 0, joinedAt: Date.now(),
    };
    S.students.set(st.pid, st);
    return st;
  }
  function makePair(S, members) {
    const no = Math.max(0, ...[...S.pairs.values()].map((p) => p.no)) + 1;
    const p = { id: id(S, "p"), no, members, char: members.map((m) => S.students.get(m)?.char).find(Boolean) || null, bank: 0 };
    S.pairs.set(p.id, p);
    for (const m of members) { const st = S.students.get(m); st.pairId = p.id; st.want = null; }
    if (S.status === "playing") placePair(S, p);
    return p;
  }
  function dissolvePair(S, p) {
    for (const m of p.members) { const st = S.students.get(m); if (st) st.pairId = null; }
    const b = bandOf(S, p.id); if (b) { b.pairs = b.pairs.filter((x) => x !== p.id); if (!b.pairs.length) S.bands.delete(b.id); }
    S.pairs.delete(p.id);
  }
  function placePair(S, p) {
    if (!p.char) p.char = [...CHAR_IDS][p.no % CHAR_IDS.size];
    const b = { id: id(S, "b"), pairs: [p.id], node: HOME, mp: S.phase === "crystal" ? pairMP(0, buffOn(S)) : 0, done: S.phase !== "crystal", votes: {}, voteOpenedAt: 0, battle: null };
    S.bands.set(b.id, b);
  }

  // ------------------------------------------------------------------ turns
  function startGame(S) {
    if (S.status !== "lobby") return "The game has already started.";
    const loose = [...S.students.values()].filter((s) => !s.pairId);
    for (const st of loose) makePair(S, [st.pid]);          // anyone without a partner marches alone
    if (!S.pairs.size) return "No one has joined yet.";
    S.pool = null; poolOf(S);
    S.status = "playing";
    for (const p of S.pairs.values()) placePair(S, p);
    say(S, "The war begins. The Crystal banners muster at the fortress.", "big");
    startCrimson(S);
    S.timer = setInterval(() => tick(S), Math.max(20, 200 / SPEED));
    return null;
  }

  function startCrimson(S) {
    S.turn++;
    if (S.turn > S.settings.turns) return endGame(S, "crimson");
    S.phase = "crimson"; S.teacherEnded = false;
    if (siegeAcademy(S)) return;
    S.phaseStartedAt = Date.now(); S.phaseEndsAt = Date.now() + ms(S.settings.crimsonSeconds);
    S.energy = Math.min(S.energy, energyCarry) + energyPerTurn(S.pairs.size);
    for (const u of S.units.values()) u.moved = 0;
    for (const [n, c] of Object.entries(S.camps)) if (!c.alive && c.returnTurn <= S.turn) { c.alive = true; c.hp = CAMPS[n].hp; say(S, `${CAMPS[n].name} has returned to ${nodeName(+n)}.`); }
    for (const st of S.students.values()) { st.musterThisTurn = 0; if (!st.own || st.own.kind !== "muster") st.own = null; }
    for (const b of S.bands.values()) { b.done = true; b.votes = {}; }
    say(S, `Turn ${S.turn}. The Crimson Host moves.`, "crimson");
    S.dirty = true;
  }

  function startCrystal(S) {
    S.phase = "crystal";
    S.phaseStartedAt = Date.now(); S.phaseEndsAt = Date.now() + ms(S.settings.crystalSeconds);
    const buffs = buffOn(S);
    for (const p of S.pairs.values()) { p.mp = pairMP(p.bank, buffs); p.bank = 0; }
    for (const b of S.bands.values()) {
      const active = b.pairs.map((x) => S.pairs.get(x)).filter((p) => p && p.members.some((m) => isConnected(S.students.get(m))));
      b.mp = Math.min(...(active.length ? active : b.pairs.map((x) => S.pairs.get(x))).map((p) => p.mp));
      b.done = false; b.votes = {}; b.voteOpenedAt = 0;
    }
    for (const st of S.students.values()) st.own = null;           // the map comes first in the Crystal turn
    say(S, `Turn ${S.turn}. Your move, Crystal commanders.`, "crystal");
    S.dirty = true;
  }

  function endGame(S, winner, how = null) {
    S.status = "ended"; S.winner = winner; S.phase = null; S.endedBy = how;
    clearInterval(S.timer); S.timer = null;
    say(S, winner === "crystal" ? "The Crimson Warlord has fallen. The Crystal army wins!" : how === "ward" ? "The Academy Ward is broken. The Crimson Host wins this war." : "The Crimson Fortress stands. The Crimson Host wins this war.", "big");
  }

  // ------------------------------------------------------------------ the clock
  function tick(S) {
    if (S.status !== "playing") return;
    const now = Date.now();
    // every student's own question (muster or War Cry)
    for (const st of S.students.values()) {
      const o = st.own;
      if (o && !o.result && now >= questionEnds(o)) answerOwn(S, st, -1);
      if (o && o.result && now >= o.result.at + ms(1.8)) { st.own = null; S.dirty = true; }
      if (!st.own) maybeGiveQuestion(S, st);
    }
    // warband votes that have waited long enough
    for (const b of S.bands.values()) if (b.voteOpenedAt && now >= b.voteOpenedAt + ms(VOTE_SECONDS)) resolveVote(S, b);
    // battles
    for (const B of S.battles.values()) battleTick(S, B, now);
    // phase ends
    if (S.phase === "crimson") {
      // the class prepares for at most crimsonSeconds (30 s); it ends sooner once the teacher has ended the turn
      // and everyone has answered their preparing questions
      const musterDone = [...S.students.values()].every((st) => st.musterThisTurn >= MUSTER_PER_TURN || !isConnected(st));
      if ((S.teacherEnded && musterDone) || now >= S.phaseEndsAt) { runOrders(S); startCrystal(S); }
    } else if (S.phase === "crystal") {
      const allDone = [...S.bands.values()].every((b) => b.done || b.battle);
      if ((allDone && !S.battles.size) || now >= S.phaseEndsAt) {
        for (const b of S.bands.values()) if (!b.battle) b.done = true;
        if (S.battles.size) { S.phase = "battles"; S.dirty = true; say(S, "The last battles of this turn are being fought."); }
        else startCrimson(S);
      }
    } else if (S.phase === "battles" && !S.battles.size) startCrimson(S);
    flush(S);
  }

  // Who answers what when they are not fighting: during a battle anywhere, a War Cry for it; otherwise muster.
  function maybeGiveQuestion(S, st) {
    const p = pairOf(S, st.pid); if (!p) return;
    const b = bandOf(S, p.id); if (!b) return;
    if (b.battle) return;                                         // fighters answer the battle's own questions
    if (S.phase === "crimson") return giveOwnQuestion(S, st, "muster");
    if (!b.done) return;                                          // still moving: the map is theirs
    const open = [...S.battles.values()].find((B) => B.status === "fight");
    giveOwnQuestion(S, st, open ? "warcry" : "muster", open ? open.id : null);
  }

  function answerOwn(S, st, chosen) {
    const o = st.own; if (!o || o.result) return;
    if (chosen >= 0 && reading(o)) return;
    const ok = record(S, st, o.q, chosen);
    o.result = { ok, chosen, right: rightAnswers(o.q)[0], at: Date.now() };
    if (o.kind === "muster") {
      st.musterThisTurn++;
      const p = pairOf(S, st.pid); if (ok && p) p.bank++;
    } else if (o.kind === "warcry") {
      const B = S.battles.get(o.battleId);
      if (B && ok) { B.warcryNow++; B.cheers.set(st.pairId, (B.cheers.get(st.pairId) || 0) + 1); }
    }
    S.dirty = true;
  }

  // ------------------------------------------------------------------ moving: one step at a time, by vote
  function canStep(S, b, to) {
    if (S.phase !== "crystal") return "Wait for your turn.";
    if (b.battle) return "Your warband is in a battle.";
    if (b.done) return "Your warband has finished moving this turn.";
    if (to === "stay") return null;
    if (!Number.isInteger(to) || !isAdjacent(b.node, to)) return "You can only move one stop at a time, along a road.";
    if (cost(b.node, to) > b.mp) return "Not enough MP for that road.";
    if (to === FORTRESS && S.gate.broken && !warlordReady(S)) return "The Warlord has not come out yet.";
    const B = battleAt(S, to);
    if (B && B.status !== "gather") return "A battle is being fought there. Wait for it to end.";
    return null;
  }

  function vote(S, pairId, to) {
    const b = bandOf(S, pairId); if (!b) return "You are not on the map yet.";
    const err = canStep(S, b, to); if (err) return err;
    b.votes[pairId] = to;
    if (!b.voteOpenedAt) b.voteOpenedAt = Date.now();
    const active = b.pairs.filter((x) => S.pairs.get(x)?.members.some((m) => isConnected(S.students.get(m))));
    if ((active.length ? active : b.pairs).every((x) => b.votes[x] !== undefined)) resolveVote(S, b);
    S.dirty = true;
    return null;
  }

  function resolveVote(S, b) {
    b.voteOpenedAt = 0; S.dirty = true;
    const choice = tallyVotes(b.votes, b.pairs); b.votes = {};
    if (choice == null) return;
    if (choice === "stay" || canStep(S, b, choice)) { b.done = true; return; }
    const from = b.node;
    b.mp -= cost(from, choice);
    const B = battleAt(S, choice);
    if (B) { const err = joinBattle(S, b.pairs[0], B.id); if (err) b.done = true; return; }
    b.node = choice;
    if (OUTPOSTS.includes(choice) && !unitsAt(S, choice).length && !S.rally.has(choice)) { S.rally.add(choice); say(S, `The class has taken ${nodeName(choice)}. It is now a rally point.`, "crystal"); }
    // stepping onto the Crimson Host, a jungle camp or the fortress starts a battle
    if (choice === FORTRESS) startBattle(S, b, S.gate.broken ? "boss" : "gate");
    else if (unitsAt(S, choice).length) startBattle(S, b, "host");
    else if (campAt(S, choice)) startBattle(S, b, "camp");
    if (!b.battle && (b.mp <= 0 || !neighbours(b.node).some((n) => cost(b.node, n) <= b.mp))) b.done = true;
  }

  function joinBand(S, pairId, targetId) {
    const mine = bandOf(S, pairId), target = S.bands.get(targetId);
    if (!mine || !target || mine === target) return "That warband is not here.";
    if (mine.node !== target.node) return "You can only join a warband on the same stop.";
    if (mine.battle || target.battle) return "Not while a battle is on.";
    mine.pairs = mine.pairs.filter((x) => x !== pairId);
    target.pairs.push(pairId);
    if (S.phase === "crystal") { target.mp = Math.min(target.mp, mine.mp); target.done = target.done && mine.done; }
    if (!mine.pairs.length) S.bands.delete(mine.id);
    target.votes = {}; target.voteOpenedAt = 0;
    say(S, `${pairLabel(S, S.pairs.get(pairId))} joined a warband at ${nodeName(target.node)}.`, "crystal");
    return null;
  }
  function leaveBand(S, pairId) {
    const b = bandOf(S, pairId); if (!b || b.pairs.length < 2) return "You are not in a warband.";
    if (b.battle) return "Not while a battle is on.";
    b.pairs = b.pairs.filter((x) => x !== pairId); delete b.votes[pairId];
    S.bands.set(id(S, "b"), { id: `b${S.seq}`, pairs: [pairId], node: b.node, mp: b.mp, done: b.done, votes: {}, voteOpenedAt: 0, battle: null });
    return null;
  }

  // ------------------------------------------------------------------ battles
  // As in the Arena: each question one fighter is the Striker and answers it; everyone else in the battle
  // answers the same question as support. A wrong Striker can have the strike stolen (at half power) by the
  // first supporter who got it right. After every question the Crimson hits back at the warband's Resolve.
  const battleAt = (S, n) => [...S.battles.values()].find((B) => B.node === n && B.status !== "over");
  const enemyOf = (e) => ({ ...e, atk: e.camp ? CAMPS[e.node]?.atk ?? 2 : UNITS[e.type]?.atk ?? 1 });

  function unitEnemy(S, u) {
    const e = { ref: u.id, type: u.type, hp: u.hp, max: u.max, atk: UNITS[u.type].atk };
    if (u.dugIn) { e.hp = Math.round(e.hp * (1 + HOLD_BONUS)); e.max = Math.round(e.max * (1 + HOLD_BONUS)); e.dug = HOLD_BONUS; }
    return e;
  }
  function applyAura(enemies) {
    const aura = auraFor(enemies);
    for (const e of enemies) if (aura && !e.aura && !UNITS[e.type]?.aura) { e.hp = Math.round(e.hp * (1 + aura)); e.max = Math.round(e.max * (1 + aura)); e.aura = aura; }
  }

  // kind: camp | host | gate | boss (the class attacks) or defend (the Crimson Host attacks a banner)
  function startBattle(S, b, kind, attackers = null) {
    const n = b ? b.node : attackers[0].node;
    let enemies;
    if (kind === "camp") enemies = [{ ref: "camp", type: CAMPS[n].id, hp: S.camps[n].hp, max: CAMPS[n].hp, atk: CAMPS[n].atk, camp: true }];
    else if (kind === "gate" || kind === "boss") enemies = fortressEnemies(S);
    else if (kind === "defend") enemies = attackers.map((u) => unitEnemy(S, u));
    else enemies = unitsAt(S, n).map((u) => unitEnemy(S, u));
    applyAura(enemies);
    const bandIds = kind === "defend" ? bandsAt(S, n).filter((x) => !x.battle).map((x) => x.id) : [b.id];
    const B = {
      id: id(S, "x"), node: n, kind, bands: bandIds, enemies, status: "gather", startedAt: Date.now(),
      gatherEnds: Date.now() + ms(JOIN_SECONDS), qNo: 0, limit: battleLength(kind === "defend" ? "host" : kind, buffOn(S)),
      q: null, striker: null, answers: new Map(), strikes: new Map(), warcryNow: 0, cheers: new Map(),
      resolve: 0, resolveMax: 0, round: null, resultUntil: 0, outcome: null, attackers: kind === "defend" ? attackers.map((u) => u.id) : [],
    };
    for (const bid of bandIds) { const x = S.bands.get(bid); x.battle = B.id; x.done = true; x.votes = {}; x.voteOpenedAt = 0; }
    for (const e of enemies) { const u = S.units.get(e.ref); if (u) u.battle = B.id; }
    S.battles.set(B.id, B);
    const what = kind === "camp" ? CAMPS[n].name : kind === "gate" ? "the gate guardian" : kind === "boss" ? "THE CRIMSON WARLORD" : "the Crimson Host";
    if (kind === "defend") say(S, `The Crimson Host attacks the Crystal banners at ${nodeName(n)}!`, "crimson");
    else say(S, `Battle at ${nodeName(n)} against ${what}!`, kind === "boss" ? "big" : "battle");
    return B;
  }

  // warbands one road away may join while the battle gathers
  const canJoinBattle = (S, b, B) => B.status === "gather" && !b.battle && (b.node === B.node || isAdjacent(b.node, B.node));
  function joinBattle(S, pairId, battleId) {
    const b = bandOf(S, pairId), B = S.battles.get(battleId);
    if (!b || !B) return "That battle is over.";
    if (!canJoinBattle(S, b, B)) return "Too late, or too far away, to join that battle.";
    b.node = B.node; b.battle = B.id; b.done = true; b.votes = {}; b.voteOpenedAt = 0;
    B.bands.push(b.id);
    say(S, `${b.pairs.map((x) => pairLabel(S, S.pairs.get(x))).join(", ")} joined the battle at ${nodeName(B.node)}.`, "crystal");
    return null;
  }

  const fightersOf = (S, B) => B.bands.flatMap((bid) => { const b = S.bands.get(bid); return b ? studentsOfBand(S, b) : []; });
  const pairsIn = (S, B) => B.bands.flatMap((bid) => S.bands.get(bid)?.pairs || []);

  function battleTick(S, B, now) {
    const was = B.status;
    battleStep(S, B, now);
    if (B.status !== was || !S.battles.has(B.id)) S.dirty = true;
  }
  function battleStep(S, B, now) {
    if (B.status === "gather" && now >= B.gatherEnds) {
      if (!pairsIn(S, B).length) return finishBattle(S, B, false);
      B.resolveMax = B.resolve = resolveFor(pairsIn(S, B).length);
      B.status = "fight"; nextBattleQuestion(S, B); return;
    }
    if (B.status === "fight" && B.q) {
      const fighters = fightersOf(S, B).filter((p) => isConnected(S.students.get(p)));
      const allIn = fighters.length && fighters.every((p) => B.answers.has(p));
      if (allIn || now >= questionEnds(B.q)) resolveBattleQuestion(S, B);
      return;
    }
    if (B.status === "result" && now >= B.resultUntil) {
      if (B.enemies.every((e) => e.hp <= 0)) return finishBattle(S, B, true);
      if (B.resolve <= 0 || B.qNo >= B.limit) return finishBattle(S, B, false);
      B.status = "fight"; nextBattleQuestion(S, B);
      return;
    }
    if (B.status === "over" && now >= B.resultUntil) { S.battles.delete(B.id); S.dirty = true; }
  }

  // The next Striker: whoever (still here) has struck least in this battle, taking pairs in turn
  function pickStriker(S, B) {
    const order = pairsIn(S, B).flatMap((pid) => S.pairs.get(pid)?.members || []);
    const live = order.filter((p) => isConnected(S.students.get(p)));
    const list = live.length ? live : order;
    let best = null;
    for (const p of list) if (best == null || (B.strikes.get(p) || 0) < (B.strikes.get(best) || 0)) best = p;
    return best;
  }

  function nextBattleQuestion(S, B) {
    const pool = poolOf(S);
    B.used = B.used || new Set();
    let fresh = pool.filter((q) => !B.used.has(qKey(q)));
    if (!fresh.length) { B.used.clear(); fresh = pool.slice(); }
    const q = fresh[Math.floor(Math.random() * fresh.length)];
    B.used.add(qKey(q));
    B.qNo++; B.answers = new Map(); B.warcryNow = 0;
    B.striker = pickStriker(S, B);
    B.strikes.set(B.striker, (B.strikes.get(B.striker) || 0) + 1);
    B.q = { ...publicQ(q, Date.now()), full: q };
  }

  function battleAnswer(S, st, chosen) {
    const B = [...S.battles.values()].find((x) => x.status === "fight" && fightersOf(S, x).includes(st.pid));
    if (!B || !B.q || B.answers.has(st.pid)) return;
    if (chosen >= 0 && reading(B.q)) return;
    const ok = record(S, st, B.q.full, chosen);
    B.answers.set(st.pid, { chosen, ok, at: Date.now() });
    S.dirty = true;
  }

  const who = (S, pid) => { const st = S.students.get(pid), p = st && S.pairs.get(st.pairId); return st ? { pid, name: st.name, pairNo: p?.no || null, char: p?.char || null } : null; };

  function resolveBattleQuestion(S, B) {
    for (const p of fightersOf(S, B)) if (!B.answers.has(p)) { const st = S.students.get(p); if (st && isConnected(st)) { record(S, st, B.q.full, -1); B.answers.set(p, { chosen: -1, ok: false, at: Infinity }); } }
    const strikerAns = B.answers.get(B.striker);
    const strike = !!strikerAns?.ok;
    const supporters = [...B.answers.entries()].filter(([p]) => p !== B.striker);
    const rightSup = supporters.filter(([, a]) => a.ok).sort((x, y) => x[1].at - y[1].at);
    const stealer = !strike && rightSup.length ? rightSup[0][0] : null;
    const support = rightSup.filter(([p]) => p !== stealer).length;
    const buffs = buffOn(S);
    const hits = questionHits({ strike, steal: !!stealer, support, warcry: B.warcryNow }, buffs);
    const mainHits = +questionHits({ strike, steal: !!stealer }, buffs).toFixed(2);
    const target = Math.max(0, B.enemies.findIndex((e) => e.hp > 0));
    const res = dealHits(B.enemies, hits);
    B.enemies = res.enemies;
    // the Crimson hits back, unless every enemy has fallen
    const answered = [...B.answers.values()];
    const frac = answered.length ? answered.filter((a) => a.ok).length / answered.length : 0;
    const counter = res.beaten ? { blows: [], guard: 0, total: 0 } : counterAttack(B.enemies, frac);
    B.resolve = Math.max(0, +(B.resolve - counter.total).toFixed(2));
    B.round = {
      qNo: B.qNo, striker: who(S, B.striker), strike, stealer: stealer ? who(S, stealer) : null,
      support, supporters: supporters.length, warcry: B.warcryNow, hits: +hits.toFixed(1), fallen: res.fallen, mainHits, target,
      enemiesAfter: B.enemies.map((e) => ({ hp: +(+e.hp).toFixed(1) })),
      counter: counter.blows, guard: +counter.guard.toFixed(2), counterTotal: counter.total, resolve: B.resolve,
      answer: rightAnswers(B.q.full)[0], q: B.q.q, choices: B.q.choices,
      mine: Object.fromEntries([...B.answers.entries()].map(([p, a]) => [p, { chosen: a.chosen, ok: a.ok }])),
      at: Date.now(),
    };
    B.status = "result"; B.resultUntil = Date.now() + ms(5.2);
    B.q = null;
    S.dirty = true;
  }

  // Where a beaten warband falls back to: the nearest rally point or the Academy that the Crimson Host is not standing on
  function fallbackFor(S, from) {
    const d = hops(from), free = (n) => !unitsAt(S, n).length && !battleAt(S, n);
    const spots = [HOME, ...S.rally].filter(free).sort((a, b) => (d.get(a) ?? 99) - (d.get(b) ?? 99));
    if (spots.length) return spots[0];
    const h = hops(HOME);
    return [...h.keys()].filter((n) => free(n) && n !== FORTRESS && !CAMPS[n]).sort((a, b) => h.get(a) - h.get(b))[0] ?? HOME;
  }

  function finishBattle(S, B, won) {
    B.status = "over"; B.outcome = won ? "won" : "lost"; B.resultUntil = Date.now() + ms(4);
    const n = B.node, unBoost = (e) => e.hp / (1 + (e.aura || 0)) / (1 + (e.dug || 0));
    // write damage back to whatever survives
    for (const e of B.enemies) {
      if (e.ref === "gate") { S.gate.hp = Math.max(0, Math.round(unBoost(e))); if (S.gate.hp <= 0) S.gate.broken = true; }
      else if (e.ref === "warlord") S.warlord.hp = Math.max(0, Math.round(unBoost(e)));
      else if (e.ref === "camp") { /* camps heal if not beaten */ }
      else { const u = S.units.get(e.ref); if (u) { u.battle = null; if (e.hp <= 0) S.units.delete(u.id); else u.hp = Math.max(1, Math.round(unBoost(e))); } }
    }
    const bands = B.bands.map((x) => S.bands.get(x)).filter(Boolean);
    for (const b of bands) b.battle = null;
    if (B.kind === "defend") {
      const attackers = B.attackers.map((x) => S.units.get(x)).filter(Boolean);
      if (won) say(S, `The Crystal banners at ${nodeName(n)} beat off the attack!`, "crystal");
      else if (B.resolve <= 0 || !bands.length) {
        const back = fallbackFor(S, n);
        for (const b of bands) b.node = back;
        say(S, `The Crimson Host breaks the banners at ${nodeName(n)}. They fall back to ${nodeName(back)}.`, "crimson");
        if (S.rally.has(n)) { S.rally.delete(n); say(S, `The Crimson Host has taken ${nodeName(n)}.`, "crimson"); }
      } else {
        for (const u of attackers) u.node = u.from ?? u.node;      // the banners held: the attackers pull back
        say(S, `The banners at ${nodeName(n)} hold. The Crimson Host pulls back.`, "crystal");
      }
      S.dirty = true;
      return;
    }
    if (won) {
      if (B.kind === "camp") {
        const c = CAMPS[n]; S.camps[n] = { alive: false, hp: c.hp, returnTurn: S.turn + CAMP_RETURN_TURNS };
        if (c.buff === "siege") { S.gate.hp = Math.max(1, S.gate.hp - 15); say(S, `${c.name} is beaten! ${c.buffText}.`, "crystal"); }
        else { S.buffs[c.buff] = S.turn + c.turns - (S.phase === "crimson" ? 1 : 0); say(S, `${c.name} is beaten! ${c.buffName}: ${c.buffText}.`, "crystal"); }
      } else if (B.kind === "gate") {
        S.gate.broken = true; S.gate.hp = 0;
        say(S, `The gate of the Crimson Fortress is broken!`, "big");
      } else if (B.kind === "boss") {
        S.warlord.hp = 0;
        return endGame(S, "crystal");
      } else say(S, `The Crimson Host at ${nodeName(n)} is defeated!`, "crystal");
      // the fortress itself cannot be stood in: winners at the gate fall back one road to rest
      if (n === FORTRESS) { const back = neighbours(FORTRESS).find((m) => !unitsAt(S, m).length) ?? fallbackFor(S, n); for (const b of bands) b.node = back; }
      else if (OUTPOSTS.includes(n) && !S.rally.has(n)) { S.rally.add(n); say(S, `The class has taken ${nodeName(n)}. It is now a rally point.`, "crystal"); }
    } else {
      const back = fallbackFor(S, n);
      for (const b of bands) b.node = back;
      if (B.kind === "camp") S.camps[n].hp = CAMPS[n].hp;
      say(S, `The battle at ${nodeName(n)} is lost. The warband falls back to ${nodeName(back)}.`, "crimson");
    }
    S.dirty = true;
  }

  // ------------------------------------------------------------------ the teacher's Crimson turn
  function summon(S, type) {
    if (S.status !== "playing") return "The war is not on.";
    const u = UNITS[type]; if (!u || u.fixed) return "That unit cannot be summoned.";
    if (S.energy < u.cost) return "Not enough Rift Energy.";
    if (unitsAt(S, FORTRESS).length >= FORTRESS_LIMIT) return "The fortress is full. Move some units out first.";
    S.energy -= u.cost;
    const unit = { id: id(S, "u"), type, node: FORTRESS, hp: u.hp, max: u.hp, moved: 0, order: null, dugIn: false, battle: null, from: null };
    S.units.set(unit.id, unit);
    return null;
  }

  // One road for one unit. Stepping onto Crystal banners is an attack.
  function moveUnit(S, unitId, to, { auto = false } = {}) {
    if (S.phase !== "crimson") return "You can only move the Host in your turn.";
    const u = S.units.get(unitId); if (!u) return "That unit has gone.";
    if (u.battle) return "That unit is in a battle.";
    if (!isAdjacent(u.node, to)) return "Units move one road at a time.";
    if (u.moved + cost(u.node, to) > UNITS[u.type].speed) return `${UNITS[u.type].name} has no moves left this turn.`;
    if (CAMPS[to]) return "The jungle camps belong to no one.";
    const B = battleAt(S, to);
    if (B && !(B.kind === "defend" && B.status === "gather")) return "A battle is being fought there.";
    if (to !== FORTRESS && unitsAt(S, to).length >= STACK_LIMIT) return `No more than ${STACK_LIMIT} units on one stop.`;
    if (to === FORTRESS && unitsAt(S, to).length >= FORTRESS_LIMIT) return "The fortress is full.";
    if (!auto && u.order?.kind !== "hold") u.order = null;       // a hand move replaces a march or hunt order
    u.from = u.node; u.moved += cost(u.node, to); u.node = to; u.dugIn = false;
    if (B) {                                                       // join an attack that is still gathering
      const e = unitEnemy(S, u); B.enemies.push(e); B.attackers.push(u.id); u.battle = B.id;
      for (const x of B.enemies) if (x.aura && !UNITS[x.type]?.aura) { x.hp = x.hp / (1 + x.aura); x.max = x.max / (1 + x.aura); x.aura = 0; }
      applyAura(B.enemies);
      return null;
    }
    if (crystalAt(S, to)) { startBattle(S, null, "defend", [u]); return null; }
    if (S.rally.has(to)) { S.rally.delete(to); say(S, `The Crimson Host has retaken ${nodeName(to)}.`, "crimson"); }
    if (to === HOME) say(S, `The Crimson Host is at the gates of the Crystal Academy!`, "crimson");
    return null;
  }

  // Standing orders: march (to a stop, turn after turn), hold (dig in), hunt (chase the nearest banner).
  // They play out when the teacher ends the Crimson turn.
  function setOrder(S, unitIds, order) {
    const list = (Array.isArray(unitIds) ? unitIds : [unitIds]).map((x) => S.units.get(x)).filter(Boolean);
    if (!list.length) return "Pick some units first.";
    let o = null;
    if (order?.kind === "hold") o = { kind: "hold" };
    else if (order?.kind === "hunt") o = { kind: "hunt" };
    else if (order?.kind === "march") { const to = +order.to; if (!Number.isInteger(to) || !NODES[to] || CAMPS[to]) return "Pick a stop on a road to march to."; o = { kind: "march", to }; }
    for (const u of list) { u.order = o; if (!o || o.kind !== "hold") u.dugIn = false; }
    return null;
  }

  function huntTarget(S, u) {
    const d = hops(u.node); let best = null;
    for (const b of S.bands.values()) if ((d.get(b.node) ?? 99) < (best == null ? 99 : d.get(best))) best = b.node;
    return best;
  }
  function runOrders(S) {
    for (const u of [...S.units.values()]) {
      if (!S.units.has(u.id) || u.battle || !u.order || u.order.kind === "hold") continue;
      for (let k = 0; k < 6 && !u.battle; k++) {
        const target = u.order.kind === "march" ? u.order.to : huntTarget(S, u);
        if (target == null || target === u.node) break;
        const step = stepTowards(u.node, target, (n) => !CAMPS[n]);
        if (step == null || moveUnit(S, u.id, step, { auto: true })) break;
      }
      if (u.order?.kind === "march" && u.node === u.order.to) u.order = null;
    }
    // holding a whole turn digs a unit in (tougher in its next battle)
    for (const u of S.units.values()) u.dugIn = u.order?.kind === "hold" && u.moved === 0;
  }

  // Auto: spend energy on Orc Vanguards, and every unit without orders hunts
  function autoTurn(S) {
    if (S.phase !== "crimson") return "Auto only works in your turn.";
    while (S.energy >= 2 && unitsAt(S, FORTRESS).length < FORTRESS_LIMIT) summon(S, "orc_vanguard");
    for (const u of S.units.values()) if (!u.order) u.order = { kind: "hunt" };
    S.teacherEnded = true;
    return null;
  }

  // The Crimson Host besieging the Academy: at the start of each Crimson turn, units standing on it (with no
  // Crystal banner there to fight them) wear down the Academy Ward. If it breaks, the Crimson Host wins.
  function siegeAcademy(S) {
    const here = unitsAt(S, HOME).filter((u) => !u.battle);
    if (!here.length || crystalAt(S, HOME)) return false;
    const dmg = here.reduce((n, u) => n + siegeOf(u.type), 0);
    S.ward.hp = Math.max(0, S.ward.hp - dmg);
    say(S, S.ward.hp > 0 ? `The Crimson Host batters the Academy Ward (${S.ward.hp} left). Drive them out!` : "The Academy Ward has broken.", "crimson");
    if (S.ward.hp <= 0) { endGame(S, "crimson", "ward"); return true; }
    return false;
  }

  // ------------------------------------------------------------------ views
  const bandView = (S, b) => ({
    id: b.id, node: b.node, mp: b.mp, done: b.done, battle: b.battle, voting: !!b.voteOpenedAt,
    voteEnds: b.voteOpenedAt ? b.voteOpenedAt + ms(VOTE_SECONDS) : 0,
    pairs: b.pairs.map((x) => { const p = S.pairs.get(x); return p ? { id: p.id, no: p.no, char: p.char, names: p.members.map((m) => S.students.get(m)?.name || "?"), vote: b.votes[x] ?? null } : null; }).filter(Boolean),
  });
  const unitView = (u, full) => ({ id: u.id, type: u.type, node: u.node, hp: u.hp, max: u.max, moved: u.moved, speed: UNITS[u.type].speed,
    atk: UNITS[u.type].atk, dugIn: !!u.dugIn, battle: u.battle || null, ...(full ? { order: u.order } : {}) });
  function battleView(S, B, forPid) {
    const fighters = fightersOf(S, B);
    const v = {
      id: B.id, node: B.node, kind: B.kind, status: B.status, qNo: B.qNo, limit: B.limit,
      gatherEnds: B.gatherEnds, resolve: +(+B.resolve).toFixed(1), resolveMax: B.resolveMax,
      enemies: B.enemies.map((e) => ({ type: e.type, hp: +(+e.hp).toFixed(1), max: +(+e.max).toFixed(1), atk: e.atk, dug: !!e.dug, aura: !!e.aura })),
      bands: B.bands.map((x) => S.bands.get(x)).filter(Boolean).map((b) => bandView(S, b)),
      fighters: fighters.length, answered: B.answers.size,
      striker: B.status === "fight" ? who(S, B.striker) : null,
      round: B.status === "result" || B.status === "over" ? { ...B.round, mine: undefined } : null,
      outcome: B.outcome, cheers: [...B.cheers.entries()].map(([pid, n]) => ({ pair: S.pairs.get(pid)?.no, n })),
    };
    if (forPid !== undefined && fighters.includes(forPid)) {
      v.role = B.striker === forPid ? "striker" : "support";
      if (B.q) { const mine = B.answers.get(forPid); v.question = { ...B.q, full: undefined, mine: mine ? { chosen: mine.chosen } : null }; }
      if (v.round && B.round?.mine) v.round.my = B.round.mine[forPid] || null;
    }
    return v;
  }
  function classView(S, visible) {
    const sees = (n) => !visible || visible.has(n);
    return {
      code: S.code, status: S.status, winner: S.winner, turn: S.turn, turns: S.settings.turns,
      phase: S.phase, phaseEndsAt: S.phaseEndsAt, serverNow: Date.now(), speed: SPEED,
      topic: topicLabel(S.settings.topic), commander: S.settings.commander,
      bands: [...S.bands.values()].map((b) => bandView(S, b)),
      units: [...S.units.values()].filter((u) => sees(u.node)).map((u) => unitView(u, !visible)),
      ward: { ...S.ward }, endedBy: S.endedBy,
      camps: Object.entries(S.camps).map(([n, c]) => ({ node: +n, alive: c.alive, hp: c.hp, returnTurn: c.returnTurn })),
      gate: { ...S.gate, defenders: unitsAt(S, FORTRESS).length },
      warlord: { hp: S.warlord.hp, max: S.warlord.max, out: S.gate.broken && warlordReady(S) },
      buffs: Object.entries(S.buffs).filter(([, until]) => until >= S.turn).map(([k, until]) => ({ key: k, until })),
      rally: [...S.rally], visible: visible ? [...visible] : null,
      battles: [...S.battles.values()].filter((B) => sees(B.node)).map((B) => battleView(S, B)),
      log: S.log.slice(-8),
    };
  }
  const classVisible = (S) => visibleNodes([...S.bands.values()].map((b) => b.node), { rally: [...S.rally], sightAll: !!buffOn(S).sight });

  function studentView(S, st) {
    const vis = S.status === "playing" ? classVisible(S) : null;
    const v = classView(S, vis);
    const p = pairOf(S, st.pid), b = p && bandOf(S, p.id);
    v.me = { pid: st.pid, name: st.name, pairId: p?.id || null, pairNo: p?.no || null, char: p?.char || null, bandId: b?.id || null,
      partner: p ? p.members.filter((m) => m !== st.pid).map((m) => S.students.get(m)?.name) : [], bank: p?.bank || 0 };
    v.me.want = st.want; v.me.myChar = st.char; v.me.ready = st.ready;
    v.lobby = S.status === "lobby" ? {
      students: [...S.students.values()].map((s) => ({ pid: s.pid, name: s.name, pairId: s.pairId, want: s.want, ready: s.ready, connected: isConnected(s) })),
      pairs: [...S.pairs.values()].map((x) => ({ id: x.id, no: x.no, char: x.char, names: x.members.map((m) => S.students.get(m)?.name) })),
    } : null;
    if (st.own) v.own = { kind: st.own.kind, battleId: st.own.battleId, retry: st.own.retry, result: st.own.result,
      question: publicQ(st.own.q, st.own.startedAt) };
    if (b?.battle) { const B = S.battles.get(b.battle); if (B) v.myBattle = battleView(S, B, st.pid); }
    // battles this warband could still join
    if (b && !b.battle) v.joinable = [...S.battles.values()].filter((B) => canJoinBattle(S, b, B)).map((B) => ({ id: B.id, node: B.node, kind: B.kind, gatherEnds: B.gatherEnds }));
    return v;
  }

  function hostView(S) {
    const v = classView(S, null);
    v.settings = S.settings; v.energy = S.energy; v.teacherEnded = S.teacherEnded;
    v.warlordReady = warlordReady(S);
    const now = Date.now();
    v.students = [...S.students.values()].map((s) => ({
      pid: s.pid, name: s.name, pairNo: pairOf(S, s.pid)?.no || null, answered: s.answered, correct: s.correct, ready: s.ready,
      connected: isConnected(s), quiet: S.status === "playing" && isConnected(s) && now - Math.max(s.lastAnswerAt, S.phaseStartedAt) > ms(90),
    }));
    v.pairs = [...S.pairs.values()].map((x) => ({ id: x.id, no: x.no, char: x.char, names: x.members.map((m) => S.students.get(m)?.name) }));
    v.onTarget = v.students.filter((s) => s.answered >= S.settings.target).length;
    v.sets = bank ? bank.playableSets() : [];
    return v;
  }

  // ------------------------------------------------------------------ sending
  function flush(S) {
    if (!S.dirty) return;
    S.dirty = false; S.lastActive = Date.now();
    const host = hostView(S);
    io.to(`tw:${S.code}:host`).emit("twHost", host);
    io.to(`tw:${S.code}:watch`).emit("twPublic", classView(S, S.status === "playing" ? classVisible(S) : null));
    for (const st of S.students.values()) for (const sid of st.sockets) io.to(sid).emit("twState", studentView(S, st));
  }
  const touch = (S) => { S.dirty = true; flush(S); };

  // ------------------------------------------------------------------ sockets
  function bind(socket) {
    const fail = (m) => socket.emit("twError", m);
    const hostS = () => { const S = sessions.get(socket.data.twHost); return S; };
    const asHost = (fn) => (arg = {}) => { const S = hostS(); if (!S) return fail("This war is not running any more."); const err = fn(S, arg); if (err) fail(err); touch(S); };
    const me = () => { const S = sessions.get(socket.data.twCode); const st = S?.students.get(socket.data.twPid); return S && st ? { S, st } : null; };
    const asStudent = (fn) => (arg = {}) => { const m = me(); if (!m) return fail("Join the war again with its code."); const err = fn(m.S, m.st, arg); if (err) fail(err); touch(m.S); };

    // teacher
    socket.on("twCreate", () => {
      const S = createSession();
      socket.data.twHost = S.code; socket.join(`tw:${S.code}:host`);
      socket.emit("twHosting", { code: S.code, hostToken: S.hostToken });
      touch(S);
    });
    socket.on("twResume", ({ code, hostToken } = {}) => {
      const S = sessions.get(String(code || "").toUpperCase());
      if (!S || S.hostToken !== hostToken) return socket.emit("twGone");
      socket.data.twHost = S.code; socket.join(`tw:${S.code}:host`);
      socket.emit("twHosting", { code: S.code, hostToken: S.hostToken });
      touch(S);
    });
    socket.on("twSettings", asHost((S, s) => {
      if (S.status !== "lobby") return "Settings are fixed once the war starts.";
      if ("topic" in s) S.settings.topic = normalizeTopics(s.topic);
      if ("commander" in s) S.settings.commander = String(s.commander || "").trim().slice(0, 30) || "Your teacher";
      for (const k of ["turns", "crimsonSeconds", "crystalSeconds", "target", "warlordPct"]) if (k in s) {
        const lim = { turns: [4, 30], crimsonSeconds: [20, 120], crystalSeconds: [60, 300], target: [5, 60], warlordPct: [0, 100] }[k];
        const n = Math.round(+s[k]); if (Number.isFinite(n)) S.settings[k] = Math.max(lim[0], Math.min(lim[1], n));
      }
      S.pool = null;
    }));
    socket.on("twStart", asHost((S) => startGame(S)));
    socket.on("twSummon", asHost((S, { type }) => summon(S, type)));
    socket.on("twMoveUnit", asHost((S, { unitId, to }) => moveUnit(S, unitId, +to)));
    socket.on("twOrder", asHost((S, { unitIds, order }) => setOrder(S, unitIds, order)));
    socket.on("twEndTurn", asHost((S) => { if (S.phase !== "crimson") return "It is not your turn."; S.teacherEnded = true; }));
    socket.on("twAuto", asHost((S) => autoTurn(S)));
    socket.on("twRelease", asHost((S) => { S.warlord.released = true; say(S, "The Crimson Warlord steps out to fight.", "big"); }));
    socket.on("twEndGame", asHost((S) => { if (S.status === "playing") endGame(S, "crimson"); }));
    socket.on("twPairUp", asHost((S, { a, b }) => {
      if (S.status !== "lobby") return "Pairs are fixed once the war starts.";
      const A = S.students.get(a), B = S.students.get(b); if (!A || !B || A === B) return "Pick two students.";
      for (const st of [A, B]) if (st.pairId) dissolvePair(S, S.pairs.get(st.pairId));
      makePair(S, [a, b]);
    }));

    // students
    const enter = (S, st) => {
      socket.data.twCode = S.code; socket.data.twPid = st.pid; st.sockets.add(socket.id);
      socket.join(`tw:${S.code}:students`);
      socket.emit("twMe", { code: S.code, token: st.token, pid: st.pid });
      touch(S);
    };
    socket.on("twJoin", ({ code, name } = {}) => {
      const S = sessions.get(String(code || "").trim().toUpperCase());
      if (!S) return fail("No war with that code. Check the code on the board.");
      if (S.status === "ended") return fail("That war has ended.");
      const st = addStudent(S, name);
      if (S.status === "playing") makePair(S, [st.pid]);          // a latecomer marches alone from the Academy
      enter(S, st);
    });
    socket.on("twRejoin", ({ code, token: tok } = {}) => {
      const S = sessions.get(String(code || "").toUpperCase());
      const st = S && [...S.students.values()].find((s) => s.token === tok);
      if (!st) return socket.emit("twGone");
      enter(S, st);
    });
    // partners: tap a classmate; when they tap you too, you are a pair (as in the class tournament)
    socket.on("twPartner", asStudent((S, st, { pid }) => {
      if (S.status !== "lobby") return "Pairs are fixed once the war starts.";
      if (pid == null) { st.want = null; return; }
      const other = S.students.get(pid); if (!other || other === st) return "Pick a classmate.";
      if (other.pairId) return `${other.name} already has a partner.`;
      if (st.pairId) dissolvePair(S, S.pairs.get(st.pairId));
      st.want = st.want === other.pid ? null : other.pid;
      if (st.want && other.want === st.pid) makePair(S, [other.pid, st.pid]);
    }));
    socket.on("twLeavePair", asStudent((S, st) => { if (S.status !== "lobby" || !st.pairId) return; dissolvePair(S, S.pairs.get(st.pairId)); }));
    socket.on("twStandard", asStudent((S, st, { char }) => {
      if (!CHAR_IDS.has(char)) return "Pick one of the ten standards.";
      st.char = char;
      const p = pairOf(S, st.pid); if (p) p.char = char;
    }));
    socket.on("twReady", asStudent((S, st, { ready }) => { if (S.status !== "lobby") return; st.ready = ready !== false; }));
    socket.on("twAnswer", asStudent((S, st, { chosen, startedAt }) => {
      const c = Math.round(+chosen); if (!(c >= 0 && c < 6)) return;
      if (st.own && st.own.startedAt === startedAt) return answerOwn(S, st, c);
      battleAnswer(S, st, c);
    }));
    socket.on("twVote", asStudent((S, st, { to }) => { const p = pairOf(S, st.pid); if (!p) return "Join a pair first."; return vote(S, p.id, to === "stay" ? "stay" : +to); }));
    socket.on("twEndMove", asStudent((S, st) => { const p = pairOf(S, st.pid); if (!p) return; return vote(S, p.id, "stay"); }));
    socket.on("twJoinBand", asStudent((S, st, { bandId }) => { const p = pairOf(S, st.pid); if (!p) return "Join a pair first."; return joinBand(S, p.id, bandId); }));
    socket.on("twLeaveBand", asStudent((S, st) => { const p = pairOf(S, st.pid); if (!p) return; return leaveBand(S, p.id); }));
    socket.on("twJoinBattle", asStudent((S, st, { battleId }) => { const p = pairOf(S, st.pid); if (!p) return; return joinBattle(S, p.id, battleId); }));

    // projector
    socket.on("twWatch", ({ code } = {}) => {
      const S = sessions.get(String(code || "").toUpperCase()); if (!S) return fail("No war with that code.");
      socket.join(`tw:${S.code}:watch`);
      socket.emit("twPublic", classView(S, S.status === "playing" ? classVisible(S) : null));
    });

    socket.on("disconnect", () => {
      const m = me(); if (m) { m.st.sockets.delete(socket.id); touch(m.S); }
    });
  }

  // tidy up wars nobody has touched for six hours
  setInterval(() => { for (const S of sessions.values()) if (Date.now() - S.lastActive > 6 * 3600e3) { clearInterval(S.timer); sessions.delete(S.code); } }, 600e3).unref?.();

  return { bind, has: (c) => sessions.has(String(c || "").toUpperCase()), _sessions: sessions };
}
