// The Moonveil map, drawn the same way on the student iPad, the teacher's command screen and the projector:
// the painted map, roads, fog of war, stops you can step to, and banners (pairs, warbands, the Crimson Host, camps).
import { NODES, routePoints, positionAt } from './movement.js';
import { CAMPS, UNITS, FORTRESS, HOME, neighbours, cost, stepTowards, plainName, BIG_TEAM } from './rules.js';
import { bannerFor, PORTRAITS } from './banners.js';

export const W = 1440, H = 900;
export const portrait = (char) => `portraits/${PORTRAITS[char] || 'K'}.webp`;
export const sprite = (type) => `monsters/${type}.png`;
export const charColor = (char) => bannerFor(char).color;
// Replace an element's contents only when they changed, so a tap is never lost to a redraw
export const setHTML = (el, html) => { if (el._html !== html) { el.innerHTML = html; el._html = html; } };
export const CRYSTAL = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M12 2l6 7-6 13-6-13z" fill="#7ff3e4" stroke="#e8fffb" stroke-width="1.2"/><path d="M6 9h12M12 2v20" stroke="#2a9d93" stroke-width="1"/></svg>';
export const TOWER = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M8 22l1.5-12h5L16 22z" fill="#c9b27a" stroke="#3a2a10" stroke-width="1.2"/><path d="M7 10h10l-1-3H8z" fill="#8a6a3a" stroke="#3a2a10" stroke-width="1.2"/><path d="M9 7l3-5 3 5z" fill="#d94b5c" stroke="#3a2a10" stroke-width="1.2"/><rect x="10.8" y="13" width="2.4" height="3" fill="#ffe28a"/></svg>';
export const SWORDS = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 4l11 11M15 15l3-1-1 3M20 4L9 15M9 15l-3-1 1 3M6 18l-2 2M18 18l2 2"/></svg>';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createMap(host, { onStop, onBanner, top = 40, bottom = 0, box = null, left = 0, right = 0 } = {}) {
  host.classList.add('twmap-frame');
  host.innerHTML = `<div class="twmap"><img class="twmap-art" src="art/moonveil-map.webp" alt="" draggable="false">
    <svg class="twmap-roads" viewBox="0 0 ${W} ${H}" aria-hidden="true"></svg>
    <canvas class="twmap-fog" width="${W / 2}" height="${H / 2}" aria-hidden="true"></canvas>
    <div class="twmap-places"></div><div class="twmap-stops"></div><div class="twmap-banners"></div><div class="twmap-riders"></div></div>
    <div class="twmap-legend hidden" aria-label="What the map shows"></div>`;
  const map = host.querySelector('.twmap'), roads = host.querySelector('.twmap-roads'), fog = host.querySelector('.twmap-fog');
  const places = host.querySelector('.twmap-places'), legend = host.querySelector('.twmap-legend');
  const stops = host.querySelector('.twmap-stops'), layer = host.querySelector('.twmap-banners'), riderLayer = host.querySelector('.twmap-riders');
  const els = new Map();       // banner key -> element, kept so banners glide when they move
  let scale = 1, panX = 0, panY = 0, focus = null, focusedOn = null, userPanned = false;
  let lastFog = null;
  let lastList = null, placedAt = 0;   // the banners last placed, and the zoom they were placed at
  let mineBand = null;                 // the student's own pair (its stop's ring is gold)
  const hideFoes = new Map();          // stop -> until when its enemy banner stays hidden (an enemy is still walking there)
  function setBottom(b) { if (b !== bottom) { bottom = b; legend.style.bottom = `${(b || 0) + 8}px`; fit(); } }
  // the projector: fit the part of the map with the stops on it (box) inside the screen, less any side panels
  function setInsets(o = {}) { let ch = false; for (const [k, v] of Object.entries(o)) { if (k === 'left' && v !== left) { left = v; ch = true; } if (k === 'right' && v !== right) { right = v; ch = true; } if (k === 'top' && v !== top) { top = v; ch = true; } if (k === 'bottom' && v !== bottom) { bottom = v; ch = true; } } if (ch) fit(); }
  // The whole map always fits, so the Crimson Fortress (the goal) is never off-screen, even on a tall iPad.
  // If a screen is ever too small for it, the map can still be dragged with a finger.
  function fit() {
    const r = host.getBoundingClientRect();
    if (box) {
      const bw = box[2] - box[0], bh = box[3] - box[1], aw = Math.max(100, r.width - left - right), ah = Math.max(100, r.height - top - bottom);
      scale = Math.min(aw / bw, ah / bh) || 1;
      const x = left + (aw - bw * scale) / 2 - box[0] * scale, y = top + (ah - bh * scale) / 2 - box[1] * scale;
      map.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
      map.style.setProperty('--inv', String(1 / (scale || 1)));
      return;
    }
    const room = Math.max(100, r.height - top - bottom);           // keep space for banners above the top stops (and any bottom bar)
    const contain = Math.min(r.width / W, room / H) || 1;
    scale = contain;
    const mw = W * scale, mh = H * scale;
    let x, y;
    if (mw <= r.width) x = (r.width - mw) / 2;
    else {
      if (focus != null && (!userPanned || focusedOn !== focus)) { panX = r.width / 2 - NODES[focus].x * scale; focusedOn = focus; userPanned = false; }
      else if (focus == null && !userPanned) panX = (r.width - mw) / 2;
      x = Math.min(0, Math.max(r.width - mw, panX)); panX = x;
    }
    if (mh <= room) y = top + (room - mh) / 2;
    else { y = Math.min(top, Math.max(top + room - mh, panY)); panY = y; }
    map.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    map.style.setProperty('--inv', String(1 / (scale || 1)));             // stops and banners keep a finger-sized size at any zoom
    if (lastList && Math.abs(scale - placedAt) > 1e-6) placeBanners(lastList);   // the banners' feet follow the stop circles' size
  }
  new ResizeObserver(fit).observe(host); fit();
  // dragging the map (a drag never counts as a tap on a stop or banner)
  let drag = null, dragged = false;
  host.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, px: panX, py: panY }; dragged = false; });
  host.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!dragged && Math.hypot(dx, dy) < 10) return;
    if (box) return;
    dragged = true; userPanned = true; panX = drag.px + dx; panY = drag.py + dy; fit();
  });
  const endDrag = () => { drag = null; };
  host.addEventListener('pointerup', endDrag); host.addEventListener('pointercancel', endDrag);
  host.addEventListener('click', (e) => { if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; } }, true);
  host.style.touchAction = 'none';

  stops.addEventListener('click', (e) => { const b = e.target.closest('[data-stop]'); if (b && onStop) onStop(+b.dataset.stop); });
  layer.addEventListener('click', (e) => { const b = e.target.closest('[data-key]'); if (b && onBanner) onBanner(b.dataset.kind, b.dataset.ref, +b.dataset.node); });

  function drawFog(visible) {
    const key = visible ? visible.join(',') : '';
    if (key === lastFog) return;                                     // redraw the fog only when what the class sees changes
    lastFog = key;
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

  // Every stop has one spot on the map: its circle, just above the stop's name (a glowing circle when the stop can be
  // reached, else a faint ring in the Basic game). A banner stands ON that circle: its pole's foot is planted in the top of
  // the circle, so the banner, the circle and the name below it always read as one stop.
  const footY = (node) => stopFoot(node, scale);
  // a banner moving one road (or a few) eases along the road's curves and settles on its stop
  function glide(el, from, to, x, y, path = null) {
    const pts = routePoints(path || [from, to]);
    let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const dur = Math.max(900, Math.min(path ? 2600 : 1700, len * 6)), t0 = performance.now();
    // the banner starts where it stands now and ends where it will stand (its place in a stack on the new stop)
    const sx = (parseFloat(el.style.left) || pts[0].x) - pts[0].x, sy = (parseFloat(el.style.top) || pts[0].y) - pts[0].y;
    const ex = x - pts.at(-1).x, ey = y - pts.at(-1).y;
    const token = (el._glide || 0) + 1; el._glide = token;             // a newer glide replaces this one
    el._gliding = true; el.style.transition = 'none'; el.classList.add('marching');
    const step = (t) => {
      if (el._glide !== token) return;
      const k = Math.min(1, (t - t0) / dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const p = positionAt(pts, e * len);
      el.style.left = `${p.x + sx + (ex - sx) * e}px`; el.style.top = `${p.y + sy + (ey - sy) * e}px`;
      if (k < 1) requestAnimationFrame(step);
      else { el._gliding = false; el.style.transition = ''; el.classList.remove('marching'); if (el._to) { el.style.left = `${el._to[0]}px`; el.style.top = `${el._to[1]}px`; } }
    };
    requestAnimationFrame(step);
    return dur;
  }

  // banners: {key, kind:'pair'|'host'|'camp'|'fortress', node, ...}
  function placeBanners(list) {
    lastList = list; placedAt = scale;
    const seen = new Set();
    const byNode = new Map();
    for (const b of list) { if (!byNode.has(b.node)) byNode.set(b.node, []); byNode.get(b.node).push(b); }
    // several banners on one stop: one label for the stack (yours if you are there), so the words never pile up
    const lead = (group) => group.find((b) => b.glow && b.kind === 'pair') || group.find((b) => b.kind === 'pair') || group[0];
    for (const [node, group] of byNode) { const top = lead(group);
      // side by side on the stop, in the order given (the enemy and the fortress first, then the pairs), centred on it
      const spots = stackSpots(node, group, scale);
      group.forEach((b, i) => {
      const n = NODES[node], { x, y } = spots[i];
      let el = els.get(b.key);
      if (!el) {
        el = document.createElement('button'); el.type = 'button'; layer.appendChild(el); els.set(b.key, el); el.style.left = `${x}px`; el.style.top = `${y}px`; el._node = node;
        if (primed && b.rise) { el._rise = true; setTimeout(() => { el._rise = false; el.classList.remove('rise'); }, 1600); }      // a standard rises where the class has just won
      }
      const hidden = b.kind === 'host' && (hideFoes.get(node) || 0) > performance.now();
      const cls = `tw-banner ${b.kind}${b.small ? ' small' : ''}${b.mineBig ? ' mine' : ''}${b.glow ? ' glow' : ''}${b.dim ? ' dim' : ''}${b.far ? ' far' : ''}${b.secured ? ' won' : ''}${el._rise ? ' rise' : ''}${hidden ? ' arriving' : ''}${group.length > 1 ? (b !== top ? ' stacked' : ' lead') : ''}`;
      if (el.className !== cls) el.className = cls;
      el.dataset.key = b.key; el.dataset.kind = b.kind; el.dataset.ref = b.ref ?? ''; el.dataset.node = node;
      el.setAttribute('aria-label', b.label || '');
      if (el._html !== b.html) { el.innerHTML = b.html; el._html = b.html; }
      if (el._node !== node && el._node != null && b.kind === 'pair' && neighbours(el._node).includes(node)) glide(el, el._node, node, x, y);
      else if (!el._gliding) { el.style.left = `${x}px`; el.style.top = `${y}px`; }
      el._node = node; el._to = [x, y];
      seen.add(b.key);
    }); }
    for (const [k, el] of els) if (!seen.has(k)) { el.remove(); els.delete(k); }
    primed = true;
  }
  let primed = false;

  // Grab-Ma on her scooter, gliding along the roads between stops (the server says which road and when)
  const rEls = new Map(), roadCache = new Map();
  let riders = [], skew = 0, raf = 0, me = null;
  const roadOf = (a, b) => {
    const k = `${a},${b}`; if (roadCache.has(k)) return roadCache.get(k);
    const pts = a === b ? [NODES[a], NODES[a]] : routePoints([a, b]);
    let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const v = { pts, len }; roadCache.set(k, v); return v;
  };
  function drawRiders() {
    const now = Date.now() + skew;
    for (const r of riders) {
      const el = rEls.get(r.id); if (!el) continue;
      let x = NODES[r.node].x, y = NODES[r.node].y, dx = 1;
      if (r.status === 'cooking') { x = NODES[HOME].x + 34; y = NODES[HOME].y + 22; }
      else if (r.status === 'riding' && r.from !== r.node) {
        const t = Math.max(0, Math.min(1, (now - r.departAt) / Math.max(1, r.arriveAt - r.departAt)));
        const road = roadOf(r.from, r.node), p = positionAt(road.pts, t * road.len);
        x = p.x; y = p.y; dx = p.dx;
      }
      el.style.left = `${x}px`; el.style.top = `${y + 10}px`;
      el.classList.toggle('left', dx < 0);
    }
    raf = riders.some((r) => r.status === 'riding') ? requestAnimationFrame(drawRiders) : 0;
  }
  function setRiders(list = [], serverNow = Date.now(), mine = null) {
    skew = serverNow - Date.now(); me = mine;
    riders = list;
    const seen = new Set();
    for (const r of list) {
      let el = rEls.get(r.id);
      if (!el) { el = document.createElement('div'); el.className = 'tw-rider'; riderLayer.appendChild(el); rEls.set(r.id, el); }
      const isMe = r.pid === me;
      const html = `<i class="spr" aria-hidden="true"></i><span class="tag">${r.status === 'delivered' ? 'Delivered!' : r.status === 'cooking' ? (isMe ? 'Cooking your order' : 'Cooking') : isMe ? 'Your order' : `${esc(r.name)}'s order`}</span>`;
      if (el._html !== html) { el.innerHTML = html; el._html = html; }
      el.classList.toggle('mine', isMe); el.classList.toggle('done', r.status === 'delivered');
      seen.add(r.id);
    }
    for (const [k, el] of rEls) if (!seen.has(k)) { el.remove(); rEls.delete(k); }
    cancelAnimationFrame(raf); drawRiders();
  }

  // basic: the Basic game's map (no HP bars, your banner big and labelled YOU, classmates' banners smaller, no watchtower
  // unless the fog Extra is on)
  // The Basic game labels every stop with its place name (the monster there in small letters under it), and shows a tiny
  // legend: what a glowing number, crossed swords and the gold banner mean.
  function drawPlaces(state, basic, legendOn, far = null) {
    host.classList.toggle('basic', !!basic);
    let html = '';
    // every stop's circle (a faint ring; it glows when the stop can be reached), so each banner has a spot to stand on
    // (the stop your pair stands on has a gold ring, so it is clear which stop your banner is on)
    const mineAt = state.bands?.find((b) => b.id === mineBand)?.node;
    if (basic) html += NODES.map((n, i) => (i === FORTRESS ? '' : `<i class="tw-base ${far?.has(i) ? 'far' : ''} ${i === mineAt ? 'mine' : ''}" data-base="${i}" style="left:${n.x}px;top:${n.y + 26}px"></i>`)).join('');
    if (basic) html += NODES.map((n, i) => {
      const us = state.units.filter((u) => u.node === i && i !== FORTRESS), camp = state.camps.find((c) => c.node === i && c.alive);
      let foe = '', extra = '';
      if (i === FORTRESS) { foe = state.gate.broken ? (state.warlord?.out ? 'The Warlord' : 'Gate broken') : "The gate's guard"; extra = `Needs a big team (${BIG_TEAM}+ pairs)`; }
      else if (us.length) { const lead = [...us].sort((a, b) => UNITS[b.type].hp - UNITS[a.type].hp)[0]; foe = us.length > 1 ? `${plainName(lead.type)} and ${us.length - 1} more` : plainName(lead.type); }
      else if (camp) foe = plainName(CAMPS[i].id);
      // the Academy's shield, in whole numbers with a bar, and one line saying what it is
      let shield = '';
      if (i === HOME && state.ward && state.ward.hp < state.ward.max) {
        const hp = Math.max(0, Math.ceil(state.ward.hp)), pct = Math.max(0, Math.min(100, (state.ward.hp / state.ward.max) * 100));
        shield = `<em class="shield"><span>Shield ${hp} of ${state.ward.max}</span><i class="sbar"><b style="width:${pct.toFixed(0)}%"></b></i></em>`;
      }
      const name = i === HOME ? 'Academy' : n.name;
      // (the fortress label sits above its banner, clear of the Crimson Orchard just below it and of the screen's edge)
      const at = i === FORTRESS ? `left:${n.x}px;top:${n.y - 98}px` : `left:${n.x}px;top:calc(${n.y + 26}px + 24px * max(1, var(--inv, 1) * 1.18))`;
      return `<div class="tw-place ${foe ? 'foe' : ''} ${i === FORTRESS ? 'fort' : ''} ${i === HOME ? 'home' : ''} ${far?.has(i) ? 'far' : ''}" style="${at}"><b>${esc(name)}</b>${foe ? `<small>${esc(foe)}</small>` : ''}${extra ? `<em>${esc(extra)}</em>` : ''}${shield}</div>`;
    }).join('');
    if (places._html !== html) { places.innerHTML = html; places._html = html; }
    legend.classList.toggle('hidden', !(basic && legendOn));
    const hurt = state.ward && state.ward.hp < state.ward.max;
    const lg = (hurt ? `<div class="lg-row shield"><i class="lg-shield"><b style="height:${Math.max(0, Math.min(100, (state.ward.hp / state.ward.max) * 100)).toFixed(0)}%"></b></i><span><b>Academy's shield: ${Math.max(0, Math.ceil(state.ward.hp))} of ${state.ward.max}.</b> Enemies standing on the Academy break it each round. If it breaks, the enemy wins.</span></div>` : '') + `<div class="lg-row"><i class="lg-stop">2</i><span>Glowing number: steps to get there</span></div>
      <div class="lg-row"><i class="lg-stop attack">${SWORDS}</i><span>Crossed swords: a monster to fight</span></div>
      <div class="lg-row"><i class="lg-gate"></i><span>Gold banner: the gate of the Crimson Fortress, the enemy's castle</span></div>`;
    if (legend._html !== lg) { legend.innerHTML = lg; legend._html = lg; }
  }
  function render({ state, mine = null, options = [], route = null, selected = null, full = false, votes = {}, marches = [], focusNode = null, friends = [], ghost = null, lastSeen = [], status = null, wounded = null, highlight = [], basic = false, legend: legendOn = false, mineNo = null, far = null }) {
    if (focusNode !== focus) { focus = focusNode; fit(); }
    mineBand = mine;
    drawPlaces(state, basic, legendOn, far);
    // roads of the chosen step, and (for the teacher) where marching units are heading
    const pts = (r) => r.map(([x, y]) => `${x},${y}`).join(' ');
    const roadHtml = (route ? `<polyline points="${pts(route)}" class="road-shadow"/><polyline points="${pts(route)}" class="road-line"/>` : '')
      + marches.map((m) => `<polyline points="${pts(m)}" class="road-march"/>`).join('')
      + friends.map((m) => `<polyline points="${pts(m)}" class="road-friend"/>`).join('');
    if (roads._html !== roadHtml) { roads.innerHTML = roadHtml; roads._html = roadHtml; }
    drawFog(full ? null : state.visible);
    // stops a warband can step to next
    const stopsHtml = options.map((o) => {
      const n = NODES[o.node], vc = votes[o.node] ? `<i class="vote-count">${votes[o.node]}</i>` : '';
      if (o.reach) return `<button type="button" class="tw-stop reach ${o.attack ? 'attack' : ''} ${o.inRoute ? 'in-route' : ''}" data-stop="${o.node}" style="left:${n.x}px;top:${n.y + 26}px" aria-label="${esc(n.name)}, ${o.cost} AP${o.attack ? ', a fight' : ''}">${o.attack ? SWORDS : o.cost}</button>`;
      if (o.target) return `<button type="button" class="tw-stop target" data-stop="${o.node}" style="left:${n.x}px;top:${n.y + 26}px" aria-label="March to ${esc(n.name)}">⚑</button>`;
      return `<button type="button" class="tw-stop ${o.attack ? 'attack' : ''} ${o.mine ? 'mine' : ''}" data-stop="${o.node}" style="left:${n.x}px;top:${n.y + 26}px" aria-label="${esc(n.name)}, ${o.cost} MP${o.attack ? ', attack' : ''}">${o.attack ? SWORDS : o.cost}${vc}</button>`;
    }).join('');
    if (stops._html !== stopsHtml) { stops.innerHTML = stopsHtml; stops._html = stopsHtml; }
    const list = [];
    // jungle camps (neutral landmarks: always shown)
    for (const c of state.camps) {
      const info = CAMPS[c.node];
      if (c.alive) list.push({ key: `camp${c.node}`, kind: 'camp', ref: c.node, node: c.node, small: true, glow: selected === `camp${c.node}`, label: info.name,
        html: `<span class="cloth"><img src="${sprite(info.id)}" alt=""></span><span class="pole"></span><span class="tag">${esc(NODES[c.node].name)}</span>` });
      else list.push({ key: `campwon${c.node}`, kind: 'camp', ref: c.node, node: c.node, small: true, secured: true, rise: true, glow: selected === `camp${c.node}`, label: `${info.name}: secured`,
        html: `<span class="cloth crystal-std">${CRYSTAL}</span><span class="pole"></span><span class="tag">${esc(NODES[c.node].name)} · secured${c.returnTurn ? ` to turn ${c.returnTurn}` : ''}</span>` });
    }
    // the Crimson Fortress gate / Warlord
    const fortressUnits = state.units.filter((u) => u.node === FORTRESS);
    const gateType = state.gate.broken ? 'warlord' : 'golem';
    list.push({ key: 'fortress', kind: 'fortress', ref: 'fortress', node: FORTRESS, glow: selected === 'fortress', label: 'Crimson Fortress',
      html: `<span class="cloth"><img src="${sprite(gateType)}" alt=""></span>${fortressUnits.length && !basic ? `<i class="count">+${fortressUnits.length}</i>` : ''}<span class="pole"></span><span class="tag">${state.gate.broken ? (state.warlord?.out ? 'The Warlord' : 'Gate broken') : 'Fortress gate'}</span>` });
    // the Crystal Academy and its Ward
    if (state.ward) {
      const w = state.ward, hurt = w.hp < w.max;
      list.push({ key: 'academy', kind: 'academy', ref: 'academy', node: HOME, small: true, label: 'Academy Ward',
        html: `<span class="cloth">${CRYSTAL}</span><span class="pole"></span><span class="tag">${hurt ? `Ward ${w.hp}/${w.max}` : 'Academy Ward'}</span>` });
    }
    // the watchtower: a Crystal banner on it shows the class the Crimson Host beyond the fog
    if (state.tower && !(basic && state.extras && !state.extras.fog)) {
      const t = state.tower;
      list.push({ key: 'tower', kind: 'tower', ref: 'tower', node: t.node, small: true, glow: selected === 'tower', label: 'Watchtower',
        html: `<span class="cloth tower-cloth ${t.held ? 'held' : ''}">${TOWER}</span><span class="pole"></span><span class="tag">${t.held ? 'Watchtower · held' : 'Watchtower'}</span>` });
    }
    // the Crimson Host, one banner per stop
    const stacks = new Map();
    for (const u of state.units) if (u.node !== FORTRESS) { if (!stacks.has(u.node)) stacks.set(u.node, []); stacks.get(u.node).push(u); }
    for (const [node, us] of stacks) {
      const lead = [...us].sort((a, b) => (UNITS[b.type].hp - UNITS[a.type].hp))[0];
      const ord = full ? us.map((u) => u.order?.kind).find(Boolean) : null, dug = us.some((u) => u.dugIn);
      const badge = ord === 'ambush' ? '<i class="order amb">AMBUSH</i>' : ord === 'march' ? '<i class="order">MARCH</i>' : ord === 'hunt' ? '<i class="order">HUNT</i>' : ord === 'hold' || dug ? `<i class="order hold">${dug ? 'DUG IN' : 'HOLD'}</i>` : '';
      list.push({ key: `host${node}`, kind: 'host', ref: node, node, glow: selected === `host${node}`, label: `${us.length} Crimson units`,
        html: `<span class="cloth"><img src="${sprite(lead.type)}" alt=""></span>${us.length > 1 ? `<i class="count">×${us.length}</i>` : ''}${badge}${us.some((u) => u.battle) ? `<i class="fight">${SWORDS}</i>` : ''}<span class="pole"></span><span class="tag">${us.length > 1 ? `Crimson Host ×${us.length}` : esc(UNITS[lead.type].name.split(' ').slice(-1)[0])}</span>` });
    }
    // Crystal banners: one per warband
    // stops the class has secured: its standard flies there
    for (const n of state.rally || []) list.push({ key: `rally${n}`, kind: 'rally', ref: n, node: n, small: true, secured: true, rise: true, label: `${NODES[n].name}: rally point`,
      html: `<span class="cloth crystal-std">${CRYSTAL}</span><span class="pole"></span><span class="tag">Secured</span>` });
    // the enemy your company lost to, and how wounded it still is
    if (wounded) list.push({ key: 'wounded', kind: 'wounded', ref: 'wounded', node: wounded.node, small: true, label: 'Wounded enemy',
      html: `<span class="cloth wound">${SWORDS}</span><span class="pole"></span><span class="tag">Wounded · ${wounded.pct}% left</span>` });
    // where the Crimson Host was last seen (it may have moved since)
    for (const g of lastSeen) list.push({ key: `seen${g.id}`, kind: 'seen', ref: g.id, node: g.node, small: true, dim: true, label: `Last seen: ${UNITS[g.type]?.name}`,
      html: `<span class="cloth"><img src="${sprite(g.type)}" alt=""></span><span class="pole"></span><span class="tag">Last seen · turn ${g.turn}</span>` });
    // the proposed endpoint of your route
    if (ghost) list.push({ key: 'ghost', kind: 'ghost', ref: 'ghost', node: ghost.node, small: true, label: 'Your planned stop',
      html: `<span class="cloth" style="--c:${charColor(ghost.char)}"><img src="${portrait(ghost.char)}" alt=""></span><span class="pole"></span><span class="tag">Planned</span>` });
    // the teacher's screen and the projector (no "mine"): more than CROWD pairs on one stop stand as one banner with the
    // count, so a whole class at the Academy does not run off the map
    const CROWD = 3, crowded = new Map();
    if (basic && !mine) for (const b of state.bands) if (b.pairs[0]) crowded.set(b.node, [...(crowded.get(b.node) || []), b]);
    for (const [node, bs] of crowded) {
      if (bs.length <= CROWD) { crowded.delete(node); continue; }
      const lead = bs[0].pairs[0], nos = bs.flatMap((b) => b.pairs.map((p) => p.no)).sort((a, b) => a - b);
      list.push({ key: `crowd${node}`, kind: 'pair', ref: bs[0].id, node, glow: bs.some((b) => selected === `band${b.id}`), label: `Pairs ${nos.join(', ')}`,
        html: `<span class="cloth" style="--c:${charColor(lead.char)}"><img src="${portrait(lead.char)}" alt=""></span>${bs.some((b) => b.battle) ? `<i class="fight">${SWORDS}</i>` : ''}<i class="count light">×${nos.length}</i><span class="pole"></span><span class="tag">${nos.length} pairs</span>` });
    }
    for (const b of state.bands) {
      const lead = b.pairs[0]; if (!lead) continue;
      if (crowded.has(b.node)) continue;
      const isMine = mine && b.id === mine;
      const hp = Math.min(...b.pairs.map((p) => (p.hp ?? 10) / (p.maxHp || 10)));
      if (basic) {
        list.push({ key: `band${b.id}`, kind: 'pair', ref: b.id, node: b.node, glow: isMine || selected === `band${b.id}`, small: !isMine && !!mine, mineBig: isMine, label: isMine ? 'Your pair' : `Pair ${lead.no}`,
          html: `<span class="cloth" style="--c:${charColor(lead.char)}"><img src="${portrait(lead.char)}" alt=""></span>${b.battle ? `<i class="fight">${SWORDS}</i>` : ''}${!isMine && b.pairs.length > 1 ? `<i class="count light">×${b.pairs.length}</i>` : ''}${state.extras?.hp ? `<i class="hp ${hp < 0.34 ? 'low' : ''}"><b style="width:${Math.round(hp * 100)}%"></b></i>` : ''}<span class="pole"></span><span class="tag">${isMine ? `YOU${mineNo ? ` (Pair ${mineNo})` : ''}` : `Pair ${lead.no}`}</span>` });
        continue;
      }
      list.push({ key: `band${b.id}`, kind: 'pair', ref: b.id, node: b.node, glow: isMine || selected === `band${b.id}` || highlight.includes(b.id), label: `Pair ${lead.no}`,
        html: `<span class="cloth" style="--c:${charColor(lead.char)}"><img src="${portrait(lead.char)}" alt=""></span>${b.pairs.length > 1 ? `<i class="count light">×${b.pairs.length}</i>` : ''}${b.battle ? `<i class="fight">${SWORDS}</i>` : ''}<i class="hp ${hp < 0.34 ? 'low' : ''}"><b style="width:${Math.round(hp * 100)}%"></b></i><span class="pole"></span><span class="tag">${isMine ? (b.pairs.length > 1 ? 'Your warband' : 'You') : b.pairs.length > 1 ? 'Warband' : `Pair ${lead.no}`}</span>${isMine && status ? `<span class="status">${esc(status)}</span>` : ''}` });
    }
    if (far) for (const b of list) if ((b.kind === 'host' || b.kind === 'camp' || b.kind === 'fortress') && !b.glow && far.has(b.node)) b.far = true;
    placeBanners(list);
    setRiders(state.riders || [], state.serverNow, state.me?.pid || null);
  }
  function pulse(node, label) {
    const n = NODES[node]; if (!n) return;
    const el = document.createElement('div'); el.className = 'tw-pulse'; el.style.left = `${n.x}px`; el.style.top = `${n.y}px`;
    el.innerHTML = `<i></i><i></i><i></i>${label ? `<b>${esc(label)}</b>` : ''}`;
    riderLayer.appendChild(el); setTimeout(() => el.remove(), 3600);
  }
  // The enemy army walking along the roads to where it stands now (moves: [{ type, from, to }]); the enemy's banner on each
  // stop it walks to stays hidden until it gets there. Returns how long the walk takes (ms).
  function moveFoes(moves) {
    let longest = 0;
    for (const m of moves) {
      const path = [m.from]; let at = m.from;
      for (let k = 0; k < 12 && at !== m.to; k++) { const s = stepTowards(at, m.to, () => true); if (s == null) break; path.push(s); at = s; }
      if (at !== m.to || path.length < 2) continue;
      const el = document.createElement('div');
      el.className = 'tw-banner host foe-walk';
      el.innerHTML = `<span class="cloth"><img src="${sprite(m.type)}" alt=""></span><span class="pole"></span>`;
      el.style.left = `${NODES[m.from].x}px`; el.style.top = `${footY(m.from)}px`;
      riderLayer.appendChild(el);
      const dur = glide(el, m.from, m.to, NODES[m.to].x, footY(m.to), path);
      longest = Math.max(longest, dur);
      hideFoes.set(m.to, Math.max(hideFoes.get(m.to) || 0, performance.now() + dur));
      setTimeout(() => { el.classList.add('gone'); setTimeout(() => el.remove(), 400); }, dur);
    }
    for (const el of els.values()) if (el.dataset.kind === 'host' && (hideFoes.get(+el.dataset.node) || 0) > performance.now()) el.classList.add('arriving');
    setTimeout(() => { for (const el of els.values()) el.classList.remove('arriving'); }, longest + 30);
    return longest;
  }
  return { render, fit, setBottom, setInsets, pulse, moveFoes };
}

// Where banners stand on a stop. Every stop's circle is centred at (x, y + 26) and drawn 38 px wide, scaled up when the
// map is drawn small (as .tw-stop.reach in tw.css). A banner's pole foot is planted 6 px into the top of the circle, and
// banners on one stop stand side by side (by the width of each cloth, 6 px apart), centred on the stop.
export const STOP_DY = 26, STOP_R = 19, BANNER_GAP = 6;
export const circleScale = (scale = 1) => Math.max(1, 1.18 / (scale || 1));
export const stopFoot = (node, scale = 1) => NODES[node].y + STOP_DY - STOP_R * circleScale(scale) + 6;
export const clothW = (b) => (b.mineBig ? 68 : b.kind === 'pair' ? (b.small ? 40 : 52) : b.kind === 'fortress' ? 60 : b.kind === 'camp' || b.kind === 'academy' || b.kind === 'rally' || b.small ? 38 : 52);
export function stackSpots(node, group, scale = 1) {
  const ws = group.map(clothW), total = ws.reduce((a, w) => a + w, 0) + BANNER_GAP * (group.length - 1);
  let at = -total / 2;
  return ws.map((w) => { const x = NODES[node].x + at + w / 2; at += w + BANNER_GAP; return { x, y: stopFoot(node, scale), w }; });
}

// The roads a marching unit will take to its target (fewest roads), as points
export function marchPoints(from, to) {
  const path = [from]; let at = from;
  for (let k = 0; k < 30 && at !== to; k++) { const s = stepTowards(at, to, (n) => !CAMPS[n]); if (s == null) break; path.push(s); at = s; }
  return path.length > 1 ? routePoints(path).map((q) => [q.x ?? q[0], q.y ?? q[1]]) : null;
}

// The road between two stops, for drawing a planned step
export const roadPoints = (a, b) => routePoints([a, b]).map((q) => [q.x ?? q[0], q.y ?? q[1]]);

// The stops a warband may step to right now (one road at a time)
export function stepOptions(state, band) {
  if (!band || band.done || band.battle || state.phase !== 'crystal') return [];
  const occupied = (n) => state.units.some((u) => u.node === n) || state.camps.some((c) => c.node === n && c.alive) || n === FORTRESS;
  const busy = (n) => state.battles.some((B) => B.node === n && B.status !== 'gather' && B.status !== 'over');
  return neighbours(band.node).filter((n) => cost(band.node, n) <= band.mp && !busy(n))
    .filter((n) => !(n === FORTRESS && state.gate.broken && !state.warlord?.out))
    .map((n) => ({ node: n, cost: cost(band.node, n), attack: occupied(n) }));
}
export { esc, HOME, FORTRESS };
