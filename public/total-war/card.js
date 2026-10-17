// The Academy Rift question card: the same frame, clock, time bar, reading cover and diamond answer keys
// as the Arena, so students know exactly what to expect. Timing comes from the server.
import { esc } from './map.js';

export function createCard(root, { onPick } = {}) {
  root.className = 'tw-card hidden';
  root.setAttribute('role', 'dialog');
  root.innerHTML = `<i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
    <div class="card-top"><img class="card-thumb" alt=""><span class="card-diamond">◆</span><span class="card-tag"></span><span class="card-topic"></span><span class="card-sub"></span><span class="card-spacer"></span><span class="card-clock"></span></div>
    <div class="card-bar"><i></i></div>
    <div class="card-note hidden"></div>
    <div class="card-qrow"><div class="card-pic hidden"><img alt="Picture for this question"></div><p class="card-q"></p></div>
    <div class="card-choices"></div>
    <div class="card-feedback hidden"></div>`;
  const $ = (s) => root.querySelector(s);
  let current = null, offset = 0, speed = 1, timer = null;
  const now = () => Date.now() + offset;

  $('.card-choices').addEventListener('click', (e) => {
    const b = e.target.closest('.choice'); if (!b || b.disabled || !current) return;
    const i = +b.dataset.i;
    root.querySelectorAll('.choice').forEach((x) => { x.disabled = true; x.classList.toggle('picked', +x.dataset.i === i); });
    current.picked = i;
    onPick?.(i, current.q.startedAt);
  });

  function tick() {
    if (!current) return;
    const q = current.q, readEnd = q.startedAt + (q.recall * 1000) / speed, end = readEnd + (q.seconds * 1000) / speed;
    const t = now();
    const cover = root.querySelector('.card-reading');
    if (t < readEnd && !current.result) {
      const n = Math.max(1, Math.ceil(((readEnd - t) * speed) / 1000));
      if (cover) cover.querySelector('span').textContent = `Think of the answer. The choices appear in ${n}`;
    } else if (cover) { cover.remove(); root.querySelector('.card-choices').classList.remove('reading'); }
    const left = Math.max(0, (end - t) * speed / 1000);
    $('.card-clock').textContent = current.result ? '' : `00:${String(Math.ceil(Math.min(left, q.seconds))).padStart(2, '0')}`;
    $('.card-bar i').style.width = `${current.result ? 0 : Math.min(100, (left / q.seconds) * 100)}%`;
  }

  function show({ q, tag, topicLabel, sub = '', thumb = null, picked = null, result = null, note = '', footer = '', serverNow, speed: sp = 1 }) {
    if (serverNow) offset = serverNow - Date.now();
    speed = sp || 1;
    const same = current && current.q.startedAt === q.startedAt && current.q.q === q.q;
    root.classList.remove('hidden');
    $('.card-tag').textContent = tag;
    $('.card-topic').textContent = topicLabel || q.topic || '';
    $('.card-topic').classList.toggle('hidden', !(topicLabel || q.topic));
    $('.card-sub').textContent = sub;
    $('.card-thumb').classList.toggle('hidden', !thumb); if (thumb) $('.card-thumb').src = thumb;
    $('.card-note').classList.toggle('hidden', !note); $('.card-note').innerHTML = note;
    if (!same) {
      current = { q, picked: picked ?? null, result: null };
      $('.card-q').textContent = q.q;
      $('.card-pic').classList.toggle('hidden', !q.image); if (q.image) $('.card-pic img').src = q.image;
      const wrap = $('.card-choices');
      wrap.classList.toggle('long', q.choices.some((c) => String(c).length > 24));
      wrap.innerHTML = q.choices.map((c, i) => `<button type="button" class="choice" data-i="${i}"><span class="choice-key"><b>${'ABCD'[i]}</b></span><span class="choice-txt">${esc(c)}</span></button>`).join('');
      const readEnd = q.startedAt + (q.recall * 1000) / speed;
      if (now() < readEnd && picked == null) {
        wrap.classList.add('reading');
        const cover = document.createElement('div'); cover.className = 'card-reading';
        cover.innerHTML = '<b>Read the question</b><span>Think of the answer.</span>';
        wrap.appendChild(cover);
      }
    }
    current.picked = picked ?? current.picked;
    if (current.picked != null) root.querySelectorAll('.choice').forEach((x) => { x.disabled = true; x.classList.toggle('picked', +x.dataset.i === current.picked); });
    current.result = result;
    const fb = $('.card-feedback');
    if (result) {
      root.querySelectorAll('.choice').forEach((x) => {
        const i = +x.dataset.i; x.disabled = true;
        x.classList.toggle('correct', i === result.right);
        x.classList.toggle('wrong', i === result.chosen && i !== result.right);
      });
      fb.className = `card-feedback ${result.ok ? 'good' : 'bad'}`;
      fb.textContent = footer || (result.ok ? 'Correct!' : result.chosen < 0 ? "Time's up." : 'Not quite.');
    } else { fb.className = `card-feedback${footer ? ' info' : ' hidden'}`; fb.textContent = footer; }
    clearInterval(timer); timer = setInterval(tick, 200); tick();
  }
  function hide() { root.classList.add('hidden'); current = null; clearInterval(timer); }
  return { show, hide, get visible() { return !!current; } };
}
