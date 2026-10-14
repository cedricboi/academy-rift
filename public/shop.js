// Auntie's Magic Mama shop — a first-person shop scene students visit between tournament rounds.
// They spend the coins earned in battle on items that are packed for their next battle. The server owns coins and the
// bag (tBuy → tShop); this module only draws the shop and asks.
import { ITEMS, ITEM_BY_ID, SHOP_LIMIT } from "./data/characters.js";

const ART = "assets/shop/";
// Auntie's patter for each item (the card underneath gives the exact effect)
const PATTER = {
  bento: "Kaya toast set, with half-boiled egg some more! Eat already, sure got strength.",
  energy: "Malt Dino, extra powder for you! Drink this, then your skills can use again.",
  revive: "Phoenix kueh, very lucky one! Your friend fall down also can stand up again.",
  shield: "My tingkat very strong, you know? Last time I carried it all the way through the Rift!",
  crystal: "Ice gem biscuits! The little gems got Rift power inside. Your Sync gauge sure go up.",
  tonic: "Teh halia, hot hot one. Feeling weak and blur? Drink this, all the bad stuff go away.",
  chilli: "Chilli padi! Small but very fierce. Your next attack, confirm pain.",
  notes: "These notes from the top student in class, very neat! Read already, you get one more hint.",
  durian: "Careful ah, don't drop! Durian bomb. Throw at the enemy, the smell alone also can faint.",
};
const WELCOME = [
  "Welcome, welcome! Come in, see what Auntie got today!",
  "Aiyo, you're back! Fight so hard, must be hungry, right? Come, come.",
  "Eh, good student! Come take a look. Everything fresh one.",
  "Welcome to Magic Mama! Take your time, Auntie not in a hurry.",
];
const THANKS = ["Wah, good choice!", "Thank you ah! Use it well!", "Steady lah! Go and win!", "Shiok! Auntie give you one extra smile, free!", "Good, good. Study hard, fight hard!"];
const NOPE = {
  coins: "Aiyoh, not enough coins lah. Answer more questions correctly, then come back!",
  max: `${SHOP_LIMIT.each} already enough lah! Leave some for your classmates.`,
  full: `Your bag full already! ${SHOP_LIMIT.total} things max, cannot carry any more.`,
  battle: "Your battle starting! Go, go, go! Come back after.",
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SOLD = ITEMS.filter((i) => i.price > 0);
export const itemIcon = (id) => `${ART}${id}.webp`;

export function setupShop({ socket, SFX }) {
  let menuOpen = false;
  let open = false, coins = 0, bag = {}, sel = null, busy = false, typeT = null, happyT = null, nextHtml = "";

  const root = document.createElement("div");
  root.id = "mama"; root.className = "mama hidden";
  root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Auntie's shop");
  root.innerHTML = `
    <div class="mm-scene" id="mmScene">
      <img class="mm-bg" src="${ART}shop_room.webp" alt="" draggable="false">
      <i class="mm-glow g1"></i><i class="mm-glow g2"></i><i class="mm-glow g3"></i>
      <div class="mm-motes" aria-hidden="true">${"<i></i>".repeat(8)}</div>
      <div class="mm-auntie" id="mmAuntie"><div class="mm-aunt-in">
        <img class="calm" src="${ART}auntie_calm.webp" alt="Auntie" draggable="false">
        <img class="happy" src="${ART}auntie_happy.webp" alt="" draggable="false"></div></div>
      <div class="mm-menu" id="mmMenu" aria-label="Auntie's menu">
        <div class="mm-menu-h"><h2>AUNTIE'S MENU<small id="mmMenuNext">Tap an item to see what it does</small></h2>
          <button class="mm-close" id="mmCloseMenu" type="button" aria-label="Close the menu">✕</button></div>
        <div class="mm-grid">${SOLD.map((it) => `<button class="mm-tile" data-item="${it.id}" type="button" aria-label="${esc(it.name)}, ${it.price} coins">
          <img src="${itemIcon(it.id)}" alt="" draggable="false"><span class="mm-tile-t"><b>${esc(it.name)}</b>
          <span class="mm-tag"><i class="mm-coin"></i><b>${it.price}</b></span></span><span class="mm-has"></span></button>`).join("")}</div>
      </div>
      <div class="mm-bubble" id="mmBubble"><p id="mmSay"></p></div>
      <div class="mm-bag" id="mmBag"></div>
      <div class="mm-card" id="mmCard"></div>
      <button class="mm-leave" id="mmLeave" type="button"><span>THANK YOU, AUNTIE!</span><b>LEAVE ▶</b></button>
      <div class="mm-sign"><span>AUNTIE'S</span><b>MAGIC MAMA</b><em id="mmNext"></em></div>
    </div>
    <div class="mm-doors" aria-hidden="true"><i class="l"></i><i class="r"></i><b class="mm-open">OPEN · COME IN!</b></div>`;
  document.getElementById("game").appendChild(root);
  const $ = (id) => document.getElementById(id);

  // ---- Auntie talks: typed out, with the bubble sized for the whole line so it never jumps ----
  function say(text, happy = false) {
    clearInterval(typeT);
    const p = $("mmSay"), aunt = $("mmAuntie");
    let i = 0;
    const draw = () => { p.innerHTML = `${esc(text.slice(0, i))}<span class="rest">${esc(text.slice(i))}</span>`; };
    draw(); aunt.classList.add("talking");
    $("mmBubble").classList.remove("pop"); void $("mmBubble").offsetWidth; $("mmBubble").classList.add("pop");
    typeT = setInterval(() => { i += 2; draw(); if (i >= text.length) { clearInterval(typeT); aunt.classList.remove("talking"); } }, 34);
    if (happy) beHappy();
  }
  function beHappy(ms = 1700) {
    const aunt = $("mmAuntie");
    aunt.classList.remove("hop"); void aunt.offsetWidth; aunt.classList.add("happy", "hop");
    clearTimeout(happyT); happyT = setTimeout(() => aunt.classList.remove("happy"), ms);
  }

  // ---- drawing ----
  const total = () => Object.values(bag).reduce((n, k) => n + (k || 0), 0);
  function why(it) {
    const n = bag[it.id] || 0;
    if (n >= SHOP_LIMIT.each) return "max";
    if (total() >= SHOP_LIMIT.total) return "full";
    if (coins < it.price) return "coins";
    return null;
  }
  function render() {
    root.querySelectorAll(".mm-tile").forEach((b) => {
      const it = ITEM_BY_ID[b.dataset.item], n = bag[it.id] || 0, w = why(it);
      b.classList.toggle("sel", sel === it.id);
      b.classList.toggle("poor", w === "coins");
      b.classList.toggle("maxed", w === "max");
      b.querySelector(".mm-has").textContent = n ? `×${n}` : "";
    });
    const items = Object.entries(bag).flatMap(([id, n]) => Array(n > 0 ? n : 0).fill(id));
    $("mmBag").innerHTML = `<div class="mm-purse"><i class="mm-coin big"></i><b id="mmCoins">${coins}</b><span>coins</span></div>
      <div class="mm-bag-h">YOUR BAG <small>${items.length} / ${SHOP_LIMIT.total}</small></div>
      <div class="mm-slots">${Array.from({ length: SHOP_LIMIT.total }, (_, k) => items[k]
        ? `<span class="mm-slot full" title="${esc(ITEM_BY_ID[items[k]]?.name)}"><img src="${itemIcon(items[k])}" alt=""></span>`
        : `<span class="mm-slot"></span>`).join("")}</div>`;
    renderCard();
  }
  function renderCard() {
    const it = sel && ITEM_BY_ID[sel];
    if (!it) {
      $("mmCard").className = "mm-card idle";
      $("mmCard").innerHTML = menuOpen
        ? `<p>Tap an item on the menu to have a look.<br><small>What you buy is packed for your next battle. Anything you don't use stays in your bag.</small></p>`
        : `<button class="mm-open-menu" id="mmOpenMenu" type="button"><img src="${itemIcon("bento")}" alt=""><span><b>SEE AUNTIE'S MENU</b><small>9 items for your next battle</small></span></button>`;
      return;
    }
    const n = bag[it.id] || 0, w = why(it);
    const reason = w === "coins" ? `You need ${it.price - coins} more coins` : w === "max" ? `You can carry ${SHOP_LIMIT.each} of these at most` : w === "full" ? "Your bag is full" : "";
    $("mmCard").className = "mm-card";
    $("mmCard").innerHTML = `<span class="mm-card-icon"><img src="${itemIcon(it.id)}" alt=""></span>
      <div class="mm-card-text"><h3>${esc(it.name)}</h3><p class="mm-fx">${esc(it.shop || it.desc)}</p>
        <p class="mm-own">In your bag: <b>${n}</b> / ${SHOP_LIMIT.each}${it.passive ? " · works by itself next battle" : ""}</p></div>
      <div class="mm-card-buy"><button class="mm-buy" id="mmBuy" type="button" ${w || busy ? "disabled" : ""}>
        <span>BUY</span><b><i class="mm-coin"></i>${it.price}</b></button>${reason ? `<small>${reason}</small>` : ""}</div>`;
  }

  // ---- the menu ----
  function showMenu(on) {
    if (menuOpen === on) return;
    menuOpen = on; SFX.play("select");
    root.classList.toggle("menu-open", on);
    if (!on) sel = null;
    render();
    if (on) say(pick(["Here, Auntie's menu! Take your time, look properly.", "Everything on the menu, all fresh one. Choose, choose!", "This one Auntie's menu. Anything you like, just point."]));
    else say(pick(["Want to see the menu again, just ask Auntie.", "Ok, ok. Menu here whenever you want."]));
  }

  // ---- buying ----
  function choose(id) {
    if (!ITEM_BY_ID[id]) return;
    SFX.play("select");
    sel = id; render();
    const b = root.querySelector(`.mm-tile[data-item="${id}"]`);
    b.classList.remove("lift"); void b.offsetWidth; b.classList.add("lift");
    say(PATTER[id] || ITEM_BY_ID[id].shop);
  }
  function buy() {
    const it = sel && ITEM_BY_ID[sel]; if (!it || busy) return;
    const w = why(it); if (w) { say(NOPE[w]); SFX.play("fizzle"); return; }
    busy = true; renderCard();
    socket.emit("tBuy", { itemId: it.id });
    setTimeout(() => { if (busy) { busy = false; renderCard(); } }, 3000);
  }
  socket.on("tShop", (r) => {
    busy = false;
    if (!open) return;
    if (!r?.ok) { say(NOPE[r?.reason] || "Aiyoh, cannot lah. Try again later."); SFX.play("fizzle"); renderCard(); return; }
    const from = root.querySelector(`.mm-tile[data-item="${r.itemId}"] img`);
    coins = r.coins; bag = { ...r.bag }; render();
    SFX.play("buy");
    say(pick(THANKS), true);
    fly(from, r.itemId);
    const c = $("mmCoins"); c.classList.remove("tick"); void c.offsetWidth; c.classList.add("tick");
  });
  // the item hops off the shelf into the bag
  function fly(fromImg, id) {
    const slots = root.querySelectorAll(".mm-slot.full"), to = slots[slots.length - 1];
    if (!fromImg || !to || !fromImg.animate) return;
    const a = fromImg.getBoundingClientRect(), b = to.getBoundingClientRect();
    const g = document.createElement("img"); g.src = itemIcon(id); g.className = "mm-fly";
    g.style.cssText = `left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px`;
    document.body.appendChild(g);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2), s = b.width / a.width;
    to.style.visibility = "hidden";
    g.animate([
      { transform: "translate(0,0) scale(1)", offset: 0 },
      { transform: `translate(${dx * 0.45}px,${dy * 0.45 - 90}px) scale(1.25) rotate(-8deg)`, offset: 0.45 },
      { transform: `translate(${dx}px,${dy}px) scale(${s}) rotate(0deg)`, offset: 1 },
    ], { duration: 620, easing: "cubic-bezier(.3,.7,.4,1)" }).onfinish = () => {
      g.remove(); to.style.visibility = ""; to.classList.add("landed");
    };
  }

  // ---- open / close ----
  function show({ coins: c = 0, bag: b = {}, earned = 0 } = {}) {
    coins = c; bag = { ...(b || {}) }; sel = null; busy = false;
    if (!open) { menuOpen = false; root.classList.remove("menu-open"); }
    if (open) { render(); return; }
    open = true;
    root.classList.remove("hidden", "closing", "entered");
    void root.offsetWidth;
    root.classList.add("entering");
    render();
    $("mmSay").innerHTML = ""; $("mmBubble").classList.remove("pop");
    SFX.play("bell");
    setTimeout(() => {
      if (!open) return;
      root.classList.add("entered");
      const hello = earned > 0 ? `Wah, you earned ${earned} coins in that battle! Come, come, spend a bit.`
        : coins >= 100 ? pick(WELCOME)
        : coins > 0 ? `Only ${coins} coins ah? Never mind, look first. Win more battles then come back!`
        : "No coins yet? Never mind! Win some battles and answer well, then come back. Auntie wait for you.";
      say(hello, true);
    }, 950);
  }
  function hide(reason) {
    if (!open) return;
    open = false; clearInterval(typeT);
    if (reason === "battle") { root.classList.add("hidden"); root.classList.remove("entering", "entered"); return; }
    say("Bye bye! Study hard, fight well!", true);
    root.classList.add("closing");
    setTimeout(() => { if (!open) root.classList.add("hidden"); root.classList.remove("closing", "entering", "entered"); }, 520);
  }

  root.addEventListener("click", (e) => {
    const item = e.target.closest(".mm-tile");
    if (item) return choose(item.dataset.item);
    if (e.target.closest("#mmOpenMenu")) return showMenu(true);
    if (e.target.closest("#mmCloseMenu")) return showMenu(false);
    if (e.target.closest("#mmBuy")) return buy();
    if (e.target.closest("#mmLeave")) { SFX.play("select"); return hide(); }
    if (e.target.closest(".mm-auntie")) { beHappy(1200); say(pick(["Hello, hello! Want what?", "Ya? Auntie here!", "Don't shy, take a look at the menu!", "Study first, then shopping. Good student!"])); }
  });
  document.addEventListener("keydown", (e) => { if (open && e.key === "Escape") { if (menuOpen) showMenu(false); else hide(); } });

  return {
    open: show,
    close: hide,
    isOpen: () => open,
    // live updates while the shop is open (coins from another tab, the round countdown)
    update(you, next) {
      if (next !== nextHtml) { nextHtml = next || ""; $("mmNext").innerHTML = nextHtml; $("mmMenuNext").innerHTML = nextHtml || "Tap an item to see what it does"; }
      if (!open || !you || busy) return;
      const nb = JSON.stringify(you.bag || {});
      if (you.coins !== coins || nb !== JSON.stringify(bag)) { coins = you.coins || 0; bag = JSON.parse(nb); render(); }
    },
  };
}
