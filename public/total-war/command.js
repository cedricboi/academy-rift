// Total War: the teacher's Crimson command screen. The server decides everything; this page sends orders.
import { createMap, portrait, sprite, esc, setHTML, marchPoints } from './map.js';
import { NODES } from './movement.js';
import { UNITS, SUMMONABLE, CAMPS, FORTRESS, HOME, neighbours, cost, STACK_LIMIT, FORTRESS_LIMIT } from './rules.js';
import { TOPICS } from '../data/topics.js';
import { FOLDER_BY_ID } from '../data/folders.js';
import qrcode from '/vendor/qrcode.mjs';

const socket = io();
const $ = (id) => document.getElementById(id);
const nodeName = (n) => NODES[n]?.name || '?';
const SAVE = 'tw.host';
let H = null, hosting = null, offset = 0, speed = 1, selStack = null, selUnit = null, picked = null, toastT = 0, showClass = false, marchPick = false;
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

// ------------------------------------------------------------------ lobby
let joinBase = location.origin;
(async () => {
  if (!/^(localhost|127\.)/.test(location.hostname)) return;
  try { const r = await (await fetch('/api/addresses')).json(); if (r.lan?.[0]) joinBase = `http://${r.lan[0]}:${r.port}`; else { $('hostWarn').textContent = 'This page is open as "localhost", so students cannot reach it. Put the game online first.'; $('hostWarn').classList.remove('hidden'); } } catch {}
})();
let qrFor = '';
const opts = (el, list, value) => { setHTML(el, list.map(([v, l]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${l}</option>`).join('')); };

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
  for (const s of H.sets || []) { const f = FOLDER_BY_ID[s.folder]?.name || 'Question sets'; if (!folders.has(f)) folders.set(f, []); folders.get(f).push(s); }
  setHTML($('topics'), `<div class="folder">BUILT IN</div>` + TOPICS.map((t) => `<button type="button" data-topic="${t.id}" class="${chosen.has(t.id) || (!chosen.size && t.id === 'mixed') ? 'on' : ''}">${esc(t.name)}</button>`).join('')
    + [...folders].map(([f, sets]) => `<div class="folder">${esc(f.toUpperCase())}</div>` + sets.map((s) => `<button type="button" data-topic="${s.id}" class="${chosen.has(s.id) ? 'on' : ''}">${esc(s.title)} <small>· ${s.count}</small></button>`).join('')).join(''));
  opts($('setTurns'), [8, 10, 12, 14, 16, 20].map((n) => [n, `${n} turns`]), H.settings.turns);
  opts($('setCrimson'), [20, 30, 45, 60].map((n) => [n, `${n} seconds`]), H.settings.crimsonSeconds);
  opts($('setCrystal'), [90, 120, 150, 180, 240].map((n) => [n, `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')} min`]), H.settings.crystalSeconds);
  opts($('setTarget'), [15, 20, 25, 30, 40].map((n) => [n, `${n} questions`]), H.settings.target);
  $('classCount').textContent = `· ${H.students.length} JOINED`;
  const paired = H.pairs.map((p) => `<div class="pair">Pair ${p.no}${p.char ? '' : ''}<small>${esc(p.names.join(' & '))}</small></div>`).join('');
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
for (const [id, key] of [['setTurns', 'turns'], ['setCrimson', 'crimsonSeconds'], ['setCrystal', 'crystalSeconds'], ['setTarget', 'target']]) $(id).addEventListener('change', (e) => socket.emit('twSettings', { [key]: +e.target.value }));
$('roster').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pid]'); if (!b) return;
  if (!picked) { picked = b.dataset.pid; render(); return; }
  if (picked !== b.dataset.pid) socket.emit('twPairUp', { a: picked, b: b.dataset.pid });
  picked = null; render();
});
$('startWar').addEventListener('click', () => socket.emit('twStart'));

// ------------------------------------------------------------------ the war
const map = createMap($('mapHost'), {
  bottom: 96,
  onStop: (n) => {
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
$('endTurnBtn').addEventListener('click', () => { selStack = selUnit = null; socket.emit('twEndTurn'); });
$('releaseBtn').addEventListener('click', () => socket.emit('twRelease'));
$('menuBtn').addEventListener('click', () => $('menu').classList.toggle('hidden'));
$('endWarBtn').addEventListener('click', () => { if (confirm('End the war now? The Crimson Host will be declared the winner.')) socket.emit('twEndGame'); $('menu').classList.add('hidden'); });
$('classChip').addEventListener('click', () => { showClass = !showClass; render(); });
$('summon').addEventListener('click', (e) => { const b = e.target.closest('[data-type]'); if (b) socket.emit('twSummon', { type: b.dataset.type }); });
$('stackPanel').addEventListener('click', (e) => {
  const b = e.target.closest('[data-unit]'); if (b) { selUnit = selUnit === b.dataset.unit ? null : b.dataset.unit; render(); }
  if (e.target.closest('[data-close]')) { selStack = selUnit = null; marchPick = false; render(); }
  const o = e.target.closest('[data-order]');
  if (o) {
    const kind = o.dataset.order;
    if (kind === 'march') { marchPick = !marchPick; render(); return; }
    socket.emit('twOrder', { unitIds: orderTargets(), order: kind === 'clear' ? null : { kind } });
    marchPick = false;
  }
});
// orders go to the chosen unit, or to every free unit on the chosen stop
const orderTargets = () => selUnit ? [selUnit] : H.units.filter((x) => x.node === selStack && !x.battle).map((x) => x.id);
const ORDER_TEXT = { march: (o) => `Marching to ${nodeName(o.to)}`, hold: () => 'Holding', hunt: () => 'Hunting the nearest banner' };

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
  $('gEyebrow').textContent = H.status === 'ended' ? 'THE WAR IS OVER' : `TURN ${H.turn} OF ${H.turns} · ${mine ? 'CRIMSON TURN' : H.phase === 'crystal' ? 'CRYSTAL TURN' : 'BATTLES'}`;
  $('gTitle').textContent = mine ? (H.teacherEnded ? 'Waiting for the class to finish preparing' : 'Your move, Commander') : H.phase === 'crystal' ? 'The class is moving' : 'Battles are being fought';
  $('energy').textContent = H.energy;
  $('wardTxt').textContent = `${H.ward.hp}/${H.ward.max}`;
  $('endTurnBtn').disabled = !mine || H.teacherEnded; $('autoBtn').disabled = !mine || H.teacherEnded;
  $('releaseBtn').classList.toggle('hidden', !(H.gate.broken && !H.warlordReady));
  $('menuProjector').href = `projector.html?code=${H.code}`;

  const u = selUnit && H.units.find((x) => x.id === selUnit);
  if (selUnit && !u) selUnit = null;
  if (H.status !== 'playing') marchPick = false;
  const targets = marchPick ? NODES.map((_, n) => n).filter((n) => !CAMPS[n] && n !== selStack).map((n) => ({ node: n, target: true })) : unitOptions(u);
  const marches = H.units.filter((x) => x.order?.kind === 'march').map((x) => marchPoints(x.node, x.order.to)).filter(Boolean);
  map.render({ state: H, full: true, options: targets, marches, selected: selStack == null ? null : selStack === FORTRESS ? 'fortress' : `host${selStack}` });

  // the class, in one chip
  const quiet = H.students.filter((s) => s.quiet);
  const qPairs = [...new Set(quiet.map((s) => s.pairNo).filter(Boolean))];
  setHTML($('classChip'), `<span>Class <b>${H.onTarget} / ${H.students.length}</b> on ${H.settings.target} questions</span>${qPairs.length ? `<span class="quiet">${qPairs.map((n) => `Pair ${n}`).join(', ')} quiet</span>` : ''}`);
  $('classPanel').classList.toggle('hidden', !showClass);
  if (showClass) setHTML($('classPanel'), `<div class="eyebrow">THE CLASS · QUESTIONS ANSWERED</div>` + [...H.students].sort((a, b) => a.answered - b.answered)
    .map((s) => `<div class="st ${s.quiet ? 'quiet' : ''} ${s.connected ? '' : 'off'}"><span>${esc(s.name)}${s.pairNo ? ` · Pair ${s.pairNo}` : ''}${s.connected ? '' : ' · offline'}</span><span>${s.answered} answered · ${s.answered ? Math.round((s.correct / s.answered) * 100) : 0}% right</span></div>`).join(''));

  // live battles
  setHTML($('battles'), H.battles.map((B) => {
    const hp = B.enemies.reduce((a, e) => a + Math.max(0, e.hp), 0), max = B.enemies.reduce((a, e) => a + e.max, 0);
    return `<div class="bl ${B.kind === 'defend' ? 'atk' : ''}">${B.kind === 'defend' ? 'Your attack' : 'Battle'} at ${esc(nodeName(B.node))}<small>Resolve ${Math.ceil(B.resolve)}/${B.resolveMax || '–'} · ${B.bands.reduce((a, b) => a + b.pairs.length, 0)} pairs · ${B.status === 'gather' ? 'gathering' : `question ${B.qNo} of ${B.limit}`} · enemy ${Math.ceil(hp)} / ${max}${B.outcome ? ` · ${B.outcome === 'won' ? 'the class won' : 'you held'}` : ''}</small><div class="hpbar"><i style="width:${(hp / max) * 100}%"></i></div></div>`;
  }).join(''));

  // the selected stack
  const sp = $('stackPanel');
  if (selStack == null) sp.classList.add('hidden');
  else {
    const us = H.units.filter((x) => x.node === selStack);
    const fort = selStack === FORTRESS;
    setHTML(sp, `<button class="x-close" data-close="1" aria-label="Close">×</button><div class="eyebrow" style="color:var(--rose)">${fort ? 'CRIMSON FORTRESS' : 'CRIMSON WARBAND'}</div><h3>${esc(nodeName(selStack))}</h3>`
      + (fort ? `<div class="unit-row" style="cursor:default"><img src="${sprite(H.gate.broken ? 'warlord' : 'golem')}" alt=""><div class="nm">${H.gate.broken ? 'The Crimson Warlord' : 'Bloodstone Golem'}<small>${H.gate.broken ? (H.warlordReady ? 'Out and fighting' : 'Waiting inside') : 'Guards the gate'}</small><div class="hpbar"><i style="width:${H.gate.broken ? (H.warlord.hp / H.warlord.max) * 100 : (H.gate.hp / H.gate.max) * 100}%"></i></div></div><span class="mv">${H.gate.broken ? `${H.warlord.hp}/${H.warlord.max}` : `${H.gate.hp}/${H.gate.max}`}</span></div>` : '')
      + us.map((x) => `<button type="button" class="unit-row ${selUnit === x.id ? 'on' : ''}" data-unit="${x.id}"><img src="${sprite(x.type)}" alt=""><div class="nm">${esc(UNITS[x.type].name)}<small>${x.battle ? 'In battle' : x.order ? esc(ORDER_TEXT[x.order.kind](x.order)) : esc(UNITS[x.type].role)}${x.dugIn ? ' · dug in' : ''} · ${x.hp}/${x.max}</small></div><span class="mv">${Math.max(0, x.speed - x.moved)} move${x.speed - x.moved === 1 ? '' : 's'}</span></button>`).join('')
      + (us.length && H.status === 'playing' ? `<div class="eyebrow" style="margin-top:10px;color:var(--rose)">ORDERS · ${selUnit ? 'THIS UNIT' : 'EVERY UNIT HERE'}</div>
        <div class="orders"><button type="button" class="btn ${marchPick ? 'crimson' : ''}" data-order="march">March to…</button><button type="button" class="btn" data-order="hold">Hold</button><button type="button" class="btn" data-order="hunt">Hunt</button><button type="button" class="btn icon" data-order="clear" title="Clear orders">✕</button></div>` : '')
      + `<p class="hint" style="margin-top:8px">${marchPick ? 'Tap any ⚑ on the map. They march there turn after turn, and attack any banner in the way.' : mine ? (us.length ? 'Tap a unit, then a glowing stop to move it now. Or give orders: they play out when you end your turn. Holding a whole turn digs units in (25% tougher).' : 'Send units out with the cards below.') : 'Give orders any time: they play out at the end of your next turn. Move units by hand in your turn.'}</p>`);
    sp.classList.remove('hidden');
  }

  // send out the Host
  setHTML($('summon'), `<div class="lead"><span class="eyebrow" style="color:var(--rose);letter-spacing:2px;font-size:10px">SEND OUT</span><small>Tap a card. It appears at your fortress.</small></div>`
    + SUMMONABLE.map((t) => `<button type="button" data-type="${t}" ${H.status !== 'playing' || H.energy < UNITS[t].cost ? 'disabled' : ''} title="${esc(UNITS[t].role)}"><img src="${sprite(t)}" alt=""><span>${esc(UNITS[t].name.replace(/^(Riftborn|Emberfang|Ember|Riftweaver|Crimson|Ironhide) /, '').replace(' of the Rift', ''))}</span><i>${UNITS[t].cost}</i></button>`).join(''));

  // the end
  const end = $('ending');
  if (H.status !== 'ended') end.classList.add('hidden');
  else {
    end.classList.remove('hidden');
    setHTML(end, `<div class="eyebrow">${H.winner === 'crystal' ? 'THE CLASS WINS' : 'THE CRIMSON HOST WINS'}</div><h1>${H.winner === 'crystal' ? 'Your Warlord has fallen' : H.endedBy === 'ward' ? 'You broke the Academy Ward' : 'Your fortress stands'}</h1>
      <table><tr><th>Student</th><th>Pair</th><th>Answered</th><th>Right</th></tr>${[...H.students].sort((a, b) => b.answered - a.answered).map((s) => `<tr><td>${esc(s.name)}</td><td>${s.pairNo || ''}</td><td>${s.answered}</td><td>${s.answered ? Math.round((s.correct / s.answered) * 100) : 0}%</td></tr>`).join('')}</table>
      <button class="btn crimson" type="button" onclick="localStorage.removeItem('${SAVE}');location.reload()">Start a new war</button>`);
  }
}

setInterval(() => { if (H?.status === 'playing') $('gClock').textContent = mmss(secsLeft(H.phaseEndsAt)); }, 250);
