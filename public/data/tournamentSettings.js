// ===== Academy Rift — Class Tournament settings (SHARED, client-safe) =====
// One list drives both the teacher's settings panel (labels, choices, help text)
// and the server's validation, so the two can never disagree.
//
// lockedAfterStart: the setting can only be changed before Round 1 begins.
// Every other setting can be changed between rounds and applies to the next round.

import { TOPICS } from "./topics.js";

export const SETTING_GROUPS = [
  { id: "tournament", title: "Tournament" },
  { id: "battle", title: "Each battle" },
  { id: "screens", title: "Students' screens" },
];

export const SETTINGS = [
  // ---- Tournament ----
  {
    key: "pairing", group: "tournament", label: "How pairs are made", default: "students",
    lockedAfterStart: true,
    options: [
      { value: "students", label: "Students choose partners" },
      { value: "random", label: "Random draw" },
      { value: "teacher", label: "I pair them on this screen" },
    ],
    help: "Students choose: each student taps a classmate, and two students who choose each other become a pair. You can still pair or split anyone from this screen.",
  },
  {
    key: "rounds", group: "tournament", label: "Number of rounds", default: 3,
    options: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: n, label: String(n) })),
    help: "Every pair plays one battle per round. At about 8 minutes a battle, 3 rounds fit a one-hour lesson.",
  },
  {
    key: "autoStart", group: "tournament", label: "Start of Round 1", default: "ready",
    options: [
      { value: "ready", label: "When every student is ready" },
      { value: "teacher", label: "When I press Start" },
    ],
    help: "Every student taps READY on their screen. When everyone online is ready, a 10-second countdown starts Round 1. You can still press Start at any time.",
  },
  {
    key: "breakSeconds", group: "tournament", label: "Break between rounds", default: 45,
    options: [
      { value: 0, label: "Wait for me to press Start" },
      ...[15, 30, 45, 60, 90].map((n) => ({ value: n, label: `${n} seconds, then the next round starts` })),
    ],
    help: "When every battle in a round has finished, the leaderboard shows for this long and then the next round starts by itself. Students who finish early can watch the battles still going.",
  },
  {
    key: "matching", group: "tournament", label: "Who fights whom", default: "swiss",
    options: [
      { value: "swiss", label: "Similar scores after Round 1" },
      { value: "random", label: "Random every round" },
    ],
    help: "Similar scores: Round 1 is random. After that, pairs with the same points meet, so the top pairs face each other by the last round.",
  },
  {
    key: "avoidRepeats", group: "tournament", label: "Avoid repeat opponents", default: true,
    options: [
      { value: true, label: "Yes" },
      { value: false, label: "No" },
    ],
    help: "When possible, a pair never meets the same opponents twice.",
  },
  {
    key: "oddPair", group: "tournament", label: "Odd number of pairs", default: "bots",
    options: [
      { value: "bots", label: "Leftover pair fights two bots" },
      { value: "freewin", label: "Leftover pair gets a free win" },
      { value: "sitout", label: "Leftover pair sits out (no points)" },
    ],
    help: "With an odd number of pairs, one pair has no opponent each round. No pair is left over twice until every pair has been left over once.",
  },

  // ---- Each battle ----
  {
    key: "topicId", group: "battle", label: "Topic tested", default: "mixed",
    options: TOPICS.map((t) => ({ value: t.id, label: `${t.icon} ${t.name}` })),
    help: "Questions in every battle come from this topic.",
  },
  {
    key: "timeLimitMin", group: "battle", label: "Time limit per battle", default: 8,
    options: [
      { value: 0, label: "No limit" },
      ...[3, 4, 5, 6, 8, 10, 12, 15].map((n) => ({ value: n, label: `${n} minutes` })),
    ],
    help: "When time runs out, the team with more HP left wins. If HP is level, the team with more correct answers wins.",
  },
  {
    key: "questionSeconds", group: "battle", label: "Time to answer a question", default: 18,
    options: [10, 12, 15, 18, 20, 25, 30].map((n) => ({ value: n, label: `${n} seconds` })),
    help: "How long the player whose turn it is has to answer.",
  },
  {
    key: "stealSeconds", group: "battle", label: "Steal window", default: 10,
    options: [
      { value: 0, label: "Off" },
      ...[5, 8, 10, 15].map((n) => ({ value: n, label: `${n} seconds` })),
    ],
    help: "After a wrong answer, the other three players can answer the same question to steal the turn.",
  },
  {
    key: "fighters", group: "battle", label: "Fighters", default: "choose",
    options: [
      { value: "choose", label: "Students choose" },
      { value: "random", label: "Random every round" },
    ],
    help: "Students who have not chosen a fighter when the round starts get a random one.",
  },

  // ---- Students' screens ----
  {
    key: "showStandings", group: "screens", label: "Leaderboard on students' screens", default: "all",
    options: [
      { value: "all", label: "Show the full leaderboard" },
      { value: "own", label: "Show only their own place" },
      { value: "none", label: "Hide until the end" },
    ],
    help: "The projector always shows the full leaderboard.",
  },
];

export const SETTING_BY_KEY = Object.fromEntries(SETTINGS.map((s) => [s.key, s]));

export function defaultSettings() {
  return Object.fromEntries(SETTINGS.map((s) => [s.key, s.default]));
}

// Returns the cleaned value, or undefined if the value is not one of the options.
export function cleanSettingValue(key, value) {
  const def = SETTING_BY_KEY[key];
  if (!def) return undefined;
  const hit = def.options.find((o) => String(o.value) === String(value));
  return hit ? hit.value : undefined;
}
