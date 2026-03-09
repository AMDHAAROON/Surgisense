const CACHE = 'surgisense-v1';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', e => {
  // Let API/stream calls go straight to network
  if (e.request.url.includes('/api') || 
      e.request.url.includes('/stream') || 
      e.request.url.includes('/ws')) {
    return;
  }
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});