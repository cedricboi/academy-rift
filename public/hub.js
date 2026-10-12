// ===== Academy Rift — question hub (/hub) =====
// The teacher's own question sets: type them, paste them, import a Blooket or
// other spreadsheet, and add pictures. Sets are saved on the game server
// (and from there to GitHub when that is set up). Changes save by themselves.
import { parsePasted, questionProblems, MAX_CHOICES, MAX_QUESTIONS } from "./data/importRows.js";

const $ = (id) => document.getElementById(id);
const main = $("main");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const newId = () => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, "0")).join("");
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const KEY = "riftHubKey";

let key = "";
try { key = localStorage.getItem(KEY) || ""; } catch {}
let status = null;              // /api/hub/status
let view = "";                  // "sets" | "editor"
let cur = null;                 // the set being edited
let editSeq = 0, savedSeq = 0, saving = false, saveTimer = null, saveError = "";
let focusQ = -1;                // question the teacher last worked on (pasted pictures go there)
let undo = null;

// ---------------------------------------------------------------- server calls
async function api(method, path, body, { raw = false, type } = {}) {
  const headers = {};
  if (key) headers["X-Hub-Key"] = key;
  let payload;
  if (raw) { payload = body; headers["Content-Type"] = type || "application/octet-stream"; }
  else if (body !== undefined) { payload = JSON.stringify(body); headers["Content-Type"] = "application/json"; }
  let res;
  try { res = await fetch(path, { method, headers, body: payload }); }
  catch { throw new Error("Can't reach the game server. Check the connection and try again."); }
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 401 && status?.needsPassword) { forgetKey(); renderLogin("Please sign in again."); }
  if (!res.ok) throw Object.assign(new Error(data.error || `Something went wrong (${res.status}).`), { status: res.status });
  return data;
}
function forgetKey() { key = ""; try { localStorage.removeItem(KEY); } catch {} }

// ---------------------------------------------------------------- start
async function boot() {
  try { status = await api("GET", "/api/hub/status"); }
  catch (e) { main.innerHTML = card("Can't open the hub", `<p>${esc(e.message)}</p>`); return; }
  renderStoreChip();
  if (!status.allowed) return status.needsPassword ? renderLogin() : renderNoPassword();
  $("signOut").hidden = !status.needsPassword;
  route();
}

async function route() {
  const m = location.hash.match(/^#set\/([a-z0-9]+)$/);
  if (m) await openSet(m[1]); else await showSets();
}
window.addEventListener("hashchange", async () => {
  if (view === "editor") {
    await flushSave();
    if (editSeq !== savedSeq && !confirm("Some changes were not saved. Leave anyway?")) {
      history.replaceState(null, "", `#set/${cur.id}`); return;
    }
  }
  route();
});
window.addEventListener("beforeunload", (e) => {
  if (view === "editor" && editSeq !== savedSeq) { e.preventDefault(); e.returnValue = ""; }
});
$("signOut").addEventListener("click", () => { forgetKey(); location.hash = ""; renderLogin(); });

const card = (title, body) => `<section class="h-card"><h1>${esc(title)}</h1>${body}</section>`;

function renderLogin(msg = "") {
  view = "login"; $("signOut").hidden = true;
  main.innerHTML = `<section class="h-card h-login">
    <h1>Question hub</h1>
    <p>Enter the hub password to add and change question sets.</p>
    <form id="loginForm" class="h-login-form">
      <input type="password" id="pw" autocomplete="current-password" aria-label="Hub password" placeholder="Password" required />
      <button class="h-btn primary" type="submit">Sign in</button>
    </form>
    <p class="h-err" id="loginErr">${esc(msg)}</p>
  </section>`;
  $("pw").focus();
  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const { key: k } = await api("POST", "/api/hub/login", { password: $("pw").value });
      key = k; try { localStorage.setItem(KEY, k); } catch {}
      status.allowed = true; $("signOut").hidden = false; route();
    } catch (err) { $("loginErr").textContent = err.message; $("pw").select(); }
  });
}

function renderNoPassword() {
  view = "blocked";
  main.innerHTML = card("The hub needs a password first", `
    <p>So that students can't change your questions, the hub only opens on the computer that runs the game until you give it a password.</p>
    <h2>Game running on Render</h2>
    <ol>
      <li>Open your Academy Rift service on <b>dashboard.render.com</b> and go to <b>Environment</b>.</li>
      <li>Add a variable named <code>HUB_PASSWORD</code> with a password only you know, and save.</li>
      <li>Render restarts the game (about a minute). Then reload this page.</li>
    </ol>
    <h2>Game running on your own computer</h2>
    <p>Open <code>http://localhost:${esc(location.port || "80")}/hub</code> on that computer.</p>`);
}

// ---------------------------------------------------------------- where sets are kept
function renderStoreChip() {
  const s = status.storage, chip = $("storeChip");
  chip.hidden = false;
  if (s.kind === "github" && s.ok) { chip.className = "h-store ok"; chip.textContent = "Saving to GitHub"; chip.title = `${s.repo}, branch ${s.branch}`; }
  else if (s.kind === "github") { chip.className = "h-store bad"; chip.textContent = s.loading ? "Connecting to GitHub…" : "GitHub saving needs fixing"; }
  else if (s.onRender) { chip.className = "h-store warn"; chip.textContent = "Not saved permanently"; }
  else { chip.className = "h-store ok"; chip.textContent = "Saved on this computer"; }
}

const GITHUB_STEPS = `
  <ol class="h-steps">
    <li>On GitHub press <b>+ → New repository</b>. Name it <b>academy-rift-questions</b>, choose <b>Private</b>, tick <b>Add a README file</b> and press <b>Create repository</b>. Keep it private: your sets hold the right answers.</li>
    <li>Open <b>Settings → Developer settings → Personal access tokens → Fine-grained tokens</b> and press <b>Generate new token</b>.</li>
    <li>Name it "Academy Rift questions". For <b>Expiration</b> choose no expiry if it is offered, otherwise the longest. Under <b>Repository access</b> choose <b>Only select repositories</b> and pick <b>academy-rift-questions</b>.</li>
    <li>Under <b>Repository permissions</b> set <b>Contents</b> to <b>Read and write</b>. Press <b>Generate token</b> and copy it straight away (GitHub shows it only once).</li>
    <li>On <b>dashboard.render.com</b> open the game's service and go to <b>Environment</b>. Add <code>GITHUB_TOKEN</code> with the token, and <code>GITHUB_REPO</code> with <b>your-github-name/academy-rift-questions</b>. Choose <b>Save and deploy</b>. The game restarts once (a minute or two).</li>
  </ol>
  <p class="h-small">Your sets are then kept on a branch called <b>question-bank</b> in that repository. Saving a set does not restart or redeploy the game.</p>`;

function storageBanner() {
  const s = status.storage;
  if (s.kind === "github" && !s.ok && !s.loading) return `<div class="h-banner bad"><b>Your sets can't be saved to GitHub right now.</b><p>${esc(s.error || "")}</p>
    <details><summary>How to set up GitHub saving</summary>${GITHUB_STEPS}</details></div>`;
  if (s.kind === "folder" && s.onRender) return `<div class="h-banner warn"><b>Sets made now are lost when Render restarts the game.</b>
    <p>Render's free plan wipes saved files on every restart. Set up GitHub saving once (about 5 minutes) before you make sets, and they stay for good.</p>
    <details><summary>How to set up GitHub saving</summary>${GITHUB_STEPS}</details></div>`;
  return "";
}

// ---------------------------------------------------------------- list of sets
async function showSets() {
  view = "sets"; cur = null;
  main.innerHTML = `<p class="h-loading">Loading your question sets…</p>`;
  let sets;
  try { sets = (await api("GET", "/api/hub/sets")).sets; }
  catch (e) {
    try { status = await api("GET", "/api/hub/status"); renderStoreChip(); } catch {}
    main.innerHTML = storageBanner() + card("Your sets could not be loaded", `<p>${esc(e.message)}</p><button class="h-btn" data-act="reload">Try again</button>`);
    return;
  }
  main.innerHTML = `
    ${storageBanner()}
    <div class="h-head">
      <div>
        <h1>Question sets</h1>
        <p class="h-sub">Make a set here, then pick it as the topic in a tournament's Settings or in a game room.</p>
      </div>
      <div class="h-actions">
        <button class="h-btn primary" data-act="new">New set</button>
        <button class="h-btn" data-act="import">Import a spreadsheet</button>
      </div>
    </div>
    <p class="h-hint">Blooket spreadsheets (.xlsx or .csv) work as they are. You can also drop a file anywhere on this page.</p>
    <div class="h-grid">${sets.map(setCard).join("")}</div>
    ${sets.length === 1 ? `<p class="h-empty">You have no sets of your own yet. Press <b>New set</b>, or import a spreadsheet.</p>` : ""}`;
}

function ago(iso) {
  const ms = Date.now() - Date.parse(iso);
  if (!(ms >= 0)) return "";
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${plural(m, "minute")} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${plural(h, "hour")} ago`;
  return "on " + new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function setCard(s) {
  const fix = s.count - s.ready;
  return `<article class="h-set ${s.builtIn ? "builtin" : ""}">
    <h2>${esc(s.title)}</h2>
    <p class="h-set-meta">${plural(s.count, "question")}${s.pictures ? ` · ${s.pictures} with pictures` : ""}</p>
    ${fix > 0 ? `<p class="h-set-fix">${fix} need${fix === 1 ? "s" : ""} fixing before ${fix === 1 ? "it" : "they"} can be played</p>` : ""}
    <p class="h-set-when">${s.builtIn ? "Comes with the game · can't be changed" : "Changed " + ago(s.updatedAt)}</p>
    <div class="h-set-actions">
      ${s.builtIn
        ? `<button class="h-btn" data-act="copy" data-id="${esc(s.id)}">Make a copy to edit</button>`
        : `<a class="h-btn primary" href="#set/${esc(s.id)}">Open</a>
           <button class="h-btn ghost" data-act="copy" data-id="${esc(s.id)}">Copy</button>
           <button class="h-btn ghost danger" data-act="delete" data-id="${esc(s.id)}" data-title="${esc(s.title)}">Delete</button>`}
    </div>
  </article>`;
}

async function newSet(title, questions) {
  const { set } = await api("POST", "/api/hub/sets", { title, questions: questions.map(outQ) });
  location.hash = `#set/${set.id}`;
}

async function copySet(id) {
  try {
    const { set } = await api("GET", `/api/hub/sets/${id}`);
    const title = set.builtIn ? `${set.title.replace(/\s*\(built-in\)\s*$/i, "")} (my copy)` : `Copy of ${set.title}`;
    await newSet(title.slice(0, 80), set.questions);
  } catch (e) { toast(e.message); }
}

function askDelete(id, title) {
  modal(`<h2 id="modalTitle">Delete "${esc(title)}"?</h2>
    <p>The set and its questions are deleted for good. Battles already running keep their questions.</p>
    <div class="h-modal-acts"><button class="h-btn ghost" data-close>Keep it</button><button class="h-btn danger" id="delYes">Delete set</button></div>`);
  $("delYes").addEventListener("click", async () => {
    $("delYes").disabled = true;
    try { await api("DELETE", `/api/hub/sets/${id}`); closeModal(); toast(`Deleted "${title}".`); showSets(); }
    catch (e) { closeModal(); toast(e.message); }
  });
}

// ---------------------------------------------------------------- the editor
const blankQ = () => ({ id: newId(), q: "", choices: ["", "", "", ""], correct: [], explain: "", image: null, showExplain: false });
function padQ(q) {
  const choices = (q.choices || []).slice(0, MAX_CHOICES).map((c) => String(c ?? ""));
  while (choices.length < MAX_CHOICES) choices.push("");
  return {
    id: /^[a-z0-9]{4,24}$/.test(q.id || "") ? q.id : newId(), q: q.q || "", choices,
    correct: (q.correct || []).filter((i) => i >= 0 && i < MAX_CHOICES),
    explain: q.explain || "", image: q.image || null, showExplain: !!q.explain,
  };
}
const outQ = (q) => ({ id: q.id, q: q.q, choices: q.choices, correct: q.correct, explain: q.explain, image: q.image });

async function openSet(id) {
  view = "loading";
  main.innerHTML = `<p class="h-loading">Opening the set…</p>`;
  try {
    const { set } = await api("GET", `/api/hub/sets/${id}`);
    if (set.builtIn) { location.hash = ""; return; }
    cur = { ...set, questions: set.questions.map(padQ) };
  } catch (e) { toast(e.message); location.hash = ""; return; }
  view = "editor"; editSeq = savedSeq = 0; saveError = ""; focusQ = -1;
  renderEditor();
}

function renderEditor() {
  main.innerHTML = `
    <div class="h-ed-head">
      <a class="h-back" href="#">← All sets</a>
      <input class="h-title" id="setTitle" maxlength="80" value="${esc(cur.title)}" aria-label="Name of this set" placeholder="Name this set" />
      <span class="h-save" id="saveState"></span>
    </div>
    <div class="h-ed-bar">
      <button class="h-btn primary" data-act="addq">Add a question</button>
      <button class="h-btn" data-act="paste">Paste or type questions</button>
      <button class="h-btn" data-act="import">Add from a spreadsheet</button>
      <span class="h-spacer"></span>
      <button class="h-count" id="countChip" data-act="firstbad"></button>
      <button class="h-btn ghost" data-act="csv">Download as .csv</button>
    </div>
    <p class="h-hint">To play these questions, pick this set as the topic in the tournament's Settings or in a game room.
      To add a picture, press <b>Add a picture</b>, drop one on a question, or copy it and paste it (Ctrl+V or ⌘V) while you are in that question.</p>
    <div class="h-qlist" id="qlist">${cur.questions.map(qCard).join("")}</div>
    <button class="h-addq" data-act="addq">+ Add a question</button>`;
  main.querySelectorAll("textarea").forEach(autoGrow);
  updateCounts(); updateSaveState();
}

function qCard(q, i) {
  const probs = questionProblems(q);
  const n = cur.questions.length;
  return `<article class="h-q ${probs.length ? "bad" : ""}" data-qi="${i}" id="q-${esc(q.id)}">
    <div class="h-q-side">
      <span class="h-q-num" aria-label="Question ${i + 1}">${i + 1}</span>
      <button class="h-icon" data-act="up" ${i === 0 ? "disabled" : ""} aria-label="Move question ${i + 1} up" title="Move up">↑</button>
      <button class="h-icon" data-act="down" ${i === n - 1 ? "disabled" : ""} aria-label="Move question ${i + 1} down" title="Move down">↓</button>
      <button class="h-icon danger" data-act="delq" aria-label="Delete question ${i + 1}" title="Delete question">✕</button>
    </div>
    <div class="h-q-pic">${picBox(q)}</div>
    <div class="h-q-body">
      <textarea class="h-q-text" data-f="q" rows="2" maxlength="600" placeholder="Type the question" aria-label="Question ${i + 1}">${esc(q.q)}</textarea>
      <div class="h-answers">${q.choices.map((c, j) => {
        const right = q.correct.includes(j);
        return `<div class="h-ans ${right ? "right" : ""}">
          <button class="h-tick" data-act="tick" data-j="${j}" aria-pressed="${right}" aria-label="Answer ${"ABCD"[j]} is right" title="${right ? "This is a right answer" : "Mark as the right answer"}">${right ? "✓" : ""}</button>
          <span class="h-ans-key">${"ABCD"[j]}</span>
          <input class="h-ans-text" data-f="c${j}" maxlength="200" value="${esc(c)}" placeholder="${j < 2 ? "Answer" : "Answer (optional)"}" aria-label="Answer ${"ABCD"[j]}" />
        </div>`;
      }).join("")}</div>
      ${q.showExplain
        ? `<textarea class="h-q-explain" data-f="explain" rows="2" maxlength="600" placeholder="Why is this the right answer? Students see this in their review after the battle." aria-label="Explanation">${esc(q.explain)}</textarea>`
        : `<button class="h-linkbtn" data-act="explain">+ Add an explanation (students see it after the battle)</button>`}
      <p class="h-q-probs">${probs.map(esc).join(" · ")}</p>
    </div>
  </article>`;
}

function picBox(q) {
  if (q.uploading) return `<div class="h-pic busy"><span>Adding picture…</span></div>`;
  if (q.image) return `<div class="h-pic has">
      <img src="/qimg/${esc(q.image)}" alt="Picture for this question" />
      <div class="h-pic-acts"><button class="h-btn small" data-act="pic">Change</button><button class="h-btn small ghost" data-act="nopic">Remove</button></div>
    </div>`;
  return `<button class="h-pic empty" data-act="pic"><span class="h-pic-plus">+</span><span>Add a picture</span><span class="h-pic-hint">or drop or paste one here</span></button>`;
}

function autoGrow(t) { t.style.height = "auto"; t.style.height = t.scrollHeight + 2 + "px"; }

function rerenderCard(i) {
  const el = main.querySelector(`.h-q[data-qi="${i}"]`);
  if (!el) return;
  el.outerHTML = qCard(cur.questions[i], i);
  main.querySelectorAll(`.h-q[data-qi="${i}"] textarea`).forEach(autoGrow);
}
function rerenderList() {
  $("qlist").innerHTML = cur.questions.map(qCard).join("");
  $("qlist").querySelectorAll("textarea").forEach(autoGrow);
  updateCounts();
}
// problems line and red outline, without touching the inputs being typed in
function refreshProblems(el, q) {
  const probs = questionProblems(q);
  el.classList.toggle("bad", probs.length > 0);
  el.querySelector(".h-q-probs").textContent = probs.join(" · ");
}
function updateCounts() {
  const chip = $("countChip"); if (!chip) return;
  const n = cur.questions.length, bad = cur.questions.filter((q) => questionProblems(q).length).length;
  chip.innerHTML = `${plural(n, "question")}${bad ? ` · <span class="bad">${bad} need${bad === 1 ? "s" : ""} fixing</span>` : ` · <span class="good">all ready</span>`}`;
  chip.disabled = !bad;
  chip.title = bad ? "Show the first question that needs fixing" : "";
}

function updateSaveState() {
  const el = $("saveState"); if (!el) return;
  if (saveError) { el.className = "h-save bad"; el.innerHTML = `${esc(saveError)} <button class="h-linkbtn" data-act="retry">Try again</button>`; return; }
  if (saving) { el.className = "h-save"; el.textContent = "Saving…"; return; }
  if (editSeq !== savedSeq) { el.className = "h-save"; el.textContent = "Not saved yet"; return; }
  el.className = "h-save good"; el.textContent = status.storage.kind === "github" ? "All changes saved to GitHub" : "All changes saved";
}

function changed() {
  editSeq++; saveError = "";
  updateSaveState();
  clearTimeout(saveTimer); saveTimer = setTimeout(save, 1500);
}
async function save() {
  if (!cur || saving || editSeq === savedSeq) return;
  saving = true; const seq = editSeq; updateSaveState();
  try {
    const { set } = await api("PUT", `/api/hub/sets/${cur.id}`, { title: cur.title, questions: cur.questions.map(outQ), version: cur.updatedAt });
    cur.updatedAt = set.updatedAt; savedSeq = seq;
  } catch (e) {
    saveError = e.status === 409 ? "This set was changed in another window. Reload the page to see the latest." : `Not saved: ${e.message}`;
  }
  saving = false; updateSaveState();
  if (editSeq !== savedSeq && !saveError) { clearTimeout(saveTimer); saveTimer = setTimeout(save, 500); }
}
async function flushSave() {
  clearTimeout(saveTimer);
  while (saving) await sleep(80);
  if (editSeq !== savedSeq && !saveError) await save();
}

function addQuestions(list, { scroll = true } = {}) {
  const room = MAX_QUESTIONS - cur.questions.length;
  if (room <= 0) { toast(`A set can hold ${MAX_QUESTIONS} questions. Start a new set for more.`); return 0; }
  const first = cur.questions.length;
  cur.questions.push(...list.slice(0, room).map(padQ));
  rerenderList(); changed();
  if (list.length > room) toast(`Only ${room} more fitted. A set can hold ${MAX_QUESTIONS} questions.`);
  if (scroll) main.querySelector(`.h-q[data-qi="${first}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  return Math.min(list.length, room);
}

// ---------------------------------------------------------------- typing in the editor
main.addEventListener("input", (e) => {
  if (view !== "editor") return;
  const t = e.target;
  if (t.id === "setTitle") { cur.title = t.value; changed(); return; }
  const el = t.closest(".h-q"); if (!el) return;
  const q = cur.questions[+el.dataset.qi], f = t.dataset.f;
  if (f === "q") q.q = t.value;
  else if (f === "explain") q.explain = t.value;
  else if (/^c\d$/.test(f || "")) q.choices[+f.slice(1)] = t.value;
  else return;
  if (t.tagName === "TEXTAREA") autoGrow(t);
  refreshProblems(el, q); updateCounts(); changed();
});
main.addEventListener("focusin", (e) => {
  const el = e.target.closest?.(".h-q");
  if (el) focusQ = +el.dataset.qi;
});
// Enter in an answer box moves to the next answer, then to the next question
main.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || !e.target.classList?.contains("h-ans-text")) return;
  e.preventDefault();
  const el = e.target.closest(".h-q"), inputs = [...el.querySelectorAll(".h-ans-text")];
  const k = inputs.indexOf(e.target);
  if (k < inputs.length - 1) inputs[k + 1].focus();
  else {
    const next = main.querySelector(`.h-q[data-qi="${+el.dataset.qi + 1}"] .h-q-text`);
    if (next) next.focus(); else { addQuestions([blankQ()], { scroll: true }); main.querySelector(".h-q:last-child .h-q-text")?.focus(); }
  }
});

// ---------------------------------------------------------------- buttons
main.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
  const act = b.dataset.act;
  const el = b.closest(".h-q"), i = el ? +el.dataset.qi : -1, q = el ? cur.questions[i] : null;
  switch (act) {
    case "reload": return showSets();
    case "new":
      try { await newSet("New set", [blankQ()]); } catch (err) { toast(err.message); }
      return;
    case "import": $("sheetFile").value = ""; $("sheetFile").click(); return;
    case "copy": return copySet(b.dataset.id);
    case "delete": return askDelete(b.dataset.id, b.dataset.title);
    case "addq": {
      addQuestions([blankQ()]);
      main.querySelector(".h-q:last-child .h-q-text")?.focus({ preventScroll: true });
      return;
    }
    case "paste": return openPaste();
    case "csv": return downloadCsv();
    case "retry": saveError = ""; return save();
    case "firstbad": {
      const k = cur.questions.findIndex((x) => questionProblems(x).length);
      const target = main.querySelector(`.h-q[data-qi="${k}"]`);
      if (target) { target.scrollIntoView({ behavior: "smooth", block: "center" }); target.classList.add("flash"); setTimeout(() => target.classList.remove("flash"), 1200); }
      return;
    }
    case "tick": {
      const j = +b.dataset.j;
      q.correct = q.correct.includes(j) ? q.correct.filter((x) => x !== j) : [...q.correct, j].sort();
      rerenderCard(i); updateCounts(); changed();
      main.querySelector(`.h-q[data-qi="${i}"] .h-tick[data-j="${j}"]`)?.focus();
      return;
    }
    case "explain":
      q.showExplain = true; rerenderCard(i);
      main.querySelector(`.h-q[data-qi="${i}"] .h-q-explain`)?.focus();
      return;
    case "up": case "down": {
      const to = act === "up" ? i - 1 : i + 1;
      [cur.questions[i], cur.questions[to]] = [cur.questions[to], cur.questions[i]];
      rerenderList(); changed();
      main.querySelector(`.h-q[data-qi="${to}"] [data-act="${act}"]:not([disabled])`)?.focus();
      return;
    }
    case "delq": {
      const [gone] = cur.questions.splice(i, 1);
      undo = { q: gone, at: i };
      rerenderList(); changed();
      toast(`Question ${i + 1} deleted.`, { label: "Undo", run: () => {
        if (!undo || view !== "editor") return;
        cur.questions.splice(Math.min(undo.at, cur.questions.length), 0, undo.q); undo = null;
        rerenderList(); changed();
      } });
      return;
    }
    case "pic": focusQ = i; $("picFile").value = ""; $("picFile").click(); return;
    case "nopic": q.image = null; rerenderCard(i); updateCounts(); changed(); return;
  }
});

// ---------------------------------------------------------------- pictures
function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob), img = new Image();
    img.onload = () => resolve({ img, done: () => URL.revokeObjectURL(url) });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That picture could not be opened. Try a PNG or JPG.")); };
    img.src = url;
  });
}
const toBlob = (canvas, type, quality) => new Promise((r) => canvas.toBlob(r, type, quality));

// Small enough for 30 iPads to load at once, sharp enough for labelled diagrams.
async function preparePicture(blob) {
  const { img, done } = await loadImage(blob);
  try {
    const w = img.naturalWidth, h = img.naturalHeight, big = Math.max(w, h);
    if (/^image\/(png|jpeg|gif|webp)$/.test(blob.type) && blob.size <= 400 * 1024 && big <= 1600) return blob;
    const scale = Math.min(1, 1200 / big);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
    const g = c.getContext("2d");
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    const png = await toBlob(c, "image/png");
    if (png && png.size <= 450 * 1024) return png;           // diagrams stay crisp as PNG
    const jpg = await toBlob(c, "image/jpeg", 0.86);
    if (!jpg) throw new Error("That picture could not be prepared.");
    return jpg;
  } finally { done(); }
}
async function uploadPicture(blob) {
  const ready = await preparePicture(blob);
  const { name } = await api("POST", "/api/hub/images", ready, { raw: true, type: ready.type || "application/octet-stream" });
  return name;
}
async function setPicture(i, blob) {
  const q = cur.questions[i]; if (!q) return;
  q.uploading = true; rerenderCard(i);
  try { q.image = await uploadPicture(blob); }
  catch (e) { toast(e.message); }
  q.uploading = false;
  if (cur?.questions[i] === q) { rerenderCard(i); updateCounts(); changed(); }
}
// a picture with no question chosen: use the question being edited, or start a new one
function pictureTarget() {
  if (focusQ >= 0 && focusQ < cur.questions.length) return focusQ;
  addQuestions([blankQ()]);
  return cur.questions.length - 1;
}

$("picFile").addEventListener("change", () => {
  const f = $("picFile").files[0];
  if (f && view === "editor") setPicture(focusQ >= 0 ? focusQ : pictureTarget(), f);
});

document.addEventListener("paste", (e) => {
  if (view !== "editor" || !$("modalBack").hidden) return;
  const items = [...(e.clipboardData?.items || [])];
  const item = items.find((it) => it.kind === "file" && it.type.startsWith("image/"));
  if (!item) return;
  // text copied from Word or a web page can carry a picture of itself: typing fields get the text
  if (items.some((it) => it.type === "text/plain") && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  e.preventDefault();
  setPicture(pictureTarget(), item.getAsFile());
});

// ---------------------------------------------------------------- dropping files
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
window.addEventListener("dragenter", (e) => { if (!hasFiles(e) || !["sets", "editor"].includes(view)) return; dragDepth++; $("drop").hidden = false; });
window.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; $("drop").hidden = true; } });
window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener("drop", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault(); dragDepth = 0; $("drop").hidden = true;
  const f = e.dataTransfer.files[0]; if (!f) return;
  if (f.type.startsWith("image/")) {
    if (view !== "editor") return toast("Open a set first, then drop the picture on a question.");
    const el = e.target.closest?.(".h-q");
    return setPicture(el ? +el.dataset.qi : pictureTarget(), f);
  }
  if (view === "sets" || view === "editor") importFile(f);
});

// ---------------------------------------------------------------- pasting / typing many questions
function openPaste() {
  modal(`<h2 id="modalTitle">Paste or type questions</h2>
    <p class="h-sub">Copy rows from Excel, Google Sheets or a Blooket spreadsheet and paste them here. Or type questions like the example: one question, its answers underneath, and <b>*</b> in front of the right answer. Leave an empty line between questions.</p>
    <div class="h-paste">
      <textarea id="pasteBox" rows="12" placeholder="Paste or type here" aria-label="Questions to add"></textarea>
      <pre class="h-example" aria-label="Example">1. Which part controls the activities of the cell?
a) Cell wall
*b) Nucleus
c) Vacuole
d) Cell membrane

2. Which part is found only in plant cells?
Cell membrane
Cytoplasm
*Chloroplast
Nucleus</pre>
    </div>
    <p class="h-preview" id="pastePreview">Nothing to add yet.</p>
    <div class="h-modal-acts"><button class="h-btn ghost" data-close>Cancel</button><button class="h-btn primary" id="pasteAdd" disabled>Add questions</button></div>`);
  let found = { questions: [], skipped: [] };
  const box = $("pasteBox");
  box.focus();
  box.addEventListener("input", () => {
    found = parsePasted(box.value);
    const n = found.questions.length, need = found.questions.filter((q) => !q.correct.length).length;
    $("pastePreview").innerHTML = !n && !found.skipped.length ? "Nothing to add yet."
      : `Found <b>${plural(n, "question")}</b>.${need ? ` ${need} still need${need === 1 ? "s" : ""} the right answer marked (you can tick it after adding).` : ""}`
        + skippedList(found.skipped);
    $("pasteAdd").disabled = !n;
    $("pasteAdd").textContent = n ? `Add ${plural(n, "question")}` : "Add questions";
  });
  $("pasteAdd").addEventListener("click", () => {
    const added = addQuestions(found.questions.map((q) => ({ ...q, id: newId() })), { scroll: true });
    closeModal(); if (added) toast(`Added ${plural(added, "question")}.`);
  });
}

const skippedList = (skipped) => !skipped.length ? "" : `<details class="h-skipped"><summary>${plural(skipped.length, "row")} left out</summary><ul>${
  skipped.slice(0, 30).map((s) => `<li>${s.row ? `Row ${s.row}: ` : ""}${esc(s.reason)}</li>`).join("")}</ul></details>`;

// ---------------------------------------------------------------- spreadsheets
$("sheetFile").addEventListener("change", () => { const f = $("sheetFile").files[0]; if (f) importFile(f); });

async function importFile(file) {
  if (!/\.(xlsx|csv|tsv|txt)$/i.test(file.name) && !/sheet|csv|text/.test(file.type)) {
    const hint = /\.xls$/i.test(file.name) ? " Save it as .xlsx first (File → Save As → Excel Workbook)." :
      /\.numbers$/i.test(file.name) ? " In Numbers choose File → Export To → Excel." : " Use a .xlsx or .csv file.";
    return toast(`"${file.name}" isn't a spreadsheet the hub can read.${hint}`);
  }
  const intoNew = view !== "editor";
  modal(`<h2 id="modalTitle">Reading ${esc(file.name)}…</h2><p class="h-sub">This takes a moment for big files.</p>`, { busy: true });
  let res;
  try { res = await api("POST", `/api/hub/import?name=${encodeURIComponent(file.name)}`, await file.arrayBuffer(), { raw: true }); }
  catch (e) { return modal(`<h2 id="modalTitle">That file could not be read</h2><p>${esc(e.message)}</p><div class="h-modal-acts"><button class="h-btn" data-close>OK</button></div>`); }
  const n = res.questions.length;
  if (!n) {
    return modal(`<h2 id="modalTitle">No questions found in ${esc(file.name)}</h2>
      <p>The hub looks for a heading row with <b>Question</b> (or <b>Question Text</b>), answer columns such as <b>Answer 1</b> to <b>Answer 4</b>, and a <b>Correct Answer</b> column. The Blooket template already has these.</p>
      ${skippedList(res.skipped)}
      <div class="h-modal-acts"><button class="h-btn" data-close>OK</button></div>`);
  }
  const need = res.questions.filter((q) => !q.correct.length).length;
  const pics = res.questions.filter((q) => q.picture).length;
  const title = file.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim().slice(0, 80) || "Imported set";
  modal(`<h2 id="modalTitle">Found ${plural(n, "question")}${res.sheet ? ` on "${esc(res.sheet)}"` : ""}</h2>
    <ul class="h-found">
      ${pics ? `<li>${plural(pics, "picture")} on the questions' rows will be added too.</li>` : ""}
      ${need ? `<li>${need} question${need === 1 ? " has" : "s have"} no right answer marked. You can tick ${need === 1 ? "it" : "them"} after importing.</li>` : ""}
      <li>Time limits in the file are not used: the answer time is set in the tournament or room.</li>
    </ul>
    ${skippedList(res.skipped)}
    <ol class="h-peek">${res.questions.slice(0, 3).map((q) => `<li>${esc(q.q || "(picture only)")}<span>${q.choices.map((c, j) => `${q.correct.includes(j) ? "<b>✓ " + esc(c) + "</b>" : esc(c)}`).join(" · ")}</span></li>`).join("")}</ol>
    <div class="h-modal-acts"><button class="h-btn ghost" data-close>Cancel</button>
      <button class="h-btn primary" id="importYes">${intoNew ? `Make the set "${esc(title)}"` : `Add ${plural(n, "question")} to this set`}</button></div>`);
  $("importYes").addEventListener("click", async () => {
    const btn = $("importYes"); btn.disabled = true;
    const qs = res.questions.map((q) => ({ ...q, id: newId(), image: null }));
    // pictures from the spreadsheet: prepare and upload each one
    let k = 0, lost = 0;
    for (let x = 0; x < res.questions.length; x++) {
      const pic = res.questions[x].picture; if (!pic) continue;
      btn.textContent = `Adding pictures ${++k} of ${pics}…`;
      try {
        const bin = Uint8Array.from(atob(pic.data), (ch) => ch.charCodeAt(0));
        qs[x].image = await uploadPicture(new Blob([bin], { type: pic.type }));
      } catch { lost++; }
    }
    try {
      if (intoNew) { closeModal(); await newSet(title, qs); }
      else { const added = addQuestions(qs, { scroll: true }); closeModal(); if (added) toast(`Added ${plural(added, "question")} from ${file.name}.`); }
      if (lost) toast(`${plural(lost, "picture")} could not be added.`);
    } catch (e) { btn.disabled = false; btn.textContent = "Try again"; toast(e.message); }
  });
}

// ---------------------------------------------------------------- download
function downloadCsv() {
  const cell = (v) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = [["Question #", "Question Text", "Answer 1", "Answer 2", "Answer 3", "Answer 4", "Time Limit (sec)", "Correct Answer(s)", "Explanation"]];
  cur.questions.forEach((q, i) => rows.push([i + 1, q.q, ...q.choices, 20, q.correct.map((j) => j + 1).join(","), q.explain]));
  const blob = new Blob(["﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${cur.title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "questions"}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------- toast and dialog
let toastTimer = null;
function toast(msg, action) {
  const t = $("toast");
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button class="h-linkbtn" id="toastAct">${esc(action.label)}</button>` : ""}`;
  t.hidden = false;
  if (action) $("toastAct").addEventListener("click", () => { action.run(); t.hidden = true; });
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, action ? 7000 : 4000);
}

let modalBusy = false, lastFocus = null;
function modal(html, { busy = false } = {}) {
  if ($("modalBack").hidden) lastFocus = document.activeElement;
  modalBusy = busy;
  $("modal").innerHTML = html;
  $("modalBack").hidden = false;
  $("modal").querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeModal));
  const m = $("modal");
  (m.querySelector("textarea, input") || m.querySelector(".h-btn.primary") || m.querySelector(".h-btn") || m).focus?.();
}
function closeModal() {
  $("modalBack").hidden = true; $("modal").innerHTML = ""; modalBusy = false;
  lastFocus?.focus?.({ preventScroll: true });
}
$("modalBack").addEventListener("click", (e) => { if (e.target === $("modalBack") && !modalBusy) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("modalBack").hidden && !modalBusy) closeModal(); });

boot();
