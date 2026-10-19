// Headless test of the Basic Total War game (the default): a round is ANSWER (one question each, +2 steps for a right answer, then MOVE at once),
// MOVE (both partners tap GO) and FIGHT (pairs on one stop fight together, a pair one road away gets a Help card, everyone
// answers the same battle question, every right answer is a hit, the monster hits back for every wrong one, and a battle
// the monster survives sends the pairs back to the Academy). The Extras are off: no coins, food, War Cries, warbands,
// monster picking, battle moves or fog. Then a whole Basic war with a bot class, timed.
//   node test-totalwar-basic.mjs
import { spawn } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { io } from "socket.io-client";
import { HOME, FORTRESS, UNITS, CAMPS, BASIC_HIT, EXTRA_KEYS, basicTeamHp } from "./public/total-war/rules.js";

const SPEED = 20, PORT = Number(process.env.TWB_PORT) || 3206, URL = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (ok, msg) => { if (!ok) { fails.push(msg); console.log("  ✗ " + msg); } else console.log("  ✓ " + msg); };
const SAVES = mkdtempSync(join(tmpdir(), "twb-saves-"));
const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), RIFT_SPEED: String(SPEED), RIFT_TEST_CHEAT: "1", TW_SAVE_DIR: SAVES }, stdio: ["ignore", "pipe", "inherit"] });
await new Promise((res) => server.stdout.on("data", (d) => { if (String(d).includes("running")) res(); }));
const done = (code) => { server.kill(); try { rmSync(SAVES, { recursive: true, force: true }); } catch {} process.exit(code); };
setTimeout(() => { console.log("TIMEOUT"); summary(); done(1); }, 600000);
process.on("uncaughtException", (e) => { console.log("ERROR", e); done(1); });
const until = async (fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(20); } return false; };
function summary() { console.log(fails.length ? `\nFAILED: ${fails.length}` : "\nALL PASSED"); }

async function teacherWar(settings = {}) {
  const t = io(URL, { transports: ["websocket"] }); t.H = null; t.hs = null; t.errs = [];
  t.on("twHosting", (h) => (t.hs = h)); t.on("twHost", (v) => { v._at = Date.now(); t.H = v; }); t.on("twError", (m) => t.errs.push(m));
  await new Promise((r) => t.on("connect", r)); t.emit("twCreate");
  await until(() => t.hs && t.H);
  t.emit("twSettings", { botPartners: false, ...settings }); await sleep(60);
  return t;
}
// a student who answers every question (right, unless told to miss) and plans a route when asked
function student(name, opts = {}) {
  const s = io(URL, { transports: ["websocket"] }); s.v = null; s.errs = []; s.qs = []; s.rounds = []; s.wrongNext = 0;
  s.on("twError", (m) => s.errs.push(m));
  s.on("twState", (v) => {
    v._at = Date.now(); s.v = v; if (v.status !== "playing") return;
    const B = v.myBattle;
    const q = v.own && !v.own.result ? v.own.question : B?.question && !B.question.mine ? B.question : null;
    if (v.step === "answer" && v.me.stepsBy) s.stepsBy = v.me.stepsBy;
    if (v.own?.result && s.lastRes !== v.own.question.startedAt) { s.lastRes = v.own.question.startedAt; (s.results ||= []).push({ ...v.own.result, startedAt: v.own.question.startedAt }); }
    if (q && s.lastQ !== q.startedAt && !opts.manual) {
      s.lastQ = q.startedAt; s.qs.push({ kind: v.own && !v.own.result ? v.own.kind : "battle", phase: v.phase, turn: v.turn });
      const miss = s.wrongNext > 0 || (opts.missBattle && !(v.own && !v.own.result)); if (s.wrongNext > 0) s.wrongNext--;
      const pick = miss ? (q.cheat + 1) % q.choices.length : q.cheat;
      setTimeout(() => s.emit("twAnswer", { chosen: pick, startedAt: q.startedAt }), (q.recall * 1000) / SPEED + 30);
    }
    if (B?.round && s.rounds.at(-1)?.at !== B.round.at) s.rounds.push({ ...B.round, enemiesNow: B.enemies.map((e) => e.hp), faces: B.faces });
    if (B && B.status !== "gather") s.lastB = B;
    // a big message that needs an OK (the pair was sent back): the student taps OK (unless told not to)
    if (!opts.noAck) for (const n of v.me.notes || []) if (n.ack && !(s.acked ||= new Set()).has(n.id)) { s.acked.add(n.id); s.emit("twNoteOk", { id: n.id }); }
  });
  s.join = async (code) => { await new Promise((r) => (s.connected ? r() : s.on("connect", r))); s.emit("twJoin", { code, name }); await until(() => s.v); };
  return s;
}
const bandOf = (v) => v?.bands?.find((b) => b.id === v.me.bandId);

const ONLY = process.env.TWB_ONLY || "";      // TWB_ONLY=war: only the timed bot war
// ---------------------------------------------------------------- 1. a Basic round, step by step
if (!ONLY || ONLY === "round") {
console.log("--- a Basic round: ANSWER, MOVE, FIGHT ---");
  const t = await teacherWar({ turns: 6 });
  check(t.H.basic === true && t.H.fullGame === false && EXTRA_KEYS.every((k) => t.H.extras[k] === false), "a new war is the Basic game, with every Extra off");
  const A = [student("Ana"), student("Ali")], B = [student("Ben"), student("Bea")], C = [student("Cy"), student("Cat")];
  for (const s of [...A, ...B, ...C]) await s.join(t.hs.code);
  const pair = async (x, y) => { x.emit("twPartner", { pid: y.v.me.pid }); await sleep(40); y.emit("twPartner", { pid: x.v.me.pid }); await sleep(60); };
  await pair(...A); await pair(...B); await pair(...C);
  t.emit("twStart");
  await until(() => t.H.status === "playing" && t.H.phase === "crimson");
  check(t.H.step === "answer" && A[0].v.step === "answer", "round 1 starts with the ANSWER step");
  check(t.H.progress3?.of === 6 && A[0].v.progress3?.of === 6, `the ANSWER step's progress counts the students (${t.H.progress3?.done} of ${t.H.progress3?.of})`);
  check(A[0].v.units.length === t.H.units.length, "no fog in the Basic game: students see every enemy");
  // two Ogres one road from the Academy: pairs A and B go there, pair C stays home and is asked to help
  // (two, so the stars the students earn for their right answers do not finish them in the first question)
  t.emit("twTestSpawn", { types: ["ogre", "ogre"], node: 1 }); await sleep(100);
  t.emit("twEndTurn");
  const phases = new Set(); const watchPh = setInterval(() => phases.add(`${t.H.phase}:${t.H.stage || ""}`), 10);
  await until(() => t.H.phase === "crystal" && t.H.stage === "council", 30000);
  const answers = [...A, ...B, ...C].map((s) => s.qs.filter((q) => q.turn === 1 && q.kind === "muster").length);
  check(answers.every((n) => n === 1), `every student answered exactly one question in the ANSWER step (${answers.join(", ")})`);
  check(!phases.has("crystal:quiz"), "no top-up questions after the ANSWER step: the MOVE step opens straight away");
  check(t.H.step === "move", "then the MOVE step");
  const bandA = bandOf(A[0].v);
  check(bandA.mp === 5, `both right: the pair has 5 steps (1 to start, plus 2 from each partner's right answer): ${bandA.mp}`);
  check([...A, ...B, ...C].every((s) => (s.v.me.coins || 0) === 0), "no coins are earned in the Basic game");
  A[0].emit("twGrab", { items: { bento: 1 } }); A[0].emit("twEat", { item: "bento" }); await sleep(120);
  check(A[0].errs.some((e) => /Grab-Ma is not open/.test(e)) && A[0].errs.some((e) => /no food/.test(e)), "Grab-Ma and food are refused when the Coins Extra is off");
  A[0].emit("twJoinBand", { bandId: bandOf(B[0].v).id }); await sleep(80);
  check(A[0].errs.some((e) => /already a team/.test(e)), "there are no warbands to join in the Basic game");
  // both partners tap GO on the same stop
  A[0].emit("twRoute", { route: [HOME, 1] }); await sleep(100);
  check(!t.H.bands.find((b) => b.id === bandA.id).plan, "one partner's GO is not enough: the pair waits for the other");
  check(A[1].v.me.picks.partners.some((p) => Array.isArray(p.route) && p.route.at(-1) === 1), "the other partner sees where their partner wants to go");
  A[1].emit("twAgree", { partner: A[0].v.me.pid });
  B[0].emit("twRoute", { route: [HOME, 1] }); B[1].emit("twRoute", { route: [HOME, 1] });
  C[0].emit("twRoute", { hold: true }); C[1].emit("twRoute", { hold: true });
  await until(() => t.H.bands.find((b) => b.id === bandA.id)?.plan);
  check(Array.isArray(t.H.bands.find((b) => b.id === bandA.id)?.plan), "when both partners tap GO, the route is sent");
  // the march: pair A lands on the Ogre, pair B lands too: one battle with both pairs (a team is the pairs on one stop)
  await until(() => t.H.battles.length && t.H.battles[0].bands.length >= 2, 20000);
  const Bt = t.H.battles[0];
  check(Bt && Bt.bands.length === 2 && Bt.simple, `pairs on the same stop fight together automatically (${Bt?.bands.length} pairs in the battle)`);
  // pair C, one road away at the Academy, is asked to help
  await until(() => C[0].v.joinable?.length, 5000);
  const offer = C[0].v.joinable?.[0];
  check(!!offer && offer.pairs.length === 2, `a pair one road away is asked to help (Pairs ${offer?.pairs.join(" and ")} are fighting next door)`);
  C[0].emit("twHelp", { battleId: offer.id, yes: true });
  await until(() => t.H.battles[0]?.bands.length === 3, 5000);
  check(t.H.battles[0]?.bands.length === 3 && bandOf(C[0].v)?.node === 1, "YES moves the helping pair's banner there and into the fight");
  await until(() => (A[0].v.me.notes || []).some((n) => /came to help/.test(n.text)), 3000);
  check((A[0].v.me.notes || []).some((n) => /Pair \d+ came to help!/.test(n.text)), "the fighters are told \"Pair N came to help!\"");
  // the fight: one student misses the first question on purpose
  B[1].wrongNext = 1;
  await until(() => A[0].rounds.length >= 1, 30000);
  const r = A[0].rounds[0];
  check(t.H.step === "fight" || t.H.phase === "crystal", `the battle is fought in the FIGHT step (${t.H.step})`);
  check(r?.simple && r.total === 6 && r.rightCount === 5 && r.wrongCount === 1, `everyone in the battle answers the same question (${r?.rightCount} right, ${r?.wrongCount} wrong of ${r?.total})`);
  const each = BASIC_HIT * (1 + (r?.reinf?.atk || 0));
  check(r && Math.abs(r.each - each) < 0.01 && r.reinf?.atk > 0, `every right answer is one hit (${r?.each * 10} each, with the helpers' bonus +${Math.round((r?.reinf?.atk || 0) * 100)}%)`);
  check(r && r.hitsBy.length === 5 && r.hitsBy.every((h) => h.name && h.pairNo), "each hit is shown with the student's name and pair");
  check(r && Math.abs(r.counterTotal - UNITS.ogre.atk * 1) < 0.01, `the monster hits back once for each wrong answer (${r?.counterTotal * 10})`);
  check(Math.abs((UNITS.ogre.hp - (r?.enemiesAfter?.[0]?.hp ?? 99)) - Math.min(UNITS.ogre.hp, r.hits)) < 0.05, `the Ogre lost what the hits dealt (${UNITS.ogre.hp} → ${r?.enemiesAfter?.[0]?.hp})`);
  check(A.concat(B, C).every((s) => !s.v.myBattle?.moves) && !A[0].lastB?.choose, "no striker turns, no move menu");
  A[0].emit("twAction", { kind: "strike" }); A[0].emit("twTarget", { index: 0 }); await sleep(100);
  check(A[0].errs.some((e) => /no moves to pick|It is not your turn/.test(e)) && A[0].errs.some((e) => /same monster/.test(e)), "battle moves and monster picking are refused when their Extras are off");
  check(A[0].lastB?.faces?.length === 6, "the battle shows a row of every fighter's face");
  await until(() => !t.H.battles.length || t.H.battles.every((x) => x.status === "over"), 40000);
  check(t.H.bands.filter((b) => b.node === 1).length === 3 && !t.H.units.some((u) => u.node === 1), "winning the battle clears the stop");
  const cries = [...A, ...B, ...C].some((s) => s.qs.some((q) => q.kind === "warcry"));
  check(!cries, "no War Cry questions");
  // round 2 starts with ANSWER once the battles are over
  await until(() => t.H.turn === 2 && t.H.phase === "crimson", 20000);
  check(t.H.turn === 2 && t.H.step === "answer", "the round ends when the battles finish, and round 2 starts with ANSWER");
  clearInterval(watchPh);
  const odd = [...A, ...B, ...C].flatMap((s) => s.errs).filter((e) => !/Grab-Ma|no food|already a team|no moves|not your turn|same monster/.test(e));
  check(!odd.length, `no unexpected errors${odd.length ? ": " + odd.slice(0, 3).join(" | ") : ""}`);
  for (const s of [...A, ...B, ...C, t]) s.disconnect();
}

// ---------------------------------------------------------------- 2. losing, and an attack on a pair
if (!ONLY || ONLY === "lose") {
console.log("\n--- a lost battle sends the pair back to the Academy, and an attack waits for the FIGHT step ---");
{
  const t = await teacherWar({ turns: 6 });
  const s = student("Lone"); await s.join(t.hs.code);
  t.emit("twStart");
  await until(() => t.H.status === "playing" && t.H.phase === "crimson");
  t.emit("twTestSpawn", { types: ["ogre", "ogre", "ogre"], node: 1 }); await sleep(100);
  t.emit("twEndTurn");
  await until(() => t.H.stage === "council", 30000);
  s.emit("twRoute", { route: [HOME, 1] });
  await until(() => t.H.battles.length, 15000);
  await until(() => (s.v.me.notes || []).some((n) => n.kind === "lost"), 60000);
  const note = (s.v.me.notes || []).find((n) => n.kind === "lost");
  check(/The monster was too strong\./.test(note?.text || "") && note?.back === "the Academy", `a battle the monster survives: "${note?.text}" (back to ${note?.back})`);
  check(bandOf(s.v)?.node === HOME, "the pair is back at the Academy");
  check(t.H.units.filter((u) => u.node === 1).some((u) => u.hp < u.max), "the damage the pair dealt stays");
  // round 2: the enemy walks onto the pair at the Academy. The battle waits for the FIGHT step.
  await until(() => t.H.turn === 2 && t.H.phase === "crimson", 30000);
  const ogre = t.H.units.find((u) => u.node === 1);
  t.emit("twMoveUnit", { unitId: ogre.id, to: HOME }); await sleep(150);
  check(t.H.units.some((u) => u.node === HOME) && !t.H.battles.length, "an enemy that walks onto a pair does not start a battle in the ANSWER step");
  check(!s.v.myBattle && s.qs.some((q) => q.turn === 2), "the attacked pair still answers its question");
  t.emit("twEndTurn");
  await until(() => t.H.stage === "council", 30000);
  check(bandOf(s.v)?.node === HOME && s.v.units.some((u) => u.node === HOME), "in the MOVE step the pair sees the enemy on its stop (it may stay and fight, or move away)");
  s.emit("twRoute", { hold: true });
  await until(() => t.H.battles.some((B) => B.kind === "defend"), 30000);
  check(t.H.battles.some((B) => B.kind === "defend" && B.node === HOME) && t.H.step === "fight", "the attack is fought in the FIGHT step");
  for (const x of [s, t]) x.disconnect();
}

// ---------------------------------------------------------------- 3. the Extras and Full game
}
if (!ONLY || ONLY === "extras") {
console.log("\n--- Extras and the Full game switch ---");
  const t = await teacherWar();
  t.emit("twSettings", { extras: { coins: true } }); await until(() => t.H.extras.coins, 2000);
  check(t.H.extras.coins && !t.H.extras.hp && t.H.basic, "one Extra can be switched on by itself (coins), and the rounds stay Basic");
  t.emit("twSettings", { full: true }); await until(() => t.H.fullGame, 2000);
  check(t.H.fullGame && !t.H.basic && EXTRA_KEYS.every((k) => t.H.extras[k]), "Full game switches every Extra on and plays the full game's rounds");
  t.emit("twSettings", { extras: { fog: false } }); await until(() => !t.H.extras.fog, 2000);
  check(!t.H.fullGame && t.H.basic && t.H.extras.coins && !t.H.extras.fog, "switching one Extra off again leaves Full game");
  t.disconnect();
}

// ---------------------------------------------------------------- 4. a whole Basic war with a bot class, timed
if (!ONLY || ONLY === "war") {
console.log("\n--- a whole Basic war: a bot class against the Bot Commander ---");
  const t = await teacherWar({ botCommander: true, turns: 8 });
  for (let i = 0; i < 6; i++) t.emit("twAddBots", { pairs: 1 });
  await sleep(150);
  t.emit("twStart");
  await until(() => t.H.status === "playing");
  const start = Date.now(), steps = {}, perRound = [];
  let last = null, lastAt = Date.now(), roundAt = Date.now(), lastTurn = 1, maxBattles = 0, coins = 0, loss = false;
  while (t.H.status === "playing" && Date.now() - start < 300000) {
    await sleep(15);
    const k = t.H.step || "other";
    if (k !== last) { if (last) steps[last] = (steps[last] || 0) + (Date.now() - lastAt) * SPEED / 1000; last = k; lastAt = Date.now(); }
    if (t.H.turn !== lastTurn && process.env.TWB_DEBUG) console.log("   round", lastTurn, "bands", t.H.bands.map((b) => b.node).join(","), "units", t.H.units.map((u) => u.node).join(","), t.H.log.slice(-4).map((l) => l.text).join(" | "));
    if (t.H.turn !== lastTurn) { perRound.push((Date.now() - roundAt) * SPEED / 1000); roundAt = Date.now(); lastTurn = t.H.turn; }
    maxBattles = Math.max(maxBattles, t.H.battles.reduce((a, B) => Math.max(a, B.bands.length), 0));
    coins = Math.max(coins, ...t.H.students.map(() => 0));
    if (t.H.log.some((l) => /is lost/.test(l.text))) loss = true;
  }
  if (last) steps[last] = (steps[last] || 0) + (Date.now() - lastAt) * SPEED / 1000;
  const war = (Date.now() - start) * SPEED / 1000;
  const rounds = t.H.turn;
  console.log(`  result: ${t.H.winner} (${t.H.endedBy || "the Warlord fell"}) after ${rounds} rounds, gate ${t.H.gate.hp}/${t.H.gate.max}, Warlord ${t.H.warlord.hp}/${t.H.warlord.max}`);
  console.log(`  war length: ${(war / 60).toFixed(1)} game minutes; time in each step (game seconds, whole war): ${Object.entries(steps).map(([k, v]) => `${k} ${Math.round(v)}`).join(", ")}`);
  console.log(`  each round (game seconds): ${perRound.map(Math.round).join(", ")}; the biggest team in one battle: ${maxBattles} pairs; a battle was lost: ${loss}`);
  check(t.H.status === "ended", `the Basic war ends (${t.H.winner})`);
  check(t.H.gate.broken || t.H.gate.hp < t.H.gate.max, "the bot class reached and hit the fortress gate");
  check(maxBattles >= 2, "pairs on the same stop fought together");
  const answered = t.H.students.map((s) => s.answered);
  console.log(`  questions each: ${Math.min(...answered)} to ${Math.max(...answered)}`);
  check(t.H.students.every((s) => s.answered >= Math.min(rounds, 8) - 1), "every bot answered its question every round, plus its battle questions");
  check(t.H.turn <= 8 && t.H.summary?.turns === t.H.turn, `the end screen counts the rounds really played, never one more (${t.H.summary?.turns} of 8)`);
  check(!t.H.log.some((l) => /Crimson Host|Crystal army|Academy Ward/.test(l.text)), "the Basic game's end message uses its own words (the enemy, the class, the Academy's shield)");
  t.disconnect();
}
// ---------------------------------------------------------------- 5. the cold-test fixes
const gs = (v, t) => ((t - (v.serverNow + Date.now() - (v._at || Date.now()))) * SPEED) / 1000;   // game seconds from now to t
const pairUp = async (x, y) => { x.emit("twPartner", { pid: y.v.me.pid }); await sleep(40); y.emit("twPartner", { pid: x.v.me.pid }); await sleep(60); };
if (!ONLY || ONLY === "fixes" || ONLY === "help") {
console.log("\n--- the Help card waits for the pair to decide, and YES joins the fight ---");
  const t = await teacherWar({ turns: 6 });
  const A = [student("Hana"), student("Hugo")], C = [student("Cleo"), student("Cody")];
  for (const s of [...A, ...C]) await s.join(t.hs.code);
  await pairUp(...A); await pairUp(...C);
  t.emit("twStart"); await until(() => t.H.status === "playing" && t.H.phase === "crimson");
  t.emit("twTestSpawn", { types: ["ogre"], node: 1 }); await sleep(80); t.emit("twEndTurn");
  await until(() => t.H.stage === "council", 30000);
  for (const s of A) s.emit("twRoute", { route: [HOME, 1] });
  for (const s of C) s.emit("twRoute", { hold: true });
  await until(() => C[0].v.joinable?.length, 15000);
  const offer = C[0].v.joinable?.[0];
  const left = offer ? gs(C[0].v, offer.gatherEnds) : 0;
  check(left >= 10, `the pair next door gets at least 10 seconds to decide (${left.toFixed(1)} s)`);
  await sleep(6000 / SPEED);                                     // 6 game seconds: longer than the old 3-second start
  const B0 = t.H.battles.find((x) => x.node === 1);
  check(B0?.status === "gather", `the fight waits while the pair decides (${B0?.status} after 6 s)`);
  C[1].emit("twHelp", { battleId: offer.id, yes: true });
  await until(() => t.H.battles.find((x) => x.node === 1)?.bands.length === 2, 3000);
  check(t.H.battles.find((x) => x.node === 1)?.bands.length === 2 && bandOf(C[0].v)?.node === 1, "YES moves the pair's banner there and into the fight");
  await until(() => t.H.battles.find((x) => x.node === 1)?.status === "fight", 3000);
  check(t.H.battles.find((x) => x.node === 1)?.status === "fight", "once every pair asked has answered, the fight starts");
  check(![...A, ...C].flatMap((s) => s.errs).some((e) => /Too late|already started/.test(e)), "the YES was not refused");
  for (const s of [...A, ...C, t]) s.disconnect();
}

if (!ONLY || ONLY === "fixes" || ONLY === "timer") {
console.log("\n--- the MOVE timer is never cut for a pair that has not tapped GO ---");
  const t = await teacherWar({ turns: 6, councilSeconds: 20 });
  t.emit("twAddBots", { pairs: 3 }); await sleep(80);
  const P = [student("Pia"), student("Pat")], Q = [student("Quin"), student("Qiu")];
  for (const s of [...P, ...Q]) await s.join(t.hs.code);
  await pairUp(...P); await pairUp(...Q);
  t.emit("twStart"); await until(() => t.H.status === "playing" && t.H.phase === "crimson");
  // pair Q waits one road away, so the bot pairs at the Academy follow pair P
  t.emit("twTestPlace", { pairNo: t.H.pairs.find((p) => p.names.includes("Quin")).no, node: 14 }); await sleep(60);
  t.emit("twEndTurn");
  await until(() => t.H.stage === "council", 30000);
  const E0 = t.H.phaseEndsAt, startedAt = t.H.moveStartedAt;
  if (process.env.TWB_DEBUG) { let k = ''; const iv = setInterval(() => { const x = `${t.H.stage} end@${((t.H.phaseEndsAt - startedAt) * SPEED / 1000).toFixed(1)} ${JSON.stringify(t.H.ready)}`; if (x !== k) { k = x; console.log("   dbg", (-gs(t.H, startedAt)).toFixed(1), x); } }, 5); setTimeout(() => clearInterval(iv), 6000); }
  let dropped = 0, prev = E0, endedEarly = false, lasted = null;
  const watch = setInterval(() => {
    if (t.H.stage === "council") { if (t.H.phaseEndsAt < prev - 5) dropped++; prev = t.H.phaseEndsAt; }
    else { if (lasted == null) lasted = -gs(t.H, startedAt); if (gs(t.H, E0) > 0.5 && t.H.phase === "crystal") endedEarly = true; }
  }, 5);
  // pair P taps GO when 4 seconds are left (the bot pairs follow it at once): pair Q is now the only one choosing, and
  // gets at least 10 seconds
  await until(() => t.H.stage === "council" && gs(t.H, t.H.phaseEndsAt) <= 4, 30000);
  check(t.H.stage === "council" && t.H.phaseEndsAt === E0, "MOVE goes on, its time unchanged, while pairs are still choosing");
  const goAt = -gs(t.H, startedAt);
  for (const s of P) s.emit("twRoute", { hold: true });
  await until(() => t.H.ready?.done === t.H.ready?.of - 1, 3000);
  const lastLeft = ((t.H.phaseEndsAt - startedAt) * SPEED) / 1000 - goAt;
  check(lastLeft >= 9 && t.H.stage === "council", `everyone else is ready: the last pair still has at least 10 seconds (${lastLeft.toFixed(1)} s after the others were ready)`);
  await until(() => t.H.stage !== "council", 30000);
  await sleep(30); clearInterval(watch);
  if (lasted == null) lasted = -gs(t.H, startedAt);
  check(!dropped && !endedEarly, `the MOVE time never went down for a pair that had not tapped GO (cut ${dropped} times, ended early: ${endedEarly})`);
  check(lasted >= 20, `MOVE lasted its whole time while a pair was still choosing (${lasted?.toFixed(1)} s of 20, plus the last pair's 10)`);
  for (const s of [...P, ...Q, t]) s.disconnect();
}

if (!ONLY || ONLY === "fixes" || ONLY === "gate") {
console.log("\n--- the fortress gate: a pair alone cannot break it, the damage stays, and the end screen says so ---");
  const t = await teacherWar({ turns: 8 });
  const L = [student("Lia"), student("Leo")];
  for (const s of L) await s.join(t.hs.code);
  await pairUp(...L);
  t.emit("twStart"); await until(() => t.H.status === "playing" && t.H.phase === "crimson");
  check(t.H.gate.max === 100, `the gate guardian has 1000 health whatever the class size (${t.H.gate.max * 10})`);
  t.emit("twTestSpawn", { types: ["ogre", "orc_vanguard"], node: FORTRESS }); await sleep(60); t.emit("twEndTurn");
  await until(() => t.H.stage === "council", 30000);
  t.emit("twTestPlace", { pairNo: 1, node: 9 }); await sleep(80);
  for (const s of L) s.emit("twRoute", { route: [9, FORTRESS] });
  await until(() => t.H.battles.some((x) => x.kind === "gate"), 15000);
  const G = t.H.battles.find((x) => x.kind === "gate");
  check(G.enemies.length === 1 && G.enemies[0].type === "golem", `only the gate guardian fights at the gate (${G.enemies.map((e) => e.type).join(", ")})`);
  await until(() => (L[0].v.me.notes || []).some((n) => n.kind === "lost"), 60000);
  const note = (L[0].v.me.notes || []).find((n) => n.kind === "lost");
  const knocked = +((note?.text || "").match(/You knocked (\d+) health off the gate\. It stays damaged\. Bring more pairs!/)?.[1] ?? -1);
  check(knocked > 0, `the lost fight says how much the team did: "${note?.text}"`);
  check(!t.H.gate.broken && knocked <= 360 && t.H.gate.hp * 10 === 1000 - knocked, `a pair alone cannot break the gate, and the gate keeps the damage (${t.H.gate.hp * 10} of 1000 left)`);
  const hpAfter = t.H.gate.hp;
  await until(() => t.H.turn === 2 && t.H.stage === "council", 60000);
  check(t.H.gate.hp === hpAfter, `the gate is still damaged next round (${t.H.gate.hp * 10})`);
  t.emit("twTestPlace", { pairNo: 1, node: 9 }); await sleep(80);
  for (const s of L) s.emit("twRoute", { route: [9, FORTRESS] });
  await until(() => t.H.battles.some((x) => x.kind === "gate"), 15000);
  check(t.H.battles.find((x) => x.kind === "gate")?.enemies[0].hp === hpAfter, "the next fight at the gate starts with the damage still there");
  await until(() => !t.H.battles.length, 60000);
  t.emit("twEndGame", { result: "progress" });
  await until(() => L[0].v.status === "ended", 5000);
  const Y = L[0].v.summary || {};
  check(Y.reached === FORTRESS && Y.gateFights === 2 && Y.gateDmg === 1000 - t.H.gate.hp * 10 && Y.gateDmg > knocked, `the end screen counts the fights at the gate (furthest: ${Y.reached}, ${Y.gateFights} gate fights, ${Y.gateDmg} damage)`);
  check((L[0].v.story || []).some((e) => /^Pair 1 \(Lia and Leo\) knocked \d+ health off the gate\./.test(e.text)), `pairs are named as the students know them ("${(L[0].v.story || []).map((e) => e.text).join(" | ")}")`);
  for (const s of [...L, t]) s.disconnect();
  // a team of 3 pairs answering well breaks the gate within 2 fights
  const t2 = await teacherWar({ turns: 8 });
  const team = Array.from({ length: 6 }, (_, i) => student(`T${i}`));
  for (const s of team) await s.join(t2.hs.code);
  for (let i = 0; i < 6; i += 2) await pairUp(team[i], team[i + 1]);
  t2.emit("twStart"); await until(() => t2.H.status === "playing" && t2.H.phase === "crimson");
  let fights = 0;
  for (let round = 1; round <= 3 && !t2.H.gate.broken; round++) {
    if (round > 1) await until(() => t2.H.turn === round && t2.H.phase === "crimson", 60000);
    t2.emit("twEndTurn");
    await until(() => t2.H.stage === "council", 30000);
    for (const no of [1, 2, 3]) t2.emit("twTestPlace", { pairNo: no, node: 9 });
    await sleep(80);
    for (const s of team) s.emit("twRoute", { route: [9, FORTRESS] });
    await until(() => t2.H.battles.some((x) => x.kind === "gate"), 15000);
    fights++;
    await until(() => t2.H.battles.find((x) => x.kind === "gate")?.bands.length === 3, 3000);
    check(t2.H.battles.find((x) => x.kind === "gate")?.bands.length === 3, `fight ${fights} at the gate: the 3 pairs fight together`);
    await until(() => !t2.H.battles.length, 60000);
  }
  check(t2.H.gate.broken && fights <= 2, `a team of 3 pairs answering well broke the gate in ${fights} fight${fights === 1 ? "" : "s"}`);
  for (const s of [...team, t2]) s.disconnect();
}

if (!ONLY || ONLY === "fixes" || ONLY === "steps") {
console.log("\n--- steps: one question each, a right answer is 2 steps and a star, a wrong one still moves ---");
  const t = await teacherWar({ turns: 6 });
  const S1 = student("Sam"), S2 = student("Sol");
  for (const s of [S1, S2]) await s.join(t.hs.code);
  await pairUp(S1, S2);
  S2.wrongNext = 1;                                              // Sol gets it wrong
  t.emit("twStart"); await until(() => t.H.status === "playing" && t.H.phase === "crimson");
  t.emit("twTestSpawn", { types: ["rift_hound"], node: 1 }); await sleep(60);
  // the teacher does nothing: the ANSWER step still ends as soon as both have answered (and read why)
  const a0 = Date.now();
  await until(() => t.H.stage === "council", 30000);
  const took = ((Date.now() - a0) * SPEED) / 1000;
  check(took < 20, `the ANSWER step moved on once both had answered, without the teacher (${took.toFixed(1)} game s)`);
  check(t.H.enemyPlan?.byTime === true, "with no choice from the teacher, the enemy decided by itself");
  const by = S1.stepsBy || [];
  check(by.length === 2 && by[0].name === "You" && by[0].steps === 2 && by[1].name === "Sol" && by[1].steps === 0, `each partner's steps are shown (${by.map((x) => `${x.name} +${x.steps}`).join(", ")})`);
  check(bandOf(S1.v)?.mp === 3, `the pair moves 1 + 2 + 0 = 3 steps (${bandOf(S1.v)?.mp})`);
  const res = S1.results || [], res2 = S2.results || [];
  check(res.length === 1 && res[0].step && res[0].gain === 2 && res[0].star && res[0].steps === 3, `Sam's one right answer: +2 steps and a star (${JSON.stringify(res.map((r) => ({ gain: r.gain, star: r.star, steps: r.steps })))})`);
  check(res2.length === 1 && !res2[0].ok && !res2[0].step && res2[0].steps === 3, "Sol's wrong answer adds nothing, but the pair still moves");
  check(S1.v.me.star === true && !S2.v.me.star, "only the student who was right has a star");
  check(S1.v.progress3 == null && t.H.step === "move", "the progress line is only shown in the ANSWER step");
  for (const s of [S1, S2]) s.emit("twRoute", { route: [HOME, 1] });
  await until(() => S1.rounds.length >= 1, 30000);
  const hit = S1.rounds[0]?.hitsBy?.find((h) => h.name === "Sam");
  check(hit?.star && Math.abs(hit.dmg - 2 * BASIC_HIT) < 0.01, `the star is 1 extra hit on Sam's first right answer in the fight (${(hit?.dmg ?? 0) * 10})`);
  for (const s of [S1, S2, t]) s.disconnect();
}

if (!ONLY || ONLY === "fixes" || ONLY === "seen") {
console.log("\n--- the answer timer starts when the choices appear on the student's screen ---");
  const t = await teacherWar({ turns: 6 });
  const M = student("Max", { manual: true }), N = student("Nat", { manual: true });
  await M.join(t.hs.code); await N.join(t.hs.code);
  t.emit("twStart"); await until(() => M.v?.own && !M.v.own.result && N.v?.own && !N.v.own.result, 15000);
  const q1 = M.v.own.question;
  // the choices show 8 seconds late on this screen: the student still gets the whole 21 seconds from then
  await sleep(((q1.recall + 8) * 1000) / SPEED); M.emit("twSeen", { startedAt: q1.startedAt });
  await sleep(((q1.seconds - 3) * 1000) / SPEED);              // 26 seconds after the choices were due
  M.emit("twAnswer", { chosen: q1.cheat, startedAt: q1.startedAt });
  await until(() => M.v.own?.result && M.v.own.question.startedAt === q1.startedAt, 3000);
  check(M.v.own?.result?.ok === true, `an answer 18 seconds after the choices appeared counts, though the choices came late (${M.v.own?.result?.ok ? "right" : M.v.own?.result?.chosen < 0 ? "time's up" : "none"})`);
  // Nat's screen says nothing: the question ends 21 seconds after the choices were due, plus the grace for a late screen
  const q2 = N.v.own.question;
  N.emit("twAnswer", { chosen: q2.cheat, startedAt: q2.startedAt });
  await sleep(100);
  const r2 = (N.results || []).find((r) => r.startedAt === q2.startedAt);
  check(r2 && r2.chosen < 0, "a screen that never shows the choices: the question has ended by then (time's up)");
  for (const s of [M, N, t]) s.disconnect();
}
// ---------------------------------------------------------------- 6. the second cold test: always saying what happened
const notesOf = (s, re) => (s.v?.me?.notes || []).filter((n) => re.test(n.text));
if (!ONLY || ONLY === "cold3" || ONLY === "timeup") {
console.log("\n--- time's up: every question, MOVE and fight question that runs out says so ---");
  const t = await teacherWar({ turns: 6 });
  const M = student("Mo", { manual: true, noAck: true });
  await M.join(t.hs.code);
  // a slow screen: the choices show 12 seconds late, and the student does not answer
  const seenLate = new Set(), allNotes = new Map();
  M.on("twState", (v) => {
    const q = v.own && !v.own.result ? v.own.question : null;
    if (q && !seenLate.has(q.startedAt)) { seenLate.add(q.startedAt); setTimeout(() => M.emit("twSeen", { startedAt: q.startedAt }), ((q.recall + 12) * 1000) / SPEED); }
    for (const n of v.me?.notes || []) allNotes.set(n.id, n);
  });
  t.emit("twStart"); await until(() => t.H.status === "playing" && t.H.phase === "crimson");
  check(t.H.settings.councilSeconds === 0, "the MOVE time is not set, so it is the Basic default");
  t.emit("twTestSpawn", { types: ["hollow_knight"], node: 1 }); await sleep(60);
  await until(() => [...allNotes.values()].some((n) => /Time's up for that question\. It counts as wrong\./.test(n.text)), 20000);
  const qNote = [...allNotes.values()].find((n) => /Time's up for that question/.test(n.text));
  check(qNote?.kind === "timeup" && qNote.pid === M.v.me.pid, `a question that runs out says so: "${qNote?.text}"`);
  await until(() => t.H.stage === "council", 30000);
  const moveSecs = ((t.H.phaseEndsAt - t.H.moveStartedAt) * SPEED) / 1000;
  check(Math.abs(moveSecs - 45) < 1, `the MOVE step lasts 45 seconds in the Basic game (${moveSecs.toFixed(1)} s)`);
  check(![...allNotes.values()].some((n) => /^Time's up for the question\. The round moved on/.test(n.text)), "even on a slow screen the one question ends (and its explanation is read) before the ANSWER step's time is up");
  // the pair stands on the enemy's stop and nobody taps GO
  t.emit("twTestPlace", { pairNo: 1, node: 1 }); await sleep(60);
  await until(() => t.H.stage !== "council", 60000);
  await until(() => [...allNotes.values()].some((n) => /^Time's up\. Your pair stayed at Lantern Crossroads\.$/.test(n.text)), 3000);
  check([...allNotes.values()].some((n) => n.kind === "timeup" && /^Time's up\. Your pair stayed at Lantern Crossroads\.$/.test(n.text)), "MOVE ending without GO: \"Time's up. Your pair stayed at Lantern Crossroads.\"");
  // the fight: the student does not answer
  await until(() => t.H.battles.some((B) => B.status === "result"), 30000);
  await sleep(100);
  const fNotes = [...allNotes.values()].filter((n) => /Time's up for that question/.test(n.text));
  check(fNotes.length >= 2 && t.H.step === "fight", `a fight question that runs out says so too (${fNotes.length} such messages)`);
  check([...allNotes.values()].every((n) => !/;|—/.test(n.text)), "no semicolons or dashes in the messages");
  for (const s of [M, t]) s.disconnect();
}

if (!ONLY || ONLY === "cold3" || ONLY === "hold") {
console.log("\n--- a message that needs OK holds the next question: no question clock runs under it ---");
  const t = await teacherWar({ turns: 6 });
  const s = student("Una", { noAck: true }); await s.join(t.hs.code);
  t.emit("twStart"); await until(() => t.H.status === "playing" && t.H.phase === "crimson");
  t.emit("twTestSpawn", { types: ["ogre", "ogre", "ogre"], node: 1 }); await sleep(80);
  t.emit("twEndTurn");
  await until(() => t.H.stage === "council", 30000);
  s.emit("twRoute", { route: [HOME, 1] });
  await until(() => (s.v.me.notes || []).some((n) => n.kind === "lost"), 60000);
  const lost = (s.v.me.notes || []).find((n) => n.kind === "lost");
  check(lost?.ack === true, "being sent back is a message that needs OK");
  await until(() => t.H.turn === 2 && t.H.phase === "crimson", 30000);
  const r2 = Date.now();
  await sleep(8000 / SPEED);
  check(!s.v.own && !s.qs.some((q) => q.turn === 2), "round 2: no question starts while the message is open (8 s)");
  s.emit("twNoteOk", { id: lost.id });
  await until(() => s.v.own && s.v.turn === 2, 3000);
  const waited = ((Date.now() - r2) * SPEED) / 1000;
  check(!!s.v.own && waited < 12, `after OK the first question comes at once (${waited.toFixed(1)} s into the round)`);
  // a student who never taps OK is not held for ever
  const s2 = student("Vic", { noAck: true }); const t2 = await teacherWar({ turns: 6 }); await s2.join(t2.hs.code);
  t2.emit("twStart"); await until(() => t2.H.status === "playing" && t2.H.phase === "crimson");
  t2.emit("twTestSpawn", { types: ["ogre", "ogre", "ogre"], node: 1 }); await sleep(80); t2.emit("twEndTurn");
  await until(() => t2.H.stage === "council", 30000); s2.emit("twRoute", { route: [HOME, 1] });
  await until(() => t2.H.turn === 2 && t2.H.phase === "crimson", 90000);
  const r3 = Date.now();
  await until(() => s2.v.own && s2.v.turn === 2, 5000);
  const held = ((Date.now() - r3) * SPEED) / 1000;
  check(!!s2.v.own && held >= 10 && held <= 24, `without OK the question waits at most 20 s (${held.toFixed(1)} s)`);
  for (const x of [s, t, s2, t2]) x.disconnect();
}

if (!ONLY || ONLY === "cold3" || ONLY === "gateteam") {
console.log("\n--- the gate needs 3 pairs: GO to the gate is sent only once 3 pairs have chosen it ---");
  const t = await teacherWar({ turns: 6 });
  const P = Array.from({ length: 6 }, (_, i) => student(`G${i}`));
  for (const s of P) await s.join(t.hs.code);
  for (let i = 0; i < 6; i += 2) await pairUp(P[i], P[i + 1]);
  t.emit("twStart"); await until(() => t.H.status === "playing" && t.H.phase === "crimson");
  t.emit("twEndTurn"); await until(() => t.H.stage === "council", 30000);
  for (const no of [1, 2, 3]) t.emit("twTestPlace", { pairNo: no, node: 9 });
  await sleep(80);
  const bandNo = (no) => t.H.bands.find((b) => b.pairs.some((p) => p.no === no));
  P[0].emit("twRoute", { route: [9, FORTRESS] }); P[1].emit("twRoute", { route: [9, FORTRESS] }); await sleep(150);
  check(P[1].errs.some((e) => /^The gate needs a big team\. Get 2 more pairs to come with you\.$/.test(e)) || P[0].errs.some((e) => /Get 2 more pairs/.test(e)), "one pair's GO to the gate: \"The gate needs a big team. Get 2 more pairs to come with you.\"");
  check(!bandNo(1).plan && t.H.gateTeam?.going.length === 1 && t.H.gateTeam.need === 3, `the GO is not sent yet, and the counter says 1 of 3 (${t.H.gateTeam?.going.length} of ${t.H.gateTeam?.need})`);
  P[2].emit("twRoute", { route: [9, FORTRESS] }); P[3].emit("twRoute", { route: [9, FORTRESS] }); await sleep(150);
  check(!bandNo(1).plan && !bandNo(2).plan && t.H.gateTeam?.going.length === 2, "2 pairs: still not sent (2 of 3)");
  P[4].emit("twDraft", { route: [9, FORTRESS] }); await sleep(150);
  check(t.H.gateTeam?.going.length === 3 && Array.isArray(bandNo(1).plan) && Array.isArray(bandNo(2).plan), "the third pair taps the gate: the two pairs that tapped GO are sent");
  P[4].emit("twRoute", { route: [9, FORTRESS] }); P[5].emit("twRoute", { route: [9, FORTRESS] });
  await until(() => t.H.battles.some((B) => B.kind === "gate"), 60000);
  await until(() => t.H.battles.find((B) => B.kind === "gate")?.bands.length === 3, 3000);
  check(t.H.battles.find((B) => B.kind === "gate")?.bands.length === 3, "all 3 pairs fight at the gate together");
  for (const s of [...P, t]) s.disconnect();
  // practice: bot pairs come with the student when the student chooses the gate
  const t2 = await teacherWar({ turns: 6 });
  t2.emit("twAddBots", { pairs: 2 }); await sleep(80);
  const H2 = [student("Pip"), student("Pam")];
  for (const s of H2) await s.join(t2.hs.code);
  await pairUp(...H2);
  t2.emit("twStart"); await until(() => t2.H.status === "playing" && t2.H.phase === "crimson");
  t2.emit("twEndTurn"); await until(() => t2.H.stage === "council", 30000);
  for (const no of t2.H.pairs.map((p) => p.no)) t2.emit("twTestPlace", { pairNo: no, node: 9 });
  await sleep(100);
  for (const s of H2) s.emit("twRoute", { route: [9, FORTRESS] });
  await until(() => t2.H.battles.some((B) => B.kind === "gate"), 60000);
  await until(() => t2.H.battles.find((B) => B.kind === "gate")?.bands.length === 3, 3000);
  check(t2.H.battles.find((B) => B.kind === "gate")?.bands.length === 3, `the bot pairs join the student's gate attempt (${t2.H.battles.find((B) => B.kind === "gate")?.bands.length} pairs at the gate)`);
  for (const s of [...H2, t2]) s.disconnect();
}

if (!ONLY || ONLY === "cold3" || ONLY === "team") {
console.log("\n--- the team's health in a fight: the monster's blows take it, and a team with none left loses ---");
  const t = await teacherWar({ turns: 6 });
  const A = [student("Tia"), student("Tom")];
  for (const s of A) await s.join(t.hs.code);
  await pairUp(...A);
  t.emit("twStart"); await until(() => t.H.status === "playing" && t.H.phase === "crimson");
  t.emit("twTestSpawn", { types: ["ogre", "ogre"], node: 1 }); await sleep(60);
  t.emit("twEndTurn"); await until(() => t.H.stage === "council", 30000);
  A[1].wrongNext = 1;                                           // Tom misses the first fight question
  for (const s of A) s.emit("twRoute", { route: [HOME, 1] });
  await until(() => A[0].v.myBattle?.status === "fight", 30000);
  const Bv = A[0].v.myBattle, want = basicTeamHp(2, Bv.limit, UNITS.ogre.atk);
  check(Bv.team && Bv.team.max === want && Bv.team.hp === want, `the team starts the fight with its health (${Bv.team?.hp * 10} of ${want * 10})`);
  await until(() => A[0].rounds.length >= 1, 30000);
  const r = A[0].rounds[0];
  check(r.counterTotal === UNITS.ogre.atk && r.team?.hp === want - UNITS.ogre.atk, `one wrong answer: the monster hits the team for ${r.counterTotal * 10}, health ${r.team?.hp * 10} of ${want * 10}`);
  for (const s of A) s.disconnect(); t.disconnect();
  // a pair that gets everything wrong runs out of health before the questions run out, and loses
  const t2 = await teacherWar({ turns: 6 });
  const W = student("Wes"); await W.join(t2.hs.code); W.wrongNext = 99;
  t2.emit("twStart"); await until(() => t2.H.status === "playing" && t2.H.phase === "crimson");
  t2.emit("twTestSpawn", { types: ["hollow_knight"], node: 1 }); await sleep(60);
  t2.emit("twEndTurn"); await until(() => t2.H.stage === "council", 30000);
  W.emit("twRoute", { route: [HOME, 1] });
  await until(() => (W.v.me.notes || []).some((n) => n.kind === "lost"), 60000);
  const lost = (W.v.me.notes || []).find((n) => n.kind === "lost");
  const qs = W.rounds.length, lim = W.lastB?.limit || 5;
  check(lost?.text === "Your team ran out of health." && lost.out && qs < lim, `a team with no health left loses the fight early (after ${qs} of ${lim} questions): "${lost?.text}"`);
  check(W.rounds.at(-1)?.team?.hp === 0, "its health shows 0");
  for (const x of [W, t2]) x.disconnect();
}

// ---------------------------------------------------------------- 7. the teacher's Basic screen controls
// One tap moves the enemy (let it decide, or send it to a stop), the game never waits for the teacher (the enemy decides by
// itself when step 1 ends), pause blocks enemy orders, no full-game messages in Basic, "not moved for 3 rounds" counts
// rounds properly, and the end screens stop changing once the war is over.
if (!ONLY || ONLY === "teacher") {
console.log("--- the teacher's Basic controls ---");
  const t = await teacherWar({ turns: 6 });
  const A = [student("Tia", { manual: true }), student("Tom", { manual: true })];
  for (const s of A) await s.join(t.hs.code);
  await pairUp(...A);
  t.emit("twStart"); await until(() => t.H.status === "playing" && t.H.phase === "crimson");
  const logs = new Set(); const watchLog = setInterval(() => { for (const l of t.H.log || []) logs.add(l.text); }, 20);
  check(t.H.students.every((s) => typeof s.q3 === "number" && typeof s.asking === "boolean"), "the teacher sees how many of this round's questions each student has answered");
  t.emit("twPause", { paused: true }); await until(() => t.H.paused);
  t.emit("twEnemy", { to: null }); await sleep(150);
  check(t.errs.some((e) => /paused/i.test(e)) && !t.H.teacherEnded, "while the war is paused the enemy cannot be moved");
  t.emit("twPause", { paused: false }); await until(() => !t.H.paused);
  t.errs.length = 0;
  const camp = +Object.keys(CAMPS)[0];
  t.emit("twEnemy", { to: camp }); t.emit("twEnemy", { to: FORTRESS }); await sleep(150);
  check(t.errs.filter((e) => /Pick a stop/.test(e)).length === 2 && !t.H.teacherEnded, "the enemy cannot be sent to a monster camp or into its own castle");
  const e0 = t.H.energy;
  t.emit("twEnemy", { to: null }); await until(() => t.H.teacherEnded);
  const free = () => t.H.units.filter((u) => !u.battle);
  check(t.H.enemyPlan?.kind === "auto" && t.H.energy < e0 && t.H.units.length > 0, `"Let the enemy decide" sends out new units with the energy (${e0} -> ${t.H.energy}, ${t.H.units.length} units)`);
  check(free().every((u) => u.order), "and gives every unit an order");
  t.emit("twEnemy", { to: 10 }); await sleep(150);
  check(t.H.enemyPlan?.kind === "go" && t.H.enemyPlan.to === 10 && free().every((u) => u.order?.kind === "march" && u.order.to === 10), "changing the choice to a stop sends the whole enemy army there");
  t.emit("twEnemy", { to: null }); await sleep(150);
  check(t.H.enemyPlan?.kind === "auto" && !free().some((u) => u.order?.kind === "march" && u.order.to === 10), "changing back to \"Let the enemy decide\" replaces the march orders");
  await until(() => t.H.step === "move", 30000);
  t.errs.length = 0; t.emit("twEnemy", { to: null }); await sleep(150);
  check(t.errs.some((e) => /step 1/.test(e)), "the enemy is moved only in step 1 (ANSWER)");
  for (const s of A) s.emit("twRoute", { hold: true });
  // round 2: the teacher does nothing at all, and the game goes on
  await until(() => t.H.turn === 2 && t.H.phase === "crimson", 60000);
  const u2 = t.H.units.length, e2 = t.H.energy;
  check(!t.H.enemyPlan && !t.H.teacherEnded, "a new round starts with no enemy choice made");
  await until(() => t.H.step === "move" && t.H.turn === 2, 30000);
  check(t.H.enemyPlan?.kind === "auto" && t.H.enemyPlan.byTime && (t.H.units.length > u2 || t.H.energy < e2), `with no choice from the teacher, the enemy decided by itself when step 1 ended (${u2} -> ${t.H.units.length} units, energy ${e2} -> ${t.H.energy})`);
  for (const s of A) s.emit("twRoute", { hold: true });
  await until(() => t.H.turn === 3 && t.H.phase === "crimson", 90000);
  const no = t.H.pairs.find((p) => !p.bots)?.no;
  check(!(t.H.stuck || []).some((p) => p.no === no), `round 3: a pair that has stayed for 2 rounds is not yet "not moved for 3 rounds" (${JSON.stringify(t.H.stuck)})`);
  check(![...logs].some((l) => /Finish your questions/.test(l)), "no full-game messages in the Basic game (\"Finish your questions, then plan your move\")");
  clearInterval(watchLog);
  // the end: the screens stop changing once the war is over (a question still open cannot be answered)
  const open = A.map((s) => s.v.own && !s.v.own.result ? s.v.own.question : null).find(Boolean);
  t.emit("twEndGame", { result: "progress" }); await until(() => t.H.status === "ended");
  const before = JSON.stringify(t.H.summary), ans = t.H.students.map((s) => s.answered).join();
  if (open) for (const s of A) s.emit("twAnswer", { chosen: open.cheat, startedAt: open.startedAt });
  await sleep(300);
  check(t.H.report && JSON.stringify(t.H.summary) === before && t.H.students.map((s) => s.answered).join() === ans, `ending the war shows the report, and nothing changes after it${open ? " (an answer sent after the end is ignored)" : ""}`);
  for (const s of A) s.disconnect(); t.disconnect();
}
summary();
done(fails.length ? 1 : 0);
