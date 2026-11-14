/* No application or account data is cached: shared tasks always come from the server. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch (_) {}
  let url = '/shared.html';
  try {
    const candidate = new URL(data.url || url, self.location.origin);
    if (candidate.origin === self.location.origin && candidate.pathname === '/shared.html') url = candidate.pathname + candidate.search;
  } catch (_) {}
  event.waitUntil(self.registration.showNotification('سمندیس', {
    body: String(data.body || 'یک اعلان تازه در سمندیس دارید.').slice(0, 240),
    icon: '/icons/app-192.png', badge: '/icons/app-192.png',
    tag: String(data.tag || 'samandis-update').slice(0, 100),
    dir: 'rtl', lang: 'fa', data: {url},
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const candidate = new URL(event.notification.data?.url || '/shared.html', self.location.origin);
    const url = candidate.origin === self.location.origin && candidate.pathname === '/shared.html' ? candidate.href : new URL('/shared.html', self.location.origin).href;
    const windows = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    const current = windows.find(client => new URL(client.url).pathname === '/shared.html');
    if (current) {
      await current.navigate(url);
      return current.focus();
    }
    return self.clients.openWindow(url);
  })());
});
