// The teacher's mode switcher, shared by every teacher page: Class Tournament, Total War, Question Hub and
// the Learning Report. A page puts <span data-modes></span> where it wants the switch button, and
// <div data-modes="cards"></div> where it wants big cards (start screens). Pages with neither get a small
// floating button. A mode that is running on this computer shows its code, so the teacher can hop back.
(function () {
  const MODES = [
    { id: "tournament", name: "Class Tournament", sub: "Pairs battle pairs, round by round", icon: "🏆", href: "/teacher", key: "riftHost" },
    { id: "war", name: "Total War", sub: "You command the Crimson Host against the class", icon: "🏰", href: "/total-war/command.html", key: "tw.host" },
    { id: "hub", name: "Question Hub", sub: "Your question sets, pictures and Blooket sheets", icon: "📚", href: "/hub" },
    { id: "report", name: "Learning Report", sub: "What the class got right and wrong", icon: "📖", href: "/report", newTab: true },
  ];
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const here = path.startsWith("/total-war") ? "war" : path.startsWith("/hub") ? "hub" : path.startsWith("/report") ? "report" : path.startsWith("/teacher") ? "tournament" : null;
  const running = (m) => { if (!m.key) return null; try { const s = JSON.parse(localStorage.getItem(m.key) || "null"); return s && s.code ? s.code : null; } catch { return null; } };
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const css = `
.rm-btn{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 14px;background:#120f18;border:2px solid #d8bd80;box-shadow:0 0 0 2px #000;color:#f2ead6;font:700 14px "Rift Display","Rift Pixel",system-ui,sans-serif;letter-spacing:1px;cursor:pointer;white-space:nowrap}
.rm-btn:hover{background:#221a10}
.rm-btn b{color:#e9cf8e}
.rm-float{position:fixed;left:14px;bottom:14px;z-index:9999}
.rm-menu{position:fixed;z-index:10000;width:min(360px,calc(100vw - 24px));padding:8px;background:#0f0d14;border:2px solid #d8bd80;box-shadow:0 0 0 2px #000,0 20px 60px #000c}
.rm-menu .rm-h{padding:6px 8px 8px;font:700 11px "Rift Display",system-ui,sans-serif;letter-spacing:3px;color:#d8bd80}
.rm-item{display:flex;align-items:center;gap:12px;padding:10px;color:#f2ead6;text-decoration:none;border:1px solid transparent}
.rm-item:hover,.rm-item:focus-visible{background:#1d1824;border-color:#d8bd8066;outline:none}
.rm-item.here{background:#221a10;border-color:#d8bd80}
.rm-ico{width:40px;height:40px;flex:0 0 40px;display:flex;align-items:center;justify-content:center;font-size:22px;background:#07060a;border:1px solid #d8bd8055}
.rm-t{display:flex;flex-direction:column;gap:2px;min-width:0}
.rm-t b{font:700 16px "Rift Display",system-ui,sans-serif;letter-spacing:.5px}
.rm-t small{font:400 13px "Rift Body",system-ui,sans-serif;color:#b9b2a6}
.rm-live{margin-left:auto;padding:2px 8px;background:#2fb38c;color:#06201c;font:700 11px "Rift Display",system-ui,sans-serif;letter-spacing:1px;white-space:nowrap}
.rm-here{margin-left:auto;white-space:nowrap;font:700 11px "Rift Display",system-ui,sans-serif;letter-spacing:1px;color:#d8bd80}
.rm-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-top:14px;text-align:left}
.rm-card{display:flex;gap:12px;align-items:center;padding:12px;background:#0c0a10cc;border:2px solid #d8bd8066;box-shadow:0 0 0 2px #000;color:#f2ead6;text-decoration:none}
.rm-card:hover{border-color:#d8bd80;background:#1d1824}
.rm-card .rm-t b{font-size:15px}`;
  const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);

  const item = (m, cls = "rm-item") => {
    const code = running(m);
    const tag = m.id === here ? '<span class="rm-here">YOU ARE HERE</span>' : code ? `<span class="rm-live">RUNNING · ${esc(code)}</span>` : "";
    return `<a class="${cls}${m.id === here ? " here" : ""}" href="${m.href}"${m.newTab ? ' target="_blank" rel="noopener"' : ""}><span class="rm-ico" aria-hidden="true">${m.icon}</span><span class="rm-t"><b>${esc(m.name)}</b><small>${esc(m.sub)}</small></span>${tag}</a>`;
  };

  let menu = null;
  function close() { if (menu) { menu.remove(); menu = null; } }
  function open(btn) {
    if (menu) return close();
    menu = document.createElement("div"); menu.className = "rm-menu"; menu.setAttribute("role", "menu");
    menu.innerHTML = `<div class="rm-h">SWITCH GAME MODE</div>` + MODES.map((m) => item(m)).join("");
    document.body.appendChild(menu);
    const r = btn.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight;
    const left = Math.max(12, Math.min(innerWidth - w - 12, r.left));
    const top = r.bottom + 8 + h < innerHeight ? r.bottom + 8 : Math.max(12, r.top - h - 8);
    menu.style.left = left + "px"; menu.style.top = top + "px";
    menu.querySelector("a")?.focus();
  }
  document.addEventListener("click", (e) => { if (menu && !menu.contains(e.target) && !e.target.closest(".rm-btn")) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  function button(host) {
    const b = document.createElement("button"); b.type = "button"; b.className = "rm-btn";
    b.innerHTML = '⇄ <b>MODES</b>'; b.setAttribute("aria-haspopup", "menu"); b.title = "Switch between Class Tournament, Total War, the Question Hub and the Learning Report";
    b.addEventListener("click", () => open(b));
    host.appendChild(b);
  }
  function mount() {
    const spots = document.querySelectorAll("[data-modes]");
    let buttons = 0;
    spots.forEach((el) => {
      if (el.dataset.modes === "cards") { el.className = "rm-cards"; el.innerHTML = MODES.filter((m) => m.id !== here).map((m) => item(m, "rm-card")).join(""); }
      else { button(el); buttons++; }
    });
    if (!buttons) { const f = document.createElement("div"); f.className = "rm-float"; document.body.appendChild(f); button(f); }
  }
  // the cards show which modes are running, so refresh them when the teacher comes back to this tab
  addEventListener("focus", () => document.querySelectorAll('[data-modes="cards"]').forEach((el) => { el.innerHTML = MODES.filter((m) => m.id !== here).map((m) => item(m, "rm-card")).join(""); }));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
