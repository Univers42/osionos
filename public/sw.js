/* osionos service worker: Web Push and the offline app shell. The browser decrypts the RFC 8291 payload;
   we render it and route a click back to the app. Plain static asset (no build). */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_err) {
    data = { title: "osionos", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "osionos";
  const options = {
    body: data.body || "",
    icon: data.icon || "/favicon.svg",
    badge: data.badge || "/favicon.svg",
    tag: data.tag,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          if (target !== "/" && "navigate" in client) client.navigate(target);
          return undefined;
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    }),
  );
});

/* Offline shell (#176). A navigation goes to the network first and keeps a copy, so a
   reload without a connection opens the last app shell instead of the browser's error
   page. Build files carry a content hash in their name, so one never changes: once
   fetched it is served from the cache. The bridge (/api/), other origins and writes are
   never intercepted.
   Caveat: only build files fetched while online are kept. A part of the app split into
   its own file and never opened online (a view first visited offline) still fails to
   load. The install step finds the shell's files with a regex over its HTML: a file the
   HTML names some other way is kept on first use instead. */
const SHELL_CACHE = "osionos-shell-v1";
const SHELL_KEY = "/";
// Old builds' files are dropped first; enough room for a few builds of the app.
const MAX_KEPT_FILES = 400;

// Only the app page itself replaces the kept shell, not a file opened in a tab. A redirected
// answer can't be replayed for a navigation, so it isn't kept either.
const isShell = (response) => response.ok && !response.redirected && (response.headers.get("content-type") || "").includes("text/html");
const isBuildFile = (url) => url.pathname.startsWith("/assets/") || url.pathname.startsWith("/fonts/");

async function keepShell() {
  const cache = await caches.open(SHELL_CACHE);
  const response = await fetch(SHELL_KEY, { cache: "no-store" });
  if (!isShell(response)) return;
  const html = await response.clone().text();
  await cache.put(SHELL_KEY, response);
  const files = [...html.matchAll(/(?:src|href)="(\/(?:assets|fonts)\/[^"]+)"/g)].map((match) => match[1]);
  await cache.addAll([...new Set(files)]);
}

async function trim(cache) {
  const keys = await cache.keys();
  const extra = keys.filter((request) => new URL(request.url).pathname !== SHELL_KEY).slice(0, Math.max(0, keys.length - MAX_KEPT_FILES));
  await Promise.all(extra.map((request) => cache.delete(request)));
}

async function navigate(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (isShell(response)) await cache.put(SHELL_KEY, response.clone());
    return response;
  } catch (error) {
    const shell = await cache.match(SHELL_KEY);
    if (shell) return shell;
    throw error;
  }
}

async function buildFile(request) {
  const cache = await caches.open(SHELL_CACHE);
  const kept = await cache.match(request);
  if (kept) return kept;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    await trim(cache);
  }
  return response;
}

self.addEventListener("install", (event) => {
  // A shell that can't be kept now is kept on the next navigation; push must install anyway.
  event.waitUntil(keepShell().catch((error) => console.warn("[osionos] offline shell not kept:", error)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith("osionos-shell-") && name !== SHELL_CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") event.respondWith(navigate(request));
  else if (isBuildFile(url)) event.respondWith(buildFile(request));
});
