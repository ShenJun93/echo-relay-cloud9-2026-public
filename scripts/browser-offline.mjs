import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const exe = process.env.EDGE_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const url = process.env.ECHO_RELAY_URL || "http://127.0.0.1:4173/";
const browser = await chromium.launch({ executablePath: exe, headless: true });
try {
  const context = await browser.newContext({ serviceWorkers: "allow" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("requestfailed", req => errors.push("REQUEST " + req.url() + ": " + req.failure()?.errorText));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => "serviceWorker" in navigator && navigator.serviceWorker.controller !== null,
    { timeout: 15000 });
  const assets = await page.evaluate(async () => {
    const keys = await caches.keys();
    const names = await caches.open(keys.find(x => x.startsWith("echo-relay-event-")));
    return { keys, paths: (await names.keys()).map(x => new URL(x.url).pathname).sort() };
  });
  assert.ok(assets.paths.some(x => x.endsWith(".js")), "bundle JS not precached");
  assert.ok(assets.paths.some(x => x.endsWith(".css")), "CSS not precached");
  assert.ok(assets.paths.includes("/"), "HTML not precached");

  await context.setOffline(true);
  await page.reload({ waitUntil: "load", timeout: 15000 });
  console.log("OFFLINE_RELOAD_DEBUG", JSON.stringify(await page.evaluate(() => ({
    title: document.title, readyState: document.readyState,
    controls: document.querySelectorAll("button").length,
    body: document.body?.innerText?.slice(0, 360),
    scripts: [...document.scripts].map(x => x.src),
    controller: navigator.serviceWorker?.controller?.scriptURL,
  }))), JSON.stringify(errors));
  await page.getByRole("button", { name: "START 60-SECOND RUN" }).waitFor({ timeout: 7000 });
  await page.getByRole("button", { name: "START 60-SECOND RUN" }).click();
  await page.getByText("LINK ACTIVE").waitFor();
  assert.equal(errors.length, 0, "Offline JS errors: " + JSON.stringify(errors));
  await page.waitForFunction(() => document.querySelector("#offline-status")?.textContent === "OFFLINE / RELOAD READY", {}, { timeout: 5000 });
  const label = await page.locator("#offline-status").textContent();
  assert.match(label ?? "", /OFFLINE \/ RELOAD READY/);
  console.log(JSON.stringify({
    status: "PASS", offlineAfterFirstLoad: true, cachedAssetPaths: assets.paths,
    offlineRoundStarts: true, browserRuntimeErrors: errors.length,
  }));
} finally {
  await browser.close();
}
