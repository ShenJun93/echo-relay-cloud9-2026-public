import { spawn } from "node:child_process";
import { resolve } from "node:path";

const HOST = "http://127.0.0.1:4173/";
const viteBin = resolve("node_modules/vite/bin/vite.js");
const processOptions = { cwd: process.cwd(), windowsHide: true, shell: false };
const server = spawn(process.execPath, [viteBin, "preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"], {
  ...processOptions, stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", chunk => { serverLog += chunk.toString(); });
server.stderr.on("data", chunk => { serverLog += chunk.toString(); });
const sleep = millis => new Promise(resolve => setTimeout(resolve, millis));

async function run(name) {
  const env = { ...process.env, ECHO_RELAY_URL: HOST };
  const child = spawn(process.execPath, [name], { ...processOptions, env, stdio: "inherit" });
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  if (result.code !== 0) throw new Error(name + " failed: " + JSON.stringify(result));
}

try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error("Vite preview exited: " + serverLog.slice(-900));
    try {
      const response = await fetch(HOST);
      if (response.ok) { ready = true; break; }
    } catch { /* startup pending */ }
    await sleep(150);
  }
  if (!ready) throw new Error("Could not start isolated Vite preview: " + serverLog.slice(-900));
  console.log("Local production preview responsive:", HOST);
  await run("scripts/browser-qa.mjs");
  await run("scripts/browser-ready-viewport.mjs");
  await run("scripts/browser-ready-attract.mjs");
  await run("scripts/browser-start-visibility.mjs");
  await run("scripts/browser-round.mjs");
  await run("scripts/browser-offline.mjs");
  await run("scripts/browser-sw-upgrade.mjs");
  await run("scripts/browser-sw-concurrent.mjs");
  await run("scripts/browser-sw-mime-fallback.mjs");
  await run("scripts/browser-sw-opportunistic-mime.mjs");
  await run("scripts/browser-performance.mjs");
  await run("scripts/browser-a11y.mjs");
  await run("scripts/browser-controls.mjs");
  await run("scripts/browser-compat.mjs");
  console.log("P0_BROWSER_QA_ALL_PASS");
} finally {
  server.kill();
}
