import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

// The same origin serves three successive HTML releases. Intentionally delay
// assets for release 2 until release 3 is fully cached; stale release 2 must
// never overwrite release 3's offline HTML when its pending fetch completes.
const dist = resolve("dist");
const html = await readFile(join(dist, "index.html"), "utf8");
const js = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
const css = html.match(/href="(\/assets\/[^"]+\.css)"/)?.[1];
assert.ok(js && css, "Missing hashed JS/CSS build outputs");
const asset = (version, path) => path.replace("/assets/", "/assets/version" + version + "-");
const htmlFor = version => html.replace(js, asset(version, js)).replace(css, asset(version, css));
let releaseOldAssets;
let signalOldAssetFetch;
let oldAssetFetchCount = 0;
const allowOldAssets = new Promise(resolveAllow => { releaseOldAssets = resolveAllow; });
const oldAssetsRequested = new Promise(resolveSeen => { signalOldAssetFetch = resolveSeen; });
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const path = url.pathname;
  const version = Number(url.searchParams.get("v") || 1);
  try {
    if (path.startsWith("/assets/version2-")) {
      oldAssetFetchCount++;
      signalOldAssetFetch();
      await allowOldAssets;
    }
    const mapped = path.replace(/\/assets\/version\d+-/, "/assets/");
    const bytes = path === "/"
      ? Buffer.from(htmlFor(version))
      : await readFile(join(dist, mapped.replace(/^\/+/, "")));
    res.writeHead(200, {
      "Content-Type": path === "/" ? "text/html" : mime[extname(path)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
const base = "http://127.0.0.1:" + server.address().port + "/";
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const context = await browser.newContext({ serviceWorkers: "allow" });
  const initial = await context.newPage();
  const errors = [];
  initial.on("pageerror", error => errors.push(error.message));
  await initial.goto(base + "?v=1", { waitUntil: "networkidle" });
  await initial.evaluate(() => navigator.serviceWorker.ready);
  await initial.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await initial.reload({ waitUntil: "networkidle" });
  const cached = async () => initial.evaluate(async () => {
    const item = await (await caches.open("echo-relay-event-v4")).match("/");
    return item ? (await item.text()).match(/src="([^"]+\.js)"/)?.[1] : null;
  });
  assert.equal(await cached(), asset(1, js));
  const oldTab = await context.newPage();
  const newerTab = await context.newPage();
  let oldNavigation;
  try {
    oldNavigation = oldTab.goto(base + "?v=2", { waitUntil: "domcontentloaded", timeout: 35000 });
    await Promise.race([
      oldAssetsRequested,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Old asset fetch did not begin")), 12000)),
    ]);
    await newerTab.goto(base + "?v=3", { waitUntil: "networkidle", timeout: 30000 });
    const latestBeforeRelease = await cached();
    assert.equal(latestBeforeRelease, asset(3, js), "Latest version was not installed first");
    releaseOldAssets();
    await oldNavigation;
    const latestAfterRelease = await cached();
    assert.equal(latestAfterRelease, asset(3, js),
      "Late old navigation overwrote the latest offline shell");
    await context.setOffline(true);
    await newerTab.reload({ waitUntil: "load", timeout: 15000 });
    assert.equal(await newerTab.locator("script[src]").first().getAttribute("src"), asset(3, js),
      "Offline after concurrent updates did not load the latest JS");
    await newerTab.getByRole("button", { name: "START 60-SECOND RUN" }).click();
    await newerTab.getByText("LINK ACTIVE", { exact: true }).waitFor();
    assert.equal(errors.length, 0);
    const report = {
      status: "PASS", releases: 3, concurrentTabs: 2, oldRequestsHeld: oldAssetFetchCount,
      latestBeforeRelease, latestAfterRelease, offlineLatest: asset(3, js), gameStart: "PASS",
      pageErrors: errors.length, scenario: "same-origin synthetic releases with delayed old asset response",
    };
    mkdirSync("acceptance", { recursive: true });
    writeFileSync("acceptance/p9-sw-concurrent.json", JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    releaseOldAssets();
    await oldNavigation?.catch(() => {});
  }
} finally {
  await browser?.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
