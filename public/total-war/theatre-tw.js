// Total War's battles in the Academy Rift battle theatre (../theatre/engine.js): the same strikes, skills,
// Ultimates and effects as the Arena, played against the Crimson Host's PixelLab monsters, then the
// monster hitting back. The game stays the boss of every number: this only plays back what the server decided.
import { backdropFor } from './stage.js';

const TH = window.Theatre || null;
const LAB = { jun: 'J', kuro: 'K', emi: 'E', saya: 'S', raiden: 'R', nao: 'N', taiga: 'T', hina: 'H', mina: 'M', renji: 'X' };
const BGS = ['forest', 'bridge', 'ruins', 'lair', 'gate', 'academy'];
export const SCALE = 100;            // battles count in hits; they are shown at Arena scale (a strike is about 200)
let ready = null, gen = 0;
const registered = new Set();

export function initTheatre(host) {
  if (!TH) return null;
  if (!ready) {
    const stages = BGS.flatMap((n) => [1, 2, 3, 4, 5].map(() => `total-war/art/bg/${n}.webp`));
    ready = TH.init({ base: '../', stages });
    document.addEventListener('pointerdown', () => TH.unlock(), { capture: true, once: false });
  }
  if (host && TH.canvas.parentNode !== host) host.appendChild(TH.canvas);
  return ready;
}
function monster(type) {
  if (registered.has(type)) return;
  registered.add(type);
  TH.registerMonster(type, { idle: `total-war/monsters/anim/${type}_idle.webp`, atk: `total-war/monsters/anim/${type}_atk.webp`, idleN: 8, atkN: 9 });
}
const stageOf = (node, kind) => Math.max(0, BGS.indexOf(backdropFor(node, kind)));

// Load what a battle needs before its first move, so nothing stalls mid-fight.
export async function prepareBattle(B, chars) {
  if (!TH) return;
  await initTheatre();
  for (const e of B.enemies) monster(e.type);
  const st = stageOf(B.node, B.kind);
  try { await TH.prepare([...chars.map((c) => LAB[c]), ...B.enemies.map((e) => e.type)], st * 5); } catch {}
}

// One question's result: the student's move (if anyone got it right), then the Crimson hitting back.
// me: the viewer's own fighter (shown when nobody had a move to play).
export async function playRound(B, r, me) {
  if (!TH) return false;
  const my = ++gen;
  await initTheatre();
  const target = B.enemies[r.target ?? 0]?.type || B.enemies[0]?.type;
  if (!target) return false;
  for (const e of B.enemies) monster(e.type);
  const stage = stageOf(B.node, B.kind);
  const a = r.action;
  const actor = LAB[a?.char] || LAB[me] || 'K', ally = a ? LAB[a.ally] || null : null;
  try { await TH.prepare([actor, ally, target], stage * 5); } catch {}
  if (a && !B.__gone) {
    const kind = a.kind === 'ult' ? 'ult' : a.kind === 'skill' ? 'skill' : 'strike';
    await TH.play({ actor, ally, target, kind, index: a.index, stage, level: 1, dmg: a.kind === 'item' && !r.mainHits ? null : Math.round(r.mainHits * SCALE),
      heals: r.heal ? [Math.round(r.heal * SCALE)] : [], ko: r.enemiesAfter?.[r.target]?.hp <= 0 });
  }
  if (my !== gen) return false;                      // skipped: the next question has started
  if (r.counterTotal > 0 || r.stunned) {
    await TH.counter({ actor, ally, target, stage, level: 1, dmg: Math.round(r.counterTotal * SCALE), blocked: Math.round((r.guard || 0) * 100), stunned: r.stunned });
  }
  return true;
}
export const skip = () => { gen++; TH?.skip(); };
export const hasTheatre = () => !!TH;
