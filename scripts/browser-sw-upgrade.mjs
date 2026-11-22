import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { chromium } from "playwright-core";
import assert from "node:assert/strict";

// Simulate two Vite releases on the SAME origin with different asset URLs.
// No previous Git revision, remote host or test-server dependency is needed.
const dist = resolve("dist");
const original = await readFile(join(dist, "index.html"), "utf8");
const jsPath = original.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
const cssPath = original.match(/href="(\/assets\/[^"]+\.css)"/)?.[1];
assert.ok(jsPath && cssPath, "Vite output must reference hashed JS and CSS");
const oldJs = jsPath.replace("/assets/", "/assets/old-version-");
const oldCss = cssPath.replace("/assets/", "/assets/old-version-");
const oldHtml = original.replace(jsPath, oldJs).replace(cssPath, oldCss);
assert.notEqual(oldHtml, original);
let version = "old";
const mime = { ".html": "text/html", ".js": "text/javascript",
  ".css": "text/css", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  const alias = path === oldJs ? jsPath : path === oldCss ? cssPath : path;
  try {
    const data = path === "/"
      ? Buffer.from(version === "old" ? oldHtml : original)
      : await readFile(join(dist, alias.replace(/^\/+/, "")));
    res.writeHead(200, {
      "Content-Type": path === "/" ? "text/html" : mime[extname(path)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
const addr = server.address();
assert.ok(addr && typeof addr === "object");
const url = "http://127.0.0.1:" + addr.port + "/";
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const context = await browser.newContext({ serviceWorkers: "allow" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator("script[src]").first().getAttribute("src"), oldJs);
  const shellScript = async () => page.evaluate(async () => {
    const cache = await caches.open("echo-relay-event-v4");
    const html = await (await cache.match("/")).text();
    return {
      script: html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1],
      paths: (await cache.keys()).map(req => new URL(req.url).pathname),
    };
  });
  const before = await shellScript();
  assert.equal(before.script, oldJs);
  version = "new";
  await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
  await page.goto(url, { waitUntil: "networkidle" });
  assert.equal(await page.locator("script[src]").first().getAttribute("src"), jsPath);
  const after = await shellScript();
  assert.equal(after.script, jsPath, "New HTML was not staged in offline cache");
  assert.ok(after.paths.includes(jsPath), "Updated JS missing in offline cache");
  assert.ok(after.paths.includes(cssPath), "Updated CSS missing in offline cache");
  await context.setOffline(true);
  await page.reload({ waitUntil: "load", timeout: 15000 });
  const offlineScript = await page.locator("script[src]").first().getAttribute("src");
  assert.equal(offlineScript, jsPath, "Offline reload used obsolete JS after online update");
  assert.equal(errors.length, 0, "JS runtime errors: " + JSON.stringify(errors));
  await page.getByRole("button", { name: "START 60-SECOND RUN" }).click();
  await page.getByText("LINK ACTIVE", { exact: true }).waitFor();
  const report = {
    status: "PASS", syntheticAssetVersions: true, onlineReleaseSwitch: true,
    previousScript: oldJs, updatedScript: jsPath, offlineScript,
    cachedPaths: after.paths, pageErrors: errors.length,
    note: "Same-origin simulated update; not an actual public deployment",
  };
  mkdirSync("acceptance", { recursive: true });
  writeFileSync("acceptance/p8-sw-upgrade.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
