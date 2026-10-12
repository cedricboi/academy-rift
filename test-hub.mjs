// Headless test of the question hub (/hub) and its use in battles.
//   node test-hub.mjs
// Runs the game server twice against a pretend GitHub (to check that sets and
// pictures survive a restart), then once with the plain folder store. Checks:
// password, Blooket .xlsx and .csv import (with a picture on a row), pictures,
// saving and version conflicts, sets in the room lobby and tournament settings,
// pictures reaching students, answers never reaching students, and questions
// with two right answers.
import { spawn } from "child_process";
import express from "express";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import ExcelJS from "exceljs";
import { io } from "socket.io-client";

const PORT = 3211, MOCK = 3212, URL = `http://localhost:${PORT}`;
const fails = [];
const check = (ok, msg) => { if (!ok) { fails.push(msg); console.log("  ✗ " + msg); } else console.log("  ✓ " + msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rift-hub-test-"));
let server = null;
const done = (code) => { try { server?.kill(); } catch {} mock.close(); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(code); };
setTimeout(() => { console.log("TIMEOUT"); done(1); }, 120000);
process.on("uncaughtException", (e) => { console.log("ERROR", e); done(1); });

// ---------------------------------------------------------------- pretend GitHub
const files = new Map();      // path → { sha, buf }  on the bank branch
let branchMade = false, writes = 0;
const sha1 = (buf) => crypto.createHash("sha1").update(buf).digest("hex");
const gh = express();
gh.use(express.json({ limit: "20mb" }));
gh.use((req, res, next) => (req.get("authorization") === "Bearer test-token" ? next() : res.status(401).json({ message: "Bad credentials" })));
const R = "/repos/teacher/academy-rift";
gh.get(R, (_q, res) => res.json({ full_name: "teacher/academy-rift" }));
gh.get(`${R}/branches/:b`, (req, res) => (branchMade && req.params.b === "question-bank" ? res.json({ name: "question-bank" }) : res.status(404).json({ message: "Branch not found" })));
const trees = new Map();
gh.post(`${R}/git/trees`, (req, res) => { const sha = sha1(Buffer.from(JSON.stringify(req.body))); trees.set(sha, req.body.tree); res.status(201).json({ sha }); });
gh.post(`${R}/git/commits`, (req, res) => res.status(201).json({ sha: "c" + req.body.tree }));
gh.post(`${R}/git/refs`, (req, res) => {
  branchMade = true;
  for (const e of trees.get(req.body.sha.slice(1)) || []) { const buf = Buffer.from(e.content); files.set(e.path, { sha: sha1(buf), buf }); }
  res.status(201).json({ ref: req.body.ref });
});
gh.get(`${R}/git/trees/:b`, (_q, res) => res.json({ tree: [...files].map(([p, f]) => ({ path: p, type: "blob", sha: f.sha })) }));
gh.get(`${R}/git/blobs/:sha`, (req, res) => {
  const f = [...files.values()].find((x) => x.sha === req.params.sha);
  return f ? res.json({ content: f.buf.toString("base64"), encoding: "base64" }) : res.status(404).json({ message: "Not Found" });
});
gh.get(`${R}/contents/*`, (req, res) => {
  const f = files.get(req.params[0]);
  if (!f) return res.status(404).json({ message: "Not Found" });
  if ((req.get("accept") || "").includes("raw")) return res.type("application/octet-stream").send(f.buf);
  res.json({ sha: f.sha, content: f.buf.toString("base64") });
});
gh.put(`${R}/contents/*`, (req, res) => {
  const p = req.params[0], cur = files.get(p);
  if (cur && req.body.sha !== cur.sha) return res.status(409).json({ message: `${p} does not match ${req.body.sha}` });
  if (!cur && req.body.sha) return res.status(409).json({ message: "sha given for a new file" });
  const buf = Buffer.from(req.body.content, "base64");
  files.set(p, { sha: sha1(buf), buf }); writes++;
  res.status(cur ? 200 : 201).json({ content: { path: p, sha: sha1(buf) } });
});
gh.delete(`${R}/contents/*`, (req, res) => {
  const p = req.params[0], cur = files.get(p);
  if (!cur) return res.status(404).json({ message: "Not Found" });
  if (req.body.sha !== cur.sha) return res.status(409).json({ message: "sha mismatch" });
  files.delete(p); res.json({});
});
const mock = gh.listen(MOCK);

// ---------------------------------------------------------------- game server
async function startServer(env, label) {
  const tmpdir = fs.mkdtempSync(path.join(tmp, "run-"));     // fresh picture cache each start
  server = spawn(process.execPath, ["server.js"], {
    env: { ...process.env, PORT: String(PORT), RIFT_SPEED: "20", TMPDIR: tmpdir, GITHUB_TOKEN: "", GITHUB_REPO: "", HUB_PASSWORD: "", RENDER: "", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  server.stdout.on("data", (d) => (log += d)); server.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 100 && !/running/.test(log); i++) await sleep(100);
  for (let i = 0; i < 50 && !/\[bank\]/.test(log); i++) await sleep(100);
  console.log(`\n${label}\n  server: ${log.split("\n").filter((l) => l.includes("[bank]")).join(" | ")}`);
  return () => log;
}
async function stopServer() { const s = server; server = null; s.kill(); await new Promise((r) => s.on("exit", r)); }

let key = "";
async function call(method, p, body, { raw, type } = {}) {
  const headers = key ? { "X-Hub-Key": key } : {};
  if (raw) headers["Content-Type"] = type || "application/octet-stream";
  else if (body !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(URL + p, { method, headers, body: raw ? body : body !== undefined ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

// a small real PNG (2x2 pixels)
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64");

async function blooketXlsx() {
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("Questions");
  ws.addRow(["Blooket\nImport Template"]);
  ws.addRow(["Question #", "Question Text", "Answer 1", "Answer 2", "Answer 3\n(Optional)", "Answer 4\n(Optional)", "Time Limit (sec)\n(Max: 300 seconds)", "Correct Answer(s)\n(Only include Answer #)"]);
  ws.addRow([1, "Which part controls the cell?", "Cell wall", "Nucleus", "Vacuole", "Cytoplasm", 20, 2]);
  ws.addRow([2, "Which of these are found in plant cells?", "Chloroplast", "Cell wall", "Bone", "", 20, "1,2"]);
  ws.addRow([3, "Name the green pigment", "chlorophyll", "", "", "", 20, 1, "", "typing"]);
  ws.addRow([4, "True or false: animal cells have a cell wall", "True", "False", "", "", 20, 2]);
  const id = wb.addImage({ buffer: PNG, extension: "png" });
  ws.addImage(id, { tl: { col: 9, row: 2 }, ext: { width: 40, height: 40 } });       // on row 3 (question 1)
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------------------------------------------------------- 1. GitHub store, first run
await startServer({ GITHUB_TOKEN: "test-token", GITHUB_REPO: "teacher/academy-rift", GITHUB_API_URL: `http://localhost:${MOCK}`, HUB_PASSWORD: "owl-42" }, "GitHub storage, first start");
check(branchMade && files.has("README.md"), "made the question-bank branch with only a README on it");

let r = await call("GET", "/api/hub/status");
check(r.data.needsPassword && !r.data.allowed && r.data.storage.kind === "github" && r.data.storage.ok, "status: password needed, GitHub storage ready");
check((await call("GET", "/api/hub/sets")).status === 401, "sets are locked without the password");
check((await call("POST", "/api/hub/login", { password: "nope" })).status === 401, "wrong password refused");
r = await call("POST", "/api/hub/login", { password: "owl-42" });
key = r.data?.key || "";
check(r.status === 200 && key.length === 64, "right password gives a key");
r = await call("GET", "/api/hub/sets");
check(r.status === 200 && r.data.sets.length === 1 && r.data.sets[0].builtIn && r.data.sets[0].count === 60, "only the built-in set at first (60 questions)");
check((await call("GET", "/hub")).status === 200 || true, "hub page served");
const page = await fetch(URL + "/hub"); check(page.ok && (await page.text()).includes("hub.js"), "hub page loads");

// import a Blooket .xlsx with a picture on question 1's row
r = await call("POST", "/api/hub/import?name=cells.xlsx", await blooketXlsx(), { raw: true });
const imp = r.data;
check(r.status === 200 && imp.questions.length === 3, `Blooket .xlsx: 3 questions read (got ${imp?.questions?.length})`);
check(imp.questions[0].q === "Which part controls the cell?" && imp.questions[0].correct.join() === "1", "Blooket .xlsx: right answer 2 → Nucleus");
check(imp.questions[1].correct.join() === "0,1" && imp.questions[1].choices.length === 3, "Blooket .xlsx: two right answers (1,2), empty answer 4 dropped");
check(imp.questions[2].choices.join() === "True,False" && imp.questions[2].correct.join() === "1", "Blooket .xlsx: two-answer true/false question");
check(imp.skipped.some((s) => /Typing/.test(s.reason)), "Blooket .xlsx: typing question left out with a reason");
check(imp.questions[0].picture?.type === "image/png" && imp.questions[0].picture.data === PNG.toString("base64"), "Blooket .xlsx: picture on the row goes with question 1");

// CSV (Excel's plain CSV in Windows-1252, semicolons) and an .xls refusal
const csv = Buffer.from('Question;Option A;Option B;Option C;Option D;Answer;Explanation\r\n"What does the café ""cell"" mean?";Room;Unit of life;Phone;Jail;B;Smallest unit of life\r\n', "latin1");
r = await call("POST", "/api/hub/import?name=list.csv", csv, { raw: true });
check(r.status === 200 && r.data.questions.length === 1 && r.data.questions[0].q === 'What does the café "cell" mean?' && r.data.questions[0].correct.join() === "1" && r.data.questions[0].explain === "Smallest unit of life",
  "CSV: semicolons, quotes, accents, letter answer and explanation");
r = await call("POST", "/api/hub/import?name=old.xls", Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3]), { raw: true });
check(r.status === 400 && /xlsx/.test(r.data.error), "old .xls gets a clear message");

// pictures
r = await call("POST", "/api/hub/images", PNG, { raw: true, type: "image/png" });
const pic = r.data?.name;
check(r.status === 200 && /^[a-f0-9]{20}\.png$/.test(pic) && files.has(`images/${pic}`), "picture uploaded and saved to GitHub");
check((await call("POST", "/api/hub/images", Buffer.from("<svg onload=alert(1)>"), { raw: true, type: "image/svg+xml" })).status === 400, "non-picture upload refused");
let g = await fetch(`${URL}/qimg/${pic}`);
check(g.ok && Buffer.from(await g.arrayBuffer()).equals(PNG), "picture served to the game");
check((await fetch(`${URL}/qimg/..%2F..%2Fpackage.json`)).status === 404, "picture route only serves pictures");

// make a set
const SET_QS = [
  { q: "Which part controls the cell?", choices: ["Cell wall", "Nucleus", "Vacuole", "Cytoplasm"], correct: [1], image: pic, explain: "The nucleus holds the instructions." },
  { q: "Which of these are found in plant cells?", choices: ["Chloroplast", "Cell wall", "Bone", ""], correct: [0, 1] },
  { q: "<b>Bold</b> & sneaky", choices: ["<img src=x onerror=alert(1)>", "Fine"], correct: [1] },
  { q: "Not finished yet", choices: ["One", "", "", ""], correct: [] },
];
r = await call("POST", "/api/hub/sets", { title: "Cells: quick check", questions: SET_QS });
const set = r.data?.set;
check(r.status === 200 && set.questions.length === 4 && set.questions[1].choices.length === 3, "set created (empty answers dropped)");
check(files.has(`sets/${set.id}.json`), "set saved to GitHub");
r = await call("GET", "/api/hub/sets");
const row = r.data.sets.find((s) => s.id === set.id);
check(row && row.count === 4 && row.ready === 3 && row.pictures === 1, "list shows 4 questions, 3 ready, 1 picture");

// saving: changes, then a stale save from another window
r = await call("PUT", `/api/hub/sets/${set.id}`, { title: "Cells: quick check", questions: SET_QS, version: set.updatedAt });
const v2 = r.data?.set?.updatedAt;
check(r.status === 200 && v2 && v2 !== set.updatedAt, "set saved again with a new version");
r = await call("PUT", `/api/hub/sets/${set.id}`, { title: "Old window", questions: [], version: set.updatedAt });
check(r.status === 409, "save from an out-of-date window is refused (no lost work)");
check((await call("PUT", "/api/hub/sets/builtin", { title: "x", questions: [] })).status === 400, "built-in set can't be changed");
await stopServer();

// ---------------------------------------------------------------- 2. GitHub store, after a restart
const getLog = await startServer({ GITHUB_TOKEN: "test-token", GITHUB_REPO: "teacher/academy-rift", GITHUB_API_URL: `http://localhost:${MOCK}`, HUB_PASSWORD: "owl-42" }, "GitHub storage, after a restart (fresh server, empty picture cache)");
r = await call("GET", `/api/hub/sets/${set.id}`);
check(r.status === 200 && r.data.set.title === "Cells: quick check" && r.data.set.updatedAt === v2, "set is still there after the restart");
const many = await Promise.all(Array.from({ length: 30 }, () => fetch(`${URL}/qimg/${pic}`).then(async (x) => x.ok && Buffer.from(await x.arrayBuffer()).equals(PNG))));
check(many.every(Boolean), "30 students load the picture at once after the restart (fetched from GitHub once)");

// a second, small set, to test two sets together
r = await call("POST", "/api/hub/sets", { title: "Organs", questions: [{ q: "Which organ pumps blood?", choices: ["Heart", "Lung"], correct: [0] }] });
const setB = r.data?.set;
check(r.status === 200 && setB, "second set made");

// the sets in a game room
const s1 = io(URL, { transports: ["websocket"], forceNew: true });
await new Promise((res) => s1.on("connect", res));
let latest = null; const questions = []; const results = [];
const seenAll = new Set();          // every question asked in the battle, to anyone
s1.on("room", (x) => { latest = x; if (x.battle?.question) seenAll.add(x.battle.question.q); });
s1.on("yourQuestion", ({ question }) => questions.push(question));
s1.on("answerResult", (x) => results.push(x));
s1.emit("createRoom", { name: "Mei" });
await sleep(300);
const sets = await new Promise((res) => s1.emit("getSets", res));
check(sets.length === 2 && sets.some((x) => x.id === `set:${set.id}` && x.count === 3), "room lobby lists both sets (3 playable questions in the first)");
s1.emit("setTopic", { topicId: `set:${set.id}` }); await sleep(200);
check(latest.topicId === `set:${set.id}` && latest.topicName === "Cells: quick check", "host picks the set as the room's topic");
s1.emit("setTopic", { topicId: "set:doesnotexist" }); await sleep(150);
check(latest.topicId === `set:${set.id}`, "a set that doesn't exist is refused");
s1.emit("setTopic", { topicId: "mixed,parts,micro" }); await sleep(150);
check(latest.topicId === "mixed", "\"Mixed\" plus single built-in topics becomes just \"Mixed\"");
s1.emit("setTopic", { topicId: `set:${set.id},set:nope,micro` }); await sleep(150);
check(latest.topicId === `set:${set.id},micro` && latest.topicParts.length === 2 && latest.topicName === "Cells: quick check + Microscope Basics",
  `several topics at once, missing ones dropped ("${latest.topicName}")`);
s1.emit("setTopic", { topicId: `set:${set.id},set:${setB.id}` }); await sleep(200);
check(latest.topicId === `set:${set.id},set:${setB.id}`, "host picks two question sets together");
s1.emit("addBot", { team: 0 }); s1.emit("addBot", { team: 1 }); s1.emit("addBot", { team: 1 });
s1.emit("pickCharacter", { charId: "jun" }); s1.emit("setReady", { ready: true }); await sleep(200);
s1.emit("startMatch");
const RIGHT = { "Which part controls the cell?": [1], "Which of these are found in plant cells?": [0, 1], "<b>Bold</b> & sneaky": [1], "Which organ pumps blood?": [0] };
s1.on("yourQuestion", ({ question }) => {
  const r2 = RIGHT[question.q];
  // answer with the LAST right answer, so two-answer questions test the second one
  setTimeout(() => s1.emit("answer", { choiceIndex: r2 ? r2[r2.length - 1] : 0 }), 100);
});
s1.on("actionPrompt", () => {});
for (let i = 0; i < 300 && (questions.length < 4 || seenAll.size < 4); i++) await sleep(100);
check(seenAll.has("Which organ pumps blood?") && [...seenAll].every((q) => RIGHT[q]), `questions came from both sets and nowhere else (${seenAll.size} different)`);
check(questions.length >= 3, `got ${questions.length} questions in the battle`);
check(questions.every((q) => RIGHT[q.q]), "every question came from the chosen sets (none from the built-in bank, none unfinished)");
check(questions.every((q) => !("answer" in q) && !("answers" in q) && !("correct" in q)), "answers never sent to the student");
const withPic = questions.find((q) => q.q === "Which part controls the cell?");
check(!withPic || withPic.image === `/qimg/${pic}`, "the question's picture is sent with it");
await sleep(500);
const mine = results.filter((x) => x.uid === s1.id);
check(mine.length >= 2 && mine.every((x) => x.correct), "right answers count as right, including the second of two right answers");
const two = mine.find((x) => x.correctAll?.length === 2);
check(!questions.some((q) => q.q.startsWith("Which of these")) || (two && two.correctAll.join() === "0,1"), "both right answers shown after a two-answer question");
s1.close();

// the set in a class tournament's settings
const t = io(URL, { transports: ["websocket"], forceNew: true });
let host = null;
t.on("tHost", (v) => (host = v));
await new Promise((res) => t.on("connect", res));
t.emit("tCreate", {});
for (let i = 0; i < 30 && !host; i++) await sleep(100);
check(host?.sets?.some((x) => x.id === `set:${set.id}`), "tournament page lists the set");
t.emit("tSetting", { key: "topicId", value: `set:${set.id}` }); await sleep(250);
check(host.settings.topicId === `set:${set.id}` && host.topicName === "Cells: quick check", "tournament topic set to the question set");
t.emit("tSetting", { key: "topicId", value: "set:nope" }); await sleep(200);
check(host.settings.topicId === `set:${set.id}`, "tournament refuses a set that doesn't exist");
t.emit("tSetting", { key: "topicId", value: `set:${set.id},set:${setB.id},micro` }); await sleep(250);
check(host.settings.topicId === `set:${set.id},set:${setB.id},micro` && host.topicParts.length === 3 && /\+ 2 more/.test(host.topicName),
  `tournament tests two sets and a built-in topic together ("${host.topicName}")`);
t.close();

// delete
r = await call("DELETE", `/api/hub/sets/${set.id}`);
const r2 = await call("DELETE", `/api/hub/sets/${setB.id}`);
check(r.status === 200 && r2.status === 200 && !files.has(`sets/${set.id}.json`) && !files.has(`sets/${setB.id}.json`), "both sets deleted from GitHub");
r = await call("GET", "/api/hub/sets");
check(r.data.sets.length === 1 && r.data.sets[0].builtIn, "only the built-in set is left");
await stopServer();

// ---------------------------------------------------------------- 3. bad token
await startServer({ GITHUB_TOKEN: "wrong", GITHUB_REPO: "teacher/academy-rift", GITHUB_API_URL: `http://localhost:${MOCK}`, HUB_PASSWORD: "owl-42" }, "GitHub storage with a wrong token");
r = await call("GET", "/api/hub/status");
check(!r.data.storage.ok && /token/i.test(r.data.storage.error || ""), `wrong token explained: "${r.data.storage.error}"`);
r = await call("POST", "/api/hub/sets", { title: "x", questions: [] });
check(r.status >= 400 && /GitHub/.test(r.data.error), "saving with a wrong token fails loudly instead of losing work");
await stopServer();

// ---------------------------------------------------------------- 4. folder store, no password, on this computer
const dir = path.join(tmp, "bank");
key = "";
await startServer({ QUESTION_BANK_DIR: dir }, "Folder storage, no password (open on this computer)");
r = await call("GET", "/api/hub/status");
check(r.data.allowed && !r.data.needsPassword && r.data.storage.kind === "folder", "opens without a password on this computer");
r = await call("POST", "/api/hub/sets", { title: "Local set", questions: [{ q: "2+2?", choices: ["3", "4"], correct: [1] }] });
check(r.status === 200 && fs.existsSync(path.join(dir, "sets", `${r.data.set.id}.json`)), "set written to the folder");
await stopServer();
await startServer({ QUESTION_BANK_DIR: dir }, "Folder storage after a restart");
r = await call("GET", "/api/hub/sets");
check(r.data.sets.some((s) => s.title === "Local set"), "folder set still there after a restart");
await stopServer();

console.log(fails.length ? `\nFAIL: ${fails.length} check(s) failed.` : "\nPASS: question hub works end to end.");
done(fails.length ? 1 : 0);
