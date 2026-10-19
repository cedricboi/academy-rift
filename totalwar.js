// ===== Academy Rift: Total War — the authoritative server for the strategy mode =====
// Kept apart from the 2v2 Arena: its own rooms, codes and socket events (all named tw*).
// The teacher commands the Crimson Host. Pairs of students march Crystal banners, alone or in
// warbands that vote on every step, to break into the Crimson Fortress.
// Answers never leave the server, and each student only receives what the fog of war lets them see.
import { randomBytes } from "crypto";
import { skillPower } from "./combat.js";
import { ITEMS, ITEM_BY_ID, SHOP_LIMIT } from "./public/data/characters.js";
import { NODES } from "./public/total-war/movement.js";
import {
  HOME, FORTRESS, OUTPOSTS, WATCHTOWER, QUIZ_PER_MOVE, QUIZ_BONUS, STRATEGY_SECONDS, COUNCIL_SECONDS, MARCH_STEP, REST_HEAL, ALONG_HIT, ALONG_CAP, SYNC_PER_QUESTION, RESOLVE_PER_PAIR, TELEPORT_COST, AMBUSH_HIT, PAIR_WAVE, UNITS, SUMMONABLE, CAMPS, neighbours, isAdjacent, cost, visibleNodes,
  tallyVotes, pairMP, energyPerTurn, energyCarry, auraFor, battleLength, questionHits, dealHits,
  nearestRally, stepTowards, hops, STACK_LIMIT, FORTRESS_LIMIT, READ_SECONDS, ANSWER_SECONDS, VOTE_SECONDS,
  JOIN_SECONDS, MUSTER_PER_TURN, CAMP_RETURN_TURNS, nodeName, PREPARE_SECONDS, WARCRY_HIT, SUPPORT_HIT, counterAttack, resolveFor, siegeOf, HOLD_BONUS, WARD_HP,
  alongCap, FORTRESS_GUARDS, WARCRY_CAP, WARCRY_COOLDOWN, PREP_AP_EACH, MUSTER_MP_CAP, LATE_PREP_SECONDS, progressResult, TW_ITEMS, showHp,
  TOPUP_SECONDS, LATE_TOPUP_SECONDS, RESUME_SECONDS, assignTargets, splitCounter, PREP_COINS,
  REINFORCE_SECONDS, REINFORCE_MAX, reinforceBonus, REGROUP_STEPS, LATE_STEPS, LATE_PLAN_SECONDS, reachable, BATTLE_WAIT_SECONDS,
  EXTRA_KEYS, noExtras, BASIC_QUESTIONS, BASIC_ANSWER_SECONDS, BASIC_HIT, HELP_SECONDS, BASIC_RESULT_SECONDS, basicCounter, roundStep,
  BASIC_STEPS_EACH, basicSteps, BASIC_GATE_HP, BASIC_WARLORD_HP, LAST_PAIR_SECONDS, SEEN_GRACE,
} from "./public/total-war/rules.js";

const token = (n = 18) => randomBytes(n).toString("base64url");
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const rightAnswers = (q) => (Array.isArray(q.answers) && q.answers.length ? q.answers : [q.answer]);
const qKey = (q) => q.qid || q.q;
const ORDER_SECONDS = 30, COOK_SECONDS = 3, RIDE_STEP = 3, ACTION_SECONDS = 6, SYNC_GAIN = 12, SP_REGEN = 10, COINS_PER_RIGHT = 10;
const FEEDBACK_SECONDS = 5;                       // the right answer and its explanation stay up at least this long after every answer
const SAVE_DIR = "wars", SAVE_HOURS = 12;         // war snapshots (one a turn), and how long an old one is worth restoring
// Choices are shuffled for each student, except when a choice points at the others by position ("all of the above", "A and B")
const FIXED_ORDER = /of the above|\b[A-F] (and|or) [A-F]\b|^[A-F] only$|^(only )?[A-F]$|^[A-F], [A-F]/i;
const makePerm = (q) => { const p = q.choices.map((_, i) => i); return q.choices.some((c) => FIXED_ORDER.test(String(c).trim())) ? p : shuffle(p); };
const toCanon = (perm, shown) => (shown >= 0 && perm ? perm[shown] ?? -1 : shown);    // the student's button → the question's own index
const toShown = (perm, c) => (c >= 0 && perm ? perm.indexOf(c) : c);                   // and back
const explainOf = (q) => String(q?.explain || q?.why?.right || "");

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
  // endMinutes: the war ends by itself this many minutes after it starts (0 = only when the turns run out)
  const defaultSettings = () => ({ warlordLock: false, councilSeconds: COUNCIL_SECONDS, commander: "Mr Cedric", topic: null, turns: 8, crimsonSeconds: PREPARE_SECONDS, crystalSeconds: 150, target: 25, warlordPct: 80, botCommander: false, botPartners: true, endMinutes: 0, trainingTurn: false, full: false, extras: noExtras() });

  function createSession() { return createSessionFor(newCode()); }
  function createSessionFor(code) {
    const S = {
      code, hostToken: token(), createdAt: Date.now(), lastActive: Date.now(),
      status: "lobby", winner: null, settings: defaultSettings(),
      students: new Map(), pairs: new Map(), bands: new Map(), units: new Map(), battles: new Map(), riders: new Map(),
      camps: Object.fromEntries(Object.keys(CAMPS).map((n) => [n, { alive: true, hp: CAMPS[n].hp, returnTurn: 0 }])),
      gate: { hp: UNITS.golem.hp, max: UNITS.golem.hp, broken: false },
      warlord: { hp: UNITS.warlord.hp, max: UNITS.warlord.hp, released: false },
      ward: { hp: WARD_HP, max: WARD_HP }, endedBy: null,
      buffs: {}, rally: new Set(), turn: 0, phase: null, phaseEndsAt: 0, phaseStartedAt: 0, teacherEnded: false,
      energy: 0, seq: 0, log: [], pool: null, timer: null, dirty: false, paused: null, report: null, startedAt: 0, qInfo: new Map(),
    };
    sessions.set(S.code, S);
    return S;
  }
  const id = (S, p) => `${p}${++S.seq}`;
  // The Basic game is the default. Each Extra (coins, hp, moves, pick, join, warcry, camps, fog) switches one system of
  // the full game back on; "Full game" switches them all on and plays the rounds as the full game does.
  const xo = (S, k) => !!(S.settings.full || S.settings.extras?.[k]);
  const basicFlow = (S) => !S.settings.full;
  // The training turn: turn 1 of a practice war with the tutorial on, or of a class war with "Training turn" set.
  // Nothing is timed: each stage waits until everyone is done (or the teacher presses Continue).
  const untimed = (S) => !!S.training && S.turn === 1 && S.status === "playing";
  // a short message for every student of a pair (shown once on their screen): a warband join, where the route went
  const note = (S, pairId, text, extra = {}) => { const p = S.pairs.get(pairId); if (!p) return; (p.notes ||= []).push({ id: ++S.seq, text, at: Date.now(), ...extra }); if (p.notes.length > 6) p.notes.shift(); S.dirty = true; };
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
  // a warband by its lead fighter, for the class feed and the end-of-war story
  // (Basic: a pair by its number and its students' names, as the students know it: "Pair 3 (Mei and Ezra)")
  const plainStudent = (S, m) => String(S.students.get(m)?.name || "?").replace(/^Bot /, "");
  const pairNames = (S, p) => `Pair ${p?.no ?? "?"}${p ? ` (${p.members.map((m) => plainStudent(S, m)).join(" and ")})` : ""}`;
  const company = (S, b) => { const p = b && S.pairs.get(b.pairs[0]); if (basicFlow(S)) return pairNames(S, p); const c = p && CHARACTERS.find((x) => x.id === p.char); return `${c ? c.name.split(" ")[0] : `Pair ${p?.no ?? "?"}`}'s warband`; };
  // several warbands in one sentence: each named once; two led by the same fighter are told apart by pair number
  const companies = (S, bands) => {
    const names = bands.map((b) => company(S, b));
    const out = basicFlow(S) ? names : names.map((n, i) => (names.filter((x) => x === n).length > 1 ? `Pair ${S.pairs.get(bands[i].pairs[0])?.no ?? "?"}` : n));
    const u = [...new Set(out)];
    return u.length > 2 ? `${u.slice(0, -1).join(", ")} and ${u.at(-1)}` : u.join(" and ");
  };
  const story = (S, text, node = null) => { (S.story ||= []).push({ turn: S.turn, text, node }); if (S.story.length > 40) S.story.shift(); };
  const isConnected = (s) => !!s && (s.bot || s.sockets.size > 0);
  const toFortress = hops(FORTRESS);
  // the stop closest to the fortress that the class has reached so far (for the end of the war)
  // (a fight at the fortress gate, or with the Warlord, counts as reaching the fortress)
  const reached = (S, n) => { const h = toFortress.get(n); if (h != null && h < (S.bestHops ?? 99)) { S.bestHops = h; S.bestNode = n; } };
  // the class preparation target (questions each): met, it weakens the Warlord for the final battle
  const prepMet = (S) => {
    const st = [...S.students.values()];
    return !!st.length && st.filter((s) => s.answered >= S.settings.target).length * 100 >= st.length * S.settings.warlordPct;
  };
  // breaking the gate unlocks the Warlord; a teacher who wants a learning threshold can make him wait for the target
  const warlordReady = (S) => S.warlord.released || !S.settings.warlordLock || prepMet(S);
  const campAt = (S, n) => (CAMPS[n] && S.camps[n].alive ? CAMPS[n] : null);
  const blocked = (S, n) => unitsAt(S, n).length > 0 || !!campAt(S, n) || n === FORTRESS;

  // fortress defenders: summoned units there, then the gate guardian, or the Warlord once the gate is broken
  // At most FORTRESS_GUARDS of them stand in front (the strongest), so stacking the fortress cannot stall the class for ever.
  function fortressEnemies(S) {
    // (Basic: the gate guardian or the Warlord alone, so its health bar is the whole fight and the damage clearly stays)
    const guards = basicFlow(S) ? [] : unitsAt(S, FORTRESS).filter((u) => !u.battle).sort((a, b) => b.hp - a.hp).slice(0, FORTRESS_GUARDS);
    const list = guards.map((u) => unitEnemy(S, u));
    if (!S.gate.broken) list.push({ ref: "gate", type: "golem", hp: S.gate.hp, max: S.gate.max, atk: UNITS.golem.atk });
    else list.push({ ref: "warlord", type: "warlord", hp: S.warlord.hp, max: S.warlord.max, atk: UNITS.warlord.atk });
    return list;
  }

  // ------------------------------------------------------------------ questions
  function poolOf(S) {
    if (!S.pool) S.pool = filterQuestions(S.settings.topic);
    return S.pool;
  }
  // Each student gets fresh questions from the whole pool first. Only a question they really got wrong comes back
  // (labelled "Back again"), after a few others. A question they got right is not asked again until every question in
  // the pool has been seen; then the ones they have not yet got right come first, then the ones seen longest ago.
  function pickFor(S, st) {
    const pool = poolOf(S);
    st.right ||= new Set(); st.seenAt ||= new Map();
    const take = (q, retry) => { st.seen.add(qKey(q)); st.seenAt.set(qKey(q), Date.now()); return { q, retry }; };
    const due = st.redo.find((r) => r.after <= st.answered);
    if (due) {
      st.redo = st.redo.filter((r) => r !== due);
      const q = pool.find((x) => qKey(x) === due.key);
      if (q && !st.right.has(due.key)) return take(q, true);
    }
    let list = pool.filter((q) => !st.seen.has(qKey(q)));
    let retry = false;
    if (!list.length) { list = pool.filter((q) => !st.right.has(qKey(q))); retry = list.length > 0; }
    if (!list.length) { const oldest = Math.min(...pool.map((q) => st.seenAt.get(qKey(q)) ?? 0)); list = pool.filter((q) => (st.seenAt.get(qKey(q)) ?? 0) === oldest); }
    const q = list[Math.floor(Math.random() * list.length)];
    return take(q, retry && st.wrongKeys?.has(qKey(q)));
  }
  // what a student sees of a question: the choices in their own order (perm), never the answer or the explanation
  const publicQ = (q, startedAt, perm = null, extra = {}) => ({
    q: q.q, choices: perm ? perm.map((i) => q.choices[i]) : q.choices, topic: q.topic || "", image: q.image || null,
    startedAt, recall: READ_SECONDS, seconds: ANSWER_SECONDS, ...extra,
  });
  // an untimed question (the training turn) never runs out
  // The answer time starts when the choices appear on the student's screen (twSeen), so the reading time is always extra.
  // A screen that never says so gets the planned time (startedAt + reading + answering); one that shows the choices late
  // gets its full answer time, up to SEEN_GRACE seconds later than planned. Own questions keep the time in seenAt, battle
  // questions in seen[pid].
  const qRead = (Q) => Q.recall ?? READ_SECONDS, qSecs = (Q) => Q.seconds ?? ANSWER_SECONDS;
  const choicesAt = (Q) => Q.startedAt + ms(qRead(Q));
  const questionEnds = (Q, pid = undefined) => {
    if (Q.untimed) return Infinity;
    const base = choicesAt(Q), seen = pid === undefined ? Q.seenAt : Q.seen?.[pid];
    return Math.max(base, Math.min(seen || 0, base + ms(SEEN_GRACE))) + ms(qSecs(Q));
  };
  // a battle question is over for everyone once every student still playing has had their time
  const battleEnds = (S, B) => fightersOf(S, B).reduce((t, pid) => { const st = S.students.get(pid); return st && !st.bot && isConnected(st) ? Math.max(t, questionEnds(B.q, pid)) : t; }, questionEnds(B.q, null));
  const reading = (Q) => Date.now() < choicesAt(Q) - 150;
  // the student's screen shows the choices now
  function seenChoices(S, st, startedAt) {
    const now = Date.now();
    if (st.own && st.own.startedAt === startedAt && !st.own.result) { if (!st.own.seenAt && now < questionEnds(st.own)) st.own.seenAt = now; return; }
    const B = [...S.battles.values()].find((x) => x.status === "fight" && x.q && x.q.startedAt === startedAt && fightersOf(S, x).includes(st.pid));
    if (B && !B.q.seen?.[st.pid] && now < questionEnds(B.q, st.pid)) (B.q.seen ||= {})[st.pid] = now;
  }

  // chosen is the question's own index (not the student's shuffled button); kind: quiz | muster | warcry | battle
  // along: answering a classmate's battle question (cheering them on), not the student's own question
  function record(S, st, q, chosen, kind = "", along = false) {
    const ok = chosen >= 0 && rightAnswers(q).includes(chosen);
    st.right ||= new Set(); st.wrongKeys ||= new Set();
    st.answered++;
    if (ok) { st.correct++; if (xo(S, "coins")) st.coins = (st.coins || 0) + COINS_PER_RIGHT; st.right.add(qKey(q)); st.redo = st.redo.filter((r) => r.key !== qKey(q)); }
    else {
      st.wrong++;
      // only a question the student really got wrong comes back (a question that ran out is not repeated)
      if (chosen >= 0) { st.wrongKeys.add(qKey(q)); if (!st.redo.some((r) => r.key === qKey(q))) st.redo.push({ key: qKey(q), after: st.answered + 3, picked: true }); }
    }
    st.lastAnswerAt = Date.now();
    if (chosen >= 0) { st.timeouts = 0; st.lastRealAt = Date.now(); } else st.timeouts = (st.timeouts || 0) + 1;   // for the quiet-student flag
    if (!S.qInfo.has(qKey(q))) S.qInfo.set(qKey(q), { text: q.q, lo: q.lo || q.topic || "", choices: q.choices, right: rightAnswers(q)[0] });
    st.history.push({ key: qKey(q), lo: q.lo || q.topic || "", ok, chosen, kind, turn: S.turn, along: !!along });
    return ok;
  }

  // A student's own question when they are not in a battle: muster (MP for the next move) or a War Cry.
  function giveOwnQuestion(S, st, kind, battleId = null, extra = {}) {
    const { q, retry } = pickFor(S, st);
    st.own = { kind, battleId, q, startedAt: Date.now(), retry, result: null, perm: makePerm(q), untimed: untimed(S), ...extra };
    S.dirty = true;
  }

  // ------------------------------------------------------------------ pairing and joining
  function addStudent(S, name, bot = false) {
    const st = {
      bot, coins: 0, bag: {},
      pid: id(S, "s"), token: token(), name: String(name || "").trim().slice(0, 20) || "Student",
      sockets: new Set(), pairId: null, want: null, char: null, ready: false, answered: 0, correct: 0, wrong: 0, musterThisTurn: 0,
      seen: new Set(), right: new Set(), wrongKeys: new Set(), seenAt: new Map(), redo: [], history: [], own: null, lastAnswerAt: 0, joinedAt: Date.now(), prep: 0, timeouts: 0, lastRealAt: 0, cryUntil: 0,
    };
    S.students.set(st.pid, st);
    return st;
  }
  function makePair(S, members) {
    const no = Math.max(0, ...[...S.pairs.values()].map((p) => p.no)) + 1;
    const p = { id: id(S, "p"), no, members, char: members.map((m) => S.students.get(m)?.char).find(Boolean) || null, bank: 0, hp: RESOLVE_PER_PAIR, maxHp: RESOLVE_PER_PAIR, lastNode: HOME, lastMovedTurn: S.turn, revive: false };
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
    const b = { id: id(S, "b"), pairs: [p.id], node: HOME, mp: S.phase === "crystal" ? pairMP(0, buffOn(S)) : 0, done: S.phase !== "crystal", votes: {}, props: {}, plan: null, voteOpenedAt: 0, battle: null };
    S.bands.set(b.id, b);
  }

  // ------------------------------------------------------------------ turns
  function startGame(S) {
    if (S.status !== "lobby") return "The game has already started.";
    const loose = [...S.students.values()].filter((s) => !s.pairId);
    for (const st of loose) {                                  // anyone without a partner gets a bot partner (or marches alone)
      if (S.settings.botPartners && !st.bot) { const bot = addBot(S, st.char); makePair(S, [st.pid, bot.pid]); }
      else makePair(S, [st.pid]);
    }
    if (!S.pairs.size) return "No one has joined yet.";
    S.pool = null; poolOf(S);
    S.status = "playing"; S.startedAt = Date.now(); setEndAt(S);
    // Basic battles hit once for every right answer: the gate guardian and the Warlord are made for a team of 3 pairs or
    // more (see BASIC_GATE_HP in rules.js). A pair alone cannot break them in one fight, and the damage stays.
    if (basicFlow(S)) {
      S.gate = { hp: BASIC_GATE_HP, max: BASIC_GATE_HP, broken: false };
      S.warlord = { hp: BASIC_WARLORD_HP, max: BASIC_WARLORD_HP, released: false };
    }
    S.training = !!(S.settings.trainingTurn || (S.practice && S.tutorial));
    for (const p of S.pairs.values()) placePair(S, p);
    // the practice tutorial: one weak Crimson scout waits one road from the Academy, so the first turn has a short battle
    if (S.practice && S.tutorial) {
      const t = { id: id(S, "u"), type: "rift_hound", node: 1, hp: 10, max: 10, moved: 0, order: null, dugIn: false, battle: null, from: null, tutorial: true };
      S.units.set(t.id, t);
    }
    say(S, basicFlow(S) ? "The war begins. Every pair starts at the Academy." : "The war begins. The Crystal warbands muster at the Academy.", "big");
    startCrimson(S);
    startClock(S);
    return null;
  }
  const startClock = (S) => { clearInterval(S.timer); S.timer = setInterval(() => { try { tick(S); } catch (e) { console.error("[total-war] tick", e); } }, Math.max(20, 200 / SPEED)); };
  // the moment the war ends by itself (the teacher's "end by" minutes, counted from the start, pauses not counted)
  const setEndAt = (S) => { S.endAt = S.settings.endMinutes > 0 && S.startedAt ? S.startedAt + ms(S.settings.endMinutes * 60) : 0; };
  const timeUp = (S) => !!S.endAt && Date.now() >= S.endAt;
  // the class is behind: the gate still stands after half the turns. The Bot Commander and Auto then spend less.
  const classBehind = (S) => !S.gate.broken && S.turn >= Math.ceil(S.settings.turns / 2);

  function startCrimson(S) {
    saveWar(S);                                   // a snapshot at every turn boundary: a restart resumes from here
    S.turn++;
    if (S.turn > S.settings.turns) return endByProgress(S, "turns");
    if (timeUp(S)) return endByProgress(S, "time");
    S.phase = "crimson"; S.teacherEnded = false;
    // a pair beaten last turn is back to full HP at its rally point: losing costs the ground, not the HP
    for (const p of S.pairs.values()) if (p.revive) { p.revive = false; p.hp = p.maxHp; }
    // who has not moved for a while (a prompt for the teacher)
    for (const p of S.pairs.values()) { const b = bandOf(S, p.id); if (b && b.node !== p.lastNode) { p.lastNode = b.node; p.lastMovedTurn = S.turn; } }
    if (siegeAcademy(S)) return;
    S.phaseStartedAt = Date.now(); S.phaseEndsAt = Date.now() + ms(S.settings.crimsonSeconds);
    // Basic: the ANSWER step lasts until every student has answered their 3 questions (and the teacher has moved), at most
    // BASIC_ANSWER_SECONDS. The teacher's own time (crimsonSeconds) only ends it once everyone is done.
    S.softEndsAt = S.phaseEndsAt;
    if (basicFlow(S)) S.phaseEndsAt = Date.now() + ms(Math.max(S.settings.crimsonSeconds, BASIC_ANSWER_SECONDS));
    S.energy = Math.min(S.energy, energyCarry) + energyPerTurn(S.pairs.size);
    for (const u of S.units.values()) { u.moved = 0; if (S.turn > 1) u.tutorial = false; }
    for (const [n, c] of Object.entries(S.camps)) if (!c.alive && c.returnTurn <= S.turn) { c.alive = true; c.hp = CAMPS[n].hp; say(S, `${CAMPS[n].name} has returned to ${nodeName(+n)}.`); }
    for (const st of S.students.values()) { st.musterThisTurn = 0; st.prepRight = 0; st.prep = 0; if (!st.own || st.own.kind !== "muster") st.own = null; }
    for (const p of S.pairs.values()) { p.bank = 0; if (p.joinIntent && S.turn > (p.intentTurn || 0) + 1) p.joinIntent = null; }
    for (const b of S.bands.values()) { b.done = true; b.votes = {}; }
    say(S, basicFlow(S) ? `Round ${S.turn}. While the enemy moves, every student answers 3 questions.` : `Turn ${S.turn}. The Crimson Host moves.`, "crimson");
    S.dirty = true;
  }

  // The class's move. The 3 preparing questions are answered while the enemy moves (the Crimson turn). A student who
  // has not finished them (or is still on one) gets a short top-up of at most TOPUP_SECONDS; everyone else waits
  // a moment. Then the map opens for everyone at once, with time to plan, move and order food.
  function startCrystal(S) {
    S.phase = "crystal"; S.stage = "quiz"; S.orderEnds = 0;
    for (const st of S.students.values()) { st.orderDone = false; if (st.own && st.own.kind !== "muster") st.own = null; }
    S.phaseStartedAt = Date.now(); S.phaseEndsAt = Date.now() + ms(TOPUP_SECONDS);
    // resting at the Academy or a rally point heals a little; everywhere else only food heals
    for (const b of S.bands.values()) if ((b.node === HOME || S.rally.has(b.node)) && !b.battle) for (const x of b.pairs) { const p = S.pairs.get(x); if (p && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + REST_HEAL); }
    for (const b of S.bands.values()) { b.done = false; b.votes = {}; b.voteOpenedAt = 0; }
    if (!quizDone(S)) say(S, `Turn ${S.turn}. Finish your questions, then plan your move.`, "crystal");
    S.dirty = true;
  }
  // the steps (AP) each pair and warband has for this move, from the right answers while preparing
  function setMoveAP(S) {
    const buffs = buffOn(S);
    for (const p of S.pairs.values()) {
      p.mp = basicFlow(S) ? basicSteps(p.bank || 0, buffs) : pairMP(p.bank || 0, buffs); p.bank = 0;
      // its battle ran on while the class answered its preparing questions: it could not earn steps, so it gets the default
      if (p.missedPrep === S.turn) p.mp = Math.max(p.mp, LATE_STEPS + (buffs.mp ? 1 : 0));
    }
    for (const st of S.students.values()) st.prep = 0;
    for (const b of S.bands.values()) {
      // a warband travels with the average AP of its pairs (rounded), so one slow pair does not hold everyone back
      const active = b.pairs.map((x) => S.pairs.get(x)).filter((p) => p && p.members.some((m) => isConnected(S.students.get(m))));
      const list = (active.length ? active : b.pairs.map((x) => S.pairs.get(x)).filter(Boolean)).map((p) => p.mp);
      b.mp = list.length ? Math.round(list.reduce((a, n) => a + n, 0) / list.length) : 0;
    }
  }
  // The War Council: the map opens for everyone at once. Each warband agrees ONE route for the whole move (a pair
  // proposes, the others agree or propose another), then every banner marches together.
  function openMoves(S) {
    if (timeUp(S)) return endByProgress(S, "time");
    S.stage = "council"; S.moveStartedAt = Date.now(); S.launch = false;
    S.phaseEndsAt = Date.now() + ms(S.settings.councilSeconds || COUNCIL_SECONDS);
    // a preparing question still open when the top-up ends is put away (not counted)
    for (const st of S.students.values()) if (st.own?.kind === "quiz" || (st.own?.kind === "muster" && !st.own.result) || basicFlow(S)) st.own = null;
    setMoveAP(S);
    S.lastPairAt = 0;
    for (const b of S.bands.values()) { b.props = {}; b.drafts = {}; b.plan = null; b.path = null; b.interrupted = false; b.arrived = false; b.held = false; b.lateUntil = 0; }
    for (const p of S.pairs.values()) { p.picks = {}; p.drafts = {}; }
    for (const b of [...S.bands.values()]) if (S.bands.has(b.id)) joinIntents(S, b);
    say(S, basicFlow(S) ? `Round ${S.turn}. Every pair picks where to move.` : "Plan your move! Agree your routes, order food, then march together.", "crystal");
    S.dirty = true;
  }
  // a band's route: proposals by pair, agreed when every pair still playing picks the same one
  const routeKey = (r) => (Array.isArray(r) ? r.join(">") : String(r));
  const activePairs = (S, b) => { const a = b.pairs.filter((x) => S.pairs.get(x)?.members.some((m) => isConnected(S.students.get(m)))); return a.length ? a : b.pairs; };
  function agreedPlan(S, b) {
    b.props ||= {}; const act = activePairs(S, b), keys = act.map((x) => (b.props[x] !== undefined ? routeKey(b.props[x]) : null));
    return keys.every((k) => k && k === keys[0]) ? b.props[act[0]] : null;
  }
  function majorityPlan(S, b) {
    const byKey = {}, votes = {};
    b.props ||= {};
    for (const x of b.pairs) if (b.props[x] !== undefined) { const k = routeKey(b.props[x]); byKey[k] = b.props[x]; votes[x] = k; }
    const k = tallyVotes(votes, b.pairs);
    return k == null ? "hold" : byKey[k];
  }
  // what the class can see blocking a road: the Crimson Host (not ambushers), a jungle camp, the fortress
  const seenBlock = (S, n) => unitsAt(S, n).some((u) => !u.ambush) || !!campAt(S, n) || n === FORTRESS;
  function routeError(S, b, route) {
    if (route === "hold") return null;
    if (!Array.isArray(route) || route.length < 2 || route[0] !== b.node) return "Pick a route that starts at your banner.";
    if (new Set(route).size !== route.length) return "A route passes each stop once.";
    let spent = 0;
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], n = route[i];
      if (!Number.isInteger(n) || !NODES[n] || !isAdjacent(a, n)) return "A route follows the roads from one stop to the next.";
      spent += cost(a, n);
      const B = battleAt(S, n);
      if (B && B.status !== "gather") return `A battle is being fought at ${nodeName(n)}.`;
      if (i < route.length - 1 && (seenBlock(S, n) || B)) return `You would have to fight at ${nodeName(n)} first. End your route there.`;
      if (n === FORTRESS && S.gate.broken && !warlordReady(S)) return "The Warlord has not come out yet.";
    }
    if (spent > b.mp) return `Your warband can travel ${b.mp} step${b.mp === 1 ? "" : "s"} this move.`;
    return null;
  }
  // routes can be planned in the War Council, and by a warband whose battle ran past it (while the others march)
  const planOpen = (S, b) => (S.phase === "crystal" && S.stage === "council") || (!!b?.lateUntil && Date.now() < b.lateUntil);
  const planError = (S, b) => (b.battle ? "Your warband is in a battle." : planOpen(S, b) ? null
    : S.phase === "crystal" && S.stage === "quiz" ? "Finish your preparing questions first. Planning opens in a few seconds." : "Routes are planned in Plan your move (the War Council).");
  function proposeRoute(S, pairId, route) {
    const b = bandOf(S, pairId); if (!b) return "You are not on the map yet.";
    if (!planOpen(S, b)) return planError(S, b);
    if (b.battle) return "Your warband is in a battle.";
    const err = routeError(S, b, route); if (err) return err;
    (b.props ||= {})[pairId] = route === "hold" ? "hold" : route.slice();
    b.plan = agreedPlan(S, b);
    S.dirty = true;
    return null;
  }
  // a route a pair has drawn on the map but not sent yet (sent for them if the planning time runs out)
  // Each partner's drawn route is kept with the time it was first drawn: if the partners never agree, the one drawn first
  // is sent when planning ends.
  function draftRoute(S, st, route) {
    const p = pairOf(S, st.pid), b = p && bandOf(S, p.id); if (!b || !planOpen(S, b) || b.battle) return null;
    p.drafts ||= {};
    if (!Array.isArray(route) || route.length < 2) { delete p.drafts[st.pid]; return null; }
    const r = route.map((n) => Math.round(+n));
    if (routeError(S, b, r)) return null;                          // a draft that cannot be marched is simply not kept
    p.drafts[st.pid] = { route: r, at: p.drafts[st.pid]?.at || Date.now() }; return null;
  }
  // Both partners agree the pair's route: each taps it. The pair's route goes to its warband (or is sent, for a pair
  // alone) once every partner still playing has tapped the same one. A bot partner agrees by itself, and a partner who
  // is not connected does not hold the pair up.
  const humansOf = (S, p) => p.members.filter((m) => { const s = S.students.get(m); return s && !s.bot && isConnected(s); });
  function pickRoute(S, st, route) {
    const p = pairOf(S, st.pid); if (!p) return "Join a pair first.";
    const b = bandOf(S, p.id); if (!b) return "You are not on the map yet.";
    const perr = planError(S, b); if (perr) return perr;
    if (route !== "hold") { if (!Array.isArray(route)) return "Pick a route that starts at your banner."; route = route.map((n) => Math.round(+n)); }
    const err = routeError(S, b, route); if (err) return err;
    p.picks ||= {};
    const drawn = p.drafts?.[st.pid], prev = p.picks[st.pid];
    const at = prev && routeKey(prev.route) === routeKey(route) ? prev.at : drawn && routeKey(drawn.route) === routeKey(route) ? drawn.at : Date.now();
    p.picks[st.pid] = { route: route === "hold" ? "hold" : route.slice(), at };
    const need = humansOf(S, p);
    const keys = need.map((m) => (p.picks[m] ? routeKey(p.picks[m].route) : null));
    if (need.length <= 1 || keys.every((k) => k && k === keys[0])) return proposeRoute(S, p.id, route);
    // the partners have not agreed (yet): the pair's route is not sent until they do
    if (b.props?.[p.id] !== undefined) { delete b.props[p.id]; b.plan = agreedPlan(S, b); }
    S.dirty = true; return null;
  }
  // what a pair sends when planning ends without the partners agreeing: the route drawn first (tapped or only drawn)
  function pairFallback(S, b, x) {
    const p = S.pairs.get(x); if (!p) return null;
    const ok = (r) => r === "hold" || (Array.isArray(r) && r.length > 1 && r[0] === b.node && !routeError(S, b, r));
    const list = [...Object.values(p.picks || {}), ...Object.values(p.drafts || {})].filter((c) => ok(c.route)).sort((a, c) => a.at - c.at);
    if (list.length) return list[0].route === "hold" ? "hold" : list[0].route.slice();
    // a pair that set off to join a warband marches towards it
    const t = intentBand(S, p);
    if (t && t.node !== b.node) { const r = routeTowards(S, b, t.node); if (r.length > 1 && !routeError(S, b, r)) return r; }
    return null;
  }
  // the longest affordable route towards a stop along the fewest roads, ending at anything that must be fought
  // fight: the route may end on an enemy in the way (a Basic bot pair fights its way to the target)
  function routeTowards(S, b, target, fight = false) {
    const route = [b.node]; let at = b.node, spent = 0;
    for (let k = 0; k < 12 && at !== target; k++) {
      const n = stepTowards(at, target, (x) => fight || x === target || !seenBlock(S, x));
      if (n == null || spent + cost(at, n) > b.mp || route.includes(n)) break;
      if (n === FORTRESS && S.gate.broken && !warlordReady(S)) break;
      const B = battleAt(S, n); if (B && B.status !== "gather") break;
      route.push(n); spent += cost(at, n); at = n;
      if (seenBlock(S, n) || B) break;
    }
    return route;
  }
  function startMarch(S) {
    S.stage = "march"; S.phaseEndsAt = Date.now() + ms(S.settings.crystalSeconds);
    S.marchStartedAt = Date.now();
    let k = 0;
    for (const b of S.bands.values()) {
      if (!b.battle) { launchBand(S, b, k++); continue; }
      // still fighting: this move is owed to it, and it plans it by itself when its battle ends
      for (const x of b.pairs) { const p = S.pairs.get(x); if (p) p.owed = true; }
    }
    say(S, basicFlow(S) ? "The pairs march!" : "The warbands march!", "crystal");
    S.dirty = true;
  }
  // a warband sets off on the route it agreed (or, if time ran out, the route drawn first, else the majority)
  function launchBand(S, b, k = 0) {
    const now = Date.now();
    b.lateUntil = 0;
    // a route a pair drew on the map but did not send yet is sent for them when the planning time ends
    let drafted = false;
    if (!b.plan) for (const x of b.pairs) {
      if (b.props?.[x] !== undefined) continue;
      const r = pairFallback(S, b, x);
      if (r) { (b.props ||= {})[x] = r; drafted = true; }
    }
    const agreed = !!b.plan, sent = Object.keys(b.props || {}).length > 0;
    const plan = b.plan || agreedPlan(S, b) || majorityPlan(S, b);
    b.plan = plan; b.held = plan === "hold"; b.lastDefeat = null; b.lastDefeatAt = null; b.rest = null; b.resumeUntil = 0;
    b.path = plan === "hold" || routeError(S, b, plan) ? [] : plan.slice(1);
    b.nextAt = now + ms(0.3 + 0.1 * k); b.done = !b.path.length;
    const to = b.path.length ? nodeName(b.path.at(-1)) : null, here = nodeName(b.node);
    const text = to ? (drafted && !agreed ? `Time's up, so the route you planned was sent. You march to ${to}.` : `Route sent: you march to ${to}.`)
      : sent && plan === "hold" ? `You chose to stay at ${here}.` : `Time's up: you stayed at ${here}.`;
    for (const x of b.pairs) note(S, x, text, { kind: "route", go: !!to });
    if (b.held) say(S, `${b.pairs.map((x) => pairLabel(S, S.pairs.get(x))).join(", ")} ${b.pairs.length > 1 ? "hold" : "holds"} at ${nodeName(b.node)}.`, "crystal");
    for (const x of b.pairs) { const p = S.pairs.get(x); if (p) { p.picks = {}; p.drafts = {}; p.owed = false; } }
  }
  // one road for one marching banner; returns true when the march stops (a battle, or the route is done)
  function stepTo(S, b, to) {
    const from = b.node;
    b.mp = Math.max(0, b.mp - cost(from, to));
    const B = battleAt(S, to);
    if (B) { joinBattle(S, b.pairs[0], B.id); return true; }
    b.node = to; S.dirty = true; reached(S, to);
    if (joinIntents(S, b)) return true;
    if (xo(S, "camps") && OUTPOSTS.includes(to) && !unitsAt(S, to).length && !S.rally.has(to)) { S.rally.add(to); say(S, `The class has taken ${nodeName(to)}. It is now a safe camp.`, "crystal"); }
    if (xo(S, "fog") && to === WATCHTOWER && !unitsAt(S, to).length && !S.towerTaken) { S.towerTaken = true; story(S, `${company(S, b)} climbed the watchtower and scouted the Crimson Host.`, to); }
    if (to === FORTRESS) { startBattle(S, b, S.gate.broken ? "boss" : "gate"); return true; }
    if (unitsAt(S, to).length) { startBattle(S, b, "host"); return true; }
    if (campAt(S, to)) { startBattle(S, b, "camp"); return true; }
    return false;
  }
  function marchTick(S, now) {
    for (const b of [...S.bands.values()]) {
      if (!b.path?.length || b.battle || now < b.nextAt) continue;
      const to = b.path.shift();
      const stopped = stepTo(S, b, to);
      if (stopped && b.path.length) { b.interrupted = true; b.rest = b.path.slice(); say(S, `Enemy encountered at ${nodeName(b.node)}. The route is paused.`, "battle"); }
      if (stopped) b.path = [];
      b.nextAt = now + ms(MARCH_STEP);
      if (!b.path.length) { b.done = true; b.arrived = !b.battle; }
    }
  }
  function resumeRoute(S, pairId, go) {
    const b = bandOf(S, pairId); if (!b) return "You are not on the map yet.";
    if (!b.rest?.length || !b.resumeUntil || Date.now() >= b.resumeUntil) return "There is no route to carry on.";
    if (b.battle) return "Your warband is in a battle.";
    b.resumeUntil = 0;
    if (!go) { b.rest = null; b.interrupted = false; b.held = true; S.dirty = true; return null; }
    const err = routeError(S, b, [b.node, ...b.rest]); if (err) { b.rest = null; return err; }
    b.path = b.rest; b.rest = null; b.interrupted = false; b.nextAt = Date.now() + ms(0.3); b.done = false;
    say(S, `${company(S, b)} carries on towards ${nodeName(b.path.at(-1))}.`, "crystal");
    S.dirty = true; return null;
  }
  function bandStatus(S, b) {
    if (!b.battle && b.resumeUntil && Date.now() < b.resumeUntil) return "resume";
    if (b.battle) return "battle";
    if (b.lateUntil && Date.now() < b.lateUntil) return b.plan ? "committed" : Object.keys(b.props || {}).length ? "agreeing" : "planning";
    if (S.phase === "crystal" && S.stage === "quiz") return "quiz";
    if (S.phase === "crystal" && S.stage === "council") return b.plan ? "committed" : Object.keys(b.props || {}).length ? "agreeing" : "planning";
    if (S.phase === "crystal" && S.stage === "march") return b.path?.length ? "marching" : b.interrupted ? "interrupted" : b.held ? "holding" : "arrived";
    const p = b.pairs.map((x) => S.pairs.get(x)).find(Boolean);
    if ((b.node === HOME || S.rally.has(b.node)) && p && p.hp < p.maxHp) return "recovering";
    return "waiting";
  }
  // the top-up is done when every student still playing has answered their 3 preparing questions and is not on one
  const prepDone = (S, st) => (st.musterThisTurn || 0) >= QUIZ_PER_MOVE && !(st.own?.kind === "muster" && !st.own.result);
  const fightingNow = (S, st) => !!bandOf(S, st.pairId)?.battle;
  const planningLate = (S, st) => (bandOf(S, st.pairId)?.lateUntil || 0) > Date.now();
  const quizDone = (S) => [...S.students.values()].every((st) => prepDone(S, st) || !isConnected(st) || fightingNow(S, st) || planningLate(S, st));
  const liveBattles = (S) => [...S.battles.values()].filter((B) => B.status !== "over");

  // how: null (the Warlord fell) | ward | turns | time | progress (the teacher ended it) | teacher (the teacher declared the class the winner)
  function endGame(S, winner, how = null) {
    S.status = "ended"; S.winner = winner; S.phase = null; S.endedBy = how; S.dirty = true; S.paused = null;
    clearInterval(S.timer); S.timer = null;
    for (const B of S.battles.values()) B.status = "over";
    const why = how === "time" ? "Time is up. " : how === "turns" ? (basicFlow(S) ? "The last round is over. " : "The last turn is over. ") : "";
    say(S, how === "teacher" ? `${S.settings.commander} declares the Crystal army the winner!`
      : winner === "crystal" ? (how ? `${why}The Warlord is badly hurt. The Crystal army wins on points!` : "The Crimson Warlord has fallen. The Crystal army wins!")
      : winner === "draw" ? `${why}The gate is broken, but the Warlord still stands. The war is a draw.`
      : how === "ward" ? "The Academy Ward is broken. The Crimson Host wins this war." : `${why}The Crimson Fortress stands. The Crimson Host wins this war.`, "big");
    S.report = buildReport(S);
    saveWar(S);
  }
  // a war that ends before the Warlord falls is judged on how far the class got (see progressResult in rules.js)
  const progressOf = (S) => progressResult({ gateHp: S.gate.hp, gateMax: S.gate.max, broken: S.gate.broken, warlordHp: S.warlord.hp, warlordMax: S.warlord.max });
  function endByProgress(S, how) {
    // a battle still being fought when the war ends: the damage it has dealt so far counts (nobody is beaten)
    for (const B of liveBattles(S)) { if (S.status !== "playing") break; if (B.status === "choose" && B.pending) applyRound(S, B, { kind: "strike" }); finishBattle(S, B, B.enemies.every((e) => e.hp <= 0), true); }
    if (S.status !== "playing") return;
    endGame(S, progressOf(S).winner, how);
  }

  // ------------------------------------------------------------------ the clock
  function tick(S) {
    if (S.status !== "playing") return;
    if (S.paused) return flush(S);                 // paused by the teacher: every clock stands still
    const now = Date.now();
    // every student's own question (muster or War Cry); the answer and its explanation stay up a while
    for (const st of S.students.values()) {
      const o = st.own;
      if (o && !o.result && now >= questionEnds(o)) answerOwn(S, st, -1);   // an untimed question never ends by itself
      if (o && o.result && now >= o.result.at + ms(o.result.explain && !o.result.ok ? FEEDBACK_SECONDS + 1 : FEEDBACK_SECONDS)) { st.own = null; S.dirty = true; }
      if (!st.own) maybeGiveQuestion(S, st);
    }
    riderTick(S, now);
    // warband votes that have waited long enough
    for (const b of S.bands.values()) if (b.voteOpenedAt && now >= b.voteOpenedAt + ms(VOTE_SECONDS)) resolveVote(S, b);
    // battles (they go on through every stage of the turn; nobody waits for them)
    for (const B of [...S.battles.values()]) battleTick(S, B, now);
    if (S.status !== "playing") return flush(S);
    // a pair still fighting while the class prepares cannot earn steps (it gets the default); one still fighting all
    // through "Plan your move" plans its own move when its battle ends
    const prep = S.phase === "crimson" || (S.phase === "crystal" && S.stage === "quiz");
    if (prep) for (const b of S.bands.values()) if (b.battle) for (const x of b.pairs) { const p = S.pairs.get(x); if (p) p.missedPrep = S.turn; }
    // a warband planning its own move (its battle ran past "Plan your move") sets off once it has agreed a route (or its
    // time is up), and marches by itself whatever the class is doing
    for (const b of [...S.bands.values()]) if (b.lateUntil && !b.battle && (b.plan || now >= b.lateUntil)) launchBand(S, b);
    if (!(S.phase === "crystal" && S.stage === "march") && S.phase !== "battles") marchTick(S, now);
    botTick(S, now);
    // phase ends (in the training turn nothing ends by time: each stage waits until everyone is done, or Continue)
    const free = untimed(S), go = !!S.advance; S.advance = false;
    if (S.phase === "crimson") {
      if (free) {
        const musterDone = [...S.students.values()].every((st) => st.musterThisTurn >= MUSTER_PER_TURN || !isConnected(st) || fightingNow(S, st) || planningLate(S, st));
        const open = [...S.students.values()].some((st) => isConnected(st) && st.own && (!st.own.result || basicFlow(S)));
        if (go || (S.teacherEnded && musterDone && !open)) { dropOpen(S); runOrders(S); startCrystal(S); if (basicFlow(S) && S.status === "playing") openMoves(S); }
        return flush(S);
      }
      // the class prepares for at most crimsonSeconds (30 s); it ends sooner once the teacher has ended the turn
      // and everyone has answered their preparing questions. A question still open carries on into the short top-up.
      const musterDone = [...S.students.values()].every((st) => prepDone(S, st) || !isConnected(st) || fightingNow(S, st) || planningLate(S, st));
      if (basicFlow(S)) {
        // Basic: the round moves on once everyone has answered 3 (and the teacher has ended the turn, or the teacher's
        // time is up), or when the ANSWER step's longest time is up
        // (the last answer's explanation is read first: the map does not open under it)
        const reading = [...S.students.values()].some((st) => st.own && isConnected(st));
        if ((musterDone && !reading && (S.teacherEnded || now >= S.softEndsAt)) || now >= S.phaseEndsAt) { runOrders(S); startCrystal(S); if (S.status === "playing") { dropOpen(S, true); openMoves(S); } }
      } else if ((S.teacherEnded && musterDone) || now >= S.phaseEndsAt) { runOrders(S); startCrystal(S); }
    } else if (S.phase === "crystal" && S.stage === "quiz") {
      if (quizDone(S) || go || (!free && now >= S.phaseEndsAt)) { dropOpen(S); openMoves(S); if (S.status !== "playing") return flush(S); }
    } else if (S.phase === "crystal" && S.stage === "council") {
      // the council ends when time is up, the teacher launches, or every warband has agreed and the planning time has passed
      const agreed = [...S.bands.values()].every((b) => b.battle || b.plan);
      // every pair but some still choosing (with a student there): they get at least LAST_PAIR_SECONDS from now. The time
      // is never cut, only lengthened, for a pair that has not tapped GO.
      if (!agreed && !free && !S.lastPairAt) {
        const waiting = [...S.bands.values()].filter((b) => !b.battle && !b.plan);
        if (waiting.every((b) => b.pairs.some((x) => humansOf(S, S.pairs.get(x) || { members: [] }).length)) && waiting.length < S.bands.size) {
          S.lastPairAt = now; S.phaseEndsAt = Math.max(S.phaseEndsAt, now + ms(LAST_PAIR_SECONDS)); S.dirty = true;
        }
      }
      if (S.launch || go || (!free && now >= S.phaseEndsAt) || (agreed && (free || now >= S.moveStartedAt + ms(STRATEGY_SECONDS)))) startMarch(S);
    } else if (S.phase === "crystal") {
      marchTick(S, now);
      const marching = [...S.bands.values()].some((b) => (b.path?.length && !b.battle) || (b.resumeUntil && now < b.resumeUntil) || (b.lateUntil && now < b.lateUntil));
      // Grab-Ma is not waited for: the food lands in the bag whenever she arrives (even in a battle)
      if (!marching || now >= S.phaseEndsAt) {
        for (const b of S.bands.values()) { if (!b.battle) b.done = true; if (!b.resumeUntil || now >= b.resumeUntil) b.path = null; b.lateUntil = 0; }
        // The class waits for its battles for at most BATTLE_WAIT_SECONDS (War Cries come meanwhile). A battle that runs
        // longer does not hold the class up: the next turn starts and it goes on (its pairs stay in it). The last turn
        // (the war ends after it), the training turn and the tutorial wait for every battle.
        const all = S.turn >= S.settings.turns || untimed(S) || tutorialHolds(S) || basicFlow(S);
        // Basic: an enemy that walked onto a banner in the enemy's turn is fought now, in the FIGHT step
        if (basicFlow(S)) for (const n of new Set([...S.bands.values()].filter((b) => !b.battle).map((b) => b.node))) {
          const foes = unitsAt(S, n).filter((u) => !u.battle);
          if (foes.length && n !== FORTRESS) startBattle(S, null, "defend", foes);
        }
        if (S.battles.size) {
          S.phase = "battles"; S.phaseStartedAt = now; S.battlesUntil = all ? 0 : now + ms(BATTLE_WAIT_SECONDS); S.phaseEndsAt = S.battlesUntil || now; S.dirty = true;
          say(S, S.turn >= S.settings.turns ? "The last battles of the war are being fought." : basicFlow(S) ? "The battles of this round are being fought." : "The battles of this turn are being fought.");
        }
        else if (!tutorialHolds(S)) startCrimson(S);
        else if (S.phase !== "battles") { S.phase = "battles"; S.phaseStartedAt = now; S.battlesUntil = 0; S.dirty = true; }
      }
    } else if (S.phase === "battles") {
      marchTick(S, now);
      const busy = [...S.bands.values()].some((b) => (b.path?.length && !b.battle) || (b.resumeUntil && now < b.resumeUntil));
      // a battle running long: the class carries on with the next turn while it is fought
      const longOnes = S.battlesUntil && now >= S.battlesUntil && liveBattles(S).length;
      if (longOnes && !busy && !tutorialHolds(S)) say(S, `The battle at ${liveBattles(S).map((B) => nodeName(B.node)).join(" and ")} goes on. The class carries on with the next turn.`, "battle");
      // (a battle just over keeps its result on screen a moment before the next turn)
      if ((!S.battles.size || longOnes) && !busy && !tutorialHolds(S)) startCrimson(S);
    }
    flush(S);
  }

  // the teacher pressed Continue (or the tutorial moved on): a question still open is put away, not counted
  function dropOpen(S, all = false) { for (const st of S.students.values()) if (st.own && !st.own.result && (all || st.own.untimed)) { st.own = null; S.dirty = true; } }
  // the practice tutorial keeps turn 1 open after its battle until the student has seen HP and food (or skips)
  const tutorialHolds = (S) => !!(S.practice && S.tutorial && S.turn === 1 && !S.tutorialDone);
  // the training turn ends early (Skip tutorial, or the tutorial is done): every clock starts again from now
  function endTraining(S) {
    if (!S.training) return;
    S.training = false; S.tutorialDone = true;
    const now = Date.now();
    if (S.phase === "crimson") S.phaseEndsAt = now + ms(S.settings.crimsonSeconds);
    else if (S.phase === "crystal" && S.stage === "quiz") S.phaseEndsAt = now + ms(TOPUP_SECONDS);
    else if (S.phase === "crystal" && S.stage === "council") { S.phaseEndsAt = now + ms(S.settings.councilSeconds || COUNCIL_SECONDS); S.moveStartedAt = now; }
    for (const st of S.students.values()) if (st.own?.untimed) { st.own.untimed = false; if (!st.own.result) st.own.startedAt = now; }
    for (const B of S.battles.values()) {
      B.untimed = false;
      if (B.q?.untimed) { B.q.untimed = false; B.q.startedAt = now; B.q._bot = null; }
      if (B.choose?.untimed) { B.choose.untimed = false; B.choose.endsAt = now + ms(ACTION_SECONDS); }
    }
    S.dirty = true;
  }

  // Who answers what when they are not fighting: during a battle anywhere, a War Cry for it; otherwise muster.
  function maybeGiveQuestion(S, st) {
    const p = pairOf(S, st.pid); if (!p) return;
    const b = bandOf(S, p.id); if (!b) return;
    if (b.battle) return;                                         // fighters answer the battle's own questions
    const now = Date.now();
    // just after its battle the pair chooses what to do next (join a battle still on, or a warband), or plans its own
    // move: no new question yet
    if (p.afterUntil > now && afterOptions(S, p)) return;
    if (b.lateUntil > now) return;
    if (basicFlow(S) && !xo(S, "warcry")) {
      // Basic: exactly 3 questions in the ANSWER step, and nothing else (no War Cries, no bonus questions, no top-ups)
      if (S.phase !== "crimson" || st.musterThisTurn >= BASIC_QUESTIONS) return;
      if (!untimed(S) && now + ms(READ_SECONDS + 4) > S.phaseEndsAt) return;      // too late for a whole question
      return giveOwnQuestion(S, st, "muster");
    }
    if (S.phase === "crimson") {
      // a battle still being fought: once a student has their 3 preparing questions, War Cries help it
      if (st.musterThisTurn >= MUSTER_PER_TURN && !untimed(S) && !S.teacherEnded && now >= (st.cryUntil || 0) && now < S.phaseEndsAt - ms(LATE_PREP_SECONDS)) {
        let B = st.supporting && S.battles.get(st.supporting);
        if (!B || B.status === "over" || B.status === "gather") B = warcryTarget(S);
        if (B) return giveOwnQuestion(S, st, "warcry", B.id);
      }
      if ((S.teacherEnded || untimed(S)) && st.musterThisTurn >= MUSTER_PER_TURN) return;
      // once a student has their 3, no new question starts near the end (an unfinished one would hold up the class)
      if (!untimed(S) && st.musterThisTurn >= MUSTER_PER_TURN && now >= S.phaseEndsAt - ms(LATE_PREP_SECONDS)) return;
      return giveOwnQuestion(S, st, "muster");
    }
    // the short top-up after the enemy's turn: only a student who has not answered 3 preparing questions gets one
    if (S.phase === "crystal" && S.stage === "quiz") {
      if (st.musterThisTurn >= MUSTER_PER_TURN) return;
      if (!untimed(S) && now >= S.phaseEndsAt - ms(LATE_TOPUP_SECONDS)) return;
      return giveOwnQuestion(S, st, "muster");
    }
    if (S.phase === "crystal" && S.stage === "council") return;  // the War Council: the map has their full attention
    // War Cries come by themselves to everyone not fighting while a battle is on (a short wait after a wrong one)
    if (now < (st.cryUntil || 0)) return;
    let B = st.supporting && S.battles.get(st.supporting);
    if (!B || B.status === "over" || B.status === "gather") { st.supporting = null; B = warcryTarget(S); }
    if (B) giveOwnQuestion(S, st, "warcry", B.id);
  }
  // the battle a War Cry goes to: the one with the most enemy strength still standing
  const warcryTarget = (S) => [...S.battles.values()].filter((B) => B.status !== "over" && B.status !== "gather")
    .sort((a, b) => b.enemies.reduce((n, e) => n + Math.max(0, e.hp), 0) - a.enemies.reduce((n, e) => n + Math.max(0, e.hp), 0))[0] || null;

  // chosen: the question's own index (bots answer with it; the socket handler turns a student's button into it)
  function answerOwn(S, st, chosen) {
    const o = st.own; if (!o || o.result) return;
    if (chosen >= 0 && reading(o)) return;
    const ok = record(S, st, o.q, chosen, o.kind);
    // the result in the student's own order of choices, with the explanation
    o.result = { ok, chosen: toShown(o.perm, chosen), right: toShown(o.perm, rightAnswers(o.q)[0]), at: Date.now(), explain: explainOf(o.q) };
    if (o.kind === "quiz" && o.bonus) { /* a bonus question: coins only (record pays them) */ }
    else if (o.kind === "quiz") {
      st.quiz = (st.quiz || 0) + 1; if (ok) st.quizRight = (st.quizRight || 0) + 1;
      if (st.quiz >= QUIZ_PER_MOVE && st.quizRight >= QUIZ_PER_MOVE) { st.coins = (st.coins || 0) + QUIZ_BONUS; o.result.bonus = QUIZ_BONUS; }
    } else if (o.kind === "muster") {
      st.musterThisTurn++;
      // a right preparing answer earns PREP_COINS (record has paid the usual 10); the first 3 of a turn all right earn a bonus
      const coins = xo(S, "coins");
      if (ok && coins) st.coins = (st.coins || 0) + PREP_COINS - COINS_PER_RIGHT;
      if (ok && st.musterThisTurn <= QUIZ_PER_MOVE) st.prepRight = (st.prepRight || 0) + 1;
      if (coins && st.musterThisTurn === QUIZ_PER_MOVE && st.prepRight >= QUIZ_PER_MOVE) { st.coins = (st.coins || 0) + QUIZ_BONUS; o.result.bonus = QUIZ_BONUS; }
      // a battle is being fought while the class prepares: every right preparing answer also cheers it on (a War Cry)
      if (ok && xo(S, "warcry")) {
        let B = st.supporting && S.battles.get(st.supporting);
        if (!B || B.status === "over" || B.status === "gather") B = warcryTarget(S);
        if (B) { B.warcryNow++; B.cheers.set(st.pairId, (B.cheers.get(st.pairId) || 0) + 1); o.result.cheer = B.node; }
      }
      // each student adds up to PREP_AP_EACH (a student alone, up to the pair's cap), so both partners count
      const p = pairOf(S, st.pid);
      if (ok && p) {
        st.prep = (st.prep || 0) + 1;
        // Basic: every right answer is 1 step for the pair, at most 2 from each partner (a student alone: up to 3, their
        // whole 3 questions), so each student's own answers count. The full game also caps each partner at 2.
        const each = basicFlow(S) ? (p.members.length > 1 ? BASIC_STEPS_EACH : BASIC_QUESTIONS) : p.members.length > 1 ? PREP_AP_EACH : MUSTER_MP_CAP;
        const cap = basicFlow(S) ? Infinity : MUSTER_MP_CAP;
        const before = Math.min(cap, p.bank || 0);
        p.bank = p.members.reduce((a, m) => a + Math.min(each, S.students.get(m)?.prep || 0), 0);
        // did this answer add a step?
        o.result.step = Math.min(cap, p.bank) > before;
      }
      if (p) o.result.steps = basicFlow(S) ? basicSteps(p.bank || 0, buffOn(S)) : pairMP(p.bank || 0, buffOn(S));
      // Basic: all 3 right earns a star, 1 extra hit on the student's next right answer in a fight
      if (basicFlow(S) && st.musterThisTurn === BASIC_QUESTIONS && (st.prepRight || 0) >= BASIC_QUESTIONS) { st.star = true; o.result.star = true; }
    } else if (o.kind === "warcry") {
      const B = S.battles.get(o.battleId);
      if (B && ok) { B.warcryNow++; B.cheers.set(st.pairId, (B.cheers.get(st.pairId) || 0) + 1); }
      if (!ok && chosen >= 0) st.cryUntil = Date.now() + ms(WARCRY_COOLDOWN + FEEDBACK_SECONDS);   // guessing does not pay
    }
    S.dirty = true;
  }

  // ------------------------------------------------------------------ moving: one step at a time, by vote
  function canStep(S, b, to) {
    if (S.phase !== "crystal") return "Wait for your turn.";
    if (b.battle) return "Your warband is in a battle.";
    if (b.done) return "Your warband has finished moving this turn.";
    if (S.phase === "crystal" && S.stage === "quiz") return "Finish your preparing questions first. Planning opens in a few seconds.";
    if (to === "stay") return null;
    if (!Number.isInteger(to) || !isAdjacent(b.node, to)) return "You can only move one stop at a time, along a road.";
    if (cost(b.node, to) > b.mp) return "Not enough steps for that road.";
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
    if (xo(S, "camps") && OUTPOSTS.includes(choice) && !unitsAt(S, choice).length && !S.rally.has(choice)) { S.rally.add(choice); say(S, `The class has taken ${nodeName(choice)}. It is now a safe camp.`, "crystal"); }
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
    // the warband's AP: the average of its pairs (rounded)
    if (S.phase === "crystal") { const a = target.pairs.length - 1; target.mp = Math.round((target.mp * a + mine.mp) / (a + 1)); target.done = target.done && mine.done; }
    if (!mine.pairs.length) S.bands.delete(mine.id);
    target.votes = {}; target.voteOpenedAt = 0;
    const jp = S.pairs.get(pairId), lead = S.pairs.get(target.pairs[0]);
    const bot = (p) => p && p.members.every((m) => S.students.get(m)?.bot);
    for (const x of target.pairs) if (x !== pairId) note(S, x, `Pair ${jp?.no}${bot(jp) ? " (bots)" : ""} asked to march with you. You are now one warband: you plan one route and march together.`, { kind: "join", leave: true });
    note(S, pairId, `You joined Pair ${lead?.no}'s warband. You now plan one route and march together.`, { kind: "join", leave: true });
    say(S, `${pairLabel(S, jp)} joined a warband at ${nodeName(target.node)}.`, "crystal");
    return null;
  }
  // The warbands a pair could join: on the same stop (join now) or within REGROUP_STEPS steps (set off to join it)
  function regroupFor(S, b) {
    const dist = reachable(b.node, REGROUP_STEPS, (n) => seenBlock(S, n) || !!battleAt(S, n));
    return [...S.bands.values()].filter((x) => x.id !== b.id).map((x) => {
      const here = x.node === b.node, d = here ? 0 : dist.get(x.node);
      return { id: x.id, node: x.node, cost: d ?? null, here, reach: !x.battle && (here || d != null), battle: !!x.battle };
    });
  }
  // the warband a pair has set off to join (by its lead pair, since warbands change as pairs join and leave)
  const intentBand = (S, p) => { const t = p?.joinIntent && bandOf(S, p.joinIntent); return t && !bandOf(S, p.id)?.pairs.includes(p.joinIntent) ? t : null; };
  // a pair taps JOIN on a warband: on the same stop it joins now; within reach it sets off to join it (its route is
  // planned towards it, and it joins on arrival)
  function wantBand(S, pairId, targetId) {
    const p = S.pairs.get(pairId), mine = bandOf(S, pairId), target = S.bands.get(targetId);
    if (!p || !mine) return "You are not on the map yet.";
    if (!targetId) { p.joinIntent = null; S.dirty = true; return null; }
    if (!target || mine === target) return "That warband is not here.";
    if (mine.battle || target.battle) return "Not while a battle is on.";
    if (mine.node === target.node) { p.joinIntent = null; return joinBand(S, pairId, targetId); }
    const opt = regroupFor(S, mine).find((x) => x.id === targetId);
    if (!opt?.reach) return `That warband is too far away. You can set off to join a warband up to ${REGROUP_STEPS} steps away.`;
    p.joinIntent = target.pairs[0]; p.intentTurn = S.turn;
    const lead = S.pairs.get(target.pairs[0]);
    for (const x of mine.pairs) note(S, x, `${x === pairId ? "You are" : `Pair ${p.no} is`} setting off to join Pair ${lead?.no}'s warband at ${nodeName(target.node)}. ${planOpen(S, mine) ? "Send the route there to march now." : "Your route goes there when you plan your move."}`, { kind: "join" });
    S.dirty = true; return null;
  }
  // a warband standing where the warband one of its pairs set off to join stands: they become one warband
  function joinIntents(S, b) {
    if (b.battle) return false;
    for (const x of [...b.pairs]) {
      const p = S.pairs.get(x), t = intentBand(S, p);
      if (!t || t.battle || t.node !== b.node || t === b) continue;
      for (const y of [...b.pairs]) { joinBand(S, y, t.id); const q = S.pairs.get(y); if (q) q.joinIntent = null; }
      return !S.bands.has(b.id);
    }
    return false;
  }
  // forHelp: the pair is leaving for a while to help another battle (it comes back afterwards)
  function leaveBand(S, pairId, forHelp = false) {
    const b = bandOf(S, pairId); if (!b || b.pairs.length < 2) return "You are not in a warband.";
    if (b.battle) return "Not while a battle is on.";
    b.pairs = b.pairs.filter((x) => x !== pairId); delete b.votes[pairId]; if (b.props) delete b.props[pairId]; if (b.drafts) delete b.drafts[pairId];
    b.plan = agreedPlan(S, b);
    if (!forHelp) { const p = S.pairs.get(pairId); if (p) p.homeLead = null; }
    for (const x of b.pairs) note(S, x, forHelp ? `Pair ${S.pairs.get(pairId)?.no} went to help another battle. They come back to your warband after it.` : `Pair ${S.pairs.get(pairId)?.no} left your warband.`, { kind: "leave" });
    if (!forHelp) note(S, pairId, "You left the warband. Your pair now plans and moves on its own.", { kind: "leave" });
    S.bands.set(id(S, "b"), { id: `b${S.seq}`, pairs: [pairId], node: b.node, mp: b.mp, done: b.done, votes: {}, props: {}, plan: null, voteOpenedAt: 0, battle: null });
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
    else if (kind === "gate" || kind === "boss") {
      if (kind === "boss" && prepMet(S) && !S.warlord.weakened) { S.warlord.weakened = true; S.warlord.hp = Math.round(S.warlord.hp * 0.75); say(S, "The class met its preparation target: the Warlord starts the battle weakened!", "big"); }
      enemies = fortressEnemies(S);
    }
    else if (kind === "defend") enemies = attackers.map((u) => unitEnemy(S, u));
    else enemies = unitsAt(S, n).map((u) => unitEnemy(S, u));
    const ambush = kind === "host" && unitsAt(S, n).some((u) => u.ambush);
    for (const u of unitsAt(S, n)) { u.ambush = false; if (u.order?.kind === "ambush") u.order = null; }
    applyAura(enemies);
    // Basic: every pair on the stop fights (a team is simply the pairs on one stop)
    // (a pair marching away from the stop is not pulled back into the fight)
    const bandIds = kind === "defend" || basicFlow(S) ? [...new Set([...(b ? [b.id] : []), ...bandsAt(S, n).filter((x) => !x.battle && !(basicFlow(S) && x.path?.length)).map((x) => x.id)])] : [b.id];
    // Basic battles: everyone answers the same question, and every right answer is a hit (the full game's moves are an Extra)
    const simple = !xo(S, "moves");
    // Basic: pairs one road away get a YES / NO card to help. With nobody near enough, the battle starts almost at once.
    // (the battle waits while any of them is still deciding: see helpWait)
    const gather = basicFlow(S) ? 3 : untimed(S) ? 3 : JOIN_SECONDS;
    const B = {
      id: id(S, "x"), node: n, kind, bands: bandIds, enemies, status: "gather", startedAt: Date.now(), simple, helped: [], declined: [], offers: {},
      gateStart: kind === "gate" ? S.gate.hp : kind === "boss" ? S.warlord.hp : null,
      gatherEnds: Date.now() + ms(gather), qNo: 0, untimed: untimed(S),
      tutorial: !!(S.practice && S.tutorial && !S.tutorialDone && S.turn === 1 && unitsAt(S, n).some((u) => u.tutorial)), limit: battleLength(kind === "defend" ? "host" : kind, buffOn(S)),
      q: null, striker: null, answers: new Map(), strikes: new Map(), warcryNow: 0, cheers: new Map(),
      fighters: {}, sync: 0, mod: { guard: 0, atkUp: 0, atkDown: 0 }, choose: null, pending: null,
      resolve: 0, resolveMax: 0, round: null, resultUntil: 0, outcome: null, attackers: kind === "defend" ? attackers.map((u) => u.id) : [],
      ambush, targets: {}, wave: [], waveNo: 0,
    };
    for (const bid of bandIds) { const x = S.bands.get(bid); x.battle = B.id; x.done = true; x.votes = {}; x.voteOpenedAt = 0; if (basicFlow(S)) { x.path = []; x.rest = null; } }
    if (ambush && simple) B.limit = Math.max(3, B.limit - 1);       // caught by surprise: one question less to win it
    for (const e of enemies) { const u = S.units.get(e.ref); if (u) u.battle = B.id; }
    S.battles.set(B.id, B); S.fought = (S.fought || 0) + 1;
    if (kind === "gate" || kind === "boss") { reached(S, FORTRESS); S.gateFights = (S.gateFights || 0) + 1; }
    if (basicFlow(S)) helpWait(S, B, Date.now());
    const host = basicFlow(S) ? "the enemy army" : "the Crimson Host";
    const what = kind === "camp" ? CAMPS[n].name : kind === "gate" ? "the gate guardian" : kind === "boss" ? "THE CRIMSON WARLORD" : host;
    if (ambush) say(S, `AMBUSH at ${nodeName(n)}! ${basicFlow(S) ? "The enemy" : "The Crimson Host"} was hiding there.`, "big");
    else if (kind === "defend") say(S, basicFlow(S) ? `The enemy army attacks the pairs at ${nodeName(n)}!` : `The Crimson Host attacks the Crystal warbands at ${nodeName(n)}!`, "crimson");
    else say(S, `Battle at ${nodeName(n)} against ${what}!`, kind === "boss" ? "big" : "battle");
    return B;
  }

  // warbands one road away may join while the battle gathers
  const canJoinBattle = (S, b, B) => B.status === "gather" && !b.battle && (b.node === B.node || isAdjacent(b.node, B.node));
  function joinBattle(S, pairId, battleId, help = false) {
    const b = bandOf(S, pairId), B = S.battles.get(battleId);
    if (!b || !B) return "That battle is over.";
    if (!canJoinBattle(S, b, B)) return "Too late, or too far away, to join that battle.";
    const from = b.node;
    b.node = B.node; b.battle = B.id; b.done = true; b.votes = {}; b.voteOpenedAt = 0;
    if (basicFlow(S)) { b.path = []; b.rest = null; b.resumeUntil = 0; }
    B.bands.push(b.id);
    // a pair that came from next door to help: the pairs already there are told, and it gives the reinforcement bonus
    if (basicFlow(S) && help && from !== B.node) {
      B.helped.push(b.id);
      const nos = b.pairs.map((x) => S.pairs.get(x)?.no).filter(Boolean);
      for (const x of pairsIn(S, B)) if (!b.pairs.includes(x)) note(S, x, `Pair ${nos.join(" and Pair ")} came to help!`, { kind: "help" });
      helpCheck(S, B);
    }
    say(S, `${b.pairs.map((x) => pairLabel(S, S.pairs.get(x))).join(", ")} joined the battle at ${nodeName(B.node)}.`, "crystal");
    return null;
  }

  // Basic: the pairs one road away that could still say YES to helping a battle that is starting
  // (a pair already marching there is not asked: it is on its way to join anyway)
  // (a pair still marching is not asked: it may be passing by; it is asked once it stops next door)
  const helpOffers = (S, B) => B.status !== "gather" ? [] : [...S.bands.values()].filter((x) => !x.battle && x.node !== B.node && isAdjacent(x.node, B.node) && !B.declined.includes(x.id) && !(x.path || []).length);
  // The battle waits for the pairs deciding whether to help: each pair has HELP_SECONDS from the moment it is asked. The
  // battle starts as soon as every pair asked has said YES or NO (and never before its own short start, 3 seconds).
  function helpWait(S, B, now) {
    if (B.status !== "gather") return;
    const open = helpOffers(S, B);
    for (const x of open) if (!B.offers[x.id]) { B.offers[x.id] = now; S.dirty = true; }
    const base = B.startedAt + ms(3);
    const end = open.length ? Math.max(base, ...open.map((x) => B.offers[x.id] + ms(HELP_SECONDS))) : Math.min(B.gatherEnds, Math.max(base, now + ms(1)));
    if (end !== B.gatherEnds) { B.gatherEnds = end; S.dirty = true; }
  }
  // nobody left to ask: the battle starts in a moment instead of waiting out the whole help time
  function helpCheck(S, B) { if (B.status === "gather" && basicFlow(S)) helpWait(S, B, Date.now()); }
  function answerHelp(S, pairId, battleId, yes) {
    const b = bandOf(S, pairId), B = S.battles.get(battleId);
    if (!b || !B || B.status !== "gather") return "That battle has already started.";
    if (yes) return helpOffers(S, B).includes(b) ? joinBattle(S, pairId, battleId, true) : "Too late, or too far away, to help that battle.";
    if (!B.declined.includes(b.id)) B.declined.push(b.id);
    helpCheck(S, B); S.dirty = true; return null;
  }

  // ---- reinforcements: a pair whose battle has just ended joins another battle still being fought ----
  // Any battle of the class, anywhere on the map: the pair fights from where it stands (its banner does not move), with
  // its own HP, answers along and takes strike turns. While joined pairs answer right, the battle hits harder and the
  // warband takes less damage (reinforceBonus in rules.js).
  const canReinforce = (S, p, B) => !!p && p.afterUntil > Date.now() && B.id !== p.afterFrom && B.status !== "over" && B.qNo < B.limit
    && (B.guests || []).length < REINFORCE_MAX && !pairsIn(S, B).includes(p.id);
  function reinforce(S, pairId, battleId) {
    const p = S.pairs.get(pairId), B = S.battles.get(battleId);
    let b = bandOf(S, pairId);
    if (!p || !b) return "You are not on the map yet.";
    if (!B || B.status === "over") return "That battle is over.";
    if (b.battle) return "Your warband is in a battle.";
    if (!(p.afterUntil > Date.now())) return "You can join a battle that is still on just after your own battle ends.";
    if ((B.guests || []).length >= REINFORCE_MAX) return `That battle already has ${REINFORCE_MAX} pairs helping it.`;
    if (B.qNo >= B.limit) return "That battle is about to end.";
    if (!canReinforce(S, p, B)) return "You cannot join that battle.";
    // the pair leaves its warband for this (the others stay where they are) and fights from its own stop; it goes back
    // to its warband when the battle ends
    p.homeLead = null;
    if (b.pairs.length > 1) { p.homeLead = b.pairs.find((x) => x !== pairId) || null; leaveBand(S, pairId, true); b = bandOf(S, pairId); }
    b.battle = B.id; b.guestOf = B.id; b.done = true; b.votes = {}; b.voteOpenedAt = 0; b.path = null; b.rest = null; b.resumeUntil = 0; b.lateUntil = 0; b.plan = null;
    B.bands.push(b.id); (B.guests ||= []).push(b.id);
    p.afterUntil = 0; p.joinIntent = null;
    if (B.status !== "gather") {                         // the fight is on: the pair comes in with its own HP and a monster
      B.php[p.id] = Math.max(0.05, +(p.hp ?? RESOLVE_PER_PAIR));
      B.startHp[p.id] = p.hp ?? RESOLVE_PER_PAIR;
      B.resolveMax += p.maxHp || RESOLVE_PER_PAIR;
      syncResolve(B);
      for (const m of p.members) fighterOf(S, B, m);
      retarget(S, B);
    }
    (B.joins ||= []).push({ no: p.no, at: Date.now() });
    for (const x of pairsIn(S, B)) if (x !== pairId) note(S, x, `Pair ${p.no} joined your battle! While they answer right, your warband hits harder and takes less damage.`, { kind: "reinforce" });
    note(S, pairId, `You joined the battle at ${nodeName(B.node)}. You fight from ${nodeName(b.node)}, and your banner stays there.`, { kind: "reinforce" });
    say(S, `Pair ${p.no} joined the battle at ${nodeName(B.node)} to help.`, "crystal");
    S.dirty = true;
    return null;
  }
  // a battle it could join (the choice only lasts a short while, so no new question comes until it has chosen)
  const afterOptions = (S, p) => liveBattles(S).some((B) => canReinforce(S, p, B));
  // after a battle: each of its pairs may join another battle still being fought (for a short while) or set off to join a
  // warband. A warband whose battle ran on into "Plan your move" plans now; one whose battle ran past it plans its own
  // move while the others march.
  function afterBattle(S, B, all, won) {
    const now = Date.now();
    for (const b of all) for (const x of b.pairs) { const p = S.pairs.get(x); if (p) Object.assign(p, { afterUntil: now + ms(REINFORCE_SECONDS), afterFrom: B.id, afterWon: !!won, afterNode: B.node }); }
    if (S.status !== "playing") return;
    for (const b of all) {
      const ps = b.pairs.map((x) => S.pairs.get(x)).filter(Boolean);
      const council = S.phase === "crystal" && S.stage === "council";
      const late = !council && ps.some((p) => p.owed);
      if (!council && !late) continue;
      b.props = {}; b.plan = null; b.path = null; b.done = false; b.held = false; b.rest = null; b.resumeUntil = 0;
      for (const p of ps) { p.picks = {}; p.drafts = {}; }
      b.mp = Math.max(b.mp || 0, ps.some((p) => p.missedPrep === S.turn) || late ? LATE_STEPS : 0);
      if (late) b.lateUntil = now + ms(LATE_PLAN_SECONDS);
      for (const p of ps) note(S, p.id, late ? `Your battle ran long, so you missed planning with the class. Plan your own move now: you have ${b.mp} step${b.mp === 1 ? "" : "s"}.`
        : `Your battle is over. Plan your move with the class: you have ${b.mp} step${b.mp === 1 ? "" : "s"}.`, { kind: "late" });
    }
  }

  const fightersOf = (S, B) => B.bands.flatMap((bid) => { const b = S.bands.get(bid); return b ? studentsOfBand(S, b) : []; });
  const pairsIn = (S, B) => B.bands.flatMap((bid) => S.bands.get(bid)?.pairs || []);

  function battleTick(S, B, now) {
    const was = B.status;
    battleStep(S, B, now);
    if (B.status !== was || !S.battles.has(B.id)) S.dirty = true;
  }
  function battleStep(S, B, now) {
    if (B.status === "gather" && basicFlow(S) && !B.untimed) helpWait(S, B, now);
    if (B.status === "gather" && now >= B.gatherEnds) {
      if (!pairsIn(S, B).length) return finishBattle(S, B, false);
      // the warband fights with the HP its pairs still have: it does not come back between battles (food heals)
      const ps = pairsIn(S, B).map((x) => S.pairs.get(x)).filter(Boolean);
      B.resolveMax = ps.reduce((a, p) => a + (p.maxHp || RESOLVE_PER_PAIR), 0) || resolveFor(1);
      B.startHp = Object.fromEntries(ps.map((p) => [p.id, p.hp ?? RESOLVE_PER_PAIR]));
      // each pair has its own HP in the battle (the enemy hits back mainly at the pairs engaging it)
      B.php = Object.fromEntries(ps.map((p) => [p.id, Math.max(0.05, +(p.hp ?? RESOLVE_PER_PAIR))]));
      if (B.ambush) for (const p of ps) B.php[p.id] = Math.max(0.05, +(B.php[p.id] - (p.maxHp || RESOLVE_PER_PAIR) * AMBUSH_HIT).toFixed(2));   // caught by surprise
      syncResolve(B);
      B.dealt = {}; B.moved = {};
      for (const p of fightersOf(S, B)) fighterOf(S, B, p);
      // enemies come in waves, the ones most pairs picked first: one at a time, two when two pairs or more fight
      const votes = (i) => Object.values(B.targets).filter((t) => t === i).length;
      B.order = B.enemies.map((_, i) => i).sort((a, c) => votes(c) - votes(a) || a - c);
      const picks = { ...B.targets };
      nextWave(S, B);
      // a Basic battle without "Choosing monsters": every monster is on the field, and the hits go to the first one standing
      if (B.simple && !xo(S, "pick")) B.wave = B.enemies.map((e, i) => (e.hp > 0 ? i : -1)).filter((i) => i >= 0);
      // every pair engages a monster on the field: its own pick if it is out, else the one with the fewest pairs on it
      retarget(S, B, picks, true);
      B.status = "fight"; nextBattleQuestion(S, B); return;
    }
    if (B.status === "fight" && B.q) {
      const fighters = fightersOf(S, B).filter((p) => isConnected(S.students.get(p)));
      const allIn = fighters.length && fighters.every((p) => B.answers.has(p));
      if (allIn || now >= battleEnds(S, B)) (B.simple ? simpleResolve(S, B) : resolveBattleQuestion(S, B));
      return;
    }
    if (B.status === "choose" && !B.choose.untimed && now >= B.choose.endsAt) { applyRound(S, B, { kind: "strike" }); return; }
    if (B.status === "result" && now >= B.resultUntil) {
      // beating the Warlord wins, even with guards still standing beside him
      if (B.enemies.every((e) => e.hp <= 0) || (B.kind === "boss" && B.enemies.some((e) => e.ref === "warlord" && e.hp <= 0))) return finishBattle(S, B, true);
      if (B.resolve <= 0 || B.qNo >= B.limit) return finishBattle(S, B, false);
      B.status = "fight"; nextBattleQuestion(S, B);
      return;
    }
    if (B.status === "over" && now >= B.resultUntil) { S.battles.delete(B.id); S.dirty = true; }
  }

  // The next Striker: the pair (still here) that has struck least in this battle, then its member who has struck least.
  // Taking pairs in turn means every pair of a big warband gets a turn before any pair gets a second.
  function pickStriker(S, B) {
    const live = (pid) => isConnected(S.students.get(pid));
    if (B.tutorial && B.qNo <= 2) {
      const human = fightersOf(S, B).find((pid) => !S.students.get(pid)?.bot);
      const mate = human && (pairOf(S, human)?.members || []).find((m) => m !== human && S.students.get(m)?.bot);
      if (B.qNo === 1 && human) return human;
      if (B.qNo === 2 && mate) { B.forceWrong = mate; return mate; }
    }
    const pairs = pairsIn(S, B).map((x) => S.pairs.get(x)).filter(Boolean);
    let list = pairs.map((p) => ({ p, ms: p.members.filter(live) })).filter((x) => x.ms.length);
    if (!list.length) list = pairs.map((p) => ({ p, ms: p.members }));
    if (!list.length) return null;
    B.pairStrikes ||= {};
    let best = null;
    for (const x of list) if (!best || (B.pairStrikes[x.p.id] || 0) < (B.pairStrikes[best.p.id] || 0)) best = x;
    B.pairStrikes[best.p.id] = (B.pairStrikes[best.p.id] || 0) + 1;
    let m = null;
    for (const pid of best.ms) if (m == null || (B.strikes.get(pid) || 0) < (B.strikes.get(m) || 0)) m = pid;
    return m;
  }

  // A battle question the fighters have seen least (each student's "seen" list is shared by every kind of question)
  function nextBattleQuestion(S, B) {
    const pool = poolOf(S);
    B.used = B.used || new Set();
    let fresh = pool.filter((q) => !B.used.has(qKey(q)));
    if (!fresh.length) { B.used.clear(); fresh = pool.slice(); }
    const fighters = fightersOf(S, B).map((p) => S.students.get(p)).filter(Boolean);
    const seenBy = (q) => fighters.reduce((n, st) => n + (st.seen.has(qKey(q)) ? 1 : 0), 0);
    let least = Infinity, best = [];
    for (const q of fresh) { const n = seenBy(q); if (n < least) { least = n; best = [q]; } else if (n === least) best.push(q); }
    const q = best[Math.floor(Math.random() * best.length)];
    B.used.add(qKey(q));
    for (const st of fighters) st.seen.add(qKey(q));
    B.qNo++; B.answers = new Map();
    B.striker = B.simple ? null : pickStriker(S, B);            // a Basic battle has no turns: everyone answers the question
    if (B.striker) B.strikes.set(B.striker, (B.strikes.get(B.striker) || 0) + 1);
    B.q = { startedAt: Date.now(), recall: READ_SECONDS, seconds: ANSWER_SECONDS, full: q, perms: {}, untimed: !!B.untimed && untimed(S) };
  }
  // each fighter's own order of the choices for this question (made the first time they are sent it)
  const permFor = (B, pid) => (B.q.perms[pid] ||= makePerm(B.q.full));

  // chosen: the question's own index; shown: the button the student pressed (for their own reveal)
  function battleAnswer(S, st, chosen, shown = chosen) {
    const B = [...S.battles.values()].find((x) => x.status === "fight" && fightersOf(S, x).includes(st.pid));
    if (!B || !B.q || B.answers.has(st.pid)) return;
    if (chosen >= 0 && reading(B.q)) return;
    const ok = record(S, st, B.q.full, chosen, "battle", !B.simple && B.striker !== st.pid);
    B.answers.set(st.pid, { chosen, shown, ok, at: Date.now() });
    S.dirty = true;
    return { ok, chosen: shown, striker: B.striker === st.pid, startedAt: B.q.startedAt };
  }

  const who = (S, pid) => { const st = S.students.get(pid), p = st && S.pairs.get(st.pairId); return st ? { pid, name: st.name, pairNo: p?.no || null, char: st.char || p?.char || null, bot: !!st.bot } : null; };

  // ---- each student's Academy Rift fighter in this battle: SP, cooldowns, their bag of items ----
  const CHAR = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
  function fighterOf(S, B, pid) {
    if (!B.fighters[pid]) {
      const st = S.students.get(pid), p = pairOf(S, pid);
      const base = CHAR(st?.char || p?.char || "kuro");
      B.fighters[pid] = { char: base.id, sp: base.sp, maxSp: base.sp, cd: {} };
    }
    return B.fighters[pid];
  }
  // the move menu a student sees on their turn
  function movesFor(S, B, pid) {
    const F = fighterOf(S, B, pid), base = CHAR(F.char), st = S.students.get(pid);
    return {
      char: base.id, sp: F.sp, maxSp: F.maxSp,
      skills: base.skills.map((sk, i) => ({ i, name: sk.name, sp: sk.sp, kind: sk.kind, desc: sk.desc, cd: F.cd[i] || 0, ok: F.sp >= sk.sp && !(F.cd[i] > 0) })),
      ult: { name: base.ultimate.name, archetype: base.ultimate.archetype, ready: B.sync >= 100 },
      items: Object.entries(st?.bag || {}).filter(([, n]) => n > 0).map(([id, n]) => ({ id, n, name: ITEM_BY_ID[id]?.name || id, desc: TW_ITEMS[id]?.desc || ITEM_BY_ID[id]?.desc || "" })).filter((x) => !ITEM_BY_ID[x.id]?.passive),
    };
  }
  // a fighter's skill as Total War hits: a basic strike is 2 hits; stronger skills hit harder, as in the Arena
  const skillHits = (sk) => 2 * skillPower(sk) / skillPower({ power: 250, sp: 0 });

  function resolveBattleQuestion(S, B) {
    for (const p of fightersOf(S, B)) if (!B.answers.has(p)) { const st = S.students.get(p); if (st && isConnected(st)) { record(S, st, B.q.full, -1, "battle", B.striker !== p); B.answers.set(p, { chosen: -1, shown: -1, ok: false, at: Infinity }); } }
    const strikerAns = B.answers.get(B.striker);
    const strike = !!strikerAns?.ok;
    const along = [...B.answers.entries()].filter(([p]) => p !== B.striker);
    const rightAlong = along.filter(([, a]) => a.ok);
    // a missed strike goes to a random supporter who was right (not the fastest, so rushing does not pay)
    const stealer = !strike && rightAlong.length ? rightAlong[Math.floor(Math.random() * rightAlong.length)][0] : null;
    const answered = [...B.answers.values()];
    const right = answered.filter((a) => a.ok).length;
    B.sync = Math.min(100, B.sync + Math.round(SYNC_PER_QUESTION * (answered.length ? right / answered.length : 0)) + (strike ? 4 : 0));   // the warband's Sync gauge
    for (const F of Object.values(B.fighters)) F.sp = Math.min(F.maxSp, F.sp + SP_REGEN);
    // joined pairs (reinforcements) that answered right this question
    const guestPairs = (B.guests || []).flatMap((bid) => S.bands.get(bid)?.pairs || []);
    const rightGuests = guestPairs.filter((x) => S.pairs.get(x)?.members.some((m) => B.answers.get(m)?.ok)).length;
    B.pending = {
      reinf: guestPairs.length ? reinforceBonus(rightGuests) : null,
      strike, stealer, support: rightAlong.filter(([p]) => p !== stealer).length, supporters: rightAlong.filter(([p]) => p !== stealer).map(([p]) => p), along: along.length, warcry: Math.min(WARCRY_CAP, B.warcryNow),
      frac: answered.length ? right / answered.length : 0,
      answer: rightAnswers(B.q.full)[0], right: rightAnswers(B.q.full), q: B.q.full.q, choices: B.q.full.choices, explain: explainOf(B.q.full),
      mine: Object.fromEntries([...B.answers.entries()].map(([p, a]) => [p, { chosen: a.shown ?? a.chosen, ok: a.ok }])),   // each in the student's own order
    };
    B.warcryNow = 0;                             // War Cries answered from now on count towards the next question
    B.lastPerms = B.q.perms;                     // so each student's reveal shows the choices in the order they saw them
    B.q = null;
    const actor = strike ? B.striker : stealer;
    if (actor) { B.status = "choose"; B.choose = { pid: actor, half: !strike, endsAt: Date.now() + ms(ACTION_SECONDS), at: Date.now(), untimed: !!B.untimed && untimed(S) && !S.students.get(actor)?.bot }; S.dirty = true; return; }
    applyRound(S, B, null);
  }

  // A Basic battle question is over: every right answer is one hit on the monster (the first one standing takes them, and
  // what it cannot take goes on to the next), then the monster hits back once for every wrong or missing answer.
  // With "HP" on, those blows take the pairs' HP (as the full game's counterattack does).
  function simpleResolve(S, B) {
    for (const p of fightersOf(S, B)) if (!B.answers.has(p)) { const st = S.students.get(p); if (st && isConnected(st)) { record(S, st, B.q.full, -1, "battle", false); B.answers.set(p, { chosen: -1, shown: -1, ok: false, at: Infinity }); } }
    const buffs = buffOn(S), power = buffs.power ? 1.25 : 1;
    const answers = [...B.answers.entries()];
    const rightPids = answers.filter(([, a]) => a.ok).map(([p]) => p), wrong = answers.length - rightPids.length;
    // pairs that came to help: while they answer right, every hit is harder (the reinforcement bonus)
    const helperPairs = (B.helped || []).flatMap((bid) => S.bands.get(bid)?.pairs || []);
    const rightHelpers = helperPairs.filter((x) => S.pairs.get(x)?.members.some((m) => B.answers.get(m)?.ok)).length;
    const rf = helperPairs.length ? reinforceBonus(rightHelpers) : null, boost = 1 + (rf?.atk || 0);
    const each = BASIC_HIT * power * boost;
    const order = B.enemies.map((_, i) => i).filter((i) => B.enemies[i].hp > 0);
    const front = order[0] ?? 0;
    const atkOf = B.enemies[front]?.atk || 1;
    const enemies = B.enemies.map((e) => ({ ...e }));
    let fallen = 0;
    const hitsBy = [];
    B.dealt ||= {};
    for (const pid of rightPids) {
      // a star (all 3 right in the ANSWER step) adds 1 extra hit to this right answer, once
      const stu = S.students.get(pid), star = basicFlow(S) && !!stu?.star;
      if (star) stu.star = false;
      const mine = each + (star ? BASIC_HIT * power : 0);
      let left = mine, dealt = 0;
      for (const i of order) {
        const e = enemies[i]; if (left <= 1e-9) break; if (e.hp <= 0) continue;
        const take = Math.min(e.hp, left); e.hp = Math.max(0, +(e.hp - take).toFixed(2)); left -= take; dealt += take;
        if (e.hp <= 0) fallen++;
      }
      // every right answer counts as a whole hit for its pair, even the one that finishes the monster off
      const st = S.students.get(pid), pp = st?.pairId;
      if (pp) B.dealt[pp] = +((B.dealt[pp] || 0) + mine).toFixed(2);
      hitsBy.push({ ...who(S, pid), dmg: +mine.toFixed(2), ...(star ? { star: true } : {}) });
    }
    B.enemies = enemies;
    const beaten = enemies.every((e) => e.hp <= 0) || (B.kind === "boss" && enemies.some((e) => e.ref === "warlord" && e.hp <= 0));
    // the monster hits back: once for every wrong or missing answer (nothing when it has fallen)
    let counterTotal = 0, taken = {};
    if (!beaten && wrong > 0) {
      counterTotal = basicCounter(atkOf, wrong);
      if (xo(S, "hp")) {
        // with HP on, the blow is the full game's counterattack, shared over the pairs (the more right answers, the less)
        const standing = B.wave.filter((i) => enemies[i].hp > 0).slice(0, 2);
        const c = counterAttack(standing.map((i) => enemies[i]), answers.length ? rightPids.length / answers.length : 0);
        const k = 1 - (rf?.guard || 0);
        counterTotal = +(c.total * k).toFixed(2);
        taken = splitCounter(c.blows.map((x, j) => ({ index: standing[j], dmg: +(x.dmg * k).toFixed(2) })), B.targets, Object.fromEntries(Object.entries(B.php).map(([x, h]) => [x, Math.max(0, h)])));
        for (const [x, d] of Object.entries(taken)) B.php[x] = Math.max(0, +(B.php[x] - d).toFixed(2));
        syncResolve(B);
      }
    }
    if (rf) B.reinf = { ...rf, at: Date.now() };
    const q = B.q.full;
    B.round = {
      simple: true, qNo: B.qNo, striker: null, strike: false, stealer: null, support: rightPids.length, supporters: answers.length,
      rightCount: rightPids.length, wrongCount: wrong, total: answers.length, hitsBy, each: +each.toFixed(2),
      hits: +hitsBy.reduce((a, h) => a + h.dmg, 0).toFixed(1), mainHits: +hitsBy.reduce((a, h) => a + h.dmg, 0).toFixed(1), fallen, target: front, heal: 0, note: "", stunned: false, reinf: rf,
      action: rightPids.length ? { kind: "strike", index: -1, name: "Strike", pid: rightPids[0], char: fighterOf(S, B, rightPids[0]).char, ally: null } : null,
      enemiesAfter: B.enemies.map((e) => ({ hp: +(+e.hp).toFixed(1) })),
      dealt: Object.fromEntries(Object.entries(B.dealt).map(([x, d]) => [S.pairs.get(x)?.no, d])),
      hurt: Object.fromEntries(Object.entries(taken).map(([x, d]) => [S.pairs.get(x)?.no, d])),
      counter: [], guard: 0, counterTotal, counterAtk: atkOf, resolve: B.resolve, sync: 0,
      answer: rightAnswers(q)[0], right: rightAnswers(q), q: q.q, choices: q.choices, explain: explainOf(q),
      mine: Object.fromEntries(answers.map(([p, a]) => [p, { chosen: a.shown ?? a.chosen, ok: a.ok }])), at: Date.now(),
    };
    B.lastPerms = B.q.perms; B.q = null;
    B.status = "result"; B.resultUntil = Date.now() + ms(BASIC_RESULT_SECONDS);
    S.dirty = true;
  }

  // The student whose turn it is picks a move: { kind: strike | skill | ult | item, index, item }
  function chooseAction(S, st, act) {
    const B = [...S.battles.values()].find((x) => x.status === "choose" && x.choose?.pid === st.pid);
    if (!B) return [...S.battles.values()].some((x) => x.simple && fightersOf(S, x).includes(st.pid)) ? "In this war every right answer is a hit. There are no moves to pick." : "It is not your turn to pick a move.";
    const F = fighterOf(S, B, st.pid), base = CHAR(F.char);
    if (act?.kind === "skill") { const sk = base.skills[act.index]; if (!sk) return "Pick one of your skills."; if (F.sp < sk.sp) return "Not enough SP for that skill."; if (F.cd[act.index] > 0) return "That skill is still cooling down."; }
    else if (act?.kind === "ult") { if (B.sync < 100) return "The Sync gauge is not full yet."; }
    else if (act?.kind === "item") { if (!(st.bag?.[act.item] > 0)) return "You do not have that item."; if (ITEM_BY_ID[act.item]?.passive) return "That item works by itself."; }
    else act = { kind: "strike" };
    applyRound(S, B, act);
    return null;
  }

  function nextWave(S, B) {
    const left = (B.order || B.enemies.map((_, i) => i)).filter((i) => B.enemies[i].hp > 0);
    // two monsters come out together when two pairs or more fight (so pairs can choose), else sometimes two
    const two = left.length > 1 && (pairsIn(S, B).length > 1 || Math.random() < PAIR_WAVE);
    B.wave = left.slice(0, two ? 2 : 1);
    B.waveNo = (B.waveNo || 0) + 1;
  }
  const syncResolve = (B) => { B.resolve = +Object.values(B.php || {}).reduce((a, n) => a + Math.max(0, n), 0).toFixed(2); };
  const fieldOf = (B) => (B.wave || []).filter((i) => B.enemies[i]?.hp > 0);
  // Every pair is engaged with a monster on the field at all times. prev: the targets before (a pair whose monster
  // fell, or whose pick is not out, is moved to the monster with the fewest pairs on it and told so).
  function retarget(S, B, prev = B.targets, start = false) {
    const field = fieldOf(B); if (!field.length) return;
    const pairs = pairsIn(S, B);
    B.targets = assignTargets(pairs, field, prev, (i) => B.enemies[i]?.hp > 0);
    const name = (i) => enemyLabel(B.enemies[i]);
    for (const x of pairs) {
      const was = prev[x], now = B.targets[x];
      if (was === now || field.length < 2 && start) continue;
      const text = start ? (was == null ? `You fight ${name(now)}. Tap another monster to change.` : `${name(was)} comes out later. You fight ${name(now)} first.`)
        : B.enemies[was]?.hp <= 0 ? `Your monster is down. You now fight ${name(now)}.` : `You now fight ${name(now)}.`;
      B.moved[x] = { text, at: Date.now(), target: now };
    }
  }
  const enemyLabel = (e) => (e && (UNITS[e.type]?.name || Object.values(CAMPS).find((c) => c.id === e.type)?.name)) || "the monster";
  // share healing out over the pairs, as far as each pair's own HP goes; what one cannot take goes to the others
  function healPairs(S, B, heal) {
    let left = heal;
    for (let k = 0; k < 6 && left > 1e-9; k++) {
      const room = pairsIn(S, B).filter((x) => B.php[x] < (S.pairs.get(x)?.maxHp || RESOLVE_PER_PAIR) - 1e-9);
      if (!room.length) break;
      const each = left / room.length; left = 0;
      for (const x of room) { const max = S.pairs.get(x)?.maxHp || RESOLVE_PER_PAIR, d = Math.min(each, max - B.php[x]); B.php[x] = +(B.php[x] + d).toFixed(2); left += each - d; }
    }
    syncResolve(B);
  }
  function applyRound(S, B, act) {
    const P = B.pending, buffs = buffOn(S), power = buffs.power ? 1.25 : 1, cry = WARCRY_HIT * (buffs.warcry ? 2 : 1);
    const pid = act ? B.choose.pid : null, half = act && B.choose.half ? 0.5 : 1;
    const st = pid ? S.students.get(pid) : null, F = pid ? fighterOf(S, B, pid) : null, base = F ? CHAR(F.char) : null;
    // the move hits the monster the student's pair is engaging (tapping a monster on the stage changes it)
    const inWave = (i) => Number.isInteger(i) && B.wave.includes(i) && B.enemies[i]?.hp > 0;
    const actorPair = pid ? S.students.get(pid)?.pairId : null;
    if (actorPair && inWave(act?.target) && B.targets[actorPair] !== act.target) { B.targets[actorPair] = act.target; delete B.moved?.[actorPair]; }
    const front = () => B.wave.find((i) => B.enemies[i].hp > 0) ?? Math.max(0, B.enemies.findIndex((e) => e.hp > 0));
    const pairPick = actorPair ? B.targets[actorPair] : null;
    const target = inWave(pairPick) ? pairPick : front();
    let main = 0, heal = 0, splash = 0, stun = false, note = "", name = "Strike", index = -1, kind = act?.kind || null, extra = 1;
    if (act?.kind === "strike") main = 2;
    else if (act?.kind === "skill") {
      const sk = base.skills[act.index]; index = act.index; name = sk.name;
      F.sp -= sk.sp; if (sk.cd) F.cd[act.index] = sk.cd + 1;
      if (sk.kind === "atk" || sk.kind === "heavy") main = skillHits(sk);
      else if (sk.kind === "debuff") { main = sk.power ? skillHits(sk) : 0; B.mod.atkDown = 2; note = "The enemy hits back weaker for 2 questions"; }
      else if (sk.kind === "heal") { heal = Math.max(2, Math.round(sk.power / 100)); note = `The warband heals ${showHp(heal)} HP`; }
      else if (sk.kind === "guard") { B.mod.guard = Math.max(B.mod.guard, 0.3); note = "The next counterattack is 30% weaker"; }
      else if (sk.kind === "buff") { B.mod.atkUp = 2; note = "The warband hits 25% harder for 2 questions"; }
      else if (sk.kind === "cleanse") { heal = 2; note = `The warband heals ${showHp(2)} HP`; }
    } else if (act?.kind === "ult") {
      const u = base.ultimate; name = u.name; B.sync = 0;
      if (u.archetype === "damage") { main = 2 * u.power / 250; splash = 1.5; }
      else if (u.archetype === "stun") { main = 4; stun = true; note = "The enemy is stunned and cannot hit back"; }
      else if (u.archetype === "heal") { main = 2; heal = Math.ceil(B.resolveMax * 0.5); note = `The warband heals ${showHp(heal)} HP`; }
      else { main = 2; B.mod.guard = 1; note = "The next counterattack is blocked completely"; }
    } else if (act?.kind === "item") {
      // what each food does in Total War (TW_ITEMS in rules.js has the text students read)
      const it = ITEM_BY_ID[act.item]; name = it?.name || act.item; st.bag[act.item]--;
      // food heals every pair in the warband by what the menu says (the warband shares one HP pool in battle)
      const np = Math.max(1, pairsIn(S, B).length);
      if (act.item === "bento") { heal = TW_ITEMS.bento.heal * np; note = `Every pair heals ${showHp(TW_ITEMS.bento.heal)} HP`; }
      else if (act.item === "energy") { F.sp = Math.min(F.maxSp, F.sp + 150); note = "+150 SP (energy for skills)"; }
      else if (act.item === "revive") { heal = TW_ITEMS.revive.heal * np; note = `Every pair heals ${showHp(TW_ITEMS.revive.heal)} HP`; }
      else if (act.item === "shield") { B.mod.guard = Math.max(B.mod.guard, 0.5); note = "The next counterattack does half damage"; }
      else if (act.item === "crystal") { B.sync = Math.min(100, B.sync + 30); note = "The Sync bar fills by 30"; }
      else if (act.item === "tonic") { heal = TW_ITEMS.tonic.heal * np; B.mod.atkDown = Math.max(B.mod.atkDown, 2); note = `Every pair heals ${showHp(TW_ITEMS.tonic.heal)} HP and the enemy hits back weaker`; }
      else if (act.item === "chilli") { main = 2; extra = 1.5; note = "A fiery strike: 50% more damage"; }
      else if (act.item === "durian") { main = 4; splash = 1; note = "It splashes the enemy beside the target"; }
    }
    // reinforcements: while joined pairs answer right, the warband hits harder and takes less damage
    const rf = P.reinf || { atk: 0, guard: 0, pairs: 0 }, boost = 1 + (rf.atk || 0);
    if (P.reinf) B.reinf = { ...P.reinf, at: Date.now() };
    main = main * half * power * extra * (B.mod.atkUp > 0 ? 1.25 : 1) * boost;
    // right answers along help, up to a cap that grows with the number of pairs in the battle. Each right answer hits
    // the monster that student's pair is engaging.
    const sup = P.supporters || [], w = sup.length ? Math.min(1, alongCap(pairsIn(S, B).length) / sup.length) : 0;
    const along = ALONG_HIT * w * sup.length * power * boost + P.warcry * cry;
    // the move hits its target; an Ultimate's splash hits every other enemy on the field
    let enemies = B.enemies.map((e) => ({ ...e })), fallen = 0;
    const spill = [], dealt = {};
    const credit = (x, d) => { if (x && d > 0) { dealt[x] = (dealt[x] || 0) + d; B.dealt[x] = +((B.dealt[x] || 0) + d).toFixed(2); } };
    const hurt = (i, h, by = null) => { const e = enemies[i]; if (!e || e.hp <= 0 || h <= 0) return h; const take = Math.min(e.hp, h); e.hp = Math.max(0, +(e.hp - take).toFixed(2)); if (e.hp <= 0) fallen++; credit(by, take); return h - take; };
    spill.push([actorPair, hurt(target, main, actorPair)]);
    if (splash) enemies.forEach((e, i) => { if (i !== target && B.wave.includes(i)) hurt(i, splash, actorPair); });
    // answering along: each pair's right answers hit its own monster; what it cannot take goes to the other monster on
    // the field (only the wave in front: the next wave is still on its way)
    const byPair = {};
    for (const x of sup) { const pp = S.students.get(x)?.pairId; if (pp) byPair[pp] = (byPair[pp] || 0) + ALONG_HIT * w * power * boost; }
    for (const [pp, h] of Object.entries(byPair)) {
      let left = hurt(inWave(B.targets[pp]) ? B.targets[pp] : front(), h, pp);
      for (const i of B.wave) if (left > 1e-9) left = hurt(i, left, pp);
      spill.push([pp, left]);
    }
    // War Cries from the rest of the class hit the field front to back
    let cries = P.warcry * cry;
    for (const i of B.wave) if (cries > 1e-9) cries = hurt(i, cries);
    spill.push([null, cries]);
    // at the fortress, damage the defenders in front cannot take carries on to the gate (or the Warlord)
    const bossAt = enemies.findIndex((e) => e.ref === "gate" || e.ref === "warlord");
    if (bossAt >= 0) for (const [x, h] of spill) if (h > 0.01) hurt(bossAt, h, x);
    B.enemies = enemies;
    const waveDown = B.wave.every((i) => B.enemies[i].hp <= 0);
    if (heal > 0) healPairs(S, B, heal);
    const beaten = B.enemies.every((e) => e.hp <= 0);
    // the Crimson hits back (weaker after a debuff, softened by a guard, not at all when stunned)
    let counter = { blows: [], guard: 0, total: 0 }, blocked = 0, taken = {};
    if (!beaten && !stun) {
      const standing = waveDown ? [] : B.wave.filter((i) => B.enemies[i].hp > 0);
      counter = counterAttack(standing.map((i) => B.enemies[i]), P.frac);
      const k = (B.mod.atkDown > 0 ? 0.75 : 1) * (1 - B.mod.guard) * (1 - (rf.guard || 0));
      counter.blows = counter.blows.map((x, j) => ({ ...x, index: standing[j], dmg: +(x.dmg * k).toFixed(2) }));
      counter.total = +(counter.total * k).toFixed(2);
      blocked = Math.round((1 - (1 - counter.guard) * k) * 100);
      // each monster hits back mainly at the pairs engaging it (the rest of its blow lands on the whole warband)
      taken = splitCounter(counter.blows, B.targets, Object.fromEntries(Object.entries(B.php).map(([x, h]) => [x, Math.max(0, h)])));
      for (const [x, d] of Object.entries(taken)) B.php[x] = Math.max(0, +(B.php[x] - d).toFixed(2));
    }
    syncResolve(B);
    B.mod.guard = 0; if (B.mod.atkUp > 0) B.mod.atkUp--; if (B.mod.atkDown > 0) B.mod.atkDown--;
    for (const f of Object.values(B.fighters)) for (const k of Object.keys(f.cd)) if (f.cd[k] > 0) f.cd[k]--;
    // who stands beside the student in the cinematic: their partner if they are fighting too, else another fighter
    const pairMates = pid ? (pairOf(S, pid)?.members || []).filter((m) => m !== pid && B.fighters[m]) : [];
    const allyPid = pairMates[0] || Object.keys(B.fighters).find((x) => x !== pid) || null;
    B.round = {
      qNo: B.qNo, striker: who(S, B.striker), strike: P.strike, stealer: P.stealer ? who(S, P.stealer) : null,
      support: P.support, supporters: P.along, warcry: P.warcry, hits: +(main + along + splash * Math.max(0, B.enemies.length - 1)).toFixed(1), fallen,
      mainHits: +main.toFixed(1), target, heal, note, stunned: stun, reinf: P.reinf || null,
      action: act ? { kind, index, name, pid, char: F.char, ally: allyPid ? B.fighters[allyPid].char : null, archetype: kind === "ult" ? base.ultimate.archetype : null } : null,
      enemiesAfter: B.enemies.map((e) => ({ hp: +(+e.hp).toFixed(1) })),
      // what each pair did and took this question (by pair number): the strip's "+N" pops and HP
      dealt: Object.fromEntries(Object.entries(dealt).map(([x, d]) => [S.pairs.get(x)?.no, +d.toFixed(2)])),
      hurt: Object.fromEntries(Object.entries(taken).map(([x, d]) => [S.pairs.get(x)?.no, d])),
      counter: counter.blows, guard: blocked / 100, counterTotal: counter.total, resolve: B.resolve, sync: B.sync,
      answer: P.answer, right: P.right, q: P.q, choices: P.choices, explain: P.explain, mine: P.mine, at: Date.now(),
    };
    const before = { ...B.targets };
    if (waveDown && !beaten) { nextWave(S, B); B.round.nextWave = B.wave.slice(); }
    if (!beaten) retarget(S, B, before);
    B.pending = null; B.choose = null;
    // the result: short after a move, longer after an Ultimate; with no move it still shows the answer and explanation
    B.status = "result"; B.resultUntil = Date.now() + ms(act ? (kind === "ult" ? 7 : 4.5) : FEEDBACK_SECONDS);
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

  // stopped: the teacher ended the battle early. The damage stays and nobody is beaten: the class steps back a road.
  function finishBattle(S, B, won, stopped = false) {
    B.status = "over"; B.outcome = won ? "won" : stopped ? "stopped" : "lost"; B.resultUntil = Date.now() + ms(4); B.q = null; B.choose = null;
    // the HP the warband has left goes back to its pairs (shared in proportion); a beaten warband limps away with 30% HP
    if (B.php) for (const [id_, hp] of Object.entries(B.php)) { const p = S.pairs.get(id_); if (p) p.hp = Math.min(p.maxHp, Math.max(p.maxHp * 0.3, +(+hp).toFixed(1))); }
    const n = B.node, unBoost = (e) => e.hp / (1 + (e.aura || 0)) / (1 + (e.dug || 0));
    // write damage back to whatever survives
    for (const e of B.enemies) {
      // rounded up, so an enemy left with a sliver of strength is still standing next time
      if (e.ref === "gate") { S.gate.hp = Math.max(0, Math.ceil(unBoost(e) - 1e-9)); if (S.gate.hp <= 0) S.gate.broken = true; }
      else if (e.ref === "warlord") S.warlord.hp = Math.max(0, Math.ceil(unBoost(e) - 1e-9));
      else if (e.ref === "camp") { /* camps heal if not beaten */ }
      else { const u = S.units.get(e.ref); if (u) { u.battle = null; if (e.hp <= 0) S.units.delete(u.id); else u.hp = Math.max(1, Math.round(unBoost(e))); } }
    }
    // pairs that joined from elsewhere (reinforcements) fought from their own stop: they do not move with the warband
    const guestIds = new Set(B.guests || []);
    const all = B.bands.map((x) => S.bands.get(x)).filter(Boolean), bands = all.filter((b) => !guestIds.has(b.id)), guests = all.filter((b) => guestIds.has(b.id));
    for (const b of all) { b.battle = null; b.guestOf = null; }
    // a pair that left its warband to help goes back to it: at once on the same stop, else it sets off to rejoin it
    for (const g of guests) for (const x of [...g.pairs]) {
      const p = S.pairs.get(x), lead = p?.homeLead; if (!p || !lead) continue;
      p.homeLead = null;
      const t = bandOf(S, lead); if (!t || t === g || t.battle) continue;
      if (t.node === g.node && S.bands.has(g.id)) { joinBand(S, x, t.id); continue; }
      p.joinIntent = lead; p.intentTurn = S.turn;
      note(S, x, `The battle is over. Your warband is at ${nodeName(t.node)}: your route goes there when you plan your move, and you join them when you meet.`, { kind: "join" });
    }
    if (xo(S, "join") || !basicFlow(S)) afterBattle(S, B, all.filter((b) => S.bands.has(b.id)), won);
    // Basic: a battle the monster survives (or an attack the pairs could not drive off) sends every pair in it back to the
    // Academy to regroup. The damage they dealt stays.
    if (basicFlow(S) && !won && !stopped) {
      const back = unitsAt(S, HOME).length ? fallbackFor(S, n) : HOME;
      for (const b of all) { if (!S.bands.has(b.id)) continue; b.node = back; b.rest = null; b.path = null; }
      if (B.kind === "camp") S.camps[n].hp = CAMPS[n].hp;
      if (B.kind === "defend" && S.rally.has(n)) S.rally.delete(n);
      // at the fortress: how much the team knocked off the gate (or the Warlord), which stays
      const fort = B.kind === "gate" ? S.gate.hp : B.kind === "boss" ? S.warlord.hp : null;
      const knocked = fort != null && B.gateStart != null ? Math.max(0, B.gateStart - fort) : 0;
      if (B.kind === "gate" || B.kind === "boss") story(S, `${companies(S, all)} knocked ${showHp(knocked)} health off ${B.kind === "gate" ? "the gate" : "the Warlord"}.`, n);
      const where = back === HOME ? "the Academy" : nodeName(back);
      const text = B.kind === "gate" ? `You knocked ${showHp(knocked)} health off the gate. It stays damaged. Bring more pairs!`
        : B.kind === "boss" ? `You knocked ${showHp(knocked)} health off the Warlord. He stays hurt. Bring more pairs!`
        : "The monster was too strong.";
      for (const b of all) for (const x of b.pairs) {
        const p = S.pairs.get(x); if (!p) continue;
        p.revive = true;
        note(S, x, text, { kind: "lost", node: back, back: where, fort: B.kind === "gate" || B.kind === "boss" });
      }
      say(S, `The battle at ${nodeName(n)} is lost. ${all.length > 1 ? "The pairs go" : "The pair goes"} back to ${where}.${knocked ? ` They knocked ${showHp(knocked)} health off ${B.kind === "gate" ? "the gate" : "the Warlord"}.` : ""}`, "crimson");
      S.dirty = true;
      return;
    }
    if (stopped && !won) {
      if (B.kind === "defend") for (const u of B.attackers.map((x) => S.units.get(x)).filter(Boolean)) u.node = u.from ?? u.node;
      else {
        if (B.kind === "camp") S.camps[n].hp = Math.max(1, Math.round(B.enemies[0]?.hp ?? S.camps[n].hp));
        const free = (m) => !unitsAt(S, m).length && !campAt(S, m) && m !== FORTRESS && !battleAt(S, m);
        const back = neighbours(n).find(free) ?? fallbackFor(S, n);
        for (const b of bands) { b.node = back; b.rest = null; }
      }
      say(S, `${S.settings.commander} ended the battle at ${nodeName(n)}. The damage dealt stays.`, "battle");
      S.dirty = true;
      return;
    }
    // a beaten pair is back to full HP at the start of the next turn (it still loses its ground)
    if (!won && (B.kind !== "defend" || B.resolve <= 0)) for (const b of all) for (const x of b.pairs) { const p = S.pairs.get(x); if (p) p.revive = true; }
    if (B.kind === "defend") {
      const attackers = B.attackers.map((x) => S.units.get(x)).filter(Boolean);
      if (won) { S.wins = (S.wins || 0) + 1; say(S, `${companies(S, bands)} drove off the attack at ${nodeName(n)}!${n === HOME ? " The Academy is safe." : ""}`, "crystal"); story(S, `${companies(S, bands)} drove the enemy away from ${n === HOME ? "the Academy" : nodeName(n)}.`, n); }
      else if (B.resolve <= 0 || !bands.length) {
        const back = fallbackFor(S, n);
        for (const b of bands) b.node = back;
        say(S, `The Crimson Host breaks the warbands at ${nodeName(n)}. They fall back to ${nodeName(back)}.`, "crimson");
        if (S.rally.has(n)) { S.rally.delete(n); say(S, `The Crimson Host has taken ${nodeName(n)}.`, "crimson"); }
      } else {
        for (const u of attackers) u.node = u.from ?? u.node;      // the banners held: the attackers pull back
        say(S, `The warbands at ${nodeName(n)} hold. The Crimson Host pulls back.`, "crystal");
      }
      S.dirty = true;
      return;
    }
    if (won) {
      S.wins = (S.wins || 0) + 1;
      if (B.kind === "camp") {
        const c = CAMPS[n]; S.camps[n] = { alive: false, hp: c.hp, returnTurn: S.turn + CAMP_RETURN_TURNS }; S.campsBeaten = (S.campsBeaten || 0) + 1;
        if (!xo(S, "camps")) { story(S, `${companies(S, bands)} beat ${c.name}.`, n); say(S, `${c.name} is beaten! The way is clear.`, "crystal"); }
        else {
        story(S, `${companies(S, bands)} beat ${c.name}: ${c.buffName || c.buffText}.`, n);
        (S.buffBy ||= {})[c.buff] = { by: companies(S, bands), node: n, at: Date.now() };
        if (c.buff === "siege") { S.gate.hp = Math.max(1, S.gate.hp - 15); say(S, `${c.name} is beaten! ${c.buffText}.`, "crystal"); }
        else { S.buffs[c.buff] = S.turn + c.turns - (S.phase === "crimson" ? 1 : 0); say(S, `${c.name} is beaten! ${c.buffName}: ${c.buffText}.`, "crystal"); }
        }
      } else if (B.kind === "gate") {
        S.gate.broken = true; S.gate.hp = 0;
        say(S, `The gate of the Crimson Fortress is broken! The Warlord appears. Assemble for the final assault!`, "big");
        story(S, `${bands.length > 1 ? `${companies(S, bands)} united to break` : `${company(S, bands[0])} broke`} the gate of the Crimson Fortress.`, n);
      } else if (B.kind === "boss") {
        S.warlord.hp = 0; story(S, `${companies(S, bands)} defeated the Crimson Warlord.`, n);
        return endGame(S, "crystal");
      } else { say(S, `${basicFlow(S) ? "The enemy" : "The Crimson Host"} at ${nodeName(n)} is defeated!`, "crystal"); if (B.ambush) story(S, `${company(S, bands[0])} survived an ambush at ${nodeName(n)} and won.`, n); }
      for (const b of bands) { b.lastDefeat = null; b.lastDefeatAt = null; }
      // a march that a fight interrupted can carry on, if the company chooses to (never by itself), while the class is
      // still marching
      for (const b of bands) if (b.rest?.length && ((S.phase === "crystal" && S.stage === "march") || S.phase === "battles")) { const r = [b.node, ...b.rest]; b.rest = routeError(S, b, r) ? null : b.rest; if (b.rest) b.resumeUntil = Date.now() + ms(RESUME_SECONDS); }
      // the fortress itself cannot be stood in: winners at the gate fall back one road to rest
      if (n === FORTRESS) { const back = neighbours(FORTRESS).find((m) => !unitsAt(S, m).length) ?? fallbackFor(S, n); for (const b of bands) b.node = back; }
      else if (xo(S, "camps") && OUTPOSTS.includes(n) && !S.rally.has(n)) { S.rally.add(n); say(S, `The class has taken ${nodeName(n)}. It is now a safe camp.`, "crystal"); }
    } else {
      const back = fallbackFor(S, n);
      for (const b of bands) b.node = back;
      if (B.kind === "camp") S.camps[n].hp = CAMPS[n].hp;
      say(S, `The battle at ${nodeName(n)} is lost. The warband falls back to ${nodeName(back)}.`, "crimson");
      const left = B.enemies.reduce((a, e) => a + Math.max(0, e.hp), 0), full = B.enemies.reduce((a, e) => a + e.max, 0) || 1;
      for (const b of bands) { b.lastDefeat = `The enemy at ${nodeName(n)} is wounded: ${Math.round((left / full) * 100)}% of its strength is left.`; b.lastDefeatAt = { node: n, pct: Math.round((left / full) * 100) }; b.rest = null; }
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
    if (!B && bandsAt(S, to).some((x) => x.battle)) return "The Crystal banner there is fighting a battle. Wait for it to end.";
    if (to !== FORTRESS && unitsAt(S, to).length >= STACK_LIMIT) return `No more than ${STACK_LIMIT} units on one stop.`;
    if (to === FORTRESS && unitsAt(S, to).length >= FORTRESS_LIMIT) return "The fortress is full.";
    if (!auto && u.order?.kind !== "hold") u.order = null;       // a hand move replaces a march or hunt order
    u.ambush = false;                                              // moving gives an ambush away
    u.from = u.node; u.moved += cost(u.node, to); u.node = to; u.dugIn = false;
    if (B) {                                                       // join an attack that is still gathering
      const e = unitEnemy(S, u); B.enemies.push(e); B.attackers.push(u.id); u.battle = B.id;
      for (const x of B.enemies) if (x.aura && !UNITS[x.type]?.aura) { x.hp = x.hp / (1 + x.aura); x.max = x.max / (1 + x.aura); x.aura = 0; }
      applyAura(B.enemies);
      return null;
    }
    if (crystalAt(S, to)) {
      // Basic: the attack is fought in the FIGHT step of this round, so the pair still answers and plans first (it may also
      // move away). The unit stops here.
      if (basicFlow(S)) { u.moved = UNITS[u.type].speed; say(S, `The enemy army attacks the pair at ${nodeName(to)}! They fight it this round.`, "crimson"); S.dirty = true; return null; }
      startBattle(S, null, "defend", [u]); return null;
    }
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
    else if (order?.kind === "ambush") o = { kind: "ambush" };
    else if (order?.kind === "march") { const to = +order.to; if (!Number.isInteger(to) || !NODES[to] || CAMPS[to]) return "Pick a stop on a road to march to."; o = { kind: "march", to }; }
    for (const u of list) {
      if (o?.kind === "ambush" && (u.battle || u.node === FORTRESS || crystalAt(S, u.node))) return "Ambushers hide on an empty road stop, not in the fortress or a battle.";
      u.order = o; u.ambush = o?.kind === "ambush"; if (!o || o.kind !== "hold") u.dugIn = false;
    }
    return null;
  }

  // The teacher's power: a unit vanishes and reappears on any free stop (not on a Crystal banner or a camp)
  function teleport(S, unitId, to) {
    if (S.phase !== "crimson") return "You can teleport in your turn.";
    const u = S.units.get(unitId); if (!u) return "That unit has gone.";
    if (u.battle) return "That unit is in a battle.";
    to = +to; if (!Number.isInteger(to) || !NODES[to] || to === u.node) return "Pick a stop to teleport to.";
    if (CAMPS[to]) return "The jungle camps belong to no one.";
    if (crystalAt(S, to)) return "A Crystal banner is standing there. Teleport next to it, or hide an ambush in its path.";
    if (battleAt(S, to)) return "A battle is being fought there.";
    if (to !== FORTRESS && unitsAt(S, to).length >= STACK_LIMIT) return `No more than ${STACK_LIMIT} units on one stop.`;
    if (to === FORTRESS && unitsAt(S, to).length >= FORTRESS_LIMIT) return "The fortress is full.";
    if (S.energy < TELEPORT_COST) return `Teleporting costs ${TELEPORT_COST} Rift Energy.`;
    S.energy -= TELEPORT_COST;
    u.from = u.node; u.node = to; u.moved = UNITS[u.type].speed; u.dugIn = false;
    if (u.order?.kind === "march" && u.order.to === to) u.order = null;
    if (S.rally.has(to)) { S.rally.delete(to); say(S, `The Crimson Host has retaken ${nodeName(to)}.`, "crimson"); }
    S.dirty = true;
    return null;
  }

  function huntTarget(S, u) {
    const d = hops(u.node); let best = null;
    for (const b of S.bands.values()) if ((d.get(b.node) ?? 99) < (best == null ? 99 : d.get(best))) best = b.node;
    return best;
  }
  function runOrders(S) {
    for (const u of [...S.units.values()]) {
      if (!S.units.has(u.id) || u.battle || !u.order || u.order.kind === "hold" || u.order.kind === "ambush") continue;
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
  // When the class is behind (the gate still stands after half the turns), Auto spends only half the energy.
  function autoTurn(S) {
    if (S.phase !== "crimson") return "Auto only works in your turn.";
    let budget = classBehind(S) ? Math.floor(S.energy / 2) : S.energy;
    while (budget >= 2 && S.energy >= 2 && unitsAt(S, FORTRESS).length < FORTRESS_LIMIT) { if (summon(S, "orc_vanguard")) break; budget -= 2; }
    for (const u of S.units.values()) if (!u.order && !u.tutorial) u.order = { kind: "hunt" };
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


  // ------------------------------------------------------------------ Grab-Ma's delivery
  // Students order on a phone. Grab-Ma cooks at the Academy, then rides out along the roads to their banner, one road
  // every RIDE_STEP seconds (much faster than a warband), following it if it moves. The food lands in the bag when she
  // arrives, even in the middle of a battle.
  // Total War prices (rules.js), falling back to the Arena's
  const priceOf = (id) => TW_ITEMS[id]?.price ?? ITEM_BY_ID[id]?.price ?? 0;
  const cartOf = (items) => Object.entries(items || {}).map(([id, n]) => [id, Math.max(0, Math.floor(+n) || 0)]).filter(([id, n]) => n > 0 && ITEM_BY_ID[id] && !ITEM_BY_ID[id].passive && priceOf(id));
  function order(S, st, items) {
    if (!xo(S, "coins")) return "Grab-Ma is not open in this war.";
    const cart = cartOf(items);
    if (!cart.length) return "Your basket is empty.";
    const p = pairOf(S, st.pid), b = p && bandOf(S, p.id);
    // orders go in from the War Council to the end of the battles (not while your own warband is fighting)
    const open = (S.phase === "crystal" && S.stage !== "quiz") || S.phase === "battles";
    if (!open || b?.battle) return b?.battle && open ? "Grab-Ma takes orders when your warband is not in a battle." : "Grab-Ma takes orders during your move, once the War Council opens.";
    if (st.orderDone || st.orderedTurn === S.turn) return "You have ordered this move. Order again next move.";
    if ([...S.riders.values()].some((r) => r.pid === st.pid && r.status !== "delivered")) return "Grab-Ma is still bringing your last order.";
    st.bag ||= {};
    const have = Object.values(st.bag).reduce((a, n) => a + n, 0), adding = cart.reduce((a, [, n]) => a + n, 0);
    for (const [id, n] of cart) if ((st.bag[id] || 0) + n > SHOP_LIMIT.each) return `You can carry ${SHOP_LIMIT.each} ${ITEM_BY_ID[id].name} at most.`;
    if (have + adding > SHOP_LIMIT.total) return `Your bag holds ${SHOP_LIMIT.total} items. You have ${have}.`;
    const cost = cart.reduce((a, [id, n]) => a + priceOf(id) * n, 0);
    if ((st.coins || 0) < cost) return "Not enough coins yet. Right answers earn coins.";
    st.coins -= cost; st.orderedTurn = S.turn;                    // one order a move
    for (const r of [...S.riders.values()]) if (r.pid === st.pid) S.riders.delete(r.id);   // an old, delivered order is cleared
    const now = Date.now();
    const r = { id: id(S, "g"), pid: st.pid, name: st.name, items: Object.fromEntries(cart), cost, status: "cooking", node: HOME, from: HOME,
      orderedAt: now, departAt: now + ms(COOK_SECONDS), arriveAt: now + ms(COOK_SECONDS) };
    S.riders.set(r.id, r);
    S.dirty = true;
    return null;
  }
  const buy = (S, st, itemId) => order(S, st, { [itemId]: 1 });
  // eating outside a battle heals your pair (HP does not come back on its own)
  function eat(S, st, item) {
    if (!xo(S, "hp") || !xo(S, "coins")) return "There is no food in this war.";
    const p = pairOf(S, st.pid); if (!p) return "Join a pair first.";
    if (bandOf(S, p.id)?.battle) return "In a battle, use food on your turn (ITEMS).";
    const heal = TW_ITEMS[item]?.eat;
    if (!heal) return "That food is for battles. Use it on your turn.";
    if (!(st.bag?.[item] > 0)) return "You do not have that.";
    if (p.hp >= p.maxHp) return "Your pair is already at full HP.";
    st.bag[item]--; p.hp = heal === "full" ? p.maxHp : Math.min(p.maxHp, p.hp + heal); S.dirty = true;
    return null;
  }
  const riderTarget = (S, r) => { const p = pairOf(S, r.pid), b = p && bandOf(S, p.id); return b ? b.node : HOME; };
  function riderTick(S, now) {
    for (const r of [...S.riders.values()]) {
      if (r.status === "delivered") { if (now >= r.deliveredAt + ms(20)) { S.riders.delete(r.id); S.dirty = true; } continue; }
      if (now < r.arriveAt) continue;
      const to = riderTarget(S, r);
      if (r.node === to) {                                           // she has arrived: the food goes into the bag
        const st = S.students.get(r.pid);
        if (st) { st.bag ||= {}; for (const [k, n] of Object.entries(r.items)) st.bag[k] = (st.bag[k] || 0) + n; }
        r.status = "delivered"; r.deliveredAt = now; S.dirty = true; continue;
      }
      const next = stepTowards(r.node, to) ?? to;
      r.status = "riding"; r.from = r.node; r.node = next; r.departAt = now; r.arriveAt = now + ms(RIDE_STEP); S.dirty = true;
    }
  }
  const riderView = (S, r) => {
    const to = riderTarget(S, r), left = r.status === "delivered" ? 0 : Math.max(0, (hops(r.node).get(to) ?? 0));
    return { id: r.id, pid: r.pid, name: r.name, status: r.status, from: r.from, node: r.node, departAt: r.departAt, arriveAt: r.arriveAt,
      stops: left, eta: r.status === "delivered" ? 0 : Math.max(0, r.arriveAt - Date.now()) + left * ms(RIDE_STEP), items: r.items, cost: r.cost, deliveredAt: r.deliveredAt || 0 };
  };


  // ------------------------------------------------------------------ bots: students and a commander
  const BOT_NAMES = ["Aiko", "Bao", "Cass", "Dev", "Ezra", "Faye", "Gus", "Hana", "Iris", "Jojo", "Kit", "Leo", "Max", "Nia", "Oz", "Pip"];
  const rand = (a) => a[Math.floor(Math.random() * a.length)];
  function addBot(S, avoidChar) {
    const used = new Set([...S.students.values()].filter((x) => x.bot).map((x) => x.name));
    const name = "Bot " + (BOT_NAMES.find((n) => !used.has("Bot " + n)) || rand(BOT_NAMES));
    const st = addStudent(S, name, true);
    st.char = rand(CHARACTERS.filter((c) => c.id !== avoidChar)).id; st.ready = true;
    return st;
  }
  function addBotPair(S) { const a = addBot(S), b = addBot(S, a.char); return makePair(S, [a.pid, b.pid]); }
  const botDelay = () => ms(READ_SECONDS + 2 + Math.random() * 7);
  const botPick = (q) => (Math.random() < 0.75 ? rightAnswers(q)[0] : Math.floor(Math.random() * q.choices.length));

  function botTick(S, now) {
    for (const st of S.students.values()) {
      if (!st.bot) continue;
      const o = st.own;                                                       // preparing or a War Cry
      if (o && !o.result) { if (o._bot == null) o._bot = o.startedAt + botDelay(); if (now >= o._bot) answerOwn(S, st, botPick(o.q)); }
      for (const B of S.battles.values()) {
        if (!fightersOf(S, B).includes(st.pid)) continue;
        if (B.status === "fight" && B.q && !B.answers.has(st.pid)) { if (B.q._bot?.[st.pid] == null) (B.q._bot ||= {})[st.pid] = B.q.startedAt + botDelay(); if (now >= B.q._bot[st.pid]) battleAnswer(S, st, B.forceWrong === st.pid && B.striker === st.pid ? (rightAnswers(B.q.full)[0] + 1) % B.q.full.choices.length : botPick(B.q.full)); }
        if (B.status === "choose" && B.choose.pid === st.pid && now >= B.choose.at + ms(2)) {
          const m = movesFor(S, B, st.pid), hit = m.skills.filter((x) => x.ok && (x.kind === "atk" || x.kind === "heavy"));
          const act = m.ult.ready ? { kind: "ult" } : hit.length && Math.random() < 0.6 ? { kind: "skill", index: rand(hit).i } : B.resolve < B.resolveMax * 0.4 && m.items.some((x) => x.id === "bento") ? { kind: "item", item: "bento" } : { kind: "strike" };
          chooseAction(S, st, act);
        }
      }
    }
    // bot pairs pick a monster while a battle gathers: the one the fewest pairs have picked (a pair with a student in
    // it picks for itself, and is auto-assigned if it does not)
    for (const B of S.battles.values()) {
      if (!xo(S, "pick") || B.status !== "gather" || B.enemies.length < 2 || now < B.startedAt + ms(1.5)) continue;
      for (const x of pairsIn(S, B)) {
        const p = S.pairs.get(x); if (!p || B.targets[x] !== undefined || !p.members.every((m) => S.students.get(m)?.bot)) continue;
        const load = (i) => Object.values(B.targets).filter((t) => t === i).length;
        const alive = B.enemies.map((e, i) => (e.hp > 0 ? i : -1)).filter((i) => i >= 0);
        const least = Math.min(...alive.map(load)), opts = alive.filter((i) => load(i) === least);
        if (opts.length) { B.targets[x] = rand(opts); S.dirty = true; }
      }
    }
    // a bot pair whose battle has just ended joins a battle still being fought (the one with the most enemy strength left),
    // as a helpful classmate would; otherwise it carries on
    for (const p of S.pairs.values()) {
      if (!xo(S, "join")) break;
      if (!(p.afterUntil > now) || now < p.afterUntil - ms(REINFORCE_SECONDS) + ms(2) || !p.members.every((m) => S.students.get(m)?.bot)) continue;
      const left = (B) => B.enemies.reduce((n, e) => n + Math.max(0, e.hp), 0);
      const B = liveBattles(S).filter((x) => canReinforce(S, p, x) && x.status !== "gather").sort((a, c) => left(c) - left(a))[0];
      if (B) reinforce(S, p.id, B.id); else p.afterUntil = 0;
    }
    // bot pairs march with the class: they follow a human warband, join it, and copy its vote
    // (in the practice tutorial's first turn they guard the Academy, so the student learns with their own pair)
    const guard = S.practice && S.tutorial && !S.tutorialDone && S.turn === 1;
    for (const b of [...S.bands.values()]) {
      const bots = b.pairs.filter((x) => S.pairs.get(x)?.members.every((m) => S.students.get(m)?.bot));
      if (!bots.length) continue;
      if (guard) {
        if (S.phase === "crystal" && S.stage === "council" && b.pairs.length === bots.length && !b.battle) for (const x of bots) if (b.props?.[x] === undefined) proposeRoute(S, x, "hold");
        // in the tutorial the student fights their first battle with their own pair: the bots next door say NO
        for (const B of S.battles.values()) if (B.status === "gather" && helpOffers(S, B).includes(b) && b.pairs.length === bots.length) answerHelp(S, bots[0], B.id, false);
        continue;
      }
      const joinable = [...S.battles.values()].find((B) => canJoinBattle(S, b, B) && !(B.declined || []).includes(b.id));
      if (joinable && b.pairs.length === bots.length && now >= joinable.startedAt + ms(1.5)) { if (basicFlow(S)) { if (helpOffers(S, joinable).includes(b)) answerHelp(S, bots[0], joinable.id, true); } else joinBattle(S, bots[0], joinable.id); continue; }
      if (S.phase !== "crystal" || S.stage !== "council" || b.battle) continue;
      if (!xo(S, "join") && b.pairs.length === bots.length) {
        // Basic: bot pairs do not form warbands. They go where the nearest human pair goes, so they stand (and fight) with it.
        const humans = [...S.bands.values()].filter((x) => x !== b && x.pairs.some((pid) => S.pairs.get(pid)?.members.some((m) => !S.students.get(m)?.bot)));
        const d = hops(b.node);
        const near = humans.sort((x, y) => (d.get(x.node) ?? 99) - (d.get(y.node) ?? 99))[0];
        const theirs = near && (near.plan === "hold" ? [near.node] : Array.isArray(near.plan) ? near.plan : Object.values(near.props || {}).find(Array.isArray));
        const goal = theirs ? theirs.at(-1) : near ? near.node : FORTRESS;
        if (near && !theirs && near.node === b.node) continue;                 // wait to see where the human pair goes
        const key = `${S.turn}:${b.node}:${b.mp}:${goal}:${theirs ? "p" : "n"}`; if (b._botKey === key) continue; b._botKey = key;
        const route = goal === b.node ? [b.node] : routeTowards(S, b, goal, true);
        for (const x of bots) proposeRoute(S, x, route.length > 1 ? route : "hold");
        continue;
      }
      const humansHere = b.pairs.length > bots.length;
      if (humansHere) {                                                       // agree with the first human proposal
        const hp = b.pairs.find((x) => !bots.includes(x) && b.props[x] !== undefined);
        if (hp) for (const x of bots) if (routeKey(b.props[x] ?? "") !== routeKey(b.props[hp])) proposeRoute(S, x, b.props[hp]);
        continue;
      }
      const key = `${S.turn}:${b.node}:${b.mp}`; if (b._botKey === key) continue; b._botKey = key;
      const humans = [...S.bands.values()].filter((x) => x !== b && x.pairs.some((pid) => S.pairs.get(pid)?.members.some((m) => !S.students.get(m)?.bot)));
      const d = hops(b.node);
      const near = humans.sort((x, y) => (d.get(x.node) ?? 99) - (d.get(y.node) ?? 99))[0];
      if (near && near.node === b.node && !near.battle) { joinBand(S, bots[0], near.id); continue; }
      const route = routeTowards(S, b, near ? near.node : FORTRESS);
      for (const x of bots) proposeRoute(S, x, route.length > 1 ? route : "hold");
    }
    // the Bot Commander takes the Crimson turn
    if (S.settings.botCommander && S.phase === "crimson" && !S.teacherEnded && now >= S.phaseStartedAt + ms(3)) botCommand(S);
  }

  function botCommand(S) {
    const mix = ["orc_vanguard", "rift_hound", "warlock", "gargoyle", "ogre", "wyvern", "goblin_sappers", "orc_warchanter", "imp_swarm", "hollow_knight"];
    let budget = classBehind(S) ? Math.floor(S.energy / 2) : S.energy;      // ease off when the class is behind
    for (let k = 0; k < 6; k++) {
      const can = mix.filter((t) => UNITS[t].cost <= Math.min(S.energy, budget));
      if (!can.length || unitsAt(S, FORTRESS).length >= FORTRESS_LIMIT) break;
      const t = rand(can); if (summon(S, t)) break; budget -= UNITS[t].cost;
    }
    const units = [...S.units.values()].filter((u) => !u.order && !u.battle && !u.tutorial);
    units.forEach((u, i) => { u.order = u.node === FORTRESS && i === 0 && unitsAt(S, FORTRESS).length > 1 ? { kind: "hold" } : i % 3 === 2 ? { kind: "march", to: HOME } : { kind: "hunt" }; });
    S.teacherEnded = true;
  }

  // ------------------------------------------------------------------ views
  const bandView = (S, b) => ({
    id: b.id, node: b.node, mp: b.mp, done: b.done, battle: b.battle, voting: !!b.voteOpenedAt,
    voteEnds: b.voteOpenedAt ? b.voteOpenedAt + ms(VOTE_SECONDS) : 0,
    status: bandStatus(S, b), guestOf: b.guestOf ? (S.battles.get(b.guestOf)?.node ?? null) : null, late: b.lateUntil && Date.now() < b.lateUntil ? b.lateUntil : 0, lastDefeat: b.lastDefeat || null, lastDefeatAt: b.lastDefeatAt || null, rest: b.resumeUntil ? b.rest : null, resumeUntil: b.resumeUntil || 0, plan: b.plan || null, props: b.props || {}, path: b.path || null, interrupted: !!b.interrupted,
    pairs: b.pairs.map((x) => { const p = S.pairs.get(x); return p ? { id: p.id, no: p.no, char: p.char, names: p.members.map((m) => S.students.get(m)?.name || "?"), vote: b.votes[x] ?? null, hp: +(+(p.hp ?? RESOLVE_PER_PAIR)).toFixed(1), maxHp: p.maxHp || RESOLVE_PER_PAIR } : null; }).filter(Boolean),
  });
  const unitView = (u, full) => ({ id: u.id, type: u.type, node: u.node, hp: u.hp, max: u.max, moved: u.moved, speed: UNITS[u.type].speed,
    atk: UNITS[u.type].atk, dugIn: !!u.dugIn, battle: u.battle || null, ...(full ? { order: u.order, ambush: !!u.ambush } : {}) });
  // a reveal (answer, right, choices) in the order one student saw the choices
  function revealFor(r, perm) {
    if (!r || !perm || !Array.isArray(r.choices)) return r;
    return { ...r, choices: perm.map((i) => r.choices[i]), answer: toShown(perm, r.answer), right: (r.right || []).map((c) => toShown(perm, c)) };
  }
  // What each pair in a battle is doing this question: answering | answered | turn (it is their question) | right |
  // wrong | striking | stole (the turn) | struck (its move just landed) | ready (the battle is gathering)
  function pairStats(S, B) {
    const guestPairs = new Set((B.guests || []).flatMap((bid) => S.bands.get(bid)?.pairs || []));
    const r = B.status === "result" || B.status === "over" ? B.round : null;
    const mine = B.status === "choose" ? B.pending?.mine : r?.mine;
    return pairsIn(S, B).map((x) => S.pairs.get(x)).filter(Boolean).map((p) => {
      const ms = p.members, live = ms.filter((m) => isConnected(S.students.get(m)));
      let state = "ready";
      if (B.status === "fight") state = ms.includes(B.striker) ? "turn" : live.length && live.every((m) => B.answers.has(m)) ? "answered" : "answering";
      else if (B.status === "choose") state = ms.includes(B.choose?.pid) ? (B.choose.half ? "stole" : "striking") : ms.some((m) => mine?.[m]?.ok) ? "right" : ms.some((m) => mine?.[m] && mine[m].chosen >= 0) ? "wrong" : "none";
      else if (r && r.qNo === B.qNo) state = r.action && ms.includes(r.action.pid) ? (r.stealer && ms.includes(r.stealer.pid) ? "stole" : "struck") : ms.some((m) => mine?.[m]?.ok) ? "right" : ms.some((m) => mine?.[m] && mine[m].chosen >= 0) ? "wrong" : "none";
      const t = B.targets?.[p.id];
      return { id: p.id, no: p.no, char: p.char, names: ms.map((m) => S.students.get(m)?.name || "?"), bots: ms.every((m) => S.students.get(m)?.bot),
        hp: +(+(B.php?.[p.id] ?? p.hp ?? RESOLVE_PER_PAIR)).toFixed(2), max: p.maxHp || RESOLVE_PER_PAIR,
        target: Number.isInteger(t) ? t : null, targetType: Number.isInteger(t) ? B.enemies[t]?.type || null : null,
        dealt: +(B.dealt?.[p.id] || 0).toFixed(2), state, moved: B.moved?.[p.id] || null, guest: guestPairs.has(p.id) };
    });
  }
  function battleView(S, B, forPid) {
    const fighters = fightersOf(S, B);
    const v = {
      id: B.id, node: B.node, kind: B.kind, status: B.status, qNo: B.qNo, limit: B.limit,
      gatherEnds: B.gatherEnds, resolve: +(+B.resolve).toFixed(1), resolveMax: B.resolveMax,
      enemies: B.enemies.map((e, i) => ({ type: e.type, hp: +(+e.hp).toFixed(1), max: +(+e.max).toFixed(1), atk: e.atk, dug: !!e.dug, aura: !!e.aura,
        wave: (B.wave || []).includes(i), picks: Object.values(B.targets || {}).filter((t) => t === i).length,
        on: Object.entries(B.targets || {}).filter(([, t]) => t === i).map(([x]) => S.pairs.get(x)?.no).filter(Boolean) })),
      ambush: !!B.ambush, waveNo: B.waveNo || 0,
      bands: B.bands.map((x) => S.bands.get(x)).filter(Boolean).map((b) => bandView(S, b)),
      fighters: fighters.length, answered: B.answers.size,
      striker: B.status === "fight" || B.status === "choose" ? who(S, B.striker) : null,
      sync: B.sync, mod: { ...B.mod },
      choose: B.status === "choose" ? { ...who(S, B.choose.pid), endsAt: B.choose.endsAt, untimed: !!B.choose.untimed, half: B.choose.half, right: B.pending?.right || null, striker: who(S, B.striker), explain: B.pending?.explain || "" } : null,
      party: Object.entries(B.fighters).map(([pid, f]) => ({ pid, char: f.char, sp: f.sp, maxSp: f.maxSp, name: S.students.get(pid)?.name || "?", pairNo: pairOf(S, pid)?.no || null })),
      round: B.status === "result" || B.status === "over" ? { ...B.round, mine: undefined } : null,
      untimed: !!B.untimed && untimed(S), tutorial: !!B.tutorial,
      // each pair's HP in this battle: its share of the warband's HP (what it keeps when the battle ends)
      pairHp: Object.fromEntries(pairsIn(S, B).map((x) => S.pairs.get(x)).filter(Boolean).map((p) => {
        const hp = B.php?.[p.id] ?? (p.hp ?? RESOLVE_PER_PAIR);
        return [p.no, { hp: +(+hp).toFixed(2), max: p.maxHp || RESOLVE_PER_PAIR }];
      })),
      // one card per pair for the strip along the bottom of the battle: HP, its monster, what it is doing, its damage
      pairs: pairStats(S, B),
      targetable: B.status === "gather" ? B.enemies.map((e, i) => (e.hp > 0 ? i : -1)).filter((i) => i >= 0) : B.status === "over" ? [] : fieldOf(B),
      outcome: B.outcome, cheers: [...B.cheers.entries()].map(([pid, n]) => ({ pair: S.pairs.get(pid)?.no, n })),
      // a Basic battle: every fighter with a tick or a cross for this question, and each pair's hits so far
      simple: !!B.simple, helped: (B.helped || []).flatMap((bid) => S.bands.get(bid)?.pairs || []).map((x) => S.pairs.get(x)?.no).filter(Boolean),
      faces: B.simple ? fightersOf(S, B).map((pid) => {
        const st = S.students.get(pid), p = st && S.pairs.get(st.pairId), a = B.answers.get(pid), m = B.round?.qNo === B.qNo && B.status !== "fight" ? B.round?.mine?.[pid] : null;
        return { pid, name: st?.name || "?", pairNo: p?.no || null, char: fighterOf(S, B, pid).char, bot: !!st?.bot,
          mark: B.status === "fight" ? (a ? "in" : "wait") : m ? (m.ok ? "right" : "wrong") : null, dealt: +(B.dealt?.[p?.id] || 0).toFixed(2) };
      }) : null,
      // pairs that joined from elsewhere, the bonus they gave on the last question, and when each joined
      reinforce: (B.guests || []).length ? { pairs: (B.guests || []).flatMap((bid) => S.bands.get(bid)?.pairs || []).map((x) => S.pairs.get(x)?.no).filter(Boolean),
        last: B.reinf || null, joins: (B.joins || []).slice(-4) } : null,
    };
    if (forPid !== undefined && fighters.includes(forPid)) {
      v.role = B.striker === forPid ? "striker" : "support";
      if (B.q) {
        const perm = permFor(B, forPid), mine = B.answers.get(forPid);
        v.question = { ...publicQ(B.q.full, B.q.startedAt, perm), untimed: !!B.q.untimed, mine: mine ? { chosen: mine.shown ?? mine.chosen } : null };
        if (process.env.RIFT_TEST_CHEAT === "1") v.question.cheat = toShown(perm, rightAnswers(B.q.full)[0]);     // screenshots and tests only, never set in class
      }
      const perm = B.lastPerms?.[forPid];
      if (v.round) { v.round = revealFor(v.round, perm); if (B.round?.mine) v.round.my = B.round.mine[forPid] || null; }
      if (v.choose?.right && perm) v.choose.right = v.choose.right.map((c) => toShown(perm, c));
      if (B.status === "choose" && B.choose.pid === forPid) v.moves = movesFor(S, B, forPid);
      // how this student's own answer went (once the question is over): right, wrong or no answer, and whether it was their turn
      const mineNow = B.status === "choose" ? B.pending?.mine?.[forPid] : B.status === "result" ? B.round?.mine?.[forPid] : null;
      if (mineNow) v.myAnswer = { ...mineNow, striker: (B.status === "choose" ? B.choose.striker : null) ?? null };
      v.me = { char: fighterOf(S, B, forPid).char, target: B.targets?.[S.students.get(forPid)?.pairId] ?? null };
    }
    return v;
  }
  const towerHeld = (S) => xo(S, "fog") && bandsAt(S, WATCHTOWER).length > 0 && !unitsAt(S, WATCHTOWER).length;
  function classView(S, visible, host = false) {
    const tower = towerHeld(S);
    const sees = (n) => !visible || visible.has(n);
    const shown = (u) => host || ((!u.ambush || u.battle) && (tower || sees(u.node)));
    return {
      code: S.code, status: S.status, winner: S.winner, turn: S.turn, turns: S.settings.turns,
      // the Basic game, which Extras are on, and which step of the round the class is on (answer, move, fight)
      basic: basicFlow(S), fullGame: !!S.settings.full, extras: Object.fromEntries(EXTRA_KEYS.map((k) => [k, xo(S, k)])), step: S.status === "playing" ? roundStep(S.phase, S.stage) : null,
      basicQuestions: BASIC_QUESTIONS,
      // how far the class has got with this step: students done with their 3 questions, pairs that have picked a stop
      progress3: S.status === "playing" && S.phase === "crimson" ? { done: [...S.students.values()].filter((st) => isConnected(st) && (st.musterThisTurn || 0) >= QUIZ_PER_MOVE).length, of: [...S.students.values()].filter(isConnected).length } : null,
      ready: S.status === "playing" && S.phase === "crystal" && S.stage === "council" ? { done: [...S.bands.values()].filter((b) => b.plan || b.battle).length, of: S.bands.size } : null,
      phase: S.phase, stage: S.phase === "crystal" ? S.stage : null, training: untimed(S), tutorial: !!(S.practice && S.tutorial && !S.tutorialDone), practice: !!S.practice, phaseEndsAt: S.phaseEndsAt, orderEnds: S.orderEnds || 0, moveStartedAt: S.moveStartedAt || 0, strategySeconds: STRATEGY_SECONDS,
      quiz: S.phase === "crystal" && S.stage === "quiz" ? { done: [...S.students.values()].filter((st) => isConnected(st) && (prepDone(S, st) || !!bandOf(S, st.pairId)?.battle)).length, of: [...S.students.values()].filter((st) => isConnected(st)).length } : null, topupSeconds: TOPUP_SECONDS, serverNow: Date.now(), speed: SPEED,
      topic: topicLabel(S.settings.topic), commander: S.settings.commander,
      paused: S.paused ? { at: S.paused.at, by: S.settings.commander, restored: !!S.paused.restored } : null, endAt: S.endAt || 0, progress: progressOf(S),
      bands: [...S.bands.values()].map((b) => bandView(S, b)),
      units: [...S.units.values()].filter(shown).map((u) => unitView(u, host)), tower: { node: WATCHTOWER, held: tower },
      ward: { ...S.ward }, endedBy: S.endedBy,
      camps: Object.entries(S.camps).map(([n, c]) => ({ node: +n, alive: c.alive, hp: c.hp, returnTurn: c.returnTurn })),
      gate: { ...S.gate, defenders: unitsAt(S, FORTRESS).length, guards: Math.min(FORTRESS_GUARDS, unitsAt(S, FORTRESS).length) },
      warlord: { hp: S.warlord.hp, max: S.warlord.max, out: S.gate.broken && warlordReady(S), weakened: !!S.warlord.weakened },
      prep: { target: S.settings.target, pct: S.settings.warlordPct, met: prepMet(S), lock: !!S.settings.warlordLock,
        done: [...S.students.values()].filter((st) => st.answered >= S.settings.target).length, of: S.students.size },
      buffs: Object.entries(S.buffs).filter(([, until]) => until >= S.turn).map(([k, until]) => ({ key: k, until, left: until - S.turn + 1, ...(S.buffBy?.[k] || {}) })),
      rally: [...S.rally], visible: visible ? [...visible] : null,
      battles: [...S.battles.values()].filter((B) => sees(B.node)).map((B) => battleView(S, B)),
      log: S.log.slice(-8), story: S.status === "ended" ? (S.story || []) : undefined, summary: S.status === "ended" ? endSummary(S) : undefined, riders: [...S.riders.values()].map((r) => riderView(S, r)),
    };
  }
  // the class's war in a few numbers, for the end screens (top answerers by right answers; bots left out)
  function endSummary(S) {
    const real = [...S.students.values()].filter((st) => !st.bot);
    const tapped = (st) => st.history.filter((h) => h.chosen >= 0).length;
    const answered = real.reduce((a, st) => a + tapped(st), 0), correct = real.reduce((a, st) => a + (st.correct || 0), 0);
    const top = real.filter((st) => st.correct > 0).sort((a, b) => b.correct - a.correct || a.answered - b.answered).slice(0, 5)
      .map((st) => ({ name: st.name, correct: st.correct, answered: tapped(st) }));
    const gateDmg = S.gate.broken ? S.gate.max : S.gate.max - S.gate.hp;
    return { turns: S.turn, answered, correct, pct: answered ? Math.round((correct / answered) * 100) : 0, top,
      camps: S.campsBeaten || 0, rally: S.rally.size, tower: !!S.towerTaken, gate: !!S.gate.broken, warlord: S.warlord.hp <= 0,
      // how far the class got, in plain numbers (HP on the student scale)
      wins: S.wins || 0, fought: S.fought || 0, reached: S.bestNode ?? null, stopsLeft: S.bestHops ?? null, gateFights: S.gateFights || 0,
      gateDmg: showHp(gateDmg), gateMax: showHp(S.gate.max), warlordDmg: showHp(S.warlord.max - S.warlord.hp), warlordMax: showHp(S.warlord.max) };
  }
  // no fog in the Basic game: the class sees every enemy (never an ambusher) unless the teacher turns fog on
  const classVisible = (S) => visibleNodes([...S.bands.values()].map((b) => b.node), { rally: [...S.rally], sightAll: !xo(S, "fog") || !!buffOn(S).sight });
  const lobbyView = (S) => S.status === "lobby" ? {
    students: [...S.students.values()].map((s) => ({ pid: s.pid, name: s.name, pairId: s.pairId, want: s.want, ready: s.ready, connected: isConnected(s), bot: !!s.bot, char: s.char })),
    pairs: [...S.pairs.values()].map((x) => ({ id: x.id, no: x.no, char: x.char, names: x.members.map((m) => S.students.get(m)?.name) })),
  } : null;

  // base: the class view (fog included) worked out once per update and shared by every student; only their own parts are added
  function studentView(S, st, base = classView(S, S.status === "playing" ? classVisible(S) : null), lobby = lobbyView(S)) {
    const v = { ...base };
    const p = pairOf(S, st.pid), b = p && bandOf(S, p.id);
    v.me = { pid: st.pid, name: st.name, pairId: p?.id || null, pairNo: p?.no || null, char: st.char || p?.char || null, bandId: b?.id || null, coins: st.coins || 0, bag: st.bag || {},
      partner: p ? p.members.filter((m) => m !== st.pid).map((m) => S.students.get(m)?.name) : [], bank: p?.bank || 0, prep: st.prep || 0,
      // Basic: the steps each partner has earned this round (you first), and a star waiting for the next fight
      stepsBy: p && basicFlow(S) ? [st.pid, ...p.members.filter((m) => m !== st.pid)].map((m) => { const o = S.students.get(m); return { name: m === st.pid ? "You" : plainStudent(S, m), steps: Math.min(p.members.length > 1 ? BASIC_STEPS_EACH : BASIC_QUESTIONS, o?.prep || 0), me: m === st.pid }; }) : null,
      star: !!st.star };
    v.me.want = st.want; v.me.myChar = st.char; v.me.ready = st.ready; v.me.orderDone = !!st.orderDone; v.me.ordered = st.orderedTurn === S.turn; v.me.quiz = st.musterThisTurn || 0; v.me.quizRight = st.prepRight || 0; v.me.supporting = st.supporting || null;
    v.me.cryUntil = st.cryUntil || 0;
    if (p) { v.me.hp = +(+(p.hp ?? RESOLVE_PER_PAIR)).toFixed(1); v.me.maxHp = p.maxHp || RESOLVE_PER_PAIR; v.me.revive = !!p.revive; v.me.notes = (p.notes || []).slice(-4); }
    v.lobby = lobby;
    if (st.own) v.own = { kind: st.own.kind, battleId: st.own.battleId, retry: st.own.retry, bonus: !!st.own.bonus, result: st.own.result,
      question: publicQ(st.own.q, st.own.startedAt, st.own.perm, { untimed: !!st.own.untimed }) };
    if (v.own && process.env.RIFT_TEST_CHEAT === "1") v.own.question.cheat = toShown(st.own.perm, rightAnswers(st.own.q)[0]);      // tests only
    // the war is over: the student's own questions, right or wrong, to look back on (sent once the war has ended)
    // what the student really answered: their own questions they tapped an answer to, and classmates' battle
    // questions they answered along with (questions that ran out are not counted)
    if (S.status === "ended") {
      const mine = st.history.filter((h) => h.chosen >= 0 && !h.along), along = st.history.filter((h) => h.chosen >= 0 && h.along);
      v.me.review = { asked: mine.length, correct: mine.filter((h) => h.ok).length, along: along.length, alongRight: along.filter((h) => h.ok).length,
        list: st.history.filter((h) => h.chosen >= 0).slice(-60).map((h) => { const q = S.qInfo.get(h.key) || {}; return { text: q.text || "", ok: h.ok, along: !!h.along, key: q.choices?.[q.right] ?? "", chose: q.choices?.[h.chosen] ?? "" }; }) };
    }
    if (b?.battle) { const B = S.battles.get(b.battle); if (B) v.myBattle = battleView(S, B, st.pid); }
    if (p && b) {
      // what each partner has tapped in "Plan your move" (the pair's route is sent once they agree)
      const need = humansOf(S, p);
      v.me.picks = { mine: p.picks?.[st.pid]?.route ?? null, need: need.length,
        partners: p.members.filter((m) => m !== st.pid).map((m) => { const o = S.students.get(m); return { pid: m, name: o?.name || "?", bot: !!o?.bot, away: !!o && !o.bot && !isConnected(o), route: p.picks?.[m]?.route ?? null }; }) };
      // the warbands this pair could join (same stop: now; in reach: set off to join it), and the one it set off to join
      v.regroup = xo(S, "join") ? regroupFor(S, b) : [];
      const t = intentBand(S, p); v.me.joinIntent = t ? { bandId: t.id, node: t.node, no: S.pairs.get(t.pairs[0])?.no } : null;
      if (b.lateUntil && Date.now() < b.lateUntil) v.me.lateUntil = b.lateUntil;
      if (b.guestOf) v.me.guestOf = b.guestOf;
      // just after its battle: the battles still being fought that it can join, for a short while
      if (!b.battle && p.afterUntil > Date.now() && S.status === "playing") {
        v.after = { until: p.afterUntil, won: !!p.afterWon, node: p.afterNode ?? null,
          battles: liveBattles(S).filter((B) => canReinforce(S, p, B) && (!base.visible || base.visible.includes(B.node))).map((B) => ({ id: B.id, node: B.node, kind: B.kind, qNo: B.qNo, limit: B.limit, status: B.status,
            enemies: B.enemies.map((e) => ({ type: e.type, hp: +(+e.hp).toFixed(1), max: +(+e.max).toFixed(1) })),
            pairs: pairsIn(S, B).map((x) => S.pairs.get(x)).filter(Boolean).map((q) => ({ no: q.no, char: q.char })), helpers: (B.guests || []).length })) };
      }
    }
    // battles this warband could still join
    if (b && !b.battle) v.joinable = [...S.battles.values()].filter((B) => canJoinBattle(S, b, B) && (!basicFlow(S) || helpOffers(S, B).includes(b)))
      .map((B) => ({ id: B.id, node: B.node, kind: B.kind, gatherEnds: B.gatherEnds, pairs: pairsIn(S, B).map((x) => S.pairs.get(x)?.no).filter(Boolean),
        enemy: B.enemies.find((e) => e.hp > 0)?.type || B.enemies[0]?.type || null, enemies: B.enemies.length }));
    return v;
  }

  function hostView(S) {
    const v = classView(S, null, true);
    v.settings = S.settings; v.energy = S.energy; v.teacherEnded = S.teacherEnded;
    v.warlordReady = warlordReady(S);
    const now = Date.now();
    v.students = [...S.students.values()].map((s) => ({
      pid: s.pid, name: s.name, pairNo: pairOf(S, s.pid)?.no || null, answered: s.answered, correct: s.correct, ready: s.ready, bot: !!s.bot, char: s.char,
      // quiet: a student who has let at least two questions run out in a row, and has not answered for a minute this phase
      connected: isConnected(s), quiet: S.status === "playing" && !S.paused && !s.bot && isConnected(s) && (s.timeouts || 0) >= 2 && now - Math.max(s.lastRealAt || 0, S.phaseStartedAt) > ms(60),
    }));
    v.pairs = [...S.pairs.values()].map((x) => ({ id: x.id, no: x.no, char: x.char, names: x.members.map((m) => S.students.get(m)?.name), bots: x.members.filter((m) => S.students.get(m)?.bot).length, size: x.members.length }));
    v.onTarget = v.students.filter((s) => s.answered >= S.settings.target).length;
    v.poolSize = poolOf(S).length; v.poolLow = v.poolSize < 80;
    // pairs (with a student in them) whose banner has not moved for 3 turns or more
    v.stuck = S.status === "playing" ? [...S.pairs.values()].filter((p) => p.members.some((m) => !S.students.get(m)?.bot) && S.turn - (p.lastMovedTurn ?? S.turn) >= 3)
      .map((p) => ({ no: p.no, node: bandOf(S, p.id)?.node ?? null, turns: S.turn - p.lastMovedTurn })) : [];
    if (S.status === "ended") v.report = S.report || (S.report = buildReport(S));
    return v;
  }

  // ------------------------------------------------------------------ the end-of-war learning report
  function buildReport(S) {
    const qs = new Map(), los = new Map(), students = [];
    for (const st of S.students.values()) {
      if (st.bot) continue;
      let right = 0;
      for (const h of st.history) {
        if (h.ok) right++;
        const info = S.qInfo.get(h.key) || {};
        const q = qs.get(h.key) || { key: h.key, text: info.text || h.key, lo: h.lo || info.lo || "", answer: info.choices?.[info.right] ?? "", asked: 0, right: 0, wrong: {} };
        q.asked++; if (h.ok) q.right++; else if (h.chosen >= 0) { const t = info.choices?.[h.chosen] ?? String(h.chosen); q.wrong[t] = (q.wrong[t] || 0) + 1; }
        qs.set(h.key, q);
        const lo = los.get(q.lo) || { lo: q.lo || "Other", asked: 0, right: 0 }; lo.asked++; if (h.ok) lo.right++; los.set(q.lo, lo);
      }
      students.push({ name: st.name, pair: pairOf(S, st.pid)?.no || null, answered: st.history.length, right, pct: st.history.length ? Math.round((right / st.history.length) * 100) : 0 });
    }
    const pct = (x) => (x.asked ? Math.round((x.right / x.asked) * 100) : 0);
    const questions = [...qs.values()].map((q) => ({ ...q, pct: pct(q), commonWrong: Object.entries(q.wrong).sort((a, b) => b[1] - a[1])[0]?.[0] || "" })).map(({ wrong, ...q }) => q);
    const objectives = [...los.values()].map((x) => ({ ...x, pct: pct(x) })).sort((a, b) => a.pct - b.pct);
    const missed = questions.filter((q) => q.asked - q.right > 0).sort((a, b) => (b.asked - b.right) - (a.asked - a.right) || a.pct - b.pct).slice(0, 10);
    students.sort((a, b) => a.pct - b.pct || a.name.localeCompare(b.name));
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      ["Student", "Pair", "Answered", "Right", "% right"].map(cell).join(","),
      ...students.map((s) => [s.name, s.pair || "", s.answered, s.right, s.pct].map(cell).join(",")), "",
      ["Learning objective", "Answers", "Right", "% right"].map(cell).join(","),
      ...objectives.map((o) => [o.lo, o.asked, o.right, o.pct].map(cell).join(",")), "",
      ["Question", "Learning objective", "Answers", "Right", "% right", "Correct answer", "Most common wrong answer"].map(cell).join(","),
      ...[...questions].sort((a, b) => a.pct - b.pct).map((q) => [q.text, q.lo, q.asked, q.right, q.pct, q.answer, q.commonWrong].map(cell).join(",")),
    ].join("\n");
    return { code: S.code, endedAt: Date.now(), turn: S.turn, winner: S.winner, endedBy: S.endedBy, topic: topicLabel(S.settings.topic), students, objectives, missed, questions: questions.length, csv };
  }

  // ------------------------------------------------------------------ sending
  // Everything a student sees that is the same for the whole class is worked out once per update.
  function flush(S) {
    if (S._flushT) { clearTimeout(S._flushT); S._flushT = null; }
    if (!S.dirty) return;
    S.dirty = false; S.lastActive = Date.now();
    io.to(`tw:${S.code}:host`).emit("twHost", hostView(S));
    // the list of question sets goes to the teacher only when it changes (the bank hands back the same list until then)
    const sets = bank ? bank.playableSets() : [];
    if (S._sets !== sets) { S._sets = sets; io.to(`tw:${S.code}:host`).emit("twSets", sets); }
    const base = classView(S, S.status === "playing" ? classVisible(S) : null), lobby = lobbyView(S);
    io.to(`tw:${S.code}:watch`).emit("twPublic", base);
    for (const st of S.students.values()) if (st.sockets.size) { const v = studentView(S, st, base, lobby); for (const sid of st.sockets) io.to(sid).emit("twState", v); }
  }
  // actions only mark the war as changed; one update goes out ~80 ms later (or on the next tick), however many came in
  const touch = (S) => { S.dirty = true; if (!S._flushT) S._flushT = setTimeout(() => { S._flushT = null; try { flush(S); } catch (e) { console.error("[total-war] flush", e); } }, 80); };

  // ------------------------------------------------------------------ pause, teacher's endings, saving and restoring
  // every clock moves on by the time the war stood still, so nobody loses time to a pause
  function shiftTimes(S, d) {
    const sh = (o, ...keys) => { if (o) for (const k of keys) if (o[k]) o[k] += d; };
    sh(S, "phaseEndsAt", "phaseStartedAt", "moveStartedAt", "orderEnds", "startedAt", "battlesUntil", "lastPairAt", "softEndsAt");
    for (const st of S.students.values()) { sh(st, "cryUntil", "lastRealAt", "lastAnswerAt"); if (st.own) { sh(st.own, "startedAt", "_bot", "seenAt"); sh(st.own.result, "at"); } }
    for (const b of S.bands.values()) sh(b, "nextAt", "voteOpenedAt", "resumeUntil");
    for (const B of S.battles.values()) {
      sh(B, "startedAt", "gatherEnds", "resultUntil"); sh(B.choose, "endsAt", "at");
      if (B.q) { sh(B.q, "startedAt"); for (const k of Object.keys(B.q._bot || {})) B.q._bot[k] += d; for (const k of Object.keys(B.q.seen || {})) B.q.seen[k] += d; }
      for (const k of Object.keys(B.offers || {})) B.offers[k] += d;
    }
    for (const r of S.riders.values()) sh(r, "departAt", "arriveAt", "orderedAt", "deliveredAt");
    setEndAt(S);
  }
  function pause(S, on) {
    if (S.status !== "playing") return "The war is not on.";
    if (on && !S.paused) { S.paused = { at: Date.now() }; say(S, `${S.settings.commander} paused the war.`, "big"); }
    else if (!on && S.paused) { shiftTimes(S, Date.now() - S.paused.at); S.paused = null; say(S, "The war goes on!", "big"); }
    S.dirty = true; return null;
  }
  function endBattleNow(S, battleId) {
    const B = S.battles.get(battleId) || [...S.battles.values()].find((x) => x.status !== "over");
    if (!B || B.status === "over") return "There is no battle to end.";
    if (B.status === "choose" && B.pending) applyRound(S, B, { kind: "strike" });     // a move already earned is still made
    finishBattle(S, B, B.enemies.every((e) => e.hp <= 0), true);
    return null;
  }

  // A snapshot of a running war, written at every turn boundary (and when it ends). After a restart the war comes back
  // at the start of that turn, paused, with the same code: the teacher's page reconnects by itself and students rejoin
  // with the code and their name (or by themselves, from their iPad's saved place).
  function snapshot(S) {
    const now = Date.now();
    return JSON.stringify({
      v: 1, savedAt: now, code: S.code, hostToken: S.hostToken, createdAt: S.createdAt, status: S.status, winner: S.winner, endedBy: S.endedBy,
      settings: S.settings, turn: S.turn, energy: S.energy, seq: S.seq, log: S.log, story: S.story || [], buffs: S.buffs, buffBy: S.buffBy || {},
      rally: [...S.rally], camps: S.camps, gate: S.gate, warlord: S.warlord, ward: S.ward, towerTaken: !!S.towerTaken, campsBeaten: S.campsBeaten || 0, practice: !!S.practice, wins: S.wins || 0, fought: S.fought || 0, bestNode: S.bestNode ?? null, bestHops: S.bestHops ?? null, gateFights: S.gateFights || 0,
      elapsed: S.startedAt ? (S.paused ? S.paused.at : now) - S.startedAt : 0, report: S.report, qInfo: [...S.qInfo],
      students: [...S.students.values()].map((st) => ({ ...st, sockets: undefined, own: null, seen: [...st.seen], right: [...(st.right || [])], wrongKeys: [...(st.wrongKeys || [])], seenAt: [...(st.seenAt || [])], supporting: null })),
      pairs: [...S.pairs.values()], units: [...S.units.values()].map((u) => ({ ...u, battle: null })),
      bands: [...S.bands.values()].map((b) => ({ id: b.id, pairs: b.pairs, node: b.node, mp: b.mp })),
      // food still on its way is put straight into the bag
      riders: [...S.riders.values()].filter((r) => r.status !== "delivered").map((r) => ({ pid: r.pid, items: r.items })),
    });
  }
  const saving = new Map();
  function saveWar(S) {
    if (!bank?.docs || S.practice || S.status === "lobby") return;
    const text = snapshot(S);
    // one write at a time per war; a newer snapshot waiting replaces an older one
    const job = (saving.get(S.code) || Promise.resolve()).then(() => bank.docs.save(`${SAVE_DIR}/${S.code}.json`, text)).catch((e) => console.warn(`[total-war] could not save ${S.code}: ${e.message}`));
    saving.set(S.code, job);
  }
  function restoreOne(d) {
    if (sessions.has(d.code)) return null;
    const S = createSessionFor(d.code);
    Object.assign(S, {
      hostToken: d.hostToken, createdAt: d.createdAt, status: d.status, winner: d.winner, endedBy: d.endedBy, settings: { ...defaultSettings(), ...d.settings },
      turn: d.turn, energy: d.energy, seq: d.seq, log: d.log || [], story: d.story || [], buffs: d.buffs || {}, buffBy: d.buffBy || {},
      rally: new Set(d.rally || []), camps: d.camps, gate: d.gate, warlord: d.warlord, ward: d.ward, towerTaken: d.towerTaken, campsBeaten: d.campsBeaten || 0, report: d.report || null, wins: d.wins || 0, fought: d.fought || 0, bestNode: d.bestNode ?? null, bestHops: d.bestHops ?? null, gateFights: d.gateFights || 0,
      qInfo: new Map(d.qInfo || []), startedAt: Date.now() - (d.elapsed || 0),
    });
    for (const x of d.students) S.students.set(x.pid, { ...x, sockets: new Set(), seen: new Set(x.seen || []), right: new Set(Array.isArray(x.right) ? x.right : []), wrongKeys: new Set(Array.isArray(x.wrongKeys) ? x.wrongKeys : []), seenAt: new Map(Array.isArray(x.seenAt) ? x.seenAt : []), own: null, bag: x.bag || {} });
    for (const p of d.pairs) S.pairs.set(p.id, p);
    for (const u of d.units) S.units.set(u.id, { ...u, battle: null });
    for (const b of d.bands) S.bands.set(b.id, { ...b, done: true, votes: {}, props: {}, plan: null, voteOpenedAt: 0, battle: null, path: null, rest: null, resumeUntil: 0 });
    for (const r of d.riders || []) { const st = S.students.get(r.pid); if (st) for (const [k, n] of Object.entries(r.items || {})) st.bag[k] = (st.bag[k] || 0) + n; }
    if (S.status === "playing") {
      setEndAt(S);
      startCrimson(S);                                    // the turn starts again from its beginning
      if (S.status === "playing") { S.paused = { at: Date.now(), restored: true }; say(S, `The server restarted. The war is back at turn ${S.turn}. ${S.settings.commander} resumes it when the class is back.`, "big"); startClock(S); }
    }
    return S;
  }
  // wars saved by the server before it restarted, restored once the question bank is ready
  const restored = (async () => {
    if (!bank?.docs) return;
    try {
      await bank.ready;
      for (const path of await bank.docs.list(SAVE_DIR)) {
        try {
          const text = await bank.docs.read(path); if (!text) continue;
          const d = JSON.parse(text);
          if (!d?.code || Date.now() - d.savedAt > SAVE_HOURS * 3600e3) { await bank.docs.remove(path); continue; }
          const S = restoreOne(d);
          if (S) console.log(`[total-war] restored war ${S.code} (${S.status}, turn ${S.turn})`);
        } catch (e) { console.warn(`[total-war] could not restore ${path}: ${e.message}`); }
      }
    } catch (e) { console.warn(`[total-war] restoring wars: ${e.message}`); }
  })();

  // ------------------------------------------------------------------ sockets
  function bind(socket) {
    const fail = (m) => socket.emit("twError", m);
    const hostS = () => { const S = sessions.get(socket.data.twHost); return S; };
    // one bad message must never take the whole server (and every class on it) down
    const safe = (fn) => { try { return fn(); } catch (e) { console.error("Total War handler error:", e); return "Something went wrong. Try again."; } };
    // an error goes back to whoever sent it, and does not send the whole class an update
    const asHost = (fn) => (arg = {}) => { const S = hostS(); if (!S) return fail("This war is not running any more."); const err = safe(() => fn(S, arg || {})); if (err) fail(err); else touch(S); };
    // while the war is paused only the teacher's pause, end and settings buttons work
    const asHostLive = (fn) => asHost((S, arg) => (S.paused ? "The war is paused. Resume it first." : fn(S, arg)));
    const me = () => { const S = sessions.get(socket.data.twCode); const st = S?.students.get(socket.data.twPid); return S && st ? { S, st } : null; };
    const asStudent = (fn) => (arg = {}) => { const m = me(); if (!m) return fail("Join the war again with its code."); const err = safe(() => (m.S.paused && m.S.status === "playing" ? `Paused by ${m.S.settings.commander}.` : fn(m.S, m.st, arg || {}))); if (err) fail(err); else touch(m.S); };
    const sendSets = () => socket.emit("twSets", bank ? bank.playableSets() : []);

    // teacher
    socket.on("twCreate", () => {
      const S = createSession();
      socket.data.twHost = S.code; socket.join(`tw:${S.code}:host`);
      socket.emit("twHosting", { code: S.code, hostToken: S.hostToken }); sendSets(); S._sets = null;
      touch(S);
    });
    socket.on("twResume", ({ code, hostToken } = {}) => restored.then(() => {
      const S = sessions.get(String(code || "").toUpperCase());
      if (!S || S.hostToken !== hostToken) return socket.emit("twGone");
      socket.data.twHost = S.code; socket.join(`tw:${S.code}:host`);
      socket.emit("twHosting", { code: S.code, hostToken: S.hostToken }); sendSets();
      touch(S);
    }));
    // In the lobby everything can be set. Once the war is on: the turns (not below the current one), the timers, the
    // "end by" minutes, the Warlord lock and the teacher's name.
    const MID_WAR = new Set(["turns", "crimsonSeconds", "crystalSeconds", "councilSeconds", "endMinutes", "warlordLock", "commander", "target", "extras", "full"]);
    socket.on("twSettings", asHost((S, s) => {
      if (S.status === "ended") return "The war is over.";
      const keys = Object.keys(s);
      if (S.status !== "lobby" && keys.some((k) => !MID_WAR.has(k))) return "That setting is fixed once the war starts.";
      if ("topic" in s) S.settings.topic = normalizeTopics(s.topic);
      if ("commander" in s) S.settings.commander = String(s.commander || "").trim().slice(0, 30) || "Your teacher";
      for (const k of ["botCommander", "botPartners", "warlordLock", "trainingTurn"]) if (k in s) S.settings[k] = !!s[k];
      // Extras: one system at a time, or "Full game" for all of them (and the full game's rounds). Each Extra is checked
      // where it is used, so switching one mid-war takes effect from the next question or battle.
      if ("full" in s) { S.settings.full = !!s.full; S.settings.extras = Object.fromEntries(EXTRA_KEYS.map((k) => [k, !!s.full])); }
      if (s.extras && typeof s.extras === "object") { S.settings.extras = { ...noExtras(), ...S.settings.extras }; for (const k of EXTRA_KEYS) if (k in s.extras) S.settings.extras[k] = !!s.extras[k]; if (!EXTRA_KEYS.every((k) => S.settings.extras[k])) S.settings.full = false; }
      for (const k of ["turns", "crimsonSeconds", "crystalSeconds", "target", "warlordPct", "councilSeconds", "endMinutes"]) if (k in s) {
        const lim = { turns: [Math.max(4, S.turn), 30], crimsonSeconds: [20, 120], crystalSeconds: [60, 300], target: [5, 60], warlordPct: [0, 100], councilSeconds: [15, 180], endMinutes: [0, 120] }[k];
        const n = Math.round(+s[k]); if (Number.isFinite(n)) S.settings[k] = Math.max(lim[0], Math.min(lim[1], n));
      }
      if ("endMinutes" in s) setEndAt(S);
      if ("topic" in s) S.pool = null;
    }));
    socket.on("twStart", asHost((S) => startGame(S)));
    socket.on("twPause", asHost((S, { paused = true }) => pause(S, !!paused)));
    socket.on("twEndBattle", asHost((S, { battleId }) => (S.status !== "playing" ? "The war is not on." : endBattleNow(S, battleId))));
    socket.on("twSummon", asHostLive((S, { type }) => { const err = summon(S, type); if (!err) socket.emit("twSummoned", { unitId: `u${S.seq}`, type }); return err; }));
    socket.on("twAddBots", asHost((S, { pairs = 1 }) => { if (S.status !== "lobby") return "Add bots before the war starts."; for (let i = 0; i < Math.min(6, +pairs || 1); i++) addBotPair(S); }));
    socket.on("twRemoveBots", asHost((S) => { if (S.status !== "lobby") return; for (const p of [...S.pairs.values()]) if (p.members.every((m) => S.students.get(m)?.bot)) { for (const m of p.members) S.students.delete(m); S.pairs.delete(p.id); } }));
    socket.on("twMoveUnit", asHostLive((S, { unitId, to }) => moveUnit(S, unitId, +to)));
    socket.on("twOrder", asHost((S, { unitIds, order }) => setOrder(S, unitIds, order)));
    socket.on("twCouncil", asHostLive((S, { extend, launch }) => {
      if (S.phase !== "crystal" || S.stage !== "council") return "The War Council is not on.";
      if (launch) S.launch = true; else if (extend) S.phaseEndsAt += ms(Math.min(60, +extend || 15));
    }));
    socket.on("twTeleport", asHostLive((S, { unitId, to }) => teleport(S, unitId, to)));
    // tests and screenshots only (never set in class): put Crimson units straight onto a stop
    if (process.env.RIFT_TEST_CHEAT === "1") socket.on("twTestSpawn", asHost((S, { types = [], node }) => {
      for (const type of types) { const u = UNITS[type]; if (!u || u.fixed) continue; S.units.set(id(S, "u"), { id: `u${S.seq}`, type, node: +node, hp: u.hp, max: u.hp, moved: 0, order: null, dugIn: false, battle: null, from: null }); }
    }));
    // tests and screenshots only: put a pair's banner straight onto a stop
    if (process.env.RIFT_TEST_CHEAT === "1") socket.on("twTestPlace", asHost((S, { pairNo, node }) => {
      const p = [...S.pairs.values()].find((x) => x.no === +pairNo), b = p && bandOf(S, p.id); if (!b || b.battle || !NODES[+node]) return "No such pair.";
      b.node = +node; b.path = null; S.dirty = true;
    }));
    // the training turn: Continue moves the class on to the next stage (nothing there is timed)
    socket.on("twContinue", asHostLive((S) => { if (!untimed(S)) return "Continue is for the training turn."; S.advance = true; }));
    socket.on("twEndTraining", asHostLive((S) => { if (!untimed(S)) return "The training turn is over."; endTraining(S); }));
    socket.on("twEndTurn", asHostLive((S) => { if (S.phase !== "crimson") return "It is not your turn."; S.teacherEnded = true; }));
    socket.on("twAuto", asHostLive((S) => autoTurn(S)));
    socket.on("twRelease", asHost((S) => { S.warlord.released = true; say(S, "The Crimson Warlord steps out to fight.", "big"); }));
    // result: "progress" (judged on how far the class got, the default), "crystal" (the class wins) or "crimson"
    socket.on("twEndGame", asHost((S, { result = "progress" }) => {
      if (S.status !== "playing") return "The war is not on.";
      if (result === "crystal") endGame(S, "crystal", "teacher"); else if (result === "crimson") endGame(S, "crimson", "progress"); else endByProgress(S, "progress");
    }));
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
    // a practice war: one student against the Bot Commander, with bot allies
    socket.on("twPractice", ({ name, char, tutorial, full, extras } = {}) => {
      const S = createSession();
      Object.assign(S.settings, { botCommander: true, botPartners: true, commander: "The Bot Commander", turns: 8, target: 12 });
      if (full) { S.settings.full = true; S.settings.extras = Object.fromEntries(EXTRA_KEYS.map((k) => [k, true])); }
      else if (extras && typeof extras === "object") for (const k of EXTRA_KEYS) S.settings.extras[k] = !!extras[k];
      S.practice = true; S.tutorial = !!tutorial;
      const st = addStudent(S, name || "You"); if (CHAR_IDS.has(char)) st.char = char;
      st.ready = true; addBotPair(S); addBotPair(S);
      startGame(S);
      enter(S, st);
    });
    socket.on("twJoin", ({ code, name } = {}) => restored.then(() => {
      const S = sessions.get(String(code || "").trim().toUpperCase());
      if (!S) return fail("No war with that code. Check the code on the board.");
      if (S.status === "ended") return fail("That war has ended.");
      // the same name again (an iPad that lost its place, or a restored war): back into the same student and pair
      const clean = String(name || "").trim().slice(0, 20).toLowerCase();
      const back = clean && [...S.students.values()].find((s) => !s.bot && !s.sockets.size && s.name.toLowerCase() === clean);
      if (back) return enter(S, back);
      const st = addStudent(S, name);
      if (S.status === "playing") makePair(S, [st.pid]);          // a latecomer marches alone from the Academy
      enter(S, st);
    }));
    socket.on("twRejoin", ({ code, token: tok } = {}) => restored.then(() => {
      const S = sessions.get(String(code || "").toUpperCase());
      const st = S && [...S.students.values()].find((s) => s.token === tok);
      if (!st) return socket.emit("twGone");
      enter(S, st);
    }));
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
      // c is the button the student pressed in their own order of the choices
      if (st.own && st.own.startedAt === startedAt) return answerOwn(S, st, toCanon(st.own.perm, c));
      const B = [...S.battles.values()].find((x) => x.status === "fight" && x.q && fightersOf(S, x).includes(st.pid));
      const r = B && battleAnswer(S, st, toCanon(B.q.perms[st.pid], c), c);
      if (r) socket.emit("twBattleAnswered", r);              // the student whose turn it is learns straight away, as in the Arena
    }));
    socket.on("twSeen", asStudent((S, st, { startedAt }) => { seenChoices(S, st, +startedAt); }));
    socket.on("twAction", asStudent((S, st, act) => chooseAction(S, st, act)));
    socket.on("twBuy", asStudent((S, st, { item }) => buy(S, st, item)));
    socket.on("twTarget", asStudent((S, st, { index }) => {
      if (!xo(S, "pick")) return "In this war every pair hits the same monster.";
      const B = [...S.battles.values()].find((x) => x.status !== "over" && fightersOf(S, x).includes(st.pid));
      if (!B) return "You are not in a battle.";
      const i = Math.round(+index); if (!B.enemies[i] || B.enemies[i].hp <= 0) return "Pick a monster that is still standing.";
      // once the fight is on, a pair can switch to any monster on the field (the next wave is not out yet)
      if (B.status !== "gather" && !fieldOf(B).includes(i)) return "That monster has not come out yet.";
      B.targets[st.pairId] = i; if (B.moved) delete B.moved[st.pairId]; S.dirty = true;
    }));
    socket.on("twEat", asStudent((S, st, { item }) => eat(S, st, item)));
    socket.on("twGrab", asStudent((S, st, { items }) => order(S, st, items)));
    socket.on("twOrderDone", asStudent((S, st) => { st.orderDone = true; }));
    socket.on("twVote", asStudent((S, st, { to }) => { const p = pairOf(S, st.pid); if (!p) return "Join a pair first."; const b = bandOf(S, p.id); return pickRoute(S, st, to === "stay" ? "hold" : [b?.node, +to]); }));
    socket.on("twDraft", asStudent((S, st, { route }) => draftRoute(S, st, route)));
    // the practice tutorial: done, or skipped (every clock starts again)
    socket.on("twTutorial", asStudent((S, st, { done } = {}) => { if (!S.practice) return; if (done) { S.tutorialDone = true; endTraining(S); S.dirty = true; } }));
    // a partner taps a route: the pair's route is sent (or suggested to its warband) once both partners have tapped it
    socket.on("twRoute", asStudent((S, st, { route, hold }) => pickRoute(S, st, hold ? "hold" : (Array.isArray(route) ? route : null))));
    socket.on("twAgree", asStudent((S, st, { pairId, partner }) => {
      const p = pairOf(S, st.pid); if (!p) return "Join a pair first.";
      // agreeing with your partner's route, or with another pair's route in your warband
      const r = partner ? p.picks?.[partner]?.route : bandOf(S, p.id)?.props?.[pairId];
      if (r === undefined || r === null) return "That route is no longer on the table.";
      return pickRoute(S, st, r);
    }));
    // (the teacher's page sends twResume with its host token to reconnect: that one is not a student's CARRY ON)
    const resumeRouteFor = asStudent((S, st, { go }) => { const p = pairOf(S, st.pid); if (!p) return; return resumeRoute(S, p.id, !!go); });
    socket.on("twResume", (arg = {}) => { if (arg?.hostToken) return; resumeRouteFor(arg); });
    socket.on("twSupport", asStudent((S, st, { battleId }) => { const B = S.battles.get(battleId); if (!B || B.status === "over") return "That battle is over."; if (bandOf(S, st.pairId)?.battle) return "You are in a battle yourself."; st.supporting = battleId; S.dirty = true; }));
    socket.on("twEndMove", asStudent((S, st) => { const p = pairOf(S, st.pid); if (!p) return; return pickRoute(S, st, "hold"); }));
    socket.on("twJoinBand", asStudent((S, st, { bandId }) => { if (!xo(S, "join")) return "Pairs on the same stop are already a team."; const p = pairOf(S, st.pid); if (!p) return "Join a pair first."; return wantBand(S, p.id, bandId || null); }));
    socket.on("twLeaveBand", asStudent((S, st) => { if (!xo(S, "join")) return "Pairs on the same stop are already a team."; const p = pairOf(S, st.pid); if (!p) return; return leaveBand(S, p.id); }));
    // Basic: YES or NO to helping a battle starting one road away (YES moves the banner there and into the fight)
    socket.on("twHelp", asStudent((S, st, { battleId, yes }) => { const p = pairOf(S, st.pid); if (!p) return "Join a pair first."; return answerHelp(S, p.id, battleId, !!yes); }));
    // a battle gathering one road away is joined by the whole warband (it steps in); a battle still being fought elsewhere
    // is joined by a pair whose own battle has just ended (it fights from where it stands)
    socket.on("twJoinBattle", asStudent((S, st, { battleId }) => {
      const p = pairOf(S, st.pid); if (!p) return;
      const b = bandOf(S, p.id), B = S.battles.get(battleId);
      return b && B && canJoinBattle(S, b, B) ? joinBattle(S, p.id, battleId) : xo(S, "join") ? reinforce(S, p.id, battleId) : "That battle has already started.";
    }));
    socket.on("twAfterDone", asStudent((S, st) => { const p = pairOf(S, st.pid); if (p) { p.afterUntil = 0; S.dirty = true; } }));

    // projector
    socket.on("twWatch", ({ code } = {}) => {
      const S = sessions.get(String(code || "").toUpperCase()); if (!S) return fail("No war with that code.");
      socket.join(`tw:${S.code}:watch`);
      socket.emit("twPublic", classView(S, S.status === "playing" ? classVisible(S) : null));
    });
    socket.on("twReport", asHost((S) => { if (S.status !== "ended") return "The report is ready when the war ends."; socket.emit("twReportData", S.report || buildReport(S)); }));

    socket.on("disconnect", () => {
      const m = me(); if (m) { m.st.sockets.delete(socket.id); touch(m.S); }
    });
  }

  // tidy up wars nobody has touched for six hours
  setInterval(() => { for (const S of sessions.values()) if (Date.now() - S.lastActive > 6 * 3600e3) { clearInterval(S.timer); sessions.delete(S.code); bank?.docs?.remove(`${SAVE_DIR}/${S.code}.json`).catch(() => {}); } }, 600e3).unref?.();

  return { bind, has: (c) => sessions.has(String(c || "").toUpperCase()), _sessions: sessions, restored };
}
