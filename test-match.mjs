// Headless 4-player end-to-end test: 2v2 full match to completion.
// Start the server first. For a quick run start it with RIFT_SPEED=20 (game timers 20x faster).
import { io } from "socket.io-client";
import { QUESTIONS } from "./questions.js";
const ANSWER = new Map(QUESTIONS.map((q) => [q.q, q.answer]));
const URL = "http://localhost:3100";
const CHARS = ["jun", "saya", "raiden", "nao"];
let finished = false, started = false, code = null;
// the right answer must stay secret while a question can still be stolen
let wrongSeen = 0, reveals = 0, leaks = 0, missedSteals = 0;
const hintsGot = [];   // P1 asks for a hint on every question: only 2 per battle are allowed

function mkClient(name, idx) {
  const s = io(URL, { transports: ["websocket"] });
  s.name = name; s.latest = null;
  s.on("connect", () => {
    s.id_ = s.id;
    if (idx === 0) s.emit("createRoom", { name });
  });
  s.on("joined", (d) => { code = d.code; s.emit("pickCharacter", { charId: CHARS[idx] }); s.emit("setReady", { ready: true }); });
  s.on("errorMsg", (m) => console.log(`[${name}] ERROR: ${m}`));
  s.on("room", (r) => {
    s.latest = r;
    // host starts once 4 players all picked
    if (idx === 0 && !started && r.players.length === 4 && r.players.every((p) => p.character)) {
      started = true; setTimeout(() => s.emit("startMatch"), 300);
    }
  });
  // answer like a student who gets about 70% right
  s.on("yourQuestion", ({ question }) => {
    if (idx === 0) s.emit("useHint");
    const a = ANSWER.get(question.q);
    setTimeout(() => s.emit("answer", { choiceIndex: Math.random() < 0.7 ? a : (a + 1) % 4 }), 150);
  });
  if (idx === 0) {
    s.on("hint", (h) => hintsGot.push(h));
    s.on("answerResult", (r) => { if (!r.correct) { wrongSeen++; if ("correctIndex" in r || "correctAll" in r) leaks++; } });
    s.on("answerReveal", (r) => { reveals++; if (!Array.isArray(r.correctAll)) leaks += 100; });
    s.on("stealResult", (r) => { if (!r.correct) { missedSteals++; if ("correctIndex" in r || "correctAll" in r) leaks++; } });
  }
  // one player always tries to steal, with a wrong answer
  if (idx === 1) s.on("stealOpen", ({ originalUid }) => {
    if (originalUid === s.id) return;
    const q = s.latest?.battle?.question; const a = q ? ANSWER.get(q.q) : 0;
    s.emit("steal", { choiceIndex: (a + 1) % 4 });
  });
  s.on("chooseAction", () => {
    const b = s.latest?.battle; if (!b) return s.emit("action", { type: "strike" });
    const meP = s.latest.players.find((p) => p.id === s.id);
    const myTeam = meP ? meP.team : 0;
    const enemy = b.combatants.find((c) => c.team !== myTeam && c.alive);
    setTimeout(() => s.emit("action", { type: "strike", targetId: enemy?.uid }), 150);
  });
  s.on("battleEnd", ({ winnerTeam, rewards }) => {
    if (finished) return; finished = true;
    console.log("\n===== MATCH OVER =====");
    console.log("Winning team:", winnerTeam);
    const meP = s.latest.players.find((p) => p.id === s.id);
    console.log("Final combatant HP:");
    s.latest.battle.combatants.forEach((c) => console.log(`  T${c.team} ${c.name} (${c.charName}): ${c.hp}/${c.maxHp} ${c.alive ? "" : "[KO]"}`));
    console.log("Rewards (this client):", rewards[s.id]);
    console.log(`Wrong answers: ${wrongSeen}, answers revealed after the steal window: ${reveals}, missed steals: ${missedSteals}`);
    const p1 = clients[0], p1Review = rewards[p1.id]?.review || [];
    console.log(`Hints: P1 got ${hintsGot.length} (all text: ${hintsGot.every((h) => h.kind === "text" && h.text)}), ${p1Review.filter((x) => x.hinted).length} marked in P1's review`);
    if (hintsGot.length !== 2 || !hintsGot.every((h) => h.kind === "text" && h.text) || p1Review.filter((x) => x.hinted).length !== 2) {
      console.log("FAIL: hints were not limited to 2 per battle, or were not recorded."); process.exit(1);
    }
    if (leaks || (wrongSeen && !reveals)) { console.log(`FAIL: the right answer leaked ${leaks} time(s) during a steal window, or was never revealed.`); process.exit(1); }
    console.log("PASS: 4-player 2v2 match ran to completion.");
    setTimeout(() => process.exit(0), 300);
  });
  return s;
}

const clients = CHARS.map((_, i) => mkClient("P" + (i + 1), i));
// joiners connect after host has a code
const waitCode = setInterval(() => {
  if (code) {
    clearInterval(waitCode);
    for (let i = 1; i < 4; i++) clients[i].emit("joinRoom", { name: "P" + (i + 1), code });
  }
}, 200);

setTimeout(() => { console.error("TIMEOUT: match did not finish in 10 minutes"); process.exit(1); }, 600000);
