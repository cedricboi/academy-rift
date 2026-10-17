// Total War battles on the Academy Rift battle screen.
// The Arena's own page (/?tw=1) runs in a frame over the war map. This bridge gives it a socket that speaks the
// Arena's events (room, answerResult, actionResult…), built from the war's battle state, and turns the Arena's
// answers and moves back into Total War events. So the battle is the Arena's: the same stage, camera zoom-ins,
// question card, answer-along strip, move menu, skill cards, Ultimate cut-ins and cinematics.
import { CHARACTERS } from '../data/characters.js';
import { backdropFor, enemyName } from './stage.js';

const BGS = ['forest', 'bridge', 'ruins', 'lair', 'gate', 'academy'];
const CH = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));
const FLIP = new Set(['moonhart', 'riftglass']);          // drawn facing right
const SIZE = { golem: 1.3, warlord: 1.4, ogre: 1.15, wyvern: 1.15, broodmother: 1.2, moonhart: 1.15, galecrest: 1.15, ferryman: 1.1, mossback: 1.15 };
const SCALE = 100;                                         // war battles count in hits; the Arena shows about 200 a strike
const X = (v) => Math.max(0, Math.round((v || 0) * SCALE));
const KIND = { strike: 'strike', skill: 'spell', ult: 'ultimate', item: 'item' };

export function createArenaBridge({ socket: tw, host }) {
  let frame = null, ready = false, queue = [], handlers = {}, me = null;
  let cur = null;           // the battle being shown: { id, q, qKey, told: {}, roundAt, status }
  let speed = 1;

  const fire = (name, data) => {
    if (!ready) { queue.push([name, data]); return; }
    for (const fn of handlers[name] || []) { try { fn(data); } catch (e) { console.error('arena', name, e); } }
  };
  const fakeSocket = {
    get id() { return me; },
    on(name, fn) { (handlers[name] ||= []).push(fn); },
    emit(name, d = {}) {
      if (name === 'answer' || name === 'shadowAnswer' || name === 'steal') {
        if (cur?.q) tw.emit('twAnswer', { chosen: d.choiceIndex, startedAt: cur.q.startedAt });
      } else if (name === 'action') {
        const act = { kind: d.type === 'spell' ? 'skill' : d.type === 'ultimate' ? 'ult' : d.type };
        if (d.type === 'spell') act.index = d.skillIndex;
        if (d.type === 'item') act.item = d.itemId;
        if (typeof d.targetId === 'string' && d.targetId.startsWith('e')) act.target = +d.targetId.slice(1);
        tw.emit('twAction', act);
      }
    },
  };
  const registered = new WeakMap();
  window.twArena = {
    socket: fakeSocket,
    get me() { return me; },
    stages: BGS.flatMap((n) => [1, 2, 3, 4, 5].map(() => `total-war/art/bg/${n}.webp`)),
    register(TH, type) {
      const set = registered.get(TH) || new Set(); registered.set(TH, set);
      if (set.has(type)) return; set.add(type);
      TH.registerMonster(type, { idle: `total-war/monsters/anim/${type}_idle.webp`, atk: `total-war/monsters/anim/${type}_atk.webp`, idleN: 8, atkN: 9 });
    },
    chibi: (type) => `<div class="chibi spr" style="--n:8;--dur:1100ms;--ax:.5;--bend:${(100 * 8 / 7).toFixed(4)}%"><div class="spr-frame" style="background-image:url(total-war/monsters/anim/${type}_idle.webp)"></div></div>`,
    face: (type) => `total-war/monsters/${type}.png`,
    flip: (type) => FLIP.has(type),
    size: (type) => SIZE[type] || 1,
  };

  function open() {
    if (frame) return;
    ready = false; queue = []; handlers = {};
    frame = document.createElement('iframe');
    frame.className = 'arena-frame';
    frame.title = 'Battle';
    frame.setAttribute('allow', 'autoplay; fullscreen');
    frame.src = '/?tw=1';
    host.appendChild(frame);
    const wait = () => {
      if (!frame) return;
      const w = frame.contentWindow;
      if (w && w.twBusy && handlers.room) { ready = true; const q = queue; queue = []; for (const [n, d] of q) fire(n, d); return; }
      setTimeout(wait, 80);
    };
    wait();
  }
  function close() {
    if (frame) frame.remove();
    frame = null; ready = false; queue = []; handlers = {}; cur = null;
    host.classList.add('hidden');
  }
  const busy = () => { try { return !!frame?.contentWindow?.twBusy?.(); } catch { return false; } };

  // ---------------- the war's battle as an Arena room
  function fighter(S, B, pid, char, name, extra = {}) {
    const c = CH[char] || CH.kuro, f = (B.party || []).find((x) => x.pid === pid);
    const hp = X(B.resolveMax ? B.resolve : 1), maxHp = X(B.resolveMax || 1);
    return {
      uid: pid, team: 0, charId: c.id, name: name || '?', charName: c.name, element: c.element,
      hp, maxHp, sp: f?.sp ?? 0, maxSp: f?.maxSp ?? 100, alive: hp > 0, skills: c.skills, ultimate: c.ultimate, cooldowns: {}, items: {}, ...extra,
    };
  }
  function foes(B) {
    const idx = B.enemies.map((e, i) => i);
    // the wave in front of the warband (one enemy, sometimes two); the rest wait their turn off stage
    const wave = idx.filter((i) => B.enemies[i].wave && B.enemies[i].hp > 0);
    const alive = idx.filter((i) => B.enemies[i].hp > 0), dead = idx.filter((i) => B.enemies[i].hp <= 0);
    return (wave.length ? wave : [...alive, ...dead].slice(0, 1)).slice(0, 2).map((i) => {
      const e = B.enemies[i];
      return { uid: `e${i}`, team: 1, charId: `m:${e.type}`, monster: true, name: 'Crimson Host', charName: enemyName(e.type), element: 'Dark',
        hp: X(Math.max(0, e.hp)), maxHp: X(e.max), sp: 0, maxSp: 1, alive: e.hp > 0, skills: [], cooldowns: {}, items: {} };
    });
  }
  function roomOf(S, B) {
    const myChar = B.me?.char || S.me.char;
    const moves = B.moves;
    const meC = fighter(S, B, me, myChar, S.me.name, {
      cooldowns: moves ? Object.fromEntries(moves.skills.map((k) => [k.i, k.cd])) : {},
      items: Object.fromEntries(Object.entries(S.me.bag || {}).filter(([id, n]) => n > 0 && id !== 'notes')),
      ...(moves ? { sp: moves.sp, maxSp: moves.maxSp } : {}),
    });
    // beside you: whoever has the turn, else your partner, else another fighter in the battle
    const turn = B.choose?.pid || B.striker?.pid || null;
    const party = B.party || [];
    const pick = (turn && turn !== me && party.find((f) => f.pid === turn))
      || party.find((f) => f.pid !== me && f.pairNo === S.me.pairNo) || party.find((f) => f.pid !== me) || null;
    const allies = [meC];
    if (pick) allies.push(fighter(S, B, pick.pid, pick.char, pick.name));
    const phase = B.status === 'fight' && B.question ? 'question'
      : B.status === 'choose' ? (B.choose.half ? 'steal-action' : 'action') : 'done';
    const battle = {
      combatants: [...allies, ...foes(B)], phase, current: phase === 'question' ? B.striker?.pid : phase === 'action' ? B.choose.pid : (B.choose?.striker?.pid || B.striker?.pid || null),
      stealActor: phase === 'steal-action' ? B.choose.pid : null, stealOf: phase === 'steal-action' ? B.choose.striker?.pid : null,
      question: cur?.q || null, sync: [B.sync || 0, 0], msLeft: null,
      stage: Math.max(0, BGS.indexOf(backdropFor(B.node, B.kind))), stageLevel: 1,
      label: B.qNo ? `QUESTION ${B.qNo} OF ${B.limit}` : '',
    };
    const players = [{ id: me, team: 0, name: S.me.name, character: myChar }, ...party.filter((f) => f.pid !== me).map((f) => ({ id: f.pid, team: 0, name: f.name, character: f.char }))];
    return { code: S.code, status: 'battle', serverNow: S.serverNow, players, battle };
  }

  // ---------------- each war update
  function feed(S) {
    const B = S?.myBattle;
    if (!B || !S.me) { if (frame && !busy()) close(); return false; }
    me = S.me.pid; speed = S.speed || 1;
    const live = B.status === 'fight' || B.status === 'choose' || B.status === 'result' || (cur?.id === B.id && (B.status === 'over' && busy()));
    if (!frame && (B.status === 'gather' || live)) open();          // the Arena page loads during the gather
    if (!cur || cur.id !== B.id) cur = { id: B.id, q: null, qKey: '', told: {}, roundAt: B.round?.at || 0, started: false };

    if (B.status === 'fight' && B.question) {
      const key = `${B.question.startedAt}`;
      if (key !== cur.qKey) {
        const q = B.question;
        cur.qKey = key; cur.told = {};
        if (q.cheat != null) window.__cheat = q.cheat;
        cur.q = { q: q.q, choices: q.choices, topic: q.topic, image: q.image, startedAt: q.startedAt, recall: q.recall / speed, seconds: (q.recall + q.seconds) / speed };
      }
    }
    // the question is over: who was right, and the right answer, before the turn moves on (as in the Arena)
    if ((B.status === 'choose' || B.status === 'result') && cur.q && !cur.told.reveal) {
      const right = B.choose?.right || B.round?.right || [];
      const strikerPid = B.choose?.striker?.pid || B.round?.striker?.pid;
      const stealPid = B.choose ? (B.choose.half ? B.choose.pid : null) : B.round?.stealer?.pid;
      const struck = B.choose ? !B.choose.half : !!B.round?.strike;
      cur.told.reveal = true;
      fire('answerReveal', { correctAll: right });
      if (!cur.told[strikerPid]) fire('answerResult', { uid: strikerPid, correct: struck, correctAll: struck ? right : null });
      cur.told[strikerPid] = true;
      if (stealPid) fire('stealResult', { uid: stealPid, correct: true, correctAll: right });
    }
    const room = roomOf(S, B);
    // a move was played: the cinematic, then the Crimson hitting back
    if (B.round && B.round.at !== cur.roundAt && (B.status === 'result' || B.status === 'over')) {
      cur.roundAt = B.round.at;
      const r = B.round, a = r.action, tgt = `e${r.target ?? 0}`;
      if (a) {
        const events = [];
        if (r.mainHits > 0) events.push({ target: tgt, dmg: X(r.mainHits), ko: (r.enemiesAfter?.[r.target]?.hp ?? 1) <= 0 });
        if (r.heal > 0) events.push({ target: a.pid, heal: X(r.heal) });
        if (a.kind === 'skill') {
          const sk = CH[a.char]?.skills[a.index];
          if (sk?.kind === 'guard') events.push({ kind: 'guard', target: a.pid });
          if (sk?.kind === 'buff') events.push({ kind: 'buff', target: a.pid, eff: 'atk' });
          if (sk?.kind === 'debuff') events.push({ kind: 'debuff', target: tgt, eff: 'atk' });
        }
        if (r.stunned) events.push({ kind: 'stun', target: tgt });
        fire('actionResult', { actor: a.pid, action: KIND[a.kind] || 'strike', name: a.name, events });
      }
      fire('room', room);
      if (r.counterTotal > 0 || r.stunned) fire('twCounter', { actor: a?.pid || me, from: tgt, dmg: X(r.counterTotal), blocked: Math.round((r.guard || 0) * 100), stunned: !!r.stunned });
    } else fire('room', room);
    if (!cur.started && live) { cur.started = true; fire('battleStart', {}); }
    host.classList.toggle('hidden', !live);
    return live;
  }

  // the student whose turn it is hears straight away whether they were right
  tw.on('twBattleAnswered', (r) => {
    if (!r?.striker || !cur || `${r.startedAt}` !== cur.qKey) return;
    cur.told[me] = true;
    fire('answerResult', { uid: me, correct: r.ok, correctIndex: r.ok ? r.chosen : null });
  });

  return { feed, close, busy, get open() { return !!frame && !host.classList.contains('hidden'); } };
}
