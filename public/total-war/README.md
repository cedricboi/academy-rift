# Academy Rift: Total War — portrait standards prototype

Run `npm start` and open `/total-war/`. The review server uses port 3101 because 3100 was occupied. All additions are isolated to `public/total-war/` and two tools; existing Arena, server, dependencies and character definitions remain unchanged.

## Play
Two companies begin at the Crystal Fortress. Open Banners to choose from all ten original characters while at the fortress before committing orders. Each standard contains the actual Academy Rift portrait, an elemental crest and a coloured pennant. The repository names its fire character Jun Kisaragi.

Choose waypoints to extend a route, tap an earlier point to shorten it, or clear the preview. Stone roads cost 1 MP; rough trails cost 2. The optional route overlay shows the complete network and costs. Commit each company or hold, then begin simultaneous movement. Unspent points are reserved for this round, not accumulated.

The map has 26 locations, 32 roads, three crossings and seven optional dead-end branches. Four shrines grant movement points on arrival for the following round: Moonwell +1, Windspire +2, Ancient Grove +1, Star Observatory +1. Holding at a shrine grants nothing further. Base allowance is 4 MP; maximum is 6. Monster sites are concept locations only.

Six new monster concepts are available in Bestiary and `art/monster-concepts.png`: Moonhart Sentinel, Galecrest Roc, Mossback Colossus, Riftglass Basilisk, Hollow Ferryman and Crimson Broodmother. Suggested encounter rewards are proposals, not implemented combat.

## Art and rendering
Canvas 2D renders the expanded environment, route splines, waving portrait banners, animated campfire, river highlights, mist and crystal particles. Both standards use the same departure clock and distance-based movement. Original fonts, portraits and campfire FX are reused. New environment and monster concept sheet were generated for this prototype; no replacement character art was generated.

`banners.html` provides a full collection and downloads. SVGs embed original WebP portraits and are rebuilt with `node tools/build-total-war-banners.mjs`. `movement.js` supplies weighted route planning and shared render/travel geometry.

Namespaced localStorage `academy-rift.total-war.standards.v2` preserves choices, orders, positions and earned bonuses. Reload during movement restores the pre-departure plan. Restart is in the field guide. This is browser-local play, not a network match.

## Validation
`node --test tools/test-total-war.mjs`: seven passing checks covering all-pairs connectivity, independent optimal weighted paths, budgets, optional branches, all ten portable portrait assets, reverse geometry and distance sampling.

Browser checks cover banner selection and persistence, over-budget rejection, split simultaneous march, arrival bonuses, reload, next round, all-hold without bonus farming, gallery and bestiary. Layout inspected at 1024×768, 1194×834 and 1366×1024. Waypoints have 48px targets and primary actions are at least 44px. No console errors in the checked flow. Physical iPad Safari, actual touch input and sustained device performance remain unverified.
