import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { chromium } from "playwright-core";
import assert from "node:assert/strict";

// Some SPA hosts serve index.html as HTTP 200 for an unknown hashed asset path.
// Do not commit that bad response as a JS bundle to the offline shell.
const dist = resolve("dist");
const html = await readFile(join(dist, "index.html"), "utf8");
const goodJS = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
assert.ok(goodJS, "Expected a Vite JS asset");
const fallbackJS = "/assets/fallback-version.js";
const changed = html.replace(goodJS, fallbackJS);
let version = 1; // 1: good; 2: 200 HTML for JS; 3: fixed JS at same URL
const mime = { ".js": "text/javascript", ".css": "text/css",
  ".html": "text/html", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
  try {
    const fakeJS = path === fallbackJS;
    const bytes = path === "/"
      ? Buffer.from(version === 1 ? html : changed)
      : fakeJS
        ? version === 2 ? Buffer.from(changed) : await readFile(join(dist, goodJS.slice(1)))
        : await readFile(join(dist, path.replace(/^\/+/, "")));
    res.writeHead(200, {
      "Content-Type": fakeJS && version === 2 ? "text/html"
        : path === "/" ? "text/html" : mime[extname(path)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(bytes);
  } catch {
    res.writeHead(404).end("Not found");
  }
});
await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
const origin = "http://127.0.0.1:" + server.address().port + "/";
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const context = await browser.newContext({ serviceWorkers: "allow" });
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.reload({ waitUntil: "networkidle" });
  const shellScript = async () => page.evaluate(async () => {
    const cache = await caches.open("echo-relay-event-v4");
    const response = await cache.match("/");
    return (await response.text()).match(/src="([^"]+\.js)"/)?.[1];
  });
  assert.equal(await shellScript(), goodJS, "Initial complete shell missing");

  version = 2;
  await page.goto(origin, { waitUntil: "networkidle" });
  assert.equal(await shellScript(), goodJS,
    "An HTTP 200 HTML fallback incorrectly replaced the working offline shell");

  await context.setOffline(true);
  await page.reload({ waitUntil: "load", timeout: 15000 });
  assert.equal(await page.locator("script[src]").first().getAttribute("src"), goodJS);
  await page.getByRole("button", { name: "START 60-SECOND RUN" }).click();
  await page.getByText("LINK ACTIVE", { exact: true }).waitFor();

  // Simulate a fallback that was previously stored by an older service worker.
  await context.setOffline(false);
  await page.evaluate(async path => {
    const cache = await caches.open("echo-relay-event-v4");
    await cache.put(path, new Response("<html>wrong asset</html>", {
      headers: { "Content-Type": "text/html" },
    }));
  }, fallbackJS);

  version = 3;
  await page.goto(origin, { waitUntil: "networkidle" });
  assert.equal(await shellScript(), fallbackJS, "Recovered asset was not committed");
  const recovered = await page.evaluate(async path => {
    const cache = await caches.open("echo-relay-event-v4");
    return (await cache.match(path)).headers.get("Content-Type");
  }, fallbackJS);
  assert.match(recovered, /javascript/, "Invalid cached MIME was not repaired");
  await context.setOffline(true);
  await page.reload({ waitUntil: "load", timeout: 15000 });
  assert.equal(await page.locator("script[src]").first().getAttribute("src"), fallbackJS);
  await page.getByRole("button", { name: "START 60-SECOND RUN" }).click();
  await page.getByText("LINK ACTIVE", { exact: true }).waitFor();
  const report = {
    status: "PASS", mimeFallback: "text/html with HTTP 200",
    initialShell: goodJS, afterBadOnlineRelease: goodJS,
    recoveredScript: fallbackJS, recoveredContentType: recovered,
    playableOfflineBeforeAndAfterRecovery: true,
    syntheticReleaseTest: true, publicDeploymentVerified: false,
  };
  mkdirSync("acceptance", { recursive: true });
  writeFileSync("acceptance/p10-sw-mime-fallback.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
