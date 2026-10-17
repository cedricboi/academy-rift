// Total War: the student iPad. Draws what the server sends; every decision is made on the server.
import { createMap, stepOptions, roadPoints, portrait, sprite, charColor, esc, setHTML } from './map.js';
import { createCard } from './card.js';
import { NODES } from './movement.js';
import { CAMPS, UNITS, FORTRESS, HOME, battleLength } from './rules.js';
import { BANNERS, bannerFor } from './banners.js';
import { createStage, enemyName } from './stage.js';
import { initTheatre, prepareBattle, playRound, skip as skipTheatre, hasTheatre, SCALE } from './theatre-tw.js';
import { CHARACTERS, ITEMS } from '../data/characters.js';
import { createArenaBridge } from './arena-bridge.js';
import { createPhone } from './phone.js';

const socket = io();
const $ = (id) => document.getElementById(id);
const nodeName = (n) => NODES[n]?.name || '?';
const SAVE = 'tw.student';
let S = null, me = null, offset = 0, speed = 1, selected = null, lastBattleQ = null, myPick = null, toastT = 0;
const now = () => Date.now() + offset;
const gameSecondsLeft = (t) => Math.max(0, Math.ceil(((t - now()) * speed) / 1000));
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const boss = () => S?.commander || 'Your teacher';
const myBand = () => S?.bands.find((b) => b.id === S.me.bandId) || null;

// ------------------------------------------------------------------ joining
const params = new URLSearchParams(location.search);
$('joinCode').value = (params.get('code') || '').toUpperCase();
$('joinName').value = localStorage.getItem('tw.name') || '';
$('joinCode').addEventListener('input', (e) => { const v = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); if (v !== e.target.value) e.target.value = v; });
$('joinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  localStorage.setItem('tw.name', $('joinName').value.trim());
  socket.emit('twJoin', { code: $('joinCode').value.trim().toUpperCase(), name: $('joinName').value.trim() });
});
$('practiceBtn').addEventListener('click', () => {
  const name = $('joinName').value.trim();
  if (!name) { $('joinName').focus(); toast('Type your name first.'); return; }
  localStorage.setItem('tw.name', name);
  socket.emit('twPractice', { name, char: BANNERS[Math.floor(Math.random() * BANNERS.length)].id });
});
socket.on('connect', () => {
  const saved = JSON.parse(localStorage.getItem(SAVE) || 'null');
  if (saved?.token) socket.emit('twRejoin', saved);
});
socket.on('twMe', (m) => { me = m; localStorage.setItem(SAVE, JSON.stringify({ code: m.code, token: m.token })); });
socket.on('twGone', () => { localStorage.removeItem(SAVE); show('join'); });
socket.on('twError', (m) => toast(m));
socket.on('twState', (v) => { S = v; offset = v.serverNow - Date.now(); speed = v.speed || 1; render(); });

function show(id) { for (const s of ['join', 'lobby', 'game']) $(s).classList.toggle('hidden', s !== id); }
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 3200); }

// ------------------------------------------------------------------ lobby (as in the class tournament)
const cardArt = (id) => `../assets/Character Card/${id}.webp`;
function renderLobby() {
  show('lobby');
  const L = S.lobby, me = S.me;
  $('lobbyCode').textContent = S.code;
  setHTML($('lbYou'), `You are <b>${esc(me.name)}</b>`);
  const myPair = L.pairs.find((p) => p.id === me.pairId);
  const ready = L.students.filter((s) => s.ready).length;
  setHTML($('lobbySub'), `Choose a partner and a fighter, then tap I'M READY. Anyone without a partner marches alone. <b>${ready}</b> of ${L.students.length} ready. ${esc(boss())} starts the war.`);
  $('readyBtn').classList.toggle('on', !!me.ready);
  setHTML($('readyBtn'), me.ready ? '<span>✓ READY</span>' : '<span>◆ I\'M READY ◆</span>');
  // partner
  $('pairBox').classList.toggle('hidden', !myPair);
  $('partnerList').classList.toggle('hidden', !!myPair);
  $('partnerHint').classList.toggle('hidden', !!myPair);
  if (myPair) setHTML($('pairNames'), `<span class="eyebrow">YOUR PARTNER</span><b>${esc(myPair.names.filter((n) => n !== me.name).join(' & ') || 'You march alone')}</b>`);
  else {
    const others = L.students.filter((s) => s.pid !== me.pid && !s.pairId);
    setHTML($('partnerList'), others.length ? others.map((s) => {
      const mine = me.want === s.pid, theirs = s.want === me.pid;
      const tag = mine && theirs ? '' : mine ? '<small class="wait">WAITING FOR THEM</small>' : theirs ? '<small class="picked">PICKED YOU</small>' : '';
      return `<button type="button" class="pt ${mine ? 'mine' : ''} ${theirs ? 'theirs' : ''}" data-pid="${s.pid}">${esc(s.name)}${tag}</button>`;
    }).join('') : '<p class="lb-hint">No one else is free yet. Classmates appear here as they join.</p>');
  }
  // fighter
  const char = myPair?.char || me.myChar;
  const b = char ? bannerFor(char) : null;
  setHTML($('standardCard'), b ? `<img class="std-art" src="${cardArt(b.id)}" alt=""><div class="std-info"><div class="std-name">${esc(b.fullName)}</div><div class="std-el" style="--c:${b.color}">${esc(b.element)} · ${esc(b.role)}</div><p>${esc(b.name)} leads your banner across the map.</p><button class="ghost-btn" type="button" data-open="std">CHANGE FIGHTER</button></div>`
    : `<div class="std-empty">?</div><div class="std-info"><div class="std-name">NOT CHOSEN YET</div><p>If you do not pick, you get a random fighter.</p><button class="ghost-btn" type="button" data-open="std">CHOOSE FIGHTER</button></div>`);
  setHTML($('standards'), BANNERS.map((x) => `<button type="button" data-char="${x.id}" class="${char === x.id ? 'on' : ''}" style="--c:${x.color}"><img src="${cardArt(x.id)}" alt=""><b>${esc(x.name)}</b><small>${esc(x.element)}</small></button>`).join(''));
  // the army so far
  const rows = L.pairs.map((p) => {
    const st = p.names.map((n) => L.students.find((s) => s.name === n));
    const rd = st.every((x) => x?.ready);
    return `<div class="army-row ${p.id === me.pairId ? 'me' : ''}"><img src="${p.char ? portrait(p.char) : portrait('kuro')}" alt="" style="--c:${p.char ? charColor(p.char) : '#555'}" class="${p.char ? '' : 'blank'}"><span>Pair ${p.no} · ${esc(p.names.join(' & '))}</span>${rd ? '<i class="rd">✓</i>' : ''}</div>`;
  });
  const loose = L.students.filter((s) => !s.pairId).map((s) => `<div class="army-row loose"><span>${esc(s.name)} <small>no partner yet</small></span>${s.ready ? '<i class="rd">✓</i>' : ''}</div>`);
  $('armyCount').textContent = `· ${L.students.length} JOINED`;
  setHTML($('army'), rows.concat(loose).join('') || '<p class="lb-hint">The army gathers here.</p>');
}
$('partnerList').addEventListener('click', (e) => { const b = e.target.closest('[data-pid]'); if (b) socket.emit('twPartner', { pid: b.dataset.pid }); });
$('leavePair').addEventListener('click', () => socket.emit('twLeavePair'));
$('readyBtn').addEventListener('click', () => socket.emit('twReady', { ready: !S?.me.ready }));
$('lbLeave').addEventListener('click', () => { localStorage.removeItem(SAVE); location.reload(); });
$('standardCard').addEventListener('click', (e) => { if (e.target.closest('[data-open]')) $('stdPick').classList.remove('hidden'); });
$('stdPick').addEventListener('click', (e) => {
  const b = e.target.closest('[data-char]');
  if (b) { socket.emit('twStandard', { char: b.dataset.char }); $('stdPick').classList.add('hidden'); }
  else if (e.target.closest('[data-close]') || e.target === $('stdPick')) $('stdPick').classList.add('hidden');
});

// ------------------------------------------------------------------ the map
const map = createMap($('mapHost'), {
  onStop: (n) => { selected = null; socket.emit('twVote', { to: n }); },
  onBanner: (kind, ref, node) => { selected = kind === 'pair' ? `band${ref}` : kind === 'host' ? `host${node}` : kind === 'camp' ? `camp${node}` : kind === 'academy' ? 'academy' : 'fortress'; if (kind === 'pair' && ref === S?.me.bandId) selected = null; render(); },
});
const card = createCard($('card'), { onPick: (i, startedAt) => socket.emit('twAnswer', { chosen: i, startedAt }) });
const bcard = createCard($('bCard'), { onPick: (i, startedAt) => { myPick = i; socket.emit('twAnswer', { chosen: i, startedAt }); } });
const stage = createStage($('bStage'), { mode: 'pair' });
let lastRoundAt = 0, lastBattleId = null, cinema = false, movesOpen = null, moveKey = '';
initTheatre($('bTheatre'));
const arena = createArenaBridge({ socket, host: $('arenaHost') });
// the last cinematic of a battle finishes in the Arena before the war page shows how it ended
setInterval(() => { if (S?.myBattle?.status === 'over' && arena.open && !arena.busy()) render(); }, 400);
const CHAR_BY = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));
const X = (v) => Math.round(v * SCALE);      // battles count in hits; they are shown at the Arena's scale

$('endTurnBtn').addEventListener('click', () => socket.emit('twVote', { to: 'stay' }));
$('leaveBandBtn').addEventListener('click', () => socket.emit('twLeaveBand'));
$('abJoin').addEventListener('click', (e) => { const id = e.currentTarget.dataset.band; if (id) socket.emit('twJoinBand', { bandId: id }); });
$('infoCard').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.close) { selected = null; render(); }
  if (b.dataset.vote) { socket.emit('twVote', { to: +b.dataset.vote }); selected = null; }
  if (b.dataset.joinband) { socket.emit('twJoinBand', { bandId: b.dataset.joinband }); selected = null; }
});
$('joinPrompt').addEventListener('click', (e) => { const b = e.target.closest('[data-battle]'); if (b) socket.emit('twJoinBattle', { battleId: b.dataset.battle }); });

function render() {
  if (!S) return;
  if (S.status === 'lobby') return renderLobby();
  show('game');
  const band = myBand();
  // top bar
  const phase = S.phase;
  $('phaseEyebrow').textContent = S.status === 'ended' ? 'THE WAR IS OVER' : `TURN ${S.turn} OF ${S.turns} · ${phase === 'crimson' ? 'CRIMSON TURN' : phase === 'crystal' ? 'CRYSTAL TURN' : 'BATTLES'}`;
  $('phaseTitle').textContent = phase === 'crimson' ? `${boss()} is moving` : phase === 'crystal' ? 'Your move' : phase === 'battles' ? 'The last battles' : 'The war is over';
  $('phaseClock').classList.toggle('red', phase === 'crimson');
  $('enemyName').textContent = `${boss()}, Crimson Commander`;
  setHTML($('buffs'), S.buffs.map((b) => { const c = Object.values(CAMPS).find((x) => x.buff === b.key); return c ? `<span class="buff">${esc(c.buffName)}: ${esc(c.buffText)}</span>` : ''; }).join(''));

  // map
  const options = band && !S.own ? stepOptions(S, band) : [];
  const myVote = band?.pairs.find((p) => p.id === S.me.pairId)?.vote;
  const votes = {}; for (const p of band?.pairs || []) if (p.vote !== null && p.vote !== 'stay') votes[p.vote] = (votes[p.vote] || 0) + 1;
  for (const o of options) o.mine = o.node === myVote;
  map.render({ state: S, mine: band?.id, focusNode: band?.node ?? null, options, votes, selected, route: band && typeof myVote === 'number' ? roadPoints(band.node, myVote) : null });

  // ribbon: only for alarms
  const siege = S.units.some((u) => u.node === HOME && !u.battle);
  $('ribbon').textContent = siege ? `⚠ The Crimson Host is at the Academy! Drive them out before the Ward breaks (${S.ward.hp} of ${S.ward.max} left).` : '';

  renderActBar(band, options, myVote);
  renderInfo(band, options);
  renderJoin();
  renderQuestion();
  renderBattle();
  renderEnding();
  maybeHelp();
  renderShop();
  maybeAuntie();
}

// The bar along the bottom of the map: what to do right now, and the buttons for it
function renderActBar(band, options, myVote) {
  const bar = $('actBar');
  const on = band && S.status === 'playing' && !S.myBattle;
  bar.classList.toggle('hidden', !on);
  map.setBottom(on ? 104 : 0);
  if (!on) return;
  const moving = S.phase === 'crystal' && !band.done && !band.battle;
  const multi = band.pairs.length > 1;
  setHTML($('abBand'), band.pairs.map((p) => {
    const vt = moving && multi ? (p.vote === null ? '<i class="v wait">…</i>' : `<i class="v">${p.vote === 'stay' ? 'STAY' : '✓'}</i>`) : '';
    return `<span class="ab-pair ${p.id === S.me.pairId ? 'me' : ''}" title="Pair ${p.no}"><img src="${portrait(p.char)}" alt="" style="--c:${charColor(p.char)}">${vt}<small>${p.id === S.me.pairId ? 'YOU' : 'P' + p.no}</small></span>`;
  }).join(''));
  let step = '', sub = '';
  if (S.phase === 'crimson') { step = `${boss()} is moving the Crimson Host`; sub = 'Your move comes next.'; }
  else if (moving) {
    if (!options.length) { step = 'No road you can take'; sub = 'Not enough AP to move from here. Tap END MOVE.'; }
    else if (multi) {
      step = myVote == null ? 'Vote: tap a glowing stop' : myVote === 'stay' ? 'You voted to stay here' : `You voted for ${nodeName(myVote)}`;
      sub = band.voting ? `Most votes wins. The vote closes in <b data-until="${band.voteEnds}">${gameSecondsLeft(band.voteEnds)}</b>.` : 'Every pair votes. Your warband moves one stop at a time.';
    } else { step = 'Your move: tap a glowing stop'; sub = `One stop at a time. A ${'<span class="sw">⚔</span>'} stop starts a battle.`; }
  } else if (S.phase === 'crystal' && S.orderEnds && !S.me.orderDone) { step = 'Grab-Ma is here!'; sub = `Order food for your next battle. The Crimson turn starts in <b data-until="${S.orderEnds}">${gameSecondsLeft(S.orderEnds)}</b>, or when everyone is done.`; }
  else if (S.phase === 'crystal') { step = 'Move locked in'; sub = S.me.orderDone ? 'Waiting for the others.' : 'Order from Grab-Ma while the other banners finish moving.'; }
  else if (S.phase === 'battles') { step = 'Battles are being fought'; sub = 'The next turn starts when they end.'; }
  setHTML($('abStep'), esc(step)); setHTML($('abSub'), sub);
  setHTML($('abMp'), moving ? `<b>${band.mp}</b><small>AP LEFT</small>` : '');
  const end = $('endTurnBtn');
  end.classList.toggle('hidden', !moving);
  end.textContent = multi ? (myVote === 'stay' ? 'VOTED: STAY' : 'VOTE: STAY') : 'END MOVE';
  end.classList.toggle('voted', myVote === 'stay');
  // another banner on this stop: join them as a warband
  const other = S.bands.find((b) => b.id !== band.id && b.node === band.node && !b.battle);
  const join = $('abJoin');
  join.classList.toggle('hidden', !other || !!band.battle || S.phase === null);
  if (other) { join.dataset.band = other.id; join.textContent = `Join ${other.pairs.length > 1 ? 'that warband' : `Pair ${other.pairs[0].no}`}`; }
  $('leaveBandBtn').classList.toggle('hidden', !multi || !!band.battle);
}

function renderInfo(band, options) {
  const box = $('infoCard');
  if (!selected || S.own || S.myBattle) { box.classList.add('hidden'); return; }
  const optAt = (n) => options.find((o) => o.node === n);
  const voteBtn = (n, label, cls = 'cyan') => optAt(n) ? `<button class="btn ${cls}" data-vote="${n}">${label} · ${optAt(n).cost} AP</button>` : '';
  const close = '<button class="x-close" data-close="1" aria-label="Close">×</button>';
  let html = '', cls = 'panel info-card';
  if (selected.startsWith('host')) {
    const n = +selected.slice(4); const us = S.units.filter((u) => u.node === n);
    if (!us.length) { selected = null; box.classList.add('hidden'); return; }
    cls += ' red';
    const hp = us.reduce((a, u) => a + u.hp, 0), fighters = (band?.pairs.length || 1) * 2;
    const reach = (0.8 * 2 + 0.75 * 0.7 * Math.max(0, fighters - 1)) * battleLength('host');   // likely hits: your turn plus answering along
    const verdict = reach >= hp * 1.25 ? 'Your warband should win this.' : reach >= hp * 0.9 ? 'A close fight. One more pair would make it safer.' : 'Too strong for your warband. Bring more pairs.';
    html = `${close}<div class="eyebrow" style="color:var(--rose)">${us.length > 1 ? 'CRIMSON WARBAND' : 'CRIMSON UNIT'}</div><h3>${esc(nodeName(n))}</h3>
      ${us.map((u) => `<div class="row"><img src="${sprite(u.type)}" alt=""><div class="nm">${esc(UNITS[u.type].name)}<small>${esc(UNITS[u.type].role)}</small><div class="hpbar"><i style="width:${(u.hp / u.max) * 100}%"></i></div></div></div>`).join('')}
      <div class="preview">Strength ${Math.round(hp)}. ${verdict}</div><div class="actions">${voteBtn(n, 'Attack', 'crimson')}</div>`;
  } else if (selected.startsWith('camp')) {
    const n = +selected.slice(4), c = CAMPS[n], st = S.camps.find((x) => x.node === n);
    cls += ' teal';
    html = `${close}<div class="ic-head"><img src="${sprite(c.id)}" alt=""><div><div class="eyebrow" style="color:var(--cyan)">JUNGLE CAMP · ${esc(nodeName(n).toUpperCase())}</div><h3>${esc(c.name)}</h3></div></div>
      <p>${esc(c.lore)}</p><div class="kv"><b>CLASS BUFF</b>${esc(c.buffName)}: ${esc(c.buffText)}</div><div class="kv"><b>CHALLENGE</b>Best with 2 pairs or more</div>
      <div class="kv"><b>STATUS</b>${st.alive ? 'Waiting for challengers' : `Beaten. Returns on turn ${st.returnTurn}`}</div><div class="actions">${st.alive ? voteBtn(n, 'Challenge it') : ''}</div>`;
  } else if (selected === 'fortress') {
    cls += ' red';
    const g = S.gate, w = S.warlord;
    html = `${close}<div class="ic-head"><img src="${sprite(g.broken ? 'warlord' : 'golem')}" alt=""><div><div class="eyebrow" style="color:var(--rose)">CRIMSON FORTRESS</div><h3>${g.broken ? 'The Crimson Warlord' : 'The gate guardian'}</h3></div></div>
      <p>${g.broken ? (w.out ? 'The gate is broken and the Warlord has come out to fight. Beat him to win the war.' : 'The gate is broken. The Warlord waits inside and has not come out yet.') : 'The Bloodstone Golem guards the gate. Break it to reach the Warlord. Damage you deal stays, even if you have to fall back.'}</p>
      <div class="kv"><b>${g.broken ? 'WARLORD' : 'GATE'}</b>${g.broken ? `${w.hp} of ${w.max}` : `${g.hp} of ${g.max}`}</div><div class="hpbar"><i style="width:${g.broken ? (w.hp / w.max) * 100 : (g.hp / g.max) * 100}%"></i></div>
      ${g.defenders ? `<div class="kv"><b>DEFENDERS</b>${g.defenders} more Crimson units inside</div>` : ''}<div class="actions">${voteBtn(FORTRESS, g.broken ? 'Face the Warlord' : 'Attack the gate', 'crimson')}</div>`;
  } else if (selected === 'academy') {
    const w = S.ward, here = S.units.filter((u) => u.node === HOME);
    cls += ' teal';
    html = `${close}<div class="eyebrow" style="color:var(--cyan)">YOUR HOME · ${esc(nodeName(HOME).toUpperCase())}</div><h3>The Academy Ward</h3>
      <p>${esc(boss())} can attack your home too. If the Crimson Host stands on the Academy with no Crystal banner there to fight it, it batters the Ward every turn. If the Ward breaks, the Crimson Host wins the war. Keep an eye on home, and come back to drive them out.</p>
      <div class="kv"><b>WARD</b>${w.hp} of ${w.max}</div><div class="hpbar teal"><i style="width:${(w.hp / w.max) * 100}%"></i></div>
      ${here.length ? `<div class="kv" style="color:#ffb3bd"><b style="color:var(--rose)">UNDER ATTACK</b>${here.length} Crimson ${here.length === 1 ? 'unit is' : 'units are'} at the Academy</div>` : ''}<div class="actions">${voteBtn(HOME, here.length ? 'Drive them out' : 'Go home', here.length ? 'crimson' : 'cyan')}</div>`;
  } else if (selected.startsWith('band')) {
    const b = S.bands.find((x) => `band${x.id}` === selected);
    if (!b) { selected = null; box.classList.add('hidden'); return; }
    const canJoin = band && band.id !== b.id && band.node === b.node && !band.battle && !b.battle;
    html = `${close}<div class="eyebrow">${b.pairs.length > 1 ? 'CRYSTAL WARBAND' : 'CRYSTAL BANNER'} · ${esc(nodeName(b.node).toUpperCase())}</div>
      ${b.pairs.map((p) => `<div class="row" style="background:#0b161e;border-color:#d8bd8033"><img src="${portrait(p.char)}" alt="" style="object-fit:cover"><div class="nm">Pair ${p.no}<small>${esc(p.names.join(' & '))}</small></div></div>`).join('')}
      <div class="actions">${canJoin ? `<button class="btn primary" data-joinband="${b.id}">Join this warband</button>` : ''}</div>
      ${!canJoin && band && band.node !== b.node ? '<p>Move to the same stop to join them as a warband.</p>' : ''}`;
  }
  box.className = cls; setHTML(box, html); box.classList.remove('hidden');
}

function renderJoin() {
  const j = S.joinable?.[0];
  const box = $('joinPrompt');
  if (!j || S.own || S.myBattle) { box.classList.add('hidden'); return; }
  setHTML(box, `<span>A battle has started at <b>${esc(nodeName(j.node))}</b>! Your warband is close enough to help.</span><button class="btn crimson" data-battle="${j.id}">Join the fight · <span data-until="${j.gatherEnds}">${gameSecondsLeft(j.gatherEnds)}</span></button>`);
  box.classList.remove('hidden');
}

function renderQuestion() {
  const o = S.own;
  const dock = $('qDock');
  if (!o || S.myBattle) { dock.classList.add('hidden'); $('gMain').classList.remove('docked', 'centred'); dock.classList.remove('centre'); card.hide(); return; }
  // while the Crimson Host moves, the question sits in the middle (as in Academy Rift); during your move it docks beside the map
  const centre = S.phase !== 'crystal';
  dock.classList.remove('hidden'); dock.classList.toggle('centre', centre);
  $('gMain').classList.toggle('docked', !centre); $('gMain').classList.toggle('centred', centre);
  const battle = o.kind === 'warcry' ? S.battles.find((b) => b.id === o.battleId) : null;
  if (o.kind === 'muster') {
    const bank = S.me.bank, ap = 1 + Math.min(3, bank);
    const pips = Array.from({ length: 3 }, (_, i) => `<i class="${i < Math.min(3, bank) ? 'on' : ''}"></i>`).join('');
    const left = S.phase === 'crimson' ? `<b data-until="${S.phaseEndsAt}">${gameSecondsLeft(S.phaseEndsAt)}</b>s` : '';
    setHTML($('qdHead'), `<div class="eyebrow">PREPARE ${left ? `· YOUR MOVE IN ${left}` : ''}</div><div class="qd-title">Earn action points</div>
      <div class="qd-mp"><span class="pips">${pips}</span><span>Each right answer in your pair: <b>+1 AP</b>. Your next move: <b>${ap} AP</b>${bank >= 3 ? ' (the most)' : ''}</span></div>`);
  } else setHTML($('qdHead'), `<div class="eyebrow" style="color:var(--rose)">WAR CRY</div><div class="qd-title">Back the battle${battle ? ` at ${esc(nodeName(battle.node))}` : ''}</div><div class="qd-mp"><span>Every right answer hits the enemy there.</span></div>`);
  const footer = o.result ? (o.result.ok ? (o.kind === 'muster' ? 'Correct!' : 'Correct! Your War Cry strikes.') : o.result.chosen < 0 ? "Time's up." : 'Not quite.') : '';
  card.show({
    q: o.question, tag: o.kind === 'muster' ? 'PREPARE' : 'WAR CRY', thumb: S.me.char ? portrait(S.me.char) : null,
    note: o.retry ? '<b>↺ BACK AGAIN</b> You got this one wrong earlier. Read it carefully.' : '',
    result: o.result, footer, serverNow: S.serverNow, speed,
  });
}

function renderBattle() {
  const B = S.myBattle;
  if (arena.feed(S)) { $('battle').classList.add('hidden'); bcard.hide(); return; }    // the fight itself is on the Arena's battle screen
  if (!B) { $('battle').classList.add('hidden'); bcard.hide(); lastBattleId = null; if (cinema) { skipTheatre(); cinema = false; } return; }
  $('battle').classList.remove('hidden');
  const defend = B.kind === 'defend';
  const what = B.kind === 'camp' ? CAMPS[B.node].name : B.kind === 'gate' ? 'The gate guardian' : B.kind === 'boss' ? 'The Crimson Warlord' : defend ? 'The Crimson Host attacks!' : 'The Crimson Host';
  $('bEyebrow').textContent = `${defend ? 'DEFEND' : 'BATTLE'} · ${nodeName(B.node).toUpperCase()}${B.qNo ? ` · QUESTION ${B.qNo} OF ${B.limit}` : ''}`;
  $('bTitle').textContent = what;
  const pairs = B.bands.flatMap((b) => b.pairs);
  const turnPair = (B.choose || B.striker)?.pairNo ?? (B.round ? (B.round.stealer || B.round.striker)?.pairNo : null);
  setHTML($('bAllies'), pairs.map((p) => `<span class="ally ${p.no === S.me.pairNo ? 'me' : ''} ${p.no === turnPair ? 'striking' : ''}" title="Pair ${p.no}"><img src="${portrait(p.char)}" alt="" style="--c:${charColor(p.char)}"><small>${p.no === S.me.pairNo ? 'You' : `P${p.no}`}</small></span>`).join(''));
  const rmax = B.resolveMax || 1, r = B.resolveMax ? B.resolve : rmax;
  $('bResolveBar').style.width = `${Math.max(0, (r / rmax) * 100)}%`;
  $('bResolveBar').parentElement.classList.toggle('low', r / rmax < 0.34);
  $('bResolveTxt').textContent = B.resolveMax ? `${X(r)} / ${X(rmax)}` : '';
  $('bSyncBar').style.width = `${B.sync || 0}%`; $('bSyncBar').parentElement.classList.toggle('full', (B.sync || 0) >= 100);
  $('bSyncTxt').textContent = (B.sync || 0) >= 100 ? 'ULTIMATE READY' : `${B.sync || 0}%`;

  // the field between moves (the fighters waiting), and the Academy Rift theatre for every move
  const myChar = B.me?.char || S.me.char;
  if (lastBattleId !== B.id) {
    lastBattleId = B.id; lastRoundAt = 0; stage.skip(); skipTheatre(); cinema = false;
    stage.preload([myChar], B.enemies.map((e) => e.type));
    prepareBattle(B, [...new Set((B.party || []).map((f) => f.char).concat(myChar))]);
  }
  if (B.round && B.round.at !== lastRoundAt && (B.status === 'result' || B.status === 'over')) {
    lastRoundAt = B.round.at;
    if (hasTheatre()) {
      cinema = true; $('bTheatre').classList.remove('hidden'); $('battle').classList.add('cinema');
      playRound(B, B.round, myChar).catch(() => {}).finally(() => { cinema = false; $('bTheatre').classList.add('hidden'); $('battle').classList.remove('cinema'); render(); });
    } else stage.playRound(B.round);
  }
  if ((B.status === 'fight' || B.status === 'choose') && cinema) { skipTheatre(); }
  stage.set({ node: B.node, kind: B.kind, pairs: [{ key: `p${S.me.pairNo}`, char: myChar, label: 'You', me: true }], foes: B.enemies });
  setHTML($('bFoes'), B.enemies.map((e) => `<div class="foe ${e.hp <= 0 ? 'down' : ''}"><span>${esc(enemyName(e.type))}${e.dug ? ' <em>dug in</em>' : ''}</span><div class="hpbar"><i style="width:${Math.max(0, (e.hp / e.max) * 100)}%"></i></div><small>${X(Math.max(0, e.hp))} / ${X(e.max)}</small></div>`).join(''));

  let centre = '', role = '';
  const fighting = B.status === 'fight' && B.question;
  const choosing = B.status === 'choose';
  $('battle').classList.toggle('fighting', !!(fighting || choosing));
  if (B.status === 'gather') centre = `<span class="big">${defend ? 'To arms!' : 'Battle stations!'}</span>The battle starts in <b data-until="${B.gatherEnds}">${gameSecondsLeft(B.gatherEnds)}</b>. Warbands one road away can still join.`;
  if (B.status === 'over') centre = B.outcome === 'won'
    ? `<span class="big">Victory!</span>${B.kind === 'camp' ? `${esc(CAMPS[B.node].buffName)}: ${esc(CAMPS[B.node].buffText)}.` : B.kind === 'gate' ? 'The gate is broken!' : defend ? 'You drove off the attack.' : 'The way is clear.'}`
    : defend && B.resolve > 0 ? '<span class="big">You held!</span>The Crimson Host pulls back.' : `<span class="big">Driven back</span>${B.resolve <= 0 ? 'Your warband ran out of HP.' : 'The enemy held.'} You fall back to regroup. The damage you dealt stays.`;
  if (choosing && !B.moves) centre = `<span class="big">${esc(B.choose.name)}${B.choose.half ? ' stole the turn' : '\'s turn'}</span>${B.choose.bot ? 'The bot is' : 'They are'} picking a move…`;
  setHTML($('bCentre'), cinema ? '' : centre);
  if (fighting) {
    const s = B.striker;
    role = B.role === 'striker' ? '<b class="you-strike">YOUR TURN!</b> Answer right, then pick your move: Strike, a skill or your Ultimate.'
      : `It is <b>${esc(s?.name || '')}${s?.pairNo ? ` (Pair ${s.pairNo})` : ''}</b>'s turn. Answer along: right answers add hits, fill the Sync gauge, and steal the turn if they miss.`;
  }
  setHTML($('bRole'), role);
  if (fighting) {
    if (lastBattleQ !== B.question.startedAt) { lastBattleQ = B.question.startedAt; myPick = B.question.mine?.chosen ?? null; }
    $('bCardHost').classList.remove('hidden');
    bcard.show({ q: B.question, tag: B.role === 'striker' ? 'YOUR TURN' : 'ANSWER ALONG', sub: `Question ${B.qNo} of ${B.limit}`, thumb: myChar ? portrait(myChar) : null,
      picked: B.question.mine?.chosen ?? null, footer: B.question.mine ? 'Answer locked in. Waiting for the others…' : '', serverNow: S.serverNow, speed });
  } else { $('bCardHost').classList.add('hidden'); bcard.hide(); }
  renderMoves(B);
  // after each question: the answer, and what happened
  const rd = B.status === 'result' ? B.round : null;
  if (rd && !cinema) {
    const my = rd.my, right = rd.answer;
    const you = !my ? '' : my.ok ? '<span class="good">You were right!</span>' : my.chosen < 0 ? '<span class="bad">Time ran out.</span>' : '<span class="bad">Not this time.</span>';
    const act = rd.action ? `${esc((rd.stealer || rd.striker)?.name || '')} used <b>${esc(rd.action.name)}</b>${rd.note ? ` · ${esc(rd.note)}` : ''} · ` : '';
    setHTML($('bReveal'), `${you} The answer was <b>${'ABCD'[right]}. ${esc(rd.choices[right])}</b><br>${act}<b>${X(rd.hits)}</b> damage · the Crimson hit back for <b>${X(rd.counterTotal)}</b>`);
    $('bReveal').classList.remove('hidden');
  } else $('bReveal').classList.add('hidden');
}

// The move menu, as in the Arena: STRIKE, SKILLS, ULTIMATE and ITEMS, after a right answer on your turn
const KIND_TXT = { atk: 'Damage', heavy: 'Heavy damage', heal: 'Heals the warband', guard: 'Softens the next counterattack', buff: 'Hit 25% harder for 2 questions', debuff: 'Weakens the enemy', cleanse: 'Heals the warband' };
function renderMoves(B) {
  const box = $('bMoves'), m = B.status === 'choose' ? B.moves : null;
  if (!m || cinema) { box.classList.add('hidden'); movesOpen = null; return; }
  const key = `${B.id}:${B.choose.endsAt}`; if (key !== moveKey) { moveKey = key; movesOpen = null; }
  const c = CHAR_BY[m.char];
  const left = `<b data-until="${B.choose.endsAt}">${gameSecondsLeft(B.choose.endsAt)}</b>`;
  let html = `<div class="mv-head"><span class="mv-ok ${B.choose.half ? 'steal' : ''}">${B.choose.half ? '⚡ STOLEN · HALF DAMAGE' : '✓ CORRECT'}</span><span>Pick your move · ${left}s</span><span class="mv-sp">SP <b>${m.sp}</b>/${m.maxSp}</span></div>`;
  if (movesOpen === 'skills') {
    html += `<div class="mv-list">${m.skills.map((k) => `<button type="button" class="mv-skill" data-act="skill" data-i="${k.i}" ${k.ok ? '' : 'disabled'}><b>${esc(k.name)}</b><small>${k.cd > 0 ? `Ready in ${k.cd}` : `${k.sp} SP`} · ${KIND_TXT[k.kind] || ''}</small></button>`).join('')}</div><button type="button" class="mv-back" data-open="">← BACK</button>`;
  } else if (movesOpen === 'items') {
    html += `<div class="mv-list">${m.items.length ? m.items.map((it) => `<button type="button" class="mv-skill" data-act="item" data-item="${it.id}"><b>${esc(it.name)} ×${it.n}</b><small>${esc(it.desc)}</small></button>`).join('') : '<p class="mv-empty">Your bag is empty. Order from Auntie\'s delivery between battles.</p>'}</div><button type="button" class="mv-back" data-open="">← BACK</button>`;
  } else {
    const ready = m.skills.filter((k) => k.ok).length;
    html += `<div class="mv-row">
      <button type="button" class="mv-big strike" data-act="strike"><b>STRIKE</b><small>${esc(c?.element || '')} hit on the enemy</small></button>
      <button type="button" class="mv-big skills" data-open="skills"><b>SKILLS</b><small>${ready} of ${m.skills.length} ready</small></button>
      <button type="button" class="mv-big ult ${m.ult.ready ? 'ready' : ''}" data-act="ult" ${m.ult.ready ? '' : 'disabled'}><b>ULTIMATE</b><small>${esc(m.ult.name)}${m.ult.ready ? '' : ` · Sync ${B.sync}%`}</small></button>
      <button type="button" class="mv-big items" data-open="items"><b>ITEMS</b><small>${m.items.reduce((a, x) => a + x.n, 0)} in your bag</small></button></div>`;
  }
  setHTML(box, html); box.classList.remove('hidden');
}
$('bMoves').addEventListener('click', (e) => {
  const o = e.target.closest('[data-open]'); if (o) { movesOpen = o.dataset.open || null; render(); return; }
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const act = { kind: b.dataset.act }; if (b.dataset.i != null) act.index = +b.dataset.i; if (b.dataset.item) act.item = b.dataset.item;
  socket.emit('twAction', act); $('bMoves').classList.add('hidden');
});

function renderEnding() {
  const box = $('ending');
  if (S.status !== 'ended') { box.classList.add('hidden'); return; }
  const won = S.winner === 'crystal';
  const ward = S.endedBy === 'ward';
  setHTML(box, `<div class="eyebrow">${won ? 'VICTORY' : ward ? 'THE ACADEMY HAS FALLEN' : 'THE FORTRESS STANDS'}</div><h1>${won ? 'The Crimson Warlord has fallen' : ward ? 'The Academy Ward is broken' : 'The Crimson Host holds'}</h1>
    <p>${won ? `Your class broke the gate and beat ${esc(boss())}'s champion. Well fought, commanders.` : ward ? `${esc(boss())}'s army broke into the Crystal Academy. Next time, leave defenders at home.` : `${esc(boss())} held the fortress this time. Next time, march together sooner.`}</p>`);
  box.classList.remove('hidden');
}

// clocks
setInterval(() => {
  if (!S || S.status !== 'playing') return;
  $('phaseClock').textContent = mmss(gameSecondsLeft(S.phaseEndsAt));
  document.querySelectorAll('[data-until]').forEach((el) => { el.textContent = gameSecondsLeft(+el.dataset.until); });
  const band = myBand();
}, 250);

// ------------------------------------------------------------------ how to play (shown once, and from the ? button)
const HELP = [
  { art: "url(art/keyart.webp)", t: 'Your mission', p: () => [`Break into the <b>Crimson Fortress</b> and defeat ${esc(boss())}'s Warlord.`, `${esc(boss())} commands the Crimson Host against you. Keep the <b>Academy Ward</b> at your home safe too.`] },
  { art: "url(monsters/orc_warchanter.png)", t: 'Turn by turn', p: () => [`First you <b>prepare</b> for 30 seconds while ${esc(boss())} moves the Crimson Host: answer questions to earn action points.`, 'Each right answer in your pair is <b>+1 action point (AP)</b>. Then it is your move: spend your AP to march.'] },
  { art: "url(portraits/S.webp)", t: 'Moving', p: () => ['On your move, <b>tap a glowing stop</b> to march there, one stop at a time. Each road costs AP.', 'Pairs on the same stop can join into a <b>warband</b> and vote on where to go. A <b>⚔</b> stop starts a battle.'] },
  { art: "url(monsters/golem.png)", t: 'Battles', p: () => ['Battles work like Academy Rift: each question is one student\'s <b>turn</b>, and everyone else <b>answers along</b>. A wrong answer can be <b>stolen</b>.', 'Right answers attack the enemy and block its counterattack. Work together and the Crimson falls.'] },
];
let helpAt = 0;
function showHelp(at = 0) {
  helpAt = at; const h = HELP[at];
  setHTML($('helpSlides'), `<div class="help-slide"><div class="hs-art" style="background-image:${h.art}"></div><div><h3>${h.t}</h3>${h.p().map((x) => `<p>${x}</p>`).join('')}</div></div>`);
  setHTML($('helpDots'), HELP.map((_, i) => `<i class="${i === at ? 'on' : ''}"></i>`).join(''));
  $('helpNext').textContent = at === HELP.length - 1 ? "LET'S GO" : 'NEXT';
  $('help').classList.remove('hidden');
}
$('helpNext').addEventListener('click', () => { if (helpAt < HELP.length - 1) showHelp(helpAt + 1); else { $('help').classList.add('hidden'); try { localStorage.setItem('tw.helpSeen', '1'); } catch {} } });
$('helpBtn').addEventListener('click', () => showHelp(0));
let helpChecked = false;
function maybeHelp() {
  if (helpChecked || !S || S.status !== 'playing') return;
  helpChecked = true;
  let seen = false; try { seen = !!localStorage.getItem('tw.helpSeen'); } catch {}
  if (!seen) showHelp(0);
}

// ------------------------------------------------------------------ Grab-Ma Food: the shop as a delivery app on a phone
// Orders go in during the class's move, once your banner has locked in its move; Grab-Ma then rides out on the map.
const canOrder = () => { const b = myBand(); return !!(S && S.status === 'playing' && S.phase === 'crystal' && b && b.done && !b.battle && !S.myBattle && !S.me.orderDone && !S.me.ordered); };
if (params.has('debug')) window.twState = () => S;
const phone = createPhone({ socket, host: $('phoneHost'), getS: () => S, toast, canOrder, now });
function renderShop() {
  if (!S?.me) return;
  $('coinTxt').textContent = S.me.coins || 0;
  const r = (S.riders || []).find((x) => x.pid === S.me.pid && x.status !== 'delivered');
  $('coinChip').classList.toggle('busy', !!r);
  phone.update();
}
$('coinChip').addEventListener('click', () => phone.open());
$('abAuntie').addEventListener('click', () => phone.open((S.riders || []).some((x) => x.pid === S.me.pid && x.status !== 'delivered') ? 'track' : 'shop'));
function maybeAuntie() {
  const r = (S.riders || []).find((x) => x.pid === S.me.pid && x.status !== 'delivered');
  const b = $('abAuntie');
  b.classList.toggle('hidden', !canOrder() && !r);
  setHTML(b, r ? '<i></i>TRACK ORDER' : '<i></i>ORDER GRAB-MA');
}
