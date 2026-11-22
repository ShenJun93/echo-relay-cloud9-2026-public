import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const chromeExe = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const url = process.env.ECHO_RELAY_URL || "http://127.0.0.1:4173/";
const browser = await chromium.launch({ executablePath: chromeExe, headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    reducedMotion: "reduce",
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", err => errors.push(err.message));
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
  assert.equal(response.status(), 200);
  await page.getByRole("button", { name: "START 60-SECOND RUN" }).waitFor();
  const pixels = await page.evaluate(() => {
    const canvas = document.querySelector("#arena");
    return [...canvas.getContext("2d").getImageData(140, 180, 1, 1).data];
  });
  assert.equal(pixels.length, 4);
  assert.notEqual(pixels[0] + pixels[1] + pixels[2], 0);
  await page.getByRole("button", { name: "START 60-SECOND RUN" }).click();
  await page.locator("#arena-status").getByText("LINK ACTIVE").waitFor();
  await page.keyboard.press("Space");
  await page.locator("#announcer").getByText(/channel/).waitFor();
  const time = Number(await page.locator("#time-left").textContent());
  assert.ok(time > 0 && time <= 60);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.locator("#arena").tap({ position: { x: 180, y: 120 } });
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: document.documentElement.clientWidth,
    scene: Math.round(document.querySelector("#arena").getBoundingClientRect().width),
  }));
  assert.ok(dimensions.scroll <= dimensions.width + 2,
    "Chrome viewport overflow: " + JSON.stringify(dimensions));
  assert.ok(dimensions.scene >= 320);
  await page.screenshot({ path: "acceptance/p2-chrome-mobile-playing.jpg", type: "jpeg", quality: 70, fullPage: true });
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log(JSON.stringify({
    status: "PASS", engine: "Google Chrome stable (installed)", desktop: "PASS",
    keyboard: "PASS", mobileTouch: "PASS", canvas: "PASS", viewport: dimensions,
    runtimeErrors: errors.length,
  }));
} finally {
  await browser.close();
}
