// The Moonveil map, drawn the same way on the student iPad, the teacher's command screen and the projector:
// the painted map, roads, fog of war, stops you can step to, and banners (pairs, warbands, the Crimson Host, camps).
import { NODES, routePoints } from './movement.js';
import { CAMPS, UNITS, FORTRESS, HOME, neighbours, cost } from './rules.js';
import { bannerFor, PORTRAITS } from './banners.js';

export const W = 1440, H = 900;
export const portrait = (char) => `portraits/${PORTRAITS[char] || 'K'}.webp`;
export const sprite = (type) => `monsters/${type}.png`;
export const charColor = (char) => bannerFor(char).color;
// Replace an element's contents only when they changed, so a tap is never lost to a redraw
export const setHTML = (el, html) => { if (el._html !== html) { el.innerHTML = html; el._html = html; } };
export const SWORDS = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 4l11 11M15 15l3-1-1 3M20 4L9 15M9 15l-3-1 1 3M6 18l-2 2M18 18l2 2"/></svg>';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createMap(host, { onStop, onBanner, top = 40, bottom = 0 } = {}) {
  host.classList.add('twmap-frame');
  host.innerHTML = `<div class="twmap"><img class="twmap-art" src="art/moonveil-map.webp" alt="" draggable="false">
    <svg class="twmap-roads" viewBox="0 0 ${W} ${H}" aria-hidden="true"></svg>
    <canvas class="twmap-fog" width="${W / 2}" height="${H / 2}" aria-hidden="true"></canvas>
    <div class="twmap-stops"></div><div class="twmap-banners"></div></div>`;
  const map = host.querySelector('.twmap'), roads = host.querySelector('.twmap-roads'), fog = host.querySelector('.twmap-fog');
  const stops = host.querySelector('.twmap-stops'), layer = host.querySelector('.twmap-banners');
  const els = new Map();       // banner key -> element, kept so banners glide when they move
  let scale = 1;
  function fit() {
    const r = host.getBoundingClientRect();
    const room = Math.max(100, r.height - top - bottom);           // keep space for banners above the top stops (and any bottom bar)
    scale = Math.min(r.width / W, room / H) || 1;
    map.style.transform = `translate(${(r.width - W * scale) / 2}px, ${top + (room - H * scale) / 2}px) scale(${scale})`;
  }
  new ResizeObserver(fit).observe(host); fit();

  stops.addEventListener('click', (e) => { const b = e.target.closest('[data-stop]'); if (b && onStop) onStop(+b.dataset.stop); });
  layer.addEventListener('click', (e) => { const b = e.target.closest('[data-key]'); if (b && onBanner) onBanner(b.dataset.kind, b.dataset.ref, +b.dataset.node); });

  function drawFog(visible) {
    const g = fog.getContext('2d'); g.clearRect(0, 0, fog.width, fog.height);
    if (!visible) return;
    g.fillStyle = 'rgba(6,10,18,0.74)'; g.fillRect(0, 0, fog.width, fog.height);
    g.globalCompositeOperation = 'destination-out';
    for (const n of visible) {
      const { x, y } = NODES[n], gr = g.createRadialGradient(x / 2, y / 2, 10, x / 2, y / 2, 58);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.65, 'rgba(0,0,0,0.9)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x / 2, y / 2, 58, 0, Math.PI * 2); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }

  // banners: {key, kind:'pair'|'host'|'camp'|'fortress', node, ...}
  function placeBanners(list) {
    const seen = new Set();
    const byNode = new Map();
    for (const b of list) { if (!byNode.has(b.node)) byNode.set(b.node, []); byNode.get(b.node).push(b); }
    for (const [node, group] of byNode) group.forEach((b, i) => {
      const n = NODES[node], off = (i - (group.length - 1) / 2) * 44;
      const x = n.x + off, y = n.y - 4;
      let el = els.get(b.key);
      if (!el) { el = document.createElement('button'); el.type = 'button'; layer.appendChild(el); els.set(b.key, el); el.style.left = `${x}px`; el.style.top = `${y}px`; }
      const cls = `tw-banner ${b.kind}${b.small ? ' small' : ''}${b.glow ? ' glow' : ''}${b.dim ? ' dim' : ''}`;
      if (el.className !== cls) el.className = cls;
      el.dataset.key = b.key; el.dataset.kind = b.kind; el.dataset.ref = b.ref ?? ''; el.dataset.node = node;
      el.setAttribute('aria-label', b.label || '');
      if (el._html !== b.html) { el.innerHTML = b.html; el._html = b.html; }
      el.style.left = `${x}px`; el.style.top = `${y}px`;
      seen.add(b.key);
    });
    for (const [k, el] of els) if (!seen.has(k)) { el.remove(); els.delete(k); }
  }

  function render({ state, mine = null, options = [], route = null, selected = null, full = false, votes = {} }) {
    // roads of the chosen step
    roads.innerHTML = route ? `<polyline points="${route.map(([x, y]) => `${x},${y}`).join(' ')}" class="road-shadow"/><polyline points="${route.map(([x, y]) => `${x},${y}`).join(' ')}" class="road-line"/>` : '';
    drawFog(full ? null : state.visible);
    // stops a warband can step to next
    const stopsHtml = options.map((o) => {
      const n = NODES[o.node], vc = votes[o.node] ? `<i class="vote-count">${votes[o.node]}</i>` : '';
      return `<button type="button" class="tw-stop ${o.attack ? 'attack' : ''} ${o.mine ? 'mine' : ''}" data-stop="${o.node}" style="left:${n.x}px;top:${n.y + 26}px" aria-label="${esc(n.name)}, ${o.cost} MP${o.attack ? ', attack' : ''}">${o.attack ? SWORDS : o.cost}${vc}</button>`;
    }).join('');
    if (stops._html !== stopsHtml) { stops.innerHTML = stopsHtml; stops._html = stopsHtml; }
    const list = [];
    // jungle camps (neutral landmarks: always shown)
    for (const c of state.camps) {
      const info = CAMPS[c.node];
      list.push({ key: `camp${c.node}`, kind: 'camp', ref: c.node, node: c.node, small: true, dim: !c.alive, glow: selected === `camp${c.node}`, label: info.name,
        html: `<span class="cloth"><img src="${sprite(info.id)}" alt=""></span><span class="pole"></span><span class="tag">${esc(info.name.split(' ')[0])}${c.alive ? '' : ' · beaten'}</span>` });
    }
    // the Crimson Fortress gate / Warlord
    const fortressUnits = state.units.filter((u) => u.node === FORTRESS);
    const gateType = state.gate.broken ? 'warlord' : 'golem';
    list.push({ key: 'fortress', kind: 'fortress', ref: 'fortress', node: FORTRESS, glow: selected === 'fortress', label: 'Crimson Fortress',
      html: `<span class="cloth"><img src="${sprite(gateType)}" alt=""></span>${fortressUnits.length ? `<i class="count">+${fortressUnits.length}</i>` : ''}<span class="pole"></span><span class="tag">${state.gate.broken ? (state.warlord?.out ? 'The Warlord' : 'Gate broken') : 'Fortress gate'}</span>` });
    // the Crimson Host, one banner per stop
    const stacks = new Map();
    for (const u of state.units) if (u.node !== FORTRESS) { if (!stacks.has(u.node)) stacks.set(u.node, []); stacks.get(u.node).push(u); }
    for (const [node, us] of stacks) {
      const lead = [...us].sort((a, b) => (UNITS[b.type].hp - UNITS[a.type].hp))[0];
      list.push({ key: `host${node}`, kind: 'host', ref: node, node, glow: selected === `host${node}`, label: `${us.length} Crimson units`,
        html: `<span class="cloth"><img src="${sprite(lead.type)}" alt=""></span>${us.length > 1 ? `<i class="count">×${us.length}</i>` : ''}<span class="pole"></span><span class="tag">${us.length > 1 ? 'Crimson warband' : esc(UNITS[lead.type].name.split(' ').slice(-1)[0])}</span>` });
    }
    // Crystal banners: one per warband
    for (const b of state.bands) {
      const lead = b.pairs[0]; if (!lead) continue;
      const isMine = mine && b.id === mine;
      list.push({ key: `band${b.id}`, kind: 'pair', ref: b.id, node: b.node, glow: isMine || selected === `band${b.id}`, label: `Pair ${lead.no}`,
        html: `<span class="cloth" style="--c:${charColor(lead.char)}"><img src="${portrait(lead.char)}" alt=""></span>${b.pairs.length > 1 ? `<i class="count light">×${b.pairs.length}</i>` : ''}${b.battle ? `<i class="fight">${SWORDS}</i>` : ''}<span class="pole"></span><span class="tag">${isMine ? (b.pairs.length > 1 ? 'Your warband' : 'You') : b.pairs.length > 1 ? 'Warband' : `Pair ${lead.no}`}</span>` });
    }
    placeBanners(list);
  }
  return { render, fit };
}

// The road between two stops, for drawing a planned step
export const roadPoints = (a, b) => routePoints([a, b]).map((q) => [q.x ?? q[0], q.y ?? q[1]]);

// The stops a warband may step to right now (one road at a time)
export function stepOptions(state, band) {
  if (!band || band.done || band.battle || state.phase !== 'crystal') return [];
  const occupied = (n) => state.units.some((u) => u.node === n) || state.camps.some((c) => c.node === n && c.alive) || n === FORTRESS;
  return neighbours(band.node).filter((n) => cost(band.node, n) <= band.mp)
    .filter((n) => !(n === FORTRESS && state.gate.broken && !state.warlord?.out))
    .map((n) => ({ node: n, cost: cost(band.node, n), attack: occupied(n) }));
}
export { esc, HOME, FORTRESS };
