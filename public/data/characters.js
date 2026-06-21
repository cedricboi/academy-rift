// ===== Academy Rift — shared game data (public stats; safe for client) =====
// Imported by BOTH the server (authoritative combat) and the client (display).
// Question ANSWERS live server-side only (questions.js), never here.
// Skills/ultimates match the official character sheet (Game Data Final).

export const ELEMENTS = [
  "Fire", "Ice", "Electric", "Wind", "Light",
  "Shadow", "Earth", "Mind", "Water", "Metal",
];

export const ELEMENT_COLORS = {
  Fire: "#FF4D2E", Ice: "#5FD0FF", Electric: "#FFD23F", Wind: "#7CF29B",
  Light: "#FFE9A8", Shadow: "#A855F7", Earth: "#C9863F", Mind: "#FF7BE0",
  Water: "#38B6FF", Metal: "#B8C2CC",
};

// Per-character weakness/resistance drive damage effectiveness (source of truth).
// skill: { name, sp, power, kind, element, cd, target?, eff?, desc }
//   kind:   atk | heavy | heal | buff | guard | debuff | cleanse
//   target: "self" | "party" | "ally" | "enemy"   (scope for guard/buff/heal)
//   eff:    "atk" | "def" | "accuracy" | "timer"   (sub-effect for buff/debuff)
//   cd:     cooldown in turns (0 = every turn)
// ultimate: { name, power, archetype }  — cost 0 SP; gated by TEAM Sync gauge (100 → 0)
//   archetype: "damage" | "stun" | "heal" | "shield"
export const CHARACTERS = [
  {
    id: "jun", name: "Jun Kisaragi", element: "Fire", role: "Attacker",
    weakTo: "Ice", resists: ["Shadow"], hp: 1180, sp: 320, atk: 205,
    skills: [
      { name: "Ember Slash",   sp: 20, power: 250, kind: "atk",   element: "Fire", cd: 0, desc: "A quick, cocky flick of the wrist. The blade barely catches fire — but then again, Jun barely needs it to. Deals Fire damage to one enemy." },
      { name: "Flame Break",   sp: 35, power: 350, kind: "atk",   element: "Fire", cd: 0, desc: "Jun shatters a wall of compressed fire around his blade, engulfing the target in rolling heat. Deals Fire damage to one enemy." },
      { name: "Scorch Drive",  sp: 55, power: 500, kind: "heavy", element: "Fire", cd: 2, desc: "Jun channels every ember of his core flame into one forward thrust. The smoke clears; the crater stays. Deals heavy Fire damage to one enemy." },
      { name: "Burning Cover", sp: 30, power:   0, kind: "guard", element: "Fire", cd: 1, target: "party", desc: "Jun steps in front of his partner and throws up a curved wall of fire. Reduces damage taken by both allies by 30% for 1 turn." },
    ],
    ultimate: { name: "Crimson Verdict", power: 800, archetype: "damage" },
  },
  {
    id: "saya", name: "Saya Mizuno", element: "Ice", role: "Control",
    weakTo: "Electric", resists: ["Fire"], hp: 1150, sp: 360, atk: 175,
    skills: [
      { name: "Frost Pin",        sp: 18, power: 230, kind: "atk",    element: "Ice", cd: 0, desc: "Saya flicks a sliver of ice with two fingers — insultingly small, right up until the frostbite spreads. Deals Ice damage to one enemy." },
      { name: "Crystal Lock",     sp: 34, power: 320, kind: "debuff", element: "Ice", cd: 1, eff: "timer", desc: "Saya encases the enemy's joints in crystalline ice. Their thoughts move; their hands don't. Deals Ice damage and cuts the enemy's answer time by 4s for 2 turns." },
      { name: "Snow Veil",        sp: 28, power:   0, kind: "guard",  element: "Ice", cd: 1, target: "self", desc: "A swirling curtain of fine snow rises around Saya, softening incoming force. Reduces damage Saya takes by 30% for 1 turn." },
      { name: "Permafrost Field", sp: 40, power:   0, kind: "debuff", element: "Ice", cd: 1, eff: "atk", desc: "The ground beneath the enemy becomes a sheet of treacherous black ice. Lowers the enemy's ATK by 25% for 2 turns." },
    ],
    ultimate: { name: "Zero Hour Prism", power: 760, archetype: "stun" },
  },
  {
    id: "raiden", name: "Raiden Aoki", element: "Electric", role: "Burst",
    weakTo: "Earth", resists: ["Wind"], hp: 1150, sp: 310, atk: 210,
    skills: [
      { name: "Spark Step",   sp: 18, power: 240, kind: "atk",    element: "Electric", cd: 0, desc: "Raiden closes the distance in a flash of static, arriving before the sound does. Deals Electric damage to one enemy." },
      { name: "Static Rush",  sp: 55, power: 495, kind: "heavy",  element: "Electric", cd: 2, desc: "Raiden discharges every volt in his body at once. The shockwave rattles the ground and the air alike. Deals heavy Electric damage to one enemy." },
      { name: "Overcharge",   sp: 30, power:   0, kind: "buff",   element: "Electric", cd: 1, eff: "atk", target: "self", desc: "Raiden's circuits overload on purpose, blue arcs dancing up his arms. Raises Raiden's ATK by 25% for 1 turn." },
      { name: "Static Pulse", sp: 32, power: 280, kind: "debuff", element: "Electric", cd: 1, eff: "timer", desc: "A burst of electromagnetic interference scrambles the enemy's signals. Deals Electric damage and cuts the enemy's answer time by 4s for 2 turns." },
    ],
    ultimate: { name: "Final Circuit", power: 790, archetype: "damage" },
  },
  {
    id: "nao", name: "Nao Kazehara", element: "Wind", role: "Evasion",
    weakTo: "Electric", resists: ["Earth"], hp: 1120, sp: 340, atk: 190,
    skills: [
      { name: "Razor Breeze",  sp: 18, power: 240, kind: "atk",    element: "Wind", cd: 0, desc: "A thin crescent of wind follows Nao's blade, arriving a half-second after the cut. Deals Wind damage to one enemy." },
      { name: "Gale Trick",    sp: 30, power: 300, kind: "debuff", element: "Wind", cd: 1, eff: "accuracy", desc: "A disorienting whirlwind hurls dust into the enemy's face. Deals Wind damage and lowers their accuracy (25% miss chance) for 2 turns." },
      { name: "Feather Guard", sp: 26, power:   0, kind: "guard",  element: "Wind", cd: 1, target: "self", desc: "Nao rides shifting air currents, blurring her silhouette so clean hits feel like grabbing smoke. Reduces damage Nao takes by 30% for 1 turn." },
      { name: "Wind's Mercy",  sp: 32, power: 300, kind: "heal",   element: "Wind", cd: 2, desc: "A warm, spiralling updraft washes over an ally, lifting fatigue and closing small wounds. Restores HP to one ally." },
    ],
    ultimate: { name: "Phantom Tempest", power: 770, archetype: "stun" },
  },
  {
    id: "emi", name: "Emi Shiraishi", element: "Light", role: "Healer",
    weakTo: "Shadow", resists: ["Mind"], hp: 1130, sp: 400, atk: 155,
    skills: [
      { name: "Mending Touch", sp: 30, power: 320, kind: "heal",    element: "Light", cd: 2, desc: "Emi coaxes the body to remember what healthy feels like. A quieter skill than most — it saves people anyway. Restores HP to one ally." },
      { name: "Heal Veil",     sp: 36, power: 450, kind: "heal",    element: "Light", cd: 2, desc: "Emi wraps an ally in a cocoon of golden light, knitting wounds shut and easing exhaustion. Restores a large amount of HP to one ally." },
      { name: "Purify",        sp: 26, power:   0, kind: "cleanse", element: "Light", cd: 1, desc: "A wash of pure light scrubs away curses, debuffs, and lingering nonsense. Removes all active debuffs from one ally." },
      { name: "Barrier Hymn",  sp: 34, power:   0, kind: "guard",   element: "Light", cd: 1, target: "party", desc: "Emi sings a soft wordless hymn, and a dome of starlight settles over the party. Reduces damage taken by both allies by 30% for 1 turn." },
    ],
    ultimate: { name: "Aurora Covenant", power: 740, archetype: "heal" },
  },
  {
    id: "kuro", name: "Kuro Amane", element: "Shadow", role: "Curse",
    weakTo: "Light", resists: ["Shadow"], hp: 1160, sp: 380, atk: 185,
    skills: [
      { name: "Hex Thorn",   sp: 20, power: 250, kind: "atk",    element: "Shadow", cd: 0, desc: "A barbed curse lashes out from Kuro's shadow, dark thorns blooming at the point of impact. Deals Shadow damage to one enemy." },
      { name: "Shadow Bind", sp: 34, power: 330, kind: "debuff", element: "Shadow", cd: 1, eff: "timer", desc: "Kuro's shadow coils around the enemy's thoughts, pulling them somewhere slower and darker. Deals Shadow damage and cuts the enemy's answer time by 4s for 2 turns." },
      { name: "Curse Bloom", sp: 50, power: 480, kind: "heavy",  element: "Shadow", cd: 2, desc: "A black flower of cursed energy blooms beneath the enemy, petals erupting in dark thorns. Deals heavy Shadow damage to one enemy." },
      { name: "Dark Mend",   sp: 32, power: 300, kind: "heal",   element: "Shadow", cd: 2, desc: "Kuro channels curse energy inward, using the same dark force to knit an ally's wounds closed. Restores HP to one ally." },
    ],
    ultimate: { name: "Midnight Collapse", power: 780, archetype: "damage" },
  },
  {
    id: "taiga", name: "Taiga Domoto", element: "Earth", role: "Tank",
    weakTo: "Wind", resists: ["Electric"], hp: 1350, sp: 290, atk: 170,
    skills: [
      { name: "Quake Palm",     sp: 34, power: 360, kind: "atk",   element: "Earth", cd: 0, desc: "A thunderous palm strike sends a shockwave rolling through the ground toward the enemy's feet. Deals Earth damage to one enemy." },
      { name: "Iron Stand",     sp: 28, power:   0, kind: "buff",  element: "Earth", cd: 1, eff: "def", target: "self", desc: "Taiga roots himself like a mountain, his stance hardening into something that could withstand a siege. Raises Taiga's DEF by 30% for 1 turn." },
      { name: "Fortress Roar",  sp: 50, power: 480, kind: "heavy", element: "Earth", cd: 2, desc: "Taiga slams both fists into the earth and roars; a wall of stone and debris rises to crush the enemy. Deals heavy Earth damage to one enemy." },
      { name: "Shelter Stance", sp: 36, power:   0, kind: "guard", element: "Earth", cd: 1, target: "party", desc: "The earth rises around Taiga and his partner, forming a curved wall of stone. 'Stay close.' Reduces damage taken by both allies by 30% for 1 turn." },
    ],
    ultimate: { name: "King's Bastion", power: 760, archetype: "shield" },
  },
  {
    id: "hina", name: "Hina Kagari", element: "Mind", role: "Disruption",
    weakTo: "Shadow", resists: ["Light"], hp: 1150, sp: 360, atk: 178,
    skills: [
      { name: "Mind Needle",   sp: 20, power: 250, kind: "atk",    element: "Mind", cd: 0, desc: "A sliver of pure psychic force slips past the target's defenses. It hurts the way doubt hurts. Deals Mind damage to one enemy." },
      { name: "Focus Break",   sp: 32, power: 320, kind: "debuff", element: "Mind", cd: 1, eff: "accuracy", desc: "Hina shatters the enemy's concentration mid-action. Deals Mind damage and lowers their accuracy (25% miss chance) for 2 turns." },
      { name: "Logic Snare",   sp: 48, power: 470, kind: "heavy",  element: "Mind", cd: 2, desc: "Hina traps the enemy's mind in an inescapable paradox. The mental strain manifests as very real damage. Deals heavy Mind damage to one enemy." },
      { name: "Clarity Field", sp: 30, power:   0, kind: "buff",   element: "Mind", cd: 1, eff: "accuracy", target: "party", desc: "Hina extends a field of mental clarity over the party, sharpening their perceptions. Protects both allies from accuracy debuffs for 1 turn." },
    ],
    ultimate: { name: "Thought Maze", power: 770, archetype: "stun" },
  },
  {
    id: "mina", name: "Mina Arakawa", element: "Water", role: "Sustain",
    weakTo: "Electric", resists: ["Fire"], hp: 1220, sp: 360, atk: 175,
    skills: [
      { name: "Tide Cut",     sp: 20, power: 250, kind: "atk",   element: "Water", cd: 0, desc: "A crescent of pressurized water slices toward the enemy, clean enough they don't realise how deep it goes. Deals Water damage to one enemy." },
      { name: "Aqua Guard",   sp: 28, power:   0, kind: "guard", element: "Water", cd: 1, target: "self", desc: "A swirling shell of water wraps around Mina, cushioning and dispersing incoming force. Reduces damage Mina takes by 30% for 1 turn." },
      { name: "Flow Restore", sp: 34, power: 380, kind: "heal",  element: "Water", cd: 2, desc: "A gentle current of clear water washes over an ally, carrying away fatigue and closing wounds. Restores a large amount of HP to one ally." },
      { name: "Deep Current", sp: 28, power: 260, kind: "heal",  element: "Water", cd: 2, desc: "A slower, deeper healing current flows beneath an ally's feet — for partners too stubborn to ask. Restores HP to one ally." },
    ],
    ultimate: { name: "Blue Reversal", power: 760, archetype: "heal" },
  },
  {
    id: "renji", name: "Renji Kurosawa", element: "Metal", role: "Heavy",
    weakTo: "Fire", resists: ["Earth"], hp: 1250, sp: 300, atk: 205,
    skills: [
      { name: "Iron Smash",    sp: 22, power: 255, kind: "atk",    element: "Metal", cd: 0, desc: "Renji's fist connects like a girder dropped from a great height. Impossible to pretend you're fine after. Deals Metal damage to one enemy." },
      { name: "Guard Break",   sp: 34, power: 350, kind: "debuff", element: "Metal", cd: 1, eff: "def", desc: "A precise strike finds the seam in the enemy's defenses and cracks it open. Deals Metal damage and lowers their DEF by 25% for 2 turns (they take more damage)." },
      { name: "Steel Rush",    sp: 55, power: 520, kind: "heavy",  element: "Metal", cd: 2, desc: "Renji folds his whole body into a charge and becomes a wall of living metal. Everything ahead loses the argument. Deals heavy Metal damage to one enemy." },
      { name: "Steel Shelter", sp: 34, power:   0, kind: "guard",  element: "Metal", cd: 1, target: "party", desc: "Renji steps between his partner and the incoming attack and takes it. Reduces damage taken by both allies by 30% for 1 turn." },
    ],
    ultimate: { name: "Chrome Guillotine", power: 800, archetype: "shield" },
  },
];

export const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));

// Battle items — each player starts with one of each.
export const ITEMS = [
  { id: "bento",  name: "HP Boost",  desc: "Restore 500 HP to one ally" },
  { id: "energy", name: "SP Boost",  desc: "Restore 150 SP to one ally" },
  { id: "revive", name: "Revive",    desc: "Revive a KO’d teammate at 50% HP" },
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

// Damage effectiveness from attack element vs a defender character.
export function effectiveness(attackElement, defender) {
  if (attackElement === defender.weakTo) return { mult: 1.75, tag: "WEAK" };
  if (defender.resists.includes(attackElement)) return { mult: 0.5, tag: "RESIST" };
  return { mult: 1, tag: "" };
}
