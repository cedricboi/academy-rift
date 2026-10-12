// ===== Academy Rift — question bank (the teacher's question hub) =====
// Question sets made in the hub at /hub. Each set is one JSON file; pictures are
// separate files named after their content.
//
// Where they are kept:
//   • GITHUB_TOKEN set  → on a branch of the game's own GitHub repository
//     (default branch name "question-bank"). Survives Render restarts and
//     redeploys, and saving never redeploys the game.
//   • otherwise         → in a folder next to the game (QUESTION_BANK_DIR,
//     default ./question-bank). Permanent on your own computer, but Render's
//     free plan wipes it whenever the server restarts.
//
// Answers stay on the server: students only ever get the question, the
// choices and the picture.
import express from "express";
import crypto from "crypto";
import fs from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import os from "os";
import { join } from "path";
import ExcelJS from "exceljs";
import {
  rowsToQuestions, parseDelimited, guessDelimiter, questionProblems, MAX_CHOICES, MAX_QUESTIONS,
} from "./public/data/importRows.js";

const IMG_RE = /^[a-f0-9]{20}\.(jpg|png|webp|gif)$/;
const ID_RE = /^[a-z0-9]{4,24}$/;
const isId = (v) => typeof v === "string" && ID_RE.test(v);
const isImage = (v) => typeof v === "string" && IMG_RE.test(v);
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const BUILT_IN_ID = "builtin";

const newId = () => crypto.randomBytes(8).toString("hex").slice(0, 12);

function imageExt(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.toString("ascii", 0, 4) === "GIF8") return "gif";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

function cleanText(v, max) {
  return String(v ?? "").replace(/\r/g, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

// Tidy one question coming from the hub (or a saved file).
function cleanQuestion(q) {
  const raw = Array.isArray(q?.choices) ? q.choices.slice(0, MAX_CHOICES).map((c) => cleanText(c, 200)) : [];
  const want = new Set((Array.isArray(q?.correct) ? q.correct : []).map(Number).filter((i) => Number.isInteger(i)));
  const choices = [], correct = [];
  raw.forEach((c, i) => { if (c) { if (want.has(i)) correct.push(choices.length); choices.push(c); } });
  return {
    id: isId(q?.id) ? q.id : newId(),
    q: cleanText(q?.q, 600),
    choices, correct,
    explain: cleanText(q?.explain, 600),
    image: isImage(q?.image) ? q.image : null,
  };
}

function cleanSet(input, { id, createdAt } = {}) {
  const now = new Date().toISOString();
  return {
    id: id || (isId(input?.id) ? input.id : newId()),
    title: cleanText(input?.title, 80) || "Untitled set",
    createdAt: createdAt || input?.createdAt || now,
    updatedAt: input?.updatedAt || now,
    questions: (Array.isArray(input?.questions) ? input.questions : []).slice(0, MAX_QUESTIONS).map(cleanQuestion),
  };
}

const playable = (q) => questionProblems(q).length === 0;

// Write a whole file or nothing, so a student never gets half a picture.
async function writeAtomic(file, buf) {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, buf);
  await fs.rename(tmp, file);
}

// ---------------------------------------------------------------- storage: a folder
class FolderStore {
  constructor(dir) { this.kind = "folder"; this.dir = dir; }
  async init() {
    await fs.mkdir(join(this.dir, "sets"), { recursive: true });
    await fs.mkdir(join(this.dir, "images"), { recursive: true });
    const out = [];
    for (const f of await fs.readdir(join(this.dir, "sets"))) {
      if (!/^[a-z0-9]+\.json$/.test(f)) continue;
      try { out.push(JSON.parse(await fs.readFile(join(this.dir, "sets", f), "utf8"))); }
      catch (e) { console.warn(`[bank] could not read ${f}: ${e.message}`); }
    }
    return out;
  }
  async saveSet(set) {
    await writeAtomic(join(this.dir, "sets", `${set.id}.json`), JSON.stringify(set, null, 2));
  }
  async deleteSet(id) { await fs.rm(join(this.dir, "sets", `${id}.json`), { force: true }); }
  async putImage(name, buf) { const p = this.imagePath(name); if (!existsSync(p)) await writeAtomic(p, buf); }
  imagePath(name) { return join(this.dir, "images", name); }
}

// ---------------------------------------------------------------- storage: GitHub
const BRANCH_README = `# Academy Rift question bank

This branch is written by the game's question hub (/hub). It holds only question
sets (sets/*.json) and their pictures (images/). The game itself lives on the main
branch. Edit questions in the hub rather than here.
`;

class GitHubStore {
  constructor({ token, repo, branch, api }) {
    this.kind = "github";
    Object.assign(this, { token, repo, branch, api: api.replace(/\/$/, "") });
    this.shas = new Map();              // path → blob sha, needed to update or delete a file
    this.queue = Promise.resolve();     // one write at a time, so commits never collide
    this.cacheDir = join(os.tmpdir(), "academy-rift-images");
    mkdirSync(this.cacheDir, { recursive: true });
  }
  call(method, path, body, accept = "application/vnd.github+json") {
    return fetch(`${this.api}/repos/${this.repo}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`, Accept: accept, "User-Agent": "academy-rift",
        "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  async fail(r, what) {
    let msg = ""; try { msg = (await r.json()).message || ""; } catch {}
    const hint = r.status === 401 ? " The GITHUB_TOKEN is wrong or has expired."
      : r.status === 409 && /empty/i.test(msg) ? ` The repository ${this.repo} is empty. On GitHub, add a README file to it, then restart the game.`
      : r.status === 403 || r.status === 404 ? ` Check that GITHUB_REPO is right and that the token can read and write "Contents" on ${this.repo}.` : "";
    return new Error(`GitHub could not ${what} (${r.status}${msg ? ": " + msg : ""}).${hint}`);
  }
  async json(method, path, body, what) {
    const r = await this.call(method, path, body);
    if (!r.ok) throw await this.fail(r, what);
    return r.json();
  }
  enqueue(fn) { const p = this.queue.then(fn, fn); this.queue = p.catch(() => {}); return p; }

  async init() {
    const b = encodeURIComponent(this.branch);
    const r = await this.call("GET", `/branches/${b}`);
    if (r.status === 404) {
      const repo = await this.call("GET", "");
      if (!repo.ok) throw await this.fail(repo, `open the repository ${this.repo}`);
      await this.createBranch();
    } else if (!r.ok) throw await this.fail(r, `open the branch "${this.branch}"`);
    const tree = await this.json("GET", `/git/trees/${b}?recursive=1`, null, "list the question bank");
    this.shas.clear();
    for (const e of tree.tree || []) if (e.type === "blob") this.shas.set(e.path, e.sha);
    const out = [];
    for (const [path, sha] of this.shas) {
      if (!/^sets\/[a-z0-9]+\.json$/.test(path)) continue;
      try {
        const blob = await this.json("GET", `/git/blobs/${sha}`, null, `read ${path}`);
        out.push(JSON.parse(Buffer.from(blob.content, "base64").toString("utf8")));
      } catch (e) { console.warn(`[bank] could not read ${path}: ${e.message}`); }
    }
    return out;
  }
  // A branch of its own with no game code on it, holding only the question bank.
  async createBranch() {
    const tree = await this.json("POST", "/git/trees", { tree: [{ path: "README.md", mode: "100644", type: "blob", content: BRANCH_README }] }, "start the question bank");
    const commit = await this.json("POST", "/git/commits", { message: "Start the question bank", tree: tree.sha, parents: [] }, "start the question bank");
    await this.json("POST", "/git/refs", { ref: `refs/heads/${this.branch}`, sha: commit.sha }, `create the branch "${this.branch}"`);
    console.log(`[bank] created branch "${this.branch}" on ${this.repo}`);
  }
  write(path, buf, message) {
    return this.enqueue(async () => {
      const body = { message, content: buf.toString("base64"), branch: this.branch };
      if (this.shas.has(path)) body.sha = this.shas.get(path);
      let r = await this.call("PUT", `/contents/${path}`, body);
      if (r.status === 409 || r.status === 422) {          // our copy of the file's sha is out of date
        const cur = await this.call("GET", `/contents/${path}?ref=${encodeURIComponent(this.branch)}`);
        if (cur.ok) body.sha = (await cur.json()).sha; else delete body.sha;
        r = await this.call("PUT", `/contents/${path}`, body);
      }
      if (!r.ok) throw await this.fail(r, `save ${path}`);
      this.shas.set(path, (await r.json()).content.sha);
    });
  }
  remove(path, message) {
    return this.enqueue(async () => {
      let sha = this.shas.get(path);
      if (!sha) {
        const cur = await this.call("GET", `/contents/${path}?ref=${encodeURIComponent(this.branch)}`);
        if (cur.status === 404) return;
        if (!cur.ok) throw await this.fail(cur, `find ${path}`);
        sha = (await cur.json()).sha;
      }
      const r = await this.call("DELETE", `/contents/${path}`, { message, sha, branch: this.branch });
      if (!r.ok && r.status !== 404) throw await this.fail(r, `delete ${path}`);
      this.shas.delete(path);
    });
  }
  saveSet(set) { return this.write(`sets/${set.id}.json`, Buffer.from(JSON.stringify(set, null, 2)), `Save "${set.title}"`); }
  deleteSet(id) { return this.remove(`sets/${id}.json`, `Delete set ${id}`); }
  async putImage(name, buf) {
    await writeAtomic(this.imagePath(name), buf);          // serve it straight away from here
    if (!this.shas.has(`images/${name}`)) await this.write(`images/${name}`, buf, "Add a picture");
  }
  imagePath(name) { return join(this.cacheDir, name); }
  async readImage(name) {
    const r = await this.call("GET", `/contents/images/${name}?ref=${encodeURIComponent(this.branch)}`, null, "application/vnd.github.raw");
    if (r.status === 404) return null;
    if (!r.ok) throw await this.fail(r, `load picture ${name}`);
    return Buffer.from(await r.arrayBuffer());
  }
}

// ---------------------------------------------------------------- the bank
export function createBank({ builtIn = [], builtInTitle = "Built-in questions" } = {}) {
  const token = (process.env.GITHUB_TOKEN || "").trim();
  const repo = (process.env.GITHUB_REPO || process.env.RENDER_GIT_REPO_SLUG || "").trim();
  const branch = (process.env.QUESTION_BANK_BRANCH || "question-bank").trim();
  const dir = process.env.QUESTION_BANK_DIR || join(process.cwd(), "question-bank");
  let store = null, setupError = null;
  if (token && !repo) setupError = "GITHUB_TOKEN is set but the game does not know which repository to use. Add GITHUB_REPO (for example yourname/academy-rift).";
  else if (token) store = new GitHubStore({ token, repo, branch, api: process.env.GITHUB_API_URL || "https://api.github.com" });
  else store = new FolderStore(dir);

  const sets = new Map();
  let state = { ok: false, loading: true, error: setupError, at: 0 };
  let loading = null;
  function load() {
    if (!store) return Promise.resolve();
    loading ||= (async () => {
      state = { ...state, loading: true, at: Date.now() };
      try {
        const list = await store.init();
        sets.clear();
        for (const raw of list) { const s = cleanSet(raw); sets.set(s.id, s); }
        state = { ok: true, loading: false, error: null, at: Date.now() };
        console.log(`[bank] ${sets.size} question set${sets.size === 1 ? "" : "s"} loaded (${store.kind === "github" ? `GitHub ${repo}, branch ${branch}` : dir})`);
      } catch (e) {
        state = { ok: false, loading: false, error: e.message, at: Date.now() };
        console.warn(`[bank] ${e.message}`);
      } finally { loading = null; }
    })();
    return loading;
  }
  const ready = load();
  // try again (at most every 20 s) if the last attempt failed, e.g. GitHub was down
  async function ensure() {
    if (loading) await loading;
    if (!state.ok && store && Date.now() - state.at > 20000) await load();
    if (!state.ok) throw new Error(state.error || "The question bank is not ready.");
  }

  // ---- built-in questions (read-only, can be copied) ----
  const builtInSet = {
    id: BUILT_IN_ID, title: builtInTitle, builtIn: true, createdAt: null, updatedAt: null,
    questions: builtIn.map((q, i) => ({
      id: `b${i}`, q: q.q, choices: q.choices.slice(), correct: [q.answer], explain: q.explain || "", image: null, topic: q.topic,
    })),
  };

  const summary = (s) => ({
    id: s.id, title: s.title, count: s.questions.length, ready: s.questions.filter(playable).length,
    pictures: s.questions.filter((q) => q.image).length, updatedAt: s.updatedAt, builtIn: !!s.builtIn,
  });

  const bank = {
    ready,
    storage() {
      if (!store) return { kind: "github", ok: false, error: setupError };
      return {
        kind: store.kind, ok: state.ok, loading: state.loading, error: state.error,
        repo: store.kind === "github" ? repo : undefined, branch: store.kind === "github" ? branch : undefined,
        onRender: !!process.env.RENDER,
      };
    },
    async list() { await ensure(); return [summary(builtInSet), ...[...sets.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(summary)]; },
    async get(id) { if (id === BUILT_IN_ID) return builtInSet; await ensure(); return sets.get(id) || null; },
    async create(input) {
      await ensure();
      const set = cleanSet({ ...input, id: undefined, createdAt: undefined, updatedAt: undefined });
      await store.saveSet(set); sets.set(set.id, set); return set;
    },
    async update(id, input, version) {
      await ensure();
      const cur = sets.get(id);
      if (!cur) { const e = new Error("That set no longer exists."); e.status = 404; throw e; }
      if (version && version !== cur.updatedAt) { const e = new Error("This set was changed in another window. Reload it to see the latest version."); e.status = 409; throw e; }
      let stamp = new Date().toISOString();
      if (stamp <= cur.updatedAt) stamp = new Date(Date.parse(cur.updatedAt) + 1).toISOString();
      const set = cleanSet({ ...input, updatedAt: stamp }, { id, createdAt: cur.createdAt });
      await store.saveSet(set); sets.set(id, set); return set;
    },
    async remove(id) { await ensure(); if (!sets.has(id)) return; await store.deleteSet(id); sets.delete(id); },
    async addImage(buf) {
      await ensure();
      const ext = imageExt(buf);
      if (!ext) { const e = new Error("That file is not a picture the game can show (use PNG, JPG, GIF or WebP)."); e.status = 400; throw e; }
      if (buf.length > MAX_IMAGE_BYTES) { const e = new Error("That picture is too big (3 MB at most)."); e.status = 400; throw e; }
      const name = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 20) + "." + ext;
      await store.putImage(name, buf);
      return name;
    },
    // path of a picture file on this server, fetching it from GitHub the first time
    inflight: new Map(),
    async imageFile(name) {
      if (!isImage(name) || !store) return null;
      const p = store.imagePath(name);
      if (existsSync(p)) return p;
      if (store.kind !== "github") return null;
      if (!this.inflight.has(name)) {          // 30 students ask for the same picture at once: fetch it once
        this.inflight.set(name, store.readImage(name)
          .then(async (buf) => { if (!buf) return null; await writeAtomic(p, buf); return p; })
          .finally(() => this.inflight.delete(name)));
      }
      return this.inflight.get(name);
    },

    // ---- for the game ----
    // Sets that can be played, for the lobby and tournament pickers.
    playableSets() {
      return [...sets.values()]
        .map((s) => ({ id: "set:" + s.id, title: s.title, count: s.questions.filter(playable).length }))
        .filter((s) => s.count > 0)
        .sort((a, b) => a.title.localeCompare(b.title));
    },
    isSetTopic(topicId) {
      const s = typeof topicId === "string" && topicId.startsWith("set:") ? sets.get(topicId.slice(4)) : null;
      return !!s && s.questions.some(playable);
    },
    topicName(topicId) { return typeof topicId === "string" && topicId.startsWith("set:") ? sets.get(topicId.slice(4))?.title || null : null; },
    // Battle-ready questions from a set (answers included: server use only).
    gameQuestions(topicId) {
      const s = typeof topicId === "string" && topicId.startsWith("set:") ? sets.get(topicId.slice(4)) : null;
      if (!s) return null;
      return s.questions.filter(playable).map((q) => ({
        q: q.q, choices: q.choices, answer: q.correct[0], answers: q.correct.slice(),
        topic: s.title, topicId: "set:" + s.id, bloom: null, explain: q.explain || "",
        image: q.image ? `/qimg/${q.image}` : null,
      }));
    },
  };
  return bank;
}

// ---------------------------------------------------------------- reading files
function decodeText(buf) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, ""); }
  catch { return new TextDecoder("windows-1252").decode(buf); }     // Excel's plain "CSV" (not "CSV UTF-8")
}

async function readSpreadsheet(buf, name) {
  const lower = String(name || "").toLowerCase();
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
  if (lower.endsWith(".xls") && !isZip) throw Object.assign(new Error("Old .xls files can't be read. In Excel choose File → Save As → Excel Workbook (.xlsx), or CSV."), { status: 400 });
  if (lower.endsWith(".numbers")) throw Object.assign(new Error("Numbers files can't be read. In Numbers choose File → Export To → Excel or CSV."), { status: 400 });
  if (!isZip) {
    const text = decodeText(buf);
    return { ...rowsToQuestions(parseDelimited(text, guessDelimiter(text))), sheet: null };
  }
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buf); }
  catch { throw Object.assign(new Error("That file could not be opened as a spreadsheet. Save it as .xlsx or .csv and try again."), { status: 400 }); }
  let best = null;
  for (const ws of wb.worksheets) {
    const rows = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r), cells = [];
      for (let c = 1; c <= row.cellCount; c++) cells.push(row.getCell(c).text ?? "");
      rows.push(cells);
    }
    const res = rowsToQuestions(rows);
    if (!best || res.questions.length > best.res.questions.length) best = { ws, res };
  }
  if (!best) return { questions: [], skipped: [], sheet: null };
  // Pictures placed on a question's row go with that question.
  const { ws, res } = best;
  const byRow = new Map(res.questions.map((q) => [q.row, q]));
  for (const img of ws.getImages()) {
    const r0 = img.range?.tl?.nativeRow ?? Math.floor(img.range?.tl?.row ?? -1);
    const q = byRow.get(r0 + 1) && !byRow.get(r0 + 1).picture ? byRow.get(r0 + 1)
      : byRow.get(r0 + 2) && !byRow.get(r0 + 2).picture ? byRow.get(r0 + 2) : null;
    const media = wb.getImage(Number(img.imageId));
    if (!q || !media?.buffer) continue;
    const ext = imageExt(Buffer.from(media.buffer));
    if (!ext) { res.skipped.push({ row: q.row, reason: "The picture on this row is a type the game can't show (use PNG or JPG)." }); continue; }
    q.picture = { type: ext === "jpg" ? "image/jpeg" : `image/${ext}`, data: Buffer.from(media.buffer).toString("base64") };
  }
  return { ...res, sheet: ws.name };
}

// ---------------------------------------------------------------- hub web routes
export function mountHub(app, bank, { publicDir }) {
  const password = process.env.HUB_PASSWORD || "";
  const keyFor = (pw) => crypto.createHmac("sha256", pw).update("academy-rift-hub").digest("hex");
  const isLocal = (req) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
  const fails = new Map();   // ip → { n, until }

  const allowed = (req) => {
    if (!password) return isLocal(req);
    const got = Buffer.from(String(req.get("x-hub-key") || ""));
    const want = Buffer.from(keyFor(password));
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  };
  const auth = (req, res, next) => {
    if (allowed(req)) return next();
    res.status(401).json({ error: password ? "Please sign in again." : "Open the hub on the computer running the game, or set HUB_PASSWORD." });
  };
  const handle = (fn) => async (req, res) => {
    try { await fn(req, res); }
    catch (e) { res.status(e.status || 500).json({ error: e.message || "Something went wrong." }); }
  };
  const json = express.json({ limit: "3mb" });
  const raw = (limit) => express.raw({ type: () => true, limit });

  app.get("/hub", (_req, res) => { res.setHeader("Cache-Control", "no-cache"); res.sendFile(join(publicDir, "hub.html")); });

  app.get("/qimg/:name", handle(async (req, res) => {
    const file = await bank.imageFile(req.params.name);
    if (!file) return res.status(404).end();
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.sendFile(file);
  }));

  app.get("/api/hub/status", (req, res) => {
    res.json({ needsPassword: !!password, allowed: allowed(req), local: isLocal(req), storage: bank.storage() });
  });

  app.post("/api/hub/login", json, (req, res) => {
    const ip = req.ip, now = Date.now();
    const f = fails.get(ip);
    if (f && f.n >= 8 && f.until > now) return res.status(429).json({ error: "Too many tries. Wait 10 minutes and try again." });
    if (!password) return res.status(400).json({ error: "No password is set for the hub." });
    const given = Buffer.from(keyFor(typeof req.body?.password === "string" ? req.body.password : "")), want = Buffer.from(keyFor(password));
    if (crypto.timingSafeEqual(given, want)) { fails.delete(ip); return res.json({ key: want.toString() }); }
    fails.set(ip, { n: (f && f.until > now ? f.n : 0) + 1, until: now + 10 * 60 * 1000 });
    res.status(401).json({ error: "That password is not right." });
  });

  app.get("/api/hub/sets", auth, handle(async (_req, res) => res.json({ sets: await bank.list() })));
  app.get("/api/hub/sets/:id", auth, handle(async (req, res) => {
    const set = await bank.get(req.params.id);
    if (!set) return res.status(404).json({ error: "That set no longer exists." });
    res.json({ set });
  }));
  app.post("/api/hub/sets", auth, json, handle(async (req, res) => res.json({ set: await bank.create(req.body || {}) })));
  app.put("/api/hub/sets/:id", auth, json, handle(async (req, res) => {
    if (req.params.id === BUILT_IN_ID) return res.status(400).json({ error: "The built-in set can't be changed. Make a copy instead." });
    res.json({ set: await bank.update(req.params.id, req.body || {}, req.body?.version) });
  }));
  app.delete("/api/hub/sets/:id", auth, handle(async (req, res) => { await bank.remove(req.params.id); res.json({ ok: true }); }));
  app.post("/api/hub/images", auth, raw("4mb"), handle(async (req, res) => {
    const name = await bank.addImage(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
    res.json({ name, url: `/qimg/${name}` });
  }));
  app.post("/api/hub/import", auth, raw("25mb"), handle(async (req, res) => {
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!buf.length) return res.status(400).json({ error: "That file is empty." });
    res.json(await readSpreadsheet(buf, req.query.name));
  }));
  // Errors from the body readers (file too large and so on) as JSON the hub can show.
  app.use("/api/hub", (err, _req, res, _next) => {
    const big = err?.type === "entity.too.large";
    res.status(big ? 413 : 400).json({ error: big ? "That file is too big." : "That upload could not be read." });
  });
}
