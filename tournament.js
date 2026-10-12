// ===== Academy Rift — Class Tournament engine (server only) =====
// A teacher runs a tournament from the projector page (/teacher). Up to a whole
// class joins with one code, forms pairs, and each round the server matches the
// pairs 2v2 and starts every battle at once. Battles reuse the normal battle
// engine in server.js; this module only decides who plays whom and keeps score.
//
// Identity: every student gets a public id (pid) and a secret token. The pid is
// their player id inside battles, and every socket a student opens joins a
// socket.io room named after the pid, so the battle engine's io.to(uid) reaches
// them even after an iPad sleeps and reconnects with a new socket.

import { randomBytes } from "crypto";
import { defaultSettings, cleanSettingValue, SETTING_BY_KEY } from "./public/data/tournamentSettings.js";

export const POINTS = { win: 3, draw: 1, loss: 0 };
const NAME_MAX = 14;
const LIVE_PUSH_MS = 1500;                  // teacher's live HP refresh during a round
const ROOM_CLEANUP_MS = 2 * 60 * 1000;      // keep a finished battle room briefly, then drop it
const IDLE_EXPIRE_MS = 6 * 60 * 60 * 1000;  // forget a tournament after 6 hours without activity

const token = (n = 18) => randomBytes(n).toString("base64url");
const shuffle = (arr, rng = Math.random) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ---------------------------------------------------------------------------
//  Pure helpers (exported so the test script can check them directly)
// ---------------------------------------------------------------------------

// Order pairs by points, then correct answers, then HP left over all battles.
export function compareStanding(a, b) {
  return (b.points - a.points) || (b.correct - a.correct) || (b.hpSum - a.hpSum);
}

export function rankPairs(pairs) {
  const sorted = pairs.slice().sort((a, b) => compareStanding(a, b) || a.name.localeCompare(b.name));
  let rank = 0, prev = null;
  return sorted.map((p, i) => {
    if (!prev || compareStanding(prev, p) !== 0) rank = i + 1;
    prev = p;
    return { pair: p, rank };
  });
}

const hasPlayed = (a, b) => a.opponents.includes(b.id);

// Pair up an even-length list in order, backtracking to avoid repeat opponents.
// Returns null if no repeat-free pairing exists within the search budget.
function pairInOrder(list, avoidRepeats, budget = { n: 20000 }) {
  if (!list.length) return [];
  if (--budget.n < 0) return null;
  const [a, ...rest] = list;
  for (let i = 0; i < rest.length; i++) {
    const b = rest[i];
    if (avoidRepeats && hasPlayed(a, b)) continue;
    const sub = pairInOrder(rest.filter((_, j) => j !== i), avoidRepeats, budget);
    if (sub) return [[a, b], ...sub];
  }
  return null;
}

// Fallback when repeats cannot be avoided: greedy, taking the nearest opponent
// not yet met, otherwise the nearest one.
function pairGreedy(list) {
  const left = list.slice(), out = [];
  while (left.length >= 2) {
    const a = left.shift();
    let k = left.findIndex((b) => !hasPlayed(a, b));
    if (k < 0) k = 0;
    out.push([a, left.splice(k, 1)[0]]);
  }
  return out;
}

const repeatCount = (matches) => matches.filter(([a, b]) => hasPlayed(a, b)).length;

// Decide this round's battles.
//   pairs:    the pairs taking part (objects with id, points, correct, hpSum, opponents, oddCount)
//   settings: tournament settings (matching, avoidRepeats)
//   roundNo:  1-based number of the round being drawn
// Returns { matches: [[pairA, pairB], ...], leftover: pair | null }
export function makeMatchups(pairs, settings, roundNo, rng = Math.random) {
  let pool = shuffle(pairs, rng);                       // random tie-breaks everywhere
  const swiss = settings.matching === "swiss" && roundNo > 1;
  if (swiss) pool.sort(compareStanding);

  // Odd number of pairs: one pair is left over. Only pairs that have been left
  // over the fewest times are eligible. Swiss leaves out the lowest of them.
  let leftover = null;
  if (pool.length % 2 === 1) {
    const fewest = Math.min(...pool.map((p) => p.oddCount));
    const eligible = pool.filter((p) => p.oddCount === fewest);
    leftover = swiss ? eligible[eligible.length - 1] : eligible[Math.floor(rng() * eligible.length)];
    pool = pool.filter((p) => p !== leftover);
  }

  let matches;
  if (swiss) {
    matches = (settings.avoidRepeats && pairInOrder(pool, true)) || pairGreedy(pool);
  } else {
    // Random: try many shuffles and keep the one with the fewest repeat opponents.
    const tries = settings.avoidRepeats ? 400 : 1;
    let best = null, bestRepeats = Infinity;
    for (let t = 0; t < tries && bestRepeats > 0; t++) {
      const s = t === 0 ? pool : shuffle(pool, rng);
      const m = [];
      for (let i = 0; i + 1 < s.length; i += 2) m.push([s[i], s[i + 1]]);
      const r = repeatCount(m);
      if (r < bestRepeats) { best = m; bestRepeats = r; }
    }
    matches = best || [];
  }
  return { matches, leftover };
}

// ---------------------------------------------------------------------------
//  Tournament system
// ---------------------------------------------------------------------------
// deps (from server.js):
//   io, rooms                  shared socket server and battle-room map
//   isRoomCode(code)           true if a normal room already uses the code
//   setSocketRoom(sid, code)   tell the battle engine which battle a socket is in
//   startBattle(room)          begin a battle in a prepared room
//   timeUp(room)               end a live battle now, deciding the winner by HP
//   publicRoom(room)           the battle state as clients see it
//   CHARACTERS                 fighter list (for random picks)
export function setupTournaments(deps) {
  const { io, rooms, isRoomCode, setSocketRoom, startBattle, timeUp, publicRoom, CHARACTERS } = deps;
  const tournaments = new Map();   // code -> tournament

  const randChar = () => CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].id;

  function newCode() {
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";   // no I or O (they look like 1 and 0)
    let c;
    do { c = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join(""); }
    while (tournaments.has(c) || isRoomCode(c));
    return c;
  }

  const has = (code) => tournaments.has((code || "").toUpperCase());
  const touch = (T) => { T.lastActive = Date.now(); };
  const humans = (T) => [...T.students.values()].filter((s) => !s.bot && !s.removed);
  const pairName = (T, p) => p.members.map((pid) => T.students.get(pid)?.name || "?").join(" & ");

  function createTournament(hostSocket) {
    const T = {
      code: newCode(), hostToken: token(), hostSocket: hostSocket.id,
      createdAt: Date.now(), lastActive: Date.now(),
      status: "lobby", round: 0, settings: defaultSettings(),
      students: new Map(), pairs: new Map(), matches: [], byes: [],
      seq: 0,
    };
    tournaments.set(T.code, T);
    return T;
  }

  // ---------- views ----------
  function teamHp(battle, team) {
    let hp = 0, max = 0;
    for (const c of Object.values(battle.combatants)) if (c.team === team) { hp += Math.max(0, c.hp); max += c.maxHp; }
    return { hp: Math.round(hp), max };
  }

  function matchView(T, m) {
    const room = m.roomCode ? rooms.get(m.roomCode) : null;
    const b = room?.battle;
    const side = (pairId, team) => {
      const p = pairId ? T.pairs.get(pairId) : null;
      const live = b ? teamHp(b, team) : null;
      return { pairId, name: p ? pairName(T, p) : "Rift Bots", hp: live?.hp ?? null, maxHp: live?.max ?? null };
    };
    return {
      id: m.id, round: m.round, status: m.status,
      a: side(m.a, 0), b: side(m.b, 1),
      msLeft: m.status === "live" && b?.endsAt ? Math.max(0, b.endsAt - Date.now()) : null,
      result: m.result || null,
    };
  }

  function standingsRows(T) {
    return rankPairs([...T.pairs.values()].map((p) => ({ ...p, name: pairName(T, p) }))).map(({ pair: p, rank }) => ({
      rank, pairId: p.id, name: p.name, points: p.points, wins: p.wins, draws: p.draws, losses: p.losses,
      played: p.played, correct: p.correct, answered: p.answered, hpPct: Math.round(p.hpSum * 100),
      members: p.members.map((pid) => {
        const s = T.students.get(pid);
        return { pid, name: s?.name || "?", bot: !!s?.bot, connected: !!s?.connected, correct: s?.correct || 0, answered: s?.answered || 0 };
      }),
    }));
  }

  function hostView(T) {
    return {
      code: T.code, status: T.status, round: T.round, settings: T.settings,
      students: humans(T).map((s) => ({
        pid: s.pid, name: s.name, connected: s.connected, pairId: s.pairId, wants: s.wants, character: s.character,
      })),
      pairs: [...T.pairs.values()].map((p) => ({ id: p.id, name: pairName(T, p), members: p.members, createdRound: p.createdRound })),
      standings: standingsRows(T),
      matches: T.matches.map((m) => matchView(T, m)),
      byes: T.byes,
      serverNow: Date.now(),
    };
  }

  function studentView(T, s) {
    const pair = s.pairId ? T.pairs.get(s.pairId) : null;
    const partnerPid = pair?.members.find((pid) => pid !== s.pid);
    const partner = partnerPid ? T.students.get(partnerPid) : null;
    const rows = standingsRows(T);
    const finished = T.status === "finished";
    const show = finished ? "all" : T.settings.showStandings;
    const mine = rows.find((r) => r.pairId === s.pairId) || null;
    // (a student without a pair has no battles; the bot side of a battle also has no pair id)
    const myMatches = !s.pairId ? [] : T.matches.filter((m) => m.a === s.pairId || m.b === s.pairId).map((m) => {
      const v = matchView(T, m);
      const mySide = m.a === s.pairId ? "a" : "b";
      return { round: m.round, status: m.status, vs: mySide === "a" ? v.b.name : v.a.name, mySide, result: m.result };
    });
    const myBye = s.pairId ? T.byes.find((y) => y.round === T.round && y.pairId === s.pairId) || null : null;
    return {
      code: T.code, status: T.status, round: T.round,
      settings: { pairing: T.settings.pairing, fighters: T.settings.fighters, rounds: T.settings.rounds, showStandings: T.settings.showStandings },
      you: { pid: s.pid, name: s.name, pairId: s.pairId, wants: s.wants, character: s.character },
      partner: partner ? { pid: partner.pid, name: partner.name, character: partner.character, bot: !!partner.bot, connected: !!partner.connected } : null,
      classmates: s.pairId ? [] : humans(T)
        .filter((o) => o.pid !== s.pid && !o.pairId)
        .map((o) => ({ pid: o.pid, name: o.name, wantsYou: o.wants === s.pid, connected: o.connected })),
      standings: show === "all" ? rows : null,
      mine: show === "none" ? null : mine,
      totalPairs: rows.length,
      myMatches, myBye,
    };
  }

  // ---------- pushing state ----------
  function push(T) {
    if (T._pushT) return;
    T._pushT = setTimeout(() => {
      T._pushT = null;
      io.to("host:" + T.code).emit("tHost", hostView(T));
      for (const s of T.students.values()) if (!s.bot && !s.removed && s.connected) io.to(s.pid).emit("tState", studentView(T, s));
    }, 80);
  }

  // Keep the projector's HP bars and clocks moving during a round.
  function ensureLiveTicker(T) {
    if (T._ticker) return;
    T._ticker = setInterval(() => {
      if (T.status !== "round") { clearInterval(T._ticker); T._ticker = null; return; }
      io.to("host:" + T.code).emit("tHost", hostView(T));
    }, LIVE_PUSH_MS);
  }

  // ---------- students ----------
  function uniqueName(T, wanted, exceptPid) {
    let base = (wanted || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX) || "Player";
    const taken = new Set(humans(T).filter((s) => s.pid !== exceptPid).map((s) => s.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let n = 2; n < 100; n++) {
      const tryName = `${base.slice(0, NAME_MAX - 3)} ${n}`;
      if (!taken.has(tryName.toLowerCase())) return tryName;
    }
    return base;
  }

  function bindStudentSocket(T, s, socket) {
    // An older socket for the same student (another tab or device) is retired.
    if (s.socketId && s.socketId !== socket.id) {
      const old = io.sockets.sockets.get(s.socketId);
      if (old) {
        old.leave(s.pid);
        old.data.pid = null; old.data.tcode = null;
        old.emit("tKicked", "You opened the tournament on another screen.");
      }
    }
    s.socketId = socket.id;
    s.connected = true;
    socket.data.pid = s.pid;
    socket.data.tcode = T.code;
    socket.join(s.pid);
  }

  // Put a returning student back into the battle they were in, if it is still live.
  function reattachToBattle(T, s, socket) {
    if (!s.pairId) return;
    const m = T.matches.find((x) => x.status === "live" && (x.a === s.pairId || x.b === s.pairId));
    const room = m && rooms.get(m.roomCode);
    if (!room?.battle) return;
    socket.join(room.code);
    setSocketRoom(socket.id, room.code);
    const c = room.battle.combatants[s.pid];
    if (c && c.bot) {
      c.bot = false;
      io.to(room.code).emit("toast", `${c.name} is back!`);
    }
    socket.emit("battleStart");
    socket.emit("room", publicRoom(room));
  }

  // auto: a silent rejoin after a reload or reconnect. If it no longer matches
  // anything, the client is told to forget the saved session (tGone).
  function join(socket, { code, name, token: tok, auto = false }) {
    const T = tournaments.get((code || "").toUpperCase());
    if (!T) return auto ? socket.emit("tGone") : socket.emit("errorMsg", "Tournament not found.");
    let s = tok ? [...T.students.values()].find((x) => x.token === tok && !x.bot) : null;
    if (!s && auto) return socket.emit("tGone");
    if (!s && T.status === "finished") return socket.emit("errorMsg", "That tournament has finished.");
    touch(T);
    if (!s) {
      s = {
        pid: "s_" + token(6), token: token(), name: uniqueName(T, name), bot: false,
        socketId: null, connected: false, pairId: null, wants: null, character: null,
        correct: 0, answered: 0, joinedAt: Date.now(),
      };
      T.students.set(s.pid, s);
    }
    bindStudentSocket(T, s, socket);
    socket.emit("tJoined", { code: T.code, you: s.pid, token: s.token, name: s.name });
    reattachToBattle(T, s, socket);
    push(T);
  }

  function createPair(T, pidA, pidB) {
    const id = "p" + (++T.seq);
    const p = {
      id, members: [pidA, pidB], createdRound: T.round,
      points: 0, wins: 0, draws: 0, losses: 0, played: 0, correct: 0, answered: 0, hpSum: 0,
      oddCount: 0, opponents: [],
    };
    T.pairs.set(id, p);
    for (const pid of p.members) { const s = T.students.get(pid); s.pairId = id; s.wants = null; }
    // nobody should still be waiting on someone who just paired up
    for (const o of T.students.values()) if (p.members.includes(o.wants)) o.wants = null;
    return p;
  }

  function splitPair(T, pairId) {
    const p = T.pairs.get(pairId); if (!p) return;
    for (const pid of p.members) {
      const s = T.students.get(pid);
      if (!s) continue;
      if (s.bot) T.students.delete(pid); else s.pairId = null;
    }
    T.pairs.delete(pairId);
  }

  function addBotPartner(T, s) {
    const bot = {
      pid: "b_" + token(6), token: null, name: "Rift Bot", bot: true, socketId: null, connected: false,
      pairId: null, wants: null, character: null, correct: 0, answered: 0,
    };
    T.students.set(bot.pid, bot);
    return createPair(T, s.pid, bot.pid);
  }

  // Randomly pair the given unpaired students. Returns any one left over.
  function drawPairs(T, list) {
    const pool = shuffle(list);
    while (pool.length >= 2) createPair(T, pool.pop().pid, pool.pop().pid);
    return pool[0] || null;
  }

  // ---------- rounds ----------
  function seatFor(T, pid, team) {
    const s = T.students.get(pid);
    const character = (T.settings.fighters === "random" || !s.character) ? randChar() : s.character;
    return { id: pid, name: s.name, team, character, ready: true, bot: s.bot || !s.connected };
  }

  function startMatch(T, pairA, pairB) {
    const m = { id: "m" + (++T.seq), round: T.round, a: pairA.id, b: pairB ? pairB.id : null, status: "live", roomCode: null, result: null };
    const players = [...pairA.members.map((pid) => seatFor(T, pid, 0))];
    if (pairB) players.push(...pairB.members.map((pid) => seatFor(T, pid, 1)));
    else players.push(
      { id: "bot_" + token(5), name: "Rift Bot A", team: 1, character: randChar(), ready: true, bot: true },
      { id: "bot_" + token(5), name: "Rift Bot B", team: 1, character: randChar(), ready: true, bot: true },
    );
    let code;
    do { code = "B" + token(4).replace(/[^A-Za-z0-9]/g, "x").toUpperCase(); } while (rooms.has(code));
    const room = {
      code, status: "lobby", hostId: null, players, battle: null,
      topicId: T.settings.topicId, tournament: T.code, matchId: m.id,
      settings: {
        questionSeconds: T.settings.questionSeconds,
        stealSeconds: T.settings.stealSeconds,
        timeLimitMin: T.settings.timeLimitMin,
      },
    };
    rooms.set(code, room);
    m.roomCode = code;
    T.matches.push(m);
    // move every connected student's socket into the battle room
    for (const p of players) {
      const s = T.students.get(p.id);
      if (!s || s.bot || !s.connected || !s.socketId) continue;
      const sock = io.sockets.sockets.get(s.socketId);
      if (sock) { sock.join(code); setSocketRoom(sock.id, code); }
    }
    startBattle(room);
    return m;
  }

  function recordBye(T, pair, kind) {
    pair.oddCount++;
    T.byes.push({ round: T.round, pairId: pair.id, kind });
    if (kind === "freewin") { pair.points += POINTS.win; pair.wins++; pair.played++; }
  }

  function startRound(T) {
    if (T.status !== "lobby" && T.status !== "between") return "A round is already running.";
    if (T.round >= T.settings.rounds) return "All rounds have been played. Add a round in Settings to play another.";

    // 1. anyone online without a partner is paired at random; a last single student gets a bot partner
    const single = humans(T).filter((s) => !s.pairId && s.connected);
    const leftoverStudent = drawPairs(T, single);
    if (leftoverStudent) addBotPartner(T, leftoverStudent);

    // 2. pairs with nobody online sit this round out (no points)
    const active = [...T.pairs.values()].filter((p) => p.members.some((pid) => {
      const s = T.students.get(pid); return s && !s.bot && s.connected;
    }));
    if (!active.length) return "Nobody has joined yet.";
    if (active.length === 1 && T.settings.oddPair !== "bots")
      return "Only one pair is here. Set \"Odd number of pairs\" to fight bots, or wait for more students.";

    T.round++;
    T.status = "round";
    const { matches, leftover } = makeMatchups(active, T.settings, T.round);
    for (const [a, b] of matches) startMatch(T, a, b);
    if (leftover) {
      if (T.settings.oddPair === "bots") { leftover.oddCount++; startMatch(T, leftover, null); }
      else recordBye(T, leftover, T.settings.oddPair);
    }
    touch(T);
    if (!T.matches.some((m) => m.round === T.round && m.status === "live")) finishRound(T);
    ensureLiveTicker(T);
    push(T);
    return null;
  }

  function finishRound(T) {
    T.status = T.round >= T.settings.rounds ? "finished" : "between";
    push(T);
  }

  // Called by server.js when any battle ends. winner: 0 | 1 | -1 (draw)
  function onBattleEnd(room, { winner, reason }) {
    const T = tournaments.get(room.tournament); if (!T) return;
    const m = T.matches.find((x) => x.id === room.matchId); if (!m || m.status !== "live") return;
    const b = room.battle;
    const sideStats = (team, pairId) => {
      const hp = teamHp(b, team);
      const p = pairId ? T.pairs.get(pairId) : null;
      let correct = 0, answered = 0;
      for (const pid of p?.members || []) {
        const rev = b.review?.[pid] || [];
        const c = rev.filter((x) => x.correct).length;
        correct += c; answered += rev.length;
        const s = T.students.get(pid);
        if (s && !s.bot) { s.correct += c; s.answered += rev.length; }
      }
      return { hpFrac: hp.max ? hp.hp / hp.max : 0, correct, answered };
    };
    const A = sideStats(0, m.a), B = sideStats(1, m.b);
    const res = winner === 0 ? "a" : winner === 1 ? "b" : "draw";
    m.status = "done";
    m.result = {
      winner: res, reason,
      hpPct: { a: Math.round(A.hpFrac * 1000) / 10, b: Math.round(B.hpFrac * 1000) / 10 },
      correct: { a: A.correct, b: B.correct },
    };
    const apply = (pairId, stats, outcome, oppId) => {
      const p = pairId && T.pairs.get(pairId); if (!p) return;
      p.played++; p.correct += stats.correct; p.answered += stats.answered; p.hpSum += stats.hpFrac;
      if (outcome === "win") { p.wins++; p.points += POINTS.win; }
      else if (outcome === "draw") { p.draws++; p.points += POINTS.draw; }
      else p.losses++;
      if (oppId) p.opponents.push(oppId);
    };
    apply(m.a, A, res === "a" ? "win" : res === "draw" ? "draw" : "loss", m.b);
    apply(m.b, B, res === "b" ? "win" : res === "draw" ? "draw" : "loss", m.a);

    // drop the battle room a little later (students are back on the tournament screen by then)
    setTimeout(() => { rooms.delete(room.code); io.in(room.code).socketsLeave(room.code); }, ROOM_CLEANUP_MS);
    touch(T);
    if (!T.matches.some((x) => x.round === T.round && x.status === "live")) finishRound(T);
    else push(T);
  }

  function endRoundNow(T) {
    for (const m of T.matches) {
      if (m.status !== "live") continue;
      const room = rooms.get(m.roomCode);
      if (room?.battle) timeUp(room);
    }
  }

  // ---------- socket wiring ----------
  function bind(socket) {
    const hostT = () => {
      const T = tournaments.get(socket.data.hostOf);
      return T && T.hostSocket === socket.id ? T : null;
    };
    const myT = () => tournaments.get(socket.data.tcode);
    const meS = (T) => T?.students.get(socket.data.pid);
    const fail = (msg) => socket.emit("tError", msg);
    const asHost = (fn) => (arg = {}) => { const T = hostT(); if (!T) return fail("This screen is no longer the host. Reload the page."); touch(T); fn(T, arg); };

    // ---- teacher ----
    socket.on("tCreate", () => {
      const T = createTournament(socket);
      socket.data.hostOf = T.code;
      socket.join("host:" + T.code);
      socket.emit("tHostJoined", { code: T.code, hostToken: T.hostToken });
      push(T);
    });

    socket.on("tResume", ({ code, hostToken } = {}) => {
      const T = tournaments.get((code || "").toUpperCase());
      if (!T || T.hostToken !== hostToken) return socket.emit("tHostGone");
      if (T.hostSocket && T.hostSocket !== socket.id) {
        const old = io.sockets.sockets.get(T.hostSocket);
        if (old) { old.leave("host:" + T.code); old.emit("tHostMoved"); }
      }
      T.hostSocket = socket.id;
      socket.data.hostOf = T.code;
      socket.join("host:" + T.code);
      socket.emit("tHostJoined", { code: T.code, hostToken: T.hostToken });
      if (T.status === "round") ensureLiveTicker(T);
      push(T);
    });

    socket.on("tSetting", asHost((T, { key, value }) => {
      const def = SETTING_BY_KEY[key]; if (!def) return;
      if (def.lockedAfterStart && T.round > 0) return fail(`"${def.label}" can only be changed before Round 1.`);
      const v = cleanSettingValue(key, value);
      if (v === undefined) return;
      if (key === "rounds" && v < T.round) return fail(`${T.round} rounds have already been played.`);
      T.settings[key] = v;
      if (key === "pairing") for (const s of T.students.values()) s.wants = null;
      if (key === "rounds" && T.status === "finished" && v > T.round) T.status = "between";
      if (key === "rounds" && T.status === "between" && v === T.round) T.status = "finished";
      push(T);
    }));

    socket.on("tPair", asHost((T, { a, b }) => {
      const A = T.students.get(a), B = T.students.get(b);
      if (!A || !B || A === B || A.bot || B.bot || A.removed || B.removed) return;
      if (A.pairId || B.pairId) return fail("Both students must be without a partner.");
      createPair(T, a, b);
      push(T);
    }));

    socket.on("tSplit", asHost((T, { pairId }) => {
      if (T.round > 0) return fail("Pairs are fixed once Round 1 has started.");
      splitPair(T, pairId);
      push(T);
    }));

    socket.on("tDraw", asHost((T, { redraw } = {}) => {
      if (redraw) {
        if (T.round > 0) return fail("Pairs are fixed once Round 1 has started.");
        for (const id of [...T.pairs.keys()]) splitPair(T, id);
      }
      drawPairs(T, humans(T).filter((s) => !s.pairId));
      push(T);
    }));

    socket.on("tRemove", asHost((T, { pid }) => {
      const s = T.students.get(pid); if (!s || s.bot) return;
      if (s.pairId) {
        if (T.round > 0) return fail("A student in a pair cannot be removed after Round 1 has started.");
        splitPair(T, s.pairId);
      }
      s.removed = true;
      for (const o of T.students.values()) if (o.wants === pid) o.wants = null;
      if (s.socketId) {
        const sock = io.sockets.sockets.get(s.socketId);
        if (sock) { sock.leave(s.pid); sock.data.pid = null; sock.data.tcode = null; sock.emit("tKicked", "Your teacher removed you from the tournament."); }
      }
      T.students.delete(pid);
      push(T);
    }));

    socket.on("tStartRound", asHost((T) => { const err = startRound(T); if (err) fail(err); }));
    socket.on("tEndRound", asHost((T) => { if (T.status === "round") endRoundNow(T); }));
    socket.on("tFinish", asHost((T) => {
      if (T.status === "round") return fail("End the current round first.");
      T.status = "finished";
      push(T);
    }));

    // ---- students ----
    socket.on("tRejoin", ({ code, token: tok } = {}) => join(socket, { code, token: tok, auto: true }));

    socket.on("tChoosePartner", ({ pid } = {}) => {
      const T = myT(), s = meS(T); if (!T || !s) return;
      if (T.settings.pairing !== "students") return;
      if (s.pairId) return;
      if (!pid) { s.wants = null; return push(T); }
      const o = T.students.get(pid);
      if (!o || o.bot || o.removed || o.pairId || o === s) return;
      s.wants = pid;
      if (o.wants === s.pid) createPair(T, s.pid, o.pid);
      push(T);
    });

    socket.on("tLeavePair", () => {
      const T = myT(), s = meS(T); if (!T || !s || !s.pairId) return;
      if (T.round > 0 || T.settings.pairing !== "students") return;
      splitPair(T, s.pairId);
      push(T);
    });

    socket.on("tPickFighter", ({ charId } = {}) => {
      const T = myT(), s = meS(T); if (!T || !s) return;
      if (!CHARACTERS.some((c) => c.id === charId)) return;
      s.character = charId;
      push(T);
    });

    socket.on("tLeave", () => {
      const T = myT(), s = meS(T); if (!T || !s) return;
      socket.leave(s.pid);
      socket.data.pid = null; socket.data.tcode = null;
      if (!s.pairId) T.students.delete(s.pid);
      else s.connected = false;
      push(T);
    });
  }

  // A socket disconnected. Returns true if it was a stale socket that the battle
  // engine should ignore (the student is already connected on a newer socket).
  function onDisconnect(socket) {
    const T = tournaments.get(socket.data.tcode);
    const s = T?.students.get(socket.data.pid);
    if (s) {
      if (s.socketId !== socket.id) return true;
      s.connected = false;
      s.socketId = null;
      push(T);
    }
    const H = tournaments.get(socket.data.hostOf);
    if (H && H.hostSocket === socket.id) H.hostSocket = null;
    return false;
  }

  // forget idle tournaments
  setInterval(() => {
    const now = Date.now();
    for (const [code, T] of tournaments) {
      if (now - T.lastActive < IDLE_EXPIRE_MS) continue;
      clearInterval(T._ticker);
      tournaments.delete(code);
    }
  }, 10 * 60 * 1000).unref();

  return { has, join, bind, onBattleEnd, onDisconnect, _tournaments: tournaments };
}
