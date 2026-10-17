// Total War: the student iPad. Draws what the server sends; every decision is made on the server.
import { createMap, stepOptions, roadPoints, portrait, sprite, charColor, esc, setHTML } from './map.js';
import { createCard } from './card.js';
import { NODES } from './movement.js';
import { CAMPS, UNITS, FORTRESS, battleLength } from './rules.js';
import { BANNERS, bannerFor } from './banners.js';

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
$('joinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  socket.emit('twJoin', { code: $('joinCode').value.trim().toUpperCase(), name: $('joinName').value.trim() });
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

// ------------------------------------------------------------------ lobby
function renderLobby() {
  show('lobby');
  $('lobbyCode').textContent = `WAR ${S.code}`;
  const myPair = S.lobby.pairs.find((p) => p.id === S.me.pairId);
  $('pairBox').classList.toggle('hidden', !myPair);
  $('partnerList').classList.toggle('hidden', !!myPair);
  if (myPair) {
    $('lobbyTitle').textContent = myPair.names.length > 1 ? 'You are a pair' : 'You march alone';
    $('pairNames').textContent = myPair.names.join(' & ');
    $('lobbySub').textContent = 'Now choose the standard your banner will carry.';
  } else {
    $('lobbyTitle').textContent = 'Find your partner';
    $('lobbySub').textContent = "Tap your partner's name. You will march together on one banner.";
    const free = S.lobby.students.filter((s) => !s.pairId && s.pid !== S.me.pid);
    setHTML($('partnerList'), free.map((s) => `<button type="button" data-pid="${s.pid}">${esc(s.name)}</button>`).join('')
      + '<button type="button" class="solo" data-solo="1">No partner: march alone</button>');
  }
  setHTML($('standards'), BANNERS.map((b) => `<button type="button" data-char="${b.id}" class="${myPair?.char === b.id ? 'on' : ''}">
    <span class="flag" style="--c:${b.color}"><img src="${b.portrait}" alt=""></span><b>${esc(b.name)}</b><small>${esc(b.element)}</small></button>`).join(''));
  $('lobbyWait').textContent = myPair?.char ? `Ready. ${boss()} will start the war soon.` : `${boss()} will start the war soon.`;
}
$('partnerList').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.solo) socket.emit('twStandard', { char: BANNERS[Math.floor(Math.random() * BANNERS.length)].id });
  else socket.emit('twPartner', { pid: b.dataset.pid });
});
$('leavePair').addEventListener('click', () => socket.emit('twLeavePair'));
$('standards').addEventListener('click', (e) => { const b = e.target.closest('[data-char]'); if (b) socket.emit('twStandard', { char: b.dataset.char }); });

// ------------------------------------------------------------------ the map
const map = createMap($('mapHost'), {
  onStop: (n) => { selected = null; socket.emit('twVote', { to: n }); },
  onBanner: (kind, ref, node) => { selected = kind === 'pair' ? `band${ref}` : kind === 'host' ? `host${node}` : kind === 'camp' ? `camp${node}` : 'fortress'; if (kind === 'pair' && ref === S?.me.bandId) selected = null; render(); },
});
const card = createCard($('card'), { onPick: (i, startedAt) => socket.emit('twAnswer', { chosen: i, startedAt }) });
const bcard = createCard($('bCard'), { onPick: (i, startedAt) => { myPick = i; socket.emit('twAnswer', { chosen: i, startedAt }); } });

$('holdBtn').addEventListener('click', () => socket.emit('twVote', { to: 'stay' }));
$('endTurnBtn').addEventListener('click', () => socket.emit('twVote', { to: 'stay' }));
$('leaveBandBtn').addEventListener('click', () => socket.emit('twLeaveBand'));
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
  map.render({ state: S, mine: band?.id, options, votes, selected, route: band && typeof myVote === 'number' ? roadPoints(band.node, myVote) : null });

  // ribbon
  let ribbon = '';
  if (phase === 'crimson') ribbon = `${boss()} is moving the Crimson Host. Answer muster questions to earn MP for your next move.`;
  else if (phase === 'crystal' && band && !band.done && !band.battle) ribbon = band.pairs.length > 1 ? 'Vote for your warband\'s next stop. It moves one stop at a time.' : 'Tap a glowing stop to move there. One stop at a time.';
  else if (phase === 'crystal' && band?.done) ribbon = 'Your banner has finished moving this turn.';
  else if (phase === 'battles') ribbon = 'Battles are being fought. The next turn starts when they end.';
  $('ribbon').textContent = S.own ? '' : ribbon;

  renderBandPanel(band);
  renderInfo(band, options);
  renderJoin();
  renderQuestion();
  renderBattle();
  renderEnding();
}

function renderBandPanel(band) {
  $('bandPanel').classList.toggle('hidden', !band || !!S.own || !!S.myBattle);
  $('endTurnWrap').classList.toggle('hidden', !(band && S.phase === 'crystal' && !band.done && !band.battle && !S.own));
  if (!band) return;
  $('bpWhere').textContent = `${band.pairs.length > 1 ? 'YOUR WARBAND' : 'YOUR BANNER'} · ${nodeName(band.node).toUpperCase()}`;
  $('bpTitle').textContent = band.pairs.length > 1 ? `A warband of ${band.pairs.length} pairs` : `Pair ${S.me.pairNo}`;
  $('bpMp').textContent = S.phase === 'crystal' ? band.mp : '–';
  setHTML($('bpPairs'), band.pairs.map((p, i) => {
    const vt = band.done ? '' : p.vote === null ? '<span class="vt wait">Choosing…</span>' : `<span class="vt">${p.vote === 'stay' ? 'Hold here' : '→ ' + esc(nodeName(p.vote))}</span>`;
    return `<div class="bp-pair"><img src="${portrait(p.char)}" alt="" style="--c:${charColor(p.char)}"><span class="nm">Pair ${p.no} · ${esc(p.names.join(' & '))}${p.id === S.me.pairId ? ' (you)' : ''}${i === 0 && band.pairs.length > 1 ? ' · leads ties' : ''}</span>${S.phase === 'crystal' ? vt : ''}</div>`;
  }).join(''));
  const moving = S.phase === 'crystal' && !band.done && !band.battle;
  $('bpVote').textContent = moving && band.pairs.length > 1 ? (band.voting ? `The vote closes in ${gameSecondsLeft(band.voteEnds)}. Most votes wins.` : 'Every pair votes. Most votes wins, and the warband moves one stop.') : band.done && S.phase === 'crystal' ? 'Finished moving this turn.' : '';
  $('holdBtn').disabled = !moving;
  $('leaveBandBtn').classList.toggle('hidden', band.pairs.length < 2 || !!band.battle);
  $('endTurnNote').textContent = band.mp > 0 ? `You still have ${band.mp} MP` : 'No MP left';
}

function renderInfo(band, options) {
  const box = $('infoCard');
  if (!selected || S.own || S.myBattle) { box.classList.add('hidden'); return; }
  const optAt = (n) => options.find((o) => o.node === n);
  const voteBtn = (n, label, cls = 'cyan') => optAt(n) ? `<button class="btn ${cls}" data-vote="${n}">${label} · ${optAt(n).cost} MP</button>` : '';
  const close = '<button class="x-close" data-close="1" aria-label="Close">×</button>';
  let html = '', cls = 'panel info-card';
  if (selected.startsWith('host')) {
    const n = +selected.slice(4); const us = S.units.filter((u) => u.node === n);
    if (!us.length) { selected = null; box.classList.add('hidden'); return; }
    cls += ' red';
    const hp = us.reduce((a, u) => a + u.hp, 0), fighters = (band?.pairs.length || 1) * 2;
    const reach = fighters * 0.7 * battleLength('host');
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
  if (!o || S.myBattle) { $('qWrap').classList.add('hidden'); card.hide(); return; }
  $('qWrap').classList.remove('hidden');
  const battle = o.kind === 'warcry' ? S.battles.find((b) => b.id === o.battleId) : null;
  const footer = o.result
    ? (o.result.ok ? (o.kind === 'muster' ? 'Correct! Every 2 right answers in your pair give +1 MP.' : 'Correct! Your War Cry strikes the enemy.') : o.result.chosen < 0 ? "Time's up." : 'Not quite.')
    : o.kind === 'muster' ? `Every 2 right answers in your pair give +1 MP for your next move (up to +2). Your pair has ${S.me.bank} right so far: +${Math.min(2, Math.floor(S.me.bank / 2))} MP.` : `Each right answer sends a War Cry to the battle${battle ? ` at ${nodeName(battle.node)}` : ''}.`;
  card.show({
    q: o.question, tag: o.kind === 'muster' ? 'MUSTER' : 'WAR CRY', thumb: S.me.char ? portrait(S.me.char) : null,
    sub: o.kind === 'warcry' && battle ? `Backing the battle at ${nodeName(battle.node)}` : '',
    note: o.retry ? '<b>↺ BACK AGAIN</b> You got this one wrong earlier. Read it carefully.' : '',
    result: o.result, footer, serverNow: S.serverNow, speed,
  });
}

function renderBattle() {
  const B = S.myBattle;
  if (!B) { $('battle').classList.add('hidden'); bcard.hide(); return; }
  $('battle').classList.remove('hidden');
  const what = B.kind === 'camp' ? CAMPS[B.node].name : B.kind === 'gate' ? 'The gate guardian' : B.kind === 'boss' ? 'The Crimson Warlord' : 'The Crimson Host';
  $('bEyebrow').textContent = `BATTLE · ${nodeName(B.node).toUpperCase()}${B.qNo ? ` · QUESTION ${B.qNo} OF ${B.limit}` : ''}`;
  $('bTitle').textContent = what;
  setHTML($('bEnemies'), B.enemies.map((e) => {
    const name = UNITS[e.type]?.name || Object.values(CAMPS).find((c) => c.id === e.type)?.name || e.type;
    return `<div class="b-enemy ${e.hp <= 0 ? 'down' : ''}"><img src="${sprite(e.type)}" alt=""><b>${esc(name)}</b><div class="hpbar"><i style="width:${Math.max(0, (e.hp / e.max) * 100)}%"></i></div><small>${Math.ceil(e.hp)} / ${e.max}</small></div>`;
  }).join(''));
  const cheers = B.cheers.filter((c) => c.pair).map((c) => `Pair ${c.pair} ×${c.n}`).join(', ');
  setHTML($('bCrystal'), `<div class="eyebrow">YOUR SIDE</div>` + B.bands.flatMap((b) => b.pairs).map((p) => `<div class="s-pair"><img src="${portrait(p.char)}" alt="" style="--c:${charColor(p.char)}">Pair ${p.no} · ${esc(p.names.join(' & '))}</div>`).join('') + (cheers ? `<div class="cheer">War Cries: ${esc(cheers)}</div>` : ''));
  let centre = '', status = '';
  if (B.status === 'gather') { centre = `<span class="big">Battle stations!</span>The battle starts in <b data-until="${B.gatherEnds}">${gameSecondsLeft(B.gatherEnds)}</b>. Warbands one road away can still join.`; status = 'Gathering'; }
  if (B.status === 'fight') status = `${B.answered} of ${B.fighters} have answered`;
  if (B.status === 'result' && B.lastHits) {
    const h = B.lastHits, mine = myPick, right = h.answer;
    const you = mine == null ? '' : mine === right ? 'You were right! ' : 'You were not right this time. ';
    centre = `<span class="big">${h.hits} ${h.hits === 1 ? 'hit' : 'hits'}!</span>${you}${h.right} right ${h.right === 1 ? 'answer' : 'answers'}${h.warcry ? ` and ${h.warcry} War ${h.warcry === 1 ? 'Cry' : 'Cries'}` : ''}. The answer was <b>${'ABCD'[right]}. ${esc(h.choices[right])}</b>${h.fallen ? `<br>${h.fallen} ${h.fallen === 1 ? 'enemy falls' : 'enemies fall'}!` : ''}`;
  }
  if (B.status === 'over') centre = B.outcome === 'won' ? `<span class="big">Victory!</span>${B.kind === 'camp' ? `${esc(CAMPS[B.node].buffName)}: ${esc(CAMPS[B.node].buffText)}.` : B.kind === 'gate' ? 'The gate is broken!' : 'The way is clear.'}` : `<span class="big">Driven back</span>The enemy held. Your warband falls back to regroup. The damage you dealt stays.`;
  setHTML($('bCentre'), centre); $('bStatus').textContent = status;
  if (B.status === 'fight' && B.question) {
    if (lastBattleQ !== B.question.startedAt) { lastBattleQ = B.question.startedAt; myPick = B.question.mine?.chosen ?? null; }
    $('bCardHost').classList.remove('hidden');
    bcard.show({ q: B.question, tag: 'BATTLE', sub: `Question ${B.qNo} of ${B.limit}`, thumb: S.me.char ? portrait(S.me.char) : null,
      picked: B.question.mine?.chosen ?? null, footer: B.question.mine ? 'Answer locked in. Waiting for the others…' : 'Every right answer hits the enemy.', serverNow: S.serverNow, speed });
  } else { $('bCardHost').classList.add('hidden'); bcard.hide(); }
}

function renderEnding() {
  const box = $('ending');
  if (S.status !== 'ended') { box.classList.add('hidden'); return; }
  const won = S.winner === 'crystal';
  setHTML(box, `<div class="eyebrow">${won ? 'VICTORY' : 'THE FORTRESS STANDS'}</div><h1>${won ? 'The Crimson Warlord has fallen' : 'The Crimson Host holds'}</h1>
    <p>${won ? `Your class broke the gate and beat ${esc(boss())}'s champion. Well fought, commanders.` : `${esc(boss())} held the fortress this time. Next time, march together sooner.`}</p>`);
  box.classList.remove('hidden');
}

// clocks
setInterval(() => {
  if (!S || S.status !== 'playing') return;
  $('phaseClock').textContent = mmss(gameSecondsLeft(S.phaseEndsAt));
  document.querySelectorAll('[data-until]').forEach((el) => { el.textContent = gameSecondsLeft(+el.dataset.until); });
  const band = myBand();
  if (band?.voting && band.pairs.length > 1) $('bpVote').textContent = `The vote closes in ${gameSecondsLeft(band.voteEnds)}. Most votes wins.`;
}, 250);
