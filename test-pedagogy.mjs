// Headless test of the pedagogy features added in October 2026: the note on a question that comes back, the Rift
// Report prompt about the answer a student picked, coins for mistakes put right, the Ultimate's "why" check, and the
// teacher's live weak spots. Starts its own server (20x faster).
//   node test-pedagogy.mjs
import { spawn } from "child_process";
import { io } from "socket.io-client";
import fs from "fs";

const SPEED = 20, PORT = 3210, URL = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (ok, msg) => { console.log(`  ${ok ? "✓" : "✗"} ${msg}`); if (!ok) fails.push(msg); };
// answers and reasons for the chapter quizzes used
const BY_STEM = new Map();
for (const f of ["ch05.json", "ch13.json"]) for (const q of JSON.parse(fs.readFileSync("library/sets/" + f, "utf8")).questions) BY_STEM.set(q.q, q);

const env = { ...process.env, PORT: String(PORT), RIFT_SPEED: String(SPEED), QUESTION_BANK_DIR: fs.mkdtempSync("/tmp/rift-ped-") };
delete env.GITHUB_TOKEN;
const server = spawn(process.execPath, ["server.js"], { env, stdio: ["ignore", "pipe", "inherit"] });
const done = (code) => { server.kill(); process.exit(code); };
setTimeout(() => { console.log("TIMEOUT"); done(1); }, 200000);
await new Promise((res) => server.stdout.on("data", (d) => { if (String(d).includes("running")) res(); }));

const teacher = io(URL, { transports: ["websocket"] });
await new Promise((r) => teacher.on("connect", r));
teacher.emit("tCreate");
const { code, hostToken } = await new Promise((r) => teacher.once("tHostJoined", r));
let host = null;
teacher.on("tHost", (v) => (host = v));
const set = (key, value) => teacher.emit("tSetting", { key, value });
set("rounds", 2); set("timeLimitMin", 4); set("pairing", "random"); set("topicId", "set:libch05,set:libch13");
await sleep(300);

const stats = { retryShown: 0, retryNotes: 0, retryPickMatches: 0, whyOpen: 0, whyRight: 0, whyWrong: 0, ultAfterRight: 0, strikeAfterWrong: 0, syncKept: 0 };
const NAMES = ["Alpha Kid", "Bravo Kid", "Charlie Kid", "Delta Kid"];
const students = [];
for (let i = 0; i < 4; i++) {
  const st = { i, s: io(URL, { transports: ["websocket"], forceNew: true }), room: null, pid: null, rewards: [], picks: new Map(), whyNext: i % 2 ? "wrong" : "right", lastWhy: null };
  st.s.on("tJoined", (d) => (st.pid = d.you));
  st.s.on("room", (r) => { st.room = r; const sy = r.battle?.sync; if (sy) stats.maxSync = Math.max(stats.maxSync || 0, sy[0], sy[1]); });
  const answerFor = (q, wrongish) => { const src = BY_STEM.get(q.q); const right = src ? src.correct[0] : 0;
    return wrongish && Math.random() < (host?.round >= 2 ? 0.1 : 0.45) ? (right + 1) % q.choices.length : right; };
  st.s.on("yourQuestion", ({ question, lastPick }) => {
    if (question.retry) {
      stats.retryShown++;
      if (lastPick?.note) stats.retryNotes++;
      if (lastPick && st.picks.get(question.q) === lastPick.chosen) stats.retryPickMatches++;
    }
    const pick = answerFor(question, true);
    setTimeout(() => { st.s.emit("answer", { choiceIndex: pick }); if (BY_STEM.get(question.q)?.correct[0] !== pick) st.picks.set(question.q, pick); }, 320);
  });
  st.s.on("shadowOpen", ({ question }) => setTimeout(() => {
    const pick = answerFor(question, true); st.s.emit("shadowAnswer", { choiceIndex: pick });
    if (BY_STEM.get(question.q)?.correct[0] !== pick) st.picks.set(question.q, pick);
  }, 300));
  st.s.on("chooseAction", () => {
    const b = st.room?.battle, me = b?.combatants.find((c) => c.uid === st.pid);
    const foe = b?.combatants.find((c) => c.team !== me?.team && c.alive);
    const full = b && b.sync?.[me?.team] >= 100;
    setTimeout(() => st.s.emit("action", full ? { type: "ultimate" } : { type: "strike", targetId: foe?.uid }), 100);
  });
  // the "why" check: alternate a right reason and a wrong one
  st.s.on("whyOpen", ({ q, reasons }) => {
    stats.whyOpen++;
    const src = [...BY_STEM.values()].find((x) => x.why && reasons.includes(x.why.right));
    const right = src ? reasons.indexOf(src.why.right) : 0;
    const want = st.whyNext; st.whyNext = want === "right" ? "wrong" : "right";
    st.lastWhy = want;
    setTimeout(() => st.s.emit("whyAnswer", { index: want === "right" ? right : (right + 1) % reasons.length }), 200);
  });
  st.s.on("whyResult", ({ ok }) => { if (ok) stats.whyRight++; else stats.whyWrong++; });
  st.s.on("actionResult", (d) => {
    if (d.actor !== st.pid || !d.why) return;
    if (d.why === "right" && d.action === "ultimate") stats.ultAfterRight++;
    if (d.why === "wrong" && d.action === "strike") {
      stats.strikeAfterWrong++;
      setTimeout(() => { const b = st.room?.battle, me = b?.combatants.find((c) => c.uid === st.pid); if (b && b.sync[me.team] >= 100) stats.syncKept++; }, 60);
    }
  });
  st.s.on("battleEnd", ({ rewards }) => st.rewards.push(rewards[st.pid]));
  await new Promise((r) => st.s.on("connect", r));
  st.s.emit("joinRoom", { code, name: NAMES[i] });
  students.push(st);
}
await sleep(500);
students.forEach((st) => st.s.emit("tReady", { ready: true }));

let t0 = Date.now();
while (!(host?.status === "between") && Date.now() - t0 < 80000) await sleep(250);
await sleep(600);
check(host?.status === "between", "round 1 finished");
const weak = host.weak || [];
check(weak.length > 0 && weak.every((o) => o.lo && o.pct >= 0 && o.asked >= 4), `the teacher sees live weak spots by learning objective (${weak.length} shown)`);
check(weak.some((o) => o.note), "a weak spot shows the misconception behind the most common wrong answer");
check(!NAMES.some((n) => JSON.stringify(weak).includes(n)), "the weak spots have no student names in them (safe on the projector)");

teacher.emit("tStartRound");
t0 = Date.now();
while (!(host?.status === "finished") && Date.now() - t0 < 90000) await sleep(250);
await sleep(600);
check(host?.status === "finished", "round 2 finished");

check(stats.retryShown > 0, `questions came back (${stats.retryShown} times)`);
check(stats.retryNotes > 0 && stats.retryNotes >= stats.retryShown * 0.6, `a question that comes back shows the misconception note for the answer picked last time (${stats.retryNotes} of ${stats.retryShown})`);
check(stats.retryPickMatches > 0, `the note is about the option the student actually picked (${stats.retryPickMatches} matched)`);

const all = students.flatMap((st) => st.rewards).filter(Boolean);
check(all.every((r) => r.coinParts && r.coins === r.coinParts.battle + r.coinParts.answers + r.coinParts.fixed), "coins add up from the battle, the answers and mistakes put right");
check(all.every((r) => [250, 200, 150].includes(r.coinParts.battle)), "winning, drawing and losing pay 250, 200 and 150");
check(all.some((r) => r.coinParts.fixedCount > 0 && r.coinParts.fixed === r.coinParts.fixedCount * 40), `mistakes put right earn 40 coins each (${all.reduce((n, r) => n + r.coinParts.fixedCount, 0)} put right)`);

console.log("  (highest Sync seen:", stats.maxSync, ")");
check(stats.whyOpen > 0, `choosing the Ultimate asks why the answer was right (${stats.whyOpen} times)`);
check(stats.whyRight > 0 && stats.ultAfterRight === stats.whyRight, `the right reason unleashes the Ultimate (${stats.ultAfterRight})`);
if (stats.whyWrong) {
  check(stats.strikeAfterWrong === stats.whyWrong, `a wrong reason turns it into a Strike (${stats.strikeAfterWrong})`);
  check(stats.syncKept === stats.strikeAfterWrong, "after a wrong reason the Sync gauge stays full");
}
check(all.some((r) => r.why && r.why.asked > 0), "the result screen gets how many reasons were right");

const prompts = all.flatMap((r) => r.report?.prompts || []);
const pickPrompts = prompts.filter((p) => p.kind === "pick");
check(pickPrompts.length > 0 && pickPrompts.every((p) => /You chose “.+”\. Explain/.test(p.text) && /right answer is/.test(p.model)), `the Rift Report asks students to explain why the answer they picked was wrong (${pickPrompts.length} prompts)`);

const rep = await fetch(`${URL}/api/report?code=${code}`, { headers: { "x-host-token": hostToken } }).then((r) => r.json());
check(rep.wrong.some((w) => w.commonNote), "the teacher's learning report gives the misconception for the most common wrong answer");

console.log(fails.length ? `FAIL: ${fails.length} check(s) failed.` : "PASS: the pedagogy features work end to end.");
done(fails.length ? 1 : 0);
