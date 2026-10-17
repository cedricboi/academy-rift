// Monster sprites for Total War. Each sprite is a 192 x 192 PixelLab image facing
// left, drawn in the same pixel style as the fighters' battle sprites.
// `scale` is the size to draw it relative to a fighter (1 = same frame size).
// Camp rewards and Crimson roles are proposals until the rules are agreed.

export const JUNGLE_CAMPS = [
  {id: 'moonhart',    name: 'Moonhart Sentinel',   site: 'Moonwell',          reward: 'Proposed: heals the company',          scale: 1.15},
  {id: 'galecrest',   name: 'Galecrest Roc',       site: 'Windspire',         reward: 'Proposed: extra movement',             scale: 1.15},
  {id: 'mossback',    name: 'Mossback Colossus',   site: 'Ancient Grove',     reward: 'Proposed: shield at a crossing',       scale: 1.3},
  {id: 'riftglass',   name: 'Riftglass Basilisk',  site: 'Riftglass Quarry',  reward: 'Proposed: breaks enemy armour',        scale: 1.1},
  {id: 'ferryman',    name: 'Hollow Ferryman',     site: 'Drowned Vault',     reward: 'Proposed: scouts hidden enemies',      scale: 1.1},
  {id: 'broodmother', name: 'Crimson Broodmother', site: 'Crimson Nest',      reward: 'Proposed: siege bonus on the fortress', scale: 1.2},
];

export const CRIMSON_HOST = [
  {id: 'orc_vanguard',   name: 'Riftborn Orc Vanguard', role: 'Foot soldier that holds a road',      scale: 1},
  {id: 'orc_warchanter', name: 'Orc Warchanter',        role: 'Drummer who strengthens nearby troops', scale: 1},
  {id: 'goblin_sappers', name: 'Emberfang Goblin Sappers', role: 'Saboteurs who block bridges',       scale: 0.8},
  {id: 'rift_hound',     name: 'Rift Hound',            role: 'Fast scout that patrols roads',        scale: 0.85},
  {id: 'gargoyle',       name: 'Crimson Gargoyle',      role: 'Guard on walls and watchtowers',       scale: 1},
  {id: 'hollow_knight',  name: 'Hollow Knight of the Rift', role: 'Elite defender of bridges and gates', scale: 1.1},
  {id: 'ogre',           name: 'Ironhide Ogre',         role: 'Siege brute',                          scale: 1.35},
  {id: 'imp_swarm',      name: 'Ember Imp Swarm',       role: 'Flying raiders',                       scale: 0.85},
  {id: 'warlock',        name: 'Riftweaver Warlock',    role: 'Spellcaster who sets traps',           scale: 1.05},
  {id: 'wyvern',         name: 'Crimson Wyvern',        role: 'Flying raider',                        scale: 1.35},
  {id: 'golem',          name: 'Bloodstone Golem',      role: 'Guardian of the fortress gate',        scale: 1.4},
  {id: 'warlord',        name: 'The Crimson Warlord',   role: "The teacher's champion",               scale: 1.4},
];

export const spriteFor = id => `monsters/${id}.png`;
