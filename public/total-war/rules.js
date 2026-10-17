// Academy Rift: Total War — the rules, shared by the server (which decides everything)
// and the pages (which only draw what the server sends). No DOM, no timers, no randomness.
import { NODES, EDGES, edgeCost } from './movement.js';

export const HOME = 0;                 // Crystal Fortress: where the class starts and retreats to
export const FORTRESS = 5;             // Crimson Fortress: the gate guardian, then the Warlord
export const QUIZ_PER_MOVE = 3;        // the class's move opens with 3 questions each (coins for right answers), then the map
export const QUIZ_BONUS = 20;          // extra coins for getting all 3 right
export const STRATEGY_SECONDS = 25;    // the War Council: at least this long to plan routes and order food before banners can march
export const COUNCIL_SECONDS = 45;     // the longest a War Council lasts unless the teacher extends it
export const MARCH_STEP = 1.6;         // seconds a marching banner takes for each road
export const REST_HEAL = 3;            // HP a pair gets back each turn it rests at the Academy or a rally point it holds (otherwise only food heals)
export const ALONG_HIT = 0.75;         // answering along: this many hits for each right answer…
export const ALONG_CAP = 4;            // …counting at most this many (a huge warband no longer melts an enemy in one question)
export const SYNC_PER_QUESTION = 16;   // Sync gauge per question when every fighter is right (scaled down by the share right)
export const WATCHTOWER = 2;           // Whispering Watch: a Crystal banner standing on it shows the class the whole Crimson Host (not ambushers)
export const TELEPORT_COST = 2;        // Rift Energy for the teacher to teleport one unit
export const AMBUSH_HIT = 0.25;        // an ambushed warband starts the battle this much down on HP
export const PAIR_WAVE = 0.5;          // chance that the next enemy wave in a battle is two enemies, not one
export const OUTPOSTS = [2, 8, 6];     // Whispering Watch, Sunken Watch, Silverwood Camp: rally points once the class holds them

export const SIGHT = 2;                // fog of war: students see this many roads beyond any of their banners
export const BASE_MP = 1;              // action points (AP) every pair gets each move, before answering anything
export const MUSTER_MP_CAP = 3;        // most AP a pair can add by preparing: each right answer in the pair is +1 AP
export const PREPARE_SECONDS = 30;     // how long the class prepares (answers questions) while the teacher moves
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

// Questions a battle lasts (8, 10 at the gate, 12 against the Warlord)
export function battleLength(kind, buffs = {}) {
  const base = kind === 'boss' ? 12 : kind === 'gate' ? 10 : 8;   // two more questions than at first, to make up for the 30-second prepare
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
export const resolveFor = (pairs) => RESOLVE_PER_PAIR * Math.max(1, pairs);
// siege damage a unit does to the Academy Ward each turn it stands at the class's fortress
export const siegeOf = (type) => (UNITS[type]?.atk || 1) * (UNITS[type]?.siege || 1);

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
