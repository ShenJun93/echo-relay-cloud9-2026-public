import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const exe = process.env.EDGE_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const url = process.env.ECHO_RELAY_URL || "http://127.0.0.1:4173/";
const boardKey = "echo-relay-booth-scores-v2";
const browser = await chromium.launch({ executablePath: exe, headless: true });

try {
    for (const reducedMotion of [false, true]) {
        const context = await browser.newContext({
            viewport: { width: 1280, height: 840 },
            reducedMotion: reducedMotion ? "reduce" : "no-preference",
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        try {
            await page.clock.install();
            await page.goto(url, { waitUntil: "load" });
            await page.locator("#start-button").waitFor();
            const initial = await page.evaluate(key => ({
                active: document.querySelector("#overlay")?.classList.contains("attract-mode"),
                board: localStorage.getItem(key),
                time: document.querySelector("#time-left")?.textContent,
                disabled: document.querySelector("#switch-button")?.disabled,
                focus: document.activeElement?.id ?? "",
            }), boardKey);
            assert.equal(initial.active, false, "Attract must not appear immediately");
            assert.equal(initial.board, null, "READY must not store leaderboard data");
            assert.equal(initial.time, "60.0");
            assert.equal(initial.disabled, true);

            await page.clock.runFor(14_300);
            assert.equal(await page.locator("#overlay").evaluate(el => el.classList.contains("attract-mode")),
                false, "Attract started before 15s");
            await page.clock.runFor(1_200);
            await page.waitForFunction(() =>
                document.querySelector("#overlay")?.classList.contains("attract-mode"));
            const ready = await page.evaluate(key => ({
                active: document.querySelector("#overlay")?.classList.contains("attract-mode"),
                kicker: document.querySelector(".overlay-kicker")?.textContent,
                board: localStorage.getItem(key),
                time: document.querySelector("#time-left")?.textContent,
                focus: document.activeElement?.id ?? "",
                buttonVisible: !!document.querySelector("#start-button")?.getBoundingClientRect().height,
                reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
            }), boardKey);
            assert.equal(ready.active, true);
            assert.match(ready.kicker, /WATCH THE ECHO/);
            assert.equal(ready.board, null);
            assert.equal(ready.time, "60.0");
            assert.equal(ready.focus, initial.focus, "Attract stole keyboard focus");
            assert.equal(ready.buttonVisible, true, "Attract hid START button");
            assert.equal(ready.reduced, reducedMotion);

            await page.getByRole("button", { name: "START 60-SECOND RUN" }).click();
            await page.waitForFunction(() =>
                document.querySelector("#arena-status")?.textContent === "LINK ACTIVE");
            const playing = await page.evaluate(key => ({
                active: document.querySelector("#overlay")?.classList.contains("attract-mode"),
                overlayHidden: document.querySelector("#overlay")?.classList.contains("hidden"),
                time: Number(document.querySelector("#time-left")?.textContent),
                score: document.querySelector("#score")?.textContent,
                board: localStorage.getItem(key),
                switchDisabled: document.querySelector("#switch-button")?.disabled,
            }), boardKey);
            assert.equal(playing.active, false, "Attract did not cancel on START");
            assert.equal(playing.overlayHidden, true);
            assert.ok(playing.time > 59.5 && playing.time <= 60,
                "Actual run must begin near 60.0 seconds");
            assert.equal(playing.score, "000000");
            assert.equal(playing.board, null, "Attract or START wrote a false score");
            assert.equal(playing.switchDisabled, false);
            assert.deepEqual(errors, [], "Uncaught browser exceptions");
            console.log(JSON.stringify({
                status: "PASS", reducedMotion, idleActivation: "PASS",
                startCancellation: "PASS", focus: "PASS", localStorage: "UNCHANGED",
                activeTime: playing.time, errors: errors.length,
            }));
        } finally {
            await context.close();
        }
    }

    // Narrow layouts retain the original READY prompt because the Canvas
    // teaching panel is occluded by the mobile overlay.
    for (const width of [360, 799]) {
        const context = await browser.newContext({ viewport: { width, height: 800 } });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        try {
            await page.clock.install();
            await page.goto(url, { waitUntil: "load" });
            await page.locator("#start-button").waitFor();
            await page.clock.runFor(16_200);
            const ready = await page.evaluate(key => ({
                active: document.querySelector("#overlay")?.classList.contains("attract-mode"),
                kicker: document.querySelector(".overlay-kicker")?.textContent,
                board: localStorage.getItem(key),
                time: document.querySelector("#time-left")?.textContent,
                viewportWidth: innerWidth,
            }), boardKey);
            assert.equal(ready.active, false, "Hidden attract must not activate on narrow displays");
            assert.equal(ready.kicker, "A NEW RULE OF REACTION");
            assert.equal(ready.board, null);
            assert.equal(ready.time, "60.0");
            assert.equal(ready.viewportWidth, width);
            await page.getByRole("button", { name: "START 60-SECOND RUN" }).click();
            await page.waitForFunction(() =>
                document.querySelector("#arena-status")?.textContent === "LINK ACTIVE");
            assert.deepEqual(errors, [], "Narrow viewport JavaScript exceptions");
            console.log(JSON.stringify({ status: "PASS", width, attract: "DISABLED", start: "PASS" }));
        } finally {
            await context.close();
        }
    }
    console.log("BROWSER_READY_ATTRACT_PASS");
} finally {
    await browser.close();
}
