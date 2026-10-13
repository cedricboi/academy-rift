// ===== Academy Rift — combat rules =====
// What every move does: damage, skills, items and Ultimates. Used by the game
// server (server.js) and by the balance simulator (tools/balance.mjs), so the
// simulator measures exactly the rules students play with.
// `room` only needs { battle: { combatants, order, sync }, practice? }.
import { effectiveness } from "./public/data/characters.js";

// ---- tuning ----
export const CORRECT_MULT = 1.22;          // a correct answer empowers your action (was 1.35)
export const SP_DMG_SCALE = 140;           // higher-SP skills hit harder: power * (1 + sp/SP_DMG_SCALE)
export const DMG_SCALE = 0.62;             // global damage scale — lower = longer battles (0.55 before the character balance in Oct 2026)
export const CRIT_CHANCE = 0.07;           // chance any hit crits (was 0.10)
export const CRIT_MULT = 1.25;             // crit damage multiplier (was 1.5)
export const SYNC_CORRECT = 25, SYNC_WEAK = 18, SYNC_SUPPORT = 14, SYNC_TEAM = 22; // kept for older tools; the gauge now fills from answer streaks (server.js teamStreak)
export const DEFAULT_ITEMS = { bento: 1, energy: 1, revive: 1 };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// A fighter at the start of a battle, from a character's data.
export function makeCombatant(base, p, hintsLeft = 0) {
  return {
    uid: p.id, name: p.name, bot: p.bot, team: p.team,
    charId: base.id, charName: base.name, element: base.element, role: base.role,
    weakTo: base.weakTo, resists: base.resists,
    maxHp: base.hp, hp: base.hp, maxSp: base.sp, sp: base.sp, atk: base.atk,
    skills: base.skills, ultimate: base.ultimate,
    alive: true, defending: false, shield: false, atkBuff: 0,
    cooldowns: {},       // skillIndex → turns remaining
    // status effects (turns remaining); decremented at the start of each own turn
    atkUpTurns: 0, defUpTurns: 0, atkDownTurns: 0, defDownTurns: 0, accDownTurns: 0,
    timerDownTurns: 0, accProtectTurns: 0, stunned: false,
    items: { ...DEFAULT_ITEMS }, _correct: false,
    hintsLeft, _hinted: false,
  };
}

// tick down all timed status effects on a combatant
export function decStatuses(c) {
  for (const k of ["atkUpTurns", "defUpTurns", "atkDownTurns", "defDownTurns", "accDownTurns", "timerDownTurns", "accProtectTurns"]) {
    if (c[k] > 0) c[k]--;
  }
}


// The first fighter, in turn order from the next turn on, that matches `test`.
// b.ptr is where the turn order carries on from.
export function nextToAct(b, test) {
  const n = b.order.length, from = b.ptr || 0;
  for (let i = 0; i < n; i++) { const c = b.combatants[b.order[(from + i) % n]]; if (c && test(c)) return c; }
  return null;
}

export function enemiesOf(b, team) { return b.order.map((u) => b.combatants[u]).filter((c) => c.team !== team && c.alive); }
export function alliesOf(b, team) { return b.order.map((u) => b.combatants[u]).filter((c) => c.team === team); }

export function resolveAction(room, actor, action) {
  const b = room.battle;
  const cm = actor._correct && !actor._hinted ? CORRECT_MULT : 1;   // a right answer powers up the move, unless a hint was used
  const events = [];
  const enemies = enemiesOf(b, actor.team);
  const allies = alliesOf(b, actor.team);
  const pickEnemy = (id) => b.combatants[id] && b.combatants[id].alive && b.combatants[id].team !== actor.team
    ? b.combatants[id] : (enemies[0] || null);
  const fizzle = () => [{ kind: "fizzle", target: actor.uid }];   // wrong answer → attack fails
  const isOffSkill = (sk) => sk && (sk.kind === "atk" || sk.kind === "heavy" || sk.kind === "debuff");
  // accuracy debuff: 25% chance an offensive action whiffs (unless protected by Clarity Field)
  const misses = () => actor.accDownTurns > 0 && actor.accProtectTurns <= 0 && Math.random() < 0.25;
  const allyTarget = (id) => (b.combatants[id] && b.combatants[id].team === actor.team ? b.combatants[id] : actor);

  if (action.type === "strike") {
    if (!actor._correct) return fizzle();
    if (misses()) return [{ kind: "fizzle", target: actor.uid, miss: true }];
    const t = pickEnemy(action.targetId); if (!t) return events;
    events.push(damage(room, actor, t, actor.atk, actor.element, cm));
  } else if (action.type === "spell") {
    const sk = actor.skills[action.skillIndex]; if (!sk) return events;
    if ((actor.cooldowns[action.skillIndex] || 0) > 0) return fizzle(); // on cooldown
    if (isOffSkill(sk) && !actor._correct) return fizzle();
    if (actor.sp < sk.sp) { // not enough SP -> weak strike fallback (still needs a correct answer)
      if (!actor._correct) return fizzle();
      const t = pickEnemy(action.targetId);
      if (t) events.push(damage(room, actor, t, actor.atk * 0.6, actor.element, cm));
      return events;
    }
    if (isOffSkill(sk) && misses()) { actor.sp -= sk.sp; return [{ kind: "fizzle", target: actor.uid, miss: true }]; }
    actor.sp -= sk.sp;
    if ((sk.cd || 0) > 0) actor.cooldowns[action.skillIndex] = sk.cd;   // start cooldown

    if (sk.kind === "atk" || sk.kind === "heavy") {
      const t = pickEnemy(action.targetId);
      const power = sk.power * (1 + sk.sp / SP_DMG_SCALE);   // more SP invested = more damage
      if (t) events.push(damage(room, actor, t, power, sk.element, cm));

    } else if (sk.kind === "heal") {
      const t = allyTarget(action.targetId);
      const amt = Math.round(sk.power * cm);
      t.hp = Math.min(t.maxHp, t.hp + amt); if (t.hp > 0) t.alive = true;
            events.push({ target: t.uid, heal: amt, kind: "heal" });

    } else if (sk.kind === "buff") {
            if (sk.eff === "atk") { actor.atkUpTurns = 1; events.push({ target: actor.uid, kind: "buff", eff: "atk" }); }
      else if (sk.eff === "def") { actor.defUpTurns = 1; events.push({ target: actor.uid, kind: "buff", eff: "def" }); }
      else if (sk.eff === "accuracy") { allies.filter((a) => a.alive).forEach((a) => { a.accProtectTurns = 1; events.push({ target: a.uid, kind: "buff", eff: "acc" }); }); }
      else { actor.atkBuff += 20; events.push({ target: actor.uid, kind: "buff" }); }

    } else if (sk.kind === "guard") {
            const targets = sk.target === "party" ? allies.filter((a) => a.alive) : [actor];
      targets.forEach((t) => { t.defUpTurns = Math.max(t.defUpTurns, 1); events.push({ target: t.uid, kind: "guard" }); });

    } else if (sk.kind === "cleanse") {
            const t = allyTarget(action.targetId);
      t.atkDownTurns = 0; t.defDownTurns = 0; t.accDownTurns = 0; t.timerDownTurns = 0;
      events.push({ target: t.uid, kind: "cleanse" });

    } else if (sk.kind === "debuff") {
      const t = pickEnemy(action.targetId);
      if (t) {
        if (sk.power > 0) events.push(damage(room, actor, t, sk.power, sk.element, cm, { debuff: true }));
        if (sk.eff === "timer") t.timerDownTurns = 2;
        else if (sk.eff === "accuracy") t.accDownTurns = 2;
        else if (sk.eff === "atk") t.atkDownTurns = 2;
        else if (sk.eff === "def") t.defDownTurns = 2;
        events.push({ target: t.uid, kind: "debuff", eff: sk.eff });
      }
    }
  } else if (action.type === "defend") {
    actor.defending = true; events.push({ target: actor.uid, kind: "defend" });
  } else if (action.type === "item") {
    events.push(...useItem(room, actor, action.itemId, action.targetId, cm));
  } else if (action.type === "tag") {
    events.push({ target: actor.uid, kind: "tag" });
  } else if (action.type === "ultimate") {
    if (!actor._correct) return fizzle();
    if (b.sync[actor.team] < 100) return events;            // team sync gauge must be full
    b.sync[actor.team] = 0;                                  // consume the whole team's gauge
    b.stageLevel = Math.min(5, (b.stageLevel || 1) + 1);     // every Ultimate breaks the stage a step further
    const ult = actor.ultimate, arch = ult.archetype || "damage";
    if (arch === "heal") {                                   // hybrid: heal both allies + damage enemies
      const half = ult.power / 2;
      allies.filter((a) => a.alive).forEach((a) => { const amt = Math.round(half * cm); a.hp = Math.min(a.maxHp, a.hp + amt); events.push({ target: a.uid, heal: amt, kind: "heal" }); });
      enemies.forEach((t) => events.push(damage(room, actor, t, half, actor.element, cm, { ult: true })));
    } else if (arch === "shield") {                          // hybrid: shield both allies (2t) + damage enemies
      allies.filter((a) => a.alive).forEach((a) => { a.defUpTurns = Math.max(a.defUpTurns, 2); events.push({ target: a.uid, kind: "guard" }); });
      enemies.forEach((t) => events.push(damage(room, actor, t, ult.power, actor.element, cm, { ult: true })));
    } else if (arch === "stun") {                            // hits both enemies; the one who acts next misses that turn
      enemies.forEach((t) => events.push(damage(room, actor, t, ult.power, actor.element, cm, { ult: true })));
      const next = nextToAct(b, (c) => c.team !== actor.team && c.alive);
      if (next) { next.stunned = true; events.push({ target: next.uid, kind: "stun" }); }
    } else {                                                 // pure damage
      enemies.forEach((t) => events.push(damage(room, actor, t, ult.power, actor.element, cm, { ult: true })));
    }
    events.push({ kind: "ultimate", name: ult.name, actor: actor.uid });
  }
  return events;
}

export function damage(room, actor, target, basePower, element, correctMult, opts = {}) {
  const eff = effectiveness(element, target);
  const crit = Math.random() < CRIT_CHANCE ? CRIT_MULT : 1;
  const defMult = target.defending ? 0.5 : 1;
  const shieldMult = target.shield ? 0.5 : 1;
  const variance = 0.9 + Math.random() * 0.2;
  // attacker mods: legacy +atkBuff%, Overcharge (+25%), Permafrost ATK-down (−25%)
  const buffMult = (1 + actor.atkBuff / 100) * (actor.atkUpTurns > 0 ? 1.25 : 1) * (actor.atkDownTurns > 0 ? 0.75 : 1);
  // target mods: guard/Iron Stand DEF-up (−30%), Guard Break DEF-down (+25%)
  const incomingMult = (target.defUpTurns > 0 ? 0.7 : 1) * (target.defDownTurns > 0 ? 1.25 : 1);
  const halfPowerMult = actor._halfPower ? 0.5 : 1;   // steal penalty
  let dmg = basePower * eff.mult * correctMult * crit * defMult * shieldMult * incomingMult * variance * buffMult * DMG_SCALE * halfPowerMult;
  dmg = Math.max(1, Math.round(dmg));
  target.hp = Math.max(0, target.hp - dmg);
  if (room.practice && target.team === 0) target.hp = Math.max(1, target.hp);   // practice: your team can't be knocked out
  if (target.shield) target.shield = false;
  if (target.hp <= 0) target.alive = false;
  return { target: target.uid, dmg, eff: eff.tag, crit: crit > 1, ko: !target.alive, kind: opts.ult ? "ult" : "hit" };
}

export function useItem(room, actor, itemId, targetId, cm) {
  const b = room.battle; const events = [];
  if (!actor.items[itemId] || actor.items[itemId] <= 0) return events;
  const ally = b.combatants[targetId] && b.combatants[targetId].team === actor.team ? b.combatants[targetId] : actor;
  if (itemId === "bento") { const a = 500; ally.hp = Math.min(ally.maxHp, ally.hp + a); if (ally.hp > 0) ally.alive = true; events.push({ target: ally.uid, heal: a, kind: "heal" }); }
  else if (itemId === "energy") { ally.sp = Math.min(ally.maxSp, ally.sp + 150); events.push({ target: ally.uid, kind: "sp", sp: 150 }); }
  else if (itemId === "shield") { ally.shield = true; events.push({ target: ally.uid, kind: "guard" }); }
  else if (itemId === "crystal") { addSync(room, actor.team, 40); events.push({ target: actor.uid, kind: "sync" }); }
  else if (itemId === "revive") { const dead = alliesOf(b, actor.team).find((c) => !c.alive); if (dead) { dead.alive = true; dead.hp = Math.round(dead.maxHp * 0.5); events.push({ target: dead.uid, kind: "revive", heal: dead.hp }); } }
  actor.items[itemId]--;
  return events;
}

export function addSync(room, team, amt) { room.battle.sync[team] = clamp(room.battle.sync[team] + amt, 0, 100); }
