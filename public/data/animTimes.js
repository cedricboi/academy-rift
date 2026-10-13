// How long each battle cinematic runs (ms), measured from theatre/engine.js by stepping it frame by frame.
// The server waits this long (plus a short margin) after a move before the next turn, so every player sees the whole animation.
// Re-measure after changing a skill's animation in the Skill Lab.
export const ANIM_MS = {
  "jun": {"strike": 2784, "skills": [3648, 4432, 4496, 4672], "ultimate": 9360},
  "kuro": {"strike": 3584, "skills": [4480, 4560, 5920, 4304], "ultimate": 11184},
  "emi": {"strike": 2880, "skills": [4256, 4528, 3936, 4928], "ultimate": 9600},
  "saya": {"strike": 3408, "skills": [4864, 4944, 5008, 5040], "ultimate": 10192},
  "raiden": {"strike": 3408, "skills": [4384, 5472, 4800, 4768], "ultimate": 9296},
  "nao": {"strike": 3408, "skills": [4672, 5072, 5008, 4608], "ultimate": 9456},
  "taiga": {"strike": 3408, "skills": [4800, 4800, 5248, 5104], "ultimate": 9536},
  "hina": {"strike": 3408, "skills": [4560, 4896, 5248, 4912], "ultimate": 9456},
  "mina": {"strike": 3408, "skills": [4560, 4912, 4608, 5104], "ultimate": 9168},
  "renji": {"strike": 3408, "skills": [4416, 4528, 5696, 5104], "ultimate": 9488}};
