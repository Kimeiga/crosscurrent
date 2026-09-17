# Crosscurrent

A simultaneous strategy card game for two. Svelte and TypeScript, with solo computer opponents, private online tables, and pass-and-play on one device.

Production: https://crosscurrent-delta.vercel.app/

## Homepage demonstration

The homepage plays a complete scripted match using the same v0.2 rules engine as the game. All twelve turns, all three scoring checkpoints, shifts, recalls and highest-card exhaustion are included. The example ends 10–8, sweeps the table, and repeats every 50.35 seconds. It is an illustration, not a claim of optimal play.

Twenty-six persistent SVG card nodes move by transforms inside a clipped stage. Deployments enter from the top or bottom, shifts travel between fronts, recalls return toward their owner, and discarded cards leave sideways. Cards do not cross-fade. The primary Play vs AI button precedes the demonstration on mobile.

Pause, next-turn and restart controls work by touch or keyboard. Reduced-motion preferences start the example paused at a scoring position. Playback stops while the tab is hidden or the demonstration is offscreen, and all listeners and animation frames are cleaned up when leaving the lobby.

## Run locally

Use Node.js 22.16 or later. The standalone server uses Node's built-in SQLite support.

```sh
npm install
npm run dev
```

Open the Vite URL printed in the terminal. The development launcher starts the frontend and room service together.

```sh
npm run check
npm test
npx playwright install chromium webkit
npm run test:e2e
npm run build
npm start
```

The production server defaults to `127.0.0.1:3001`. Set `HOST=0.0.0.0` when serving outside the local machine. `PORT` changes the port; `DATA_DIR` changes the SQLite storage directory. Keep that directory on persistent storage. The local adapter uses Server-Sent Events. Vercel uses the same room API with lightweight client polling, and the deployed room service persists state in project-scoped SQLite. AppDeploy can still use its WebSocket adapter when available.

## Source layout

- `src/engine.ts`: immutable rules shared by UI, AI and server.
- `src/ai.ts`, `src/ai.worker.ts`: public-position computer opponents, calculated off the main thread.
- `src/App.svelte`, `src/Table.svelte`: solo, local and online play, saved games, staged reveals and rules.
- `src/Lobby.svelte`, `src/GameDemo.svelte`, `src/demo/`: homepage and full-match animation.
- `backend/`: AppDeploy adapter and authenticated room service.
- `local/`: standalone HTTP, SQLite and realtime adapters.
- `tests/`: engine, AI, room, persistence, demo and browser tests.

## Preview the homepage independently

```sh
npm run preview:homepage
```

This writes `docs/homepage-preview.html`, a self-contained HTML preview using the production animation modules. Its play links open the production app; it is not an alternate online-game deployment.

## Verification

The source work passed 45 Node tests, including the twelve-turn animation timeline and 720 original Python reference transitions. The reference states are stored as per-match SHA-256 digests with their exact action transcripts, not regenerated expectations from the TypeScript engine. See `tests/GOLDEN.md`.

The standalone production-animation preview was exercised in Chromium at 320, 375, 390, 1280 and 1440 pixel widths. Checks cover continuous transform movement, stable card nodes, opacity remaining at one, pause/resume, a full loop, reduced motion, and the primary action staying above the fold. Full Svelte build and gameplay browser verification run in the Quality workflow; do not confuse the independent animation preview checks with a full-app test run.

## Deployment

Production is hosted on Vercel:

https://crosscurrent-delta.vercel.app/

Vercel builds the same Vite/Svelte frontend. Solo and local play stay entirely in the browser. Private online tables call the independent HTTPS room service in `services/rooms/` directly using the same seat-token protocol; the Vercel client polls for the opponent's completed state rather than depending on a long-lived WebSocket or serverless proxy.

For AppDeploy, `APPDEPLOY=1` leaves its injected client SDK in place. For Vercel, its built-in `VERCEL=1` selects `src/vercel-client.ts`. Local development selects `local/client.ts`.

## Rules and limitations

Both players start with Ace through King. Every turn, secretly commit one Deploy, Shift or Recall order, then reveal both. Strength is the sum of ranks at each of three fronts. Turns 4, 8 and 12 award 1, 2 and 3 points per won front, followed by highest-card exhaustion. Recall can save its target; tied fronts award nothing. Higher accumulated score after twelve turns wins; equal scores draw. Read `docs/RULES.md` for details.

The rules are symmetric at the start. The AI is not proven optimal. Private invitation links grant access to one seat, so share them only with the intended opponent. Pending opposing orders are not returned to the other client. The production room service uses compare-and-swap updates per seat so retries are idempotent and simultaneous players do not overwrite each other's pending orders. These remain casual private rooms, not a ranked anti-cheat system. Local pass-and-play relies on looking away, not security against inspecting the device.
