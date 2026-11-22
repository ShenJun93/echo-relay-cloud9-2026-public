import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const exe = process.env.EDGE_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const url = process.env.ECHO_RELAY_URL || "http://127.0.0.1:5173/";
const browser = await chromium.launch({ executablePath: exe, headless: true });
let errors = [];
try {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", e => errors.push(e.message));
  await page.clock.install();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "START 60-SECOND RUN" }).click();
  await page.getByText("LINK ACTIVE").waitFor();
  // Advances the virtual requestAnimationFrame clock, not an assertion of real device FPS.
  await page.clock.runFor(60_500);
  await page.locator("#arena-status").getByText("RUN COMPLETE", { exact: true }).waitFor();
  const finalTime = await page.locator("#time-left").textContent();
  const score = await page.locator("#score").textContent();
  const leaderboard = await page.locator("#leaderboard li").count();
  assert.equal(finalTime, "0.0");
  assert.ok(Number(score.replace(/,/g, "")) > 0);
  assert.ok(Number(score.replace(/,/g, "")) < 8000, "no-input score must not rank high");
  await page.locator("#overlay-body").getByText(/FIRST CONTACT/).waitFor();
  assert.equal(leaderboard, 1);
  await page.screenshot({ path: "acceptance/p2-finish-desktop.jpg", fullPage: true, type: "jpeg", quality: 80 });
  await page.setViewportSize({ width: 375, height: 812 });
  const mobile = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
    stageHeight: Math.round(document.querySelector("#overlay").getBoundingClientRect().height),
    buttonVisible: document.querySelector("#overlay-body button").getBoundingClientRect().height > 0,
  }));
  assert.ok(mobile.width <= mobile.viewport + 2, "finish screen horizontal overflow: " + JSON.stringify(mobile));
  assert.ok(mobile.stageHeight >= 250, "finish overlay clipped: " + JSON.stringify(mobile));
  assert.equal(mobile.buttonVisible, true);
  await page.screenshot({ path: "acceptance/p2-finish-mobile.jpg", fullPage: true, type: "jpeg", quality: 80 });
  await page.setViewportSize({ width: 1440, height: 970 });
  await page.getByRole("button", { name: /PLAY AGAIN/ }).click();
  await page.getByText("LINK ACTIVE").waitFor();
  assert.equal(await page.locator("#time-left").textContent(), "60.0");
  assert.equal(await page.locator("#leaderboard li").count(), 1);
  await page.getByRole("button", { name: /CLEAR SCORES/ }).click();
  await page.getByRole("button", { name: /CONFIRM CLEAR/ }).waitFor();
  await page.getByRole("button", { name: /CONFIRM CLEAR/ }).click();
  await page.getByText("NO RUNS YET. BE THE FIRST.").waitFor();
  assert.equal(errors.length, 0, "Browser errors: " + JSON.stringify(errors));
  console.log(JSON.stringify({ status: "PASS", virtualClock: true, fullRoundSeconds: 60,
    finalScore: score, persistedLocalRows: leaderboard, replay: "PASS", runtimeErrors: errors.length }));
} finally {
  await browser.close();
}
