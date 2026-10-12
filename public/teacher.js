// ===== Academy Rift — teacher's Class Tournament page (projector) =====
import { SETTINGS, SETTING_GROUPS } from "./data/tournamentSettings.js";
import { CHAR_BY_ID } from "./data/characters.js";
import { TOPIC_BY_ID } from "./data/topics.js";
import qrcode from "/vendor/qrcode.mjs";

const socket = io();
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SAVE_KEY = "riftHost";

let state = null;          // latest tournament state from the server
let receivedAt = 0;        // when it arrived (for the battle clocks)
let selected = null;       // student picked first when pairing by hand
let joinBase = location.origin;

// ---------------------------------------------------------------- session
const loadSession = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; } };
const saveSession = (s) => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch {} };
const clearSession = () => { try { localStorage.removeItem(SAVE_KEY); } catch {} };

socket.on("connect", () => {
  const s = loadSession();
  if (s?.code && s?.hostToken) socket.emit("tResume", s);
  else showStart();
});
socket.on("tHostJoined", ({ code, hostToken }) => { saveSession({ code, hostToken }); showApp(); });
socket.on("tHostGone", () => { clearSession(); showStart("The tournament saved on this screen has ended. Start a new one."); });
socket.on("tHostMoved", () => {
  confirmBox("Running on another screen",
    "This tournament is now being run from another tab or device. Take control back on this screen?",
    "TAKE CONTROL", () => { const s = loadSession(); if (s) socket.emit("tResume", s); });
});
socket.on("tHost", (v) => { state = v; receivedAt = Date.now(); render(); });
socket.on("tError", (m) => toast(m));
socket.on("disconnect", () => toast("Connection lost. Reconnecting…"));

$("createBtn").addEventListener("click", () => socket.emit("tCreate"));

function showStart(msg = "") {
  $("app").classList.add("hidden");
  $("startScreen").classList.remove("hidden");
  $("startMsg").textContent = msg;
}
function showApp() {
  $("startScreen").classList.add("hidden");
  $("app").classList.remove("hidden");
}

// ---------------------------------------------------------------- join link
// Students cannot open "localhost", so when this page was opened that way we
// show the computer's Wi-Fi address instead.
async function resolveJoinBase() {
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  if (!local) return;
  try {
    const { lan, port } = await (await fetch("/api/addresses")).json();
    if (lan.length) joinBase = `http://${lan[0]}:${port}`;
    else showHostWarn("This page is open as \"localhost\" and this computer has no Wi-Fi address, so students cannot join it. Put the game online or connect this computer to the network.");
  } catch {}
}
function showHostWarn(text) { const w = $("hostWarn"); w.textContent = text; w.classList.remove("hidden"); }

let qrFor = "";
function renderJoin() {
  const url = `${joinBase}/?join=${state.code}`;
  $("tCode").textContent = state.code;
  $("joinUrl").textContent = joinBase.replace(/^https?:\/\//, "");
  if (qrFor === url) return;
  qrFor = url;
  try {
    const qr = qrcode(0, "M");
    qr.addData(url); qr.make();
    $("qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true, alt: "QR code to join" });
  } catch { $("qr").innerHTML = ""; }
}

// ---------------------------------------------------------------- helpers
const studentsById = () => Object.fromEntries((state?.students || []).map((s) => [s.pid, s]));
const fighterThumb = (charId) => {
  const c = CHAR_BY_ID[charId];
  if (!c) return `<span class="t-fig none" title="No fighter chosen yet">?</span>`;
  return `<span class="t-fig"><img src="${encodeURI(`assets/Character Profile Art/${c.name.split(" ")[0]}.webp`)}" alt="${esc(c.name)}" loading="lazy"></span>`;
};
const optLabel = (key) => SETTINGS.find((s) => s.key === key)?.options.find((o) => o.value === state.settings[key])?.label ?? "";
const fmtClock = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
const pctText = (x) => `${(Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, "")}%`;
const anyPlayed = () => (state?.standings || []).some((r) => r.played > 0);
const ordinal = (n) => n + (["th", "st", "nd", "rd"][(n % 100 - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");

function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 3200);
}

function confirmBox(title, text, yesLabel, onYes) {
  $("modalTitle").textContent = title;
  $("modalText").textContent = text;
  $("modalYes").querySelector("span").textContent = yesLabel;
  $("modal").classList.remove("hidden");
  $("modalYes").onclick = () => { $("modal").classList.add("hidden"); onYes(); };
  $("modalNo").onclick = () => $("modal").classList.add("hidden");
}

// ---------------------------------------------------------------- render
function render() {
  if (!state) return;
  showApp();
  renderJoin();
  const phase = { lobby: "LOBBY", round: `ROUND ${state.round} OF ${state.settings.rounds}`, between: `AFTER ROUND ${state.round}`, finished: "FINAL RESULTS" }[state.status];
  $("phaseChip").textContent = phase;
  $("phaseChip").className = "t-phase " + state.status;
  if (state.status === "lobby") renderLobby();
  else if (state.status === "round") renderRound();
  else if (state.status === "between") renderBetween();
  else renderFinal();
  renderBoard();
  renderFooter();
  if (drawerOpen) renderSettings();
}

// ----- running by itself: ready marks and the countdown banner -----
const autoReady = () => state.status === "lobby" && state.settings.autoStart === "ready";
const readyMark = (s) => (autoReady() && s.connected ? (s.ready ? `<i class="t-ready yes" title="Ready">✓</i>` : `<i class="t-ready no" title="Not ready yet">…</i>`) : "");

function autoBanner() {
  const next = state.status === "lobby" ? 1 : state.round + 1;
  if (state.notice) return `<div class="t-auto warn">⚠ ${esc(state.notice)}</div>`;
  if (state.startsIn != null) return `<div class="t-auto live">ROUND ${next} STARTS IN <b class="t-count" data-ms="${state.startsIn}">${fmtClock(state.startsIn)}</b></div>`;
  if (state.hold) return `<div class="t-auto">⏸ PAUSED. Round ${next} will not start by itself until you press Resume.</div>`;
  if (autoReady()) {
    const online = state.students.filter((s) => s.connected);
    const waiting = online.filter((s) => !s.ready).map((s) => s.name);
    const list = waiting.length ? ` Waiting for ${esc(waiting.slice(0, 8).join(", "))}${waiting.length > 8 ? ` and ${waiting.length - 8} more` : ""}.` : "";
    return `<div class="t-auto">Round 1 starts by itself when every student has tapped READY. <b>${online.length - waiting.length}</b> of ${online.length} ready.${online.length < 2 ? " At least 2 students are needed." : list}</div>`;
  }
  if (state.status === "between" && !state.settings.breakSeconds) return `<div class="t-auto">Press Start when you are ready for Round ${next}.</div>`;
  return "";
}

// ----- lobby: students, pairs, pairing tools -----
function pairCard(p, byId, canSplit) {
  const names = p.members.map((pid) => {
    const s = byId[pid];
    if (!s) return `<span class="t-member bot">${fighterThumb(null)}<span>Rift Bot</span></span>`;
    return `<span class="t-member ${s.connected ? "" : "offline"}">${fighterThumb(s.character)}<span>${esc(s.name)}</span>${readyMark(s)}${s.connected ? "" : `<em>offline</em>`}</span>`;
  }).join(`<span class="t-amp">&amp;</span>`);
  const split = canSplit ? `<button class="t-x small" data-split="${p.id}" title="Split this pair">✕</button>` : "";
  return `<div class="t-pair">${names}${split}</div>`;
}

function singlesBlock(byId) {
  const singles = state.students.filter((s) => !s.pairId);
  if (!singles.length) return "";
  const chips = singles.map((s) => {
    const wants = s.wants && byId[s.wants] ? `<span class="t-wants">picked ${esc(byId[s.wants].name)}</span>` : "";
    return `<button class="t-chip ${selected === s.pid ? "sel" : ""} ${s.connected ? "" : "offline"}" data-pid="${s.pid}">
      <span class="t-chip-name">${esc(s.name)}</span>${readyMark(s)}${wants}${s.connected ? "" : `<em>offline</em>`}
      <span class="t-chip-x" data-remove="${s.pid}" title="Remove from tournament">✕</span>
    </button>`;
  }).join("");
  return `<h3 class="t-sub">WITHOUT A PARTNER <span>${singles.length}</span></h3>
    <p class="t-hint">Tap one name, then another, to pair them. Anyone still without a partner when the round starts is paired at random. A student left on their own plays with a bot partner.</p>
    <div class="t-singles">${chips}</div>`;
}

function renderLobby() {
  const byId = studentsById();
  const n = state.students.length;
  const paired = state.students.filter((s) => s.pairId).length;
  const howTo = {
    students: "Students tap a classmate's name on their screen. Two students who pick each other become a pair.",
    random: "Press \"Draw pairs\" to put everyone into random pairs. Press it again later for students who join late.",
    teacher: "Tap one name, then another, to make a pair.",
  }[state.settings.pairing];
  const pairs = state.pairs.map((p) => pairCard(p, byId, true)).join("");
  $("stage").innerHTML = `
    <div class="t-lobby">
      <div class="t-counts"><b>${n}</b> student${n === 1 ? "" : "s"} joined <span>·</span> <b>${state.pairs.length}</b> pair${state.pairs.length === 1 ? "" : "s"} <span>·</span> <b>${n - paired}</b> without a partner</div>
      ${autoBanner()}
      <p class="t-howto">${howTo}</p>
      ${n === 0 ? `<div class="t-empty">Waiting for students to join. They open the link above, or scan the QR code, then type the code.</div>` : ""}
      ${state.pairs.length ? `<h3 class="t-sub">PAIRS <span>${state.pairs.length}</span></h3><div class="t-pairs">${pairs}</div>` : ""}
      ${singlesBlock(byId)}
      <div class="t-tools">
        ${n - paired >= 2 ? `<button class="shard-btn small" id="drawRest"><span>PAIR THE REST AT RANDOM</span></button>` : ""}
        ${state.pairs.length && state.settings.pairing === "random" ? `<button class="shard-btn small ghost" id="redraw"><span>REDRAW ALL PAIRS</span></button>` : ""}
      </div>
    </div>`;
  wirePairing();
}

function wirePairing() {
  document.querySelectorAll("[data-split]").forEach((b) => b.addEventListener("click", () => socket.emit("tSplit", { pairId: b.dataset.split })));
  document.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const s = studentsById()[b.dataset.remove];
    confirmBox("Remove student", `Remove ${s?.name || "this student"} from the tournament?`, "REMOVE", () => socket.emit("tRemove", { pid: b.dataset.remove }));
  }));
  document.querySelectorAll(".t-chip[data-pid]").forEach((b) => b.addEventListener("click", () => {
    const pid = b.dataset.pid;
    if (!selected || selected === pid) { selected = selected === pid ? null : pid; return render(); }
    socket.emit("tPair", { a: selected, b: pid });
    selected = null;
  }));
  $("drawRest")?.addEventListener("click", () => socket.emit("tDraw", {}));
  $("redraw")?.addEventListener("click", () => confirmBox("Redraw pairs", "Split every pair and draw new random pairs?", "REDRAW", () => socket.emit("tDraw", { redraw: true })));
  if (selected && !state.students.some((s) => s.pid === selected && !s.pairId)) selected = null;
}

// ----- a round in progress: one card per battle -----
function matchCard(m) {
  const done = m.status === "done";
  const r = m.result;
  const side = (s, key) => {
    const pct = done ? r.hpPct[key] : (s.maxHp ? (s.hp / s.maxHp) * 100 : 0);
    const won = done && r.winner === key;
    return `<div class="t-mside ${key} ${won ? "won" : ""} ${done && !won && r.winner !== "draw" ? "lost" : ""}">
      <div class="t-mrow"><span class="t-pname">${won ? "🏆 " : ""}${esc(s.name)}</span><b class="t-pct">${pctText(pct)}</b></div>
      <div class="t-hp"><i style="width:${pct}%"></i></div>
    </div>`;
  };
  let foot;
  if (!done) foot = (m.msLeft != null ? `<span class="t-clock" data-ms="${m.msLeft}">⏱ ${fmtClock(m.msLeft)}</span>` : `<span class="t-clock">⚔ in battle</span>`) + `<span class="t-watchme">👁 Watch</span>`;
  else if (r.winner === "draw") foot = `<span class="t-result">Draw on time</span>`;
  else foot = `<span class="t-result">${esc((r.winner === "a" ? m.a : m.b).name)} won${r.reason === "time" ? " on time" : " by knock-out"}</span>`;
  return `<div class="t-match ${done ? "done" : "live"} ${m.b.pairId ? "" : "vsbots"}" ${done ? "" : `data-watchm="${m.id}" title="Watch this battle"`}>
    ${side(m.a, "a")}${side(m.b, "b")}
    <div class="t-mfoot">${foot}</div>
  </div>`;
}

function byeCards(round) {
  const byPair = Object.fromEntries(state.standings.map((r) => [r.pairId, r.name]));
  return state.byes.filter((y) => y.round === round).map((y) => `
    <div class="t-match bye"><div class="t-mside a"><span class="t-pname">${esc(byPair[y.pairId] || "")}</span></div>
      <div class="t-mfoot"><span class="t-result">${y.kind === "freewin" ? "Free win this round (+3 points)" : "Sits out this round"}</span></div></div>`).join("");
}

function renderRound() {
  const ms = state.matches.filter((m) => m.round === state.round);
  const done = ms.filter((m) => m.status === "done").length;
  $("stage").innerHTML = `
    <div class="t-round-head"><span class="t-round-big">ROUND ${state.round}</span>
      <span class="t-round-sub">${done} of ${ms.length} battle${ms.length === 1 ? "" : "s"} finished${done < ms.length ? " · tap a battle to watch it" : ""}</span></div>
    <div class="t-matches">${ms.map(matchCard).join("")}${byeCards(state.round)}</div>
    ${lateJoinersNote()}`;
}

function lateJoinersNote() {
  const singles = state.students.filter((s) => !s.pairId);
  if (!singles.length) return "";
  return `<div class="t-late">${singlesBlock(studentsById())}</div>`;
}

// ----- between rounds: this round's results -----
function renderBetween() {
  const ms = state.matches.filter((m) => m.round === state.round);
  $("stage").innerHTML = `
    <div class="t-round-head"><span class="t-round-big">ROUND ${state.round} RESULTS</span>
      <span class="t-round-sub">Next: Round ${state.round + 1} of ${state.settings.rounds}</span></div>
    ${autoBanner()}
    <div class="t-matches">${ms.map(matchCard).join("")}${byeCards(state.round)}</div>
    ${lateJoinersNote()}`;
  if (state.students.some((s) => !s.pairId)) wirePairing();
}

// ----- final podium -----
function renderFinal() {
  const top = state.standings.slice(0, 3);
  const place = (r, cls) => r ? `<div class="t-podium-step ${cls}">
      <span class="t-podium-rank">${ordinal(r.rank)}</span>
      <span class="t-podium-name">${esc(r.name)}</span>
      <span class="t-podium-pts">${r.points} points</span>
    </div>` : `<div class="t-podium-step ${cls} empty"></div>`;
  $("stage").innerHTML = `
    <div class="t-final">
      <h2 class="t-final-head">🏆 CHAMPIONS 🏆</h2>
      <div class="t-podium">${place(top[1], "second")}${place(top[0], "first")}${place(top[2], "third")}</div>
      <p class="t-hint center">${state.round} round${state.round === 1 ? "" : "s"} played. Points: 3 for a win, 1 for a draw. Level points are split by correct answers, then HP left.</p>
    </div>`;
}

// ----- leaderboard (always on the side) -----
function renderBoard() {
  const rows = state.standings;
  $("boardHead").textContent = state.status === "finished" ? "FINAL STANDINGS" : "LEADERBOARD";
  if (!rows.length) { $("board").innerHTML = `<p class="t-hint">Pairs appear here once students are paired.</p>`; return; }
  const live = state.status === "round";
  $("board").innerHTML = `<table class="t-table">
    <thead><tr><th>#</th><th class="l">Pair</th><th title="Points">Pts</th><th title="Wins - Draws - Losses">W-D-L</th><th title="Correct answers">✓</th></tr></thead>
    <tbody>${rows.map((r) => `<tr class="${r.rank <= 3 && anyPlayed() ? "top" + r.rank : ""}">
      <td>${anyPlayed() ? r.rank : "–"}</td>
      <td class="l">${esc(r.name)}${live && state.matches.some((m) => m.round === state.round && m.status === "live" && (m.a.pairId === r.pairId || m.b.pairId === r.pairId)) ? ` <span class="t-dot" title="In battle"></span>` : ""}</td>
      <td class="pts">${r.points}</td><td>${r.wins}-${r.draws}-${r.losses}</td><td>${r.correct}</td>
    </tr>`).join("")}</tbody></table>`;
}

// ----- footer: settings summary + the main buttons -----
function renderFooter() {
  const st = state.settings;
  const topic = state.topicName ? { icon: String(st.topicId).includes("set:") ? "📝" : (TOPIC_BY_ID[st.topicId]?.icon || "📚"), name: state.topicName } : TOPIC_BY_ID[st.topicId];
  $("summary").innerHTML = `
    <span>${st.rounds} round${st.rounds === 1 ? "" : "s"}</span>
    <span>${st.timeLimitMin ? `${st.timeLimitMin}-minute battles` : "No time limit"}</span>
    <span>${topic ? `${topic.icon} ${esc(topic.name)}` : ""}</span>
    <span>${esc(optLabel("pairing"))}</span>
    <button class="t-link" id="summaryEdit">Change settings</button>`;
  $("summaryEdit").onclick = openDrawer;

  const a = $("footActions");
  const nPeople = state.students.length;
  const autoOn = (state.status === "lobby" && st.autoStart === "ready") || (state.status === "between" && st.breakSeconds > 0);
  const holdBtn = !autoOn ? "" : state.hold || state.notice
    ? `<button class="shard-btn small" id="resumeAuto"><span>▶ RESUME</span></button>`
    : `<button class="shard-btn ghost small" id="holdAuto"><span>⏸ HOLD</span></button>`;
  if (state.status === "lobby") {
    a.innerHTML = `${holdBtn}<button class="shard-btn ${autoOn ? "" : "primary big"}" id="startRound" ${nPeople ? "" : "disabled"}><span>⚔ START ROUND 1${autoOn ? " NOW" : ""}</span></button>`;
  } else if (state.status === "round") {
    a.innerHTML = `<button class="shard-btn ghost" id="endRound"><span>END ROUND NOW</span></button>`;
  } else if (state.status === "between") {
    a.innerHTML = `<button class="shard-btn ghost small" id="finishNow"><span>FINISH NOW</span></button>${holdBtn}
      <button class="shard-btn ${autoOn ? "" : "primary big"}" id="startRound"><span>⚔ START ROUND ${state.round + 1}${autoOn ? " NOW" : ""}</span></button>`;
  } else {
    a.innerHTML = `<button class="shard-btn" id="download"><span>⬇ DOWNLOAD RESULTS</span></button>
      <button class="shard-btn ghost small" id="newT"><span>NEW TOURNAMENT</span></button>`;
  }
  $("startRound")?.addEventListener("click", () => socket.emit("tStartRound"));
  $("holdAuto")?.addEventListener("click", () => socket.emit("tHold", { hold: true }));
  $("resumeAuto")?.addEventListener("click", () => socket.emit("tHold", { hold: false }));
  $("endRound")?.addEventListener("click", () => confirmBox("End the round now?",
    "Every battle still running stops now. In each one, the team with more HP left wins.", "END ROUND", () => socket.emit("tEndRound")));
  $("finishNow")?.addEventListener("click", () => confirmBox("Finish the tournament?",
    `Show the final results now, after ${state.round} round${state.round === 1 ? "" : "s"}?`, "FINISH", () => socket.emit("tFinish")));
  $("download")?.addEventListener("click", downloadCsv);
  $("newT")?.addEventListener("click", () => confirmBox("New tournament",
    "Start a new tournament with a new code? Download the results first if you want to keep them.", "START NEW", () => { clearSession(); socket.emit("tCreate"); }));
}

// ---------------------------------------------------------------- live clocks
setInterval(() => {
  const gone = Date.now() - receivedAt;
  document.querySelectorAll(".t-clock[data-ms]").forEach((el) => {
    el.textContent = "⏱ " + fmtClock(Number(el.dataset.ms) - gone);
  });
  document.querySelectorAll(".t-count[data-ms]").forEach((el) => {
    el.textContent = fmtClock(Number(el.dataset.ms) - gone);
  });
}, 500);

// ---------------------------------------------------------------- settings drawer
let drawerOpen = false;
function openDrawer() {
  drawerOpen = true;
  renderSettings();
  $("drawer").classList.add("open"); $("drawer").setAttribute("aria-hidden", "false");
  $("drawerBack").classList.remove("hidden");
}
function closeDrawer() {
  drawerOpen = false;
  $("drawer").classList.remove("open"); $("drawer").setAttribute("aria-hidden", "true");
  $("drawerBack").classList.add("hidden");
}
$("settingsBtn").addEventListener("click", openDrawer);
$("drawerClose").addEventListener("click", closeDrawer);
$("drawerBack").addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

function renderSettings() {
  if (!state) return;
  const started = state.round > 0;
  $("drawerNote").textContent = {
    lobby: "Changes apply when you start Round 1.",
    round: "Battles already running keep their settings. Changes apply from the next round.",
    between: "Changes apply from the next round.",
    finished: "To play on, add rounds below. The tournament then continues with the next round.",
  }[state.status];
  // keep the scroll position while the drawer re-renders
  const body = $("settingsBody"), scroll = body.scrollTop;
  body.innerHTML = SETTING_GROUPS.map((g) => `
    <div class="t-group"><h3 class="t-group-head">${g.title}</h3>
      ${SETTINGS.filter((s) => s.group === g.id).map((s) => settingRow(s, started)).join("")}
    </div>`).join("");
  body.scrollTop = scroll;
  body.querySelectorAll("[data-topic]").forEach((el) => el.addEventListener("change", () => {
    let chosen = [...body.querySelectorAll("[data-topic]:checked")].map((x) => x.dataset.topic);
    const v = el.dataset.topic;
    // "Mixed" already holds every built-in topic, so it and single built-in topics replace each other
    if (el.checked && v === "mixed") chosen = chosen.filter((x) => x === "mixed" || x.startsWith("set:"));
    else if (el.checked && !v.startsWith("set:")) chosen = chosen.filter((x) => x !== "mixed");
    if (!chosen.length) { el.checked = true; toast("Tick at least one topic or question set."); return; }
    socket.emit("tSetting", { key: "topicId", value: chosen.join(",") });
  }));
  body.querySelectorAll("[data-set]").forEach((el) => {
    const send = (value) => socket.emit("tSetting", { key: el.dataset.set, value });
    if (el.tagName === "SELECT") el.addEventListener("change", () => send(el.value));
    else el.addEventListener("click", () => send(el.dataset.value));
  });
}

function settingRow(s, started) {
  const locked = s.lockedAfterStart && started;
  const cur = state.settings[s.key];
  const disabledOpt = (o) => s.key === "rounds" && o.value < state.round;
  let control;
  if (s.key === "topicId") {
    // tick one or more: built-in topics and the teacher's own sets from the question hub
    const chosen = new Set(String(cur || "mixed").split(","));
    const sets = state.sets || [];
    const box = (value, label, sub) => `<label class="t-check ${chosen.has(value) ? "on" : ""}">
        <input type="checkbox" data-topic="${esc(value)}" ${chosen.has(value) ? "checked" : ""} />
        <span class="t-check-label">${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ""}</label>`;
    const missing = [...chosen].filter((v) => v.startsWith("set:") && !sets.some((q) => q.id === v));
    control = `<div class="t-checks">
        <div class="t-checks-head">Your question sets</div>
        ${sets.length ? sets.map((q) => box(q.id, "📝 " + q.title, `${q.count} question${q.count === 1 ? "" : "s"}`)).join("")
          : `<p class="t-checks-empty">No sets yet. Make one in the <a href="/hub" target="_blank" rel="noopener">question hub</a>.</p>`}
        ${missing.length ? `<p class="t-checks-empty">${missing.length} chosen set${missing.length === 1 ? " was" : "s were"} deleted and will be skipped.</p>` : ""}
        <div class="t-checks-head">Built-in questions</div>
        ${s.options.map((o) => box(o.value, o.label)).join("")}
      </div>`;
    return `<div class="t-setting">
      <div class="t-setting-label">${esc(s.label)} <span class="t-lock">tick one or more</span></div>
      ${control}
      <p class="t-setting-help">Every battle draws its questions from everything ticked. Add your own questions and pictures in the <a href="/hub" target="_blank" rel="noopener">question hub</a>.</p>
    </div>`;
  }
  if (s.options.length <= 4) {
    control = `<div class="t-seg">${s.options.map((o) => `
      <button class="t-seg-btn ${o.value === cur ? "on" : ""}" data-set="${s.key}" data-value="${esc(String(o.value))}" ${locked ? "disabled" : ""}>${esc(o.label)}</button>`).join("")}</div>`;
  } else {
    control = `<select class="t-select" data-set="${s.key}" ${locked ? "disabled" : ""}>${s.options.map((o) =>
      `<option value="${esc(String(o.value))}" ${o.value === cur ? "selected" : ""} ${disabledOpt(o) ? "disabled" : ""}>${esc(o.label)}</option>`).join("")}</select>`;
  }
  return `<div class="t-setting ${locked ? "locked" : ""}">
    <div class="t-setting-label">${esc(s.label)}${locked ? ` <span class="t-lock">🔒 fixed once Round 1 started</span>` : ""}</div>
    ${control}
    <p class="t-setting-help">${esc(s.help)}</p>
  </div>`;
}

// ---------------------------------------------------------------- results file
function downloadCsv() {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["Rank", "Pair", "Student", "Pair points", "Wins", "Draws", "Losses", "Correct answers", "Questions answered", "Accuracy %"].map(q).join(",")];
  for (const r of state.standings) {
    for (const m of r.members) {
      if (m.bot) continue;
      const acc = m.answered ? Math.round((m.correct / m.answered) * 100) : "";
      lines.push([r.rank, r.name, m.name, r.points, r.wins, r.draws, r.losses, m.correct, m.answered, acc].map(q).join(","));
    }
  }
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Academy Rift tournament ${state.code}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

resolveJoinBase().then(() => { if (state) renderJoin(); });

// ---------------------------------------------------------------- watching a battle
// A live battle card opens the game's watch-only view in a window over the page.
$("stage").addEventListener("click", (e) => {
  const card = e.target.closest("[data-watchm]");
  if (!card || !state) return;
  $("watchFrame").src = `/?watch=${state.code}&m=${card.dataset.watchm}`;
  $("watchModal").classList.remove("hidden");
});
function closeWatch() {
  $("watchModal").classList.add("hidden");
  $("watchFrame").src = "about:blank";
}
$("watchClose").addEventListener("click", closeWatch);
$("watchModal").addEventListener("click", (e) => { if (e.target.id === "watchModal") closeWatch(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeWatch(); });
