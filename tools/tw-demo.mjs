// A Total War demo: creates a war on a running server, fills it with bot students who play, and lets
// real browsers join too (a student at /total-war/?code=..., the teacher at /total-war/command.html).
//   node tools/tw-demo.mjs [url] [bots] [--auto-teacher] [--start-after=seconds]
// The war starts once every real student has tapped I'M READY, or after --start-after seconds.
import { io } from "socket.io-client";
import { writeFileSync } from "fs";
import { QUESTIONS } from "../questions.js";
import { FORTRESS, HOME, stepTowards } from "../public/total-war/rules.js";

const URL = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "http://localhost:3100";
const BOTS = Number(process.argv.find((a) => /^\d+$/.test(a)) || 10);
const autoTeacher = process.argv.includes("--auto-teacher");
const startAfter = Number((process.argv.find((a) => a.startsWith("--start-after=")) || "=0").split("=")[1]) || 0;
const ANSWER = new Map(QUESTIONS.map((q) => [q.q, q.answer]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const joinCode = (process.argv.find((a) => a.startsWith("--code=")) || "").split("=")[1] || null;
const teacher = io(URL, { transports: ["websocket"] });
let host = null, hosting = null;
teacher.on("twHosting", (h) => (hosting = h));
teacher.on("twHost", (v) => (host = v));
teacher.on("twError", (m) => console.log("teacher:", m));
await new Promise((r) => teacher.on("connect", r));
if (joinCode) hosting = { code: joinCode }; else teacher.emit("twCreate");
while (!hosting) await sleep(20);
writeFileSync("/tmp/tw-demo.json", JSON.stringify(hosting));
console.log(`WAR ${hosting.code} host ${hosting.hostToken}`);

const names = ["Aiden", "Bella", "Chloe", "Darius", "Elena", "Farhan", "Grace", "Haziq", "Isla", "Jayden", "Kai", "Lina", "Marcus", "Nadia", "Omar", "Priya", "Qi", "Ryan", "Sofia", "Tariq"];
const chars = ["jun", "emi", "hina", "raiden", "saya", "nao", "taiga", "mina", "renji", "kuro"];
const bots = [];
for (let i = 0; i < BOTS; i++) {
  const b = { i, sock: io(URL, { transports: ["websocket"] }), me: null, state: null, lastQ: "", lastVote: "" };
  b.sock.on("twMe", (m) => (b.me = m));
  b.sock.on("twState", (v) => { b.state = v; act(b); });
  bots.push(b);
}
await Promise.all(bots.map((b) => new Promise((r) => b.sock.on("connect", r))));
for (const b of bots) b.sock.emit("twJoin", { code: hosting.code, name: names[b.i % names.length] });
while (bots.some((b) => !b.me)) await sleep(20);
for (let i = 0; i + 1 < BOTS; i += 2) { bots[i].sock.emit("twPartner", { pid: bots[i + 1].me.pid }); await sleep(40); bots[i + 1].sock.emit("twPartner", { pid: bots[i].me.pid }); await sleep(40); }
await sleep(200);
for (let i = 0; i < BOTS; i += 2) bots[i].sock.emit("twStandard", { char: chars[(i / 2) % chars.length] });

const t0 = Date.now();
while (!joinCode) {
  await sleep(250);
  const humans = (host?.students || []).filter((s) => !bots.some((b) => b.me.pid === s.pid));
  const ready = humans.length && humans.every((h) => h.ready);     // the war starts once every real student taps I'M READY
  if (ready || (startAfter && Date.now() - t0 > startAfter * 1000)) break;
}
await sleep(500);
if (!joinCode) { teacher.emit("twStart"); console.log("started"); }

// targets: bots march towards the fortress in two groups, one detours to the Windspire camp
const ROUTES = [[1, 10, 2, 3, 4, 25, FORTRESS], [1, 17, 18, 19, 9, FORTRESS], [1, 10, 2, 13]];
function act(b) {
  const v = b.state; if (!v || v.status !== "playing") return;
  const q = v.own && !v.own.result ? v.own.question : v.myBattle?.question && !v.myBattle.question.mine ? v.myBattle.question : null;
  if (q && b.lastQ !== q.startedAt + q.q) {
    b.lastQ = q.startedAt + q.q;
    const right = ANSWER.get(q.q), pick = Math.random() < 0.75 && right != null ? right : Math.floor(Math.random() * q.choices.length);
    setTimeout(() => b.sock.emit("twAnswer", { chosen: pick, startedAt: q.startedAt }), ((q.recall + 3 + Math.random() * 8) * 1000) / (v.speed || 1));
  }
  if (v.joinable?.length && Math.random() < 0.6) setTimeout(() => b.sock.emit("twJoinBattle", { battleId: v.joinable[0].id }), 1500);
  if (v.phase !== "crystal" || b.i % 2) return;
  const band = v.bands.find((x) => x.id === v.me.bandId); if (!band || band.done || band.battle) return;
  // pairs 2 and 3 join pair 1's warband while they share a stop
  if ((b.i === 2 || b.i === 4) && band.pairs.length === 1) {
    const lead = v.bands.find((x) => x.pairs.some((p) => p.no === 1) && x.node === band.node && !x.battle && x.id !== band.id);
    if (lead) return setTimeout(() => b.sock.emit("twJoinBand", { bandId: lead.id }), 400);
  }
  if (band.pairs[0].id !== v.me.pairId) {           // in a warband, follow the leader's vote
    const lv = band.pairs[0].vote; if (lv == null) return;
    const k2 = `${v.turn}:${band.node}:${band.mp}:f`; if (b.lastVote === k2) return; b.lastVote = k2;
    return setTimeout(() => b.sock.emit("twVote", { to: lv }), 800 + Math.random() * 1200);
  }
  const key = `${v.turn}:${band.node}:${band.mp}:${band.pairs.length}`; if (b.lastVote === key) return; b.lastVote = key;
  const route = ROUTES[(b.i / 2) % ROUTES.length];
  const k = [HOME, ...route].indexOf(band.node);
  let to = k >= 0 && k < route.length ? route[k] : "stay";
  if (to === FORTRESS && v.gate.broken && !v.warlord.out) to = "stay";
  setTimeout(() => b.sock.emit("twVote", { to }), 1500 + Math.random() * 2500);
}

if (autoTeacher) {
  let last = 0;
  while (true) {
    await sleep(500);
    if (!host || host.status !== "playing") { if (host?.status === "ended") break; continue; }
    if (host.phase === "crimson" && host.turn !== last) { last = host.turn; await sleep(3000); teacher.emit("twAuto"); }
  }
}
