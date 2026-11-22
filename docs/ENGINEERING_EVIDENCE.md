# Engineering evidence — ECHO//RELAY

This file summarizes tested facts from the original private repository and is not a newly recorded human playtest. Original private screenshots, account/license data, local machine paths and internal acceptance folders are excluded.

## Genuine JetBrains WebStorm usage

WebStorm 2026.3 (build 263.7307.202) was used to edit the READY teaching animation. Its native Shift+F6 Rename Refactor changed `paintAttract` to `drawReadyAttract` in `src/game/render.ts`, updating the import and invocation in `src/main.ts`. TypeScript, unit tests and targeted browser regression passed after the actual IDE refactor. This work was originally recorded at private development commit `66bec2e`; that commit is **not reachable from this fresh-history source snapshot**.

This was genuine IDE editor/refactoring work, NOT JetBrains Air, Junie or JetBrains AI agent use. Other changes were AI-assisted from tools outside WebStorm. License status is a separate eligibility question; a non-commercial license is not assumed to cover cash-prize goals.

## Gameplay skill-incentive correction

The initial deterministic game let a blind periodic switch policy score **42,260 points** on the event seed while an idle policy scored **4,030**. The previous Echo persisted **0.54s** with a **0.60s** switch cooldown, allowing near-automatic two-lane coverage. This was a gameplay-design incentive, not malicious score injection.

The candidate uses a **0.33s** Echo and **0.80s** cooldown. In a sampled parameter sweep the best blind-periodic score fell from **41,060** under the older mechanics to **18,060** under the candidate, while a timing-aware engine-state bot scored **39,110**. These figures are automated test results, **not human user testing**.

The final local game passed **16/16 deterministic unit tests**, a Vite/TypeScript build and an independent browser acceptance suite including a full 60-second run, replay and real offline reload. Five production assets were independently built with matching SHA-256 values on Windows and Linux Node 24.

The private P38 demo footage showed a real natural-clock game round of **60.501s**, score **16,360**, **28 Dual Links**. The **43 Space presses were automated**, not human playtest input. IDE images were labeled genuine stills, not a falsely staged current editing video.

At source curation, no actual public-origin CDN checks, on-site booth hardware observations or independent human first-time playtest results had been established.

## Reproduce locally

~~~sh
npm ci
npm test
npm run release:check
~~~

The tests examine determinism, hazards, Echo scoring, cooldown behavior, soak and adversarial periodic switching. Static output preflight verifies a five-file root-hosted build and expected MIME. The browser suites are separate and must be run on real supported browser versions.

No success probability or award placement is inferred from these engineering tests.
