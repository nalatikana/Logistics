const CACHE_NAME = "smart-logistics-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./mobile.html",
  "./styles.css",
  "./mobile.css",
  "./config.js",
  "./app.js",
  "./mobile.js",
  "./manifest.json",
  "./icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  if (new URL(event.request.url).pathname.includes("/api/")) return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then(res => res || caches.match("./index.html")))
  );
});
