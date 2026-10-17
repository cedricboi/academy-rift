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
