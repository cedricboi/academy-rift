// ===== Academy Rift — the practice fight =====
// A guided first battle. The student plays Jun with Emi as a partner against two
// rivals, Renji and Nao. It uses the real battle rules, with a few changes:
//   • nothing is timed, and a wrong answer can be tried again
//   • the fight pauses at a few moments ("gates") until the student taps NEXT,
//     while the coach on the student's screen explains what is happening
//   • each of the student's turns teaches one thing: Strike, then Skills, then
//     Hint + Ultimate, then everything is unlocked to finish the fight
//   • the rivals only use Strike, and the student's team can't be knocked out
// server.js calls the functions below; the coach's words live in public/game.js.

export const PRACTICE_TEAM = { student: "jun", partner: "emi", rivals: ["renji", "nao"] };
// The rivals are easier to beat than in a real battle. With these numbers Renji
// survives the Strike and Skill lessons, and the Ultimate usually finishes both.
export const PRACTICE_HP = { renji: 1000, nao: 400 };
// What each of the student's turns teaches, in order. After these: "free".
export const LESSONS = ["strike", "skills", "ult"];

// The student's questions: 1 (Strike), 5 (Skills), 9 (Hint + Ultimate).
// The bots' questions, which show at the top of the student's screen:
//   2 Renji · 3 Emi · 4 Nao (gets it wrong: the student steals it) · 6 · 7 · 8
// After that, everyone draws from the rest in turn while the fight is finished.
const Q = (q, choices, answer, explain, extra = {}) =>
  ({ q, choices, answer, explain, topic: "Practice", topicId: "practice", bloom: "Remember", ...extra });
export const PRACTICE_QUESTIONS = [
  Q("Which of these is a living thing?", ["A rock", "A goldfish", "A plastic bottle", "A pencil"], 1,
    "A goldfish feeds, grows and has young. All living things are made of cells."),
  Q("Which tool do we use to see cells?", ["A microscope", "A telescope", "A ruler", "A thermometer"], 0,
    "A microscope makes very small things, like cells, look bigger."),
  Q("What is the smallest unit of life?", ["An organ", "A bone", "The cell", "A leaf"], 2,
    "Every living thing is made of one or more cells."),
  Q("Plants make their own food using energy from…", ["Sunlight", "Moonlight", "Music", "The wind"], 0,
    "Plants use light energy from the Sun to make food. This is called photosynthesis."),
  Q("Which part of a cell controls what the cell does?", ["The cell wall", "The vacuole", "The nucleus", "The cytoplasm"], 2,
    "The nucleus holds the cell's instructions and controls its activities."),
  Q("Which of these is made of cells?", ["A stone", "A tree", "A spoon", "A cup"], 1,
    "A tree is alive, so it is made of cells. Stones, spoons and cups are not."),
  Q("Where do you put the slide on a microscope?", ["On the eyepiece", "On the base", "On the arm", "On the stage"], 3,
    "The slide goes on the stage, held in place by the stage clips."),
  Q("Which kind of cell has a cell wall?", ["A plant cell", "A human skin cell", "A red blood cell", "A nerve cell"], 0,
    "Plant cells have a cell wall. Animal cells, like ours, do not."),
  Q("The eyepiece lens is ×10 and the objective lens is ×4. What is the total magnification?", ["×14", "×40", "×6", "×104"], 1,
    "Total magnification = eyepiece × objective = 10 × 4 = ×40.",
    { hint: "Total magnification = eyepiece × objective. Multiply the two numbers.", bloom: "Apply" }),
  Q("What do we call a group of similar cells working together?", ["A tissue", "A planet", "A molecule", "A family"], 0,
    "Similar cells working together form a tissue, like muscle tissue."),
  Q("Which part of the microscope do you look through?", ["The stage", "The base", "The eyepiece", "The clip"], 2,
    "You look through the eyepiece at the top of the microscope."),
  Q("What surrounds an animal cell and controls what goes in and out?", ["The cell wall", "The cell membrane", "The chloroplast", "The stage"], 1,
    "The cell membrane controls what enters and leaves the cell."),
  Q("Which of these is NOT made of cells?", ["A mushroom", "A worm", "A leaf", "A glass marble"], 3,
    "A glass marble was never alive, so it has no cells."),
  Q("Which liquid is used to stain onion cells so we can see them clearly?", ["Iodine solution", "Orange juice", "Cooking oil", "Salt water"], 0,
    "Iodine solution stains the cells so the nucleus and cell wall are easier to see."),
];
const SCRIPTED = 9, STUDENT_Q = [0, 4, 8], BOT_Q = [1, 2, 3, 5, 6, 7];

export function practiceQuestion(p, forStudent) {
  const list = forStudent ? STUDENT_Q : BOT_Q;
  const k = forStudent ? p.sQ++ : p.bQ++;
  if (k < list.length) return PRACTICE_QUESTIONS[list[k]];
  return PRACTICE_QUESTIONS[SCRIPTED + (p.fQ++ % (PRACTICE_QUESTIONS.length - SCRIPTED))];
}

// A fresh practice state for a room: who is who, and how far the script has got.
export function newPractice(studentUid) {
  return {
    student: studentUid, partner: "practice_emi", rivalA: "practice_renji", rivalB: "practice_nao",
    lesson: "intro", gate: null, seen: {}, sTurn: 0, botTurns: {}, sQ: 0, bQ: 0, fQ: 0,
  };
}

// The student's turn starts: move on to the next lesson.
export function nextLesson(p) {
  p.sTurn++;
  p.lesson = LESSONS[p.sTurn - 1] || "free";
  return p.lesson;
}

// What a bot does on its turn. gate: pause before it answers; after: pause after its move.
export function botPlan(p, uid) {
  const n = (p.botTurns[uid] = (p.botTurns[uid] || 0) + 1);
  if (n === 1 && uid === p.rivalA) return { correct: true, gate: "foeTurn", target: p.student, after: "foeHit" };
  if (n === 1 && uid === p.partner) return { correct: true, gate: "partnerTurn" };
  if (n === 1 && uid === p.rivalB) return { correct: false, gate: "stealSetup" };   // the student steals this one
  return { correct: true };
}

// The bot's move. Rivals only Strike. The partner heals someone who is hurt, or hits
// the rival with the least HP.
export function botMove(p, c, b, plan) {
  const team = Object.values(b.combatants);
  const enemies = team.filter((x) => x.team !== c.team && x.alive);
  if (c.team !== 0) {
    const t = enemies.find((x) => x.uid === plan?.target) || enemies[Math.floor(Math.random() * enemies.length)];
    return { type: "strike", targetId: t?.uid };
  }
  const hurt = team.filter((x) => x.team === c.team && x.alive && x.maxHp - x.hp >= 100).sort((a, z) => a.hp / a.maxHp - z.hp / z.maxHp)[0];
  const heal = c.skills.findIndex((s, i) => s.kind === "heal" && c.sp >= s.sp && !(c.cooldowns[i] > 0));
  if (hurt && heal >= 0) return { type: "spell", skillIndex: heal, targetId: hurt.uid };
  const weakest = enemies.sort((a, z) => a.hp - z.hp)[0];
  return { type: "strike", targetId: weakest?.uid };
}
