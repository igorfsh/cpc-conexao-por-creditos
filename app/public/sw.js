const CACHE_NAME = "cpc-shell-v2";
const APP_SHELL = [
  "/",
  "/manifest.json",
  "/css/header.css",
  "/css/home.css",
  "/css/modo-escuro.css",
  "/img/logo-black.png",
  "/img/icons/icon-green-192.png",
  "/img/icons/icon-green-512.png",
  "/js/pwa.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  const isPublicAsset = requestUrl.origin === self.location.origin
    && /^\/(css|js|img)\//.test(requestUrl.pathname);

  if (!isPublicAsset && event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (isPublicAsset && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return event.request.mode === "navigate" ? caches.match("/") : Response.error();
      }))
  );
});