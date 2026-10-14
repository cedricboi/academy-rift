// ===== Academy Rift — the teacher's learning report (/report) =====
// What the class got wrong in this tournament: every question answered wrong with how often, the weakest learning
// objectives, and the students' written answers from their Rift Reports. It offers to build an MCQ sheet of different
// questions on the same learning objectives (to print, or to save as a question set the class can play).
// It reads the tournament this browser's teacher page is running (code and host token in localStorage).
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const main = $("main");
const host = (() => { try { return JSON.parse(localStorage.getItem("riftHost")) || null; } catch { return null; } })();
let rep = null, sheet = null;

function toast(msg) { const t = document.createElement("div"); t.className = "r-toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); }
async function api(path, body) {
  const r = await fetch(path, { method: body ? "POST" : "GET", headers: { "x-host-token": host?.hostToken || "", ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Something went wrong.");
  return d;
}

async function load() {
  if (!host?.code) { main.innerHTML = `<p class="r-empty">Open this page from the tournament page on this computer (the 📖 Learning report button).</p>`; return; }
  try { rep = await api(`/api/report?code=${encodeURIComponent(host.code)}`); render(); }
  catch (e) { main.innerHTML = `<p class="r-empty">${esc(e.message)}</p>`; }
}

const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
function render() {
  const t = rep.totals;
  if (!t.answers) { main.innerHTML = `<h1 class="r-title">Tournament ${esc(rep.code)}</h1><p class="r-empty">No answers yet. The report fills in as battles finish.</p>`; return; }
  const written = groupWritten(rep.written);
  main.innerHTML = `
    <h1 class="r-title">Tournament ${esc(rep.code)}</h1>
    <p class="r-sub">${rep.round ? `After round ${rep.round}. ` : ""}Every answer counts: students' own questions, steals, and the questions they answered along with others.</p>
    <div class="r-cards">
      <div class="r-card"><b>${t.answers}</b><span>answers given</span></div>
      <div class="r-card"><b>${pct(t.answers - t.wrong, t.answers)}%</b><span>right</span></div>
      <div class="r-card"><b>${t.questions}</b><span>different questions seen</span></div>
      <div class="r-card"><b>${rep.wrong.length}</b><span>questions answered wrong at least once</span></div>
    </div>

    <div class="r-offer" id="offer">
      <h3>Build an MCQ sheet with different questions on these learning objectives?</h3>
      <p>It takes the learning objectives the class got wrong most and picks other questions from the game on each one, ones this class has not been asked. You can print it with an answer key, or save it as a question set to play.</p>
      <div class="r-offer-row">
        <label>Questions per objective <select id="perLo"><option>1</option><option selected>2</option><option>3</option></select></label>
        <label>Objectives below <select id="below"><option value="60">60% right</option><option value="80" selected>80% right</option><option value="100">100% right</option></select></label>
        <button class="r-btn primary" id="buildSheet">Yes, build the sheet</button>
      </div>
      <div id="sheetBox"></div>
    </div>

    <h2 class="r-sec">Weakest learning objectives</h2>
    <table class="r-table"><thead><tr><th>Learning objective</th><th>Chapter</th><th class="r-num">Right</th><th class="r-num">Answers</th></tr></thead><tbody>
      ${rep.objectives.map((o) => `<tr><td>${esc(o.lo)}</td><td>${o.chapter ? `Ch ${o.chapter}` : esc(o.topic)}</td>
        <td class="r-num"><span class="r-bar"><i style="width:${o.pct}%"></i></span>${o.pct}%</td><td class="r-num">${o.asked}</td></tr>`).join("")}
    </tbody></table>

    <h2 class="r-sec">Every question answered wrong (${rep.wrong.length})</h2>
    <table class="r-table"><thead><tr><th>#</th><th>Question</th><th class="r-num">Wrong</th><th class="r-num">Students</th></tr></thead><tbody>
      ${rep.wrong.map((w, i) => `<tr><td>${i + 1}</td><td>${esc(w.q)}
          <div class="r-right">✓ ${esc(w.right)}</div>
          ${w.commonWrong ? `<div class="r-wrongpick">Most common wrong answer: ${esc(w.commonWrong)}${w.commonNote ? `<span class="r-note">The misconception: ${esc(w.commonNote)}</span>` : ""}</div>` : ""}
          <div class="r-lo">${w.chapter ? `Ch ${w.chapter} · ` : ""}${esc(w.lo)}</div></td>
        <td class="r-num">${w.wrong} of ${w.asked}</td><td class="r-num">${w.students}</td></tr>`).join("")}
    </tbody></table>

    <h2 class="r-sec">Written answers (${rep.written.length})</h2>
    ${written.length ? `<div class="r-written">${written.map((g) => `<div class="r-wprompt"><h4>${esc(g.prompt)}</h4>
        <p class="r-wmodel">Right answer: ${esc(g.model)}</p>
        ${g.answers.map((a) => `<p class="r-wans"><b>${esc(a.name)}</b>${esc(a.answer)}</p>`).join("")}</div>`).join("")}</div>`
      : `<p class="r-empty">None yet. Students write these at the end of each battle.</p>`}`;
  $("buildSheet").addEventListener("click", buildSheet);
  if (sheet) showSheet();
}
function groupWritten(list) {
  const m = new Map();
  for (const w of list) { const g = m.get(w.prompt) || { prompt: w.prompt, model: w.model, answers: [] }; g.answers.push(w); m.set(w.prompt, g); }
  return [...m.values()];
}

async function buildSheet() {
  const btn = $("buildSheet"); btn.disabled = true; btn.textContent = "Building…";
  try { sheet = await api("/api/report/sheet", { code: host.code, perLo: +$("perLo").value, below: +$("below").value }); showSheet(); }
  catch (e) { toast(e.message); }
  btn.disabled = false; btn.textContent = "Build it again";
}
function showSheet() {
  const box = $("sheetBox"); if (!box) return;
  if (!sheet.items.length) { box.innerHTML = `<p class="r-missing">There are no other questions in the game on these objectives yet.${sheet.missing.length ? " Download the report for Claude to have new ones written." : ""}</p>`; return; }
  let n = 0;
  box.innerHTML = `<div class="r-sheet">${sheet.items.map((it) => `<h4>${esc(it.lo)} <span class="src">(${it.pct}% right)</span></h4><ol start="${n + 1}">${it.questions.map((q) => { n++;
      return `<li>${esc(q.q)}<div class="opts">${q.choices.map((c, i) => `<span>${"ABCD"[i]}. ${esc(c)}</span>`).join("")}</div></li>`; }).join("")}</ol>`).join("")}</div>
    ${sheet.missing.length ? `<p class="r-missing">${sheet.missing.length} objective${sheet.missing.length === 1 ? " has" : "s have"} no other questions in the game: ${sheet.missing.map((m) => esc(m.lo)).join("; ")}. The download for Claude asks for new ones.</p>` : ""}
    <div class="r-sheet-acts">
      <button class="r-btn primary" id="printSheet">Print the sheet with an answer key</button>
      <button class="r-btn" id="saveSheet">Save as a question set to play</button>
    </div>`;
  $("printSheet").addEventListener("click", printSheet);
  $("saveSheet").addEventListener("click", saveSheet);
}
function printSheet() {
  let n = 0; const key = [];
  $("sheetPrint").innerHTML = `<h1>Review sheet</h1><p class="sp-sub">Tournament ${esc(rep.code)} · ${new Date().toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" })} · Name: ______________________ Class: ______</p>
    ${sheet.items.map((it) => `<h2>${esc(it.lo)}</h2><ol start="${n + 1}">${it.questions.map((q) => { n++; key.push([n, (q.correct || []).map((i) => "ABCD"[i]).join(", ")]);
      return `<li>${esc(q.q)}<div class="opts">${q.choices.map((c, i) => `<span>${"ABCD"[i]}. ${esc(c)}</span>`).join("")}</div></li>`; }).join("")}</ol>`).join("")}
    <div class="key"><h1>Answer key</h1><table>${key.map(([k, a]) => `<tr><td>${k}</td><td>${a}</td></tr>`).join("")}</table></div>`;
  window.print();
}
async function saveSheet() {
  const btn = $("saveSheet"); btn.disabled = true;
  try { const r = await api("/api/report/sheet/save", { code: host.code, qids: sheet.items.flatMap((it) => it.questions.map((q) => q.qid)) }); toast(`Saved "${r.title}" in the question hub. Tick it as a topic to play it.`); btn.textContent = "Saved"; }
  catch (e) { toast(e.message); btn.disabled = false; }
}

// the whole report as Markdown, ready to hand to Claude for a new MCQ sheet on the same learning objectives
function downloadMd() {
  if (!rep) return;
  const L = [];
  L.push(`# Academy Rift learning report: tournament ${rep.code}`, "", `${rep.totals.answers} answers, ${pct(rep.totals.answers - rep.totals.wrong, rep.totals.answers)}% right, ${rep.totals.questions} different questions.`, "");
  L.push("## Request for Claude", "", "Please build an MCQ sheet with different questions that test the same learning objectives as the weakest ones below, in the house MCQ style (four parallel options, one correct), with an answer key.", "");
  L.push("## Weakest learning objectives", "", "| Learning objective | Chapter | Right | Answers |", "|---|---|---|---|");
  for (const o of rep.objectives) L.push(`| ${o.lo} | ${o.chapter ? "Ch " + o.chapter : o.topic} | ${o.pct}% | ${o.asked} |`);
  L.push("", "## Every question answered wrong", "", "| # | Question | Right answer | Most common wrong answer | Wrong | Learning objective |", "|---|---|---|---|---|---|");
  rep.wrong.forEach((w, i) => L.push(`| ${i + 1} | ${w.q.replace(/\|/g, "/")} | ${w.right.replace(/\|/g, "/")} | ${(w.commonWrong || "").replace(/\|/g, "/")} | ${w.wrong} of ${w.asked} | ${w.lo} |`));
  if (sheet?.missing?.length) { L.push("", "## Objectives with no other questions in the game yet", ""); sheet.missing.forEach((m) => L.push(`- ${m.lo}`)); }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([L.join("\n")], { type: "text/markdown" }));
  a.download = `Academy Rift report ${rep.code}.md`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

$("refresh").addEventListener("click", load);
$("mdBtn").addEventListener("click", downloadMd);
$("printBtn").addEventListener("click", () => { $("sheetPrint").innerHTML = ""; document.body.classList.add("print-all"); window.print(); document.body.classList.remove("print-all"); });
setInterval(() => { if (!document.hidden && !sheet) load(); }, 30000);
load();
