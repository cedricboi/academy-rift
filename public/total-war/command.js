// Total War: the teacher's Crimson command screen. The server decides everything; this page sends orders.
import { createMap, portrait, sprite, esc, setHTML, marchPoints } from './map.js';
import { NODES } from './movement.js';
import { UNITS, SUMMONABLE, CAMPS, FORTRESS, HOME, neighbours, cost, STACK_LIMIT, FORTRESS_LIMIT, TELEPORT_COST, energyPerTurn, showHp } from './rules.js';
import { TOPICS } from '../data/topics.js';
import { FOLDER_BY_ID } from '../data/folders.js';
import qrcode from '/vendor/qrcode.mjs';

const socket = io();
const $ = (id) => document.getElementById(id);
const nodeName = (n) => NODES[n]?.name || '?';
const SAVE = 'tw.host';
let idleChipExtra = '';
let teleportPick = false, ask = null, H = null, hosting = null, offset = 0, speed = 1, selStack = null, selUnit = null, picked = null, toastT = 0, showClass = false, marchPick = false;
const now = () => Date.now() + offset;
const secsLeft = (t) => Math.max(0, Math.ceil(((t - now()) * speed) / 1000));
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function show(id) { for (const s of ['setup', 'lobby', 'game']) $(s).classList.toggle('hidden', s !== id); }
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 3200); }

// ------------------------------------------------------------------ starting or resuming
const saved = () => JSON.parse(localStorage.getItem(SAVE) || 'null');
$('resumeWar').classList.toggle('hidden', !saved());
$('newWar').addEventListener('click', () => socket.emit('twCreate'));
$('resumeWar').addEventListener('click', () => socket.emit('twResume', saved()));
socket.on('connect', () => { const s = saved(); if (s) socket.emit('twResume', s); });   // a war in progress opens again by itself (as the tournament page does)
socket.on('twHosting', (h) => { hosting = h; localStorage.setItem(SAVE, JSON.stringify(h)); });
socket.on('twGone', () => { localStorage.removeItem(SAVE); hosting = null; $('resumeWar').classList.add('hidden'); show('setup'); toast('That war is no longer running. Start a new one.'); });
socket.on('twError', (m) => toast(m));
socket.on('twHost', (v) => { H = v; offset = v.serverNow - Date.now(); speed = v.speed || 1; render(); });
// the question sets come only when they change, not with every update
let SETS = [];
socket.on('twSets', (s) => { SETS = Array.isArray(s) ? s : []; if (H) render(); });
const END_BY = [[0, 'No time limit'], ...[35, 40, 45, 50, 55, 60].map((n) => [n, `${n} minutes`])];

// ------------------------------------------------------------------ lobby
let joinBase = location.origin;
(async () => {
  if (!/^(localhost|127\.)/.test(location.hostname)) return;
  try { const r = await (await fetch('/api/addresses')).json(); if (r.lan?.[0]) joinBase = `http://${r.lan[0]}:${r.port}`; else { $('hostWarn').textContent = 'This page is open as "localhost", so students cannot reach it. Put the game online first.'; $('hostWarn').classList.remove('hidden'); } } catch {}
})();
let qrFor = '';
// a dropdown the teacher has open is left alone (updates come several times a second during the war)
const opts = (el, list, value) => { if (document.activeElement === el) return; setHTML(el, list.map(([v, l]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${l}</option>`).join('')); };

function renderLobby() {
  show('lobby');
  const url = `${joinBase}/total-war/?code=${H.code}`;
  $('code').textContent = H.code;
  $('joinUrl').textContent = url.replace(/^https?:\/\//, '');
  $('projectorLink').href = $('menuProjector').href = `projector.html?code=${H.code}`;
  if (qrFor !== url) { qrFor = url; try { const qr = qrcode(0, 'M'); qr.addData(url); qr.make(); setHTML($('qr'), qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true, alt: 'QR code to join' })); } catch {} }
  if (document.activeElement !== $('setCommander')) $('setCommander').value = H.settings.commander;
  const chosen = new Set((H.settings.topic || '').split(',').filter(Boolean));
  const folders = new Map();
  for (const s of SETS) { const f = FOLDER_BY_ID[s.folder]?.name || 'Question sets'; if (!folders.has(f)) folders.set(f, []); folders.get(f).push(s); }
  setHTML($('topics'), `<div class="folder">BUILT IN</div>` + TOPICS.map((t) => `<button type="button" data-topic="${t.id}" class="${chosen.has(t.id) || (!chosen.size && t.id === 'mixed') ? 'on' : ''}">${esc(t.name)}</button>`).join('')
    + [...folders].map(([f, sets]) => `<div class="folder">${esc(f.toUpperCase())}</div>` + sets.map((s) => `<button type="button" data-topic="${s.id}" class="${chosen.has(s.id) ? 'on' : ''}">${esc(s.title)} <small>· ${s.count}</small></button>`).join('')).join(''));
  opts($('setTurns'), [8, 10, 12, 14, 16, 20].map((n) => [n, `${n} turns`]), H.settings.turns);
  opts($('setCrimson'), [20, 30, 45, 60].map((n) => [n, `${n} seconds`]), H.settings.crimsonSeconds);
  opts($('setCouncil'), [30, 45, 60, 90, 120].map((n) => [n, `${n} seconds`]), H.settings.councilSeconds);
  $('setTraining').checked = !!H.settings.trainingTurn;
  $('setLock').checked = !!H.settings.warlordLock;
  opts($('setCrystal'), [90, 120, 150, 180, 240].map((n) => [n, `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')} min`]), H.settings.crystalSeconds);
  opts($('setTarget'), [15, 20, 25, 30, 40].map((n) => [n, `${n} questions`]), H.settings.target);
  opts($('setEndBy'), END_BY, H.settings.endMinutes || 0);
  // a small pool means students see the same questions again and again
  $('poolWarn').classList.toggle('hidden', !H.poolLow);
  $('poolWarn').textContent = H.poolLow ? `Only ${H.poolSize} questions are chosen. Students will see repeats. Choose more sets for 80 or more.` : '';
  $('classCount').textContent = `· ${H.students.length} JOINED`;
  const paired = H.pairs.map((p) => `<div class="pair ${p.bots ? 'botty' : ''}">Pair ${p.no}${p.bots ? ' <em class="bot-tag">BOT</em>' : ''}<small>${esc(p.names.join(' & '))}</small></div>`).join('');
  $('setBotCmd').checked = !!H.settings.botCommander; $('setBotPartners').checked = H.settings.botPartners !== false;
  const loose = H.students.filter((s) => !s.pairNo).map((s) => `<button type="button" class="loose ${picked === s.pid ? 'picked' : ''}" data-pid="${s.pid}">${esc(s.name)}<small style="display:block;font-weight:400">no partner yet</small></button>`).join('');
  setHTML($('roster'), paired + loose || '<p class="hint">No one has joined yet. Students open the link or scan the code on their iPads.</p>');
  $('startWar').disabled = !H.students.length;
}
$('topics').addEventListener('click', (e) => {
  const b = e.target.closest('[data-topic]'); if (!b) return;
  const set = new Set((H.settings.topic || '').split(',').filter(Boolean)); const id = b.dataset.topic;
  if (id === 'mixed') set.clear();
  set.has(id) ? set.delete(id) : set.add(id);
  socket.emit('twSettings', { topic: [...set].join(',') || null });
});
$('setCommander').addEventListener('change', (e) => socket.emit('twSettings', { commander: e.target.value }));
for (const [id, key] of [['setTurns', 'turns'], ['setCrimson', 'crimsonSeconds'], ['setCrystal', 'crystalSeconds'], ['setTarget', 'target'], ['setEndBy', 'endMinutes'], ['menuTurns', 'turns'], ['menuEndBy', 'endMinutes']]) $(id).addEventListener('change', (e) => socket.emit('twSettings', { [key]: +e.target.value }));
$('roster').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pid]'); if (!b) return;
  if (!picked) { picked = b.dataset.pid; render(); return; }
  if (picked !== b.dataset.pid) socket.emit('twPairUp', { a: picked, b: b.dataset.pid });
  picked = null; render();
});
$('startWar').addEventListener('click', () => socket.emit('twStart'));
$('setBotCmd').addEventListener('change', (e) => socket.emit('twSettings', { botCommander: e.target.checked }));
$('setBotPartners').addEventListener('change', (e) => socket.emit('twSettings', { botPartners: e.target.checked }));
$('setTraining').addEventListener('change', (e) => socket.emit('twSettings', { trainingTurn: e.target.checked }));
$('addBots').addEventListener('click', () => socket.emit('twAddBots', { pairs: 1 }));
$('removeBots').addEventListener('click', () => socket.emit('twRemoveBots'));

// ------------------------------------------------------------------ a new unit asks for its orders straight away
socket.on('twSummoned', ({ unitId, type }) => { ask = { unitId, type, march: false }; marchPick = false; render(); });
$('orderAsk').addEventListener('click', (e) => {
  const o = e.target.closest('[data-ask]'); if (!o || !ask) return;
  const k = o.dataset.ask;
  if (k === 'march') { ask.march = !ask.march; ask.teleport = false; render(); return; }
  if (k === 'teleport') { ask.teleport = !ask.teleport; ask.march = false; render(); return; }
  if (k === 'ambush') socket.emit('twOrder', { unitIds: [ask.unitId], order: { kind: 'ambush' } });
  if (k === 'hold' || k === 'hunt') socket.emit('twOrder', { unitIds: [ask.unitId], order: { kind: k } });
  if (k === 'fortress') socket.emit('twOrder', { unitIds: [ask.unitId], order: { kind: 'march', to: FORTRESS } });
  ask = null; render();
});

// ------------------------------------------------------------------ the war
const map = createMap($('mapHost'), {
  bottom: 96,
  onStop: (n) => {
    if (ask?.teleport) { socket.emit('twTeleport', { unitId: ask.unitId, to: n }); ask.teleport = false; ask.moved = n; render(); return; }
    if (ask?.march) { socket.emit('twOrder', { unitIds: [ask.unitId], order: { kind: 'march', to: n } }); ask = null; render(); return; }
    if (teleportPick) { for (const id of orderTargets()) socket.emit('twTeleport', { unitId: id, to: n }); teleportPick = false; selStack = n; selUnit = null; render(); return; }
    if (marchPick) { socket.emit('twOrder', { unitIds: orderTargets(), order: { kind: 'march', to: n } }); marchPick = false; render(); return; }
    if (selUnit) socket.emit('twMoveUnit', { unitId: selUnit, to: n });
  },
  onBanner: (kind, ref, node) => {
    if (kind === 'host' || kind === 'fortress') { selStack = kind === 'fortress' ? FORTRESS : node; selUnit = null; }
    else { selStack = null; selUnit = null; }
    render();
  },
});
$('autoBtn').addEventListener('click', () => socket.emit('twAuto'));
$('guide').addEventListener('click', (e) => {
  const c = e.target.closest('[data-council]'); if (c) socket.emit('twCouncil', c.dataset.council === 'launch' ? { launch: true } : { extend: 15 });
  const tr = e.target.closest('[data-train]'); if (tr) socket.emit(tr.dataset.train === 'go' ? 'twContinue' : 'twEndTraining');
  const i = e.target.closest('[data-idle]'); if (i) { selStack = +i.dataset.idle; selUnit = null; render(); }
});
$('setLock').addEventListener('change', (e) => socket.emit('twSettings', { warlordLock: e.target.checked }));
$('setCouncil').addEventListener('change', (e) => socket.emit('twSettings', { councilSeconds: +e.target.value }));
$('endTurnBtn').addEventListener('click', () => { selStack = selUnit = null; socket.emit('twEndTurn'); });
$('releaseBtn').addEventListener('click', () => socket.emit('twRelease'));
$('menuBtn').addEventListener('click', (e) => { e.stopPropagation(); $('menu').classList.toggle('hidden'); });
document.addEventListener('click', (e) => { if (!$('menu').classList.contains('hidden') && !e.target.closest('#menu') && !e.target.closest('#menuBtn')) $('menu').classList.add('hidden'); });
$('endWarBtn').addEventListener('click', () => { if (confirm('End the war now? The result goes by how far the class got: the gate broken and the Warlord at half strength or less is a class win, the gate broken alone is a draw.')) socket.emit('twEndGame', { result: 'progress' }); $('menu').classList.add('hidden'); });
$('endWarClassBtn').addEventListener('click', () => { if (confirm('End the war now and declare the class the winner?')) socket.emit('twEndGame', { result: 'crystal' }); $('menu').classList.add('hidden'); });
$('pauseBtn').addEventListener('click', () => socket.emit('twPause', { paused: !H?.paused }));
$('battles').addEventListener('click', (e) => { const b = e.target.closest('[data-endbattle]'); if (b && confirm('End this battle now? The damage dealt stays, and the class steps back a road.')) socket.emit('twEndBattle', { battleId: b.dataset.endbattle }); });
$('guide').addEventListener('click', (e) => { if (e.target.closest('[data-resume]')) socket.emit('twPause', { paused: false }); });
$('classChip').addEventListener('click', () => { showClass = !showClass; render(); });
$('summon').addEventListener('click', (e) => { const b = e.target.closest('[data-type]'); if (b) socket.emit('twSummon', { type: b.dataset.type }); });
$('stackPanel').addEventListener('click', (e) => {
  const b = e.target.closest('[data-unit]'); if (b) { selUnit = selUnit === b.dataset.unit ? null : b.dataset.unit; render(); }
  if (e.target.closest('[data-close]')) { selStack = selUnit = null; marchPick = false; render(); }
  const o = e.target.closest('[data-order]');
  if (o) {
    const kind = o.dataset.order;
    if (kind === 'march') { marchPick = !marchPick; teleportPick = false; render(); return; }
    if (kind === 'teleport') { teleportPick = !teleportPick; marchPick = false; render(); return; }
    socket.emit('twOrder', { unitIds: orderTargets(), order: kind === 'clear' ? null : { kind } });
    marchPick = false;
  }
});
// orders go to the chosen unit, or to every free unit on the chosen stop
const orderTargets = () => selUnit ? [selUnit] : H.units.filter((x) => x.node === selStack && !x.battle).map((x) => x.id);
const ORDER_TEXT = { march: (o) => `Marching to ${nodeName(o.to)}`, hold: () => 'Holding', hunt: () => 'Hunting the nearest banner', ambush: () => 'Hiding in ambush (the class cannot see it)' };

function unitOptions(u) {
  if (!u || H.phase !== 'crimson') return [];
  if (u.battle) return [];
  const fighting = (n) => H.battles.find((B) => B.node === n && B.status !== 'over');
  return neighbours(u.node).filter((n) => u.moved + cost(u.node, n) <= UNITS[u.type].speed)
    .filter((n) => !CAMPS[n])
    .filter((n) => { const B = fighting(n); return !B || (B.kind === 'defend' && B.status === 'gather'); })
    .filter((n) => H.units.filter((x) => x.node === n).length < (n === FORTRESS ? FORTRESS_LIMIT : STACK_LIMIT))
    .map((n) => ({ node: n, cost: cost(u.node, n), attack: H.bands.some((b) => b.node === n) }));
}

function render() {
  if (!H) return;
  if (H.status === 'lobby') return renderLobby();
  show('game');
  const mine = H.phase === 'crimson';
  $('gEyebrow').textContent = H.status === 'ended' ? 'THE WAR IS OVER' : `TURN ${H.turn} OF ${H.turns} · ${mine ? 'YOUR TURN' : H.phase === 'crystal' ? (H.stage === 'quiz' ? 'CLASS QUESTIONS' : H.stage === 'council' ? 'WAR COUNCIL' : 'CLASS MARCHING') : 'BATTLES'}`;
  $('gTitle').textContent = H.status === 'ended' ? 'The war is over' : mine ? (H.teacherEnded ? 'Waiting for the class to finish preparing' : 'Your move, Commander') : H.phase === 'crystal' ? (H.stage === 'quiz' ? 'The class is answering questions' : H.stage === 'council' ? 'The class is planning routes' : 'The class is marching') : 'Battles are being fought';
  $('energy').textContent = H.energy;
  $('wardTxt').textContent = `${H.ward.hp}/${H.ward.max}`;
  // Auto and End my turn only show in the teacher's own turn; otherwise one line says what is happening
  const myMove = H.status === 'playing' && mine && !H.teacherEnded && !H.paused;
  $('endTurnBtn').classList.toggle('hidden', !myMove); $('autoBtn').classList.toggle('hidden', !myMove || !!H.settings.botCommander);
  $('turnNote').classList.toggle('hidden', myMove || H.status !== 'playing');
  $('turnNote').textContent = H.paused ? 'The war is paused' : mine ? 'Turn ended. The class is still preparing.' : H.phase === 'crystal' ? 'The class is moving. Your turn is next.' : 'Battles are being fought. Your turn is next.';
  $('pauseBtn').classList.toggle('hidden', H.status !== 'playing');
  $('pauseBtn').classList.toggle('crimson', !!H.paused);
  $('releaseBtn').classList.toggle('hidden', !(H.gate.broken && !H.warlordReady));
  $('menuProjector').href = `projector.html?code=${H.code}`;
  $('pauseBtn').textContent = H.paused ? '▶ Resume' : '❚❚ Pause';
  opts($('menuTurns'), [...new Set([8, 10, 12, 14, 16, 20, H.settings.turns])].filter((n) => n >= H.turn).sort((a, b) => a - b).map((n) => [n, `${n} turns`]), H.settings.turns);
  opts($('menuEndBy'), END_BY, H.settings.endMinutes || 0);

  const u = selUnit && H.units.find((x) => x.id === selUnit);
  if (selUnit && !u) selUnit = null;
  if (H.status !== 'playing') marchPick = teleportPick = false;
  if (ask) { const here = H.units.some((x) => x.id === ask.unitId); if (here) ask.seen = true; else if (ask.seen) ask = null; }   // twSummoned can arrive before the state that has the unit
  const teleporting = teleportPick || ask?.teleport;
  const bandNodes = new Set(H.bands.map((b) => b.node));
  const targets = teleporting ? NODES.map((_, n) => n).filter((n) => !CAMPS[n] && !bandNodes.has(n) && n !== (ask ? H.units.find((x) => x.id === ask.unitId)?.node : selStack)).map((n) => ({ node: n, target: true }))
    : (marchPick || ask?.march) ? NODES.map((_, n) => n).filter((n) => !CAMPS[n] && n !== selStack).map((n) => ({ node: n, target: true })) : unitOptions(u);
  const marches = H.units.filter((x) => x.order?.kind === 'march').map((x) => marchPoints(x.node, x.order.to)).filter(Boolean);
  map.render({ state: H, full: true, options: targets, marches, selected: selStack == null ? null : selStack === FORTRESS ? 'fortress' : `host${selStack}` });

  // the order prompt for a unit just sent out
  const oa = $('orderAsk');
  oa.classList.toggle('hidden', !ask);
  if (ask) setHTML(oa, `<div class="oa-top"><img src="${sprite(ask.type)}" alt=""><div><div class="eyebrow" style="color:var(--rose)">NEW UNIT AT YOUR FORTRESS</div><h3>${esc(UNITS[ask.type].name)}</h3><p>What should it do? It keeps this order every turn until you change it.</p></div></div>
    ${ask.march ? `<p class="oa-pick">Tap any ⚑ on the map to send it there.</p>` : ask.teleport ? `<p class="oa-pick">Tap any ⚑ on the map: it appears there now (${TELEPORT_COST} Rift Energy).</p>` : ask.moved != null ? `<p class="oa-done">Teleported to ${esc(nodeName(ask.moved))}. Now hide it in ambush, or give it an order.</p>` : ''}
    <div class="oa-grid">
      <button type="button" class="btn ${ask.march ? 'crimson' : ''}" data-ask="march"><b>⚑ March to…</b><small>Walk to a stop you pick, fighting anyone on the way</small></button>
      <button type="button" class="btn" data-ask="hunt"><b>⚔ Hunt</b><small>Chase the nearest student banner</small></button>
      <button type="button" class="btn" data-ask="hold"><b>⛨ Hold here</b><small>Guard ${ask.moved != null ? 'this stop' : 'the fortress'}, dig in, 25% tougher</small></button>
      <button type="button" class="btn ${ask.teleport ? 'crimson' : ''}" data-ask="teleport" ${H.energy < TELEPORT_COST || H.phase !== 'crimson' ? 'disabled' : ''}><b>⚡ Teleport…</b><small>Appear on any free stop now · ${TELEPORT_COST} energy</small></button>
      ${ask.moved != null ? `<button type="button" class="btn" data-ask="ambush"><b>👁 Ambush here</b><small>Hidden from the class. Whoever walks in is caught (starts hurt)</small></button>` : ''}
      <button type="button" class="btn ghost" data-ask="later"><b>Decide later</b><small>Tap its warband on the map any time</small></button>
    </div>`);

  // what to do next, in one line
  const steps = [['1', 'Send out units', 'cards at the bottom'], ['2', 'Give them orders', 'march · hunt · hold'], ['3', 'End your turn', 'orders play out']];
  const stepNow = !mine || H.teacherEnded ? -1 : ask ? 1 : H.energy >= Math.min(...SUMMONABLE.map((t) => UNITS[t].cost)) ? 0 : 2;
  const agreed = H.bands.filter((b) => b.status === 'committed' || b.status === 'battle').length;
  const idle = H.units.filter((u) => !u.order && !u.battle && u.node !== FORTRESS);
  const idleChip = idle.length ? `<button type="button" class="g-idle" data-idle="${idle[0].node}">${idle.length} unit${idle.length > 1 ? 's' : ''} without orders</button>` : '';
  const stuck = (H.stuck || []).length ? `<span class="g-idle">${H.stuck.map((p) => `Pair ${p.no}`).join(', ')} ${H.stuck.length > 1 ? 'have' : 'has'} not moved for 3 turns. Check in with them.</span>` : '';
  const left = H.endAt ? Math.max(0, Math.ceil((H.endAt - now()) / 60000)) : null;
  idleChipExtra = stuck + (left != null ? `<span class="g-idle">War ends in about ${left} min</span>` : '');
  // the training turn: nothing is timed, the teacher moves the class on with Continue
  const training = H.status === 'playing' && H.training && !H.paused
    ? `<div class="g-council"><b>TRAINING TURN</b> No timers. ${H.phase === 'crimson' ? 'Students are answering questions to earn steps.' : H.stage === 'quiz' ? `Students are answering 3 questions: <b>${H.quiz?.done ?? 0} of ${H.quiz?.of ?? 0}</b> done.` : H.stage === 'council' ? `Students are planning their moves: ${agreed} of ${H.bands.length} warbands have chosen a route.` : 'The warbands are moving and fighting.'} <button type="button" class="btn crimson" data-train="go">Continue</button><button type="button" class="btn" data-train="end">End training (start the timers)</button></div>` : '';
  if (training) { setHTML($('guide'), training); }
  else setHTML($('guide'), H.status !== 'playing' ? '' : H.paused ? `<div class="g-wait"><b>PAUSED</b> ${H.paused.restored ? 'The server restarted and the war is back at the start of this turn. Resume when the class has rejoined.' : 'Every clock has stopped. Students see "Paused by ' + esc(H.settings.commander) + '".'} <button type="button" class="btn crimson" data-resume="1">Resume</button></div>`
    : (H.phase === 'crystal' && H.stage === 'quiz'
    ? `<div class="g-wait">The class is answering 3 questions before planning its move: <b>${H.quiz?.done ?? 0} of ${H.quiz?.of ?? 0}</b> done.</div>${idleChip}`
    : H.phase === 'crystal' && H.stage === 'council'
    ? `<div class="g-council"><b>WAR COUNCIL</b> <span data-until="${H.phaseEndsAt}"></span> left. ${agreed} of ${H.bands.length} warband${H.bands.length === 1 ? ' has' : 's have'} chosen a route. <button type="button" class="btn" data-council="extend">+15 s</button><button type="button" class="btn crimson" data-council="launch">Launch now</button></div>${idleChip}`
    : H.settings.botCommander ? `<div class="g-bot">🤖 The Bot Commander is leading your Host. Watch, or give orders yourself.</div>` : !mine
    ? `<div class="g-wait">${H.phase === 'crystal' ? 'The warbands are marching.' : 'Battles are being fought.'} You can still send out units and give orders. They play out in your turn.</div>${idleChip}`
    : steps.map(([n, t, s], i) => `<div class="g-step ${i === stepNow ? 'now' : i < stepNow ? 'done' : ''}"><i>${n}</i><span><b>${t}</b><small>${s}</small></span></div>`).join('<span class="g-arrow">›</span>')) + idleChipExtra);

  // the class, in one chip
  const quiet = H.students.filter((s) => s.quiet && !s.bot);
  const qPairs = [...new Set(quiet.map((s) => s.pairNo).filter(Boolean))];
  setHTML($('classChip'), `<span><b>${H.onTarget} of ${H.students.length}</b> students have answered ${H.settings.target} questions</span>${qPairs.length ? `<span class="quiet">${qPairs.map((n) => `Pair ${n}`).join(', ')} ${qPairs.length > 1 ? 'are' : 'is'} quiet</span>` : ''}<small>Tap for the class</small>`);
  $('classPanel').classList.toggle('hidden', !showClass);
  if (showClass) setHTML($('classPanel'), `<div class="eyebrow">THE CLASS · QUESTIONS ANSWERED</div>` + [...H.students].sort((a, b) => a.answered - b.answered)
    .map((s) => `<div class="st ${s.quiet ? 'quiet' : ''} ${s.connected ? '' : 'off'}"><span>${esc(s.name)}${s.bot ? ' <em class="bot-tag">BOT</em>' : ''}${s.pairNo ? ` · Pair ${s.pairNo}` : ''}${s.connected ? '' : ' · offline'}</span><span>${s.answered} answered · ${s.answered ? Math.round((s.correct / s.answered) * 100) : 0}% right</span></div>`).join(''));

  // live battles
  setHTML($('battles'), H.battles.map((B) => {
    const hp = B.enemies.reduce((a, e) => a + Math.max(0, e.hp), 0), max = B.enemies.reduce((a, e) => a + e.max, 0);
    const pairs = B.bands.reduce((a, b) => a + b.pairs.length, 0);
    const where = B.status === 'gather' ? 'Getting ready' : B.status === 'over' ? (B.outcome === 'won' ? 'The class won' : B.outcome === 'stopped' ? 'You ended it' : 'Your Host held') : `Question ${B.qNo} of ${B.limit}`;
    return `<div class="bl ${B.kind === 'defend' ? 'atk' : ''}"><div class="bl-h">${B.kind === 'defend' ? 'Your attack' : 'Battle'} at ${esc(nodeName(B.node))}<em>${where}</em></div>
      <div class="bl-row"><span>${pairs} pair${pairs === 1 ? '' : 's'} fighting</span><span>Class HP ${B.resolveMax ? `${Math.max(0, Math.ceil(B.resolve))} of ${B.resolveMax}` : 'full'}</span></div>
      <div class="bl-row"><span>Your units</span><span>${Math.ceil(hp)} of ${Math.round(max)} HP</span></div><div class="hpbar"><i style="width:${max ? (hp / max) * 100 : 0}%"></i></div>
      ${B.status !== 'over' && H.status === 'playing' ? `<button type="button" class="btn" data-endbattle="${B.id}">End this battle now</button>` : ''}</div>`;
  }).join(''));

  // the selected stack
  const sp = $('stackPanel');
  if (selStack == null) sp.classList.add('hidden');
  else {
    const us = H.units.filter((x) => x.node === selStack);
    const fort = selStack === FORTRESS;
    setHTML(sp, `<button class="x-close" data-close="1" aria-label="Close">×</button><div class="eyebrow" style="color:var(--rose)">${fort ? 'CRIMSON FORTRESS' : 'CRIMSON WARBAND'}</div><h3>${esc(nodeName(selStack))}</h3>`
      + (fort ? `<div class="unit-row" style="cursor:default"><img src="${sprite(H.gate.broken ? 'warlord' : 'golem')}" alt=""><div class="nm">${H.gate.broken ? 'The Crimson Warlord' : 'Bloodstone Golem'}<small>${H.gate.broken ? (H.warlordReady ? 'Out and fighting' : 'Waiting inside') : 'Guards the gate'}</small><div class="hpbar"><i style="width:${H.gate.broken ? (H.warlord.hp / H.warlord.max) * 100 : (H.gate.hp / H.gate.max) * 100}%"></i></div></div><span class="mv">${H.gate.broken ? `${showHp(H.warlord.hp)}/${showHp(H.warlord.max)}` : `${showHp(H.gate.hp)}/${showHp(H.gate.max)}`}</span></div>` : '')
      + us.map((x) => `<button type="button" class="unit-row ${selUnit === x.id ? 'on' : ''}" data-unit="${x.id}"><img src="${sprite(x.type)}" alt=""><div class="nm">${esc(UNITS[x.type].name)}<small>${x.battle ? 'In battle' : x.order ? esc(ORDER_TEXT[x.order.kind](x.order)) : esc(UNITS[x.type].role)}${x.dugIn ? ' · dug in' : ''} · ${x.hp}/${x.max}</small></div><span class="mv">${Math.max(0, x.speed - x.moved)} move${x.speed - x.moved === 1 ? '' : 's'}</span></button>`).join('')
      + (us.length && H.status === 'playing' ? `<div class="eyebrow" style="margin-top:10px;color:var(--rose)">ORDERS · ${selUnit ? 'THIS UNIT' : 'EVERY UNIT HERE'}</div>
        <div class="orders"><button type="button" class="btn ${marchPick ? 'crimson' : ''}" data-order="march">March to…</button><button type="button" class="btn" data-order="hold">Hold</button><button type="button" class="btn" data-order="hunt">Hunt</button><button type="button" class="btn" data-order="ambush" title="Hide here: the class cannot see it">Ambush</button><button type="button" class="btn ${teleportPick ? 'crimson' : ''}" data-order="teleport" ${H.energy < TELEPORT_COST || !mine ? 'disabled' : ''} title="${TELEPORT_COST} Rift Energy a unit">⚡ Teleport</button><button type="button" class="btn icon" data-order="clear" title="Clear orders">✕</button></div>` : '')
      + `<p class="hint" style="margin-top:8px">${teleportPick ? `Tap any ⚑ on the map: ${selUnit ? 'this unit appears' : 'every free unit here appears'} there now, for ${TELEPORT_COST} Rift Energy each.` : marchPick ? 'Tap any ⚑ on the map. They march there turn after turn, and attack any banner in the way.' : mine ? (us.length ? 'Tap a unit, then a glowing stop to move it now. Or give orders: they play out when you end your turn. Holding a whole turn digs units in (25% tougher).' : 'Send units out with the cards below.') : 'Give orders any time: they play out at the end of your next turn. Move units by hand in your turn.'}</p>`);
    sp.classList.remove('hidden');
  }

  // send out the Host
  const gain = energyPerTurn(H.pairs.length);
  setHTML($('summon'), `<div class="lead"><span class="eyebrow" style="color:var(--rose)">SEND OUT</span><small>${H.energy ? 'Tap a card. It appears at your fortress.' : `No Rift Energy left. You get ${gain} more at the start of your turn.`}</small></div>`
    + SUMMONABLE.map((t) => { const short = H.energy < UNITS[t].cost; return `<button type="button" data-type="${t}" class="${short ? 'short' : ''}" ${H.status !== 'playing' || short ? 'disabled' : ''} title="${esc(UNITS[t].role)}"><img src="${sprite(t)}" alt=""><span>${esc(UNITS[t].name.replace(/^(Riftborn|Emberfang|Ember|Riftweaver|Crimson|Ironhide) /, '').replace(' of the Rift', ''))}</span><i>${UNITS[t].cost}</i>${short ? `<em>Need ${UNITS[t].cost} energy</em>` : ''}</button>`; }).join(''));

  // the end
  const end = $('ending');
  if (H.status !== 'ended') end.classList.add('hidden');
  else {
    end.classList.remove('hidden');
    const R = H.report;
    setHTML(end, `<div class="end-in"><div class="eyebrow">${H.winner === 'crystal' ? 'THE CLASS WINS' : H.winner === 'draw' ? 'A DRAW' : 'THE CRIMSON HOST WINS'}</div><h1>${H.winner === 'crystal' ? (H.endedBy && H.endedBy !== 'teacher' ? 'The class wins on points' : H.endedBy === 'teacher' ? 'You declared the class the winner' : 'Your Warlord has fallen') : H.winner === 'draw' ? 'The gate is broken, your Warlord stands' : H.endedBy === 'ward' ? 'You broke the Academy Ward' : 'Your fortress stands'}</h1>
      ${H.endedBy && !['ward', 'teacher'].includes(H.endedBy) ? `<p>The class got ${H.progress?.pct ?? 0}% of the way.</p>` : ''}
      ${R ? `<div class="report"><div class="eyebrow">LEARNING REPORT</div><button class="btn" type="button" data-csv="1">Download the report (CSV)</button>
        <h3>By learning objective</h3><table><tr><th>Learning objective</th><th>Answers</th><th>Right</th></tr>${R.objectives.map((o) => `<tr><td>${esc(o.lo)}</td><td>${o.asked}</td><td>${o.pct}%</td></tr>`).join('')}</table>
        <h3>Most missed questions</h3><table><tr><th>Question</th><th>Right</th><th>Correct answer</th><th>Most common wrong answer</th></tr>${R.missed.map((q) => `<tr><td>${esc(q.text)}</td><td>${q.right} of ${q.asked}</td><td>${esc(q.answer)}</td><td>${esc(q.commonWrong)}</td></tr>`).join('')}</table>
        <h3>Students</h3></div>` : ''}
      <table class="students"><tr><th>Student</th><th>Pair</th><th>Answered</th><th>Right</th></tr>${[...H.students].sort((a, b) => b.answered - a.answered).map((s) => `<tr><td>${esc(s.name)}</td><td>${s.pairNo || ''}</td><td>${s.answered}</td><td>${s.answered ? Math.round((s.correct / s.answered) * 100) : 0}%</td></tr>`).join('')}</table>
      ${H.story?.length ? `<div class="story"><div class="eyebrow">HOW THE CAMPAIGN WENT</div><div class="story-map"><img src="art/moonveil-map.webp" alt="">${H.story.map((e, i) => e.node == null ? '' : `<i style="left:${(NODES[e.node].x / 14.4).toFixed(2)}%;top:${(NODES[e.node].y / 9).toFixed(2)}%">${i + 1}</i>`).join('')}</div><ol>${H.story.map((e) => `<li><small>Turn ${e.turn}</small>${esc(e.text)}</li>`).join('')}</ol></div>` : ''}
      <button class="btn crimson" type="button" data-newwar="1">Start a new war</button></div>`);
  }
}

// the report stays until a new war starts, and starting one asks first
$('ending').addEventListener('click', (e) => {
  if (e.target.closest('[data-csv]') && H?.report) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + H.report.csv], { type: 'text/csv' }));
    a.download = `total-war-${H.code}-report.csv`; document.body.appendChild(a); a.click(); a.remove();
  }
  if (e.target.closest('[data-newwar]') && confirm('Start a new war? This war\'s learning report closes. Download it first if you need it.')) { localStorage.removeItem(SAVE); location.reload(); }
});
setInterval(() => { if (H?.status === 'playing' && !H.paused) { $('gClock').textContent = mmss(secsLeft(H.phaseEndsAt)); document.querySelectorAll('[data-until]').forEach((el) => { el.textContent = mmss(secsLeft(+el.dataset.until)); }); } }, 250);
