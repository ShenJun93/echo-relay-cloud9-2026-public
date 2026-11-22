import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const exe = process.env.EDGE_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const url = process.env.ECHO_RELAY_URL || "http://127.0.0.1:4173/";
const browser = await chromium.launch({ executablePath: exe, headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 840 }, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url, { waitUntil: "networkidle" });
  const sound = page.locator("#sound-button");
  assert.equal(await sound.getAttribute("aria-pressed"), "false");
  assert.equal(await sound.textContent(), "SOUND OFF");
  await sound.click();
  assert.equal(await sound.getAttribute("aria-pressed"), "true");
  assert.equal(await sound.textContent(), "SOUND ON");
  await sound.click();
  assert.equal(await sound.getAttribute("aria-pressed"), "false");
  assert.equal(await sound.textContent(), "SOUND OFF");

  const fullscreen = page.locator("#fullscreen-button");
  await fullscreen.click();
  const fullResult = await page.evaluate(() => ({
    active: !!document.fullscreenElement, text: document.querySelector("#fullscreen-button")?.textContent,
  }));
  // In some CI/headless browsers fullscreen is blocked. Must degrade honestly.
  assert.ok(fullResult.active ? fullResult.text === "EXIT FULLSCREEN"
    : fullResult.text === "NOT AVAILABLE" || fullResult.text === "FULL SCREEN",
  "Fullscreen button must reflect actual state: " + JSON.stringify(fullResult));
  if (fullResult.active) {
    const booth = await page.evaluate(() => {
      const root = document.fullscreenElement;
      const selectors = [
        "#fullscreen-button", "#sound-button", "#switch-button",
        "#score", "#time-left",
      ];
      return {
        rootIsShell: root?.classList.contains("shell") ?? false,
        controls: selectors.map(selector => {
          const element = document.querySelector(selector);
          const bounds = element?.getBoundingClientRect();
          const style = element && getComputedStyle(element);
          return {
            selector,
            contained: !!root?.contains(element),
            inViewport: !!bounds &&
              bounds.width > 0 && bounds.height > 0 &&
              bounds.left >= -2 && bounds.top >= -2 &&
              bounds.right <= innerWidth + 2 && bounds.bottom <= innerHeight + 2,
            displayed: !!style && style.display !== "none" && style.visibility !== "hidden",
          };
        }),
      };
    });
    assert.equal(booth.rootIsShell, true, "Fullscreen must include booth shell");
    for (const control of booth.controls) {
      assert.equal(control.contained && control.inViewport && control.displayed,
        true, "Booth control not visible in fullscreen: " + JSON.stringify(control));
    }
    // Regression: tablet-sized fullscreen layouts must not lose SWITCH or TIME.
    for (const [width, height] of [[768, 720], [800, 600], [360, 640], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      const missing = await page.evaluate(() => {
        const root = document.fullscreenElement;
        return ["#fullscreen-button", "#sound-button", "#switch-button", "#score", "#time-left"]
          .filter(selector => {
            const el = document.querySelector(selector);
            if (!root || !el || !root.contains(el)) return true;
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            return s.display === "none" || s.visibility === "hidden" ||
              r.width <= 0 || r.height <= 0 ||
              r.left < -2 || r.top < -2 ||
              r.right > innerWidth + 2 || r.bottom > innerHeight + 2;
          });
      });
      assert.deepEqual(missing, [],
        "Fullscreen clipped controls at " + width + "x" + height + ": " + missing.join(","));
    }
    await page.setViewportSize({ width: 1280, height: 840 });
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForFunction(() =>
      !document.fullscreenElement &&
      document.querySelector("#fullscreen-button")?.textContent === "FULL SCREEN");
    assert.equal(await fullscreen.textContent(), "FULL SCREEN");
  }

  await page.getByRole("button", { name: "START 60-SECOND RUN" }).click();
  await page.locator("#arena-status").getByText("LINK ACTIVE").waitFor();
  assert.equal(await page.locator("#switch-button").isDisabled(), false);
  await page.locator("#arena").tap({ position: { x: 200, y: 100 } });
  await page.locator("#announcer").getByText(/channel/).waitFor();

  // Space on an interactive control must activate that control, not switch lanes.
  await page.waitForTimeout(900);
  await sound.focus();
  const beforeSound = await page.locator("#announcer").textContent();
  await page.keyboard.press("Space");
  await page.waitForFunction(() =>
    document.querySelector("#sound-button")?.getAttribute("aria-pressed") === "true");
  assert.equal(await page.locator("#announcer").textContent(), beforeSound,
    "Space on sound unexpectedly changed lanes");

  // The arena shortcut and native SWITCH button must each change lanes.
  await page.waitForTimeout(900);
  await page.locator("#arena").focus();
  await page.keyboard.press("Space");
  assert.match(await page.locator("#announcer").textContent(), /Signal channel/);
  await page.waitForTimeout(900);
  await page.locator("#switch-button").focus();
  await page.keyboard.press("Space");
  assert.match(await page.locator("#announcer").textContent(), /Echo channel/);

  // Re-enter fullscreen during active play and operate the visible SWITCH button.
  await page.waitForTimeout(900);
  const beforeSwitch = await page.locator("#announcer").textContent();
  await fullscreen.click();
  const playingFullscreen = await page.evaluate(() => !!document.fullscreenElement);
  if (fullResult.active) assert.equal(playingFullscreen, true,
    "Fullscreen previously worked but could not be re-entered during play");
  if (playingFullscreen) {
    await page.locator("#switch-button").click();
    const afterSwitch = await page.locator("#announcer").textContent();
    assert.notEqual(afterSwitch, beforeSwitch,
      "SWITCH button should change lane during fullscreen play");
    assert.ok(Number(await page.locator("#time-left").textContent()) > 0,
      "Timer should remain visible during fullscreen play");
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForFunction(() => !document.fullscreenElement);
  }

  const gameState = await page.evaluate(() => ({
    currentSeconds: document.querySelector("#time-left")?.textContent,
    interactive: !document.querySelector("#switch-button")?.disabled,
  }));
  assert.equal(gameState.interactive, true);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log(JSON.stringify({
    status: "PASS", soundMuteToggle: "PASS", touchLaneSwap: "PASS", keyboardFocus: "PASS",
    fullscreen: fullResult.active && playingFullscreen ? "PASS (HUD + active switch)" : "unsupported - not verified",
    browserErrors: errors.length, gameState,
  }));
} finally {
  await browser.close();
}
