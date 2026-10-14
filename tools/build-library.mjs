// Turns a folder of Blooket spreadsheets into the question sets that come with the game (library/sets/*.json).
// Chapters 1-8 go in Sec 1 Science, 9-16 in Sec 2 Science, anything else in Sec 3 G1 Science.
// Chapter names come from the "AO Map" workbook when it is in the folder.
//   node tools/build-library.mjs <folder with Blooket_ChNN_*.xlsx>
// The sets are read-only in the hub (a teacher can copy one to edit it). Answers stay on the server.
import fs from "fs";
import { join, basename } from "path";
import ExcelJS from "exceljs";
import { rowsToQuestions, questionProblems } from "../public/data/importRows.js";

const src = process.argv[2];
if (!src) { console.log("usage: node tools/build-library.mjs <folder>"); process.exit(1); }
const out = new URL("../library/sets/", import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });

const sheetRows = (ws) => { const rows = []; for (let r = 1; r <= ws.rowCount; r++) { const row = ws.getRow(r), cells = []; for (let c = 1; c <= row.cellCount; c++) cells.push(row.getCell(c).text ?? ""); rows.push(cells); } return rows; };

// chapter titles from the AO map (one sheet per chapter, title in A1)
const titles = {};
const map = fs.readdirSync(src).find((f) => /ao map/i.test(f) && f.endsWith(".xlsx"));
if (map) {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(join(src, map));
  for (const ws of wb.worksheets) { const t = String(ws.getCell("A1").text || ws.getRow(1).getCell(2).text || ""); const m = t.match(/Chapter\s+(\d+)\s*:\s*(.+)/i); if (m) titles[+m[1]] = m[2].trim(); }
}

let total = 0;
for (const f of fs.readdirSync(src).filter((f) => /^Blooket_Ch(\d+)/i.test(f) && f.endsWith(".xlsx")).sort()) {
  const ch = +f.match(/Ch(\d+)/i)[1];
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(join(src, f));
  let best = null;
  for (const ws of wb.worksheets) { const r = rowsToQuestions(sheetRows(ws)); if (!best || r.questions.length > best.questions.length) best = r; }
  const questions = best.questions.filter((q) => questionProblems(q).length === 0)
    .map((q, i) => ({ id: `c${String(ch).padStart(2, "0")}q${i + 1}`, q: q.q, choices: q.choices, correct: q.correct, explain: q.explain || "", hint: q.hint || "", image: null }));
  const name = titles[ch] || basename(f, ".xlsx").replace(/^Blooket_Ch\d+_/i, "").replace(/_/g, " ");
  const folder = ch <= 8 ? "sec1" : ch <= 16 ? "sec2" : "sec3g1";
  const set = { id: `ch${String(ch).padStart(2, "0")}`, title: `Ch ${ch} · ${name}`, folder, chapter: ch, questions };
  fs.writeFileSync(join(out, `${set.id}.json`), JSON.stringify(set, null, 1));
  total += questions.length;
  console.log(`${set.id}  ${folder.padEnd(6)}  ${String(questions.length).padStart(3)} questions${best.skipped.length ? `  (${best.skipped.length} rows skipped)` : ""}  ${set.title}`);
}
console.log(`${total} questions written to library/sets`);
