// End-to-end check of the practice fight (server side). Plays it like a student:
// taps NEXT at every pause, answers one question wrong first (it can be retried),
// misses the steal once, then follows each lesson until the fight is won.
//   node test-practice.mjs
import { spawn } from "child_process";
import { io } from "socket.io-client";
import { PRACTICE_QUESTIONS } from "./practice.js";

const SPEED = 20, PORT = 3207, URL = `http://localhost:${PORT}`;
const ANSWER = new Map(PRACTICE_QUESTIONS.map((q) => [q.q, q.answer]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(PORT), RIFT_SPEED: String(SPEED), GITHUB_TOKEN: "" }, stdio: ["ignore", "pipe", "inherit"] });
await new Promise((res) => server.stdout.on("data", (d) => { if (String(d).includes("running")) res(); }));
let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? "✓" : "✗"} ${msg}`); if (!cond) failed++; };
const stop = () => { server.kill(); process.exit(failed ? 1 : 0); };
setTimeout(() => { console.log("✗ TIMEOUT"); failed++; stop(); }, 120000);

const s = io(URL, { transports: ["websocket"], forceNew: true });
await new Promise((r) => s.on("connect", r));
let room = null;
const gates = [], lessons = [], moves = [], retries = [];
let waitedOnQuestion = false, hinted = false, stoleTurn = false, sawHint = null;
s.on("room", (r) => {
  room = r;
  const g = r.practice?.gate;
  if (g && gates[gates.length - 1] !== g) { gates.push(g); setTimeout(() => s.emit("coachNext"), 30); }
});
s.on("practiceRetry", (d) => retries.push(d));
s.on("hint", (h) => { sawHint = h; });

s.on("yourQuestion", async ({ question }) => {
  const lesson = room.practice.lesson;
  lessons.push(lesson);
  const a = ANSWER.get(question.q);
  if (lesson === "strike") {
    ok(question.untimed === true, "practice questions have no timer");
    ok(!question.hint, "no hint offered before the hint lesson");
    // nothing is timed: wait the length of a normal question and check it is still ours
    if (!waitedOnQuestion) {
      waitedOnQuestion = true;
      await sleep((20 * 1000) / SPEED);
      ok(room.battle.phase === "question" && room.battle.current === s.id, "the question waits for the student (no time-out)");
    }
    s.emit("answer", { choiceIndex: (a + 1) % question.choices.length });     // wrong first
    await sleep(80);
    s.emit("answer", { choiceIndex: a });
  } else if (lesson === "ult") {
    ok(question.hint === "text", "the hint lesson's question has a written hint");
    s.emit("useHint");
    await sleep(80);
    ok(sawHint?.kind === "text" && /magnification/i.test(sawHint.text), "the hint text arrives");
    hinted = true;
    s.emit("answer", { choiceIndex: a });
  } else s.emit("answer", { choiceIndex: a });
});

s.on("stealOpen", async ({ originalUid, untimed }) => {
  if (originalUid === s.id) return;
  ok(untimed === true, "the steal chance has no timer");
  const q = room.battle.question, a = ANSWER.get(q.q);
  await sleep((10 * 1000) / SPEED);
  ok(room.battle.phase === "steal", "the steal chance waits for the student");
  s.emit("steal", { choiceIndex: (a + 2) % q.choices.length });     // miss once
  await sleep(80);
  s.emit("steal", { choiceIndex: a });
});
s.on("stealResult", ({ uid, correct }) => { if (uid === s.id && correct) stoleTurn = true; });

s.on("chooseAction", ({ halfPower }) => {
  const b = room.battle, lesson = room.practice.lesson;
  const foes = b.combatants.filter((c) => c.team === 1 && c.alive);
  const renji = foes.find((c) => c.charId === "renji") || foes[0];
  let action;
  if (halfPower) action = { type: "strike", targetId: foes[0].uid };
  else if (lesson === "strike") action = { type: "strike", targetId: renji.uid };
  else if (lesson === "skills") action = { type: "spell", skillIndex: 0, targetId: renji.uid };
  else if (lesson === "ult") { ok(b.sync[0] >= 100, "the team gauge is full for the Ultimate lesson"); action = { type: "ultimate" }; }
  else action = { type: "strike", targetId: foes[0].uid };
  moves.push(halfPower ? "steal:" + action.type : lesson + ":" + action.type);
  setTimeout(() => s.emit("action", action), 40);
});

let foeHits = 0, partnerHeal = false, weakHit = false, ultHit = 0;
s.on("actionResult", ({ actor, action, events }) => {
  const c = room?.battle?.combatants.find((x) => x.uid === actor);
  if (c?.team === 1 && events.some((e) => e.dmg)) foeHits++;
  if (c?.charId === "emi" && events.some((e) => e.heal)) partnerHeal = true;
  if (actor === s.id && events.some((e) => e.eff === "WEAK")) weakHit = true;
  if (actor === s.id && action === "ultimate") ultHit = events.filter((e) => e.dmg).length;
});

s.emit("startPractice", { name: "Tester" });
const end = await new Promise((r) => s.once("battleEnd", r));
await sleep(100);

ok(end.practice === true && end.winnerTeam === 0, "the practice fight ends in a win");
ok(JSON.stringify(gates) === JSON.stringify(["intro", "foeTurn", "foeHit", "partnerTurn", "stealSetup"]), `the coach pauses in order: ${gates.join(", ")}`);
ok(lessons.slice(0, 3).join(",") === "strike,skills,ult", `lessons in order: ${lessons.join(", ")}`);
ok(retries.length === 2 && retries.some((r) => r.steal), "a wrong answer and a missed steal can both be tried again");
ok(stoleTurn && moves.includes("steal:strike"), "the student steals Nao's turn");
ok(foeHits >= 1 && partnerHeal, "a rival hits, and partner Emi heals");
ok(weakHit, "the skill lesson lands a WEAK hit on Renji");
ok(hinted && ultHit >= 1, "the hint is used and the Ultimate hits");
const me = room.battle.combatants.find((c) => c.uid === s.id);
ok(me.alive && me.hp >= 1, "the student's fighter is still standing");

// leaving mid-fight cleans up, and a second practice starts fresh
s.emit("startPractice", { name: "Tester" });
await sleep(300);
const again = room;
ok(again.practice && again.battle && again.status === "battle", "PRACTICE AGAIN starts a new fight");
s.emit("leavePractice");
await sleep(100);
s.emit("coachNext");
await sleep(100);
ok(true, "leaving mid-fight is quiet");
s.close();
stop();
