# Academy Rift: Total War

A turn-based strategy mode for a whole class, separate from the 2v2 Arena. The teacher commands the
Crimson Host. Students, in pairs on their own iPads, march Crystal banners across the Moonveil map
and must band together to break into the Crimson Fortress and beat the Crimson Warlord.

## The Basic game (the default)

A student must be able to say: "Answer questions to earn steps, move toward the Crimson Fortress, and beat the monsters
you land on. Stand together to fight together." Every new war and practice war is the Basic game. The full game's other
systems are **Extras** the teacher switches on (see below). The code for all of them stays.

**A round is 3 steps.** The top of every student screen (and the projector) shows only "Round 3 of 8", the three steps
**1 ANSWER · 2 MOVE · 3 FIGHT** with the current one lit, one timer (only while pairs pick their stops) and the **Now line**:
one plain sentence saying exactly what to do now. It replaces the old tips and tip boxes.

1. **ANSWER** (`roundStep` is `answer`, the Crimson turn on the server). While the teacher moves the Crimson Host, every
   student answers exactly **3 questions** (`BASIC_QUESTIONS`) on one card: "Question 1 of 3" and "Your pair has N steps".
   Each right answer is +1 step for the pair (1 step to start, at most 4, whichever partner answers). The card says
   "Right! +1 step for your pair." or that the pair already has the most. After 3, the student sees the map with their
   banner and "Your pair has N steps. Waiting for the class to finish." No bonus questions, top-ups or War Cries. The
   step ends when everyone has answered 3 and the teacher has ended the turn (or the teacher's time is up), at most
   `BASIC_ANSWER_SECONDS` (90 s). The full game's top-up stage is skipped: MOVE opens straight away.
2. **MOVE** (the War Council and the march). The map shows YOUR banner big and labelled **YOU**, other pairs smaller,
   every enemy (no fog), and the stops you can reach glowing with their step cost. Tap a stop: the route is drawn and
   one big **GO** appears (STAY HERE is the only other button). Both partners must tap GO on the same stop: "Mei wants to
   go to Lantern Crossroads. Tap GO to agree." / "Waiting for Kai to tap GO on the same stop." Bots and partners who
   are not connected never hold a pair up, and when time runs out the route drawn first goes. Then the banners march.
3. **FIGHT** (the battles phase). Only pairs that landed on an enemy, or were attacked, fight.
   - **A team is simply the pairs on one stop.** Every pair standing on the stop fights the battle there (no warband
     join or leave). A pair marching away is not pulled in.
   - **Help next door.** When a battle starts one road away from a pair that is not fighting, that pair gets one big
     card: "Pair 2 is fighting next door. Help them? YES / NO" (`twHelp`, `HELP_SECONDS` 15 s). YES moves its banner
     there and into the fight; the fighters see "Pair 4 came to help!" and the helpers give the reinforcement bonus
     (`reinforceBonus`). Pairs further away cannot help. With nobody near enough, the battle starts after 3 seconds.
   - **Simple battles** (`simpleResolve`): everyone in the battle answers the same question at the same time. Every
     right answer is one hit (`BASIC_HIT`, shown as 20: "Mei hit for 20!") on the first monster standing (what it cannot
     take goes on to the next). Then the monster hits back once for every wrong or missing answer (`basicCounter`:
     "1 right, 1 wrong. The monster hits back for 30."). No striker turns, move menu, Sync, stolen turns or monster
     picking. The cinematic still plays: one attack for all the right answers together, the monster's attack, K.O.
     A row of faces shows a tick or a cross for every fighter and each pair's damage so far. The answer and why show
     for `BASIC_RESULT_SECONDS` (8 s) after each question. A battle lasts 5 questions or until the monster falls (7 at
     the gate, 8 against the Warlord; an ambush is one question shorter).
   - **No HP.** If the monster survives the questions, every pair in the battle goes back to the Academy (or the
     nearest free safe place if the Crimson Host stands on it): "The monster was too strong. Your pair goes back to the
     Academy to regroup." (one big card with OK). The damage dealt stays. Winning clears the stop.
   - **Attacks wait for FIGHT.** A Crimson unit that walks onto a banner in the teacher's turn stops there, and the
     battle is fought in the FIGHT step of that round, so the pair still answers its 3 questions and may move away in
     MOVE ("An enemy has come to your stop! Stay here to fight it, or tap a glowing stop to move away.").
   - Pairs not fighting see "No fight for you this round. The round ends when the battles finish." and a live line of
     who is fighting what, where. **The round waits for every battle** (no battle runs on into the next round).

**Winning** is unchanged: break the gate and beat the Warlord. Because every right answer is a hit, the gate guardian
and the Warlord are stronger in a bigger class (x1 up to 6 students, then x0.5 more for every 3 more students). The
teacher's Crimson Host can still attack, ambush and teleport. Camps are still monsters to beat (no buff unless the
Camps Extra is on). Students see every enemy except ambushers.

**The first round with Emi (practice tutorial).** Short, untimed, one instruction at a time, following the three steps:
the 3 steps at the top, answer 3, tap the enemy's stop and GO (your partner taps GO too), watch the march, fight once
(everyone answers, right answers hit, wrong answers let it hit back), then "That was one whole round!". The bot pairs
next door say NO to helping, so the student fights with their own pair. How to play (lobby) has 4 slides: the mission
and one slide per step.

**Teacher and projector.** The teacher's screen shows ROUND N OF M with the three steps (a bar above the guide line),
how many students have answered their 3 and how many pairs have tapped GO. The projector shows the tracker, the step
and a class Now line big, and Basic battles with the row of faces and who hit.

### Extras (all off by default)

In the lobby's **EXTRAS** panel and in the ⋯ menu during the war (`twSettings { extras: { key: true } }`). Each is
checked where it is used, so a switch made mid-war applies from the next question or battle. **Full game**
(`{ full: true }`) switches every Extra on and also plays the full game's turns (the top-up stage, the bonus and War
Cry questions, battles that run on into the next turn, losing to the nearest rally point); switching any Extra off
again leaves Full game. `xo(S, key)` on the server answers "is this Extra on".

| Extra | Key | What it switches on | Off in Basic |
| --- | --- | --- | --- |
| Coins and Grab-Ma food | `coins` | coins for right answers, the phone and food orders | no coins are paid; `twGrab`/`twBuy` refused; the coin chip and phone hidden |
| HP and food healing | `hp` | pair HP; the monster's hits take HP (the full game's counterattack); eating heals | no HP numbers or bars; `twEat` refused |
| Battle moves | `moves` | today's battle: the Arena screen, striker turns, answer along, stolen turns, Strike/Skills/Items/Ultimate, Sync | simple battles on the war page; `twAction` refused |
| Choosing monsters and the pair strip | `pick` | picking a monster, the strip of pair cards | hits go to the first monster; `twTarget` refused |
| Join any battle and warbands | `join` | the WARBANDS panel, joining and leaving, joining any battle after yours (reinforcements) | teams are pairs on one stop; `twJoinBand`/`twLeaveBand` refused |
| War Cries and bonus questions | `warcry` | War Cries for battles, preparing answers cheering a battle, more questions after the 3 | exactly 3 questions, nothing while others fight |
| Camp buffs and safe camps | `camps` | camp buffs for the class, outposts becoming safe camps (rally points) | camps are plain fights; no rally points |
| Watchtower and fog of war | `fog` | the fog of war and the watchtower | everyone sees every enemy (never ambushers) |

`test-totalwar.mjs` plays the full game (every war is started with `full: true`); `test-totalwar-basic.mjs` plays the
Basic game (see Tests).

### How long a Basic round and war take

Measured with `test-totalwar-basic.mjs` (6 bot pairs, 12 students, against the Bot Commander; game seconds, which are real
seconds at normal speed; server bots answer in 6 to 13 seconds): ANSWER about 45 s, MOVE about 7 s (bots tap at once),
FIGHT 0 to 130 s. A round with no big battle is about 80 s, one with a battle at the gate about 200 s. Whole wars took
13 to 16 minutes over 7 or 8 rounds (one won in round 7, one a draw, one lost). A real class reads and taps more
slowly: about 60 to 75 s to answer, 20 to 40 s to pick a stop with a partner, and 1 to 2 minutes of battles, so about
3 to 4 minutes a round and 25 to 30 minutes for 8 rounds. The teacher can shorten it with Turns or End by.

## Pages

- `/total-war/command.html`: the teacher. Start a war, choose the questions, show the join code, then
  command the Crimson Host.
- `/total-war/?code=WXYZ`: students join on their iPads (the QR code on the command page opens this).
- `/total-war/projector.html?code=WXYZ`: the projector. The class's view of the map (with fog of war),
  the biggest live battle and a feed of what is happening. Never shows answers or hidden units.
- `tools/prototypes/total-war/prototype.html`: Codex's original movement prototype, kept for reference (not served).

## A first-time student (the coach, tips and plain words)

- **Practice tutorial.** A student's first practice war starts with a coached turn 1 with no timers: Emi says one thing
  at a time, the thing to tap glows and the other buttons dim. It covers earning steps, coins, the map and steps, planning
  and sending a route, the march, a short first battle (your turn and the move menu, answering along, a stolen turn,
  the enemy hitting back), then HP and Grab-Ma food. A Rift Hound waits one road from the Academy for that battle.
  **Skip tutorial** (or the last NEXT) starts every clock (`twTutorial`). Done once per iPad (`tw.tutorialDone`).
- **Training turn (class wars).** The teacher can turn on *Training turn* in the lobby: turn 1 has no timers, each stage
  waits until everyone is done, and **Continue** moves the class on (`twContinue`, `twEndTraining`).
- **Tips.** In every other war, the first time a student sees each stage a one-line tip is pinned above the bar along the
  bottom (or in the corner of a battle). It can be closed, and does not come back once that stage is over.
- **One clock at a time.** The top clock hides while a question card, the Grab-Ma phone or a battle has its own timer.
- **Words.** Action points are *steps*, the War Council is *Plan your move*, routes are *sent* (alone) or *suggested*
  (in a warband), rally points are *safe camps*. HP is on one scale everywhere: a pair has 100 HP on the phone, the map
  and the battle screen, and a strike shows as 20. Food says exactly what it heals.
- **Planning.** A route drawn on the map but not sent is sent by itself when planning ends (`twDraft`). Every pair is
  told where its warband went ("Route sent: you march to X", "Time's up: you stayed at X"), and when another pair joins
  its warband (with a Leave button). While the phone is open it shows the time left, and closes itself at 10 seconds.
- **Questions.** A student gets unseen questions from the whole pool first; only a question they got wrong comes back
  ("Back again"). The end screen counts only questions the student really answered (their own, and the battle questions
  they answered along with), and says how far the class got and what it won.

## How a turn works (as in Civilization)

1. **Crimson turn (30 seconds by default).** The teacher moves units by hand (orders and sending units
   out work at any time). Meanwhile every student **prepares**: they answer questions on the Academy Rift
   question card (4 seconds to read, 21 to answer). Each right answer by a pair is +1 action point (AP)
   for its next move, up to +3, and each partner adds at most 2 (a student alone, up to 3), so both partners
   count. Each right preparing answer also earns **20 coins**, and the first 3 of a turn all right earn a
   **20-coin bonus** (these used to be a separate stage of 3 questions after the Crimson turn). A student who already
   has 3 gets no new question in the last 10 seconds. The Crimson turn ends on time without waiting: a question still
   open carries on into the short top-up (see below).
2. **Crystal turn.** Each pair has 1 AP plus what it earned preparing. A banner moves **one stop at a time**.
   Pairs on the same stop can join into a **warband**. A warband **votes** on every step: each pair taps
   a stop, most votes wins (a tie goes to the warband's first pair), and the vote closes 15 seconds after
   the first vote. A warband travels with the average AP of its connected pairs (rounded).
3. Stepping onto the Crimson Host, a jungle camp or the fortress starts a **battle**. Warbands one road
   away get 10 seconds to join. Everyone not in a battle gets **War Cry** questions by themselves while a
   battle is on (no button to tap). Each right one adds half a hit, at most 4 count for each battle question,
   and a wrong one means an 8-second wait for the next. Lose, and the warband falls back to the nearest rally
   point. Damage dealt stays, and the beaten pairs are back to full HP at the start of the next turn.

## Battles (as in the Arena)

- As in Academy Rift, each question is one student's **turn** (it rotates, so everyone gets turns).
  Everyone else in the battle **answers along**.
- Turns go pair by pair: every pair of a big warband strikes once before any pair strikes twice.
- A right answer on your turn is 2 hits. If it is wrong, a random student answering along who was right
  **steals the turn** at half power (1 hit). Every other right answer along adds 0.75 of a hit.
- **The Crimson hits back** after every question: every enemy still standing attacks the warband's
  **Resolve** (10 per pair). The share of the warband that answered right blocks up to 60% of it.
  Resolve at 0 loses the battle.
- Students see their own pair's fighter (the Academy Rift sprite of their standard) against the enemy,
  plus whichever classmate strikes that question. The projector shows every pair in the battle,
  and plays each move as the same full cinematic as the iPads (the theatre), with the plain stage as the fallback.
  Captured camps fly a Crystal standard ("secured to turn N") and secured stops raise one with a short animation.
  Enemy attack and idle animations are PixelLab animations in `monsters/anim/`; the backdrops are in `art/bg/`.

### Skills, Ultimates and items (the same as the Arena)

- Every student fights as **their own fighter** (the one they picked in the lobby), with that fighter's
  Academy Rift skills. After a right answer on your turn (or a steal), you have 6 seconds to pick a move:
  **Strike**, a **Skill** (costs SP, has cooldowns), the **Ultimate** (when the team's Sync gauge is full) or an
  **Item** from your bag. If time runs out, you strike.
- The fight itself is the **Arena's own battle screen**: `arena-bridge.js` opens the Arena page (`/?tw=1`) in a
  frame over the map and feeds it the war's battle as an Arena room (your fighter and a classmate against up to two
  monsters). So the question card, the answer-along strip, the camera zoom onto whoever is moving, the move menu,
  the skill cards, Ultimate cut-ins and cinematics are the Arena's. After each move the monster hits back in the
  theatre. Damage is shown at Arena scale (×100). The war page shows the gathering and how the battle ended.
- Skill kinds: attacks hit harder the stronger the skill; heals restore Resolve; guard blocks the next
  counter; buffs and debuffs weaken the Crimson's next hits. Ultimates: damage (splash), stun (no counter),
  heal (50% Resolve) or shield (blocks the whole counter).

### Grab-Ma Food (the shop, as a delivery app on a phone)

- Auntie Mama is now Grab-Ma. Each right answer earns **10 coins** (the MamaPay wallet).
- The phone button in the top bar (and **ORDER GRAB-MA** on the action bar) opens Grab-Ma Food (`phone.js`): a
  food-delivery app with the menu, prices, a basket, checkout and live order tracking.
- Orders go in from the War Council to the end of the battles (march and battles phases too, not while your own
  warband is fighting), one order a move. The phone buzzes when ordering opens, when she sets off and when she arrives.
- What each food does in Total War, and its Total War price, is in `TW_ITEMS` in `rules.js` (the phone shows that
  text). Kaya Toast heals, Malt Dino gives SP, Phoenix Kueh brings a pair back to full HP (half the warband's HP in a
  battle), Iron Tingkat halves the next counterattack, Ice Gems add Sync, Teh Halia heals and weakens the enemy's next
  hits, Chilli Padi is a strike with 50% more damage, and the Durian Bomb (now cheaper) hits for 4 and splashes the
  enemy beside the target.
- Grab-Ma cooks for 3 seconds at the Academy, then rides out along the roads, **one road every 3 seconds** (far faster
  than a warband), following the banner if it moves. Everyone sees her scooter on the map. The food lands in the
  bag when she arrives, even in the middle of a battle.
- Nothing waits for Grab-Ma: the march and the next turn go on, and the food lands in the bag when she arrives.

## The class's move: a short top-up, the War Council, then everyone marches (about 45 to 60 seconds)

1. **Prepare** (the Crimson turn): preparing questions earn action points (AP) and coins, as above.
2. **Top-up** (at most 20 s, `TOPUP_SECONDS`): only a student who has not answered 3 preparing questions yet (or is
   still on one) gets a question. Everyone else sees "Planning opens in a few seconds" and how many are ready. It ends
   the moment everyone has 3, and no new top-up question starts in its last 8 seconds. A question still open when it
   ends is put away (not counted). The AP for the move is worked out when the map opens.
3. **The War Council** (30 s, `COUNCIL_SECONDS`, set in the lobby from 15 s; the teacher can add 15 s or launch early):
   no questions, the map has everyone's attention. Tap a glowing stop to plan a route for the whole move: it follows
   the real roads, shows its AP cost, what is there and how much AP is left, and a ghost banner marks the planned stop.
   Tap a junction to change the way. A pair alone commits straight away; in a warband one pair proposes and the others
   tap AGREE (the majority route wins when the council ends). HOLD HERE keeps a banner where it is. Other banners'
   routes show as thin lines. Grab-Ma takes orders here too. **It ends as soon as every warband has sent or agreed a
   route** (after at least 5 seconds, `STRATEGY_SECONDS`).
4. **The march**: every committed banner sets off together and eases along the roads, 0.8 s a road (`MARCH_STEP`).
   Walking into an enemy (or an ambush) stops the route and starts the battle; the rest of the route is not taken.
   The march does not wait for Grab-Ma: food lands in the bag whenever she arrives (even in a battle).
5. **Battles, but a long battle does not hold the class up.** After the march the class waits for its battles for at
   most `BATTLE_WAIT_SECONDS` (60 s, a clock shows it), answering War Cries for them. A battle still going after that
   goes on while the class carries on with the next turn (the Crimson turn, the questions, planning and the march):
   "The battle at X goes on. The class carries on with the next turn". The pairs in a battle stay locked in it, the Crimson
   units fighting it cannot be moved or teleported, and a banner that is in a battle (or helping one elsewhere) cannot
   be attacked or planned for. When a battle ends, everything that happens after a battle still happens (story, camp
   buff, gate damage, falling back, HP). Only the last turn, the training turn and the tutorial wait for battles. A war
   that ends while a battle is on (time up, or the teacher ends it) keeps the damage that battle has dealt.
   - A pair still in a battle while the class prepares cannot earn steps, so its next move has at least
     **`LATE_STEPS` (2) steps**.
   - A pair whose battle ends during "Plan your move" plans with the class.
   - A pair whose battle ran past "Plan your move" is owed that move: when its battle ends (whatever the class is doing)
     it **plans its own move** straight away (`LATE_PLAN_SECONDS`, 15 s, no questions meanwhile) and marches by itself.
     The bar says "Your battle ran long, so you missed planning with the class. Plan your own move now."
   - While a battle is on, every right preparing answer also cheers it on (a War Cry for it: the card says "It also
     cheered on the battle at X"). Students who are free in the march get War Cry questions as before. SUPPORT only
     picks which battle they go to (otherwise the one with the most enemy strength left).

Timing with a class of server bots (measured with RIFT_SPEED=10, shown as real seconds), from the end of the Crimson turn
to the end of the march: **before** about 78 s (3 questions 48 s, waiting for the slowest bot, War Council 25 s, march
4.6 s); **now** about 20 s (top-up 13 to 16 s, War Council 5 s, march 2.4 s). A real class takes longer to plan, but the
whole stretch is capped at about 53 s (20 + 30 + the march) unless the teacher adds time.

Each banner shows its status beside it and on the action bar (planning, agreeing, committed, marching, enemy
encountered, holding, recovering), and a small HP bar.

## Both partners agree their pair's route

- In "Plan your move" each partner taps the route (SEND ROUTE, or AGREE). The pair's route is only sent (or suggested to
  its warband) when **both partners have tapped the same route** (`pickRoute`). The iPad that tapped first says
  "Waiting for your partner to agree"; the other says "Dee chose Lantern Crossroads: tap to agree" (its route shows on
  the map, with AGREE). Two different routes say so on both iPads.
- A bot partner agrees by itself, and a partner who is not connected does not hold the pair up.
- If time runs out, the route drawn first (tapped or only drawn, by either partner) is sent, so nobody is stuck. The
  first-time tip says this.
- Warband agreement (pairs in a warband agreeing one route) works on top of this: a pair's route counts once both
  partners agree it.

## Joining a battle that is still on (reinforcements)

- When a pair's battle ends (won or lost) and other battles are still being fought, it gets a **YOUR BATTLE IS OVER**
  panel for `REINFORCE_SECONDS` (30 s): every battle still on (where, the enemy and its HP, the pairs fighting, which
  question) with a big **JOIN BATTLE** button, the warbands it could join, and NOT NOW. No new question comes while it
  chooses.
- **Rule:** a pair whose own battle has just ended may join **any** battle the class is still fighting, anywhere on the
  map, at most `REINFORCE_MAX` (3) joined pairs a battle, not in its last question. It fights from where it stands: its
  banner does not move (so joining cannot be used to jump across the map). It brings its own HP and keeps what is left
  afterwards (at least 30%, back to full next turn if the battle is lost), answers along, takes strike turns and picks a
  monster like everyone else. A pair that left its warband to help goes back to it when the battle ends (at once on the
  same stop, else it marches to rejoin it).
- The pairs already fighting are told in the battle: "Pair 3 joined your battle! While they answer right, you hit
  harder and take less damage." Their cards in the strip are marked JOINED.
- **Bonus:** each joined pair that answers a question right gives `REINFORCE_ATK` (+15%) to all the warband's damage
  that question and cuts the damage the warband takes by `REINFORCE_GUARD` (10%), up to +30% and 20% (`reinforceBonus`
  in `rules.js`). The strip shows it ("REINFORCED +30% attack, -20% damage taken"), and so do the projector and the
  teacher's battle list. Server bot pairs join a battle still on when theirs ends.

## Warbands: joining and leaving

- The **WARBANDS** button on the bar (it glows when a warband stands on your stop) opens one panel: "A warband is pairs
  moving and fighting together", your own warband (with a big LEAVE WARBAND), and every other warband with its pairs,
  where it is and how far ("On your stop", "2 steps away", "too far", "in a battle") and one big button: **JOIN NOW** on
  the same stop, **MARCH TO JOIN** within `REGROUP_STEPS` (3) steps (the route there is drawn, and the pairs become one
  warband when they meet), or a greyed-out reason. Tapping a banner on the map shows the same card.
- Joining on the same stop works as before (`joinBand`, and both sides are told). Joining from a distance only sets
  off: the pair marches there, and joins on arrival.

## After a fight on the march

- When an enemy (or an ambush) interrupts a route and the company wins, it gets 15 seconds to choose: **CARRY ON**
  along the rest of its route (with the AP it has left) or **STAY HERE**. It never carries on by itself, and the turn
  waits up to 8 seconds (`RESUME_SECONDS`) for that choice.
- After a defeat, the next War Council marks the wounded enemy on the map ("Wounded · 40% left") and makes the
  friendly companies the beaten company could reach and join glow.

## Victories change the map

- A stop the class holds as a rally point flies the class's standard ("Secured").
- Beating a jungle camp sends a pulse out from it, and a message says what changed, for how many turns, and who
  secured it ("Moonwell secured · Stronger War Cries · 2 turns left · Secured by Kuro's company"). The buff chips show
  the turns left.
- The end screen replays the campaign on the map: each moment of the story is pinned where it happened, in order.

## HP, food and recovery

- A pair has 10 HP (shown ×100 in battle). It does not come back after a won battle: a warband fights with the HP its
  pairs still have, and what is left goes back to the pairs. A beaten warband limps away with 30% HP, and is back to
  **full HP at the start of the next turn** at its rally point. Losing costs ground, not HP.
- Heal by eating food from Grab-Ma (on the phone, or on your turn in battle), or by resting at the Academy or a
  rally point you hold (+3 HP a turn).
- After a defeat, the action bar tells the company where it withdrew to and how wounded the enemy is.

## Balance (slower battles)

- Sync fills by up to 16 a question (scaled by the share of fighters who were right) plus 4 for a right strike.
- Answering along: 0.75 hits for each right answer. The cap grows with the pairs in the battle (`alongCap`: 4 for one
  or two pairs, then 1.5 more for each extra pair, so 7 for four pairs). Ultimate splash is 1.5 hits.
- At the fortress at most **2 Crimson units** (the strongest) fight in front of the gate or the Warlord, and damage the
  defenders in front cannot take carries on to the gate (or the Warlord). Beating the Warlord wins, even with guards
  left standing.
- Battles last 5 questions (7 at the gate, 8 against the Warlord). The result screen after a move is 4.5 seconds (7
  after an Ultimate, 5 when nobody struck, so the answer and its explanation can be read).
- Auto and the Bot Commander spend only half their Rift Energy when the class is behind (the gate still stands after
  half the turns).
- The gate guardian hits for 6, the Warlord for 8.
- With the bot class (12 students) in `test-totalwar.mjs`, the gate breaks around turn 6 and the Warlord falls in turn 7
  or 8. The test's bots play as a sensible class: they pick their moves at once, join battles still being fought, go
  back to their warband afterwards, eat when hurt, and once the gate is broken every pair regroups for the final
  assault. A long battle no longer holds the class up (at most 60 s of waiting after the march), which makes a test war
  about 13 game minutes (16 before), and each bot student answers about 44 to 56 questions. Phase times at RIFT_SPEED=1 with the test's bots (which answer in
  about 5 s): prepare 30 s, the top-up about 3 s, the War Council about 4 s, the march about 1.5 s, battles about 80 s a
  turn, so a turn is about 2 minutes and an 8 or 9-turn war about 17 minutes (it was about 22 with the old 3-question
  stage and the 25-second planning minimum). A real class answers and plans more slowly, which makes a war about 25 to
  32 minutes. The test bot class now answers about 56 to 74 questions each in a war (69 to 87 before): a little fewer
  questions in all, in a shorter war.

## Seeing the battle

- Battles use the Arena screen, with every fighter standing on the war backdrop's ground line at the theatre's size.
- **The pair strip** (`pair-strip.js`) runs along the bottom of every battle, on the iPads (over the Arena frame) and in
  the projector's battle panel: one card per pair in the fight with its portrait, its number ("YOU" for your own pair),
  its HP on the 100-HP scale, a small icon of the monster it is engaging, what it is doing this question (answering,
  locked in, their turn, right, wrong, striking, stole the turn, hit) and the damage it has dealt this battle. When a
  pair's hit lands a "+N" pops up over its card. On its left are the monsters on the field with who fights each; with
  two on the field the student taps one to engage it ("YOURS" marks their own). The Arena's panels along the bottom (the
  move menu, the move recap, a stolen question) and the WHY box sit just above it (`tw-strip-on` in `lantern.css`).
  It never covers the question or its choices, which sit at the top. Up to about 5 pairs fit in one row; more pairs
  make the cards narrower and the row scrolls. In portrait the cards wrap onto rows of three.
- The teacher's battle list shows which pairs fight which monster.

## Scouting, warnings, the finale and the story

- Tap a Crimson unit to see its role (siege units are marked as a threat to the Ward). A visible siege unit within one
  march of the Academy raises a warning ribbon. A unit that disappears into the fog leaves a faded "last seen" marker.
- Breaking the gate brings out the Warlord ("Assemble for the final assault"). If 80% of the class have reached the
  "questions each" target, he starts the final battle 25% weaker. The teacher can tick "Warlord waits for the target"
  to make the target a requirement instead.
- The end screen tells the story of the campaign from what happened: camps beaten, attacks repelled, the watchtower
  climbed, ambushes survived, the gate and the Warlord.
- Teacher screen: during the War Council a bar shows the time, how many companies have agreed, +15 s and Launch now. A
  chip counts units without orders (tap it to jump to them).

### Waves, targets, ambushes, teleports and the watchtower

- **Enemies come in waves:** one at a time, or two (always two when two pairs or more fight, so pairs can choose; else a 50% chance). Answering along and an
  Ultimate's splash only hit the wave in front, so a big warband cannot wipe a whole stack in one question.
- **Each pair picks its monster.** While a battle gathers, each pair taps the monster it wants to fight (PICK YOUR
  MONSTER). The most-picked come out first, and when two pairs or more fight, two monsters come out together (else
  sometimes two). **Every pair is always engaged with one monster on the field** (the request "one pair must engage
  with at least one monster" is read as this): a pair that did not pick, or whose pick is still to come, is given the
  monster with the fewest pairs on it when the fight starts. When its monster falls the pair is moved to another one and
  told ("Your monster is down. You now fight X."). Between questions (or any time in the fight) a pair can switch by
  tapping a monster on the stage or in the strip. With only one monster on the field there is nothing to pick.
- **Your monster takes your hits:** the striker's move and each right answer along hit the monster that student's pair
  is engaging (what it cannot take goes to the other monster on the field). On your turn a strike goes straight to your
  monster, with no extra tap. War Cries hit the field front to back.
- **Each monster hits back mainly at the pairs engaging it:** 75% of its blow (`ENGAGED_SHARE`) lands on those pairs, the
  rest on the whole warband. Each pair has its own HP in the battle (what it keeps afterwards, at least 30%), and the
  warband's HP is their total: the battle is lost when it reaches 0. A pair at 0 HP still answers, and the blows meant
  for it go to the others. Bots pick the monster with the fewest picks.
- **Teleport (teacher):** in the Crimson turn, a unit can appear on any free stop (not on a Crystal banner or a
  camp) for 2 Rift Energy. From the new-unit prompt, or the ⚡ Teleport button on a stack.
- **Ambush (teacher):** a unit ordered to Ambush hides on its stop. The class cannot see it (not even through the
  watchtower or on the projector). A banner that walks in starts the battle 25% down on HP. Moving the unit
  gives the ambush away.
- **The watchtower** (Whispering Watch): while a Crystal banner stands on it, the whole class sees every Crimson
  unit beyond the fog, except ambushers.

### Questions

- Questions always sit in the middle of the screen, as in Academy Rift. There are no questions in the War Council:
  preparing questions come in the Crimson turn, and War Cries while a battle is on.
- **Choices are shuffled** for each student and each question (except questions whose choices point at others by
  position, such as "all of the above"). The server maps each student's button back to the question's own answer.
- After **every** answer the student sees the right choice and its explanation (`explain`, else `why.right`) for at
  least 5 seconds. In battles the explanation shows over the Arena screen, and the projector shows it too.
- One "seen" list per student is shared by every kind of question (preparing, War Cries and
  battles), and battle questions are picked from those the fighters have seen least.
- "BACK AGAIN" only shows for a question the student really answered wrong earlier in this war (not one that
  timed out unseen).
- The lobby warns the teacher when the chosen sets hold fewer than 80 questions.
- The G1 chapter sets (`library/sets/g1c01` to `g1c12`) now have an explanation for every question.

### Bots and practice

- **Practice war** (join page): one student against the Bot Commander, with two bot pairs and a bot partner.
- Lobby **BOTS** settings: **Bot Commander** (a bot plays the Crimson Host), **Bot partners** (a lone student
  gets a bot fighter), and **Add a bot pair** to fill up the class.

### The teacher's screen

- A step guide at the top: send out units → give them orders → end your turn.
- **Pause / Resume** (the ⋯ menu): every clock stops, and students see "Paused by" the teacher's name. Nobody loses
  time: every timer moves on by the length of the pause.
- **End this battle now** (on each battle in the list): the damage dealt stays, nobody is beaten, and the class steps
  back one road (an attack on the class pulls back).
- **End the war now (result by progress)** or **End the war: the class wins**.
- **Turns** and **End by** (35 to 60 minutes after the start, pauses not counted) can be changed during the war.
  When the time is up the war ends at the next War Council or turn, judged on progress (see Winning).
- A chip names any pair that has not moved for 3 turns, and the quiet flag only marks a student who has let two
  questions in a row run out and not answered for a minute.
- **The learning report** at the end: accuracy per learning objective, the most-missed questions (with the right
  answer and the most common wrong one), and each student's answers and % right, with a CSV download. It stays until
  the teacher starts a new war, which asks first.
- Sending out a unit asks straight away what it should do: **March to…**, **Hunt**, **Hold**, or decide later.

## The teacher's orders

- Tap a Crimson stack, then a unit (or none, for every unit there). **March to…** a stop: they march
  there turn after turn and attack any banner in the way. **Hold**: a whole turn without moving digs a unit
  in (25% tougher). **Hunt**: they chase the nearest Crystal banner. Orders play out when the teacher ends
  the Crimson turn. Units can still be moved by hand.
- Moving onto a Crystal banner attacks it (a **defend** battle for the class). If the banners hold until the
  last question, the attackers pull back.
- **The Academy Ward** (24): Crimson units standing on the class's Academy with no banner there batter it
  at the start of every Crimson turn (Ogres, Goblin Sappers and the Golem double). If it breaks, the
  Crimson Host wins.

## Fog of war

Students see two roads around every Crystal banner, the rally points they hold, and both fortresses.
The server never sends them units outside that range.

## Jungle camps (beat one and the whole class gets its buff)

| Camp | Stop | Buff |
| --- | --- | --- |
| Moonhart Sentinel | Moonwell | War Cries count double for 2 turns |
| Galecrest Roc | Windspire | Every pair gets +1 MP for 2 turns |
| Mossback Colossus | Ancient Grove | Every battle lasts one more question for 2 turns |
| Riftglass Basilisk | Riftglass Quarry | Right answers hit 25% harder for 2 turns |
| Hollow Ferryman | Drowned Vault | The whole map is revealed for 2 turns |
| Crimson Broodmother | Crimson Nest | The gate guardian loses 15 strength |

Camps come back 3 turns after they are beaten.

## Winning

The class breaks the gate (Bloodstone Golem, 45 strength) and then beats the Crimson Warlord
(70 strength). The war has 8 turns by default. If the last turn ends first (or the "End by" time, or the
teacher ends it by progress), the result goes by how far the class got (`progressResult` in `rules.js`):
the gate broken and the Warlord at half strength or less is a **class win on points**, the gate broken
alone is a **draw**, and otherwise the Crimson Host wins.

## Saving and resuming (a restart mid-lesson)

At the start of every turn (and when the war ends) the server writes a snapshot of each war to
`wars/CODE.json`: on the question bank's GitHub branch when GitHub is set up (so it survives a Render
restart or redeploy), else in the question bank folder (`TW_SAVE_DIR` puts it in a folder of its own,
which the tests use). After a restart the war comes back at the start of that turn, **paused**, with the
same code, map, units, pairs, HP, coins and question history. The teacher's page reconnects by itself and
presses Resume. Students rejoin with the code and their own name (or by themselves from their iPad's saved
place) and are back in their pair. Battles in progress are not saved: the turn starts again. Food still on
its way is put straight into the bag. Snapshots older than 12 hours are deleted. Practice wars are not saved.

## Server load

Actions only mark the war as changed. One update goes out about 80 ms later (or on the next tick), however
many actions came in, and errors go only to whoever caused them. The fog and the class view are worked
out once per update for everyone. The teacher gets the list of question sets only when it changes (the
bank keeps it worked out until a set changes).

## Files

- `rules.js`: every rule and number, shared by the server and the pages.
- `../../totalwar.js`: the server (its own rooms and `tw*` socket events).
- `map.js`, `card.js`, `tw.css`: the shared map, Academy Rift question card and look.
- `play.js`/`play.css`, `command.js`/`command.css`, `projector.html`: the three screens.
- `monsters/`: PixelLab sprites for the six camps and the twelve Crimson Host units.
- `portraits/`: the character card portraits used on the banners.

## Tests

- `node test-totalwar-basic.mjs` (port 3206, `TWB_PORT` to change; `TWB_ONLY=round|lose|extras|war` runs one part): the
  Basic game. A round with three pairs (exactly 3 questions each and no top-up, 4 steps for all right, no coins, food,
  warbands or War Cries, both partners tap GO, pairs on one stop fight together, the Help card and YES, "came to help",
  one question for everyone, a hit for every right answer with the helpers' bonus, the monster hitting back once for
  each wrong answer, no moves or monster picking, the round waiting for its battles), a lost battle (back to the
  Academy, the damage stays) and an attack waiting for the FIGHT step, the Extras and Full game switches, then a whole
  Basic war of 6 bot pairs against the Bot Commander, timed.
- `node test-totalwar.mjs [students]` (the full game: every war it starts has `full: true`): a teacher and a class of bots play a whole 8-turn war (and print the time
  each phase takes), then smaller wars check pause, ending a battle, the class-wins ending, the report, shuffled
  choices, explanations, AP, a beaten pair's full HP, and a server restart with the war restored.
- `test-totalwar.mjs` also plays a war where a pair joins a battle still being fought (the offer, the notice to the
  pairs there, the bonus, the banner staying put), a long battle runs on into the next turn (default steps, a band in a
  battle cannot plan, its units cannot be moved, a helping banner cannot be attacked, planning its own move while the
  others march), and a war where two partners agree their route (waiting, different routes, agreeing, a bot partner and
  an absent partner not holding the pair up, the route drawn first sent at time-out). `TW_ONLY=reinforce,partner` runs
  just the named smaller wars.
- `node --test tools/test-total-war.mjs`: the map and the rules (also per-pair targets: the spread when nobody picks,
  moving on when a monster falls, the counterattack split, and the short movement phase).
- `test-totalwar.mjs` also plays a battle where two pairs pick a monster and one does not (auto-assigned, moved on when
  its monster falls, the counter split), and checks the movement phase is at most 60 game seconds a turn.
- `node tools/tw-demo.mjs [url] [bots] --auto-teacher`: a live demo war to join from a browser.
