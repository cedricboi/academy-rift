# Academy Rift: Total War

A turn-based strategy mode for a whole class, separate from the 2v2 Arena. The teacher commands the
Crimson Host. Students, in pairs on their own iPads, march Crystal banners across the Moonveil map
and must band together to break into the Crimson Fortress and beat the Crimson Warlord.

## Pages

- `/total-war/command.html`: the teacher. Start a war, choose the questions, show the join code, then
  command the Crimson Host.
- `/total-war/?code=WXYZ`: students join on their iPads (the QR code on the command page opens this).
- `/total-war/projector.html?code=WXYZ`: the projector. The class's view of the map (with fog of war),
  the biggest live battle and a feed of what is happening. Never shows answers or hidden units.
- `/total-war/prototype.html`: Codex's original movement prototype, kept for reference.

## How a turn works (as in Civilization)

1. **Crimson turn (30 seconds by default).** The teacher moves units by hand (orders and sending units
   out work at any time). Meanwhile every student **prepares**: they answer questions on the Academy Rift
   question card (4 seconds to read, 21 to answer). Each right answer by a pair is +1 action point (AP)
   for its next move, up to +3. The class moves after 30 seconds at most.
2. **Crystal turn.** Each pair has 1 AP plus what it earned preparing. A banner moves **one stop at a time**.
   Pairs on the same stop can join into a **warband**. A warband **votes** on every step: each pair taps
   a stop, most votes wins (a tie goes to the warband's first pair), and the vote closes 15 seconds after
   the first vote. A warband moves at the speed of its slowest connected pair.
3. Stepping onto the Crimson Host, a jungle camp or the fortress starts a **battle**. Warbands one road
   away get 10 seconds to join. Pairs who have finished moving answer **War Cry** questions, which add half
   a hit each. Lose, and the warband falls back to the nearest rally point. Damage dealt stays.

## Battles (as in the Arena)

- As in Academy Rift, each question is one student's **turn** (it rotates, so everyone gets turns).
  Everyone else in the battle **answers along**.
- A right answer on your turn is 2 hits. If it is wrong, the first student answering along who was right
  **steals the turn** at half power (1 hit). Every other right answer along adds 0.75 of a hit.
- **The Crimson hits back** after every question: every enemy still standing attacks the warband's
  **Resolve** (10 per pair). The share of the warband that answered right blocks up to 60% of it.
  Resolve at 0 loses the battle.
- Students see their own pair's fighter (the Academy Rift sprite of their standard) against the enemy,
  plus whichever classmate strikes that question. The projector shows every pair in the battle.
  Enemy attack and idle animations are PixelLab animations in `monsters/anim/`; the backdrops are in `art/bg/`.

### Skills, Ultimates and items (the same as the Arena)

- Every student fights as **their own fighter** (the one they picked in the lobby), with that fighter's
  Academy Rift skills. After a right answer on your turn (or a steal), you have 12 seconds to pick a move:
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
- Orders go in during the class's move, **once a banner has locked in its move**, one order a move. The phone buzzes
  with a notification when ordering opens, when she sets off and when she arrives.
- Grab-Ma cooks for 3 seconds at the Academy, then rides out along the roads, **one road every 3 seconds** (far faster
  than a warband), following the banner if it moves. Everyone sees her scooter on the map. The food lands in the
  bag when she arrives, even in the middle of a battle.
- Once every banner has locked in, the Crimson turn waits up to 30 seconds while students order and their food arrives.

## The class's move: 3 questions, the War Council, then everyone marches

1. **Prepare** (the Crimson turn): preparing questions earn action points (AP), as before.
2. **3 questions before the move**: each right answer earns 10 coins, all 3 right earns a 20-coin bonus. Wrong
   answers earn nothing, but everyone still moves. The map opens when the whole class is done.
3. **The War Council** (45 s, set in the lobby; the teacher can add 15 s or launch early): no questions, the map has
   everyone's attention. Tap a glowing stop to plan a route for the whole move: it follows the real roads, shows
   its AP cost, what is there and how much AP is left, and a ghost banner marks the planned stop. Tap a junction to
   change the way. A pair alone commits straight away; in a warband one pair proposes and the others tap AGREE (the
   majority route wins when the council ends). HOLD HERE keeps a banner where it is. Other banners' routes show as
   thin lines. Grab-Ma takes orders here too.
4. **The march**: every committed banner sets off together and eases along the roads. Walking into an enemy (or an
   ambush) stops the route and starts the battle; the rest of the route is not taken.
5. **Battles** finish, then the next turn begins. Students who are free can tap **SUPPORT** to back a battle with War
   Cries (War Cries only come to students who chose to support).

Each banner shows its status beside it and on the action bar (planning, agreeing, committed, marching, enemy
encountered, holding, recovering), and a small HP bar.

## HP, food and recovery

- A pair has 10 HP (shown ×100 in battle). It **does not come back after a battle**: a warband fights with the HP its
  pairs still have, and what is left goes back to the pairs. A beaten warband limps away with 30% HP.
- Heal by eating food from Grab-Ma (on the phone, or on your turn in battle), or by resting at the Academy or a
  rally point you hold (+3 HP a turn).
- After a defeat, the action bar tells the company where it withdrew to and how wounded the enemy is.

## Balance (slower battles)

- Sync fills by up to 16 a question (scaled by the share of fighters who were right) plus 4 for a right strike.
- Answering along: 0.75 hits for each right answer, counting at most 4. Ultimate splash is 1.5 hits.
- The gate guardian hits for 6, the Warlord for 8.

## Seeing the battle

- Battles use the Arena screen, with every fighter standing on the war backdrop's ground line at the theatre's size.
- In a battle with more than one pair, a small window in the top right shows another pair fighting the same monster
  (its HP falls with yours). With several pairs it takes turns showing each one, and it drops to the bottom right while
  your own question card is open.

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

- **Enemies come in waves:** one at a time, with a 50% chance that the next wave is two. Answering along and an
  Ultimate's splash only hit the wave in front, so a big warband cannot wipe a whole stack in one question.
- **Pick a target:** while a battle gathers, each pair taps the enemy it wants. The most-picked enemy comes out
  first, and a pair's move goes for its own pick when that enemy is in the wave.
- **Teleport (teacher):** in the Crimson turn, a unit can appear on any free stop (not on a Crystal banner or a
  camp) for 2 Rift Energy. From the new-unit prompt, or the ⚡ Teleport button on a stack.
- **Ambush (teacher):** a unit ordered to Ambush hides on its stop. The class cannot see it (not even through the
  watchtower or on the projector). A banner that walks in starts the battle 25% down on HP. Moving the unit
  gives the ambush away.
- **The watchtower** (Whispering Watch): while a Crystal banner stands on it, the whole class sees every Crimson
  unit beyond the fog, except ambushers.

### Questions

- Questions always sit in the middle of the screen, as in Academy Rift. There are no questions while the class
  moves: preparing questions come in the Crimson turn, and War Cries only once your move is locked in and a battle
  is on.

### Bots and practice

- **Practice war** (join page): one student against the Bot Commander, with two bot pairs and a bot partner.
- Lobby **BOTS** settings: **Bot Commander** (a bot plays the Crimson Host), **Bot partners** (a lone student
  gets a bot fighter), and **Add a bot pair** to fill up the class.

### The teacher's screen

- A step guide at the top: send out units → give them orders → end your turn.
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
(70 strength). The Warlord comes out once the gate is broken and 80% of the class have answered the
teacher's question target (25 by default), or when the teacher releases him. If the last turn ends
first, the Crimson Host wins.

## Files

- `rules.js`: every rule and number, shared by the server and the pages.
- `../../totalwar.js`: the server (its own rooms and `tw*` socket events).
- `map.js`, `card.js`, `tw.css`: the shared map, Academy Rift question card and look.
- `play.js`/`play.css`, `command.js`/`command.css`, `projector.html`: the three screens.
- `monsters/`: PixelLab sprites for the six camps and the twelve Crimson Host units.
- `portraits/`: the character card portraits used on the banners.

## Tests

- `node test-totalwar.mjs [students]`: a teacher and a class of bots play a whole war.
- `node --test tools/test-total-war.mjs`: the map and the rules.
- `node tools/tw-demo.mjs [url] [bots] --auto-teacher`: a live demo war to join from a browser.
