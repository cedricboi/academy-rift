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
  t.on("twHosting", (h) => (t.hs = h)); t.on("twHost", (v) => (t.H = v)); t.on("twError", (m) => t.errs.push(m));
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
    s.v = v; if (v.status !== "playing") return;
    const B = v.myBattle;
    const q = v.own && !v.own.result ? v.own.question : B?.question && !B.question.mine ? B.question : null;
    if (q && s.lastQ !== q.startedAt) {
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
  // an Ogre one road from the Academy: pairs A and B go there, pair C stays home and is asked to help
  t.emit("twTestSpawn", { types: ["ogre"], node: 1 }); await sleep(100);
  t.emit("twEndTurn");
  const phases = new Set(); const watchPh = setInterval(() => phases.add(`${t.H.phase}:${t.H.stage || ""}`), 10);
  await until(() => t.H.phase === "crystal" && t.H.stage === "council", 30000);
  const answers = [...A, ...B, ...C].map((s) => s.qs.filter((q) => q.turn === 1 && q.kind === "muster").length);
  check(answers.every((n) => n === 3), `every student answered exactly 3 questions in the ANSWER step (${answers.join(", ")})`);
  check(!phases.has("crystal:quiz"), "no top-up questions after the ANSWER step: the MOVE step opens straight away");
  check(t.H.step === "move", "then the MOVE step");
  const bandA = bandOf(A[0].v);
  check(bandA.mp === 4, `all right: the pair has 4 steps (1 plus a step for each right answer, the most is 4): ${bandA.mp}`);
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
  check(/The monster was too strong\. Your pair goes back to the Academy to regroup\./.test(note?.text || ""), `a battle the monster survives: "${note?.text}"`);
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
summary();
done(fails.length ? 1 : 0);
