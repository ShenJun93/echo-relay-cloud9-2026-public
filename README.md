# ECHO//RELAY

**One switch. Two selves. Sixty seconds.**

An original booth-first arcade game for Cloud9 × JetBrains Hackathon 2026, Category 3 (Event Mini Game). Built with TypeScript, Vite, Canvas 2D and no game backend.

## Play

Press **START 60-SECOND RUN**, then press **Space**, tap the arena or select **SWITCH CHANNEL** to swap two lanes. Every swap leaves a temporary Echo behind, capable of collecting signals on the previous lane. Catch both signals for a Dual Link bonus. Finish the 60 seconds and select **PLAY AGAIN**.

The scoreboard is `localStorage` only, not a global verified competition leaderboard. Sound effects are synthesized locally in the browser. The Service Worker enables best-effort offline play after a successful first load.

## Build and verify

Requires Node 24 and npm.

~~~sh
npm ci
npm test
npm run release:check
npm run dev
~~~

Open the development server at `http://127.0.0.1:5173/`. `release:check` verifies static output files, content types and checksums using a local loopback preview; it does not deploy.

Additional browser acceptance is available through `npm run qa:browser` (requires compatible browsers and tooling). After an approved HTTPS deployment, the `qa:judge` script can validate hosted JS/CSS/Service Worker hashes, fresh mobile/desktop controls and offline reload. That script requires an explicit exact deployed commit and URL; do not report localhost tests as public-site evidence.

## Architecture

- `src/game/engine.ts` — deterministic 60-second rules and signal scoring
- `src/game/render.ts` and `src/game/visuals.ts` — canvas rendering
- `src/game/audio.ts` — locally synthesized sound
- `src/main.ts` — user interface, keyboard/touch and browser state
- `public/sw.js` — same-origin cache and offline reload
- `tests/` — engine, soak and adversarial blind-input regression
- `scripts/` — browser QA and static-release gates

## JetBrains and AI attribution

**WebStorm 2026.3** was genuinely used to edit the READY attract demo and execute a native **Shift+F6 cross-file Rename Refactor**. ChatGPT-assisted reasoning and outside-IDE automated build/QA also contributed. No JetBrains Junie or JetBrains Air use is claimed. Actual trial/license type must be checked separately before a final competition declaration.

See [Engineering Evidence](docs/ENGINEERING_EVIDENCE.md) and the [AI Workflow Case Study](docs/AI_WORKFLOW_CASE_STUDY.md). Original private development commit history is intentionally not included in this curated source snapshot.

## Deployment

Build output is `dist/`. Serve from a **domain root** (Vite `base: "/"` and root-scoped `/sw.js`); nested subpaths need additional changes and new QA. No database, login, paid API or server function required.

This independent prototype does not use Cloud9, JetBrains or Riot character assets or logos and is not affiliated with the organizers. Source code is licensed under [MIT](LICENSE).

**Publication note:** This is a source-package candidate. A public repo URL, HTTPS demo, video and final Devpost project submission require separate owner approval. They do not exist merely because this package was prepared.
