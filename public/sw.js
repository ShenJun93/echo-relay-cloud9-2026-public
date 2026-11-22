/* Offline-first booth shell. Public static assets only; no personal data or telemetry. */
const CACHE_NAME = "echo-relay-event-v4";
const SHELL = "/";
const FAVICON = "/favicon.svg";

// Multiple controlled tabs can navigate to different release versions while
// the older version's asset requests are still pending. Never let the older
// navigation replace the newer committed offline shell.
let latestNavigationId = 0;
let shellCommitQueue = Promise.resolve();

// SPA hosts can answer a missing /assets/*.js with HTTP 200 text/html.
// Validate MIME on both shell precache and opportunistic asset requests.
function isCacheableAsset(path, response) {
  if (!response?.ok) return false;
  const mime = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (/\.(?:m?js)$/.test(path)) return /^(?:text|application)\/(?:java|ecma)script$/.test(mime);
  if (/\.css$/.test(path)) return mime === "text/css";
  if (/\.svg$/.test(path)) return mime === "image/svg+xml";
  return mime !== "" && mime !== "text/html";
}

// Keep offline shell and its hashed assets in sync across deployments.
// Stage missing assets *before* replacing index.html, so an interrupted update
// still leaves the last complete offline version available.
async function cacheCompleteShell(cache, response, navigationId = null) {
  const html = await response.clone().text();
  const assetPaths = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)]
    .map(match => match[1]);
  // Some SPA hosts return HTTP 200 with index.html for a missing JS/CSS URL.
  // Cache.addAll() accepts that response, but offline module loading then fails.
  // Verify both fresh and previously cached assets before committing new HTML.
  await Promise.all([...new Set([FAVICON, ...assetPaths])].map(async path => {
    const saved = await cache.match(path, { ignoreVary: true });
    if (isCacheableAsset(path, saved)) return;
    // Reload allows recovery if an earlier release cached an incorrect fallback.
    const fresh = await fetch(path, { cache: "reload" });
    if (!isCacheableAsset(path, fresh)) throw new Error("Invalid offline asset response: " + path);
    await cache.put(path, fresh.clone());
  }));
  // Serialize the final HTML write and reject outdated navigations only AFTER
  // staging their assets, when the last request is known. Do not delete older
  // assets here: a currently open page may still reference them.
  const commit = shellCommitQueue.then(async () => {
    if (navigationId !== null && navigationId !== latestNavigationId) return;
    await cache.put(SHELL, response.clone());
  });
  shellCommitQueue = commit.catch(() => {});
  await commit;
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(new Request(SHELL, { cache: "reload" }));
    if (!response.ok) throw new Error("Booth shell is unavailable");
    await cacheCompleteShell(cache, response);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith("echo-relay-event-") && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Online updates win, offline kiosk uses the last complete precached shell.
    const navigationId = ++latestNavigationId;
    event.respondWith((async () => {
      try {
        const live = await fetch(request);
        if (live.ok) {
          // The service-worker source may be unchanged while Vite's hashed JS/CSS
          // change. Refresh the offline shell on a successful online navigation.
          // Cache-update failures must not prevent normal online gameplay.
          try {
            const cache = await caches.open(CACHE_NAME);
            await cacheCompleteShell(cache, live, navigationId);
          } catch { /* retain the previous complete offline shell */ }
          return live;
        }
      } catch { /* offline */ }
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(SHELL)) || Response.error();
    })());
    return;
  }
  // Immutable assets precached during install; missing local assets are opportunistic.
  if (!url.pathname.startsWith("/assets/") && url.pathname !== FAVICON) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Vite development/preview responses may Vary on Origin; assets are same-origin, hashed, immutable.
    const saved = await cache.match(request, { ignoreVary: true });
    if (isCacheableAsset(url.pathname, saved)) return saved;
    // Older workers may have cached HTTP 200 HTML under a JS asset key.
    if (saved) await cache.delete(request, { ignoreVary: true });
    const response = await fetch(request);
    if (isCacheableAsset(url.pathname, response)) {
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
