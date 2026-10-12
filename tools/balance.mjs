// Balance check: plays thousands of 2v2 battles with the game's real combat rules
// (combat.js) and reports how often each character wins.
//
// Each battle picks four different characters at random. Every player answers
// right about 70% of the time (a little less with an answer-time debuff), and a
// wrong answer is stolen by someone else about a third of the time, like a class
// does. Players choose moves like a sensible student: Ultimate when the gauge is
// full, heal or revive a teammate in trouble, otherwise the hardest-hitting move
// on the best target, with a support skill now and then.
//
//   node tools/balance.mjs              20000 battles, to a knockout and with the 8-minute limit
//   node tools/balance.mjs 50000        more battles
//   node tools/balance.mjs 20000 pairs  also show the best and worst teammate for each character
import { CHARACTERS, CHAR_BY_ID } from "../public/data/characters.js";
import { makeCombatant, resolveAction, addSync, enemiesOf, alliesOf, decStatuses, SYNC_CORRECT, SYNC_TEAM, SP_DMG_SCALE } from "../combat.js";
import { effectiveness } from "../public/data/characters.js";

const N = Number(process.argv[2]) || 20000;
const SHOW_PAIRS = process.argv.includes("pairs");
// --try file.json: test changed numbers without editing characters.js, e.g.
//   { "emi": { "hp": 1200, "atk": 190, "ult": 800 }, "saya": { "ult": 600, "archetype": "stun" } }
const tryAt = process.argv.indexOf("--try");
if (tryAt > 0) {
  const { readFileSync } = await import("fs");
  for (const [id, v] of Object.entries(JSON.parse(readFileSync(process.argv[tryAt + 1], "utf8")))) {
    const c = CHAR_BY_ID[id]; if (!c) continue;
    if (v.hp) c.hp = v.hp; if (v.sp) c.sp = v.sp; if (v.atk) c.atk = v.atk;
    if (v.ult || v.archetype) c.ultimate = { ...c.ultimate, power: v.ult || c.ultimate.power, archetype: v.archetype || c.ultimate.archetype };
    if (v.weakTo) c.weakTo = v.weakTo; if (v.resists) c.resists = v.resists;
  }
}
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
// --right 0.55: how often students answer right · --policy random: students pick any move
const P_RIGHT = Number(arg("--right", 0.7)), TIMER_PENALTY = 0.1, P_STEAL = 0.35;
const RANDOM_MOVES = arg("--policy", "") === "random";
const TURNS_8_MIN = 36;          // about 4.5 questions a minute (tools/bench-pace.mjs)
const rnd = (a) => a[Math.floor(Math.random() * a.length)];

// ---- how a sensible student picks a move ----
function expectedHit(c, move, target) {
  const eff = effectiveness(move.element, target).mult;
  const base = move.kind === "strike" ? c.atk : move.kind === "debuff" ? move.power : move.power * (1 + move.sp / SP_DMG_SCALE);
  return base * eff;
}
function chooseMove(c, b, stolen) {
  const enemies = enemiesOf(b, c.team), allies = alliesOf(b, c.team);
  const ready = (i) => !(c.cooldowns[i] > 0) && c.sp >= c.skills[i].sp;
  if (b.sync[c.team] >= 100 && Math.random() < (stolen ? 0.3 : RANDOM_MOVES ? 0.5 : 0.85)) return { type: "ultimate" };
  const down = allies.find((a) => !a.alive);
  if (down && c.items.revive > 0 && Math.random() < 0.9) return { type: "item", itemId: "revive", targetId: down.uid };
  const hurt = allies.filter((a) => a.alive && a.hp / a.maxHp < 0.45).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
  if (hurt) {
    const heals = c.skills.map((s, i) => ({ s, i })).filter((x) => x.s.kind === "heal" && ready(x.i)).sort((x, y) => y.s.power - x.s.power);
    if (heals.length && Math.random() < 0.85) return { type: "spell", skillIndex: heals[0].i, targetId: hurt.uid };
    if (c.items.bento > 0 && Math.random() < 0.6) return { type: "item", itemId: "bento", targetId: hurt.uid };
  }
  if (c.sp < 30 && c.items.energy > 0 && Math.random() < 0.5) return { type: "item", itemId: "energy", targetId: c.uid };
  const support = c.skills.map((s, i) => ({ s, i })).filter((x) => ready(x.i) && (x.s.kind === "guard" || x.s.kind === "buff" || x.s.kind === "cleanse" || (x.s.kind === "debuff" && !x.s.power)));
  if (support.length && Math.random() < (RANDOM_MOVES ? 0.35 : 0.15)) {
    const { s, i } = rnd(support);
    const target = s.kind === "debuff" ? rnd(enemies) : allies.filter((a) => a.alive).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
    return { type: "spell", skillIndex: i, targetId: target?.uid };
  }
  const options = [];
  for (const t of enemies) {
    options.push({ action: { type: "strike", targetId: t.uid }, value: expectedHit(c, { kind: "strike", element: c.element }, t), t });
    c.skills.forEach((s, i) => {
      if (!ready(i) || !(s.kind === "atk" || s.kind === "heavy" || (s.kind === "debuff" && s.power))) return;
      options.push({ action: { type: "spell", skillIndex: i, targetId: t.uid }, value: expectedHit(c, s, t), t });
    });
  }
  if (RANDOM_MOVES || Math.random() < 0.25) return rnd(options).action;   // students are not always optimal
  options.sort((x, y) => y.value - x.value || x.t.hp - y.t.hp);
  return options[0].action;
}

// ---- one battle, following the server's turn order and answer rules ----
function battle(ids, maxTurns) {
  const cs = ids.map((id, i) => makeCombatant(CHAR_BY_ID[id], { id: "p" + i, name: id, team: i < 2 ? 0 : 1, bot: false }));
  const b = { combatants: Object.fromEntries(cs.map((c) => [c.uid, c])), order: [cs[0].uid, cs[2].uid, cs[1].uid, cs[3].uid], sync: { 0: 0, 1: 0 } };
  const room = { battle: b };
  const st = Object.fromEntries(cs.map((c) => [c.uid, { dmg: 0, heal: 0, turns: 0, kos: 0, ults: 0 }]));
  const alive = (team) => cs.some((c) => c.team === team && c.alive);
  const grade = (c, correct) => {
    c._correct = correct; c._answered = true;
    if (!correct) return;
    addSync(room, c.team, SYNC_CORRECT);
    const mate = cs.find((x) => x.team === c.team && x.uid !== c.uid);
    if (mate._answered && mate._correct) addSync(room, c.team, SYNC_TEAM);
  };
  const act = (c, action) => {
    if (action.type === "ultimate" && b.sync[c.team] >= 100) st[c.uid].ults++;
    for (const ev of resolveAction(room, c, action)) {
      if (ev.dmg != null) { st[c.uid].dmg += ev.dmg; if (ev.ko) st[c.uid].kos++; }
      if (ev.heal != null) st[c.uid].heal += ev.heal;
    }
  };
  b.ptr = 0; let turns = 0;
  while (alive(0) && alive(1) && turns < maxTurns) {
    let c;
    for (let tries = 0; tries <= 8; tries++) {
      c = b.combatants[b.order[b.ptr]]; b.ptr = (b.ptr + 1) % 4;
      if (!c.alive) continue;
      if (c.stunned) { c.stunned = false; decStatuses(c); continue; }
      break;
    }
    turns++;
    c.defending = false;
    for (const k of Object.keys(c.cooldowns)) if (--c.cooldowns[k] <= 0) delete c.cooldowns[k];
    decStatuses(c);
    c._correct = false;
    st[c.uid].turns++;
    const correct = Math.random() < P_RIGHT - (c.timerDownTurns > 0 ? TIMER_PENALTY : 0);
    grade(c, correct);
    if (correct) { act(c, chooseMove(c, b, false)); continue; }
    const stealers = cs.filter((x) => x.alive && x.uid !== c.uid);
    if (stealers.length && Math.random() < P_STEAL) {
      const s = rnd(stealers);
      grade(s, true); s._correct = true; s._halfPower = true;
      act(c, { type: "defend" });
      act(s, chooseMove(s, b, true));
      s._halfPower = false;
    } else act(c, { type: "defend" });
  }
  let winner;
  if (!alive(0) || !alive(1)) winner = alive(0) ? 0 : 1;
  else {                                   // time up: larger share of HP left wins
    const share = (t) => { let h = 0, m = 0; for (const c of cs) if (c.team === t) { h += Math.max(0, c.hp); m += c.maxHp; } return h / m; };
    const d = share(0) - share(1);
    winner = Math.abs(d) < 0.005 ? -1 : d > 0 ? 0 : 1;
  }
  return { cs, st, winner, turns };
}

export function run(maxTurns, n = N) {
  const per = Object.fromEntries(CHARACTERS.map((c) => [c.id, { games: 0, wins: 0, draws: 0, dmg: 0, heal: 0, turns: 0, kos: 0, ults: 0 }]));
  const pair = {};
  let totalTurns = 0, timeUps = 0;
  for (let k = 0; k < n; k++) {
    const ids = [...CHARACTERS.map((c) => c.id)].sort(() => Math.random() - 0.5).slice(0, 4);
    const r = battle(ids, maxTurns);
    totalTurns += r.turns;
    if (r.cs.every((c) => c.team !== 0 || c.alive) && r.cs.some((c) => c.team === 1 && c.alive) && r.turns >= maxTurns) timeUps++;
    r.cs.forEach((c, i) => {
      const p = per[c.charId], s = r.st[c.uid];
      p.games++; if (r.winner === c.team) p.wins++; if (r.winner === -1) p.draws++;
      p.dmg += s.dmg; p.heal += s.heal; p.turns += s.turns; p.kos += s.kos; p.ults += s.ults;
      const mate = r.cs[i < 2 ? 1 - i : 5 - i].charId;
      const k = c.charId + ">" + mate; (pair[k] ||= { g: 0, w: 0 }); pair[k].g++; if (r.winner === c.team) pair[k].w++;
    });
  }
  return { per, pair, avgTurns: totalTurns / n };
}

function report(title, { per, pair, avgTurns }) {
  console.log(`\n${title}: ${N} battles, ${avgTurns.toFixed(1)} turns on average`);
  console.log("character   win%   dmg/turn  heal/turn  KOs/game  ults/game   HP  SP  ATK  ult");
  const rows = CHARACTERS.map((c) => ({ c, p: per[c.id], w: (per[c.id].wins + per[c.id].draws / 2) / per[c.id].games }))
    .sort((a, z) => z.w - a.w);
  for (const { c, p, w } of rows) {
    console.log(`${c.id.padEnd(10)} ${(w * 100).toFixed(1).padStart(5)}   ${(p.dmg / p.turns).toFixed(0).padStart(6)}   ${(p.heal / p.turns).toFixed(0).padStart(8)}   ${(p.kos / p.games).toFixed(2).padStart(7)}   ${(p.ults / p.games).toFixed(2).padStart(8)}   ${c.hp} ${c.sp} ${c.atk}  ${c.ultimate.power} ${c.ultimate.archetype}`);
  }
  const ws = rows.map((r) => r.w);
  console.log(`spread: ${((Math.max(...ws) - Math.min(...ws)) * 100).toFixed(1)} points (best − worst)`);
  if (SHOW_PAIRS) for (const c of CHARACTERS) {
    const mates = CHARACTERS.filter((m) => m.id !== c.id).map((m) => ({ m: m.id, w: pair[c.id + ">" + m.id].w / pair[c.id + ">" + m.id].g })).sort((a, z) => z.w - a.w);
    console.log(`  ${c.id.padEnd(8)} best with ${mates[0].m} ${(mates[0].w * 100).toFixed(0)}%, worst with ${mates.at(-1).m} ${(mates.at(-1).w * 100).toFixed(0)}%`);
  }
  return rows;
}

export const KO_TURNS = 400, LIMIT_TURNS = TURNS_8_MIN;
// run from the command line (not when another script imports these functions)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  report("To a knockout", run(KO_TURNS));
  report("With the 8-minute limit", run(LIMIT_TURNS));
}
