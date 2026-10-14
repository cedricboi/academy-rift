// Headless test of Auntie's shop: students earn coins in a tournament battle, buy items between rounds (with the
// limits), the items are packed into their next battle, a Durian Bomb is thrown, and what is not used stays in the bag.
// Starts its own server (20x faster).
//   node test-shop.mjs
import { spawn } from "child_process";
import { io } from "socket.io-client";
import { QUESTIONS } from "./questions.js";
import { ITEM_BY_ID, SHOP_LIMIT } from "./public/data/characters.js";
import fs from "fs";

const SPEED = 20, PORT = 3208, URL = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (ok, msg) => { console.log(`  ${ok ? "✓" : "✗"} ${msg}`); if (!ok) fails.push(msg); };
const ANSWER = new Map(QUESTIONS.map((q) => [q.q, q.answer]));

const env = { ...process.env, PORT: String(PORT), RIFT_SPEED: String(SPEED), QUESTION_BANK_DIR: fs.mkdtempSync("/tmp/rift-shop-") };
delete env.GITHUB_TOKEN;
const server = spawn(process.execPath, ["server.js"], { env, stdio: ["ignore", "pipe", "inherit"] });
const done = (code) => { server.kill(); process.exit(code); };
setTimeout(() => { console.log("TIMEOUT"); done(1); }, 180000);
await new Promise((res) => server.stdout.on("data", (d) => { if (String(d).includes("running")) res(); }));

const teacher = io(URL, { transports: ["websocket"] });
await new Promise((r) => teacher.on("connect", r));
teacher.emit("tCreate");
const { code } = await new Promise((r) => teacher.once("tHostJoined", r));
let status = "", round = 0;
teacher.on("tHost", (v) => { status = v.status; round = v.round; });
const set = (key, value) => teacher.emit("tSetting", { key, value });
set("rounds", 2); set("timeLimitMin", 4); set("pairing", "random"); set("topicId", "parts"); set("autoStart", "ready");
await sleep(300);

const students = [];
let durianHits = 0;
for (let i = 0; i < 4; i++) {
  const st = { i, s: io(URL, { transports: ["websocket"], forceNew: true }), view: null, room: null, pid: null, shop: [], errors: [],
    rewards: [], packed: null, throwDurian: false };
  st.s.on("tJoined", (d) => (st.pid = d.you));
  st.s.on("tState", (v) => (st.view = v));
  st.s.on("tShop", (r) => st.shop.push(r));
  st.s.on("tError", (m) => st.errors.push(m));
  st.s.on("room", (r) => {
    st.room = r;
    const me = r.battle?.combatants?.find((c) => c.uid === st.pid);
    if (me && !st.packed) st.packed = { items: { ...me.items }, hints: me.hintsLeft };
  });
  st.s.on("yourQuestion", ({ question }) => setTimeout(() => st.s.emit("answer", { choiceIndex: ANSWER.get(question.q) ?? 0 }), 320));
  st.s.on("chooseAction", () => {
    const b = st.room?.battle, me = b?.combatants.find((c) => c.uid === st.pid);
    const foe = b?.combatants.find((c) => c.team !== me?.team && c.alive);
    if (st.throwDurian && me?.items?.durian > 0) {
      st.throwDurian = false;
      return setTimeout(() => st.s.emit("action", { type: "item", itemId: "durian", targetId: foe?.uid }), 100);
    }
    setTimeout(() => st.s.emit("action", { type: "strike", targetId: foe?.uid }), 100);
  });
  st.s.on("actionResult", (d) => { if (st === students[0] && d?.name === ITEM_BY_ID.durian.name && (d.events || []).some((e) => e.dmg > 0)) durianHits++; });
  st.s.on("battleEnd", ({ rewards }) => st.rewards.push(rewards[st.pid]));
  await new Promise((r) => st.s.on("connect", r));
  st.s.emit("joinRoom", { code, name: `Shopper ${i + 1}` });
  students.push(st);
}
await sleep(500);
const ask = async (st, itemId) => { const n = st.shop.length; st.s.emit("tBuy", { itemId }); const t0 = Date.now();
  while (st.shop.length === n && Date.now() - t0 < 2000) await sleep(20); return st.shop[n] || null; };
const [a, b] = students;

// ---- before any battle: no coins yet ----
check(students.every((st) => st.view?.you.coins === 0 && Object.keys(st.view.you.bag).length === 0), "students start with no coins and an empty bag");
let r = await ask(a, "bento");
check(r && !r.ok && r.reason === "coins", "with no coins, Auntie says not enough coins");
const errs = a.errors.length; a.s.emit("tBuy", { itemId: "pizza" }); await sleep(200);
check(a.errors.length > errs, "an item Auntie doesn't sell is refused");

// ---- round 1 ----
students.forEach((st) => st.s.emit("tReady", { ready: true }));
let t0 = Date.now();
while (!(status === "round" && students.every((st) => st.view?.you.inBattle)) && Date.now() - t0 < 30000) await sleep(100);
const e0 = a.errors.length; a.s.emit("tBuy", { itemId: "energy" }); await sleep(250);
check(a.errors.length > e0 && /battle/i.test(a.errors.at(-1)), "nobody can shop in the middle of a battle");
t0 = Date.now();
while (!(status === "between" && students.every((st) => st.rewards.length === 1)) && Date.now() - t0 < 90000) await sleep(200);
await sleep(400);
check(status === "between", "round 1 finished");
check(students.every((st) => st.view.you.coins === st.rewards[0].coins && st.view.you.coins > 0), `coins from the battle land in the purse (${students.map((st) => st.view.you.coins).join(", ")})`);

// ---- shopping between rounds ----
// the richest student buys a Durian Bomb, then Malt Dino Elixirs until Auntie says two is enough (or the coins run out)
students.sort((x, y) => y.view.you.coins - x.view.you.coins);
const rich = students[0];
let coins = rich.view.you.coins, bought = {};
const buy = async (st, id) => { const res = await ask(st, id); if (res?.ok) { check(res.coins === coins - ITEM_BY_ID[id].price, `bought ${ITEM_BY_ID[id].name}: ${coins} → ${res.coins} coins`); coins = res.coins; bought[id] = (bought[id] || 0) + 1; } return res; };
r = await buy(rich, "durian");
check(r?.ok || (r?.reason === "coins" && coins < 220), "a Durian Bomb is sold if you can afford it");
let last;
for (let k = 0; k < 3; k++) { last = await buy(rich, "energy"); if (!last?.ok) break; }
check(last && !last.ok && (last.reason === "max" ? bought.energy === SHOP_LIMIT.each : last.reason === "coins" && coins < 100),
  `buying stops at ${SHOP_LIMIT.each} of one item or when the coins run out (stopped: ${last?.reason})`);
await sleep(300);
check(JSON.stringify(rich.view.you.bag) === JSON.stringify(bought) && rich.view.you.coins === coins, "the bag and purse in the tournament view match what was bought");
// another student fills their bag with the cheapest items to hit the bag limit, if they can afford six
const other = students[1]; let oc = other.view.you.coins, n = 0, res;
for (const id of ["energy", "energy", "bento", "bento", "tonic", "tonic", "shield"]) { res = await ask(other, id); if (!res?.ok) break; n++; oc = res.coins; }
check(n < SHOP_LIMIT.total ? res?.reason === "coins" : res?.reason === "full", `the bag holds at most ${SHOP_LIMIT.total} items (bought ${n}, then: ${res?.reason})`);
// a third buys Study Notes if they can (works by itself: one more hint next battle)
const reader = students[2]; const notes = await ask(reader, "notes");

// ---- round 2: the bought items are packed into the battle ----
rich.throwDurian = !!bought.durian;
students.forEach((st) => (st.packed = null));
teacher.emit("tStartRound");
t0 = Date.now();
while (!students.every((st) => st.packed) && Date.now() - t0 < 30000) await sleep(100);
check(rich.packed.items.energy === 1 + (bought.energy || 0) && (rich.packed.items.durian || 0) === (bought.durian || 0),
  `bought items join the battle's own (energy ×${rich.packed.items.energy}, durian ×${rich.packed.items.durian || 0})`);
if (notes?.ok) check(reader.packed.hints === students[3].packed.hints + 1, "Study Notes give one extra hint");
t0 = Date.now();
while (!(status === "finished" && students.every((st) => st.rewards.length === 2)) && Date.now() - t0 < 90000) await sleep(200);
await sleep(400);
check(status === "finished", "round 2 finished");
if (bought.durian) check(durianHits > 0, "the Durian Bomb was thrown and hit");
const left = rich.view.you.bag;
check((left.energy || 0) === (bought.energy || 0) && !left.durian, `unused items stay in the bag, used ones are gone (bag: ${JSON.stringify(left)})`);
check(!reader.view.you.bag.notes, "Study Notes are used up after one battle");
check(students.every((st) => st.view.you.coins >= 0), "nobody ever goes below zero coins");

console.log(fails.length ? `FAIL: ${fails.length} check(s) failed.` : "PASS: Auntie's shop works end to end.");
done(fails.length ? 1 : 0);
