# 🏰 Academy Rift

**Answer fast. Strike harder. Sync together.**

A 4-player (2v2) online science JRPG. You and a friend join a room by code and battle
two other players in a gothic castle arena. Each turn you answer a science MCQ, then act —
strike, cast a spell, defend, use an item, tag, or unleash your **Team Ultimate** when the
**Team Sync Gauge** is full. Correct answers power your action; weakness hits charge sync.

> Real online multiplayer — the server (Node + Socket.IO) is authoritative: it holds the
> questions/answers and resolves all combat, so no client can cheat.

## Run it
**Double-click `start.bat`**, then open <http://localhost:3100>.
Or from a terminal: `npm install` (first time) then `npm start`.

**To play a real match:** open the URL in **4 tabs / devices**. One player **Creates** a room
and shares the 4-letter code; the others **Join**. Pick teams + characters, then the host starts.
Short a player? The host can **+BOT** any empty slot, and disconnects auto-convert to bots so a
match never stalls.

## Class tournament (a whole class at once)
For 30 or so students: everyone joins one tournament, gets into pairs, and each round the
server matches the pairs 2v2 and starts every battle at the same time. A leaderboard tracks
who is on top. Once students are in, it runs by itself; the teacher only needs to watch.

1. On the projector computer open **`/teacher`** (for example `http://192.168.50.238:3100/teacher`,
   or `https://…onrender.com/teacher` when the game is online) and press **Start a tournament**.
2. The page shows the join link, a QR code and a 4-letter code. Students open the game on their
   iPads, type their name and the code, and press **JOIN**.
3. Students choose partners on their own screens (two students who pick each other become a
   pair) and pick a fighter. Anyone still without a partner when a round starts is paired at
   random; a student left on their own plays with a bot partner.
4. Each student taps **I'M READY**. When everyone online is ready, a 10-second countdown starts
   and Round 1 begins by itself. Every pair is sent straight into its battle.
5. When every battle in a round has finished, the leaderboard shows during a short break and the
   next round starts by itself. After the last round the projector shows the podium;
   **Download results** saves a spreadsheet (CSV) with every student's correct answers.

**Watching.** Students who are not in a battle (finished early, sitting out, joined late) can
pick a live battle on their screen and watch it. Watchers see the questions and the action but
cannot answer or steal. On the projector, click any live battle card to watch it on the big
screen. When a watched battle ends, the view moves to another battle that is still going.

**The teacher can still step in** at any time: **Start now** skips a countdown, **Hold** pauses
the automatic start (then **Resume**), **End round now** stops every running battle, and
names on the teacher page can be paired, split or removed.

**Settings** (the ⚙ button on the teacher page) — all can be changed between rounds unless noted:
- How pairs are made: students choose / random draw / teacher pairs them (fixed once Round 1 starts)
- Start of Round 1: when every student is ready / when the teacher presses Start
- Break between rounds: 15–90 seconds then the next round starts by itself, or wait for the teacher
- Number of rounds (1–8; you can add rounds after the end)
- Who fights whom: similar scores after Round 1 (top pairs meet by the end) / random every round
- Avoid repeat opponents: yes / no
- Odd number of pairs: the leftover pair fights two bots / gets a free win / sits out
- Topic tested
- Time limit per battle (off, 3–15 minutes). At the limit, the team with more HP left wins;
  level HP goes to the team with more correct answers, otherwise it is a draw
- Time to answer a question (10–30 s) and the steal window (off, 4–10 s; it closes early once everyone has tried)
- Fighters: students choose / random every round
- Leaderboard on students' screens: full / only their own place / hidden until the end

Points: 3 for a win, 1 for a draw. Level points are split by correct answers, then HP left.
If an iPad sleeps or a page reloads, the student rejoins automatically and takes their seat
back from the bot that covered for them. If the teacher page reloads, it reconnects to the
same tournament. Tournaments live in the server's memory, so restarting the server ends them.

Test it without a class: `node test-tournament.mjs` plays a full tournament with 30 simulated
students against a sped-up server (`node test-tournament.mjs 29` for any class size).

## Play across iPads / computers
It's a browser game — every player just opens a URL in Safari/Chrome (no app install). Hold
devices in **landscape** (a portrait iPad shows a "rotate" prompt). There are two ways to host:

### A) Same Wi-Fi (classroom / same room) — zero setup
1. On one computer run the server (`start.bat` or `npm start`).
2. The terminal prints the **join URL** for your network, e.g. `http://192.168.50.238:3100`.
3. Every iPad / laptop on the **same Wi-Fi** opens that URL. One Creates a room, shares the code.
   - The server now binds to `0.0.0.0`, so LAN devices can reach it.
   - If a device can't connect, allow Node through the host's firewall (Private networks).

### B) Over the internet (players in different places)
Deploy the server to a free host — it reads `PORT` automatically and serves everything.
- **Render** (easiest): push this folder to GitHub → Render → *New + → Blueprint* → pick the repo
  (it reads `render.yaml`). You get a public `https://…onrender.com` URL everyone opens.
- **Railway / Fly.io / any Node host** also work (`Procfile` + `npm start` are included).
- **Quick temporary link (no account):** with the server running locally, run a tunnel such as
  `cloudflared tunnel --url http://localhost:3100` and share the printed `https://…` URL.

Either way it's the same game — the Node server stays authoritative (answers hidden, no cheating).

## Project layout
```
Academy Rift/
├─ server.js              Authoritative 2v2 battle engine (rooms, teams, turns, combat)
├─ tournament.js          Class tournament: pairs, rounds, matchmaking, leaderboard
├─ questions.js           Science MCQ bank — SERVER ONLY (answers never sent to clients)
├─ public/
│  ├─ index.html          All screens: title, lobby, room, tournament, battle, result
│  ├─ teacher.html/.js/.css  Teacher's class-tournament page (projector), opened at /teacher
│  ├─ style.css           Art-bible UI (crimson/black shards, HP/SP cards, sync gauge…)
│  ├─ game.js             Client: socket sync, battle render, MCQ, command shards, FX, shop
│  └─ data/               Shared roster, topics and tournament settings (server AND client)
├─ start.bat              Double-click launcher
├─ test-match.mjs         Headless 4-player end-to-end test (node test-match.mjs)
└─ test-tournament.mjs    Headless 30-student class tournament test
```

## Art pipeline (how the battle stage is composed)
The battle screen is a **strict layout** built from *separated* assets — never the
composited mockup:
- **Background** — `assets/CASTLE BACKGROUND.png` (clean throne room, no characters/UI).
- **Chibi sprites** — `assets/Character Sprite Art/<Name>.png` are multi-pose sheets on a
  white background. The client crops the **top-left idle pose** and flood-fills the white
  to transparent on a `<canvas>` at load (`processChibi` in `public/game.js`), so the arena
  shows clean cut-out sprites — no white boxes. Full portraits are used only for cards,
  character select, and the ultimate cut-in.
- **Player cards** are anchored to the four corners; **chibis** stand in 2v2 lanes with
  depth; the **Team Sync Gauge** sits centered up top; the **command/MCQ console** is the
  framed dock below.

To swap art, replace the files in `public/assets/` (keep the names) or edit the `ASSETS`
map at the top of `public/game.js`. Anything left `null` falls back to a CSS placeholder.

## Editing questions / characters
- Questions: `questions.js` (`answer` = 0-based correct index; add as many as you like).
- Characters, stats, skills, items, element weaknesses: `public/data/characters.js`.

## Known gaps / next steps
- Separate **item-loadout screen** (you bought items persist in the shop, but battles
  currently issue a default item kit). Wiring bought items into battle is next.
- Status-effect visuals (burn/shock/confuse) are modeled lightly; full icons TBD.
- Hook the simulated `RoomManager` patterns into a hosted server for play over the internet.
