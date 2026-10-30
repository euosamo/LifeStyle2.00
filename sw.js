const CACHE_NAME = 'lifestyle-finanz-app-v9';
const APP_FILES = ['./', './index.html', './firebase-login.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-ls.svg', './apple-touch-icon.png.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('lifestyle-finanz-app-') && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put('./index.html', response.clone()));
      return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
    return response;
  })));
});


/* Hintergrund-Push: Benachrichtigungen direkt beim Empfang anzeigen. */
self.addEventListener('push', event => {
  let payload = { title: 'Lifestyle', body: 'Du hast eine neue Erinnerung.', url: './' };
  try {
    if (event.data) {
      const incoming = event.data.json();
      payload = { ...payload, ...incoming };
    }
  } catch (_) {
    try { if (event.data) payload.body = event.data.text(); } catch (_) {}
  }

  event.waitUntil(self.registration.showNotification(payload.title || 'Lifestyle', {
    body: payload.body || 'Du hast eine neue Erinnerung.',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: payload.tag || undefined,
    data: { url: payload.url || './' },
    renotify: false
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.focus();
        if ('navigate' in client && client.url !== target) await client.navigate(target);
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
