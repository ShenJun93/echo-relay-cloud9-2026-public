import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import assert from "node:assert/strict";

const base = process.env.ECHO_RELAY_URL || "http://127.0.0.1:5173/";
const output = "acceptance";
const exe = process.env.EDGE_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
await fs.mkdir(output, { recursive: true });

const browser = await chromium.launch({ executablePath: exe, headless: true });
const errors = [];
let page;
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 970 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  page = await context.newPage();
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", msg => { if (msg.type() === "error") errors.push("CONSOLE: " + msg.text()); });
  const response = await page.goto(base, { waitUntil: "networkidle", timeout: 15000 });
  assert.equal(response.status(), 200);
  await page.getByRole("button", { name: "START 60-SECOND RUN" }).waitFor();
  assert.match(await page.title(), /ECHO\/\/RELAY/);
  assert.equal(await page.locator("#switch-button").isDisabled(), true);
  const graphic = await page.evaluate(() => {
    const canvas = document.querySelector("#arena");
    const pixel = canvas.getContext("2d").getImageData(120, 140, 1, 1).data;
    return { w: canvas.width, h: canvas.height, rgba: Array.from(pixel) };
  });
  assert.deepEqual([graphic.w, graphic.h], [960, 540]);
  assert.notEqual(graphic.rgba[0] + graphic.rgba[1] + graphic.rgba[2], 0);
  await page.screenshot({ path: output + "/p0-desktop-start.jpg", fullPage: true, type: "jpeg", quality: 75 });

  await page.getByRole("button", { name: "START 60-SECOND RUN" }).click();
  await page.getByText("LINK ACTIVE").waitFor();
  assert.equal(await page.locator("#switch-button").isDisabled(), false);
  await page.keyboard.press("Space");
  assert.match(await page.locator("#announcer").textContent(), /channel/i);
  await page.waitForTimeout(1400);
  assert.ok(Number(await page.locator("#time-left").textContent()) < 59.9);
  await page.locator("#switch-button").click();
  await page.screenshot({ path: output + "/p0-desktop-playing.jpg", fullPage: true, type: "jpeg", quality: 75 });

for (const width of [320, 360, 375, 768]) {
    await page.setViewportSize({ width, height: 812 });
    await page.waitForTimeout(100);
    const measured = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    if (measured.scrollWidth > measured.viewport + 2) {
      const offenders = await page.evaluate(() =>
        [...document.querySelectorAll("body *")].map(el => {
          const r = el.getBoundingClientRect();
          return { tag: el.tagName, id: el.id, cls: el.className, right: Math.round(r.right), left: Math.round(r.left), width: Math.round(r.width) };
        }).filter(e => e.right > innerWidth + 2 || e.left < -2).slice(0, 20));
      console.error("OVERFLOW_DIAGNOSTIC", width, JSON.stringify(offenders));
    }
    assert.ok(measured.scrollWidth <= measured.viewport + 2,
      "horizontal overflow at " + width + "px: " + JSON.stringify(measured));
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(350);
  const mobile = await page.evaluate(() => ({
    visible: document.querySelector("#switch-button").getBoundingClientRect().width > 100,
    width: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
    arenaWidth: document.querySelector("#arena").getBoundingClientRect().width,
  }));
  assert.equal(mobile.visible, true);
  assert.ok(mobile.arenaWidth > 300);
  assert.ok(mobile.width <= mobile.viewport + 2, "horizontal overflow at 375px: " + JSON.stringify(mobile));
  await page.screenshot({ path: output + "/p0-mobile-playing.jpg", fullPage: true, type: "jpeg", quality: 75 });
  assert.equal(errors.length, 0, "runtime errors: " + JSON.stringify(errors));
  console.log(JSON.stringify({
    status: "PASS",
    desktop: "START -> LINK ACTIVE -> Space swap -> button swap",
    mobile,
    graphic,
    runtimeErrors: errors.length,
    screenshots: [
      "acceptance/p0-desktop-start.jpg",
      "acceptance/p0-desktop-playing.jpg",
      "acceptance/p0-mobile-playing.jpg",
    ],
  }, null, 2));
} finally {
  await browser.close();
}
