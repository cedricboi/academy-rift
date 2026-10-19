// Headless test of the Basic Total War game (the default): a round is ANSWER (3 questions each, +1 step a right answer),
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
import { HOME, FORTRESS, UNITS, BASIC_HIT, EXTRA_KEYS } from "./public/total-war/rules.js";

const SPEED = 20, PORT = Number(process.env.TWB_PORT) || 3206, URL = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (ok, msg) => { if (!ok) { fails.push(msg); console.log("  ✗ " + msg); } else console.log("  ✓ " + msg); };
const SAVES = mkdtempSync(join(tmpdir(), "twb-saves-"));
const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), RIFT_SPEED: String(SPEED), RIFT_TEST_CHEAT: "1", TW_SAVE_DIR: SAVES }, stdio: ["ignore", "pipe", "inherit"] });
await new Promise((res) => server.stdout.on("data", (d) => { if (String(d).includes("running")) res(); }));
const done = (code) => { server.kill(); try { rmSync(SAVES, { recursive: true, force: true }); } catch {} process.exit(code); };
setTimeout(() => { console.log("TIMEOUT"); summary(); done(1); }, 420000);
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
  check(A[0].v.units.length === t.H.units.length, "no fog in the Basic game: students see every enemy");
  // two Ogres one road from the Academy: pairs A and B go there, pair C stays home and is asked to help
  // (two, so the stars the students earn for 3 right answers do not finish them in the first question)
  t.emit("twTestSpawn", { types: ["ogre", "ogre"], node: 1 }); await sleep(100);
  t.emit("twEndTurn");
  const phases = new Set(); const watchPh = setInterval(() => phases.add(`${t.H.phase}:${t.H.stage || ""}`), 10);
  await until(() => t.H.phase === "crystal" && t.H.stage === "council", 30000);
  const answers = [...A, ...B, ...C].map((s) => s.qs.filter((q) => q.turn === 1 && q.kind === "muster").length);
  check(answers.every((n) => n === 3), `every student answered exactly 3 questions in the ANSWER step (${answers.join(", ")})`);
  check(!phases.has("crystal:quiz"), "no top-up questions after the ANSWER step: the MOVE step opens straight away");
  check(t.H.step === "move", "then the MOVE step");
  const bandA = bandOf(A[0].v);
  check(bandA.mp === 5, `all right: the pair has 5 steps (1 to start, plus up to 2 from each partner): ${bandA.mp}`);
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
  check(!s.v.myBattle && s.qs.some((q) => q.turn === 2), "the attacked pair still answers its 3 questions");
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
  check(t.H.students.every((s) => s.answered >= 3 * Math.min(rounds, 8) - 3), "every bot answered its 3 questions every round, plus its battle questions");
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
console.log("\n--- steps: each partner's answers count, and all 3 right earns a star ---");
  const t = await teacherWar({ turns: 6 });
  const S1 = student("Sam"), S2 = student("Sol");
  for (const s of [S1, S2]) await s.join(t.hs.code);
  await pairUp(S1, S2);
  S2.wrongNext = 3;                                              // Sol gets all 3 wrong
  t.emit("twStart"); await until(() => t.H.status === "playing" && t.H.phase === "crimson");
  t.emit("twTestSpawn", { types: ["rift_hound"], node: 1 }); await sleep(60);
  t.emit("twEndTurn");
  await until(() => t.H.stage === "council", 30000);
  const by = S1.stepsBy || [];
  check(by.length === 2 && by[0].name === "You" && by[0].steps === 2 && by[1].name === "Sol" && by[1].steps === 0, `each partner's steps are shown (${by.map((x) => `${x.name} +${x.steps}`).join(", ")})`);
  check(bandOf(S1.v)?.mp === 3, `the pair moves 1 + 2 + 0 = 3 steps (${bandOf(S1.v)?.mp})`);
  const res = (S1.results || []).slice(-3);
  check(res.length === 3 && res[0].step && res[1].step && res[2].step === false && res[2].star, `the first 2 right answers are steps, the third earns the star (${res.map((r) => `${r.step ? "step" : "no step"}${r.star ? "+star" : ""}`).join(", ")})`);
  check(S1.v.me.star === true && !S2.v.me.star, "only the student who got all 3 right has a star");
  for (const s of [S1, S2]) s.emit("twRoute", { route: [HOME, 1] });
  await until(() => S1.rounds.length >= 1, 30000);
  const hit = S1.rounds[0]?.hitsBy?.find((h) => h.name === "Sam");
  check(hit?.star && Math.abs(hit.dmg - 2 * BASIC_HIT) < 0.01, `the star is 1 extra hit on Sam's first right answer in the fight (${(hit?.dmg ?? 0) * 10})`);
  for (const s of [S1, S2, t]) s.disconnect();
}

if (!ONLY || ONLY === "fixes" || ONLY === "seen") {
console.log("\n--- the answer timer starts when the choices appear on the student's screen ---");
  const t = await teacherWar({ turns: 6 });
  const M = student("Max", { manual: true });
  await M.join(t.hs.code);
  t.emit("twStart"); await until(() => M.v?.own && !M.v.own.result, 15000);
  const q1 = M.v.own.question;
  // the choices show 8 seconds late on this screen: the student still gets the whole 21 seconds from then
  await sleep(((q1.recall + 8) * 1000) / SPEED); M.emit("twSeen", { startedAt: q1.startedAt });
  await sleep(((q1.seconds - 3) * 1000) / SPEED);              // 26 seconds after the choices were due
  M.emit("twAnswer", { chosen: q1.cheat, startedAt: q1.startedAt });
  await until(() => M.v.own?.result && M.v.own.question.startedAt === q1.startedAt, 3000);
  check(M.v.own?.result?.ok === true, `an answer 18 seconds after the choices appeared counts, though the choices came late (${M.v.own?.result?.ok ? "right" : M.v.own?.result?.chosen < 0 ? "time's up" : "none"})`);
  await until(() => M.v.own && !M.v.own.result && M.v.own.question.startedAt !== q1.startedAt, 15000);
  const q2 = M.v.own.question;
  await sleep(((q2.recall + q2.seconds + 2) * 1000) / SPEED);
  M.emit("twAnswer", { chosen: q2.cheat, startedAt: q2.startedAt });
  await sleep(100);
  const r2 = (M.results || []).find((r) => r.startedAt === q2.startedAt);
  check(r2 && r2.chosen < 0, "without a late screen, the question still ends 21 seconds after the choices are due");
  for (const s of [M, t]) s.disconnect();
}
summary();
done(fails.length ? 1 : 0);
