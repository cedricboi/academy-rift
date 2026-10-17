// Grab-Ma Food: Auntie Mama's shop as a food-delivery app on a phone. Students browse the menu, fill a basket,
// pay with the coins their right answers earned, and track Grab-Ma as she rides out to their banner on the map.
// Orders go in during the class's move, once the banner has locked in its move (the server checks this too).
import { ITEMS } from '../data/characters.js';
import { NODES } from './movement.js';
import { hops } from './rules.js';
const fromHome = hops(0);
const hopsFromHome = (n) => fromHome.get(n) ?? 4;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MENU = ITEMS.filter((it) => it.price && !it.passive);
const ICON = (id) => `../assets/shop/${id}.webp`;
const LIMIT = { each: 2, total: 6 };
const COIN = '<i class="ph-coin" aria-hidden="true"></i>';
const TAGS = { bento: 'Bestseller', energy: 'Popular', durian: 'Spicy deal', chilli: '🌶 Hot', crystal: 'Team pick', revive: 'Rescue', shield: 'Value', tonic: 'Warm drink' };
const SVG = {
  pin: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" fill="currentColor"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M16 16l4 4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  star: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="#ffb800"/></svg>',
  bike: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="6" cy="17" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="17" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 17h7l3-7h3M13 17l-2-6H8" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  chat: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  call: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 3l3 4-2 2c1 3 3 5 6 6l2-2 4 3-2 4C9 20 4 15 3 6z" fill="currentColor"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5 12l5 5 9-10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

export function createPhone({ socket, host, getS, toast, canOrder, now }) {
  let open = false, view = 'shop', cart = {}, lastRider = null, notifyT = 0, pushed = '';
  host.innerHTML = `<div class="ph-scrim" data-ph="close"></div>
    <div class="phone" role="dialog" aria-label="Grab-Ma Food">
      <div class="ph-notch"></div>
      <div class="ph-status"><b class="ph-time"></b><span class="ph-icons"><i class="sig"></i><i class="wifi"></i><i class="bat"></i></span></div>
      <div class="ph-screen"></div>
      <div class="ph-home"></div>
    </div>`;
  const screen = host.querySelector('.ph-screen');
  const push = document.createElement('button');
  push.type = 'button'; push.className = 'ph-push hidden';
  document.body.appendChild(push);

  const S = () => getS();
  const me = () => S()?.me || {};
  const myRider = () => (S()?.riders || []).find((r) => r.pid === me().pid) || null;
  const bag = () => me().bag || {};
  const inBag = () => Object.values(bag()).reduce((a, n) => a + n, 0);
  const cartCount = () => Object.values(cart).reduce((a, n) => a + n, 0);
  const cartCost = () => Object.entries(cart).reduce((a, [id, n]) => a + (MENU.find((m) => m.id === id)?.price || 0) * n, 0);
  const band = () => S()?.bands?.find((b) => b.id === me().bandId) || null;
  const where = () => { const b = band(); return b ? NODES[b.node]?.name || 'the battlefield' : 'the Academy'; };
  const etaText = () => { const b = band(), sp = S()?.speed || 1, stops = b ? hopsFromHome(b.node) : 0; return `${Math.round((3 + stops * 3) / sp)}–${Math.round((6 + stops * 3) / sp)} s`; };
  const left = (r) => Math.max(0, Math.ceil((r.eta - (now() - (S()?.serverNow || now()))) / 1000));
  const canAdd = (id) => (bag()[id] || 0) + (cart[id] || 0) < LIMIT.each && inBag() + cartCount() < LIMIT.total;
  const why = () => {
    const r = myRider();
    if (r && r.status !== 'delivered') return 'Grab-Ma is still bringing your last order.';
    if (!canOrder()) return S()?.myBattle ? 'Grab-Ma cannot ride into a battle. Order after it.' : me().ordered ? 'You have ordered this move. Order again next move.' : 'Grab-Ma takes orders in the War Council and while banners march.';
    if (cartCost() > (me().coins || 0)) return `You need ${cartCost() - (me().coins || 0)} more coins. Right answers earn 10 each.`;
    return '';
  };

  // your pair's HP (it does not come back by itself) and the food in your bag: eat it here, or use it on your turn in battle
  const EAT = { bento: 4, revive: 10, tonic: 2 };
  function bagView() {
    const hp = me().hp ?? 10, max = me().maxHp ?? 10, items = Object.entries(bag()).filter(([, n]) => n > 0);
    const pct = Math.round((hp / max) * 100), inBattle = !!S()?.myBattle;
    return `<div class="ph-bag"><div class="ph-hp"><b>Your pair's HP</b><span>${hp} / ${max}</span><i class="${pct < 34 ? 'low' : ''}"><em style="width:${pct}%"></em></i>
        <small>HP does not come back after a battle. Eat food, or rest at the Academy or a rally point.</small></div>
      ${items.length ? `<div class="ph-bag-items">${items.map(([id, n]) => { const it = MENU.find((m) => m.id === id); const heal = EAT[id];
        return `<div class="ph-bag-item"><img src="${ICON(id)}" alt=""><span><b>${esc(it?.name || id)} ×${n}</b><small>${heal ? `Eat now: +${heal} HP` : 'Use it on your turn in battle'}</small></span>
          ${heal ? `<button type="button" data-ph="eat" data-id="${id}" ${inBattle || hp >= max ? 'disabled' : ''}>EAT</button>` : ''}</div>`; }).join('')}</div>` : ''}</div>`;
  }

  function shopView() {
    const coins = me().coins || 0, open_ = canOrder();
    return `<header class="ph-app-head">
        <button class="ph-ico" data-ph="close" aria-label="Close">${SVG.close}</button>
        <div class="ph-deliver"><small>Deliver to</small><b>${SVG.pin} Your banner · ${esc(where())}</b></div>
        <span class="ph-wallet" title="MamaPay wallet">${COIN}<b>${coins}</b></span>
      </header>
      <div class="ph-scroll">
        <div class="ph-search">${SVG.search}<span>Search Mama's Kopitiam Kitchen</span></div>
        <div class="ph-hero"><img src="../assets/shop/shop_room.webp" alt=""><span class="ph-hero-badge">${open_ ? 'OPEN NOW' : 'ORDERS OPEN AFTER YOU LOCK IN'}</span></div>
        <div class="ph-shop">
          <div class="ph-shop-top"><img src="auntie/bust.png" alt=""><div><h2>Mama's Kopitiam Kitchen</h2>
            <p class="ph-meta">${SVG.star}<b>4.9</b> (2.3k) · Local · Battle snacks</p></div></div>
          <div class="ph-chips"><span class="ph-chip">${SVG.bike} ${etaText()}</span><span class="ph-chip free">Free delivery</span><span class="ph-chip">${COIN} 10 per right answer</span></div>
        </div>
        ${bagView()}
        <div class="ph-promo"><b>PROMO</b> Answer right, eat right! Every right answer puts 10 coins in your MamaPay wallet.</div>
        <h3 class="ph-sec">Popular</h3>
        <ul class="ph-menu">${MENU.map((it) => {
          const n = cart[it.id] || 0, have = bag()[it.id] || 0, add = canAdd(it.id);
          return `<li class="ph-item ${n ? 'in' : ''}">
            <div class="ph-item-txt">
              ${TAGS[it.id] ? `<span class="ph-tag">${TAGS[it.id]}</span>` : ''}
              <b class="ph-name">${esc(it.name)}</b>
              <span class="ph-desc">${esc(it.desc)}</span>
              <span class="ph-price">${COIN}${it.price}</span>
              ${have ? `<span class="ph-have">In your bag: ${have}</span>` : ''}
            </div>
            <div class="ph-item-pic"><img src="${ICON(it.id)}" alt="">
              ${n ? `<div class="ph-step"><button data-ph="dec" data-id="${it.id}" aria-label="One less">−</button><b>${n}</b><button data-ph="inc" data-id="${it.id}" ${add ? '' : 'disabled'} aria-label="One more">+</button></div>`
                : `<button class="ph-add" data-ph="inc" data-id="${it.id}" ${add ? '' : 'disabled'} aria-label="Add ${esc(it.name)}">+</button>`}
            </div></li>`;
        }).join('')}</ul>
        <p class="ph-small">Your bag carries ${LIMIT.total} items, and ${LIMIT.each} of each. Use food on your turn in battle (ITEMS).</p>
        ${open_ && !cartCount() ? `<button class="ph-skip" data-ph="done">I'm full, no order this turn</button>` : ''}
      </div>
      ${cartCount() ? `<button class="ph-basket" data-ph="basket"><span class="ph-count">${cartCount()}</span><span>View basket</span><b>${COIN}${cartCost()}</b></button>` : ''}`;
  }

  function basketView() {
    const coins = me().coins || 0, total = cartCost(), w = why();
    return `<header class="ph-app-head plain"><button class="ph-ico" data-ph="shop" aria-label="Back">${SVG.back}</button><h2>Checkout</h2><span></span></header>
      <div class="ph-scroll">
        <div class="ph-card"><div class="ph-row">${SVG.pin}<div><small>Deliver to</small><b>Your banner · ${esc(where())}</b></div></div>
          <div class="ph-row">${SVG.bike}<div><small>Rider</small><b>Grab-Ma · arrives in ${etaText()}</b></div></div></div>
        <div class="ph-card"><h3>Order summary</h3>
          ${Object.entries(cart).map(([id, n]) => { const it = MENU.find((m) => m.id === id); return `<div class="ph-line"><span class="ph-q">${n}×</span><span>${esc(it.name)}</span><b>${COIN}${it.price * n}</b></div>`; }).join('')}
          <div class="ph-line sub"><span></span><span>Subtotal</span><b>${COIN}${total}</b></div>
          <div class="ph-line sub"><span></span><span>Delivery fee</span><b><s>${COIN}30</s> <em>FREE</em></b></div>
          <div class="ph-line total"><span></span><span>Total</span><b>${COIN}${total}</b></div></div>
        <div class="ph-card"><h3>Payment</h3>
          <div class="ph-line"><span class="ph-q">${COIN}</span><span>MamaPay wallet</span><b>${coins}</b></div>
          <div class="ph-line sub"><span></span><span>Balance after</span><b class="${coins - total < 0 ? 'neg' : ''}">${coins - total}</b></div></div>
      </div>
      <div class="ph-foot">${w ? `<p class="ph-why">${esc(w)}</p>` : ''}
        <button class="ph-cta" data-ph="place" ${w ? 'disabled' : ''}>Place order · ${COIN}${total}</button></div>`;
  }

  function trackView() {
    const r = myRider();
    if (!r) { view = 'shop'; return shopView(); }
    const st = r.status, step = st === 'cooking' ? 1 : st === 'riding' ? 2 : 3;
    const eta = left(r);
    const title = st === 'delivered' ? 'Delivered! Check your bag' : st === 'cooking' ? 'Mama is cooking your order' : 'Grab-Ma is on the way';
    const sub = st === 'delivered' ? 'Use your food on your turn in battle: ITEMS.' : st === 'cooking' ? 'Your food leaves the Academy kitchen in a moment.' : `${r.stops} stop${r.stops === 1 ? '' : 's'} away. Watch for her scooter on the map.`;
    return `<header class="ph-app-head plain"><button class="ph-ico" data-ph="close" aria-label="Close">${SVG.close}</button><h2>Your order</h2><span></span></header>
      <div class="ph-scroll">
        <div class="ph-track ${st}"><img src="auntie/bust.png" alt=""><div>
          <h3>${title}</h3><p>${sub}</p>
          ${st !== 'delivered' ? `<div class="ph-eta"><small>Arriving in about</small><b data-eta="${r.id}">${eta} s</b></div>` : ''}</div></div>
        <ol class="ph-steps">${['Order placed', 'Cooking', 'On the way', 'Delivered'].map((t, i) => `<li class="${i < step ? 'done' : i === step ? 'now' : ''}"><i>${i < step ? SVG.check : ''}</i>${t}</li>`).join('')}</ol>
        <div class="ph-card ph-rider"><img src="auntie/bust.png" alt=""><div><b>Grab-Ma</b><small>${SVG.star} 5.0 · Green scooter · SMA 1965 M</small></div>
          <button class="ph-ico round" data-ph="chat" aria-label="Message">${SVG.chat}</button><button class="ph-ico round" data-ph="chat" aria-label="Call">${SVG.call}</button></div>
        <div class="ph-card"><h3>Your food</h3>${Object.entries(r.items).map(([id, n]) => { const it = MENU.find((m) => m.id === id); return `<div class="ph-line"><span class="ph-q">${n}×</span><span>${esc(it?.name || id)}</span><b>${COIN}${(it?.price || 0) * n}</b></div>`; }).join('')}
          <div class="ph-line total"><span></span><span>Paid</span><b>${COIN}${r.cost}</b></div></div>
      </div>
      <div class="ph-foot"><button class="ph-cta light" data-ph="tomap">Back to the map · watch her ride</button></div>`;
  }

  function render() {
    host.classList.toggle('hidden', !open);
    if (!open) return;
    const t = new Date(); host.querySelector('.ph-time').textContent = `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`;
    const r = myRider();
    if (view === 'shop' && r && r.status !== 'delivered' && !Object.keys(cart).length && openedTrack) view = 'track';
    const html = view === 'basket' ? basketView() : view === 'track' ? trackView() : shopView();
    if (screen._html !== html) { const top = screen.querySelector('.ph-scroll')?.scrollTop || 0; screen.innerHTML = html; screen._html = html; const sc = screen.querySelector('.ph-scroll'); if (sc && view === screen._view) sc.scrollTop = top; screen._view = view; }
  }
  let openedTrack = false;

  host.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ph]'); if (!b || b.disabled) return;
    const a = b.dataset.ph, id = b.dataset.id;
    if (a === 'close') { open = false; }
    else if (a === 'tomap') { open = false; if (!me().orderDone) socket.emit('twOrderDone'); }
    else if (a === 'inc') { if (canAdd(id)) cart[id] = (cart[id] || 0) + 1; }
    else if (a === 'dec') { cart[id] = (cart[id] || 0) - 1; if (cart[id] <= 0) delete cart[id]; }
    else if (a === 'basket') view = 'basket';
    else if (a === 'shop') view = 'shop';
    else if (a === 'place') { socket.emit('twGrab', { items: cart }); placing = { ...cart }; }
    else if (a === 'done') { socket.emit('twOrderDone'); open = false; toast('No order this turn. Grab-Ma will be back next move.'); }
    else if (a === 'chat') toast('Grab-Ma is riding! No texting while driving.');
    else if (a === 'eat') socket.emit('twEat', { item: id });
    render();
  });
  let placing = null;

  // what the phone says on its own: a buzz when you can order, and when she sets off and arrives
  function notify(title, text, go) {
    if (open) return;                                    // the phone is already in their hand
    push.innerHTML = `<span class="pp-app"><i></i>GRAB-MA FOOD · now</span><b>${esc(title)}</b><span>${esc(text)}</span>`;
    push.classList.remove('hidden', 'in'); void push.offsetWidth; push.classList.add('in');
    push.onclick = () => { push.classList.add('hidden'); if (go) { view = go; openPhone(); } };
    clearTimeout(notifyT); notifyT = setTimeout(() => push.classList.add('hidden'), 6500);
  }
  function openPhone(v) { open = true; if (v) view = v; push.classList.add('hidden'); render(); }

  function update() {
    const s = S(); if (!s || s.status !== 'playing') { if (open) { open = false; render(); } return; }
    const r = myRider();
    if (placing && r && r.status !== 'delivered' && (!lastRider || lastRider.id !== r.id)) { cart = {}; placing = null; view = 'track'; openedTrack = true; }
    // the server answered: the order was refused (the reason arrives as a toast)
    const key = `${s.turn}`;
    if (canOrder() && pushed !== key && !r) { pushed = key; notify('War Council open! Hungry? 🍜', "Order from Mama's Kopitiam Kitchen. Grab-Ma rides faster than any banner.", 'shop'); }
    if (r && lastRider?.id === r.id && lastRider.status !== r.status) {
      if (r.status === 'riding') notify('Grab-Ma is on the way 🛵', `Your food has left the Academy. ${r.stops} stops to go.`, 'track');
      if (r.status === 'delivered') { notify('Delivered! 🎉', 'Your food is in your bag. Use it on your turn in battle.', 'track'); }
    }
    lastRider = r ? { id: r.id, status: r.status } : null;
    render();
  }
  setInterval(() => { const el = screen.querySelector('[data-eta]'); const r = myRider(); if (el && r) el.textContent = `${left(r)} s`; }, 250);

  return { open: openPhone, update, get isOpen() { return open; } };
}
