import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";

const exe = process.env.EDGE_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const url = process.env.ECHO_RELAY_URL || "http://127.0.0.1:4173/";
const viewports = [[320, 568], [360, 640], [375, 667], [390, 844],
  [580, 700], [768, 720], [800, 600], [1024, 768], [1280, 720], [1920, 1080]];
const browser = await chromium.launch({ executablePath: exe, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url, { waitUntil: "networkidle" });
  const observations = [];
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    const actual = await page.evaluate(() => {
      const button = document.querySelector("#start-button");
      const rect = button.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      return {
        buttonFullyOnscreen: rect.width > 0 && rect.height > 0 &&
          rect.left >= -2 && rect.top >= -2 &&
          rect.right <= innerWidth + 2 && rect.bottom <= innerHeight + 2,
        buttonCenterClickable: hit === button || button.contains(hit),
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 2,
        heroVisible: getComputedStyle(document.querySelector(".hero")).display !== "none",
        explainsInput: /space/i.test(document.querySelector("#overlay-body p")?.textContent || "") &&
          /tap/i.test(document.querySelector("#overlay-body p")?.textContent || ""),
        explanationFullyVisible: (() => {
          const explanation = document.querySelector("#overlay-body p").getBoundingClientRect();
          const stage = document.querySelector("#overlay").getBoundingClientRect();
          return explanation.width > 0 && explanation.height > 0 &&
            explanation.left >= 0 && explanation.right <= innerWidth + 2 &&
            explanation.top >= Math.max(0, stage.top) - 2 &&
            explanation.bottom <= Math.min(innerHeight, stage.bottom) + 2;
        })(),
      };
    });
    assert.equal(actual.buttonFullyOnscreen, true, "START outside viewport: " + width + "x" + height);
    assert.equal(actual.buttonCenterClickable, true, "START obscured: " + width + "x" + height);
    assert.equal(actual.noHorizontalOverflow, true, "Horizontal overflow: " + width + "x" + height);
    assert.equal(actual.heroVisible, height > 820, "Unexpected hero visibility: " + width + "x" + height);
    assert.equal(actual.explainsInput, true, "READY omitted SPACE/tap instruction: " + width + "x" + height);
    assert.equal(actual.explanationFullyVisible, true, "READY explanation clipped: " + width + "x" + height);
    observations.push({ width, height, ...actual });
  }
  // Real click from the smallest viewport, not a programmatic start() call.
  await page.setViewportSize({ width: 320, height: 568 });
  await page.locator("#start-button").click();
  await page.getByText("LINK ACTIVE", { exact: true }).waitFor();
  assert.equal(await page.locator("#time-left").textContent(), "60.0");
  assert.equal(errors.length, 0, "Page runtime errors: " + JSON.stringify(errors));
  mkdirSync("acceptance", { recursive: true });
  writeFileSync("acceptance/p5-ready-viewport.json",
    JSON.stringify({ status: "PASS", automated: true, viewports: observations, browserErrors: errors.length }, null, 2));
  console.log(JSON.stringify({ status: "PASS", viewports: observations.length,
    smallestViewportStart: "PASS", browserErrors: errors.length }));
} finally {
  await browser.close();
}
