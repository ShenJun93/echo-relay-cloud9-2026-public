import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const exe = process.env.EDGE_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const url = process.env.ECHO_RELAY_URL || "http://127.0.0.1:4173/";
const browser = await chromium.launch({ executablePath: exe, headless: true });
const all = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 970 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.clock.install();
  await page.goto(url, { waitUntil: "networkidle" });
  for (const [name, change] of [
    ["start-desktop", async () => {}],
    ["playing-desktop", async () => page.getByRole("button", { name: "START 60-SECOND RUN" }).click()],
    ["playing-mobile", async () => page.setViewportSize({ width: 375, height: 812 })],
    ["finish-desktop", async () => {
      await page.setViewportSize({ width: 1440, height: 970 });
      await page.clock.runFor(60_500);
      await page.getByRole("button", { name: /PLAY AGAIN/ }).waitFor();
    }],
  ]) {
    await change();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const violations = result.violations.map(v => ({
      id: v.id, impact: v.impact, description: v.description,
      nodes: v.nodes.map(n => ({ selector: n.target, summary: n.failureSummary })).slice(0, 6),
    }));
    all.push({ phase: name, violations, passes: result.passes.length });
  }
  await fs.mkdir("acceptance", { recursive: true });
  await fs.writeFile("acceptance/p2-axe-results.json", JSON.stringify(all, null, 2));
  const serious = all.flatMap(a => a.violations.filter(v => v.impact === "critical" || v.impact === "serious")
    .map(v => ({ phase: a.phase, ...v })));
  const moderate = all.flatMap(a => a.violations.filter(v => v.impact === "moderate")
    .map(v => ({ phase: a.phase, ...v })));
  console.log(JSON.stringify({ phases: all.map(a => a.phase), serious, moderate, report: "acceptance/p2-axe-results.json" }));
  assert.equal(serious.length, 0, "Accessibility serious/critical failures");
} finally {
  await browser.close();
}
