import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const url = process.env.ECHO_RELAY_URL || "http://127.0.0.1:4173/";
const exe = process.env.EDGE_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const SAFE = "OFFLINE / KEEP THIS TAB OPEN";
const READY = "OFFLINE / RELOAD READY";
const ONLINE = "LOCAL BOOTH / NO ACCOUNT";
const CACHE = "echo-relay-event-v4";
const browser = await chromium.launch({ executablePath: exe, headless: true });
const results = [];
const cases = ["blocked", "cached", "evicted", "missing-js", "wrong-css-mime", "late-eviction"];
try {
  for (const name of cases) {
    const ctx = await browser.newContext({ serviceWorkers: name === "blocked" ? "block" : "allow", viewport: { width: 390, height: 844 } });
    try {
      const page = await ctx.newPage();
      const response = await page.goto(url, { waitUntil: "load", timeout: 15000 });
      assert.equal(response.status(), 200);
      const start = page.getByRole("button", { name: "START 60-SECOND RUN" });
      await start.waitFor({ timeout: 8000 });
      if (name !== "blocked") await page.waitForFunction(() => !!navigator.serviceWorker?.controller, {}, { timeout: 15000 });
      const snapshot = () => page.evaluate(async () => ({
        controlled: !!navigator.serviceWorker?.controller,
        names: await caches.keys(),
        label: document.querySelector("#offline-status")?.textContent,
      }));
      const before = await snapshot();
      assert.equal(before.controlled, name !== "blocked");
      if (name === "blocked") assert.equal(before.names.length, 0);
      else assert.ok(before.names.includes(CACHE));
      // Only alter storage belonging to this fresh disposable context.
      if (name === "evicted") assert.equal(await page.evaluate(n => caches.delete(n), CACHE), true);
      if (name === "missing-js" || name === "wrong-css-mime") {
        await page.evaluate(async ({ name, cacheName }) => {
          const c = await caches.open(cacheName);
          const entries = await c.keys();
          const key = entries.find(r => name === "missing-js" ? new URL(r.url).pathname.endsWith(".js") : new URL(r.url).pathname.endsWith(".css"));
          if (!key) throw new Error("Missing test fixture asset");
          if (name === "missing-js") {
            if (!await c.delete(key)) throw new Error("Asset deletion failed");
          } else {
            await c.put(key, new Response("<html>wrong MIME</html>", { headers: { "Content-Type": "text/html" } }));
          }
        }, { name, cacheName: CACHE });
      }
      await ctx.setOffline(true);
      await page.waitForFunction(() => !navigator.onLine, {}, { timeout: 5000 });
      const label = name === "cached" || name === "late-eviction" ? READY : SAFE;
      const waitLabel = (label, timeout = 5000) => page.waitForFunction(label => document.querySelector("#offline-status")?.textContent === label, label, { timeout });
      await waitLabel(label);
      // Allow pending cache probes to settle before asserting negative cases.
      await page.waitForTimeout(400);
      assert.equal((await snapshot()).label, label);
      await start.click();
      await page.getByText("LINK ACTIVE").waitFor({ timeout: 5000 });
      if (name === "late-eviction") {
        // A healthy periodic probe must not announce a fake warning/recovery.
        await page.evaluate(() => {
          window.__readinessChanges = [];
          new MutationObserver(() => window.__readinessChanges.push(document.querySelector("#offline-status").textContent))
            .observe(document.querySelector("#offline-status"), { childList: true, subtree: true, characterData: true });
        });
        await page.waitForTimeout(10500);
        assert.deepEqual(await page.evaluate(() => window.__readinessChanges), [], "Healthy periodic probe caused live-region churn");
        assert.equal(await page.evaluate(n => caches.delete(n), CACHE), true);
        await waitLabel(SAFE, 13000);
        await ctx.setOffline(false);
        await waitLabel(ONLINE);
        results.push({ name, initial: label, periodicStable: true, lateEvictionWarning: true, onlineRecovery: true });
        continue;
      }
      // Wrong CSS may still permit JS execution; it must not claim a complete cached reload.
      if (name !== "wrong-css-mime") {
        let reloaded = false;
        try {
          await page.reload({ timeout: 6000, waitUntil: "load" });
          await start.waitFor({ timeout: 3000 });
          reloaded = true;
        } catch { /* Expected for incomplete offline cache. */ }
        assert.equal(reloaded, name === "cached", "Unexpected actual reload outcome: " + name);
      }
      results.push({ name, label, currentPageStarts: true, pass: true });
    } finally { await ctx.close(); }
  }
  console.log("P89_OFFLINE_READINESS_PASS", JSON.stringify(results));
} finally { await browser.close(); }
