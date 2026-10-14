// Headless test of the learning features: answering along, mistakes coming back, recall first, the Rift Report,
// and the teacher's learning report with the MCQ sheet builder. Starts its own server (20x faster).
//   node test-learning.mjs
import { spawn } from "child_process";
import { io } from "socket.io-client";
import { QUESTIONS } from "./questions.js";
import fs from "fs";

const SPEED = 20, PORT = 3207, URL = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (ok, msg) => { console.log(`  ${ok ? "✓" : "✗"} ${msg}`); if (!ok) fails.push(msg); };
// answers for every question the game can ask (built-in and the chapter sets)
const ANSWER = new Map(QUESTIONS.map((q) => [q.q, [q.answer]]));
for (const f of fs.readdirSync("library/sets")) for (const q of JSON.parse(fs.readFileSync("library/sets/" + f, "utf8")).questions) ANSWER.set(q.q, q.correct);

const env = { ...process.env, PORT: String(PORT), RIFT_SPEED: String(SPEED), QUESTION_BANK_DIR: fs.mkdtempSync("/tmp/rift-learn-") };
delete env.GITHUB_TOKEN;
const server = spawn(process.execPath, ["server.js"], { env, stdio: ["ignore", "pipe", "inherit"] });
const done = (code) => { server.kill(); process.exit(code); };
setTimeout(() => { console.log("TIMEOUT"); done(1); }, 180000);
await new Promise((res) => server.stdout.on("data", (d) => { if (String(d).includes("running")) res(); }));

const teacher = io(URL, { transports: ["websocket"] });
await new Promise((r) => teacher.on("connect", r));
teacher.emit("tCreate");
const { code, hostToken } = await new Promise((r) => teacher.once("tHostJoined", r));
const set = (key, value) => teacher.emit("tSetting", { key, value });
set("rounds", 1); set("timeLimitMin", 4); set("pairing", "random"); set("topicId", "set:libch05,set:libch13");
await sleep(300);

const stats = { shadowOpen: 0, recall: 0, retrySeen: 0, reports: 0, along: 0 };
const students = [];
for (let i = 0; i < 4; i++) {
  const st = { i, s: io(URL, { transports: ["websocket"], forceNew: true }), room: null, pid: null, report: null };
  st.s.on("tJoined", (d) => (st.pid = d.you));
  const seenQ = new Set();
  st.s.on("room", (r) => {
    st.room = r; const q = r.battle?.question; if (!q) return;
    const k = q.startedAt + q.q; if (seenQ.has(k)) return; seenQ.add(k);   // count each question once
    if (q.recall) stats.recall++;
    if (q.retry) stats.retrySeen++;
    stats.asked = (stats.asked || 0) + 1;
  });
  // half the answers wrong on purpose, so mistakes come back
  const pick = (q, wrongish) => { const right = ANSWER.get(q.q) || [0]; return wrongish && Math.random() < 0.5 ? (right[0] + 1) % q.choices.length : right[0]; };
  st.s.on("yourQuestion", ({ question }) => setTimeout(() => st.s.emit("answer", { choiceIndex: pick(question, true) }), 120));
  st.s.on("shadowOpen", ({ question }) => { stats.shadowOpen++; setTimeout(() => st.s.emit("shadowAnswer", { choiceIndex: pick(question, true) }), 80); });
  st.s.on("shadowLocked", () => stats.along++);
  st.s.on("chooseAction", () => {
    const b = st.room?.battle, me = b?.combatants.find((c) => c.uid === st.pid);
    const foe = b?.combatants.find((c) => c.team !== me?.team && c.alive);
    setTimeout(() => st.s.emit("action", { type: "strike", targetId: foe?.uid }), 100);
  });
  st.s.on("battleEnd", ({ rewards }) => {
    const r = rewards[st.pid]; st.report = r?.report; stats.reports++;
    if (r?.report?.prompts?.length) st.s.emit("tReport", { answers: r.report.prompts.map((p) => ({ id: p.id, text: `My answer to ${p.id}: light and circuits explained in a full sentence.` })) });
  });
  await new Promise((r) => st.s.on("connect", r));
  st.s.emit("joinRoom", { code, name: `Learner ${i + 1}` });
  students.push(st);
}
await sleep(500);
students.forEach((st) => st.s.emit("tReady", { ready: true }));

// wait for the round to finish
let status = "";
teacher.on("tHost", (v) => (status = v.status));
const t0 = Date.now();
while (status !== "finished" && Date.now() - t0 < 150000) await sleep(250);
await sleep(800);
check(status === "finished", "the round finished");
check(stats.shadowOpen > 0 && stats.along > 0, `students answered along on others' turns (${stats.along} answers along)`);
check(stats.recall > 0, "later questions hide the choices first (recall first)");
// every student sees every question, so each is counted four times
check(stats.retrySeen > 0 && stats.retrySeen <= stats.asked / 2, `questions got wrong came back, at most every other turn (${stats.retrySeen / 4} of the ${stats.asked / 4} questions)`);
check(stats.reports === 4 && students.every((st) => st.report && st.report.prompts.length >= 1), "every student got a Rift Report with written prompts");
const st0 = students.find((st) => st.report?.missed?.length);
check(!!st0 && st0.report.missed.every((m) => m.right && m.lo), "missed questions carry the right answer and the learning objective");

// the teacher's report
const get = (path, body) => fetch(URL + path, { method: body ? "POST" : "GET", headers: { "x-host-token": hostToken, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, data: await r.json() }));
let r = await fetch(`${URL}/api/report?code=${code}`).then((x) => x.status);
check(r === 404, "the report needs the teacher's host token");
const rep = await get(`/api/report?code=${code}`);
check(rep.status === 200 && rep.data.totals.answers > 0, `the report counts every answer (${rep.data.totals?.answers} answers, ${rep.data.totals?.questions} different questions)`);
check(rep.data.wrong.length > 0 && rep.data.wrong.every((w) => w.wrong > 0 && w.asked >= w.wrong && w.right && w.lo), `every wrong question is listed with how often (${rep.data.wrong.length} questions)`);
check(rep.data.wrong.every((w, i, a) => i === 0 || a[i - 1].wrong >= w.wrong), "the list is sorted by how often it was got wrong");
check(rep.data.objectives.length > 0 && rep.data.objectives.every((o) => o.lo && o.pct >= 0), "the weakest learning objectives are listed");
check(rep.data.written.length >= 4, `the students' written answers reached the report (${rep.data.written.length})`);
const sheet = await get("/api/report/sheet", { code, perLo: 2, below: 100 });
const askedQs = new Set(rep.data.wrong.map((w) => w.q));
check(sheet.status === 200 && sheet.data.items.length > 0, `an MCQ sheet was built on the weak objectives (${sheet.data.items?.length} objectives)`);
check(sheet.data.items.every((it) => it.questions.every((q) => !askedQs.has(q.q))), "the sheet's questions are different from the ones answered wrong");
const save = await get("/api/report/sheet/save", { code, qids: sheet.data.items.flatMap((it) => it.questions.map((q) => q.qid)) });
check(save.status === 200 && /Review sheet/.test(save.data.title), "the sheet was saved as a question set in the hub");

console.log(fails.length ? `FAIL: ${fails.length} check(s) failed.` : "PASS: the learning features work end to end.");
done(fails.length ? 1 : 0);
