// Total War: the student iPad. Draws what the server sends; every decision is made on the server.
import { createMap, stepOptions, roadPoints, portrait, sprite, charColor, esc, setHTML } from './map.js';
import { createCard } from './card.js';
import { NODES } from './movement.js';
import { CAMPS, UNITS, FORTRESS, HOME, battleLength } from './rules.js';
import { BANNERS, bannerFor } from './banners.js';
import { createStage, enemyName } from './stage.js';

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
  onBanner: (kind, ref, node) => { selected = kind === 'pair' ? `band${ref}` : kind === 'host' ? `host${node}` : kind === 'camp' ? `camp${node}` : kind === 'academy' ? 'academy' : 'fortress'; if (kind === 'pair' && ref === S?.me.bandId) selected = null; render(); },
});
const card = createCard($('card'), { onPick: (i, startedAt) => socket.emit('twAnswer', { chosen: i, startedAt }) });
const bcard = createCard($('bCard'), { onPick: (i, startedAt) => { myPick = i; socket.emit('twAnswer', { chosen: i, startedAt }); } });
const stage = createStage($('bStage'), { mode: 'pair' });
let lastRoundAt = 0, lastBattleId = null;

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
  if (S.units.some((u) => u.node === HOME && !u.battle)) ribbon = `The Crimson Host is at the Academy! Drive them out before the Ward breaks (${S.ward.hp} of ${S.ward.max} left).`;
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
  if (!B) { $('battle').classList.add('hidden'); bcard.hide(); lastBattleId = null; return; }
  $('battle').classList.remove('hidden');
  const defend = B.kind === 'defend';
  const what = B.kind === 'camp' ? CAMPS[B.node].name : B.kind === 'gate' ? 'The gate guardian' : B.kind === 'boss' ? 'The Crimson Warlord' : defend ? 'The Crimson Host attacks!' : 'The Crimson Host';
  $('bEyebrow').textContent = `${defend ? 'DEFEND' : 'BATTLE'} · ${nodeName(B.node).toUpperCase()}${B.qNo ? ` · QUESTION ${B.qNo} OF ${B.limit}` : ''}`;
  $('bTitle').textContent = what;
  const pairs = B.bands.flatMap((b) => b.pairs);
  const strikerPair = B.status === 'fight' ? B.striker?.pairNo : B.round ? (B.round.stealer || B.round.striker)?.pairNo : null;
  setHTML($('bAllies'), pairs.map((p) => `<span class="ally ${p.no === S.me.pairNo ? 'me' : ''} ${p.no === strikerPair ? 'striking' : ''}" title="Pair ${p.no}"><img src="${portrait(p.char)}" alt="" style="--c:${charColor(p.char)}"><small>${p.no === S.me.pairNo ? 'You' : `P${p.no}`}</small></span>`).join(''));
  const rmax = B.resolveMax || 1, r = B.resolveMax ? B.resolve : rmax;
  $('bResolveBar').style.width = `${Math.max(0, (r / rmax) * 100)}%`;
  $('bResolveBar').parentElement.classList.toggle('low', r / rmax < 0.34);
  $('bResolveTxt').textContent = B.resolveMax ? `${Math.ceil(r)} / ${rmax}` : '';

  // the stage: my pair's fighter against the enemy
  if (lastBattleId !== B.id) { lastBattleId = B.id; lastRoundAt = 0; stage.skip(); stage.preload(pairs.map((p) => p.char), B.enemies.map((e) => e.type)); }
  if (B.round && B.round.at !== lastRoundAt && (B.status === 'result' || B.status === 'over')) { lastRoundAt = B.round.at; stage.playRound(B.round); }
  if (B.status === 'fight' && stage.busy) stage.skip();
  stage.set({ node: B.node, kind: B.kind, pairs: [{ key: `p${S.me.pairNo}`, char: S.me.char, label: 'You', me: true }], foes: B.enemies });
  setHTML($('bFoes'), B.enemies.map((e) => `<div class="foe ${e.hp <= 0 ? 'down' : ''}"><span>${esc(enemyName(e.type))}${e.dug ? ' <em>dug in</em>' : ''}</span><div class="hpbar"><i style="width:${Math.max(0, (e.hp / e.max) * 100)}%"></i></div></div>`).join(''));

  let centre = '', role = '';
  const fighting = B.status === 'fight' && B.question;
  $('battle').classList.toggle('fighting', !!fighting);
  if (B.status === 'gather') centre = `<span class="big">${defend ? 'To arms!' : 'Battle stations!'}</span>The battle starts in <b data-until="${B.gatherEnds}">${gameSecondsLeft(B.gatherEnds)}</b>. Warbands one road away can still join.`;
  if (B.status === 'over') centre = B.outcome === 'won'
    ? `<span class="big">Victory!</span>${B.kind === 'camp' ? `${esc(CAMPS[B.node].buffName)}: ${esc(CAMPS[B.node].buffText)}.` : B.kind === 'gate' ? 'The gate is broken!' : defend ? 'You drove off the attack.' : 'The way is clear.'}`
    : defend && B.resolve > 0 ? '<span class="big">You held!</span>The Crimson Host pulls back.' : `<span class="big">Driven back</span>${B.resolve <= 0 ? 'Your warband\'s Resolve ran out.' : 'The enemy held.'} You fall back to regroup. The damage you dealt stays.`;
  setHTML($('bCentre'), centre);
  if (fighting) {
    const s = B.striker;
    role = B.role === 'striker' ? '<b class="you-strike">You are the Striker!</b> Your right answer strikes the enemy. Your warband answers along with you.'
      : `<b>${esc(s?.name || '')}${s?.pairNo ? ` (Pair ${s.pairNo})` : ''}</b> is the Striker. Answer too: right answers add hits, shield the warband, and can steal the strike if the Striker misses.`;
  }
  setHTML($('bRole'), role);
  if (fighting) {
    if (lastBattleQ !== B.question.startedAt) { lastBattleQ = B.question.startedAt; myPick = B.question.mine?.chosen ?? null; }
    $('bCardHost').classList.remove('hidden');
    bcard.show({ q: B.question, tag: B.role === 'striker' ? 'STRIKE' : 'SUPPORT', sub: `Question ${B.qNo} of ${B.limit}`, thumb: S.me.char ? portrait(S.me.char) : null,
      picked: B.question.mine?.chosen ?? null, footer: B.question.mine ? 'Answer locked in. Waiting for the others…' : '', serverNow: S.serverNow, speed });
  } else { $('bCardHost').classList.add('hidden'); bcard.hide(); }
  // after each question: the answer, and how you did
  const rd = B.status === 'result' ? B.round : null;
  if (rd) {
    const my = rd.my, right = rd.answer;
    const you = !my ? '' : my.ok ? '<span class="good">You were right!</span>' : my.chosen < 0 ? '<span class="bad">Time ran out.</span>' : '<span class="bad">Not this time.</span>';
    setHTML($('bReveal'), `${you} The answer was <b>${'ABCD'[right]}. ${esc(rd.choices[right])}</b> · <b>${rd.hits}</b> ${rd.hits === 1 ? 'hit' : 'hits'} · the Crimson hit back for <b>${Math.round(rd.counterTotal * 10) / 10}</b>`);
    $('bReveal').classList.remove('hidden');
  } else $('bReveal').classList.add('hidden');
}

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
  if (band?.voting && band.pairs.length > 1) $('bpVote').textContent = `The vote closes in ${gameSecondsLeft(band.voteEnds)}. Most votes wins.`;
}, 250);
