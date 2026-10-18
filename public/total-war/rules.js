// Academy Rift: Total War — the rules, shared by the server (which decides everything)
// and the pages (which only draw what the server sends). No DOM, no timers, no randomness.
import { NODES, EDGES, edgeCost } from './movement.js';

export const HOME = 0;                 // Academy Ward: where the class starts and retreats to
export const FORTRESS = 5;             // Crimson Fortress: the gate guardian, then the Warlord
export const QUIZ_PER_MOVE = 3;        // preparing questions each student answers for a move (steps and coins), most of them while the enemy moves
export const QUIZ_BONUS = 20;          // extra coins for getting the first 3 preparing questions of a turn all right
export const PREP_COINS = 20;          // coins for each right preparing answer (the 3 questions before the move used to be separate)
export const TOPUP_SECONDS = 20;       // after the enemy's turn, a short top-up (at most this long) for students who have not answered their 3 yet
export const LATE_TOPUP_SECONDS = 8;   // no new top-up question starts in its last seconds
export const STRATEGY_SECONDS = 5;     // "Plan your move" ends this soon at the earliest once every warband has sent or agreed a route
export const COUNCIL_SECONDS = 30;     // the longest "Plan your move" (the War Council) lasts unless the teacher extends it
export const MARCH_STEP = 0.8;         // seconds a marching banner takes for each road
export const RESUME_SECONDS = 8;       // after winning a fight on the march, the time to choose CARRY ON or STAY HERE
export const REST_HEAL = 3;            // HP a pair gets back each turn it rests at the Academy or a safe camp (a rally point) it holds (otherwise only food heals)
export const ALONG_HIT = 0.75;         // answering along: this many hits for each right answer…
export const ALONG_CAP = 4;            // …counting at most this many in a battle of one or two pairs (a huge warband no longer melts an enemy in one question)
// the cap grows with the warband, so a bigger warband always helps (1.5 more right answers count for each pair after the first two)
export const alongCap = (pairs = 1) => Math.max(ALONG_CAP, Math.round(ALONG_CAP + 1.5 * (pairs - 2)));
export const FORTRESS_GUARDS = 2;      // at most this many Crimson units from the fortress fight in front of the gate or the Warlord
export const WARCRY_CAP = 4;           // at most this many right War Cries count towards one battle question
export const WARCRY_COOLDOWN = 8;      // seconds a student waits for their next War Cry after a wrong one, so guessing does not pay
export const PREP_AP_EACH = 2;         // each student in a pair adds at most this much AP by preparing (a student alone: MUSTER_MP_CAP)
export const SYNC_PER_QUESTION = 16;   // Sync gauge per question when every fighter is right (scaled down by the share right)
export const WATCHTOWER = 2;           // Whispering Watch: a Crystal banner standing on it shows the class the whole Crimson Host (not ambushers)
export const TELEPORT_COST = 2;        // Rift Energy for the teacher to teleport one unit
export const AMBUSH_HIT = 0.25;        // an ambushed warband starts the battle this much down on HP
export const PAIR_WAVE = 0.5;          // chance that the next enemy wave in a battle is two enemies, not one (always two when two pairs or more fight)
export const ENGAGED_SHARE = 0.75;     // a monster's counterattack: this share lands on the pairs engaging it, the rest on the whole warband
export const OUTPOSTS = [2, 8, 6];     // Whispering Watch, Sunken Watch, Silverwood Camp: rally points once the class holds them

export const SIGHT = 2;                // fog of war: students see this many roads beyond any of their banners
export const BASE_MP = 1;              // action points (AP) every pair gets each move, before answering anything
export const MUSTER_MP_CAP = 3;        // most AP a pair can add by preparing: each right answer in the pair is +1 AP
export const PREPARE_SECONDS = 30;     // how long the class prepares (answers questions) while the teacher moves
export const LATE_PREP_SECONDS = 10;   // no new preparing question starts in the last seconds of the prepare time (an open one may finish)
export const MUSTER_PER_TURN = 3;      // muster questions each student answers in a Crimson turn
export const READ_SECONDS = 4;         // Academy Rift's reading time before the choices appear
export const ANSWER_SECONDS = 21;      // Academy Rift's time to answer
export const VOTE_SECONDS = 15;        // a warband's vote closes this long after the first pair votes
export const JOIN_SECONDS = 10;        // nearby warbands can join a battle in this window
export const STACK_LIMIT = 4;          // Crimson units on one stop (the fortress holds more)
export const FORTRESS_LIMIT = 6;
export const WARCRY_HIT = 0.5;         // a right War Cry answer, in hits
export const CAMP_RETURN_TURNS = 3;    // a beaten camp comes back after this many turns
// ---- battles, as in the Arena: one Striker answers each question, everyone else answers it as support ----
export const STRIKE_HITS = 2;          // the Striker's right answer
export const STEAL_HITS = 1;           // the Striker was wrong, and a supporter who was right steals the strike (half power)
export const SUPPORT_HIT = 0.75;       // each supporter's right answer adds this much
export const RESOLVE_PER_PAIR = 10;    // a warband's Resolve in battle; the Crimson hits back after every question
export const GUARD_MAX = 0.6;          // most of a counterattack the warband can block (when every fighter was right)
export const HOLD_BONUS = 0.25;        // a unit that holds its stop for a whole turn is dug in: this much tougher
export const WARD_HP = 24;             // the Academy Ward at the class's own fortress: break it and the Crimson Host wins
// One HP scale on every student screen: a pair has 10 HP inside the game and is shown as 100 (the phone, the map, the
// battle HUD, food). Damage to enemies is shown on the same scale, so a strike (2 hits) shows as 20.
export const HP_SHOW = 10;
export const showHp = (v) => Math.max(0, Math.round((+v || 0) * HP_SHOW));

// ---- the Crimson Host. hp = right answers needed to beat it. speed = stops per Crimson turn ----
export const UNITS = {
  rift_hound:     { name: 'Rift Hound',            cost: 1, hp: 6, atk: 1,  speed: 3, role: 'Fast scout' },
  imp_swarm:      { name: 'Ember Imp Swarm',       cost: 1, hp: 6, atk: 1,  speed: 3, role: 'Flying raiders' },
  goblin_sappers: { name: 'Emberfang Goblin Sappers', cost: 1, hp: 7, atk: 1, siege: 2, speed: 2, role: 'Saboteurs' },
  orc_vanguard:   { name: 'Riftborn Orc Vanguard', cost: 2, hp: 12, atk: 2, speed: 2, role: 'Holds the road' },
  orc_warchanter: { name: 'Orc Warchanter',        cost: 2, hp: 9, atk: 1,  speed: 2, role: 'Makes the others on its stop 25% tougher', aura: 0.25 },
  gargoyle:       { name: 'Crimson Gargoyle',      cost: 2, hp: 13, atk: 2, speed: 1, role: 'Guards a stop' },
  warlock:        { name: 'Riftweaver Warlock',    cost: 2, hp: 10, atk: 2.5, speed: 2, role: 'Spellcaster' },
  hollow_knight:  { name: 'Hollow Knight of the Rift', cost: 3, hp: 18, atk: 3, speed: 1, role: 'Elite defender' },
  ogre:           { name: 'Ironhide Ogre',         cost: 3, hp: 20, atk: 3, siege: 2, speed: 1, role: 'Siege brute' },
  wyvern:         { name: 'Crimson Wyvern',        cost: 3, hp: 16, atk: 3, speed: 3, role: 'Flying raider' },
  golem:          { name: 'Bloodstone Golem',      fixed: true, hp: 45, atk: 6, siege: 2, role: 'Guards the fortress gate' },
  warlord:        { name: 'The Crimson Warlord',   fixed: true, hp: 70, atk: 8, role: 'Commander of the Crimson Host' },
};
export const SUMMONABLE = Object.keys(UNITS).filter((k) => !UNITS[k].fixed);

// ---- jungle camps: beat one and the WHOLE class gets its buff ----
export const CAMPS = {
  11: { id: 'moonhart',    name: 'Moonhart Sentinel',   hp: 12, atk: 2, buff: 'warcry', turns: 2, buffName: 'Moonlight',  buffText: 'War Cries count double for 2 turns',
        lore: 'A spectral stag that has guarded the Moonwell for longer than anyone remembers. Its antlers hold the light of every moon it has seen.' },
  13: { id: 'galecrest',   name: 'Galecrest Roc',       hp: 12, atk: 2, buff: 'mp',     turns: 2, buffName: 'Tailwind',   buffText: 'Every pair gets +1 MP for 2 turns',
        lore: 'It has nested on the Windspire since before the academy was built, and lets no one climb the peak who cannot stand against its gale.' },
  15: { id: 'mossback',    name: 'Mossback Colossus',   hp: 14, atk: 3, buff: 'stand',  turns: 2, buffName: 'Rootstand',  buffText: 'Every battle lasts one more question for 2 turns',
        lore: 'Half stone and half ancient tree, it sleeps in the grove until something disturbs the roots. Then the whole forest wakes with it.' },
  16: { id: 'riftglass',   name: 'Riftglass Basilisk',  hp: 12, atk: 2.5, buff: 'power',  turns: 2, buffName: 'Riftglass Edge', buffText: 'Right answers in battle hit 25% harder for 2 turns',
        lore: 'It grows its crystal fins from the rift-touched rock of the quarry. Miners left the moment its eyes began to glow.' },
  20: { id: 'ferryman',    name: 'Hollow Ferryman',     hp: 12, atk: 2, buff: 'sight',  turns: 2, buffName: 'Soul Lantern', buffText: 'The whole map is revealed for 2 turns',
        lore: 'No one has seen a face inside the bronze helmet. It still rows the drowned halls, lantern raised, looking for passengers.' },
  24: { id: 'broodmother', name: 'Crimson Broodmother', hp: 16, atk: 3, buff: 'siege',  turns: 0, buffName: 'Broken Nest', buffText: 'The gate guardian loses 15 strength',
        lore: 'She spins her webs in the shadow of the Crimson Fortress. Her brood carry its messages, so the fortress weakens when she falls.' },
};

// ---- the map as a graph ----
const ADJ = NODES.map(() => []);
for (const [a, b] of EDGES) { ADJ[a].push(b); ADJ[b].push(a); }
export const neighbours = (n) => ADJ[n] || [];
export const isAdjacent = (a, b) => neighbours(a).includes(b);
export const cost = (a, b) => edgeCost(a, b);

// roads between every pair of stops, by count of roads (not MP)
export function hops(from) {
  const d = new Map([[from, 0]]), q = [from];
  while (q.length) { const a = q.shift(); for (const b of neighbours(a)) if (!d.has(b)) { d.set(b, d.get(a) + 1); q.push(b); } }
  return d;
}

// What the class can see: SIGHT roads around every Crystal banner and rally point, plus both fortresses.
export function visibleNodes(bandNodes, { rally = [], sightAll = false } = {}) {
  if (sightAll) return new Set(NODES.map((_, i) => i));
  const v = new Set([HOME, FORTRESS, ...rally]);
  for (const n of bandNodes) for (const [m, d] of hops(n)) if (d <= SIGHT) v.add(m);
  return v;
}

// The stops a warband with `mp` could reach, by cheapest cost, stopping at anything that blocks (enemies, camps)
export function reachable(from, mp, blocked = () => false) {
  const dist = new Map([[from, 0]]), q = [from];
  while (q.length) {
    q.sort((a, b) => dist.get(a) - dist.get(b));
    const a = q.shift();
    if (a !== from && blocked(a)) continue;            // you can step onto a blocker (that is an attack) but not past it
    for (const b of neighbours(a)) {
      const d = dist.get(a) + cost(a, b);
      if (d <= mp && (!dist.has(b) || d < dist.get(b))) { dist.set(b, d); q.push(b); }
    }
  }
  dist.delete(from);
  return dist;
}

// Next step from `from` towards `to` along the fewest roads (used by the teacher's Auto)
export function stepTowards(from, to, canEnter = () => true) {
  const prev = new Map([[from, null]]), q = [from];
  while (q.length) {
    const a = q.shift(); if (a === to) break;
    for (const b of neighbours(a)) if (!prev.has(b) && (b === to || canEnter(b))) { prev.set(b, a); q.push(b); }
  }
  if (!prev.has(to)) return null;
  let s = to; while (prev.get(s) !== from && prev.get(s) !== null) s = prev.get(s);
  return s === from ? null : s;
}

// The nearest place a beaten warband falls back to
export function nearestRally(from, rally = []) {
  const d = hops(from); let best = HOME, bd = d.get(HOME) ?? 99;
  for (const r of rally) { const x = d.get(r); if (x != null && x < bd) { best = r; bd = x; } }
  return best;
}

// A warband's vote. votes: { pairId: nodeIndex | 'stay' }. order: pair ids, leader first.
// Most votes wins; a tie goes to the leader's choice if it is one of the tied, else the earliest-listed tied choice.
export function tallyVotes(votes, order) {
  const count = new Map();
  for (const pid of order) if (votes[pid] !== undefined) count.set(votes[pid], (count.get(votes[pid]) || 0) + 1);
  if (!count.size) return null;
  const top = Math.max(...count.values());
  const tied = [...count.keys()].filter((k) => count.get(k) === top);
  if (tied.length === 1) return tied[0];
  const lead = votes[order[0]];
  if (tied.includes(lead)) return lead;
  for (const pid of order) if (tied.includes(votes[pid])) return votes[pid];
  return tied[0];
}

// Action points (AP) for a pair at the start of its move: 1, plus 1 for every right answer while preparing (up to +3)
export function pairMP(musterCorrect, buffs = {}) {
  return BASE_MP + Math.min(MUSTER_MP_CAP, musterCorrect) + (buffs.mp ? 1 : 0);
}

// Rift Energy the teacher gets each Crimson turn, and how much may be kept for later
export const energyPerTurn = (pairs) => 4 + Math.floor(pairs / 3);
export const energyCarry = 3;

// A Warchanter makes every OTHER unit on its stop this much tougher in battle (0 when there is none)
export function auraFor(units) {
  return units.some((u) => UNITS[u.type]?.aura) ? UNITS.orc_warchanter.aura : 0;
}

// Questions a battle lasts (5, 7 at the gate, 8 against the Warlord), so a whole war fits a lesson
export function battleLength(kind, buffs = {}) {
  const base = kind === 'boss' ? 8 : kind === 'gate' ? 7 : 5;
  return base + (buffs.stand ? 1 : 0);
}

// Hits from one question: the Striker (or a stolen strike), right answers by supporters, plus War Cries
export function questionHits({ strike = false, steal = false, support = 0, warcry = 0 }, buffs = {}) {
  const power = buffs.power ? 1.25 : 1;
  const cry = WARCRY_HIT * (buffs.warcry ? 2 : 1);
  const main = strike ? STRIKE_HITS : steal ? STEAL_HITS : 0;
  return (main + support * SUPPORT_HIT) * power + warcry * cry;
}

// The Crimson hits back after every question: every enemy still standing attacks the warband's Resolve.
// The more of the warband answered right, the more of the blow it blocks.
export function counterAttack(enemies, rightFraction = 0) {
  const guard = GUARD_MAX * Math.max(0, Math.min(1, rightFraction));
  const blows = enemies.filter((e) => e.hp > 0).map((e) => ({ type: e.type, dmg: +((e.atk || 1) * (1 - guard)).toFixed(2) }));
  return { blows, guard, total: +blows.reduce((n, b) => n + b.dmg, 0).toFixed(2) };
}
// How far the class got, for a war that ends on time or on turns: 'crystal' when the gate is broken and the Warlord
// is at half strength or less, 'draw' when only the gate is broken, else 'crimson'. pct is the share of the way (0-100).
export function progressResult({ gateHp, gateMax, broken, warlordHp, warlordMax }) {
  const g = broken ? 1 : 1 - gateHp / (gateMax || 1), w = broken ? 1 - warlordHp / (warlordMax || 1) : 0;
  const pct = Math.round(50 * g + 50 * w);
  return { winner: broken && warlordHp <= warlordMax / 2 ? 'crystal' : broken ? 'draw' : 'crimson', pct };
}
export const resolveFor = (pairs) => RESOLVE_PER_PAIR * Math.max(1, pairs);
// siege damage a unit does to the Academy Ward each turn it stands at the class's fortress
export const siegeOf = (type) => (UNITS[type]?.atk || 1) * (UNITS[type]?.siege || 1);

// Each pair in a battle engages one monster on the field. A pair with no target (or whose monster fell) goes to the
// monster the fewest pairs are engaging (ties: the one listed first). targets: { pairId: index }. Returns the new map.
export function assignTargets(pairIds, field, targets = {}, alive = () => true) {
  const live = field.filter(alive), out = {};
  if (!live.length) return { ...targets };
  const load = new Map(live.map((i) => [i, 0]));
  for (const p of pairIds) if (load.has(targets[p])) { out[p] = targets[p]; load.set(targets[p], load.get(targets[p]) + 1); }
  for (const p of pairIds) if (out[p] === undefined) {
    let best = live[0];
    for (const i of live) if (load.get(i) < load.get(best)) best = i;
    out[p] = best; load.set(best, load.get(best) + 1);
  }
  return out;
}
// A monster's counterattack split over the pairs: ENGAGED_SHARE of each blow on the pairs engaging that monster, the
// rest on every pair still standing. Damage a pair cannot take (it is at 0 HP) goes on to the others, so the warband
// as a whole always takes the full blow. blows: [{ index, dmg }]; hp: { pairId: hp }. Returns { pairId: damage }.
export function splitCounter(blows, targets, hp) {
  const taken = Object.fromEntries(Object.keys(hp).map((p) => [p, 0]));
  const add = (amount, pairs) => {
    let left = amount, list = pairs.filter((p) => hp[p] - taken[p] > 1e-9);
    for (let k = 0; k < 8 && left > 1e-9 && list.length; k++) {
      const each = left / list.length; left = 0;
      for (const p of list) { const room = hp[p] - taken[p], d = Math.min(room, each); taken[p] += d; left += each - d; }
      list = list.filter((p) => hp[p] - taken[p] > 1e-9);
      if (!list.length && left > 1e-9) list = Object.keys(hp).filter((p) => hp[p] - taken[p] > 1e-9);
    }
    return left;
  };
  const all = Object.keys(hp);
  for (const b of blows) {
    const on = all.filter((p) => targets[p] === b.index && hp[p] - taken[p] > 1e-9);
    const main = on.length ? b.dmg * ENGAGED_SHARE : 0;
    const rest = add(main, on);
    add(b.dmg - main + rest, all);
  }
  for (const p of all) taken[p] = +taken[p].toFixed(2);
  return taken;
}

// Deal hits to the enemies front to back. Returns a new list and how many fell.
export function dealHits(enemies, hits) {
  let left = hits, fallen = 0;
  const out = enemies.map((e) => ({ ...e }));
  for (const e of out) {
    if (left <= 0) break;
    if (e.hp <= 0) continue;
    const take = Math.min(e.hp, left); e.hp = +(e.hp - take).toFixed(2); left -= take;
    if (e.hp <= 0) { e.hp = 0; fallen++; }
  }
  return { enemies: out, fallen, beaten: out.every((e) => e.hp <= 0) };
}

export const nodeName = (n) => NODES[n]?.name || '?';

// ---- joining a battle that is still being fought (reinforcements), regrouping, and battles that run long ----
// A pair whose battle has just ended (won or lost) may join any other battle the class is still fighting, anywhere on
// the map. It fights from where it stands (its banner does not move), with its own HP, and takes strike turns.
export const REINFORCE_SECONDS = 30;   // how long after its battle ends a pair may still join another battle
export const REINFORCE_MAX = 3;        // at most this many pairs can join one battle this way
export const REINFORCE_ATK = 0.15;     // each joined pair with a right answer this question: the battle hits this much harder…
export const REINFORCE_GUARD = 0.10;   // …and the damage the warband takes is this much lower
export const REINFORCE_ATK_CAP = 0.30, REINFORCE_GUARD_CAP = 0.20;
// The reinforcement bonus for one question, from how many joined pairs answered it right
export function reinforceBonus(rightPairs = 0) {
  const k = Math.max(0, Math.floor(+rightPairs || 0));
  return { pairs: k, atk: +Math.min(REINFORCE_ATK_CAP, k * REINFORCE_ATK).toFixed(2), guard: +Math.min(REINFORCE_GUARD_CAP, k * REINFORCE_GUARD).toFixed(2) };
}
export const REGROUP_STEPS = 3;        // after a battle (or any time) a pair can set off to join a warband this many steps away
// After the march the class waits for its battles (and answers War Cries for them) for at most BATTLE_WAIT_SECONDS. A
// battle that runs longer no longer holds up the class: the rest of the class carries on with the next turn.
export const BATTLE_WAIT_SECONDS = 60;
// A pair whose battle ran on while the class answered its preparing questions gets at least LATE_STEPS for its move. A
// pair whose battle ran past the whole of "Plan your move" plans its own move as soon as the battle ends
// (LATE_PLAN_SECONDS, whatever the class is doing) and marches by itself.
export const LATE_STEPS = 2;
export const LATE_PLAN_SECONDS = 15;

// ---- Grab-Ma's food in Total War: what each item does here (the Arena's own text is in data/characters.js) ----
// heal and eat are in pair HP (10 inside the game, shown x10). In battle a warband shares one HP pool, so food heals
// every pair in the warband by the same amount (the server multiplies by the number of pairs).
export const TW_ITEMS = {
  bento:   { price: 120, eat: 4, heal: 4, desc: 'Heals your pair 40 HP, in a battle or between battles.' },
  energy:  { price: 100, desc: 'In battle it gives you 150 SP (energy for skills), so you can use more skills.' },
  revive:  { price: 250, eat: 'full', heal: 5, desc: 'Between battles it brings your pair back to 100 HP. In a battle it heals your pair 50 HP.' },
  shield:  { price: 150, desc: 'In battle the next time the enemy hits back, it does half damage.' },
  crystal: { price: 220, desc: 'In battle it fills your warband\'s Sync bar by 30. A full Sync bar unlocks your Ultimate.' },
  tonic:   { price: 140, eat: 3, heal: 3, desc: 'Heals your pair 30 HP. In a battle the enemy also hits back weaker for 2 questions.' },
  chilli:  { price: 160, desc: 'Use it as your move in battle: a strike that does 50% more damage (30 instead of 20).' },
  durian:  { price: 180, desc: 'Use it as your move in battle: 40 damage to your target and 10 to the enemy beside it.' },
};
