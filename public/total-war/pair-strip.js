// The strip along the bottom of a battle: one card per pair in the fight, so every pair can see what it (and every other
// pair) is doing. Each card: the pair's portrait, its number ("You" for your own), its HP on the 100-HP scale, the
// monster it is engaging, what it is doing this question, and the damage it has dealt this battle, with a "+N" pop
// when its hit lands. On its left, the monsters on the field: tap one to engage it (when there is more than one).
// Used by the battle screen on the iPads (arena-bridge.js) and by the projector's battle panel.
import { portrait, charColor, esc } from './map.js';
import { enemyName } from './stage.js';

const X = (v) => Math.max(0, Math.round((+v || 0) * 10));          // one HP scale everywhere: 10 inside the game shows as 100
const STATE = {
  ready: ['', 'Ready'], answering: ['…', 'Answering'], answered: ['✓', 'Locked in'], turn: ['★', 'Their turn'],
  right: ['✓', 'Right'], wrong: ['✗', 'Wrong'], none: ['–', 'No answer'], striking: ['⚔', 'Striking'],
  stole: ['⚡', 'Stole the turn'], struck: ['⚔', 'Hit!'],
};
const face = (type) => `monsters/${type}.png`;
const short = (type) => { const n = enemyName(type).replace(/^(The |Crimson |Riftborn |Riftweaver |Ironhide |Emberfang |Ember |Hollow |Bloodstone )/, ''); return n.length > 14 ? n.split(' ').slice(-1)[0] : n; };

export function createPairStrip(host, { onPick = null, projector = false } = {}) {
  const el = document.createElement('div');
  el.className = `tws hidden${projector ? ' proj' : ''}`;
  el.innerHTML = '<div class="tws-rf hidden"></div><div class="tws-foes"></div><div class="tws-pairs"></div><div class="tws-pops" aria-hidden="true"></div><div class="tws-note hidden" role="status"></div>';
  host.appendChild(el);
  const rfEl = el.querySelector('.tws-rf'), foesEl = el.querySelector('.tws-foes'), pairsEl = el.querySelector('.tws-pairs'), popsEl = el.querySelector('.tws-pops'), noteEl = el.querySelector('.tws-note');
  let lastRound = 0, battleId = null, noteKey = '', noteT = 0, htmlF = '', htmlP = '', htmlR = '', joinSeen = 0;
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-engage]'); if (b && onPick && !b.disabled) onPick(+b.dataset.engage); });

  function pop(no, n) {
    const card = pairsEl.querySelector(`[data-no="${no}"]`); if (!card || n <= 0) return;
    card.classList.remove('hit'); void card.offsetWidth; card.classList.add('hit');
    const p = document.createElement('b'); p.className = 'tws-pop'; p.textContent = `+${n}`;
    const r = card.getBoundingClientRect(), o = el.getBoundingClientRect();
    p.style.left = `${r.left - o.left + r.width / 2}px`; p.style.top = `${r.top - o.top}px`;
    popsEl.appendChild(p); setTimeout(() => p.remove(), 2300);
  }
  function note(text, key) {
    if (!text || key === noteKey) return;
    noteKey = key; noteEl.textContent = text; noteEl.classList.remove('hidden');
    clearTimeout(noteT); noteT = setTimeout(() => noteEl.classList.add('hidden'), 4500);
  }

  // B: the battle as the server sends it (pairs, enemies, targetable, round). meNo: this student's pair number (null
  // on the projector). delay: ms to wait before the "+N" pops (so they land with the hit in the cinematic).
  function render(B, meNo = null, { delay = 1200, mePid = null } = {}) {
    const on = !!B && Array.isArray(B.pairs) && B.pairs.length > 0 && B.status !== 'gather';
    el.classList.toggle('hidden', !on);
    if (!on) { battleId = null; return false; }
    if (battleId !== B.id) { battleId = B.id; lastRound = B.round?.at || 0; noteKey = ''; popsEl.innerHTML = ''; joinSeen = Math.max(0, ...(B.reinforce?.joins || []).map((j) => j.at)); }
    // pairs that joined from elsewhere (reinforcements): the bonus their right answers gave on the last question
    const R = B.reinforce;
    const hr = R ? `<b>REINFORCED</b>${R.last?.pairs ? `<span>+${Math.round(R.last.atk * 100)}% attack</span><span>−${Math.round(R.last.guard * 100)}% damage taken</span>`
      : `<span>${R.pairs.map((n) => `Pair ${n}`).join(', ')} joined</span><small>Their right answers: more attack, less damage taken</small>`}` : '';
    if (hr !== htmlR) { htmlR = hr; rfEl.innerHTML = hr; }
    rfEl.classList.toggle('hidden', !R);
    rfEl.classList.toggle('on', !!R?.last?.pairs);
    // a pair joined the battle: say so once, to everyone in it
    const fresh = (R?.joins || []).filter((j) => j.at > joinSeen);
    if (fresh.length) { joinSeen = Math.max(...fresh.map((j) => j.at)); const j = fresh.at(-1); note(j.no === meNo ? 'You joined this battle! Your right answers make the warband hit harder and take less damage.' : `Pair ${j.no} joined your battle! While they answer right, you hit harder and take less damage.`, `join:${j.at}`); }
    const field = (B.targetable || []).filter((i) => B.enemies[i]?.hp > 0);
    const mine = B.pairs.find((p) => p.no === meNo);
    const pick = !projector && field.length > 1 && B.status !== 'over';
    el.classList.toggle('picking', pick);
    el.classList.toggle('dense', B.pairs.length > 5);
    // the monsters on the field (and who fights each): tap one to engage it
    const showFoes = projector ? field.length > 0 : pick;
    const hf = showFoes ? `${pick ? '<div class="tws-h">YOUR MONSTER<small>Tap to change</small></div>' : ''}${field.map((i) => {
      const e = B.enemies[i], me = mine?.target === i, on = (e.on || []);
      return `<button type="button" class="tws-foe ${me ? 'mine' : ''}" data-engage="${i}" ${projector ? 'disabled' : ''} aria-pressed="${me}" title="${esc(enemyName(e.type))}">
        <img src="${face(e.type)}" alt=""><span class="tf-n">${esc(short(e.type))}</span>
        <i class="tf-hp"><b style="width:${Math.max(0, Math.min(100, (e.hp / e.max) * 100))}%"></b></i>
        <small>${on.length ? on.map((n) => (n === meNo ? 'You' : `P${n}`)).join(' ') : 'Nobody'}</small></button>`;
    }).join('')}` : '';
    if (hf !== htmlF) { htmlF = hf; foesEl.innerHTML = hf; }
    foesEl.classList.toggle('hidden', !showFoes);
    // one card per pair; your own pair first
    const list = [...B.pairs].sort((a, b) => (b.no === meNo) - (a.no === meNo) || a.no - b.no);
    const hp = (p) => Math.max(0, Math.min(100, (p.hp / (p.max || 10)) * 100));
    const hp2 = list.map((p) => {
      const me = p.no === meNo, [ic, word] = me && p.state === 'turn' ? ['★', B.striker?.pid === mePid ? 'Your turn' : 'Partner\'s turn'] : STATE[p.state] || STATE.ready;
      const foe = Number.isInteger(p.target) ? B.enemies[p.target] : null;
      return `<div class="tws-card ${me ? 'me' : ''} ${p.guest ? 'guest' : ''} st-${p.state} ${p.hp <= 0 ? 'ko' : ''}" data-no="${p.no}" title="Pair ${p.no}: ${esc(p.names.join(' & '))}${p.guest ? ' (joined to help)' : ''}">
        <img class="tws-face" src="${portrait(p.char)}" alt="" style="--c:${charColor(p.char)}">
        <div class="tws-body">
          <div class="tws-top"><b>${me ? 'YOU' : `P${p.no}`}${p.guest ? '<em class="tws-g" title="Joined this battle to help">JOINED</em>' : ''}</b><span class="tws-st" title="${word}">${ic ? `<i>${ic}</i>` : ''}<span class="w">${word}</span></span></div>
          <div class="tws-hp ${hp(p) < 34 ? 'low' : ''}"><i><b style="width:${hp(p)}%"></b></i><em>${X(p.hp)}</em></div>
          <div class="tws-bot">${foe ? `<img class="tws-mon" src="${face(foe.type)}" alt="" title="${esc(enemyName(foe.type))}"><span class="tws-mn">${esc(short(foe.type))}</span>` : '<span class="tws-mn">-</span>'}<span class="tws-dmg" title="Damage dealt this battle">⚔ ${X(p.dealt)}</span></div>
        </div></div>`;
    }).join('');
    if (hp2 !== htmlP) { htmlP = hp2; pairsEl.innerHTML = hp2; }
    // a new move landed: "+N" over every pair that dealt damage
    const r = B.round;
    if (r && r.at !== lastRound && (B.status === 'result' || B.status === 'over')) {
      lastRound = r.at;
      const hits = Object.entries(r.dealt || {}).map(([no, d]) => [+no, X(d)]).filter(([, n]) => n > 0);
      setTimeout(() => { for (const [no, n] of hits) pop(no, n); }, delay);
    }
    // your monster fell (or you were given one): say so once (a join just announced is shown first)
    if (mine?.moved && !projector && !fresh.length && Date.now() - joinSeen > 4500) note(mine.moved.text, `${B.id}:${mine.moved.at}`);
    return true;
  }
  return { el, render, hide: () => { el.classList.add('hidden'); battleId = null; }, get height() { return el.classList.contains('hidden') ? 0 : el.offsetHeight; } };
}
