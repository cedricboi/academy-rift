# 🏰 Academy Rift

**Answer fast. Strike harder. Sync together.**

A 4-player (2v2) online science JRPG. You and a friend join a room by code and battle
two other players in a gothic castle arena. Each turn you answer a science MCQ, then act —
strike, cast a spell, defend, use an item, tag, or unleash your **Team Ultimate** when the
**Team Sync Gauge** is full. Correct answers power your action; only a team streak charges sync
(2 right answers in a row +20, 3 in a row +25, 4 or more +30 each; a wrong answer resets it).
Every Ultimate breaks the stage a step further: each of the 6 places has 5 damage levels.

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

**Auntie's shop.** Every battle earns coins: 300 for a win, 200 for a draw, 120 for a loss, plus
20 for each correct answer and 5 for each right answer while answering along. When a student
taps **BACK TO TOURNAMENT** after a battle, Auntie's Magic Mama shop opens in first person
(there is also a shop button on the tournament screen). Students open Auntie's menu, tap an
item to read what it does, and buy it. What they buy is packed for their next battle on top of the
three free items, and anything they don't use stays in their bag. A student can carry 2 of one
item and 6 items in all, and cannot shop during a battle; if the next round starts while they
are shopping, the shop closes and the battle opens.

| Item | Coins | Effect |
|---|---|---|
| Kaya Toast Set | 120 | Restore 300 HP to one ally |
| Malt Dino Elixir | 100 | Restore 150 SP to one ally |
| Phoenix Kueh | 300 | Revive a knocked-out teammate at 50% HP |
| Iron Tingkat | 150 | The next hit on one ally does half damage |
| Ice Gem Crystals | 250 | +30 to the team's Sync gauge |
| Teh Halia Tonic | 140 | Clear debuffs from one ally and restore 100 HP |
| Chilli Padi Charm | 180 | Your next attack does 25% more damage |
| Study Notes | 160 | One extra hint in the next battle (works by itself) |
| Durian Bomb | 220 | About 150 damage to one enemy, whatever their element |

Prices and effects are in `public/data/characters.js` (`ITEMS`, `SHOP_LIMIT`); the effects are
in `useItem` in `combat.js`. Coins and bags live with the tournament, so they reset when it ends.
`node test-shop.mjs` checks earning, buying, the limits and items carrying into battle.

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
are taken away. The price: a right answer after a hint is not powered up and its streak sync
is halved. The tournament Settings set how many hints each student gets
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

### Folders and the chapter quizzes
Every set sits in a folder: **Sec 1 Science** (Chapters 1 to 8), **Sec 2 Science** (Chapters 9 to 16)
and **Sec 3 G1 Science** (everything else, including the built-in cell questions). The 16 chapter
Blooket quizzes (1,081 questions) come with the game in `library/sets/` and appear in the hub, in a
room's topic screen and in the tournament Settings, each under its folder. They can't be changed or
deleted, but **Make a copy to edit** gives an editable copy in the same folder. A teacher's own set
goes into the folder that is open when it is made, and the folder can be changed in the editor.
To replace the chapter quizzes, put the Blooket files (`Blooket_ChNN_*.xlsx`, plus the AO map for
the chapter names) in a folder and run `node tools/build-library.mjs <folder>`.

## Learning in battle (so students remember, not just recognise)
- **Everyone answers every question.** On another player's turn the question strip carries the answers too, so
  each student answers about four times as many questions as before. Nobody learns whether they were right until the
  question is over (so it never gives a steal away); a right answer adds 2 Sync for the team and 5 coins.
- **Mistakes come back.** A question a student gets wrong, on their turn, answering along or stealing, is asked to
  them again on their own turn a few questions later ("Back again"). Each question comes back once per battle and
  at most every other turn. Questions still wrong carry into the student's next tournament battle (up to four).
- **Interleaving.** With several topics or chapters ticked, the deck deals one from each in turn.
- **Reading time.** Every question (except in the practice fight) shows on its own for 4 seconds before the choices
  appear (the clock gives the time back, and bots wait too), so students read it and recall the answer before they
  can recognise it. On another player's turn the question box is large, with the answers in a 2 x 2 grid.
- **The Rift Report.** After each battle a student sees each question they missed (with the right answer, the
  learning objective, and whether they put it right later), then writes two or three short answers in full
  sentences: the missed question without its options, or the learning objective in their own words. Only after
  writing do they see the right answer to compare with. In a tournament the answers go to the teacher.
- **The teacher's learning report.** "📖 Learning report" on the tournament page opens `/report` in a new tab (it
  shows names, so keep it off the projector): every question answered wrong with how many times and the most common
  wrong answer, the weakest learning objectives, and the students' written answers. It offers to build an MCQ sheet
  of different questions on the same learning objectives (other chapter questions this class was not asked), to
  print with an answer key or save as a question set to play, and downloads the whole report as Markdown to hand to
  Claude for brand-new questions. The chapter questions carry their learning objective and AO from the AO map.
- `node test-learning.mjs` tests all of this end to end.

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
│  ├─ game.js             Client: socket sync, battle render, MCQ, command shards, FX
│  ├─ shop.js/.css        Auntie's Magic Mama, the first-person shop between tournament rounds
│  ├─ assets/shop/        Auntie, the shop backdrop and the 9 item icons (PixelLab pixel art)
│  ├─ assets/title/       Title screen: the Rift tearing the academy apart, the fighters from behind
│  │                      (a 6-frame strip of their coats flapping) and the pixel logo
│  ├─ fonts/              Saira Semi Condensed (titles), Lexend (reading) and Cinzel (battle cinematics)
│  ├─ theatre/            Battle cinematics: engine.js, manifest.json, sprite sheets, effects, sounds
│  └─ data/               Shared roster, topics, tournament settings, spreadsheet reading, animTimes.js
├─ start.bat              Double-click launcher
├─ tools/balance.mjs      Character balance check (plays thousands of battles)
├─ test-match.mjs         Headless 4-player end-to-end test (node test-match.mjs)
├─ test-tournament.mjs    Headless 30-student class tournament test
├─ test-practice.mjs      The practice fight, played through
├─ test-hub.mjs           Question hub test (import, pictures, saving, use in battles)
├─ test-learning.mjs      Answering along, mistakes coming back, the Rift Report and teacher report
└─ test-shop.mjs          Auntie's shop: coins, buying, limits, items carried into battle
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

### Battle cinematics (the theatre)
Every strike, skill and Ultimate plays as a short HD-2D cinematic over the stage: the
fighter, their partner and the target, on the battle's own stage, with the move's real
damage or healing numbers. The HP bars move when the cinematic ends.
- `public/theatre/engine.js` is the Skill Lab engine, built from the lab by
  `tools/theatre/build_theatre.py` from `tools/theatre/skill_lab.html` (do not edit it by hand). It loads only the four fighters in the battle.
- `public/theatre/c/<id>/` holds each fighter's animation sheets (all made from one master
  frame, so every pose looks the same); `public/theatre/arena/` holds the idle loops the
  stage shows between moves. Emi switches to her angel sheets after Aurora Covenant.
- The server waits for each cinematic before the next turn (`public/data/animTimes.js`,
  measured from the engine). If a device has not loaded the art yet, the old stage effects
  play instead, so nobody waits on a slow connection.
- Effect colours and glows are baked into files by `tools/theatre/bake_fx.py` (run it after
  changing an effect or the element tints), so no device filters anything while a move plays.
  The few filters left are done once in JavaScript and cached, on every browser. Slow devices
  drop the glow passes to keep time.
- Smoothness rules for the battle screen: no CSS filters or blur on anything that animates,
  shading with overlays and opacity instead, and moving parts animate `transform` only. Each
  fighter is one frame-sized box whose background steps through its sheet, with no layer of its
  own: sheet-wide sprite layers, tilted and zoomed by the camera, were what made the zoom stutter.
  Fighters and the HUD are rebuilt only when something they show changes, the move menu's white rim and shadow are
  plain shapes rather than filters, countdowns touch the page only when the number changes, and a device that cannot
  hold 60 fps in a cinematic draws a steady 30. The frame-rate readout in Settings shows how a class device copes.
- Class load: a real-time 30-student tournament (29 scripted students, one real browser student and the teacher's
  dashboard) used about 1% of one CPU core on the server, answered every move within 25 ms, and ran 150 students at
  under 4%. Code and battle updates are sent compressed; the media is cached on each device for a day, so the first
  visit downloads about 13 MB per student and later visits very little.

### Settings and sound
The gear in the top-right corner opens Settings on every screen: music and sound-effect
volume, battle camera zoom, **Graphics**, calm effects (fewer flashes and no shaking), a
frame-rate readout and full screen. Graphics has four choices: **Smooth** (fighters move at 3
frames a second, lighter cinematics, the steadiest frame rate), **Balanced** (5 frames a second
and drifting motes of light over the stage), **Detailed** (each fighter's full speed, the motes,
and a slowly breathing stage, for newer devices) and **Auto**, which starts on Balanced and
switches a device to Smooth for good if its first battle cannot hold about 45 fps. Fighters keep
moving through questions on every level. Settings are kept on each device. The
teacher's screen has its own gear: the projector music and **Sound on students' devices**
(students choose, music off, or all sound off), which applies straight away. The intro theme
(`assets/Intro Theme.mp3`) plays everywhere outside battles; Victory Fanfare plays in battle.

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
exactly one fighter resists it. A WEAK hit does 1.25× damage and a resisted hit 0.85×, so a
bad matchup is a disadvantage, not a lost battle.

Balance (October 2026): heavy skills are a strong hit rather than a near-knockout (skill power
is compressed, so the biggest single hit is about a third of a fighter's HP), heals restore half
their printed power and a fighter's heals share one cooldown, the Kaya Toast Set item restores 300 HP,
and every fighter has a DEF stat, the share of each hit they shrug off (Taiga 20%, Emi and Mina
10%, Saya and Renji 8%, Nao 5%). In the simulator the first knockout comes around turn 23 of 36 in
an 8-minute battle (it was turn 15), and no fighter wins more than 54% or less than 47%.

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
