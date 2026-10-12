// Headless class-tournament test: a teacher and 30 students play a full
// tournament (3 rounds, then a 4th added after the end) against a real
// server running 20x faster than normal.
//   node test-tournament.mjs            (30 students)
//   node test-tournament.mjs 29         (any class size)
// Checks pairing, matchmaking, the leftover pair, repeat opponents, time limits,
// a student dropping out mid-battle and coming back, and the final standings.
import { spawn } from "child_process";
import { io } from "socket.io-client";
import { QUESTIONS } from "./questions.js";

const N = Number(process.argv[2]) || 30;
const SPEED = 20, PORT = 3201, URL = `http://localhost:${PORT}`;
const ANSWER = new Map(QUESTIONS.map((q) => [q.q, q.answer]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (ok, msg) => { if (!ok) { fails.push(msg); console.log("  ✗ " + msg); } };

const server = spawn(process.execPath, ["server.js"], {
  env: { ...process.env, PORT: String(PORT), RIFT_SPEED: String(SPEED) }, stdio: ["ignore", "pipe", "inherit"],
});
const done = (code) => { server.kill(); process.exit(code); };
setTimeout(() => { console.log("TIMEOUT"); done(1); }, 300000);
process.on("SIGTERM", () => done(1));
process.on("uncaughtException", (e) => { console.log("ERROR", e); done(1); });
process.on("SIGINT", () => done(1));
await new Promise((res, rej) => {
  server.stdout.on("data", (d) => { if (String(d).includes("running")) res(); });
  server.on("exit", (c) => { console.log(`Server stopped (exit ${c}). Is port ${PORT} already in use?`); process.exit(1); });
});

// ---------- teacher ----------
const teacher = io(URL, { transports: ["websocket"] });
let host = null, code = null;
const errors = [];
teacher.on("tHost", (v) => (host = v));
teacher.on("tError", (m) => errors.push(m));
await new Promise((r) => teacher.on("connect", r));
teacher.emit("tCreate");
let hostTokenSaved = null;
code = await new Promise((r) => teacher.once("tHostJoined", (d) => { hostTokenSaved = d.hostToken; r(d.code); }));
console.log(`Tournament ${code} created, ${N} students joining…`);
const set = (key, value) => teacher.emit("tSetting", { key, value });
set("rounds", 3); set("timeLimitMin", 4); set("matching", "swiss"); set("oddPair", "bots");
set("avoidRepeats", true); set("pairing", "students"); set("topicId", "parts");
set("rounds", "banana");   // invalid value must be ignored
await sleep(300);
check(host.settings.rounds === 3 && host.settings.timeLimitMin === 4 && host.settings.topicId === "parts", "settings applied");

// ---------- students ----------
const stealsSeen = {};
let currentRound = 0;
function makeStudent(name, i) {
  const st = { name, i, s: null, pid: null, token: null, view: null, room: null, battles: 0, ended: 0 };
  st.connect = () => new Promise((res) => {
    const s = io(URL, { transports: ["websocket"], forceNew: true });
    st.s = s;
    s.on("tJoined", (d) => { st.pid = d.you; st.token = d.token; st.name = d.name; res(); });
    s.on("tState", (v) => (st.view = v));
    s.on("room", (r) => (st.room = r));
    s.on("battleStart", () => st.battles++);
    s.on("battleEnd", () => st.ended++);
    s.on("yourQuestion", ({ question }) => {
      const a = ANSWER.get(question.q);
      const pick = Math.random() < 0.65 ? a : (a + 1) % 4;
      setTimeout(() => s.emit("answer", { choiceIndex: pick }), 5000 / SPEED);
    });
    s.on("stealOpen", ({ originalUid }) => {
      stealsSeen[currentRound] = (stealsSeen[currentRound] || 0) + 1;
      if (originalUid === st.pid || Math.random() < 0.6) return;
      const q = st.room?.battle?.question; if (!q) return;
      const a = ANSWER.get(q.q);
      setTimeout(() => s.emit("steal", { choiceIndex: Math.random() < 0.5 ? a : (a + 2) % 4 }), 3000 / SPEED);
    });
    s.on("chooseAction", ({ correct }) => {
      const b = st.room?.battle; const me = st.room?.players.find((p) => p.id === st.pid);
      const foe = b?.combatants.find((c) => c.team !== me?.team && c.alive);
      const act = correct ? { type: "strike", targetId: foe?.uid } : { type: "defend" };
      setTimeout(() => s.emit("action", act), 2500 / SPEED);
    });
    s.on("connect", () => {
      if (st.token) s.emit("tRejoin", { code, token: st.token });
      else s.emit("joinRoom", { code, name });
    });
  });
  return st;
}

// two students type the same name to check names are kept unique
const names = Array.from({ length: N }, (_, i) => (i === 1 ? "Student 1" : `Student ${i + 1}`));
const students = names.map(makeStudent);
await Promise.all(students.map((st) => st.connect()));
await sleep(400);
check(host.students.length === N, `all ${N} students listed (got ${host.students.length})`);
check(new Set(host.students.map((s) => s.name.toLowerCase())).size === N, "student names are unique");

// most students pick each other; 4 students do not finish pairing up
const choosers = students.slice(0, N - 4);
for (let i = 0; i + 1 < choosers.length; i += 2) {
  choosers[i].s.emit("tChoosePartner", { pid: choosers[i + 1].pid });
  choosers[i + 1].s.emit("tChoosePartner", { pid: choosers[i].pid });
}
students[N - 4].s.emit("tChoosePartner", { pid: students[N - 3].pid });   // one-sided choice
students.forEach((st, i) => i % 3 === 0 && st.s.emit("tPickFighter", { charId: ["jun", "saya", "raiden", "nao", "emi"][i % 5] }));
await sleep(400);
const paired = host.students.filter((s) => s.pairId).length;
check(paired === 2 * Math.floor((N - 4) / 2), `mutual choices became pairs (${paired} paired)`);
check(students[N - 3].view.classmates.find((c) => c.pid === students[N - 4].pid)?.wantsYou === true, "a student sees who picked them");

// ---------- rounds ----------
const roundLog = [];
let late = null;
for (let r = 1; r <= 4; r++) {
  if (r === 2) set("stealSeconds", 0);          // steals off for round 2 only
  if (r === 3) set("stealSeconds", 10);
  if (r === 4) {
    check(host.status === "finished", "finished after round 3");
    set("rounds", 4);                            // teacher adds a round after the end
    await sleep(300);
    check(host.status === "between", "adding a round reopens the tournament");
  }
  await sleep(200);
  const t0 = Date.now();
  currentRound = r;
  teacher.emit("tStartRound");
  await sleep(500);
  check(host.status === "round" && host.round === r, `round ${r} started (status ${host.status})`);
  const pairsThisRound = host.standings.length;
  if (r === 2) {
    // the teacher's page reloads mid-round and takes control back
    const saved = { code, hostToken: hostTokenSaved };
    teacher.disconnect();
    await sleep(500);
    teacher.connect();
    await new Promise((res) => teacher.once("connect", res));
    teacher.emit("tResume", saved);
    await new Promise((res) => teacher.once("tHostJoined", res));
    await sleep(300);
    check(host.status === "round", "teacher page reconnected during a round");
    // a student arrives late, during round 2
    late = makeStudent("Latecomer", N);
    await late.connect();
    await sleep(400);
    check(late.view?.status === "round" && !late.view?.myMatches.length, "late student waits for the next round");
  }
  if (r === 1) {
    set("pairing", "random");   // must be refused after the start
    await sleep(200);
    check(errors.some((e) => e.includes("before Round 1")), "pairing setting locked after start");
    // a student's iPad drops out mid-battle and comes back
    const st = students[Math.min(5, N - 1)];
    await sleep(3000);
    st.s.disconnect();
    await sleep(2500);
    const before = st.battles;
    st.s.connect();
    await sleep(1500);
    check(st.battles > before && st.room?.status === "battle", "reconnecting student is put back into their battle");
    const seat = st.room?.battle?.combatants.find((c) => c.uid === st.pid);
    check(seat && seat.bot === false, "reconnecting student takes their seat back from the bot");
  }
  while (host.status === "round") await sleep(300);
  const ms = Date.now() - t0;
  const matches = host.matches.filter((m) => m.round === r);
  roundLog.push({ r, ms, matches, pairsThisRound });
  console.log(`  round ${r}: ${matches.length} battles, ~${((ms * SPEED) / 60000).toFixed(1)} min real-time equivalent, ` +
    `${matches.filter((m) => m.result?.reason === "time").length} decided on time`);
}

// ---------- checks ----------
const pairs = host.standings;
const everyone = pairs.flatMap((p) => p.members.filter((m) => !m.bot).map((m) => m.pid));
check(new Set(everyone).size === N + 1 && everyone.length === N + 1, "every student (and the latecomer) is in exactly one pair");
for (const { r, matches, pairsThisRound } of roundLog) {
  const ids = matches.flatMap((m) => [m.a.pairId, m.b.pairId]).filter(Boolean);
  check(new Set(ids).size === ids.length, `round ${r}: no pair plays twice`);
  check(ids.length === pairsThisRound, `round ${r}: every pair plays (${ids.length}/${pairsThisRound})`);
  check(matches.filter((m) => !m.b.pairId).length === (pairsThisRound % 2), `round ${r}: one bot battle when pairs are odd`);
  check(matches.every((m) => m.status === "done" && m.result), `round ${r}: all battles finished`);
  check(matches.every((m) => m.result.reason === "ko" || m.result.reason === "time"), `round ${r}: results have a reason`);
}
const meetings = roundLog.flatMap(({ matches }) => matches.filter((m) => m.b.pairId).map((m) => [m.a.pairId, m.b.pairId].sort().join("-")));
// with only a handful of pairs, meeting again is unavoidable after a few rounds
if (pairs.length >= 2 * roundLog.length) check(new Set(meetings).size === meetings.length, "no two pairs met twice");
const botPairs = roundLog.map(({ matches }) => matches.find((m) => !m.b.pairId)?.a.pairId).filter(Boolean);
check(new Set(botPairs).size === botPairs.length, "a different pair fights the bots each round");
const latePair = pairs.find((p) => p.members.some((m) => m.pid === late.pid));
check(latePair && latePair.played === 2, `late student played rounds 3 and 4 (played ${latePair?.played})`);
check(pairs.filter((p) => p !== latePair).every((p) => p.played === 4), "every other pair played 4 battles");
check(!stealsSeen[2], `no steal windows while steals were off (saw ${stealsSeen[2] || 0})`);
check(stealsSeen[1] > 0 && stealsSeen[3] > 0, "steal windows open when steals are on");
check(pairs.every((p) => p.points === p.wins * 3 + p.draws), "points = 3 per win + 1 per draw");
for (let i = 1; i < pairs.length; i++) {
  const a = pairs[i - 1], b = pairs[i];
  check(a.points > b.points || (a.points === b.points && (a.correct > b.correct || (a.correct === b.correct && a.hpPct >= b.hpPct))),
    `standings ordered at ${i}`);
}
check(host.status === "finished", "tournament finished after the last round");
await sleep(300);
check(students.every((st) => st.view?.status === "finished" && st.view?.standings?.length === pairs.length), "students see the final standings");
check(students.every((st) => st.ended >= 4), "every student saw 4 battle endings");

console.log("\nFinal top 3:");
pairs.slice(0, 3).forEach((p) => console.log(`  ${p.rank}. ${p.name}  ${p.points} pts  (${p.wins}W ${p.draws}D ${p.losses}L, ${p.correct} correct)`));
console.log(fails.length ? `\nFAIL: ${fails.length} check(s) failed` : `\nPASS: ${N}-student tournament ran 4 rounds to the end.`);
done(fails.length ? 1 : 0);
