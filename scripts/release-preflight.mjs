/**
 * P40 — Read-only, provider-neutral release preflight for a root-hosted Vite PWA.
 * Run AFTER npm run build. Starts and stops only a loopback Vite preview.
 * No upload, network request to an external host, credential use, or write.
 */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, relative, join, sep } from "node:path";

const root = process.cwd();
const dist = resolve(root, "dist");
const failed = message => { throw new Error("P40_RELEASE_BLOCKED: " + message); };
const sha = data => createHash("sha256").update(data).digest("hex");
const wait = ms => new Promise(done => setTimeout(done, ms));

async function walk(where) {
  const out = [];
  for (const item of await readdir(where, { withFileTypes: true })) {
    const abs = join(where, item.name);
    if (item.isSymbolicLink()) failed("Symlink forbidden in dist: " + abs);
    if (item.isDirectory()) out.push(...await walk(abs));
    else if (item.isFile()) out.push(abs);
    else failed("Unexpected filesystem object in dist: " + abs);
  }
  return out;
}
function mimeOk(path, mime) {
  const normalized = mime.split(";")[0].trim().toLowerCase();
  if (path === "/") return normalized === "text/html";
  if (path.endsWith(".css")) return normalized === "text/css";
  if (path.endsWith(".svg")) return normalized === "image/svg+xml";
  if (path.endsWith(".js")) return ["text/javascript", "application/javascript"].includes(normalized);
  return false;
}
function allowlist(path) {
  return ["index.html", "sw.js", "favicon.svg"].includes(path) ||
    /^assets\/[\w-]+-[A-Za-z0-9_-]{8,}\.(?:js|css)$/.test(path);
}
async function main() {
  const files = (await walk(dist)).sort();
  const output = [];
  for (const full of files) {
    const p = relative(dist, full).split(sep).join("/");
    if (!allowlist(p)) failed("Unapproved public file: " + p);
    const s = await stat(full);
    if (s.size === 0) failed("Empty asset: " + p);
    const bytes = await readFile(full);
    if (/\.(?:js|css|html)$/.test(p) && /(?:\/\/# sourceMappingURL=|\/\*# sourceMappingURL=)/.test(bytes.toString("utf8")))
      failed("Source-map URL present: " + p);
    output.push({ path: p, bytes: bytes.length, sha256: sha(bytes) });
  }

  const text = (await readFile(join(dist, "index.html"))).toString("utf8");
  const sw = (await readFile(join(dist, "sw.js"))).toString("utf8");
  if (!/<html\s+lang="en"/.test(text) || !/<title>.*ECHO/.test(text))
    failed("Expected accessible root HTML metadata is absent");
  if (!/const SHELL\s*=\s*"\/"/.test(sw) || !/CACHE_NAME\s*=\s*"echo-relay-event-v\d+"/.test(sw))
    failed("Root-scoped Service Worker expected; deployment must use domain /");
  if (!sw.includes('Invalid offline asset response:') || !sw.includes("isCacheableAsset"))
    failed("Service Worker asset MIME integrity guard absent");
  const refs = [...text.matchAll(/\b(?:src|href)="(\/[^"]+)"/g)].map(m => m[1]);
  const js = refs.filter(p => p.endsWith(".js"));
  const css = refs.filter(p => p.endsWith(".css"));
  if (js.length !== 1 || css.length !== 1 || !refs.includes("/favicon.svg"))
    failed("Expected exactly one hashed JS, one CSS and a root favicon");
  for (const p of refs) {
    if (!p.startsWith("/") || !allowlist(p.slice(1))) failed("Unexpected referenced asset: " + p);
    if (!output.some(f => f.path === p.slice(1))) failed("HTML references missing file: " + p);
  }
  const sourceMain = await readFile(join(root, "src", "main.ts"), "utf8");
  if (!sourceMain.includes('navigator.serviceWorker.register("/sw.js")'))
    failed("Expected root-scope SW registration missing");

  const base = "http://127.0.0.1:4199";
  const vite = spawn(process.execPath, [join(root, "node_modules", "vite", "bin", "vite.js"), "preview",
    "--host", "127.0.0.1", "--port", "4199", "--strictPort"], {
    cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true
  });
  let serverOutput = "";
  vite.stdout.on("data", chunk => serverOutput += chunk.toString().slice(0, 1000));
  vite.stderr.on("data", chunk => serverOutput += chunk.toString().slice(0, 1000));
  try {
    let started = false;
    for (let i = 0; i < 70; i++) {
      if (vite.exitCode !== null) failed("Preview failed: " + serverOutput.slice(0, 600));
      try {
        const response = await fetch(base + "/", { cache: "no-store" });
        if (response.ok) { started = true; break; }
      } catch { /* startup pending */ }
      await wait(150);
    }
    if (!started) failed("Vite preview unavailable on 127.0.0.1:4199");
    for (const p of ["/", "/sw.js", ...refs]) {
      const res = await fetch(base + p, { cache: "no-store" });
      if (res.status !== 200) failed("HTTP " + res.status + " for " + p);
      if (!mimeOk(p, res.headers.get("content-type") || "")) failed("Incorrect HTTP MIME for " + p);
      const bytes = Buffer.from(await res.arrayBuffer());
      const expected = output.find(f => f.path === (p === "/" ? "index.html" : p.slice(1)));
      if (!expected || sha(bytes) !== expected.sha256) failed("HTTP body differs from dist: " + p);
    }
    const missing = await fetch(base + "/assets/no-such-p40-release-file.js", { cache: "no-store" });
    if (mimeOk("/assets/no-such-p40-release-file.js", missing.headers.get("content-type") || ""))
      failed("Missing hashed asset served with valid JavaScript MIME");
  } finally {
    vite.kill();
  }
  console.log("P40_RELEASE_PREFLIGHT_PASS " + JSON.stringify({
    source: "tracked dist only",
    root_only: true,
    files: output,
    local_http_mime_and_hash: "PASS",
    missing_asset_mime: "PASS",
    public_deploy: "NOT ATTEMPTED",
    verdict: "Local build preflight only; real CDN, HTTPS, signed-out judge access still unverified"
  }));
}
main().catch(error => { console.error(error.stack || String(error)); process.exitCode = 1; });
