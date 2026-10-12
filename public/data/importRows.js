// ===== Academy Rift — turning spreadsheets and pasted text into questions =====
// Shared by the question hub page (pasted text) and the server (uploaded .xlsx
// and .csv files), so both read questions the same way.
//
// Understands:
//   • the Blooket import template (Question Text, Answer 1–4, Correct Answer(s))
//   • any sheet with a "Question" column, answer/option/choice columns and a
//     "Correct" or "Answer" column (number, letter or the answer's own text)
//   • rows copied straight out of Excel or Google Sheets, with or without headings
//   • typed text: a question line, then one answer per line, * before the right one
//
// Every result is { questions: [{ q, choices, correct, explain, hint, row }], skipped: [{ row, reason }] }
// where `correct` holds the positions of the right answers in `choices`.

export const MAX_CHOICES = 4;
export const MAX_QUESTIONS = 300;

const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------- delimited text
// RFC 4180 style: quotes around cells, doubled quotes inside, line breaks inside quotes.
export function parseDelimited(text, delim) {
  const rows = []; let row = [], cell = "", inQ = false;
  const s = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += ch;
    } else if (ch === '"' && cell === "") inQ = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function guessDelimiter(text) {
  const head = String(text).split(/\r?\n/).slice(0, 10).join("\n");
  if (head.includes("\t")) return "\t";
  const semi = (head.match(/;/g) || []).length, comma = (head.match(/,/g) || []).length;
  return semi > comma ? ";" : ",";
}

// ---------------------------------------------------------------- correct answers
// "2", "1,3", "B", "a & c" or the answer's own text → positions in `choices`.
export function parseCorrect(value, choices) {
  const v = norm(value);
  if (!v) return [];
  const out = new Set();
  if (/^[\d\s,;&/+and]+$/i.test(v) && /\d/.test(v)) {
    for (const n of v.match(/\d+/g)) { const i = Number(n) - 1; if (i >= 0 && i < choices.length) out.add(i); }
  } else if (/^[a-f](\s*([,;&/+]|and)\s*[a-f])*\.?$/i.test(v)) {
    for (const l of v.toLowerCase().match(/\b[a-f]\b|^[a-f]/g) || []) { const i = l.charCodeAt(0) - 97; if (i < choices.length) out.add(i); }
  } else {
    const i = choices.findIndex((c) => norm(c).toLowerCase() === v.toLowerCase());
    if (i >= 0) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}

// ---------------------------------------------------------------- table rows
function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const cells = (rows[i] || []).map((c) => norm(c).toLowerCase());
    const qCol = cells.findIndex((c) => /^(question|questions|question text|prompt)\b/.test(c) && !/^question\s*(#|no\b|num|number)/.test(c));
    if (qCol < 0) continue;
    const map = { q: qCol, choices: [], correct: -1, explain: -1, hint: -1 };
    cells.forEach((c, j) => {
      if (j === qCol) return;
      const m = c.match(/^(?:answer|option|choice)\s*([1-9]|[a-f])\b/);
      if (m) { const k = /\d/.test(m[1]) ? Number(m[1]) - 1 : m[1].charCodeAt(0) - 97; if (map.choices[k] === undefined) map.choices[k] = j; return; }
      if (/correct|^answer$|^key$|^right answer/.test(c)) { if (map.correct < 0) map.correct = j; return; }
      if (/hint|clue|formula/.test(c)) { if (map.hint < 0) map.hint = j; return; }
      if (/explan|reason|^why|feedback/.test(c)) { if (map.explain < 0) map.explain = j; }
    });
    map.choices = map.choices.filter((j) => j !== undefined);
    if (map.choices.length >= 2) return { index: i, map };
  }
  return null;
}

const looksLikeMarker = (v, choices) => parseCorrect(v, choices).length > 0;

// Headings missing (for example rows copied from the middle of a sheet): guess the layout.
function guessMap(rows) {
  const filled = rows.filter((r) => r.some((c) => norm(c)));
  if (!filled.length) return null;
  const width = Math.max(...filled.map((r) => r.length));
  const numbered = filled.every((r) => /^\d+$/.test(norm(r[0])));
  if (numbered && width >= 7) {
    // Blooket order without its heading rows: #, question, answers 1–4, time limit, correct
    return { q: 1, choices: [2, 3, 4, 5], correct: 7, explain: -1, blooket: true };
  }
  return null;   // handled row by row in rowsToQuestions
}

function cleanQuestion(q, raw, correctIdx, explain, row, hint = "") {
  const choices = [], correct = [];
  raw.forEach((c, i) => { if (c) { if (correctIdx.includes(i)) correct.push(choices.length); choices.push(c); } });
  return { q, choices, correct, explain, hint, row };
}

export function rowsToQuestions(rows, { firstRow = 1 } = {}) {
  const questions = [], skipped = [];
  const header = findHeader(rows);
  const map = header ? header.map : guessMap(rows);
  const start = header ? header.index + 1 : 0;
  for (let i = start; i < rows.length; i++) {
    const cells = (rows[i] || []).map(norm);
    const rowNo = i + firstRow;
    if (!cells.some(Boolean)) continue;
    if (cells.some((c, j) => j > 6 && /^typing$/i.test(c))) { skipped.push({ row: rowNo, reason: "Typing question. This game only plays multiple choice." }); continue; }
    let q, raw, correctIdx, explain = "", hint = "";
    if (map) {
      q = cells[map.q] || "";
      raw = map.choices.map((j) => cells[j] || "");
      correctIdx = map.correct >= 0 ? parseCorrect(cells[map.correct], raw) : [];
      if (map.explain >= 0) explain = cells[map.explain] || "";
      if (map.hint >= 0) hint = cells[map.hint] || "";
    } else {
      // question, answers…, and the right answer in the last filled cell
      const filled = cells.slice(0, cells.length - [...cells].reverse().findIndex(Boolean));
      q = filled[0] || "";
      let rest = filled.slice(1);
      correctIdx = [];
      if (rest.length >= 3 && looksLikeMarker(rest[rest.length - 1], rest.slice(0, -1))) {
        const marker = rest.pop();
        correctIdx = parseCorrect(marker, rest);
      }
      raw = rest;
    }
    if (/^question\s*(text)?$/i.test(q)) continue;          // a repeated heading row
    const extra = raw.slice(MAX_CHOICES).filter(Boolean);
    if (extra.length) { skipped.push({ row: rowNo, reason: `More than ${MAX_CHOICES} answers. Keep it to 4 and try again.` }); continue; }
    if (!q && !raw.some(Boolean)) continue;
    questions.push(cleanQuestion(q, raw.slice(0, MAX_CHOICES), correctIdx, explain, rowNo, hint));
    if (questions.length >= MAX_QUESTIONS) { skipped.push({ row: rowNo + 1, reason: `Only the first ${MAX_QUESTIONS} questions were read.` }); break; }
  }
  return { questions, skipped };
}

// ---------------------------------------------------------------- typed text
// 1. Which part controls the cell?
// a) Cell wall
// *b) Nucleus
// c) Vacuole
// Explanation: The nucleus holds the instructions.
export function parseBlocks(text) {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n");
  const blocks = []; let cur = null;
  const startsQuestion = (l) => /^(q(uestion)?\s*\d*\s*[:.)]|\d+\s*[.)])\s+/i.test(l);
  for (const rawLine of lines) {
    const l = rawLine.trim();
    if (!l) { cur = null; continue; }
    if (!cur || (startsQuestion(l) && cur.lines.length > 1)) { cur = { lines: [] }; blocks.push(cur); }
    cur.lines.push(l);
  }
  const questions = [], skipped = [];
  blocks.forEach((b, n) => {
    const [first, ...rest] = b.lines;
    const q = first.replace(/^(q(uestion)?\s*\d*\s*[:.)]|\d+\s*[.)])\s+/i, "").trim();
    const raw = [], correctIdx = []; let explain = "", marker = "", hint = "";
    for (const l of rest) {
      let m;
      if ((m = l.match(/^(answer|correct|correct answer|ans)\s*[:=-]\s*(.+)$/i))) { marker = m[2]; continue; }
      if ((m = l.match(/^(explanation|explain|reason|why)\s*[:=-]\s*(.+)$/i))) { explain = m[2].trim(); continue; }
      if ((m = l.match(/^(hint|clue|formula)\s*[:=-]\s*(.+)$/i))) { hint = m[2].trim(); continue; }
      let c = l, right = false;
      if (/^\*/.test(c)) { right = true; c = c.replace(/^\*\s*/, ""); }
      c = c.replace(/^(\(?[a-f]\)|[a-f][.)]|[-•–])\s+/i, "");
      if (/^\*/.test(c)) { right = true; c = c.replace(/^\*\s*/, ""); }
      if (/\s(\*|✓|✔)$/.test(c)) { right = true; c = c.replace(/\s(\*|✓|✔)$/, ""); }
      if (right) correctIdx.push(raw.length);
      raw.push(c.trim());
    }
    if (marker) for (const i of parseCorrect(marker, raw)) if (!correctIdx.includes(i)) correctIdx.push(i);
    if (raw.length > MAX_CHOICES) { skipped.push({ row: n + 1, reason: `"${q.slice(0, 40)}…" has more than ${MAX_CHOICES} answers.` }); return; }
    questions.push(cleanQuestion(q, raw, correctIdx, explain, n + 1, hint));
  });
  return { questions: questions.slice(0, MAX_QUESTIONS), skipped };
}

// Pasted text from the hub: a table copied out of a spreadsheet, or typed questions.
export function parsePasted(text) {
  const t = String(text ?? "");
  if (t.includes("\t")) return rowsToQuestions(parseDelimited(t, "\t"));
  return parseBlocks(t);
}

// What still needs fixing before a question can be used in a battle.
export function questionProblems(q) {
  const out = [];
  if (!norm(q.q) && !q.image) out.push("Add the question");
  const filled = (q.choices || []).filter((c) => norm(c));
  if (filled.length < 2) out.push("Add at least 2 answers");
  const correct = (q.correct || []).filter((i) => norm(q.choices?.[i]));
  if (!correct.length) out.push("Mark the right answer");
  return out;
}
