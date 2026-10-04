# Crosscurrent

A card game for two with no shuffle and no dice. Both players hold the same thirteen cards, choose one order in secret each turn, and reveal together. Play the computer, a friend online, or pass and play on one device.

Production: https://hakanalpay.com/crosscurrent/ · Vercel mirror: https://crosscurrent-delta.vercel.app/

## The game in brief

Each player has one suit, Ace (1) to King (13). There are three fronts: Left, Middle and Right. Every turn both players secretly choose one order: **Deploy** a card to a front, **Shift** a deployed card to another front, or **Recall** a deployed card to hand. Shift and Recall cost your lowest card in hand. Turns 4, 8 and 12 score 2, 3 and 4 points for each front where you are stronger; afterwards each player's highest card on every front they occupy is spent. Most points after turn 12 wins; equal points go to the player whose fronts were stronger in total across the three scorings. Full rules: [docs/RULES.md](docs/RULES.md).

## Design and research

Crosscurrent tests a specific hypothesis: an original two-player card game can be structurally fair from the first game, have no deal luck, offer many meaningful choices, and let better reasoning win measurably often, so that even a single game is evidence of who played better.

- [docs/RESEARCH.md](docs/RESEARCH.md): the full record, from the original Piquet, Schnapsen and GOPS comparisons to the 2026 audit and the v0.3 rule change.
- [docs/DESIGN_DECISIONS.md](docs/DESIGN_DECISIONS.md): why each mechanic exists.
- [docs/EVALUATION.md](docs/EVALUATION.md) and [docs/BENCHMARKS.json](docs/BENCHMARKS.json): how changes are judged and every measurement so far.
- [research/](research/): the Rust simulator, exact reduced-game solver and raw logs behind the numbers.

Headline measurements behind v0.3 (simulations with search bots; see RESEARCH.md for intervals and caveats): against a bot with a quarter of its search, the stronger bot's expected result was 73.5% under v0.2, with 13.8% of games drawn, and 76.5% under v0.3, with one draw in 6,600 games. Put plainly, the stronger bot wins about three games in four. These are bot measurements, not human playtests, and none of the computer opponents is claimed to be optimal.

## The app

- **Start screen:** what the game is in one sentence, the three ways to play, a guided lesson, and a complete example game playing in the corner.
- **Learn by playing:** five one-turn lessons on real positions (secret orders, scoring and spent cards, Shift, Recall) ending with a last-turn puzzle that has exactly one winning order. Players who skip the lesson get a one-line tip on the first turns of their first game.
- **Table:** tap a card in your hand or on the board, then a front. The table previews your new strengths, marks the payment card for Shift and Recall, shows which cards will be spent after a scoring, and marks leads no single opposing order can overturn.
- **Computer:** Easy, Medium and Hard run the same tree search with 300, 3,000 and 24,000 iterations in a Web Worker and solve the last turn exactly. It only ever sees the public position.
- **Online:** one tap creates a private table and a link to share; your friend joins with one tap. Orders stay on the server, hidden, until both are in.
- **Pass and play:** handoff screens keep each player's order private until both reveal together.

Light and dark themes follow the system setting. Phone and desktop layouts are both first-class; on phones your hand and the Lock in button stay at the bottom of the screen.

## Run locally

Use Node.js 22.16 or later. The standalone server uses Node's built-in SQLite support.

```sh
npm install
npm run dev        # frontend and room service together
npm run check      # Svelte and TypeScript checks
npm test           # rules, AI, lessons, rooms, persistence and demo tests
npx playwright install chromium webkit
npm run test:e2e   # browser workflows on desktop Chrome and iPhone WebKit
npm run build && npm start
```

The production server defaults to `127.0.0.1:3001`. Set `HOST=0.0.0.0` when serving outside the local machine; `PORT` changes the port and `DATA_DIR` the SQLite directory (keep it on persistent storage).

## Source layout

- `src/engine.ts`: the rules, shared by the UI, the computer and the servers. Scoring values and the tiebreak are a `Rules` parameter; `V02` keeps the original values for the reference fixtures.
- `src/ai.ts`, `src/ai/`: the computer opponent: a bitmask copy of the engine, simultaneous-move tree search and an exact matrix-game solver.
- `src/App.svelte`, `src/Home.svelte`, `src/Table.svelte`, `src/Tutorial.svelte`, `src/lessons.ts`, `src/Rules.svelte` and the small components beside them: the app. `src/table.ts` and `src/text.ts` hold the table's decisions and the app's state-dependent sentences as plain, unit-tested functions.
- `src/demo/`: the start-screen example game (26 persistent SVG cards moved by transforms).
- `backend/`, `local/`, `services/rooms/`: room services for AppDeploy, the standalone server and the hosted Val Town deployment.
- `research/`: the simulator, solver and experiment logs.
- `tests/`: unit, reference-fixture and browser tests.

## Online play and deployment

The Vercel build calls the room service in `services/rooms/` (deployed on Val Town) directly and polls for the opponent's order. The room service enforces hidden orders, turn order and legality; both clients recompute the score from the revealed orders, so a room service still on v0.2 scoring keeps working. Redeploying `services/rooms/main.ts` brings its own score fields up to date.

Private invitation links grant one seat, so share them only with your opponent. These are casual private tables, not a ranked anti-cheat system. Pass and play relies on players looking away.

To publish:

- **Production (hakanalpay.com/crosscurrent/):** build the Vercel variant with `VERCEL=1 npm run build`, replace `static/crosscurrent/` in the site repository `Kimeiga/kimeiga.github.io` with the contents of `dist/`, and merge to `master`. Cloudflare Pages publishes the site, and pull requests there get a preview at `pr-<number>.hakanalpay.pages.dev/crosscurrent/`.
- **Vercel mirror (crosscurrent-delta.vercel.app):** the Vercel project is not connected to GitHub. Run `vercel deploy --prod` from this repository; Vercel sets `VERCEL=1` during its build.
- **Room service:** deploy `services/rooms/main.ts` to Val Town. Clients do not depend on its score fields.

## Verification

`npm test` replays the 60 original Python reference transcripts (720 transitions, SHA-256 digests of the expected states; see `tests/GOLDEN.md`) under the v0.2 values, checks the AI's bitmask engine against the reference engine on 2,000 random games, checks the exact final-turn solver against full resolution, and verifies every tutorial position, including that the final puzzle has exactly one winning order. The browser suite covers a full solo game with Shift, Recall and resuming, online tables that hide pending orders, pass and play, failure handling, the lessons and the start-screen animation.
