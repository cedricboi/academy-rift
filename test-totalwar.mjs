// Headless Total War test: a teacher and a class of bot students play a whole war against a real server
// running 20x faster. Checks joining and pairing, Civ-style turns, muster MP, fog of war, warband voting one
// stop at a time, battles with joining and War Cry, a jungle camp's class-wide buff, the gate, the Warlord,
// reconnecting, and that answers and hidden units never reach students.
//   node test-totalwar.mjs          (12 students)
//   node test-totalwar.mjs 30
import { spawn } from "child_process";
import { io } from "socket.io-client";
import { QUESTIONS } from "./questions.js";
import { NODES } from "./public/total-war/movement.js";
import { FORTRESS, HOME, stepTowards, visibleNodes, UNITS } from "./public/total-war/rules.js";

const N = Number(process.argv[2]) || 12;
const SPEED = 20, PORT = 3207, URL = `http://localhost:${PORT}`;
const ANSWER = new Map(QUESTIONS.map((q) => [q.q, q.answer]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (ok, msg) => { if (!ok) { fails.push(msg); console.log("  ✗ " + msg); } else console.log("  ✓ " + msg); };

const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), RIFT_SPEED: String(SPEED) }, stdio: ["ignore", "pipe", "inherit"] });
const done = (code) => { server.kill(); process.exit(code); };
setTimeout(() => { console.log("TIMEOUT"); summary(); done(1); }, 420000);
process.on("uncaughtException", (e) => { console.log("ERROR", e); done(1); });
await new Promise((res) => server.stdout.on("data", (d) => { if (String(d).includes("running")) res(); }));

// ---------- teacher ----------
const teacher = io(URL, { transports: ["websocket"] });
let host = null, hosting = null; const tErrors = [];
teacher.on("twHosting", (h) => (hosting = h));
teacher.on("twHost", (v) => (host = v));
teacher.on("twError", (m) => tErrors.push(m));
await new Promise((r) => teacher.on("connect", r));
teacher.emit("twCreate");
while (!hosting || !host) await sleep(20);
const code = hosting.code;
check(/^W[A-Z]{3}$/.test(code), `war created with code ${code}`);
teacher.emit("twSettings", { turns: 14 });

// ---------- students ----------
const bots = [];
function makeBot(i) {
  const b = { i, name: `S${i + 1}`, sock: io(URL, { transports: ["websocket"] }), state: null, me: null, errors: [], lastVote: "", answers: 0, sawAnswerKey: false };
  b.sock.on("twMe", (m) => (b.me = m));
  b.sock.on("twState", (v) => { b.state = v; const txt = JSON.stringify(v); if (/"answer"\s*:|"answers"\s*:|"full"\s*:/.test(txt.replace(/"lastHits":\{[^}]*\}/g, ""))) b.sawAnswerKey = true; act(b); });
  b.sock.on("twError", (m) => b.errors.push(m));
  return b;
}
for (let i = 0; i < N; i++) bots.push(makeBot(i));
await Promise.all(bots.map((b) => new Promise((r) => b.sock.on("connect", r))));
for (const b of bots) b.sock.emit("twJoin", { code, name: b.name });
while (bots.some((b) => !b.me || !b.state)) await sleep(20);
check(host.students?.length === N || (await sleep(200), host.students.length === N), `${N} students joined`);

// pairs: S1+S2, S3+S4 ... (the last one alone if odd)
for (let i = 0; i + 1 < N; i += 2) { bots[i].sock.emit("twPartner", { pid: bots[i + 1].me.pid }); await sleep(30); }
await sleep(200);
const chars = ["kuro", "jun", "emi", "hina", "raiden", "saya", "nao", "taiga", "mina", "renji"];
for (let i = 0; i < N; i += 2) bots[i].sock.emit("twStandard", { char: chars[(i / 2) % 10] });
await sleep(200);
check(host.pairs.length === Math.ceil(N / 2), `${host.pairs.length} pairs formed`);
check(bots[0].state.lobby.pairs.some((p) => p.names.includes("S1") && p.names.includes("S2")), "S1 and S2 are a pair");

teacher.emit("twStart");
while (host.status !== "playing") await sleep(20);
check(host.turn === 1 && host.phase === "crimson", "war starts on turn 1 with the Crimson turn");
check(host.bands.every((b) => b.node === HOME), "every banner starts at the Crystal Fortress");

// ---------- how the bots play ----------
// Group plan: pairs 1-4 form one warband and march for the fortress through the ford.
// Pair 5 (if present) heads for the Moonwell jungle camp (Moonhart Sentinel), then supports.
// The last pair stays home and only shouts War Cries.
const ROUTE = [1, 17, 18, 19, 9, FORTRESS];              // Lantern → Briar → Ford → Eastbank → Riftstone → Fortress
const CAMP_PATH = [1, 10, 11];                           // Lantern → Crescent → Moonwell
const pairIndex = (b) => Math.floor(b.i / 2);
const isLead = (b) => b.i % 2 === 0;
function wanted(b, band) {
  const pi = pairIndex(b);
  const lastPair = Math.ceil(N / 2) - 1;
  if (pi === lastPair && lastPair >= 2) return "stay";
  if (pi === 4 && !b.campDone) {
    const at = band.node; const k = [HOME, ...CAMP_PATH].indexOf(at);
    if (at === 11) { b.campDone = true; return "stay"; }
    return k >= 0 ? CAMP_PATH[k] ?? "stay" : stepTowards(at, HOME) ?? "stay";
  }
  const at = band.node; const k = [HOME, ...ROUTE].indexOf(at);
  if (k >= 0) return ROUTE[k];
  return stepTowards(at, FORTRESS, () => true) ?? "stay";
}
function act(b) {
  const v = b.state; if (!v || v.status !== "playing" || b.paused) return;
  const delay = (fn) => setTimeout(fn, 60 + Math.random() * 120);
  // answer whatever question is in front of us, mostly right
  const q = v.own && !v.own.result ? v.own.question : v.myBattle?.question && !v.myBattle.question.mine ? v.myBattle.question : null;
  if (q && b.lastQ !== q.startedAt + q.q) {
    b.lastQ = q.startedAt + q.q;
    const right = ANSWER.get(q.q);
    const pick = Math.random() < 0.82 && right != null ? right : Math.floor(Math.random() * q.choices.length);
    setTimeout(() => { b.sock.emit("twAnswer", { chosen: pick, startedAt: q.startedAt }); b.answers++; }, (q.recall * 1000) / SPEED + 40 + Math.random() * 120);
  }
  // join a battle we are offered (not the War Cry pair)
  if (v.joinable?.length && pairIndex(b) !== Math.ceil(N / 2) - 1) delay(() => b.sock.emit("twJoinBattle", { battleId: v.joinable[0].id }));
  // vote: only the lead student of each pair, once per position
  if (v.phase !== "crystal" || !isLead(b)) return;
  const band = v.bands.find((x) => x.id === v.me.bandId); if (!band || band.done || band.battle) return;
  // pairs 2-4 merge into pair 1's warband while at home
  const pi = pairIndex(b);
  if (pi >= 1 && pi <= 3 && band.pairs.length === 1) {
    const lead = v.bands.find((x) => x.pairs.some((p) => p.no === 1) && x.node === band.node && !x.battle);
    if (lead) return delay(() => b.sock.emit("twJoinBand", { bandId: lead.id }));
  }
  const key = `${v.turn}:${band.node}:${band.mp}:${band.pairs.length}`;
  if (b.lastVote === key) return;
  b.lastVote = key;
  let to = wanted(b, band);
  if (to !== "stay" && (to === FORTRESS && v.gate.broken && !v.warlord.out)) to = "stay";
  delay(() => b.sock.emit("twVote", { to }));
}

// ---------- how the teacher plays: a few units on the class's road, Auto on some turns ----------
let lastTurnPlayed = 0, sawFogHide = false, sawVoteWait = false, sawWarcry = false, sawCampBuff = false, sawGateBroken = false, sawLoss = false;
let reconnectDone = false, mpChecked = false, sawMultiStep = false;
const turnLog = [];
while (host.status === "playing") {
  await sleep(40);
  const h = host;
  if (h.phase === "crimson" && h.turn !== lastTurnPlayed) {
    lastTurnPlayed = h.turn;
    if (h.turn === 1) {
      // a Rift Hound out far east (should stay hidden), two Orcs to Riftstone Circle
      teacher.emit("twSummon", { type: "rift_hound" }); teacher.emit("twSummon", { type: "orc_vanguard" }); teacher.emit("twSummon", { type: "orc_vanguard" });
      await sleep(80);
      const [hound, o1, o2] = host.units;
      teacher.emit("twMoveUnit", { unitId: hound.id, to: 23 }); teacher.emit("twMoveUnit", { unitId: o1.id, to: 9 }); teacher.emit("twMoveUnit", { unitId: o2.id, to: 9 });
      await sleep(80);
      teacher.emit("twMoveUnit", { unitId: hound.id, to: 24 });   // into a jungle camp: refused
      await sleep(80);
      check(tErrors.some((e) => /jungle camps/.test(e)), "the Host cannot walk into a jungle camp");
      teacher.emit("twMoveUnit", { unitId: o1.id, to: 19 });       // second move is over its speed? Orcs have 2 MP: fine
      await sleep(80);
    } else if (h.turn % 3 === 0) teacher.emit("twAuto");
    else { if (h.energy >= 3) teacher.emit("twSummon", { type: "ogre" }); }
    await sleep(60);
    teacher.emit("twEndTurn");
    turnLog.push(`turn ${h.turn}: ${host.units.length} units, energy ${host.energy}`);
    if (h.turn === 6 && !host.warlordReady) teacher.emit("twRelease");
  }
  // fog: a student must never see a unit outside SIGHT of the class's banners
  for (const b of bots.slice(0, 2)) {
    const v = b.state; if (!v?.visible) continue;
    const vis = new Set(v.visible);
    if (v.units.some((u) => !vis.has(u.node))) fails.push("a hidden unit was sent to a student");
    if (host.units.length > v.units.length) sawFogHide = true;
  }
  const v0 = bots[0].state;
  if (v0?.bands?.some((b) => b.voting)) sawVoteWait = true;
  if (host.battles?.some((B) => B.cheers?.length)) sawWarcry = true;
  if (host.buffs?.some((x) => x.key === "warcry")) sawCampBuff = true;
  if (host.gate?.broken) sawGateBroken = true;
  if (host.log?.some((l) => /is lost/.test(l.text))) sawLoss = true;
  if (!mpChecked && host.phase === "crystal" && host.turn === 1) {
    mpChecked = true;
    const band = host.bands.find((b) => b.pairs.length >= 1);
    check(band.mp >= 2 && band.mp <= 6, `muster gives MP between 2 and 6 (warband has ${band.mp})`);
  }
  if (host.turn >= 2 && host.bands.some((b) => b.pairs.length >= 3 && b.node !== HOME)) sawMultiStep = true;
  // a student drops out and comes back mid-war
  if (!reconnectDone && host.turn === 3 && host.phase === "crystal") {
    reconnectDone = true;
    const b = bots[3]; const tok = b.me.token; b.paused = true; b.sock.disconnect();
    await sleep(300);
    const s2 = io(URL, { transports: ["websocket"] }); await new Promise((r) => s2.on("connect", r));
    let back = null; s2.on("twState", (v) => (back = v)); s2.emit("twRejoin", { code, token: tok });
    while (!back) await sleep(20);
    check(back.me.name === "S4" && back.me.pairNo === 2, "a student who drops out rejoins their pair");
    b.sock = s2; b.paused = false; s2.on("twState", (v) => { b.state = v; act(b); }); s2.on("twError", (m) => b.errors.push(m));
  }
  if (host.turn > 14) break;
}

// ---------- results ----------
console.log("\n" + turnLog.join("\n"));
check(sawFogHide, "fog of war hides Crimson units the class cannot see");
check(sawVoteWait || N <= 2, "a warband waits for its pairs' votes before stepping");
check(sawMultiStep, "the warband marched off from the fortress one stop at a time");
check(sawWarcry, "the pair at home sent War Cries into a battle");
if (N >= 10) check(sawCampBuff, "beating the Moonhart Sentinel gave the whole class its buff");
check(sawGateBroken, "the class broke the gate of the Crimson Fortress");
check(host.status === "ended", `the war ended (winner: ${host.winner})`);
check(host.winner === "crystal", "the class beat the Crimson Warlord");
check(bots.every((b) => !b.sawAnswerKey), "no answer key ever reached a student");
const counts = host.students.map((s) => s.answered);
check(Math.min(...counts) >= 15, `every student answered plenty of questions (fewest ${Math.min(...counts)}, most ${Math.max(...counts)})`);
console.log(`  battle lost at least once: ${sawLoss}`);
const unexpected = bots.flatMap((b) => b.errors).filter((e) => !/finished moving|not your turn|Wait for your turn|too far|Too late|in a battle|already|same stop|is not here|battle is on/i.test(e));
check(!unexpected.length, `no unexpected errors for students${unexpected.length ? ": " + [...new Set(unexpected)].slice(0, 4).join(" | ") : ""}`);
summary();
done(fails.length ? 1 : 0);
function summary() { console.log(`\n${fails.length ? "FAILED: " + fails.length : "ALL PASSED"}`); }
