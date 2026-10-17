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
const SPEED = 20, PORT = 3215, URL = `http://localhost:${PORT}`;
const ANSWER = new Map(QUESTIONS.map((q) => [q.q, q.answer]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (ok, msg) => { if (!ok) { fails.push(msg); console.log("  ✗ " + msg); } else console.log("  ✓ " + msg); };

const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), RIFT_SPEED: String(SPEED), RIFT_TEST_CHEAT: "1" }, stdio: ["ignore", "pipe", "inherit"] });
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
  b.sock.on("twState", (v) => { b.state = v; watch(b, v); act(b); });
  b.sock.on("twError", (m) => b.errors.push(m));
  return b;
}
// what the bots notice: answer keys (never allowed while a question is open), their battle roles, the Crimson hitting back
const seen = { striker: 0, support: 0, counter: 0, steal: 0, defend: 0 };
function watch(b, v) {
  const txt = JSON.stringify(v, (k, val) => (k === "round" ? undefined : val));      // a round is the reveal, after the question
  if (/"answer"\s*:|"answers"\s*:|"full"\s*:/.test(txt)) b.sawAnswerKey = true;
  const B = v.myBattle; if (!B) return;
  if (B.status === "fight" && B.role) seen[B.role]++;
  if (B.round?.counterTotal > 0) seen.counter++;
  if (B.round?.stealer) seen.steal++;
  if (B.kind === "defend") seen.defend++;
}
for (let i = 0; i < N; i++) bots.push(makeBot(i));
await Promise.all(bots.map((b) => new Promise((r) => b.sock.on("connect", r))));
for (const b of bots) b.sock.emit("twJoin", { code, name: b.name });
while (bots.some((b) => !b.me || !b.state)) await sleep(20);
check(host.students?.length === N || (await sleep(200), host.students.length === N), `${N} students joined`);

// pairs: S1+S2, S3+S4 ... (the last one alone if odd)
for (let i = 0; i + 1 < N; i += 2) { bots[i].sock.emit("twPartner", { pid: bots[i + 1].me.pid }); await sleep(30); bots[i + 1].sock.emit("twPartner", { pid: bots[i].me.pid }); await sleep(30); }
await sleep(200);
const chars = ["kuro", "jun", "emi", "hina", "raiden", "saya", "nao", "taiga", "mina", "renji"];
for (let i = 0; i < N; i += 2) bots[i].sock.emit("twStandard", { char: chars[(i / 2) % 10] });
await sleep(200);
check(host.pairs.length === Math.ceil(N / 2), `${host.pairs.length} pairs formed`);
check(bots[0].state.lobby.pairs.some((p) => p.names.includes("S1") && p.names.includes("S2")), "S1 and S2 are a pair");

teacher.emit("twStart");
while (host.status !== "playing") await sleep(20);
check(host.turn === 1 && host.phase === "crimson", "war starts on turn 1 with the Crimson turn");
check(host.phaseEndsAt - Date.now() <= 30000 / SPEED + 500, "the class prepares for at most 30 seconds before its move");
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
    } else if (h.turn === 2) {
      // a Wyvern sent to hunt: it should find a Crystal banner and attack it by itself
      teacher.emit("twSummon", { type: "wyvern" }); await sleep(80);
      const wy = host.units.find((u) => u.type === "wyvern");
      if (wy) teacher.emit("twOrder", { unitIds: [wy.id], order: { kind: "hunt" } });
      const hound = host.units.find((u) => u.type === "rift_hound");
      if (hound) teacher.emit("twOrder", { unitIds: [hound.id], order: { kind: "march", to: 21 } });
      await sleep(80);
      check(host.units.find((u) => u.type === "wyvern")?.order?.kind === "hunt", "the teacher can give a unit a standing order");
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
    check(band.mp >= 1 && band.mp <= 5, `preparing gives between 1 and 5 AP (warband has ${band.mp})`);
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
check(seen.striker > 0 && seen.support > 0, `battles have a Striker and supporters (${seen.striker} / ${seen.support} sightings)`);
check(seen.counter > 0, "the Crimson hits back in battle");
check(seen.defend > 0, "the Crimson Host attacked a Crystal banner by itself (a hunt order)");
console.log(`  stolen strikes seen: ${seen.steal}`);
const counts = host.students.map((s) => s.answered);
check(Math.min(...counts) >= 15, `every student answered plenty of questions (fewest ${Math.min(...counts)}, most ${Math.max(...counts)})`);
console.log(`  battle lost at least once: ${sawLoss}`);
const unexpected = bots.flatMap((b) => b.errors).filter((e) => !/one stop at a time|battle is being fought|finished moving|not your turn|Wait for your turn|too far|Too late|in a battle|already|same stop|is not here|battle is on/i.test(e));
check(!unexpected.length, `no unexpected errors for students${unexpected.length ? ": " + [...new Set(unexpected)].slice(0, 4).join(" | ") : ""}`);
await wardWar();
await practiceWar();
await featureWar();
summary();
done(fails.length ? 1 : 0);

// A second, small war: one pair wanders off and the Crimson Host marches on the empty Academy and breaks its Ward.
async function wardWar() {
  const t = io(URL, { transports: ["websocket"] }); let H2 = null, hs = null;
  t.on("twHosting", (h) => (hs = h)); t.on("twHost", (v) => (H2 = v));
  await new Promise((r) => t.on("connect", r)); t.emit("twCreate");
  while (!hs || !H2) await sleep(20);
  t.emit("twSettings", { turns: 30 });
  const s = io(URL, { transports: ["websocket"] }); let st = null;
  s.on("twState", (v) => { st = v;
    const q = v.own && !v.own.result ? v.own.question : v.myBattle?.question && !v.myBattle.question.mine ? v.myBattle.question : null;
    if (q && s.lastQ !== q.startedAt) { s.lastQ = q.startedAt; setTimeout(() => s.emit("twAnswer", { chosen: ANSWER.get(q.q) ?? q.cheat ?? 0, startedAt: q.startedAt }), (q.recall * 1000) / SPEED + 30); }
    const band = v.bands?.find((x) => x.id === v.me.bandId);
    if (v.phase === "crystal" && band?.done && !v.me.orderDone && s.ordered !== v.turn) { s.ordered = v.turn; s.emit("twOrderDone"); }
    if (v.phase === "crystal" && band && !band.done && !band.battle) { const key = `${v.turn}:${band.node}`; if (s.lastKey !== key) { s.lastKey = key; s.emit("twVote", { to: ({ [HOME]: 1, 1: 10, 10: 12 })[band.node] ?? "stay" }); } }
  });
  await new Promise((r) => s.on("connect", r)); s.emit("twJoin", { code: hs.code, name: "Lone" });
  while (!st) await sleep(20);
  s.emit("twStandard", { char: "jun" }); await sleep(100);
  t.emit("twStart");
  let lastT = 0, ordered = false;
  const until = Date.now() + 220000;
  while (H2.status !== "ended" && Date.now() < until) {
    await sleep(40);
    if (H2.phase === "crimson" && H2.turn !== lastT) {
      lastT = H2.turn;
      while (H2.energy >= 1 && H2.units.filter((u) => u.node === FORTRESS).length < 6) { const before = H2.energy; t.emit("twSummon", { type: H2.energy >= 3 ? "ogre" : "goblin_sappers" }); await sleep(60); if (H2.energy === before) break; }
      const free = H2.units.filter((u) => !u.order).map((u) => u.id);
      if (free.length) t.emit("twOrder", { unitIds: free, order: { kind: "march", to: HOME } });
      ordered = ordered || free.length > 0;
      await sleep(60); t.emit("twEndTurn");
    }
  }
  check(ordered && H2.units.some((u) => u.order?.kind === "march" || u.node === HOME), "march orders move units across the map by themselves");
  check(H2.ward.hp < H2.ward.max, `the Crimson Host battered the Academy Ward (${H2.ward.hp}/${H2.ward.max})`);
  check(H2.status === "ended" && H2.winner === "crimson" && H2.endedBy === "ward", `breaking the Academy Ward wins the war for the Crimson Host (turn ${H2.turn}, ${H2.status}, ${H2.winner}, ${H2.endedBy}, ward ${H2.ward.hp})`);
  s.disconnect(); t.disconnect();
}
// A practice war: one student against the Bot Commander, with bot pairs and a bot partner. Checks skills,
// items bought from Auntie with coins, and that the bot teacher plays its own turns.
async function practiceWar() {
  console.log("\n--- practice war (bot teacher, bot students, skills, Auntie) ---");
  const s = io(URL, { transports: ["websocket"] }); let v = null; const errs = []; const kinds = new Set(); let maxBands = 0, rideSeen = new Set(), bought = false, crimsonTurns = 0, lastTurn = 0, usedItem = false;
  s.on("twError", (m) => errs.push(m));
  s.on("twState", (x) => {
    v = x; if (x.status !== "playing") return; maxBands = Math.max(maxBands, x.bands?.length || 0); for (const r of x.riders || []) if (r.pid === x.me.pid) rideSeen.add(r.status);
    if (x.phase === "crystal" && x.turn !== lastTurn) { lastTurn = x.turn; if (x.turn > 1) crimsonTurns++; }
    const B = x.myBattle;
    if (B?.round?.action) kinds.add(B.round.action.kind);
    const q = x.own && !x.own.result ? x.own.question : B?.question && !B.question.mine ? B.question : null;
    if (q && s.lastQ !== q.startedAt) { s.lastQ = q.startedAt; setTimeout(() => s.emit("twAnswer", { chosen: ANSWER.get(q.q) ?? q.cheat ?? 0, startedAt: q.startedAt }), (q.recall * 1000) / SPEED + 30); }
    if (B?.moves && s.lastMove !== B.choose?.endsAt) {
      s.lastMove = B.choose?.endsAt; const M = B.moves, ok = M.skills.filter((k) => k.ok);
      const act = M.items.length && !usedItem ? (usedItem = true, { kind: "item", item: M.items[0].id }) : M.ult.ready ? { kind: "ult" } : ok.length ? { kind: "skill", index: ok[0].i } : { kind: "strike" };
      s.emit("twAction", act);
    }
    const myB = x.bands?.find((b) => b.id === x.me.bandId);
    if (x.phase === "crimson" && !s.triedEarly) { s.triedEarly = true; s.emit("twBuy", { item: "bento" }); }
    if (!B && !bought && x.me.coins >= 100 && x.phase === "crystal" && myB?.done && !myB.battle) { bought = true; s.emit("twGrab", { items: { energy: 1 } }); }
    const band = x.bands?.find((b) => b.id === x.me.bandId);
    if (x.phase === "crystal" && band && !band.done && !band.battle) { const key = `${x.turn}:${band.node}`; if (s.lastKey !== key) { s.lastKey = key; const to = stepTowards(band.node, FORTRESS); s.emit("twVote", { to: bought ? to ?? "stay" : "stay" }); } }
  });
  await new Promise((r) => s.on("connect", r));
  s.emit("twPractice", { name: "Solo", char: "jun" });
  const until = Date.now() + 160000;
  while (Date.now() < until && !(v?.status === "ended" || (kinds.has("skill") && usedItem && kinds.size >= 2 && crimsonTurns >= 3))) await sleep(50);
  check(v && v.status !== "lobby", "a practice war starts straight away with one student");
  check(maxBands >= 3, `the practice war fills up with bot pairs (${maxBands} banners)`);
  check(crimsonTurns >= 2 || v?.status === "ended", `the Bot Commander plays its own turns (${crimsonTurns})`);
  check(kinds.has("skill"), `students can use their Academy Rift skills in battle (moves seen: ${[...kinds].join(", ")})`);
  console.log(`  coins at the end: ${v.me.coins}, turn ${v.turn}, status ${v.status}`);
  check(bought && v.me.bag && (v.me.bag.energy > 0 || usedItem), "coins buy food from Grab-Ma's delivery");
  check(rideSeen.has("cooking") && rideSeen.has("delivered"), `Grab-Ma cooks the order and rides it out to the banner (${[...rideSeen].join(" → ")})`);
  check(usedItem && kinds.has("item"), "an item from the bag can be used on your turn in battle");
  check(errs.some((e) => /Lock in your move first/.test(e)), "Grab-Ma only delivers once your move is locked in");
  const odd = errs.filter((e) => !/one stop at a time|battle|finished moving|not your turn|Too late|already|same stop|in a battle|Lock in your move/i.test(e));
  check(!odd.length, `no unexpected errors in the practice war${odd.length ? ": " + odd.slice(0, 3).join(" | ") : ""}`);
  s.disconnect();
}
// Teleport, ambush, the watchtower, enemy waves and picking a target while the battle gathers.
async function featureWar() {
  console.log("\n--- teleport, ambush, watchtower, waves, targets ---");
  const t = io(URL, { transports: ["websocket"] }); let H = null, hs = null; const terr = [];
  t.on("twHosting", (h) => (hs = h)); t.on("twHost", (v) => (H = v)); t.on("twError", (m) => terr.push(m));
  await new Promise((r) => t.on("connect", r)); t.emit("twCreate");
  while (!hs || !H) await sleep(20);
  t.emit("twSettings", { botPartners: false, turns: 6 });
  const mk = (name, char, plan) => {
    const s = io(URL, { transports: ["websocket"] }); s.v = null; s.errs = [];
    s.on("twError", (m) => s.errs.push(m));
    s.on("twState", (v) => {
      s.v = v; if (v.status !== "playing") return;
      const B = v.myBattle;
      const q = v.own && !v.own.result ? v.own.question : B?.question && !B.question.mine ? B.question : null;
      if (q && s.lastQ !== q.startedAt) { s.lastQ = q.startedAt; setTimeout(() => s.emit("twAnswer", { chosen: q.cheat ?? 0, startedAt: q.startedAt }), (q.recall * 1000) / SPEED + 30); }
      if (B?.status === "gather" && B.me?.target == null && !s.picked) { s.picked = true; s.emit("twTarget", { index: 0 }); }
      if (B?.moves && s.lastMove !== B.choose?.endsAt) { s.lastMove = B.choose?.endsAt; s.emit("twAction", { kind: "strike" }); }
      const band = v.bands?.find((b) => b.id === v.me.bandId);
      if (v.phase === "crystal" && band && !band.done && !band.battle) {
        const key = `${v.turn}:${band.node}`; if (s.lastKey === key) return; s.lastKey = key;
        const to = plan[band.node]; s.emit("twVote", { to: to ?? "stay" });
      }
      if (v.phase === "crystal" && band?.done && !v.me.orderDone && s.od !== v.turn) { s.od = v.turn; s.emit("twOrderDone"); }
    });
    return s;
  };
  const ana = mk("Ana", "jun", { 0: 1, 1: 10, 10: 2 }), ben = mk("Ben", "saya", { 0: 14 });
  await Promise.all([ana, ben].map((s) => new Promise((r) => s.on("connect", r))));
  ana.emit("twJoin", { code: hs.code, name: "Ana" }); ben.emit("twJoin", { code: hs.code, name: "Ben" });
  while (!ana.v || !ben.v) await sleep(20);
  ana.emit("twStandard", { char: "jun" }); ben.emit("twStandard", { char: "saya" }); await sleep(150);
  t.emit("twStart");
  while (H.status !== "playing" || H.phase !== "crimson") await sleep(20);
  // a Rift Hound teleported next to the Academy and hidden in ambush; another sent east, out of sight
  t.emit("twSummon", { type: "rift_hound" }); await sleep(100);
  const a = H.units.at(-1);
  t.emit("twTeleport", { unitId: a.id, to: 14 }); await sleep(100);
  t.emit("twOrder", { unitIds: [a.id], order: { kind: "ambush" } }); await sleep(100);
  t.emit("twSummon", { type: "rift_hound" }); await sleep(100);
  const b = H.units.find((u) => u.id !== a.id && u.type === "rift_hound");
  t.emit("twMoveUnit", { unitId: b.id, to: 9 }); await sleep(100);
  const A = H.units.find((u) => u.id === a.id);
  check(A?.node === 14 && A.ambush, `the teacher teleports a unit and hides it in ambush (at ${NODES[A?.node]?.name}, energy left ${H.energy})`);
  await sleep(150);
  check(!ana.v.units.some((u) => u.id === a.id), "an ambush cannot be seen by the class, even next to the Academy");
  check(!ana.v.units.some((u) => u.id === b.id), "a unit far away is hidden by the fog");
  t.emit("twEndTurn");
  // Ben walks into the ambush; Ana climbs to the watchtower
  const until = Date.now() + 90000;
  let sawAmbush = false, sawTarget = false, sawWave = false, sawTower = false, maxWave = 0;
  while (Date.now() < until && !(sawAmbush && sawTower && sawWave)) {
    await sleep(40);
    const B = ben.v?.myBattle;
    if (B?.ambush && B.status !== "gather" && B.resolve < B.resolveMax) sawAmbush = true;
    if (B?.me?.target === 0) sawTarget = true;
    if (B && B.status !== "gather") { const w = B.enemies.filter((e) => e.wave).length; maxWave = Math.max(maxWave, w); if (w >= 1) sawWave = true; }
    if (ana.v?.tower?.held && ana.v.units.some((u) => u.id === b.id)) sawTower = true;
  }
  check(sawAmbush, "walking into an ambush starts a battle with the warband already hurt");
  check(sawTarget, "a pair picks which enemy to target while the battle gathers");
  check(sawWave && maxWave <= 2, `enemies come in waves of one or two (largest wave ${maxWave})`);
  check(sawTower, "holding the watchtower shows the class the Crimson Host beyond the fog");
  check(!terr.length, `no errors for the teacher${terr.length ? ": " + terr.slice(0, 3).join(" | ") : ""}`);
  for (const s of [ana, ben, t]) s.disconnect();
}
function summary() { console.log(`\n${fails.length ? "FAILED: " + fails.length : "ALL PASSED"}`); }
