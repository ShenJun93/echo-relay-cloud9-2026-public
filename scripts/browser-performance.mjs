import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const exe = process.env.EDGE_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const url = process.env.ECHO_RELAY_URL || "http://127.0.0.1:4173/";
const browser = await chromium.launch({ executablePath: exe, headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 920 }, reducedMotion: "no-preference" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "START 60-SECOND RUN" }).click();
  const frames = await page.evaluate(() => new Promise(resolve => {
    const gaps = [];
    let last = null;
    const record = now => {
      if (last !== null) gaps.push(now - last);
      last = now;
      if (gaps.length >= 240) resolve(gaps);
      else requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  }));
  const sorted = [...frames].sort((a, b) => a - b);
  const medianMs = sorted[Math.floor(sorted.length / 2)];
  const p95Ms = sorted[Math.floor(sorted.length * .95)];
  const over50Ms = frames.filter(x => x > 50).length;
  const fps = 1000 / medianMs;
  assert.equal(errors.length, 0, "Browser errors: " + JSON.stringify(errors));
  assert.ok(Number.isFinite(fps) && fps > 0);
  console.log(JSON.stringify({
    status: "MEASURED", sampleFrames: frames.length, medianFrameMs: +medianMs.toFixed(2),
    p95FrameMs: +p95Ms.toFixed(2), medianObservedFPS: +fps.toFixed(1),
    gapsOver50Ms: over50Ms, pageErrors: errors.length,
    qualification: "Local headless Edge, not venue hardware; no absolute FPS promise",
  }));
} finally {
  await browser.close();
}
