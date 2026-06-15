// Headless 4-player end-to-end test: 2v2 full match to completion.
import { io } from "socket.io-client";
const URL = "http://localhost:3100";
const CHARS = ["jun", "saya", "raiden", "nao"];
let finished = false, started = false, code = null;

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
  s.on("yourQuestion", () => { setTimeout(() => s.emit("answer", { choiceIndex: Math.floor(Math.random() * 4) }), 150); });
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

setTimeout(() => { console.error("TIMEOUT: match did not finish in 60s"); process.exit(1); }, 60000);
