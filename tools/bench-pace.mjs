// Measures how fast a 2v2 battle moves: questions per minute and battle length.
// Four simulated students play like real ones (about 7 s to answer, 70% right,
// about 4 s to pick a move, sometimes try to steal). Game timers run 20x faster,
// and every number is reported in real-time minutes.
//   node tools/bench-pace.mjs            (6 battles)
//   node tools/bench-pace.mjs 10         (any number of battles)
import { spawn } from "child_process";
import { io } from "socket.io-client";
import { QUESTIONS } from "../questions.js";

const BATTLES = Number(process.argv[2]) || 6;
const SPEED = 20, PORT = 3202, URL = `http://localhost:${PORT}`;
const ANSWER = new Map(QUESTIONS.map((q) => [q.q, q.answer]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (a, b) => (a + Math.random() * (b - a)) / SPEED;   // a..b real-time ms, scaled

const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), RIFT_SPEED: String(SPEED) }, stdio: ["ignore", "pipe", "inherit"] });
await new Promise((res) => server.stdout.on("data", (d) => { if (String(d).includes("running")) res(); }));
const stop = (c) => { server.kill(); process.exit(c); };
setTimeout(() => { console.log("TIMEOUT"); stop(1); }, 600000);

function player(name) {
  const s = io(URL, { transports: ["websocket"], forceNew: true });
  const p = { s, name, room: null, asked: 0 };
  s.on("room", (r) => (p.room = r));
  s.on("yourQuestion", ({ question }) => {
    p.asked++;
    const a = ANSWER.get(question.q);
    setTimeout(() => s.emit("answer", { choiceIndex: Math.random() < 0.7 ? a : (a + 1) % 4 }), jitter(4000, 10000));
  });
  s.on("stealOpen", ({ originalUid }) => {
    if (originalUid === s.id || Math.random() < 0.5) return;
    const q = p.room?.battle?.question; if (!q) return;
    const a = ANSWER.get(q.q);
    setTimeout(() => s.emit("steal", { choiceIndex: Math.random() < 0.6 ? a : (a + 2) % 4 }), jitter(2500, 6000));
  });
  s.on("chooseAction", ({ correct }) => {
    const b = p.room?.battle; const me = p.room?.players.find((x) => x.id === s.id);
    const foe = b?.combatants.find((c) => c.team !== me?.team && c.alive);
    setTimeout(() => s.emit("action", correct ? { type: "strike", targetId: foe?.uid } : { type: "defend" }), jitter(correct ? 3000 : 2000, correct ? 6000 : 4000));
  });
  return p;
}

const results = [];
for (let n = 0; n < BATTLES; n++) {
  const ps = ["A", "B", "C", "D"].map(player);
  await Promise.all(ps.map((p) => new Promise((r) => p.s.on("connect", r))));
  ps[0].s.emit("createRoom", { name: "A" });
  const code = await new Promise((r) => ps[0].s.once("joined", (d) => r(d.code)));
  for (const p of ps.slice(1)) p.s.emit("joinRoom", { code, name: p.name });
  await sleep(300);
  ps.forEach((p, i) => p.s.emit("pickCharacter", { charId: ["jun", "saya", "raiden", "nao"][i] }));
  await sleep(200);
  let asked = 0, t0 = 0;
  ps[0].s.on("answerResult", () => asked++);
  const ended = new Promise((r) => ps[0].s.once("battleEnd", r));
  ps[0].s.emit("startMatch");
  t0 = Date.now();
  await ended;
  const mins = ((Date.now() - t0) * SPEED) / 60000;
  results.push({ mins, asked, perMin: asked / mins, perPlayer: ps.map((p) => p.asked) });
  ps.forEach((p) => p.s.close());
  console.log(`battle ${n + 1}: ${mins.toFixed(1)} min, ${asked} questions, ${(asked / mins).toFixed(1)} per minute`);
}
const avg = (k) => results.reduce((s, r) => s + r[k], 0) / results.length;
console.log(`\naverage: ${avg("mins").toFixed(1)} min per battle, ${avg("asked").toFixed(0)} questions, ${avg("perMin").toFixed(1)} questions per minute`);
console.log(`each player answers about ${(avg("perMin") / 4).toFixed(1)} of their own questions per minute`);
stop(0);
