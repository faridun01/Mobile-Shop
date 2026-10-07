// Service Worker Push Notification Handler for Mobile Shop PWA

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const title = payload.title || 'Mobile Shop';
    const options = {
      body: payload.message || '',
      icon: '/pwa-192x192.png',
      badge: '/favicon.png',
      data: {
        url: payload.targetRoute || '/notifications',
        dedupeKey: payload.dedupeKey,
      },
      tag: payload.dedupeKey || undefined,
      renotify: true,
      vibrate: [200, 100, 200, 100, 200],
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error('[SW-Push] Failed to parse push payload:', err);
    event.waitUntil(
      self.registration.showNotification('Mobile Shop', {
        body: event.data.text() || 'Новое уведомление',
        icon: '/pwa-192x192.png',
        badge: '/favicon.png',
      })
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetPath = event.notification.data?.url || '/notifications';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a window is already open, focus it and navigate
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client && targetPath) {
            client.navigate(targetPath);
          }
          return;
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(targetPath);
      }
    })
  );
});
