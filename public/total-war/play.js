// Total War: the student iPad. Draws what the server sends; every decision is made on the server.
import { createMap, stepOptions, roadPoints, portrait, sprite, charColor, esc, setHTML } from './map.js';
import { createCard } from './card.js';
import { NODES } from './movement.js';
import { CAMPS, UNITS, FORTRESS, HOME, OUTPOSTS, WATCHTOWER, battleLength, neighbours, cost as roadCost, hops, showHp } from './rules.js';
import { routePoints } from './movement.js';
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
const boss = () => S?.commander || (helpThen ? 'The Bot Commander' : 'Your teacher');
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
  // a first practice war starts with the coached first turn (it can be skipped at any time)
  const go = () => socket.emit('twPractice', { name, char: BANNERS[Math.floor(Math.random() * BANNERS.length)].id, tutorial: !tutorialSeen() });
  // how to play comes first, so it never covers a timed question
  // the coached first turn replaces the How to play slides; after it, the slides still come first once
  if (!helpSeen() && tutorialSeen()) { helpThen = go; showHelp(0); } else go();
});
socket.on('connect', () => {
  const saved = JSON.parse(localStorage.getItem(SAVE) || 'null');
  if (saved?.token) socket.emit('twRejoin', saved);
});
socket.on('twMe', (m) => { me = m; localStorage.setItem(SAVE, JSON.stringify({ code: m.code, token: m.token })); });
socket.on('twGone', () => { localStorage.removeItem(SAVE); show('join'); });
socket.on('twError', (m) => toast(m));
socket.on('twState', (v) => { S = v; offset = v.serverNow - Date.now(); speed = v.speed || 1; if (v.status === 'ended') localStorage.removeItem(SAVE); render(); });

function show(id) { for (const s of ['join', 'lobby', 'game']) $(s).classList.toggle('hidden', s !== id); }
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 3200); }

// ------------------------------------------------------------------ lobby (as in the class tournament)
// what each fighter is good at, in plain words (the role names are game jargon)
const ROLE_PLAIN = { Attacker: 'strong hits', Control: 'slows enemies down', Burst: 'big bursts of damage', Evasion: 'hard to hit', Healer: 'heals the team', Curse: 'weakens enemies', Tank: 'takes hits for the team', Disruption: 'weakens enemies', Sustain: 'keeps the team going', Heavy: 'slow, heavy hits' };
const cardArt = (id) => `../assets/Character Card/${id}.webp`;
const cardThumb = (id) => `../assets/Character Card/thumb/${id}.webp`;     // small picker images (about 20 KB each)
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
  setHTML($('standardCard'), b ? `<img class="std-art" src="${cardArt(b.id)}" alt=""><div class="std-info"><div class="std-name">${esc(b.fullName)}</div><div class="std-el" style="--c:${b.color}">${esc(b.element)} · ${esc(ROLE_PLAIN[b.role] || b.role)}</div><p>${esc(b.name)} leads your pair across the map.</p><button class="ghost-btn" type="button" data-open="std">CHANGE FIGHTER</button></div>`
    : `<div class="std-empty">?</div><div class="std-info"><div class="std-name">NOT CHOSEN YET</div><p>If you do not pick, you get a random fighter.</p><button class="ghost-btn" type="button" data-open="std">CHOOSE FIGHTER</button></div>`);
  setHTML($('standards'), BANNERS.map((x) => `<button type="button" data-char="${x.id}" class="${char === x.id ? 'on' : ''}" style="--c:${x.color}"><img src="${cardThumb(x.id)}" alt=""><b>${esc(x.name)}</b><small>${esc(x.element)}</small></button>`).join(''));
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
  onStop: (n) => { selected = null; planTap(n); },
  onBanner: (kind, ref, node) => { selected = kind === 'pair' ? `band${ref}` : kind === 'host' ? `host${node}` : kind === 'camp' ? `camp${node}` : kind === 'academy' ? 'academy' : kind === 'tower' ? 'tower' : kind === 'seen' ? `seen${ref}` : kind === 'fortress' ? 'fortress' : null; if (kind === 'pair' && ref === S?.me.bandId) selected = null; render(); },
});
// the map keeps its bottom row of stops clear of the bar along the bottom, however tall the bar is
new ResizeObserver(() => { const h = $('actBar').offsetHeight; map.setBottom(h ? h + 20 : 0); }).observe($('actBar'));
const card = createCard($('card'), { onPick: (i, startedAt) => socket.emit('twAnswer', { chosen: i, startedAt }) });
const bcard = createCard($('bCard'), { onPick: (i, startedAt) => { myPick = i; socket.emit('twAnswer', { chosen: i, startedAt }); } });
const stage = createStage($('bStage'), { mode: 'pair' });
let lastRoundAt = 0, lastBattleId = null, cinema = false, movesOpen = null, moveKey = '';
initTheatre($('bTheatre'));
const arena = createArenaBridge({ socket, host: $('arenaHost') });
// the last cinematic of a battle finishes in the Arena before the war page shows how it ended
setInterval(() => { if (S?.myBattle?.status === 'over' && arena.open && !arena.busy()) render(); }, 400);
const CHAR_BY = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));
const X = (v) => showHp(v);                  // one HP scale on every screen: a pair's 10 HP shows as 100, a strike as 20

$('endTurnBtn').addEventListener('click', (e) => {
  const a = e.currentTarget.dataset.act;
  if (a === 'propose' && draft?.length > 1) socket.emit('twRoute', { route: draft });
  else if (a === 'hold') { draft = null; socket.emit('twRoute', { hold: true }); }
  else if (a === 'support') socket.emit('twSupport', { battleId: e.currentTarget.dataset.battle });
  else if (a === 'resume') socket.emit('twResume', { go: true });
  render();
});
$('abHold').addEventListener('click', () => { draft = null; if (myBand()?.status === 'resume') socket.emit('twResume', { go: false }); else socket.emit('twRoute', { hold: true }); render(); });
$('abSub').addEventListener('click', (e) => { const b = e.target.closest('[data-agree]'); if (b) { draft = null; socket.emit('twAgree', { pairId: b.dataset.agree }); } });
$('leaveBandBtn').addEventListener('click', () => socket.emit('twLeaveBand'));
$('abJoin').addEventListener('click', (e) => { const id = e.currentTarget.dataset.band; if (id) socket.emit('twJoinBand', { bandId: id }); });
$('infoCard').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.close) { selected = null; render(); }
  if (b.dataset.vote) { planTap(+b.dataset.vote); selected = null; render(); }
  if (b.dataset.joinband) { socket.emit('twJoinBand', { bandId: b.dataset.joinband }); selected = null; }
});
$('bFoes').addEventListener('click', (e) => { const b = e.target.closest('[data-target]'); if (b) socket.emit('twTarget', { index: +b.dataset.target }); });
$('joinPrompt').addEventListener('click', (e) => { const b = e.target.closest('[data-battle]'); if (b) socket.emit('twJoinBattle', { battleId: b.dataset.battle }); });

function render() {
  if (!S) return;
  if (S.status === 'lobby') { renderLobby(); maybeHelp(); return; }
  show('game');
  const band = myBand();
  // top bar: the main line says, in plain words, what to do now
  const phase = S.phase;
  const stageName = phase === 'crimson' ? 'ENEMY TURN' : phase === 'crystal' ? (S.stage === 'quiz' ? 'QUESTIONS' : S.stage === 'council' ? 'WAR COUNCIL' : 'MARCHING') : 'BATTLES';
  $('phaseEyebrow').textContent = S.status === 'ended' ? 'THE WAR IS OVER' : `TURN ${S.turn} OF ${S.turns} · ${stageName}${S.training ? ' · NO TIMERS' : ''}`;
  $('phaseTitle').textContent = headline(band);
  $('phaseClock').classList.toggle('red', phase === 'crimson');
  clockOn = showClock();
  $('phaseClock').classList.toggle('hidden', !clockOn);
  if (clockOn) $('phaseClock').textContent = mmss(gameSecondsLeft(S.phaseEndsAt));
  $('enemyName').textContent = `${boss()}, Crimson Commander`;
  setHTML($('buffs'), S.buffs.map((b) => { const c = Object.values(CAMPS).find((x) => x.buff === b.key); return c ? `<span class="buff">${esc(c.buffName)}: ${esc(c.buffText)} · ${b.left} turn${b.left === 1 ? '' : 's'}</span>` : ''; }).join(''));

  // map: in the War Council, the stops your warband can reach this move, your route, and your classmates' routes
  const planning = isCouncil() && band && !band.battle;
  if (!planning || (draft && draft[0] !== band.node)) draft = null;
  if (draft && band && routeKey(band.props?.[S.me.pairId]) === routeKey(draft)) draft = null;     // sent: show it as the proposal
  while (draft && draft.length > 1 && routeCost(draft) > band.mp) draft = draft.slice(0, -1);          // the warband's AP fell (a pair joined): keep what it can afford
  if (draft && draft.length < 2) draft = null;
  syncDraft();
  const reach = planning ? reachableStops(band) : new Map();
  const options = [...reach].map(([node, c]) => ({ node, cost: c, reach: true, attack: blocks(node), inRoute: !!draft?.includes(node) }));
  const mineProp = band?.props?.[S.me.pairId];
  const shown = draft || (Array.isArray(band?.plan) ? band.plan : Array.isArray(mineProp) ? mineProp : null) || (band?.path?.length ? [band.node, ...band.path] : null);
  const friends = S.bands.filter((b) => b.id !== band?.id).map((b) => (Array.isArray(b.plan) ? b.plan : b.path?.length ? [b.node, ...b.path] : Object.values(b.props || {}).find(Array.isArray))).filter((r) => r?.length > 1).map(lineOf);
  if (band) for (const [pid, r] of Object.entries(band.props || {})) if (pid !== S.me.pairId && Array.isArray(r) && r.length > 1) friends.push(lineOf(r));
  trackLastSeen();
  map.render({ state: S, mine: band?.id, focusNode: band?.node ?? null, options, selected, route: shown?.length > 1 ? lineOf(shown) : null,
    friends, ghost: shown?.length > 1 && band?.status !== 'marching' ? { node: shown.at(-1), char: S.me.char } : null,
    lastSeen: [...lastSeen.values()].filter((g) => !S.units.some((u) => u.id === g.id)), status: null,   // the bar along the bottom says what your warband is doing
    // after a defeat: the wounded enemy, and friendly companies the company could reach and join
    wounded: planning && band.lastDefeatAt ? band.lastDefeatAt : null,
    highlight: planning && band.lastDefeatAt ? S.bands.filter((b) => b.id !== band.id && reach.has(b.node)).map((b) => b.id) : [] });
  announceBuffs();
  // a stop newly secured as a rally point pulses once
  for (const n of S.rally || []) { if (!knownRally.has(n)) { if (rallyPrimed) map.pulse(n, `${nodeName(n)} secured`); knownRally.add(n); } }
  rallyPrimed = true;

  // ribbon: only for alarms (the Academy under attack, or a siege unit you can see within one march of it)
  const siege = S.units.some((u) => u.node === HOME && !u.battle);
  const threat = !siege && S.units.find((u) => UNITS[u.type]?.siege && (fromHome.get(u.node) ?? 99) <= UNITS[u.type].speed);
  $('ribbon').textContent = siege ? `⚠ The Crimson Host is at the Academy! Drive them out before the Ward breaks (${S.ward.hp} of ${S.ward.max} left).`
    : threat ? `⚠ ${UNITS[threat.type].name.split(' ').slice(-1)[0]} sighted at ${nodeName(threat.node)}: it is within one march of the Academy Ward.` : '';
  $('ribbon').classList.toggle('warn', !!threat);

  renderActBar(band);
  renderInfo(band, options);
  renderJoin();
  renderQuestion();
  renderBattle();
  renderEnding();
  maybeHelp();
  renderShop();
  maybeAuntie();
  renderPaused();
  renderExplain();
  renderNotes();
  renderCoach();
}

// The main line of the top bar: what the student should do now, in plain words
function headline(band) {
  if (S.status === 'ended') return 'The war is over';
  if (S.myBattle) return 'Battle!';
  if (S.phase === 'crimson') return S.own ? 'Answer questions to earn steps' : 'The enemy is moving';
  if (S.phase === 'crystal' && S.stage === 'quiz') return 'Finish your questions';
  if (S.phase === 'crystal' && S.stage === 'council') return 'Plan your move';
  if (S.own?.kind === 'warcry') return 'Cheer on a battle';
  if (band?.status === 'resume') return 'You won! Carry on?';
  if (S.phase === 'crystal') return band?.path?.length ? 'Your warband is marching' : 'Warbands are marching';
  return (S.battles || []).length ? 'Other warbands are in battle' : 'The turn is ending';
}
// One clock at a time: the top clock shows only when nothing else on screen is counting down
// (no question card open, no Grab-Ma phone, no training turn)
let clockOn = false;
function showClock() {
  if (S.status !== 'playing' || S.training || S.myBattle || phone?.isOpen) return false;
  if (S.own) return false;                                   // the question has its own timer
  return S.phase === 'crimson' || (S.phase === 'crystal' && S.stage === 'council');
}

// Paused by the teacher: one message over everything (the server holds every clock still)
const pausedBox = document.createElement('div');
pausedBox.className = 'tw-paused hidden';
document.body.appendChild(pausedBox);
function renderPaused() {
  const on = S.status === 'playing' && !!S.paused;
  pausedBox.classList.toggle('hidden', !on);
  if (on) setHTML(pausedBox, `<div class="tp-box"><div class="eyebrow">THE WAR IS PAUSED</div><h2>Paused by ${esc(S.paused.by || boss())}</h2><p>${S.paused.restored ? 'The game is back after a restart. ' : ''}Every clock has stopped. The war goes on when ${esc(S.paused.by || boss())} resumes it.</p></div>`);
}
// After every battle question: the right answer and why, over the Arena's battle screen too
const explainBox = document.createElement('div');
explainBox.className = 'tw-explain hidden';
document.body.appendChild(explainBox);
function renderExplain() {
  const B = S.myBattle;
  const r = B?.status === 'choose' ? B.choose : B?.status === 'result' ? B.round : null;
  const right = r?.right?.[0] ?? (B?.status === 'result' ? B.round?.answer : null);
  const choices = B?.status === 'result' ? B.round?.choices : lastChoices;
  if (B?.status === 'fight' && B.question) lastChoices = B.question.choices;
  const text = r?.explain || '';
  // while your own move menu is open it waits (you got it right, and it shows again once your move is made), so it
  // never covers a move
  const on = !!(r && Number.isInteger(right) && right >= 0 && S.status === 'playing' && !(B?.status === 'choose' && B.moves));
  explainBox.classList.toggle('hidden', !on);
  if (on) setHTML(explainBox, `<div class="eyebrow">WHY</div><b>The answer is ${'ABCDEF'[right]}${choices?.[right] != null ? `. ${esc(choices[right])}` : ''}</b>${text ? `<p>${esc(text)}</p>` : ''}`);
}
let lastChoices = null;

// The bar along the bottom of the map: the company's one clear status, and its one main action
function renderActBar(band) {
  const bar = $('actBar');
  const on = band && S.status === 'playing' && !S.myBattle;
  bar.classList.toggle('hidden', !on);
  if (!on) return;
  const multi = band.pairs.length > 1;
  const hpPct = (p) => Math.round(((p.hp ?? 10) / (p.maxHp || 10)) * 100);
  setHTML($('abBand'), band.pairs.map((p) => `<span class="ab-pair ${p.id === S.me.pairId ? 'me' : ''}" title="Pair ${p.no} · HP ${showHp(p.hp)} of ${showHp(p.maxHp)}"><img src="${portrait(p.char)}" alt="" style="--c:${charColor(p.char)}">
      ${multi && band.props?.[p.id] !== undefined && isCouncil() ? '<i class="v">✓</i>' : ''}<i class="ab-hp ${hpPct(p) < 34 ? 'low' : ''}"><b style="width:${hpPct(p)}%"></b></i><small>${p.id === S.me.pairId ? `YOU · ${showHp(p.hp)} HP` : 'P' + p.no}</small></span>`).join(''));
  const end = $('endTurnBtn'), hold = $('abHold');
  let step = '', sub = '', act = null, holdOn = false, mp = '';
  const fight = (S.battles || []).find((B) => B.status === 'fight' || B.status === 'choose' || B.status === 'result');
  const steps = (n) => `${n} step${n === 1 ? '' : 's'}`;
  if (S.phase === 'crimson') { step = S.own ? 'Answer questions to earn steps' : 'The enemy is moving its army'; sub = S.own ? 'Each right answer gives your pair a step for its move.' : 'Your move comes next.'; }
  else if (S.stage === 'quiz') { step = 'Finishing the questions'; sub = 'Planning opens in a few seconds, when everyone has answered 3 questions.'; }
  else if (isCouncil()) {
    mp = `<b>${band.mp}</b><small>STEP${band.mp === 1 ? '' : 'S'} THIS MOVE</small>`;
    const plan = band.plan, mineProp = band.props?.[S.me.pairId];
    const others = Object.entries(band.props || {}).filter(([pid]) => pid !== S.me.pairId);
    if (draft?.length > 1) {
      const c = routeCost(draft), to = draft.at(-1);
      step = `${nodeName(to)} · ${steps(c)}${draft.length > 2 ? ` via ${nodeName(draft[1])}` : ''}`;
      sub = `${benefitOf(to)} ${band.mp - c > 0 ? `${steps(band.mp - c)} left over.` : ''} ${multi ? 'Tap SUGGEST THIS ROUTE so your warband can agree.' : 'Tap SEND ROUTE to send it.'}`;
      act = ['propose', multi ? 'SUGGEST THIS ROUTE' : 'SEND ROUTE']; holdOn = false;
    } else if (plan) {
      step = plan === 'hold' ? 'You chose to stay here' : `Route sent: to ${nodeName(plan.at(-1))} · ${steps(routeCost(plan))}`;
      sub = 'Your warband marches when planning ends. Tap a stop to change it.';
    } else if (mineProp !== undefined) {
      const agree = band.pairs.filter((p) => routeKey(band.props?.[p.id]) === routeKey(mineProp)).length;
      step = mineProp === 'hold' ? `Stay here · ${agree} of ${band.pairs.length} pairs agree` : `Route to ${nodeName(mineProp.at(-1))} · ${agree} of ${band.pairs.length} pairs agree`;
      sub = others.length ? others.filter(([, r]) => routeKey(r) !== routeKey(mineProp)).map(([pid, r]) => proposalBtn(band, pid, r)).join(' ') || 'Waiting for the other pairs to agree.' : 'Waiting for the other pairs to agree.';
    } else {
      step = band.lastDefeat ? `Your warband fell back to ${nodeName(band.node)}` : 'Plan your move: tap a glowing stop';
      sub = (band.lastDefeat ? `${esc(band.lastDefeat)} Try again, or join your allies. ` : '') + (others.length ? others.map(([pid, r]) => proposalBtn(band, pid, r)).join(' ') : 'The number on each glowing stop is how many steps it costs. Or tap STAY HERE.');
      holdOn = true;
    }
  } else if (band.status === 'resume' && band.rest?.length) {
    step = `You won! Carry on to ${nodeName(band.rest.at(-1))}?`;
    sub = `The rest of your route: ${band.rest.map((n) => esc(nodeName(n))).join(' → ')}. If you do not choose, you stay here.`;
    act = ['resume', 'CARRY ON']; holdOn = true;
  } else if (S.phase === 'crystal' && S.stage === 'march') {
    step = STATUS_TXT(band);
    sub = band.status === 'marching' ? (band.path?.length > 1 ? `Heading for ${nodeName(band.path.at(-1))}, ${band.path.length} stops to go.` : 'This is the last stop of your route.')
      : band.status === 'interrupted' ? 'Your route stopped because the enemy is in the way.' : 'Waiting for the other warbands to arrive.';
  } else { step = fight ? 'Battles are being fought' : 'The turn is ending'; sub = 'The next turn starts when they end.'; }
  // War Cries come by themselves while a battle is on; SUPPORT picks which battle they go to
  if (!isCouncil() && S.stage !== 'quiz' && fight && S.me.supporting !== fight.id && S.phase !== 'crimson') { act = ['support', `CHEER ON ${nodeName(fight.node).toUpperCase()}`]; end.dataset.battle = fight.id; sub += ' War Cry questions come to you by themselves. Right answers hit the enemy.'; }
  else if (S.me.supporting && fight) sub = `You are cheering on the battle at ${nodeName(fight.node)} with War Cries.`;
  setHTML($('abStep'), esc(step)); setHTML($('abSub'), sub); setHTML($('abMp'), mp);
  end.classList.toggle('hidden', !act);
  if (act) { end.dataset.act = act[0]; end.textContent = act[1]; }
  hold.classList.toggle('hidden', !holdOn || !(isCouncil() || band.status === 'resume'));
  hold.textContent = 'STAY HERE';
  // another banner on this stop: join them as a warband
  const other = S.bands.find((b) => b.id !== band.id && b.node === band.node && !b.battle);
  const join = $('abJoin');
  join.classList.toggle('hidden', !other || !!band.battle || S.phase === null);
  if (other) { join.dataset.band = other.id; join.textContent = `March with Pair ${other.pairs[0].no}`; join.title = 'A warband is pairs moving together. You plan one route and march together.'; }
  $('leaveBandBtn').classList.toggle('hidden', !multi || !!band.battle);
}

// ------------------------------------------------------------------ War Council: planning one route for the whole move
let draft = null;
const isCouncil = () => S?.phase === 'crystal' && S.stage === 'council';
const routeKey = (r) => (Array.isArray(r) ? r.join('>') : String(r ?? ''));
const routeCost = (r) => r.slice(1).reduce((a, n, i) => a + roadCost(r[i], n), 0);
const lineOf = (r) => routePoints(r).map((q) => [q.x, q.y]);
const fromHome = hops(HOME);
const blocks = (n) => n === FORTRESS || S.units.some((u) => u.node === n) || S.camps.some((c) => c.node === n && c.alive) || S.battles.some((B) => B.node === n);
// cheapest routes within the AP, never passing through a fight
function reachableStops(band) {
  const dist = new Map([[band.node, 0]]), q = [band.node];
  while (q.length) {
    q.sort((a, b) => dist.get(a) - dist.get(b)); const a = q.shift();
    if (a !== band.node && blocks(a)) continue;
    for (const b of neighbours(a)) {
      const d = dist.get(a) + roadCost(a, b);
      if (d > band.mp || (dist.has(b) && dist.get(b) <= d)) continue;
      if (b === FORTRESS && S.gate.broken && !S.warlord.out) continue;
      if (S.battles.some((B) => B.node === b && B.status !== 'gather')) continue;
      dist.set(b, d); q.push(b);
    }
  }
  dist.delete(band.node); return dist;
}
function pathTo(band, to) {
  const dist = new Map([[band.node, 0]]), prev = new Map(), q = [band.node];
  while (q.length) {
    q.sort((a, b) => dist.get(a) - dist.get(b)); const a = q.shift();
    if (a === to) break;
    if (a !== band.node && blocks(a)) continue;
    for (const b of neighbours(a)) { const d = dist.get(a) + roadCost(a, b); if (d <= band.mp && (!dist.has(b) || d < dist.get(b))) { dist.set(b, d); prev.set(b, a); q.push(b); } }
  }
  if (!dist.has(to)) return null;
  const r = [to]; while (r[0] !== band.node) r.unshift(prev.get(r[0]));
  return r;
}
function planTap(n) {
  const band = myBand(); if (!isCouncil() || !band || band.battle) return;
  if (document.body.classList.contains('coach-focus') && !$('mapHost').querySelector(`[data-stop="${n}"].coach-target`)) { toast('For this practice, tap the glowing stop with crossed swords.'); return; }
  if (!draft || draft[0] !== band.node) draft = [band.node];
  const i = draft.indexOf(n);
  if (i === 0) draft = null;
  else if (i > 0) draft = draft.slice(0, i + 1);
  else {
    const last = draft.at(-1);
    if (neighbours(last).includes(n) && (last === band.node || !blocks(last)) && routeCost(draft) + roadCost(last, n) <= band.mp) draft.push(n);
    else { const p = pathTo(band, n); if (p) draft = p; else toast(`That is too far. Your warband can travel ${band.mp} step${band.mp === 1 ? '' : 's'} this move.`); }
  }
  render();
}
const expedition = (n) => !!CAMPS[n] || n === WATCHTOWER;
function benefitOf(n) {
  if (CAMPS[n]) return `Beat ${CAMPS[n].name}: ${CAMPS[n].buffName} for the class (${CAMPS[n].buffText}).`;
  if (n === WATCHTOWER) return 'Hold the watchtower to see the Crimson Host beyond the fog.';
  if (n === FORTRESS) return S.gate.broken ? 'Face the Crimson Warlord.' : 'Attack the fortress gate.';
  if (n === HOME) return 'Rest at the Academy (+30 HP a turn) and guard it.';
  if (OUTPOSTS.includes(n)) return 'Take it and it becomes a safe camp: rest there (+30 HP a turn).';
  if (S.units.some((u) => u.node === n)) return 'Attack the enemy there.';
  return '';
}
function proposalBtn(band, pid, r) {
  const p = band.pairs.find((x) => x.id === pid);
  return `<button type="button" class="btn small-agree" data-agree="${pid}">Pair ${p?.no} suggests ${r === 'hold' ? 'staying here' : `going to ${esc(nodeName(r.at(-1)))}`} · AGREE</button>`;
}
const STATUS_TXT = (b) => ({
  planning: 'Planning a route', agreeing: 'Agreeing on a route', committed: Array.isArray(b.plan) ? `Route sent · ${routeCost(b.plan)} steps` : 'Staying here this move',
  marching: b.path?.length ? `Your warband is marching · next stop ${nodeName(b.path[0])}` : 'Your warband is marching', interrupted: 'The enemy is in the way · route stopped', holding: `Staying at ${nodeName(b.node)}`,
  arrived: `Arrived at ${nodeName(b.node)}`, resume: 'You won · carry on or stay?', battle: 'In battle', quiz: 'Answering questions', recovering: 'Resting at a safe camp', waiting: 'Waiting',
})[b.status] || '';
// a jungle camp beaten: its location pulses, and a short message says what changed and who did it
const knownBuffs = new Set(); let buffsPrimed = false; const knownRally = new Set(); let rallyPrimed = false;
function announceBuffs() {
  for (const b of S.buffs || []) {
    const key = `${b.key}:${b.at || 0}`;
    if (knownBuffs.has(key)) continue;
    knownBuffs.add(key);
    if (!buffsPrimed) continue;
    const c = Object.values(CAMPS).find((x) => x.buff === b.key); if (!c) continue;
    if (b.node != null) map.pulse(b.node, `${c.name.split(' ')[0]} secured`);
    const box = $('secured');
    setHTML(box, `<div class="eyebrow">${esc(nodeName(b.node ?? 0).toUpperCase())} SECURED</div><h3>${esc(c.buffName)}</h3><p>${esc(c.buffText)} · ${b.left} turn${b.left === 1 ? '' : 's'} left</p>${b.by ? `<small>Secured by ${esc(b.by)}</small>` : ''}`);
    box.classList.remove('hidden', 'show'); void box.offsetWidth; box.classList.add('show');
    clearTimeout(announceBuffs._t); announceBuffs._t = setTimeout(() => box.classList.add('hidden'), 5200);
  }
  buffsPrimed = true;
}
// where scouted Crimson units were last seen, kept until that stop is seen again
const lastSeen = new Map();
function trackLastSeen() {
  const vis = new Set(S.visible || []);
  for (const u of S.units) lastSeen.set(u.id, { id: u.id, type: u.type, node: u.node, turn: S.turn });
  for (const [id, g] of lastSeen) if (!S.units.some((u) => u.id === id) && (vis.has(g.node) || S.turn - g.turn > 3)) lastSeen.delete(id);
}

function renderInfo(band, options) {
  const box = $('infoCard');
  if (!selected || S.own || S.myBattle) { box.classList.add('hidden'); return; }
  const optAt = (n) => options.find((o) => o.node === n);
  const voteBtn = (n, label, cls = 'cyan') => optAt(n) ? `<button class="btn ${cls}" data-vote="${n}">${label} · ${optAt(n).cost} step${optAt(n).cost === 1 ? '' : 's'}</button>` : '';
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
      ${us.map((u) => `<div class="row"><img src="${sprite(u.type)}" alt=""><div class="nm">${esc(UNITS[u.type].name)}<small>${esc(UNITS[u.type].role)}${UNITS[u.type].siege ? ' · <b style="color:#ffb3bd">Siege threat: heavy damage to the Ward</b>' : ''}</small><div class="hpbar"><i style="width:${(u.hp / u.max) * 100}%"></i></div></div></div>`).join('')}
      <div class="preview">Strength ${Math.round(hp)}. ${verdict}</div><div class="actions">${voteBtn(n, 'Attack', 'crimson')}</div>`;
  } else if (selected.startsWith('camp')) {
    const n = +selected.slice(4), c = CAMPS[n], st = S.camps.find((x) => x.node === n);
    cls += ' teal';
    html = `${close}<div class="ic-head"><img src="${sprite(c.id)}" alt=""><div><div class="eyebrow" style="color:var(--cyan)">JUNGLE CAMP · ${esc(nodeName(n).toUpperCase())}</div><h3>${esc(c.name)}</h3></div></div>
      <p>${esc(c.lore)}</p><div class="kv"><b>REWARD FOR THE CLASS</b>${esc(c.buffName)}: ${esc(c.buffText)}</div><div class="kv"><b>CHALLENGE</b>Best with 2 pairs or more</div>
      <div class="kv"><b>STATUS</b>${st.alive ? 'Waiting for challengers' : `Beaten. Returns on turn ${st.returnTurn}`}</div><div class="actions">${st.alive ? voteBtn(n, 'Challenge it') : ''}</div>`;
  } else if (selected === 'fortress') {
    cls += ' red';
    const g = S.gate, w = S.warlord;
    html = `${close}<div class="ic-head"><img src="${sprite(g.broken ? 'warlord' : 'golem')}" alt=""><div><div class="eyebrow" style="color:var(--rose)">CRIMSON FORTRESS</div><h3>${g.broken ? 'The Crimson Warlord' : 'The gate guardian'}</h3></div></div>
      <p>${g.broken ? (w.out ? 'The gate is broken and the Warlord has come out to fight. Beat him to win the war.' : 'The gate is broken. The Warlord waits inside and has not come out yet.') : 'The Bloodstone Golem guards the gate. Break it to reach the Warlord. Damage you deal stays, even if you have to fall back.'}</p>
      <div class="kv"><b>${g.broken ? 'WARLORD' : 'GATE'}</b>${g.broken ? `${w.hp} of ${w.max}` : `${g.hp} of ${g.max}`}</div><div class="hpbar"><i style="width:${g.broken ? (w.hp / w.max) * 100 : (g.hp / g.max) * 100}%"></i></div>
      ${g.defenders ? `<div class="kv"><b>DEFENDERS</b>${g.defenders} more Crimson units inside</div>` : ''}<div class="actions">${voteBtn(FORTRESS, g.broken ? 'Face the Warlord' : 'Attack the gate', 'crimson')}</div>`;
  } else if (selected.startsWith('seen')) {
    const g = lastSeen.get(selected.slice(4));
    if (!g) { selected = null; box.classList.add('hidden'); return; }
    cls += ' red';
    html = `${close}<div class="eyebrow" style="color:var(--rose)">LAST SEEN · TURN ${g.turn}</div><h3>${esc(UNITS[g.type]?.name || '')}</h3>
      <p>Your class last saw it at <b>${esc(nodeName(g.node))}</b>. It is hidden in the fog now and may have moved. Scout again, or hold the watchtower, to see where it went.</p>
      ${UNITS[g.type]?.siege ? '<div class="kv"><b>SIEGE THREAT</b>Deals heavy damage to the Academy Ward.</div>' : ''}`;
  } else if (selected === 'tower') {
    const t = S.tower; cls += ' teal';
    html = `${close}<div class="eyebrow" style="color:var(--cyan)">WATCHTOWER · ${esc(nodeName(t.node).toUpperCase())}</div><h3>${t.held ? 'Your class holds the watchtower' : 'The Watchtower'}</h3>
      <p>While one of your pairs stands on the watchtower, the whole class can see where the Crimson Host is, even beyond the fog. Ambushes stay hidden: ${esc(boss())} can still hide units in your path.</p>
      <div class="kv"><b>STATUS</b>${t.held ? 'Held. You can see the Crimson Host.' : 'Not held. Send a pair to stand on it.'}</div><div class="actions">${voteBtn(t.node, 'Go to the watchtower')}</div>`;
  } else if (selected === 'academy') {
    const w = S.ward, here = S.units.filter((u) => u.node === HOME);
    cls += ' teal';
    html = `${close}<div class="eyebrow" style="color:var(--cyan)">YOUR HOME · ${esc(nodeName(HOME).toUpperCase())}</div><h3>The Academy Ward</h3>
      <p>${esc(boss())} can attack your home too. If the Crimson Host stands on the Academy with no pair there to fight it, it batters the Ward every turn. If the Ward breaks, the Crimson Host wins the war. Keep an eye on home, and come back to drive them out.</p>
      <div class="kv"><b>WARD</b>${w.hp} of ${w.max}</div><div class="hpbar teal"><i style="width:${(w.hp / w.max) * 100}%"></i></div>
      ${here.length ? `<div class="kv" style="color:#ffb3bd"><b style="color:var(--rose)">UNDER ATTACK</b>${here.length} Crimson ${here.length === 1 ? 'unit is' : 'units are'} at the Academy</div>` : ''}<div class="actions">${voteBtn(HOME, here.length ? 'Drive them out' : 'Go home', here.length ? 'crimson' : 'cyan')}</div>`;
  } else if (selected.startsWith('band')) {
    const b = S.bands.find((x) => `band${x.id}` === selected);
    if (!b) { selected = null; box.classList.add('hidden'); return; }
    const canJoin = band && band.id !== b.id && band.node === b.node && !band.battle && !b.battle;
    html = `${close}<div class="eyebrow">${b.pairs.length > 1 ? 'CRYSTAL WARBAND' : `PAIR ${b.pairs[0]?.no ?? ''}`} · ${esc(nodeName(b.node).toUpperCase())}</div>
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
  // the 3 questions before the move: once yours are done, wait for the class
  const waitingQuiz = !o && !S.myBattle && S.phase === 'crystal' && S.stage === 'quiz' && (S.me.quiz || 0) >= 3;
  if (waitingQuiz) {
    dock.classList.remove('hidden'); dock.classList.add('centre'); $('gMain').classList.add('centred'); $('gMain').classList.remove('docked'); card.hide();
    const r = S.me.quizRight || 0, ap = 1 + Math.min(3, S.me.bank || 0);
    setHTML($('qdHead'), `<div class="eyebrow">BEFORE YOU MOVE</div><div class="qd-title">${r === 3 ? 'All 3 right! +20 bonus coins' : `${r} of 3 right`}</div>
      <div class="qd-mp"><span>Your pair moves <b>${ap} step${ap === 1 ? '' : 's'}</b>. Planning opens in a few seconds: <b>${S.quiz?.done ?? 0} of ${S.quiz?.of ?? 0}</b> are ready.</span></div>`);
    return;
  }
  if (!o || S.myBattle) { dock.classList.add('hidden'); $('gMain').classList.remove('docked', 'centred'); dock.classList.remove('centre'); card.hide(); return; }
  // while the Crimson Host moves, the question sits in the middle (as in Academy Rift); during your move it docks beside the map
  const centre = true;                    // questions always sit in the middle, as in Academy Rift (none come while you move)
  dock.classList.remove('hidden'); dock.classList.toggle('centre', centre);
  $('gMain').classList.toggle('docked', !centre); $('gMain').classList.toggle('centred', centre);
  const battle = o.kind === 'warcry' ? S.battles.find((b) => b.id === o.battleId) : null;
  if (o.kind === 'quiz' && o.bonus) {
    setHTML($('qdHead'), `<div class="eyebrow">BONUS QUESTION</div><div class="qd-title">Earn more coins while the class finishes</div>
      <div class="qd-mp"><span>Each right answer: <b>+10 coins</b>. Planning opens when the class is ready: <b>${S.quiz?.done ?? 0} of ${S.quiz?.of ?? 0}</b> done.</span></div>`);
  } else if (o.kind === 'quiz') {
    const n = (S.me.quiz || 0) + 1, pips = Array.from({ length: 3 }, (_, i) => `<i class="${i < (S.me.quizRight || 0) ? 'on' : ''}"></i>`).join('');
    setHTML($('qdHead'), `<div class="eyebrow">BEFORE YOU MOVE · QUESTION ${Math.min(3, n)} OF 3</div><div class="qd-title">Earn coins for Grab-Ma</div>
      <div class="qd-mp"><span class="pips">${pips}</span><span>Each right answer: <b>+10 coins</b>. All 3 right: <b>+20 bonus</b>. Then you plan your move.</span></div>`);
  } else if (o.kind === 'muster') {
    const bank = S.me.bank, ap = 1 + Math.min(3, bank);   // each partner adds up to 2 steps, so both answers count
    const pips = Array.from({ length: 3 }, (_, i) => `<i class="${i < Math.min(3, bank) ? 'on' : ''}"></i>`).join('');
    // one clock at a time: the question card has its own timer, so no "your move in" countdown here
    const n = Math.min(3, (S.me.quiz || 0) + 1);
    setHTML($('qdHead'), `<div class="eyebrow">${S.stage === 'quiz' ? 'LAST QUESTIONS BEFORE YOUR MOVE' : 'WHILE THE ENEMY MOVES'} · QUESTION ${n} OF 3</div><div class="qd-title">Earn steps and coins</div>
      <div class="qd-mp"><span class="pips">${pips}</span><span>Each right answer gives your pair <b>1 step</b> (up to 2 from each of you) and you <b>20 coins</b>. All 3 right: <b>+20 bonus</b>. Your next move: <b>${ap} step${ap === 1 ? '' : 's'}</b>${bank >= 3 ? ' (the most)' : ''}</span></div>`);
  } else setHTML($('qdHead'), `<div class="eyebrow" style="color:var(--rose)">WAR CRY</div><div class="qd-title">Cheer on the battle${battle ? ` at ${esc(nodeName(battle.node))}` : ''}</div><div class="qd-mp"><span>Every right answer hits the enemy there.</span></div>`);
  const footer = o.result ? (o.result.ok ? (o.kind === 'muster' ? `Correct! A step for your pair and +20 coins${o.result.bonus ? `, plus +${o.result.bonus} bonus` : ''}.` : o.kind === 'quiz' ? `Correct! +10 coins${o.result.bonus ? ` and +${o.result.bonus} bonus` : ''}` : 'Correct! Your War Cry strikes.') : o.result.chosen < 0 ? "Time's up." : o.kind === 'warcry' ? 'Not quite. Your next War Cry comes in a few seconds.' : 'Not quite.') : '';
  card.show({
    q: o.question, tag: o.kind === 'muster' ? 'EARN STEPS' : o.kind === 'quiz' ? (o.bonus ? 'BONUS' : 'BEFORE YOU MOVE') : 'WAR CRY', thumb: S.me.char ? portrait(S.me.char) : null,
    note: o.retry ? '<b>↺ BACK AGAIN</b> You got this one wrong earlier. Read it carefully.' : '',
    result: o.result, footer, serverNow: S.serverNow, speed,
  });
}

function renderBattle() {
  const B = S.status === 'ended' ? null : S.myBattle;
  if (arena.feed(S.status === 'ended' ? { ...S, myBattle: null } : S)) { $('battle').classList.add('hidden'); bcard.hide(); return; }    // the fight itself is on the Arena's battle screen
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
  // while the battle gathers, each pair picks the monster it will fight (with one monster there is nothing to pick)
  const gathering = B.status === 'gather', mine = B.me?.target, pick = gathering && B.enemies.filter((e) => e.hp > 0).length > 1;
  $('battle').classList.toggle('gathering', gathering);
  setHTML($('bFoes'), (pick ? `<div class="foe-pick-h">PICK YOUR MONSTER <small>Each pair fights one monster. If you do not pick, you are given the one with the fewest pairs.</small></div>` : '')
    + B.enemies.map((e, i) => `<div class="foe ${e.hp <= 0 ? 'down' : ''} ${pick ? 'pickable' : ''} ${mine === i ? 'mine' : ''} ${e.wave ? 'wave' : ''}">
      ${pick ? `<img src="${sprite(e.type)}" alt="">` : ''}<span>${esc(enemyName(e.type))}${e.dug ? ' <em>dug in</em>' : ''}${!gathering && e.wave ? ' <em class="front">FIGHTING</em>' : ''}</span>
      <div class="hpbar"><i style="width:${Math.max(0, (e.hp / e.max) * 100)}%"></i></div><small>${X(Math.max(0, e.hp))} / ${X(e.max)}</small>
      ${pick ? `<button type="button" class="btn ${mine === i ? 'crimson' : ''}" data-target="${i}">${mine === i ? '✓ YOUR MONSTER' : 'FIGHT THIS'}</button>${e.picks ? `<b class="picks">${e.picks} pair${e.picks > 1 ? 's' : ''}</b>` : ''}` : ''}</div>`).join(''));

  let centre = '', role = '';
  const fighting = B.status === 'fight' && B.question;
  const choosing = B.status === 'choose';
  $('battle').classList.toggle('fighting', !!(fighting || choosing));
  // getting ready: the countdown and who fights beside you sit below the stage, clear of your fighter
  if (B.status === 'gather') {
    const names = B.bands.flatMap((b) => b.pairs);
    role = `<div class="b-gather"><div class="bg-count"><small>STARTS IN</small><b data-until="${B.gatherEnds}">${gameSecondsLeft(B.gatherEnds)}</b></div>
      <div class="bg-text"><div class="bg-title">${B.ambush ? 'Ambush!' : defend ? 'To arms!' : 'Battle stations!'}</div><p>${B.ambush ? 'The Crimson Host was hiding here. Your warband starts the battle hurt. ' : ''}${defend ? 'The Crimson Host is attacking you. ' : ''}Get ready to answer. Warbands one road away can still join.</p></div>
      <div class="bg-allies"><div class="eyebrow">YOUR WARBAND · ${names.length} PAIR${names.length === 1 ? '' : 'S'}</div>${names.map((p) => `<div class="bg-ally ${p.no === S.me.pairNo ? 'me' : ''}"><img src="${portrait(p.char)}" alt="" style="--c:${charColor(p.char)}"><span><b>${p.no === S.me.pairNo ? 'You' : `Pair ${p.no}`}</b>${esc(p.names.join(' & '))}</span></div>`).join('')}</div></div>`;
  }
  if (B.status === 'over') centre = B.outcome === 'won'
    ? `<span class="big">Victory!</span>${B.kind === 'camp' ? `${esc(CAMPS[B.node].buffName)}: ${esc(CAMPS[B.node].buffText)}.` : B.kind === 'gate' ? 'The gate is broken!' : defend ? 'You drove off the attack.' : 'The way is clear.'}`
    : B.outcome === 'stopped' ? `<span class="big">Battle ended</span>${esc(boss())} ended this battle. The damage you dealt stays.`
    : defend && B.resolve > 0 ? '<span class="big">You held!</span>The Crimson Host pulls back.' : `<span class="big">Driven back</span>${B.resolve <= 0 ? 'Your warband ran out of HP.' : 'The enemy held.'} You fall back to regroup. The damage you dealt stays, and your pair is back to full HP next turn.`;
  if (choosing && !B.moves) centre = `<span class="big">${esc(B.choose.name)}${B.choose.half ? ' stole the turn' : '\'s turn'}</span>${B.choose.bot ? 'The bot is' : 'They are'} picking a move…`;
  setHTML($('bCentre'), cinema ? '' : centre);
  if (fighting) role = '';
  if (fighting) {
    const s = B.striker;
    role = B.role === 'striker' ? '<b class="you-strike">YOUR TURN!</b> Answer right, then pick your move: Strike, a skill or your Ultimate.'
      : `It is <b>${esc(s?.name || '')}${s?.pairNo ? ` (Pair ${s.pairNo})` : ''}</b>'s turn. Answer along: right answers add hits, fill the Sync gauge, and steal the turn if they miss.`;
  }
  setHTML($('bRole'), cinema ? '' : role);
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
    setHTML($('bReveal'), `${you} The answer was <b>${'ABCD'[right]}. ${esc(rd.choices[right])}</b>${rd.explain ? `<br>${esc(rd.explain)}` : ''}<br>${act}<b>${X(rd.hits)}</b> damage · the Crimson hit back for <b>${X(rd.counterTotal)}</b>`);
    $('bReveal').classList.remove('hidden');
  } else $('bReveal').classList.add('hidden');
}

// The move menu, as in the Arena: STRIKE, SKILLS, ULTIMATE and ITEMS, after a right answer on your turn
const KIND_TXT = { atk: 'Damage', heavy: 'Heavy damage', heal: 'Heals the warband', guard: 'The enemy\'s next hit is softer', buff: 'Hit 25% harder for 2 questions', debuff: 'The enemy hits back weaker', cleanse: 'Heals the warband' };
function renderMoves(B) {
  const box = $('bMoves'), m = B.status === 'choose' ? B.moves : null;
  if (!m || cinema) { box.classList.add('hidden'); movesOpen = null; return; }
  const key = `${B.id}:${B.choose.endsAt}`; if (key !== moveKey) { moveKey = key; movesOpen = null; }
  const c = CHAR_BY[m.char];
  const left = `<b data-until="${B.choose.endsAt}">${gameSecondsLeft(B.choose.endsAt)}</b>`;
  let html = `<div class="mv-head"><span class="mv-ok ${B.choose.half ? 'steal' : ''}">${B.choose.half ? '⚡ STOLEN · HALF DAMAGE' : '✓ CORRECT'}</span><span>Pick your move · ${left}s</span><span class="mv-sp">SP <b>${m.sp}</b>/${m.maxSp}</span></div>`;
  if (movesOpen === 'skills') {
    html += `<div class="mv-list">${m.skills.map((k) => `<button type="button" class="mv-skill" data-act="skill" data-i="${k.i}" ${k.ok ? '' : 'disabled'}><b>${esc(k.name)}</b><small>${k.cd > 0 ? `Cooldown: wait ${k.cd} turn${k.cd === 1 ? '' : 's'}` : `Uses ${k.sp} SP (energy)`} · ${KIND_TXT[k.kind] || ''}</small></button>`).join('')}</div><button type="button" class="mv-back" data-open="">← BACK</button>`;
  } else if (movesOpen === 'items') {
    html += `<div class="mv-list">${m.items.length ? m.items.map((it) => `<button type="button" class="mv-skill" data-act="item" data-item="${it.id}"><b>${esc(it.name)} ×${it.n}</b><small>${esc(it.desc)}</small></button>`).join('') : '<p class="mv-empty">Your bag is empty. Order food from Grab-Ma between battles.</p>'}</div><button type="button" class="mv-back" data-open="">← BACK</button>`;
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

let showAnswers = false;
function renderEnding() {
  const box = $('ending');
  if (S.status !== 'ended') { box.classList.add('hidden'); return; }
  const won = S.winner === 'crystal', draw = S.winner === 'draw';
  const ward = S.endedBy === 'ward';
  const A = S.me.review || { asked: 0, correct: 0, along: 0, alongRight: 0, list: [] }, Y = S.summary || {};
  // how far the class got, in plain words (the HP numbers are on the same scale as the battles)
  const where = Y.reached != null ? `Your class reached ${esc(nodeName(Y.reached))}, ${Y.stopsLeft} stop${Y.stopsLeft === 1 ? '' : 's'} from the fortress gate.` : 'Your class did not get far from the Academy this time.';
  const gate = Y.gate ? `Your class broke the gate! The Warlord took ${Y.warlordDmg} of ${Y.warlordMax} damage.` : Y.gateMax ? (Y.gateDmg ? `The gate took ${Y.gateDmg} of ${Y.gateMax} damage.` : `The gate (${Y.gateMax} HP) has not been hit yet.`) : '';
  const lead = won ? (S.endedBy === 'teacher' ? `${esc(boss())} declared your class the winner.` : S.endedBy ? 'The gate is broken and the Warlord is badly hurt, so your class wins.' : 'Your class beat the Crimson Warlord!')
    : draw ? 'Your class broke the gate, but the Warlord still stands.' : ward ? `The enemy broke into the Academy. Next time, leave some pairs at home to guard it.` : `${esc(boss())} held the fortress this time.`;
  const wins = [
    [Y.wins || 0, `battle${Y.wins === 1 ? '' : 's'} won`], [Y.camps || 0, `jungle camp${Y.camps === 1 ? '' : 's'} beaten`], [Y.rally || 0, `safe camp${Y.rally === 1 ? '' : 's'} taken`],
  ].map(([n, t]) => `<span class="win-chip ${n ? '' : 'none'}"><b>${n}</b>${t}</span>`).join('') + (Y.tower ? '<span class="win-chip"><b>✓</b>watchtower climbed</span>' : '') + (Y.gate ? '<span class="win-chip"><b>✓</b>gate broken</span>' : '');
  const mine = A.asked || A.along
    ? `You answered <b>${A.asked}</b> question${A.asked === 1 ? '' : 's'} yourself (<b>${A.correct}</b> right).${A.along ? ` You also answered along with <b>${A.along}</b> of your classmates' battle questions (${A.alongRight} right).` : ''}`
    : 'You did not answer any questions this war.';
  const answers = showAnswers ? `<div class="my-answers"><div class="eyebrow">YOUR ANSWERS</div>${A.list.length ? `<ol>${A.list.map((q) => `<li class="${q.ok ? 'ok' : 'no'}"><i>${q.ok ? '✓' : '✗'}</i><div><p>${esc(q.text)}${q.along ? ' <small>(answered along)</small>' : ''}</p>${q.ok ? `<small>Right: ${esc(q.key)}</small>` : `<small>You chose: ${esc(q.chose)}. The answer is ${esc(q.key)}.</small>`}</div></li>`).join('')}</ol>` : '<p>No answers yet.</p>'}</div>` : '';
  const pin = (n, cls, label) => (n == null ? '' : `<i class="${cls}" style="left:${(NODES[n].x / 14.4).toFixed(2)}%;top:${(NODES[n].y / 9).toFixed(2)}%">${label}</i>`);
  setHTML(box, `<div class="end-in"><div class="eyebrow">${won ? 'VICTORY' : draw ? 'A DRAW' : ward ? 'THE ACADEMY HAS FALLEN' : 'THE FORTRESS STANDS'}</div><h1>${won ? 'The class wins' : draw ? 'The gate is broken, the Warlord stands' : ward ? 'The Academy has fallen' : 'The Crimson Host holds'}</h1>
    <p>${lead} ${where} ${gate}</p>
    <div class="end-wins"><div class="eyebrow">WHAT YOUR CLASS WON</div>${wins}</div>
    <p class="end-me">${mine}${Y.pct != null ? ` The class got ${Y.pct}% right.` : ''}</p>
    <div class="end-btns"><button type="button" class="gold-btn" data-end="practice"><span>START A NEW PRACTICE WAR</span></button><button type="button" class="ghost-btn" data-end="join">JOIN ANOTHER WAR</button>
      <button type="button" class="ghost-btn" data-answers="1">${showAnswers ? 'HIDE YOUR ANSWERS' : 'YOUR ANSWERS'}</button><a class="ghost-btn end-home" href="/">BACK TO ACADEMY RIFT</a></div>
    ${answers}
    <div class="story"><div class="eyebrow">HOW THE WAR WENT</div>
      <div class="story-map"><img src="art/moonveil-map.webp" alt="">${pin(HOME, 'home', 'Home')}${pin(Y.reached, 'far', 'Furthest')}${pin(FORTRESS, 'goal', 'Gate')}${(S.story || []).map((e, i) => e.node == null ? '' : `<i style="left:${(NODES[e.node].x / 14.4).toFixed(2)}%;top:${(NODES[e.node].y / 9).toFixed(2)}%;animation-delay:${0.5 + i * 0.7}s">${i + 1}</i>`).join('')}</div>
      ${S.story?.length ? `<ol>${S.story.map((e, i) => `<li style="animation-delay:${0.5 + i * 0.7}s"><small>${e.node == null ? '' : `${i + 1} · `}Turn ${e.turn}</small>${esc(e.text)}</li>`).join('')}</ol>` : ''}</div></div>`);
  box.classList.remove('hidden');
}
$('ending').addEventListener('click', (e) => {
  if (e.target.closest('[data-answers]')) { showAnswers = !showAnswers; render(); if (showAnswers) setTimeout(() => $('ending').querySelector('.my-answers')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); return; }
  const b = e.target.closest('[data-end]'); if (!b) return;
  // leave the old war behind: its saved place is cleared
  localStorage.removeItem(SAVE); S = null; showAnswers = false;
  $('ending').classList.add('hidden'); arena.close?.(); phone.close?.();
  if (b.dataset.end === 'join') { show('join'); $('joinCode').value = ''; $('joinCode').focus(); return; }
  const name = localStorage.getItem('tw.name') || $('joinName').value.trim() || 'You';
  socket.emit('twPractice', { name, char: BANNERS[Math.floor(Math.random() * BANNERS.length)].id, tutorial: !tutorialSeen() });
});

// clocks
setInterval(() => {
  if (!S || S.status !== 'playing' || S.paused) return;     // paused: the clocks stand still
  if (showClock() !== clockOn) render();
  $('phaseClock').textContent = mmss(gameSecondsLeft(S.phaseEndsAt));
  document.querySelectorAll('[data-until]').forEach((el) => { el.textContent = gameSecondsLeft(+el.dataset.until); });
  councilWatch();
}, 250);

// ------------------------------------------------------------------ how to play (shown once, and from the ? button)
const HELP = [
  { art: "url(art/keyart.webp)", t: 'Your mission', p: () => [`Break into the <b>Crimson Fortress</b> on the right of the map and beat the enemy's Warlord.`, `${esc(boss())} leads the enemy army, the Crimson Host. Keep your home, the <b>Academy</b>, safe too.`] },
  { art: "url(monsters/orc_warchanter.png)", t: 'Turn by turn', p: () => ['First, while the enemy moves, you <b>answer questions</b>. Each right answer gives your pair <b>a step</b> for its move.', 'Then <b>3 more questions</b>. Right answers earn <b>coins</b> for food. Then you <b>plan your move</b>.'] },
  { art: "url(portraits/S.webp)", t: 'Plan your move', p: () => ['<b>Tap a glowing stop</b> on the map. The number on it is how many steps it costs. Then tap <b>SEND ROUTE</b>.', 'A <b>warband</b> is pairs moving together. One pair suggests a route and the others agree. A <b>⚔</b> stop is a fight.'] },
  { art: "url(auntie/bust.png)", t: 'HP and food', p: () => ['Your pair\'s <b>HP does not come back</b> by itself after a battle. Order food from <b>Grab-Ma</b> on your phone, or rest at the Academy or a safe camp.', 'Not in a battle while others fight? <b>War Cry</b> questions come to you. Each right answer hits the enemy in their battle.'] },
  { art: "url(monsters/golem.png)", t: 'Battles', p: () => ['Your warband takes turns to attack. When it is <b>your turn</b>, answer right and <b>pick your move</b>.', 'On a classmate\'s turn, <b>answer along</b>. If they miss it and you got it right, you may <b>steal the turn</b>.'] },
];
let helpAt = 0;
function showHelp(at = 0) {
  helpAt = at; const h = HELP[at];
  setHTML($('helpSlides'), `<div class="help-slide"><div class="hs-art" style="background-image:${h.art}"></div><div><h3>${h.t}</h3>${h.p().map((x) => `<p>${x}</p>`).join('')}</div></div>`);
  setHTML($('helpDots'), HELP.map((_, i) => `<i class="${i === at ? 'on' : ''}"></i>`).join(''));
  $('helpNext').textContent = at === HELP.length - 1 ? "LET'S GO" : 'NEXT';
  $('help').classList.remove('hidden');
}
$('helpNext').addEventListener('click', () => {
  if (helpAt < HELP.length - 1) return showHelp(helpAt + 1);
  $('help').classList.add('hidden'); try { localStorage.setItem('tw.helpSeen', '1'); } catch {}
  const then = helpThen; helpThen = null; then?.();
});
$('helpBtn').addEventListener('click', () => showHelp(0));
$('lbHelp').addEventListener('click', () => showHelp(0));
let helpChecked = false, helpThen = null;
const helpSeen = () => { try { return !!localStorage.getItem('tw.helpSeen'); } catch { return false; } };
// shown once, in the lobby before the war starts (never over a timed question). Someone who joins a war already
// under way gets a pointer to the ? button instead.
function maybeHelp() {
  if (helpChecked || !S || helpSeen() || S.tutorial) return;
  helpChecked = true;
  if (S.status === 'lobby') showHelp(0);
  else if (S.status === 'playing') toast('New to Total War? Tap ? at the top right to see how to play.');
}

// ------------------------------------------------------------------ Grab-Ma Food: the shop as a delivery app on a phone
// Orders go in during the class's move, once your banner has locked in its move; Grab-Ma then rides out on the map.
const canOrder = () => { const b = myBand(); return !!(S && S.status === 'playing' && !S.paused && ((S.phase === 'crystal' && S.stage !== 'quiz') || S.phase === 'battles') && b && !b.battle && !S.myBattle && !S.me.ordered); };
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
  setHTML(b, r ? '<i></i>TRACK ORDER' : '<i></i>GRAB-MA');
}

// ------------------------------------------------------------------ the coach: a guided first turn, and first-time tips
// A first practice war is a coached walkthrough of turn 1 (no timers): Emi says one thing at a time, the thing to tap
// glows and the other buttons dim. In every other war (and after the tutorial), the first time each stage appears a
// one-line tip is pinned in the bar along the bottom (or in the corner of a battle), and can be closed.
const tutorialSeen = () => { try { return !!localStorage.getItem('tw.tutorialDone'); } catch { return true; } };
const EMI = '../assets/Character Profile Art/thumb/Emi.webp';
const coachBox = $('coach'), ring = $('coachRing');
let coachKey = '', coachSpot = null, nextSeen = new Set(), tutorialOff = false, tipShown = '';
let tipsSeen = (() => { try { return new Set(JSON.parse(localStorage.getItem('tw.tips') || '[]')); } catch { return new Set(); } })();
const saveTips = () => { try { localStorage.setItem('tw.tips', JSON.stringify([...tipsSeen])); } catch {} };
const frameDoc = () => { try { return $('arenaHost').querySelector('iframe')?.contentDocument || null; } catch { return null; } };
const inFrame = (sel) => () => { const d = frameDoc(), f = $('arenaHost').querySelector('iframe'); const el = d?.querySelector(sel); if (!el || !f || el.offsetParent === null) return null; const r = el.getBoundingClientRect(), o = f.getBoundingClientRect(); return { left: r.left + o.left, top: r.top + o.top, width: r.width, height: r.height, el }; };
const onPage = (sel) => () => { const el = typeof sel === 'string' ? document.querySelector(sel) : sel?.(); if (!el || el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return null; const r = el.getBoundingClientRect(); return r.width ? { left: r.left, top: r.top, width: r.width, height: r.height, el } : null; };

// What Emi says now, in the practice tutorial's first turn
function tutorialStep() {
  if (!S || S.status !== 'playing' || !S.tutorial || tutorialOff || S.turn > 1) return null;
  const band = myBand(), B = S.myBattle, me = S.me;
  const m = (key, tag, text, o = {}) => ({ key, tag, text, ...o });
  const once = (key, tag, text, o = {}) => (nextSeen.has(key) ? null : m(key, tag, text, { next: true, ...o }));
  if (B) {
    if (B.status === 'gather') return m('b-gather', 'BATTLE', 'You walked onto an enemy, so a battle starts. You and your partner answer questions to attack it.');
    const q = B.status === 'fight' && B.question;
    if (q && B.role === 'striker') return m('b-strike', 'YOUR TURN', 'It is your turn. Answer right and you get to attack. Nothing is timed, so take your time.', { spot: inFrame('#mcq'), battle: true });
    if (q) return m('b-along', 'ANSWER ALONG', 'This is your partner\'s question. Answer it too! A right answer adds a hit and fills the Sync bar. A full Sync bar unlocks your Ultimate.', { spot: inFrame('#qStrip'), battle: true });
    if (B.status === 'choose') {
      const mine = B.choose.pid === me.pid;
      if (mine && !B.choose.half) return m('b-move', 'PICK A MOVE', 'Right! Now pick your move. STRIKE is a normal hit. SKILLS are special moves that use SP, your energy for skills.', { spot: inFrame('.ms-move.strike'), battle: true });
      if (mine) return m('b-steal', 'YOU STOLE IT', 'Your partner missed it, and you got it right, so you attack instead. A stolen turn does half damage. Tap STRIKE.', { spot: inFrame('.ms-move.strike'), battle: true });
      if (B.choose.half && B.choose.striker?.pid === me.pid) return m('b-stolen', 'STOLEN', 'You missed it, so your partner, who got it right, attacks instead. This is called stealing the turn.', { battle: true });
      return m('b-wait', 'WATCH', 'Your partner got it right and is picking a move.', { battle: true });
    }
    if (B.status === 'result') return m('b-counter', 'THE ENEMY HITS BACK', 'After every question the enemy hits back. The more of you answer right, the more of that hit you block.', { battle: true });
    return null;
  }
  if (S.phase === 'crimson') {
    const intro = once('intro', 'YOUR FIRST TURN', 'Hi, I\'m Emi! I will show you your first turn, one step at a time. Nothing is timed until we finish. Tap NEXT.');
    if (intro) return intro;
    if (S.own && !S.own.result) return m('prep', 'EARN STEPS', 'Answer the question. Each right answer gives your pair a step and earns you 20 coins. Steps let your pair move further on the map.', { spot: onPage('#card') });
    if (S.own) return m('prep-r', 'EARN STEPS', 'Read why the answer is right. The next question comes by itself.');
    return m('prep-done', 'THE ENEMY MOVES', 'Well done! The enemy is moving its army now. Your move comes next.');
  }
  if (S.stage === 'quiz') {
    if (S.own && !S.own.result) return m('quiz', 'EARN STEPS', 'Finish your questions. Each right answer gives your pair a step and earns you 20 coins.', { spot: onPage('#card') });
    return m('quiz-w', 'ALMOST READY', S.own ? 'Read why the answer is right.' : 'Waiting for your classmates to finish. Planning opens in a few seconds.');
  }
  if (isCouncil() && band && !band.battle) {
    const a = once('map', 'THE MAP', 'This is the map. Your banner glows at the Academy, your home. Your goal is the Crimson Fortress on the right.', { spot: onPage(`[data-key="band${band.id}"]`) });
    if (a) return a;
    const b = once('steps', 'STEPS', `You have ${band.mp} step${band.mp === 1 ? '' : 's'} this move. The number on each glowing stop is how many steps it costs to get there.`, { spot: onPage('#abMp') });
    if (b) return b;
    if (band.plan) return m('sent', 'ROUTE SENT', 'Route sent! Your warband marches when planning ends.');
    if (draft?.length > 1) return m('send', 'SEND YOUR ROUTE', 'Your route is drawn on the map. Tap SEND ROUTE to send it.', { spot: onPage('#endTurnBtn'), focus: true });
    const foe = $('mapHost').querySelector('[data-stop="1"].attack');
    return foe ? m('tap', 'PLAN YOUR ROUTE', 'An enemy scout waits at Lantern Crossroads, the stop with crossed swords. Tap it to plan your route there.', { spot: onPage('[data-stop="1"]'), focus: true })
      : m('tap', 'PLAN YOUR ROUTE', 'Tap a glowing stop to plan your route.');
  }
  if (S.phase === 'crystal' && S.stage === 'march') return m('march', 'MARCH', 'Watch your banner march along the road. Walking onto an enemy starts a battle.');
  // after the battle (once its last moment has finished on the battle screen): HP and food, then the real war starts
  if (!band || band.battle || !$('arenaHost').classList.contains('hidden')) return null;
  const hp = once('hp', 'YOUR HP', `Your pair has ${showHp(me.hp)} HP out of ${showHp(me.maxHp)}. HP does not come back by itself after a battle.`, { spot: onPage('#abBand .ab-pair.me') });
  if (hp) return hp;
  if (phone.isOpen) { nextSeen.add('food'); return m('phone', 'GRAB-MA FOOD', 'This is Grab-Ma Food. Each food says what it does. Kaya Toast heals your pair 40 HP. Close the phone when you are done.', { top: true }); }
  if (!nextSeen.has('food') && canOrder()) return m('food', 'FOOD', 'Food from Grab-Ma heals your pair. Tap GRAB-MA to open the food app.', { spot: onPage('#abAuntie'), focus: true, next: true, nextLabel: 'NOT NOW' });
  return m('done', 'READY!', 'That was one whole turn! From now on every stage has a timer at the top. Good luck, commander!', { next: true, nextLabel: 'START THE WAR' });
}

// a first-time tip for this stage (any war, after the tutorial); battle tips show in the corner of the battle
function stageTip() {
  if (!S || S.status !== 'playing' || (S.tutorial && !tutorialOff)) return null;
  const band = myBand(), B = S.myBattle;
  const t = (key, text, battle = false) => (tipsSeen.has(key) ? null : { key, text, battle });
  if (B) {
    // picking a monster, explained once (only when there is more than one to pick)
    const choice = (B.targetable || []).length > 1;
    if (choice && B.status === 'fight') { const k = t('t-pick', 'Each pair fights one monster. Tap a monster to fight it. You can change at any time. A monster hits back mostly at the pairs fighting it.', true); if (k) return k; }
    if (B.status === 'fight' && B.role === 'striker') return t('t-strike', 'It is your turn. Answer right, then pick your move.', true);
    if (B.status === 'fight' && B.question) return t('t-along', 'Your warband takes turns to attack. When it is your turn, you pick the move. Now answer along: right answers add hits and fill Sync.', true);
    if (B.status === 'choose' && B.moves) return t('t-move', 'Pick a move. STRIKE is a normal hit. SKILLS use SP, your energy for skills. ULTIMATE unlocks when the Sync bar is full.', true);
    if (B.status === 'result' && B.round?.my && B.round.striker?.pid !== S.me.pid && B.round.my.ok) return t('t-sync', 'Your right answer filled the Sync bar a little. Fill it to unlock your Ultimate.', true);
    if (B.status === 'choose' && B.choose?.half) return t('t-steal', B.choose.striker?.pid === S.me.pid ? 'You missed it, so a classmate who got it right attacked instead.' : 'Your classmate missed it, so someone who got it right attacked instead.', true);
    return null;
  }
  if (S.phase === 'crimson' && S.own) return t('t-prep', 'Answer questions while the enemy moves. Each right answer gives your pair a step for its move and earns you 20 coins.');
  if (S.stage === 'quiz') return t('t-quiz', 'Finish your 3 questions. Planning opens in a few seconds.');
  if (isCouncil() && band?.pairs.length > 1) return t('t-band', 'A warband is pairs moving together. One pair suggests a route and the others agree.');
  if (isCouncil()) return t('t-council', 'Tap a glowing stop to plan a route. The number is how many steps it costs. Then tap SEND ROUTE.');
  if (S.own?.kind === 'warcry') return t('t-cry', 'While others fight, War Cry questions come to you. Right answers hit the enemy in their battle.');
  if (band?.status === 'resume') return t('t-resume', 'You won! Carry on along your route, or stay here.');
  if (S.phase === 'crystal' && S.stage === 'march') return t('t-march', 'Your warband walks its route one stop at a time. Walking onto an enemy starts a battle.');
  return null;
}

function renderCoach() {
  const step = tutorialStep();
  const tip = step ? null : stageTip();
  const battleOpen = !$('arenaHost').classList.contains('hidden');
  document.body.classList.toggle('coach-focus', !!step?.focus);
  if (step) {
    if (coachKey !== step.key) {
      coachKey = step.key;
      setHTML(coachBox, `<img class="coach-face" src="${encodeURI(EMI)}" alt="Emi"><div class="coach-body"><div class="coach-tag">${esc(step.tag)}</div><div class="coach-text">${step.text}</div></div>
        <div class="coach-btns">${step.next ? `<button type="button" class="gold-btn small" data-coach="next"><span>${esc(step.nextLabel || 'NEXT')}</span></button>` : ''}<button type="button" class="coach-skip" data-coach="skip">Skip tutorial</button></div>`);
      coachBox.classList.remove('bump'); void coachBox.offsetWidth; coachBox.classList.add('bump');
    }
    coachBox.className = `coach ${step.battle || (battleOpen && S.myBattle) ? 'in-battle' : ''} ${step.top ? 'on-top' : ''} bump`;
    coachSpot = step.spot || null;
  } else if (tip) {
    if (tipShown && tipShown !== tip.key) { tipsSeen.add(tipShown); saveTips(); }
    tipShown = tip.key;
    if (coachKey !== tip.key) {
      coachKey = tip.key;
      setHTML(coachBox, `<div class="coach-body"><div class="coach-text"><b>TIP</b> ${esc(tip.text)}</div></div><button type="button" class="x-close" data-coach="tip" data-key="${tip.key}" aria-label="Close tip">×</button>`);
    }
    // over a question card the tip sits at the top; on the map it is pinned just above the bar along the bottom
    coachBox.className = `coach tip ${tip.battle ? 'in-battle' : S.own || $('gMain').classList.contains('centred') ? 'on-card' : 'in-bar'}`;
    coachSpot = null;
  } else { coachBox.className = 'coach hidden'; coachKey = ''; coachSpot = null; }
  // a tip is shown for the first time a stage appears only: once that stage is over, it does not come back
  if (!tip && tipShown) { tipsSeen.add(tipShown); saveTips(); tipShown = ''; }
  // in a battle the question panels make room for the coach in the corner
  try { frameDoc()?.documentElement.classList.toggle('coach-squeeze', !coachBox.classList.contains('hidden') && coachBox.classList.contains('in-battle')); } catch {}
  placeRing();
}
function placeRing() {
  const r = coachSpot?.();
  document.querySelectorAll('.coach-target').forEach((el) => { if (el !== r?.el) el.classList.remove('coach-target'); });
  if (!r) { ring.classList.add('hidden'); return; }
  if (r.el && r.el.ownerDocument === document) r.el.classList.add('coach-target');
  Object.assign(ring.style, { left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
  ring.classList.remove('hidden');
}
setInterval(() => { if (S) renderCoach(); }, 300);
coachBox.addEventListener('click', (e) => {
  const b = e.target.closest('[data-coach]'); if (!b) return;
  const a = b.dataset.coach;
  if (a === 'tip') { tipsSeen.add(b.dataset.key); saveTips(); }
  else if (a === 'skip') finishTutorial();
  else if (a === 'next') { if (coachKey === 'done') finishTutorial(); else nextSeen.add(coachKey); }
  coachKey = ''; renderCoach();
});
// the tutorial is over (done or skipped): every clock starts, and the stages it covered need no tips
function finishTutorial() {
  tutorialOff = true;
  try { localStorage.setItem('tw.tutorialDone', '1'); localStorage.setItem('tw.helpSeen', '1'); } catch {}
  for (const k of ['t-strike', 't-along', 't-move', 't-steal', 't-prep', 't-quiz', 't-council', 't-march']) tipsSeen.add(k);
  saveTips();
  socket.emit('twTutorial', { done: true });
  ring.classList.add('hidden'); document.body.classList.remove('coach-focus');
}

// ------------------------------------------------------------------ messages for my pair: a warband join, where the route went
const notesSeen = new Set(); let notesPrimed = false, noteT = 0;
function renderNotes() {
  const list = S.status === 'playing' ? S.me.notes || [] : [], box = $('notice');
  if (S.status !== 'playing') { box.classList.add('hidden'); return; }
  if (!notesPrimed) { for (const n of list) if (Date.now() + offset - n.at > 15000) notesSeen.add(n.id); notesPrimed = true; }
  const n = list.find((x) => !notesSeen.has(x.id));
  if (!n) { if (!box.dataset.id || !list.some((x) => String(x.id) === box.dataset.id)) box.classList.add('hidden'); return; }
  if (box.dataset.id === String(n.id) && !box.classList.contains('hidden')) return;
  const band = myBand(), canLeave = n.leave && band?.pairs.length > 1 && !band.battle;
  box.dataset.id = n.id;
  box.className = `notice ${n.kind || ''} ${n.kind === 'route' ? (n.go ? 'go' : 'stay') : ''}`;
  setHTML(box, `<p>${esc(n.text)}${n.kind === 'join' ? ' <small>A warband is pairs moving together.</small>' : ''}</p><div class="nt-btns">${canLeave ? '<button type="button" class="btn" data-note="leave">Leave warband</button>' : ''}<button type="button" class="btn primary" data-note="ok">OK</button></div>`);
  clearTimeout(noteT);
  if (n.kind === 'route') noteT = setTimeout(() => { notesSeen.add(n.id); box.classList.add('hidden'); }, 7000);
}
$('notice').addEventListener('click', (e) => {
  const b = e.target.closest('[data-note]'); if (!b) return;
  notesSeen.add(+$('notice').dataset.id); $('notice').classList.add('hidden');
  if (b.dataset.note === 'leave') socket.emit('twLeaveBand');
  render();
});

// ------------------------------------------------------------------ planning: a drawn route is kept on the server
// (sent for the student if the time runs out), the phone shows the time left and closes itself near the end
let draftSent = '';
function syncDraft() {
  if (!isCouncil()) { draftSent = ''; return; }
  const k = routeKey(draft || []);
  if (k === draftSent) return;
  draftSent = k; socket.emit('twDraft', { route: draft || [] });
}
let urgentFor = '';
function councilWatch() {
  if (!S || !isCouncil() || S.training || S.paused) { phone.setStrip(null); return; }
  const left = gameSecondsLeft(S.phaseEndsAt), band = myBand();
  phone.setStrip(phone.isOpen ? `Planning: ${mmss(left)} left` : null, left <= 15);
  const key = `${S.code}:${S.turn}`;
  if (left <= 10 && urgentFor !== key && band && !band.battle) {
    urgentFor = key;
    if (phone.isOpen) { phone.close(); toast(band.plan ? '10 seconds left. Your route is sent.' : '10 seconds left! Plan your route on the map.'); }
    if (!band.plan) { map.pulse(band.node, 'Plan your route'); $('mapHost').classList.add('urgent'); setTimeout(() => $('mapHost').classList.remove('urgent'), 6000); }
  }
}
