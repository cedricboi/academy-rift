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

## Practice fight (first time playing)
After **ENTER THE RIFT** every student is offered a **practice fight** (about 3 minutes; they
can skip it, and replay it any time from the lobby with **▶ PRACTICE FIGHT**). They play
Jun, with Emi as their partner and coach, against two easy rivals. Nothing is timed, a wrong
answer can be tried again, and the fight pauses at each new idea until they tap **NEXT**.
Each of their turns teaches one thing, and an arrow points at what to tap:

1. **Answer, then Strike**: pick a target on the stage.
2. **Watching**: the rivals' and partner's questions at the top, HP, the team Sync gauge.
3. **Stealing**: a rival answers wrong, the student steals the turn (half damage).
4. **Skills**: the skill cards (SP cost, cooldown) and hitting a **weak spot**.
5. **Hint, then Ultimate**: a harder question with a 💡 hint, then the full Sync gauge.

The script lives in `practice.js` (questions, rivals, when to pause) and the coach's words
in `public/game.js` (`coachMessage`). `node test-practice.mjs` plays it through.

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
- Topic tested (tick one or more built-in topics and question sets from the hub)
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

## Question hub (your own questions)
Open **`/hub`** (for example `https://…onrender.com/hub`) to make your own question sets:
- **Import a spreadsheet.** Blooket's import template (.xlsx or .csv) works as it is: Question
  Text, Answer 1–4 and Correct Answer(s) (`2`, or `1,3` for two right answers). Other sheets
  work too if they have a Question column, answer/option columns and a Correct or Answer column
  (a number, a letter, or the answer's text). Pictures placed on a question's row in the
  spreadsheet are added to that question. Typing questions are left out (the game is multiple
  choice) and Blooket's time limits are not used.
- **Paste or type.** Paste rows copied from Excel or Google Sheets, or type questions: the
  question on one line, its answers underneath, `*` in front of the right one, an empty line
  between questions.
- **Edit.** Change any question, tick the right answer (more than one is allowed), add a hint
  (for example a formula), add an explanation students see in their review after the battle,
  and add a picture (button, drag and drop, or copy and paste). Changes save by themselves.
  A spreadsheet column called **Hint** (or a typed line starting with `Hint:`) fills in hints.

**Hints in battle.** On their own question a student can tap **💡 HINT** (and tap again to
confirm). They see the hint written for that question, or, if there is none, two wrong answers
are taken away. The price: a right answer after a hint is not powered up and fills only half
as much of the team's Sync gauge. The tournament Settings set how many hints each student gets
per battle (off, 1, 2 or 3; normal rooms allow 2) and whether a hint also costs 10% HP. Other
players see that a hint was used, and the results spreadsheet has a "Hints used" column.

To play a set, tick it under **Topic tested** in the tournament's Settings, or tap it in a game
room's topic list. You can choose several sets and built-in topics at once; every battle then
draws its questions from all of them. Delete a set with its **Delete** button, the **Delete set**
button inside it, or **Select sets** to delete several at once. Students only ever receive the question, the answers and the picture,
never which answer is right.

**Setting it up on Render (once):** on the game's service open **Environment** and add
- `HUB_PASSWORD`: a password for the hub. Without it the hub only opens on the computer that
  runs the game (`http://localhost:3100/hub`), so students can't change your questions.
- `GITHUB_TOKEN` and `GITHUB_REPO`: Render's free plan wipes saved files whenever the game
  restarts, so the hub keeps your sets in a GitHub repository instead, on a branch of its own
  called `question-bank` (saving never redeploys the game). Because the sets hold the right
  answers and the game's own repository is public, keep them in a separate **private**
  repository: on GitHub make a new private repository (for example `academy-rift-questions`)
  with **Add a README file** ticked. Make the token under *Settings → Developer settings →
  Personal access tokens → Fine-grained tokens*: give it access to only that repository, with
  **Contents: Read and write**. Set `GITHUB_REPO` to `your-github-name/academy-rift-questions`.
  (Without `GITHUB_REPO` the hub uses the game's own repository.)

On your own computer no setup is needed: sets are saved in the `question-bank` folder next to
the game. `node test-hub.mjs` checks the hub end to end against a pretend GitHub.

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
├─ server.js              Authoritative 2v2 battle engine (rooms, teams, turns)
├─ combat.js              What every move does: damage, skills, items, Ultimates
├─ practice.js            The guided practice fight (script, questions, rivals)
├─ tournament.js          Class tournament: pairs, rounds, matchmaking, leaderboard
├─ questions.js           Science MCQ bank — SERVER ONLY (answers never sent to clients)
├─ bank.js                Question hub: teacher's sets and pictures (GitHub branch or folder)
├─ public/
│  ├─ index.html          All screens: title, lobby, room, tournament, battle, result
│  ├─ teacher.html/.js/.css  Teacher's class-tournament page (projector), opened at /teacher
│  ├─ hub.html/.js/.css   Question hub, opened at /hub
│  ├─ style.css           Art-bible UI (crimson/black shards, HP/SP cards, sync gauge…)
│  ├─ game.js             Client: socket sync, battle render, MCQ, command shards, FX, shop
│  ├─ fonts/              Saira Semi Condensed (titles) and Lexend (reading), served by the game
│  └─ data/               Shared roster, topics, tournament settings and spreadsheet reading
├─ start.bat              Double-click launcher
├─ tools/balance.mjs      Character balance check (plays thousands of battles)
├─ test-match.mjs         Headless 4-player end-to-end test (node test-match.mjs)
├─ test-tournament.mjs    Headless 30-student class tournament test
├─ test-practice.mjs      The practice fight, played through
└─ test-hub.mjs           Question hub test (import, pictures, saving, use in battles)
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
- **Stage first.** The fighters fill the screen in 2v2 lanes. A slim HUD runs along the top
  (each team's fighters with HP, SP and the Sync gauge; the battle clock in the middle).
- **The question only takes over on your turn.** When someone else answers, everyone sees
  their question as a small strip at the top and a flag over the fighter ("AIDEN IS
  ANSWERING"). On your own turn a big question card opens over the dimmed stage. After a
  right answer the card closes and one move strip runs along the bottom; the targets light
  up on the stage ("TAP TO HIT KURO"). A steal chance is a shorter panel along the bottom
  for a few seconds. After a wrong answer, the right one is only shown once nobody can steal
  it any more.

To swap art, replace the files in `public/assets/` (keep the names) or edit the `ASSETS`
map at the top of `public/game.js`. Anything left `null` falls back to a CSS placeholder.

## Editing questions / characters
- Questions: use the question hub at `/hub` (above). The built-in set is `questions.js`
  (`answer` = 0-based correct index).
- Characters, stats, skills, items, element weaknesses: `public/data/characters.js`.
  The rules for every move (damage, skills, items, Ultimates) are in `combat.js`.

## Character balance
Every fighter wins about half of their battles. `node tools/balance.mjs` checks this: it
plays 20,000 battles with the real combat rules (random teams, students who answer right
about 70% of the time, sometimes steal, and pick sensible moves) and prints each fighter's
win rate, both for fights to a knockout and with the 8-minute tournament limit. Run it
again after changing any number in `characters.js`. Options: `50000` for more battles,
`--right 0.55` for a class that answers less accurately, `--policy random` for random moves,
`--try changes.json` to test new numbers without editing the file.

The element chart is even: each element is the weak spot of exactly one fighter, and
exactly one fighter resists it. A WEAK hit does 1.75× damage and fills extra Sync; a resisted
hit does half.

| Element | Weak spot of | Resisted by |
|---|---|---|
| Fire (Jun) | Renji | Mina |
| Ice (Saya) | Nao | Renji |
| Electric (Raiden) | Mina | Taiga |
| Wind (Nao) | Taiga | Raiden |
| Light (Emi) | Kuro | Hina |
| Shadow (Kuro) | Hina | Emi |
| Earth (Taiga) | Raiden | Nao |
| Mind (Hina) | Emi | Kuro |
| Water (Mina) | Jun | Saya |
| Metal (Renji) | Saya | Jun |

Ultimates come in four kinds, priced against each other: **damage** (big hit on both
enemies), **shield** (hit both, and both allies take 30% less damage for 2 turns), **heal**
(heal both allies and hit both enemies for half) and **stun** (hit both; the enemy who would
act next misses that turn). The skill numbers (SP cost, power, cooldown) are printed on the
skill card art and were left as they are; HP, SP, ATK and Ultimate power were tuned.

## Known gaps / next steps
- Separate **item-loadout screen** (you bought items persist in the shop, but battles
  currently issue a default item kit). Wiring bought items into battle is next.
- Status-effect visuals (burn/shock/confuse) are modeled lightly; full icons TBD.
- Hook the simulated `RoomManager` patterns into a hosted server for play over the internet.
